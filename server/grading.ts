import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { ApiError } from './identity.ts';
import { verifyMath, type MathInput } from './math-verifier.ts';

type Verification = (input: MathInput) => Promise<Record<string, unknown>>;
type Alternative = { id: string; text: string };
type QuestionContent = {
  statement?: string;
  alternatives?: Alternative[];
  operation?: string;
  expression?: string;
};

export function decimalToCents(value: unknown) {
  const normalized = String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new ApiError(409, 'invalid_points', 'El puntaje publicado no es válido.');
  const [whole, fraction = ''] = normalized.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export function centsToDecimal(value: number) {
  return (value / 100).toFixed(2);
}

function verificationInput(content: QuestionContent): MathInput | null {
  if ((content.operation !== 'derivative' && content.operation !== 'equivalence') || !content.expression || !Array.isArray(content.alternatives)) return null;
  return { operation: content.operation, expression: content.expression, alternatives: content.alternatives.map(item => item.text) };
}

async function mathematicallyConclusive(content: QuestionContent, correctOptionId: string, verifier: Verification) {
  const input = verificationInput(content);
  if (!input) return true;
  const result = await verifier(input);
  if (result.status !== 'VERIFICADO' || result.singleChoiceValid !== true || !Array.isArray(result.correctIndices) || result.correctIndices.length !== 1) return false;
  const expected = content.alternatives?.[Number(result.correctIndices[0])]?.id;
  return expected === correctOptionId;
}

export async function gradeSubmittedAttempt(db: Knex, attemptId: string, verifier: Verification = verifyMath) {
  return db.transaction(async tx => {
    const attempt = await tx('attempts').where({ id: attemptId }).forUpdate().first();
    if (!attempt) throw new ApiError(404, 'not_found', 'Intento no disponible.');
    if (attempt.status === 'graded') {
      return tx('attempt_grades').where({ attempt_id: attempt.id }).orderBy('revision', 'desc').first();
    }
    if (!['submitted', 'grading'].includes(attempt.status)) throw new ApiError(409, 'attempt_not_submitted', 'Solo se corrigen intentos entregados.');

    if (attempt.status === 'submitted') {
      const [grading] = await tx('attempts').where({ id: attempt.id }).update({
        status: 'grading', version: Number(attempt.version) + 1, last_activity_at: tx.fn.now(),
      }).returning('*');
      Object.assign(attempt, grading);
    }

    const existing = await tx('attempt_grades').where({ attempt_id: attempt.id }).orderBy('revision', 'desc').first();
    if (existing) {
      if (attempt.status === 'grading') await tx('attempts').where({ id: attempt.id }).update({ status: 'graded', version: Number(attempt.version) + 1, last_activity_at: tx.fn.now() });
      return existing;
    }

    const rows = await tx('attempt_items as ai')
      .join('assessment_version_items as vi', 'vi.id', 'ai.assessment_version_item_id')
      .join('question_revisions as q', 'q.id', 'vi.question_revision_id')
      .leftJoin('attempt_answers as aa', function joinAnswer() {
        this.on('aa.attempt_id', '=', 'ai.attempt_id').andOn('aa.attempt_item_id', '=', 'ai.id');
      })
      .where({ 'ai.attempt_id': attempt.id }).orderBy('ai.position')
      .select('ai.id as attempt_item_id', 'vi.points', 'q.content', 'q.correct_option_id', 'aa.answer');
    if (!rows.length) throw new ApiError(409, 'invalid_attempt', 'El intento no contiene preguntas calificables.');

    let score = 0; let maximum = 0; let reviewRequired = false;
    const items: { attemptItemId: string; points: number; maximum: number; outcome: string }[] = [];
    for (const row of rows) {
      const maxPoints = decimalToCents(row.points); maximum += maxPoints;
      const content = row.content as QuestionContent;
      const alternatives = Array.isArray(content.alternatives) ? content.alternatives : [];
      const selected = typeof row.answer?.selectedOptionId === 'string' ? row.answer.selectedOptionId : null;
      const belongs = selected === null || alternatives.some(option => option.id === selected);
      if (!belongs) throw new ApiError(409, 'invalid_attempt_answer', 'Una respuesta no corresponde al snapshot del intento.');
      if (!await mathematicallyConclusive(content, row.correct_option_id, verifier)) {
        reviewRequired = true;
        items.push({ attemptItemId: row.attempt_item_id, points: 0, maximum: maxPoints, outcome: 'pending_review' });
      } else if (!selected) {
        items.push({ attemptItemId: row.attempt_item_id, points: 0, maximum: maxPoints, outcome: 'unanswered' });
      } else if (selected === row.correct_option_id) {
        score += maxPoints; items.push({ attemptItemId: row.attempt_item_id, points: maxPoints, maximum: maxPoints, outcome: 'correct' });
      } else {
        items.push({ attemptItemId: row.attempt_item_id, points: 0, maximum: maxPoints, outcome: 'incorrect' });
      }
    }

    const gradeId = randomUUID();
    const grade = {
      id: gradeId, attempt_id: attempt.id, classroom_id: attempt.classroom_id, student_user_id: attempt.student_user_id,
      revision: 1, score: centsToDecimal(score), max_score: centsToDecimal(maximum), status: reviewRequired ? 'provisional' : 'final',
      source: 'system', review_required: reviewRequired, graded_by: null, operation_key: randomUUID(), adjustment_reason: null,
    };
    await tx('attempt_grades').insert(grade);
    await tx('attempt_item_grades').insert(items.map(item => ({
      id: randomUUID(), attempt_grade_id: gradeId, attempt_id: attempt.id, attempt_item_id: item.attemptItemId,
      points_awarded: centsToDecimal(item.points), max_points: centsToDecimal(item.maximum), outcome: item.outcome, source: 'system',
    })));
    await tx('attempts').where({ id: attempt.id }).update({ status: 'graded', version: Number(attempt.version) + 1, last_activity_at: tx.fn.now() });
    await tx('audit_events').insert({
      id: randomUUID(), actor_id: null, action: 'attempt.graded', resource_id: attempt.id, resource_type: 'attempt',
      details: { gradeId, revision: 1, status: grade.status, reviewRequired, score: grade.score, maxScore: grade.max_score },
    });
    return tx('attempt_grades').where({ id: gradeId }).first();
  });
}
