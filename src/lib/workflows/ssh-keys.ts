import crypto from "node:crypto";

// Encode a Buffer as a 4-byte big-endian length-prefixed blob
function encodeBytes(b: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(b.length);
  return Buffer.concat([len, b]);
}

function encodeStr(s: string): Buffer {
  return encodeBytes(Buffer.from(s, "utf8"));
}

/**
 * Converts a PKCS#8 PEM Ed25519 private key to the OpenSSH private key
 * format (`-----BEGIN OPENSSH PRIVATE KEY-----`) required by ssh2 and the
 * standard `ssh` CLI.
 */
function pkcs8ToOpenSshPrivate(pkcs8Pem: string): string {
  const keyObj = crypto.createPrivateKey(pkcs8Pem);

  // JWK gives us the raw 32-byte key material without having to parse DER
  const jwk = keyObj.export({ format: "jwk" }) as { d: string; x: string };
  const seed = Buffer.from(jwk.d, "base64url"); // 32-byte private seed
  const pub = Buffer.from(jwk.x, "base64url"); // 32-byte public key

  // Public key blob: type + raw public key
  const pubBlob = Buffer.concat([encodeStr("ssh-ed25519"), encodeBytes(pub)]);

  // Private section (inside the "encrypted" body, which is plaintext for "none")
  const checkInt = crypto.randomBytes(4);
  const privSection = Buffer.concat([
    checkInt, // check1 — two identical values let the decoder verify decryption
    checkInt, // check2
    encodeStr("ssh-ed25519"),
    encodeBytes(pub), // public key (32 bytes)
    encodeBytes(Buffer.concat([seed, pub])), // private key: seed (32) + pub (32)
    encodeStr(""), // comment
  ]);

  // Pad to 8-byte block boundary using bytes 0x01, 0x02, …
  const blockSize = 8;
  const padLen = (blockSize - (privSection.length % blockSize)) % blockSize;
  const padding = Buffer.from(
    Array.from({ length: padLen }, (_, i) => i + 1),
  );
  const privBlob = Buffer.concat([privSection, padding]);

  const nkeys = Buffer.alloc(4);
  nkeys.writeUInt32BE(1);

  const body = Buffer.concat([
    Buffer.from("openssh-key-v1\0"), // magic
    encodeStr("none"), // ciphername
    encodeStr("none"), // kdfname
    encodeBytes(Buffer.alloc(0)), // kdfoptions (empty for "none")
    nkeys,
    encodeBytes(pubBlob), // public key blob
    encodeBytes(privBlob), // private key blob
  ]);

  const b64 = body.toString("base64");
  const lines = b64.match(/.{1,70}/g) ?? [];
  return (
    "-----BEGIN OPENSSH PRIVATE KEY-----\n" +
    lines.join("\n") +
    "\n-----END OPENSSH PRIVATE KEY-----\n"
  );
}

/**
 * Generates an Ed25519 keypair. Returns:
 * - `opensshPrivate`: OpenSSH private key format (compatible with ssh2 and `ssh` CLI)
 * - `opensshPublic`: OpenSSH public key format (for authorized_keys / Hetzner API)
 */
export function generateEd25519KeyPair(comment = ""): {
  opensshPrivate: string;
  opensshPublic: string;
} {
  const { publicKey: pemPublic, privateKey: pemPrivate } =
    crypto.generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

  return {
    opensshPrivate: pkcs8ToOpenSshPrivate(pemPrivate),
    opensshPublic: pemToOpenSsh(pemPublic, comment),
  };
}

/**
 * Converts a PEM-encoded Ed25519 SPKI public key to the
 * "ssh-ed25519 <base64>" format required by authorized_keys / Hetzner.
 */
export function pemToOpenSsh(pemPublicKey: string, comment = ""): string {
  const der = crypto
    .createPublicKey(pemPublicKey)
    .export({ type: "spki", format: "der" });

  // The 32-byte Ed25519 key occupies the last 32 bytes of the SPKI DER blob
  const keyBytes = (der as Buffer).subarray((der as Buffer).length - 32);

  const typeStr = "ssh-ed25519";
  const typeBuf = Buffer.alloc(4 + typeStr.length);
  typeBuf.writeUInt32BE(typeStr.length, 0);
  typeBuf.write(typeStr, 4);

  const keyBuf = Buffer.alloc(4 + keyBytes.length);
  keyBuf.writeUInt32BE(keyBytes.length, 0);
  keyBytes.copy(keyBuf, 4);

  const b64 = Buffer.concat([typeBuf, keyBuf]).toString("base64");
  return comment ? `ssh-ed25519 ${b64} ${comment}` : `ssh-ed25519 ${b64}`;
}
