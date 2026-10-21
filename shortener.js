import readline from 'readline';
import process from 'process';
import { fileURLToPath } from 'url';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const BASE = ALPHABET.length; // 62

// Export functions directly for ES Module usage
export function djb2(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i); // hash * 33 + c
  }
  return hash >>> 0;
}

export function toBase62(num) {
  if (num === 0) return ALPHABET[0];
  let out = '';
  while (num > 0) {
    out = ALPHABET[num % BASE] + out;
    num = Math.floor(num / BASE);
  }
  return out;
}

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
export function shorten(url) {
  const hash = djb2(url);
  const code = toBase62(hash).padStart(6, '0');
  console.log(`[shorten] ${url} -> ${code}`);
  return code;
}

// ES Module equivalent of checking if the file was run directly: node shortener.js
const isMainFile = process.argv[1] === fileURLToPath(import.meta.url);

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
