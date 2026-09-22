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
const { assessPoseQuality, bestRecordingWindow, prepareRecordedFrames, preprocessPoseSequence } = preprocessingModule.exports;

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

test('statik el ve yalnız kamera titreşimi yetersiz hareket olarak reddedilir', () => {
  const staticFrames = visibleFrames();
  staticFrames.forEach(frame => {
    for (let index = 33; index < 75; index += 1) frame.keypoints[index][0] = -0.25;
  });
  const staticQuality = assessPoseQuality(staticFrames);
  assert.match(staticQuality.reason, /insufficient_motion/);
  assert.equal(staticQuality.motionScore, 0);

  const cameraJitter = staticFrames.map((frame, index) => ({
    confidence: [...frame.confidence],
    keypoints: frame.keypoints.map(([x, y]) => [x + (index % 2 ? 0.002 : -0.002), y]),
  }));
  assert.match(assessPoseQuality(cameraJitter).reason, /insufficient_motion/);
});

test('geçerli tek el ve iki el hareketi kalite kapısını geçer', () => {
  assert.equal(assessPoseQuality(visibleFrames()).status, 'approved');
  const oneHand = visibleFrames();
  oneHand.forEach(frame => { for (let index = 54; index < 75; index += 1) frame.confidence[index] = 0; });
  assert.equal(assessPoseQuality(oneHand).status, 'approved');
});

test('yeniden örnekleme deterministiktir', () => {
  assert.deepEqual(preprocessPoseSequence(visibleFrames(19)), preprocessPoseSequence(visibleFrames(19)));
});

function recordingWithIdleEdges() {
  // 30 kare: 0–5 ve 26–29 arası eller kadraj dışında, sağ elde 12–14 arası kısa kayıp.
  return Array.from({ length: 30 }, (_, frameIndex) => {
    const keypoints = Array.from({ length: 75 }, () => [0, 0]);
    const confidence = Array.from({ length: 75 }, () => 0);
    keypoints[11] = [0.4, 0.4]; keypoints[12] = [0.6, 0.4]; confidence[11] = 1; confidence[12] = 1;
    const handVisible = frameIndex >= 6 && frameIndex <= 25 && !(frameIndex >= 12 && frameIndex <= 14);
    for (let index = 54; index < 75; index += 1) {
      keypoints[index] = handVisible ? [frameIndex / 30, 0.5 + index / 1000] : [0, 0];
      confidence[index] = handVisible ? 0.9 : 0;
    }
    return { keypoints, confidence };
  });
}

test('kayıt başındaki/sonundaki boş kareler kırpılır ve kısa el kaybı doldurulur', () => {
  const frames = recordingWithIdleEdges();
  const prepared = prepareRecordedFrames(frames);
  assert.equal(prepared.length, 22); // 5..26 (0,1 sn pay)
  const filled = prepared[13 - 5];
  assert.ok(Math.abs(filled.keypoints[54][0] - 13 / 30) < 1e-9);
  assert.equal(filled.confidence[54], 0.9);
  assert.equal(frames[13].confidence[54], 0, 'girdi değiştirilmemeli');
  const raw = assessPoseQuality(frames, 0.1, 8, 0.6, 0.5, 0);
  const trimmed = assessPoseQuality(prepared, 0.1, 8, 0.6, 0.5, 0);
  assert.equal(raw.status, 'approved');
  assert.ok(trimmed.handFrameRatio > raw.handFrameRatio);
});

test('uzun bekleme içeren kayıt kırpma sonrası el görünürlüğü kapısından geçer', () => {
  const sign = recordingWithIdleEdges().slice(6, 26);
  const idle = recordingWithIdleEdges()[0];
  const frames = [...Array(25).fill(idle), ...sign, ...Array(15).fill(idle)];
  assert.equal(assessPoseQuality(frames, 0.1, 8, 0.6, 0.5, 0).reason, 'low_hand_visibility');
  assert.equal(assessPoseQuality(prepareRecordedFrames(frames), 0.1, 8, 0.6, 0.5, 0).status, 'approved');
});

test('eli hiç görünmeyen veya çok kısa kayıt kırpılmaz', () => {
  const idle = recordingWithIdleEdges()[0];
  assert.equal(prepareRecordedFrames(Array(12).fill(idle)).length, 12);
  const short = recordingWithIdleEdges().slice(0, 9);
  short[7] = recordingWithIdleEdges()[7];
  assert.equal(prepareRecordedFrames(short).length, 9);
});

test('bestRecordingWindow kaydın kesitlerini deneyerek kalite kapısını geçer', () => {
  // Ortasında ellerin uzun süre kaybolduğu kayıt: bütünüyle kapıyı geçmez, son kesiti geçer.
  const frame = (handsVisible, shift) => {
    const keypoints = Array.from({ length: 75 }, () => [0.5, 0.5]);
    const confidence = Array.from({ length: 75 }, () => 0);
    keypoints[11] = [0.4, 0.4]; keypoints[12] = [0.6, 0.4];
    confidence[11] = 1; confidence[12] = 1;
    if (handsVisible) {
      for (let point = 54; point < 75; point += 1) {
        keypoints[point] = [0.3 + shift * 0.02, 0.5 + (point - 54) / 500];
        confidence[point] = 0.9;
      }
    }
    return { keypoints, confidence };
  };
  const frames = [];
  for (let i = 0; i < 14; i += 1) frames.push(frame(false, i));   // uzun boş baş
  for (let i = 0; i < 12; i += 1) frames.push(frame(true, i));    // net işaret
  const whole = assessPoseQuality(prepareRecordedFrames(frames));
  const best = bestRecordingWindow(frames);
  assert.equal(best.quality.status, 'approved');
  assert.ok(best.frames.length <= frames.length);
  assert.ok(best.quality.handFrameRatio >= whole.handFrameRatio);
});

test('bestRecordingWindow zaten geçen kaydı değiştirmez', () => {
  const clean = Array.from({ length: 20 }, (unused, index) => {
    const keypoints = Array.from({ length: 75 }, () => [0.5, 0.5]);
    const confidence = Array.from({ length: 75 }, () => 0);
    keypoints[11] = [0.4, 0.4]; keypoints[12] = [0.6, 0.4];
    confidence[11] = 1; confidence[12] = 1;
    for (let point = 54; point < 75; point += 1) {
      keypoints[point] = [0.3 + index * 0.02, 0.5 + (point - 54) / 500];
      confidence[point] = 0.9;
    }
    return { keypoints, confidence };
  });
  const direct = prepareRecordedFrames(clean);
  const best = bestRecordingWindow(clean);
  assert.equal(best.quality.status, 'approved');
  assert.equal(best.frames.length, direct.length);
});
