<!--
Thanks for contributing to Stift! Please fill in this template
so reviewers can understand what your change does and why.

Small focused PRs land faster than large ones. If your change has
several independent parts, splitting them into separate PRs is
almost always the right move.
-->

## Summary

<!-- One or two sentences: what does this PR change, and why? -->

## What changes for users?

<!--
- New behaviour they will see
- Anything that changes the existing behaviour they rely on
- Anything that changes the data shape on disk or the API surface

Write "no user-visible changes" if it's purely internal.
-->

## How was this tested?

<!--
- `npm test` results
- Manual testing steps
- Self-hosted instance you tried it against, if any

The CI runs the test suite on every push, but reviewers will look
for evidence that you actually exercised the change end-to-end.
-->

## Checklist

- [ ] `npm test` passes locally
- [ ] `npm run build` passes locally
- [ ] No new runtime dependencies (or, if there are, the PR description explains why they're necessary and what their licence is)
- [ ] No third-party network calls added (analytics, error reporting, font loaders, ...) -- see `docs/SECURITY.md`
- [ ] Documentation in `docs/` updated if behaviour changed
- [ ] If this changes anything visible in the UI, a screenshot or short clip is in the PR description
- [ ] If this is a security-related fix, the disclosure process in `SECURITY.md` was followed

## Related issues

<!-- Closes #N, fixes #M, or "n/a". -->
