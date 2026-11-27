# FitnessGeek — Dashboard UI/UX Redesign Specification

*Chef, 2026-11-26. Supersedes "The Label" (`THEME_REVIEW_2026-11.md`, direction A), which
shipped that day and was backed out. Saved verbatim; build notes are at the end.*

## 1. Objective

Redesign the FitnessGeek home dashboard to create a modern, attractive, approachable health and fitness experience.

The current dashboard is functional, but its visual presentation feels too rigid, box-heavy, and administrative. The Nutrition Facts label aesthetic was an intentional design experiment, but it should not dictate the overall appearance of the application.

**The goal is a polished consumer health application, not a spreadsheet, medical records system, or generic SaaS admin dashboard.**

The interface should feel:
- Modern and approachable.
- Clean, organized, and visually balanced.
- Data-rich without feeling cluttered.
- Encouraging without being childish or gamified.
- Comfortable to use every day.
- Consistent across the entire application.

Treat this as a visual and interaction design improvement, not an opportunity to rewrite application functionality.

## 2. Design Direction

Explore a contemporary health and wellness dashboard aesthetic.

Potential visual references:
- Apple Health
- Garmin Connect
- Fitbit
- Modern personal finance dashboards
- Contemporary productivity applications

These are references for design quality and usability, not templates to copy.

### Visual characteristics

- Use a restrained, cohesive color palette.
- Establish a clear typography hierarchy.
- Use whitespace to create separation instead of heavy borders.
- Use subtle card backgrounds and elevation where appropriate.
- Use rounded corners consistently, without making everything look like a toy.
- Use color intentionally to communicate status, category, and progress.
- Use charts and visualizations where they communicate information better than numbers alone.
- Avoid excessive decoration, gradients, shadows, and visual effects.

The result should feel premium but understated.

### Explicitly avoid

- Nutrition Facts label styling across the dashboard.
- Heavy black borders around every component.
- Excessive use of boxed panels.
- Oversized typography that sacrifices information density.
- Generic bootstrap-style admin dashboard layouts.
- Excessive bright colors.
- Excessive gradients or glassmorphism.
- Unnecessary animations.
- Decorative charts that provide no useful information.

## 3. Dashboard Information Architecture

Preserve the existing application capabilities and navigation.

The home dashboard should provide a useful snapshot of the user's current health and activity.

### A. Header

Display:
- Greeting appropriate to the time of day.
- Current date.
- Primary food logging action.
- Existing application navigation and account controls.

The header should be compact and visually integrated with the rest of the application.

### B. Daily Nutrition

Display:
- Calories consumed.
- Daily calorie target.
- Remaining calories.
- Protein consumed versus target.
- Carbohydrates consumed versus target.
- Fat consumed versus target.

Use intuitive progress indicators.

Nutrition should be visually prominent, but should not consume the entire dashboard.

Consider a larger nutrition summary with smaller macro progress indicators.

The user should be able to understand their remaining daily budget at a glance.

Provide a clear action to log food.

### C. Today's Meals

Show the existing meal categories:
- Breakfast
- Lunch
- Dinner
- Snacks

Each meal should display:
- Whether anything has been logged.
- A concise summary of logged food when available.
- Relevant calorie information.
- A convenient way to add food.

Avoid four large, heavily bordered boxes.

Explore a compact timeline, grouped list, or similarly efficient presentation.

### D. Health Metrics

Display the user's latest:
- Weight
- Blood pressure
- Steps

Each metric should include:
- Current value.
- Appropriate unit.
- Relevant recent trend or comparison.
- Clear indication when a reading requires attention.

Use consistent visual treatments for metrics.

Where useful, make metrics clickable to navigate to their respective detail pages.

Blood pressure should communicate its status clearly without relying on color alone. Where available, show relevant systolic and diastolic context.

### E. AI Insights

Retain the existing Notes from the AI functionality.

This section should feel like a contextual part of the health dashboard, not a chatbot widget pasted onto the bottom of the page.

Explore a visually distinct but restrained presentation.

Preserve existing actions:
- Today
- Advice
- Patterns
- Ask

The content should remain easy to scan and access.

## 4. Navigation

Preserve the existing navigation structure and capabilities.

Current sections:

**Today**
- Home
- Food log

**Check-ins**
- Weight
- Blood pressure
- Medications

**Food**
- Look up a specific food
- My foods
- My meals
- Calorie plan

**Body and activity**
- Activity
- Health dashboard
- Import a scan

**Looking back**
- Reports

Improve visual consistency, grouping, spacing, and active-state presentation.

Navigation should be easy to understand without requiring labels to be memorized.

On smaller screens, provide an appropriate responsive navigation pattern.

Do not remove or hide existing functionality merely to simplify the visual design.

## 5. Layout and Responsiveness

The current desktop dashboard uses a relatively narrow content area with substantial unused horizontal space.

Reevaluate the layout.

Requirements:
- Use available desktop space intelligently.
- Establish a comfortable maximum content width.
- Avoid stretching individual components excessively.
- Use a responsive grid where appropriate.
- Maintain visual balance between nutrition, meals, and health metrics.
- Avoid layouts that require excessive vertical scrolling.
- Support tablet and mobile layouts.

On mobile, prioritize:
1. Daily nutrition.
2. Food logging.
3. Current health metrics.
4. Today's meals.
5. AI insights.

Do not simply shrink the desktop layout.

## 6. Accessibility and Usability

Follow WCAG 2.2 AA principles where applicable.

Requirements:
- Adequate text and control contrast.
- Readable typography.
- Clear interactive states.
- Keyboard accessibility.
- Meaningful accessible labels.
- Status indicators that do not rely exclusively on color.
- Appropriate touch target sizes.
- Consistent interaction patterns.

Use familiar visual conventions. Avoid making users guess which elements are clickable.

## 7. Design System

Establish reusable design tokens and components.

Define:
- Color palette.
- Typography scale.
- Spacing scale.
- Border radius conventions.
- Elevation/shadow conventions.
- Card treatments.
- Buttons and interactive controls.
- Progress indicators.
- Metric displays.
- Status indicators.
- Chart styling.

Components should be reusable across FitnessGeek, not implemented as one-off dashboard decorations.

Preserve the application's existing technical architecture and component conventions.

## 8. Functional Constraints

This is primarily a UI/UX redesign.

Do not:
- Change business logic.
- Change nutrition calculations.
- Change calorie or macro targets.
- Change data models.
- Change API contracts.
- Change GraphQL operations.
- Remove existing functionality.
- Introduce mock data in place of actual application data.
- Break existing navigation or workflows.

All existing functionality must continue to work.

Use existing data sources and components wherever practical.

If a visual improvement requires a functional change, identify it separately rather than silently introducing it.

## 9. Implementation Approach

Before implementing:

1. Inspect the existing application and identify its UI framework, styling conventions, and reusable components.
2. Review the current dashboard implementation.
3. Identify the existing functionality and data dependencies.
4. Propose two or three genuinely different visual directions.
5. Explain the strengths and trade-offs of each direction.
6. Select the strongest direction and implement it.

Do not immediately start rewriting components before understanding the existing implementation.

After implementation:

- Verify all existing dashboard functionality.
- Verify navigation.
- Test responsive layouts.
- Check for overflow and alignment issues.
- Verify loading, empty, and populated states.
- Confirm that no existing application behavior was lost.

## 10. Definition of Done

The redesign is successful when:

- The dashboard looks like a polished modern health application.
- The most important daily information is immediately understandable.
- Users can quickly identify what needs attention.
- Food logging remains easy and prominent.
- Health metrics are easy to scan.
- The interface feels visually balanced rather than box-heavy.
- Desktop and mobile experiences are both intentional.
- Existing application functionality remains intact.
- The visual language can be extended consistently to other FitnessGeek screens.

**Most important:** Prioritize usability, visual hierarchy, and consistency over novelty. The objective is to make FitnessGeek something that feels genuinely pleasant to open and use every day.

---

## Build notes (Sage, 2026-11-26)

### Directions weighed (§9 steps 4–6)

| | Idea | Strength | Trade-off |
|---|---|---|---|
| **Daylight** (built) | Soft grey ground, white cards with a hairline and faint shadow, calorie ring, coloured macro bars | Closest to the references; calm; extends to every screen | Least distinctive of the three |
| Instrument | Dense Garmin-style tiles, sparklines everywhere, several data colours | Most data per screen | Busy on a phone; wrong for Simple mode |
| Ledger | Almost no cards; whitespace, hairlines and lists | Lightest, fastest to scan | Sections blur together on a desktop |

Daylight was built, with Ledger's grouped list for the meals.

### Design system (§7), where it lives

- **Tokens:** `frontend/src/theme/theme.jsx` — palette (light and dark), Figtree type scale, radius
  (6 / 8 / 12 / 16 / pill), one card shadow, macro colours (teal protein, amber carbs, rose fat),
  meal dots, status colours, the tonal second-rank button.
- **Components:** `frontend/src/components/primitives/` — `Surface` (the card), `LabelPanel`
  (card with a title row), `FactRow`, `Tag` (status tag, with a `tone`), `LabelBar` (progress bar),
  `Ring` (progress ring), `MetricTile` (a health number with status, sparkline or progress),
  `Page` (the one page container). The `Label*` / `Fact*` names date from The Label and were kept
  for their ~300 call sites; what they draw is new.
- **Sidebar:** `Layout/chrome.js`, now per mode (light paper by day) instead of a dark board.
- **Contrast:** held by `packages/ui/src/__tests__/themeContrast.test.js`.

### What was kept from The Label's commit

The single page container, two-column desktop layouts, the fixed PWA shell, the 44px touch floors
and the flattened nesting. Only the skin was backed out.

### Decisions made while building

- **Simple mode keeps its own shape.** "What did you eat?" stays directly under the greeting for
  Simple, where the spec's phone order puts nutrition first. Full follows the spec.
- **Steps are drawn against 8,000**, the number Home already compared against. It is not a goal
  anyone set; the tile says "of 8,000 today", not "goal".
- **The by-meal split bar is gone from Full Home** (the ring and the Eaten bar replace it); Simple
  keeps it.

### Personality pass (2026-11-27)

Chef: "Does it have personality? Not annoying levels of theme, but enough personality to make it something
you want to interact with while mostly staying out of your way?" Sage's read: clean, and anonymous. Added,
all decoration (the words already say everything):

- **The page follows the day.** Today's "what is left" card has a faint sky wash (peach in the morning,
  clear blue at midday, amber in the evening, indigo at night) and a small sun or moon by the date.
  `components/Home/daylight.js`. Today only; another day is plain paper.
- **Meals have a picture**, not a dot: an egg, a sandwich, a dinner plate, a cookie, each on a pale round of
  the meal's colour.
- **The ring sweeps in** when it appears and eases to a new value. Off under reduced motion.
- **A done check-in looks done**: pale green, not grey.
- **The brand mark is the ring** from the app icon, not the letters "FG".
- **One less "left today".** The caption over the sentence is gone when the title and sentence already say it.
