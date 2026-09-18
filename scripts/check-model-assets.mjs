import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argumentValue, resolveModelRelease, validateModelAssets } from './model-assets-lib.mjs';

const argv = process.argv.slice(2);
const args = new Set(argv);
const modelArg = argv.find((value) => value.startsWith('--model-dir='));
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const allowManualOnly = args.has('--allow-manual-only');
let selection;
try {
  const releaseFile = JSON.parse(readFileSync(resolve(repoRoot, 'scripts/model-release.json'), 'utf8'));
  selection = resolveModelRelease(releaseFile, argumentValue(argv, '--model') ?? process.env.SIGNBRIDGE_MODEL);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
const modelRoot = resolve(repoRoot, modelArg ? modelArg.slice('--model-dir='.length) : selection.modelDir);
const manifestPath = resolve(repoRoot, selection.assetsManifest);
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
  console.error(`Kurulum: node scripts/install-model.mjs --model ${selection.name}`);
  if (allowManualOnly) {
    console.warn('Model doğrulanamadı; güvenli manual_only modu kullanılabilir.');
    process.exit(0);
  }
  process.exit(1);
}

console.log(`Model paketi doğrulandı: ${manifest.modelVersion} (${selection.name})`);
console.log(`Model dizini: ${modelRoot}`);
