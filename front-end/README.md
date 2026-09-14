# City of Software Frontend

Next.js frontend for the City of Software / BMA TOR Portal. This version is a
frontend-only prototype: all project, account, and notification information is
mock data stored in the UI, and no backend API is called.

## Requirements

- Node.js 18.18 or newer
- npm 9 or newer

## Run locally

From the repository root:

```bash
cd front-end
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The development server
automatically reloads the browser when source files change.

## Pages

| Route | Description |
| --- | --- |
| `/` | Public landing page and TOR search |
| `/browse-tors` | Searchable mock TOR database with filters |
| `/register` | Supplier / BMA official registration form |
| `/dashboard` | Supplier dashboard and recommended TORs |
| `/settings` | Account profile, alerts, and saved searches |

The buttons and forms demonstrate client-side interactions only. For example,
submitting the hero search opens `/browse-tors` with the search keyword in the
URL, registration redirects to the dashboard after browser validation, and
settings can be toggled locally.

## Validate the project

```bash
npm run typecheck
npm run build
```

## Run the production build

Build the app first, then start the production server:

```bash
npm run build
npm run start
```

The production server is also available at
[http://localhost:3000](http://localhost:3000) by default.
