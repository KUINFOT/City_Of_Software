# API reference

Every HTTP endpoint the back-end serves, with who may call it, what it accepts and what it returns. Response bodies below are **illustrative**: the shape is exact, the values are made up.

- [Conventions](#conventions)
- [Health](#health) · [Auth](#auth) · [TORs](#tors) · [Search](#search) · [Documents](#documents) · [Agencies](#agencies)
- [Vendor profile](#vendor-profile) · [Saved TORs](#saved-tors) · [Compare](#compare) · [Notifications](#notifications) · [Analytics](#analytics)
- [Review queue (admin)](#review-queue-admin) · [Extraction (admin)](#extraction-admin) · [Accounts and audit log (admin)](#accounts-and-audit-log-admin)
- [Reference tables](#reference-tables)

---

## Conventions

**Base URL.** `http://localhost:4000/api` locally. Everything is under `/api`.

**Format.** Requests and responses are JSON (`Content-Type: application/json`), except the two file-upload routes, which are `multipart/form-data`. JSON and form bodies may be up to **100 KB**; uploads are one PDF of up to 20 MB. Dates are ISO 8601 in UTC. Ids are 24-character MongoDB ObjectIds as strings. Money is a plain number in Thai baht (THB), nominal.

**Response headers.** Every response carries an `X-Request-ID` (quote it when reporting a problem; it also appears in the server's logs), `Cache-Control: no-store`, and security headers: `Strict-Transport-Security`, a deny-all `Content-Security-Policy` and `Referrer-Policy: no-referrer`.

**Rate limits.** Per client IP: 10 per 15 minutes for `POST /auth/login` and the Google sign-in endpoints, 20 per 15 minutes for the other `POST` routes under `/auth`, and 120 per minute for every write (`POST`, `PUT`, `PATCH`, `DELETE`) anywhere. Reads are not limited. Over a limit: **429** `{"error":"Too many requests. Please try again later."}` with standard `RateLimit` and `RateLimit-Policy` headers.

**Authentication.** Protected routes need the token from `POST /auth/login`:

```
Authorization: Bearer <token>
```

The **Auth** column below uses these labels:

| Label | Meaning |
| --- | --- |
| Public | No token needed |
| Signed in | Any active account, any role |
| Owner or admin | The account the resource belongs to, or an admin |
| Vendor | An active account with role `vendor` |
| Admin | An active account with role `admin` |

A missing, expired or revoked token gives **401** `{"error":"Please sign in again to continue."}`. The wrong role gives **403** (`"A vendor account is required."` or `"Administrator access is required."`). See [Authentication](authentication.md).

**Errors.** Always `{ "error": "human-readable message" }`.

| Status | Typical meaning |
| --- | --- |
| 400 | Validation failed; the message says what |
| 401 | Not signed in, or the session ended |
| 403 | Signed in with the wrong role, suspended, or not verified |
| 404 | Not found. Also returned for records that exist but are not published, so the API never reveals unpublished records |
| 409 | The record is in the wrong state (for example approving something that is not pending), or the resource already exists |
| 415 | The upload is not a real PDF |
| 422 | The upload failed the malware scan |
| 429 | Too many attempts: the sign-in lockout, the verification-email cooldown, or a [rate limit](#conventions) |
| 500 | Unexpected error. The body is always the generic `{"error":"Internal Server Error"}`; the details go to the server's log |
| 503 | A dependency is unavailable (the breached-password check, the malware scanner, Google sign-in not configured), or a sign-up, sign-in or profile route failed unexpectedly |

**Lists.** There is no pagination. Several endpoints take `limit`; the defaults and maximums are stated where they apply.

**Unknown routes** return `404 { "error": "Route not found." }`.

> [!NOTE]
> A malformed id (not 24 hex characters) gets the same **404** as a missing record on the TOR and document routes, and 404 or 400 on saved-TOR, analytics and supersede routes. The other review-queue routes (`GET`, `PATCH`, `approve`, `reject` on `/review/queue/:id`) still pass it to the database driver and answer **500**.

---

## Health

### `GET /health`

Public. Answers without touching the database, so it is also the container health check.

```json
{ "status": "ok", "timestamp": "2026-11-03T03:00:00.000Z" }
```

---

## Auth

Background and flow diagrams: [Authentication](authentication.md).

### `POST /auth/register`

Public. Step one of sign-up.

| Body field | Notes |
| --- | --- |
| `name`, `organization`, `phone` | Required text |
| `email` | Required; lower-cased |
| `password` | Required; at least 10 characters, not a very common password, not found in a known data breach |
| `role` | `vendor` (default) or `reviewer` |

| Result | Meaning |
| --- | --- |
| **200** `{ "message", "nextStep": "vendor_onboarding" }` | Vendor: the address is free. Continue to the profile step. **Nothing has been saved or sent** |
| **202** `{ "message", "nextStep": "verify_email" }` | BMA official: the verification email has been sent |
| 400 | A field is missing or invalid, or the password appears in a known data breach |
| 409 | A verified account already uses this email |
| 503 | The breached-password check could not be reached; try again |

### `POST /auth/complete-vendor-onboarding`

Public. Step two for vendors. Validates the profile, then sends the verification email. The sign-up details are encrypted into the link; nothing is stored yet.

```json
{
  "registration": {
    "name": "Anont S.", "organization": "Bangkok Innovations Ltd.",
    "email": "anont@example.com", "phone": "0812345678",
    "password": "a-long-passphrase", "role": "vendor"
  },
  "profile": {
    "organizationType": "company",
    "companyName": "Bangkok Innovations Ltd.",
    "techStack": ["React", "Node.js"],
    "serviceCategories": ["web application"],
    "yearsExperience": 6,
    "teamSize": 12,
    "certifications": [{ "name": "ISO 27001", "issuer": "BSI" }],
    "pastContracts": [{ "agencyName": "Bang Rak District", "projectTitle": "Permit portal", "contractValueThb": 1200000, "year": 2025 }]
  }
}
```

Returns **200** `{ "message", "email" }`. Profile rules are listed under [`PUT /vendor-profiles/:userId`](#put-vendor-profilesuserid). 400 for an invalid profile or a breached password, 409 if the email is already registered, 503 if the breached-password check could not be reached.

### `POST /auth/verify-email`

Public. Body `{ "token" }`. The email's link is `<APP_URL>/verify-email#token=…`: the web app reads the token from the URL fragment and posts it here. Creates the account: **200** `{ "message": "Your email address has been verified." }`, or **400** `{ "error": "This verification link is invalid or expired." }`.

### `POST /auth/resend-verification`

Public. Body `{ "email" }`. Answers `200 { "message": "If this account needs verification, a new email has been sent." }` whether or not the address exists. **429** if a verification email was already requested for the account in the last minute; **400** for a malformed address.

### `POST /auth/login`

Public.

```json
{ "email": "anont@example.com", "password": "a-long-passphrase" }
```

```json
{
  "user": {
    "id": "6730a1c2f1e4b2a3c4d5e6f7", "name": "Anont S.", "email": "anont@example.com",
    "organization": "Bangkok Innovations Ltd.", "role": "vendor", "phone": "0812345678", "status": "active"
  },
  "token": "eyJzdWIiOiI2NzMw….mQ1x…"
}
```

| Status | When |
| --- | --- |
| 400 | Missing or malformed email or password |
| 401 | Wrong email or password (same message for both) |
| 403 | Suspended, or email not verified (`code: "EMAIL_NOT_VERIFIED"`) |
| 429 | Five failed attempts on the account (locked for 15 minutes), or the per-IP sign-in limit |

### `POST /auth/logout`

Revokes the session behind the token. **204**, always, even for a missing or invalid token.

### `POST /auth/forgot-password`

Public. Body `{ "email" }`. Always `200 { "message": "If an account exists for this email, a password reset link has been sent." }`.

### `POST /auth/reset-password`

Public. Body `{ "token", "password" }`. The email's link is `<APP_URL>/reset-password#token=…`; the page takes the token from the URL fragment. **200** `{ "message" }` and every session of that account is revoked. **400** for a weak or breached password, or an invalid or expired token. **503** if the breached-password check could not be reached.

### Google sign-in

Optional: every route below answers as "unavailable" until `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` and `GOOGLE_OAUTH_REDIRECT_URI` are set. The flow is described in [Authentication](authentication.md#signing-in-with-google).

| Route | Auth | What it does |
| --- | --- | --- |
| `GET /auth/google` | Public | **302** to Google's consent screen, or to `/login?oauth=unavailable` when not configured |
| `GET /auth/google/callback` | Public | Google's redirect target (`GOOGLE_OAUTH_REDIRECT_URI`); not called from code. Ends in a **302** to the web app (see below) |
| `POST /auth/google/complete` | Public | Body `{ "token" }`, the one-use handoff from the callback. **200** `{ user, token }`, the same as `POST /auth/login`. **400** invalid or expired (60 seconds), **403** account not available |
| `POST /auth/google/onboarding/details` | Public | Body `{ "token" }`, the onboarding token. **200** `{ "name", "email", "avatarUrl" }` from Google, to pre-fill the form. **400** invalid or expired |
| `POST /auth/google/onboarding` | Public | Body `{ "token", "name", "organization", "phone", "role" }` (`role`: `vendor` or `reviewer`). Creates the account, already verified. **201** `{ user, token }`. **400** missing fields or expired token, **409** the Google account or the email already has an account |
| `GET /auth/google/link-status` | Signed in | **200** `{ "linked": true \| false }` |
| `POST /auth/google/link` | Signed in | Starts connecting Google to the signed-in account. **200** `{ "authorizationUrl" }` to open in the browser. **409** a Google account is already connected, **503** not configured |

Where the callback sends the browser:

| Destination | Meaning |
| --- | --- |
| `/login#google_login=…` | Signed in: the page posts the handoff to `POST /auth/google/complete` |
| `/oauth-onboarding#onboarding=…` | New to the platform: complete the form within 10 minutes |
| `/login?oauth=link_required` | An account with this email exists but has not connected Google; connect it from Settings first |
| `/login?oauth=not_registered` | The matching account is not verified or not active |
| `/login?oauth=denied` · `invalid` · `unavailable` | Google refused, the request was not valid, or Google sign-in is not configured |
| `/settings?google=linked` · `denied` · `expired` · `conflict` · `unavailable` | Outcome of connecting Google from Settings (`conflict`: that Google account belongs to another user) |

---

## TORs

Only **published** TORs are ever returned here. A TOR in any other status gets the same 404 as one that does not exist.

### `GET /tors`

Public. Published TORs, newest first, excluding any whose submission deadline has already passed (a TOR with no deadline is kept). A deadline of "today" still counts as open.

| Query | Default | Notes |
| --- | --- | --- |
| `limit` | 50 | Maximum 200 |

Returns an array:

```json
[
  {
    "_id": "6730a1c2f1e4b2a3c4d5e6f7",
    "title": "ร่างขอบเขตของงาน (TOR) ระบบสารสนเทศ…",
    "agencyName": "Ministry of Labour",
    "budget": { "amountThb": 1500000 },
    "timeline": { "submissionDeadline": "2026-12-01T00:00:00.000Z" },
    "lifecycle": { "stage": "draft_tor" },
    "createdAt": "2026-10-20T03:00:12.000Z"
  }
]
```

A parent object (`budget`, `timeline`, `lifecycle`) is omitted entirely when nothing beneath it is set.

### `GET /tors/:id`

Public. The full detail page payload.

```json
{
  "_id": "6730a1c2f1e4b2a3c4d5e6f7",
  "title": "…",
  "agencyName": "Ministry of Labour",
  "agencyContact": null,
  "status": "published",
  "projectType": "it_system",
  "lifecycle": { "stage": "draft_tor", "stageLabel": "…", "isAwarded": false, "signal": "title_keyword" },
  "timeline": { "announcementDate": "2026-10-18T00:00:00.000Z", "submissionDeadline": "2026-12-01T00:00:00.000Z" },
  "source": { "sourceUrl": "https://…", "importMethod": "scrape", "discoveredAt": "2026-10-20T03:00:12.000Z" },
  "documentCount": 1,
  "keyDates": [
    { "key": "announcementDate", "date": "2026-10-18T00:00:00.000Z", "daysRemaining": -16, "isPast": true, "isUrgent": false },
    { "key": "submissionDeadline", "date": "2026-12-01T00:00:00.000Z", "daysRemaining": 28, "isPast": false, "isUrgent": false }
  ],
  "qualifications": { "minContractValueThb": 1000000, "requiredCertifications": [], "requiredExperienceYears": 3, "items": ["…"] },
  "summaryAi": {
    "text": "…", "model": "gemini-2.5-flash", "generatedAt": "2026-10-20T04:00:00.000Z", "confidence": 0.9,
    "machineGenerated": true, "authoritative": false
  },
  "fields": {
    "title":  { "value": "…", "confidence": 0.98, "caution": false },
    "budget": { "value": 1500000, "confidence": 0.42, "caution": true }
  },
  "overallConfidence": 0.81,
  "outlier": {
    "isOutlier": true, "reason": "outlier", "comparableCount": 9, "deviationPct": 212.5,
    "basis": { "agencyId": "…", "projectType": "it_system", "year": 2026 },
    "signal": "This is a statistical signal for further inquiry, not a finding of wrongdoing."
  }
}
```

- `keyDates` always has seven entries (announcement, comment start, comment end, clarification meeting, submission deadline, contract start, contract end). A missing date has `date: null`. `daysRemaining` is rounded up and negative once past; `isUrgent` means 0 to 7 days away (`KEY_DATE_URGENT_WITHIN_DAYS`).
- `fields` has **all 16** extraction fields ([list](#extracted-fields)). `caution` is `true` when the field's confidence is below `EXTRACTION_REVIEW_THRESHOLD`, computed at request time.
- `summaryAi` is **always** labelled `machineGenerated: true, authoritative: false`.
- `outlier` is `null` when never evaluated, and always carries the "not a finding of wrongdoing" disclaimer when present. `isOutlier: null` means "not enough data to say".

### `GET /tors/:id/documents`

Public. The original documents behind a TOR, each with a signed, time-limited download link.

```json
{
  "documents": [
    {
      "_id": "6730b2…", "originalName": "TOR.pdf", "mimeType": "application/pdf", "size": 1048576,
      "sourceUrl": "https://example.go.th/files/tor.pdf", "label": "ร่างขอบเขตของงาน (TOR)",
      "capturedAt": "2026-10-20T03:00:20.000Z",
      "fileUrl": "/documents/6730b2…/file?token=eyJ…"
    }
  ]
}
```

`fileUrl` is relative to the API base URL and valid for **15 minutes**. It is `null` when no bytes were stored for that document.

### `GET /tors/:id/qualification-match`

**Vendor.** Compares the TOR's stated requirements with *your* declared profile. It never produces an eligibility verdict.

```json
{
  "overallStatus": "gaps_found",
  "requirements": [
    { "type": "certification", "required": "ISO 27001", "declared": "ISO 27001", "status": "met", "gap": null },
    { "type": "contract_value", "required": "1,000,000 THB", "declared": "200,000 THB", "status": "not_met",
      "gap": "ต้องมีมูลค่าสัญญาสะสมอย่างน้อย 1,000,000 THB แต่โปรไฟล์แจ้งไว้ 200,000 THB" },
    { "type": "experience_years", "required": "3 ปี", "declared": null, "status": "undetermined", "gap": null }
  ]
}
```

- `type`: `certification`, `contract_value`, `experience_years`.
- `status`: `met`, `not_met`, or `undetermined` (the profile does not declare that value).
- `overallStatus`: `all_met`, `gaps_found`, `undetermined`, `no_requirements`.

A guest gets 401; the web app shows a "register to see this" prompt instead.

### `GET /tors/:id/match-reasons`

**Vendor.** Why this TOR fits your profile, computed live.

```json
{
  "score": 0.4,
  "reasons": [
    { "type": "technology", "label": "เทคโนโลยีที่ตรงกัน", "detail": "โครงการนี้ต้องการ React ซึ่งตรงกับเทคโนโลยีที่คุณระบุไว้ในโปรไฟล์" },
    { "type": "agency", "label": "หน่วยงานที่ติดตาม", "detail": "…" }
  ]
}
```

`type` is one of `technology`, `project_type`, `budget`, `agency`, `keyword`. `score` is the matched fraction of five dimensions. See [Notifications and matching](notifications-and-matching.md#why-did-this-match-me).

---

## Search

### `GET /documents`

Public. The advanced-search endpoint. **The name is historical:** it searches published **TORs**, not the `documents` collection. The shape of the response is kept for the search page.

| Query | Meaning |
| --- | --- |
| `q` | Space-separated terms. **Every** term must appear (case-insensitive substring) in at least one of: title, agency name, technologies, project type, AI summary |
| `availability` | `all` also includes TORs whose deadline has passed. Anything else (default) shows only open or undated ones |
| `technology` | Repeatable. A TOR matches if any of its technology tags equals one of the values (exact) |
| `projectType` | Repeatable. Matches the **stored value**: `web_application`, `mobile_application`, `it_system`, `other` |
| `agency` | Repeatable. Exact agency name as stored on the TOR: crawled TORs carry the **English** name (`Ministry of Labour`), hand-created ones the Thai name. Use the values from the response's `filters.agency` |
| `status` | Repeatable: `draft_feedback` (plan, draft TOR, spec, price reference), `open_for_bids` (bidding open), `under_review` (other), `closed` (awarded, cancelled) |
| `budgetMin`, `budgetMax` | THB |
| `publishedAfter`, `publishedBefore` | Announcement date, any date string |
| `deadlineAfter`, `deadlineBefore` | Submission deadline |
| `sort` | `Highest Match %`, `Lowest Budget`, `Highest Budget`, `Newest`, `Oldest`, `Closest Deadline`, `Furthest Deadline`. Without it, no order is guaranteed |

`Highest Match %` counts how many of your search terms occur in the TOR's text; it is not a relevance model.

> [!WARNING]
> **Two known sort bugs** (checked against the code, 2026-11-03). `Closest Deadline` and `Furthest Deadline` are swapped: the first returns the *latest* deadline first, the second the earliest. And in `Highest Budget` and `Closest Deadline` a TOR with no value for the sorted field comes *first* instead of last. See [Status](status.md#known-bugs).

```json
{
  "documents": [
    {
      "_id": "6730a1c2f1e4b2a3c4d5e6f7",
      "projectTitle": "ระบบสารสนเทศ…",
      "agency": "Ministry of Labour",
      "budget": "฿ 1,500,000",
      "deadline": "2026-12-01T00:00:00.000Z",
      "technology": "React, Node.js",
      "projectType": "It System"
    }
  ],
  "filters": {
    "technology": ["Node.js", "React"],
    "projectType": ["It System"],
    "agency": ["Ministry of Labour"]
  }
}
```

`budget` is a pre-formatted string (empty when unknown). `filters` lists the distinct values **within the current result**, so the options narrow as you filter.

> [!WARNING]
> **Known mismatch.** The response's `filters.projectType` contains display labels such as `"It System"`, but the `projectType` *query* parameter matches stored values such as `it_system`. A client that feeds the labels back as filter values will get no results. The search page currently does exactly that, so its Project Type filter returns nothing. Until it is fixed, pass the stored values. (Tracked in [Status](status.md#known-bugs).)

---

## Documents

The `documents` collection holds the source files behind TORs. Most of these routes exist for the admin tools and predate the TOR model.

### `GET /documents/:id`

Public. Returns the stored `Document` record, including extracted text.

> [!WARNING]
> This is not authenticated and not limited to documents of published TORs. See [what this does not do yet](authentication.md#what-this-does-not-do-yet).

### `GET /documents/:id/file`

Public route, but a signed link is **mandatory**: query `token` must be a valid, unexpired token for exactly this document, else **403** `{"error":"This link has expired or is no longer valid."}`. Tokens are handed out by `GET /tors/:id/documents` (published TORs) and by the admin review record, each after its own access check, and last 15 minutes. Streams the original bytes with the right `Content-Type`, inline. **404** when the document has no stored bytes (only the legacy `POST /documents/upload` path produces those).

### `POST /documents/upload`

**Admin.** Legacy utility. `multipart/form-data`, field `file` (one PDF, up to 20 MB) plus optional text fields `projectTitle`, `datePublished`, `deadline`, `agency`, `budget`, `technology`, `projectType`. The same upload checks as [`POST /review/tors`](#post-reviewtors) apply. Runs OCR (Document AI, or the stub) and stores a `Document` that is **not linked to any TOR** and does not appear in search. **201** with the document. To add a TOR by hand, use [`POST /review/tors`](#post-reviewtors).

### `POST /documents/:id/summarize`

**Admin.** Legacy utility. Runs Gemini over the document's stored text, saves the summary on the document, returns it.

---

## Agencies

### `GET /agencies`

Public. Active agencies, sorted by name; feeds the "follow this agency" picker.

```json
[{ "_id": "6730…", "name": "กระทรวงแรงงาน", "nameEn": "Ministry of Labour", "agencyType": "department" }]
```

Agencies appear after their first crawl (the crawler creates them).

---

## Vendor profile

### `GET /vendor-profiles/:userId`

**Owner or admin.** Returns the current declared profile and how complete it is.

```json
{
  "profile": { "userId": "…", "organizationType": "company", "companyName": "…", "techStack": ["React"], "profileVersion": 3, "…": "…" },
  "completeness": {
    "score": 70, "earnedWeight": 70, "totalWeight": 100,
    "missingFields": [{ "key": "certifications", "weight": 10 }, { "key": "pastContracts", "weight": 10 }]
  }
}
```

`profile` is `null` if none exists. Completeness is a transparent weighted checklist ([weights](notifications-and-matching.md#profile-completeness)).

### `PUT /vendor-profiles/:userId`

**Owner or admin.** Creates or updates the profile. Capability changes create a new **version** and keep the old one in `profileHistory`.

| Field | Rules |
| --- | --- |
| `organizationType` | `company` or `freelancer` (required). A company also needs `companyName` |
| `techStack`, `serviceCategories` | Arrays of text; **at least one item across the two** is required. Up to 30 each, de-duplicated |
| `yearsExperience` | 0 to 100 |
| `teamSize` | 1 or more |
| `certifications` | Up to 20, each `{ name (required), issuer }` |
| `pastContracts` | Up to 20, each `{ projectTitle (required), contractValueThb (≥ 0, required), agencyName, year }`. `totalContractValueThb` is computed from them |
| `notificationPrefs.frequency` | `instant` or `daily_digest` |
| `interests.agencyIds`, `interests.keywords` | The followed-agencies and followed-keywords watchlist |
| `expectedVersion` | Optional integer. If it differs from the stored `profileVersion`, the save is refused with **409** ("This profile changed in another session…"). Use it to avoid overwriting a concurrent edit |

The frequency and watchlist are *delivery settings*, saved without creating a new profile version. Responds like `GET`. **400** with a plain message for any rule above.

### `GET /vendor-profiles/unsubscribe?token=…`

Public, no session. The one-click link in alert emails. Removes the `email` channel from the vendor's notification preferences (in-app alerts stay) and **302-redirects** to `/unsubscribed?status=unsubscribed` or `?status=invalid`.

---

## Saved TORs

All **Vendor**. A saved TOR is a *bookmark*; the private note belongs to the bookmark, never to the TOR.

### `PUT /tors/:id/bookmark`

Save a published TOR. Safe to repeat. **200** `{ "saved": true, "torId": "…" }`; **404** if it is not a published TOR.

### `DELETE /tors/:id/bookmark`

Unsave. Also safe to repeat. **200** `{ "saved": false, "torId": "…" }`.

### `PATCH /tors/:id/bookmark/note`

Body `{ "note": "text" }` (up to 2,000 characters). **200** `{ "torId", "note" }`. **404** "Save this TOR before adding a private note." if it is not saved. **400** if `note` is not a string or is too long.

### `GET /bookmarks`

Your shortlist, newest save first. TORs that have since been unpublished are left out.

```json
{
  "bookmarks": [
    {
      "savedAt": "2026-10-26T09:12:00.000Z",
      "note": "ทีมเห็นด้วย ส่งใบเสนอราคาก่อนศุกร์",
      "tor": {
        "_id": "6730…", "title": "…", "agencyName": "…",
        "budget": { "amountThb": 1500000, "isEstimated": true, "vatBasis": "unstated" },
        "timeline": { "submissionDeadline": "2026-12-01T00:00:00.000Z" },
        "projectType": "it_system", "lifecycle": { "stage": "draft_tor" }
      }
    }
  ]
}
```

---

## Compare

### `POST /comparisons/preview`

**Vendor.** Side-by-side data for 2 to 4 TORs **from your saved list**. Computed on the fly, never stored.

```json
{ "torIds": ["6730…a", "6730…b"] }
```

Returns `{ "tors": [ … ] }` in the order you sent. Each entry has `_id`, `title`, `agencyName`, `budget` (`amountThb`, `isEstimated`, `vatBasis`), `timeline` (project duration, contract start/end, submission deadline), `technologies`, `qualifications`, `evaluationCriteria`, `deliverables` and `source`.

**400** for fewer than 2 or more than 4 ids, invalid ids, or duplicates. **404** `"One or more saved TORs were not found."`, one message for "not saved", "unpublished" and "does not exist", so the endpoint cannot be used to probe.

---

## Notifications

### `GET /notifications`

**Vendor.** Your alert history, newest first. Alerts whose TOR is no longer published are dropped.

| Query | Default | Notes |
| --- | --- | --- |
| `limit` | 20 | Maximum 100 |

```json
{
  "notifications": [
    {
      "_id": "6731…", "torId": "6730…", "torTitle": "…", "agencyName": "…",
      "budgetThb": 1500000, "submissionDeadline": "2026-12-01T00:00:00.000Z",
      "type": "comment_stage", "status": "sent", "matchScore": 0.4,
      "reasons": [{ "type": "technology", "label": "…", "detail": "…" }],
      "createdAt": "2026-10-21T03:05:00.000Z"
    }
  ]
}
```

`reasons` is the snapshot taken when the alert fired. Later profile edits do not rewrite it. Types and statuses: [reference tables](#reference-tables).

---

## Analytics

Both are **Signed in** (any role). They use **reviewed** TORs only (`published`, plus `closed`), ignore anything without the needed value (and tell you how many), and refuse to show a figure for a set smaller than `OUTLIER_MIN_COMPARABLE_N` (5). Amounts are nominal. Method and caveats: [Analytics](analytics.md).

Shared query parameters, all optional:

| Query | Notes |
| --- | --- |
| `agencyId` | 24-hex agency id (budgets only) |
| `projectType` | `web_application`, `mobile_application`, `it_system`, `other` |
| `yearFrom`, `yearTo` | Gregorian years, 2000 to 2100, inclusive; matched against the announcement date. `yearFrom` must not exceed `yearTo` |

**400** with a plain message for an invalid value. **404** for an unknown `agencyId`.

### `GET /analytics/budgets`

Historical budgets for one comparable set.

```json
{
  "filters": { "agencyId": null, "agencyName": null, "projectType": "it_system", "yearFrom": 2024, "yearTo": 2026 },
  "recordCount": 12,
  "excludedNoBudget": 3,
  "minComparableN": 5,
  "sufficient": true,
  "summary": { "minThb": 300000, "q1Thb": 650000, "medianThb": 1200000, "q3Thb": 2400000, "maxThb": 9800000, "meanThb": 1900000 },
  "distribution": [
    { "fromThb": 0, "toThb": 100000, "count": 0 },
    { "fromThb": 100000, "toThb": 500000, "count": 2 },
    { "fromThb": 50000000, "toThb": null, "count": 0 }
  ],
  "undatedRecordCount": 0,
  "byYear": [{ "year": 2025, "recordCount": 5, "sufficient": true, "medianThb": 1100000 }],
  "basis": "nominal_unadjusted"
}
```

When `sufficient` is `false`, `summary` and `distribution` are `null` (no figure at all, rather than a figure with a caveat).

### `GET /analytics/agency-frequency`

How often each agency procures, and at what typical size. Takes no `agencyId`.

```json
{
  "filters": { "projectType": null, "yearFrom": null, "yearTo": null },
  "minComparableN": 5,
  "window": { "fromYear": 2024, "toYear": 2026, "years": 3 },
  "agencies": [
    {
      "agencyId": "6730…", "agencyName": "Ministry of Labour",
      "procurementCount": 9, "excludedNoDate": 0, "activeYears": 2,
      "procurementsPerYear": 3, "frequencySufficient": true,
      "budgetedCount": 8, "excludedNoBudget": 1,
      "typicalBudgetThb": 1200000, "q1Thb": 700000, "q3Thb": 2100000, "sizeSufficient": true
    }
  ],
  "totals": { "agencyCount": 4, "procurementCount": 31, "excludedNoDate": 2 },
  "basis": "nominal_unadjusted"
}
```

---

## Review queue (admin)

All **Admin**. Background: the [Admin guide](guides/admin-guide.md) and [extraction pipeline §13](extraction-pipeline.md#136-review-queue-api-controllersreviewcontrollerts-apireview).

Every write endpoint here records the **signed-in admin** as the actor in the audit log. There is no `actorId` field any more; one sent in a body is ignored.

### `POST /review/tors`

Create a TOR by hand with its source document, for when an agency's site has changed and the crawler cannot reach it. `multipart/form-data`:

| Field | Required | Notes |
| --- | :---: | --- |
| `file` | ✅ | The source document: one PDF, up to 20 MB. (Nothing may publish without one.) |
| `agencyId` | ✅ | An existing agency |
| `title` | ✅ | |
| `referenceNumber`, `description` | | |
| `procurementMethod` | | `e_bidding`, `selection`, `special_method`, `specific_method`, `other` |
| `budgetAmountThb` | | Number |
| `submissionDeadline` | | Date |

**201** `{ "tor": { … }, "document": { … } }`. The TOR starts at `discovered` and the file at `uploaded`, so the next AI sweep processes it exactly like a crawled one. It is invisible to vendors until approved. **400** missing/invalid field, **404** unknown agency. There is currently no screen for this; use the API.

Upload checks, in order: the file must be named `.pdf`, sent as `application/pdf` and no larger than 20 MB (**400** "Upload rejected. Provide one PDF file no larger than 20 MB."); its first bytes must be a real PDF signature (**415**); and when malware scanning is on (`UPLOAD_MALWARE_SCAN_MODE=required`, the production default) ClamAV must call it clean (**422** if infected, **503** if the scanner cannot be reached). Nothing is stored or parsed before all of them pass.

### `GET /review/queue`

TORs awaiting review, oldest first.

| Query | Default | Notes |
| --- | --- | --- |
| `agencyId` | | Filter to one agency |
| `limit` | 50 | Maximum 200 |

```json
[
  {
    "_id": "6730…", "title": "…", "agencyName": "…", "status": "pending_review",
    "extraction": { "overallConfidence": 0.62 }, "duplicateStatus": "suspected",
    "timeline": { "submissionDeadline": "2026-12-01T00:00:00.000Z" }, "createdAt": "2026-10-20T03:00:12.000Z"
  }
]
```

### `GET /review/queue/:id`

The full record for the review editor, **in any status**. `extraction.fieldConfidence` is a plain object, and `documents` lists each source file with a `fileUrl` (relative to the API base, including a 15-minute signed `token`) for the side-by-side view.

### `PATCH /review/queue/:id/fields`

Correct extracted values. Allowed while the TOR is `pending_review` or `published`; otherwise **409**.

```json
{
  "corrections": { "budget": "1,500,000", "timelineSubmissionDeadline": "2026-12-01", "procurementMethod": "e_bidding" }
}
```

- Keys must be among the [16 extraction fields](#extracted-fields); unknown keys give **400** listing the valid ones.
- Each value is coerced by the **same rules the AI's output goes through** (numbers accept commas, dates must parse, `estimatedComplexity` is `low`/`medium`/`high`). A value that does not parse is rejected with **400**, never half-applied.
- Every corrected key is added to `extraction.humanCorrectedFields`, so a later re-extraction **cannot overwrite it**.
- An audit entry `tor.correct_fields` records before and after for each key.
- `evaluationCriteria` is stored as one unweighted criterion containing the text you send.

Returns the updated TOR.

### `POST /review/queue/:id/approve`

No body. `pending_review` becomes `published`. **409** from any other state. Audited as `tor.approve`.

### `POST /review/queue/:id/reject`

Body `{ "reason" }`. `reason` is required. `pending_review` becomes `rejected` with the reason saved. Audited as `tor.reject`.

### `POST /review/queue/:id/supersede`

Resolve a confirmed duplicate. Body `{ "targetTorId", "reason"? }`; **400** if either id is malformed. This record becomes `superseded`, points at `targetTorId`, and is marked `duplicateStatus: "confirmed"`. The target stays as the surviving record and must not itself be `rejected`, `superseded` or `archived`. A record cannot supersede itself. Audited as `tor.supersede`. There is no button for this yet; use the API.

---

## Extraction (admin)

All **Admin**. How crawling works: [Extraction pipeline](extraction-pipeline.md).

### `GET /extraction/sources`

The source registry, including compliance, because an admin screen with a "Run" button must be able to show why a source is blocked.

```json
[
  {
    "id": "mol", "label": "กระทรวงแรงงาน", "labelEn": "Ministry of Labour",
    "homepage": "https://www.mol.go.th", "listingUrl": "https://www.mol.go.th/…",
    "agency": { "code": "MOL", "name": "กระทรวงแรงงาน", "nameEn": "Ministry of Labour", "agencyType": "department" },
    "stageSignal": "title_keyword",
    "compliance": { "tosStatus": "unverified", "robotsNote": "…", "tosNote": "…", "allowScheduled": true },
    "defaults": { "maxPages": 3, "delayMs": 1000 },
    "caveats": ["…"]
  }
]
```

`tosStatus` is `sanctioned`, `unverified` (no terms found, which is **not** the same as cleared) or `prohibited`.

### `GET /extraction/health`

One health roll-up per source, from its five most recent runs.

```json
[
  {
    "sourceId": "mol", "label": "กระทรวงแรงงาน", "labelEn": "Ministry of Labour", "tosStatus": "unverified",
    "neverRun": false, "lastRunAt": "2026-11-03T03:00:40.000Z", "lastRunStatus": "success",
    "lastSuccessAt": "2026-11-03T03:00:40.000Z", "newestAnnouncedAt": "2026-10-30T00:00:00.000Z",
    "staleDays": 4, "isStale": false, "consecutiveErrorRuns": 0, "formatSuspected": false,
    "health": "healthy"
  }
]
```

`health` is one of `healthy`, `stale`, `error`, `format_suspected`, `blocked`, `unknown`. Rules: [Extraction pipeline §13.12](extraction-pipeline.md#1312-four-more-admin-cards-us-042043044045).

### `POST /extraction/sources/:id/run`

Start a crawl. **Synchronous**: the request stays open until it finishes, which can take minutes. `:id` is `dga`, `mol`, `moc`, `itd`, `depa` or `bma_egp2`.

All body fields are optional:

| Field | Default | Meaning |
| --- | --- | --- |
| `dryRun` | `false` | Parse and report; write nothing |
| `withAttachments` | `false` | Download PDFs and create documents |
| `withDetail` | `true` | Fetch each detail page (one extra request per row) |
| `preAwardOnly` | `false` | Keep only rows confirmed not awarded |
| `keywords` | `[]` | Title substrings, OR-matched |
| `maxPages`, `maxRecords` | source defaults | Positive integers |
| `budgetYearBe` | current BE year | Buddhist Era year, for sources that paginate by year (DGA) |
| `params` | | Source-specific string or number options |
| `overrideTosBlock` | | `{ "approvedBy", "reason" }`. **Both** required to run a source whose Terms of Service forbid crawling |

```json
{
  "sourceId": "mol", "jobId": "6731…", "status": "success",
  "found": 32, "created": 5, "updated": 0, "unchanged": 27, "attachmentsStored": 5,
  "stageCounts": { "draft_tor": 32 }, "preAwardCount": 32,
  "newestAnnouncedAt": "2026-10-30T00:00:00.000Z",
  "errors": [], "startedAt": "2026-11-03T03:00:00.000Z", "finishedAt": "2026-11-03T03:00:40.000Z"
}
```

A refused run answers **409** and is recorded as `skipped`, never `failed`:

```json
{
  "error": "Source is blocked by its Terms of Service.",
  "detail": "…the ToS text…",
  "remedy": "Supply overrideTosBlock: { approvedBy, reason } to proceed — after getting the agency's sign-off."
}
```

> [!WARNING]
> `bma_egp2` (eGP BMA2) is blocked because its Terms of Service ban crawling by name. Do not run it without the agency's written sign-off. The override is recorded on the job so the decision stays attributable.

### `GET /extraction/jobs`, `GET /extraction/jobs/:id`

Crawl history, newest first (`ScrapeJob` documents). Filters `sourceId`, `status` (`running`, `success`, `partial`, `failed`, `skipped`); `limit` defaults to 50, max 200.

### `GET /extraction/ai-jobs`, `GET /extraction/ai-jobs/:id`

AI extraction attempts, newest first (`ExtractionJob` documents: model and prompt version, per-field confidence, discarded fields, processing time, estimated cost, where it was routed). Filters `torId`, `status` (`running`, `success`, `partial`, `failed`); `limit` defaults to 50, max 200.

---

## Accounts and audit log (admin)

### `GET /admin/users`

**Admin.** Every account, newest first, without password or session data.

```json
{
  "users": [
    {
      "id": "6730…", "name": "Anont S.", "email": "anont@example.com", "organization": "…", "phone": "…",
      "role": "vendor", "status": "active", "emailVerified": true,
      "createdAt": "2026-10-01T08:00:00.000Z", "lastLoginAt": "2026-11-02T09:30:00.000Z"
    }
  ]
}
```

### `PATCH /admin/users/:id`

**Admin.** Body with `role` (`vendor`, `reviewer`, `admin`) and/or `status` (`active`, `suspended`). Returns `{ "user": { … } }`.

- **400** for nothing to change, an invalid value, or an attempt to change **your own** account.
- **404** for an unknown account.
- A real change ends that user's sessions at once and writes `user.role.updated` or `user.status.updated` to the audit log.

### `GET /audit-log`

**Admin.** Every recorded human action, newest first.

| Query | Notes |
| --- | --- |
| `entityId`, `entityType` (`tor`, `vendor`, `agency`, `user`), `actorId`, `action` | Exact-match filters |
| `limit` | Default 50, maximum 200 |

```json
[
  {
    "_id": "6731…", "actorId": "6730…", "action": "tor.approve", "entityType": "tor", "entityId": "6730…",
    "before": { "status": "pending_review" }, "after": { "status": "published" },
    "ipAddress": "::1", "createdAt": "2026-11-03T04:12:00.000Z"
  }
]
```

It records only what **people** did. How an AI-written value came to be is traced through `Tor.extraction` and `GET /extraction/ai-jobs`, not duplicated here.

---

## Reference tables

### Extracted fields

The 16 keys used by `fields` on a TOR, by the correction endpoint and by AI jobs, with where each value is stored on the TOR.

| Key | Stored at |
| --- | --- |
| `title` | `title` |
| `agency` | `agencyName` |
| `referenceNumber` | `referenceNumber` |
| `procurementMethod` | `procurementMethod` |
| `description` | `description` |
| `requiredTechnologies` | `technologies` |
| `deliverables` | `deliverables` |
| `timelineCommentClose` | `timeline.commentPeriodEnd` |
| `timelineClarificationMeeting` | `timeline.clarificationMeetingDate` |
| `timelineSubmissionDeadline` | `timeline.submissionDeadline` |
| `timelineAnnouncement` | `timeline.announcementDate` |
| `qualificationRequirements` | `qualifications.items` |
| `evaluationCriteria` | `evaluationCriteria` |
| `budget` | `budget.amountThb` |
| `keyRisks` | `keyRisks` |
| `estimatedComplexity` | `estimatedComplexity` (`low`, `medium`, `high`) |

### TOR `status` (our workflow)

`discovered` → `extracting` → `pending_review` → `published`, or `rejected` / `superseded`. `closed` and `archived` exist but nothing sets them yet.

### TOR `lifecycle.stage` (the agency's stage)

| Stage | Meaning |
| --- | --- |
| `plan` | Procurement plan |
| `draft_tor` | Draft TOR, usually open for public comment |
| `spec` | Specification stage |
| `price_reference` | Reference-price disclosure |
| `bidding_open` | Invitation to bid |
| `awarded` | Winner announced |
| `cancelled` | Cancelled |
| `other` | Not classifiable |

`lifecycle.signal` says how the stage was decided: `authoritative` (the site's own status code), `doc_type` (a labelled document type), `title_keyword` (a keyword match on the title) or `ai_content` (the AI found an award or cancellation in the document text). `lifecycle.isAwarded` is `true`, `false` or `null` (the source did not say).

### Other enumerations

| Name | Values |
| --- | --- |
| `projectType` | `web_application`, `mobile_application`, `it_system`, `other` |
| `procurementMethod` | `e_bidding`, `selection`, `special_method`, `specific_method` (direct appointment), `other` |
| Notification `type` | `comment_stage`, `announcement_stage` (in use); `new_match`, `deadline_reminder`, `status_change` (reserved) |
| Notification `status` | `queued`, `sent`, `failed`, `read`, `cancelled` |
| Notification `channel` | `email`, `in_app` |
| Audit `action` | `tor.import`, `tor.approve`, `tor.reject`, `tor.supersede`, `tor.correct_fields`, `user.role.updated`, `user.status.updated` |
| User `role` | `vendor`, `reviewer`, `admin` |
| User `status` | `pending_verification`, `active`, `suspended` |
| Source ids | `dga`, `mol`, `moc`, `itd`, `depa`, `bma_egp2` |
