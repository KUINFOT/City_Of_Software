# Threat model

## Scope and assumptions

This model covers the browser application, the Express API, MongoDB Atlas,
document extraction, email delivery, Google OpenID Connect, and the external
services used during registration and document processing. It is reviewed when
an external integration, authentication flow, upload type, or deployment
boundary changes.

The production deployment terminates TLS before the application containers.
The API must be configured with the real HTTPS application origin, trusted
proxy-hop count, MongoDB URI, and server-side secrets. Development values are
not production credentials.

## Data classification

| Data | Classification | Protection |
| --- | --- | --- |
| Passwords | Restricted | Never logged or returned; stored only as salted scrypt hashes. |
| Session, reset, verification, and OAuth handoff tokens | Restricted | Signed or hashed at rest, short-lived, one-use where applicable, no-store responses; browser handoffs use URL fragments. |
| OAuth client secret, MongoDB URI, email credentials, GCP credentials | Restricted | Environment variables or read-only container secret mount; never in source control or browser bundles. |
| Account profile and contact details | Confidential | Authenticated API access, role and ownership checks, no logging of email addresses. |
| Uploaded and collected TOR PDFs | Internal | Type/size validation, ClamAV scan before parser/storage, private storage volume, signed access token for downloads, URL safety checks for collection. |
| Published TOR metadata | Public/Internal | Public reads where intentionally exposed; administrative changes require authorization and audit records. |

## Data-flow diagram

```mermaid
flowchart LR
  Browser[Browser / Next.js] -->|HTTPS API requests + bearer session| API[Express API]
  Browser <-->|Google authorization code flow| Google[Google OpenID Connect]
  API <-->|TLS| Mongo[(MongoDB Atlas)]
  API -->|TLS SMTP or HTTPS API| Mail[Email provider]
  API -->|HTTPS SHA-1 prefix only| HIBP[HIBP Pwned Passwords]
  API -->|TLS| GCP[Document AI / Vertex AI]
  API -->|Private INSTREAM socket| ClamAV[ClamAV daemon]
  API -->|Validated public HTTP(S) only| Sources[Government TOR websites]
  API -->|Private mounted storage| PDFs[(TOR PDF storage)]
```

Trust boundaries are crossed at the browser/API boundary, every third-party
service boundary, the public-source collection boundary, and the database and
file-storage boundaries. The browser is untrusted. Government websites and
third-party integrations are treated as untrusted inputs even when their host
is expected.

## Threats and controls

| Threat | Entry point | Controls in place | Residual work |
| --- | --- | --- | --- |
| Account takeover | Login, reset, OAuth | Password hashing, login and auth rate limits, account lockout, server-side session revocation, one-use reset tokens, verified Google ID tokens, explicit authenticated Google account linking | Move bearer session from localStorage to HttpOnly cookies if the architecture changes. |
| Credential reuse | Registration, reset | Common-password blocklist and HIBP k-anonymity range check with padded responses; fail closed if screening is unavailable | Periodically review password policy and dependency availability. |
| Token leakage | URLs, browser history, logs | Email/OAuth handoff tokens use fragments, then POST; request logs omit queries; `Cache-Control: no-store`; referrer policy is `no-referrer` | Keep new signed-link features on the same pattern. |
| Broken authorization / IDOR | User, admin, review, profile, document routes | Authentication middleware, role checks, ownership checks, server-side session validation, audit records for privileged changes | Maintain endpoint tests when new routes are added. |
| Injection | Request bodies, query parameters, reviews | Type/range/allowlist checks, Mongoose models, React's default escaping, no dynamic code execution, response security headers | Document validation rules for every newly added business workflow. |
| SSRF and malicious redirects | TOR source URLs and robots files | HTTP(S)-only, standard ports, no credentials, public-address DNS validation, manual redirect validation, TLS verification | Add deployment firewall egress allowlists for a stricter source-domain policy. |
| Malicious file upload | Administrative PDF upload | File-size limit, PDF MIME/extension checks, PDF magic-byte verification, in-memory ClamAV INSTREAM scan before parser/storage, fail closed if scanning is unavailable | Keep ClamAV definitions current and retain deployment evidence of scanner health. |
| Availability exhaustion | Authentication, writes, extraction | Request body limits, route rate limits, login lockout, extraction controls, scheduler disabled by default | Use a shared rate-limit store and database-backed scheduler lock before horizontal scaling. |
| Sensitive log disclosure or log injection | Request logging and errors | Structured security events, request IDs, restricted fields, generic error responses, documented log inventory, application-level immutable audit records | Grant the production API database account no update/delete access to audit records and send logs to centralized append-only storage with access control. |
| Vulnerable dependencies | npm dependencies and CI | Weekly Dependabot, dependency audit workflow, CycloneDX SBOM artifacts, defined remediation targets | Review the remaining moderate upstream findings and major-version migration proposals. |

## Verification evidence

- Backend unit tests include URL-safety, session, password-screening, OAuth,
  and verification-token tests.
- CI runs CodeQL, OWASP ZAP baseline, dependency audits, and SBOM generation.
- Before release, manually verify password login, Google login/linking,
  registration verification, password reset, signed PDF access, privileged
  review actions, and the HTTPS reverse-proxy configuration.
