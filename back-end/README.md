# City_Of_Software — Back-end API

Document-intelligence API: upload documents, run OCR/text extraction, and generate
AI summaries.

**Stack:** Node.js · Express · TypeScript · MongoDB Atlas (Mongoose) · Gemini Enterprise
Agent Platform / Document AI (Google Cloud).

> The AI services **fall back to a safe stub** whenever `GCP_PROJECT_ID` is unset — no
> Google Cloud credentials are required to run the API. See
> [Wiring up the real AI](#wiring-up-the-real-ai).

## Prerequisites

- Node.js ≥ 18 (tested on v22)
- A MongoDB Atlas cluster + connection string

## Setup

```bash
cd back-end
npm install
cp .env.example .env   # then edit .env with your real values
```

Set at least `MONGODB_URI` in `.env`. The Google Cloud variables are only needed once
you wire up the real AI calls.

## Run

```bash
npm run dev        # start with hot reload (tsx watch)
npm run build      # compile TypeScript to dist/
npm start          # run the compiled build
npm run typecheck  # type-check without emitting
```

The server listens on `http://localhost:4000` (override with `PORT`). If MongoDB can't
be reached the server still starts, but database operations will fail until
`MONGODB_URI` is valid.

## API

| Method | Path                             | Description                                  |
| ------ | -------------------------------- | -------------------------------------------- |
| GET    | `/api/health`                    | Liveness check                               |
| POST   | `/api/documents/upload`          | Upload a file (`multipart/form-data`, field `file`), runs extraction |
| GET    | `/api/documents`                 | List documents (newest first)                |
| GET    | `/api/documents/:id`             | Fetch a single document                      |
| POST   | `/api/documents/:id/summarize`   | Generate an AI summary of the extracted text |

### Quick test

```bash
curl http://localhost:4000/api/health
curl -F "file=@/path/to/some.pdf" http://localhost:4000/api/documents/upload
curl -X POST http://localhost:4000/api/documents/<id>/summarize
```

## Project structure

```
src/
├── index.ts                    entry: load env, connect DB, start server
├── app.ts                      express app + middleware + routes
├── config/  env.ts, db.ts      typed env, Mongo connection
├── models/  Document.ts        Mongoose schema/model
├── routes/                     /api router + /api/documents routes
├── controllers/                request handlers
├── services/                   documentAI (OCR) + gemini (extraction/summaries)
├── middleware/                 upload (multer), error handler
└── types/                      shared TS interfaces
```

## Wiring up the real AI

Both service files call the real Google Cloud APIs directly and fall back to a stub
only when `GCP_PROJECT_ID` is unset — there's no commented-out code to uncomment,
just env values to fill in:

- `src/services/documentAI.service.ts` → Google Cloud Document AI (OCR / extraction).
  Needs `GCP_PROJECT_ID`, `GCP_LOCATION`, `DOC_AI_PROCESSOR_ID`, and a service-account
  key referenced by `GOOGLE_APPLICATION_CREDENTIALS`.
- `src/services/gemini.service.ts` → Gemini, via the Gemini Enterprise Agent
  Platform (the 2026 rebrand of Vertex AI — same GCP project/billing, new name;
  named after the model rather than the platform since the platform's already
  been renamed once). Needs `GCP_PROJECT_ID`, `VERTEX_AI_LOCATION`, `VERTEX_AI_MODEL`.

`@google-cloud/documentai` and `@google/genai` are already installed. (`@google/genai`
is Google's current Node SDK for Gemini access — it replaced the now-removed
`@google-cloud/vertexai` package, whose `VertexAI` class was deprecated in June 2025
and dropped from the SDK in June 2026.)
