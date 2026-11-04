# Architecture

Stillbilled is a static site: HTML, CSS and ES modules, with no bundler, no framework and no runtime dependencies. A visitor's browser downloads the files once and runs everything locally. There is no server code at all.

```
 file(s) from the person
        │  File API (drag-drop or file picker), read as ArrayBuffer
        ▼
 parsers/decode.js ── bytes → text (UTF-8, UTF-16, Windows-1252 fallback)
        ▼
 parsers/index.js ─── sniff format ─► csv.js + formats.js   (columns, dates, signs)
                                 ├──► ofx.js                (OFX/QFX, SGML and XML)
                                 ├──► qif.js
                                 └──► session.js            (our own saved JSON)
        ▼  transactions: { id, date: "YYYY-MM-DD", cents, desc, … }
 ui/pipeline.js ───── keeps one record per file, then
        ▼
 core/merge.js ────── combine files, collapsing overlapping exports
        ▼
 core/detect.js ───── analyze(): recurring series, price changes, double charges,
        │                          overlaps, stopped charges, totals
        ▼
 ui/totals.js ─────── apply the person's Cancel / Keep / Ignore decisions
        ▼
 ui/results.js, rows.js, chart.js, files.js, dialogs.js ── render with the DOM API
```

## Layers

| Layer | Path | Depends on | Knows about the DOM? |
|-------|------|------------|----------------------|
| Core engine | `js/core/` | itself | No |
| Parsers | `js/parsers/` | core | No |
| UI glue and logic | `js/ui/pipeline.js`, `totals.js`, `export.js`, `format.js` | core, parsers | No |
| UI rendering | `js/ui/app.js`, `results.js`, `rows.js`, `files.js`, `chart.js`, `dialogs.js`, `dom.js` | everything above | Yes |

The rule is that a lower layer never imports from a higher one. Everything that decides something lives in the first three layers, which run under Node with no browser, so the unit tests can cover it quickly.

## Conventions the engine relies on

- **Money is integer cents, positive means money out.** Credits are negative and are used only to recognise a refund. There is no floating point in any total.
- **Dates are ISO strings (`2026-10-24`) and date maths is integer-day arithmetic** (`core/dates.js`, days from civil, after Howard Hinnant). The engine never creates a `Date` object, so there is no time-zone or daylight-saving bug to hit, and "today" is never read from a clock: the "as of" date is the newest transaction in the files.
- **Calendar months are real months.** A monthly charge on the 31st that lands on the 28th is still monthly (`addMonths` clamps to the month end).
- **Determinism.** Same input, same output. The sample data uses a seeded random generator so the demo always shows the same thing.

## The detection engine (`js/core/detect.js`)

1. **Clean the merchant name** (`merchants.js`). A table of known brands is checked first, since many bank descriptions are noisy (`NETFLIX.COM 866-579-7172 CA`). For anything else the key is the first two meaningful tokens after removing store numbers, locations, payment-processor prefixes and so on.
2. **Group by merchant, then by amount.** Amounts count as the same within `max(10¢, 1%)`.
3. **Chain by rhythm.** Walk each amount group in date order and link charges whose spacing fits one of seven cadences: weekly, every two weeks, monthly, every two months, quarterly, every six months, yearly. A few days of drift is allowed, and one skipped cycle is forgiven once a rhythm is known.
4. **Join price changes.** If a chain is followed by charges at a different amount on the same rhythm (within a plausible band, 0.6x to 1.8x), the two are joined into one series with a price history. A change must be at least `max(20¢, 2%)` to be reported.
5. **Score and prune.** For unknown merchants, a series has to rest on a real run of same-priced charges (five on a monthly or slower rhythm, eight on a weekly one) or cover a large share of that merchant's charges. This stops someone's weekly grocery trips from posing as a subscription.
6. **Double charges.** Same merchant, same amount (10.00 or more), within three days, and not part of a recurring series. If the same pair occurs twice or more it is treated as a habit, not a mistake. A matching credit within 21 days marks it as refunded.
7. **Stopped charges.** A series is "stopped" when its next due date plus a grace period is before the newest transaction in the data.
8. **Overlaps.** Two or more active subscriptions from different merchants in a category where people tend to double up (such as video streaming) are grouped so the person can see the stack and its combined yearly cost.

Every finding carries the charges it is based on, so the interface can show the evidence.

**Why not a classifier or a lookup of "known subscriptions" only?** A lookup would miss the long tail and need constant upkeep. A model would be unexplainable. Rules over rhythm and price, plus a small brand table, are cheap, deterministic and can be tested and explained to the person in one paragraph.

**Where it goes wrong.** See "Known limitations" in the README. The engine is tuned to prefer silence to noise, which means it may miss a subscription with irregular billing.

## Parsers (`js/parsers/`)

- `decode.js` decodes the bytes. UTF-8 (with or without BOM) and UTF-16 are detected by byte patterns, with Windows-1252 as a fallback, because older bank exports often use it.
- `csv.js` is a small RFC 4180 reader. It handles quotes, embedded newlines, and sniffs the delimiter (comma, semicolon, tab).
- `formats.js` turns a table into transactions. It finds the header row by looking for date, amount and description words (so Bank of America's summary preamble is skipped), maps synonyms (including a few non-English headers), handles split Debit/Credit columns, decides whether spending is negative or positive from the data itself, and works out day-first or month-first dates from the values. It returns everything it decided in `info`, and the interface lets the person override each decision per file.
- `ofx.js` and `qif.js` read those formats (OFX 1.x SGML and 2.x XML).
- `session.js` reads and writes Stillbilled's own JSON session format, and validates every field because a session file is untrusted input.
- A `.pdf` is rejected with a plain-language message. There is no PDF parser.

## Merging several files (`js/core/merge.js`)

People export overlapping windows of the same account. For each identical `(date, amount, normalised text)` key, the merge keeps the **largest number of copies found in any one file**. That collapses overlap between files while preserving two genuinely identical purchases on one day, which a naive "remove duplicates" would delete.

## User interface

- **Rendering uses `createElement` and `textContent` only.** There is no `innerHTML` anywhere in the source. A merchant name from a bank file can contain anything; it can only ever become a text node.
- **No inline styles or handlers**, because the page's CSP forbids them. Dynamic sizes (bar widths, chart geometry) are set through the CSSOM (`element.style.width = …`) or SVG attributes, which the policy allows.
- **State lives in one controller** (`ui/app.js`): the list of per-file records, the person's decisions (`id → cancel | keep | ignore`) and the display currency. Results are recomputed from that state whenever it changes, so there is no stale derived data to keep in sync.
- **Decisions are keyed by series id** (`merchantKey|cadence`). A decision survives adding another file as long as the series still exists.
- **Accessibility.** The decision controls are groups of `aria-pressed` buttons, so state is announced as well as coloured. Colour is never the only signal: each state has an icon and words. Live regions announce results. Focus moves to the results heading after a load. The price chart is an image with a text alternative that states the old and new prices and dates, and the same charges are listed in a table beside it. The chart's hover tooltips are a pointer convenience only; nothing in them is missing from the table.
- **Theme.** Light, dark and automatic. A blocking script in `<head>` applies the stored choice before first paint to prevent a flash.
- **Design tokens** are in `css/tokens.css`. The chart's two mark colours (blue and red) were run through a colour-vision-deficiency check. A green/red pair failed it (ΔE 3.7 under simulated colour-blindness), so it was not used. See `docs/DESIGN.md`.

## Build and deployment

There is no compile step. `scripts/build.mjs` copies `index.html`, `css/`, `js/`, `assets/` and `LICENSE` into `dist/`, fills the "source code" link from `GITHUB_REPOSITORY` when built on GitHub, and writes `.nojekyll` and `robots.txt`. The tests and docs are not copied into the deployed site.

All URLs in the page are relative (`css/app.css`, not `/css/app.css`), so the site works at the root of a domain and under `https://user.github.io/repo/`. `scripts/check-site.mjs` fails the build if any reference is root-relative or external, if a referenced file is missing, if there is an inline script, style or event handler, if there is no Content Security Policy, or if the code mentions a network API.

## Performance

Measured on 2026-10-28 in a small cloud container (2 vCPU, Node 22), on the **detection engine only**: no parsing, no rendering, no browser. The inputs are synthetic, so treat these as order-of-magnitude figures.

| Input | Time |
|-------|------|
| 3,000 transactions across 120 merchants (a plausible three years of one account) | about 7 ms |
| 40,000 transactions across 400 merchants | about 210 ms |
| 10,000 transactions at one merchant with random amounts (worst case I tried) | about 420 ms |

The browser's parsing and rendering time were not measured. Parsing runs on the main thread with a 30 MB file limit, so a very large file may make the tab unresponsive for a moment. A Web Worker is on the roadmap.

## What is deliberately not here

- No framework or build tool. Over the life of a small static tool, they cost more than they save, and every dependency is something a user would have to trust.
- No service worker. It would let the page work offline from a cold start, but it is a second moving part that can serve stale code. After load, the page already works offline because nothing it needs is remote.
- No persistence of statement data. See `docs/PRIVACY.md`.
- No account, sync or sharing features.

## Testing

See "Testing" in the README. In short: `npm test` runs 145 Node unit tests over the engine, parsers, pipeline and totals; `npm run check` verifies the built site; `npm run test:e2e` drives a real headless Chromium against the built site served under a sub-path.
