# Changelog

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
