.PHONY: dev prod down migrate logs deploy backup logs-files logs-errors logs-files-prod logs-errors-prod

dev:
	docker compose -f infra/docker-compose.yml up --build

prod:
	docker compose -f infra/docker-compose.prod.yml up --build -d

down:
	docker compose -f infra/docker-compose.yml down
	docker compose -f infra/docker-compose.prod.yml down

migrate:
	docker compose -f infra/docker-compose.yml exec backend npx prisma migrate dev

logs:
	docker compose -f infra/docker-compose.yml logs -f

# Rotated log files written by backend/src/logging/ (see docs/logging.md) —
# survive container restarts/recreation, unlike `make logs` above (Docker's
# own log driver). Dev bind-mounts the whole backend/ dir, so the files are
# just there on the host; prod keeps them in a named volume, only reachable
# through the running container.
logs-files:
	tail -f backend/logs/combined-*.log

logs-errors:
	tail -f backend/logs/error-*.log

logs-files-prod:
	docker compose -f infra/docker-compose.prod.yml exec backend tail -f logs/combined-*.log

logs-errors-prod:
	docker compose -f infra/docker-compose.prod.yml exec backend tail -f logs/error-*.log

# Real-server commands (see docs/deployment.md) — run these against a repo
# checkout already running `make prod`, e.g. on the OVH VPS.
deploy:
	sh infra/deploy.sh

backup:
	sh infra/backup.sh
