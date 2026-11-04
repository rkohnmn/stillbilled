# Changelog

All notable changes to this project are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-10-28

First release.

### Added

- Reads bank and card exports: CSV (comma, semicolon or tab separated; with or without a header; single signed amount or split Debit and Credit columns; month-first or day-first dates; European decimals), OFX and QFX (SGML and XML), QIF, and Stillbilled session files. Detects UTF-8, UTF-16 and Windows-1252 text.
- Recognises common column layouts and infers the rest; the date order and the spending sign can be corrected per file.
- Combines several files without double-counting overlapping exports, while keeping genuinely identical charges on one day.
- Detects recurring charges (weekly, every two weeks, monthly, every two months, quarterly, every six months, yearly), price increases with their yearly cost, possible double charges (with refund matching), overlapping services and stopped charges.
- Evidence for every finding: the charges behind it and a price-history chart.
- Cancel, Keep or Ignore decisions, a running saving, and a cancel list that can be copied as text or downloaded as CSV.
- Save and reopen sessions as JSON; download findings as CSV (cells that could run as spreadsheet formulas are escaped); print stylesheet.
- Light, dark and automatic themes; keyboard operation; screen-reader announcements; responsive layout from 360 px.
- A Content-Security-Policy in the page that blocks script connections and outside resources, relative URLs throughout so it works under a GitHub Pages sub-path, and a build that writes `dist/`.
- 145 unit tests, 34 browser tests (Chromium) including an axe-core accessibility scan, and a site checker.
- GitHub Actions workflows to test and deploy to GitHub Pages, and to run the full suite on pull requests.
- Documentation: README, research, architecture, privacy, design notes, launch plan, contributing guide, ownership and license notice.

### Known limitations

See "Known limitations and browser compatibility" in the README. The main ones: no PDF support, one currency at a time, detection is heuristic, parsers tested only on synthetic fixtures, and browser tests ran only in Chromium.
