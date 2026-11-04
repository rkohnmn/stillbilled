# Contributing

Thank you for helping. Stillbilled is a small tool with a strong rule: **it must never send anyone's data anywhere**. Most of the guidance below follows from that.

## Never post real financial data

Do not paste real statements, real account numbers or real transactions into issues, pull requests or test fixtures. If a bank's file does not load, describe the layout and send a **few made-up rows in the same shape** (same header, same date format, same sign convention, invented merchants and amounts).

## Reporting a bug

Open an issue with:

- what you did and what you expected;
- which kind of file (CSV, OFX, QFX, QIF), which bank layout, and the header row if it is a CSV;
- the browser and its version;
- made-up rows that reproduce it, if it is about reading a file or a wrong finding.

## Reporting a privacy or security problem

If you find a way for data to leave the page, or a way for a file's contents to run as code, please **do not put the details in a public issue**. Use GitHub's private vulnerability reporting on the repository if it is enabled (Security tab, "Report a vulnerability"). If it is not, open an issue that says only that you have a security report and ask for a private way to send it. Remember that the page has no server, so the worst realistic problems are code running from a crafted file, or an unintended network request.

## Setting up

Node 20 or later.

```bash
git clone <your fork>
cd stillbilled
npm install                          # dev dependencies for the browser tests only
npm run serve                        # http://127.0.0.1:8080/
npm test                             # unit tests
npm run verify                       # unit tests, build, site checker
npx playwright install chromium      # once
npm run test:e2e                     # browser tests
```

There is no framework and no bundler. Edit the files in `js/`, `css/` and `index.html` and reload.

## What a good change looks like

- **It keeps the rules.** No network calls (`npm run check` fails on `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `sendBeacon`). No third-party scripts, fonts or images. No inline script, style or event handler (the Content-Security-Policy blocks them). No `innerHTML`: build elements with `createElement` or the helpers in `js/ui/dom.js`, and put text in with `textContent`.
- **It keeps the URLs relative**, so the site works under a GitHub Pages sub-path.
- **It has a test.** Engine and parser changes get a unit test in `tests/unit/`. Changes to what the person sees get a browser test in `tests/e2e/run.mjs` when behaviour changes.
- **It is honest.** A change to detection must say what it does to false alarms and to misses, with numbers from a test or a simulation, not a feeling.
- **It stays accessible.** Colour is never the only signal; every control is reachable from the keyboard; the axe tests stay clean in both themes.
- **It is small and explained.** One idea per pull request, and the reason in the description. Comments explain why, not what.

## Money and dates

- Money is **integer cents**, positive for money out. Do not use floating point for amounts.
- Dates are **ISO strings**, and date arithmetic uses the integer-day helpers in `js/core/dates.js`. Do not create `Date` objects in the engine, and do not read the clock there.

## Adding a bank layout

1. Add a fixture to `tests/fixtures/` made of invented rows in that layout.
2. Add a test in `tests/unit/parsers.test.js` that reads it and checks the dates, amounts, signs and descriptions.
3. If the columns are not recognised, extend the header synonyms in `js/parsers/formats.js`.

## Adding a known brand

Edit the table in `js/core/merchants.js` (a pattern, a key, a display name and a category) and add a case to `tests/unit/merchants.test.js`. Prefer patterns that cannot match a different business.

## Commit and pull request style

Short imperative subject lines ("Fix day-first dates in semicolon files"). Say what changed and why in the body. Run `npm run verify` before you open the pull request; CI will run the same checks plus the browser tests.

## Licence of contributions

By contributing you agree that your contribution is licensed under the project's MIT license.
