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
