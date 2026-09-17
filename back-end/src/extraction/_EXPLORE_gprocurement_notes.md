# gprocurement.go.th central eGP RSS feed — exploration notes

Uncommitted, branch-local exploration. Do not commit — per instruction this is
a "shadow project" for now.

## UPDATE (verified live 2026-09-17) — supersedes the numeric announceType table below

A teammate's own exploration script (`explore-egp-rss.ts`, tested live
2026-08-20) turned up a *different and better* code scheme than what I found
below by scraping the website's HTML search form. Re-tested their codes live
just now:

- **`deptId` genuinely filters** — confirmed with both of their real example
  codes (`0304` → 1 item, `4520101` → 3 items), each a distinct, plausible,
  agency-specific result set. This part of their findings holds up.
- **`annouceType` does NOT currently filter anything when `deptId` is
  present** — `deptId=4520101` combined with `annouceType=W0`, `B0`, `D0`,
  or even a garbage value (`ZZ`) all returned the exact same 3 items,
  unfiltered. Confirmed reproducible across 5 separate requests.
- **`annouceType=D0` alone (no `deptId`) returned 0 items for me**, not the
  ~599/day their notes document from 2026-08-20.

So either the live site's handling of `annouceType` has changed in the ~4
weeks since their test, or there's a request-shape difference I haven't
found (their script may set something — a header, a required extra param —
that mine doesn't). Their **code table itself** (the alphanumeric
`P0/15/B0/D0/W0/D1/W1/D2/W2`) is almost certainly still the *right* one for
this endpoint — far more credible than the numeric `1`–`19` table below,
which came from the *website's separate HTML search form* and, per my own
live testing, doesn't work against the RSS endpoint at all (every numeric
guess against `annouceType` returned 0, including the confirmed-real ones
from that form's own dropdown). Keeping that table further down for the
`deptId` ministry-code context it also provides, but **don't trust its
announceType column** — use the alphanumeric one from the teammate's script
instead.

Next step if this gets revisited: get the teammate's actual script running
side by side (same request, same moment) to isolate whether this is a
site-side change or a difference in how the request is built.

## UPDATE 2 — tested `moiId`, `methodId`, `typeId` (the search page's other selects)

- **`moiId` is a PROVINCE code (จังหวัด), not an org sub-level** — despite
  the name suggesting "Ministry of Interior id" or similar, its options in
  the HTML search form are all 77 provinces (`100000` = Bangkok itself,
  `810000` = Krabi, etc). Behaves exactly like `annouceType`: alone, every
  value tested returned 0 items; combined with `deptId`, every value
  (including Bangkok vs. a random other province) was **silently ignored**
  — same 3 items back regardless.
- **`methodId` (procurement method — codes from the same HTML form, e.g.
  `16` = e-bidding, `15` = e-market) genuinely filters, and composes
  correctly with `deptId`.** Confirmed live: `deptId=4520101&methodId=15`
  correctly returns 0 (that agency's 3 known items are all e-bidding, method
  16, so filtering to e-market legitimately excludes them), while
  `deptId=4520101&methodId=16` returns the usual 3. `methodId=16` alone
  (no deptId) also returns a real, non-empty, plausible result set (20
  items, all e-bidding).
- **`typeId`** (procurement category: ซื้อ/จ้างก่อสร้าง/จ้างทำของ/...) —
  only lightly tested; alone it returned 0, not yet tried combined with
  `deptId`. Worth checking the same way `methodId` was if this gets picked
  up again.

**Revised working theory**: `deptId` and `methodId` are a real, composable
AND filter. `annouceType` and `moiId` are accepted as params (no error) but
have no effect server-side once `deptId` is set, and return nothing at all
when used alone. This directly updates/narrows UPDATE 1 above, which had
left annouceType's behavior as an open question — it's now been cross-
checked against a second, differently-behaved param (`methodId`) and the
pattern holds.

`explore-egp-rss.ts` (same directory) now accepts `--method` and `--moi` in
addition to `--dept`/`--type`, so this is easy to re-probe.

## UPDATE 3 — the `anounceType` mystery is solved: it was a spelling bug

Found a real-world example URL via web search using yet another spelling —
**`anounceType`** (one `n`, i.e. missing the second `n` in "announce"). This
is a *third* distinct spelling floating around (mine/the teammate's script
used `annouceType`; the site's own HTML search form uses the correctly-
spelled `announceType`; the RSS endpoint's real, working one is neither —
it's `anounceType`).

Re-tested with this spelling, live, against `deptId=4520101`:

| code | Thai label | item count |
|---|---|---|
| `D0` | ประกาศเชิญชวน (invitation) | 3 |
| `W0` | ประกาศรายชื่อผู้ชนะการเสนอราคา (winner) | 5 |
| `15` | ประกาศราคากลาง (reference price) | 4 |
| `B0` | (draft TOR) | 0 — this agency just has none active right now, not a bad code |
| `ZZ` (bogus) | — | 0, correctly rejected |

**This fully reverses UPDATE 1/2's conclusion.** `anounceType` (this
spelling) is real, filters correctly, and composes correctly with `deptId`
— confirmed with three different, correctly-labeled, differently-sized
result sets for the same agency. The teammate's original alphanumeric code
table (`P0/15/B0/D0/W0/D1/W1/D2/W2`) is correct and working; only the param
*spelling* in this project's script was wrong. `explore-egp-rss.ts` has
been corrected to use `anounceType`.

Also now confirmed: `moiId` and the numeric `1`-`19` announceType table
(from earlier updates) are still correctly identified as not working / the
wrong table respectively — this correction is scoped to the spelling only.

## UPDATE 4 — volume ceiling and document-fetch WAF gotcha

- **Every unfiltered/no-`deptId` query is hard-capped at exactly 20 items**,
  all from today, regardless of `anounceType` value (`D0`, `W0`, `P0` all
  independently returned exactly 20). `limit=100` / `pageSize=100` don't
  raise it; `rows=100` / `count=100` actually break the request (0 items) —
  neither is a real pagination param. **This is a live-tail feed, not a
  historical archive** — fine for "what's new right now" polling (which is
  all the existing adapters do anyway), useless for backfilling past
  months in one shot. `deptId`-scoped queries return fewer items and don't
  visibly hit this ceiling (a single agency's current `D0` count is well
  under 20), so per-agency polling looks safe from silent truncation.
- **The PDF download link needs a `Referer` header or gets WAF-rejected.**
  A direct `curl` with just a `User-Agent` got `"Request Rejected... consult
  with your administrator"` (an F5/BigIP WAF block, not a real 404/permission
  error). Adding `Referer: https://process.gprocurement.go.th/...` fixed it
  — confirmed by downloading and checking magic bytes: real `%PDF-1.7`,
  138KB, matching the `content-disposition: filename=dant_<projectId>_<uuid>.pdf`
  pattern from the teammate's original notes. So the document-fetch step
  does work, it's just one header pickier than the RSS endpoint itself.

## UPDATE 5 — a stronger architectural alternative exists: CKAN GovSpending API

Found a comparable student project on GitHub, **MTPeraya/TORBIDD**
([PR #114](https://github.com/MTPeraya/TORBIDD/pull/114) — public, browsed
via `gh`, not cloned/copied), doing the same kind of ingestion for a very
similar TOR-discovery platform. Their approach is meaningfully different
from — and arguably more robust than — filtering this RSS feed directly:

1. **Discovery**: query `opend.data.go.th`'s CKAN **GovSpending API**
   (`/govspending/service/egp-contract`) by keyword + Thai fiscal year (B.E.),
   paginated, with rate-limit backoff. This is a documented, purpose-built
   search API — not an RSS feed being coaxed into filtering.
2. **Document retrieval**: for each discovered 11-digit project id, query
   `process5.gprocurement.go.th` for that project's full **ZIP archive**
   (not a single PDF link), extract it safely (zip-slip/zip-bomb defenses),
   and specifically pull out the file matching `ATTACH_TOR` / "ขอบเขตงาน" —
   implying a project can have *multiple* attachments, of which the RSS
   feed's single `view-pdf-file` link may only be one (unconfirmed whether
   it's reliably the TOR-specific one or something else, e.g. the
   announcement notice itself).

Tried their API directly: `opend.data.go.th/govspending/service/egp-contract`
returned `401 {"message":"No API key found in request"}` — this path needs
registering for an API key from data.go.th (their `.env.example` confirms:
`GOVSPENDING_API_KEY`). Not zero-setup like the RSS feed, but a real,
documented, keyword+fiscal-year-searchable API with no live-tail/20-item
ceiling — the opposite tradeoff profile from the RSS feed.

---

# VERDICT — can this replace the current scraping (dga/mol/moc/itd/depa adapters)?

**Not a drop-in replacement, but a genuinely strong candidate for the
*discovery* half of the pipeline, worth prototyping for real — with the
CKAN API as a likely-better discovery layer than the RSS feed itself.**

**What's now solid, not speculative:**
- Public, no-auth, real, live, working — confirmed extensively today.
- `deptId` + `anounceType` (this exact spelling) is a genuine, composable,
  correctly-filtering query, giving both agency-scoping and an
  **authoritative stage signal** (draft TOR / invitation / winner /
  amendment / cancellation / reference-price) straight from source —
  eliminating the *entire class* of bug this session fixed earlier
  (`core/awardStatus.ts` inferring stage from title keywords). This alone
  is a meaningful reliability upgrade if pursued.
- Document PDFs are real and fetchable (once the `Referer` header gotcha is
  handled) — same downstream Document AI / Gemini extraction pipeline this
  project already has would apply unchanged.
- One central feed nationwide, vs. 5 bespoke per-site adapters to maintain.

**What's still open / not yet a "yes, ship it":**
- **No known `deptId` codes for the project's actual 5 target agencies**
  (DGA, DEPA, MOL, MOC, ITD). Web search didn't surface a published lookup
  table, and their own procurement pages don't appear to embed it in an
  easily-scraped form (checked dga.or.th and depa.or.th's procurement
  pages directly — no RSS link found in the page source, though this could
  be a JS-rendered page curl doesn't see, not proof it isn't there). Getting
  these — the single most important remaining unknown — likely means either
  contacting each agency, finding a known real project id and working
  backward via the CKAN API, or checking each agency's e-GP-linkage
  documentation individually.
- **Live-tail-only, 20-item ceiling on unfiltered queries** — real for
  ongoing polling, not for historical backfill (the current adapters don't
  really backfill deeply either, so this may be a wash in practice, but
  worth knowing going in).
- **Only ever produces ONE representative PDF link per RSS item** — the
  TORBIDD project's ZIP-based, multi-attachment approach via
  `process5.gprocurement.go.th` may be necessary to reliably get the actual
  TOR document specifically (vs. whatever the RSS's single link happens to
  be) — this project's RSS-only approach hasn't confirmed that
  distinction either way.
- Whatever replaces `sourceRef.sourceId`'s enum (`'dga'|'mol'|'moc'|'itd'|
  'depa'|'bma_egp2'`) and the `anounceType`→`lifecycle.stage` mapping would
  need to be formalized and tested against real data before trusting it in
  the actual publish pipeline — none of today's testing touched this
  project's own database or extraction code, purely the external API.

**Recommended next step, if this moves past "shadow project":** don't
replace the adapters outright — build one small real adapter (start with
whichever of the 5 agencies you can find/confirm a `deptId` for first,
DGA/DEPA under the Digital Ministry being the most central to this
project), run it *alongside* the existing scraper for that same agency for
a week or two, and diff the results before trusting it as the source of
truth.

## UPDATE 6 — 6 confirmed-real deptId codes (none of them this project's 5 target agencies)

Found via web search (real embedded RSS links on other agencies' own
sites), all independently verified live with real, varied data:

| deptId | Identity (inferred from item content/source) | D0 | W0 |
|---|---|---|---|
| `0304` | กรมบัญชีกลาง (Comptroller General's Dept) | 1 | — |
| `0307` | An Area Revenue Office (สรรพากรพื้นที่) | 20 (capped) | — |
| `4520101` | A district office, Education Division items | 3 | 5 |
| `2410101` | อบจ.อุดรธานี (Udon Thani Provincial Admin) | 0 | 10 |
| `6302203` | A subdistrict municipality, Engineering Division | 0 | 1 |
| `6311013` | A Buriram-area local government | 0 | 7 |

Pattern observed: central-ministry-level departments get short 4-digit
codes (`0304`, `0307`); local government units get longer 7-digit codes.
**None of these are DGA/DEPA/MOL/MOC/ITD** — they're what surfaced via
search because small local offices are the ones that publish their own
embedded feed links publicly. Tried the obvious next move — testing the
ministry-level codes already found in UPDATE 1's `deptId` dropdown table
(`11`=Digital Ministry, `13`=Commerce, `17`=Labour, zero-padded to
`0011`/`0013`/`0017` to match the 4-digit pattern above) — but hit what
looks like **rate-limiting from the server** after this session's volume of
requests (multiple plain `curl` calls timed out cleanly with no response,
after dozens of successful requests earlier in the same session). Did not
keep hammering it once that became clear. This specific test is unresolved
— worth retrying after a longer cool-off period, ideally with delays
between requests from the start (the existing adapters already rate-limit
themselves via `EXTRACTION_DELAY_MS`, so a real implementation of this
wouldn't hit the same issue).

**Still-open blocker, unchanged**: no confirmed `deptId` for this project's
actual 5 target agencies. Everything else about the mechanism (deptId
filtering, anounceType filtering + stage signal, PDF fetch after the
Referer fix, the 20-item live-tail ceiling) is now solidly confirmed
against *some* real agency — the remaining gap is purely "which code
belongs to DGA/DEPA/MOL/MOC/ITD specifically," not "does this work at all."

## Endpoint

```
https://process.gprocurement.go.th/EPROCRssFeedWeb/egpannouncerss.xml?deptId=<code>&annouceType=<code>
```

(The `http://` form and the `process3.` host both 302-redirect here eventually.
Note the misspelling `annouceType` — that's the RSS endpoint's real, working
param name; the website's own search form spells it `announceType`, correctly.
`deptId` is spelled the same in both places.)

Response: `Content-Type: text/xml;charset=ISO-8859-1`, but the bytes are
actually **Windows-874** (Thai codepage), not ISO-8859-1 or UTF-8 — the
declared charset is wrong. Must decode as `cp874`/`windows-874` or Thai text
comes out as mojibake.

## Structure (no query params — default/recent feed)

```xml
<rss version="2.0">
  <channel>
    <title>ประกาศจัดซื้อจัดจ้างภาครัฐ</title>
    <link>...(link to the human search page)...</link>
    <description>...</description>
    <language>th-TH</language>
    <lastBuildDate>...</lastBuildDate>
    <countbyday>29</countbyday>   <!-- meaning unclear, see below -->
    <item>
      <title>...(full announcement title, includes procurement method)...</title>
      <link>https://process5.gprocurement.go.th/egp-template-service/dwnt/view-pdf-file?templateId=<uuid></link>
      <description>REF_NUMBER, PROCUREMENT_METHOD_TH, ANNOUNCE_TYPE_TH</description>
      <pubDate>YYYY-MM-DD</pubDate>
      <guid></guid>   <!-- always empty; use the templateId in <link> as the real unique id -->
    </item>
    ...
  </channel>
</rss>
```

No query params returned exactly **10 items**, all dated today, all
`ประกาศเชิญชวน` (invitation/open stage) — looks like "most recent N
announcements platform-wide," not a filtered default.

## `annouceType` codes (scraped from the search page's own `<select>`, confirmed real)

Maps cleanly onto this project's `Tor.lifecycle.stage` enum — and as an
**authoritative status code straight from source**, not inferred from title
keywords the way `core/awardStatus.ts`'s `classify()` currently has to. This
is the class of signal that would have prevented this session's
misclassified-award-status bug outright.

| code | Thai label | rough platform equivalent |
|---|---|---|
| 1  | ประกาศร่าง TOR/ร่างเอกสารประกวดราคา | `draft_tor` |
| 2  | ประกาศเชิญชวน | `bidding_open` |
| 3  | รายชื่อผู้ผ่านการตรวจสอบผู้ไม่มีผลประโยชน์ร่วมกัน | (no equivalent yet — qualified-bidder list) |
| 4  | ประกาศรายชื่อผู้ชนะการเสนอราคา | `awarded` |
| 6  | เปลี่ยนแปลงประกาศเชิญชวน | amendment to `bidding_open` |
| 7  | เปลี่ยนแปลง...ผู้ไม่มีผลประโยชน์ร่วมกัน | amendment to #3 |
| 8  | เปลี่ยนแปลงประกาศรายชื่อผู้ชนะการเสนอราคา | amendment to `awarded` |
| 9  | ยกเลิกประกาศเชิญชวน | `cancelled` (of an open tender) |
| 10 | ยกเลิก...ผู้ไม่มีผลประโยชน์ร่วมกัน | `cancelled` (of #3) |
| 11 | ยกเลิกประกาศรายชื่อผู้ชนะการเสนอราคา | `cancelled` (of an award) |
| 12 | ประกาศเชิญชวน + เปลี่ยนแปลง + ยกเลิก (combined) | — |
| 13 | #3 combined (announce+amend+cancel) | — |
| 14 | #4 combined (announce+amend+cancel) | — |
| 15 | ประกาศราคากลาง | reference/median price disclosure |
| 17 | สรุปข้อมูลการเสนอราคาเบื้องต้น | preliminary bid summary |
| 19 | ประกาศผลผู้ชนะฯ รายไตรมาส | quarterly winner-result summary |

## `deptId` codes (ministry level — also from the search page's `<select>`)

24 options total. The ones that matter for this project — several are the
**parent ministries of agencies already being scraped individually**:

| code | Ministry | overlaps existing adapter |
|---|---|---|
| 11 | กระทรวงดิจิทัลเพื่อเศรษฐกิจและสังคม (MDES) | parent of **DGA** and **DEPA** (both currently separate adapters) |
| 13 | กระทรวงพาณิชย์ | = **MOC** |
| 17 | กระทรวงแรงงาน | = **MOL** |
| 25 | หน่วยงานของรัฐที่ไม่สังกัดสำนักนายกฯ/กระทรวง/ทบวง | likely bucket for **ITD** (independent public org) — unconfirmed |

Plus 20 more ministries (คลัง, มหาดไทย, สาธารณสุข, ศึกษาธิการ, ...) covering
the entire rest of Thai government — this single feed's scope is nationwide,
not just the 5 agencies this project currently scrapes bespoke adapters for.

## Open question — combined filters return 0

`deptId=11`, `deptId=11&annouceType=1`, `deptId=17&annouceType=1`, etc. all
returned **0 items** despite using confirmed-real codes. Two live
hypotheses, not yet distinguished:

1. The unfiltered feed is only ever a tiny "most recent across all of Thai
   government" window (~10 items/request, all today) — a single
   ministry+type slice of that day's small sample legitimately having zero
   items is unsurprising, not evidence the codes are wrong.
2. There's another required param not yet found (the search page also has
   `moiId`, `methodId`, `typeId`, `govStatus`, `projectStatus` selects —
   untested; `moiId` in particular might be the actual "department" level
   under a ministry, worth checking whether `deptId` needs to pair with it).

Next step if this gets picked back up: try the feed at a few different times
of day to see if item counts/composition change (confirming hypothesis 1),
and pull the `moiId` options the same way `deptId`/`announceType` were
extracted, from:
`http://process.gprocurement.go.th/egp2procmainWeb/procsearch.sch?homeflag=A&proc_id=FPRO9965&servlet=FPRO9965Servlet&methodId=&announceType=2`

## Why this could matter for the real pipeline (if pursued later)

- **One central source** instead of 5 bespoke per-site adapters (`dga`,
  `mol`, `moc`, `itd`, `depa` in `registry.ts`) — less scraper maintenance,
  no per-site selector breakage risk.
- **Direct PDF links** (`view-pdf-file?templateId=...`) — no detail-page
  scrape needed to find the attachment, unlike the current adapters.
- **Authoritative stage signal** (`annouceType`) instead of inferring
  `lifecycle.stage` from title keywords — this is the single biggest
  reliability upgrade available: it would have caught this session's
  award-status misclassification bug by construction, not by a bolted-on
  content cross-check.
- Would still need its own new adapter (`sourceId` in the `dga|mol|moc|itd|
  depa|bma_egp2` enum on `Tor.sourceRef.sourceId` would need a new value)
  and the announce-type-to-lifecycle mapping formalized, plus resolving the
  zero-results question above before it's trustworthy enough to route real
  data through.
