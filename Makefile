up:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f api worker

test:
	npm test
