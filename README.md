# CarbonAI

Production-ready Carbon Emissions Management System for multi-branch / multi-factory
organizations: React frontend + FastAPI REST backend on top of the original, tested
Decimal calculation engine.

> See `IMPLEMENTATION_REPORT.md` for the full upgrade story: what the original project
> contained, what was found, what changed and what was verified.

## Quick start (Windows)

Double-click **`START_CARBONAI.bat`**, then open http://127.0.0.1:8000

- First run creates the default admin: **admin / admin123** (change it after first login —
  the app forces it). Set the `CARBONAI_ADMIN_PASSWORD` environment variable to choose the
  initial password yourself.
- The SQLite database lives at `data\carbonai.db`; schema migrations are additive and an
  automatic backup is taken before any migration of an existing DB.

## What the system does

| Area | Details |
|---|---|
| Calculation engine | Deterministic Decimal engine (activity × factor), dimension-checked unit conversion, GWP sets (AR4/AR5), per-gas component math — unchanged from the original core |
| Factor library | Versioned emission factors with sources, ranked suggestion (national > regional > global > proxy), verification workflow with audit log; only verified national factors auto-apply |
| Scope classification | Rule-based GHG Protocol Scope 1/2/3 suggestion that states its missing information instead of guessing |
| Multi-factory | Organizations (companies) with branches/factories; factory users are isolated to their own facility |
| Reporting workflow | Factories snapshot a period into a submission; head office approves/rejects; one active submission per facility/period (partial unique index); consolidated report counts approved snapshots only |
| Dashboard | Totals, monthly trend, scopes, facility comparison, categories, top sources — same numbers as the CSV/PDF reports |
| Reports | CSV (activity detail + monthly summary) and PDF (English + Arabic with proper shaping) |
| Import | CSV/Excel with preview → explicit commit; rejected rows listed with reasons; duplicates reported |
| ML | Optional sklearn model trained on the org's own ledger (see below) |

## Roles

| Role | Scope |
|---|---|
| `admin` | Everything, including users, factor verification, settings, backup |
| `head_office` | Own company only: consolidated dashboards, all facilities' data, review submissions |
| `factory_manager` | Own facility only: enter records, submit reports, own dashboards |
| `viewer` | Read-only inside its facility |

## Architecture

```
frontend/   React 18 + Vite + TypeScript + Tailwind + Recharts (built to frontend/dist,
            served by the API at "/" — Arabic/English with full RTL support)
api/        FastAPI REST layer (auth/JWT, RBAC, tenancy scoping, routers per domain)
services/   Business logic: calculations, ledger, factor_library, scope_classifier,
            importer, reports, submissions, ml_model, security — framework-free and tested
db/         SQLite persistence: additive schema, idempotent seeding, backup/restore
scripts/    db_admin, run_tests, train_emission_model, validate_reference_data
tests/      105 tests (79 original core/DB + 26 end-to-end API tests)
```

## Development

```powershell
# backend API only
python -m uvicorn api.main:app --reload --port 8000

# frontend dev server (proxies /api to :8000)
cd frontend
npm install
npm run dev        # http://localhost:5173
```

## Tests

```
python scripts\run_tests.py     # 105 tests
```

## ML model

No model ships with the project. Once the ledger holds ≥ 40 calculated records, an
administrator can train one from the organisation's own data
(`python scripts\train_emission_model.py`, or POST `/api/ml/train`). The bundle is saved to
`models\emission_model.pkl` and served at `GET /api/ml/status` + `POST /api/ml/predict`.
Predictions are planning estimates only — the deterministic engine always stays authoritative.

## Data safety

* Startup only runs `CREATE ... IF NOT EXISTS` / `INSERT OR IGNORE` (a test enforces no
  DROP/DELETE in init/seed).
* Records are never deleted; corrections are explicit scope overrides + audit log.
* Backup: Settings page button, `POST /api/settings/backup`, or
  `python scripts\db_admin.py backup` → `backups\`.
* Restore: `python scripts\db_admin.py restore backups\<file>.db` (current DB saved aside first).
