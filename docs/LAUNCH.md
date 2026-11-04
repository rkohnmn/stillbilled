# Launch and distribution plan

A short, honest plan for getting Stillbilled in front of the people who would use it. Nothing here has been run yet, and none of the channels below were checked for their current rules or audience size. Read each community's rules before posting.

## What "worked" means

The app has no analytics, by design, so success is measured with what the platforms and the people provide:

| Signal | Where | What it suggests |
|--------|-------|------------------|
| Repository stars, forks, watchers | GitHub | Interest, not use |
| Repository traffic (views, clones, referrers) | GitHub, Insights, Traffic (maintainers only) | Where visitors come from |
| Issues and discussions | GitHub | Real use, and what breaks. Layout reports are the most valuable |
| Direct feedback from 5 to 10 people who ran their own file | Conversations | Whether the hypotheses H1 to H6 in `docs/RESEARCH.md` hold |

A reasonable first target, which is a guess and not a forecast: ten people outside my circle run a real file and tell me what happened.

## Before launching

1. Deploy to GitHub Pages and run through the first screen on a phone and a desktop yourself.
2. **Test in Firefox and Safari.** The browser tests ran only in Chromium. Fix anything before anyone else finds it.
3. **Try real exports** from at least three banks or card issuers, your own and from people who agree to help. Look at false alarms and misses. Anything that fails to load becomes a test fixture (with invented rows).
4. Set the repository description and topics, add a **social preview image** in the repository settings (the page has no `og:image` yet), and enable private vulnerability reporting.
5. Pin an issue called "A bank file did not load" that says how to share made-up rows.
6. Read `docs/PRIVACY.md` once more as a sceptic. Claims about privacy will be tested first, so each one should be easy to demonstrate.

## The message

**One line:** Find forgotten subscriptions, price hikes and double charges in your bank export, without giving anyone your bank login. It runs in your browser and nothing is uploaded.

**Three points, in order:**

1. It works from a file your bank already lets you download. No login, no account, no install.
2. You can check the privacy claim yourself (Network tab, or go offline after loading), and the code is short enough to read.
3. It shows its evidence and says when it might be wrong. You decide what to cancel.

**Do not say:** "bank-grade", "secure", "AI", "guaranteed", "saves you $X" (there is no evidence for a number), or that it is the only tool of its kind. ChargeSift and others exist, and a reader who knows that will stop trusting everything else.

## Channels

Ordered by fit and effort. I have not verified the current rules or audiences of any of these.

| Channel | Why it fits | How to approach it |
|---------|-------------|--------------------|
| A "Show HN" style post on Hacker News | Technical readers like local-first, no-dependency tools and will read the source | A plain title, the link, and a first comment with the privacy design, the limits and the Firefox/Safari status. Be ready to answer questions for several hours |
| Privacy and personal-finance subreddits and forums | The audience dislikes bank linking | Many ban self-promotion. Read the rules; if they allow it, post as a person with a tool, not an advertisement. Otherwise answer people's existing questions and link only where relevant |
| Open-source directories (AlternativeTo and similar) | People search for alternatives to Rocket Money and similar | List it as an alternative with the facts: no bank linking, runs locally, free, open source. Check each directory's listing rules |
| Personal-finance and privacy bloggers and newsletters | They write "how to audit your subscriptions" pieces | Send a short, personal note with the link and one specific thing it did on the sample data. Do not mass-mail |
| Your own network | The first ten real runs | Ask for a file run and honest feedback, not a share |

## Content to make

- A **60-second screen recording** of the sample data: drop, scan, mark one cancel, show the cancel list. (Not yet made.)
- A short post: **"How to audit your subscriptions from your bank statement, with or without this tool."** A genuinely useful guide, with the tool as one step. It should work if the reader never uses Stillbilled.
- Per-bank "how to download the CSV" notes, **only** for banks someone has checked recently. Bank menus change and a stale guide is worse than none.

## Timing

Hypothesis, not evidence: interest in a subscription clean-up is higher around New Year, in tax season and after a big sale, when free trials turn into paid plans. A launch in the weeks before January lets the first users find the tool when they are already looking. Posting at a time you can respond for the following day matters more than the exact date.

## First two weeks

| When | Do |
|------|-----|
| Days 1 to 3 | Deploy. Test in Firefox and Safari. Run three real files. Fix what breaks |
| Days 4 to 7 | Ask ten people to run a real file. Collect layouts that failed. Release a fix as 1.0.1 |
| Week 2 | Post to the first one or two channels with the message above. Answer every comment and issue. Write down every false alarm and miss |
| After | Decide what to build from what people actually reported, not from the roadmap |

## Risks and how to handle them

- **"It said I had a subscription I don't."** Expected, and stated on the page. Reply with thanks, ask for made-up rows that reproduce it, and add a test.
- **"How do I know it doesn't upload my data?"** Point to the Network tab steps and to `docs/PRIVACY.md`, including what the policy cannot do. Never argue that it is perfect.
- **"A competitor does this too."** Agree, and say what is different (see the README table), including where the other tool is ahead.
- **A name conflict.** Only a quick web search was done. If a conflict appears, rename before the project grows.
- **A bank layout that I cannot test.** Say so and ask for made-up rows. Do not guess.

## What this plan avoids

No analytics or tracking added to measure growth, no invented testimonials or numbers, no paid promotion, no claims of audits or certifications that have not happened, and no posting the same text in many places at once.
