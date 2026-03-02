// tools/make-admin-hash.js
const { randomBytes, scryptSync } = require("crypto");

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;

function b64(buf) {
  return buf.toString("base64");
}

function hashPassword(plain) {
  const salt = randomBytes(16);
  const key = scryptSync(plain, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${b64(salt)}$${b64(Buffer.from(key))}`;
}

const pass = process.argv[2];
if (!pass) {
  console.error("Uso: node tools/make-admin-hash.js \"TuPassword\"");
  process.exit(1);
}

console.log(hashPassword(pass));