# Research: why Stillbilled, and what the evidence does and does not show

Research was run on **2026-10-26** and this document was written on 2026-10-28. It is a desk study of public web pages: 22 searches and page fetches, each recorded with the date it was run. There were no interviews, no surveys of my own, no app-store mining and no search-volume data. Nothing here has been tested with real users.

The rules I held myself to:

- **Verified** means a source I actually read says it, and I name the source and how strong it is.
- **Hypothesis** means it is my reasoning, not evidence. The product bets on these, and the section at the end says how each could be tested.
- No statistic below is mine. Each is quoted from the page named next to it. Where a number comes from a company that sells something related, I say so.

## 1. Candidates considered

I looked for a consumer software problem that is real, that existing tools handle badly, and that fits in a static, local-first web app that one person can build to a finished state. Four candidates were compared.

| # | Candidate | What the research turned up | Verdict |
|---|-----------|-----------------------------|---------|
| A | **Subscription and price-hike auditor that reads a bank export in the browser** | Large, recent, multi-source evidence of forgotten subscriptions and price creep (section 2). A strong privacy objection to the dominant bank-linking model (section 3). A few direct competitors, so the idea is not unclaimed (section 4). | **Chosen** |
| B | A self-hosted or local budgeting app | Forum threads say Firefly III is hard to set up, while Actual Budget is liked (search 3). A July 2026 comparison article treats the two as the serious open-source options. The space already has mature, well-liked projects. A third budgeting app would need far more scope than one build and would compete head-on with them. | Rejected: crowded, scope too big |
| C | A free browser-based replacement for an expensive desktop program | Search 4 returned mostly SEO listicles, directory pages and vendor pages. I found no demand signal I could verify, and any single target (an image editor, say) is a multi-year product. | Rejected: no verifiable signal, scope unbounded |
| D | A web save-file editor for games | Search 5 returned mostly low-quality aggregator and spam pages. Each game needs its own reverse-engineered format, and the results mention ban and corruption risks. The scope grows with every game and I could not verify demand. | Rejected: per-game work, unverifiable demand, ban risk |

Why A won, in one line: it is the only candidate where I found specific, checkable evidence of both the problem and the privacy gap, and the whole product is a pure function from a file to a report, which is what a static site does best.

## 2. The problem: forgotten subscriptions and price creep

Verified, with source strength noted. These are survey figures, so they describe what respondents said, not audited behaviour.

- **Self Financial survey, 2026** (n = 1,272 US respondents, per the Self page). A second site quoting the survey says 59.9% of respondents had at least one paid subscription going unused each month, at an average of $26.79 a month. A MacTech article on the same survey says the average respondent had 3.4 paid subscriptions and 2.6 of them unused in a given month, with "unused" defined as not used in the past 30 days. *Source strength: medium-low. Self Financial sells credit-building products, so it has a commercial interest, and I did not read the full methodology.*
- **C+R Research survey**, as reported by NBC Los Angeles: consumers guessed they spent $86 a month on subscriptions, were off by about $133 a month, and 42% said they had forgotten a subscription they were still being charged for. *I did not verify the survey date in the text I read; treat it as older than 2026.*
- **CNET survey** (spring 2024 data, per the page): US adults spend an average of $91 a month on subscription services.
- **Compare the Market (Australia), March 2026**, as reported by Your Life Choices: around half of respondents pay for subscriptions they no longer use, with a potential annual waste of $1,739 (the page is Australian and I assume Australian dollars). *Different country and currency; I use it only as a sign the pattern is not US-only.*
- **Price creep.** One article citing ConsumerAffairs says late-2025 increases of $1 to $3 per service added $15 to $30 a month for many households. That is a second-hand report of a report, so I treat it as **low confidence**. Another site's author compiled five-year price histories for eight services and checked them "against official announcements"; I did not re-verify those numbers and I do not use them in the product.

What this supports: people say they forget subscriptions and underestimate what they pay. What it does not show: how many of them would act on a report, or whether price increases specifically, rather than forgotten services, are what hurts most. That second claim is a hypothesis (H3 below).

### Regulation context

- The FTC adopted a "click-to-cancel" rule on 2024-10-16 (ABC and TechCrunch coverage). EPIC's 2026-01-08 post says it was **vacated on procedural grounds** and asks the FTC to renew the rulemaking, and a glossary page dated 2026-09-25 describes it as vacated. *I did not read the court decision or check for any later rulemaking, so I cannot say what applies today.* The product does not depend on this: it is a tool for finding charges, whatever the rules on cancelling are.

## 3. The privacy gap in the dominant model

Verified, but mostly from review and comparison sites, which are secondary sources:

- Rocket Money (formerly Truebill) imports transactions by linking bank accounts through Plaid (Inquirer, Express VPN and Finny pages). Several review pages list the same complaints: the irony of paying a subscription to cancel subscriptions, upselling, trouble cancelling the app itself, and discomfort at sharing bank credentials with a third party (Gerald Wallet review summary, How the Market Works, Trustpilot snippets). *Trustpilot snippets are individual anecdotes and I use them only as examples of the complaint, not as a rate.* One summary says there is no confirmed public breach as of 2026-10-11 and that its privacy, meaning what the company does with data, is weak; I did not check that independently.
- **Incogni's study of 20 popular Android budgeting apps** (reported in 2023, per WTOP) found 60% shared at least some data with third parties and 1 in 4 shared financial information. *Source strength: medium-low. Incogni sells a data-removal service, the sample is 20 apps, they were Android apps in 2023, and it is not specifically about subscription tools.* It shows the concern is not paranoid. It does not show that Rocket Money behaves this way.
- Intuit's Mint closed in March 2024 (reported by several secondary pages, with one giving 2024-03-23). Several "no bank linking" apps market themselves on that, for example Pocket Clear and Finny. The point for this project is that a service built on bank aggregation can disappear, while a file on your own device cannot.

What this supports: a visible group of people dislike handing a third party their bank login, and sellers are advertising "no bank linking". What it does not show: how large that group is. That is hypothesis H1.

## 4. Alternatives and what Stillbilled is up against

I did not use any of these. What I know about each comes only from its public page or a search snippet.

| Alternative | How it works | What I could verify | Gap that Stillbilled targets |
|-------------|--------------|---------------------|-------------------------------|
| **Rocket Money** (and Monarch, YNAB and similar budgeting apps) | Bank linking through Plaid, with paid tiers | Reviews describe the complaints in section 3 | Needs a bank login and an account |
| **ChargeSift** (Chrome extension) | Imports CSV, TSV, OFX, QFX or QIF, finds recurring rhythms, estimated annual cost, latest price increases and possible duplicate debits, separates currencies, and encrypts transactions locally before storing them | Chrome Web Store page read on 2026-10-26: version 1.0.1, updated 2026-08-11, no ratings yet. I could not read its source: the GitHub repo was not fetchable from this environment. | **The closest competitor, and its pitch is almost the same as mine.** It is a browser extension and stores data (encrypted) on the device. Stillbilled is a web page with no install, no stored data by default, and extra features (section 5). ChargeSift is also ahead on one point: it separates currencies, where Stillbilled reads one currency at a time. Whether the differences matter to anyone is hypothesis H2. |
| **Subscription Killer** and **SubFind** (iOS apps) | Import a statement photo or bank data, advertised as local and private | App Store and directory snippets | Phone-only, and I could not verify the privacy claims |
| **getfin** (PyPI package) | Local-first CLI with SimpleFIN or CSV import that detects subscriptions | PyPI description | Needs Python and the command line |
| **QuietLedger / OpenLedger** (browser ledgers) | Local-first personal ledger with CSV import | A search snippet. *My fetch of the QuietLedger URL returned a different repository (openledger), so I rely on the snippet only.* | A general ledger, not an audit of recurring charges |
| **SubTracker, SubDupes, StackTidy and spreadsheets** | Manual entry, email-receipt scanning (SubDupes, StackTidy), or templates | Their own sites and blog posts | Manual work, or access to your inbox |
| **A bank's own app** | Some show a recurring-payments view | SubTracker's page says a bank app can be enough if everything is on one account, and lists what it cannot do: multiple cards, warnings, and similar | A single account at a time, and no price-increase view that I could verify |

The honest reading is that **this niche is already being entered.** The reason to build it anyway is not "nobody does this". It is that the product is small enough to do properly, and that there are specific choices a user can verify rather than take on trust (section 5 and `docs/PRIVACY.md`).

## 5. What Stillbilled does differently

These are design decisions, not market findings.

- **Nothing to install and nothing stored.** It is a web page. The data lives in the tab, and the only thing written to the browser is the theme choice. A user can save a session file if they want to come back to their decisions.
- **A page-level network block.** A Content-Security-Policy `<meta>` tag stops the page's scripts from connecting anywhere or loading anything from another site. The rule is readable in the source and a test confirms it blocks a `fetch`. Limits are in `docs/PRIVACY.md`.
- **The evidence is shown for every finding:** the charges behind it, a price chart, and the year-cost of an increase. The user marks each one Cancel, Keep or Ignore and gets a cancel list with annual savings.
- **Refund-aware double-charge detection.** A same-amount repeat is marked refunded if a matching credit shows up within 21 days.
- **Several accounts at once**, merged without double-counting overlapping exports.
- **Honest limits stated in the page**, including that detection can be wrong.

## 6. Bank export formats

I looked up the layouts of exports from four large US issuers so the parsers could be modelled on them. The sources are third-party converter and tutorial pages, not the banks' own documentation, so this is **medium-low confidence**:

- **Chase card CSV:** Transaction Date, Post Date, Description, Category, Type, Amount, Memo. Transaction and posting dates can differ by days (a Manager.io forum thread describes the reconciliation trouble that causes).
- **Capital One:** separate Debit and Credit columns, with both Transaction and Posted dates (beancount.io page).
- **Bank of America:** an account-summary preamble sits above the `Date,Description,Amount` header row, and the summary lines confuse importers that do not skip them (beancount.io page).
- **American Express:** several generations of layout, including one with `Extended Details` (the amex2qif repository lists them).

**What this means for the tests.** The parsers handle these shapes and also infer columns for unknown layouts. They were tested with **synthetic fixtures I wrote to match these descriptions**, and not with real bank files. Real exports will differ, which is why the file list in the app lets people correct the date order and the sign convention. See "Known limitations" in the README.

## 7. Name check

I searched for `"Stillbilled" OR "StillBilled" subscription` and for `"StillPaying" OR "Still Paying"`. The first returned unrelated "still being billed" support threads and no product, company or repository with the name. The second returned generic subscription-audit tools and no match. **This is a quick web search only. It is not a trademark search or legal clearance.** I did not search trademark registers, domain registrars, npm, PyPI or GitHub's own repository search. Anyone who plans to build a business on the name should do that first.

## 8. Technical facts checked

- A Content-Security-Policy delivered in a `<meta>` tag cannot use `frame-ancestors`; MDN's page on the directive and a blog post about it say so. GitHub Pages does not let a project set custom response headers. So the page cannot prevent other sites framing it. It is harmless here (there is no login or action to hijack), but it is listed as a limitation.

## 9. Hypotheses the product bets on

None of these has been tested.

| ID | Hypothesis | A way to test it |
|----|-----------|------------------|
| H1 | Enough people will upload a bank export to a web page they cannot fully audit, but would not link a bank, to make the tool worthwhile. | Watch whether people complete the first run with a real file, and ask what they feared. |
| H2 | A page with no install is preferred to an extension or app. | Compare completion rates between the page and a link to an alternative. |
| H3 | The price-increase view is the hook, not just the list of subscriptions. | Observe which section people open first, and whether they act on it. |
| H4 | The cancel list and a one-tap "Cancel / Keep / Ignore" decision make people act more than a plain report. | Ask whether they cancelled something afterwards. |
| H5 | The detection rules hold up on real accounts. | Run on many real exports (with consent) and count false alarms and misses. |
| H6 | Ordinary users can find and download their bank's CSV. | Observe real first-time users with the "Where do I get the file?" help. |

On H5, the only evidence so far is from my own simulated histories (see the README's known limitations).

## 10. Gaps and failed lookups

- The GitHub repository for ChargeSift was not on this environment's fetch allowlist, so I could not read its code, README or issue tracker.
- A fetch of a skills repository on GitHub was blocked by the site's robots rules; I did not need it.
- The QuietLedger fetch returned the wrong repository (see section 4).
- I did not search for academic work, regulatory complaint data or the other markets' bank formats (UK, EU). Stillbilled reads European number and date formats, but only the US layouts above were looked up.

## Sources

Searches and pages read on 2026-10-26.

- Rocket Money and bank linking: [Gerald Wallet review summary](https://joingerald.com/learn/financial-wellness/reddit-rocket-money-reviews), [How the Market Works](https://www.howthemarketworks.com/?p=19307), [Trustpilot reviews](https://www.trustpilot.com/review/rocketmoney.com?page=5), [Inquirer](https://usa.inquirer.net/166883/rocket-money-reviews-and-ratings), [Finny: Is Rocket Money safe?](https://getfinny.app/blog/is-rocket-money-safe-2026), [FinCompareLab](https://www.fincomparelab.com/?p=2046)
- Mint shutdown and "no bank linking" alternatives: [Gerald Wallet](https://joingerald.com/learn/financial-wellness/mint-money-app-alternatives-2026), [RapiDevelopers](https://rapidevelopers.com/clone/mint), [Pocket Clear](https://pocketclear.app/blog/mint-app-shut-down-2026-update.html), [Finny](https://getfinny.app/blog/best-mint-alternatives-2026)
- Local and no-bank tools: [ChargeSift on the Chrome Web Store](https://chromewebstore.google.com/detail/ggnleabeajchdelkchhmidgmiolfaioc), [getfin on PyPI](https://pypi.org/project/getfin/), [Subscription Killer](https://apps.apple.com/us/app/-/id6757887060), [SubFind](https://mwm.ai/apps/subfind-subscription-tracker/6761034583), [QuietLedger](https://github.com/sparshsam/quietledger), [SubTracker: track without linking a bank](https://subtracker.io/best/track-subscriptions-without-linking-bank), [SubTracker: is my bank app enough?](https://subtracker.io/alternatives/bank-app-subscription-tracker-alternative), [SubDupes vs Rocket Money](https://subdupes.com/blog/subdupes-vs-rocket-money)
- Self-hosted budgeting (candidate B): [Lemmy thread: self-hosted finance apps](https://lemmy.imagisphe.re/post/1429161), [beancount.io: Firefly III vs. Actual Budget](https://beancount.io/blog/2026/07/26/firefly-iii-vs-actual-budget-self-hosted-open-source-budgeting-guide)
- Surveys and price creep: [Self Financial: cost of unused paid subscriptions](https://www.self.inc/info/cost-of-unused-paid-subscriptions/), [MacTech on the Self survey](https://www.mactech.com/2026/06/03/survey-only-19-6-of-those-subscribe-to-apple-tv-dont-use-it/amp/), [Envelope Budgeting article](https://envelopebudgeting.com/articles/overspending-on-subscriptions), [NBC Los Angeles on the C+R Research survey](https://www.nbclosangeles.com/news/business/money-report/consumers-spend-an-average-133-more-each-month-on-subscriptions-than-they-realize-study-shows/2907627/), [CNET survey (mirror)](https://kompas.wasmer.app/https_www_cnet_com/personal-finance/subscription-creep-is-real-consumers-are-paying-over-1000-each-year-cnet-survey-finds), [Your Life Choices on Compare the Market](https://www.yourlifechoices.com.au/finance/the-1700-leak-draining-household-budgets/), [Recurdash: real cost of subscriptions](https://recurdash.com/blog/real-cost-of-subscriptions)
- Privacy research: [Incogni: budgeting apps research](https://blog.incogni.com/budgeting-apps-research/), [WTOP: are budget apps safe](https://wtop.com/news/2024/06/are-budget-apps-safe)
- FTC click-to-cancel: [TechCrunch, 2024-10-16](https://techcrunch.com/?p=2899671), [EPIC, 2026-01-08](https://epic.org/epic-joins-coalition-urging-ftc-to-renew-click-to-cancel-rulemaking-to-protect-consumers-from-subscription-traps/), [Open Class Actions glossary, 2026-09-25](https://openclassactions.com/glossary/ftc-click-to-cancel-rule.php)
- Bank export layouts: [Manager.io forum on Chase dates](https://forum.manager.io/t/credit-card-download-transaction-vs-posting-date-reconcile-problem/58134), [beancount.io Capital One](https://beancount.io/tools/csv-to-beancount/capital-one), [beancount.io Bank of America](https://beancount.io/tools/csv-to-beancount/bank-of-america), [amex2qif](https://github.com/jmcameron/amex2qif)
- Content-Security-Policy: [MDN: frame-ancestors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors)
- Candidates C and D (searches only, no page I could rely on): [DEV Community listicle](https://dev.to/nash_nash_a63d215dd357a39/5-free-browser-tools-that-replace-expensive-software-in-2026-no-download-needed-5ede), [AlternativeTo: browser-based apps](https://alternativeto.net/feature/browser-based)
