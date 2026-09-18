import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
const derive = (password:string,salt:Buffer,length:number,options:{N:number;r:number;p:number;maxmem:number}) =>
  new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,length,options,(error,key)=>error?reject(error):resolve(key)));
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const randomToken = () => randomBytes(32).toString("hex");
export function dataKey() {
  const raw = process.env.SECURITY_DATA_KEY || "";
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32 || key.toString("base64") !== raw) throw new Error("SECURITY_DATA_KEY must be a canonical base64 32-byte key");
  return key;
}
export const privateDigest = (value: string) => createHmac("sha256", dataKey()).update(value).digest("hex");
export function seal(value: string, context: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dataKey(), iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString("base64")).join(".");
}
export function unseal(value: string, context: string) {
  const [iv, tag, content] = value.split(".").map(part => Buffer.from(part, "base64"));
  const cipher = createDecipheriv("aes-256-gcm", dataKey(), iv);
  cipher.setAAD(Buffer.from(context)); cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(content), cipher.final()]).toString("utf8");
}
export function validPassword(value: string) { return value.length >= 12 && Buffer.byteLength(value) <= 256; }
export async function hashPassword(value: string) {
  if (!validPassword(value)) throw new Error("Password must contain 12 or more characters, at most 256 bytes");
  const salt = randomBytes(16);
  const key = await derive(value, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }) as Buffer;
  return `scrypt-v2$131072$8$1$${salt.toString("hex")}$${key.toString("hex")}`;
}
export async function verifyPassword(value: string, stored: string) {
  if (!value || Buffer.byteLength(value) > 256) return false;
  try {
    const parts = stored.split("$");
    let salt: Buffer, expected: Buffer, cost: number;
    if (parts.length === 6 && parts.slice(0, 4).join("$") === "scrypt-v2$131072$8$1") {
      salt = Buffer.from(parts[4], "hex"); expected = Buffer.from(parts[5], "hex"); cost = 131072;
    } else if (parts.length === 3 && parts[0] === "scrypt") {
      const hex = /^[a-f0-9]{32}$/i.test(parts[1]) && /^[a-f0-9]{128}$/i.test(parts[2]);
      salt = Buffer.from(parts[1], hex ? "hex" : "base64");
      expected = Buffer.from(parts[2], hex ? "hex" : "base64"); cost = 16384;
    } else return false;
    if (salt.length !== 16 || expected.length !== 64) return false;
    const actual = await derive(value, salt, 64, { N: cost, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }) as Buffer;
    return timingSafeEqual(actual, expected);
  } catch { return false; }
}

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32(bytes: Buffer) {
  let bits = 0, value = 0, result = "";
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { result += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
export function decodeBase32(secret: string) {
  let bits = 0, value = 0; const out: number[] = [];
  for (const character of secret) {
    const digit = alphabet.indexOf(character); if (digit < 0) throw new Error("Invalid TOTP secret");
    value = (value << 5) | digit; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
export function totp(secret: string, counter: number, digits = 6) {
  const message = Buffer.alloc(8); message.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac("sha1", decodeBase32(secret)).update(message).digest();
  const offset = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % (10 ** digits)).padStart(digits, "0");
}
export function matchTotp(secret: string, code: string, lastCounter: number, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30000);
  for (const counter of [current, current - 1, current + 1]) {
    if (counter > lastCounter && timingSafeEqual(Buffer.from(totp(secret, counter)), Buffer.from(code))) return counter;
  }
  return null;
}
