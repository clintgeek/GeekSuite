## What

<!-- What changes, and why. Link the queue item / doc section if there is one. -->

## Mobile checklist

<!-- Required when the PR touches `apps/*/frontend`, `apps/*/packages/ui` or
     `packages/ui` — the CI harness enforces the measurable half, this list is
     the judgment half (DOCS/MOBILE_UI_PLAN.md §6). Check at 390×844 in both
     colour schemes; strike the whole section for backend-only work. -->

- [ ] Nothing is clipped at the bottom with the URL bar showing (dvh)
- [ ] The primary action is reachable with a thumb without scrolling
- [ ] Every tap target is 44px; every readable string is ≥ 12px; every input is ≥ 16px
- [ ] Every dialog is full-screen below `sm`; every picker is a sheet below `md`
- [ ] Nothing depends on hover
- [ ] Top bar shows: hamburger, title, ≤ 1 action, avatar
- [ ] Safe areas respected in standalone (notch, home indicator)
- [ ] Identity survives: the app's fonts, chrome color, accent, and voice are present on the phone

## Test plan

<!-- What you ran: suites, harness scenes, manual pokes. -->
