# Security logging inventory

The API writes JSON security events to standard output. A production log
collector must retain these events for at least 90 days, restrict read access
to operations staff, and make the stored log stream append-only.

| Event | Trigger | Fields retained | Sensitive data excluded |
| --- | --- | --- | --- |
| `auth.login_succeeded` | Successful password login | timestamp, request ID, actor ID, IP | password, bearer token, email |
| `auth.login_failed` | Invalid credentials, locked, suspended, or unverified account | timestamp, request ID, optional actor ID, reason, IP | password, bearer token, email |
| `auth.logout` | Logout request | timestamp, request ID, optional actor ID, IP | bearer token |
| `auth.authentication_failed` | Missing/invalid session | timestamp, request ID, IP | bearer token |
| `auth.authorization_denied` | Role or ownership check fails | timestamp, request ID, actor ID, IP | request body |
| `rate_limit.*` | Authentication or API-write rate limit reached | timestamp, request ID, method, path, IP | request body, query string |
| `validation.upload_rejected` | File upload violates type or size control | timestamp, request ID, code, IP | file contents, filename |
| `error.unhandled` | Unexpected request failure | timestamp, request ID, error class, IP | error message, stack trace, request body, query string |

Application request logs intentionally use only the URL path, not the full
URL, because signed-document links can put short-lived tokens in their query
string. Reset-password and email-verification tokens are delivered in URL
fragments and sent to the API only in a POST body. Security events and audit records must be sent
to a centralized provider before production release; container stdout alone
does not provide tamper-resistant retention.
