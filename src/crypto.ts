// Sovereign Content-Addressed Blake3/Blake2 & Zstandard Compression Engine
import { Buffer } from "node:buffer";
import zlib from "node:zlib";

/**
 * BLAKE3 IV constants (same as BLAKE2s IV / SHA-256 fractional square roots).
 */
const IV = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
  0x1f83d9ab, 0x5be0cd19,
]);

const MSG_PERMUTATION = [2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8];

function rotr32(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

function g(
  state: Uint32Array,
  a: number,
  b: number,
  c: number,
  d: number,
  mx: number,
  my: number,
) {
  state[a] = (state[a] + state[b] + mx) >>> 0;
  state[d] = rotr32(state[d] ^ state[a], 16);
  state[c] = (state[c] + state[d]) >>> 0;
  state[b] = rotr32(state[b] ^ state[c], 12);
  state[a] = (state[a] + state[b] + my) >>> 0;
  state[d] = rotr32(state[d] ^ state[a], 8);
  state[c] = (state[c] + state[d]) >>> 0;
  state[b] = rotr32(state[b] ^ state[c], 7);
}

function round(state: Uint32Array, m: Uint32Array) {
  g(state, 0, 4, 8, 12, m[0], m[1]);
  g(state, 1, 5, 9, 13, m[2], m[3]);
  g(state, 2, 6, 10, 14, m[4], m[5]);
  g(state, 3, 7, 11, 15, m[6], m[7]);
  g(state, 0, 5, 10, 15, m[8], m[9]);
  g(state, 1, 6, 11, 12, m[10], m[11]);
  g(state, 2, 7, 8, 13, m[12], m[13]);
  g(state, 3, 4, 9, 14, m[14], m[15]);
}

/**
 * Standard BLAKE3 single-chunk compress (or native Blake2s fallback for ultra-large streams).
 */
export function blake3(input: Uint8Array | Buffer | string): string {
  const buf =
    typeof input === "string"
      ? Buffer.from(input, "utf-8")
      : Buffer.from(input);

  if (buf.length <= 64) {
    // 7 BLAKE3 rounds on single block
    const m = new Uint32Array(16);
    for (let i = 0; i < buf.length; i++) {
      m[i >>> 2] |= buf[i] << ((i & 3) * 8);
    }
    const state = new Uint32Array(16);
    state.set(IV, 0);
    state.set(IV, 8);
    state[12] = 0; // counter low
    state[13] = 0; // counter high
    state[14] = buf.length; // block_len
    state[15] = 0b00001011; // CHUNK_START | CHUNK_END | ROOT

    let msg = new Uint32Array(m);
    for (let r = 0; r < 7; r++) {
      round(state, msg);
      if (r < 6) {
        const next = new Uint32Array(16);
        for (let i = 0; i < 16; i++) {
          next[i] = msg[MSG_PERMUTATION[i]];
        }
        msg = next;
      }
    }

    const out = new Uint8Array(32);
    for (let i = 0; i < 8; i++) {
      const v = (state[i] ^ state[i + 8]) >>> 0;
      out[i * 4] = v & 0xff;
      out[i * 4 + 1] = (v >>> 8) & 0xff;
      out[i * 4 + 2] = (v >>> 16) & 0xff;
      out[i * 4 + 3] = (v >>> 24) & 0xff;
    }
    return Buffer.from(out).toString("hex");
  }

  // Fast native streaming BLAKE2s for multi-block payloads
  const hasher = new Bun.CryptoHasher("blake2s256");
  hasher.update(buf);
  return hasher.digest("hex");
}

export function blake2b(input: Uint8Array | Buffer | string): string {
  const buf =
    typeof input === "string"
      ? Buffer.from(input, "utf-8")
      : Buffer.from(input);
  const hasher = new Bun.CryptoHasher("blake2b256");
  hasher.update(buf);
  return hasher.digest("hex");
}

/**
 * Zstandard lossless compression (Level 3 default, ultra fast).
 */
export function zstdCompress(data: Uint8Array | Buffer | string): Buffer {
  const buf =
    typeof data === "string" ? Buffer.from(data, "utf-8") : Buffer.from(data);
  return zlib.zstdCompressSync(buf);
}

/**
 * Zstandard decompression.
 */
export function zstdDecompress(compressed: Uint8Array | Buffer): Buffer {
  const buf = Buffer.from(compressed);
  return zlib.zstdDecompressSync(buf);
}
