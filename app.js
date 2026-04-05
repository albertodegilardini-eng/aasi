// ══════════════════════════════════════════════════════════════
//  Santa Fe CI Platform — app.js (Refactored)
//  Enhancements: caching, chart registry, search UX, DOM calc,
//  accessibility, loading states, error handling
// ══════════════════════════════════════════════════════════════

'use strict';

// ── Theme ─────────────────────────────────────────────────────
(function initTheme() {
  var toggle = document.querySelector('[data-theme-toggle]');
  var root = document.documentElement;
  var stored = localStorage.getItem('sf-ci-theme');
  var theme = stored || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  root.setAttribute('data-theme', theme);

  if (toggle) {
    renderToggleIcon(toggle, theme);
    toggle.addEventListener('click', function () {
      theme = theme === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', theme);
      localStorage.setItem('sf-ci-theme', theme);
      renderToggleIcon(toggle, theme);
      if (currentView === 'detail' && currentListing) renderDetailView(currentListing);
      if (currentView === 'compare' && activeComparison) renderComparisonChart(activeComparison);
      if (currentView === 'overview') renderMarketChart(activeMarketChart);
      if (currentView === 'dashboard') renderDashboardView();
    });
  }

  function renderToggleIcon(btn, t) {
    btn.setAttribute('aria-label', 'Cambiar a modo ' + (t === 'dark' ? 'claro' : 'oscuro'));
    btn.innerHTML = t === 'dark'
      ? '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
      : '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  }
})();

// ── State ─────────────────────────────────────────────────────
var listingsData    = [];
var buildingsData   = {};
var towerSummary    = {};
var marketSummary   = {};
var eventsData      = [];
var agentsData      = [];
var currentView     = 'overview';
var currentListing  = null;
var activeComparison = null;
var activeFilter    = 'all';
var activeOpFilter  = 'all';
var activeMarketChart = 'price_distribution';
var sortMode        = 'composite_score';
var dataSource      = 'loading'; // 'live' | 'cached' | 'demo' | 'offline'

// ── Chart Registry (keyed by canvas ID) ───────────────────────
var chartRegistry = {};

function getOrCreateChart(canvasId, config, tag) {
  if (chartRegistry[canvasId]) {
    try { chartRegistry[canvasId].destroy(); } catch (e) {}
    delete chartRegistry[canvasId];
  }
  var canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  var chart = new Chart(canvas, config);
  if (tag) chart._sfTag = tag;
  chartRegistry[canvasId] = chart;
  return chart;
}

function destroyChartsByTag(tag) {
  Object.keys(chartRegistry).forEach(function (id) {
    var c = chartRegistry[id];
    if (!tag || c._sfTag === tag) {
      try { c.destroy(); } catch (e) {}
      delete chartRegistry[id];
    }
  });
}

function destroyAllCharts() {
  Object.keys(chartRegistry).forEach(function (id) {
    try { chartRegistry[id].destroy(); } catch (e) {}
  });
  chartRegistry = {};
}

// ── Cache Layer ───────────────────────────────────────────────
var CACHE_KEY = 'sf-ci-data';
var CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function saveToCache(data) {
  try {
    var payload = { ts: Date.now(), data: data };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch (e) { /* quota exceeded or private mode */ }
}

function loadFromCache() {
  try {
    var raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    var payload = JSON.parse(raw);
    if (Date.now() - payload.ts > CACHE_TTL) return null;
    return payload.data;
  } catch (e) { return null; }
}

function clearCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
}

// ── Toast System ──────────────────────────────────────────────
function showToast(message, type) {
  var existing = document.querySelector('.toast');
  if (existing) existing.remove();
  var el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = message;
  el.setAttribute('role', 'alert');
  document.body.appendChild(el);
  setTimeout(function () { if (el.parentNode) el.remove(); }, 3500);
}

// ── Data Status Badge ─────────────────────────────────────────
function updateDataStatus(status, label) {
  dataSource = status;
  var badge = document.getElementById('dataStatusBadge');
  if (!badge) return;
  badge.className = 'data-status ' + status;
  badge.textContent = label || status;

  var footer = document.getElementById('cacheStatusFooter');
  if (footer) {
    var ts = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    footer.textContent = 'Datos: ' + (label || status) + ' · ' + ts;
  }
}

// ── API ───────────────────────────────────────────────────────
async function apiFetch(path) {
  var res = await fetch(path);
  if (!res.ok) throw new Error('API error: ' + res.status);
  return res.json();
}

// ── Days on Market Calculation ────────────────────────────────
function computeDaysOnMarket(listings) {
  var now = new Date();
  listings.forEach(function (l) {
    if (l.first_seen_at && (!l.days_on_market || l.days_on_market === 0)) {
      try {
        var first = new Date(l.first_seen_at);
        var diffMs = now - first;
        l.days_on_market = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      } catch (e) { /* keep existing value */ }
    }
  });
  return listings;
}

// ── Load Data ─────────────────────────────────────────────────
async function loadData() {
  updateDataStatus('demo', 'Cargando...');

  // 1. Try API first
  try {
    var [feedRes, agentsRes] = await Promise.all([
      apiFetch('/api/feed'),
      apiFetch('/api/agents'),
    ]);
    applyFeedData(feedRes, agentsRes.items || []);
    saveToCache({ feed: feedRes, agents: agentsRes.items || [] });
    updateDataStatus('live', 'En vivo');
    init();
    return;
  } catch (err) {
    // API not available, continue to fallbacks
  }

  // 2. Try localStorage cache
  var cached = loadFromCache();
  if (cached) {
    applyFeedData(cached.feed, cached.agents || []);
    updateDataStatus('cached', 'Cache');
    showToast('Datos desde caché local — actualiza para datos frescos', 'warning');
    init();
    return;
  }

  // 3. Try local data files
  var fallbackPaths = ['./data.json', '../data/listings.live.json', './listings.live.json'];
  for (var i = 0; i < fallbackPaths.length; i++) {
    try {
      var fallbackRes = await fetch(fallbackPaths[i]);
      if (!fallbackRes.ok) continue;
      var fallbackFeed = await fallbackRes.json();
      if (!fallbackFeed.listings || fallbackFeed.listings.length === 0) continue;
      var fallbackAgents = buildAgentsFromListings(fallbackFeed.listings || []);
      applyFeedData(fallbackFeed, fallbackAgents);
      saveToCache({ feed: fallbackFeed, agents: fallbackAgents });
      updateDataStatus('demo', 'Demo');
      showToast('Modo demo — datos estáticos de Abril 2026', 'warning');
      init();
      return;
    } catch (e) { /* try next */ }
  }

  // 4. All failed
  updateDataStatus('offline', 'Sin datos');
  document.getElementById('listingsGrid').innerHTML =
    '<div class="empty-state-card">' +
    '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>' +
    '<h3>Sin conexión a datos</h3>' +
    '<p>Verifica que el servidor esté activo (python server.py) o que data.json esté en la raíz del proyecto.</p>' +
    '</div>';
}

function applyFeedData(feedRes, agentItems) {
  listingsData  = computeDaysOnMarket(feedRes.listings || []);
  buildingsData = feedRes.buildings   || {};
  towerSummary  = feedRes.tower_summary || {};
  marketSummary = feedRes.market_summary || {};
  eventsData    = (feedRes.events     || []).slice(0, 20);
  agentsData    = agentItems          || [];

  // Recompute market summary negotiate count from actual data
  if (listingsData.length) {
    var negCount = listingsData.filter(function (l) {
      return l.intel && l.intel.status && l.intel.status.key === 'negotiate';
    }).length;
    marketSummary.negotiate_count = negCount;
  }

  var sub = document.getElementById('overviewSubtitle');
  if (sub) {
    sub.textContent = listingsData.length + ' listados · ' + Object.keys(buildingsData).length + ' edificios · Scoring algorítmico con bandas de negociación';
  }
}

function buildAgentsFromListings(listings) {
  var map = {};
  (listings || []).forEach(function (l) {
    var key = (l.agent_name || l.agent_company || 'sin-agente').toLowerCase();
    if (!map[key]) {
      map[key] = {
        name: l.agent_name || 'Agente no identificado',
        slug: key,
        credibility_score: Math.round(((l.intel || {}).scores || {}).confidence_score || 50),
        interactions: 1,
        contradictions: 0,
        listing_count: 0,
        synthetic: true
      };
    }
    map[key].listing_count += 1;
    map[key].credibility_score = Math.round((map[key].credibility_score + ((((l.intel || {}).scores || {}).confidence_score || 50))) / 2);
  });
  return Object.values(map).sort(function (a, b) {
    return (b.credibility_score || 0) - (a.credibility_score || 0);
  });
}

// ── Init ──────────────────────────────────────────────────────
function init() {
  renderPulseBar();
  renderKPIs();
  renderBuildings();
  renderEvents();
  renderOverview();
  renderMarketChart(activeMarketChart);
  setupSearch();
  setupFilters();
  setupNavigation();
  setupSortSelect();
  setupKeyboardShortcuts();
  updatePulseTime();
}

// ── Market Pulse Bar ──────────────────────────────────────────
function renderPulseBar() {
  var ms = marketSummary;
  setText('pulseListings', (ms.total_listings || listingsData.length) + ' listados');
  setText('pulseMedianPsm', '$/m²: $' + fmtNum(ms.median_price_per_sqm || 0));
  setText('pulseNegotiate', (ms.negotiate_count || 0) + ' para negociar');
  updatePulseTime();

  var btn = document.getElementById('pulseRefreshBtn');
  if (btn && !btn._sfBound) {
    btn._sfBound = true;
    btn.addEventListener('click', async function () {
      btn.style.opacity = '0.5';
      btn.style.pointerEvents = 'none';
      clearCache();
      try {
        await loadData();
        showToast('Datos actualizados', 'success');
      } catch (e) {
        showToast('Sin servidor — usando datos locales', 'warning');
      } finally {
        btn.style.opacity = '';
        btn.style.pointerEvents = '';
      }
    });
  }
}

function updatePulseTime() {
  var el = document.getElementById('pulseTime');
  if (!el) return;
  el.textContent = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}
setInterval(updatePulseTime, 60000);

// ── Keyboard Shortcuts ───────────────────────────────────────
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', function (e) {
    // Cmd+K or Ctrl+K to focus search
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      var input = document.getElementById('searchInput');
      if (input) { input.focus(); input.select(); }
    }
    // Escape to go back to overview from detail
    if (e.key === 'Escape' && currentView === 'detail') {
      showView('overview');
    }
  });
}

// ── Navigation ────────────────────────────────────────────────
function setupNavigation() {
  document.getElementById('backBtn').addEventListener('click', function () { showView('overview'); });
  document.getElementById('logoBtn').addEventListener('click', function () { showView('overview'); });

  document.querySelectorAll('[data-view]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var view = btn.getAttribute('data-view');
      if (currentView === view) { showView('overview'); return; }
      showView(view);
      if (view === 'compare')   renderCompareView();
      if (view === 'agents')    renderAgentsView();
      if (view === 'operator')  renderOperatorView();
      if (view === 'dashboard') renderDashboardView();
      if (view === 'map')       renderMapView();
    });
  });

  document.getElementById('refreshBtn').addEventListener('click', async function () {
    var btn = document.getElementById('refreshBtn');
    btn.style.opacity = '0.4';
    btn.style.pointerEvents = 'none';
    clearCache();
    try {
      showToast('Actualizando...');
      await loadData();
      showToast('Datos actualizados', 'success');
    } catch (e) {
      showToast('Error al actualizar', 'error');
    } finally {
      btn.style.opacity = '';
      btn.style.pointerEvents = '';
    }
  });

  // Market chart tabs
  document.getElementById('marketChartTabs').addEventListener('click', function (e) {
    var tab = e.target.closest('.panel-tab');
    if (!tab) return;
    document.querySelectorAll('.panel-tab').forEach(function (t) { t.classList.remove('active'); });
    tab.classList.add('active');
    activeMarketChart = tab.getAttribute('data-chart');
    renderMarketChart(activeMarketChart);
  });

  // Operator filter buttons
  document.getElementById('opFilterBar').addEventListener('click', function (e) {
    var btn = e.target.closest('.op-filter-btn');
    if (!btn) return;
    document.querySelectorAll('.op-filter-btn').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    activeOpFilter = btn.getAttribute('data-op-filter');
    renderOperatorCards();
  });
}

function showView(view) {
  destroyAllCharts();
  currentView = view;
  document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
  var viewEl = document.getElementById(view + 'View');
  if (viewEl) viewEl.classList.add('active');

  var mapSection = document.getElementById('section-map');
  if (mapSection) mapSection.classList.toggle('active', view === 'map');

  document.getElementById('backBtn').style.display = view === 'overview' ? 'none' : 'flex';

  document.querySelectorAll('[data-view]').forEach(function (btn) {
    var isActive = btn.getAttribute('data-view') === view;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-current', isActive ? 'page' : 'false');
  });

  // Re-render overview chart when returning
  if (view === 'overview') renderMarketChart(activeMarketChart);
}

// ── Sort ──────────────────────────────────────────────────────
function setupSortSelect() {
  var sel = document.getElementById('sortSelect');
  if (!sel) return;
  sel.addEventListener('change', function () {
    sortMode = sel.value;
    renderOverview();
  });
}

// ── Search (with debounce + keyboard nav) ─────────────────────
function setupSearch() {
  var input = document.getElementById('searchInput');
  var results = document.getElementById('searchResults');
  var debounceTimer = null;
  var highlightIdx = -1;
  var currentMatches = [];

  function doSearch() {
    var q = input.value.toLowerCase().trim();
    if (q.length < 1) { results.classList.remove('active'); highlightIdx = -1; return; }

    currentMatches = listingsData.filter(function (l) {
      return l.title.toLowerCase().includes(q) ||
        l.id.toLowerCase().includes(q) ||
        (l.building || '').toLowerCase().includes(q) ||
        String(l.price).includes(q) ||
        (l.agent_name || '').toLowerCase().includes(q);
    }).slice(0, 8);

    if (currentMatches.length === 0) {
      results.innerHTML = '<div class="search-shortcut-hint">Sin resultados para "' + escapeHtml(q) + '"</div>';
      results.classList.add('active');
      highlightIdx = -1;
      return;
    }

    results.innerHTML = currentMatches.map(function (l, idx) {
      var buildingColor = 'var(--building-' + (l.building || 'peninsula') + ')';
      return '<div class="search-result-item' + (idx === highlightIdx ? ' highlighted' : '') + '" data-id="' + l.id + '" data-idx="' + idx + '" role="option">' +
        '<span class="search-result-id">' + l.id + '</span>' +
        '<span class="search-result-name">' + escapeHtml(l.title) + '</span>' +
        '<span class="search-result-price" style="color:' + buildingColor + '">$' + fmtNum(l.price) + '</span>' +
        '</div>';
    }).join('') +
    '<div class="search-shortcut-hint"><kbd>&uarr;</kbd><kbd>&darr;</kbd> navegar <kbd>Enter</kbd> seleccionar <kbd>Esc</kbd> cerrar</div>';

    results.classList.add('active');
    bindSearchClicks();
  }

  function bindSearchClicks() {
    results.querySelectorAll('.search-result-item').forEach(function (item) {
      item.addEventListener('click', function () {
        selectResult(item.getAttribute('data-id'));
      });
    });
  }

  function selectResult(lid) {
    var listing = listingsData.find(function (l) { return l.id === lid; });
    if (listing) { currentListing = listing; showView('detail'); renderDetailView(listing); }
    results.classList.remove('active');
    input.value = '';
    highlightIdx = -1;
  }

  function updateHighlight() {
    results.querySelectorAll('.search-result-item').forEach(function (item, idx) {
      item.classList.toggle('highlighted', idx === highlightIdx);
    });
    // Scroll highlighted into view
    var highlighted = results.querySelector('.highlighted');
    if (highlighted) highlighted.scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('input', function () {
    clearTimeout(debounceTimer);
    highlightIdx = -1;
    debounceTimer = setTimeout(doSearch, 120);
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      results.classList.remove('active');
      input.blur();
      highlightIdx = -1;
      return;
    }
    if (!results.classList.contains('active') || currentMatches.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightIdx = Math.min(highlightIdx + 1, currentMatches.length - 1);
      updateHighlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightIdx = Math.max(highlightIdx - 1, 0);
      updateHighlight();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIdx >= 0 && highlightIdx < currentMatches.length) {
        selectResult(currentMatches[highlightIdx].id);
      }
    }
  });

  document.addEventListener('click', function (e) {
    if (!document.getElementById('searchWrapper').contains(e.target)) {
      results.classList.remove('active');
      highlightIdx = -1;
    }
  });
}

// ── Filters ───────────────────────────────────────────────────
function setupFilters() {
  document.querySelectorAll('.filter-chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      document.querySelectorAll('.filter-chip').forEach(function (c) { c.classList.remove('active'); });
      chip.classList.add('active');
      activeFilter = chip.getAttribute('data-filter');
      renderOverview();
    });
  });
}

function filterListings() {
  var f = activeFilter;
  if (f === 'all') return listingsData;
  if (f === 'peninsula' || f === 'torre300' || f === 'paradox')
    return listingsData.filter(function (l) { return l.building === f; });
  if (f === 'negotiate')
    return listingsData.filter(function (l) { return l.intel && l.intel.status && l.intel.status.key === 'negotiate'; });
  if (f === '1bed') return listingsData.filter(function (l) { return l.beds === 1; });
  if (f === '2bed') return listingsData.filter(function (l) { return l.beds === 2; });
  if (f === '3bed') return listingsData.filter(function (l) { return l.beds >= 3; });
  return listingsData;
}

function sortListings(arr) {
  return arr.slice().sort(function (a, b) {
    var sa = getScore(a, sortMode);
    var sb = getScore(b, sortMode);
    if (sortMode === 'price_asc') return sa - sb;
    return sb - sa;
  });
}

function getScore(l, mode) {
  if (mode === 'price_asc' || mode === 'price_desc') return l.price || 0;
  if (mode === 'dom') return l.days_on_market || 0;
  var scores = (l.intel || {}).scores || {};
  if (mode === 'leverage_score') return scores.leverage_score || 0;
  return scores.composite_score || scores.value_score || 0;
}

// ── KPI Cards ─────────────────────────────────────────────────
function renderKPIs() {
  var strip = document.getElementById('kpiStrip');
  var ms = marketSummary;

  var kpis = [
    { label: 'Total listados',  value: ms.total_listings || listingsData.length, modifier: '' },
    { label: 'Precio mediano',  value: '$' + fmtNum(ms.median_price || 0), modifier: 'mono' },
    { label: '$/m\u00B2 mediano', value: '$' + fmtNum(ms.median_price_per_sqm || 0), modifier: 'mono' },
    { label: 'Para negociar',   value: ms.negotiate_count || 0, modifier: 'success' },
    { label: 'Mov. r\u00E1pido', value: ms.fast_move_count || 0, modifier: '' },
    { label: 'Verificar',       value: ms.verify_first_count || 0, modifier: ms.verify_first_count > 0 ? 'warning' : '' },
  ];

  strip.innerHTML = kpis.map(function (k) {
    return '<div class="kpi-card ' + k.modifier + '">' +
      '<div class="kpi-label">' + k.label + '</div>' +
      '<div class="kpi-value">' + k.value + '</div>' +
      '</div>';
  }).join('');
}

// ── Building image map ──────────────────────────────────────
var BUILDING_IMAGES = {
  peninsula: 'img/peninsula.jpg',
  torre300:  'img/torre300.jpg',
  paradox:   'img/paradox-aerial.jpg',
};

// ── Building Cards ────────────────────────────────────────────
function renderBuildings() {
  var strip = document.getElementById('buildingsStrip');
  var html = '';

  Object.keys(buildingsData).forEach(function (key) {
    var b = buildingsData[key];
    var ts = towerSummary[key] || {};
    var best = ts.best_value_id ? listingsData.find(function (l) { return l.id === ts.best_value_id; }) : null;
    var imgSrc = BUILDING_IMAGES[key] || '';

    html += '<div class="building-card" data-building="' + key + '" role="button" tabindex="0">' +
      (imgSrc
        ? '<div class="building-card-img-wrap">' +
          '<img class="building-card-img" src="' + imgSrc + '" alt="' + escapeHtml(b.name) + '" loading="lazy" decoding="async" onerror="this.parentElement.style.display=\'none\'">' +
          '<span class="building-card-img-badge">' + escapeHtml(b.short || b.name) + '</span>' +
          '</div>'
        : '') +
      '<div class="building-card-body">' +
      '<div class="building-card-name">' + escapeHtml(b.name) + '</div>' +
      '<div class="building-card-zone">' + escapeHtml(b.zone || b.address || '') + '</div>' +
      '<div class="building-card-stats">' +
        buildingStat(ts.count || 0, 'Listados') +
        buildingStat('$' + fmtNum(ts.median_price || 0), 'Med. Precio') +
        buildingStat('$' + fmtNum(ts.median_price_per_sqm || 0), '$/m\u00B2') +
      '</div>' +
      (best
        ? '<div class="building-best-value">' +
          '<span class="building-best-label">Mejor valor: ' + escapeHtml(best.title || best.id) + '</span>' +
          '<span class="building-best-price">$' + fmtNum(best.price) + '</span>' +
          '</div>'
        : '') +
      '</div></div>';
  });

  strip.innerHTML = html;

  strip.querySelectorAll('.building-card').forEach(function (card) {
    var activate = function () {
      var key = card.getAttribute('data-building');
      document.querySelectorAll('.filter-chip').forEach(function (c) { c.classList.remove('active'); });
      var target = document.querySelector('.filter-chip[data-filter="' + key + '"]');
      if (target) target.classList.add('active');
      activeFilter = key;
      renderOverview();
    };
    card.addEventListener('click', activate);
    card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } });
  });
}

function buildingStat(value, label) {
  return '<div class="building-stat"><div class="building-stat-value">' + value + '</div><div class="building-stat-label">' + label + '</div></div>';
}

// ── Events Feed ───────────────────────────────────────────────
function renderEvents() {
  var el = document.getElementById('eventsList');
  var badge = document.getElementById('eventsCountBadge');
  if (badge) badge.textContent = eventsData.length;

  if (!eventsData.length) {
    el.innerHTML = '<p style="color:var(--color-text-faint);font-size:var(--text-xs);">Sin eventos recientes</p>';
    return;
  }

  el.innerHTML = eventsData.slice(0, 12).map(function (ev) {
    var typeClass = (ev.type || '').replace(/\s+/g, '_');
    return '<div class="event-row ' + escapeHtml(typeClass) + '">' +
      '<span class="event-time">' + escapeHtml(formatTime(ev.ts)) + '</span>' +
      '<span class="event-message">' + escapeHtml(ev.message || ev.label || '') + '</span>' +
      '</div>';
  }).join('');
}

// ── Market Distribution Chart ─────────────────────────────────
function renderMarketChart(chartType) {
  if (!listingsData.length) return;

  var style = getComputedStyle(document.documentElement);
  var mutedColor   = style.getPropertyValue('--color-text-muted').trim();
  var dividerColor = style.getPropertyValue('--color-divider').trim();

  var bColors = {
    peninsula: style.getPropertyValue('--building-peninsula').trim(),
    torre300:  style.getPropertyValue('--building-torre300').trim(),
    paradox:   style.getPropertyValue('--building-paradox').trim(),
  };

  var labels, data, backgroundColor, tickFmt, chartLabel;

  if (chartType === 'price_distribution') {
    labels = listingsData.map(function (l) { return l.id; });
    data   = listingsData.map(function (l) { return l.price_per_sqm || 0; });
    backgroundColor = listingsData.map(function (l) { return (bColors[l.building] || '#888') + 'cc'; });
    tickFmt = function(v) { return '$' + fmtNum(v); };
    chartLabel = '$/m\u00B2 por Listado';
  } else if (chartType === 'dom_distribution') {
    labels = listingsData.map(function (l) { return l.id; });
    data   = listingsData.map(function (l) { return l.days_on_market || 0; });
    backgroundColor = listingsData.map(function (l) { return (bColors[l.building] || '#888') + 'cc'; });
    tickFmt = function(v) { return v + 'd'; };
    chartLabel = 'D\u00EDas en Mercado';
  } else {
    labels = listingsData.map(function (l) { return l.id; });
    data   = listingsData.map(function (l) { return ((l.intel || {}).scores || {}).composite_score || ((l.intel || {}).scores || {}).value_score || 0; });
    backgroundColor = listingsData.map(function (l) { return (bColors[l.building] || '#888') + 'cc'; });
    tickFmt = function(v) { return v; };
    chartLabel = 'Score de Valor';
  }

  getOrCreateChart('marketDistChart', {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: backgroundColor,
        borderColor: backgroundColor.map(function(c){ return c.slice(0,7); }),
        borderWidth: 1,
        borderRadius: 3
      }]
    },
    options: barOpts(chartLabel, mutedColor, dividerColor, tickFmt, true)
  }, 'market');
}

function barOpts(label, mutedColor, dividerColor, tickFmt, rotateLabels) {
  var style = getComputedStyle(document.documentElement);
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: style.getPropertyValue('--color-surface').trim(),
        titleColor: style.getPropertyValue('--color-text').trim(),
        bodyColor:  style.getPropertyValue('--color-text').trim(),
        borderColor: dividerColor, borderWidth: 1, padding: 10,
        titleFont: { family: 'Inter', weight: '600' },
        bodyFont: { family: 'JetBrains Mono', size: 11 },
        callbacks: { label: function(ctx) { return tickFmt(ctx.parsed.y); } }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: mutedColor, font: { family: 'JetBrains Mono', size: 10 }, maxRotation: rotateLabels ? 45 : 0 },
        border: { color: dividerColor }
      },
      y: {
        grid: { color: dividerColor + '50' },
        ticks: { color: mutedColor, font: { family: 'JetBrains Mono', size: 10 }, callback: tickFmt },
        border: { display: false }
      }
    },
    animation: { duration: 500, easing: 'easeOutQuart' }
  };
}

// ── Overview / Listings Grid ──────────────────────────────────
function renderOverview() {
  var grid     = document.getElementById('listingsGrid');
  var countEl  = document.getElementById('listingsCount');
  var filtered = sortListings(filterListings());

  if (countEl) countEl.textContent = filtered.length + ' de ' + listingsData.length;

  if (!filtered.length) {
    grid.innerHTML = '<div class="empty-state-card"><h3>Sin resultados</h3><p>Prueba con otro filtro o actualiza los datos.</p></div>';
    return;
  }

  grid.innerHTML = filtered.map(function (l) {
    var intel   = l.intel || {};
    var scores  = intel.scores || {};
    var status  = intel.status || {};
    var bName   = buildingsData[l.building] ? (buildingsData[l.building].short || buildingsData[l.building].name) : l.building;
    var leverage = scores.leverage_score || 0;
    var leverageCls = leverage >= 65 ? 'high' : leverage >= 35 ? 'mid' : 'low';
    var dom = l.days_on_market || 0;
    var domLabel = dom === 0 ? 'Nuevo' : dom + 'd';

    return '<div class="listing-card" data-id="' + l.id + '" data-building="' + l.building + '" role="listitem" tabindex="0">' +
      '<div class="card-top">' +
        '<span class="card-id">' + l.id + '</span>' +
        '<div class="card-badges">' +
          '<span class="card-building-badge" data-building="' + l.building + '">' + escapeHtml(bName) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="card-title">' + escapeHtml(l.title) + '</div>' +
      '<div class="card-price-row">' +
        '<span class="card-price">$' + fmtNum(l.price) + '</span>' +
        '<span class="card-price-unit">MXN/mes</span>' +
        '<span class="card-sqm-price">$' + fmtNum(l.price_per_sqm || 0) + '/m\u00B2</span>' +
      '</div>' +
      '<div class="card-features">' +
        feat('\uD83D\uDECF', l.beds + ' rec') +
        feat('\uD83D\uDEBF', l.baths + ' ba\u00F1os') +
        feat('\uD83D\uDCD0', l.sqm + ' m\u00B2') +
        feat('\uD83C\uDD7F', l.parking + ' est') +
        (l.furnished ? feat('\uD83E\uDE91', 'Amueblado') : '') +
        feat('\uD83D\uDCC5', domLabel) +
      '</div>' +
      '<div class="card-scores">' +
        scoreBarRow('Valor',     scores.value_score     || scores.composite_score, false) +
        scoreBarRow('Confianza', scores.confidence_score, false) +
        scoreBarRow('Ghost %',   scores.ghost_probability, true) +
      '</div>' +
      '<div class="card-leverage-wrap">' +
        '<div class="leverage-meter-label-row">' +
          '<span class="leverage-meter-label">Leverage</span>' +
          '<span class="leverage-meter-score" style="color:' + leverageColor(leverage) + '">' + Math.round(leverage) + '</span>' +
        '</div>' +
        '<div class="leverage-track"><div class="leverage-fill ' + leverageCls + '" style="width:' + Math.min(100, leverage) + '%"></div></div>' +
      '</div>' +
      (status.key
        ? '<span class="card-status ' + escapeHtml(status.key) + '">' + escapeHtml(status.label || status.key) + '</span>'
        : '') +
      '</div>';
  }).join('');

  // Click and keyboard handlers for listing cards
  grid.querySelectorAll('.listing-card').forEach(function (card) {
    var handler = function () {
      var lid = card.getAttribute('data-id');
      var listing = listingsData.find(function (l) { return l.id === lid; });
      if (listing) { currentListing = listing; showView('detail'); renderDetailView(listing); }
    };
    card.addEventListener('click', handler);
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
    });
  });
}

function feat(icon, text) {
  return '<span class="card-feature">' + icon + ' ' + text + '</span>';
}

function scoreBarRow(label, value, inverse) {
  if (value === undefined || value === null) return '';
  var pct = Math.min(100, Math.max(0, value));
  var color = scoreColor(value, inverse);
  var accessLabel = value >= 70 ? 'Alta' : value >= 40 ? 'Media' : 'Baja';
  if (inverse) accessLabel = value > 50 ? 'Alto riesgo' : value > 25 ? 'Moderado' : 'Bajo riesgo';
  return '<div class="card-score-row" title="' + label + ': ' + Math.round(value) + '/100 (' + accessLabel + ')">' +
    '<span class="card-score-name">' + label + '</span>' +
    '<div class="card-score-bar-track"><div class="card-score-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
    '<span class="card-score-value" style="color:' + color + '">' + Math.round(value) + '</span>' +
    '</div>';
}

function scoreColor(value, inverse) {
  if (inverse) return value > 50 ? 'var(--color-error)' : value > 25 ? 'var(--color-warning)' : 'var(--color-success)';
  return value >= 70 ? 'var(--color-success)' : value >= 40 ? 'var(--color-warning)' : 'var(--color-error)';
}

function leverageColor(v) {
  return v >= 65 ? 'var(--color-success)' : v >= 35 ? 'var(--color-warning)' : 'var(--color-error)';
}

// ── Detail View ───────────────────────────────────────────────
function renderDetailView(listing) {
  destroyAllCharts();

  var intel       = listing.intel || {};
  var scores      = intel.scores  || {};
  var pricing     = intel.pricing || {};
  var status      = intel.status  || {};
  var battleCard  = intel.battle_card || [];
  var comparableIds = intel.comparable_ids || [];
  var script      = intel.script || {};
  var counterparty = intel.counterparty_playbook || {};

  // ── Renter Intel Header
  var leverageScore = scores.leverage_score || 0;
  var renterHeader  = document.getElementById('renterIntelHeader');
  var renterDesc    = document.getElementById('renterIntelDesc');
  var renterBadge   = document.getElementById('renterBadge');
  if (renterHeader) {
    renterHeader.style.display = 'flex';
    var bName = buildingsData[listing.building] ? buildingsData[listing.building].name : listing.building;
    var dom = listing.days_on_market || 0;
    var descText = leverageScore >= 65
      ? 'Alto leverage (' + Math.round(leverageScore) + '/100) \u2014 ' + bName + ' lleva ' + dom + ' d\u00EDas en mercado. Posici\u00F3n de negociaci\u00F3n favorable.'
      : leverageScore >= 35
        ? 'Leverage moderado (' + Math.round(leverageScore) + '/100) \u2014 Oportunidad de negociaci\u00F3n posible.'
        : 'Leverage bajo (' + Math.round(leverageScore) + '/100) \u2014 Posici\u00F3n desafiante. Considera comparables m\u00E1s competitivos.';
    if (renterDesc) renterDesc.textContent = descText;
    if (renterBadge) {
      renterBadge.textContent = leverageScore >= 65 ? 'FUERTE' : leverageScore >= 35 ? 'MODERADO' : 'D\u00C9BIL';
      var badgeBg = leverageScore >= 65 ? '--color-success' : leverageScore >= 35 ? '--color-warning' : '--color-error';
      renterBadge.style.background = 'color-mix(in srgb, var(' + badgeBg + ') 18%, transparent)';
      renterBadge.style.color = 'var(' + badgeBg + ')';
      renterBadge.style.borderColor = 'color-mix(in srgb, var(' + badgeBg + ') 30%, transparent)';
    }
  }

  // ── Header
  var header = document.getElementById('detailHeader');
  var buildingName = buildingsData[listing.building] ? buildingsData[listing.building].name : listing.building;
  header.innerHTML = '<div class="detail-company-info">' +
    '<h1>' + escapeHtml(listing.title) + '</h1>' +
    '<div class="detail-meta">' +
      metaItem('ID', listing.id) +
      metaItem('Edificio', buildingName) +
      metaItem('Precio', '$' + fmtNum(listing.price) + ' MXN') +
      metaItem('m\u00B2', listing.sqm) +
      metaItem('$/m\u00B2', '$' + fmtNum(listing.price_per_sqm || 0)) +
      metaItem('Rec\u00E1maras', listing.beds) +
      metaItem('D\u00EDas mercado', listing.days_on_market || 0) +
      (status.key ? metaItem('Status', status.label || status.key) : '') +
    '</div></div>';

  // ── Score Gauges
  var gauges = document.getElementById('detailScores');
  var gaugeData = [
    { label: 'Composite', value: scores.composite_score || scores.value_score || 0, inverse: false },
    { label: 'Valor',     value: scores.value_score || 0, inverse: false },
    { label: 'Confianza', value: scores.confidence_score || 0, inverse: false },
    { label: 'Leverage',  value: scores.leverage_score || 0, inverse: false },
    { label: 'Ghost %',   value: scores.ghost_probability || 0, inverse: true },
    { label: 'Acci\u00F3n', value: scores.action_score || 0, inverse: false },
  ];
  gauges.innerHTML = gaugeData.map(function (g) {
    var color = scoreColor(g.value, g.inverse);
    return '<div class="score-gauge">' +
      '<div class="score-gauge-value" style="color:' + color + '">' + Math.round(g.value) + '</div>' +
      '<div class="score-gauge-bar-track"><div class="score-gauge-bar-fill" style="width:' + Math.min(100, g.value) + '%;background:' + color + '"></div></div>' +
      '<div class="score-gauge-label">' + g.label + '</div></div>';
  }).join('');

  // ── Negotiation Band
  var bandEl = document.getElementById('negotiationBand');
  if (pricing.fair_low || pricing.fair_high) {
    var pMin = Math.min(pricing.opening_anchor || pricing.fair_low, pricing.fair_low) * 0.95;
    var pMax = (pricing.walk_away || pricing.fair_high) * 1.05;
    var range = pMax - pMin || 1;
    var pct = function(v) { return Math.max(0, Math.min(100, ((v - pMin) / range) * 100)) + '%'; };

    bandEl.innerHTML = '<div class="negotiation-band"><h3>Banda de Negociaci\u00F3n</h3>' +
      '<div class="band-visual">' +
        '<div class="band-track"></div>' +
        '<div class="band-zone-fair" style="left:' + pct(pricing.fair_low) + ';width:calc(' + pct(pricing.fair_high) + ' - ' + pct(pricing.fair_low) + ')"></div>' +
        priceMarker(pricing.opening_anchor, pct(pricing.opening_anchor), 'anchor', '$' + fmtNum(pricing.opening_anchor) + ' Apertura') +
        priceMarker(pricing.target_close, pct(pricing.target_close), 'target', '$' + fmtNum(pricing.target_close) + ' Target') +
        priceMarker(listing.price, pct(listing.price), 'current', '$' + fmtNum(listing.price) + ' Actual') +
        priceMarker(pricing.walk_away, pct(pricing.walk_away), 'walkaway', '$' + fmtNum(pricing.walk_away) + ' Walk-away') +
      '</div>' +
      '<div class="band-anchors">' +
        bandAnchor('$' + fmtNum(pricing.opening_anchor || 0), 'Apertura') +
        bandAnchor('$' + fmtNum(pricing.fair_low || 0), 'Fair Low') +
        bandAnchor('$' + fmtNum(pricing.target_close || 0), 'Target Close') +
        bandAnchor('$' + fmtNum(pricing.fair_high || 0), 'Fair High') +
        bandAnchor('$' + fmtNum(pricing.walk_away || 0), 'Walk-away') +
      '</div></div>';
  } else {
    bandEl.innerHTML = '';
  }

  // ── Leverage Panel
  var leveragePanel = document.getElementById('leveragePanel');
  if (leverageScore > 0) {
    leveragePanel.style.display = 'block';
    var leverageGrid = document.getElementById('leverageVisualsGrid');
    var dom = listing.days_on_market || 0;
    leverageGrid.innerHTML =
      leverageVisualCard('DOM', dom + 'd', dom > 45 ? 'Presi\u00F3n alta' : dom > 21 ? 'Creciente' : 'Normal', dom > 45 ? 'var(--color-success)' : dom > 21 ? 'var(--color-warning)' : 'var(--color-text-muted)') +
      leverageVisualCard('Ghost', Math.round(scores.ghost_probability || 0) + '%', scores.ghost_probability > 50 ? 'Riesgo alto' : 'Aceptable', scores.ghost_probability > 50 ? 'var(--color-error)' : 'var(--color-text-muted)') +
      leverageVisualCard('Leverage', Math.round(leverageScore), leverageScore >= 65 ? 'Favorable' : 'Limitado', leverageColor(leverageScore)) +
      leverageVisualCard('$/m\u00B2 vs Med.', (pricing.delta_to_peer_psqm_pct || 0).toFixed(1) + '%', 'vs peer group', 'var(--color-text)');

    var pointsSection = document.getElementById('leveragePointsSection');
    var points = buildLeveragePoints(listing, scores, pricing);
    if (points.length) {
      pointsSection.innerHTML = '<div class="lp-header">Puntos de Leverage</div>' +
        points.map(function (p) {
          return '<div class="lp-point ' + p.cls + '"><span class="lp-strength">' + p.strength + '</span><span class="lp-text">' + escapeHtml(p.text) + '</span></div>';
        }).join('');
    }
  } else {
    leveragePanel.style.display = 'none';
  }

  // ── Intel Grid
  var intelGrid = document.getElementById('intelGrid');
  var sections  = [];

  if (intel.primary_angle) {
    var angleText = Array.isArray(intel.primary_angle) ? intel.primary_angle.join(' ') : intel.primary_angle;
    sections.push(intelCardHtml('\u00C1ngulo Principal', '<p>' + escapeHtml(angleText) + '</p>'));
  }

  if (typeof script === 'string' && script.length > 0) {
    sections.push(intelCardHtml('Script de Negociaci\u00F3n', '<p style="line-height:1.7;white-space:pre-line;">' + escapeHtml(script) + '</p>'));
  } else if (script && (script.opening || script.body)) {
    sections.push(intelCardHtml('Script de Negociaci\u00F3n',
      (script.opening ? '<p style="font-weight:700;margin-bottom:var(--space-2);">' + escapeHtml(script.opening) + '</p>' : '') +
      (script.body ? '<p style="line-height:1.7;">' + escapeHtml(script.body) + '</p>' : '')
    ));
  }

  if (battleCard.length > 0) {
    var bcHtml = '<ul class="battle-card-list">' +
      battleCard.map(function (t) {
        if (typeof t === 'string') {
          var colonIdx = t.indexOf(':');
          if (colonIdx > 0) {
            return '<li class="battle-card-item"><span class="tactic-name">' + escapeHtml(t.substring(0, colonIdx).trim()) + '</span><span class="tactic-counter">' + escapeHtml(t.substring(colonIdx + 1).trim()) + '</span></li>';
          }
          return '<li class="battle-card-item"><span class="tactic-name">' + escapeHtml(t) + '</span></li>';
        }
        return '<li class="battle-card-item"><span class="tactic-name">' + escapeHtml(t.name || t.tactic || '') + '</span><span class="tactic-counter">' + escapeHtml(t.counter || t.response || '') + '</span></li>';
      }).join('') + '</ul>';
    sections.push(intelCardHtml('Battle Card \u2014 Anclas de Negociaci\u00F3n', bcHtml));
  }

  if (counterparty.primary_tactic || (counterparty.tactics && counterparty.tactics.length > 0)) {
    var cpHtml = '';
    if (counterparty.primary_tactic) {
      var pt = counterparty.primary_tactic;
      var probCls = (pt.probability || 0) > 50 ? 'high' : (pt.probability || 0) > 25 ? 'med' : 'low';
      cpHtml += '<div class="playbook-primary">' +
        '<div class="playbook-primary-header"><span class="playbook-tactic-badge primary">T\u00E1ctica principal</span><span class="playbook-probability ' + probCls + '">' + (pt.probability || 0) + '% probable</span></div>' +
        '<h4>' + escapeHtml(pt.name || '') + '</h4>' +
        '<p class="playbook-desc">' + escapeHtml(pt.description || '') + '</p>' +
        (pt.tell ? '<div class="playbook-field"><strong>Indicador:</strong> ' + escapeHtml(pt.tell) + '</div>' : '') +
        (pt.rebuttal_script ? '<div class="playbook-field"><strong>Respuesta:</strong> ' + escapeHtml(pt.rebuttal_script) + '</div>' : '') +
        (pt.say_instead ? '<div class="playbook-field say-instead"><strong>Decir en su lugar:</strong> ' + escapeHtml(pt.say_instead) + '</div>' : '') +
        (pt.do_not_say ? '<div class="playbook-field do-not-say"><strong>No decir:</strong> ' + escapeHtml(pt.do_not_say) + '</div>' : '') +
        '</div>';
    }
    if (counterparty.market_context_note) cpHtml += '<div class="playbook-context"><strong>Contexto de mercado:</strong> ' + escapeHtml(counterparty.market_context_note) + '</div>';
    if (counterparty.counter_script) cpHtml += '<div class="playbook-counter-script"><strong>Counter script:</strong> ' + escapeHtml(counterparty.counter_script) + '</div>';

    var otherTactics = (counterparty.tactics || []).filter(function (t) {
      return !counterparty.primary_tactic || t.id !== counterparty.primary_tactic.id;
    });
    if (otherTactics.length > 0) {
      cpHtml += '<details class="playbook-more"><summary>M\u00E1s t\u00E1cticas (' + otherTactics.length + ')</summary><div class="playbook-tactics-list">' +
        otherTactics.map(function (t) {
          var pCls = (t.probability || 0) > 50 ? 'high' : (t.probability || 0) > 25 ? 'med' : 'low';
          return '<div class="playbook-tactic"><div class="playbook-tactic-header"><span class="playbook-tactic-name">' + escapeHtml(t.name || '') + '</span><span class="playbook-probability ' + pCls + '">' + (t.probability || 0) + '%</span></div>' +
            '<p class="playbook-desc">' + escapeHtml(t.description || '') + '</p>' +
            (t.tell ? '<div class="playbook-field"><strong>Indicador:</strong> ' + escapeHtml(t.tell) + '</div>' : '') +
            (t.say_instead ? '<div class="playbook-field say-instead"><strong>Decir:</strong> ' + escapeHtml(t.say_instead) + '</div>' : '') +
            '</div>';
        }).join('') + '</div></details>';
    }
    sections.push(intelCardHtml('Playbook de Contraparte', cpHtml));
  } else if (counterparty.broker_profile || counterparty.predicted_moves) {
    var cpSimple = '';
    if (counterparty.broker_profile) cpSimple += '<p style="margin-bottom:var(--space-2);"><strong>Perfil:</strong> ' + escapeHtml(counterparty.broker_profile) + '</p>';
    if (counterparty.predicted_moves) cpSimple += '<p><strong>Movimientos probables:</strong> ' + escapeHtml(counterparty.predicted_moves) + '</p>';
    sections.push(intelCardHtml('Playbook de Contraparte', cpSimple));
  }

  if (comparableIds.length > 0) {
    var compHtml = comparableIds.map(function (cid) {
      var comp = listingsData.find(function (l) { return l.id === cid; });
      if (!comp) return '';
      var delta = listing.price - comp.price;
      var deltaStr = delta > 0 ? '+$' + fmtNum(delta) : '-$' + fmtNum(Math.abs(delta));
      return '<div class="comparable-row"><span>' + escapeHtml(comp.title) + '</span><span style="font-family:var(--font-mono);font-weight:700;">$' + fmtNum(comp.price) + '</span><span style="font-size:var(--text-xs);color:' + (delta > 0 ? 'var(--color-error)' : 'var(--color-success)') + ';font-family:var(--font-mono);">' + deltaStr + '</span></div>';
    }).join('');
    sections.push(intelCardHtml('Comparables', compHtml));
  }

  if (listing.history && listing.history.length > 1) {
    sections.push('<div class="intel-card"><h3>Historial de Precio</h3><div class="chart-container"><canvas id="priceHistoryChart"></canvas></div></div>');
  }

  if (intel.flags && intel.flags.length > 0) {
    var flagsHtml = intel.flags.map(function (f) {
      var text = typeof f === 'string' ? f : f.label || f.flag || JSON.stringify(f);
      return '<span style="display:inline-block;font-size:var(--text-xs);padding:3px 8px;background:var(--color-surface-alt);border-radius:var(--radius-full);margin:2px;border:1px solid var(--color-border);">' + escapeHtml(text) + '</span>';
    }).join('');
    sections.push(intelCardHtml('Flags / Verificaci\u00F3n requerida', flagsHtml));
  }

  intelGrid.innerHTML = sections.join('');

  if (listing.history && listing.history.length > 1) renderPriceHistoryChart(listing.history);
  renderInquiryForm(listing);
}

// ── Leverage Points ──────────────────────────────────────────
function buildLeveragePoints(listing, scores, pricing) {
  var points = [];
  var dom = listing.days_on_market || 0;
  if (dom > 45) points.push({ cls: 'lp-strong', strength: 'Fuerte', text: dom + ' d\u00EDas en mercado \u2014 presi\u00F3n de tiempo alta.' });
  else if (dom > 21) points.push({ cls: 'lp-moderate', strength: 'Moderado', text: dom + ' d\u00EDas en mercado \u2014 presi\u00F3n creciente.' });

  var ghost = scores.ghost_probability || 0;
  if (ghost > 60) points.push({ cls: 'lp-strong', strength: 'Fuerte', text: 'Ghost ' + Math.round(ghost) + '% \u2014 altas chances de que la unidad ya no est\u00E9 disponible.' });
  else if (ghost > 30) points.push({ cls: 'lp-moderate', strength: 'Moderado', text: 'Ghost ' + Math.round(ghost) + '% \u2014 verifica disponibilidad antes de negociar.' });

  if (pricing.fair_low && listing.price > pricing.fair_low * 1.05) {
    points.push({ cls: 'lp-strong', strength: 'Fuerte', text: 'Precio $' + fmtNum(listing.price) + ' por encima del rango justo ($' + fmtNum(pricing.fair_low) + '). Espacio de negociaci\u00F3n confirmado.' });
  }
  if (scores.value_score !== undefined && scores.value_score < 40) {
    points.push({ cls: 'lp-context', strength: 'Contexto', text: 'Score de valor bajo (' + Math.round(scores.value_score) + '/100). Argumento de reducci\u00F3n disponible.' });
  }
  return points;
}

function leverageVisualCard(title, value, sublabel, color) {
  return '<div class="drawer-visual-card"><div class="drawer-visual-card-title">' + title + '</div><div class="drawer-visual-metric" style="color:' + color + '">' + value + '</div><div class="drawer-visual-sublabel">' + sublabel + '</div></div>';
}

function priceMarker(price, left, cls, label) {
  if (!price) return '';
  return '<div class="band-price-marker" style="left:' + left + '"><div class="band-marker-line ' + cls + '"></div><div class="band-marker-label">' + label + '</div></div>';
}

// ── Price History Chart ──────────────────────────────────────
function renderPriceHistoryChart(history) {
  var style = getComputedStyle(document.documentElement);
  var chartColor = style.getPropertyValue('--chart-1').trim();
  var mutedColor = style.getPropertyValue('--color-text-muted').trim();
  var divColor   = style.getPropertyValue('--color-divider').trim();
  var surfColor  = style.getPropertyValue('--color-surface').trim();
  var textColor  = style.getPropertyValue('--color-text').trim();

  getOrCreateChart('priceHistoryChart', {
    type: 'line',
    data: {
      labels: history.map(function (h) { return h.date; }),
      datasets: [{
        label: 'Precio', data: history.map(function (h) { return h.price; }),
        borderColor: chartColor, backgroundColor: chartColor + '18', borderWidth: 2.5, fill: true, tension: 0.35,
        pointRadius: 4, pointHoverRadius: 7, pointBackgroundColor: chartColor, pointBorderColor: surfColor, pointBorderWidth: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: surfColor, titleColor: textColor, bodyColor: textColor, borderColor: divColor, borderWidth: 1, padding: 12, titleFont: { family: 'Inter', weight: '600' }, bodyFont: { family: 'JetBrains Mono' }, callbacks: { label: function (ctx) { return '$' + fmtNum(ctx.parsed.y); } } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: mutedColor, font: { family: 'JetBrains Mono', size: 10 } }, border: { color: divColor } },
        y: { grid: { color: divColor + '55' }, ticks: { color: mutedColor, font: { family: 'JetBrains Mono', size: 10 }, callback: function (v) { return '$' + fmtNum(v); } }, border: { display: false }, beginAtZero: false }
      },
      animation: { duration: 700, easing: 'easeOutQuart' }
    }
  }, 'detail');
}

// ── Inquiry Form ──────────────────────────────────────────────
function renderInquiryForm(listing) {
  var section = document.getElementById('inquirySection');
  section.innerHTML = '<div class="inquiry-form"><h3>Registrar Contacto con Agente</h3>' +
    '<div class="form-grid">' +
      formGroup('contact_name', 'Nombre del contacto', 'text') +
      formGroup('company', 'Empresa / Broker', 'text') +
      formSelect('channel', 'Canal', [{ v: 'whatsapp', l: 'WhatsApp' }, { v: 'phone', l: 'Tel\u00E9fono' }, { v: 'email', l: 'Email' }, { v: 'portal', l: 'Portal' }]) +
      formSelect('claimed_status', 'Status reportado', [{ v: 'available', l: 'Disponible' }, { v: 'unavailable', l: 'No disponible' }, { v: 'no_response', l: 'Sin respuesta' }, { v: 'changed_offer', l: 'Cambio de oferta' }]) +
      formGroup('response_hours', 'Tiempo respuesta (hrs)', 'number') +
      formGroup('price_quoted', 'Precio cotizado', 'number') +
    '</div>' +
    '<div style="display:flex;gap:var(--space-4);margin-top:var(--space-3);flex-wrap:wrap;">' +
      formCheckbox('provided_unit_number', 'Proporcion\u00F3 n\u00FAmero de unidad') +
      formCheckbox('provided_video', 'Proporcion\u00F3 video') +
      formCheckbox('provided_cost_breakdown', 'Proporcion\u00F3 desglose') +
    '</div>' +
    '<div class="form-grid" style="margin-top:var(--space-3);"><div class="form-group" style="grid-column:1/-1;"><label for="inq_notes">Notas</label><textarea id="inq_notes" rows="2" placeholder="Observaciones\u2026"></textarea></div></div>' +
    '<div class="form-actions"><button class="btn-primary" id="submitInquiry">Registrar contacto</button><button class="btn-secondary" id="clearInquiry">Limpiar</button></div></div>';

  document.getElementById('submitInquiry').addEventListener('click', async function () {
    var data = {
      listing_id: listing.id, contact_name: valEl('inq_contact_name'), company: valEl('inq_company'),
      channel: valEl('inq_channel'), claimed_status: valEl('inq_claimed_status'),
      response_hours: parseFloat(valEl('inq_response_hours')) || null, price_quoted: parseFloat(valEl('inq_price_quoted')) || null,
      provided_unit_number: checkEl('inq_provided_unit_number'), provided_video: checkEl('inq_provided_video'),
      provided_cost_breakdown: checkEl('inq_provided_cost_breakdown'), notes: valEl('inq_notes'),
    };
    try {
      var res = await fetch('/api/inquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      var json = await res.json();
      if (json.ok) { showToast('Contacto registrado', 'success'); ['contact_name','company','response_hours','price_quoted','notes'].forEach(function (f) { var el = document.getElementById('inq_' + f); if (el) el.value = ''; }); }
      else showToast('Error: ' + (json.error || 'desconocido'), 'error');
    } catch (e) { showToast('Sin servidor \u2014 contacto no enviado. Registra manualmente.', 'warning'); }
  });

  document.getElementById('clearInquiry').addEventListener('click', function () {
    section.querySelectorAll('input, textarea, select').forEach(function (el) { if (el.type === 'checkbox') el.checked = false; else el.value = el.tagName === 'SELECT' ? el.options[0].value : ''; });
  });
}

function formGroup(id, label, type) { return '<div class="form-group"><label for="inq_' + id + '">' + label + '</label><input id="inq_' + id + '" type="' + type + '"></div>'; }
function formSelect(id, label, options) { return '<div class="form-group"><label for="inq_' + id + '">' + label + '</label><select id="inq_' + id + '">' + options.map(function (o) { return '<option value="' + o.v + '">' + o.l + '</option>'; }).join('') + '</select></div>'; }
function formCheckbox(id, label) { return '<div class="form-checkbox"><input type="checkbox" id="inq_' + id + '"><label for="inq_' + id + '">' + label + '</label></div>'; }
function valEl(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
function checkEl(id) { var el = document.getElementById(id); return el ? el.checked : false; }

// ── Operator View ─────────────────────────────────────────────
function renderOperatorView() {
  var ms = marketSummary;
  var strip = document.getElementById('opSummaryStrip');
  if (strip) {
    var neg  = ms.negotiate_count || listingsData.filter(function(l){return (((l.intel||{}).status||{}).key)==='negotiate';}).length;
    var fast = ms.fast_move_count || listingsData.filter(function(l){return (((l.intel||{}).status||{}).key)==='fast_move';}).length;
    var ver  = ms.verify_first_count || listingsData.filter(function(l){return (((l.intel||{}).status||{}).key)==='verify';}).length;
    var mon  = listingsData.filter(function(l){return (((l.intel||{}).status||{}).key)==='monitor';}).length;
    strip.innerHTML =
      '<div class="op-chip color-strong"><span class="op-chip-val">' + neg + '</span> Negociar</div>' +
      '<div class="op-chip color-urgent"><span class="op-chip-val">' + fast + '</span> Mov. r\u00E1pido</div>' +
      '<div class="op-chip color-caution"><span class="op-chip-val">' + ver + '</span> Verificar</div>' +
      '<div class="op-chip color-neutral"><span class="op-chip-val">' + mon + '</span> Monitorear</div>';
  }

  var bvCallout = document.getElementById('opBvCallout');
  var bestValue = listingsData.slice().sort(function (a, b) {
    return (((b.intel||{}).scores||{}).composite_score||0) - (((a.intel||{}).scores||{}).composite_score||0);
  })[0];
  if (bestValue && bvCallout) {
    bvCallout.style.display = 'flex';
    setText('opBvId', bestValue.id);
    setText('opBvPrice', '$' + fmtNum(bestValue.price) + ' MXN');
  }

  renderOperatorCards();
}

function renderOperatorCards() {
  var container = document.getElementById('operatorCards');
  var filtered = activeOpFilter === 'all' ? listingsData : listingsData.filter(function (l) { return (((l.intel||{}).status||{}).key) === activeOpFilter; });

  if (!filtered.length) {
    container.innerHTML = '<div class="op-empty"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg><p>No hay acciones para este filtro.</p></div>';
    return;
  }

  var groups = {};
  var ORDER = ['negotiate', 'fast_move', 'verify', 'monitor', 'avoid', ''];
  filtered.forEach(function (l) { var key = (((l.intel||{}).status||{}).key) || ''; if (!groups[key]) groups[key] = []; groups[key].push(l); });

  var groupLabels = { negotiate: 'Negociar ahora', fast_move: 'Movimiento r\u00E1pido', verify: 'Verificar primero', monitor: 'Monitorear', avoid: 'Evitar', '': 'Sin categor\u00EDa' };
  var colorMap = { negotiate: 'color-strong', fast_move: 'color-urgent', verify: 'color-caution', monitor: 'color-neutral', avoid: 'color-neutral', '': 'color-neutral' };

  var html = '';
  ORDER.forEach(function (key) {
    if (!groups[key] || !groups[key].length) return;
    html += '<div class="op-group"><div class="op-group-label ' + colorMap[key] + '">' + groupLabels[key] + '<span class="op-group-count">' + groups[key].length + ' listados</span></div>';
    groups[key].forEach(function (l, idx) { html += renderOpCard(l, colorMap[key], idx); });
    html += '</div>';
  });

  container.innerHTML = html;
  container.querySelectorAll('.op-card').forEach(function (card) {
    var handler = function () {
      var lid = card.getAttribute('data-id');
      var listing = listingsData.find(function (l) { return l.id === lid; });
      if (listing) { currentListing = listing; showView('detail'); renderDetailView(listing); }
    };
    card.addEventListener('click', handler);
    card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); } });
  });
}

function renderOpCard(l, colorCls, idx) {
  var scores = (l.intel||{}).scores||{};
  var status = (l.intel||{}).status||{};
  var actionScore = Math.round(scores.action_score || scores.composite_score || 0);
  var leverage = Math.round(scores.leverage_score || 0);
  var bName = buildingsData[l.building] ? (buildingsData[l.building].short || buildingsData[l.building].name) : l.building;

  return '<div class="op-card ' + colorCls + '" data-id="' + l.id + '" tabindex="0">' +
    '<div class="op-rank ' + colorCls + '">' + (idx + 1) + '</div>' +
    '<div class="op-card-body">' +
      '<div class="op-card-title">' + escapeHtml(l.title) + '</div>' +
      '<div class="op-card-reason">' + escapeHtml(bName) + ' \u00B7 ' + (l.beds||'?') + ' rec \u00B7 ' + (l.days_on_market||0) + 'd \u00B7 $' + fmtNum(l.price_per_sqm||0) + '/m\u00B2</div>' +
      '<div class="op-card-signals">' +
        (scores.leverage_score !== undefined ? '<span class="op-signal-pill">Leverage ' + leverage + '</span>' : '') +
        (scores.ghost_probability > 40 ? '<span class="op-signal-pill" style="background:var(--color-warning-bg);color:var(--color-warning);border-color:var(--color-warning-border);">Ghost ' + Math.round(scores.ghost_probability) + '%</span>' : '') +
        (l.furnished ? '<span class="op-signal-pill">Amueblado</span>' : '') +
      '</div>' +
      '<div class="op-score-bar-wrap"><div class="op-score-bar-track"><div class="op-score-bar-fill" style="width:' + Math.min(100, actionScore) + '%;background:' + scoreColor(actionScore, false) + '"></div></div><span class="op-score-label">' + actionScore + '/100</span></div>' +
    '</div>' +
    '<div class="op-card-meta"><div class="op-price">$' + fmtNum(l.price) + '</div><div class="op-action-badge ' + colorCls + '">' + escapeHtml(status.label || status.key || 'Monitor') + '</div></div>' +
  '</div>';
}

// ── Compare View ──────────────────────────────────────────────
function renderCompareView() {
  var sidebar = document.getElementById('compareSidebar');
  var crossSection = document.getElementById('crossTowerSection');
  var categories = [
    { id: 'price_per_sqm', label: 'Precio por m\u00B2', metric: 'price_per_sqm' },
    { id: 'price', label: 'Precio de Renta', metric: 'price' },
    { id: 'composite_score', label: 'Score Composite', metric: 'composite_score' },
    { id: 'value_score', label: 'Score de Valor', metric: 'value_score' },
    { id: 'ghost_probability', label: 'Ghost %', metric: 'ghost_probability' },
    { id: 'leverage_score', label: 'Score de Leverage', metric: 'leverage_score' },
    { id: 'days_on_market', label: 'D\u00EDas en Mercado', metric: 'days_on_market' },
  ];

  sidebar.innerHTML = categories.map(function (c) {
    return '<button class="compare-category" data-group="' + c.id + '">' + escapeHtml(c.label) + '<span class="compare-category-count">' + listingsData.length + '</span></button>';
  }).join('');

  sidebar.querySelectorAll('.compare-category').forEach(function (btn) {
    btn.addEventListener('click', function () {
      sidebar.querySelectorAll('.compare-category').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var group = categories.find(function (c) { return c.id === btn.getAttribute('data-group'); });
      if (group) { activeComparison = group; renderComparisonChart(group); if (crossSection) { crossSection.style.display = 'block'; renderCrossTower(group); } }
    });
  });
}

function renderCrossTower(group) {
  var grid = document.getElementById('crossTowerGrid');
  if (!grid) return;
  var style = getComputedStyle(document.documentElement);
  grid.innerHTML = Object.keys(buildingsData).map(function (key) {
    var bListings = listingsData.filter(function (l) { return l.building === key; });
    var vals = bListings.map(function (l) { return getCompValue(l, group); }).filter(function (v) { return v > 0; });
    var median = vals.length ? vals.sort(function (a, b) { return a - b; })[Math.floor(vals.length / 2)] : 0;
    var bName = buildingsData[key] ? (buildingsData[key].short || buildingsData[key].name) : key;
    var bColor = style.getPropertyValue('--building-' + key).trim();
    return '<div class="ct-stat" style="border-top:2px solid ' + bColor + '"><div class="ct-stat-val">' + fmtCompValue(median, group) + '</div><div class="ct-stat-label">' + escapeHtml(group.label) + '</div><div class="ct-stat-building">' + escapeHtml(bName) + '</div></div>';
  }).join('');
}

function renderComparisonChart(group) {
  var main = document.getElementById('compareMain');
  var style = getComputedStyle(document.documentElement);
  var textColor = style.getPropertyValue('--color-text').trim();
  var mutedColor = style.getPropertyValue('--color-text-muted').trim();
  var divColor = style.getPropertyValue('--color-divider').trim();
  var surfColor = style.getPropertyValue('--color-surface').trim();
  var bColors = { peninsula: style.getPropertyValue('--building-peninsula').trim(), torre300: style.getPropertyValue('--building-torre300').trim(), paradox: style.getPropertyValue('--building-paradox').trim() };

  var sorted = listingsData.slice().sort(function (a, b) { return getCompValue(b, group) - getCompValue(a, group); });
  var labels = sorted.map(function (l) { return l.id + ' (' + (l.beds||'?') + 'R)'; });
  var data = sorted.map(function (l) { return getCompValue(l, group); });
  var colors = sorted.map(function (l) { return (bColors[l.building] || '#888') + 'cc'; });

  main.innerHTML = '<div class="compare-chart-title">' + escapeHtml(group.label) + '</div><div class="compare-chart-subtitle">Todos los listados por edificio \u00B7 ' + sorted.length + ' unidades</div><div class="compare-chart-wrapper"><canvas id="compareChart"></canvas></div>';

  getOrCreateChart('compareChart', {
    type: 'bar',
    data: { labels: labels, datasets: [{ label: group.label, data: data, backgroundColor: colors, borderColor: colors.map(function (c) { return c.slice(0,7); }), borderWidth: 1.5, borderRadius: 3, barPercentage: 0.75 }] },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: { legend: { display: false }, tooltip: { backgroundColor: surfColor, titleColor: textColor, bodyColor: textColor, borderColor: divColor, borderWidth: 1, padding: 12, titleFont: { family: 'Inter', weight: '600' }, bodyFont: { family: 'JetBrains Mono', size: 11 }, callbacks: { label: function (ctx) { return fmtCompValue(ctx.parsed.x, group); } } } },
      scales: {
        x: { grid: { color: divColor + '40' }, ticks: { color: mutedColor, font: { family: 'JetBrains Mono', size: 10 }, callback: function (v) { return fmtCompValue(v, group); } }, border: { display: false } },
        y: { grid: { display: false }, ticks: { color: textColor, font: { family: 'Inter', size: 10 } }, border: { color: divColor } },
      },
      animation: { duration: 600, easing: 'easeOutQuart' },
    }
  }, 'compare');
}

function getCompValue(l, group) {
  if (group.metric === 'price_per_sqm') return l.price_per_sqm || 0;
  if (group.metric === 'price') return l.price || 0;
  if (group.metric === 'days_on_market') return l.days_on_market || 0;
  if (l.intel && l.intel.scores) return l.intel.scores[group.metric] || 0;
  return 0;
}

function fmtCompValue(v, group) {
  if (group.metric === 'price_per_sqm' || group.metric === 'price') return '$' + fmtNum(v);
  if (group.metric === 'days_on_market') return v + 'd';
  return Math.round(v);
}

// ── Agents / Scorecards View ──────────────────────────────────
function renderAgentsView() {
  var grid = document.getElementById('scorecardsGrid');
  var wrap = document.getElementById('agentsTableWrap');

  if (!agentsData.length) {
    if (grid) grid.innerHTML = '';
    if (wrap) wrap.innerHTML = '<p style="padding:var(--space-6);color:var(--color-text-faint);">Sin datos de agentes a\u00FAn. Registra contactos para generar el directorio.</p>';
    return;
  }

  if (grid) {
    grid.innerHTML = agentsData.map(function (a) {
      var score = Math.round(a.credibility_score || 0);
      var riskCls = score >= 70 ? 'risk-low' : score >= 40 ? 'risk-medium' : 'risk-high';
      var riskLabel = score >= 70 ? 'Confiable' : score >= 40 ? 'Moderado' : 'Riesgo alto';
      return '<div class="scorecard-card ' + riskCls + '">' +
        '<div class="scorecard-header"><div class="scorecard-name">' + escapeHtml(a.name || a.slug || '') + '</div>' +
        (a.synthetic ? '<span class="synthetic-badge">Estimado</span>' : '') +
        '<div class="scorecard-risk-label">' + riskLabel + '</div></div>' +
        '<div class="scorecard-score-row"><div class="scorecard-score-val">' + score + '</div>' +
        '<div class="scorecard-score-bar-wrap"><div class="scorecard-score-bar-label">Credibilidad / 100</div><div class="scorecard-score-bar"><div class="scorecard-score-fill" style="width:' + score + '%"></div></div></div></div>' +
        '<div class="scorecard-stats">' + scorecardStat('Interacciones', a.interactions || 0) + scorecardStat('Contradicciones', a.contradictions || 0) + scorecardStat('Listados', a.listing_count || 0) + scorecardStat('Confianza', score + '/100') + '</div></div>';
    }).join('');
  }

  if (wrap) {
    var html = '<table class="agents-table"><thead><tr><th>Agente</th><th>Credibilidad</th><th>Interacciones</th><th>Contradicciones</th><th>Listados</th><th>Fuente</th></tr></thead><tbody>';
    agentsData.forEach(function (a) {
      var credColor = a.credibility_score >= 70 ? 'var(--color-success)' : a.credibility_score >= 40 ? 'var(--color-warning)' : 'var(--color-error)';
      html += '<tr><td><strong>' + escapeHtml(a.name || a.slug || '') + '</strong></td><td><span class="credibility-badge" style="color:' + credColor + '">' + Math.round(a.credibility_score || 0) + '</span></td><td>' + (a.interactions || 0) + '</td><td>' + (a.contradictions || 0) + '</td><td>' + (a.listing_count || 0) + '</td><td>' + (a.synthetic ? '<span class="synthetic-badge">Estimado</span>' : 'Verificado') + '</td></tr>';
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
  }
}

function scorecardStat(label, value) {
  return '<div class="scorecard-stat-item"><div class="scorecard-stat-label">' + label + '</div><div class="scorecard-stat-val">' + value + '</div></div>';
}

// ── Dashboard View ──────────────────────────────────────────────
function formatCompact(val) {
  if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
  if (val >= 1000) { var kVal = val / 1000; return (kVal >= 10 ? kVal.toFixed(0) : kVal.toFixed(1)) + 'K'; }
  if (val >= 100) return val.toFixed(0);
  if (val >= 1) return val.toFixed(1);
  return val.toFixed(2);
}

function renderDashboardView() {
  if (!listingsData.length) return;
  var style = getComputedStyle(document.documentElement);
  var chart1 = style.getPropertyValue('--chart-1').trim();
  var chart4 = style.getPropertyValue('--chart-4').trim();
  var chart5 = style.getPropertyValue('--chart-5').trim();
  var textColor = style.getPropertyValue('--color-text').trim();
  var mutedColor = style.getPropertyValue('--color-text-muted').trim();
  var divColor = style.getPropertyValue('--color-divider').trim();
  var surfColor = style.getPropertyValue('--color-surface').trim();
  var bColors = { peninsula: style.getPropertyValue('--building-peninsula').trim(), torre300: style.getPropertyValue('--building-torre300').trim(), paradox: style.getPropertyValue('--building-paradox').trim() };

  // KPIs
  var kpiRow = document.getElementById('dashKpiRow');
  if (kpiRow) {
    var negCount = marketSummary.negotiate_count || 0;
    var avgLev = Math.round(listingsData.reduce(function (s, l) { return s + (((l.intel||{}).scores||{}).leverage_score||0); }, 0) / listingsData.length);
    var avgDom = Math.round(listingsData.reduce(function (s, l) { return s + (l.days_on_market||0); }, 0) / listingsData.length);
    var ghostHigh = listingsData.filter(function (l) { return ((l.intel||{}).scores||{}).ghost_probability > 50; }).length;
    var towers = Object.keys(buildingsData).length;

    var kpis = [
      { label: 'Total listados', value: listingsData.length, cls: '', accent: chart1 },
      { label: 'Precio mediano', value: '$' + fmtNum(marketSummary.median_price || 0), cls: '', accent: style.getPropertyValue('--chart-2').trim() },
      { label: '$/m\u00B2 mediano', value: '$' + fmtNum(marketSummary.median_price_per_sqm || 0), cls: '', accent: style.getPropertyValue('--chart-3').trim() },
      { label: 'Para negociar', value: negCount, cls: negCount > 0 ? 'success' : '', accent: style.getPropertyValue('--color-success').trim() },
      { label: 'Leverage promedio', value: avgLev, cls: avgLev >= 55 ? 'success' : avgLev >= 35 ? 'warning' : '', accent: chart4 },
      { label: 'DOM promedio', value: avgDom + 'd', cls: '', accent: chart5 },
      { label: 'Ghost > 50%', value: ghostHigh, cls: ghostHigh > 0 ? 'warning' : '', accent: style.getPropertyValue('--color-warning').trim() },
      { label: 'Torres', value: towers, cls: '', accent: chart1 },
    ];
    kpiRow.innerHTML = kpis.map(function (k) {
      return '<div class="dash-kpi-card accent-always" style="--dash-accent:' + k.accent + ';"><div class="dash-kpi-label">' + k.label + '</div><div class="dash-kpi-value' + (k.cls ? ' ' + k.cls : '') + '">' + k.value + '</div></div>';
    }).join('');
  }

  // Building metrics
  var bMetrics = document.getElementById('dashBuildingMetrics');
  if (bMetrics) {
    bMetrics.innerHTML = Object.keys(buildingsData).map(function (key) {
      var b = buildingsData[key]; var ts = towerSummary[key] || {};
      var bListings = listingsData.filter(function (l) { return l.building === key; });
      var avgScore = bListings.length ? Math.round(bListings.reduce(function (s, l) { return s + (((l.intel||{}).scores||{}).composite_score||0); }, 0) / bListings.length) : 0;
      var avgLeverage = bListings.length ? Math.round(bListings.reduce(function (s, l) { return s + (((l.intel||{}).scores||{}).leverage_score||0); }, 0) / bListings.length) : 0;
      var color = bColors[key] || chart1;
      return '<div class="dash-building-card" style="--dash-building-color:' + color + '"><div class="dash-building-name">' + escapeHtml(b.name || key) + '</div><div class="dash-building-stats">' +
        dashBStat('Listados', ts.count || bListings.length) + dashBStat('Precio mediano', '$' + fmtNum(ts.median_price || 0)) + dashBStat('$/m\u00B2 mediano', '$' + fmtNum(ts.median_price_per_sqm || 0)) + dashBStat('Score composite', avgScore + '/100') + dashBStat('Leverage prom.', avgLeverage + '/100') +
        '</div></div>';
    }).join('');
  }

  var commonTooltip = { backgroundColor: surfColor, titleColor: textColor, bodyColor: textColor, borderColor: divColor, borderWidth: 1, padding: 10, titleFont: { family: 'Inter', weight: '600' }, bodyFont: { family: 'JetBrains Mono', size: 11 } };

  // Chart 1: Composite Score
  var sortedByScore = listingsData.slice().sort(function (a, b) { return (((b.intel||{}).scores||{}).composite_score||0) - (((a.intel||{}).scores||{}).composite_score||0); });
  getOrCreateChart('dashCompositeChart', {
    type: 'bar',
    data: { labels: sortedByScore.map(function (l) { return l.id; }), datasets: [{ data: sortedByScore.map(function (l) { return ((l.intel||{}).scores||{}).composite_score||0; }), backgroundColor: sortedByScore.map(function (l) { return (bColors[l.building]||chart1) + 'cc'; }), borderColor: sortedByScore.map(function (l) { return bColors[l.building]||chart1; }), borderWidth: 1.5, borderRadius: 3, barPercentage: 0.75 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: Object.assign({}, commonTooltip, { callbacks: { label: function (ctx) { return 'Score: ' + ctx.parsed.y; } } }) }, scales: { x: { grid: { display: false }, ticks: { color: mutedColor, font: { family: 'JetBrains Mono', size: 9 }, maxRotation: 45 }, border: { color: divColor } }, y: { grid: { color: divColor + '50' }, ticks: { color: mutedColor, font: { family: 'JetBrains Mono', size: 10 } }, border: { display: false }, min: 0, max: 100 } }, animation: { duration: 700, easing: 'easeOutQuart' } }
  }, 'dashboard');

  // Chart 2: Leverage vs DOM scatter
  var scatterDatasets = Object.keys(bColors).map(function (key) {
    var color = bColors[key] || chart1;
    var bName = buildingsData[key] ? (buildingsData[key].short || buildingsData[key].name) : key;
    return { label: bName, data: listingsData.filter(function (l) { return l.building === key; }).map(function (l) { return { x: l.days_on_market||0, y: ((l.intel||{}).scores||{}).leverage_score||0 }; }), backgroundColor: color + 'bb', borderColor: color, borderWidth: 1.5, pointRadius: 6, pointHoverRadius: 9 };
  });
  getOrCreateChart('dashLeverageChart', {
    type: 'scatter', data: { datasets: scatterDatasets },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: textColor, padding: 12, usePointStyle: true, pointStyle: 'circle', font: { family: 'Inter', size: 11 } } }, tooltip: Object.assign({}, commonTooltip, { callbacks: { label: function (ctx) { return ctx.dataset.label + ': DOM=' + ctx.parsed.x + 'd, Leverage=' + ctx.parsed.y; } } }) }, scales: { x: { title: { display: true, text: 'D\u00EDas en Mercado', color: mutedColor, font: { family: 'Inter', size: 10 } }, grid: { color: divColor + '40' }, ticks: { color: mutedColor, font: { family: 'JetBrains Mono', size: 10 } }, border: { color: divColor } }, y: { title: { display: true, text: 'Leverage Score', color: mutedColor, font: { family: 'Inter', size: 10 } }, grid: { color: divColor + '40' }, ticks: { color: mutedColor, font: { family: 'JetBrains Mono', size: 10 } }, border: { display: false }, min: 0, max: 100 } }, animation: { duration: 700, easing: 'easeOutQuart' } }
  }, 'dashboard');

  // Chart 3: PSM by building
  var towerKeys = Object.keys(buildingsData);
  var psmDatasets = towerKeys.map(function (key) {
    var color = bColors[key] || chart1;
    var bName = buildingsData[key] ? (buildingsData[key].short || buildingsData[key].name) : key;
    return { label: bName, data: listingsData.filter(function (l) { return l.building === key; }).map(function (l) { return l.price_per_sqm || 0; }), backgroundColor: color + 'bb', borderColor: color, borderWidth: 1.5, borderRadius: 3, barPercentage: 0.7 };
  });
  var maxCount = towerKeys.reduce(function (m, k) { return Math.max(m, listingsData.filter(function (l) { return l.building === k; }).length); }, 0);
  var psmLabels = Array.from({ length: maxCount }, function (_, i) { return 'L' + (i + 1); });
  getOrCreateChart('dashPsmChart', {
    type: 'bar', data: { labels: psmLabels, datasets: psmDatasets },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: textColor, padding: 12, usePointStyle: true, pointStyle: 'circle', font: { family: 'Inter', size: 11 } } }, tooltip: Object.assign({}, commonTooltip, { callbacks: { label: function (ctx) { return ctx.dataset.label + ': $' + fmtNum(ctx.parsed.y) + '/m\u00B2'; } } }) }, scales: { x: { grid: { display: false }, ticks: { color: mutedColor, font: { family: 'JetBrains Mono', size: 10 } }, border: { color: divColor } }, y: { grid: { color: divColor + '50' }, ticks: { color: mutedColor, font: { family: 'JetBrains Mono', size: 10 }, callback: function (v) { return '$' + formatCompact(v); } }, border: { display: false }, beginAtZero: true } }, animation: { duration: 700, easing: 'easeOutQuart' } }
  }, 'dashboard');

  // Chart 4: Ghost probability
  var ghostSorted = listingsData.slice().sort(function (a, b) { return (((b.intel||{}).scores||{}).ghost_probability||0) - (((a.intel||{}).scores||{}).ghost_probability||0); }).slice(0, 20);
  var ghostValues = ghostSorted.map(function (l) { return ((l.intel||{}).scores||{}).ghost_probability||0; });
  var ghostColors = ghostSorted.map(function (l) {
    var g = ((l.intel||{}).scores||{}).ghost_probability||0;
    return g > 60 ? style.getPropertyValue('--color-error').trim() + 'cc' : g > 35 ? style.getPropertyValue('--color-warning').trim() + 'cc' : (bColors[l.building]||chart1) + 'cc';
  });
  getOrCreateChart('dashGhostChart', {
    type: 'bar', data: { labels: ghostSorted.map(function (l) { return l.id; }), datasets: [{ data: ghostValues, backgroundColor: ghostColors, borderColor: ghostColors.map(function (c) { return c.slice(0,7); }), borderWidth: 1.5, borderRadius: 3, barPercentage: 0.7 }] },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false }, tooltip: Object.assign({}, commonTooltip, { callbacks: { label: function (ctx) { return 'Ghost: ' + ctx.parsed.x.toFixed(1) + '%'; } } }) }, scales: { x: { grid: { color: divColor + '40' }, ticks: { color: mutedColor, font: { family: 'JetBrains Mono', size: 10 }, callback: function (v) { return v + '%'; } }, border: { display: false }, min: 0, max: 100 }, y: { grid: { display: false }, ticks: { color: textColor, font: { family: 'Inter', size: 10 } }, border: { color: divColor } } }, animation: { duration: 700, easing: 'easeOutQuart' } }
  }, 'dashboard');

  setText('dashboardSubtitle', listingsData.length + ' listados \u00B7 ' + Object.keys(buildingsData).length + ' edificios \u00B7 Actualizado ahora');
}

function dashBStat(label, value) {
  return '<div class="dash-bstat"><span class="dash-bstat-label">' + label + '</span><span class="dash-bstat-value">' + value + '</span></div>';
}

// ── Map View ──────────────────────────────────────────────────
var mapInstance = null;
var mapMarkers = [];
var mapPopupInstance = null;
var activeMapFilter = 'all';

var TOWER_COORDS = {
  peninsula: { lng: -99.2602, lat: 19.3617, label: 'Pen\u00EDnsula' },
  torre300:  { lng: -99.2581, lat: 19.3631, label: 'Torre 300' },
  paradox:   { lng: -99.2558, lat: 19.3598, label: 'Paradox'   },
};

var MAP_STYLES = {
  dark:      'https://tiles.openfreemap.org/styles/liberty',
  streets:   'https://tiles.openfreemap.org/styles/bright',
  satellite: 'https://tiles.openfreemap.org/styles/positron',
};
var activeMapLayer = 'dark';

function getMapStyle(layer) { return MAP_STYLES[layer] || MAP_STYLES.dark; }

function renderMapView() {
  // Legend toggle
  var legend = document.getElementById('mapLegend');
  var legendToggle = document.getElementById('mapLegendToggle');
  if (legendToggle && !legendToggle._sfBound) {
    legendToggle._sfBound = true;
    legendToggle.addEventListener('click', function () {
      legend.classList.toggle('expanded');
      legendToggle.setAttribute('aria-expanded', legend.classList.contains('expanded') ? 'true' : 'false');
    });
    legendToggle.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); legendToggle.click(); }
    });
  }

  // Layer toggle
  document.querySelectorAll('[data-layer]').forEach(function (btn) {
    if (btn._sfLayerBound) return;
    btn._sfLayerBound = true;
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-layer]').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      activeMapLayer = btn.getAttribute('data-layer');
      if (mapInstance) {
        mapInstance.setStyle(getMapStyle(activeMapLayer));
        mapInstance.once('styledata', function () { addMapMarkers(); });
      }
    });
  });

  // Building filter on map
  document.querySelectorAll('[data-map-filter]').forEach(function (btn) {
    if (btn._sfMapFilterBound) return;
    btn._sfMapFilterBound = true;
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-map-filter]').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      activeMapFilter = btn.getAttribute('data-map-filter');
      updateMapMarkerVisibility();
      updateMapListingCount();
    });
  });

  // Fit/center button
  var fitBtn = document.getElementById('mapFitBtn');
  if (fitBtn && !fitBtn._sfFitBound) {
    fitBtn._sfFitBound = true;
    fitBtn.addEventListener('click', function () {
      if (mapInstance) mapInstance.flyTo({ center: [-99.2581, 19.3620], zoom: 14.5, duration: 900 });
    });
  }

  updateMapListingCount();

  if (!mapInstance) initMap();
  else setTimeout(function () { mapInstance.resize(); }, 50);
}

function updateMapListingCount() {
  var el = document.getElementById('mapListingCount');
  if (!el) return;
  var count = activeMapFilter === 'all'
    ? listingsData.length
    : listingsData.filter(function (l) { return l.building === activeMapFilter; }).length;
  el.textContent = count + ' listados';
}

function initMap() {
  if (typeof maplibregl === 'undefined') {
    var canvas = document.getElementById('mapCanvas');
    if (canvas) canvas.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--color-text-muted);font-size:var(--text-sm);flex-direction:column;gap:8px;">' +
      '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>' +
      '<span>Cargando mapa...</span></div>';
    setTimeout(function () { if (typeof maplibregl !== 'undefined' && currentView === 'map') initMap(); }, 1500);
    return;
  }

  try {
    mapInstance = new maplibregl.Map({
      container: 'mapCanvas',
      style: getMapStyle(activeMapLayer),
      center: [-99.2581, 19.3620],
      zoom: 14.5,
      attributionControl: false,
    });

    mapInstance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    mapInstance.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    mapInstance.on('load', function () { addMapMarkers(); });
    mapInstance.on('error', function (e) { console.warn('MapLibre error:', e); });
  } catch (err) {
    console.error('Map init failed:', err);
    var canvas = document.getElementById('mapCanvas');
    if (canvas) canvas.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--color-text-muted);font-size:var(--text-sm);flex-direction:column;gap:8px;">' +
      '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>' +
      '<span>No se pudo inicializar el mapa.</span>' +
      '<span style="font-size:var(--text-xs);opacity:0.6;">Verifica tu conexi\u00F3n a internet.</span></div>';
  }
}

function buildingColorVar(key) {
  var style = getComputedStyle(document.documentElement);
  return style.getPropertyValue('--building-' + key).trim() || '#888';
}

function addMapMarkers() {
  // Remove old markers
  mapMarkers.forEach(function (m) { m.remove(); });
  mapMarkers = [];
  if (mapPopupInstance) { mapPopupInstance.remove(); mapPopupInstance = null; }

  // Tower markers
  Object.keys(TOWER_COORDS).forEach(function (key) {
    var tc = TOWER_COORDS[key];
    var color = buildingColorVar(key);

    var el = document.createElement('div');
    el.className = 'map-tower-marker';
    el.setAttribute('data-building', key);
    el.innerHTML = '<div class="tower-pin" style="background:' + color + ';"></div><span class="tower-label">' + escapeHtml(tc.label) + '</span>';

    var bData = buildingsData[key] || {};
    var ts = towerSummary[key] || {};

    (function(k, bD, tS, tcRef) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        if (mapPopupInstance) mapPopupInstance.remove();
        var popupHtml =
          '<div class="map-tower-popup">' +
          '<div class="map-tower-popup-name">' + escapeHtml(bD.name || tcRef.label) + '</div>' +
          '<div class="map-tower-popup-address">' + escapeHtml(bD.address || '') + '</div>' +
          '<div class="map-tower-popup-stats">' +
            '<div class="map-tower-popup-stat"><div class="map-tower-popup-stat-val">' + (tS.count || 0) + '</div><div class="map-tower-popup-stat-label">Listados</div></div>' +
            '<div class="map-tower-popup-stat"><div class="map-tower-popup-stat-val">$' + fmtNum(tS.median_price || 0) + '</div><div class="map-tower-popup-stat-label">Mediana</div></div>' +
            '<div class="map-tower-popup-stat"><div class="map-tower-popup-stat-val">$' + fmtNum(tS.median_price_per_sqm || 0) + '</div><div class="map-tower-popup-stat-label">/m\u00B2</div></div>' +
          '</div>' +
          '<button class="map-popup-action" data-building-filter="' + k + '">Ver listados \u2192</button></div>';

        mapPopupInstance = new maplibregl.Popup({ closeButton: true, maxWidth: '280px' })
          .setLngLat([tcRef.lng, tcRef.lat]).setHTML(popupHtml).addTo(mapInstance);

        var actionBtn = mapPopupInstance.getElement().querySelector('.map-popup-action');
        if (actionBtn) {
          actionBtn.addEventListener('click', function () {
            showView('overview');
            document.querySelectorAll('.filter-chip').forEach(function (c) { c.classList.remove('active'); });
            var chip = document.querySelector('.filter-chip[data-filter="' + k + '"]');
            if (chip) chip.classList.add('active');
            activeFilter = k;
            renderOverview();
          });
        }
      });
    })(key, bData, ts, tc);

    var marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([tc.lng, tc.lat]).addTo(mapInstance);
    marker._sfBuilding = key;
    mapMarkers.push(marker);
  });

  // Listing bubble markers
  var listingsByBuilding = {};
  listingsData.forEach(function (l) {
    if (!listingsByBuilding[l.building]) listingsByBuilding[l.building] = [];
    listingsByBuilding[l.building].push(l);
  });

  listingsData.forEach(function (listing) {
    var key = listing.building;
    var tc = TOWER_COORDS[key];
    if (!tc) return;

    var siblings = listingsByBuilding[key] || [];
    var idx = siblings.indexOf(listing);
    var total = siblings.length;
    var angle = (idx / total) * Math.PI * 2 - Math.PI / 2;
    var radius = 0.0007 + 0.0003 * (idx % 2);
    var lng = tc.lng + Math.cos(angle) * radius;
    var lat = tc.lat + Math.sin(angle) * radius * 0.65;

    var scores = (listing.intel || {}).scores || {};
    var conf = scores.confidence_score || 50;
    var confClass = conf >= 70 ? 'conf-high' : conf >= 45 ? 'conf-mid' : 'conf-low';

    var status = (listing.intel || {}).status || {};
    var isFastMove = status.key === 'fast_move';
    var isVerify   = status.key === 'verify_first';
    var statusClass = isFastMove ? ' status-fast-move' : isVerify ? ' status-verify' : '';

    var priceLabel = '$' + Math.round((listing.price || 0) / 1000) + 'k';

    var el = document.createElement('div');
    el.className = 'map-listing-marker';
    el.setAttribute('data-building', key);
    el.setAttribute('data-id', listing.id);
    el.innerHTML = '<div class="listing-bubble ' + confClass + statusClass + '">' + escapeHtml(priceLabel) + '</div>';

    (function(lst, lngV, latV, cfClass, fM, vr) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        mapMarkers.forEach(function (m) {
          if (m._sfListingId) {
            var b = m.getElement().querySelector('.listing-bubble');
            if (b) b.classList.remove('selected');
          }
        });
        el.querySelector('.listing-bubble').classList.add('selected');

        if (mapPopupInstance) mapPopupInstance.remove();

        var sc = (lst.intel || {}).scores || {};
        var cf = sc.confidence_score || 50;
        var cfLbl = cf >= 70 ? 'Alta' : cf >= 45 ? 'Media' : 'Baja';

        var popupHtml =
          '<div class="map-popup">' +
          '<div class="map-popup-building">' + escapeHtml((buildingsData[lst.building] || {}).short || lst.building) + '</div>' +
          '<div class="map-popup-title">' + escapeHtml(lst.title || lst.id) + '</div>' +
          '<div class="map-popup-stats">' +
            '<div class="map-popup-stat"><div class="map-popup-stat-label">Precio</div><div class="map-popup-stat-value">$' + fmtNum(lst.price) + '</div></div>' +
            '<div class="map-popup-stat"><div class="map-popup-stat-label">/m\u00B2</div><div class="map-popup-stat-value">$' + fmtNum(lst.price_per_sqm || 0) + '</div></div>' +
            '<div class="map-popup-stat"><div class="map-popup-stat-label">Rec\u00E1maras</div><div class="map-popup-stat-value">' + (lst.beds || '\u2014') + '</div></div>' +
            '<div class="map-popup-stat"><div class="map-popup-stat-label">Score</div><div class="map-popup-stat-value">' + Math.round(sc.composite_score || sc.value_score || 0) + '</div></div>' +
          '</div>' +
          '<div class="map-popup-badges">' +
            '<span class="map-popup-badge ' + cfClass + '">' + cfLbl + ' confianza</span>' +
            (fM ? '<span class="map-popup-badge fast-move">Mov. r\u00E1pido</span>' : '') +
            (vr ? '<span class="map-popup-badge verify">Verificar</span>' : '') +
          '</div>' +
          '<button class="map-popup-action" data-listing-id="' + lst.id + '">Ver detalle \u2192</button></div>';

        mapPopupInstance = new maplibregl.Popup({ closeButton: true, maxWidth: '280px' })
          .setLngLat([lngV, latV]).setHTML(popupHtml).addTo(mapInstance);

        var actionBtn = mapPopupInstance.getElement().querySelector('.map-popup-action');
        if (actionBtn) {
          actionBtn.addEventListener('click', function () {
            currentListing = lst;
            showView('detail');
            renderDetailView(lst);
          });
        }
      });
    })(listing, lng, lat, confClass, isFastMove, isVerify);

    var marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([lng, lat]).addTo(mapInstance);
    marker._sfBuilding = key;
    marker._sfListingId = listing.id;
    mapMarkers.push(marker);
  });

  updateMapMarkerVisibility();
}

function updateMapMarkerVisibility() {
  mapMarkers.forEach(function (m) {
    var el = m.getElement();
    var key = el.getAttribute('data-building');
    el.style.display = (activeMapFilter === 'all' || key === activeMapFilter) ? '' : 'none';
  });
}

// ── Utility Functions ─────────────────────────────────────────

function metaItem(label, value) {
  return '<div class="detail-meta-item"><span class="detail-meta-label">' + label + '</span><span class="detail-meta-value">' + escapeHtml(String(value)) + '</span></div>';
}

function bandAnchor(value, label) {
  return '<div class="band-anchor"><div class="band-anchor-value">' + value + '</div><div class="band-anchor-label">' + label + '</div></div>';
}

function intelCardHtml(title, content) {
  return '<div class="intel-card"><h3>' + escapeHtml(title) + '</h3><div class="intel-card-content">' + content + '</div></div>';
}

function fmtNum(n) {
  if (n === null || n === undefined) return '0';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatTime(ts) {
  if (!ts) return '';
  try {
    var d = new Date(ts);
    return d.toLocaleDateString('es-MX', { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  } catch (e) { return String(ts).substring(0, 16); }
}

function escapeHtml(str) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str || ''));
  return div.innerHTML;
}

function setText(id, text) {
  var el = document.getElementById(id);
  if (el) el.textContent = text;
}

// ── Bootstrap ─────────────────────────────────────────────────
loadData();

// ── Map View ──────────────────────────────────────────────────
var mapInstance = null;
var mapMarkers = [];
var mapPopupInstance = null;
var activeMapFilter = 'all';

var TOWER_COORDS = {
  peninsula: { lng: -99.2602, lat: 19.3617, label: 'Pen\u00EDnsula' },
  torre300:  { lng: -99.2581, lat: 19.3631, label: 'Torre 300' },
  paradox:   { lng: -99.2558, lat: 19.3598, label: 'Paradox'   },
};

var MAP_STYLES = {
  dark:      'https://tiles.openfreemap.org/styles/liberty',
  streets:   'https://tiles.openfreemap.org/styles/bright',
  satellite: 'https://tiles.openfreemap.org/styles/positron',
};

var activeMapLayer = 'dark';

function getMapStyle(layer) {
  return MAP_STYLES[layer] || MAP_STYLES.dark;
}

function renderMapView() {
  // Legend toggle
  var legend = document.getElementById('mapLegend');
  var legendToggle = document.getElementById('mapLegendToggle');
  if (legendToggle && !legendToggle._sfBound) {
    legendToggle._sfBound = true;
    legendToggle.addEventListener('click', function () {
      legend.classList.toggle('expanded');
      legendToggle.setAttribute('aria-expanded', legend.classList.contains('expanded') ? 'true' : 'false');
    });
    legendToggle.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); legendToggle.click(); }
    });
  }

  // Layer toggle
  document.querySelectorAll('[data-layer]').forEach(function (btn) {
    if (btn._sfLayerBound) return;
    btn._sfLayerBound = true;
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-layer]').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      activeMapLayer = btn.getAttribute('data-layer');
      if (mapInstance) {
        mapInstance.setStyle(getMapStyle(activeMapLayer));
        mapInstance.once('styledata', function () { addMapMarkers(); });
      }
    });
  });

  // Building filter on map
  document.querySelectorAll('[data-map-filter]').forEach(function (btn) {
    if (btn._sfMapFilterBound) return;
    btn._sfMapFilterBound = true;
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-map-filter]').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      activeMapFilter = btn.getAttribute('data-map-filter');
      updateMapMarkerVisibility();
      updateMapListingCount();
    });
  });

  // Fit / center button
  var fitBtn = document.getElementById('mapFitBtn');
  if (fitBtn && !fitBtn._sfFitBound) {
    fitBtn._sfFitBound = true;
    fitBtn.addEventListener('click', function () {
      if (mapInstance) mapInstance.flyTo({ center: [-99.2581, 19.3620], zoom: 14.5, duration: 900 });
    });
  }

  updateMapListingCount();

  if (!mapInstance) {
    initMap();
  } else {
    setTimeout(function () { mapInstance.resize(); }, 50);
  }
}

function updateMapListingCount() {
  var el = document.getElementById('mapListingCount');
  if (!el) return;
  var count = activeMapFilter === 'all'
    ? listingsData.length
    : listingsData.filter(function (l) { return l.building === activeMapFilter; }).length;
  el.textContent = count + ' listados';
}

function initMap() {
  if (typeof maplibregl === 'undefined') {
    var canvas = document.getElementById('mapCanvas');
    if (canvas) canvas.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--color-text-muted);font-size:var(--text-sm);flex-direction:column;gap:8px;">' +
      '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>' +
      '<span>Cargando mapa\u2026</span></div>';
    setTimeout(function () { if (typeof maplibregl !== 'undefined' && currentView === 'map') initMap(); }, 1500);
    return;
  }

  try {
    mapInstance = new maplibregl.Map({
      container: 'mapCanvas',
      style: getMapStyle(activeMapLayer),
      center: [-99.2581, 19.3620],
      zoom: 14.5,
      attributionControl: false,
    });

    mapInstance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    mapInstance.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    mapInstance.on('load', function () { addMapMarkers(); });

    mapInstance.on('error', function (e) {
      console.warn('MapLibre error:', e);
    });
  } catch (err) {
    console.error('Map init failed:', err);
    var canvas = document.getElementById('mapCanvas');
    if (canvas) canvas.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--color-text-muted);font-size:var(--text-sm);flex-direction:column;gap:8px;">' +
      '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>' +
      '<span>No se pudo inicializar el mapa</span>' +
      '<span style="font-size:var(--text-xs);color:var(--color-text-faint);">Verifica tu conexi\u00F3n a internet</span></div>';
  }
}

function buildingColorVar(key) {
  var style = getComputedStyle(document.documentElement);
  return style.getPropertyValue('--building-' + key).trim() || '#888';
}

function addMapMarkers() {
  // Remove old markers
  mapMarkers.forEach(function (m) { m.remove(); });
  mapMarkers = [];
  if (mapPopupInstance) { mapPopupInstance.remove(); mapPopupInstance = null; }

  // Tower markers
  Object.keys(TOWER_COORDS).forEach(function (key) {
    var tc = TOWER_COORDS[key];
    var color = buildingColorVar(key);

    var el = document.createElement('div');
    el.className = 'map-tower-marker';
    el.setAttribute('data-building', key);
    el.innerHTML = '<div class="tower-pin" style="background:' + color + ';"></div><span class="tower-label">' + escapeHtml(tc.label) + '</span>';

    var bData = buildingsData[key] || {};
    var ts = towerSummary[key] || {};

    (function(k, bD, tS, tcRef) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        if (mapPopupInstance) mapPopupInstance.remove();

        var popupHtml =
          '<div class="map-tower-popup">' +
          '<div class="map-tower-popup-name">' + escapeHtml(bD.name || tcRef.label) + '</div>' +
          '<div class="map-tower-popup-address">' + escapeHtml(bD.address || '') + '</div>' +
          '<div class="map-tower-popup-stats">' +
            '<div class="map-tower-popup-stat"><div class="map-tower-popup-stat-val">' + (tS.count||0) + '</div><div class="map-tower-popup-stat-label">Listados</div></div>' +
            '<div class="map-tower-popup-stat"><div class="map-tower-popup-stat-val">$' + fmtNum(tS.median_price||0) + '</div><div class="map-tower-popup-stat-label">Mediana</div></div>' +
            '<div class="map-tower-popup-stat"><div class="map-tower-popup-stat-val">$' + fmtNum(tS.median_price_per_sqm||0) + '</div><div class="map-tower-popup-stat-label">/m\u00B2</div></div>' +
          '</div>' +
          '<button class="map-popup-action" data-building-filter="' + k + '">Ver listados \u2192</button></div>';

        mapPopupInstance = new maplibregl.Popup({ closeButton: true, maxWidth: '280px' })
          .setLngLat([tcRef.lng, tcRef.lat])
          .setHTML(popupHtml)
          .addTo(mapInstance);

        var actionBtn = mapPopupInstance.getElement().querySelector('.map-popup-action');
        if (actionBtn) {
          actionBtn.addEventListener('click', function () {
            showView('overview');
            document.querySelectorAll('.filter-chip').forEach(function (c) { c.classList.remove('active'); });
            var chip = document.querySelector('.filter-chip[data-filter="' + k + '"]');
            if (chip) chip.classList.add('active');
            activeFilter = k;
            renderOverview();
          });
        }
      });
    })(key, bData, ts, tc);

    var marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([tc.lng, tc.lat])
      .addTo(mapInstance);
    marker._sfBuilding = key;
    mapMarkers.push(marker);
  });

  // Listing bubble markers
  var listingsByBuilding = {};
  listingsData.forEach(function (l) {
    if (!listingsByBuilding[l.building]) listingsByBuilding[l.building] = [];
    listingsByBuilding[l.building].push(l);
  });

  listingsData.forEach(function (listing) {
    var key = listing.building;
    var tc = TOWER_COORDS[key];
    if (!tc) return;

    var siblings = listingsByBuilding[key] || [];
    var idx = siblings.indexOf(listing);
    var total = siblings.length;
    var angle = (idx / total) * Math.PI * 2 - Math.PI / 2;
    var radius = 0.0007 + 0.0003 * (idx % 2);
    var lng = tc.lng + Math.cos(angle) * radius;
    var lat = tc.lat + Math.sin(angle) * radius * 0.65;

    var scores = (listing.intel || {}).scores || {};
    var conf = scores.confidence_score || 50;
    var confClass = conf >= 70 ? 'conf-high' : conf >= 45 ? 'conf-mid' : 'conf-low';

    var status = (listing.intel || {}).status || {};
    var isFastMove = status.key === 'fast_move';
    var isVerify   = status.key === 'verify_first';
    var statusClass = isFastMove ? ' status-fast-move' : isVerify ? ' status-verify' : '';

    var priceLabel = '$' + Math.round((listing.price || 0) / 1000) + 'k';

    var el = document.createElement('div');
    el.className = 'map-listing-marker';
    el.setAttribute('data-building', key);
    el.setAttribute('data-id', listing.id);
    el.innerHTML = '<div class="listing-bubble ' + confClass + statusClass + '">' + escapeHtml(priceLabel) + '</div>';

    (function(lst, lngV, latV, cfClass, fM, vr) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        mapMarkers.forEach(function (m) {
          if (m._sfListingId) {
            var b = m.getElement().querySelector('.listing-bubble');
            if (b) b.classList.remove('selected');
          }
        });
        el.querySelector('.listing-bubble').classList.add('selected');

        if (mapPopupInstance) mapPopupInstance.remove();

        var sc = (lst.intel || {}).scores || {};
        var cf = sc.confidence_score || 50;
        var cfLbl = cf >= 70 ? 'Alta' : cf >= 45 ? 'Media' : 'Baja';

        var popupHtml =
          '<div class="map-popup">' +
          '<div class="map-popup-building">' + escapeHtml((buildingsData[lst.building]||{}).short || lst.building) + '</div>' +
          '<div class="map-popup-title">' + escapeHtml(lst.title || lst.id) + '</div>' +
          '<div class="map-popup-stats">' +
            '<div class="map-popup-stat"><div class="map-popup-stat-label">Precio</div><div class="map-popup-stat-value">$' + fmtNum(lst.price) + '</div></div>' +
            '<div class="map-popup-stat"><div class="map-popup-stat-label">/m\u00B2</div><div class="map-popup-stat-value">$' + fmtNum(lst.price_per_sqm||0) + '</div></div>' +
            '<div class="map-popup-stat"><div class="map-popup-stat-label">Rec\u00E1maras</div><div class="map-popup-stat-value">' + (lst.beds||'\u2014') + '</div></div>' +
            '<div class="map-popup-stat"><div class="map-popup-stat-label">Score</div><div class="map-popup-stat-value">' + Math.round(sc.composite_score || sc.value_score || 0) + '</div></div>' +
          '</div>' +
          '<div class="map-popup-badges">' +
            '<span class="map-popup-badge ' + cfClass + '">' + cfLbl + ' confianza</span>' +
            (fM ? '<span class="map-popup-badge fast-move">Mov. r\u00E1pido</span>' : '') +
            (vr ? '<span class="map-popup-badge verify">Verificar</span>' : '') +
          '</div>' +
          '<button class="map-popup-action" data-listing-id="' + lst.id + '">Ver detalle \u2192</button></div>';

        mapPopupInstance = new maplibregl.Popup({ closeButton: true, maxWidth: '280px' })
          .setLngLat([lngV, latV])
          .setHTML(popupHtml)
          .addTo(mapInstance);

        var actionBtn = mapPopupInstance.getElement().querySelector('.map-popup-action');
        if (actionBtn) {
          actionBtn.addEventListener('click', function () {
            currentListing = lst;
            showView('detail');
            renderDetailView(lst);
          });
        }
      });
    })(listing, lng, lat, confClass, isFastMove, isVerify);

    var marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([lng, lat])
      .addTo(mapInstance);

    marker._sfBuilding = key;
    marker._sfListingId = listing.id;
    mapMarkers.push(marker);
  });

  updateMapMarkerVisibility();
}

function updateMapMarkerVisibility() {
  mapMarkers.forEach(function (m) {
    var el = m.getElement();
    var key = el.getAttribute('data-building');
    el.style.display = (activeMapFilter === 'all' || key === activeMapFilter) ? '' : 'none';
  });
}

// ── Utility Functions ─────────────────────────────────────────

function metaItem(label, value) {
  return '<div class="detail-meta-item"><span class="detail-meta-label">' + label + '</span><span class="detail-meta-value">' + escapeHtml(String(value)) + '</span></div>';
}

function bandAnchor(value, label) {
  return '<div class="band-anchor"><div class="band-anchor-value">' + value + '</div><div class="band-anchor-label">' + label + '</div></div>';
}

function intelCardHtml(title, content) {
  return '<div class="intel-card"><h3>' + escapeHtml(title) + '</h3><div class="intel-card-content">' + content + '</div></div>';
}

function fmtNum(n) {
  if (n === null || n === undefined) return '0';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatTime(ts) {
  if (!ts) return '';
  try {
    var d = new Date(ts);
    return d.toLocaleDateString('es-MX', { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  } catch (e) { return String(ts).substring(0, 16); }
}

function escapeHtml(str) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str || ''));
  return div.innerHTML;
}

function setText(id, text) {
  var el = document.getElementById(id);
  if (el) el.textContent = text;
}

// ── Bootstrap ─────────────────────────────────────────────────
loadData();
