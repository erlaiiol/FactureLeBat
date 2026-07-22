.PHONY: dev prod down migrate logs deploy backup

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

# Real-server commands (see docs/deployment.md) — run these against a repo
# checkout already running `make prod`, e.g. on the OVH VPS.
deploy:
	sh infra/deploy.sh

backup:
	sh infra/backup.sh
