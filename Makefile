.PHONY: up down migrate seed smoke backend-install backend-test backend-lint contracts frontend-install frontend-dev check

up:            ## Start the full local stack
	docker compose up --build
down:
	docker compose down

backend-install:
	cd backend && python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
backend-test:
	cd backend && .venv/bin/pytest -q
backend-lint:
	cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check . && .venv/bin/mypy app

contracts:     ## Regenerate 3D schemas, OpenAPI and all TS types after backend schema changes
	backend/.venv/bin/python scripts/export_contracts.py
	backend/.venv/bin/python scripts/export_openapi.py
	cd frontend && npm run contracts:types && npm run api:types

migrate:       ## Apply migrations to EDU3D_DATABASE_URL
	cd backend && .venv/bin/alembic upgrade head

seed:          ## Seed the 3D library with the schematic demo heart (idempotent)
	cd backend && .venv/bin/python -m app.modules.three_d.seed

frontend-install:
	cd frontend && npm install
frontend-dev:
	cd frontend && npm run dev

check: backend-lint backend-test   ## What CI runs (minus migrations)
	backend/.venv/bin/python scripts/export_contracts.py --check
	backend/.venv/bin/python scripts/export_openapi.py --check
	cd frontend && npm run contracts:check && npm run api:check && npm run build

smoke:         ## Live HTTP smoke test of a running API: make smoke URL=http://localhost:8000 [AI=1]
	python3 scripts/api_smoke.py --base-url $(or $(URL),http://localhost:8000) $(if $(AI),--with-ai,)
