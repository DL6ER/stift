# Security Policy

## Reporting a vulnerability

If you believe you have found a security issue in Stift, please **do not
open a public GitHub issue**. Instead, open a private security advisory via
GitHub's "Report a vulnerability" link on the repository's Security tab, or
send a description to the contact listed on the project page.

Please include enough detail for us to reproduce the issue: affected
version, deployment mode (default Docker, proxied behind Caddy, or bare
`node docker/server.js`), and a minimal proof-of-concept where possible.

We aim to acknowledge reports within a few business days and to coordinate
a fix and disclosure timeline before any public discussion.

## Scope

This repository contains the Stift web application: the React SPA in
`src/`, the Node API in `docker/server.js`, and the Docker / Caddy
deployment glue. Issues in third-party dependencies should be reported
upstream to the relevant project. Issues in the design of the end-to-end
encryption model are documented in [`docs/SECURITY.md`](docs/SECURITY.md);
deviations from that model in our implementation are in scope here.

## Privacy guarantees

Stift is built around two non-negotiable privacy commitments:

1. **All image processing happens in the user's browser.** Anything that
   would cause the server to decode, transform, analyse, or otherwise
   inspect image content is a vulnerability under this policy.
2. **No telemetry, analytics, or third-party requests.** Anything that
   would cause the SPA or the server to phone home to a third-party
   service is a vulnerability under this policy.

Reports that demonstrate a regression against either commitment are
treated with the same priority as classical security bugs.
