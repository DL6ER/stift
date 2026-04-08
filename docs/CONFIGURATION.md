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
| `MAX_PROJECTS_PER_USER` | `50` | Default per-user project quota assigned at registration (admins can change per user via the admin API) |
| `ALLOW_REGISTRATION` | `true` | When `false`, `/api/auth/register` is rejected. Useful for locked-down public instances |
| `FOOTER_LINKS` | `[]` | JSON array of `{label,url}` rendered in the app footer (e.g. Impressum / Datenschutz pages hosted elsewhere) |
| `SPONSOR_URL` | unset | When set AND `ALLOW_REGISTRATION=false`, the sign-in dialog shows a "Become a sponsor" CTA linking here instead of "Registration is disabled" |
| `ADMIN_TOKEN` | auto-generated | Token for admin API access (printed to console at startup). Generate one with `openssl rand -hex 32` and set it explicitly in production. |
| `ADMIN_API_KEY` | unset | Optional second factor for `/api/admin/*`. When set, requests must present BOTH `X-Admin-Token` AND `X-Admin-Api-Key`, so leaking one without the other doesn't grant access. |
| `CORS_ORIGINS` | unset | Comma-separated allowlist of origins for cross-origin XHR/fetch (e.g. `https://app.example,https://staging.example`). Empty (the default) means **same-origin only**: no CORS headers are set, so cross-origin requests are blocked by the browser. Set explicitly to `*` only if you understand the risk; that echoes any caller's `Origin` back. |

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

## Admin API endpoints

The server exposes a small admin API gated by `ADMIN_TOKEN`. Every request must carry an `X-Admin-Token` header (and an `X-Admin-Api-Key` header as well if `ADMIN_API_KEY` is set).

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/admin/users` | List users with quota and current usage |
| `PUT` | `/api/admin/users/:username` | Update `role`, `maxProjects`, or `canShareProjects` |
| `DELETE` | `/api/admin/users/:username` | Hard delete (account closure / GDPR erasure; destroys all of the user's data) |
| `POST` | `/api/admin/invitations` | Issue a single-use registration invite (see below) |
| `GET` | `/api/admin/invitations` | List invites with audit fields (`consumed_at`, `consumed_by`) |

`PUT` accepts any combination of the three editable fields. Quota changes take effect on the user's next request, no session invalidation needed because limits are checked per-operation. Lowering a quota does **not** delete existing data: the user keeps full read/edit/delete access to what they already have but can't create new projects until they're back under the limit.

```bash
# Increase a user's project quota.
curl -X PUT -H "X-Admin-Token: $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"maxProjects": 100}' \
  https://your-stift/api/admin/users/alice

# Soft-cancel: set quota to zero, disable sharing. Existing projects stay
# readable, editable, and deletable. The user is not logged out.
curl -X PUT -H "X-Admin-Token: $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"maxProjects": 0, "canShareProjects": false}' \
  https://your-stift/api/admin/users/alice
```

For destructive account closure (e.g. for GDPR erasure), use the `DELETE` endpoint instead. Cancellation should never destroy user data unless the user has actually asked to be erased.

## Invitation tokens

When `ALLOW_REGISTRATION=false`, public registration is closed but accounts can still be created via single-use invitation tokens. The point of the invitation flow is that the user's password stays in the user's browser: nothing in the issuing pipeline ever sees or transmits a plaintext password.

```bash
# 1. Mint an invite with the quota you want this account to have.
curl -X POST https://your-stift/api/admin/invitations \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"maxProjects": 25, "canShareProjects": true, "expiresInDays": 14}'
# -> { "token": "inv_u5pfMN1z...", "maxProjects": 25, ... }

# 2. Send the user a link:
#    https://your-stift/?invite=inv_u5pfMN1z...
#    The frontend detects ?invite=... and opens the registration dialog
#    (even with ALLOW_REGISTRATION=false) pre-bound to that invite.

# 3. The user picks a username and password in the browser. The password
#    derives the auth token and the encryption key client-side, exactly
#    as for normal registration. The server consumes the invite
#    atomically and creates the account with the invite's quota baked in.
```

Invites are single-use, optionally time-limited, and atomically consumed.

## Development mode

```bash
DEV_MODE=true docker compose up
```

Turns on verbose request logging in the API container (every request is printed with method, path, status, and timing) and shows a `⚠ DEV MODE` banner in the status bar so you can't forget you left it on. Never enable in production.
