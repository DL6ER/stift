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
