# Getting started

By the end of this page you will have the API and the web app running on your machine, an administrator account, and a few real TORs that **you** crawled, reviewed and approved. It takes about 20 minutes, most of it waiting for installs.

> **Just want to see it run?** Use Docker instead: copy `.env.example` to `.env`, set `MONGODB_URI` and `AUTH_SECRET`, and run `docker compose up --build -d`. The [deployment guide](deployment.md) has the details. You will still need steps 6 to 9 below to get an admin and some data.

## What you need

| Need | Check with | Notes |
| --- | --- | --- |
| Node.js **22 or newer** | `node --version` | Needed by `@google-cloud/documentai`; the Docker images use 22 |
| npm | `npm --version` | Ships with Node |
| Git | `git --version` | |
| A MongoDB database | | A free MongoDB Atlas cluster is plenty ([step 2](#2-get-a-mongodb-database)) |

You do **not** need a Google Cloud account or an email account to start. Without them, the AI steps use safe stubs and emails are printed to the API's terminal. You can add the real ones later ([step 10](#10-switch-on-the-real-services-optional)).

## 1. Get the code and install

```bash
git clone https://github.com/KUINFOT/City_Of_Software.git
cd City_Of_Software
```

```bash
cd back-end && npm install && cd ..
```

```bash
cd front-end && npm install && cd ..
```

## 2. Get a MongoDB database

If you already have a connection string, skip to step 3. Otherwise, in [MongoDB Atlas](https://www.mongodb.com/docs/atlas/getting-started/):

1. Create a free cluster.
2. Create a **database user** (a username and password).
3. Under **Network Access**, add your current IP address. This is the step people forget; without it every connection times out.
4. Click **Connect → Drivers** and copy the connection string.

Put the database name in the path, before the `?`. The result looks like:

```
mongodb+srv://<user>:<password>@<cluster>.mongodb.net/city_of_software?retryWrites=true&w=majority
```

## 3. Configure the back-end

```bash
cd back-end
cp .env.example .env
```

Open `back-end/.env` and set `MONGODB_URI`. That is the only required value for local work.

```ini
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/city_of_software?retryWrites=true&w=majority
```

Leave `SCHEDULER_ENABLED=false`. You will trigger crawls by hand, which is what you want while experimenting.

> [!TIP]
> One setting makes the walk-through below faster: `EXTRACTION_DOCLESS_GRACE_HOURS=0`. A TOR with no attached document normally waits 24 hours before it is sent to review; zero routes it on the next AI sweep.

## 4. Start the API

```bash
npm run dev
```

You should see `✅ Connected to MongoDB` and `🚀 Server listening on http://localhost:4000`. In another terminal:

```bash
curl http://localhost:4000/api/health
```

```json
{ "status": "ok", "timestamp": "2026-11-03T03:00:00.000Z" }
```

If MongoDB is unreachable the server still starts and warns you. The health check passes either way, so read the log. See [Troubleshooting](troubleshooting.md#the-api-starts-but-nothing-works).

## 5. Start the web app

In a new terminal:

```bash
cd front-end
npm run dev
```

Open <http://localhost:3000>. The interface is mostly in Thai. The landing page loads, but there is nothing to browse yet.

## 6. Create your first account

Go to **Create account (สมัครใช้งาน)** and register as a **software vendor (ผู้ขายซอฟต์แวร์)**. Vendor sign-up is three steps: your details, your capability profile, then email verification.

1. Fill in the form at `/register` (a password of at least 10 characters).
2. Fill in your profile at `/vendor-onboarding`. Choose company or freelancer and add at least one technology or service category, for example `React, Node.js`.
3. The API now "sends" the verification email. With no email provider configured, **it is printed in the API terminal** instead:

   ```
   [email] Development log for you@example.com: Verify your City of Software email address
   Welcome to City of Software. Verify your email address: http://localhost:4000/api/auth/verify-email?token=…
   ```

4. Open that link in your browser. It verifies the address, creates the account, and redirects to the web app's "email verified" page.
5. Sign in at `/login`.

> [!NOTE]
> Nothing is saved to the database until step 4. The sign-up details travel inside the encrypted link, so a half-finished sign-up leaves no trace.

## 7. Make yourself an administrator

There is deliberately no admin sign-up form. The first admin is promoted by hand in the database, and every admin after that can be promoted from the **Accounts and roles** screen.

In Atlas, open **Browse Collections → `users`**, find your document and change `role` from `"vendor"` to `"admin"`. Or with `mongosh`:

```js
use city_of_software
db.users.updateOne({ email: "you@example.com" }, { $set: { role: "admin" } })
```

Then **sign out and back in** so the web app picks up your new role. The admin menu items (review queue, agency monitor, …) appear in the sidebar.

## 8. Pull in some real TORs

Now give the system something to work with. The extraction CLI shares its code with the scheduler. From `back-end/`, first do a **dry run**. It reads the live site and prints what it would store, and writes nothing:

```bash
npm run extract -- --source mol --pages 1 --max 5 --dry-run
```

Happy with the output? Run it for real, this time downloading the PDFs too:

```bash
npm run extract -- --source mol --pages 1 --max 5 --pre-award-only --attachments
```

> [!WARNING]
> This reads a **real government website**. The crawler is rate-limited (at least one second between requests), identifies itself honestly, and obeys `robots.txt`, but keep experimental runs small. `--max 5` caps the number of records.

You should now have a few TORs at `status: discovered`, and their PDFs in `back-end/storage/`. (`discovered` records are **not** visible to vendors.) Next, run the AI sweep:

```bash
npm run extract -- --extract-ai
```

- **With Google credentials:** Gemini reads each PDF and fills in up to 16 fields. Records land in the review queue with real confidence scores.
- **Without them:** the stub returns every field empty at confidence `0`. Records still land in the review queue, flagged as low-confidence, with only the scraped title, agency, stage and dates filled in. That is enough to explore the whole product.

## 9. Review and approve

Sign in as your admin and open **Review queue (คิวตรวจสอบ)** at `/admin/review`. You will see the records waiting, oldest first. Open one to see the extracted fields next to the original document, fix anything that is wrong, and press approve. It is now **published**.

Open **Browse TORs (ค้นหา TOR)** or **Advanced search (ค้นหาขั้นสูง)**. Your approved TOR is there. Open it to see the detail page.

Then try the vendor side. Sign in as a vendor (a second account, or a private window) and:

- open a TOR and look at the **qualification panel** and **key dates**,
- **save** it, add a private note, and open the **Dashboard**,
- save a second one and press **Compare**,
- set your alert frequency under **Settings**.

The [Vendor guide](guides/vendor-guide.md) walks through all of it, and the [Admin guide](guides/admin-guide.md) covers the other side.

## 10. Switch on the real services (optional)

| To get… | Do this | Details |
| --- | --- | --- |
| Real AI extraction | Create a Document AI processor and a service account, then set `GCP_PROJECT_ID`, `GCP_LOCATION`, `DOC_AI_PROCESSOR_ID` and `GOOGLE_APPLICATION_CREDENTIALS` | [Running the AI for real](../back-end/README.md#running-the-ai-for-real) |
| Real emails | Set `GMAIL_USER` and `GMAIL_APP_PASSWORD` (a Gmail *App Password*, never your normal password) or `RESEND_API_KEY` and `EMAIL_FROM` | [Configuration](configuration.md#email) |
| Daily crawling and digests | Set `SCHEDULER_ENABLED=true` on the machine that should crawl, and run **one** back-end | [Deployment](deployment.md#the-scheduler) |
| Auto-publish | Don't. It is off for a reason ([why](extraction-pipeline.md#132-per-field-confidence-and-the-safe-default-chain)) | |

> [!TIP]
> When you first try real credentials, set `EXTRACTION_MAX_DOCUMENTS=5`. It is a hard ceiling on how many documents the system will ever store or process, so a mistake costs pennies, not a budget.

## 11. Run the tests

```bash
cd back-end
npm test
```

About 200 tests finish in a few seconds. They need no database and no Google account. For the front-end, `npm run typecheck` and `npm run build` are the checks.

## Where next

- **Use it:** [Vendor guide](guides/vendor-guide.md) · [Admin guide](guides/admin-guide.md)
- **Understand it:** [Architecture](architecture.md)
- **Change it:** [Development guide](development.md)
- **Something broke:** [Troubleshooting](troubleshooting.md)
