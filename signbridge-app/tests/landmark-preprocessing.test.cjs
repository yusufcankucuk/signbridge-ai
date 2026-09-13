const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');

const filename = path.resolve(__dirname, '../src/lib/landmarkPreprocessing.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const preprocessingModule = new Module(filename, module);
preprocessingModule._compile(compiled.outputText, filename);
const { assessPoseQuality, preprocessPoseSequence } = preprocessingModule.exports;

function visibleFrames(count = 24) {
  return Array.from({ length: count }, (_, frameIndex) => {
    const keypoints = Array.from({ length: 75 }, () => [0, 0]);
    const confidence = Array.from({ length: 75 }, () => 1);
    keypoints[11] = [-1, 0]; keypoints[12] = [1, 0];
    for (let index = 33; index < 75; index += 1) keypoints[index] = [-0.5 + frameIndex / count, index / 100];
    return { keypoints, confidence };
  });
}

test('tarayıcı ön işlemesi 60×46 sözleşmesini üretir', () => {
  const result = preprocessPoseSequence(visibleFrames());
  assert.equal(result.preprocessingVersion, 'landmark46-v1');
  assert.equal(result.landmarks.length, 60); assert.equal(result.landmarks[0].length, 46);
  assert.equal(result.landmarks[0][0].length, 2); assert.equal(result.mask.length, 60);
  assert.ok(result.landmarks.flat(2).every(Number.isFinite));
});

test('konum ve orantılı ölçek normalizasyondan sonra sonucu değiştirmez', () => {
  const original = visibleFrames();
  const transformed = original.map(frame => ({
    confidence: [...frame.confidence],
    keypoints: frame.keypoints.map(([x, y]) => [x * 3.25 + 7, y * 3.25 - 4]),
  }));
  const first = preprocessPoseSequence(original); const second = preprocessPoseSequence(transformed);
  first.landmarks.flat(2).forEach((value, index) => assert.ok(Math.abs(value - second.landmarks.flat(2)[index]) < 1e-9));
  assert.deepEqual(first.mask, second.mask);
});

test('sol ve sağ el sırası korunur, eksik noktalar maskelenir', () => {
  const frames = visibleFrames();
  frames.forEach(frame => {
    for (let i = 33; i < 54; i += 1) frame.keypoints[i][0] = -3;
    for (let i = 54; i < 75; i += 1) frame.keypoints[i][0] = 5;
    frame.confidence[33] = 0; frame.keypoints[33] = [999, 999];
  });
  const result = preprocessPoseSequence(frames);
  assert.ok(result.landmarks.every((frame, index) => result.mask[index][4] === 0 && frame[4][0] === 0 && frame[4][1] === 0));
  const mean = points => points.reduce((sum, point) => sum + point[0], 0) / points.length;
  assert.ok(mean(result.landmarks[0].slice(4, 25)) < mean(result.landmarks[0].slice(25, 46)));
});

test('kısa, omuzsuz ve geçersiz diziler güvenli biçimde reddedilir', () => {
  assert.equal(assessPoseQuality(visibleFrames(4)).reason, 'too_few_frames');
  const shoulderless = visibleFrames(); shoulderless.forEach(frame => { frame.confidence[11] = 0; frame.confidence[12] = 0; });
  assert.equal(assessPoseQuality(shoulderless).reason, 'low_shoulder_visibility');
  assert.throws(() => preprocessPoseSequence(shoulderless), /omuz/);
  const invalid = visibleFrames(); invalid[0].keypoints[0][0] = Number.NaN;
  assert.equal(assessPoseQuality(invalid).reason, 'invalid_or_non_finite_frame');
});

test('yeniden örnekleme deterministiktir', () => {
  assert.deepEqual(preprocessPoseSequence(visibleFrames(19)), preprocessPoseSequence(visibleFrames(19)));
});
