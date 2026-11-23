# Documentation

Everything about City of Software that is not obvious from the code. Pick the path that matches why you are here.

## Reading paths

| If you are… | Start with | Then |
| --- | --- | --- |
| **Trying it for the first time** | [Getting started](getting-started.md) | [Vendor guide](guides/vendor-guide.md) |
| **A vendor or BMA official using the app** | [Vendor guide](guides/vendor-guide.md) | [Glossary](glossary.md) |
| **An administrator** | [Admin guide](guides/admin-guide.md) | [Troubleshooting](troubleshooting.md) |
| **Deploying it** | [Deployment](deployment.md) | [Configuration](configuration.md) |
| **Building on the API** | [API reference](api-reference.md) | [Authentication](authentication.md) |
| **Changing the code** | [Architecture](architecture.md) | [Development guide](development.md) |
| **Curious how the AI part works** | [Extraction pipeline](extraction-pipeline.md) | [Notifications and matching](notifications-and-matching.md) |
| **Checking what is and is not finished** | [Status and limitations](status.md) | [Architecture](architecture.md#where-it-bends-and-where-it-breaks) |

## All documents

### Using the product

| Document | What it covers |
| --- | --- |
| [Vendor guide](guides/vendor-guide.md) | Sign-up, your profile, searching, reading a TOR, saving and comparing, alerts, analytics |
| [Admin guide](guides/admin-guide.md) | The review queue, correcting fields, adapter health, running a crawl, accounts and the audit log |
| [Glossary](glossary.md) | TOR, BMA, e-GP, Buddhist Era dates, pre-award, confidence, grounding, and the requirement IDs used in these docs |

### Running it

| Document | What it covers |
| --- | --- |
| [Getting started](getting-started.md) | From a clean checkout to a working site with real data and an admin account |
| [Configuration](configuration.md) | Every environment variable, its default, and what it changes |
| [Deployment](deployment.md) | Docker, secrets, the scheduler, storage, backups, updating |
| [Troubleshooting](troubleshooting.md) | The problems people actually hit, and the fix for each |

### Understanding it

| Document | What it covers |
| --- | --- |
| [Architecture](architecture.md) | Components, the life of a TOR, request flow, design decisions and their reasons |
| [Authentication](authentication.md) | Accounts, roles, sessions, the sign-up and password-reset flows, signed links |
| [Notifications and matching](notifications-and-matching.md) | How a vendor gets an alert and how "why did this match me" is worked out |
| [Analytics](analytics.md) | Historical budgets, agency frequency and outlier flags: the method and its limits |
| [Extraction pipeline](extraction-pipeline.md) | Crawling six sites, OCR and Gemini, confidence-gated review, duplicates, scheduling |
| [Database design](database-design.md) | Every collection, the reasoning behind the shapes, and the indexes |
| [API reference](api-reference.md) | Every endpoint with auth, parameters and example responses |

### Working on it

| Document | What it covers |
| --- | --- |
| [Development guide](development.md) | Day-to-day workflow, tests, conventions, how to add an endpoint or a source |
| [Status and limitations](status.md) | What works end to end, what needs configuration, what is missing |

## How to read these docs

- **Requirement IDs.** The docs cite the project's Software Requirements Specification (SRS) with short IDs such as `US-038`, `FR-EXT-09` or `BR-03`. They are there for traceability. You can ignore them while reading for understanding; the [glossary](glossary.md#requirement-ids) explains the scheme.
- **The app is mostly in Thai (the Advanced search page is in English); the docs are in English.** Where a button or menu matters, the guides give the English meaning first and the Thai label in parentheses, for example *Dashboard (แดชบอร์ด)*.
- **Callouts.** `Note` is background, `Tip` saves time, `Warning` is something that has bitten, or will bite, someone.
- **Dates and prices.** Dates are shown in ISO form (2026-11-03). Money is Thai baht (THB) and nominal, which means no inflation adjustment and no VAT normalisation.
- **Freshness.** Each of the "status" style statements was checked against the code on **3 November 2026**. If something here disagrees with the code, the code wins; please fix the doc.
