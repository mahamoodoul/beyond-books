.PHONY: up down db migrate seed seed-demo seed-courses previews seed-students export-courses sqlite-to-postgres smoke backend-install backend-test backend-lint contracts frontend-install frontend-dev check

up:            ## Start the full local stack
	docker compose up --build
down:
	docker compose down

db:            ## Only Postgres + Redis in Docker (backend/frontend run on your machine)
	docker compose up -d postgres redis

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

previews:       ## Render the 2D picture of every 3D model that has none (FORCE=1 re-renders all)
	@if docker compose ps --status running --services 2>/dev/null | grep -qx api; then \
	  docker compose run --rm --no-deps -v "$(CURDIR)/scripts:/seed/scripts:ro" \
	    api python /seed/scripts/render_previews.py $(if $(FORCE),--force,); \
	elif [ -x backend/.venv/bin/python ]; then \
	  cd backend && .venv/bin/python ../scripts/render_previews.py $(if $(FORCE),--force,); \
	else \
	  echo "Start the app first: 'make up' (Docker), or 'make backend-install' for a local backend." && exit 1; \
	fi

seed-courses:   ## Load the shared courses: make seed-courses EMAIL=teacher@x.com PASSWORD=12+chars [STUDENT=student@x.com STUDENT_PASSWORD=12+chars]
	@test -n "$(EMAIL)" || (echo "usage: make seed-courses EMAIL=teacher@x.com PASSWORD=... [STUDENT=student@x.com STUDENT_PASSWORD=...]" && exit 1)
	@git lfs pull 2>/dev/null || echo "note: Git LFS not installed (brew install git-lfs) - PDFs and 3D models will be missing"
	@if docker compose ps --status running --services 2>/dev/null | grep -qx api; then \
	  echo "Docker stack is running: importing inside the api container (its database and file storage)"; \
	  docker compose run --rm --no-deps -e SEED_ROOT=/seed \
	    -v "$(CURDIR)/scripts:/seed/scripts:ro" -v "$(CURDIR)/seeds:/seed/seeds:ro" \
	    -v "$(CURDIR)/sample-courses:/seed/sample-courses:ro" \
	    api sh -c 'alembic upgrade head && python /seed/scripts/course_seed.py import "$$@"' _ $(SEED_ARGS); \
	elif [ -x backend/.venv/bin/python ]; then \
	  cd backend && .venv/bin/alembic upgrade head && \
	  .venv/bin/python ../scripts/course_seed.py import $(SEED_ARGS); \
	else \
	  echo "Start the app first: 'make up' (Docker), or 'make backend-install' for a local backend." && exit 1; \
	fi

SEED_ARGS = "$(EMAIL)" $(if $(PASSWORD),"$(PASSWORD)",) $(if $(STUDENT),--student "$(STUDENT)",) $(if $(STUDENT_PASSWORD),--student-password "$(STUDENT_PASSWORD)",)

seed-demo:      ## Demo data like the Coolify deploy: shared courses for teacher@example.com, the demo student, 50 analytics students
	@git lfs pull 2>/dev/null || echo "note: Git LFS not installed - missing PDFs/3D models are downloaded from GitHub instead"
	@if docker compose ps --status running --services 2>/dev/null | grep -qx api; then \
	  docker compose run --rm --no-deps -e SEED_ROOT=/seed -e EDU3D_OPEN_REGISTRATION=true \
	    -v "$(CURDIR)/scripts:/seed/scripts:ro" -v "$(CURDIR)/seeds:/seed/seeds:ro" \
	    -v "$(CURDIR)/sample-courses:/seed/sample-courses:ro" \
	    api sh -c 'alembic upgrade head && python /seed/scripts/seed_deploy.py'; \
	elif [ -x backend/.venv/bin/python ]; then \
	  cd backend && .venv/bin/alembic upgrade head && \
	  EDU3D_OPEN_REGISTRATION=true .venv/bin/python ../scripts/seed_deploy.py; \
	else \
	  echo "Start the app first: 'make up' (Docker), or 'make backend-install' for a local backend." && exit 1; \
	fi

seed-students:  ## 50 demo students in a demo school with activity for the analytics: make seed-students EMAIL=teacher@x.com [COUNT=50] [RESET=1]
	@test -n "$(EMAIL)" || (echo "usage: make seed-students EMAIL=teacher@x.com [COUNT=50] [RESET=1]" && exit 1)
	@if docker compose ps --status running --services 2>/dev/null | grep -qx api; then \
	  docker compose run --rm --no-deps -e SEED_ROOT=/seed -v "$(CURDIR)/scripts:/seed/scripts:ro" \
	    api python /seed/scripts/seed_students.py "$(EMAIL)" $(STUDENTS_ARGS); \
	elif [ -x backend/.venv/bin/python ]; then \
	  cd backend && .venv/bin/python ../scripts/seed_students.py "$(EMAIL)" $(STUDENTS_ARGS); \
	else \
	  echo "Start the app first: 'make up' (Docker), or 'make backend-install' for a local backend." && exit 1; \
	fi
STUDENTS_ARGS = $(if $(COUNT),--count $(COUNT),) $(if $(RESET),--reset,)

export-courses: ## Re-export a teacher's courses into seeds/courses: make export-courses EMAIL=you@example.com
	@test -n "$(EMAIL)" || (echo "usage: make export-courses EMAIL=you@example.com" && exit 1)
	cd backend && .venv/bin/python ../scripts/course_seed.py export $(EMAIL)

sqlite-to-postgres: ## Copy backend/dev.db into the (migrated, empty) Postgres of backend/.env
	cd backend && .venv/bin/python ../scripts/sqlite_to_postgres.py $(DB)

API ?= http://localhost:8000
seed-demo:     ## Demo school, teachers, students, courses and activity via the running API (make seed-demo API=...)
	python3 scripts/seed_demo.py --base-url $(API)

frontend-install:
	cd frontend && npm install
frontend-dev:
	cd frontend && npm run dev

check: backend-lint backend-test   ## What CI runs (minus migrations)
	backend/.venv/bin/python scripts/export_contracts.py --check
	backend/.venv/bin/python scripts/export_openapi.py --check
	cd frontend && npm run contracts:check && npm run api:check && npm test && npm run build

smoke:         ## Live HTTP smoke test of a running API: make smoke URL=http://localhost:8000 [AI=1]
	python3 scripts/api_smoke.py --base-url $(or $(URL),http://localhost:8000) $(if $(AI),--with-ai,)
