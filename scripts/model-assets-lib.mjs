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
