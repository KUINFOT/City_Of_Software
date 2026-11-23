# City of Software: front-end

The Next.js web app for vendors, BMA officials and administrators. The interface is in **Thai**, except the Advanced search page (`/search`), which is in English. The code and these docs are in English.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · [Lucide](https://lucide.dev) icons. Styling is plain CSS in `app/globals.css`; there is no UI framework.

> The app talks to the [back-end API](../back-end/README.md) for everything: accounts, TORs, saved items, alerts, analytics and the admin tools. It needs a running API to show anything beyond the sign-in and landing pages.

## Requirements

- Node.js 22 recommended (Next.js 16 itself needs 20.9 or newer; the Docker image uses 22)
- npm 9 or newer
- A running back-end ([setup](../back-end/README.md#set-up))

## Run it

```bash
cd front-end
npm install
npm run dev
```

Open <http://localhost:3000>. The dev server uses Turbopack and reloads on every change.

The app finds the API through one variable:

| Variable | Default | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api` | The URL the **browser** uses, including `/api`. Copy `.env.example` to `.env.local` to change it. |

> [!WARNING]
> `NEXT_PUBLIC_*` values are compiled into the JavaScript bundle at **build** time. For a production build or a Docker image, set it *before* `npm run build` or `docker compose up --build`; changing it afterwards has no effect until you rebuild. Because the browser calls the API directly, the back-end's `CORS_ORIGIN` must also include this app's origin.

## Pages

The sidebar and headers show Thai labels. English meanings are given here so you can find your way around.

### Public

| Route | Page (Thai title) | What it does |
| --- | --- | --- |
| `/` | Landing | Hero search box and headline facts (static text, not live numbers) |
| `/browse-tors` | Browse TORs (ค้นหา TOR) | Published TORs, newest first, with a title/agency search box and a stage drop-down. Reads `GET /api/tors` |
| `/search` | Advanced search (ค้นหาขั้นสูง) | Keyword search, filters (technology, project type, agency, stage, budget range, date ranges, availability) and seven sort orders. The whole search is stored in the URL. Reads `GET /api/documents` |
| `/tors/[id]` | TOR detail | Summary, key dates with days remaining, requirements, provenance and the source document, AI caution flags, outlier note, and (signed in as a vendor) the qualification-match panel and match reasons. Also save, and print to PDF |
| `/login`, `/register` | Sign in, create account | Vendors or BMA officials, by email or with *Continue with Google* (ดำเนินการต่อด้วย Google) when the server has Google sign-in configured. `/login` also finishes a Google sign-in: the one-use token arrives in the URL fragment |
| `/oauth-onboarding` | Google sign-up details | New Google users give name, organisation, phone and role; the account is created at once |
| `/vendor-onboarding` | Vendor profile step | Step 2 of 3 of sign-up for vendors: organisation, stack, certifications, past contracts |
| `/verify-email` | Email verification | Takes the token from the link's URL fragment (`#token=…`), posts it to the API and shows the result; also "send it again" |
| `/forgot-password`, `/reset-password` | Password recovery | Request and use a one-hour reset link (its token also travels in the URL fragment) |
| `/unsubscribed` | Unsubscribe result | Where the one-click unsubscribe link lands |

### Signed in (account area with the sidebar)

| Route | Page (Thai title) | Who | What it does |
| --- | --- | --- | --- |
| `/dashboard` | Dashboard (แดชบอร์ด) | Everyone | Greeting, profile-completeness prompt, saved TORs, recent matches (percentage and main reason) and deadlines in the next 14 days |
| `/saved-projects` | Saved projects (โครงการที่บันทึกไว้) | Vendors | Your shortlist, with private notes |
| `/imminent-deadlines` | Approaching deadlines (กำหนดส่งที่ใกล้ถึง) | Vendors | Every published TOR due within 14 days, with save buttons |
| `/calendar` | Calendar (ปฏิทิน) | Vendors | Submission deadlines by month, for saved or all projects |
| `/compare` | Compare TORs (เปรียบเทียบ TOR) | Vendors | Two steps: pick 2–4 saved TORs, then see budget, duration, requirements and deliverables side by side; export or print to PDF |
| `/settings` | Account and profile (โปรไฟล์บัญชี) | Everyone | Edit the vendor profile (versioned), connect a Google account, alert frequency, followed agencies and keywords |
| `/analytics/budgets` | Historical budgets (เปรียบเทียบงบประมาณ) | Everyone | Distribution and yearly trend for a comparable set |
| `/analytics/agencies` | Agency frequency (ความถี่รายหน่วยงาน) | Everyone | How often each agency procures, and the typical size |

### Admin only

Each of these is wrapped in `<AccountShell allowedRoles={["admin"]}>`, and the API enforces the same rule independently.

| Route | Page (Thai title) | What it does |
| --- | --- | --- |
| `/admin/review` | Review queue (คิวตรวจสอบ) | Pending TORs, oldest first, with confidence and possible-duplicate markers |
| `/admin/review/[id]` | Review a TOR | Original document beside the extracted fields; correct fields; approve or reject with a reason |
| `/admin/agency-monitor` | Agency monitor (ติดตามหน่วยงาน) | Every source with its compliance status and health; run one by hand |
| `/admin/adapter-health` | Adapter health (สถานะตัวเชื่อมต่อ) | Healthy / stale / format-suspected / error / blocked / never-run per source |
| `/admin/accounts` | Accounts and roles (บัญชีและบทบาท) | List users; change role; suspend or restore |
| `/admin/audit-log` | Audit log (ประวัติการตรวจสอบ) | Every recorded human action |
| `/admin/export-repository` | Export (ส่งออกข้อมูล) | **Demo only.** Downloads three hard-coded sample rows as JSON or CSV |

### Placeholders

These exist in the navigation but do nothing real yet. They are listed so nobody is surprised.

- `/ai-recommendations` shows "Coming Soon".
- The **API key** section of `/settings` says key management will arrive later.
- In `/settings`, the three alert toggles and the *saved searches* list only hold state in the page. Only the **alert frequency**, **followed agencies** and **followed keywords** are saved to the server.

## How the app talks to the API

All network access goes through small typed helpers in `lib/`. Pages never call `fetch` with a hand-built URL for API data, with one exception noted below.

| File | Wraps |
| --- | --- |
| `lib/auth-api.ts` | sign-in, sign-up, verification, password reset, admin user management |
| `lib/tor-api.ts` | TOR list and detail, source documents, qualification match, match reasons, saved TORs and notes, compare |
| `lib/bookmarks-api.ts` | A flat view of saved TORs used by the dashboard, calendar and deadline pages |
| `lib/vendor-profile.ts` | Get and save the vendor profile (with optimistic-concurrency version) |
| `lib/notifications-api.ts` | The alert history |
| `lib/agencies-api.ts` | The agency picker |
| `lib/analytics-api.ts`, `analytics-format.ts` | Analytics queries and number formatting |
| `lib/review-api.ts`, `extraction-api.ts`, `audit-log-api.ts` | The admin tools |
| `lib/print-export.ts` | Opens a print-optimised report in a new window so the vendor can "Save as PDF" |
| `lib/registration-draft.ts` | Keeps the sign-up form between steps in `sessionStorage` |

(`app/search/page.tsx` calls `GET /documents` directly with its own `fetch`.)

Every helper reads `NEXT_PUBLIC_API_URL` and sends `Authorization: Bearer <token>` where the endpoint needs one. Errors from the API arrive as `{ "error": "…" }` and are thrown as `Error(message)`, so a page can show the server's own message.

## Sessions in the browser

`components/auth-provider.tsx` owns the signed-in state.

- After sign-in the `{ user, token }` pair is stored in `localStorage` under **`city-of-software-user`** and mirrored in React context (`useAuth()`).
- A timer signs you out after **30 minutes without activity** (pointer, key, scroll or touch). The server enforces the same 30-minute idle window independently.
- `AccountShell` redirects anonymous visitors to `/login?next=…` and shows an "admin only" page to a signed-in user without the right role. This is a convenience; the API is what actually protects the data.
- After an admin changes your role, **sign out and back in** so the stored user refreshes.

## Project structure

```
front-end/
├── app/                  routes (App Router). Each folder is a URL; page.tsx is the page
│   ├── layout.tsx        root layout: <html lang="th">, AuthProvider, AdminAuditProvider
│   ├── globals.css       all styling
│   ├── admin/            admin tools
│   ├── analytics/        budgets/ and agencies/
│   ├── tors/[id]/        TOR detail (server wrapper + tor-detail-client.tsx)
│   └── …                 one folder per route listed above
├── components/           AccountShell, Sidebar, SiteHeader, AccountMenu, AuthProvider,
│                         MatchGrid, HeroSearch, analytics tabs and filters
├── lib/                  API helpers and small utilities (above)
├── data/mock-auth.ts     legacy: only the AppRole type is still used
├── Dockerfile            multi-stage, non-root, health-checked
└── next.config.ts
```

Conventions you will meet:

- Most pages are client components (`"use client"`) that fetch in `useEffect`; the page file is often a thin wrapper around a `*-client.tsx` file.
- Thai UI strings are written inline in the component. There is no translation layer.
- `AdminAuditProvider` is a leftover from the mock-data prototype. The admin screens still call `recordEvent`, but nothing displays that in-memory feed any more; the **Audit log** page reads the server's real log.

## Check and build

```bash
npm run typecheck
npm run build
```

Run the production build locally:

```bash
npm run start
```

There is no front-end test suite yet; CI runs `npm run typecheck` and `npm run build` on every pull request.

## Docker

`front-end/Dockerfile` builds on `node:22-slim` as a non-root user with a health check. `NEXT_PUBLIC_API_URL` is a **build argument** and defaults to `http://localhost:4000/api`:

```bash
docker build --build-arg NEXT_PUBLIC_API_URL=https://example.org/api -t city-of-software-front-end front-end
```

Normally you will use the root [`docker-compose.yml`](../docker-compose.yml), which passes `PUBLIC_API_URL` through as that argument. See [docs/deployment.md](../docs/deployment.md).
