const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');

function load(relative) {
  const filename = path.resolve(__dirname, relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const loaded = new Module(filename, module);
  loaded.paths = module.paths;
  loaded._compile(compiled.outputText, filename);
  return loaded.exports;
}

const answers = load('../src/data/answers.ts');
const { isLandmarkPredictionRequest } = load('../lib/prediction.ts');
const labelsPath = path.resolve(__dirname, '../../ai-training/configs/labels.signbridge71.json');
const vocabulary = fs.existsSync(labelsPath) ? JSON.parse(fs.readFileSync(labelsPath, 'utf8')) : null;

test('yanıt bağlamları model sözlüğüyle birebir aynıdır', { skip: !vocabulary }, () => {
  assert.deepEqual(Object.keys(answers.ANSWER_CONTEXT_CLASSES).sort(),
    Object.keys(vocabulary.answerContexts).sort());
  for (const [context, classIds] of Object.entries(vocabulary.answerContexts)) {
    assert.deepEqual(answers.ANSWER_CONTEXT_CLASSES[context], classIds, `${context} aday listesi`);
  }
});

test('her yanıt sınıfının ekranda gösterilecek metni vardır', { skip: !vocabulary }, () => {
  const labels = new Map(vocabulary.labels.map((item) => [item.classId, item.displayText]));
  for (const classIds of Object.values(vocabulary.answerContexts)) {
    for (const classId of classIds) {
      assert.ok(labels.has(classId), `${classId} sözlükte yok`);
      assert.equal(answers.ANSWER_LABELS[classId], labels.get(classId), `${classId} metni`);
    }
  }
});

test('süre yanıtı sayı ve birimden oluşur', () => {
  assert.ok(answers.isDurationNumber('sayi-3'));
  assert.ok(!answers.isDurationNumber('bas'));
  assert.equal(answers.durationAnswer('sayi-3', 'gün'), '3 gün');
  assert.equal(answers.answerText('duration', 'sayi-10'), 'On');
});

test('şiddet yanıtı rakam ve sözlü karşılığı ayırır', () => {
  assert.equal(answers.answerText('intensity', 'sayi-4'), '4 / 5');
  assert.equal(answers.answerText('intensity', 'agir'), 'Ağır');
  assert.equal(answers.answerText('location', 'karin'), 'Karın');
});

test('yanıt adayları ilk sırayı tekrar etmez ve sözlük dışını almaz', () => {
  const prediction = { recognitionContext: 'location', classId: 'karin',
    alternatives: ['karin', 'bel', 'bilinmeyen-sinif', 'sirt'] };
  assert.deepEqual(answers.answerAlternatives(prediction), ['bel', 'sirt']);
  assert.deepEqual(answers.answerAlternatives({ ...prediction, recognitionContext: 'symptom' }), []);
  assert.deepEqual(answers.answerAlternatives(null), []);
});

test('istek doğrulaması yanıt bağlamlarını kabul eder, uydurmayı reddeder', () => {
  const base = {
    preprocessingVersion: 'landmark46-v1',
    landmarks: Array.from({ length: 60 }, () => Array.from({ length: 46 }, () => [0.5, 0.5])),
    mask: Array.from({ length: 60 }, () => Array.from({ length: 46 }, () => 1)),
  };
  for (const context of ['general', 'symptom', 'duration', 'intensity', 'location', 'medication']) {
    assert.ok(isLandmarkPredictionRequest({ ...base, recognitionContext: context }), context);
  }
  assert.ok(!isLandmarkPredictionRequest({ ...base, recognitionContext: 'custom' }));
});
