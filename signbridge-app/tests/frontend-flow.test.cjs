const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');
const filename = path.resolve(__dirname, '../src/lib/consultationFlow.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
const flowModule = new Module(filename, module);
flowModule._compile(compiled.outputText, filename);
const { emptyFlow, emptyPlan, recordAnswer, planErrors } = flowModule.exports;
const validPlan = () => ({ ...emptyPlan(), diagnosis: 'Deneme değerlendirmesi', explanation: 'Deneme açıklaması', noMedication: true, advice: 'Deneme önerisi', noFollowup: true });

test('Yeni görüşmede hasta yanıtı ve tedavi önceden doldurulmaz', () => {
  const state = emptyFlow();
  assert.equal(state.expression, ''); assert.deepEqual(state.turns, []);
  assert.equal(state.pending, null); assert.equal(state.plan.diagnosis, '');
  assert.deepEqual(state.plan.medications, []); assert.equal(state.plan.approved, false);
});
test('Bekleyen soru yoksa yanıt eklenmez', () => {
  const state = emptyFlow(); assert.equal(recordAnswer(state, 'Evet', 'manual'), state);
});
test('Boş yanıt soruyu tamamlamaz', () => {
  const state = { ...emptyFlow(), pending: { id: '1', kind: 'custom', text: 'Soru' } };
  assert.equal(recordAnswer(state, '  ', 'manual'), state);
});
test('Bölge ve ilaç yanıtları birlikte ve doğru soruya bağlı saklanır', () => {
  const state = { ...emptyFlow(), pending: { id: '1', kind: 'location', text: 'Nerede?' } };
  const first = recordAnswer(state, 'Başımda', 'manual');
  const second = recordAnswer({ ...first, pending: { id: '2', kind: 'medication', text: 'İlaç?' } }, 'Deneme ilacı', 'demo');
  assert.deepEqual(second.turns.map(t => [t.kind, t.answer, t.source]), [['location', 'Başımda', 'manual'], ['medication', 'Deneme ilacı', 'demo']]);
  assert.equal(second.pending, null); assert.equal(state.turns.length, 0);
});
test('Aynı yanıt tamamlanmış soruya ikinci kez eklenmez', () => {
  const answered = recordAnswer({ ...emptyFlow(), pending: { id: '1', kind: 'duration', text: 'Süre?' } }, 'Bugün', 'manual');
  assert.equal(recordAnswer(answered, 'Bugün', 'manual').turns.length, 1);
});
test('Yeni hasta bilgisi önceki tedavi onayını geçersiz kılar', () => {
  const state = { ...emptyFlow(), plan: { ...validPlan(), approved: true }, understood: true, pending: { id: '1', kind: 'custom', text: 'Ek soru' } };
  const next = recordAnswer(state, 'Yeni bilgi', 'manual');
  assert.equal(next.plan.approved, false); assert.equal(next.understood, false);
});
test('Boş tedavi ve eksik ilaçlar onaylanamaz', () => {
  assert.ok(planErrors(emptyPlan()).length > 0);
  const plan = { ...validPlan(), noMedication: false, medications: [{ id: '1', name: 'Deneme', dose: '', frequency: '', meal: '', duration: '' }] };
  assert.ok(planErrors(plan).some(e => e.includes('Her ilacın')));
});
test('İlaçsız tedavide açıklama zorunludur', () => {
  assert.deepEqual(planErrors(validPlan()), []);
  assert.ok(planErrors({ ...validPlan(), advice: '' }).length > 0);
});
test('Çoklu ilaçta tüm kayıtlar doğrulanır', () => {
  const medication = { id: '1', name: 'Deneme', dose: 'Deneme doz', frequency: 'Deneme sıklık', meal: 'Deneme kullanım', duration: 'Deneme süre' };
  const plan = { ...validPlan(), noMedication: false, medications: [medication, { ...medication, id: '2' }] };
  assert.deepEqual(planErrors(plan), []);
  assert.ok(planErrors({ ...plan, medications: [medication, { ...medication, id: '2', dose: ' ' }] }).length > 0);
});
test('Kontrol tarihi veya planlanmadı seçimi gereklidir', () => {
  assert.ok(planErrors({ ...validPlan(), noFollowup: false }).length > 0);
  assert.deepEqual(planErrors({ ...validPlan(), noFollowup: false, followupDate: '2026-10-15' }, '2026-09-15'), []);
  assert.ok(planErrors({ ...validPlan(), noFollowup: false, followupDate: '2020-01-01' }, '2026-09-15').some(error => error.includes('bugünden önce')));
});
