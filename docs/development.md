# Development guide

How to work on City of Software day to day: run it, test it, follow the house style, and add the common kinds of change without breaking the things that are easy to break.

New here? Do [Getting started](getting-started.md) first, then skim [Architecture](architecture.md).

## The daily loop

Two terminals, both with hot reload:

```bash
cd back-end && npm run dev      # http://localhost:4000, restarts on save (tsx watch)
```

```bash
cd front-end && npm run dev     # http://localhost:3000, Turbopack
```

Before you push:

```bash
cd back-end  && npm run typecheck && npm test
cd front-end && npm run typecheck && npm run build
```

CI runs the same commands, but a green local run is the stronger check: on CI's Node 20 the back-end `npm test` finds no test files and passes without running anything (see [CI](#ci)). Run the tests locally on Node 22 or newer.

### Handy commands

| Task | Command (from `back-end/`) |
| --- | --- |
| Run one test file | `node --import tsx --test src/analytics/outlierMath.test.ts` |
| Try a crawl without writing anything | `npm run extract -- --source mol --pages 1 --dry-run` |
| Run the AI sweep now | `npm run extract -- --extract-ai` |
| Recompute outlier flags | `npm run extract -- --analyze-outliers` |
| List sources and their compliance | `npm run extract -- --list` |
| Build exactly what Docker runs | `npm run build && npm start` |

## Testing

The back-end uses Node's built-in test runner (`node:test`) with `tsx`, so there is no Jest or Vitest to configure. Tests sit **next to the code** (`foo.ts`, `foo.test.ts`) and run with `npm test` in about four seconds.

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { classifyOutlier, computeIqrBounds } from './outlierMath';

describe('classifyOutlier', () => {
  it('treats the exact fence boundary as still within range', () => {
    const bounds = computeIqrBounds([10, 20, 30, 40, 50], 1.5);
    assert.equal(classifyOutlier(bounds.upperBound, bounds), false);
  });
});
```

**What is covered:** the pure logic where a mistake would be silent. That is the Thai-date parser, `robots.txt` rules, the award-status classifier, fingerprinting, grounding, confidence scoring and routing, duplicate scoring, field coercion, source health, outlier maths, budget and frequency analytics, key dates, both matching engines, the cron lock, and the security services (session, password, pending-registration, document-access tokens).

**What is not:** controllers, routes and anything needing a database. There are no integration tests and no front-end tests. Which is why the next section matters.

> [!TIP]
> Tests need `MONGODB_URI` to be *set* (some modules import `config/env.ts`) but never connect. CI sets a dummy value; `.env` does the same job locally.

### Why logic lives in pure modules

Anything that makes a **decision** is a pure function with no database: `matchQualifications`, `compareBudgets`, `classifyOutlier`, `decideRouting`, `classifySourceHealth`, `computeKeyDates`. Controllers only fetch, call and shape the response. This is what makes the logic testable without a database, and it is the main way to keep it that way. If you are about to write an `if` that decides something inside a controller, put it in a module and test it.

The settings modules (`config/gcpConfig.ts`, `extraction/core/config.ts`, `scheduler/cronConfig.ts`) are deliberately importable **without** `MONGODB_URI`, for the same reason.

## House style

These are patterns the code already follows, and the reasons. Reading existing code before adding new code will teach you the rest.

| Convention | Why |
| --- | --- |
| **Absent stays absent.** A missing budget is not `0`, a missing date is not today, an unknown award state is `null`, not `false`. Exclude and count; never default | A default silently turns "unknown" into a fact someone will act on |
| **Re-check `status: 'published'` on every public read** | A bug elsewhere must never leak an unreviewed record. Use the same 404 for "missing" and "unpublished" |
| **Audit every human mutation** (`AuditLogModel.create`) with real before and after | Any published value must be traceable to its origin |
| **Never overwrite a human-corrected field** (`extraction.humanCorrectedFields`) | A reviewer's fix must survive a re-run |
| **Fail safe in the AI path.** No credentials, a parse failure or an ungrounded value means zero confidence and a route to review | Nothing can publish by accident |
| **Explain the *why* in a comment, with the requirement ID** | The comments are the design record: read a few, then keep the habit |
| **Thin controllers, pure cores, services for I/O** | See above |
| **Return `{ error: "…" }` with a meaningful status** | The front-end shows `error` directly |
| **Never log or commit secrets** | `.env`, `service-account.json` and `secrets/` are git-ignored; keep it that way |

Naming: `*.routes.ts`, `*.controller.ts`, `*.service.ts`, `*.adapter.ts`; models are singular `PascalCase` (`Tor.ts`); tests are `*.test.ts` beside the file.

## How to…

### Add an API endpoint

1. **Route.** Add it to the feature's `routes/*.routes.ts` (or a new file mounted in `routes/index.ts`) with the right guard: `requireAuthenticated`, `requireVendor`, `requireAdmin` or `requireSelfOrAdmin`. Public routes get no guard; make sure you really mean it.
2. **Controller.** Copy the shape of `bookmark.controller.ts`: `try { … } catch (err) { next(err); }`, read the caller from `(req as AuthenticatedRequest).authUser`, validate input, answer with JSON.
3. **Logic.** Anything beyond fetching and shaping goes in a pure module with a test.
4. **Document it** in [api-reference.md](api-reference.md), and in the [permissions table](authentication.md#what-each-role-can-do) if access changes.

```ts
// routes/example.routes.ts
import { Router } from 'express';
import { listExamples } from '../controllers/example.controller';
import { requireVendor } from '../middleware/auth.middleware';

const router = Router();
router.get('/', requireVendor, listExamples);
export default router;
// then, in routes/index.ts:  router.use('/examples', exampleRoutes);
```

### Add or change a field in the database

1. Edit the schema in `models/`. Add a `default` where code will read it without a guard.
2. Add an index in the same file if you will query or sort by it, and **name the reason** in a comment.
3. Mongoose does not migrate. Adding an optional field is safe. Renaming or reshaping one means existing documents keep the old shape: write a one-off script and say so in the pull request.
4. Update [database-design.md](database-design.md).

### Add a data source (another agency website)

The checklist is in [Extraction pipeline §12](extraction-pipeline.md#12--adding-a-seventh-source): an adapter, a registry entry, the source id in two enums, a cron expression. The pipeline itself (`runner`, `normalize`, `attachments`) does not change. Investigate the site in order, documented API first, then `robots.txt`, then Terms of Service, and record the honest compliance status in `registry.ts`.

### Add an extracted field

The Gemini response schema is built from one list, so the work is mostly keeping it consistent:

1. `extraction/core/fieldSchema.ts`: add the key to `EXTRACTED_FIELD_KEYS`, add its storage path to `FIELD_TO_TOR_PATH`, and **bump `EXTRACTION_PROMPT_VERSION`** (old records' confidence is not comparable with new).
2. `extraction/core/fieldCoercion.ts`: teach `coerceFieldValue` how to parse it (one function serves both the AI and the admin correction form).
3. `extraction/pipeline/aiExtraction.ts`: write it in `applyExtractionToTor` with `assignIfWritable`.
4. `models/Tor.ts`: add the stored field if it is new.
5. Tests: `fieldSchema.test.ts` and `fieldCoercion.test.ts` guard the key lists and parsers.
6. Docs: the table in [api-reference.md](api-reference.md#extracted-fields).

### Add a scheduled job

Add its expression to `scheduler/cronConfig.ts` (default plus env override, and add it to `validateCronConfig`), register it in `scheduler/index.ts` under `withLock('<unique key>', …)`, document the variable in [configuration.md](configuration.md), and add it to the [jobs table](architecture.md#scheduled-jobs).

### Add a front-end page

1. Create `app/<route>/page.tsx`. Wrap signed-in pages in `<AccountShell>`; pass `allowedRoles={["admin"]}` for admin pages (the API must enforce the same thing, since the shell is only a convenience).
2. Add a typed helper in `lib/` that calls the API with `NEXT_PUBLIC_API_URL` and the Bearer token, throwing `Error(payload.error)` on failure.
3. Add a sidebar entry in `components/sidebar.tsx` if it needs one.
4. UI text is inline Thai, as elsewhere. Keep labels short.
5. Run `npm run typecheck && npm run build`.

## Git and pull requests

The history follows these conventions; please keep them.

- **Branches:** `feat/<topic>`, `fix/<topic>`, `ci/<topic>`, branched from `main`.
- **Commits:** Conventional Commits with a scope, for example `feat(calendar): show saved and all projects with a filter` or `fix(admin): send the auth token on every review-queue API call`.
- **Pull requests** merge into `main` through GitHub. CI must be green.
- **Keep the pull request focused.** One feature, its tests, and its doc changes.
- If you change behaviour, change the doc in the same pull request. [This table](#which-doc-to-update) says which.

### CI

`.github/workflows/ci.yml` runs on every push to `main` and every pull request to it, in three parallel jobs:

| Job | Does |
| --- | --- |
| `backend` | Node 20, `npm ci`, `npm run typecheck`, `npm test` (with a dummy `MONGODB_URI`) |
| `frontend` | Node 20, `npm ci`, `npm run typecheck`, `npm run build` |
| `docker` | `docker compose config --quiet`, then builds the images and waits for every service, ClamAV included, to report healthy (with dummy `MONGODB_URI` and `AUTH_SECRET`) |

> [!WARNING]
> The `backend` job's `npm test` currently runs **no tests**. `node --test` on Node 20 looks only for `.js` test files, so it finds none of the `*.test.ts` files and reports success. Until the workflow is fixed (pass the files explicitly, for example `node --import tsx --test "src/**/*.test.ts"`, and move CI to Node 22), run `npm test` locally before you push.

The unit tests never touch a real MongoDB or Google Cloud, so CI needs no secrets. **Do not add any.**

Three security workflows run alongside CI:

| Workflow | When | Does |
| --- | --- | --- |
| `codeql.yml` | Pushes to `main` (and `codex/**` branches), pull requests into `main`, and weekly | CodeQL static analysis of the JavaScript and TypeScript |
| `zap-baseline.yml` | Pushes to `main` (and `codex/**` branches), pull requests into `main`, or by hand | Starts the stack and runs an OWASP ZAP passive baseline scan against the API's health endpoint; the report is kept as an artifact for 30 days |
| `dependency-security.yml` | Pushes and pull requests that change a `package.json` or lockfile, weekly, or by hand | `npm audit --omit=dev --audit-level=high` for both packages, plus an SBOM for each |

Dependabot also opens weekly update pull requests for the npm dependencies. What each check covers, and how to run an authenticated scan by hand, is in [Security testing](security-testing.md) and [Dependency management](dependency-management.md).

## Which doc to update

| You changed… | Update |
| --- | --- |
| An endpoint, its parameters or its response | [API reference](api-reference.md) |
| Who may call something | [API reference](api-reference.md), [Authentication](authentication.md) |
| A model, field or index | [Database design](database-design.md) |
| An environment variable | [Configuration](configuration.md) (and the `.env.example` files) |
| How crawling, extraction or review behaves | [Extraction pipeline](extraction-pipeline.md) |
| Matching, alerts or the digest | [Notifications and matching](notifications-and-matching.md) |
| An analytics figure | [Analytics](analytics.md) |
| A screen or its labels | [Vendor guide](guides/vendor-guide.md), [Admin guide](guides/admin-guide.md), [front-end README](../front-end/README.md) |
| Something now works that did not, or the reverse | [Status](status.md) |
| A new term | [Glossary](glossary.md) |

## Debugging

- **Read the API terminal.** `morgan` prints every request. Pipeline modules log under a scope name (`scheduler`, `extraction:ai-sweep`, one per source).
- **Dry-run first.** `npm run extract -- --source <id> --dry-run` shows what a crawl would store, without touching a database. (`MONGODB_URI` must still be set to some value.)
- **Look at the job records.** `scrapejobs` and `extractionjobs` hold each run's counts, errors, timings and (for AI) per-field confidence and discarded fields. They are the pipeline's audit trail.
- **Use the browser's Network tab** for the exact request and the `{ "error": … }` the API returned.
- **Atlas Data Explorer** (or `mongosh`) is the quickest way to look at a stuck record. Remember that `closed` and `archived` are never set automatically, and that `discovered` means "not reviewed yet".

More symptoms and fixes are in [Troubleshooting](troubleshooting.md).

## Security hygiene

- Never commit `.env`, `.env.local`, `service-account.json` or anything under `secrets/`. The `.gitignore` files cover them; do not work around them.
- Do not paste secrets or real tokens into issues, chats or test files. Tests use fixed dummy values.
- If a secret leaks, **rotate it**, then clean up. Deleting a commit is not enough.
- Do not weaken the crawler's politeness or its compliance gate to make something faster. They exist because the sources are real government sites.
