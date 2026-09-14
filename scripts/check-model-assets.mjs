import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const args = new Set(process.argv.slice(2));
const modelArg = process.argv.slice(2).find((value) => value.startsWith('--model-dir='));
const modelRoot = resolve(modelArg ? modelArg.slice('--model-dir='.length) : 'ai-training/outputs');
const allowManualOnly = args.has('--allow-manual-only');
const manifestPath = resolve('ai-training/configs/model-assets.json');

function hashFile(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });
}

if (!existsSync(manifestPath)) {
  console.error(`Model doğrulama manifesti bulunamadı: ${manifestPath}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const failures = [];
for (const [relative, expected] of Object.entries(manifest.files ?? {})) {
  const file = resolve(modelRoot, relative);
  if (!existsSync(file) || !statSync(file).isFile()) {
    failures.push(`EKSİK  ${relative}`);
    continue;
  }
  const actual = await hashFile(file);
  if (actual.toLowerCase() !== String(expected).toLowerCase()) failures.push(`HASH   ${relative}`);
}

const policyPath = resolve(String(manifest.decisionPolicy ?? ''));
if (!existsSync(policyPath)) failures.push(`EKSİK  ${manifest.decisionPolicy}`);

if (failures.length) {
  console.error('Tam AI modu başlatılamaz. Eksik veya uyumsuz dosyalar:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  console.error(`Beklenen model dizini: ${modelRoot}`);
  console.error('Model arşivini bu dizine çıkarın ve bu komutu yeniden çalıştırın.');
  if (allowManualOnly) {
    console.warn('Model doğrulanamadı; güvenli manual_only modu kullanılabilir.');
    process.exit(0);
  }
  process.exit(1);
}

console.log(`Model paketi doğrulandı: ${manifest.modelVersion}`);
console.log(`Model dizini: ${modelRoot}`);
