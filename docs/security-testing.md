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

## Extraction outbound-request tests

The extraction client resolves every discovered destination before connecting
and accepts only public HTTP(S) addresses on ports 80 or 443. Redirects are
followed manually so their destinations receive the same validation. The
regression suite covers loopback, private, link-local, documentation,
IPv4-mapped IPv6 addresses, and a redirect that attempts to reach
`127.0.0.1`; the latter proves the second request is not sent. TLS certificate
validation is never bypassed.

## OAuth account linking

An existing account is never linked merely because its email matches a Google
identity. Connecting Google starts from an authenticated application session
and uses a hashed, single-use state record that expires after ten minutes. The
callback also verifies that the originating server-side session remains active
and has not been invalidated before it writes the Google subject identifier.

## Email action tokens

Verification and password-reset links put their one-use token in the URL
fragment (`#token=…`), not a query string. The client removes the fragment
from the address bar before it posts the token to the corresponding
authentication endpoint. This keeps newly issued tokens out of server request
URLs, access logs, and referrer headers while preserving the existing one-use
and expiry checks.

## Compromised-password screening

Registration, vendor-onboarding completion, and password reset screen a
candidate password against HIBP's Pwned Passwords range API. The service gets
only the first five characters of a SHA-1 digest, with response padding
enabled; the full digest comparison happens locally. The registration or reset
is rejected if a match is found. If the privacy-preserving range request is
unavailable, the application returns a retryable error rather than accepting
the password without the check.

## PDF malware scanning

Every administrative PDF upload reaches `requireCleanUpload` after its size,
extension, MIME, and magic-byte checks. In production, the middleware streams
the in-memory file over ClamAV's private INSTREAM protocol and accepts it only
after the scanner responds `OK`. An infected file returns `422`; a timeout,
unreachable scanner, or malformed scanner response returns `503`, so it cannot
fall through to the PDF parser or storage. The filename and scanner signature
are not included in the response or security event.

Docker Compose starts a private `clamav` service and waits for its health check
before starting the API. For a non-Docker deployment, set
`UPLOAD_MALWARE_SCAN_MODE=required`, point the scanner host and port at a
private ClamAV daemon, and verify an upload is rejected while that daemon is
stopped. `disabled` is limited to local development; production defaults to
`required` even if the variable is not set.
