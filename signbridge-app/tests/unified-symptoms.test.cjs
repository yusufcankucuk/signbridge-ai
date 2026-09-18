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

const { EXPRESSIONS, alternativeExpressions, expressionForCandidate } = load('../src/data/expressions.ts');
const trials = load('../src/lib/cameraTrials.ts');
const { versionMismatches, expectedAiVersions } = load('../lib/ai/versionGate.ts');
const labelsPath = path.resolve(__dirname, '../../ai-training/configs/labels.signbridge30.json');
const unified = fs.existsSync(labelsPath) ? JSON.parse(fs.readFileSync(labelsPath, 'utf8')) : null;

test('birleşik sözlüğün 11 belirti adayı doğru UI avatarı ve cümlesiyle eşleşir', { skip: !unified }, () => {
  assert.equal(unified.symptomClassIds.length, 11);
  for (const classId of unified.symptomClassIds) {
    const label = unified.labels.find(item => item.classId === classId);
    const expression = EXPRESSIONS.find(item => item.id === label.symptomExpressionId);
    assert.ok(expression, `${classId} için avatar yok`);
    assert.equal(expression.sentence, label.symptomDisplayText, classId);
    const prediction = { classId, expressionId: label.symptomExpressionId };
    assert.equal(expressionForCandidate({ text: label.symptomDisplayText, prediction }).id, expression.id);
  }
  // diabetes avatarı yalnız seker sınıfına bağlıdır.
  const diabetesOwners = unified.labels.filter(item => item.symptomExpressionId === 'diabetes').map(item => item.classId);
  assert.deepEqual(diabetesOwners, ['seker']);
  // Deneme planı sözlükle aynı sırayı ve eşleşmeyi kullanır.
  assert.deepEqual(trials.SYMPTOM_TRIAL_TARGETS.map(item => item.classId), unified.symptomClassIds);
  for (const target of trials.SYMPTOM_TRIAL_TARGETS) {
    const label = unified.labels.find(item => item.classId === target.classId);
    assert.equal(target.expressionId, label.symptomExpressionId);
  }
});

test('15 avatarlık sözlük tüm UI belirtilerini kapsar ve deneme hedefleriyle aynı sıradadır', () => {
  const file = path.resolve(__dirname, '../../ai-training/configs/labels.signbridge34.json');
  if (!fs.existsSync(file)) return;
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(config.labels.length, 34);
  assert.deepEqual(config.labels.slice(0, 30), unified.labels);
  const avatars = config.symptomClassIds.map(id => config.labels.find(item => item.classId === id).symptomExpressionId).sort();
  assert.deepEqual(avatars, EXPRESSIONS.map(item => item.id).sort());
  for (const id of config.symptomClassIds) {
    const label = config.labels.find(item => item.classId === id);
    assert.equal(EXPRESSIONS.find(item => item.id === label.symptomExpressionId).sentence, label.symptomDisplayText, id);
  }
  assert.deepEqual(trials.trialTargetsFor('signbridge34-v1').map(item => item.classId), config.symptomClassIds);
  assert.equal(trials.trialTargetsFor('signbridge30-v1').length, 11);
  assert.equal(trials.buildTrialPlan('yunus', 5, trials.trialTargetsFor('signbridge34-v1')).length, 75);
});

test('şeker avatarı başka sınıflarda veya genel bağlamda gösterilmez', () => {
  assert.equal(expressionForCandidate({ text: 'Şeker hastasıyım', prediction: { classId: 'seker', expressionId: 'diabetes' } }).id, 'diabetes');
  // Uyumsuz kimlik/metin çiftinde avatar gösterilmez.
  assert.equal(expressionForCandidate({ text: 'Ateşim var', prediction: { classId: 'fever', expressionId: 'diabetes' } }), undefined);
  // Genel bağlamda seker sınıfı "Şeker" olarak kalır; avatar yok.
  assert.equal(expressionForCandidate({ text: 'Şeker', prediction: { classId: 'seker', expressionId: 'seker' } }), undefined);
  // Elle seçim eskisi gibi cümleyle eşleşir.
  assert.equal(expressionForCandidate({ text: 'Kusuyorum' }).id, 'vomiting');
});

test('acil belirtiler işaretlidir', () => {
  const urgent = EXPRESSIONS.filter(item => item.urgent).map(item => item.id).sort();
  assert.deepEqual(urgent, ['bleeding', 'burn', 'heart-attack']);
});

test('55 denemelik plan dönüşümlü sıralanır ve CSV güvenli yazılır', () => {
  const plan = trials.buildTrialPlan(' Yunus ', 5);
  assert.equal(plan.length, 55);
  assert.equal(new Set(plan.map(item => item.trialId)).size, 55);
  assert.equal(plan[0].participant, 'yunus');
  const repeatsPerClass = {};
  for (const item of plan) repeatsPerClass[item.target.expressionId] = (repeatsPerClass[item.target.expressionId] ?? 0) + 1;
  assert.deepEqual(Object.values(repeatsPerClass), Array(11).fill(5));
  for (let index = 1; index < plan.length; index += 1) {
    assert.notEqual(plan[index].target.expressionId, plan[index - 1].target.expressionId, 'aynı işaret art arda gelmemeli');
  }
  const quality = { status: 'approved', reason: 'ok', handFrameRatio: 0.9, shoulderFrameRatio: 1, motionScore: 1.2 };
  const prediction = {
    classId: 'seker', expressionId: 'diabetes', displayText: 'Şeker hastasıyım', confidence: 0.41,
    alternatives: ['seker', 'pain', 'burn'], isLowConfidence: true, forcedCandidate: true, rejectionReason: 'low_score',
    modelVersion: 'signbridge-unified30-bigru-v0.2.0', vocabularyVersion: 'signbridge30-v1', decisionPolicyVersion: 'p',
  };
  const row = trials.trialRow({ trial: plan[0], attempt: 1, recordedAt: new Date('2026-09-16T10:00:00Z'), frames: 30, durationMs: 3000, quality, prediction, shownAvatar: 'diabetes', latencyMs: 120.4 });
  assert.equal(row.outcome, 'forced_candidate');
  assert.equal(row.correct, true);
  const rejected = trials.trialRow({ trial: plan[1], attempt: 1, recordedAt: new Date(), frames: 5, durationMs: 3000, quality: { ...quality, status: 'needs_review', reason: 'low_hand_visibility' } });
  assert.equal(rejected.outcome, 'quality_rejected');
  assert.equal(rejected.predicted_class_id, null);
  const csv = trials.toCsv([{ ...row, user_confirmed: true, display_text: '=HYPERLINK("x")' }, rejected]);
  assert.ok(csv.startsWith('﻿trial_id,'));
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`));
  const summary = trials.summarizeTrials([{ ...row, user_confirmed: true }, rejected], 55);
  assert.deepEqual([summary.completed, summary.correct, summary.qualityRejected, summary.classesWithCorrect], [1, 1, 1, 1]);
});

test('web, beklenen sürümle uyuşmayan servisi reddeder', () => {
  const expected = expectedAiVersions({ AI_EXPECTED_MODEL_VERSION: 'signbridge-unified30-bigru-v0.2.0', AI_EXPECTED_VOCABULARY_VERSION: 'signbridge30-v1' });
  assert.deepEqual(versionMismatches({ modelVersion: 'signbridge-unified30-bigru-v0.2.0', vocabularyVersion: 'signbridge30-v1', preprocessingVersion: 'landmark46-v1' }, expected), []);
  assert.deepEqual(versionMismatches({ modelVersion: 'autsl20-bigru-v0.1.0' }, expected), ['modelVersion', 'vocabularyVersion']);
  assert.deepEqual(versionMismatches({ modelVersion: 'autsl20-bigru-v0.1.0' }, expectedAiVersions({})), []);
});

test('kamera titreşimi omuz normalizasyonuyla hareket sayılmaz', () => {
  const { assessPoseQuality } = load('../src/lib/landmarkPreprocessing.ts');
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  const frames = Array.from({ length: 30 }, () => {
    const shakeX = random() * 0.04; const shakeY = random() * 0.04; // görüntünün %2'sine kadar sarsıntı
    const keypoints = Array.from({ length: 75 }, () => [0, 0]);
    const confidence = Array.from({ length: 75 }, () => 0);
    const put = (index, x, y) => { keypoints[index] = [x + shakeX, y + shakeY]; confidence[index] = 1; };
    put(11, 0.4, 0.5); put(12, 0.6, 0.5); put(13, 0.35, 0.65); put(14, 0.65, 0.65);
    for (let index = 54; index < 75; index += 1) put(index, 0.55 + index * 0.002, 0.6);
    return { keypoints, confidence };
  });
  const quality = assessPoseQuality(frames);
  assert.equal(quality.status, 'needs_review');
  assert.equal(quality.reason, 'insufficient_motion');
  assert.ok(quality.motionScore < 1e-6);
});

const labels34Path = path.resolve(__dirname, '../../ai-training/configs/labels.signbridge34.json');
const unified34 = fs.existsSync(labels34Path) ? JSON.parse(fs.readFileSync(labels34Path, 'utf8')) : null;

test('onay ekranındaki diğer olası avatarlar model sırasını izler ve 15 belirtinin hepsine eşlenir', { skip: !unified34 }, () => {
  // Her belirti sınıfı bir alternatif olarak gelebilir; hepsinin avatarı ve cümlesi sözlükle aynı olmalı.
  for (const classId of unified34.symptomClassIds) {
    const label = unified34.labels.find(item => item.classId === classId);
    const [match] = alternativeExpressions({ recognitionContext: 'symptom', expressionId: 'x', alternatives: [classId] });
    assert.ok(match, `${classId} alternatif avatarı yok`);
    assert.equal(match.id, label.symptomExpressionId);
    assert.equal(match.sentence, label.symptomDisplayText);
  }
  const prediction = { recognitionContext: 'symptom', expressionId: 'headache', alternatives: ['headache', 'seker', 'dizziness'] };
  assert.deepEqual(alternativeExpressions(prediction).map(item => item.id), ['diabetes', 'dizziness']);
  assert.deepEqual(alternativeExpressions(prediction, 1).map(item => item.id), ['diabetes']);
  // Genel bağlamda (AUTSL kelimeleri) ve bilinmeyen sınıflarda avatar önerilmez.
  assert.deepEqual(alternativeExpressions({ ...prediction, recognitionContext: 'general' }), []);
  assert.deepEqual(alternativeExpressions({ recognitionContext: 'symptom', expressionId: null, alternatives: ['doktor', 'fever', 'fever'] }).map(item => item.id), ['fever']);
  assert.deepEqual(alternativeExpressions(null), []);
});
