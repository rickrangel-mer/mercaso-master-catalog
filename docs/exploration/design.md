# Site design: achromatic ledger

Restyled 2026-10-23 after an audit with the design-taste-frontend skill (app-screen rules). Style dealt: **Achromatic ledger** (seed 802948757), chosen because the site is read as a report and a ledger of SKUs and money.

- **Colour goes on data only.** The chrome is ink; the one data hue (`--data`, #1d5fbf) marks each screen's main data element: the new SKUs in the Wallet chart and its sliders, the coverage bars on the Overview and the chart cards, penetration in the SKU table. Departments are grey steps (`--cat-1`… darkest first), not a rainbow. Must, should and nice are ink, dark grey and grey, all at 4.5:1 or more.
- **Ground** #f2f4f7 (a ledger blue-grey); cards white with a 1px #e6e6e6 edge, no shadows at rest (tooltips and the store drawer float).
- **Type:** Geist, embedded in the single-file site so it works offline; tabular figures on every number.
- **Every tab** opens with a noun title (h1, 24px; the chart's is 16px in its toolbar), one line stating the finding, and a 12px line naming the data's source and date. The header names its date's source ("Catalog prices as of …").
- **Headline figures** sit in one container split by hairlines, the answer figure first and largest.
- **Wallet:** what stores already buy is grey, what the new SKUs add is one blue block on top, with labels beside the last bar; settings that change rarely sit under "More settings"; the method is under "How the numbers are made".

Checks: `node <skill>/scripts/inspect.mjs <page>#<tab> --app` (0 FAIL on every tab; the chart's thin coverage bars stay under the style's 1% colour budget, and the Stores tab warns only when the build has no store data) and `lint.mjs --app apps/web/app apps/web/components`.

**Export PDF** (Rick, 2026-10-23): a button in the header prints the open tab with the print styles in `globals.css` (landscape, light, controls' current values shown, buttons and tooltips hidden, wide tables fitted) and suggests the file name "Mercaso <tab> <date>"; choose "Save as PDF" in the print dialog.
