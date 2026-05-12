// encrypt-data.mjs 가 만든 src/data/encrypted.json 을
// src-tauri/resources/encrypted.json 에도 복사한다 (Tauri bundle resource 시드).
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = resolve(ROOT, 'src/data/encrypted.json');
const DST = resolve(ROOT, 'src-tauri/resources/encrypted.json');

mkdirSync(dirname(DST), { recursive: true });
copyFileSync(SRC, DST);
console.log(`[prebuild:tauri] ${SRC} → ${DST}`);
