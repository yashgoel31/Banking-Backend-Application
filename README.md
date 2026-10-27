# BankSphere

A complete digital bank: customer internet banking and a staff back office (teller, KYC officer, fraud analyst,
support, bank administrator) on top of a hardened, double-entry microservices backend.

```
                        ┌──────────────────────────── docker compose (one command) ─────────────────────────────┐
 browser ──TLS (LB)──►  web :8080  ──/api──►  api-gateway  ──►  auth · customer · account · ledger · notification · fraud
                        nginx: SPA +           (not published:     │            Postgres (schema per service, owner/app roles)
                        strict CSP +            only reachable     │            Redis (ACL users) · Kafka (SASL/SCRAM + ACLs)
                        same-origin proxy)      through web)       └──► Mailpit in development
```

| Folder | What it is |
|---|---|
| [`backend/`](backend/README.md) | Seven TypeScript / Express / Prisma services, shared package, Docker and migration tooling, API e2e security suite. |
| [`frontend/`](frontend/README.md) | React + TypeScript web app (Vite, Tailwind, Radix, TanStack Query), unit/component tests (Vitest + MSW) and browser journeys (Playwright). |
| [`docs/`](docs/) | Design, security audit, user stories, test plan and report, screenshots. |

## Run it

Prerequisites: Docker with Compose v2.24+ (for `include`), Node ≥ 22 for local development.

```bash
node backend/scripts/setup-dev-env.mjs                               # random secrets for local use
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

- Web app: <http://localhost:8080> · captured emails (Mailpit): <http://localhost:8025>
- Create the two bootstrap administrators (staff administration is four-eyes), then sign in and enrol their
  authenticators from the app:

```bash
docker compose run --rm -e ADMIN_EMAIL=ops.lead@banksphere.local -e ADMIN_PASSWORD='A-long-Passw0rd' auth-service node dist/scripts/create-admin.js
docker compose run --rm -e ADMIN_EMAIL=ops.second@banksphere.local -e ADMIN_PASSWORD='An0ther-long-Pass' auth-service node dist/scripts/create-admin.js
```

Production: `docker compose up -d --build` with a real `backend/.env` (see the backend README), behind a
TLS-terminating load balancer (`WEB_TRUSTED_PROXY_CIDR` = its address range).

## Test it

```bash
cd backend && npm test                      # backend unit tests
cd frontend && npm test                     # frontend unit + component tests (npm run test:coverage for coverage)
cd frontend && npm run e2e                  # browser journeys against the running stack (see frontend/e2e/README.md)
node backend/scripts/e2e.mjs                # API functional + security regression suite (see backend README)
```

See [docs/testing/test-plan.md](docs/testing/test-plan.md) and the latest
[test report](docs/testing/test-report.md).

## Documentation

- [Design](docs/superpowers/specs/2026-10-27-banksphere-fullstack-design.md)
- [Design system](design-system/banksphere/MASTER.md): tokens, type, grid, components, patterns and what the UI must never do
- [Security audit and fixes](docs/security/2026-10-27-security-audit.md)
- [User stories and acceptance criteria](docs/user-stories.md)
- [Screenshots](docs/screenshots/README.md)
- [Frontend conventions](frontend/CONTRIBUTING.md)
