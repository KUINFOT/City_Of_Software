# City of Software: back-end

The API, the crawler, the AI extraction pipeline and the scheduler, in one Node.js process.

**Stack:** Node.js 22 · Express 4 · TypeScript · MongoDB Atlas (Mongoose 9) · Google Cloud (Gemini, Document AI).

> **AI is optional while you develop.** Leave `GCP_PROJECT_ID` empty and every AI call returns a safe, zero-confidence stub that routes the record to manual review. You can run, test and demo the whole API without a Google account. See [Running the AI for real](#running-the-ai-for-real).

For the big picture read [docs/architecture.md](../docs/architecture.md). This file is the practical, per-package reference.

## What it does

| Job | Where |
| --- | --- |
| Serves the REST API for the web app | `src/routes`, `src/controllers` |
| Signs people in, keeps sessions, resets passwords | `src/controllers/auth.controller.ts`, `src/services/` |
| Crawls five agency websites, downloads their PDFs | `src/extraction/` |
| Turns PDFs into structured TOR fields with confidence scores | `src/extraction/pipeline/aiExtraction.ts`, `src/services/gemini.service.ts` |
| Holds results for human review, serves only approved records | `src/controllers/review.controller.ts`, `tor.controller.ts` |
| Matches vendors to TORs and sends alerts | `src/matching/`, `src/notifications/` |
| Computes historical-budget, frequency and outlier analytics | `src/analytics/` |
| Runs all of the above on a schedule (opt-in) | `src/scheduler/` |

## Prerequisites

- **Node.js 22 or newer.** The Docker image uses 22, and `@google-cloud/documentai` requires it. (`package.json` still says `>=18`, and CI runs on 20, where `npm test` finds no test files: run the tests locally.)
- **A MongoDB connection string.** A free MongoDB Atlas cluster is enough. If you use Atlas, add your IP address to the cluster's network access list.

## Set up

```bash
cd back-end
npm install
cp .env.example .env     # then edit .env
```

Set at least `MONGODB_URI`. Everything else has a working default for local development. The full list, with defaults, is in [docs/configuration.md](../docs/configuration.md).

> [!IMPORTANT]
> `.env` and `service-account.json` are git-ignored. Never commit either of them, and never paste their contents into an issue or a chat.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start with hot reload (`tsx watch`) |
| `npm run build` | Compile TypeScript to `dist/` (test files excluded) |
| `npm start` | Run the compiled build |
| `npm run typecheck` | Type-check without emitting |
| `npm test` | Run every `*.test.ts` with Node's built-in test runner (no database, no Google account) |
| `npm run extract -- <flags>` | The extraction CLI: crawl, AI sweep, outlier analysis ([cheat sheet](#the-extraction-cli)) |
| `npm run seed` | Legacy: inserts six mock `Document` rows. Search now reads the `tors` collection, so these do not appear on the site. Use a real crawl instead ([getting started](../docs/getting-started.md)). |

## Run it

```bash
npm run dev
```

The server listens on `http://localhost:4000` (override with `PORT`). If MongoDB cannot be reached the server **still starts**, logs a warning, and database-backed requests fail until `MONGODB_URI` is valid. That is deliberate so you can inspect the health check and the 401/404 behaviour without a database.

Try it:

```bash
curl http://localhost:4000/api/health
```

```json
{ "status": "ok", "timestamp": "2026-11-03T03:00:00.000Z" }
```

A protected route without a token is refused before it ever touches the database:

```bash
curl -i http://localhost:4000/api/review/queue
```

```
HTTP/1.1 401 Unauthorized
{"error":"Please sign in again to continue."}
```

## The API at a glance

Everything is under `/api`. Responses are JSON; errors look like `{ "error": "message" }`. Protected routes expect `Authorization: Bearer <token>` from `POST /api/auth/login`. Every response carries security headers and an `X-Request-ID`, and per-IP rate limits apply to sign-in and to all writes.

| Area | Prefix | Who can call it |
| --- | --- | --- |
| Health | `GET /health` | Anyone |
| Accounts and sign-in, including optional Google sign-in | `/auth/*` | Anyone (connecting Google: signed in) |
| Published TORs, detail, source documents | `/tors`, `/tors/:id`, `/tors/:id/documents` | Anyone |
| Search with filters | `GET /documents` | Anyone |
| Agencies (for the "follow" picker) | `GET /agencies` | Anyone |
| Qualification check, match reasons | `/tors/:id/qualification-match`, `/tors/:id/match-reasons` | Vendors |
| Saved TORs and notes | `PUT/DELETE /tors/:id/bookmark`, `PATCH /tors/:id/bookmark/note`, `GET /bookmarks` | Vendors |
| Compare | `POST /comparisons/preview` | Vendors |
| Alerts history | `GET /notifications` | Vendors |
| Vendor profile | `/vendor-profiles/:userId` | The owner, or an admin |
| Analytics | `/analytics/budgets`, `/analytics/agency-frequency` | Any signed-in user |
| Review queue | `/review/*` | Admins |
| Crawl control and health | `/extraction/*` | Admins |
| Audit log, user management | `/audit-log`, `/admin/users` | Admins |

The complete reference, with parameters and example responses, is [docs/api-reference.md](../docs/api-reference.md).

## Project structure

```
src/
├── index.ts                 boot: connect to MongoDB, start the scheduler, listen
├── app.ts                   Express app: CORS, logging, parsing, /api, error handlers
├── config/                  env.ts (validated env) · db.ts · gcpConfig.ts
├── routes/                  one router per feature, mounted in routes/index.ts
├── controllers/             request handlers
├── middleware/              auth.middleware.ts · security.middleware.ts (headers, rate limits) · securityLog.ts · upload.ts (PDF only, 20 MB, ClamAV scan) · errorHandler.ts
├── models/                  19 Mongoose models (see docs/database-design.md)
├── services/                session, password, email, Document AI, Gemini, signed-link tokens
├── extraction/
│   ├── registry.ts          the six sources, with compliance posture
│   ├── adapters/            one file per website
│   ├── core/                HTTP client, robots.txt, Thai dates, classifier, fingerprinting,
│   │                        field schema, grounding, confidence, routing, duplicates, health
│   ├── pipeline/            runner · normalize · attachments · storage · aiExtraction · duplicateCheck
│   └── cli.ts               npm run extract
├── analytics/               budget comparison, agency frequency, outlier maths, key dates
├── matching/                qualificationMatch.ts · matchReasons.ts
├── notifications/           stageTransition · dispatch · digest · templates
├── scheduler/               cron config, scheduler, in-memory lock
└── scripts/                 seedDocuments.ts (legacy)
```

Tests sit beside the code they cover (`foo.ts` and `foo.test.ts`).

## Authentication in one paragraph

Sign-in returns a signed Bearer token. Each request is checked against a server-side `Session` (30-minute idle window, 8-hour maximum) and the user's current status and role, so logout, suspension and role changes take effect immediately. Three roles exist: `vendor`, `reviewer` and `admin`. Passwords are hashed with scrypt and checked against known breaches, five failed sign-ins lock an account for 15 minutes, per-IP rate limits sit on top, and sign-up stores nothing until the email link is opened. Google sign-in is optional (the three `GOOGLE_OAUTH_*` settings). The full story, including the first-admin step, is in [docs/authentication.md](../docs/authentication.md).

## The extraction CLI

The CLI shares its code with the scheduler, so it is the quickest way to try the pipeline.

```bash
npm run extract -- --list
```

```bash
npm run extract -- --source dga --year 2569 --pages 2 --dry-run
```

```bash
npm run extract -- --source mol --pre-award-only --attachments
```

```bash
npm run extract -- --extract-ai
```

```bash
npm run extract -- --analyze-outliers
```

| Flag | Meaning |
| --- | --- |
| `--list` | Show every source and its compliance status |
| `--source <id>` | Run one source: `dga`, `mol`, `moc`, `itd`, `depa`, `bma_egp2` |
| `--all` | Run every source cleared to run unattended |
| `--dry-run` | Parse and report. Writes nothing and never connects to a database (though `MONGODB_URI` must still be *set*, to any value). The right way to check a selector after a site redesign |
| `--attachments` | Download the PDFs and record them as documents (needed for the AI sweep to have anything to read) |
| `--pre-award-only` | Keep only rows confirmed *not* awarded |
| `--pages <n>`, `--max <n>` | Listing pages to walk, hard cap on records |
| `--year <BE>` | Buddhist Era year (DGA paginates by fiscal year) |
| `--keyword <text>` | Title filter, repeatable, OR-matched |
| `--no-detail` | Listing pages only (skips one request per row; DGA then has no dates) |
| `--param k=v` | Source-specific option, for example `--param category=tender` |
| `--delay <ms>` | Per-host delay (never lower than 1000) |
| `--extract-ai` | Run the AI extraction sweep over uploaded documents |
| `--analyze-outliers` | Recompute outlier flags and `procurement_stats` |
| `--approved-by`, `--reason` | Required together to run a source whose Terms of Service forbid crawling |

`--extract-ai` and `--analyze-outliers` always need a real database connection.

## Running the AI for real

Two Google Cloud services are involved, and both fall back to a stub when `GCP_PROJECT_ID` is empty.

| Service file | Used for | Needs |
| --- | --- | --- |
| `src/services/gemini.service.ts` | **Primary path.** Gemini reads a PDF or image directly (up to 14 MB) and returns a transcription plus the 16 fields. Also writes the summary. | `GCP_PROJECT_ID`, `VERTEX_AI_LOCATION`, `VERTEX_AI_MODEL` |
| `src/services/documentAI.service.ts` | **Fallback.** OCR for what Gemini cannot read directly (other file types, or over 14 MB). PDFs longer than 30 pages are split into 30-page chunks. | `GCP_PROJECT_ID`, `GCP_LOCATION`, `DOC_AI_PROCESSOR_ID` |

Both authenticate with a service-account key referenced by `GOOGLE_APPLICATION_CREDENTIALS` (in Docker, `secrets/service-account.json`).

Notes that save an afternoon:

- `GCP_LOCATION` **must equal the region the Document AI processor was created in**; processors cannot be moved. The `us` in `.env.example` is only a placeholder.
- The processor must have Thai OCR enabled at creation time.
- Gemini's region (`VERTEX_AI_LOCATION`) is independent of that, and `asia-southeast1` is the sensible default for a Bangkok-based platform.
- The default model is `gemini-2.5-flash`. It is the only model confirmed reachable on the project at the time of the last live test; lighter models returned *"not found or your project does not have access"*. See [the decision log](../docs/extraction-pipeline.md#decision-log-and-lessons-learned).
- `@google/genai` is the current Node SDK for Gemini. It replaced `@google-cloud/vertexai`, which was removed from Google's SDK in June 2026.

## Testing

```bash
npm test
```

225 tests run in a few seconds. They cover the pure logic (classifier, dates, robots.txt, grounding, routing, duplicates, outliers, analytics, matching) and the security-sensitive code (tokens, passwords and the breach check, sessions, Google OAuth state, outbound URL safety, malware scanning, id validation, the append-only audit log). None of them open a database or call Google.

Run them on Node 22 or newer. CI's `backend` job runs `npm test` on Node 20, which finds no `.ts` test files and passes without running any ([details](../docs/development.md#ci)).

`MONGODB_URI` must be *set* (to anything) because some modules import `config/env.ts`, which refuses to load without it. CI sets a dummy value; so can you:

```bash
MONGODB_URI=mongodb://localhost:27017/ci NODE_ENV=test npm test
```

More on conventions and on adding code in the [development guide](../docs/development.md).

## Docker

`back-end/Dockerfile` is a three-stage build (compile, production dependencies, runtime) on `node:22-slim`, running as the non-root `node` user with a `/api/health` health check. Use the root [`docker-compose.yml`](../docker-compose.yml) rather than running it by hand; it supplies the environment, the storage volume and the service-account mount. See [docs/deployment.md](../docs/deployment.md).
