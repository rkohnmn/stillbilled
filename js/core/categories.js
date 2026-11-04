// Light-touch categorisation. Used for two things only: spotting overlapping
// services (three video streaming subscriptions) and labelling bills. It is a
// hand-written heuristic, not a merchant database, and it is wrong sometimes.

export const CATEGORIES = {
  video: { label: 'Video streaming', overlap: true },
  music: { label: 'Music streaming', overlap: true },
  cloud: { label: 'Cloud storage and backup', overlap: true },
  vpn: { label: 'VPN', overlap: true },
  passwords: { label: 'Password managers', overlap: true },
  ai: { label: 'AI assistants', overlap: true },
  news: { label: 'News and magazines', overlap: true },
  reading: { label: 'Books and audio', overlap: false },
  fitness: { label: 'Fitness', overlap: false },
  meditation: { label: 'Wellness apps', overlap: false },
  learning: { label: 'Learning', overlap: false },
  gaming: { label: 'Gaming', overlap: false },
  software: { label: 'Software and tools', overlap: false },
  membership: { label: 'Shopping and delivery memberships', overlap: false },
  creator: { label: 'Creator support', overlap: false },
};

// Only used when a merchant is not a known brand. Keep these narrow: a false
// match produces a wrong "overlapping services" note.
const KEYWORDS = [
  ['video', /STREAM|FLIX|VIDEO|MOVIES?\b|CINEMA/],
  ['music', /MUSIC|TUNE|RADIO|SONGS?\b/],
  ['cloud', /BACKUP|CLOUD ?(LOCKER|VAULT|DRIVE|SYNC|STORAGE)/],
  ['vpn', /\bVPN\b/],
  ['news', /\bNEWS\b|GAZETTE|HERALD/],
  ['fitness', /FITNESS|\bGYM\b|YOGA|PILATES|CROSSFIT/],
  ['learning', /ACADEMY|\bCOURSES?\b|LEARNING/],
];

export function inferCategory(key, desc = '') {
  const text = `${key} ${desc}`.toUpperCase();
  for (const [id, re] of KEYWORDS) if (re.test(text)) return id;
  return null;
}

/** Recurring charges that are bills (rent, utilities, insurance) rather than subscriptions. */
const BILL = /\b(RENT|MORTGAGE|INSURANCE|INS|LOAN|ELECTRIC|ELECTRICITY|POWER|WATER|SEWER|UTILIT\w*|INTERNET|CABLE|WIRELESS|MOBILE|PHONE|TELECOM|HOA|TAX|TAXES|TUITION|LEASE|PROPERTY|ENERGY)\b/;
export const isBillLike = (text) => BILL.test(text.toUpperCase());

/** Money moving between the person's own accounts or paying a card is not a charge to audit. */
const TRANSFER = /\b(TRANSFER|XFER|TRSF|CARD PAYMENT|CREDIT CARD (?:PMT|PAYMENT)|PAYMENT THANK YOU|AUTOPAY PAYMENT|ATM (?:WITHDRAWAL|CASH)|CASH WITHDRAWAL|ONLINE PAYMENT THANK)\b/;
export const isTransferLike = (text) => TRANSFER.test(text.toUpperCase());
