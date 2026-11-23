# Status and limitations

What works, what needs configuration, what is missing, and what is known to be wrong. Written to be believed: where something only works under conditions, the conditions are stated.

> **How this was checked (3 November 2026).** By reading the code path for each user story, running the type checks (clean) and the back-end unit tests (205 passing), and running the search-sort code against sample data. It is **not** an end-to-end acceptance test against a live deployment. If something here disagrees with what you see, trust what you see and fix this page.

## Legend

| Mark | Meaning |
| :---: | --- |
| ✅ | Built, and works with the standard setup |
| ⚙️ | Built, but needs configuration (credentials) or is switched off by default |
| ⚠️ | Partly built, or built with a known defect |
| ❌ | Not built |

The "standard setup" is a MongoDB connection and the services running. "Needs configuration" almost always means *Gmail or Resend credentials*, *Google Cloud credentials*, or `SCHEDULER_ENABLED=true`.

---

## The 47 user stories

The stories come from the SRS; `US-nnn` is GitHub issue `nnn + 9`. Grouped by theme.

### Accounts and profiles (US-001 to US-006)

| Story | | Notes |
| --- | :---: | --- |
| US-001 Register with email and password | ⚙️ | Needs an email provider to *send* the link; without one the link is printed in the API terminal (development only) |
| US-002 Confirm my email | ⚙️ | As above |
| US-003 Declare my capability profile | ✅ | Three-step sign-up |
| US-004 Change my profile any time | ✅ | Versioned, with conflict detection |
| US-005 Log in, log out, recover a password | ⚙️ | Reset emails need a provider |
| US-006 See how complete my profile is | ✅ | Weighted score and a list of what is missing |

### Discovering TORs (US-007 to US-014)

| Story | | Notes |
| --- | :---: | --- |
| US-007 Browse every published TOR, newest first | ✅ | |
| US-008 Search by keyword | ✅ | Substring match over title, agency, technologies, project type and summary. No stemming or typo tolerance |
| US-009 Filter by agency | ✅ | |
| US-010 Filter by budget range | ✅ | |
| US-011 Filter by status and date range | ✅ | |
| US-012 Filter by technology and project type | ⚠️ | Technology works. **The Project Type filter returns nothing** ([bug 1](#known-bugs)) |
| US-013 Sort by deadline, budget or date | ⚠️ | Budget and date sorts work. **Closest / Furthest deadline are swapped**, and empty values sort first in descending orders ([bugs 2 and 3](#known-bugs)) |
| US-014 Search captured in the page address | ✅ | |

### The TOR page (US-015 to US-019)

| Story | | Notes |
| --- | :---: | --- |
| US-015 A standardised summary of each TOR | ⚙️ | Needs Google Cloud credentials. Without them the summary is empty |
| US-016 Open the original and see where and when it was captured | ✅ | Signed link valid 15 minutes |
| US-017 Requirements checked against my profile | ✅ | Never an eligibility verdict |
| US-018 Warn me about low-confidence fields | ✅ | Meaningful once the AI has run |
| US-019 Key dates with time remaining | ✅ | Within 7 days is emphasised |

### Alerts (US-020 to US-025)

| Story | | Notes |
| --- | :---: | --- |
| US-020 Alert when a matching TOR enters public comment | ⚠️ | Built, but **only fires when a crawl sees a published TOR change stage**. Needs email, and a crawl ([gap 1](#known-gaps)) |
| US-021 Second alert when it is formally announced | ⚠️ | Same trigger and same caveat |
| US-022 Instant or daily digest | ⚙️ | The digest needs the scheduler on (08:00 job) |
| US-023 Follow agencies and keywords | ✅ | Saved in Settings; feeds matching |
| US-024 See why a TOR matched me | ⚠️ | Works, but only 3 of the 5 dimensions (technology, agency, keyword) can match; nothing sets project-type or budget interests ([gap 3](#known-gaps)) |
| US-025 Unsubscribe in one click | ✅ | Link in every alert email; stops email only |

### My workspace (US-026 to US-031)

| Story | | Notes |
| --- | :---: | --- |
| US-026 Save a TOR | ✅ | |
| US-027 Private notes on a saved TOR | ✅ | Up to 2,000 characters; never exported |
| US-028 Compare TORs side by side | ✅ | 2 to 4 saved TORs |
| US-029 Calendar of deadlines | ✅ | Saved or all projects |
| US-030 Export a summary or comparison | ✅ | Opens a print view; save it as PDF from the browser |
| US-031 Dashboard of matches, saved TORs and deadlines | ✅ | Page is built. Note the story is still open on the GitHub board |

### Pricing analytics (US-032 to US-035)

| Story | | Notes |
| --- | :---: | --- |
| US-032 Historical budgets for comparable projects | ✅ | "Not enough data" below 5 records |
| US-033 How often each agency procures, and typical size | ✅ | |
| US-034 Flag a TOR whose budget is far from comparable ones | ⚙️ | The flag is computed by the outlier job (daily with the scheduler, or the CLI) |
| US-035 Which vendors have worked with an agency | ❌ | Not started; open on the board |

### Collection and extraction (US-036 to US-040)

| Story | | Notes |
| --- | :---: | --- |
| US-036 Check each agency site on a schedule | ⚙️ | Built, **off by default** (`SCHEDULER_ENABLED`) |
| US-037 Skip unchanged postings | ✅ | Content hash plus SHA-256 on files |
| US-038 Read scanned documents into structured fields | ⚙️ | Needs Google Cloud credentials |
| US-039 Hold low-confidence extractions for review | ✅ | With the shipped settings, *every* record is held |
| US-040 Detect duplicate postings | ⚠️ | Detection works and flags records. **Resolving a duplicate has no screen**, only the API |

### Administration (US-041 to US-047)

| Story | | Notes |
| --- | :---: | --- |
| US-041 Upload documents manually | ⚠️ | API only (`POST /review/tors`); no admin screen |
| US-042 A queue of TORs awaiting approval | ✅ | |
| US-043 Correct fields with the original beside me | ✅ | The original opens in a new tab beside the editor |
| US-044 Health of each agency adapter | ✅ | |
| US-045 An audit trail of every change | ✅ | See [the `actorId` note](#security-and-access) |
| US-046 Manage accounts and roles | ✅ | |
| US-047 Export the repository | ⚠️ | The screen is a **demo** that downloads three sample rows. A real export or backup is not built |

---

## Known bugs

Found while writing these docs. Each was reproduced against the code; none is fixed yet.

| # | Where | What happens | Why |
| ---: | --- | --- | --- |
| 1 | Advanced search → **Project Type** filter | Selecting any project type returns **no results** | The API's `filters.projectType` returns display labels (`"It System"`), the search page sends them back, and the filter matches stored values (`it_system`). Fix: send/accept the stored values, or map labels back in `listDocuments` |
| 2 | Advanced search → sort | **Closest Deadline** returns the latest deadline first and **Furthest Deadline** the earliest | In `sortTors` (`document.controller.ts`) the `direction` is `1` for *Furthest* and `-1` for *Closest*; it should be the reverse |
| 3 | Advanced search → descending sorts | In **Highest Budget** and **Closest Deadline**, TORs with no value come *first* | `compareNullable` puts missing values last, then the `-1` direction flips the whole result including them |

Checked by running the controller's own sort code on sample data: for three TORs (soon, later, undated) it returned `undated, later, soon` for *Closest Deadline*, `soon, later, undated` for *Furthest Deadline*, and `undated, later, soon` for *Highest Budget*.

## Known gaps

Behaviour that is intentional or incomplete, rather than broken.

1. **Approving a TOR sends no alert.** Alert fan-out has exactly one trigger: a crawl re-reads a TOR that is **already published** and sees its agency stage *change* (to `draft_tor` or `bidding_open`). A new listing, even if it is the next stage of a project you already know, is a new TOR and does not alert on creation. It is unclear how often a real listing changes its own stage between crawls, so alert volume in practice is unproven. Details: [Notifications](notifications-and-matching.md#when-an-alert-is-sent).
2. **`closed` and `archived` are never set.** They exist in the schema. A published TOR whose deadline has passed is hidden from default listings at read time, and the analytics read `published` and `closed`.
3. **Project-type and budget interests have no input.** `interests.projectTypes` and `interests.budgetRange` are matched by the engine but nothing in the API or UI writes them, so those two dimensions never fire. The highest reachable match score is 0.6.
4. **The admin "Run now" button does not download PDFs.** It runs one page and at most 10 records. A full run needs the CLI with `--attachments`, or the scheduler.
5. **Duplicate resolution and manual upload are API-only.** There is no button for `supersede` or `POST /review/tors`.
6. **The `reviewer` role has no extra powers.** The UI describes it as "reviews extracted data before publishing", but every review route is admin-only.
7. **No lawful BMA source.** The SRS scope names five agencies (MOL, DGA, MOC, BMA, ITD). The registry runs MOL, DGA, MOC, ITD **and DEPA**, and the only BMA entry (eGP BMA2) is blocked by its Terms of Service. A compliant BMA adapter does not exist yet. This was a conscious decision, not an oversight.
8. **Search is basic.** Regular-expression substring match; no stemming, typo tolerance or relevance model. "Highest Match %" counts matching search words.
9. **Placeholders in the UI.** `/ai-recommendations` ("Coming Soon"), the API-key section in Settings, the three alert toggles and the *saved searches* list in Settings (page-local only), and the landing page's headline numbers (static text).
10. **No account self-service beyond profile and password.** No email change, no account deletion, no 2FA, no "sign out everywhere" button.
11. **Only the Thai UI exists**, apart from the English Advanced search page.

## Security and access

| Item | Detail |
| --- | --- |
| **Two document endpoints are public** | `GET /api/documents/:id` returns the full stored record (including extracted text), and `GET /api/documents/:id/file` serves the bytes and only checks a token if one is sent. Anyone who knows a document id can read them, including documents of unpublished TORs |
| **`actorId` is client-supplied** | Review endpoints record the `actorId` from the request body. The web app sends the signed-in admin's own id, so its entries are accurate, but a direct API call could name anyone. Fix: read `req.authUser.id` instead |
| **Token in `localStorage`** | Standard trade-off; it would be exposed to any cross-site-scripting bug |
| **No general rate limiting** | Only the sign-in lockout and email cooldowns exist |
| **Public by design** | `GET /tors`, `GET /tors/:id`, `GET /tors/:id/documents`, `GET /documents`, `GET /agencies`. They return published records only |
| **Development secret** | Without `AUTH_SECRET`, development uses a built-in value. Production refuses to start without one |

## Operations

| Item | Detail |
| --- | --- |
| **One back-end instance only** | The scheduler lock is in memory. Two instances double-crawl |
| **Crawl-on-request is synchronous** | `POST /extraction/sources/:id/run` holds the request open |
| **PDFs on local disk** | The `tor-storage` volume must be backed up. There is no object storage yet |
| **The scheduler is off by default** | A fresh deployment collects nothing until `SCHEDULER_ENABLED=true` |
| **AI cost rails are manual** | `EXTRACTION_MAX_DOCUMENTS` (0 = unlimited) is a development safety net |
| **Model availability** | Only `gemini-2.5-flash` was confirmed reachable; lighter models returned "not found" on the project at last test (2026-09-14) |
| **Thresholds are unvalidated** | The duplicate threshold (0.65), outlier margin (1.5) and minimum comparable-set size (5) are sane defaults without a labelled data set to tune them against |
| **No integration or front-end tests** | Unit tests only; CI does not exercise the database or the UI |

## Housekeeping

Dead or leftover code, listed so nobody builds on it by mistake:

- The extraction CLI needs `MONGODB_URI` set even for `--list` and `--dry-run`. The settings modules were deliberately written to avoid that, but the alert code the crawl runner imports (`notifications/` → `services/email.service.ts`) pulls in `config/env.ts`, which throws without it. Harmless with a dummy value; worth fixing by reading the email settings from a database-free module.
- `models/Comparison.ts` is defined but unused; comparisons are computed, not stored.
- `models/VendorOnboarding.ts` is only referenced to clean up records from an older sign-up flow.
- `package.json` for the back-end says `"node": ">=18"`, but `@google-cloud/documentai` needs Node 22+ and the Docker images use 22.
- `front-end/data/mock-auth.ts` supplies only the `AppRole` type; the demo users in it are unused.
- `components/admin-audit-provider.tsx` keeps an in-memory feed that nothing displays any more.
- `npm run seed` inserts mock `Document` rows from before search moved to the `tors` collection; they no longer appear on the site.
- `Document` still carries legacy fields (`projectTitle`, `tenderStatus`, `agency`, `budget`, …) from the first search implementation.
- `Tor.lifecycle.signal` allows `authoritative`, `doc_type` and `title_keyword`, but the AI sweep also writes `ai_content` (through `updateOne`, which skips validation). Harmless today; a full-document `save()` that modified `lifecycle` would reject it. Add `ai_content` to the enum.
- Several `VendorProfile` fields are defined but never set or read: `companyNameEn`, `registrationNumber`, `companySize`, `foundedYear`, certification dates, `evidenceUrl`, and `notificationPrefs.minMatchScore`.

## Where to go next

Not commitments, only the gaps the code itself points at, roughly by value:

1. Fix the three search bugs (small, contained, high visibility).
2. Decide the alert trigger: also alert when a matching TOR is *published*, which is what vendors will expect.
3. Close the two public document endpoints and read `actorId` from the session.
4. Screens for duplicate resolution and manual upload.
5. A job queue behind crawl-on-request, and a database-backed scheduler lock so more than one instance is safe.
6. A compliant BMA source.
7. Object storage for PDFs.
8. Atlas Search (or similar) for Thai-aware, ranked search.
