/* ═══════════════════════════════════════════════════════════════
   SANTA FE 546 CI PLATFORM — app.js
   Fully API-driven. All data loaded from /api/* endpoints.
   ═══════════════════════════════════════════════════════════════ */

'use strict';

// ── CONFIG ─────────────────────────────────────────────────────
const API_BASE = '';

const API = {
  status:      `${API_BASE}/api/status`,
  feed:        `${API_BASE}/api/feed`,
  listings:    `${API_BASE}/api/listings`,
  listing:     id => `${API_BASE}/api/listings/${id}`,
  comparables: id => `${API_BASE}/api/comparables?listing_id=${id}`,
  agents:      `${API_BASE}/api/agents`,
  inquiries:   `${API_BASE}/api/inquiries`,
  inquiry:     id => `${API_BASE}/api/inquiries/${id}`,
  events:      `${API_BASE}/api/events`,
  marketSum:   `${API_BASE}/api/market-summary`,
  refresh:     `${API_BASE}/api/refresh`,
  export:      `${API_BASE}/api/export/listings.csv`,
  alerts:      `${API_BASE}/api/alerts`,
  scorecards:  `${API_BASE}/api/scorecards`,
  timeline:    id => `${API_BASE}/api/timeline?listing_id=${id}`,
};

const BUILDING_LABELS = {
  peninsula: 'Península Tower',
  torre300:  'Torre 300',
  paradox:   'Paradox',
};

const STATUS_LABELS = {
  fast_move:  { label: 'Fast Move',     tone: 'good'    },
  negotiate:  { label: 'Negotiate',     tone: 'mid'     },
  anchor:     { label: 'Anchor Hard',   tone: 'bad'     },
  verify:     { label: 'Verify First',  tone: 'risk'    },
  watch:      { label: 'Watch',         tone: 'neutral' },
};

let state = {
  currency: 'MXN',
  usdRate: 17.2,
  theme: 'dark',
  activeSection: 'overview',
  activeFilter: 'all',
  listings: [],
  feed: null,
  charts: {},
};

// ── DEMO MODE ─────────────────────────────────────────────────
// When the Python backend is not running (e.g. static deployment),
// we fall back to the bundled data snapshot and show a notice.
let DEMO_MODE = false;

function showDemoBanner() {
  if (document.getElementById('demo-banner')) return;
  const b = document.createElement('div');
  b.id = 'demo-banner';
  b.style.cssText = [
    'position:fixed', 'bottom:0', 'left:0', 'right:0',
    'background:#1a2a1a', 'border-top:1px solid #2a4a2a',
    'color:#7cad7c', 'font-size:12px', 'text-align:center',
    'padding:6px 16px', 'z-index:9999', 'letter-spacing:0.03em'
  ].join(';');
  b.innerHTML = 'MODO DEMO · datos en tiempo real requieren el servidor local · ' +
    '<code style="font-size:11px;opacity:0.7">python3 server.py</code> en el directorio del proyecto';
  document.body.appendChild(b);
}

// Static snapshot paths (bundled inside /frontend/data/)
const STATIC = {
  live: `${API_BASE || ''}/data/listings.live.json`,
};

// ── UTILS ──────────────────────────────────────────────────────
async function apiFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// Static fallback: use inlined window.STATIC_FEED or fetch from /data/listings.live.json
async function loadStaticFeed() {
  // Prefer the inlined snapshot (always available, no network request)
  if (window.STATIC_FEED) return window.STATIC_FEED;
  // Secondary fallback: fetch the file
  const res = await fetch(STATIC.live);
  if (!res.ok) throw new Error('Static feed unavailable');
  return res.json();
}

function fmt(n, currency = state.currency) {
  if (n == null) return '—';
  const v = currency === 'USD' ? n / state.usdRate : n;
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: currency === 'USD' ? 'USD' : 'MXN',
    maximumFractionDigits: 0,
  }).format(v);
}

function fmtNum(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('es-MX').format(n);
}

function medianOf(values) {
  var arr = (values || []).filter(function (v) { return typeof v === 'number' && !isNaN(v); }).slice().sort(function (a, b) { return a - b; });
  if (!arr.length) return 0;
  var m = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[m] : ((arr[m - 1] + arr[m]) / 2);
}


function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch (e) { return iso; }
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildingLabel(key) {
  return BUILDING_LABELS[key] || key;
}

function trustClass(trust) {
  if (trust >= 70) return 'trust-high';
  if (trust >= 45) return 'trust-mid';
  return 'trust-low';
}

function credClass(score) {
  if (score >= 65) return 'cred-high';
  if (score >= 40) return 'cred-mid';
  return 'cred-low';
}

function scoreBar(val, cls) {
  return `<div class="score-bar-wrap ${cls}">
    <div class="score-bar-track"><div class="score-bar-fill" style="width:${val}%"></div></div>
    <span class="score-val">${val}</span>
  </div>`;
}

// ── SCORING BREAKDOWN v2 ───────────────────────────────────────
// Human-readable score explanation using v2 components

function scoreColor(val, invert = false) {
  if (invert) val = 100 - val;
  if (val >= 70) return '#6DAA45';
  if (val >= 45) return '#E8AF34';
  return '#DD6974';
}

function scoreTier(val, invert = false) {
  if (invert) val = 100 - val;
  if (val >= 70) return 'tier-high';
  if (val >= 45) return 'tier-mid';
  return 'tier-low';
}

// Truth hierarchy for availability signals (ordered best→worst)
const TRUTH_HIERARCHY = [
  { key: 'verified_active_browser',    label: 'Verificado activo (browser)',   rank: 1, cls: 'th-verified' },
  { key: 'verified_off_market_browser',label: 'Verificado inactivo (browser)', rank: 2, cls: 'th-off-market' },
  { key: 'active_http',                label: 'Activo vía HTTP',               rank: 3, cls: 'th-http' },
  { key: 'available_claimed',          label: 'Broker declara disponible',     rank: 4, cls: 'th-claimed' },
  { key: 'unknown',                    label: 'Disponibilidad desconocida',    rank: 5, cls: 'th-unknown' },
  { key: 'access_blocked',             label: 'Portal bloqueado (neutro)',     rank: 5, cls: 'th-unknown' },
  { key: 'unavailable_claimed',        label: 'Broker declara no disponible',  rank: 6, cls: 'th-unavail' },
  { key: 'not_found',                  label: 'Eliminado / 404',               rank: 7, cls: 'th-gone' },
  { key: 'off_market',                 label: 'Fuera de mercado',              rank: 7, cls: 'th-gone' },
  { key: 'contradictory',              label: 'Contradicción detectada',       rank: 8, cls: 'th-contradiction' },
];
function truthLabel(key) {
  const t = TRUTH_HIERARCHY.find(t => t.key === key);
  return t ? t.label : (key || '—');
}
function truthClass(key) {
  const t = TRUTH_HIERARCHY.find(t => t.key === key);
  return t ? t.cls : 'th-unknown';
}

function blendNoteHuman(blendNote, sameW, sameCred, crossCred) {
  if (!blendNote || blendNote === 'no_comps') return 'Sin comparables disponibles';
  if (blendNote === 'cross_tower_only') return `Solo fuente cross-tower (${crossCred} comp${crossCred !== 1 ? 's' : '.'})`;
  if (blendNote === 'same_tower_only') return `Solo fuente mismo edificio (${sameCred} comp${sameCred !== 1 ? 's' : '.'})`;
  const pct = Math.round(sameW * 100);
  const crossPct = 100 - pct;
  if (pct >= 100) return `100 % mismo edificio (${sameCred} comp${sameCred !== 1 ? 's' : '.'} creíbles)`;
  if (pct === 0)  return `100 % cross-tower (${crossCred} comp${crossCred !== 1 ? 's' : '.'} creíbles)`;
  const reason = sameCred < 3 ? ` — muestra reducida (${sameCred} mismo edificio)` : '';
  return `${pct} % mismo edificio + ${crossPct} % cross-tower${reason}`;
}

function quantExplanation(qc, score, dom, priceCuts) {
  if (!qc) return 'Sin datos de precio para análisis cuantitativo.';
  const delta = qc.delta_to_blended_psqm_pct;
  const deltaPricePct = qc.delta_to_blended_price_pct;
  let lines = [];
  if (delta != null) {
    const dir = delta < 0 ? 'por debajo' : 'por encima';
    const absDelta = Math.abs(delta).toFixed(1);
    lines.push(`Precio/m² está <strong>${absDelta}% ${dir}</strong> del comparables mezclado.`);
  }
  if (deltaPricePct != null) {
    const absDp = Math.abs(deltaPricePct).toFixed(1);
    const dpDir = deltaPricePct < 0 ? 'por debajo' : 'por encima';
    lines.push(`Precio total ${absDp}% ${dpDir} de la referencia.`);
  }
  if (dom > 0) {
    const domCapped = Math.min(dom, 60);
    lines.push(`${dom} días en mercado → +${(domCapped * 0.3).toFixed(0)} pts presión de descuento.`);
  }
  if (priceCuts > 0) {
    lines.push(`${priceCuts} recorte${priceCuts > 1 ? 's' : ''} de precio confirmado${priceCuts > 1 ? 's' : ''} → +${priceCuts * 5} pts motivación del vendedor.`);
  }
  return lines.join(' ') || 'Precio alineado con el mercado.';
}

function qualExplanation(qc, bvAdj) {
  if (!qc) return 'Sin datos de credibilidad.';
  let parts = [];
  const trust = qc.trust_base ? Math.round(qc.trust_base / 0.75) : null;
  const avail = qc.availability_state;
  const proof = qc.proof_score || 0;
  const contradictions = qc.contradictions || 0;

  // Source trust
  if (trust != null) {
    const trustNote = trust >= 70 ? 'alta' : trust >= 45 ? 'media' : 'baja';
    parts.push(`Fuente confianza <strong>${trust}/100</strong> (${trustNote}).`);
  }

  // Availability truth level with hierarchy label
  if (avail) {
    const avLabel = truthLabel(avail);
    const avDeltaMap = {
      verified_available: '+15', available_claimed: '+5', unknown: '0',
      no_response: '−6', unavailable_claimed: '−12',
      contradictory: '−16', bait_switch: '−20',
    };
    const delta = avDeltaMap[avail] || '0';
    parts.push(`Disponibilidad: <span class="th-inline ${truthClass(avail)}">${avLabel}</span> (${delta} pts).`);
  }

  // Proof score
  if (proof > 0) parts.push(`Evidencia: ${proof.toFixed(0)}/60 pts.`);

  // Contradictions
  if (contradictions > 0) parts.push(`<strong>${contradictions} contradicción${contradictions > 1 ? 'es' : ''}</strong> detectada${contradictions > 1 ? 's' : ''} (−${contradictions * 10} pts).`);

  // BV policy with v2 neutral rule explained
  if (bvAdj && bvAdj.bv_policy) {
    const bvLabel = {
      boost:   `Browser verify: <strong>activo ✓</strong> → +${(bvAdj.bv_qual_delta_applied||0).toFixed(1)} pts.`,
      penalty: `Browser verify: <strong>no encontrado / retirado</strong> → ${(bvAdj.bv_qual_delta_applied||0).toFixed(1)} pts.`,
      neutral: 'Browser verify: portal bloqueado → <strong>neutro (política v2)</strong>.',
      none:    '',
    }[bvAdj.bv_policy] || '';
    if (bvLabel) parts.push(bvLabel);
  }

  return parts.join(' ') || 'Sin señales de credibilidad registradas.';
}

function actionExplanation(scores, bvAdj) {
  const action = scores.action_score;
  let lines = [];
  if (action >= 70) lines.push('Alta urgencia operacional — actuar ahora.');
  else if (action >= 50) lines.push('Prioridad media — seguimiento activo recomendado.');
  else if (action >= 30) lines.push('Prioridad baja — monitorear sin urgencia.');
  else lines.push('Descartado operacionalmente — no invertir tiempo.');
  if (bvAdj?.bv_action_delta_raw) {
    const delta = bvAdj.bv_action_delta_raw;
    if (delta > 0) lines.push(`Verificación activa suma +${delta} pts de acción.`);
    else if (delta < 0) lines.push(`BV confirma inactivo: ${delta} pts penalidad de acción.`);
  }
  if (scores.ghost_probability >= 50) lines.push(`Ghost ${scores.ghost_probability}% — alta probabilidad de listing fantasma; reducido score de acción.`);
  return lines.join(' ');
}

function offerExplanation(scores, pricing, dom, priceCuts) {
  const offer = scores.offer_score;
  let lines = [];
  if (offer >= 70) lines.push('Posición de palanca fuerte — abrir con oferta agresiva.');
  else if (offer >= 40) lines.push('Palanca moderada — negociar con confianza.');
  else if (offer >= 20) lines.push('Palanca limitada — cotizar cerca del asking.');
  else lines.push('Sin palanca significativa — precio ya competitivo.');
  if (dom >= 30) lines.push(`${dom} días en mercado refuerzan presión sobre el vendedor.`);
  if (priceCuts >= 1) lines.push(`${priceCuts} recorte${priceCuts > 1 ? 's' : ''} de precio previo${priceCuts > 1 ? 's' : ''} signal motivación.`);
  return lines.join(' ');
}

function renderScoreBreakdownSection(l, scores, pricing) {
  const qc = scores.quant_components || {};
  const qualC = scores.qual_components || {};
  const bvAdj = scores.bv_adjustment || {};
  const dom = l.days_on_market || 0;
  const priceCuts = pricing.price_cuts || 0;

  // Reference prices
  const sameRef = pricing.same_tower_median_price;
  const crossRef = pricing.cross_tower_median_price;
  const blendedRef = pricing.blended_reference_price;
  const sameCred = pricing.same_tower_credible_comps || qc.same_tower_credible || 0;
  const crossCred = pricing.cross_tower_credible_comps || qc.cross_tower_credible || 0;
  const blendW = qc.blend_weight_same_tower ?? 1;
  const blendNote = qc.blend_note || '';
  const blendHuman = blendNoteHuman(blendNote, blendW, sameCred, crossCred);

  // Delta direction helpers
  const dPct = qc.delta_to_blended_price_pct;
  const dSign = dPct != null ? (dPct < 0 ? '▼' : dPct > 0 ? '▲' : '=') : '';
  const dClass = dPct != null ? (dPct < -5 ? 'ref-below' : dPct > 5 ? 'ref-above' : 'ref-neutral') : '';
  const dStr = dPct != null ? `${dPct > 0 ? '+' : ''}${dPct.toFixed(1)}%` : '—';

  // Score ring colors
  const composite = scores.composite_score;
  const compColor = scoreColor(composite);
  const compTier = scoreTier(composite);

  return `
  <div class="drawer-section sbd-section">
    <div class="sbd-header">
      <div class="sbd-title">Análisis de score — Motor v2</div>
      <div class="sbd-composite ${compTier}">
        <div class="sbd-composite-val">${composite ?? '—'}</div>
        <div class="sbd-composite-label">Composite</div>
      </div>
    </div>

    <!-- Reference prices -->
    <div class="sbd-refs">
      <div class="sbd-refs-header">
        <div class="sbd-refs-title">Benchmarks de precio</div>
        ${l.furnished === 'furnished' ? '<div class="sbd-furnished-note"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg> Amueblado — comps priorizan unidades amuebladas</div>' : ''}
      </div>
      <div class="sbd-refs-grid">
        <div class="sbd-ref-cell">
          <div class="sbd-ref-label">
            <span class="sbd-src-dot sbd-src-same"></span>
            Mismo edificio
          </div>
          <div class="sbd-ref-val">${sameRef ? fmt(sameRef) : '—'}</div>
          <div class="sbd-ref-sub">Mismo edificio + recámaras &middot; ${sameCred} comp${sameCred !== 1 ? 's' : '.'}</div>
        </div>
        <div class="sbd-ref-cell">
          <div class="sbd-ref-label">
            <span class="sbd-src-dot sbd-src-cross"></span>
            Cross-tower
          </div>
          <div class="sbd-ref-val">${crossRef ? fmt(crossRef) : '—'}</div>
          <div class="sbd-ref-sub">Todos los edificios &middot; mismas recámaras &middot; ${crossCred} comp${crossCred !== 1 ? 's' : '.'}</div>
        </div>
        <div class="sbd-ref-cell sbd-ref-blended">
          <div class="sbd-ref-label">
            <span class="sbd-src-dot sbd-src-blend"></span>
            Referencia mezclada <span class="sbd-blend-tag">blend</span>
          </div>
          <div class="sbd-ref-val">${blendedRef ? fmt(blendedRef) : '—'}
            ${dPct != null ? `<span class="sbd-delta ${dClass}">${dSign} ${dStr}</span>` : ''}
          </div>
          <div class="sbd-ref-sub">${esc(blendHuman)}</div>
        </div>
      </div>
    </div>

    <!-- Five score dimensions -->
    <div class="sbd-dims">
      <!-- Quant -->
      <div class="sbd-dim">
        <div class="sbd-dim-header">
          <div class="sbd-dim-name">Quant</div>
          <div class="sbd-dim-badge ${scoreTier(scores.quant_score)}" style="--dim-color:${scoreColor(scores.quant_score)}">${scores.quant_score ?? '—'}</div>
        </div>
        <div class="sbd-dim-bar-wrap">
          <div class="sbd-dim-bar" style="width:${scores.quant_score ?? 0}%;background:${scoreColor(scores.quant_score)}"></div>
        </div>
        <div class="sbd-dim-explanation">${quantExplanation(qc, scores.quant_score, dom, priceCuts)}</div>
      </div>

      <!-- Qual -->
      <div class="sbd-dim">
        <div class="sbd-dim-header">
          <div class="sbd-dim-name">Qual</div>
          <div class="sbd-dim-badge ${scoreTier(scores.qual_score)}" style="--dim-color:${scoreColor(scores.qual_score)}">${scores.qual_score ?? '—'}</div>
        </div>
        <div class="sbd-dim-bar-wrap">
          <div class="sbd-dim-bar" style="width:${scores.qual_score ?? 0}%;background:${scoreColor(scores.qual_score)}"></div>
        </div>
        <div class="sbd-dim-explanation">${qualExplanation(qualC, bvAdj)}</div>
      </div>

      <!-- Action -->
      <div class="sbd-dim">
        <div class="sbd-dim-header">
          <div class="sbd-dim-name">Action</div>
          <div class="sbd-dim-badge ${scoreTier(scores.action_score)}" style="--dim-color:${scoreColor(scores.action_score)}">${scores.action_score ?? '—'}</div>
        </div>
        <div class="sbd-dim-bar-wrap">
          <div class="sbd-dim-bar" style="width:${scores.action_score ?? 0}%;background:${scoreColor(scores.action_score)}"></div>
        </div>
        <div class="sbd-dim-explanation">${actionExplanation(scores, bvAdj)}</div>
      </div>

      <!-- Offer -->
      <div class="sbd-dim">
        <div class="sbd-dim-header">
          <div class="sbd-dim-name">Offer / Palanca</div>
          <div class="sbd-dim-badge ${scoreTier(scores.offer_score)}" style="--dim-color:${scoreColor(scores.offer_score)}">${scores.offer_score ?? '—'}</div>
        </div>
        <div class="sbd-dim-bar-wrap">
          <div class="sbd-dim-bar" style="width:${scores.offer_score ?? 0}%;background:${scoreColor(scores.offer_score)}"></div>
        </div>
        <div class="sbd-dim-explanation">${offerExplanation(scores, pricing, dom, priceCuts)}</div>
      </div>

      <!-- Ghost -->
      <div class="sbd-dim">
        <div class="sbd-dim-header">
          <div class="sbd-dim-name">Ghost risk</div>
          <div class="sbd-dim-badge ${scoreTier(scores.ghost_probability, true)}" style="--dim-color:${scoreColor(scores.ghost_probability, true)}">${scores.ghost_probability ?? '—'}%</div>
        </div>
        <div class="sbd-dim-bar-wrap">
          <div class="sbd-dim-bar" style="width:${scores.ghost_probability ?? 0}%;background:${scoreColor(scores.ghost_probability, true)}"></div>
        </div>
        <div class="sbd-dim-explanation">${
          (scores.ghost_probability ?? 0) >= 60 ? 'Riesgo alto de listing fantasma. Verificar disponibilidad antes de negociar.' :
          (scores.ghost_probability ?? 0) >= 35 ? 'Riesgo moderado. Solicitar confirmación directa al broker.' :
          'Listing probablemente activo y real.'
        }</div>
      </div>
    </div>

    <!-- BV Policy note + truth hierarchy legend -->
    ${bvAdj.bv_policy ? `
    <div class="sbd-bv-note sbd-bv-${bvAdj.bv_policy}">
      <span class="sbd-bv-dot"></span>
      Browser verify: <strong>${{
        boost: 'Activo ✓',
        neutral: 'Bloqueado por portal (neutro)',
        penalty: 'No encontrado / retirado',
        none: 'Sin verificación',
      }[bvAdj.bv_policy] || bvAdj.bv_policy}</strong>
      ${bvAdj.bv_confidence ? ` · ${bvAdj.bv_confidence}% confianza` : ''}
    </div>` : ''}

    <!-- Truth hierarchy legend -->
    <div class="sbd-truth-legend">
      <div class="sbd-truth-legend-title">Jerarquía de señales</div>
      <div class="sbd-truth-chain">
        <span class="sbd-truth-pill th-verified">Browser activo</span>
        <span class="sbd-truth-arrow">›</span>
        <span class="sbd-truth-pill th-off-market">Browser inactivo</span>
        <span class="sbd-truth-arrow">›</span>
        <span class="sbd-truth-pill th-http">HTTP activo</span>
        <span class="sbd-truth-arrow">›</span>
        <span class="sbd-truth-pill th-claimed">Broker declara</span>
        <span class="sbd-truth-arrow">›</span>
        <span class="sbd-truth-pill th-unknown">Bloqueado/desconocido</span>
        <span class="sbd-truth-arrow">›</span>
        <span class="sbd-truth-pill th-gone">404 / retirado</span>
        <span class="sbd-truth-arrow">›</span>
        <span class="sbd-truth-pill th-contradiction">Contradicción</span>
      </div>
    </div>
  </div>`;
}

function renderScoreHintCell(scores, pricing) {
  const composite = scores.composite_score ?? scores.value_score ?? 0;
  const delta = pricing?.delta_to_peer_price_pct;
  const color = scoreColor(composite);
  const tier = scoreTier(composite);
  const deltaStr = delta != null ? ` ${delta > 0 ? '▲' : delta < 0 ? '▼' : ''}${Math.abs(delta).toFixed(0)}%` : '';
  const deltaClass = delta != null ? (delta < -5 ? 'hint-below' : delta > 5 ? 'hint-above' : 'hint-neutral') : '';
  return `<div class="score-hint ${tier}" style="--hint-color:${color}">
    <span class="score-hint-val">${composite}</span>
    ${deltaStr ? `<span class="score-hint-delta ${deltaClass}">${deltaStr}</span>` : ''}
  </div>`;
}

function statusBadge(statusKey) {
  const s = STATUS_LABELS[statusKey] || { label: statusKey, tone: 'neutral' };
  return `<span class="status-badge tone-${s.tone}">${s.label}</span>`;
}

function el(id) { return document.getElementById(id); }
function qs(sel) { return document.querySelector(sel); }
function qsAll(sel) { return document.querySelectorAll(sel); }

// ── THEME ──────────────────────────────────────────────────────
function initTheme() {
  const saved = document.documentElement.getAttribute('data-theme') || 'dark';
  state.theme = saved;
}

document.addEventListener('click', e => {
  if (e.target.closest('[data-theme-toggle]')) {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
  }
});

// ── SIDEBAR ────────────────────────────────────────────────────
function initSidebar() {
  const toggle = el('sidebar-toggle');
  const sidebar = el('sidebar');
  toggle?.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    document.querySelector('.app-shell').classList.toggle('sidebar-collapsed');
  });

  qsAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const section = item.dataset.section;
      if (!section) return;
      navigateTo(section);
    });
  });
}

function navigateTo(section) {
  state.activeSection = section;
  qsAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.section === section));
  qsAll('.content-section').forEach(s => s.classList.toggle('active', s.id === `section-${section}`));

  const titles = {
    operator: 'Lista de Acción Hoy',
    overview: 'Resumen Ejecutivo',
    listings: 'Listings Verificados',
    risk: 'Riesgos y Señales',
    analytics: 'Analytics de Mercado',
    trust: 'Matriz de Confianza',
    negotiation: 'Motor de Negociación',
    agents: 'Credibilidad de Agentes',
    inquiries: 'Registro de Contactos',
    tracking: 'Tracking de Fuentes y Alertas',
    scorecards: 'Scorecards de Brokers',
    monitoring: 'Blueprint de Monitoreo',
    map: 'Mapa de Inteligencia',
    'browser-verify': 'Verificación Asistida por Browser',
  };
  // Trigger map init/resize when navigating to map section
  if (section === 'map') {
    if (window.mapSectionActivated) window.mapSectionActivated();
  }
  // Lazy-init operator action list on first visit
  if (section === 'operator') {
    if (window.Operator && !window._operatorInited) {
      window._operatorInited = true;
      window.Operator.load();
    }
  }
  // Lazy-init browser verification section on first visit
  if (section === 'browser-verify') {
    if (window.initBrowserVerify && !window._bvInited) {
      window._bvInited = true;
      window.initBrowserVerify();
    }
    // Update sidebar badge
    const bvBadge = document.getElementById('bv-queued-count');
    if (bvBadge && window._BV && window._BV.items.length) {
      const pending = window._BV.items.filter(i => i.browser_status !== 'completed').length;
      bvBadge.textContent = pending > 0 ? pending : '—';
    }
  }
  el('topbar-title').textContent = titles[section] || section;
}

// ── CURRENCY TOGGLE ────────────────────────────────────────────
function initCurrency() {
  el('currency-toggle')?.addEventListener('click', () => {
    state.currency = state.currency === 'MXN' ? 'USD' : 'MXN';
    el('currency-lbl').textContent = state.currency;
    renderListingsTable(state.listings);
    renderNegs(state.listings);
  });
}

// ── BUILDING FILTER ────────────────────────────────────────────
function initFilters() {
  qsAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeFilter = btn.dataset.filter;
      qsAll('[data-filter]').forEach(b => b.classList.toggle('active', b === btn));
      reloadWithFilter();
    });
  });

  el('filter-beds')?.addEventListener('change', () => loadListings());
  el('filter-building')?.addEventListener('change', () => loadListings());
  el('filter-sort')?.addEventListener('change', () => loadListings());
}

function reloadWithFilter() {
  loadListings();
}

// ── FEED STATUS STRIP ──────────────────────────────────────────
async function loadStatus() {
  try {
    const data = await apiFetch(API.status);
    renderStrip(data);
    renderSidebarStatus(data);
  } catch (e) {
    // Backend not available — demo mode
    DEMO_MODE = true;
    showDemoBanner();
    // Use inlined snapshot metadata if available
    const snap = window.STATIC_FEED || {};
    const demoStatus = {
      mode: 'demo',
      generated_at_label: snap.generated_at_label || 'Snapshot · demo',
      count: snap.market_summary?.total_listings ?? 14,
      signature: snap.signature || 'snapshot',
    };
    renderStrip(demoStatus);
    renderSidebarStatus(demoStatus);
  }
}

function renderStrip(data) {
  const mode = data.mode || 'seed';
  const badge = el('strip-mode');
  badge.textContent = mode.toUpperCase();
  badge.className = 'feed-mode-badge' + (mode === 'seed' ? ' mode-seed' : '');
  el('strip-generated').textContent = data.generated_at_label || fmtDate(data.generated_at);
  el('strip-count').textContent = `${data.count ?? '—'} listings`;
  el('strip-sig').textContent = data.signature || '—';
  el('hero-date').textContent = data.generated_at_label || 'Actualizado';
}

function renderSidebarStatus(data) {
  const dot = el('feed-dot');
  const isLive = data.mode && data.mode !== 'seed';
  dot.className = 'status-dot' + (isLive ? ' active' : '');
  el('feed-status-text').textContent = isLive ? 'Feed live' : 'Modo seed';
  el('feed-detail').textContent = data.generated_at_label || '—';
}

// ── REFRESH ────────────────────────────────────────────────────
function initRefresh() {
  el('refresh-btn')?.addEventListener('click', async () => {
    const btn = el('refresh-btn');
    btn.classList.add('loading');
    btn.disabled = true;
    try {
      const r = await apiFetch(API.refresh, { method: 'POST' });
      renderStrip(r);
      await loadAll();
    } catch (e) {
      alert('Error al actualizar: ' + e.message);
    } finally {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  });

  el('export-btn')?.addEventListener('click', () => {
    window.open(API.export, '_blank');
  });
}

// ── LOAD ALL DATA ──────────────────────────────────────────────
async function loadAll() {
  await Promise.all([
    loadStatus(),
    loadFeed(),
    loadEvents(),
    loadInquiries(),
    loadAgents(),
  ]);
}

// ── FEED / LISTINGS ────────────────────────────────────────────
async function loadFeed() {
  try {
    let data;
    try {
      data = await apiFetch(API.feed);
    } catch (_apiErr) {
      // Fall back to bundled static snapshot
      data = await loadStaticFeed();
      DEMO_MODE = true;
      showDemoBanner();
    }
    state.feed = data;
    renderOverview(data);
    renderListingsTable(data.listings || []);
    renderRisk(data.listings || []);
    renderAnalytics(data);
    renderTrustMatrix(data.listings || []);
    renderNegs(data.listings || []);
    renderMonitoring(data.listings || []);
    updateNavBadges(data);
    // Update intelligence map
    if (window.updateMapListings) window.updateMapListings(data.listings || [], data.tower_summary || {});
  } catch (e) {
    console.error('Feed error', e);
  }
}

async function loadListings() {
  const beds = el('filter-beds')?.value;
  // Prioritize chip filter (state.activeFilter) if dropdown is 'all'
  const dropdownBuilding = el('filter-building')?.value;
  const building = (dropdownBuilding && dropdownBuilding !== 'all') ? dropdownBuilding : state.activeFilter;
  const sort = el('filter-sort')?.value || 'rank';

  const params = new URLSearchParams({ sort });
  if (beds && beds !== 'all') params.set('beds', beds);
  if (building && building !== 'all') params.set('building', building);

  try {
    const data = await apiFetch(`${API.listings}?${params}`);
    state.listings = data.items || [];
    renderListingsTable(state.listings);
    el('table-count').textContent = `${data.count ?? 0} listings`;
    // Sync filtered listings to map
    if (window.updateMapListings) window.updateMapListings(state.listings, (state.feed || {}).tower_summary || {});
  } catch (e) {
    console.error('Listings error', e);
  }
}

function updateNavBadges(data) {
  const ms = data.market_summary || {};
  el('listings-count').textContent = ms.total_listings ?? '—';
  el('risk-count').textContent = ms.verify_first_count ?? '—';
}

// ── OVERVIEW ───────────────────────────────────────────────────
function renderOverview(data) {
  const ms = data.market_summary || {};
  const ts = data.tower_summary || {};

  el('kpi-total').textContent = ms.total_listings ?? '—';
  el('kpi-median').textContent = fmt(ms.median_price ?? ms.avg_price);
  const br2 = (data.listings || []).filter(l => Number(l.beds) === 2 && l.price != null).map(l => Number(l.price)).sort((a,b)=>a-b);
  const br2Median = br2.length ? (br2.length % 2 ? br2[(br2.length-1)/2] : (br2[br2.length/2-1] + br2[br2.length/2]) / 2) : null;
  if (el('kpi-2br')) el('kpi-2br').textContent = br2Median != null ? fmt(br2Median) : '—';
  el('kpi-fastmove').textContent = ms.fast_move_count ?? '—';
  el('kpi-verify').textContent = ms.verify_first_count ?? '—';
  el('kpi-negotiate').textContent = ms.negotiate_count ?? '—';

  const srcNames = Object.keys(ms.source_mix || {});
  el('building-note').textContent = `Fuentes: ${srcNames.join(' · ')} · ${data.generated_at_label || ''}`;

  // Building cards
  renderBuildingCards(data);

  // Overview bar chart
  renderOverviewChart(data.listings || [], data.buildings || {});
}

function renderBuildingCards(data) {
  const ts = data.tower_summary || {};
  const listings = data.listings || [];
  const wrap = el('building-cards');
  if (!wrap) return;

  const keys = Object.keys(ts);
  if (keys.length === 0) { wrap.innerHTML = '<p class="loading-row">Sin datos de edificios</p>'; return; }

  const imgs = { peninsula: 'img/santafe-night.jpg', torre300: 'img/interior.jpg', paradox: 'img/paradox-aerial.jpg' };

  wrap.innerHTML = keys.map(key => {
    const t = ts[key];
    const best = listings.find(l => l.id === t.best_value_id);
    return `
      <div class="building-card" data-building="${key}">
        <div class="building-card-img-wrap">
          <img src="${imgs[key] || 'img/interior.jpg'}" alt="${esc(t.name)}" class="building-card-img">
          <div class="building-card-overlay"></div>
          <div class="building-card-badge">${t.count} listing${t.count !== 1 ? 's' : ''}</div>
        </div>
        <div class="building-card-body">
          <div class="building-card-name">${esc(t.name)}</div>
          <div class="building-card-stats">
            <div class="building-stat">
              <span class="building-stat-label">Mediana total</span>
              <span class="building-stat-value">${fmt(t.median_price)}</span>
            </div>
            <div class="building-stat">
              <span class="building-stat-label">$/m²</span>
              <span class="building-stat-value">${fmt(t.median_price_per_sqm)}</span>
            </div>
            <div class="building-stat">
              <span class="building-stat-label">DOM mediana</span>
              <span class="building-stat-value">${t.median_days_on_market ?? '—'}d</span>
            </div>
            <div class="building-stat">
              <span class="building-stat-label">Verificar primero</span>
              <span class="building-stat-value ${t.verify_first_count > 0 ? 'risk-val' : ''}">${t.verify_first_count}</span>
            </div>
          </div>
          ${best ? `
            <div class="building-best">
              <span class="building-best-label">Mejor valor:</span>
              <span class="building-best-title">${esc(best.title)}</span>
              <span class="building-best-price">${fmt(best.price)}</span>
            </div>` : ''}
        </div>
      </div>`;
  }).join('');
}

// ── EVENTS ─────────────────────────────────────────────────────
async function loadEvents() {
  try {
    const data = await apiFetch(API.events);
    renderEvents(data.items || []);
  } catch (e) {
    el('events-list').innerHTML = '<div class="events-empty">No se pudieron cargar los eventos</div>';
  }
}

function renderEvents(items) {
  const wrap = el('events-list');
  if (!wrap) return;
  if (!items.length) {
    wrap.innerHTML = '<div class="events-empty">Sin eventos recientes. Los cambios de precio y nuevos listings aparecerán aquí tras un Actualizar.</div>';
    return;
  }

  const icons = {
    new_listing:     '🟢',
    removed_listing: '🔴',
    price_drop:      '↓',
    price_increase:  '↑',
  };

  wrap.innerHTML = items.slice(0, 20).map(ev => `
    <div class="event-row ${esc(ev.type)}">
      <div class="event-icon">${icons[ev.type] || '•'}</div>
      <div>
        <div class="event-msg">${esc(ev.message)}</div>
        <div class="event-type">${esc(ev.type.replace(/_/g,' '))}${ev.listing_id ? ' · ' + ev.listing_id : ''}</div>
      </div>
    </div>`).join('');
}

// ── LISTINGS TABLE ─────────────────────────────────────────────
function renderListingsTable(listings) {
  state.listings = listings;
  const tbody = el('listings-tbody');
  if (!tbody) return;

  if (!listings.length) {
    tbody.innerHTML = '<tr><td colspan="14" class="loading-cell">Sin listings que coincidan con los filtros</td></tr>';
    el('table-count').textContent = '0 listings';
    return;
  }

  el('table-count').textContent = `${listings.length} listings`;

  tbody.innerHTML = listings.map(l => {
    const intel = l.intel || {};
    const scores = intel.scores || {};
    const pricing = intel.pricing || {};
    const srcProfile = intel.source_profile || {};
    const status = intel.status || {};
    const trust = srcProfile.trust || 0;

    const ghostClass = (scores.ghost_probability || 0) >= 50 ? 'high' : 'low';

    return `
      <tr class="listing-row" data-id="${esc(l.id)}">
        <td><span class="building-tag">${esc(buildingLabel(l.building))}</span></td>
        <td class="listing-title-cell">${esc(l.title)}</td>
        <td>${l.beds ?? '—'}</td>
        <td>${l.sqm ?? '—'}</td>
        <td class="price-cell-td">${fmt(l.price)}</td>
        <td>${fmtNum(Math.round(pricing.price_per_sqm || 0))}</td>
        <td>${l.days_on_market ?? '—'}d</td>
        <td><span class="source-badge ${trustClass(trust)}" title="${esc(srcProfile.risk_note)}">${esc(srcProfile.label)}</span></td>
        <td>${scoreBar(scores.confidence_score || 0, 'score-confidence')}</td>
        <td>${scoreBar(scores.ghost_probability || 0, 'score-ghost ' + ghostClass)}</td>
        <td>${scoreBar(scores.value_score || 0, 'score-value-s')}</td>
        <td>${scoreBar(scores.leverage_score || 0, 'score-leverage')}</td>
        <td>${renderScoreHintCell(scores, pricing)}</td>
        <td>${statusBadge(status.key)}</td>
        <td>
          <button class="detail-btn" data-listing-id="${esc(l.id)}" title="Ver detalle">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </td>
      </tr>`;
  }).join('');

  // Event delegation for detail buttons
  tbody.querySelectorAll('.detail-btn').forEach(btn => {
    btn.addEventListener('click', () => openDrawer(btn.dataset.listingId));
  });
}

// ── RISK SECTION ───────────────────────────────────────────────
function renderRisk(listings) {
  // Legend
  const legendWrap = el('risk-legend-grid');
  if (legendWrap) {
    const risks = [
      { label: 'Fuente baja trazabilidad', note: 'Portales sociales, agregadores con trust < 40', cls: 'risk-high' },
      { label: 'Sobreprecio vs. comparable', note: 'Precio > 12% sobre mediana del peer group', cls: 'risk-mid' },
      { label: 'Posible bait pricing', note: 'Precio muy bajo vs. mercado en fuente de riesgo', cls: 'risk-high' },
      { label: 'Fatiga comercial', note: 'Más de 45 días activo sin precio ajustado', cls: 'risk-low' },
      { label: 'Contradicción detectada', note: 'Broker reportó no disponible vs. anuncio activo', cls: 'risk-critical' },
      { label: 'Baja de precio observada', note: 'Seller señaliza presión; palanca disponible', cls: 'risk-info' },
    ];
    legendWrap.innerHTML = risks.map(r => `
      <div class="risk-legend-item ${r.cls}">
        <div class="risk-legend-dot"></div>
        <div>
          <div class="risk-legend-label">${esc(r.label)}</div>
          <div class="risk-legend-note">${esc(r.note)}</div>
        </div>
      </div>`).join('');
  }

  // Flagged listings
  const riskWrap = el('risk-cards-wrap');
  if (riskWrap) {
    const flagged = listings.filter(l => {
      const intel = l.intel || {};
      const scores = intel.scores || {};
      const flags = intel.flags || [];
      return scores.ghost_probability >= 40
        || scores.confidence_score < 50
        || (flags.length && !flags[0].includes('Sin alerta'));
    });

    if (!flagged.length) {
      riskWrap.innerHTML = '<div class="no-data-notice"><p>Sin señales de riesgo activas en el universo actual.</p></div>';
    } else {
      riskWrap.innerHTML = flagged.map(l => {
        const intel = l.intel || {};
        const scores = intel.scores || {};
        const flags = intel.flags || ['Sin alerta dura'];
        return `
          <div class="risk-card" data-listing-id="${esc(l.id)}">
            <div class="risk-card-header">
              <span class="risk-card-building">${esc(buildingLabel(l.building))}</span>
              ${statusBadge(intel.status?.key)}
              <span class="risk-ghost-score">Ghost ${scores.ghost_probability ?? '—'}%</span>
            </div>
            <div class="risk-card-title">${esc(l.title)}</div>
            <div class="risk-flags">
              ${flags.map(f => `<span class="risk-flag">${esc(f)}</span>`).join('')}
            </div>
            <button class="detail-btn" data-listing-id="${esc(l.id)}" style="margin-top:8px;" title="Ver detalle">
              Ver detalle →
            </button>
          </div>`;
      }).join('');

      riskWrap.querySelectorAll('.detail-btn').forEach(btn => {
        btn.addEventListener('click', () => openDrawer(btn.dataset.listingId));
      });
    }
  }

  // Scenarios
  const scenarioWrap = el('scenario-grid');
  if (scenarioWrap) {
    const scenarios = [
      { title: 'El broker dice que se acaba de rentar', counter: 'Pide el número de unidad exacto y confirma directamente con el edificio. Si no puede darte la unidad, es un lead inválido.' },
      { title: 'Precio diferente al anuncio al momento del contacto', counter: 'Marca como bait_switch y registra la cotización real. Usa la diferencia como palanca de negociación.' },
      { title: 'Sin respuesta después de múltiples intentos', counter: 'Registra como no_response. Reduce el valor de ese listing y redirige el foco al siguiente objetivo.' },
      { title: 'El broker no tiene video actual', counter: 'No avances en la negociación sin evidencia visual reciente. Pide fecha en el video para confirmar vigencia.' },
      { title: 'No conoce el costo total de entrada', counter: 'Un broker profesional tiene este desglose listo. Sin él, estás negociando a ciegas. Desconfía.' },
    ];
    scenarioWrap.innerHTML = scenarios.map(s => `
      <div class="scenario-card">
        <div class="scenario-title">${esc(s.title)}</div>
        <div class="scenario-counter">${esc(s.counter)}</div>
      </div>`).join('');
  }
}

// ── ANALYTICS ──────────────────────────────────────────────────
function renderAnalytics(data) {
  const listings = data.listings || [];
  const ms = data.market_summary || {};
  const ts = data.tower_summary || {};

  // Stats grid
  const statsGrid = el('stats-grid');
  if (statsGrid) {
    statsGrid.innerHTML = Object.entries(ts).map(([key, t]) => `
      <div class="stat-card">
        <div class="stat-card-name">${esc(t.name)}</div>
        <div class="stat-row"><span>Listings</span><strong>${t.count}</strong></div>
        <div class="stat-row"><span>Mediana precio</span><strong>${fmt(t.median_price)}</strong></div>
        <div class="stat-row"><span>$/m²</span><strong>${fmt(t.median_price_per_sqm)}</strong></div>
        <div class="stat-row"><span>DOM mediana</span><strong>${t.median_days_on_market}d</strong></div>
        <div class="stat-row"><span>Verificar primero</span><strong class="${t.verify_first_count ? 'risk-val' : ''}">${t.verify_first_count}</strong></div>
      </div>`).join('');
  }

  // Beds bar chart
  renderBedsChart(listings, data.buildings || {});
  // Scatter chart
  renderScatterChart(listings);
  // Value vs Ghost
  renderValueGhostChart(listings);
  // Source mix (doughnut)
  renderSourceMixChart(ms.source_mix || {});
}

function renderBedsChart(listings, buildings) {
  const ctx = el('chart-beds-bar');
  if (!ctx) return;
  if (state.charts['beds-bar']) state.charts['beds-bar'].destroy();

  const bKeys = Object.keys(buildings);
  const beds2 = bKeys.map(k => {
    const rows = listings.filter(l => l.building === k && l.beds === 2);
    return rows.length ? Math.round(rows.reduce((s, r) => s + r.price, 0) / rows.length) : null;
  });
  const beds3 = bKeys.map(k => {
    const rows = listings.filter(l => l.building === k && l.beds === 3);
    return rows.length ? Math.round(rows.reduce((s, r) => s + r.price, 0) / rows.length) : null;
  });

  state.charts['beds-bar'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: bKeys.map(k => buildings[k]?.name || k),
      datasets: [
        { label: '2 Rec.', data: beds2, backgroundColor: '#20808D', borderRadius: 4 },
        { label: '3 Rec.', data: beds3, backgroundColor: '#1B474D', borderRadius: 4 },
      ]
    },
    options: chartOpts({ unit: 'MXN' }),
  });
}

function renderScatterChart(listings) {
  const ctx = el('chart-scatter');
  if (!ctx) return;
  if (state.charts['scatter']) state.charts['scatter'].destroy();

  const colors = { peninsula: '#20808D', torre300: '#A84B2F', paradox: '#FFC553' };
  const grouped = {};
  listings.forEach(l => {
    if (!grouped[l.building]) grouped[l.building] = [];
    grouped[l.building].push({ x: l.sqm, y: l.price });
  });

  state.charts['scatter'] = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: Object.entries(grouped).map(([k, pts]) => ({
        label: buildingLabel(k),
        data: pts,
        backgroundColor: (colors[k] || '#848456') + 'CC',
        pointRadius: 6,
        pointHoverRadius: 8,
      }))
    },
    options: {
      ...chartOpts({ unit: 'MXN' }),
      scales: {
        x: {
          ...scaleOpts(),
          title: { display: true, text: 'm²', color: '#7a7a7a' }
        },
        y: {
          ...scaleOpts(),
          title: { display: true, text: 'Precio MXN', color: '#7a7a7a' }
        }
      }
    },
  });
}

function renderValueGhostChart(listings) {
  const ctx = el('chart-psm');
  if (!ctx) return;
  if (state.charts['psm']) state.charts['psm'].destroy();

  const colors = { peninsula: '#20808D', torre300: '#A84B2F', paradox: '#FFC553' };
  const grouped = {};
  listings.forEach(l => {
    if (!grouped[l.building]) grouped[l.building] = [];
    const scores = l.intel?.scores || {};
    grouped[l.building].push({ x: scores.ghost_probability, y: scores.value_score, label: l.title });
  });

  state.charts['psm'] = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: Object.entries(grouped).map(([k, pts]) => ({
        label: buildingLabel(k),
        data: pts,
        backgroundColor: (colors[k] || '#848456') + 'CC',
        pointRadius: 6,
      }))
    },
    options: {
      ...chartOpts(),
      scales: {
        x: { ...scaleOpts(), title: { display: true, text: 'Ghost %', color: '#7a7a7a' } },
        y: { ...scaleOpts(), title: { display: true, text: 'Value Score', color: '#7a7a7a' } }
      }
    },
  });
}

function renderSourceMixChart(sourceMix) {
  const ctx = el('chart-confidence');
  if (!ctx) return;
  if (state.charts['confidence']) state.charts['confidence'].destroy();

  const labels = Object.keys(sourceMix);
  const values = Object.values(sourceMix);
  const palette = ['#20808D','#A84B2F','#1B474D','#BCE2E7','#944454','#FFC553','#848456','#6E522B'];

  state.charts['confidence'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: palette.slice(0, labels.length),
        borderWidth: 0,
      }]
    },
    options: {
      plugins: {
        legend: { position: 'right', labels: { color: '#b0b0b0', font: { size: 11 } } }
      }
    }
  });
}

function renderOverviewChart(listings, buildings) {
  const ctx = el('chart-overview-bar');
  if (!ctx) return;
  if (state.charts['overview-bar']) state.charts['overview-bar'].destroy();

  const bKeys = Object.keys(buildings);
  const medians = bKeys.map(k => {
    const rows = listings.filter(l => l.building === k);
    return rows.length ? Math.round(rows.reduce((s, r) => s + r.price, 0) / rows.length) : 0;
  });

  state.charts['overview-bar'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: bKeys.map(k => buildings[k]?.name || k),
      datasets: [{
        label: 'Precio mediana MXN',
        data: medians,
        backgroundColor: ['#20808D', '#A84B2F', '#FFC553'],
        borderRadius: 4,
      }]
    },
    options: chartOpts({ unit: 'MXN' }),
  });
}

// ── TRUST MATRIX ───────────────────────────────────────────────
function renderTrustMatrix(listings) {
  const ctx = el('chart-trust-matrix');
  if (!ctx) return;
  if (state.charts['trust-matrix']) state.charts['trust-matrix'].destroy();

  const colors = { peninsula: '#20808D', torre300: '#A84B2F', paradox: '#FFC553' };
  const grouped = {};
  listings.forEach(l => {
    if (!grouped[l.building]) grouped[l.building] = [];
    const scores = l.intel?.scores || {};
    grouped[l.building].push({
      x: scores.confidence_score || 0,
      y: scores.value_score || 0,
      label: l.title,
    });
  });

  state.charts['trust-matrix'] = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: Object.entries(grouped).map(([k, pts]) => ({
        label: buildingLabel(k),
        data: pts,
        backgroundColor: (colors[k] || '#848456') + 'CC',
        pointRadius: 8,
        pointHoverRadius: 10,
      }))
    },
    options: {
      ...chartOpts(),
      scales: {
        x: { ...scaleOpts(), min: 0, max: 100, title: { display: true, text: 'Confidence Score', color: '#7a7a7a' } },
        y: { ...scaleOpts(), min: 0, max: 100, title: { display: true, text: 'Value Score', color: '#7a7a7a' } }
      }
    },
  });

  // Trust cards
  const wrap = el('trust-cards-grid');
  if (wrap) {
    wrap.innerHTML = listings.map(l => {
      const scores = l.intel?.scores || {};
      const srcProfile = l.intel?.source_profile || {};
      return `
        <div class="trust-card">
          <div class="trust-card-header">
            <span class="trust-card-building">${esc(buildingLabel(l.building))}</span>
            ${statusBadge(l.intel?.status?.key)}
          </div>
          <div class="trust-card-title">${esc(l.title)}</div>
          <div class="trust-card-source">
            <span class="source-badge ${trustClass(srcProfile.trust || 0)}">${esc(srcProfile.label)}</span>
            <span class="trust-score">Trust: ${srcProfile.trust ?? '—'}</span>
          </div>
          <div class="trust-scores">
            <div class="trust-score-row"><span>Confianza</span>${scoreBar(scores.confidence_score || 0, 'score-confidence')}</div>
            <div class="trust-score-row"><span>Value</span>${scoreBar(scores.value_score || 0, 'score-value-s')}</div>
            <div class="trust-score-row"><span>Ghost</span>${scoreBar(scores.ghost_probability || 0, 'score-ghost')}</div>
          </div>
        </div>`;
    }).join('');
  }
}

// ── NEGOTIATION ────────────────────────────────────────────────
function renderNegs(listings) {
  const wrap = el('negs-grid');
  if (!wrap) return;

  const targets = listings
    .filter(l => l.intel?.status?.key !== 'verify')
    .slice(0, 8);

  // ── RENTER ADVANTAGE CARDS ──
  const ravWrap = el('renter-advantage-cards');
  if (ravWrap && window.LeverageLayer) {
    ravWrap.innerHTML = window.LeverageLayer.renderRenterAdvantageCards(listings);
  }

  wrap.innerHTML = targets.map(l => {
    const intel = l.intel || {};
    const pricing = intel.pricing || {};
    const scores = intel.scores || {};
    const angle = intel.primary_angle || [];
    const leverage = scores.leverage_score || 0;
    const tier = window.LeverageLayer ? window.LeverageLayer.leverageTierLabel(leverage) : { label: '', cls: 'tier-low' };
    const fillCls = leverage >= 60 ? 'high' : leverage >= 30 ? 'mid' : 'low';

    // Build comp strip for this card
    const compStripHtml = window.LeverageLayer
      ? window.LeverageLayer.renderCompStrip(l, listings)
      : '';

    // Build AI explanation snippet
    const aiHtml = window.LeverageLayer
      ? window.LeverageLayer.renderAiLeverageExplain(l, listings)
      : '';

    return `
      <div class="neg-card">
        <div class="neg-card-header">
          <span class="neg-building">${esc(buildingLabel(l.building))}</span>
          ${statusBadge(intel.status?.key)}
          <span class="neg-card-leverage-tier ${tier.cls}" style="margin-left:auto">${esc(tier.label)}</span>
        </div>
        <div class="neg-card-title">${esc(l.title)}</div>

        <!-- Leverage meter bar -->
        <div class="leverage-meter-wrap" style="margin:var(--space-2) 0;">
          <div class="leverage-meter-label-row">
            <span class="leverage-meter-label">Palanca del rentatario</span>
            <span class="leverage-meter-score" style="color:${leverage >= 60 ? '#6DAA45' : leverage >= 30 ? '#E8AF34' : '#DD6974'}">${leverage}/100</span>
          </div>
          <div class="leverage-track">
            <div class="leverage-fill ${fillCls}" style="width:${leverage}%"></div>
          </div>
        </div>

        <div class="neg-price-band">
          <div class="neg-price-item">
            <div class="neg-price-item-label">Fair band</div>
            <div class="neg-price-item-val">${fmt(pricing.fair_low)}–${fmt(pricing.fair_high)}</div>
          </div>
          <div class="neg-price-item">
            <div class="neg-price-item-label">Opening anchor</div>
            <div class="neg-price-item-val" style="color:#6DAA45">${fmt(pricing.opening_anchor)}</div>
          </div>
          <div class="neg-price-item">
            <div class="neg-price-item-label">Target close</div>
            <div class="neg-price-item-val" style="color:var(--color-primary)">${fmt(pricing.target_close)}</div>
          </div>
          <div class="neg-price-item">
            <div class="neg-price-item-label">Walk away</div>
            <div class="neg-price-item-val" style="color:#D163A7">${fmt(pricing.walk_away)}</div>
          </div>
        </div>
        ${angle.length ? `<div class="neg-angle">${esc(angle[0])}</div>` : ''}

        <!-- Comp positioning strip -->
        ${compStripHtml}

        <!-- AI leverage explanation -->
        ${aiHtml}

        <div class="neg-meta">
          DOM: ${l.days_on_market ?? '—'}d · Palanca: ${leverage}/100
          <button class="detail-btn" data-listing-id="${esc(l.id)}" title="Ver análisis completo de palanca" style="float:right">Análisis Completo →</button>
        </div>
      </div>`;
  }).join('');

  wrap.querySelectorAll('.detail-btn').forEach(btn => {
    btn.addEventListener('click', () => openDrawer(btn.dataset.listingId));
  });

  // ── LEVERAGE CHARTS ──
  if (window.LeverageLayer) {
    window.LeverageLayer.renderPowerBalanceChart('chart-power-balance', listings);
    window.LeverageLayer.renderDomPressureChart('chart-dom-pressure', listings);
    window.LeverageLayer.renderPricePositioningChart('chart-price-positioning', listings);
    window.LeverageLayer.renderLeverageScatterChart('chart-leverage-scatter', listings);
  }

  // ── COUNTERPARTY TACTIC OVERVIEW ──
  renderCpTacticOverview(listings);

  // Tactics
  const tacticsWrap = el('tactics-grid');
  if (tacticsWrap) {
    const tactics = [
      { tactic: '"Ya hay otro interesado"', counter: 'Ignora el urgency play. Pide comprobante. Si no hay, es presión vacía. Avanza a tu ritmo.' },
      { tactic: '"Este precio no te va a durar"', counter: 'Con datos: el DOM mediano en Santa Fe es 30+d. Cita la muestra. No cedas.' },
      { tactic: '"Es el único con esas características"', counter: 'Compara con el peer group del mismo edificio y recámaras. La unicidad rara vez se sostiene.' },
      { tactic: '"El dueño no baja ni un peso"', counter: 'Los precios cortados en historial muestran lo contrario. Usa los datos de intelligence.' },
    ];
    tacticsWrap.innerHTML = tactics.map(t => `
      <div class="tactic-card">
        <div class="tactic-phrase">"${esc(t.tactic)}"</div>
        <div class="tactic-counter">${esc(t.counter)}</div>
      </div>`).join('');
  }

  // Prepay
  const prepayWrap = el('prepay-grid');
  if (prepayWrap) {
    const pts = targets.slice(0, 4);
    prepayWrap.innerHTML = pts.map(l => {
      const monthly = l.price;
      const annual = monthly * 12;
      const discounted = annual * 0.92; // estimated 8% prepay discount
      const savings = annual - discounted;
      return `
        <div class="prepay-card">
          <div class="prepay-title">${esc(l.title)}</div>
          <div class="prepay-rows">
            <div class="prepay-row"><span>Mensual</span><strong>${fmt(monthly)}</strong></div>
            <div class="prepay-row"><span>Total anual</span><strong>${fmt(annual)}</strong></div>
            <div class="prepay-row"><span>Con prepago ~8%</span><strong style="color:#6DAA45">${fmt(discounted)}</strong></div>
            <div class="prepay-row"><span>Ahorro estimado</span><strong style="color:var(--color-primary)">${fmt(savings)}</strong></div>
          </div>
        </div>`;
    }).join('');
  }
}

// ── COUNTERPARTY INTELLIGENCE ──────────────────────────────────────────────────

const TACTIC_COLORS = {
  false_scarcity:        '#D163A7',
  vague_availability:    '#4F98A3',
  anchor_inflation:      '#BB653B',
  bait_and_switch:       '#DD6974',
  delay_tactics:         '#5591C7',
  social_proof:          '#6DAA45',
  maintenance_ambiguity: '#E8AF34',
  duplicate_confusion:   '#A86FDF',
};

function tacticProbClass(prob) {
  if (prob >= 60) return 'prob-high';
  if (prob >= 35) return 'prob-mid';
  return 'prob-low';
}

function tacticProbLabel(prob) {
  if (prob >= 70) return 'Alta';
  if (prob >= 50) return 'Elevada';
  if (prob >= 30) return 'Moderada';
  return 'Baja';
}

// Render market-wide counterparty tactic overview in the Negotiation section
function renderCpTacticOverview(listings) {
  const wrap = el('cp-tactic-overview');
  if (!wrap) return;
  if (!listings.length) {
    wrap.innerHTML = '<div class="no-data-notice"><p>Sin datos para calcular intel de contraparte.</p></div>';
    return;
  }

  const tacticIds = ['false_scarcity','vague_availability','anchor_inflation','bait_and_switch',
    'delay_tactics','social_proof','maintenance_ambiguity','duplicate_confusion'];

  const tacticSummary = tacticIds.map(tid => {
    const entries = listings
      .filter(l => l.intel && l.intel.counterparty_playbook)
      .map(l => {
        const t = (l.intel.counterparty_playbook.tactics || []).find(t => t.id === tid);
        return { listing: l, tactic: t };
      })
      .filter(e => e.tactic);

    if (!entries.length) return null;
    entries.sort((a, b) => b.tactic.probability - a.tactic.probability);
    const top = entries[0];
    const avgProb = Math.round(entries.reduce((s, e) => s + e.tactic.probability, 0) / entries.length);
    return {
      id: tid, name: top.tactic.name, description: top.tactic.description,
      tell: top.tactic.tell, maxProb: top.tactic.probability, avgProb,
      topListing: top.listing,
      ethicsClassification: top.tactic.ethics_classification || 'borderline',
    };
  }).filter(Boolean);

  tacticSummary.sort((a, b) => b.maxProb - a.maxProb);

  wrap.innerHTML = tacticSummary.map(ts => {
    const badge = TACTIC_COLORS[ts.id] || '#4F98A3';
    const probCls = tacticProbClass(ts.maxProb);
    const ec = ts.ethicsClassification || 'borderline';
    const ecClass = ethicsClass(ec);
    const ecLabel = ethicsLabel(ec);
    const ecIcon = ethicsIcon(ec);
    return `
      <div class="cp-tactic-card">
        <div class="cp-tactic-card-head">
          <div class="cp-tactic-name">${esc(ts.name)}</div>
          <span class="cp-prob-badge ${probCls}" style="color:${badge}">${ts.maxProb}% &middot; ${esc(tacticProbLabel(ts.maxProb))}</span>
        </div>
        <div class="cp-tactic-ethics-row">
          <span class="cp-ethics-badge ${ecClass} cp-ethics-badge-sm">${ecIcon}&nbsp;${ecLabel}</span>
        </div>
        <div class="cp-tactic-desc">${esc(ts.description)}</div>
        <div class="cp-tactic-tell"><span class="cp-tell-label">Se&ntilde;al:</span> ${esc(ts.tell)}</div>
        <div class="cp-tactic-footer">
          <span class="cp-tactic-top-listing">Mayor riesgo: <strong>${esc(ts.topListing.title)}</strong></span>
          <button class="cp-open-drawer" data-listing-id="${esc(ts.topListing.id)}">Playbook &rarr;</button>
        </div>
      </div>`;
  }).join('');

  wrap.querySelectorAll('.cp-open-drawer').forEach(btn => {
    btn.addEventListener('click', () => openDrawer(btn.dataset.listingId));
  });
}

// Ethics badge helpers
function ethicsClass(ec) {
  if (ec === 'unethical') return 'ethics-unethical';
  if (ec === 'ethical')   return 'ethics-ethical';
  return 'ethics-borderline';
}
function ethicsLabel(ec) {
  if (ec === 'unethical') return '\u26a0\ufe0f Se\u00f1al de alerta';
  if (ec === 'ethical')   return '\u2714 Pr\u00e1ctica aceptable';
  return '\u25cb Contexto ambiguo';
}
function ethicsIcon(ec) {
  if (ec === 'unethical') return '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  if (ec === 'ethical')   return '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
  return '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
}

// Build the counterparty playbook HTML for the listing detail drawer
function renderCpPlaybook(intel) {
  const cp = intel.counterparty_playbook;
  if (!cp) return '';

  const tactics = (cp.tactics || []).slice(0, 4);

  const tacticsHtml = tactics.map((t, i) => {
    const badge = TACTIC_COLORS[t.id] || '#4F98A3';
    const isTop = i === 0;
    const ec = t.ethics_classification || 'borderline';
    const ecClass = ethicsClass(ec);
    const ecLabel = ethicsLabel(ec);
    const ecIcon = ethicsIcon(ec);

    // Context description: which case applies based on classification
    const contextText = ec === 'ethical'
      ? (t.ethical_context || '')
      : ec === 'unethical'
        ? (t.unethical_context || '')
        : (t.ethical_context || '') + (t.unethical_context ? ' / ' + t.unethical_context : '');

    // The recommended send text: matches the detected case
    const sendText = ec === 'ethical'
      ? (t.ethical_send || t.rebuttal_script || '')
      : ec === 'unethical'
        ? (t.unethical_send || t.rebuttal_script || '')
        : (t.rebuttal_script || '');

    return `
      <div class="cp-drawer-tactic${isTop ? ' cp-drawer-tactic-top' : ''}">
        <div class="cp-drawer-tactic-header">
          <div class="cp-drawer-tactic-name">${esc(t.name)}</div>
          <span class="cp-prob-badge ${tacticProbClass(t.probability)}" style="color:${badge}">${t.probability}%</span>
          ${isTop ? '<span class="cp-primary-tag">T\u00e1ctica principal</span>' : ''}
        </div>

        <!-- Ethics classification badge -->
        <div class="cp-ethics-row">
          <span class="cp-ethics-badge ${ecClass}">${ecIcon}&nbsp;${ecLabel}</span>
          ${contextText ? `<span class="cp-ethics-context">${esc(contextText)}</span>` : ''}
        </div>

        <!-- What / when breakdown -->
        <div class="cp-ethics-panel">
          <div class="cp-ethics-case cp-ethics-ethical-case">
            <div class="cp-ethics-case-label"><span class="cp-ethics-dot dot-ethical"></span>Caso leg\u00edtimo</div>
            <div class="cp-ethics-case-text">${esc(t.ethical_context || '—')}</div>
            <div class="cp-ethics-send-label">Mensaje cuando es genuino:</div>
            <div class="cp-ethics-send-text">&ldquo;${esc(t.ethical_send || '—')}&rdquo;</div>
          </div>
          <div class="cp-ethics-case cp-ethics-unethical-case">
            <div class="cp-ethics-case-label"><span class="cp-ethics-dot dot-unethical"></span>Caso de alerta</div>
            <div class="cp-ethics-case-text">${esc(t.unethical_context || '—')}</div>
            <div class="cp-ethics-send-label">Mensaje cuando es manipulador:</div>
            <div class="cp-ethics-send-text">&ldquo;${esc(t.unethical_send || '—')}&rdquo;</div>
          </div>
        </div>

        <!-- Recommended send for this listing (based on detected case) -->
        <div class="cp-send-block">
          <div class="cp-block-label cp-send-label-row">
            <span class="cp-send-icon ${ecClass}-icon">${ecIcon}</span>
            Mensaje recomendado &mdash; caso detectado: <strong>${ecLabel.replace(/^[^\s]+\s/, '')}</strong>
          </div>
          <div class="cp-send-text ${ecClass}-send">&ldquo;${esc(sendText)}&rdquo;</div>
        </div>

        <div class="cp-drawer-tactic-why">${esc(t.description)}</div>
        <div class="cp-evidence-block">
          <div class="cp-block-label">Evidencia en metadata</div>
          ${t.evidence.map(e => `<div class="cp-evidence-item">&bull; ${esc(e)}</div>`).join('')}
        </div>
        <div class="cp-rebuttal-block">
          <div class="cp-block-label">Script de negociaci\u00f3n completo</div>
          <div class="cp-rebuttal-script">&ldquo;${esc(t.rebuttal_script)}&rdquo;</div>
        </div>
        <div class="cp-dns-grid">
          <div class="cp-dns-card cp-dns-dont">
            <div class="cp-dns-label">&#10007; No digas</div>
            <div class="cp-dns-text">${esc(t.do_not_say)}</div>
          </div>
          <div class="cp-dns-card cp-dns-do">
            <div class="cp-dns-label">&#10003; Di mejor</div>
            <div class="cp-dns-text">${esc(t.say_instead)}</div>
          </div>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="drawer-section cp-playbook-section">
      <div class="drawer-section-title cp-section-title">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:5px"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        Playbook de Contraparte
      </div>
      ${cp.market_context_note ? `<div class="cp-context-note">${esc(cp.market_context_note)}</div>` : ''}
      <div class="cp-counter-script-block">
        <div class="cp-block-label">Script dual &mdash; tu posici\u00f3n frente a la contraparte</div>
        <div class="cp-counter-script">&ldquo;${esc(cp.counter_script || '')}&rdquo;</div>
      </div>
      <div class="cp-drawer-tactics-list">${tacticsHtml}</div>
    </div>`;
}

// ── MONITORING ─────────────────────────────────────────────────
function renderMonitoring(listings) {
  // Pipeline stages
  const stagesWrap = el('pipeline-stages');
  if (stagesWrap) {
    const stages = [
      { icon: '📡', label: 'Feed refresco', detail: 'POST /api/refresh · Recompute desde seed + inquiries' },
      { icon: '🔬', label: 'Scoring de inteligencia', detail: 'intelligence.py · ghost, value, leverage, pricing bands' },
      { icon: '💬', label: 'Registro de contactos', detail: 'POST /api/inquiries · Loguea cada broker interaction' },
      { icon: '⚡', label: 'Detección de eventos', detail: '/api/events · Nuevos listings, price drops, removals' },
      { icon: '📊', label: 'Exportación de datos', detail: '/api/export/listings.csv · Para análisis externo' },
    ];
    stagesWrap.innerHTML = stages.map((s, i) => `
      <div class="pipeline-stage">
        <div class="pipeline-step">${i + 1}</div>
        <div class="pipeline-icon">${s.icon}</div>
        <div class="pipeline-stage-body">
          <div class="pipeline-stage-label">${esc(s.label)}</div>
          <div class="pipeline-stage-detail">${esc(s.detail)}</div>
        </div>
      </div>`).join('');
  }

  // CI Workflow
  const wfWrap = el('ci-workflow-grid');
  if (wfWrap) {
    const steps = [
      { signal: 'Precio cae vs. historial', action: 'Registrar drop en events · Aumentar leverage_score' },
      { signal: 'Ghost probability > 60%', action: 'Marcar como Verify First · No negociar precio aún' },
      { signal: 'Sin respuesta > 48h', action: 'Registrar no_response en inquiries · Bajar prioridad' },
      { signal: 'Broker contradice anuncio', action: 'Registrar unavailable · Revisión de contradicciones' },
      { signal: 'DOM > 45 días', action: 'Máxima palanca de negociación · Citar comparables' },
    ];
    wfWrap.innerHTML = steps.map(s => `
      <div class="wf-card">
        <div class="wf-signal">📌 ${esc(s.signal)}</div>
        <div class="wf-action">→ ${esc(s.action)}</div>
      </div>`).join('');
  }

  // Watchlist
  const watchWrap = el('watchlist-wrap');
  if (watchWrap) {
    const topTargets = listings
      .filter(l => l.intel?.status?.key === 'fast_move' || l.intel?.status?.key === 'negotiate')
      .slice(0, 5);
    if (!topTargets.length) {
      watchWrap.innerHTML = '<div class="no-data-notice"><p>No hay targets prioritarios en el universo actual.</p></div>';
    } else {
      watchWrap.innerHTML = `
        <table class="data-table">
          <thead><tr><th>Listing</th><th>Edificio</th><th>Precio</th><th>Estado</th><th>Value</th><th>Leverage</th><th></th></tr></thead>
          <tbody>
            ${topTargets.map(l => {
              const scores = l.intel?.scores || {};
              return `
                <tr>
                  <td>${esc(l.title)}</td>
                  <td>${esc(buildingLabel(l.building))}</td>
                  <td>${fmt(l.price)}</td>
                  <td>${statusBadge(l.intel?.status?.key)}</td>
                  <td>${scores.value_score ?? '—'}</td>
                  <td>${scores.leverage_score ?? '—'}</td>
                  <td><button class="detail-btn" data-listing-id="${esc(l.id)}" title="Ver detalle">→</button></td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>`;
      watchWrap.querySelectorAll('.detail-btn').forEach(btn => {
        btn.addEventListener('click', () => openDrawer(btn.dataset.listingId));
      });
    }
  }
}

// ── AGENTS ─────────────────────────────────────────────────────
async function loadAgents() {
  try {
    const data = await apiFetch(API.agents);
    renderAgents(data.items || []);
  } catch (e) {
    el('agents-tbody').innerHTML = '<tr><td colspan="7" class="loading-cell">Error al cargar agentes</td></tr>';
  }
}

function renderAgents(agents) {
  const tbody = el('agents-tbody');
  const emptyNotice = el('agents-empty');
  if (!tbody) return;

  if (!agents.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">—</td></tr>';
    if (emptyNotice) emptyNotice.style.display = 'block';
    return;
  }
  if (emptyNotice) emptyNotice.style.display = 'none';

  tbody.innerHTML = agents.map(a => {
    const cls = credClass(a.credibility_score);
    return `
      <tr>
        <td><strong>${esc(a.name)}</strong></td>
        <td>
          <div class="credibility-meter ${cls}">
            <span class="credibility-score">${a.credibility_score}</span>
            <div class="credibility-bar"><div class="credibility-fill" style="width:${a.credibility_score}%"></div></div>
          </div>
        </td>
        <td>${a.interactions ?? 0}</td>
        <td><span class="${a.contradictions > 0 ? 'status-badge tone-risk' : ''}">${a.contradictions ?? 0}</span></td>
        <td><span class="${a.no_response > 0 ? 'status-badge tone-bad' : ''}">${a.no_response ?? 0}</span></td>
        <td>${a.proof_rate_pct != null ? a.proof_rate_pct + '%' : '—'}</td>
        <td>${a.avg_response_hours != null ? a.avg_response_hours + 'h' : '—'}</td>
      </tr>`;
  }).join('');
}

// ── INQUIRIES ──────────────────────────────────────────────────
async function loadInquiries() {
  try {
    const data = await apiFetch(API.inquiries);
    renderInquiries(data.items || []);
    el('inquiries-count').textContent = data.total ?? '—';
    el('inquiries-total-note').textContent = `${data.total ?? 0} registros totales`;
  } catch (e) {
    el('inquiries-list').innerHTML = '<div class="loading-row">Error al cargar contactos</div>';
  }
}

function renderInquiries(items) {
  const wrap = el('inquiries-list');
  if (!wrap) return;

  if (!items.length) {
    wrap.innerHTML = '<div class="no-data-notice"><p>Aún no hay registros. Usa el formulario de arriba para loguear tu primer contacto con un broker.</p></div>';
    return;
  }

  wrap.innerHTML = items.map(inq => {
    const listing = state.feed?.listings?.find(l => l.id === inq.listing_id);
    const proofTags = [
      inq.provided_unit_number ? 'Unidad ✓' : 'Sin unidad',
      inq.provided_video ? 'Video ✓' : 'Sin video',
      inq.provided_cost_breakdown ? 'Desglose ✓' : 'Sin desglose',
    ];

    return `
      <div class="inq-row ${esc(inq.claimed_status)}">
        <div class="inq-main">
          <div class="inq-agent-line">
            <span class="inq-agent">${esc(inq.contact_name || 'Sin nombre')}</span>
            ${inq.company ? `<span class="inq-company">· ${esc(inq.company)}</span>` : ''}
            <span class="status-badge tone-${claimedTone(inq.claimed_status)}">${claimedLabel(inq.claimed_status)}</span>
          </div>
          ${listing ? `<div class="inq-listing-ref">Listing: <strong>${esc(listing.title)}</strong> · ${esc(buildingLabel(listing.building))}</div>` : (inq.listing_id ? `<div class="inq-listing-ref">Listing ID: <strong>${esc(inq.listing_id)}</strong></div>` : '')}
          <div class="inq-tags">
            ${proofTags.map((t, i) => `<span class="inq-tag ${[inq.provided_unit_number, inq.provided_video, inq.provided_cost_breakdown][i] ? 'proof' : 'no-proof'}">${esc(t)}</span>`).join('')}
            <span class="inq-tag">${esc(inq.channel || 'whatsapp')}</span>
          </div>
          ${inq.notes ? `<div class="inq-notes">${esc(inq.notes)}</div>` : ''}
        </div>
        <div class="inq-meta">
          <div class="inq-time">${fmtDate(inq.timestamp)}</div>
          ${inq.price_quoted ? `<div class="inq-price-quoted">${fmt(inq.price_quoted)}</div>` : ''}
          ${inq.response_hours != null ? `<div style="font-size:var(--text-xs);color:var(--color-text-muted)">${inq.response_hours}h resp.</div>` : ''}
          <button class="delete-inq-btn" data-inquiry-id="${esc(inq.id)}" title="Eliminar registro">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>`;
  }).join('');

  wrap.querySelectorAll('.delete-inq-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteInquiry(btn.dataset.inquiryId));
  });
}

function claimedTone(s) {
  return { available: 'mid', unavailable: 'risk', no_response: 'bad', changed_offer: 'bad' }[s] || 'neutral';
}

function claimedLabel(s) {
  return { available: 'Disponible', unavailable: 'No disponible', no_response: 'Sin respuesta', changed_offer: 'Oferta cambiada' }[s] || s;
}

async function deleteInquiry(id) {
  if (!confirm('¿Eliminar este registro de contacto?')) return;
  try {
    await apiFetch(API.inquiry(id), { method: 'DELETE' });
    await loadInquiries();
    await loadAgents();
    await loadFeed();
    await loadStatus();
  } catch (e) {
    alert('Error al eliminar: ' + e.message);
  }
}

// Inquiry form
function initInquiryForm() {
  const form = el('inquiry-form');
  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = el('inquiry-error');
    const btn = el('inq-submit');
    errEl.style.display = 'none';

    const listingId = el('inq-listing-id')?.value?.trim();
    if (!listingId) {
      errEl.textContent = 'Selecciona un listing primero.';
      errEl.style.display = 'block';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Registrando…';

    const body = {
      listing_id: listingId,
      contact_name: el('inq-contact-name')?.value?.trim() || '',
      company: el('inq-company')?.value?.trim() || '',
      channel: el('inq-channel')?.value || 'whatsapp',
      claimed_status: el('inq-claimed-status')?.value || 'available',
      response_hours: el('inq-response-hours')?.value ? parseFloat(el('inq-response-hours').value) : null,
      price_quoted: el('inq-price-quoted')?.value ? parseFloat(el('inq-price-quoted').value) : null,
      provided_unit_number: el('inq-unit-number')?.checked || false,
      provided_video: el('inq-video')?.checked || false,
      provided_cost_breakdown: el('inq-cost-breakdown')?.checked || false,
      notes: el('inq-notes')?.value?.trim() || '',
    };

    try {
      await apiFetch(API.inquiries, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      form.reset();
      await loadInquiries();
      await loadAgents();
      await loadFeed();
      await loadStatus();
      navigateTo('inquiries');
    } catch (err) {
      errEl.textContent = 'Error al registrar: ' + err.message;
      errEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Registrar contacto';
    }
  });
}

// Populate inquiry listing selector
function populateInquiryListingSelect(listings) {
  const sel = el('inq-listing-id');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">Selecciona un listing…</option>' +
    listings.map(l => `<option value="${esc(l.id)}" ${l.id === current ? 'selected' : ''}>${esc(buildingLabel(l.building))} · ${esc(l.title)}</option>`).join('');
}

// ── LISTING DETAIL DRAWER ──────────────────────────────────────
async function openDrawer(listingId) {
  const overlay = el('drawer-overlay');
  const drawer = el('detail-drawer');
  const content = el('drawer-content');

  overlay.classList.add('open');
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  content.innerHTML = '<div class="loading-row">Cargando detalle…</div>';

  // Close
  el('drawer-close').onclick = closeDrawer;
  overlay.onclick = closeDrawer;
  document.addEventListener('keydown', handleEsc, { once: true });

  try {
    const [listingData, compsData, inquiriesData] = await Promise.all([
      apiFetch(API.listing(listingId)),
      apiFetch(API.comparables(listingId)).catch(() => null),
      apiFetch(`${API.inquiries}?listing_id=${listingId}`).catch(() => null),
    ]);

    const l = listingData.item;
    renderDrawer(l, compsData, inquiriesData?.items || []);
  } catch (e) {
    content.innerHTML = `<div class="loading-row">Error al cargar: ${esc(e.message)}</div>`;
  }
}

function closeDrawer() {
  el('drawer-overlay').classList.remove('open');
  el('detail-drawer').classList.remove('open');
  el('detail-drawer').setAttribute('aria-hidden', 'true');
}

function handleEsc(e) {
  if (e.key === 'Escape') closeDrawer();
}

function renderDrawer(l, compsData, inquiries) {
  const intel = l.intel || {};
  const pricing = intel.pricing || {};
  const scores = intel.scores || {};
  const predictive = intel.predictive || {};
  const srcProfile = intel.source_profile || {};
  const peerGroup = intel.peer_group || {};
  const availability = intel.availability || {};

  el('drawer-eyebrow').textContent = `${buildingLabel(l.building)} · ${l.beds} rec. · ${l.sqm} m²`;
  el('drawer-title').textContent = l.title;

  // Build leverage panel HTML (renter-side)
  const leveragePanelHtml = window.LeverageLayer && state.listings.length
    ? window.LeverageLayer.renderDrawerLeveragePanel(l, state.listings)
    : '';

  el('drawer-content').innerHTML = `

    <!-- ═══ RENTER LEVERAGE PANEL (rendered first, most important) ═══ -->
    ${leveragePanelHtml}

    <!-- Score Breakdown v2 -->
    ${renderScoreBreakdownSection(l, scores, pricing)}

    <!-- Pricing band -->
    <div class="drawer-section">
      <div class="drawer-section-title">Banda de negociación</div>
      <div class="pricing-band">
        <div class="price-cell">
          <div class="price-cell-label">Fair Low</div>
          <div class="price-cell-value">${fmt(pricing.fair_low)}</div>
        </div>
        <div class="price-cell anchor">
          <div class="price-cell-label">Opening anchor</div>
          <div class="price-cell-value">${fmt(pricing.opening_anchor)}</div>
        </div>
        <div class="price-cell target">
          <div class="price-cell-label">Target close</div>
          <div class="price-cell-value">${fmt(pricing.target_close)}</div>
        </div>
        <div class="price-cell walkaway">
          <div class="price-cell-label">Walk away</div>
          <div class="price-cell-value">${fmt(pricing.walk_away)}</div>
        </div>
      </div>
      <div style="font-size:var(--text-xs);color:var(--color-text-muted);margin-top:8px;">
        Fair band: ${fmt(pricing.fair_low)} – ${fmt(pricing.fair_high)} ·
        Peer: ${fmtNum(peerGroup.count)} listings · Credibles: ${peerGroup.credible_count ?? '—'}
      </div>
    </div>

    <!-- Predictive -->
    <div class="drawer-section">
      <div class="drawer-section-title">Señales predictivas</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div class="price-cell">
          <div class="price-cell-label">Prob. baja precio 14d</div>
          <div class="price-cell-value" style="color:#E8AF34">${predictive.price_cut_probability_14d ?? '—'}%</div>
        </div>
        <div class="price-cell">
          <div class="price-cell-label">Prob. disponibilidad 7d</div>
          <div class="price-cell-value" style="color:#6DAA45">${predictive.availability_probability_7d ?? '—'}%</div>
        </div>
      </div>
    </div>

    <!-- Script -->
    <div class="drawer-section">
      <div class="drawer-section-title">Script de negociación — tu posición</div>
      <div class="script-box">"${esc(intel.script || '')}"</div>
    </div>

    <!-- Counterparty Playbook -->
    ${renderCpPlaybook(intel)}

    <!-- Required proof -->
    <div class="drawer-section">
      <div class="drawer-section-title">Evidencia requerida antes de negociar</div>
      <ul class="proof-list">
        ${(intel.required_proof || []).map(p => `<li class="proof-item">${esc(p)}</li>`).join('')}
      </ul>
    </div>

    <!-- Flags -->
    <div class="drawer-section">
      <div class="drawer-section-title">Señales activas</div>
      <div class="flags-list">
        ${(intel.flags || []).map(f => `<div class="flag-item ${f.includes('Sin alerta') ? 'flag-ok' : ''}">${esc(f)}</div>`).join('')}
      </div>
    </div>

    <!-- Source profile -->
    <div class="drawer-section">
      <div class="drawer-section-title">Perfil de fuente</div>
      <div style="background:var(--color-surface-alt);border-radius:var(--radius-md);padding:12px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span class="source-badge ${trustClass(srcProfile.trust || 0)}">${esc(srcProfile.label)}</span>
          <span style="font-size:var(--text-xs);color:var(--color-text-muted)">${esc(srcProfile.kind)}</span>
          <strong style="font-family:monospace;font-size:var(--text-sm);margin-left:auto">Trust: ${srcProfile.trust ?? '—'}</strong>
        </div>
        <p style="font-size:var(--text-xs);color:var(--color-text-muted);line-height:1.5">${esc(srcProfile.risk_note || '')}</p>
      </div>
    </div>

    <!-- Comparables -->
    ${compsData ? `
    <div class="drawer-section">
      <div class="drawer-section-title">Comparables — Mismo Edificio + Cross-Tower</div>
      ${compsData.items?.length ? `
        <div class="comps-list">
          ${compsData.items.map(c => {
            const delta = c.delta_to_peer_price_pct;
            const deltaStr = delta != null ? (delta > 0 ? '+' : '') + delta + '%' : '';
            return `
              <div class="comp-row">
                <span class="comp-title">${esc(c.title)}</span>
                <span class="comp-price">${fmt(c.price)}</span>
                <span class="comp-vs">${c.sqm ?? '—'}m²</span>
                <span class="comp-delta ${delta < 0 ? 'neg' : 'pos'}">${deltaStr}</span>
              </div>`;
          }).join('')}
        </div>` : '<p style="font-size:var(--text-xs);color:var(--color-text-muted)">Sin comparables disponibles en el mismo edificio y recámaras.</p>'}
      ${ window.LeverageLayer && state.listings.length ? `
        <div style="margin-top:var(--space-3);">
          ${window.LeverageLayer.renderCrossTowerSection(l, state.listings)}
        </div>` : ''}
    </div>` : `
    <div class="drawer-section">
      <div class="drawer-section-title">Comparables — Cross-Tower</div>
      ${ window.LeverageLayer && state.listings.length ? window.LeverageLayer.renderCrossTowerSection(l, state.listings) : '<p style="font-size:var(--text-xs);color:var(--color-text-muted)">Sin comparables cross-tower disponibles.</p>'}
    </div>`}

    <!-- Negotiation Timeline section -->
    <div class="drawer-section" id="drawer-timeline-section-${l.id}" style="padding-bottom:0;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-3);">
        <div class="drawer-section-title" style="margin-bottom:0;">Historial de Negociación</div>
        <button class="strip-btn" style="font-size:10px;" onclick="(function(){
          var tl = document.getElementById('timeline-panel-${l.id}');
          var btn = this;
          if (!tl) return;
          if (tl.style.display === 'none' || !tl.style.display) {
            tl.style.display = '';
            btn.textContent = 'Ocultar ▲';
            if (window.loadAndRenderTimeline) window.loadAndRenderTimeline('${l.id}');
          } else {
            tl.style.display = 'none';
            btn.textContent = 'Ver historial ▼';
          }
        }).call(this);">Ver historial ▼</button>
      </div>
      <div id="timeline-panel-${l.id}" style="display:none;">
        <div class="timeline-list" style="padding-left:24px;" id="timeline-list">
          <div class="timeline-empty">Cargando…</div>
        </div>
      </div>
    </div>

    <!-- Watch state inline -->
    ${l.watch_state ? `
    <div class="drawer-section">
      <div class="drawer-section-title">Monitoreo de fuente HTTP</div>
      ${window.renderDrawerWatchBlock ? window.renderDrawerWatchBlock(l.watch_state) : ''}
    </div>` : ''}

    <!-- Browser verification evidence (separate from HTTP collector) -->
    ${l.browser_verification ? `
    <div class="drawer-section">
      <div class="drawer-section-title">Evidencia browser-asistida</div>
      ${window.renderDrawerBvBlock ? window.renderDrawerBvBlock(l.browser_verification) : ''}
    </div>` : ''}

    <!-- Inquiry history -->
    <div class="drawer-section">
      <div class="drawer-section-title">Historial de contacto con brokers (${inquiries.length})</div>
      ${inquiries.length ? `
        <div class="inquiry-history-list">
          ${inquiries.map(inq => `
            <div class="inquiry-card ${esc(inq.claimed_status)}">
              <div class="inquiry-card-header">
                <span class="inquiry-card-agent">${esc(inq.contact_name || 'Sin nombre')}${inq.company ? ' · ' + esc(inq.company) : ''}</span>
                <span class="inquiry-card-time">${fmtDate(inq.timestamp)}</span>
              </div>
              <div><span class="status-badge tone-${claimedTone(inq.claimed_status)}">${claimedLabel(inq.claimed_status)}</span>
                ${inq.price_quoted ? `<span style="margin-left:8px;font-family:monospace;font-size:var(--text-sm);font-weight:700;color:var(--color-primary)">${fmt(inq.price_quoted)}</span>` : ''}
              </div>
              <div class="inquiry-card-meta">
                ${inq.provided_unit_number ? '<span class="inq-tag proof">Unidad ✓</span>' : '<span class="inq-tag no-proof">Sin unidad</span>'}
                ${inq.provided_video ? '<span class="inq-tag proof">Video ✓</span>' : '<span class="inq-tag no-proof">Sin video</span>'}
                ${inq.provided_cost_breakdown ? '<span class="inq-tag proof">Desglose ✓</span>' : ''}
                ${inq.response_hours != null ? `<span class="inq-tag">${inq.response_hours}h resp.</span>` : ''}
                <span class="inq-tag">${esc(inq.channel)}</span>
              </div>
              ${inq.notes ? `<div style="font-size:var(--text-xs);color:var(--color-text-muted);margin-top:6px;font-style:italic">${esc(inq.notes)}</div>` : ''}
            </div>`).join('')}
        </div>` : `
        <p style="font-size:var(--text-xs);color:var(--color-text-muted)">Sin contactos registrados para este listing.</p>
        <button class="add-inquiry-btn" onclick="
          document.getElementById('inq-listing-id').value='${l.id}';
          closeDrawer && closeDrawer(); 
          setTimeout(()=>navigateTo('inquiries'),100);">
          + Registrar contacto
        </button>`}
    </div>`;
}

// ── CHART HELPERS ──────────────────────────────────────────────
function scaleOpts() {
  return {
    grid: { color: 'rgba(255,255,255,0.06)' },
    ticks: { color: '#7a7a7a', font: { size: 11 } },
  };
}

function chartOpts({ unit = '' } = {}) {
  return {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1C1B19',
        titleColor: '#CDCCCA',
        bodyColor: '#7A7974',
        borderColor: '#393836',
        borderWidth: 1,
      }
    },
    scales: {
      x: scaleOpts(),
      y: { ...scaleOpts(), beginAtZero: false },
    }
  };
}

// ── INIT ───────────────────────────────────────────────────────
async function init() {
  initTheme();
  initSidebar();
  initCurrency();
  initFilters();
  initRefresh();
  initInquiryForm();

  await loadAll();

  // Populate inquiry listing selector after feed loaded
  if (state.feed?.listings) {
    populateInquiryListingSelect(state.feed.listings);
    // Store for tracking module
    window._feedListings = state.feed.listings;
  }

  // Initialize tracking system
  if (window.initTracking) {
    window.initTracking(state.feed?.listings || []);
  }

  // Pre-load browser verification badge count (lazy — section not yet visible)
  if (window.loadBrowserVerifications) {
    window.loadBrowserVerifications().then(items => {
      const pending = items.filter(i => i.browser_status !== 'completed').length;
      const badge = document.getElementById('bv-queued-count');
      if (badge) badge.textContent = pending > 0 ? pending : '—';
    });
  }
}

// Make closeDrawer accessible from HTML
window.closeDrawer = closeDrawer;
window.navigateTo = navigateTo;

document.addEventListener('DOMContentLoaded', init);
