import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
function keyFromConfig(value) {
  if (/^[0-9a-f]{64}$/i.test(value)) return Buffer.from(value, "hex");
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    throw new Error("TOKEN_ENCRYPTION_KEY must encode 32 bytes");
  }
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value) {
    throw new Error("TOKEN_ENCRYPTION_KEY must encode 32 bytes");
  }
  return key;
}
export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}
export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
export function sha256Base64Url(value) {
  return createHash("sha256").update(value).digest("base64url");
}
export function equalSecret(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function encryptJson(value, keyValue) {
  const key = keyFromConfig(keyValue);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}
export function decryptJson(value, keyValue) {
  const [ivValue, tagValue, ciphertextValue] = value.split(".");
  if (!ivValue || !tagValue || !ciphertextValue) throw new Error("Invalid encrypted OAuth value");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    keyFromConfig(keyValue),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext);
}
