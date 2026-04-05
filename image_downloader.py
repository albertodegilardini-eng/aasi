#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Iterable
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

BACKEND = Path(__file__).resolve().parent
ROOT = BACKEND.parent
FRONTEND = ROOT / "frontend"
DATA_DIR = BACKEND / "data"
LIVE_FILE = DATA_DIR / "listings.live.json"
SEED_FILE = DATA_DIR / "listings.seed.json"
MANIFEST_FILE = DATA_DIR / "image_manifest.json"
LISTING_IMG_DIR = FRONTEND / "img" / "listings"
HERO_IMG_DIR = FRONTEND / "img" / "hero"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": USER_AGENT,
    "Accept-Language": "es-MX,es;q=0.9,en;q=0.7",
})

KNOWN_SEARCH_PAGES = [
    # Verified public search/result pages relevant to Santa Fe inventory.
    {"kind": "hero", "name": "inmuebles24-peninsula", "url": "https://www.inmuebles24.com/departamentos-en-renta-q-peninsula-santa-fe-cuajimalpa.html"},
    {"kind": "hero", "name": "inmuebles24-paradox", "url": "https://www.inmuebles24.com/departamentos-en-renta-q-paradox.html"},
    {"kind": "hero", "name": "inmuebles24-av-santa-fe", "url": "https://www.inmuebles24.com/departamentos-en-renta-q-avenida-santa-fe-cuajimalpa.html"},
    {"kind": "hero", "name": "pincali-torre-300", "url": "https://www.pincali.com/inmueble/renta-torre-300-santa-fe"},
]

EXCLUDE_PATTERNS = [
    "logo", "avatar", "icon", "sprite", "placeholder", "profile", "mapbox", "googleapis", "ads", "banner",
    "tracking", "pixel", "favicon", "captcha", "loader", "thumbnail_small",
]
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}


def sniff_image_kind(data: bytes | bytearray | memoryview | None) -> str | None:
    data = bytes(data or b'')
    if data.startswith(b'\xff\xd8\xff'):
        return 'jpeg'
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'png'
    if data.startswith(b'RIFF') and data[8:12] == b'WEBP':
        return 'webp'
    if data.startswith((b'GIF87a', b'GIF89a')):
        return 'gif'
    if len(data) >= 12 and data[4:8] == b'ftyp' and any(x in data[8:16] for x in [b'avif', b'avis']):
        return 'avif'
    return None


def read_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return default


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def load_payload() -> dict:
    if LIVE_FILE.exists():
        return read_json(LIVE_FILE, {})
    return read_json(SEED_FILE, {})


def normalize_building(value: str | None) -> str:
    raw = (value or "").strip().lower().replace("-", "_").replace(" ", "_")
    mapping = {
        "peninsula": "peninsula",
        "península": "peninsula",
        "torre300": "torre300",
        "torre_300": "torre300",
        "torre-300": "torre300",
        "paradox": "paradox",
    }
    return mapping.get(raw, raw or "misc")


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return slug or "item"


def listing_dir(building: str, listing_id: str) -> Path:
    return LISTING_IMG_DIR / normalize_building(building) / slugify(listing_id)


def hero_dir(name: str) -> Path:
    return HERO_IMG_DIR / slugify(name)


def extension_from_url(url: str) -> str:
    path = urlparse(url).path.lower()
    ext = Path(path).suffix
    if ext in ALLOWED_EXTENSIONS:
        return ext
    return ".jpg"


def extract_url_candidates(html: str, base_url: str) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    candidates: list[str] = []

    def add(url: str | None):
        if not url:
            return
        url = url.strip()
        if not url or url.startswith("data:"):
            return
        abs_url = urljoin(base_url, url)
        if abs_url not in candidates:
            candidates.append(abs_url)

    for selector in [
        ('meta[property="og:image"]', 'content'),
        ('meta[name="twitter:image"]', 'content'),
        ('meta[itemprop="image"]', 'content'),
        ('link[rel="image_src"]', 'href'),
    ]:
        for tag in soup.select(selector[0]):
            add(tag.get(selector[1]))

    for img in soup.find_all(["img", "source"]):
        for attr in ("src", "data-src", "data-original", "data-lazy-src", "data-image"):
            add(img.get(attr))
        srcset = img.get("srcset") or img.get("data-srcset")
        if srcset:
            for part in srcset.split(","):
                add(part.strip().split(" ")[0])

    for tag in soup.find_all("script", attrs={"type": "application/ld+json"}):
        raw = tag.string or tag.get_text("", strip=True)
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        for url in iter_json_images(data):
            add(url)

    regex_hits = re.findall(r'https?://[^"\'\s>]+\.(?:jpg|jpeg|png|webp|avif)', html, re.I)
    for url in regex_hits:
        add(url)

    return [u for u in candidates if image_url_allowed(u)]


def iter_json_images(node) -> Iterable[str]:
    if isinstance(node, dict):
        for key, value in node.items():
            if key in {"image", "thumbnailUrl", "contentUrl", "url"}:
                if isinstance(value, str):
                    yield value
                elif isinstance(value, list):
                    for item in value:
                        if isinstance(item, str):
                            yield item
            else:
                yield from iter_json_images(value)
    elif isinstance(node, list):
        for item in node:
            yield from iter_json_images(item)


def image_url_allowed(url: str) -> bool:
    low = url.lower()
    if not low.startswith("http"):
        return False
    if any(pat in low for pat in EXCLUDE_PATTERNS):
        return False
    if any(token in low for token in ["googleusercontent.com/proxy", "maps.googleapis", "doubleclick"]):
        return False
    return True


def fetch_html(url: str) -> str:
    resp = SESSION.get(url, timeout=(10, 25), allow_redirects=True)
    resp.raise_for_status()
    return resp.text


def download_image(url: str, dest: Path) -> bool:
    try:
        resp = SESSION.get(url, timeout=(10, 40), stream=True, allow_redirects=True)
        resp.raise_for_status()
        content_type = (resp.headers.get("Content-Type") or "").lower()
        if not content_type.startswith("image/"):
            return False
        data = resp.content
        if len(data) < 4_096:
            return False
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        kind = sniff_image_kind(data)
        if kind is None:
            dest.unlink(missing_ok=True)
            return False
        return True
    except requests.RequestException:
        return False


def dedupe_urls(urls: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for url in urls:
        key = url.split("?")[0]
        if key in seen:
            continue
        seen.add(key)
        out.append(url)
    return out


def download_for_listing(listing: dict, max_images: int = 8) -> dict:
    listing_id = str(listing.get("id") or hashlib.sha1(str(listing.get("source") or "").encode()).hexdigest()[:10])
    building = normalize_building(listing.get("building"))
    source_url = str(listing.get("source") or "")
    out_dir = listing_dir(building, listing_id)
    result = {
        "listing_id": listing_id,
        "building": building,
        "source_url": source_url,
        "downloaded_at": datetime.now().isoformat(timespec="seconds"),
        "files": [],
        "saved": 0,
        "failed": 0,
    }
    if not source_url:
        result["error"] = "missing source url"
        return result

    try:
        html = fetch_html(source_url)
    except Exception as exc:  # pragma: no cover
        result["error"] = str(exc)
        return result

    urls = dedupe_urls(extract_url_candidates(html, source_url))[: max_images * 4]
    saved = 0
    for idx, url in enumerate(urls, 1):
        if saved >= max_images:
            break
        ext = extension_from_url(url)
        filename = f"{idx:02d}-{slugify(listing.get('title') or listing_id)[:36]}{ext}"
        dest = out_dir / filename
        if download_image(url, dest):
            result["files"].append(str(dest.relative_to(ROOT)))
            saved += 1
        else:
            result["failed"] += 1
    result["saved"] = saved
    return result


def download_for_url(url: str, building: str = "misc", name: str | None = None, max_images: int = 8) -> dict:
    label = name or hashlib.sha1(url.encode()).hexdigest()[:10]
    out_dir = hero_dir(f"{normalize_building(building)}-{label}")
    result = {
        "label": label,
        "building": normalize_building(building),
        "source_url": url,
        "downloaded_at": datetime.now().isoformat(timespec="seconds"),
        "files": [],
        "saved": 0,
        "failed": 0,
    }
    try:
        html = fetch_html(url)
    except Exception as exc:  # pragma: no cover
        result["error"] = str(exc)
        return result

    urls = dedupe_urls(extract_url_candidates(html, url))[: max_images * 4]
    saved = 0
    for idx, img_url in enumerate(urls, 1):
        if saved >= max_images:
            break
        ext = extension_from_url(img_url)
        dest = out_dir / f"{idx:02d}{ext}"
        if download_image(img_url, dest):
            result["files"].append(str(dest.relative_to(ROOT)))
            saved += 1
        else:
            result["failed"] += 1
    result["saved"] = saved
    return result


def audit_images(payload: dict) -> dict:
    listings = payload.get("listings") or []
    expected = {str(row.get("id")): normalize_building(row.get("building")) for row in listings if row.get("id")}
    missing: list[str] = []
    broken: list[str] = []
    orphaned: list[str] = []

    for lid, building in expected.items():
        d = listing_dir(building, lid)
        if not d.exists() or not any(d.iterdir()):
            missing.append(f"{building}/{lid}")
            continue
        for file in d.iterdir():
            if file.is_dir():
                continue
            if file.stat().st_size < 4_096 or sniff_image_kind(file.read_bytes()[:32]) is None:
                broken.append(str(file.relative_to(ROOT)))

    if LISTING_IMG_DIR.exists():
        for building_dir in LISTING_IMG_DIR.iterdir():
            if not building_dir.is_dir():
                continue
            for listing_dir_path in building_dir.iterdir():
                if not listing_dir_path.is_dir():
                    continue
                lid = listing_dir_path.name
                building = building_dir.name
                if lid not in expected or expected[lid] != building:
                    orphaned.append(str(listing_dir_path.relative_to(ROOT)))

    return {
        "ok": True,
        "expected_listings": len(expected),
        "missing": missing,
        "broken": broken,
        "orphaned": orphaned,
        "missing_count": len(missing),
        "broken_count": len(broken),
        "orphaned_count": len(orphaned),
    }


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Download listing and hero images for Santa Fe CI.")
    ap.add_argument("--building", "-b", help="Filter listings by building (peninsula, torre_300, paradox)")
    ap.add_argument("--url", help="Download images from a single listing URL")
    ap.add_argument("--search", action="store_true", help="Download hero/aerial images from known public search pages")
    ap.add_argument("--audit", action="store_true", help="Audit missing, broken, and orphaned images")
    ap.add_argument("--max-images", type=int, default=8, help="Maximum images to save per page")
    return ap.parse_args()


def main() -> int:
    args = parse_args()
    payload = load_payload()
    manifest = read_json(MANIFEST_FILE, {"listings": {}, "hero": {}, "updated_at": None})

    if args.audit:
        report = audit_images(payload)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0

    if args.url:
        result = download_for_url(args.url, building=args.building or "misc", max_images=args.max_images)
        manifest.setdefault("hero", {})[slugify(result.get("label") or args.url)] = result
        manifest["updated_at"] = datetime.now().isoformat(timespec="seconds")
        write_json(MANIFEST_FILE, manifest)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    if args.search:
        results = []
        for item in KNOWN_SEARCH_PAGES:
            result = download_for_url(item["url"], building="hero", name=item["name"], max_images=args.max_images)
            manifest.setdefault("hero", {})[item["name"]] = result
            results.append(result)
        manifest["updated_at"] = datetime.now().isoformat(timespec="seconds")
        write_json(MANIFEST_FILE, manifest)
        print(json.dumps({"ok": True, "count": len(results), "items": results}, ensure_ascii=False, indent=2))
        return 0

    listings = payload.get("listings") or []
    if args.building:
        target_building = normalize_building(args.building)
        listings = [row for row in listings if normalize_building(row.get("building")) == target_building]

    results = []
    for listing in listings:
        result = download_for_listing(listing, max_images=args.max_images)
        manifest.setdefault("listings", {})[str(listing.get("id"))] = result
        results.append(result)

    manifest["updated_at"] = datetime.now().isoformat(timespec="seconds")
    write_json(MANIFEST_FILE, manifest)
    summary = {
        "ok": True,
        "count": len(results),
        "saved_total": sum(item.get("saved", 0) for item in results),
        "failed_total": sum(item.get("failed", 0) for item in results),
        "items": results,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
