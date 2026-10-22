import readline from 'readline';
import process from 'process';
import { fileURLToPath } from 'url';

// Short-code utility · Step 1: Define the digits used by Base62 encoding.
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const BASE = ALPHABET.length; // 62

// Export functions directly for ES Module usage
// Short-code utility · Step 2: Hash URL text into an unsigned 32-bit DJB2 value.
export function djb2(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i); // hash * 33 + c
  }
  return hash >>> 0;
}

// Short-code utility · Step 3: Encode a number as a compact Base62 string.
export function toBase62(num) {
  if (num === 0) return ALPHABET[0];
  let out = '';
  while (num > 0) {
    out = ALPHABET[num % BASE] + out;
    num = Math.floor(num / BASE);
  }
  return out;
}

// Short-code utility · Step 4: Decode a Base62 string and reject unknown digits.
export function fromBase62(str) {
  let num = 0;
  for (const ch of str) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error(`invalid base62 char: ${ch}`);
    num = num * BASE + idx;
  }
  return num;
}

// url -> djb2 -> base62 short code (logs every shortening)
// Short-code utility · Step 5: Produce and log the original padded command-line short code.
export function shorten(url) {
  const hash = djb2(url);
  const code = toBase62(hash).padStart(6, '0');
  console.log(`[shorten] ${url} -> ${code}`);
  return code;
}

// ES Module equivalent of checking if the file was run directly: node shortener.js
const isMainFile = process.argv[1] === fileURLToPath(import.meta.url);

// Short-code utility · Step 6: Read URLs interactively when this file runs directly.
if (isMainFile) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('type a URL to shorten (q to quit):');
  rl.on('line', (input) => {
    const url = input.trim();
    if (url === 'q') return rl.close();
    if (!url) return;
    const code = shorten(url); // logs "[shorten] <url> -> <code>"
    console.assert(fromBase62(code) === djb2(url), 'round-trip failed!'); // only prints if broken
  });
}
