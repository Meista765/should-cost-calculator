// scripts/encrypt-data.mjs로 만든 번들을 사용자 비밀번호로 복호화한다.
// 비밀번호는 외부로 전송되지 않고 WebCrypto API에서만 사용된다.
import type { Db } from '../types/domain';

export type EncryptedBundle = {
  version: string;
  encryptedAt: string;
  algorithm: 'AES-GCM-256';
  kdf: 'PBKDF2';
  kdfHash: 'SHA-256';
  kdfIterations: number;
  salt: string;        // base64
  iv: string;          // base64
  ciphertext: string;  // base64
};

function fromB64(s: string): ArrayBuffer {
  const bin = atob(s);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
}

export async function decryptDb(bundle: EncryptedBundle, password: string): Promise<Db> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: fromB64(bundle.salt),
      iterations: bundle.kdfIterations,
      hash: bundle.kdfHash,
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(bundle.iv) },
      aesKey,
      fromB64(bundle.ciphertext),
    );
  } catch {
    throw new Error('비밀번호가 올바르지 않습니다.');
  }
  const text = new TextDecoder().decode(plaintext);
  return JSON.parse(text) as Db;
}
