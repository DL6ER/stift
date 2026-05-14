# Configuration

All settings are passed via environment variables to the Docker container.

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Host port to expose the web UI |
| `DEVMODE` | `false` | Development *build*: no minification, source maps (build-time arg) |
| `DEV_MODE` | `false` | Development *runtime*: verbose API logs + UI banner |
| `DATA_DIR` | `/data` | Storage directory inside the container (`stift.db` + `users/`) |
| `COMPRESS_UPLOADS` | `true` | Auto-compress images to WebP when saving to server |
| `MAX_PROJECT_SIZE_MB` | `15` | Maximum size per project payload (enforced server-side) |
| `MAX_PROJECTS_PER_USER` | `50` | Default per-user project quota assigned at registration |
| `ALLOW_REGISTRATION` | `true` | When `false`, `/api/auth/register` is rejected. Useful for locked-down public instances |
| `FOOTER_LINKS` | `[]` | JSON array of `{label,url}` rendered in the app footer (e.g. Impressum / Datenschutz pages hosted elsewhere) |
| `SPONSOR_URL` | unset | When set AND `ALLOW_REGISTRATION=false`, the sign-in dialog shows a "Become a sponsor" CTA linking here instead of "Registration is disabled" |
| `CORS_ORIGINS` | unset | Comma-separated allowlist of origins for cross-origin XHR/fetch (e.g. `https://app.example,https://staging.example`). Empty (the default) means **same-origin only**: no CORS headers are set, so cross-origin requests are blocked by the browser. Set explicitly to `*` only if you understand the risk; that echoes any caller's `Origin` back. |
| `STIFT_PUBLIC_URL` | unset | Trusted public origin of the deployment, e.g. `https://stift.example.com`. When set, the OIDC handlers build the `redirect_uri` from this value instead of the per-request `Host` / `X-Forwarded-Host` headers. Recommended for any public deployment with OIDC enabled. |
| `SESSION_MAX_AGE_HOURS` | `24` | Lifetime of an OIDC session in hours, before the SPA has to re-authenticate against the IdP. Clamped to `1..720` (one hour to 30 days). |

## OpenID Connect (optional)

Set `OIDC_ENABLED=true` to delegate login to an external identity provider. When active, the auth dialog replaces the password form with an SSO button; the label is configurable. Authorization-code flow with PKCE (S256), signed state/nonce/verifier cookies, `openid-client` v5 under the hood.

| Variable | Default | Description |
|----------|---------|-------------|
| `OIDC_ENABLED` | `false` | Master switch. When `true`, the other `OIDC_*` variables become required. |
| `OIDC_ISSUER_URL` | unset | Discovery base URL of the identity provider (e.g. `https://auth.example.com`). |
| `OIDC_CLIENT_ID` | unset | Client identifier registered at the identity provider. |
| `OIDC_CLIENT_SECRET` | unset | Confidential client secret. Keep out of version control. |
| `OIDC_REDIRECT_PATH` | `/oidc/callback` | Callback path appended to `PUBLIC_BASE_URL`; must match what is registered at the provider. |
| `OIDC_LOGIN_LABEL` | `Mit Single Sign-On anmelden` | Text shown on the SSO button in the auth dialog. |
| `OIDC_PROVISION_WEBHOOK_URL` | unset | When set, a `POST` with `{sso_user_id, stift_user_id, email}` is sent on first-time login of a new user. Failures are queued in an on-disk outbox and retried with exponential backoff. |
| `OIDC_PROVISION_WEBHOOK_SECRET` | unset | HMAC-SHA256 signing key for the provision webhook. Required if `OIDC_PROVISION_WEBHOOK_URL` is set; sent as `x-stift-oss-signature: sha256=<hex>`. |

When `OIDC_ENABLED=true` and any of `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` is missing, the server aborts at startup. The server also aborts when `OIDC_PROVISION_WEBHOOK_URL` is set without an `OIDC_PROVISION_WEBHOOK_SECRET`, so a misconfigured deployment cannot send "signed" payloads with an empty HMAC key.

For any public OIDC deployment also set `STIFT_PUBLIC_URL` (see the table at the top of this file) so the `redirect_uri` derives from a trusted constant instead of the per-request `Host` header.

### Known limitations of the OIDC flow

- **Concurrent sign-ins in two tabs collide.** `/oidc/login` stores its
  `state`, `nonce`, and PKCE verifier in cookies on the deployment origin.
  Cookies are per-origin, not per-tab, so opening a second sign-in flow
  while the first is still at the identity provider overwrites the first
  tab's verifier; the first callback then fails with "expired sign-in
  session". This is a UX rough edge, not a security weakness -- the
  validation correctly rejects the mismatch. Users hitting this should
  retry the sign-in in a single tab. A future revision is expected to
  move the verifier into a state-keyed server-side store.

- **The OIDC `userinfo` endpoint is not consulted.** All claims come from
  the ID token (`tokenSet.claims()`). If your identity provider exposes
  the `email` claim only via `/userinfo` and not in the ID token, set up
  the IdP to include `email` in the ID token, otherwise every sign-in
  provisions a fresh `sso-<hash>` account and the email-based linking
  for legacy password accounts never fires.

## Example: public instance with externally-hosted legal pages and signup

```bash
ALLOW_REGISTRATION=false \
SPONSOR_URL='https://example.com/signup' \
FOOTER_LINKS='[{"label":"Impressum","url":"https://example.com/impressum"},{"label":"Datenschutz","url":"https://example.com/datenschutz"}]' \
docker compose up -d
```

## Locking down a public instance

There is no "demo mode": server-side storage is gated by whether any user accounts exist. To run a public instance where the public can't self-register, launch with registration disabled:

```bash
ALLOW_REGISTRATION=false docker compose up -d
```

`/api/auth/register` will return 403, the "Create account" link is hidden in the UI, and as long as no users exist the server offers local-only editing. Existing users, if any, can still sign in. To bring new users onto a locked-down instance, use the invitation flow described below.

## Invitation tokens

When `ALLOW_REGISTRATION=false`, public registration is closed but accounts can still be created via single-use invitation tokens. Invites are inserted directly into the `invitations` table in `stift.db` (SQLite). The point of the invitation flow is that the user's password stays in the user's browser: nothing in the issuing pipeline ever sees or transmits a plaintext password.

```sql
-- Insert an invite directly into the database:
INSERT INTO invitations (token, max_projects, can_share_projects, expires_at, created_at)
VALUES ('inv_' || hex(randomblob(18)), 25, 1, datetime('now', '+14 days'), datetime('now'));
```

Once you have the token value, send the user a link:

```
https://your-stift/?invite=<token>
```

The frontend detects `?invite=...` and opens the registration dialog (even with `ALLOW_REGISTRATION=false`) pre-bound to that invite. The user picks a username and password in the browser. The password derives the auth token and the encryption key client-side, exactly as for normal registration. The server consumes the invite atomically and creates the account with the invite's quota baked in.

Invites are single-use, optionally time-limited, and atomically consumed.

## Development mode

```bash
DEV_MODE=true docker compose up
```

Turns on verbose request logging in the API container (every request is printed with method, path, status, and timing) and shows a `⚠ DEV MODE` banner in the status bar so you can't forget you left it on. Never enable in production.
