import { createHash } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

export async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export async function validateModelAssets(root, manifest) {
  const failures = [];
  for (const [relative, expected] of Object.entries(manifest.files ?? {})) {
    const file = resolve(root, relative);
    if (!existsSync(file) || !statSync(file).isFile()) {
      failures.push(`EKSİK ${relative}`);
      continue;
    }
    const actual = await sha256File(file);
    if (actual.toLowerCase() !== String(expected).toLowerCase()) failures.push(`HASH ${relative}`);
  }
  return failures;
}

// Model seçimi: --model <ad> > SIGNBRIDGE_MODEL > model-release.json defaultModel.
// Eski tek modelli (schemaVersion 1.0) biçim de desteklenir.
export function resolveModelRelease(release, requested) {
  if (!release.models) {
    return { name: 'autsl20', release, modelDir: 'ai-training/outputs', assetsManifest: 'ai-training/configs/model-assets.json' };
  }
  const name = String(requested || release.defaultModel || '').trim();
  const selected = release.models[name];
  if (!selected) {
    const known = Object.keys(release.models).join(', ');
    throw new Error(`Bilinmeyen model: "${name}". Seçenekler: ${known}`);
  }
  for (const key of ['tag', 'assetName', 'downloadUrl', 'sha256', 'modelVersion', 'modelDir', 'assetsManifest']) {
    if (!selected[key]) throw new Error(`model-release.json içinde ${name}.${key} eksik.`);
  }
  if (!/^[0-9a-f]{64}$/i.test(selected.sha256)) throw new Error(`${name} için SHA-256 geçersiz.`);
  if (!selected.downloadUrl.startsWith('https://')) throw new Error(`${name} indirme adresi https olmalıdır.`);
  return { name, release: selected, modelDir: selected.modelDir, assetsManifest: selected.assetsManifest };
}

export function argumentValue(args, name) {
  const inline = args.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
