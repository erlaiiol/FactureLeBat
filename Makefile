.PHONY: dev prod down migrate logs

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
