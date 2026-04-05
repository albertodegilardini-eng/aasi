# Santa Fe Command Center — Next.js Production Build

Production-oriented React/Next.js implementation built on top of the refactored architecture, not the original codebase.

## Stack
- Next.js App Router
- TypeScript
- Recharts
- Lucide React
- Local JSON data source for immediate portability

## What is included
- Centralized dashboard state via a provider/reducer
- Overview / Compare / Negotiation operating modes
- Responsive filter rail
- KPI strip
- Market spread chart
- Intelligence rail with negotiation playbook
- Guided mode overlay
- Snapshot export API route

## Run locally

```bash
cd santafe-next-app && npm install && npm run dev
```

Then open:

```bash
http://localhost:3000
```

## Production build

```bash
npm run build && npm run start
```

## Suggested next upgrades
1. Replace local JSON with API-backed ingestion and persistence.
2. Add authentication and deal-level user workspaces.
3. Move pricing intelligence to a service layer.
4. Add map provider integration and listing geocoding.
5. Persist compare sets, notes, and negotiation drafts.
