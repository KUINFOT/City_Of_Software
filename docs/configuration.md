# Configuration

Every setting, what it defaults to, and what it changes. There are no hidden knobs: if the code reads an environment variable, it is on this page.

## Which file do I edit?

| Where you run it | File | Read by |
| --- | --- | --- |
| `npm run dev` / `npm start` in `back-end/` | `back-end/.env` (copy from `back-end/.env.example`) | The API, via `dotenv` |
| `npm run dev` / `npm run build` in `front-end/` | `front-end/.env.local` (optional) | Next.js |
| `docker compose up` | `.env` in the **repository root** (copy from the root `.env.example`) | Docker Compose, which forwards it to the containers |

Two rules apply everywhere:

- **A real environment variable beats the file.** `dotenv` never overrides a variable that is already set, and Compose does the same.
- **Blank means "use the default".** Most numeric settings treat an empty, zero (where zero is nonsense) or non-numeric value as unset.

> [!IMPORTANT]
> All of these files are git-ignored (`.env`, `.env.*`, `service-account.json`, `/secrets/`). Only the `*.example` files are committed, and they must never contain real values.

In Docker, any back-end setting that is not named in `docker-compose.yml` (for example every `EXTRACTION_*` and `CRON_*`) can simply be added to the root `.env`; it is passed through to the container.

---

## Required

| Variable | Used by | What it is |
| --- | --- | --- |
| `MONGODB_URI` | API, extraction CLI | MongoDB connection string. Include the database name in the path. The API refuses to load without it, and so does the CLI, even for `--list` and `--dry-run` (which never connect, so any value will do there). |
| `AUTH_SECRET` | API | A long random string that signs sessions and email links and keys the sign-up encryption. **Required when `NODE_ENV=production`**; in development a built-in default is used. Generate one with `openssl rand -base64 48`. |

> [!WARNING]
> Changing `AUTH_SECRET` invalidates **everything it signed**: all sessions (everyone is signed out), pending sign-up links, signed document links and unsubscribe links already sitting in people's inboxes. Treat it as set-once.

## Server and URLs

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `4000` | Port the API listens on |
| `NODE_ENV` | `development` | `production` makes `AUTH_SECRET` mandatory and makes sending email with no provider an error |
| `CORS_ORIGIN` | `http://localhost:3000` | Origins allowed to call the API from a browser. Comma-separated for several. Must contain the web app's origin exactly (scheme, host, port) |
| `APP_URL` | `http://localhost:3000` | The web app's public address. Used in password-reset links, in links back to TORs inside alert emails, and for the redirect after email verification |
| `PUBLIC_API_URL` | `http://localhost:4000/api` | The API's public address **including `/api`**. Used to build the verification and unsubscribe links in emails |

Use HTTPS URLs on a real deployment: the links in emails are built from `APP_URL` and `PUBLIC_API_URL`.

## Email

Delivery is tried in this order. The first one that is configured wins.

1. **Gmail SMTP**, when `GMAIL_USER` and `GMAIL_APP_PASSWORD` are both set.
2. **Resend**, when `RESEND_API_KEY` and `EMAIL_FROM` are both set.
3. **Console log**, in development only. The message, including the link, is printed in the API terminal. In production, reaching this branch throws "Email delivery is not configured."

| Variable | Default | Notes |
| --- | --- | --- |
| `GMAIL_USER` | empty | The sending Gmail address. Use a dedicated account with 2-Step Verification on |
| `GMAIL_APP_PASSWORD` | empty | A Google **App Password**, not the account password. Spaces are stripped |
| `RESEND_API_KEY` | empty | Resend API key (needs a verified sending domain) |
| `EMAIL_FROM` | empty | The `from` address for Resend |

Emails are sent for: sign-up verification, password reset, stage alerts and the daily digest.

## Google Cloud (optional)

Leave `GCP_PROJECT_ID` empty to run on the built-in stubs. Every AI call then returns a zero-confidence placeholder and sends the record to manual review.

| Variable | Default | What it does |
| --- | --- | --- |
| `GCP_PROJECT_ID` | empty | **The switch.** Empty means stub mode everywhere |
| `GCP_LOCATION` | `us` | Region of the **Document AI processor**. Must match where the processor was created; processors cannot be moved. The `us` is only a placeholder |
| `DOC_AI_PROCESSOR_ID` | empty | The Document AI processor to use. It must have Thai OCR enabled |
| `VERTEX_AI_LOCATION` | code: `us-central1`; example files: `asia-southeast1` | Region for Gemini. Independent of `GCP_LOCATION`. `asia-southeast1` suits a Bangkok-based platform |
| `VERTEX_AI_MODEL` | `gemini-2.5-flash` | The Gemini model. See the note in [the decision log](extraction-pipeline.md#decision-log-and-lessons-learned) before changing it |
| `GOOGLE_APPLICATION_CREDENTIALS` | `./service-account.json` in `back-end/.env.example` | Path to the service-account key. In Docker this is fixed to `/run/secrets/service-account.json` |

(The `VERTEX_AI_*` names are historical. Google renamed the platform; the variable names were left alone.)

In Docker, the key goes at `secrets/service-account.json` (or in the folder named by `GCP_CREDENTIALS_DIR`). It is mounted read-only and must be readable by user ID 1000.

## Extraction pipeline

| Variable | Default | What it does |
| --- | --- | --- |
| `EXTRACTION_STORAGE_DIR` | `./storage` (Docker: `/data/storage`) | Where downloaded PDFs are written, content-addressed by SHA-256 |
| `EXTRACTION_DELAY_MS` | `1000` | Minimum gap between requests to the **same host**. Never below 1000; a longer `Crawl-delay` in a site's `robots.txt` is honoured |
| `EXTRACTION_TIMEOUT_MS` | `30000` | Per-request timeout |
| `EXTRACTION_MAX_RETRIES` | `3` | Retries (with backoff) for 5xx and connection resets |
| `EXTRACTION_USER_AGENT` | project name + repository link | Sent on every request. Keep it honest and contactable |
| `SOURCE_STALE_AFTER_DAYS` | `60` | A source whose newest announcement is older than this counts as "stale" (admin health screen and a log warning) |

## AI extraction and review routing

| Variable | Default | What it does |
| --- | --- | --- |
| `EXTRACTION_REVIEW_THRESHOLD` | `0.75` | Below this overall confidence a record **always** goes to review. It is also the cut-off for the "caution" flag on individual fields in the vendor UI |
| `EXTRACTION_AUTO_PUBLISH_ENABLED` | `false` | Master switch for auto-publishing. With `false`, no confidence is ever high enough |
| `EXTRACTION_AUTO_PUBLISH_THRESHOLD` | `0.92` | The stricter bar a record must **also** clear to auto-publish. Awarded TORs are never auto-published |
| `EXTRACTION_MAX_ATTEMPTS` | `3` | Retries before a failing document is "parked" for an admin |
| `EXTRACTION_SWEEP_BATCH_SIZE` | `20` | Documents per sweep run. Bounds run time and cost |
| `EXTRACTION_MAX_DOCUMENTS` | `0` (no limit) | Hard ceiling on documents ever stored or processed. A cost safety rail for development; enforced at download and at sweep time |
| `EXTRACTION_DOCLESS_GRACE_HOURS` | `24` | How long a TOR with no attachment waits before it is routed to review at confidence 0. `0` is allowed and means "immediately" |
| `EXTRACTION_EST_COST_PER_DOC_THB` | `2` | A placeholder cost estimate recorded on each extraction job |

## Duplicates, outliers and key dates

These thresholds are sane defaults, **not validated ones**. There is no labelled data set to tune them against yet, which is exactly why they are settings.

| Variable | Default | What it does |
| --- | --- | --- |
| `DUPLICATE_MATCH_THRESHOLD` | `0.65` | Minimum combined similarity to *suggest* a duplicate. Deliberately permissive, since a false positive only costs an admin a click and nothing is ever merged automatically |
| `OUTLIER_IQR_MULTIPLIER` | `1.5` | Tukey's-fence multiplier. A budget beyond Q1−k·IQR or Q3+k·IQR is flagged |
| `OUTLIER_MIN_COMPARABLE_N` | `5` | Below this many comparable records, no outlier flag and no analytics figures |
| `KEY_DATE_URGENT_WITHIN_DAYS` | `7` | A date this close (or closer, but not past) is marked urgent |

## Scheduler

| Variable | Default | What it does |
| --- | --- | --- |
| `SCHEDULER_ENABLED` | `false` | Master switch. Off, nothing is scheduled. A local `npm run dev` must not start crawling government sites by itself |
| `CRON_DGA` | `0 2 * * *` | DGA crawl: daily 02:00 |
| `CRON_MOL` | `0 3 * * *` | MOL crawl: daily 03:00 |
| `CRON_MOC` | `0 4 * * *` | MOC crawl: daily 04:00 |
| `CRON_ITD` | `0 5 * * *` | ITD crawl: daily 05:00 |
| `CRON_DEPA` | `0 6 * * 1` | DEPA crawl: Mondays 06:00 |
| `CRON_EXTRACTION_SWEEP` | `*/30 * * * *` | AI extraction sweep: every 30 minutes |
| `CRON_ANALYTICS` | `0 7 * * *` | Outlier analysis: daily 07:00 |
| `CRON_DIGEST` | `0 8 * * *` | Daily digest emails: daily 08:00 |
| `APP_TIMEZONE` | `Asia/Bangkok` | **Docker Compose only.** Sets the container's `TZ`, which is the time zone the cron expressions are read in |

Expressions are standard five-field cron and are validated at start-up: an invalid one stops the API from booting rather than silently never firing. Outside Docker the schedule follows the machine's own time zone.

## Docker Compose only

These exist in the root `.env` and are not read by the API itself.

| Variable | Default | What it does |
| --- | --- | --- |
| `BACKEND_PORT` | `4000` | Host port for the API. If you change it, change `PUBLIC_API_URL` to match |
| `FRONTEND_PORT` | `3000` | Host port for the web app |
| `GCP_CREDENTIALS_DIR` | `./secrets` | Host folder holding `service-account.json` |
| `APP_TIMEZONE` | `Asia/Bangkok` | See above |

Two further variables are set by the Dockerfiles and rarely need touching: `EXTRACTION_STORAGE_DIR=/data/storage` and `DOTENV_CONFIG_QUIET=true` (silences dotenv's start-up tips).

## Front-end

| Variable | Default | What it does |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api` | The API address the **browser** calls, including `/api`. Compiled into the bundle at build time; in Docker it is the `PUBLIC_API_URL` value passed as a build argument. Changing it requires a rebuild |

---

## Recipes

**Local development, nothing external**

```ini
MONGODB_URI=…
```

**Local development, but receive real emails**

```ini
MONGODB_URI=…
GMAIL_USER=a-dedicated-account@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
```

**Try real AI on a handful of documents**

```ini
MONGODB_URI=…
GCP_PROJECT_ID=my-project
GCP_LOCATION=asia-southeast1        # where YOUR processor lives
DOC_AI_PROCESSOR_ID=abc123…
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
EXTRACTION_MAX_DOCUMENTS=5          # safety rail
```

**The deployed server**

```ini
MONGODB_URI=…
AUTH_SECRET=…                       # openssl rand -base64 48
CORS_ORIGIN=https://portal.example.org
APP_URL=https://portal.example.org
PUBLIC_API_URL=https://portal.example.org/api
RESEND_API_KEY=…
EMAIL_FROM=alerts@example.org
GCP_PROJECT_ID=…
SCHEDULER_ENABLED=true              # on this server only, and run exactly one back-end
```
