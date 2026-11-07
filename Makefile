.PHONY: up down backend-install backend-test backend-lint contracts frontend-install frontend-dev check

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

contracts:     ## Regenerate JSON Schema + TS types after changing three_d/contracts.py
	backend/.venv/bin/python scripts/export_contracts.py && cd frontend && npm run contracts:types

frontend-install:
	cd frontend && npm install
frontend-dev:
	cd frontend && npm run dev

check: backend-lint backend-test   ## What CI runs (minus migrations)
	backend/.venv/bin/python scripts/export_contracts.py --check
	cd frontend && npm run contracts:check && npm run build
