# Admin guide

For platform administrators (the `admin` role). Your job in one line: **nothing reaches vendors until a person has looked at it, and you are that person.**

The admin screens are in Thai. Names below are given in English with the Thai label in parentheses. Becoming an admin is covered in [Getting started](../getting-started.md#7-make-yourself-an-administrator).

## Your week at a glance

| How often | Do this | Where |
| --- | --- | --- |
| Daily | Work the review queue until it is empty | **Review queue** (คิวตรวจสอบ) |
| Daily | Glance at source health; investigate anything that is not "normal" | **Adapter health** (สถานะตัวเชื่อมต่อ) |
| Weekly | Check that each source's newest announcement is recent | **Agency monitor** (ติดตามหน่วยงาน) |
| When someone joins or leaves | Grant or remove access | **Accounts and roles** (บัญชีและบทบาท) |
| When something looks off | Trace who changed what | **Audit log** (ประวัติการตรวจสอบ) |

The admin items appear in the sidebar once you are signed in as an admin. If you were promoted while signed in, sign out and in again.

---

## The review queue

This is the heart of the admin role. The crawler finds a posting, the AI reads its document, and the record lands here. By default **every record** waits for you, because auto-publish is off.

### The queue screen (`/admin/review`)

Pending TORs, **oldest first**, so nothing starves. Each row shows the title, agency, the AI's overall confidence, the submission deadline, and a marker if the system suspects it **duplicates another record**. Three counters on top:

| Counter | Meaning |
| --- | --- |
| Total waiting (รอตรวจสอบทั้งหมด) | Everything in `pending_review` |
| May duplicate another (อาจซ้ำกับรายการอื่น) | The duplicate detector linked it to a similar existing record |
| High confidence, ready to consider (ความเชื่อมั่นสูง) | Overall confidence of 0.75 or more (fixed in the screen, matching the default review threshold): the quickest ones to check |

High confidence is **not** permission to skip the check. It means the AI found and quoted most of what it looked for, not that it read it correctly.

### Reviewing one record (`/admin/review/<id>`)

The page has three parts: an **overview**, the **extracted data** you can edit, and the **actions**. Open the **original document (เอกสารต้นฉบับ)** in a new tab and read it beside the fields.

Each field shows the AI's value and its confidence. A field below the threshold is marked **Low confidence, check against the original (ความเชื่อมั่นต่ำ — ตรวจสอบกับเอกสารต้นฉบับ)**. A blank field means the AI found nothing it could quote, which is fine if the document really has none.

A good review takes a minute or two:

1. **Is it software procurement at all?** Non-software postings (furniture, construction, printing) should be **rejected**.
2. **Is there a source document, and is it the right one?** Nothing may publish without one.
3. **Check the facts a vendor will act on:** title, agency, **submission deadline**, **budget**, procurement method, and the requirement list.
4. **Check the stage.** If the document is really a winner announcement or a cancellation, vendors should not see it as open. Reject it.
5. **Look at the duplicate marker.** If it is a repost of a record you already have, [mark it superseded](#resolving-duplicates).
6. **Fix what is wrong**, then **Approve**.

### Correcting a field

Edit the value and save. Accepted values are checked by the **same rules the AI's output goes through**: numbers may contain commas, dates must parse, complexity is `low`, `medium` or `high`, procurement method must be one of the allowed values. A value that does not parse is **rejected with a message**, never half-saved.

Two things to know:

- **Your correction is permanent.** The field is recorded as human-corrected and a later re-extraction of the same TOR will **not** overwrite it.
- **Each correction is audited** with the before and after values.

### Approve or reject

| Action | Effect |
| --- | --- |
| **Approve** | The record becomes `published` and is immediately visible to vendors. Your decision is audited |
| **Reject** | A **reason is required**. The record becomes `rejected`, is kept for history, and is never shown to vendors. Audited with the reason |

Both only work on records that are still pending; if someone else got there first you will see a "not pending" message.

### Resolving duplicates

The detector scores every *newly created* TOR against the existing ones (title similarity, same agency, same reference number, budget and date proximity). It **only suggests**; it never merges. When you confirm that record A is a repost of B, mark A as superseded by B.

There is no button for this yet. Use the API with your token (it comes back from `POST /auth/login`); the audit log records you as the actor automatically:

```bash
curl -X POST http://localhost:4000/api/review/queue/<A_id>/supersede \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"targetTorId":"<B_id>","reason":"Same announcement reposted"}'
```

A becomes `superseded` and points at B, which stays the single published record. B must not be rejected, superseded or archived.

### Adding a TOR by hand

When an agency's site has changed shape and the crawler cannot read it, you can still keep that agency visible to vendors by uploading the document yourself. It follows the same path as a crawled TOR (AI extraction, confidence routing, your review). There is no screen for this yet:

```bash
curl -X POST http://localhost:4000/api/review/tors \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/tor.pdf;type=application/pdf" \
  -F "agencyId=<agency id>" -F "title=ร่างขอบเขตของงาน (TOR) …" \
  -F "submissionDeadline=2026-12-01" -F "budgetAmountThb=1500000"
```

Agency ids come from `GET /api/agencies`. The file is required: one real PDF of up to 20 MB, and where malware scanning is on (the production default) it must also pass a ClamAV scan before anything is stored. [Troubleshooting](../troubleshooting.md#uploading-a-pdf-fails) explains each refusal. The record starts as `discovered` and appears in your queue after the next AI sweep (every 30 minutes when the scheduler is on, or `npm run extract -- --extract-ai`).

---

## Agency monitor (`/admin/agency-monitor`)

Every registered source with its **Terms-of-Service status**, last check, last success and health. From here you can run a source on the spot.

> [!NOTE]
> **Run now is deliberately small:** one listing page, at most 10 records, and it does **not** download PDFs. It exists to check that a source is alive and to pick up the newest postings. TORs found this way have no document yet, so they only reach your queue after the 24-hour "no document" grace period. Use the CLI with `--attachments` (or the scheduler, which downloads attachments) for a full run.

### Source compliance

| Label | Meaning |
| --- | --- |
| **Unverified (ToS)** | The agency's site has no Terms of Service we could find. That is *not* the same as permission. The crawler is polite and honours `robots.txt`, but treat it as unverified |
| **Blocked (ถูกบล็อกตามข้อกำหนด)** | The site's Terms of Service forbid crawling. Currently **eGP BMA2**. It is excluded from the schedule and refuses to run |

**Do not run a blocked source without the agency's written sign-off.** If you have it, the API requires both an `approvedBy` name and a `reason`, and records them on the job. The browser button will not do this for you.

### Scheduling

The screen notes that automatic collection is configured on the server, but it does **not** show whether the scheduler is actually running. That is controlled only by the server's `SCHEDULER_ENABLED` and `CRON_*` settings ([Configuration](../configuration.md#scheduler)); there is nothing to switch here. To check, look for `registered crawl for …` lines in the API's start-up log, or for crawl jobs with `trigger: "scheduled"` in `GET /api/extraction/jobs`.

---

## Adapter health (`/admin/adapter-health`)

A roll-up of each source's five most recent runs, computed on request:

| Status (Thai) | Means | What to do |
| --- | --- | --- |
| **Healthy** (ปกติ) | Recent runs fine; newest announcement is recent | Nothing |
| **Stale** (ข้อมูลเก่า) | The newest announcement the source has ever shown is older than 60 days | Check the agency's site by hand. Either it has genuinely posted nothing, or the crawler is reading a stale page or the wrong list |
| **Format suspected** (รูปแบบเว็บไซต์อาจเปลี่ยน) | The latest run found rows but **none** had a parseable date | Almost always a changed page layout. Run a dry run from the CLI and look at the output; the adapter's selectors probably need updating |
| **Error** (ผิดพลาด) | The latest run logged errors, or two in a row did, or a run was left "running" (the process probably died) | Open the job (`GET /extraction/jobs/<id>`) and read `errors` |
| **Blocked** (ถูกบล็อกตามข้อกำหนด) | Terms of Service forbid it | Expected for eGP BMA2 |
| **Never run** (ยังไม่เคยรัน) | No job exists for this source | Run it once |

A run that was *skipped* by the compliance gate neither breaks nor extends an error streak, because refusing to run is not a failed fetch. The point of this screen is to find out a source has gone quiet **before vendors do**.

---

## Accounts and roles (`/admin/accounts`)

Everyone on the platform, with organisation, role and status (active, awaiting email verification, or suspended), plus counts at the top. (The API also returns each account's last sign-in time; the screen does not show it.)

| Role | What it can do |
| --- | --- |
| **Vendor** (ผู้ขาย) | Search, save, compare, get alerts, manage their own profile |
| **Reviewer** (ผู้ตรวจสอบ) | A BMA official. Can sign in and use analytics. *Today the review queue is admin-only; this role has no extra powers yet* |
| **Admin** (ผู้ดูแลระบบ) | Everything on this page, plus the review queue, crawl control and audit log |

You can **change a role** or **suspend / restore** an account (each asks you to confirm). Rules:

- You **cannot change your own** role or status. That is a safeguard against locking out the last admin.
- A change **ends that person's sessions immediately**. They are signed out on their next request.
- A suspended account cannot sign in. Nothing is deleted.
- Every change is written to the audit log with the old and new value.

Grant **admin** sparingly: an admin can publish anything a vendor will rely on.

---

## Audit log (`/admin/audit-log`)

A permanent record of what **people** did, newest first, searchable by actor, action or record id.

| Action | When |
| --- | --- |
| `tor.import` | A TOR was created by hand |
| `tor.approve` / `tor.reject` | A review decision (reject carries its reason) |
| `tor.supersede` | A duplicate was resolved |
| `tor.correct_fields` | One or more fields were edited (with before and after) |
| `user.role.updated` / `user.status.updated` | An account changed |

It deliberately **does not** record what the AI did. To trace an AI-written value, look at the TOR's `extraction` block (model, prompt version, timestamp) and the extraction jobs (`GET /extraction/ai-jobs`). Between the two, any published value can be traced to its origin, human or machine.

> [!NOTE]
> Every entry records the admin who was signed in, taken from the session, so attribution holds whether the action came from the web app or a direct API call. Entries are append-only: the application cannot edit or delete them. For production, also give the API's database user no update or delete rights on the `auditlogs` collection.

---

## Export (`/admin/export-repository`)

> [!WARNING]
> **This screen is a demonstration.** It downloads three hard-coded sample rows as JSON or CSV in your browser. It does **not** export the real repository, and it is not a backup. Back up the database and the PDF volume directly (see [Deployment](../deployment.md#backups)).

---

## Things you do outside the browser

Some operations have no screen yet. All of them are safe to run against a live system.

| Task | How |
| --- | --- |
| Full crawl with PDFs | `npm run extract -- --source <id> --attachments` |
| Run the AI sweep now | `npm run extract -- --extract-ai` |
| Recompute outlier flags | `npm run extract -- --analyze-outliers` |
| Check a source after a site redesign | `npm run extract -- --source <id> --dry-run` |
| See what the AI did for a record | `GET /api/extraction/ai-jobs?torId=<id>` |
| See crawl history | `GET /api/extraction/jobs?sourceId=<id>` |

In Docker, run the CLI inside the container: `docker compose exec back-end node dist/extraction/cli.js --list`. Details in [Extraction pipeline](../extraction-pipeline.md) and [Deployment](../deployment.md).

## Ground rules

1. **Don't switch on auto-publish** without a deliberate, documented decision. It is off because the conservative default is manual review for every record, and an AI reading a scanned page can be confidently wrong.
2. **Never run a blocked source** without the agency's sign-off.
3. **Reject, don't ignore.** A pending record that nobody wants clutters the queue. Reject it with a reason.
4. **Correct at the source of truth.** If the document and the AI disagree, the document wins. Fix the field.
5. **Keep the number of admins small.**
