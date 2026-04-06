# AASI Engineering Memo (April 6, 2026)

## 1) Current Stack

### Frontend
- Static web application centered on `frontend/index.html` with core runtime logic concentrated in `frontend/app.js`.
- Layered styling architecture across `frontend/base.css`, `frontend/style.css`, `frontend/overrides.css`, `frontend/enhancements.css`, and `frontend/polish.css`.
- Additional rebuild/augmentation logic in `frontend/rebuild.js`.
- Bot interaction layer in `frontend/bot.js`.
- Map rendering via MapLibre (integrated in `frontend/app.js`) with styles in `frontend/map.css`.

### Backend
- Flask backend in `server.py`.
- Endpoints include listings, agents, summaries/reports, inquiries, watch/check, alerts/watch-state/event-log/snapshots, and collect/verification.
- Runtime pattern is mixed: frontend-first deployment with partial server-backed behavior.

### Data + Intelligence
- Scraping, collection, and scoring modules: `scraper.py`, `collector.py`, `intelligence.py`, `operator_engine.py`, `scoring_engine_v2.py`, `price_history.py`.
- File-based persistence with JSON datasets and state logs (`listings.live.json`, `data/*.json`).
- Research/extraction artifacts include manifests, reports, and extraction bundles.

---

## 2) Current Capabilities

### Product Surfaces
- Overview, dashboard, compare, operator/negotiation, agent intelligence, map, source verification/tracking, and in-app bot are all present.

### Data/Product Features Already Working
- Canonical listing schema and price history recording.
- Listing image mapping and gallery/lightbox behavior.
- Source-link presentation on listings.
- Locale/currency toggles with partial translation coverage.
- Frontend fallback data-loading paths.

### System Maturity (Current State)
- Advanced prototype with substantial feature breadth.
- Strong demo value and meaningful operator workflows.
- Not yet reliable as a production-grade intelligence platform.

---

## 3) Missing Systems (Gap Analysis)

### Architecture + Frontend Engineering
- Logic concentration in large JavaScript files, limited modular boundaries, and limited state isolation.
- No robust shared event/state bus.
- Too much behavior layered through CSS/JS overrides.

### Backend + Deployment
- No always-on hosted backend guaranteed behind public app access.
- No mature deployment pipeline for Flask service.
- No clear environment separation (dev/staging/prod) with controlled config policy.

### Persistence + Security Model
- File-based persistence for watch state/history is fragile at scale.
- Missing database-backed durability and queryability.
- Missing user/session/auth/roles and formal audit trail controls.

### Data Collection Operations
- Scraping stack exists but lacks industrial controls:
  - no queue/job orchestration
  - no systematic retries/backoff
  - no source-health monitoring
  - no stronger anti-block operation strategy
  - limited cross-source entity resolution/dedup
  - no formal provenance evidence store

### Bot/Agentic Layer
- Bot is interactive but not fully agentic.
- No persistent backend conversation memory.
- Limited grounded retrieval and limited tool orchestration depth.
- No citation-grade answer cards as a first-class response object.

### Map + Spatial Intelligence
- Good baseline map UX but no geospatial intelligence layer.
- No provider redundancy strategy for reliability.
- No tactical overlays, clustering intelligence, route/isochrone enrichment.

### Analytics + Intelligence Surfaces
- Dashboard is improved but still widget-like in places.
- Limited anomaly detection, drilldown depth, and comparative model visibility.

### Localization + Design System
- Partial localization coverage; terminology normalization is incomplete.
- Design system improved but not yet fully locked and unified.

### Engineering Excellence Controls
- Limited automated tests.
- No CI/CD backbone.
- No typed frontend architecture.
- No robust observability and production error-handling model.
- No contract testing across scraper/server/frontend interfaces.

---

## 4) Target Architecture (Production End-State)

### A. Platform Shape
- Hosted full-stack application with clear runtime boundaries:
  1) UI application (modular frontend)
  2) API/service layer (always-on backend)
  3) Data platform (durable DB + event store)
  4) Collection platform (queue-based scraping/verification jobs)
  5) Intelligence platform (scoring + explainable provenance)

### B. Data + Persistence
- Primary relational database for listings, brokers, towers, events, and user artifacts.
- Dedicated event/audit store for every state mutation and operator action.
- Snapshot + history tables for price deltas, status changes, and source freshness.

### C. Collection + Verification Pipeline
- Scheduler + queue-driven workers.
- Source-specific connectors with health metrics.
- Retry/backoff and failure classification.
- Structured provenance records per field-level claim.

### D. Intelligence Layer
- Broker/entity resolution graph across listings/buildings/agents.
- Longitudinal broker and listing behavior models.
- Trust/reliability scoring derived from observed outcomes and evidence quality.

### E. Bot Runtime
- Retrieval grounded in normalized DB + provenance store.
- Tool execution workflows (collect, verify, compare, summarize, risk-check).
- Persistent conversation state and structured answer objects with citations.

### F. Frontend Architecture
- Modular feature boundaries and explicit state stores.
- Shared UI component system with locked tokens and typography.
- Typed contracts between frontend and backend APIs.

### G. Operations + Governance
- CI/CD pipelines with environment promotion controls.
- Observability stack (logs/metrics/traces/alerts).
- Runbooks for source failures, ingest lags, and score anomalies.

---

## 5) Recommended Build Order (Execution Sequence)

### Phase 1: Production Foundation (Immediate)
1. Stand up hosted backend runtime with environment separation.
2. Introduce relational DB and migrate file-based state to durable tables.
3. Add CI/CD and baseline observability.

**Outcome:** Reliable operational base; prevents prototype failure modes.

### Phase 2: Data Contract Hardening
1. Define strict schemas and API contracts for listings/agents/events.
2. Add contract tests between scraper, server, and frontend.
3. Formalize provenance model for source evidence.

**Outcome:** Consistent data flow and safer iteration velocity.

### Phase 3: Collection Industrialization
1. Build queue/job orchestration for scraping/verification.
2. Add retries, backoff, and source-health monitoring.
3. Implement dedup/entity-resolution pipeline.

**Outcome:** Stable, scalable ingestion with quality control.

### Phase 4: Frontend Modular Refactor
1. Break `app.js`/`bot.js` into feature modules.
2. Add explicit state/event architecture.
3. Remove override-heavy behavior and lock design tokens.

**Outcome:** Maintainable UI system and lower change risk.

### Phase 5: Intelligence Differentiation
1. Ship broker/listing/tower relationship graph.
2. Implement longitudinal reliability/trust scoring.
3. Add anomaly and drilldown intelligence views.

**Outcome:** Product moves from dashboard to decision machine.

### Phase 6: Bot Agentic Upgrade
1. Add persistent memory and tool orchestration workflows.
2. Enforce citation-grade answer cards with provenance links.
3. Integrate execution flows (collect → verify → compare → recommend).

**Outcome:** Bot becomes a grounded operator, not a UI assistant.

### Phase 7: Localization and Final System Lock
1. Complete language/terminology normalization across all surfaces.
2. Finalize design-system tokens, hierarchy, and component standards.
3. Run final hardening sweep on error handling and edge-state UX.

**Outcome:** Cohesive, production-ready experience and lower support burden.

---

## Priority Decisions for Executive Alignment
- Confirm hosting model and backend SLOs.
- Approve DB-first migration and audit model.
- Approve queue-based collection architecture.
- Approve frontend modularization scope before new feature expansion.
- Lock design system and localization completion criteria.

These decisions unlock the transition from advanced prototype to a production-grade intelligence platform.
