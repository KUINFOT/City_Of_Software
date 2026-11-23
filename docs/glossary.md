# Glossary

Terms you will meet in the app, the code and the other docs. Thai terms are given with their usual English rendering.

- [Procurement](#procurement)
- [Organisations and sources](#organisations-and-sources)
- [How the platform works](#how-the-platform-works)
- [Requirement IDs](#requirement-ids)

---

## Procurement

| Term | Meaning |
| --- | --- |
| **TOR** (Terms of Reference; ขอบเขตของงาน) | The document an agency publishes to say what it wants built or bought, with requirements, schedule and budget. The unit this whole platform is about |
| **Draft TOR** (ร่าง TOR) | A TOR published for comment *before* bidding opens. The earliest moment a vendor can act, and the reason this platform exists |
| **Public comment / hearing** (รับฟังความคิดเห็น) | The short window (often 3 to 6 days) during which anyone may comment on a draft TOR. Miss it and the draft is final |
| **Pre-award** | Any stage before a contract is won: plan, draft TOR, specification, price reference, open bidding. *Actionable* for a vendor |
| **Post-award** (award) | A winner has been announced (ประกาศผู้ชนะ) or the contract's key details published (สาระสำคัญในสัญญา). Useless for finding work, which is why the platform filters it out |
| **Reference price** (ราคากลาง) | The price an agency sets as its benchmark before bidding |
| **e-bidding** (ประกวดราคาอิเล็กทรอนิกส์) | The open competitive electronic tender method |
| **Selection method** (วิธีคัดเลือก) | Invited competitive procurement |
| **Special method** (วิธีพิเศษ) | An exceptional procurement method |
| **Direct appointment / specific method** (วิธีเฉพาะเจาะจง) | The agency picks a supplier directly. It legally skips the public TOR and bidding stages, so these postings never state a stage. About 65% of DEPA's archive is this |
| **Procurement method** | In the data: `e_bidding`, `selection`, `special_method`, `specific_method`, `other` |
| **Buddhist Era** (BE; พ.ศ.) | The Thai calendar year, CE + 543. 2569 BE is 2026 CE. Thai sites publish in BE, so the crawler converts. Analytics screens show BE |
| **THB** | Thai baht. Amounts here are nominal: no inflation adjustment, no VAT normalisation |
| **Software procurement** | The project's scope. Non-software postings are excluded (business rule BR-06) |

## Organisations and sources

| Term | Meaning |
| --- | --- |
| **BMA** | Bangkok Metropolitan Administration (กรุงเทพมหานคร), the government the portal is named for |
| **Agency** | Any government body that publishes TORs: a district office, department or public organisation |
| **DGA** | Digital Government Development Agency (สำนักงานพัฒนารัฐบาลดิจิทัล) |
| **MOL** | Ministry of Labour (กระทรวงแรงงาน) |
| **MOC** | Ministry of Commerce (กระทรวงพาณิชย์) |
| **ITD** | International Institute for Trade and Development (สถาบันระหว่างประเทศเพื่อการค้าและการพัฒนา) |
| **DEPA** | Digital Economy Promotion Agency |
| **e-GP / eGP BMA2** | Thailand's electronic government procurement system. `egp2.bangkok.go.th` has a real JSON API, but its **Terms of Service ban crawling**, so the platform blocks it by default |
| **Source** | One website the crawler can read, described by an entry in `registry.ts`. Six are registered; five run |
| **Adapter** | The code that knows how to read one source and turn its rows into `RawListing` records |

## How the platform works

### Records and states

| Term | Meaning |
| --- | --- |
| **Published** | A TOR a person approved, visible to vendors. Only published TORs are ever returned to the public |
| **Status** (`discovered`, `extracting`, `pending_review`, `published`, `rejected`, `superseded`, `closed`, `archived`) | *Our* review workflow state for a TOR. `closed` and `archived` exist but nothing sets them yet |
| **Lifecycle stage** (`plan`, `draft_tor`, `spec`, `price_reference`, `bidding_open`, `awarded`, `cancelled`, `other`) | *The agency's* procurement stage. Independent of status: a published TOR can be at any stage |
| **`isAwarded`** | `true`, `false` or `null`. `null` means the source did not say, which is a different fact from "confirmed not awarded" |
| **Signal** | How a stage was decided: `authoritative` (site status code), `doc_type`, `title_keyword`, `ai_content` |
| **Superseded** | Marked as a confirmed duplicate of another record, which stays published |
| **Review queue** | TORs in `pending_review`, oldest first, waiting for an admin |
| **Auto-publish** | Letting a very confident extraction skip review. **Off by default** |

### The pipeline

| Term | Meaning |
| --- | --- |
| **Crawl / run** | One pass over a source. Recorded as a **ScrapeJob** |
| **Sweep** (AI extraction sweep) | The separate job that takes stored documents and extracts fields from them. One document's attempt is an **ExtractionJob** |
| **`RawListing`** | The one data shape adapters produce and everything downstream consumes |
| **Identity key** | A stable id for "the same announcement", used as the upsert key |
| **Content hash** | A fingerprint of the mutable fields; unchanged means skip the write |
| **Blob store** | Where downloaded PDFs live, named by the SHA-256 of their bytes |
| **Compliance gate** | The code that refuses to run a source whose Terms of Service forbid crawling, without a named approver and a reason |
| **Politeness** | Honest User-Agent, at least one second between requests per host, `robots.txt` respected |
| **Stub mode** | What every AI call does when `GCP_PROJECT_ID` is empty: return empty fields at confidence 0, which routes to review |
| **Document AI** | Google's OCR service. The fallback reader here |
| **Gemini** | Google's model. The primary reader: it takes the PDF directly and returns a transcription and fields |
| **Extracted fields** | The 16 facts read from a document (title, agency, reference number, procurement method, description, technologies, deliverables, four timeline dates, qualifications, evaluation criteria, budget, key risks, complexity) |
| **Confidence** | A score from 0 to 1 per field, and an overall one. The model's own self-assessment, treated as a heuristic, not a calibrated probability |
| **Grounding** | The check that a value is backed by a verbatim quote from the source. An ungrounded value is discarded |
| **Overall confidence** | Recomputed in code as the average of kept fields, times the share of six core fields found. Never taken from the model |
| **Core fields** | `title`, `agency`, `procurementMethod`, `description`, `budget`, `timelineSubmissionDeadline`: the facts nearly every real document states |
| **Caution flag** | Shown to vendors on a field whose confidence is below the review threshold |
| **Human-corrected field** | A field an admin edited. Locked against being overwritten by re-extraction |
| **Docless TOR** | A TOR with no attached document. After a grace period it goes to review at confidence 0 |
| **Parked document** | One that failed extraction `EXTRACTION_MAX_ATTEMPTS` times. Kept, not retried, waiting for a person |
| **Duplicate candidate** | A similar existing TOR, linked for an admin to confirm. Never merged automatically |
| **Scheduler** | `node-cron` inside the API process. Off unless `SCHEDULER_ENABLED=true` |
| **Overlap lock** | The in-memory guard that stops a job running twice. Why there must be one back-end |

### For vendors

| Term | Meaning |
| --- | --- |
| **Vendor profile** | Your self-declared capability: stack, services, experience, certifications, past contracts. Never shown as verified |
| **Profile version** | A numbered snapshot, created whenever a capability changes |
| **Completeness** | A weighted checklist of the profile, 0 to 100 |
| **Qualification match** | The TOR's stated requirements compared with your profile: `met`, `not_met` or `undetermined`. Never an eligibility verdict |
| **Match reasons** | Why a TOR was surfaced to you: technology, project type, budget, agency, keyword |
| **Followed agency / keyword** | An explicit watchlist on top of profile matching |
| **Alert / notification** | A message that a matching TOR changed stage: `comment_stage` or `announcement_stage` |
| **Digest** | One email a day instead of one per alert |
| **Saved TOR** (bookmark) | A TOR on your shortlist, with an optional private note |
| **Comparable set** | The records an analytics figure is built from: same agency, project type and year range |
| **Median, Q1, Q3, IQR** | The middle value, the 25th and 75th percentiles, and the gap between them (Q3 − Q1) |
| **Outlier** | A budget outside Q1 − 1.5×IQR or Q3 + 1.5×IQR within its group. A signal for inquiry, not a finding of wrongdoing |
| **Nominal** | As announced, with no inflation adjustment |

### Security

| Term | Meaning |
| --- | --- |
| **Session token** | The signed Bearer token from sign-in. Checked against a server-side session on every request |
| **Idle timeout** | 30 minutes without a request ends the session |
| **Signed link** | A small HMAC-signed token for one purpose: opening a document (15 min) or unsubscribing (no expiry) |
| **Role** | `vendor`, `reviewer` (a BMA official) or `admin` |
| **Audit log** | The permanent record of what people did: approvals, rejections, corrections, account changes |

---

## Requirement IDs

The docs and code comments cite the project's **Software Requirements Specification (SRS) v1.0** with short IDs. They are traceability markers; you can read around them. This is what they mean.

| ID | Stands for | Example |
| --- | --- | --- |
| **EP-nn** | An epic: a themed group of user stories | EP-04 matching and notifications |
| **US-nnn** | A user story. There are 47. `US-nnn` is GitHub issue number `nnn + 9`, for example US-038 is the issue titled "scanned and image-only documents read and parsed…" | US-016 provenance |
| **UC-nn** | A use case | UC-03 View TOR detail |
| **FR-xxx-nn** | A functional requirement. Area codes seen in the code: **EXT** extraction, **REP** repository (reading and display), **ANL** analytics, **ADM** administration, **NOT** notifications, **VEN** vendor, **ING** ingestion | FR-EXT-09 ungrounded values are discarded |
| **NFR-xxx-nn** | A non-functional requirement. Areas: **DAT** data, **REL** reliability, **MNT** maintainability, **PER** performance | NFR-DAT-06 human corrections are never overwritten |
| **BR-nn** | A business rule | **BR-03** no TOR is visible until approved or auto-published under an explicit policy. **BR-05** nothing publishes without a source document. **BR-06** non-software postings are excluded |
| **TBD-nn** | An open issue in the SRS | **TBD-01** the auto-publish default is manual review. **TBD-02** the outlier margin and minimum comparable-set size are unvalidated |
| **SCRUM-nn** | A Jira issue key. For user stories the number matches the US number (SCRUM-15 is US-015); higher numbers are sub-tasks | SCRUM-91 |

The user stories are tracked as GitHub issues (#10 to #56) in the repository.
