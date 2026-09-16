#!/usr/bin/env node
// MEB sağlık sözlüğü videolarını /camera-trials sayfasının referans oynatıcısı için kopyalar.
// Kullanım: node scripts/copy-meb-references.mjs "C:/.../ai icin kullanilacak kaynaklar/meb"
// Videolar yalnız yerel kullanım içindir; hedef klasör .gitignore ile depo dışında tutulur.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = process.argv[2];
if (!source || !existsSync(source)) {
  console.error('Kullanım: node scripts/copy-meb-references.mjs <MEB video klasörü>');
  process.exit(1);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'signbridge-app', 'public', 'reference', 'meb');
mkdirSync(target, { recursive: true });
const videos = readdirSync(source).filter(name => /^[a-z0-9-]+\.mp4$/.test(name));
for (const name of videos) copyFileSync(path.join(source, name), path.join(target, name));
console.log(`${videos.length} video kopyalandı → ${path.relative(root, target)}`);
if (!videos.length) process.exit(1);
