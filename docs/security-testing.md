# Security testing

## Automated checks

Two GitHub Actions workflows provide the baseline security checks for this
project:

- **CodeQL** (`.github/workflows/codeql.yml`) performs static analysis of the
  JavaScript and TypeScript code.
- **OWASP ZAP Baseline** (`.github/workflows/zap-baseline.yml`) builds a fresh
  Docker Compose stack and performs a passive scan of the unauthenticated API
  health endpoint. It runs on pushes, pull requests, and on demand.

The ZAP job saves `zap-baseline.html` and `zap-baseline.json` as a 30-day
workflow artifact. The baseline scan is intentionally passive: it does not
submit forms, create records, or exercise authenticated workflows. Warnings do
not block the workflow (`-I`); they must instead be reviewed and tracked as
security findings.

## Manual authenticated scan

Before each course milestone or production release, run a separate authenticated
scan against a non-production environment:

1. Create a dedicated least-privilege test account and obtain a short-lived
   access token through the normal login flow.
2. In OWASP ZAP, define the allowed target as the staging API origin only and
   add the bearer token using an HTTP Sender or Replacer rule. Never record or
   upload a real user token.
3. Use the passive scan first. Agree on scope and back up test data before any
   active scan, because active rules may modify data or put load on the service.
4. Export the HTML and JSON reports, then record each finding, severity, owner,
   remediation, and retest result in the security test evidence for the course
   project.

The CI scan deliberately uses temporary environment values and only visits
`/api/health`; it never receives production credentials or a production URL.
