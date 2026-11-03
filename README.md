# City_Of_Software

A document-intelligence application: upload documents, run OCR / text extraction, and
generate AI summaries.

## Tech stack

| Layer                     | Technology                                                        |
| ------------------------- | ----------------------------------------------------------------- |
| Frontend                  | Next.js · React · TypeScript                                       |
| Backend / API             | Node.js · Express · TypeScript                                    |
| Database                  | MongoDB Atlas (Mongoose)                                           |
| AI / Document Intelligence| Vertex AI (Google Cloud) — Document AI (OCR/extraction) + Gemini summaries |

## Structure

```
City_Of_Software/
├── back-end/    Express + TypeScript API — see back-end/README.md
└── front-end/   Next.js frontend — landing, browse TORs, registration, dashboard, settings
```

## Getting started (back-end)

```bash
cd back-end
npm install
cp .env.example .env   # add your MongoDB Atlas connection string
npm run dev
```

Full details and API reference: [back-end/README.md](back-end/README.md).

> **Note:** The Vertex AI / Document AI integration is currently stubbed — the API runs
> and returns placeholder AI output without Google Cloud credentials. See the back-end
> README for how to wire up the real calls.

## Getting started (front-end)

The frontend currently uses local mock data and does not call the backend.

```bash
cd front-end
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in a browser.

Available pages:

| Page | URL |
| --- | --- |
| Landing page | `http://localhost:3000/` |
| Browse TORs | `http://localhost:3000/browse-tors` |
| Registration | `http://localhost:3000/register` |
| Vendor dashboard | `http://localhost:3000/dashboard` |
| Account settings | `http://localhost:3000/settings` |

To verify or run a production build:

```bash
cd front-end
npm run typecheck
npm run build
npm run start
```

More frontend details are available in [front-end/README.md](front-end/README.md).

## Deployment with Docker

`docker-compose.yml` runs the back-end API and the front-end together. Each has a
multi-stage `Dockerfile` (`back-end/Dockerfile`, `front-end/Dockerfile`) that builds on
Node 22 and runs as the non-root `node` user. MongoDB is not part of the stack: the API
connects to MongoDB Atlas through `MONGODB_URI`, so the Atlas network access list must
allow the server's IP address.

You need Docker with Compose v2.24 or newer.

### 1. Configure

```bash
cp .env.example .env
```

Fill in `.env`. It is git-ignored, and the `.dockerignore` files keep it, `service-account.json`,
`node_modules` and `storage/` out of every image: secrets reach the containers at run time only.

| Setting | What it is |
| --- | --- |
| `MONGODB_URI` | MongoDB Atlas connection string. **Required.** |
| `AUTH_SECRET` | Long random string that signs sessions and email links (`openssl rand -base64 48`). **Required**: the API will not start in production without it. |
| `CORS_ORIGIN`, `APP_URL`, `PUBLIC_API_URL` | The URLs the stack is served from. `PUBLIC_API_URL` is where a **browser** reaches the API, including `/api`. It is built into the front-end, so after changing it run `docker compose up --build`. Use HTTPS URLs on a real deployment: the links in emails are built from them. |
| `GMAIL_USER` and `GMAIL_APP_PASSWORD`, or `RESEND_API_KEY` and `EMAIL_FROM` | Email delivery. Sign-up and password reset need one of them in production. |
| `GCP_PROJECT_ID`, `GCP_LOCATION`, `DOC_AI_PROCESSOR_ID`, `VERTEX_AI_*` | Google Cloud. Optional: with `GCP_PROJECT_ID` empty, every AI call uses the built-in stub and sends the record to manual review. |
| `SCHEDULER_ENABLED` | `false` unless you set it to `true`. See below. |

Put the Google Cloud service account key at `secrets/service-account.json` (git-ignored). It is
mounted read-only into the back-end and must be readable by user ID 1000.

Any other back-end setting from [back-end/.env.example](back-end/.env.example) (`EXTRACTION_*`,
`CRON_*`, ...) can be added to `.env` and is passed through to the back-end.

### 2. Build and start

```bash
docker compose up --build -d
docker compose ps
```

Both services report `healthy` within about a minute. The web app is at
[http://localhost:3000](http://localhost:3000) and the API's health check at
[http://localhost:4000/api/health](http://localhost:4000/api/health) (change the ports with
`FRONTEND_PORT` and `BACKEND_PORT`).

### 3. Update

```bash
git pull
docker compose up --build -d
```

### Running it for real

- **The daily collection is off by default.** Set `SCHEDULER_ENABLED=true` in `.env` on the
  deployed environment only. The cron expressions are read in `APP_TIMEZONE` (`Asia/Bangkok`
  by default).
- **Run exactly one back-end.** The scheduler's overlap lock lives in memory, so a second
  instance would repeat every crawl. Scaling out needs a database-backed lock first (see
  [docs/extraction-pipeline.md](docs/extraction-pipeline.md)).
- **Downloaded PDFs** are written to `EXTRACTION_STORAGE_DIR`, which is the `tor-storage` Docker
  volume mounted at `/data/storage`. Restarting, rebuilding and `docker compose down` keep it;
  `docker compose down -v` deletes it. For now the files stay on that volume rather than in
  object storage, so back the volume up with the rest of the server.
- **The extraction CLI** runs inside the deployed container, for example
  `docker compose exec back-end node dist/extraction/cli.js --list`.
- Choosing a host and setting up a domain and TLS are not covered here: put a reverse proxy in
  front of the two published ports.

CI builds both images on every pull request and checks that the stack starts and reports healthy.
