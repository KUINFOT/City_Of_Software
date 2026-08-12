# City_Of_Software

A document-intelligence application: upload documents, run OCR / text extraction, and
generate AI summaries.

## Tech stack

| Layer                     | Technology                                                        |
| ------------------------- | ----------------------------------------------------------------- |
| Frontend                  | Next.js — _not yet scaffolded_                                     |
| Backend / API             | Node.js · Express · TypeScript                                    |
| Database                  | MongoDB Atlas (Mongoose)                                           |
| AI / Document Intelligence| Vertex AI (Google Cloud) — Document AI (OCR/extraction) + Gemini summaries |

## Structure

```
City_Of_Software/
├── back-end/    Express + TypeScript API — see back-end/README.md
└── front-end/   Next.js app (placeholder — not yet set up)
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
