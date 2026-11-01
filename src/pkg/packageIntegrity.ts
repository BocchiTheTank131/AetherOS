// AetherOS - Cryptographic Package Integrity Verification (SHA-256)
import { strToU8 } from 'fflate';

/**
 * Computes hexadecimal SHA-256 hash of byte array or string.
 */
export async function computeSha256(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? strToU8(data) : data;

  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    const rawBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const hashBuffer = await crypto.subtle.digest('SHA-256', rawBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Pure TypeScript fallback implementation of SHA-256 for environments without crypto.subtle
  return sha256Fallback(bytes);
}

function sha256Fallback(bytes: Uint8Array): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const words: number[] = [];
  const asciiBitLength = bytes.length * 8;

  const K: number[] = [];
  const H: number[] = [];

  let primeCounter = 0;
  const isPrime = (n: number) => {
    for (let factor = 2; factor * factor <= n; factor++) {
      if (n % factor === 0) return false;
    }
    return true;
  };

  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (isPrime(candidate)) {
      if (primeCounter < 8) {
        H[primeCounter] = (mathPow(candidate, 1 / 2) * maxWord) | 0;
      }
      K[primeCounter] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      primeCounter++;
    }
  }

  for (let i = 0; i < bytes.length; i++) {
    words[i >>> 2] |= bytes[i] << (24 - (i % 4) * 8);
  }

  words[asciiBitLength >>> 5] |= 0x80 << (24 - (asciiBitLength % 32));
  words[(((asciiBitLength + 64) >>> 9) << 4) + 15] = asciiBitLength;

  const W: number[] = new Array(64);

  for (let i = 0; i < words.length; i += 16) {
    let a = H[0],
      b = H[1],
      c = H[2],
      d = H[3],
      e = H[4],
      f = H[5],
      g = H[6],
      h = H[7];

    for (let j = 0; j < 64; j++) {
      if (j < 16) {
        W[j] = words[j + i] | 0;
      } else {
        const s0 = rightRotate(W[j - 15], 7) ^ rightRotate(W[j - 15], 18) ^ (W[j - 15] >>> 3);
        const s1 = rightRotate(W[j - 2], 17) ^ rightRotate(W[j - 2], 19) ^ (W[j - 2] >>> 10);
        W[j] = (W[j - 16] + s0 + W[j - 7] + s1) | 0;
      }

      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[j] + W[j]) | 0;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    H[0] = (H[0] + a) | 0;
    H[1] = (H[1] + b) | 0;
    H[2] = (H[2] + c) | 0;
    H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0;
    H[5] = (H[5] + f) | 0;
    H[6] = (H[6] + g) | 0;
    H[7] = (H[7] + h) | 0;
  }

  let result = '';
  for (let i = 0; i < 8; i++) {
    result += (H[i] >>> 0).toString(16).padStart(8, '0');
  }
  return result;
}

export async function generateIntegrityManifest(
  files: Map<string, Uint8Array>
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const [path, content] of files.entries()) {
    if (path === 'integrity.json') continue;
    result[path] = await computeSha256(content);
  }
  return result;
}

export async function verifyIntegrityManifest(
  files: Map<string, Uint8Array>,
  expected: Record<string, string>
): Promise<{ valid: boolean; mismatched: string[]; missing: string[] }> {
  const mismatched: string[] = [];
  const missing: string[] = [];

  for (const [path, expectedHash] of Object.entries(expected)) {
    const fileBytes = files.get(path);
    if (!fileBytes) {
      missing.push(path);
      continue;
    }
    const actualHash = await computeSha256(fileBytes);
    if (actualHash.toLowerCase() !== expectedHash.toLowerCase()) {
      mismatched.push(path);
    }
  }

  return {
    valid: mismatched.length === 0 && missing.length === 0,
    mismatched,
    missing,
  };
}
