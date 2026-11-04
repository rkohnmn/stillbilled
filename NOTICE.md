# Ownership, licensing and third-party notices

This file records the assumptions behind the license, so that nobody has to guess.

## Assumptions made

1. **Who owns the code.** The code and documentation were written for the person who commissioned this project by an AI assistant (Claude), working from a written brief. I assumed that person holds the rights to publish it and may choose its license. Nobody else's code, text or images were copied in. I could not verify the legal position of AI-assisted work in your jurisdiction, and I am not a lawyer. If ownership matters to you, ask one.
2. **Who the copyright holder is.** The `LICENSE` file says "Stillbilled contributors" because the project does not know the name of the person or organisation that will publish it. **Before you publish, replace that line with your own name or organisation if you want the copyright notice to say that.** Doing so does not change the terms.
3. **Which license.** MIT, because the goal is a small tool that anyone can read, run, host themselves and adapt. It is permissive and compatible with the licenses of everything bundled. If you prefer a different license, change `LICENSE` and the `license` field in `package.json`, and tell contributors.
4. **The name.** "Stillbilled" was checked with a few web searches for an existing product of the same name, and none was found. That is not a trademark search and not clearance (see `docs/RESEARCH.md`, section 7). Search the trademark registers for your country before building a business on the name, or rename it. The name appears in `index.html`, `package.json`, the docs and the session file format (`"app": "stillbilled"`).
5. **Bank and company names** (Chase, Capital One, American Express, Bank of America, Netflix and so on) appear only as plain text describing file layouts, in the known-brand table, and in made-up sample data. They belong to their owners. This project is not affiliated with, endorsed by, or sponsored by any of them. All sample transactions and amounts are invented.

## Third-party material that is distributed with the site

| Item | Used for | License | Where |
|------|----------|---------|-------|
| Zilla Slab (Mozilla Foundation) | Headings | SIL Open Font License 1.1 | `assets/fonts/zilla-slab-latin-600-normal.woff2`, `assets/fonts/ZILLA-SLAB-OFL.txt` |
| Public Sans (The Public Sans Project Authors) | Body text | SIL Open Font License 1.1 | `assets/fonts/public-sans-latin-wght-normal.woff2`, `assets/fonts/PUBLIC-SANS-LICENSE.txt` |

The font files are subsets (Latin) in WOFF2 format. The OFL permits use, bundling and redistribution with the license text, which is included.

## Development tools that are not distributed

These are installed only to run the tests. They are not part of the built site.

| Package | License |
|---------|---------|
| `playwright` | Apache-2.0 |
| `axe-core` | MPL-2.0 |

There are no runtime dependencies.
