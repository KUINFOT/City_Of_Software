# Authentication and access control

How people prove who they are, what each kind of account may do, and how the platform keeps a stolen link or a stale session from becoming a problem.

## The short version

- Three roles: **vendor**, **reviewer** (a BMA official) and **admin**. Only vendors and BMA officials can sign themselves up; the first admin is promoted by hand.
- Sign-up **stores nothing until the email link is opened**. The details travel, encrypted, inside the link.
- Sign-in returns a **signed token**. Every request is also checked against a **server-side session** and the user's current status, so logout, suspension and role changes take effect on the very next request.
- Passwords are **scrypt-hashed**, at least 10 characters, and five wrong guesses lock the account for 15 minutes.
- One-purpose links (open a document, unsubscribe) use small **signed tokens** instead of sessions.

---

## Roles

| Role | Who | How they get it |
| --- | --- | --- |
| `vendor` | A software company or freelancer looking for work (ผู้ขายซอฟต์แวร์) | Self sign-up |
| `reviewer` | A BMA official (เจ้าหน้าที่กรุงเทพมหานคร) | Self sign-up, choosing the BMA official option |
| `admin` | A platform administrator (ผู้ดูแลระบบ) | Promoted by another admin, or by hand in the database for the very first one |

(The `User` schema also lists a `public` role, but the guards reject it. Anonymous visitors simply have no token.)

### What each role can do

This is what the API **enforces**, which is what matters. The UI hides things it knows you cannot use, but it is the API that says no.

| Capability | Anonymous | Vendor | Reviewer | Admin |
| --- | :---: | :---: | :---: | :---: |
| Browse, search, read a TOR and its source document links | ✅ | ✅ | ✅ | ✅ |
| Sign up, sign in, reset a password | ✅ | ✅ | ✅ | ✅ |
| Historical-budget and agency-frequency analytics | | ✅ | ✅ | ✅ |
| Read or edit **own** vendor profile | | ✅ | ✅ | ✅ (anyone's) |
| Qualification match and "why this matched me" | | ✅ | | |
| Save TORs, private notes, compare, alert history | | ✅ | | |
| Review queue: correct, approve, reject, supersede, upload a TOR | | | | ✅ |
| Start and monitor crawls, adapter health, AI job history | | | | ✅ |
| Audit log; list and change users | | | | ✅ |

> [!NOTE]
> The Accounts screen describes the reviewer role as "reviews extracted data before it is published". Today that work is done by **admins**: every review-queue route is admin-only, and a `reviewer` has no extra API permissions beyond a normal signed-in user. Giving reviewers their own slice of the queue would be a small, contained change in `routes/review.routes.ts`.

Admins deliberately cannot use the vendor-only endpoints (saved TORs, qualification match). Those answer "what does this mean for *my company*", which an admin does not have.

---

## Signing up

### Vendors: three steps

```mermaid
sequenceDiagram
    actor V as Vendor
    participant W as Web app
    participant A as API
    participant M as Email

    V->>W: 1. Fill in /register
    W->>A: POST /auth/register (role: vendor)
    A-->>W: 200, nextStep: vendor_onboarding (the email is still free)
    V->>W: 2. Fill in /vendor-onboarding (stack, certifications, past contracts)
    W->>A: POST /auth/complete-vendor-onboarding
    A->>M: Verification link (sign-up data encrypted inside it)
    A-->>W: 200, check your email
    V->>A: 3. Open the link: GET /auth/verify-email?token=…
    A->>A: Create the user (verified, active) and the vendor profile
    A-->>V: 302 to /verify-email?status=verified
```

Between steps 1 and 2 the draft lives only in the browser's `sessionStorage`. The server performs a read-only check that the email is not already registered, and nothing else.

### BMA officials: two steps

`POST /auth/register` with `role: reviewer` validates the form and emails the verification link immediately (202). Opening the link creates the account.

### Validation rules

| Field | Rule |
| --- | --- |
| Name, organisation, phone | Required, trimmed |
| Email | Must look like an address; stored lower-case; one account per address |
| Password | **At least 10 characters**, and not one of a short list of very common passwords (`password`, `password123`, `1234567890`, `qwertyuiop`, `cityofsoftware`, compared case-insensitively) |
| Role | `vendor` or `reviewer` only |

Registering with an address that already has a *verified* account returns 409 ("An account with this email already exists"). That does reveal whether an address is registered; sign-in and password reset do not.

### The verification link

- Valid for **24 hours**.
- The link is `…/api/auth/verify-email?token=…`. It lands on the API, which creates the account and redirects (302) to `/verify-email?status=verified` or `status=invalid` on the web app.
- Registration data is encrypted with AES-256-GCM, with a key derived from `AUTH_SECRET`, and the token must match its canonical base64url form exactly, so any edited character is rejected before decryption is attempted.
- Opening it twice, or after the account exists, is `invalid`.
- If the same address registered before but never verified (the older flow created unverified users), the verified registration replaces that stale record.

---

## Signing in

`POST /auth/login` with email and password. Checks run in this order:

1. Locked? If `loginLockedUntil` is in the future: **429** ("Too many failed sign-in attempts. Please try again in 15 minutes").
2. Wrong email or password: **401** ("Email or password is incorrect."), the same message for both. A wrong password on a real account increments `failedLoginAttempts`; the fifth failure locks the account for **15 minutes**.
3. Suspended: **403**.
4. Email not verified: **403** with `code: "EMAIL_NOT_VERIFIED"`.
5. Success: counters reset, a `Session` document is created, and the response is `{ user, token }`.

### Anatomy of the session

```
token = base64url(payload) + "." + HMAC-SHA256(payload, AUTH_SECRET)

payload = { sub: userId, role, sid: sessionId, sv: sessionVersion, exp: now + 8 hours }
```

On **every** protected request the API does four things:

1. Verifies the signature in constant time and checks `exp` (8-hour absolute lifetime).
2. Finds the `Session` with that `sid`: not revoked, not past `expiresAt`. In the same step it **slides `expiresAt` forward by 30 minutes** (the idle timeout).
3. Loads the `User`: `status` must be `active`, and `sessionVersion` must equal the token's `sv`.
4. Uses the role **from the database**, not from the token.

Consequences worth knowing:

| Event | Effect |
| --- | --- |
| Logout (`POST /auth/logout`) | Session marked revoked; the token stops working at once. Always returns 204, so a browser can finish signing out even if the API is unreachable |
| 30 minutes idle | Session expires. The web app also signs out after 30 minutes without activity |
| Password reset | `sessionVersion` is incremented and every session is revoked: **all devices are signed out** |
| Admin changes your role or suspends you | `sessionVersion` is incremented: existing sessions die immediately |
| You are promoted by editing the database directly | The server sees the new role on your next request, but the web app's stored user is stale until you sign out and in |
| `AUTH_SECRET` changes | Every token fails verification: everyone is signed out |

Sessions and tokens are removed from MongoDB automatically by TTL indexes after they expire.

---

## Passwords

- Hashed with **scrypt** (16-byte random salt, 64-byte key), stored as `scrypt$<salt>$<key>`. Plain-text passwords are never persisted or logged.
- Verification uses a constant-time comparison.

### Forgotten password

```
/forgot-password ─► POST /auth/forgot-password ─► email with a 1-hour link
/reset-password?token=… ─► POST /auth/reset-password
```

- The response is **always** the same ("If an account exists for this email, a password reset link has been sent."), whether or not the address is registered, and even if email delivery fails. The endpoint cannot be used to discover who has an account.
- Only verified accounts get a link; at most one request per minute per account; a new request invalidates the previous link.
- The link is valid for **1 hour** and works once. Using it sets the new password, bumps `sessionVersion` and revokes every session.

---

## Signed links

Not everything is a session. Some access is deliberately narrower.

| Token | Authorises | Lifetime | Where it is kept |
| --- | --- | --- | --- |
| **Session token** | Calling protected API routes as you | 8 h absolute, 30 min idle | Browser `localStorage`; the `sessions` collection (by session id) |
| **Pending-registration link** | Creating your account | 24 h | Only inside the email (AES-GCM ciphertext); nothing in the database |
| **Email-verification token** | Verifying an existing, unverified account (legacy resend path) | 24 h | Only its SHA-256 hash is stored |
| **Password-reset token** | Setting a new password once | 1 h | Only its SHA-256 hash is stored |
| **Document-access token** | Downloading **one** document | **15 min** | Nowhere (stateless HMAC); handed out in `GET /tors/:id/documents` |
| **Unsubscribe token** | Removing the email channel for one vendor | **Never expires** | Nowhere (stateless HMAC) |

All HMAC tokens use the same construction (HMAC-SHA256, base64url, constant-time compare) and the same `AUTH_SECRET`, so there is no second secret to provision.

Why the unsubscribe token never expires: a link in an old, unread email must still work whenever it is finally opened, and the worst case of a leaked one is someone unsubscribing a vendor from *email* (reversible in Settings), not a data exposure.

---

## Managing accounts (admins)

- **List:** `GET /admin/users` returns everyone without password or session data. The Accounts screen shows them.
- **Change:** `PATCH /admin/users/:id` with a `role` (`vendor`, `reviewer`, `admin`) and/or a `status` (`active`, `suspended`).
  - You **cannot change your own role or status**, which stops the last admin locking themselves out.
  - A change bumps the target's `sessionVersion`, ending their sessions at once.
  - Each change writes an audit entry (`user.role.updated` or `user.status.updated`) with before and after values.

### The very first admin

No sign-up path creates an admin. After registering and verifying a normal account, promote it in the database:

```js
db.users.updateOne({ email: "you@example.com" }, { $set: { role: "admin" } })
```

Then sign out and back in. Step-by-step in [Getting started](getting-started.md#7-make-yourself-an-administrator).

---

## What this does not do yet

Better stated plainly than discovered later.

- **No general rate limiting.** There is a sign-in lockout and one-minute cooldowns on verification and reset emails, but no per-IP throttling of other endpoints. Put a reverse proxy in front for that.
- **The token is in `localStorage`.** Convenient and cross-tab, but readable by any script that runs on the page. Nothing renders untrusted HTML today.
- **Review endpoints trust a client-sent `actorId`.** The caller must be an admin, but the audit trail records the `actorId` in the request body, not the signed-in user's id.
- **Two document endpoints are public.** `GET /documents/:id` and `GET /documents/:id/file` need no sign-in, and the file endpoint verifies a token only when one is supplied. Anyone who knows a document id can fetch it.
- **No second factor, no email-change flow, no "sign out everywhere" button.** (A password reset does sign out everywhere.)
- **No HTTPS in the app.** Terminate TLS at a reverse proxy and use `https://` for `APP_URL`, `PUBLIC_API_URL` and `CORS_ORIGIN`.
- **The development secret is public.** Without `AUTH_SECRET`, development mode uses a built-in default that anyone reading the source knows. Production refuses to start without a real one.

See [Status and limitations](status.md) for the full list.
