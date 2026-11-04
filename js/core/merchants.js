// Turn a raw bank descriptor ("SQ *BLUE BOTTLE 0412 SAN FRANCISCO CA") into a
// stable merchant key and a readable name, so the same business groups together
// month after month even when the store number or location in the text changes.
//
// Two layers:
//   1. A short table of well-known subscription brands, matched against the whole
//      descriptor. This also tells us the category (used for "overlapping services").
//   2. A generic cleaner for everything else: drop payment-processor prefixes,
//      reference numbers, phone numbers, domains and trailing state codes, then
//      keep the first two meaningful words.

// [pattern, key, display name, category | null]
const BRANDS = [
  // video
  [/NETFLIX/, 'NETFLIX', 'Netflix', 'video'],
  [/\bHULU\b|HULUPLUS/, 'HULU', 'Hulu', 'video'],
  [/DISNEY ?(\+|PLUS)|DISNEYPLUS/, 'DISNEY PLUS', 'Disney+', 'video'],
  [/\bHBO ?MAX\b|HBOMAX|\bMAX\.COM\b/, 'MAX', 'Max', 'video'],
  [/PARAMOUNT ?(\+|PLUS)|PARAMOUNTPLUS/, 'PARAMOUNT PLUS', 'Paramount+', 'video'],
  [/PEACOCK ?(TV|PREMIUM|PLUS)|PEACOCKTV/, 'PEACOCK', 'Peacock', 'video'],
  [/APPLE ?TV ?(\+|PLUS)|APPLETV/, 'APPLE TV', 'Apple TV+', 'video'],
  [/YOUTUBE ?MUSIC/, 'YOUTUBE MUSIC', 'YouTube Music', 'music'],
  [/YOUTUBE ?TV|YOUTUBETV/, 'YOUTUBE TV', 'YouTube TV', 'video'],
  [/YOUTUBE ?(PREMIUM|MEMBER)|YOUTUBEPREMIUM|GOOGLE \*YOUTUBE/, 'YOUTUBE PREMIUM', 'YouTube Premium', 'video'],
  [/PRIME ?VIDEO|PRIMEVIDEO/, 'PRIME VIDEO', 'Prime Video', 'video'],
  [/CRUNCHYROLL/, 'CRUNCHYROLL', 'Crunchyroll', 'video'],
  [/DISCOVERY ?(\+|PLUS)|DISCOVERYPLUS/, 'DISCOVERY PLUS', 'Discovery+', 'video'],
  [/\bSTARZ\b/, 'STARZ', 'Starz', 'video'],
  [/SHOWTIME/, 'SHOWTIME', 'Showtime', 'video'],
  [/\bAMC ?(\+|PLUS)/, 'AMC PLUS', 'AMC+', 'video'],
  [/FUBO ?TV|FUBOTV/, 'FUBO', 'fuboTV', 'video'],
  [/SLING ?TV|SLINGTV/, 'SLING TV', 'Sling TV', 'video'],
  [/\bPHILO\b/, 'PHILO', 'Philo', 'video'],
  [/\bMUBI\b/, 'MUBI', 'MUBI', 'video'],
  // music and audio
  [/SPOTIFY/, 'SPOTIFY', 'Spotify', 'music'],
  [/APPLE ?MUSIC/, 'APPLE MUSIC', 'Apple Music', 'music'],
  [/AMAZON ?MUSIC/, 'AMAZON MUSIC', 'Amazon Music', 'music'],
  [/\bTIDAL\b/, 'TIDAL', 'Tidal', 'music'],
  [/PANDORA/, 'PANDORA', 'Pandora', 'music'],
  [/\bDEEZER\b/, 'DEEZER', 'Deezer', 'music'],
  [/SIRIUS ?XM|SIRIUSXM/, 'SIRIUSXM', 'SiriusXM', 'music'],
  // reading
  [/AUDIBLE/, 'AUDIBLE', 'Audible', 'reading'],
  [/KINDLE ?UNLIMITED|KINDLE UNLTD/, 'KINDLE UNLIMITED', 'Kindle Unlimited', 'reading'],
  [/\bSCRIBD\b/, 'SCRIBD', 'Scribd', 'reading'],
  [/BLINKIST/, 'BLINKIST', 'Blinkist', 'reading'],
  // cloud and backup
  [/ICLOUD/, 'ICLOUD', 'iCloud+', 'cloud'],
  [/DROPBOX/, 'DROPBOX', 'Dropbox', 'cloud'],
  [/GOOGLE ?\*? ?ONE\b|GOOGLE STORAGE/, 'GOOGLE ONE', 'Google One', 'cloud'],
  [/BACKBLAZE/, 'BACKBLAZE', 'Backblaze', 'cloud'],
  [/CARBONITE/, 'CARBONITE', 'Carbonite', 'cloud'],
  [/\bIDRIVE\b/, 'IDRIVE', 'IDrive', 'cloud'],
  [/\bPCLOUD\b/, 'PCLOUD', 'pCloud', 'cloud'],
  // VPN and passwords
  [/NORD ?VPN|NORDVPN/, 'NORDVPN', 'NordVPN', 'vpn'],
  [/EXPRESS ?VPN|EXPRESSVPN/, 'EXPRESSVPN', 'ExpressVPN', 'vpn'],
  [/SURFSHARK/, 'SURFSHARK', 'Surfshark', 'vpn'],
  [/MULLVAD/, 'MULLVAD', 'Mullvad', 'vpn'],
  [/PRIVATE INTERNET ACCESS/, 'PRIVATE INTERNET ACCESS', 'Private Internet Access', 'vpn'],
  [/CYBERGHOST/, 'CYBERGHOST', 'CyberGhost', 'vpn'],
  [/IPVANISH/, 'IPVANISH', 'IPVanish', 'vpn'],
  [/1 ?PASSWORD|AGILEBITS/, '1PASSWORD', '1Password', 'passwords'],
  [/LASTPASS/, 'LASTPASS', 'LastPass', 'passwords'],
  [/DASHLANE/, 'DASHLANE', 'Dashlane', 'passwords'],
  [/BITWARDEN/, 'BITWARDEN', 'Bitwarden', 'passwords'],
  [/NORDPASS/, 'NORDPASS', 'NordPass', 'passwords'],
  // AI
  [/CHATGPT|OPENAI/, 'OPENAI', 'ChatGPT / OpenAI', 'ai'],
  [/ANTHROPIC|CLAUDE\.AI/, 'ANTHROPIC', 'Claude', 'ai'],
  [/PERPLEXITY/, 'PERPLEXITY', 'Perplexity', 'ai'],
  [/MIDJOURNEY/, 'MIDJOURNEY', 'Midjourney', 'ai'],
  // news
  [/NYTIMES|NY TIMES|NEW YORK TIMES|NYTIMES\.COM/, 'NEW YORK TIMES', 'The New York Times', 'news'],
  [/\bWSJ\b|WALL STREET JOURNAL|DOW JONES/, 'WALL STREET JOURNAL', 'The Wall Street Journal', 'news'],
  [/WASHINGTON ?POST|WASHINGTONPOST|WAPO/, 'WASHINGTON POST', 'The Washington Post', 'news'],
  [/THE ECONOMIST|ECONOMIST\.COM|ECONOMIST NEWSPAPER/, 'ECONOMIST', 'The Economist', 'news'],
  [/THE ATLANTIC|THEATLANTIC/, 'THE ATLANTIC', 'The Atlantic', 'news'],
  [/NEW ?YORKER/, 'NEW YORKER', 'The New Yorker', 'news'],
  [/BLOOMBERG/, 'BLOOMBERG', 'Bloomberg', 'news'],
  [/FINANCIAL TIMES|FT\.COM/, 'FINANCIAL TIMES', 'Financial Times', 'news'],
  // creator support
  [/PATREON/, 'PATREON', 'Patreon', 'creator'],
  [/SUBSTACK/, 'SUBSTACK', 'Substack', 'creator'],
  // fitness and wellness
  [/PELOTON/, 'PELOTON', 'Peloton', 'fitness'],
  [/PLANET ?FITNESS/, 'PLANET FITNESS', 'Planet Fitness', 'fitness'],
  [/LA ?FITNESS/, 'LA FITNESS', 'LA Fitness', 'fitness'],
  [/EQUINOX/, 'EQUINOX', 'Equinox', 'fitness'],
  [/ANYTIME ?FITNESS/, 'ANYTIME FITNESS', 'Anytime Fitness', 'fitness'],
  [/ORANGE ?THEORY/, 'ORANGETHEORY', 'Orangetheory', 'fitness'],
  [/\bSTRAVA\b/, 'STRAVA', 'Strava', 'fitness'],
  [/CLASSPASS/, 'CLASSPASS', 'ClassPass', 'fitness'],
  [/MYFITNESSPAL/, 'MYFITNESSPAL', 'MyFitnessPal', 'fitness'],
  [/\bWHOOP\b/, 'WHOOP', 'Whoop', 'fitness'],
  [/\bNOOM\b/, 'NOOM', 'Noom', 'fitness'],
  [/HEADSPACE/, 'HEADSPACE', 'Headspace', 'meditation'],
  [/\bCALM(\.COM| APP)\b/, 'CALM', 'Calm', 'meditation'],
  // learning
  [/DUOLINGO/, 'DUOLINGO', 'Duolingo', 'learning'],
  [/COURSERA/, 'COURSERA', 'Coursera', 'learning'],
  [/MASTERCLASS/, 'MASTERCLASS', 'MasterClass', 'learning'],
  [/SKILLSHARE/, 'SKILLSHARE', 'Skillshare', 'learning'],
  [/\bUDEMY\b/, 'UDEMY', 'Udemy', 'learning'],
  [/BRILLIANT\.ORG/, 'BRILLIANT', 'Brilliant', 'learning'],
  [/BABBEL/, 'BABBEL', 'Babbel', 'learning'],
  [/ROSETTA ?STONE/, 'ROSETTA STONE', 'Rosetta Stone', 'learning'],
  [/LINKEDIN ?(PREMIUM|LEARNING|P\b)|LINKEDIN \*?PREM/, 'LINKEDIN PREMIUM', 'LinkedIn Premium', 'learning'],
  // gaming
  [/XBOX/, 'XBOX', 'Xbox', 'gaming'],
  [/PLAYSTATION|SONY INTERACTIVE/, 'PLAYSTATION', 'PlayStation', 'gaming'],
  [/NINTENDO/, 'NINTENDO', 'Nintendo', 'gaming'],
  [/\bEA ?PLAY\b/, 'EA PLAY', 'EA Play', 'gaming'],
  [/GEFORCE ?NOW/, 'GEFORCE NOW', 'GeForce Now', 'gaming'],
  [/\bTWITCH\b/, 'TWITCH', 'Twitch', 'gaming'],
  [/DISCORD/, 'DISCORD', 'Discord', 'gaming'],
  // software and tools
  [/ADOBE/, 'ADOBE', 'Adobe', 'software'],
  [/MICROSOFT ?\*? ?(365|OFFICE)|MSFT ?\*? ?(365|OFFICE)|OFFICE 365/, 'MICROSOFT 365', 'Microsoft 365', 'software'],
  [/GITHUB/, 'GITHUB', 'GitHub', 'software'],
  [/NOTION\.SO|NOTION LABS|\bNOTION\b/, 'NOTION', 'Notion', 'software'],
  [/EVERNOTE/, 'EVERNOTE', 'Evernote', 'software'],
  [/GRAMMARLY/, 'GRAMMARLY', 'Grammarly', 'software'],
  [/\bCANVA\b/, 'CANVA', 'Canva', 'software'],
  [/\bFIGMA\b/, 'FIGMA', 'Figma', 'software'],
  [/ZOOM\.US|ZOOM VIDEO/, 'ZOOM', 'Zoom', 'software'],
  [/\bSLACK\b/, 'SLACK', 'Slack', 'software'],
  [/DOCUSIGN/, 'DOCUSIGN', 'DocuSign', 'software'],
  [/SQUARESPACE/, 'SQUARESPACE', 'Squarespace', 'software'],
  [/GODADDY/, 'GODADDY', 'GoDaddy', 'software'],
  [/NAMECHEAP/, 'NAMECHEAP', 'Namecheap', 'software'],
  [/TODOIST/, 'TODOIST', 'Todoist', 'software'],
  [/\bZAPIER\b/, 'ZAPIER', 'Zapier', 'software'],
  // shopping and delivery memberships
  [/AMAZON ?PRIME|AMZN ?PRIME|PRIME MEMBERSHIP|PRIMEMEMBERSHIP/, 'AMAZON PRIME', 'Amazon Prime', 'membership'],
  [/COSTCO ?(MEMBERSHIP|MBRSHP|ANNUAL)/, 'COSTCO MEMBERSHIP', 'Costco membership', 'membership'],
  [/SAMS ?CLUB ?(MEMBERSHIP|MBR)/, 'SAMS CLUB MEMBERSHIP', "Sam's Club membership", 'membership'],
  [/WALMART ?(\+|PLUS)/, 'WALMART PLUS', 'Walmart+', 'membership'],
  [/INSTACART ?(\+|PLUS)/, 'INSTACART PLUS', 'Instacart+', 'membership'],
  [/DASHPASS/, 'DASHPASS', 'DoorDash DashPass', 'membership'],
  [/UBER ?\*? ?ONE\b/, 'UBER ONE', 'Uber One', 'membership'],
  [/GRUBHUB ?\+/, 'GRUBHUB PLUS', 'Grubhub+', 'membership'],
  // bundles that hide several services behind one descriptor. No category on purpose.
  [/APPLE\.COM ?\/ ?BILL|ITUNES\.COM ?\/ ?BILL/, 'APPLE BILL', 'Apple (App Store, iCloud, etc.)', null],
  [/AMAZON\.COM|AMAZON MKTP|AMZN MKTP|AMAZON PMTS|AMZN\.COM|AMAZON \*/, 'AMAZON', 'Amazon', null],
];

const PREFIXES = [
  /^(PURCHASE AUTHORIZED ON \d{1,2}\/\d{1,2}|PURCHASE AUTHORIZATION|CHECKCARD(?: PURCHASE)?(?: \d{4})?|DEBIT CARD PURCHASE|DEBIT PURCHASE|POS (?:DEBIT|PURCHASE|WITHDRAWAL)|RECURRING (?:PAYMENT|PMT|CARD PURCHASE|DEBIT)|ACH (?:DEBIT|WITHDRAWAL|PAYMENT)|ONLINE (?:PAYMENT|PMT|DEBIT)|WEB (?:PMT|PAYMENT)|PREAUTHORIZED (?:DEBIT|PAYMENT)|DIRECT DEBIT|AUTO ?PAY|PAYMENT TO|BILL PAY(?:MENT)?)\b[\s:*-]*/,
  /^(SQ|TST|SP|PP|PY|PAYPAL|GOOGLE|SQUARE|CKO|STRIPE)\s?\*\s*/,
];

const STOP = new Set([
  'THE', 'INC', 'LLC', 'LTD', 'CORP', 'CO', 'COM', 'PAYMENT', 'PMT', 'PURCHASE', 'DEBIT', 'CREDIT', 'CARD', 'ONLINE',
  'RECURRING', 'POS', 'ACH', 'WEB', 'ID', 'REF', 'USA', 'US', 'AND', 'OF', 'AT', 'FROM',
]);

const STATES = new Set(
  'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '),
);

const titleCase = (s) =>
  s
    .toLowerCase()
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');

function cleanTokens(raw) {
  let s = raw.toUpperCase().replace(/\s+/g, ' ').trim();
  // Strip leading transaction-type phrases and processor prefixes (a few passes, as they can stack)
  for (let pass = 0; pass < 3; pass++) {
    const before = s;
    for (const re of PREFIXES) s = s.replace(re, '');
    if (s === before) break;
  }
  // Trailing reference blocks some banks append
  s = s.replace(/\b(WEB ID|PPD ID|CO ID|ORIG ID|REF|CONF|TRACE)\b.*$/, '').replace(/\b(DES|INDN):.*$/, '');
  const tokens = [];
  // Split on anything that is not a letter (any script), digit or a few punctuation marks that occur in names.
  // This also keeps markup characters out of the key.
  for (let t of s.split(/[^\p{L}\p{N}'&+.\-/#]+/u)) {
    t = t
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+]+$/gu, '')
      .replace(/\.(COM|NET|ORG|IO|CO|US|AI|APP)(\/\S*)?$/, '');
    if (!t) continue;
    const digits = (t.match(/\d/g) || []).length;
    const letters = (t.match(/\p{L}/gu) || []).length;
    if (digits === t.length) continue; // pure number
    if (digits >= 3) continue; // phone numbers, store and reference numbers
    if (digits >= 2 && letters && t.length >= 6) continue; // mixed reference IDs
    if (/^#/.test(t) || /^X{2,}/.test(t)) continue;
    if (STOP.has(t)) continue;
    tokens.push(t);
  }
  while (tokens.length > 1 && (STATES.has(tokens[tokens.length - 1]) && tokens.length > 2)) tokens.pop();
  return tokens;
}

const memo = new Map();
const MEMO_MAX = 50000;

// Brands in the table that are shops, not subscription services. A match tells us the name, not that a charge repeats.
const MARKETPLACES = new Set(['AMAZON']);

/**
 * @returns {{ key: string, name: string, category: string|null, known: boolean }}
 * `known` is true when the merchant matched a subscription brand in the table.
 */
export function normalizeMerchant(desc) {
  const text = String(desc ?? '');
  const hit = memo.get(text);
  if (hit) return hit;
  const result = normalizeUncached(text);
  if (memo.size >= MEMO_MAX) memo.clear();
  memo.set(text, Object.freeze(result));
  return result;
}

function normalizeUncached(text) {
  const upper = text.toUpperCase();
  for (const [re, key, name, category] of BRANDS) {
    if (re.test(upper)) return { key, name, category, known: !MARKETPLACES.has(key) };
  }
  const tokens = cleanTokens(text);
  if (tokens.length === 0) {
    const fallback = upper.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 14) || 'UNKNOWN';
    return { key: fallback, name: titleCase(fallback), category: null, known: false };
  }
  const key = tokens.slice(0, 2).join(' ');
  return { key, name: titleCase(key), category: null, known: false };
}
