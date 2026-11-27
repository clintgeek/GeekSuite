# FitnessGeek — theme and layout review

*Written 2026-11-26. **Status: built, then the look was replaced (see Progress).** Chef: "Fitnessgeek currently
looks themed after a 1990s Subway store. It will be used constantly on phones, often on
desktop, and occasionally on tablet." The open decision is the identity direction (item 1).*

## Progress

- **2026-11-26, committed:** items 9 (floating buttons), 10 (food-log row), 16 (sidebar height) and 18
  (scene `63b`: the scene was wrong, not the app).
- **2026-11-26, built as one commit: "The Label"** (direction A, Chef's pick). Covers items 1–8 and 11–15:
  the identity on every screen, the stale PWA shell, type weights, flattened nesting, one status colour set,
  Health and Activity brought in, the main action made the strongest thing on Home, the one page container,
  and two-column desktop layouts. Mockups: https://claude.ai/artifact/WXfSyTwNHjhWH76KwzJEDg
- **2026-11-26, backed out the same day:** Chef, after seeing it live: "I'm not loving it." The Label's skin
  (ink borders, square corners, heavy type) was replaced by **"Daylight"**, built to
  `DASHBOARD_REDESIGN_SPEC.md`. The structural gains of that commit stayed (page container, two-column
  desktop, PWA shell, touch floors). Direction A below is history, not the live look.
- **Corrections to the review found while fixing:** the sidebar has 13 destinations, not 14, and it has no
  user chip / Settings / Sign out at all (FitnessGeek passes no footer). The Food log's calendar icon was
  decorative; it never opened a picker.
- **Open after the build:**
  - Item 12 in spirit, on Home: the facts panel fills the first phone screen in Full, so meals start one
    scroll down. Trimming the Eaten row or the repeated sentence would bring Breakfast up. Chef's call.
  - "Log weight" still rests over text at the top of the phone Weight page (bottom clearance is fine).
  - Not yet on a real device.

## What was looked at

About 35 key screens from the mobile harness (`FG_SCENES` subset, label `fg-theme-key`), on
phone light and dark, desktop light, tablet portrait and tablet landscape. Not every one of
the ~120 scenes, and it is fixture data, not real accounts. Screenshots are in
`tools/mobile-harness/out/fg-theme-key/fitnessgeek/` (gitignored).

## Why it looks like a sandwich shop

- **Sidebar:** a dark green board (`#1F2A22`) with a white-and-yellow "fitness**geek**"
  wordmark and yellow active icons (`frontend/src/components/Layout/chrome.js`).
- **Primary colour:** forest green (`#2F6B35`) on every button, tab and progress bar.
- **Meal colours:** tomato, lettuce green and yellow as large fills, on a cream ground.
- **Type:** rounded Nunito at weight 800 for every heading and button, which reads as
  fast-food signage.

Dark mode has much less of the problem; it is the better of the two today.

## Improvements

### Identity

1. **Replace the theme with an object, like NoteGeek, TodoGeek and GeekDay have.** Directions:
   - **Nutrition Facts label** (Sage's pick): black rules, thick and thin bars, big numerals,
     "% of daily target" rows. The one graphic everybody associates with tracking food, a
     narrow column by nature (phone-first), and not a fourth paper notebook.
   - **Kitchen scale:** enamel, a dial and a needle. Warmer, but risks echoing BaseGeek's
     gauges.
   - **Keep Market Morning, de-Subway it:** ink sidebar, non-green primary, quieter meal
     fills. Cheapest, but still no object behind it.
2. **Put the motif on every screen.** Today the theme exists only on meal cards and the plate
   ring. Weight, Blood pressure, Reports, Medications and Settings are generic cream cards
   with green buttons.
3. **Move off the cream ground.** It sits close to GeekDay's desk (`#FFF8EC` vs `#F4EFE6`).
4. **Fix the stale shell.** The PWA icon is still the old teal dumbbell (and this is mostly a
   food app). `manifest.json` and the `theme-color` metas are stone grey (`#FAFAF9` /
   `#1C1917`), so the phone status bar doesn't match the page. `public/offline.html` is still
   teal with DM Sans and Georgia.

### Type and surfaces

5. **Restore a weight hierarchy.** Of 306 inline font weights, 293 are 600–800, and h1–h6 and
   buttons are all 800, so nothing stands out.
6. **Flatten the nesting.** Weight goal and BP summary are outlined boxes inside outlined
   boxes inside cards, all with the same border and radius.
7. **Give data colours their own system.** The macro bars are basil, brown and taupe, so carbs
   and fat look alike and "21 over" doesn't register. The BP donut uses a separate
   red/brown/green set.
8. **Bring Health dashboard into the app.** It has a native date input, stock icon tabs and
   its own sparkline colours.

### Phone

9. **Stop the floating buttons covering content.** "Log weight" sits over the pace card text;
   "Log BP" overlaps "View report". The harness flags the same thing on tablet
   (`67-bp-week`: "Log BP covers a card").
10. **Fix the food-log row.** The macro line wraps to an orphaned "g", and each row carries
    three icon buttons.
11. **Make the main action the strongest thing on Full Home.** "What did you eat?" is a ghost
    outline in Full and a filled hero in Simple. The calorie-target warning then takes the
    next slot, pushing meals below the fold.
12. **Get to the log sooner on Food log.** Date card, calories card and composer card stack
    before the first meal appears.

### Desktop (and tablet landscape, which uses the same layout)

13. **One page container.** Home, Food log, Weight, Settings and Health each use a different
    width and left offset, so content jumps as you navigate.
14. **Use the width.** It is the phone layout stretched: a 680px textarea, full-width "Log it"
    and "Add a medication" bars, and the right half empty. Home could put meals beside the
    ring; Food log could put the composer beside the day.
15. **Revisit desktop type size.** Body drops to 15–16px under 800-weight headings, which
    reads cramped next to the phone.
16. **Sidebar overflows at 800px tall** (tablet landscape): "Import a scan" is clipped and
    "Reports" is out of view until the sidebar is scrolled.

### Tablet portrait

17. Works as a roomier phone layout. Leave it, per the 2026-11-17 scope rule; item 9 fixes the
    one real flaw there.

### To check

18. Harness scene `63b-meds-add-simple-filled` reports "missing: Save in the footer" on
    tablet, both modes. Not yet opened: could be a real layout bug in the add-medication
    dialog or a scene written for phone.

## What to keep

The Simple/Full split, the composer, the Again chips and the navigation are sound. Colours are
well centralised (about 30 stray hex values in 9 files, mostly `utils/bpUtils.js` and
`pages/Medications.jsx`), so a retheme is mostly `theme/theme.jsx`, `Layout/chrome.js`,
`Home/PlateRing.jsx` and `Home/MealCards.jsx`.

## Suggested order

1. Chef picks a direction; mock one or two on Home, Food log and Weight (phone and desktop,
   both modes) before building.
2. Identity + shell (items 1–4) as ONE revertable commit.
3. Type and surfaces (5–8).
4. Phone fixes (9–12), each its own commit.
5. Desktop layout pass (13–16).
