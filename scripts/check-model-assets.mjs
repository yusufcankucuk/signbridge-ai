import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateModelAssets } from './model-assets-lib.mjs';

const args = new Set(process.argv.slice(2));
const modelArg = process.argv.slice(2).find((value) => value.startsWith('--model-dir='));
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modelRoot = resolve(repoRoot, modelArg ? modelArg.slice('--model-dir='.length) : 'ai-training/outputs');
const allowManualOnly = args.has('--allow-manual-only');
const manifestPath = resolve(repoRoot, 'ai-training/configs/model-assets.json');

if (!existsSync(manifestPath)) {
  console.error(`Model doğrulama manifesti bulunamadı: ${manifestPath}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const failures = await validateModelAssets(modelRoot, manifest);

const policyPath = resolve(repoRoot, String(manifest.decisionPolicy ?? ''));
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
