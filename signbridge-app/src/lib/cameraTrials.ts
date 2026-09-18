/**
 * Birleşik 30 sınıflı modelin belirti bağlamındaki kamera deneme protokolü.
 * 11 belirti × 5 tekrar = 55 deneme (`signbridge34-v1` sözlüğünde 15 belirti × 5 = 75). Kayıtlar eğitim veya eşik ayarı için kullanılmaz;
 * yalnız CSV olarak indirilir ve `ai-training/src/summarize_symptom_trials.py` ile özetlenir.
 */

export interface SymptomTrialTarget {
  expressionId: string;
  classId: string;
  referenceVideo?: string;
}

/** `labels.signbridge30.json → symptomClassIds` ile aynı sıra (testle korunur). */
export const SYMPTOM_TRIAL_TARGETS: SymptomTrialTarget[] = [
  { expressionId: 'diabetes', classId: 'seker', referenceVideo: 'seker-hastaligi.mp4' },
  { expressionId: 'dizziness', classId: 'dizziness', referenceVideo: 'bas-donmesi.mp4' },
  { expressionId: 'fever', classId: 'fever', referenceVideo: 'ates.mp4' },
  { expressionId: 'pain', classId: 'pain', referenceVideo: 'agri.mp4' },
  { expressionId: 'asthma', classId: 'asthma', referenceVideo: 'astim.mp4' },
  { expressionId: 'rash', classId: 'rash', referenceVideo: 'dokuntu-alerji-icin.mp4' },
  { expressionId: 'palpitations', classId: 'palpitations', referenceVideo: 'kalp-carpintisi.mp4' },
  { expressionId: 'heart-attack', classId: 'heart-attack', referenceVideo: 'kalp-krizi.mp4' },
  { expressionId: 'bleeding', classId: 'bleeding', referenceVideo: 'kanama.mp4' },
  { expressionId: 'vomiting', classId: 'vomiting', referenceVideo: 'kusma.mp4' },
  { expressionId: 'burn', classId: 'burn', referenceVideo: 'yanik.mp4' },
];

/** `labels.signbridge34.json → symptomClassIds` sırasıyla 15 hedef. */
export const SYMPTOM_TRIAL_TARGETS_34: SymptomTrialTarget[] = [
  ...SYMPTOM_TRIAL_TARGETS,
  { expressionId: 'headache', classId: 'headache' },
  { expressionId: 'stomachache', classId: 'stomachache' },
  { expressionId: 'nausea', classId: 'nausea' },
  { expressionId: 'shortness-of-breath', classId: 'shortness-of-breath' },
];

/** Servisin çalıştırdığı sözlüğe göre deneme hedefleri. */
export function trialTargetsFor(vocabularyVersion?: string | null): SymptomTrialTarget[] {
  return vocabularyVersion === 'signbridge34-v1' ? SYMPTOM_TRIAL_TARGETS_34 : SYMPTOM_TRIAL_TARGETS;
}

export interface PlannedTrial {
  trialId: string;
  participant: string;
  repeat: number;
  target: SymptomTrialTarget;
}

export const TRIAL_COLUMNS = [
  'trial_id', 'participant', 'expected_expression_id', 'expected_class_id', 'repeat', 'attempt', 'recorded_at',
  'outcome', 'quality_status', 'quality_reason', 'hand_frame_ratio', 'shoulder_frame_ratio', 'motion_score',
  'frames', 'duration_ms', 'predicted_class_id', 'expression_id', 'display_text', 'shown_avatar', 'confidence',
  'top1', 'top2', 'top3', 'is_low_confidence', 'forced_candidate', 'rejection_reason', 'latency_ms',
  'model_version', 'vocabulary_version', 'decision_policy_version', 'correct', 'user_confirmed',
] as const;

export type TrialRow = Record<(typeof TRIAL_COLUMNS)[number], string | number | boolean | null>;

export function normalizeParticipant(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replace(/[^a-z0-9_-]/g, '').slice(0, 40);
}

/** Tekrarlar sınıflar arasında dönüşümlü sıralanır; aynı işaret art arda yapılmaz. */
export function buildTrialPlan(participant: string, repeats = 5, targets: SymptomTrialTarget[] = SYMPTOM_TRIAL_TARGETS): PlannedTrial[] {
  const code = normalizeParticipant(participant);
  if (!code) throw new Error('Katılımcı kodu gerekli.');
  const plan: PlannedTrial[] = [];
  for (let repeat = 1; repeat <= repeats; repeat += 1) {
    const shift = ((repeat - 1) * 5) % targets.length;
    const order = [...targets.slice(shift), ...targets.slice(0, shift)];
    for (const target of order) {
      plan.push({ trialId: `${code}-${target.expressionId}-${repeat}`, participant: code, repeat, target });
    }
  }
  return plan;
}

interface QualityLike {
  status: string;
  reason: string;
  handFrameRatio: number;
  shoulderFrameRatio: number;
  motionScore: number;
}

interface PredictionLike {
  classId: string | null;
  expressionId?: string | null;
  displayText: string;
  confidence: number | null;
  alternatives: string[];
  isLowConfidence: boolean;
  forcedCandidate?: boolean;
  rejectionReason: string | null;
  modelVersion: string | null;
  vocabularyVersion: string;
  decisionPolicyVersion: string;
}

const round = (value: number, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits;

export function trialRow(options: {
  trial: PlannedTrial;
  attempt: number;
  recordedAt: Date;
  frames: number;
  durationMs: number;
  quality: QualityLike;
  prediction?: PredictionLike | null;
  shownAvatar?: string | null;
  latencyMs?: number | null;
  error?: string | null;
}): TrialRow {
  const { trial, attempt, recordedAt, frames, durationMs, quality, prediction, shownAvatar, latencyMs, error } = options;
  const hasCandidate = Boolean(prediction?.classId);
  const outcome = quality.status !== 'approved'
    ? 'quality_rejected'
    : error ? 'service_error'
      : !prediction ? 'service_error'
        : hasCandidate ? (prediction.isLowConfidence ? 'forced_candidate' : 'accepted') : 'no_candidate';
  return {
    trial_id: trial.trialId,
    participant: trial.participant,
    expected_expression_id: trial.target.expressionId,
    expected_class_id: trial.target.classId,
    repeat: trial.repeat,
    attempt,
    recorded_at: recordedAt.toISOString(),
    outcome,
    quality_status: quality.status,
    quality_reason: quality.reason,
    hand_frame_ratio: round(quality.handFrameRatio),
    shoulder_frame_ratio: round(quality.shoulderFrameRatio),
    motion_score: round(quality.motionScore),
    frames,
    duration_ms: Math.round(durationMs),
    predicted_class_id: prediction?.classId ?? null,
    expression_id: prediction?.expressionId ?? null,
    display_text: prediction?.displayText ?? (error || null),
    shown_avatar: shownAvatar ?? null,
    confidence: prediction?.confidence ?? null,
    top1: prediction?.alternatives[0] ?? null,
    top2: prediction?.alternatives[1] ?? null,
    top3: prediction?.alternatives[2] ?? null,
    is_low_confidence: prediction ? prediction.isLowConfidence : null,
    forced_candidate: prediction ? prediction.forcedCandidate === true : null,
    rejection_reason: prediction?.rejectionReason ?? null,
    latency_ms: latencyMs == null ? null : Math.round(latencyMs),
    model_version: prediction?.modelVersion ?? null,
    vocabulary_version: prediction?.vocabularyVersion ?? null,
    decision_policy_version: prediction?.decisionPolicyVersion ?? null,
    correct: hasCandidate ? prediction?.expressionId === trial.target.expressionId : false,
    user_confirmed: null,
  };
}

function csvCell(value: TrialRow[keyof TrialRow]): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  // Tablo programlarında formül olarak çalışmasın.
  const safe = /^[=+\-@]/.test(text) && !/^-?\d/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: TrialRow[]): string {
  const lines = [TRIAL_COLUMNS.join(',')];
  for (const row of rows) lines.push(TRIAL_COLUMNS.map(column => csvCell(row[column])).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

export interface TrialSummary {
  completed: number;
  planned: number;
  correct: number;
  qualityRejected: number;
  perClass: Record<string, { trials: number; correct: number }>;
  classesWithCorrect: number;
}

/** Tamamlanan (kalite kapısını geçmiş ve kullanıcı cevabı verilmiş) denemeleri özetler. */
export function summarizeTrials(rows: TrialRow[], planned: number, targets: SymptomTrialTarget[] = SYMPTOM_TRIAL_TARGETS): TrialSummary {
  const perClass: TrialSummary['perClass'] = {};
  for (const target of targets) perClass[target.expressionId] = { trials: 0, correct: 0 };
  let completed = 0; let correct = 0; let qualityRejected = 0;
  for (const row of rows) {
    if (row.outcome === 'quality_rejected') { qualityRejected += 1; continue; }
    if (row.user_confirmed === null) continue;
    completed += 1;
    const item = perClass[String(row.expected_expression_id)];
    if (!item) continue;
    item.trials += 1;
    if (row.correct === true) { item.correct += 1; correct += 1; }
  }
  return {
    completed, planned, correct, qualityRejected, perClass,
    classesWithCorrect: Object.values(perClass).filter(item => item.correct > 0).length,
  };
}
