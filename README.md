# City_Of_Software

A document-intelligence application: upload documents, run OCR / text extraction, and
generate AI summaries.

## Tech stack

| Layer                     | Technology                                                        |
| ------------------------- | ----------------------------------------------------------------- |
| Frontend                  | Next.js · React · TypeScript                                       |
| Backend / API             | Node.js · Express · TypeScript                                    |
| Database                  | MongoDB Atlas (Mongoose)                                           |
| AI / Document Intelligence| Vertex AI (Google Cloud) — Document AI (OCR/extraction) + Gemini summaries |

## Structure

```
City_Of_Software/
├── back-end/    Express + TypeScript API — see back-end/README.md
└── front-end/   Next.js frontend — landing, registration, dashboard, settings
```

## Getting started (back-end)

```bash
cd back-end
npm install
cp .env.example .env   # add your MongoDB Atlas connection string
npm run dev
```

Full details and API reference: [back-end/README.md](back-end/README.md).

> **Note:** The Vertex AI / Document AI integration is currently stubbed — the API runs
> and returns placeholder AI output without Google Cloud credentials. See the back-end
> README for how to wire up the real calls.

## Getting started (front-end)

The frontend currently uses local mock data and does not call the backend.

```bash
cd front-end
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in a browser.

Available pages:

| Page | URL |
| --- | --- |
| Landing page | `http://localhost:3000/` |
| Registration | `http://localhost:3000/register` |
| Vendor dashboard | `http://localhost:3000/dashboard` |
| Account settings | `http://localhost:3000/settings` |

To verify or run a production build:

```bash
cd front-end
npm run typecheck
npm run build
npm run start
```

More frontend details are available in [front-end/README.md](front-end/README.md).
