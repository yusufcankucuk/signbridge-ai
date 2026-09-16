import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { validateModelAssets } from '../model-assets-lib.mjs';

const digest = (value) => createHash('sha256').update(value).digest('hex');

test('model dosyalarının doğru, eksik ve bozuk hash durumlarını ayırır', async (context) => {
  const root = mkdtempSync(join(tmpdir(), 'signbridge-model-assets-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'saved_model'), { recursive: true });
  writeFileSync(join(root, 'saved_model', 'saved_model.pb'), 'valid-model');
  const manifest = {
    files: {
      'saved_model/saved_model.pb': digest('valid-model'),
      'runtime_config.json': digest('valid-runtime'),
    },
  };

  assert.deepEqual(await validateModelAssets(root, manifest), ['EKSİK runtime_config.json']);
  writeFileSync(join(root, 'runtime_config.json'), 'wrong-runtime');
  assert.deepEqual(await validateModelAssets(root, manifest), ['HASH runtime_config.json']);
  writeFileSync(join(root, 'runtime_config.json'), 'valid-runtime');
  assert.deepEqual(await validateModelAssets(root, manifest), []);
});

test('model seçimi varsayılanı, ortam değişkenini ve hatalı adı doğru işler', async () => {
  const { resolveModelRelease } = await import('../model-assets-lib.mjs');
  const entry = (tag) => ({
    tag, assetName: `${tag}.zip`, downloadUrl: `https://example.com/${tag}.zip`, sha256: 'a'.repeat(64),
    modelVersion: tag, modelDir: `out/${tag}`, assetsManifest: `m/${tag}.json`,
  });
  const release = { schemaVersion: '2.0', defaultModel: 'yeni', models: { yeni: entry('yeni'), eski: entry('eski') } };
  assert.equal(resolveModelRelease(release).name, 'yeni');
  assert.equal(resolveModelRelease(release, 'eski').modelDir, 'out/eski');
  assert.throws(() => resolveModelRelease(release, 'yok'), /Bilinmeyen model/);
  assert.throws(() => resolveModelRelease({ ...release, models: { yeni: { ...entry('yeni'), sha256: 'x' } } }), /SHA-256/);
  const legacy = resolveModelRelease({ schemaVersion: '1.0', tag: 't' });
  assert.equal(legacy.modelDir, 'ai-training/outputs');
});

test('depodaki model-release.json her model için tutarlı manifest ve politika gösterir', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { resolveModelRelease } = await import('../model-assets-lib.mjs');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const release = JSON.parse(readFileSync(resolve(root, 'scripts/model-release.json'), 'utf8'));
  assert.ok(release.models[release.defaultModel], 'varsayılan model tanımlı olmalı');
  for (const name of Object.keys(release.models)) {
    const selection = resolveModelRelease(release, name);
    const manifest = JSON.parse(readFileSync(resolve(root, selection.assetsManifest), 'utf8'));
    assert.equal(manifest.modelVersion, selection.release.modelVersion);
    assert.ok(Object.keys(manifest.files).includes('saved_model/saved_model.pb'));
    assert.ok(Object.keys(manifest.files).includes('runtime_config.json'));
    assert.ok(existsSync(resolve(root, manifest.decisionPolicy)), `${name} politikası yok`);
    if (selection.release.env) assert.ok(existsSync(resolve(root, selection.release.env)), `${name} env örneği yok`);
  }
});
