# Changelog

## v2.1.0

A nine-round security audit pass. Each item below maps to a commit; the
list is grouped by area rather than commit order.

**Authentication and session management:**
- The server-stored `auth_token` column is now a SHA-256 hash with a versioned `h1$` prefix. Existing plaintext or legacy `h$` rows verify cleanly and lazy-upgrade to `h1$` on the user's next successful login.
- OIDC sign-ins rotate the bearer token on every callback. The plaintext lives only in the in-memory session map and is handed to the SPA bridge once.
- New `POST /api/oidc/logout` clears the in-memory session and the cookie, called automatically by the SPA's `logout()` for OIDC sessions.
- Login response timing equalised between "wrong token" and "no such user" via a dummy compare helper.
- The hardcoded 24h OIDC session lifetime is now configurable via `SESSION_MAX_AGE_HOURS` (clamped to 1..720).
- `SESSION_SECRET` documented in `docs/CONFIGURATION.md` for HA / rolling-restart deployments.

**OIDC hardening:**
- Email-based account linking refused when the existing row already has an `external_oidc_sub`, closing the silent sub-rebind path. The email claim is also trusted only when `email_verified === true`.
- `userinfo` consulted as a fallback when the ID token lacks the email claim.
- Provision webhook fetch bounded by a 30s `AbortController` timeout, retry worker serialised behind a single mutex so a hang no longer causes duplicate deliveries.
- Permanently-failed outbox rows (`attempts >= 10`) purged after 90 days; delivered rows purged after 30 days.
- Discovered OIDC client cached per `redirectUri` with a 16-entry FIFO cap.
- `STIFT_PUBLIC_URL` env var pins the trusted origin used to build the OIDC `redirect_uri`, preventing `Host` / `X-Forwarded-Host` injection from influencing the authorize URL or cookie scope.
- `OIDC_REDIRECT_PATH` validated against reserved API prefixes at startup; misconfiguration now fails loud instead of producing silent 404s.
- Callback errors mapped to a small RFC 6749 / OIDC Core error allowlist that the SPA can surface, replacing the opaque `?oidc_error=callback_failed` catch-all.
- `OIDC_LOGIN_LABEL` default switched to English ("Sign in with single sign-on"); operators override per locale.
- `OIDC_PROVISION_WEBHOOK_SECRET` enforced when the webhook URL is set; the server refuses to start with an empty key.

**Encryption and shared projects:**
- Server-stored project names now live in a small `nameCiphertext` field encrypted with the user's personal key. Legacy plaintext `name` rows render alongside seamlessly.
- Shared invitations re-wrap the Project Key with the invitee's personal key on first open via a new `PUT /api/shared/:id/wrapped-key` endpoint; the documentation explains the threat model honestly.
- Shared project POST validates the members array: caller must be present, every member must be an existing account, every entry must carry a `wrappedKey`. Member POST sanitises usernames and refuses to grant `owner` to a non-owner caller.
- PBKDF2 iteration count raised from 600k to 1.2M to keep pace with 2024 hardware.
- Username NFC-normalised before salting so visually-identical Unicode forms do not derive different keys.

**Storage and I/O:**
- Project blob writes go through a tmp + rename atomic write helper.
- SQLite `auto_vacuum=INCREMENTAL` set on fresh deployments; daily incremental vacuum reclaims space, consumed invitations older than 90 days are purged.
- `parseBody` returns 400 on non-object JSON bodies instead of bubbling up as a confusing 500.
- `MAX_PROJECT_SIZE_MB` and `MAX_PROJECTS_PER_USER` validated and clamped via a shared `parseEnvInt` helper.

**Frontend:**
- Dropped `.stift` files validated against a Zod-light shape guard before reaching the project store; size capped at 50 MB.
- Clipboard paste and drag-drop image inputs restricted to a bitmap MIME allowlist (PNG, JPEG, WebP, GIF) -- no more silent SVG.
- The local autosave snapshot is now tagged with the saving user; cross-user restores on a shared browser are refused and the snapshot is cleared on logout.
- `SPONSOR_URL` validated as `http(s)://` (matching the existing `FOOTER_LINKS` check) so an operator typo cannot turn into a rendered `javascript:` href.

**Operator UX and OSS hygiene:**
- Rate limit now sees the real client IP when sitting behind an outer reverse proxy (Caddy → nginx → node). `X-Forwarded-For` propagated correctly, `clientIp` reads the leftmost entry.
- `/oidc/login`, `/oidc/callback`, `/api/oidc/logout` now share the same per-IP token bucket as `/api/auth/*`.
- `/api/shared` listing capped at 500 newest entries to keep the response bounded on large deployments.
- `STIFT_API_PORT` lets the Node API bind a non-default port (3001 stays the default to keep the nginx upstream config working).
- `/index.html` served with `Cache-Control: no-cache` so deploys take effect on the next reload.
- Subresource Integrity (`sha-384`) on the entry script and stylesheet via an inline Vite plugin.
- Caddy ships HSTS without the `preload` directive; opt-in documented inline.
- nginx propagates `X-Forwarded-For` so the rate limiter has real-client visibility behind Caddy.
- HTTP integration tests added for the new endpoints (`/api/shared` validation, `/api/shared/:id/wrapped-key`, `nameCiphertext` listing, `parseBody` 400, timing-equal 401s) via a subprocess-and-fetch harness on a free TCP port.
- A root `SECURITY.md` references the GitHub Security Advisories queue and the new `/.well-known/security.txt`.

**Supply chain:**
- Dockerfile base image pinned by content digest (`node:20-alpine@sha256:fb4cd1...`). Refresh quarterly with `docker pull node:20-alpine && docker inspect --format='{{index .RepoDigests 0}}' node:20-alpine` and note the new digest here.

**Fixed:**
- `POST /api/auth/apply-invite` always returning 401 due to a `user.auth_token` / `user.authToken` field-name mismatch in the credential check.
- `jspdf` bumped to 4.x; transitive `dompurify` and `uuid` advisories resolved.
- Stale references to a non-existent admin API removed from `docs/ARCHITECTURE.md` and the CORS Allow-Headers list.
- Hardcoded `stift.io` references in `index.html`'s Open Graph tags removed; the OSS template is deployment-neutral.

## v2.0.0

**New features:**
- OpenID Connect (OIDC) single sign-on as an optional login mode. Set `OIDC_ENABLED=true` and configure `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` to delegate authentication to an external identity provider. Authorization-code flow with PKCE (S256), signed state/nonce cookies, optional provision webhook.

## v1.1.0

**New tools:**
- Eyedropper (I) -- pick any color from the canvas with a 5x magnified loupe. Applies to selected annotations when active.
- Magnifier (Z) -- draw a source region to create an enlarged inset with connecting line. Smart edge docking, configurable border style.

**New features:**
- Annotation locking -- lock position to prevent accidental moves
- Group / ungroup (Ctrl+G / Ctrl+Shift+G) -- treat multiple annotations as one unit
- Curved bezier arrows with draggable control point
- Counter tails -- drag while placing a counter to create a tapered pointer
- Shift-constrain: 15-degree angle snap for lines, square/circle for shapes, proportional resize
- Scroll wheel adjusts stroke width (or counter size) while drawing
- Transparent fill option for rectangles, ellipses, and text boxes
- Undo/redo toast notification
- Unsaved changes warning on tab close

**Improvements:**
- Fit canvas removes padding so exports have no border
- Export hides selection handles and Transformer
- Property panel stays open when a drawing tool is active
- Selection cleared after deleting annotations
- Counter sequence controls in the Properties panel
- Counter number editable on placed counters

**CI:**
- Visual regression tests in CI with pixel-level diff images on failure
- Deterministic Chromium rendering flags for consistent screenshots
- `test.sh ci` for full CI-identical local testing

## v1.0.0

Initial public release.
