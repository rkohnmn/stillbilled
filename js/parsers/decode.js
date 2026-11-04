// Bank exports come in more than one text encoding. Reading them all as UTF-8
// turns "Café" into "Caf�" and breaks UTF-16 files entirely, so decode the bytes
// ourselves: honour a byte-order mark, notice BOM-less UTF-16, try strict UTF-8,
// and fall back to Windows-1252 (what most older bank software writes).

/** @param {ArrayBuffer|Uint8Array} input @returns {{ text: string, encoding: string }} */
export function decodeBytes(input) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);

  if (u8.length >= 3 && u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(u8), encoding: 'utf-8' };
  }
  if (u8.length >= 2 && u8[0] === 0xff && u8[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(u8), encoding: 'utf-16le' };
  }
  if (u8.length >= 2 && u8[0] === 0xfe && u8[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(u8), encoding: 'utf-16be' };
  }

  // UTF-16 without a BOM: mostly ASCII text means every other byte is zero.
  const probe = Math.min(u8.length, 400);
  let evenZero = 0;
  let oddZero = 0;
  for (let i = 0; i < probe; i++) {
    if (u8[i] === 0) (i % 2 === 0 ? evenZero++ : oddZero++);
  }
  const pairs = probe / 2;
  if (pairs >= 4 && oddZero > pairs * 0.4 && evenZero < pairs * 0.05) {
    return { text: new TextDecoder('utf-16le').decode(u8), encoding: 'utf-16le' };
  }
  if (pairs >= 4 && evenZero > pairs * 0.4 && oddZero < pairs * 0.05) {
    return { text: new TextDecoder('utf-16be').decode(u8), encoding: 'utf-16be' };
  }

  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(u8), encoding: 'utf-8' };
  } catch {
    return { text: decodeWindows1252(u8), encoding: 'windows-1252' };
  }
}

// Bytes 0x80 to 0x9F are letters and punctuation in Windows-1252 (the euro sign at 0x80, curly quotes,
// dashes) but control characters in plain Latin-1. The spec'd TextDecoder gets this right in browsers,
// but some Node versions decode the label "windows-1252" as Latin-1. A small table makes the result
// the same everywhere. The five bytes Windows-1252 leaves undefined stay as control characters, as the spec says.
const WIN1252_HIGH = {
  0x80: '\u20ac', 0x82: '\u201a', 0x83: '\u0192', 0x84: '\u201e', 0x85: '\u2026', 0x86: '\u2020', 0x87: '\u2021',
  0x88: '\u02c6', 0x89: '\u2030', 0x8a: '\u0160', 0x8b: '\u2039', 0x8c: '\u0152', 0x8e: '\u017d',
  0x91: '\u2018', 0x92: '\u2019', 0x93: '\u201c', 0x94: '\u201d', 0x95: '\u2022', 0x96: '\u2013', 0x97: '\u2014',
  0x98: '\u02dc', 0x99: '\u2122', 0x9a: '\u0161', 0x9b: '\u203a', 0x9c: '\u0153', 0x9e: '\u017e', 0x9f: '\u0178',
};

function decodeWindows1252(u8) {
  return new TextDecoder('windows-1252').decode(u8).replace(/[\u0080-\u009f]/g, (c) => WIN1252_HIGH[c.charCodeAt(0)] ?? c);
}
