# Privacy and data handling

This document says what Stillbilled does with your data, what it cannot promise, and how to check both yourself. It is a description of the software, not legal advice.

## The short version

- The files you add are read **in your browser tab**. They are never uploaded. There is no server code in this project to upload them to.
- Stillbilled stores **one thing** in your browser: your light/dark theme choice.
- When you close or reload the tab, your transactions are gone, unless you chose to save a session file or an export.
- The project has no accounts, no cookies, no analytics, no adverts and no third-party scripts, fonts or images.

## What data is involved

| Data | Where it goes | How long it lasts |
|------|---------------|-------------------|
| The bank or card files you add | Read by JavaScript in your tab, held in memory | Until you close, reload or press "Start over" |
| The transactions and findings derived from them | Memory only | Same |
| Your Cancel / Keep / Ignore choices | Memory only | Same, unless you save a session file |
| Theme preference (`stillbilled.theme` in `localStorage`) | Your browser | Until you clear site data or set the theme back to automatic |
| A **session file** (`.json`), if you press "Save session" | Downloaded to your device | Until you delete it |
| A **findings CSV**, if you press "Download findings" | Downloaded to your device | Until you delete it |
| A cancel or dispute **list**, if you press "Copy as text" | Your clipboard | Until something else replaces it |

**A session file contains your transactions** (date, amount and description for each), plus your decisions. It is as sensitive as the statement it came from. A findings CSV contains merchant names and amounts. Store and share them like bank records.

A downloaded findings CSV neutralises cells that begin with `=`, `+`, `-` or `@`, so merchant text cannot become a spreadsheet formula when you open the file. Descriptions in your bank's own file are otherwise passed through as they were.

## What the page does not do

- It makes no network requests of its own. Nothing in the code calls `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` or `sendBeacon`, and `npm run check` fails the build if one appears.
- It loads nothing from another site: no CDN, no analytics, no web fonts. The two typefaces are in the repository (see `assets/fonts/`, under the SIL Open Font License).
- It sets no cookies.
- It uses no `IndexedDB`, `sessionStorage` or service worker.
- It sends no referrer (`<meta name="referrer" content="no-referrer">`).

## The Content-Security-Policy, and what it can and cannot do

The page carries this policy in a `<meta>` tag:

```
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:;
font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'
```

In plain terms: scripts, styles, fonts and images may only come from the site's own files; scripts may not open any network connection (`connect-src 'none'`); nothing else is allowed by default; forms cannot be submitted anywhere; and no inline script or style runs.

This is a **second line of defence**, not the primary one. The primary one is that the code does not contain any network calls (checked by the build). What the policy adds is protection if a bug, or a malicious string inside a bank file, ever tried to make one. An automated browser test confirms that a `fetch` attempted from the page is blocked.

What it does **not** do:

- **It does not stop navigation.** A policy cannot prevent code from sending the tab to another address, and an address can carry data. Nothing in Stillbilled does this, but the policy is not what guarantees it.
- **It cannot set `frame-ancestors`.** That directive is ignored in a `<meta>` policy, and GitHub Pages does not let a project set response headers. So another site could put Stillbilled in a frame. There is no login or sensitive action to hijack, but it is a real limit.
- **It does not protect against whoever serves the page.** If the site's host or a fork changed the code, the policy would change with it. See below.

## Who can see what

- **The host.** The public site is delivered by a web host (GitHub Pages, if deployed from this repository's workflow). Like any website, the host can see that your browser requested the page: your IP address, the time, and the user-agent. It cannot see your files, because they never leave your browser. See GitHub's own privacy statement for what it logs. If you deploy your own copy, your host's policy applies.
- **Browser extensions** that can read all pages can read this one, including anything you load into it. This is true of every web page. Use a profile without such extensions if that matters to you.
- **Someone with access to your computer** can see the files you downloaded and, while the tab is open, the tab itself.
- **The browser** may keep a copy of the page's files in its cache. Those are the site's own files, not your statements.

## Trusting the code

"Runs locally" is only as good as the code you are running. You do not have to take it on trust:

1. **Read it.** There is no minified or bundled code. What is served is what is in `js/`, `css/` and `index.html`.
2. **Watch the network.** Open the browser's developer tools, go to the Network tab, add a file or press "Try it with sample data", and look for new requests. There should be none.
3. **Go offline.** Load the page, turn off your internet connection, and use it. It keeps working. (This is not the same as working offline from a cold start; there is no service worker.)
4. **Run it yourself.** Clone the repository and run `npm run serve`, or open a built copy from your own computer. Nothing needs the internet.
5. **Run the checks.** `npm run verify` builds the site and fails if any file refers to another site, if there is inline script or style, if the policy is missing, or if the code mentions a network API.

What these steps cannot establish: that a copy hosted by someone else is the same as this repository. If that matters, build and host your own.

## Threat model

| Risk | Handled? | How |
|------|----------|-----|
| The developer's server stores your statements | Not possible | There is no server code |
| A third-party script or tracker reads your data | Prevented | No third-party code; the policy blocks it |
| A malicious string in a bank file injects script | Prevented | Text is only ever inserted as text nodes; no `innerHTML`; the policy blocks inline script. A test loads a file with HTML in a merchant name |
| A malicious merchant name becomes a spreadsheet formula in the CSV export | Mitigated | Cells starting with `=`, `+`, `-` or `@` are escaped |
| A malicious or damaged session file crashes the app or injects values | Mitigated | Every field is validated and sizes are capped |
| The hosting provider changes the code | Not prevented | Read the source, or self-host |
| Another site frames the page | Not prevented | Cannot set `frame-ancestors` from a `<meta>` tag |
| Malware or a hostile extension on your computer | Out of scope | |
| Someone looking at your screen | Out of scope | |
| Shoulder-surfing a saved session file or CSV | Your responsibility | Delete files you no longer need |

## Data protection rules (GDPR, CCPA and similar)

The project does not collect personal data: it receives none, because it has no server. The processing described above happens in your own browser, under your control. The host's logging of page requests is the host's, not this project's. If you deploy this software for other people, you become responsible for your own deployment, including your host, and may want to say so in your own privacy notice.

## Reporting a problem

If you find a way for data to leave the page that is not described here, please report it using the instructions in `CONTRIBUTING.md`. Please do not include real financial data in a public issue; a few made-up rows that show the problem are enough.
