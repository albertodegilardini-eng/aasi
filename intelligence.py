from __future__ import annotations

import hashlib
import re
import statistics
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from typing import Any, Dict, Iterable, List
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

MX_TZ = ZoneInfo("America/Mexico_City")

SOURCE_DIRECTORY: Dict[str, Dict[str, Any]] = {
    "inmuebles24.com": {
        "label": "Inmuebles24",
        "kind": "Portal amplio",
        "trust": 82,
        "risk_note": "Portal amplio; aun así valida vigencia, mantenimiento y costo total.",
    },
    "pulppo.com": {
        "label": "Pulppo",
        "kind": "Broker / portal",
        "trust": 74,
        "risk_note": "Trazabilidad razonable; pide video actual y desglose completo.",
    },
    "properstar.com": {
        "label": "Properstar",
        "kind": "Agregador",
        "trust": 67,
        "risk_note": "Útil para discovery; conviene confirmar contacto directo y disponibilidad.",
    },
    "pincali.com": {
        "label": "Pincali",
        "kind": "Broker digital",
        "trust": 61,
        "risk_note": "Útil, pero exige evidencia actual y unidad exacta.",
    },
    "jmgrouprealestate.com": {
        "label": "JM Group",
        "kind": "Broker boutique",
        "trust": 58,
        "risk_note": "Confirma exclusividad y vigencia real.",
    },
    "micasapropia.org": {
        "label": "MiCasaPropia",
        "kind": "Sitio independiente",
        "trust": 46,
        "risk_note": "Trazabilidad media-baja; verifica antes de dedicar tiempo.",
    },
    "facebook.com": {
        "label": "Facebook",
        "kind": "Social",
        "trust": 24,
        "risk_note": "Alto riesgo de lead viejo, bait price o información incompleta.",
    },
    "instagram.com": {
        "label": "Instagram",
        "kind": "Social",
        "trust": 20,
        "risk_note": "Muy débil para disponibilidad; exige prueba actual antes de negociar.",
    },
    "casas.trovit.com.mx": {
        "label": "Trovit",
        "kind": "Agregador",
        "trust": 18,
        "risk_note": "Muy alta probabilidad de duplicado o anuncio vencido.",
    },
}
DEFAULT_SOURCE: Dict[str, Any] = {
    "label": "Fuente no clasificada",
    "kind": "Sin clasificar",
    "trust": 40,
    "risk_note": "Sin trazabilidad suficiente.",
}


def clip(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def round_to(value: float, base: int = 500) -> int:
    if not base:
        return int(round(value))
    return int(round(value / base) * base)


def safe_median(values: Iterable[float]) -> float:
    seq = [float(v) for v in values if v is not None]
    return float(statistics.median(seq)) if seq else 0.0


def pct_delta(current: float, reference: float) -> float:
    if not reference:
        return 0.0
    return ((current - reference) / reference) * 100.0


def hostname(url: str) -> str:
    try:
        host = urlparse(url).netloc.lower()
        if host.startswith("www."):
            host = host[4:]
        return host
    except Exception:
        return ""


def source_profile(url: str) -> Dict[str, Any]:
    domain = hostname(url)
    for known, profile in SOURCE_DIRECTORY.items():
        if domain == known or domain.endswith("." + known):
            return {"domain": domain, **profile}
    return {"domain": domain, **DEFAULT_SOURCE}


def listing_fingerprint(listing: Dict[str, Any]) -> str:
    material = "|".join(
        str(listing.get(key, "")).strip().lower()
        for key in ("building", "beds", "baths", "parking", "sqm", "floor")
    )
    return hashlib.sha1(material.encode("utf-8")).hexdigest()[:12]


def slug_tokens(text: str) -> set[str]:
    tokens = re.findall(r"[a-z0-9áéíóúñü]+", (text or "").lower())
    return {token for token in tokens if len(token) > 2}


def title_similarity(a: str, b: str) -> float:
    left = slug_tokens(a)
    right = slug_tokens(b)
    if not left or not right:
        return 0.0
    return len(left & right) / max(len(left | right), 1)


def dedupe_candidates(current: Dict[str, Any], listings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    candidates: List[Dict[str, Any]] = []
    for other in listings:
        if other["id"] == current["id"]:
            continue
        if other["building"] != current["building"]:
            continue

        score = 0
        if other["beds"] == current["beds"]:
            score += 2
        if other.get("baths") == current.get("baths"):
            score += 1
        if other.get("parking") == current.get("parking"):
            score += 1
        if abs(other["sqm"] - current["sqm"]) <= 4:
            score += 2
        if bool(other.get("furnished")) == bool(current.get("furnished")):
            score += 1
        price_gap = abs(other["price"] - current["price"]) / max(other["price"], current["price"])
        if price_gap <= 0.12:
            score += 1
        if title_similarity(other.get("title", ""), current.get("title", "")) >= 0.50:
            score += 1
        if score >= 6:
            candidates.append(
                {
                    "listing_id": other["id"],
                    "score": score,
                    "price_gap_pct": round(price_gap * 100.0, 1),
                    "sqm_gap": abs(other["sqm"] - current["sqm"]),
                }
            )

    return sorted(candidates, key=lambda row: (-row["score"], row["price_gap_pct"], row["sqm_gap"]))


def count_price_cuts(history: List[Dict[str, Any]]) -> int:
    cuts = 0
    for previous, current in zip(history, history[1:]):
        if current.get("price", 0) < previous.get("price", 0):
            cuts += 1
    return cuts


def _clean_inquiry(record: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(record or {})
    for key in ("provided_unit_number", "provided_video", "provided_cost_breakdown"):
        out[key] = bool(out.get(key))
    for key in ("response_hours", "price_quoted"):
        value = out.get(key)
        if value in ("", None):
            out[key] = None
        else:
            try:
                out[key] = float(value)
            except (TypeError, ValueError):
                out[key] = None
    out["claimed_status"] = str(out.get("claimed_status") or "available").strip()
    if out["claimed_status"] not in {"available", "unavailable", "no_response", "changed_offer"}:
        out["claimed_status"] = "available"
    out["channel"] = str(out.get("channel") or "whatsapp").strip() or "whatsapp"
    out["contact_name"] = str(out.get("contact_name") or "").strip()
    out["company"] = str(out.get("company") or "").strip()
    out["notes"] = str(out.get("notes") or "").strip()
    return out


def inquiry_rollup(listing_id: str, inquiries: List[Dict[str, Any]], active_now: bool) -> Dict[str, Any]:
    relevant = [_clean_inquiry(item) for item in inquiries if item.get("listing_id") == listing_id]
    relevant.sort(key=lambda item: item.get("timestamp", ""))

    contradictions = 0
    proof_score = 0
    response_hours: List[float] = []
    companies = Counter()
    contacts = Counter()
    latest = relevant[-1] if relevant else None

    for item in relevant:
        if item.get("claimed_status") == "unavailable" and active_now:
            contradictions += 1
        if item.get("provided_unit_number"):
            proof_score += 20
        if item.get("provided_video"):
            proof_score += 20
        if item.get("provided_cost_breakdown"):
            proof_score += 20
        hours = item.get("response_hours")
        if isinstance(hours, (int, float)) and hours >= 0:
            response_hours.append(float(hours))
        if item.get("company"):
            companies[item["company"]] += 1
        if item.get("contact_name"):
            contacts[item["contact_name"]] += 1

    if not latest:
        availability_state = "unknown"
    elif latest.get("claimed_status") == "available":
        availability_state = "verified_available" if proof_score >= 40 else "available_claimed"
    elif latest.get("claimed_status") == "unavailable":
        availability_state = "contradictory" if active_now else "unavailable_claimed"
    elif latest.get("claimed_status") == "no_response":
        availability_state = "no_response"
    elif latest.get("claimed_status") == "changed_offer":
        availability_state = "bait_switch"
    else:
        availability_state = "unknown"

    return {
        "count": len(relevant),
        "latest": latest,
        "contradictions": contradictions,
        "proof_score": round(clip(proof_score, 0, 60)),
        "availability_state": availability_state,
        "avg_response_hours": round(safe_median(response_hours), 1) if response_hours else None,
        "top_company": companies.most_common(1)[0][0] if companies else None,
        "top_contact": contacts.most_common(1)[0][0] if contacts else None,
    }


def agent_summary(inquiries: List[Dict[str, Any]], active_ids: set[str]) -> List[Dict[str, Any]]:
    buckets: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for item in inquiries:
        item = _clean_inquiry(item)
        key = (item.get("company") or item.get("contact_name") or "Sin identificar").strip() or "Sin identificar"
        buckets[key].append(item)

    agents: List[Dict[str, Any]] = []
    for key, items in buckets.items():
        contradictions = 0
        no_response = 0
        proof_events = 0
        response_hours: List[float] = []

        for item in items:
            if item.get("claimed_status") == "unavailable" and item.get("listing_id") in active_ids:
                contradictions += 1
            if item.get("claimed_status") == "no_response":
                no_response += 1
            proof_events += int(bool(item.get("provided_unit_number")))
            proof_events += int(bool(item.get("provided_video")))
            proof_events += int(bool(item.get("provided_cost_breakdown")))
            hours = item.get("response_hours")
            if isinstance(hours, (int, float)) and hours >= 0:
                response_hours.append(float(hours))

        proof_rate = proof_events / max(len(items) * 3, 1)
        avg_response = safe_median(response_hours) if response_hours else None

        credibility = 78 - contradictions * 18 - no_response * 10 + proof_rate * 18
        if avg_response is not None:
            credibility -= min(avg_response, 48) * 0.6
        credibility = round(clip(credibility, 5, 95))

        agents.append(
            {
                "name": key,
                "slug": slugify(key),
                "interactions": len(items),
                "contradictions": contradictions,
                "no_response": no_response,
                "proof_rate_pct": round(proof_rate * 100.0, 1),
                "avg_response_hours": round(avg_response, 1) if avg_response is not None else None,
                "credibility_score": credibility,
            }
        )

    return sorted(agents, key=lambda row: (row["credibility_score"], -row["interactions"]), reverse=True)


def slugify(text: str) -> str:
    value = re.sub(r"[^a-z0-9áéíóúñü]+", "-", (text or "").lower()).strip("-")
    return value or "sin-identificar"


def derive_first_seen_at(listing: Dict[str, Any], previous: Dict[str, Any], now: datetime) -> str:
    if previous.get("first_seen_at"):
        return str(previous["first_seen_at"])

    if listing.get("first_seen_at"):
        return str(listing["first_seen_at"])

    listed_at = listing.get("listedAt") or listing.get("listed_at")
    if listed_at:
        try:
            return datetime.fromisoformat(str(listed_at)).astimezone(MX_TZ).replace(microsecond=0).isoformat()
        except Exception:
            pass

    metrics = listing.get("metrics") or {}
    listed_days = listing.get("listedDays")
    if listed_days is None:
        listed_days = metrics.get("daysOnMarket")

    try:
        listed_days = int(listed_days or 0)
    except Exception:
        listed_days = 0

    return (now - timedelta(days=max(0, listed_days))).isoformat()


def seed_history(listing: Dict[str, Any]) -> List[Dict[str, Any]]:
    history = []
    for item in list(listing.get("history") or []):
        try:
            history.append({"date": str(item.get("date")), "price": float(item.get("price"))})
        except Exception:
            continue
    history.sort(key=lambda row: row["date"])
    return history


def compute_group_context(listings: List[Dict[str, Any]]) -> Dict[str, Dict[Any, Dict[str, Any]]]:
    groups: Dict[tuple[str, int], List[Dict[str, Any]]] = defaultdict(list)
    buildings: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

    for item in listings:
        groups[(item["building"], item["beds"])].append(item)
        buildings[item["building"]].append(item)

    context: Dict[str, Dict[Any, Dict[str, Any]]] = {"groups": {}, "buildings": {}}
    for key, items in groups.items():
        credible = [item for item in items if item["source_profile"]["trust"] >= 40] or items
        context["groups"][key] = {
            "count": len(items),
            "credible_count": len(credible),
            "median_price": safe_median(item["price"] for item in credible),
            "median_psqm": safe_median(item["price_per_sqm"] for item in credible),
            "median_dom": safe_median(item["days_on_market"] for item in credible),
            "min_price": min(item["price"] for item in credible),
            "max_price": max(item["price"] for item in credible),
        }

    for key, items in buildings.items():
        credible = [item for item in items if item["source_profile"]["trust"] >= 40] or items
        context["buildings"][key] = {
            "count": len(items),
            "median_price": safe_median(item["price"] for item in credible),
            "median_psqm": safe_median(item["price_per_sqm"] for item in credible),
            "median_dom": safe_median(item["days_on_market"] for item in credible),
        }

    return context


def compute_listing_intel(
    listing: Dict[str, Any],
    listings: List[Dict[str, Any]],
    inquiries: List[Dict[str, Any]],
    group_context: Dict[str, Any],
    buildings: Dict[str, Any],
) -> Dict[str, Any]:
    group = group_context["groups"][(listing["building"], listing["beds"])]
    building_context = group_context["buildings"][listing["building"]]

    delta_price_pct = pct_delta(listing["price"], group["median_price"])
    delta_psqm_pct = pct_delta(listing["price_per_sqm"], group["median_psqm"])
    trust = listing["source_profile"]["trust"]
    days_on_market = listing["days_on_market"]
    price_cuts = count_price_cuts(listing["history"])
    peak_price = max(item.get("price", listing["price"]) for item in listing["history"]) if listing["history"] else listing["price"]

    availability = inquiry_rollup(listing["id"], inquiries, active_now=True)
    contradictions = availability["contradictions"]

    ghost_probability = (100 - trust) * 0.45
    if trust < 30:
        ghost_probability += 18
    elif trust < 40:
        ghost_probability += 10
    if delta_price_pct < -20 and trust < 60:
        ghost_probability += 18
    if any(host in listing["source"] for host in ("facebook.com", "instagram.com", "trovit")):
        ghost_probability += 12
    if days_on_market > 45 and trust < 60:
        ghost_probability += 10
    ghost_probability += contradictions * 22
    if availability["availability_state"] == "verified_available":
        ghost_probability -= 28
    elif availability["availability_state"] in {"contradictory", "bait_switch"}:
        ghost_probability += 18
    elif availability["availability_state"] == "no_response":
        ghost_probability += 8
    ghost_probability = round(clip(ghost_probability, 5, 95))

    confidence_score = trust * 0.7
    if trust >= 70:
        confidence_score += 10
    if trust < 40:
        confidence_score -= 10
    confidence_score += availability["proof_score"] * 0.5
    confidence_score -= contradictions * 8
    confidence_score = round(clip(confidence_score, 5, 95))

    value_score = 55 - delta_psqm_pct * 0.8 + days_on_market * 0.25 + price_cuts * 4
    if trust < 40:
        value_score -= 20
    if delta_price_pct < -25 and trust < 60:
        value_score -= 15
    if trust >= 70:
        value_score += 5
    if availability["availability_state"] == "verified_available":
        value_score += 5
    value_score = round(clip(value_score, 5, 95))

    leverage_score = 15 + days_on_market * 0.8 + max(delta_price_pct, 0) * 0.6 + price_cuts * 8
    if trust < 40:
        leverage_score -= 5
    if delta_price_pct < -10 and trust >= 60:
        leverage_score -= 8
    leverage_score += contradictions * 5
    leverage_score = round(clip(leverage_score, 5, 95))

    price_cut_probability_14d = 10 + max(delta_price_pct, 0) * 1.3 + max(days_on_market - 20, 0) * 0.6 + price_cuts * 8
    if trust < 40:
        price_cut_probability_14d += 5
    if delta_price_pct < -10:
        price_cut_probability_14d -= 8
    price_cut_probability_14d = round(clip(price_cut_probability_14d, 5, 90))

    availability_probability_7d = 85 - ghost_probability * 0.55 - max(days_on_market - 45, 0) * 0.25
    if availability["availability_state"] == "verified_available":
        availability_probability_7d += 12
    elif availability["availability_state"] in {"unavailable_claimed", "contradictory", "bait_switch"}:
        availability_probability_7d -= 20
    elif availability["availability_state"] == "no_response":
        availability_probability_7d -= 10
    availability_probability_7d = round(clip(availability_probability_7d, 5, 95))

    if ghost_probability >= 60:
        status = {"key": "verify", "label": "Verify first", "tone": "risk"}
    elif delta_price_pct >= 12:
        status = {"key": "anchor", "label": "Anchor hard", "tone": "bad"}
    elif value_score >= 70 and trust >= 60 and delta_price_pct <= -8:
        status = {"key": "fast_move", "label": "Fast move", "tone": "good"}
    elif leverage_score >= 45 or value_score >= 58:
        status = {"key": "negotiate", "label": "Negotiate", "tone": "mid"}
    else:
        status = {"key": "watch", "label": "Watch", "tone": "neutral"}

    fair_center = group["median_price"] or listing["price"]
    if group["count"] == 1:
        fair_center = building_context["median_price"] or listing["price"]

    fair_low = round_to(fair_center * 0.96)
    fair_high = round_to(fair_center * 1.04)

    if status["key"] in {"anchor", "verify"}:
        opening_anchor = round_to(min(listing["price"] * 0.90, fair_center * 0.96))
        target_close = round_to(min(listing["price"] * 0.95, fair_center))
    elif status["key"] == "fast_move":
        opening_anchor = round_to(listing["price"] * 0.98)
        target_close = round_to(listing["price"])
    else:
        opening_anchor = round_to(min(listing["price"] * 0.95, fair_center * 0.98))
        target_close = round_to(min(listing["price"], fair_center))
    if opening_anchor > target_close:
        opening_anchor = round_to(min(target_close, fair_center * 0.96))
    walk_away = round_to(max(target_close, fair_high * 1.02))

    required_proof = [
        "Número de unidad exacto",
        "Video actual con fecha",
        "Desglose completo de costos de entrada",
    ]
    if trust < 60:
        required_proof.append("Confirmación de disponibilidad por escrito")
    if contradictions:
        required_proof.append("Explicación por escrito de la contradicción detectada")

    flags: List[str] = []
    if trust < 40:
        flags.append("Fuente de baja trazabilidad")
    if delta_price_pct >= 12:
        flags.append("Sobreprecio claro frente al set comparable")
    if delta_price_pct <= -20 and trust < 60:
        flags.append("Precio demasiado bajo para el set: posible bait")
    if days_on_market >= 45:
        flags.append(f"{days_on_market} días activos: hay fatiga comercial")
    if contradictions:
        flags.append(f"{contradictions} contradicción(es) entre anuncio y respuesta")
    if price_cuts:
        flags.append(f"{price_cuts} baja(s) de precio ya observadas")
    if not flags:
        flags.append("Sin alerta dura en la muestra actual")

    primary_angle: List[str] = []
    if status["key"] == "verify":
        primary_angle.append("No negocies precio hasta validar existencia real y disponibilidad.")
    if delta_price_pct >= 12:
        primary_angle.append(f"Ancla contra la banda justa de MXN {fair_low:,}–{fair_high:,}.")
    if days_on_market >= 30:
        primary_angle.append(f"Usa los {days_on_market} días en mercado como palanca.")
    if trust < 60:
        primary_angle.append("Pide pruebas actuales antes de aceptar cualquier narrativa de escasez.")
    if not primary_angle:
        primary_angle.append("Negocia desde comparables del mismo edificio, no desde el discurso del agente.")

    building_short = buildings[listing["building"]]["short"]
    script = (
        f"Estoy comparando {building_short} de {listing['beds']} recámaras. "
        f"Con la muestra verificable, el rango razonable hoy está alrededor de MXN {fair_low:,}–{fair_high:,}. "
        f"Si esta unidad sigue disponible, puedo revisar una propuesta cerca de MXN {opening_anchor:,}, "
        f"pero necesito número de unidad, video actual y costo total completo."
    )

    battle_card = [
        f"Fair band: MXN {fair_low:,}–{fair_high:,}",
        f"Opening anchor: MXN {opening_anchor:,}",
        f"Target close: MXN {target_close:,}",
        f"Walk-away: MXN {walk_away:,}",
    ]

    comparable_ids = [
        row["id"] for row in listings
        if row["building"] == listing["building"] and row["beds"] == listing["beds"] and row["id"] != listing["id"]
    ][:5]

    return {
        "canonical_unit_key": listing_fingerprint(listing),
        "source_profile": listing["source_profile"],
        "peer_group": {
            "building": listing["building"],
            "beds": listing["beds"],
            "count": group["count"],
            "credible_count": group["credible_count"],
            "median_price": round(group["median_price"]),
            "median_price_per_sqm": round(group["median_psqm"]),
            "median_days_on_market": round(group["median_dom"]),
        },
        "building_context": {
            "median_price": round(building_context["median_price"]),
            "median_price_per_sqm": round(building_context["median_psqm"]),
            "median_days_on_market": round(building_context["median_dom"]),
        },
        "pricing": {
            "price_per_sqm": round(listing["price_per_sqm"], 1),
            "delta_to_peer_price_pct": round(delta_price_pct, 1),
            "delta_to_peer_psqm_pct": round(delta_psqm_pct, 1),
            "fair_low": fair_low,
            "fair_high": fair_high,
            "opening_anchor": opening_anchor,
            "target_close": target_close,
            "walk_away": walk_away,
            "peak_price": peak_price,
            "price_cuts": price_cuts,
        },
        "scores": {
            "value_score": value_score,
            "leverage_score": leverage_score,
            "ghost_probability": ghost_probability,
            "confidence_score": confidence_score,
        },
        "predictive": {
            "price_cut_probability_14d": price_cut_probability_14d,
            "availability_probability_7d": availability_probability_7d,
            "model_type": "rule_based_v2",
        },
        "status": status,
        "availability": availability,
        "flags": flags,
        "required_proof": required_proof,
        "primary_angle": primary_angle,
        "battle_card": battle_card,
        "script": script,
        "duplicate_candidates": dedupe_candidates(listing, listings)[:5],
        "comparable_ids": comparable_ids,
    }


def sort_targets(listings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(
        listings,
        key=lambda item: (
            item["intel"]["scores"]["value_score"]
            + item["intel"]["scores"]["confidence_score"] * 0.2
            + max(-item["intel"]["pricing"]["delta_to_peer_price_pct"], 0) * 1.4
            + min(item["days_on_market"], 60) * 0.3
            - item["intel"]["scores"]["ghost_probability"] * 0.9
            + min(item["intel"]["peer_group"]["credible_count"], 3) * 4
        ),
        reverse=True,
    )


def enrich_payload(
    seed_payload: Dict[str, Any],
    previous_payload: Dict[str, Any] | None = None,
    inquiries: List[Dict[str, Any]] | None = None,
) -> Dict[str, Any]:
    inquiries = inquiries or []
    now = datetime.now(MX_TZ).replace(microsecond=0)
    previous_map = {row["id"]: row for row in previous_payload.get("listings", [])} if previous_payload else {}

    listings: List[Dict[str, Any]] = []
    for row in seed_payload["listings"]:
        listing = dict(row)
        listing["source_profile"] = source_profile(listing.get("source", ""))
        listing["price_per_sqm"] = round(float(listing["price"]) / max(float(listing.get("sqm") or 1), 1.0), 2)

        previous = previous_map.get(str(listing["id"]), {})
        history = list(previous.get("history") or [])
        if not history:
            history = seed_history(listing)

        today = now.date().isoformat()
        if history:
            last = history[-1]
            if float(last.get("price", 0)) != float(listing["price"]) or str(last.get("date")) != today:
                history.append({"date": today, "price": float(listing["price"])})
        else:
            history = [{"date": today, "price": float(listing["price"])}]

        first_seen_at = derive_first_seen_at(listing, previous, now)
        listing["history"] = history
        listing["first_seen_at"] = first_seen_at
        listing["last_seen_at"] = now.isoformat()

        try:
            first_seen_dt = datetime.fromisoformat(first_seen_at)
            if first_seen_dt.tzinfo is None:
                first_seen_dt = first_seen_dt.replace(tzinfo=MX_TZ)
            else:
                first_seen_dt = first_seen_dt.astimezone(MX_TZ)
        except Exception:
            first_seen_dt = now

        listing["days_on_market"] = max(0, (now - first_seen_dt).days)
        listings.append(listing)

    group_context = compute_group_context(listings)

    for listing in listings:
        listing["intel"] = compute_listing_intel(
            listing=listing,
            listings=listings,
            inquiries=inquiries,
            group_context=group_context,
            buildings=seed_payload["buildings"],
        )

    events: List[Dict[str, Any]] = []
    if previous_payload:
        previous_ids = set(previous_map)
        current_ids = {row["id"] for row in listings}

        for listing_id in sorted(current_ids - previous_ids):
            listing = next(row for row in listings if row["id"] == listing_id)
            events.append({"type": "new_listing", "listing_id": listing_id, "message": f"New listing detected: {listing['title']}"})

        for listing_id in sorted(previous_ids - current_ids):
            previous = previous_map[listing_id]
            events.append({"type": "removed_listing", "listing_id": listing_id, "message": f"Listing missing from latest snapshot: {previous.get('title', listing_id)}"})

        for listing in listings:
            previous = previous_map.get(listing["id"])
            if previous and float(previous.get("price", 0)) != float(listing["price"]):
                direction = "drop" if listing["price"] < previous["price"] else "increase"
                events.append(
                    {
                        "type": f"price_{direction}",
                        "listing_id": listing["id"],
                        "message": f"Price {direction}: {listing['title']} {previous['price']} -> {listing['price']}",
                    }
                )

    agent_rows = agent_summary(inquiries, {row["id"] for row in listings})
    tower_summary: Dict[str, Dict[str, Any]] = {}

    for building_key, building in seed_payload["buildings"].items():
        tower_items = [row for row in listings if row["building"] == building_key]
        if not tower_items:
            continue
        best_value = max(
            tower_items,
            key=lambda item: (
                item["intel"]["scores"]["value_score"]
                - item["intel"]["scores"]["ghost_probability"] * 0.8
                + item["intel"]["scores"]["confidence_score"] * 0.2
            ),
        )
        tower_summary[building_key] = {
            "name": building["name"],
            "count": len(tower_items),
            "median_price": round(safe_median(item["price"] for item in tower_items)),
            "median_price_per_sqm": round(safe_median(item["price_per_sqm"] for item in tower_items)),
            "median_days_on_market": round(safe_median(item["days_on_market"] for item in tower_items)),
            "verify_first_count": sum(1 for item in tower_items if item["intel"]["status"]["key"] == "verify"),
            "best_value_id": best_value["id"],
        }

    ranked_targets = sort_targets(listings)
    market_summary = {
        "total_listings": len(listings),
        "verify_first_count": sum(1 for item in listings if item["intel"]["status"]["key"] == "verify"),
        "fast_move_count": sum(1 for item in listings if item["intel"]["status"]["key"] == "fast_move"),
        "negotiate_count": sum(1 for item in listings if item["intel"]["status"]["key"] == "negotiate"),
        "avg_price": round(safe_median(item["price"] for item in listings)),
        "avg_price_per_sqm": round(safe_median(item["price_per_sqm"] for item in listings)),
        "top_targets": [item["id"] for item in ranked_targets[:5]],
        "high_risk": [item["id"] for item in sorted(listings, key=lambda row: row["intel"]["scores"]["ghost_probability"], reverse=True)[:5]],
        "contradictions_total": sum(item["intel"]["availability"]["contradictions"] for item in listings),
        "source_mix": dict(Counter(item["intel"]["source_profile"]["label"] for item in listings)),
    }

    signature = hashlib.sha1((now.isoformat() + str(len(listings))).encode("utf-8")).hexdigest()[:12]
    return {
        "mode": "enriched_seed",
        "generated_at": now.isoformat(),
        "generated_at_label": now.strftime("%d %b %Y · %H:%M"),
        "signature": signature,
        "buildings": seed_payload["buildings"],
        "tower_summary": tower_summary,
        "market_summary": market_summary,
        "agent_summary": agent_rows,
        "events": events,
        "listings": listings,
        "notes": [
            "Feed enriquecido con scoring heurístico, persistencia de historial local y ledger de contradicciones.",
            "La disponibilidad mejora materialmente cuando agregas registros de contacto e inconsistencias desde la API.",
        ],
    }
