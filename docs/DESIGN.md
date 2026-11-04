# Design notes

These are the decisions behind how Stillbilled looks and reads, and the reasons. They are recorded so a contributor can extend the design without undoing it.

## The brief, in design terms

The page handles something people find tense: their own bank statement. The first screen has one job, which is to get a file in, and it has to say clearly that the file stays on the device. The results screen has another: show a list of charges someone may want to stop, with enough evidence to decide, and let them mark their decision.

## Concept: a ledger pad

The subject of the tool is a **ledger**: lines of charges with amounts down the right and notes in the margin. So the design borrows from an accountant's pad rather than from a dashboard.

- **Paper and ink.** A pale sage "paper" (`--paper: #f1f5ec`) with a slightly lighter "sheet" for panels, and dark green "ink" (`--ink: #17261e`). It is not the cream-and-terracotta look that is common on generated pages, and it avoids the usual blue "fintech" palette on purpose: this is a tool for reading your own records, not a bank.
- **Pen red for what needs a look** (`--pen`). Price rises and possible double charges are the two things worth a pen mark, so they get it.
- **The margin rule.** Each row has a double rule down the left, like the margin of a ledger. The person's decision is written there: a cross for Cancel, a tick for Keep, a dash for Ignore. The decision is therefore visible at a glance down the whole list, and it is not left to colour (a cross, a tick and a dash differ in shape).
- **Type.** Zilla Slab (600) for headings and figures gives the slab-serif of a printed ledger. Public Sans (variable) for text is plain and highly legible. Both are bundled (SIL OFL) so the page makes no font request to another site. Figures use `font-variant-numeric: lining-nums tabular-nums` so columns of amounts line up (without this, the slab face's old-style numerals looked uneven in the hero figure).
- **Restraint.** The one memorable element is the margin ledger. Everything else is quiet: no gradients, no decorative illustrations, no motion except small responses to a click or hover.

The hero is the thing the tool does, not a slogan over a stock image: a headline, the drop zone, and a **specimen** of a ledger with made-up data on the right (a price rise, a cancel mark and a double charge), captioned as made-up.

## Layout

- Start page: two columns on wide screens (copy and drop zone left, specimen right), stacked on narrow ones. The drop zone and its two buttons are above the fold on a 900 px-high window.
- Results: a summary band (the yearly total as a large figure, then four counted findings that link down the page), a toolbar, then sections in order of how much they probably matter: price increases, double charges, all recurring charges (with search, filter and sort), overlapping services, stopped charges, and the file list.
- Text is left-aligned throughout. Line length is limited to 66 characters (`--measure`).
- Narrow screens: the margin column narrows, the facts under each row stack, and the chart switches to a smaller viewBox so its labels stay readable. There is no horizontal page scroll at 360 px (checked by a browser test).

## Colour

Colours are CSS custom properties in `css/tokens.css`, redefined for dark mode both under `prefers-color-scheme` and under an explicit `data-theme` attribute so the manual toggle wins.

- **Text and interface colours** were checked against their surfaces for WCAG AA contrast in both themes, using small scripts while building, and the axe-core scan in the browser tests passes for both themes on the start page and the results.
- **Chart marks are blue and red.** The line and points use `--mark` (`#3a6ea5` light, `#6199d6` dark). A price rise is flagged with `--pen-mark` (`#b42336` light, `#e85a6c` dark).
- **Why not green and red?** Green for "good" and red for "bad" was my first choice, since it matches the ledger. Checked with the palette validator from the data-visualisation guide I was following, which simulates colour-vision deficiency, the pair failed (colour difference ΔE 3.7 under simulation, where the validator asks for at least 6 and aims for 8). It would have been hard to tell apart for people with red-green colour blindness. I replaced it with blue and red and re-ran the validator. Results on 2026-10-28:

  | Theme | Worst colour-blind separation | Normal vision | Contrast against the surface |
  |-------|-------------------------------|---------------|------------------------------|
  | Light | ΔE 17.9 (deutan); tritan 30.1 | ΔE 25.8 | at least 3:1 |
  | Dark | ΔE 16.7 (protan); tritan 33.1 | ΔE 25.4 | at least 3:1 |

  The validator ran against its own default chart surfaces (`#fcfcfb` and `#1a1a19`), which are close to, but not the same as, this page's sheet colours (`#fafcf7` and `#17211b`). I did not re-run it against the exact values.
- **Colour never carries meaning alone.** Every flag has an icon and words ("up from $15.49", "possible double charge"). The decision buttons have an icon and a label. The chart's rise is labelled with its amount.

## Charts

Only one chart type is used: a **step chart** of one item's price over time. A price is constant until it changes, so a step line is the honest shape; a smoothed line would imply prices in between. Points sit at each charge. A rise gets a larger red point and a text callout ("+$2.50"). The y axis shows the real range of prices (padded by a quarter of the range at each end) rather than starting at zero, and labels the lowest and highest price. Because a non-zero axis exaggerates a small rise visually, the rise is also stated in dollars in a callout, and the exact figures are in the table. There is one series, so there is no legend: the heading names it. The same charges are listed in a table beside the chart, so nothing exists only in the picture. The chart has a text alternative.

There is no dashboard of charts. The decision the person is making is about a list, so the list is the main element, and the bar beside each row shows its yearly cost relative to the others.

## Interaction

- **One decision control per row**: three buttons in a group (Cancel, Keep, Ignore), each with `aria-pressed`. Pressing the active one clears it. For double charges the words are "Dispute", "It is fine" and "Ignore".
- **Nothing destructive without a prompt.** "Start over" asks for confirmation when real files are loaded. Removing a file is a button with the file's name in its label.
- **Errors say what to do.** A PDF gets "PDF statements cannot be read yet. Download the CSV, OFX or QFX version of your transactions from your bank instead." One bad file never stops the good ones: it is listed with its reason.
- **Feedback.** Live regions announce what changed (a summary after files load, and each mark you set or remove). Focus moves to the results heading after a load.
- **Motion.** The only motion is a short colour change on controls and the turn of a row's chevron when it opens. `prefers-reduced-motion` reduces these to almost nothing.
- **Print.** A print stylesheet hides controls and keeps the lists and totals.

## Writing

Plain verbs and sentence case. Buttons say what happens ("Download findings", "Copy as text"), and the same action has the same name everywhere. Findings are labelled as findings, not facts: "possible double charge", "no longer charging". The page says up front what the tool cannot do (it can be wrong, one currency at a time, no PDF, it cannot cancel for you).

## What was rejected, and why

- **A dashboard with several charts and cards.** It would look more like other finance apps and would hide the decision.
- **Green/red status colours.** See above.
- **An icon library or web fonts from a CDN.** Each is a third-party request. The icons are a handful of inline SVG paths in `js/ui/dom.js`.
- **A "savings goal" or "score".** It would invite a game with no evidence behind it.
