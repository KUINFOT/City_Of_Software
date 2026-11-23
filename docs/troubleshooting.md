# Troubleshooting

Symptom first, then the cause, then the fix. If yours is not here, the first things to check are the API terminal (or `docker compose logs -f back-end`) and the browser's developer console (Network tab).

- [Starting up](#starting-up)
- [The web app](#the-web-app)
- [Accounts and email](#accounts-and-email)
- [Data and the pipeline](#data-and-the-pipeline)
- [AI and Google Cloud](#ai-and-google-cloud)
- [Alerts and analytics](#alerts-and-analytics)
- [Docker](#docker)

---

## Starting up

### `Missing required environment variable: MONGODB_URI`

The API reads `back-end/.env`, and that file is missing, empty, or you started the server from the wrong folder. Copy `back-end/.env.example` to `back-end/.env` and set `MONGODB_URI`. (In Docker, it is the **root** `.env`.) The extraction CLI needs it too, even for `--list` and `--dry-run`, which never connect: a dummy value such as `mongodb://127.0.0.1:1/x` is enough.

### The API starts but nothing works

You will see this in the terminal:

```
⚠️  Could not connect to MongoDB. The server will still start, but database operations will fail …
```

The server deliberately keeps running, and `/api/health` passes regardless, so it is easy to miss. Causes, most likely first:

1. **Atlas network access.** Your current IP is not on the cluster's allow-list. Every connection then times out.
2. **A password with special characters** (`@`, `:`, `/`, `#`) in the URI. They must be URL-encoded (`@` becomes `%40`).
3. **No database name** in the URI path, or a typo in the cluster host.
4. A VPN or corporate network blocking `mongodb+srv` DNS lookups.

### `EADDRINUSE: address already in use :::4000` (or 3000)

Something else holds the port. Stop it, or change `PORT` for the API, or run the web app on another port. If you move the API, update `NEXT_PUBLIC_API_URL`; if you move the web app, add its origin to `CORS_ORIGIN`.

### Engine or syntax errors on install or start

Use **Node.js 22 or newer**. `@google-cloud/documentai` requires it, and older versions produce confusing errors. `node --version` first.

### `npm test` says a required variable is missing

Some modules import `config/env.ts`, which refuses to load without `MONGODB_URI`. The tests never connect, so any value works:

```bash
MONGODB_URI=mongodb://localhost:27017/ci NODE_ENV=test npm test
```

---

## The web app

### The browser console shows a CORS error, or "Failed to fetch"

The API only accepts browser calls from origins listed in `CORS_ORIGIN`, which must match **exactly** (scheme, host and port). Typical cause: Next.js moved to port 3001 because 3000 was busy. Add it (comma-separated lists are allowed), restart the API:

```ini
CORS_ORIGIN=http://localhost:3000,http://localhost:3001
```

### The deployed site still calls `localhost:4000`

`NEXT_PUBLIC_API_URL` is compiled into the bundle at **build** time. Set `PUBLIC_API_URL` correctly, then rebuild: `docker compose up --build -d`. Restarting is not enough.

### "Please sign in again to continue" keeps appearing

The API is refusing your token. Reasons: 30 minutes idle, 8 hours since sign-in, you signed out elsewhere, an admin changed your role or suspended you, you reset your password, or `AUTH_SECRET` changed. Sign out and back in.

### I was promoted to admin but see no admin menu

The web app keeps the user it stored at sign-in. Sign out and in.

### A page says "admin only" or the API says "Administrator access is required"

Your account's role is not `admin`. Check `GET /admin/users` as an admin, or the `users` collection.

### The Advanced search Project Type filter returns nothing

Known bug: the page sends display labels, the API matches stored values. See [Status](status.md#known-bugs). Use the other filters meanwhile.

### Times and dates look wrong by a day, or by 543 years

Dates are stored at midnight UTC and shown as dates, so they should not shift. The analytics screens deliberately show **Buddhist Era** years (2569 BE is 2026), and the API takes Gregorian years. If a displayed deadline is off by a day, compare it with the original document and report it.

---

## Accounts and email

### The verification email never arrives

- **Development, no email configured:** nothing is sent. The message, including the link, is **printed in the API terminal**. Look for `[email] Development log for …`.
- **Production:** with no provider configured, sending is an error. Set `GMAIL_USER` and `GMAIL_APP_PASSWORD`, or `RESEND_API_KEY` and `EMAIL_FROM`.
- **Gmail:** use an **App Password** (needs 2-Step Verification), not the account password.
- **Resend:** the sending domain must be verified.
- Check spam. A new link can be requested once a minute.
- The link points at the web app (`APP_URL/verify-email#token=…`), so that address must be reachable from the recipient's browser, not just from the server.

### The verification link says "invalid or expired"

It lasts 24 hours and works once. It also breaks if the text was cut when copying (the token is everything after `#token=`), or if `AUTH_SECRET` changed since it was sent. Register again.

### Sign-up or reset says "Choose a password that has not appeared in a known data breach"

That password is on the Have I Been Pwned list of leaked passwords, so it is refused even though it is long enough. Choose another. Only the first five characters of its hash were sent to check it.

### Sign-up or reset says "Password security check is temporarily unavailable"

The API could not reach `api.pwnedpasswords.com`, and it will not accept a password it could not check (503). Allow outbound HTTPS to that host from the server, or try again later.

### "Too many requests. Please try again later."

A per-IP rate limit (429): 10 sign-in attempts per 15 minutes, 20 other sign-up or reset requests per 15 minutes, or 120 writes per minute. Wait for the window to pass. If everyone behind one proxy hits it together, the API is counting the proxy's address: set `TRUST_PROXY_HOPS=1` ([Configuration](configuration.md#security)). The limits are in memory, so restarting the API clears them.

### Google sign-in

| Message or result | Cause and fix |
| --- | --- |
| "Google sign-in is not configured on this server" | Set `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` and `GOOGLE_OAUTH_REDIRECT_URI`, then restart the API |
| Google shows `redirect_uri_mismatch` | `GOOGLE_OAUTH_REDIRECT_URI` must match, character for character, a redirect URI registered on the OAuth client in Google |
| "This email already has an account" (`oauth=link_required`) | By design. Sign in with the password, then connect Google under *Settings → Personal information* |
| The Google account is connected to someone else (`google=conflict`) | One Google account can belong to one platform account only |
| The onboarding form says the request expired | It must be completed within 10 minutes of returning from Google. Start again |

### "An account with this email already exists"

A verified account uses that address. Sign in, or use **Forgot password**.

### Locked out: "Too many failed sign-in attempts"

Five wrong passwords lock the account for 15 minutes. Wait, or clear the lock in MongoDB:

```js
db.users.updateOne({ email: "you@example.com" }, { $set: { failedLoginAttempts: 0, loginLockedUntil: null } })
```

### There is no admin and I cannot make one

Promote any verified account directly in the database: `db.users.updateOne({ email }, { $set: { role: "admin" } })`. There is intentionally no other way.

---

## Data and the pipeline

### The site is empty

Vendors only see **published** TORs, and a fresh database has none. Follow [Getting started, steps 8 and 9](getting-started.md#8-pull-in-some-real-tors): crawl, run the AI sweep, approve something.

### Crawled TORs never show up in the review queue

They are probably still `discovered`. A TOR enters the queue after the AI sweep processes its document, or, if it has none, after the grace period.

- The admin **Run now** button does **not** download PDFs, so those TORs have no document. Wait out `EXTRACTION_DOCLESS_GRACE_HOURS` (24 by default), or set it to `0` and run `npm run extract -- --extract-ai`.
- For documents, crawl with `--attachments` (the scheduler does this itself), then run the sweep.
- Check `GET /api/extraction/jobs` for errors on the crawl itself.

### A document is stuck and never extracted

After `EXTRACTION_MAX_ATTEMPTS` (3) failures a document is **parked**, not retried, and never deleted. Read why:

```js
db.documents.find({ status: "uploaded", "extraction.attempts": { $gte: 3 } }, { originalName: 1, "extraction.lastError": 1 })
```

Fix the cause (usually credentials or a model name), then let it retry:

```js
db.documents.updateMany({ status: "uploaded" }, { $set: { "extraction.attempts": 0 } })
```

### A source shows "Format suspected" or "Stale"

See the [Admin guide](guides/admin-guide.md#adapter-health-adminadapter-health). Format-suspected almost always means the page layout changed: run `npm run extract -- --source <id> --dry-run` and compare with the live page.

### "Source is blocked by its Terms of Service"

Expected for `bma_egp2`. Its terms ban crawling by name. Do not override it without the agency's written sign-off.

### A crawl reports a TLS or certificate problem

Some `.go.th` hosts serve incomplete certificate chains. The crawler no longer works around this (it used to retry without verification until 22 November 2026), so the request fails and the error is on the job record. There is no switch to relax it. If a source matters, ask the agency to fix its certificate, or add its documents by hand with `POST /api/review/tors`.

### A document link says "This link has expired or is no longer valid"

Document links are signed and last 15 minutes. Reload the TOR page (or the review screen) for a fresh one. A link copied without its `?token=…` never works.

### Uploading a PDF fails

| Answer | Meaning |
| --- | --- |
| 400 "Upload rejected. Provide one PDF file no larger than 20 MB." | Wrong file name or type, or over 20 MB |
| 415 "Only valid PDF files are accepted." | The file is named `.pdf` but is not really a PDF |
| 422 "The uploaded file did not pass the security scan." | ClamAV found malware. Do not retry with the same file |
| 503 "File security scanning is temporarily unavailable." | Scanning is required but ClamAV cannot be reached: check the `clamav` container (`docker compose ps`), or for local work without ClamAV set `UPLOAD_MALWARE_SCAN_MODE=disabled` in `back-end/.env` |

### The crawl finds nothing, but the site has content

A "successful" run that finds nothing is the failure the pipeline is most worried about, and it warns loudly. Check `errors` on the job. Likely causes: a changed layout, the wrong `--year` (DGA paginates by Buddhist Era fiscal year), or `--no-detail` on DGA (its dates exist only on detail pages).

---

## AI and Google Cloud

### Everything has confidence 0 and nothing is extracted

`GCP_PROJECT_ID` is empty, so the stubs are running. The API logs `[documentAI.service] GCP_PROJECT_ID is not set — falling back to a stub …` once. That is the designed safe default. Set the Google Cloud variables to use the real services.

### `not found or your project does not have access to it` (a model error)

`VERTEX_AI_MODEL` names a model your project cannot use. Only `gemini-2.5-flash` was confirmed reachable on the project; lighter and newer names all returned this. Keep the default unless you have verified another.

### Document AI returns `Request contains an invalid argument`

`GCP_LOCATION` does not match the region the **processor** was created in, or `DOC_AI_PROCESSOR_ID` is wrong. A processor cannot be moved, so fix the setting, not the processor. (Document AI is only the fallback reader; Gemini reads PDFs and images directly.)

### `Permission denied` / `could not load the default credentials`

`GOOGLE_APPLICATION_CREDENTIALS` does not point at a readable key, or the service account lacks roles for Document AI and Vertex AI. In Docker the key must be `secrets/service-account.json` and readable by user ID 1000.

### Thai text comes out garbled

Make sure the Document AI processor was created with **Thai OCR** support (it is configured when the processor is created). For pages fetched from agency sites, the crawler decodes the charset the server declares (`windows-874`/TIS-620 included).

---

## Alerts and analytics

### A vendor gets no alerts

Work down the list; the first "no" is the answer:

1. Is the **scheduler** on (or has someone run a crawl by hand)? Nothing alerts otherwise.
2. Did a **published** TOR **change stage** on a crawl? Approving a TOR does not alert; see [When an alert is sent](notifications-and-matching.md#when-an-alert-is-sent).
3. Does the TOR **match** them? At least one of: a technology they list (needs AI-extracted technologies), an agency they follow, a keyword in the title.
4. Is **email** configured, and have they not unsubscribed? The alert still appears on the dashboard either way.

### The analytics page says "not enough data"

A comparable set needs at least 5 reviewed records with the required values (`OUTLIER_MIN_COMPARABLE_N`). Broaden the filters, or review more TORs.

### Nothing is flagged as an outlier

The outlier job has not run (it is a daily schedule or `npm run extract -- --analyze-outliers`), or each agency × project type × year group has fewer than 5 records.

---

## Docker

### `docker compose up` stops with "Set MONGODB_URI in .env"

`MONGODB_URI` and `AUTH_SECRET` are required, and Compose checks before it starts anything. Fill in the **root** `.env`.

### An error about `path` or `required` under `env_file`

Your Docker Compose is older than v2.24. Upgrade Docker.

### The back-end container is `unhealthy` or restarting

The health check does not touch the database, so unhealthy usually means the process crashed on start. Read `docker compose logs back-end`. The usual culprit is a missing `AUTH_SECRET` in production, an invalid cron expression, or an out-of-range security setting (`TRUST_PROXY_HOPS`, `UPLOAD_MALWARE_*`).

### The back-end never starts: it is waiting for `clamav`

The back-end starts only once ClamAV is healthy, and on its first start ClamAV downloads its virus definitions, which can take a few minutes (its health check allows two). If it stays unhealthy, read `docker compose logs clamav`: it needs outbound internet access for the definitions, and enough free memory to load them.

### The front-end is healthy but cannot reach the API

Build-time URL (`PUBLIC_API_URL`), then `CORS_ORIGIN`, in that order. See the web app section above.

### The downloaded PDFs disappeared

`docker compose down -v` deletes volumes, including `tor-storage`. Use `down` without `-v`. Restore from a backup ([Deployment: backups](deployment.md#backups)).

### Two crawlers are running

You started a second back-end. The overlap lock is per process, so both crawl. Stop one. Never run `--scale back-end=2`.
