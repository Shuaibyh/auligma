import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Knex } from 'knex';
import type { Principal } from './enrollments.ts';
import { ApiError } from './identity.ts';
import { centsToDecimal, decimalToCents, gradeSubmittedAttempt } from './grading.ts';

type Guard = (request: FastifyRequest) => Promise<Principal>;
const uuid = { type: 'string', format: 'uuid' } as const;
const params = (extra: Record<string, unknown> = {}) => ({
  type: 'object', additionalProperties: false, required: ['id', ...Object.keys(extra)], properties: { id: uuid, ...extra },
} as const);

async function latestGrade(connection: Knex | Knex.Transaction, attemptId: string) {
  return connection('attempt_grades').where({ attempt_id: attemptId }).orderBy('revision', 'desc').first();
}

async function resultItems(connection: Knex | Knex.Transaction, gradeId: string, includePrivate: boolean) {
  const rows = await connection('attempt_item_grades as ig')
    .join('attempt_items as ai', 'ai.id', 'ig.attempt_item_id')
    .join('assessment_version_items as vi', 'vi.id', 'ai.assessment_version_item_id')
    .join('question_revisions as q', 'q.id', 'vi.question_revision_id')
    .leftJoin('attempt_answers as aa', function joinAnswer() {
      this.on('aa.attempt_id', '=', 'ai.attempt_id').andOn('aa.attempt_item_id', '=', 'ai.id');
    })
    .where({ 'ig.attempt_grade_id': gradeId }).orderBy('ai.position')
    .select('ai.id', 'ai.position', 'ig.points_awarded', 'ig.max_points', 'ig.outcome', 'ig.source',
      'q.content', 'q.correct_option_id', 'aa.answer');
  return rows.map(row => {
    const content = row.content as { statement?: string; alternatives?: { id: string; text: string }[]; explanation?: string };
    return {
      id: row.id, position: row.position, statement: String(content.statement || ''),
      pointsAwarded: Number(row.points_awarded), maxPoints: Number(row.max_points), outcome: row.outcome, source: row.source,
      selectedOptionId: row.answer?.selectedOptionId ?? null,
      ...(includePrivate ? { alternatives: content.alternatives || [], correctOptionId: row.correct_option_id, explanation: String(content.explanation || '') } : {}),
    };
  });
}

export function registerResultRoutes(app: FastifyInstance, db: Knex, principal: Guard, teacher: Guard) {
  async function teacherClassroom(request: FastifyRequest, classroomId: string, connection: Knex | Knex.Transaction = db) {
    const user = await teacher(request);
    const classroom = await connection('classrooms as c').join('subjects as s', 's.id', 'c.subject_id')
      .where({ 'c.id': classroomId, 'c.teacher_id': user.id }).whereNull('c.deleted_at').select('c.id', 's.name').first();
    if (!classroom) throw new ApiError(404, 'not_found', 'Aula no disponible.');
    return { user, classroom };
  }

  async function studentEnrollment(request: FastifyRequest, classroomId: string) {
    const user = await principal(request);
    if (user.role !== 'estudiante') throw new ApiError(403, 'student_required', 'Esta operación requiere una cuenta estudiantil.');
    const enrollment = await db('enrollments').where({ classroom_id: classroomId, student_user_id: user.id, status: 'active' }).first();
    if (!enrollment) throw new ApiError(404, 'not_found', 'Resultado no disponible.');
    return user;
  }

  app.get<{ Params: { id: string } }>('/api/v1/classrooms/:id/results', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } }, schema: { params: params() },
  }, async request => {
    await teacherClassroom(request, request.params.id);
    const assessments = await db('assessments as a')
      .where({ 'a.classroom_id': request.params.id }).whereIn('a.status', ['published', 'closed'])
      .orderBy('a.updated_at', 'desc').select('a.id', 'a.title', 'a.status', 'a.updated_at');
    const attempts = await db('attempts as t')
      .join('assessment_versions as v', 'v.id', 't.assessment_version_id')
      .join('assessments as a', 'a.id', 'v.assessment_id')
      .join('student_profiles as sp', 'sp.user_id', 't.student_user_id')
      .where({ 't.classroom_id': request.params.id }).whereIn('t.status', ['submitted', 'grading', 'graded'])
      .orderBy('t.submitted_at', 'desc')
      .select('t.id', 't.status', 't.submitted_at', 't.student_user_id', 'v.assessment_id', 'v.revision as assessment_revision',
        'sp.first_names', 'sp.last_names');
    const grades = attempts.length ? await db('attempt_grades').whereIn('attempt_id', attempts.map(item => item.id)).orderBy('revision', 'desc') : [];
    const latest = new Map<string, Record<string, unknown>>();
    for (const grade of grades) if (!latest.has(grade.attempt_id)) latest.set(grade.attempt_id, grade);
    return assessments.map(assessment => {
      const related = attempts.filter(attempt => attempt.assessment_id === assessment.id).map(attempt => {
        const grade = latest.get(attempt.id);
        return {
          id: attempt.id, status: attempt.status, submittedAt: attempt.submitted_at, studentId: attempt.student_user_id,
          studentName: `${attempt.first_names} ${attempt.last_names}`.trim(), assessmentRevision: attempt.assessment_revision,
          grade: grade ? { revision: grade.revision, score: Number(grade.score), maxScore: Number(grade.max_score), status: grade.status,
            source: grade.source, reviewRequired: grade.review_required, gradedAt: grade.graded_at } : null,
        };
      });
      return {
        id: assessment.id, title: assessment.title, status: assessment.status, updatedAt: assessment.updated_at, attempts: related,
        counts: { submitted: related.length, pending: related.filter(item => !item.grade).length,
          provisional: related.filter(item => item.grade?.status === 'provisional').length,
          final: related.filter(item => item.grade?.status === 'final').length },
      };
    });
  });

  app.get<{ Params: { id: string; attemptId: string } }>('/api/v1/classrooms/:id/results/attempts/:attemptId', {
    config: { rateLimit: { max: 90, timeWindow: '1 minute' } }, schema: { params: params({ attemptId: uuid }) },
  }, async request => {
    await teacherClassroom(request, request.params.id);
    const attempt = await db('attempts as t').join('student_profiles as sp', 'sp.user_id', 't.student_user_id')
      .join('assessment_versions as v', 'v.id', 't.assessment_version_id').join('assessments as a', 'a.id', 'v.assessment_id')
      .where({ 't.id': request.params.attemptId, 't.classroom_id': request.params.id })
      .select('t.*', 'sp.first_names', 'sp.last_names', 'a.id as assessment_id', 'a.title', 'v.revision as assessment_revision').first();
    if (!attempt) throw new ApiError(404, 'not_found', 'Resultado no disponible.');
    const history = await db('attempt_grades').where({ attempt_id: attempt.id }).orderBy('revision', 'desc');
    const current = history[0];
    return {
      id: attempt.id, status: attempt.status, submittedAt: attempt.submitted_at, studentId: attempt.student_user_id,
      studentName: `${attempt.first_names} ${attempt.last_names}`.trim(), assessmentId: attempt.assessment_id,
      assessmentTitle: attempt.title, assessmentRevision: attempt.assessment_revision,
      grade: current ? { id: current.id, revision: current.revision, score: Number(current.score), maxScore: Number(current.max_score),
        status: current.status, source: current.source, reviewRequired: current.review_required, gradedAt: current.graded_at,
        reason: current.adjustment_reason, items: await resultItems(db, current.id, true) } : null,
      history: history.map(grade => ({ id: grade.id, revision: grade.revision, score: Number(grade.score), maxScore: Number(grade.max_score),
        status: grade.status, source: grade.source, gradedAt: grade.graded_at, reason: grade.adjustment_reason })),
    };
  });

  app.post<{ Params: { id: string; attemptId: string }; Body: { expectedRevision: number; operationId: string; reason: string; adjustments: { attemptItemId: string; points: number }[] } }>(
    '/api/v1/classrooms/:id/results/attempts/:attemptId/review', {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } }, schema: { params: params({ attemptId: uuid }), body: {
        type: 'object', additionalProperties: false, required: ['expectedRevision', 'operationId', 'reason', 'adjustments'], properties: {
          expectedRevision: { type: 'integer', minimum: 1 }, operationId: uuid,
          reason: { type: 'string', minLength: 10, maxLength: 1000, pattern: '\\S' },
          adjustments: { type: 'array', minItems: 1, maxItems: 200, uniqueItems: true, items: { type: 'object', additionalProperties: false,
            required: ['attemptItemId', 'points'], properties: { attemptItemId: uuid, points: { type: 'number', minimum: 0, maximum: 1000, multipleOf: 0.01 } } } },
        },
      } },
    }, async request => {
      const { user } = await teacherClassroom(request, request.params.id);
      return db.transaction(async tx => {
        await teacherClassroom(request, request.params.id, tx);
        const attempt = await tx('attempts').where({ id: request.params.attemptId, classroom_id: request.params.id, status: 'graded' }).forUpdate().first();
        if (!attempt) throw new ApiError(404, 'not_found', 'Resultado no disponible para revisión.');
        const repeated = await tx('attempt_grades').where({ attempt_id: attempt.id, operation_key: request.body.operationId }).first();
        if (repeated) return { id: repeated.id, revision: repeated.revision, score: Number(repeated.score), maxScore: Number(repeated.max_score), status: repeated.status };
        const current = await latestGrade(tx, attempt.id);
        if (!current || Number(current.revision) !== request.body.expectedRevision) throw new ApiError(409, 'version_conflict', 'La calificación cambió. Recarga antes de revisar.');
        const previousItems = await tx('attempt_item_grades').where({ attempt_grade_id: current.id }).orderBy('attempt_item_id');
        const changes = new Map(request.body.adjustments.map(item => [item.attemptItemId, item.points]));
        if (changes.size !== request.body.adjustments.length || [...changes.keys()].some(id => !previousItems.some(item => item.attempt_item_id === id))) {
          throw new ApiError(400, 'invalid_input', 'Revisa los ítems incluidos en el ajuste.');
        }
        if (previousItems.some(item => item.outcome === 'pending_review' && !changes.has(item.attempt_item_id))) {
          throw new ApiError(409, 'pending_review', 'Resuelve todos los ítems pendientes antes de finalizar la calificación.');
        }
        let score = 0; let maximum = 0;
        const nextItems = previousItems.map(item => {
          const max = decimalToCents(item.max_points); const requested = changes.get(item.attempt_item_id);
          const points = requested === undefined ? decimalToCents(item.points_awarded) : decimalToCents(requested.toFixed(2));
          if (points > max) throw new ApiError(400, 'invalid_points', 'Un puntaje ajustado supera el máximo publicado.');
          score += points; maximum += max;
          return { previous: item, points, max, changed: requested !== undefined };
        });
        const gradeId = randomUUID(); const revision = Number(current.revision) + 1;
        await tx('attempt_grades').insert({ id: gradeId, attempt_id: attempt.id, classroom_id: attempt.classroom_id,
          student_user_id: attempt.student_user_id, revision, score: centsToDecimal(score), max_score: centsToDecimal(maximum), status: 'final',
          source: 'teacher', review_required: false, graded_by: user.id, operation_key: request.body.operationId, adjustment_reason: request.body.reason.trim() });
        await tx('attempt_item_grades').insert(nextItems.map(item => ({ id: randomUUID(), attempt_grade_id: gradeId, attempt_id: attempt.id,
          attempt_item_id: item.previous.attempt_item_id, points_awarded: centsToDecimal(item.points), max_points: centsToDecimal(item.max),
          outcome: item.changed ? 'adjusted' : item.previous.outcome, source: item.changed ? 'teacher' : item.previous.source })));
        await tx('audit_events').insert({ id: randomUUID(), actor_id: user.id, action: 'grade.reviewed', resource_id: attempt.id,
          resource_type: 'attempt', details: { gradeId, revision, previousRevision: current.revision, reasonLength: request.body.reason.trim().length } });
        return { id: gradeId, revision, score: Number(centsToDecimal(score)), maxScore: Number(centsToDecimal(maximum)), status: 'final' };
      });
    });

  app.get<{ Params: { id: string; attemptId: string } }>('/api/v1/classrooms/:id/attempts/:attemptId/result', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } }, schema: { params: params({ attemptId: uuid }) },
  }, async request => {
    const user = await studentEnrollment(request, request.params.id);
    let attempt = await db('attempts').where({ id: request.params.attemptId, classroom_id: request.params.id, student_user_id: user.id }).first();
    if (!attempt) throw new ApiError(404, 'not_found', 'Resultado no disponible.');
    if (['submitted', 'grading'].includes(attempt.status)) {
      await gradeSubmittedAttempt(db, attempt.id);
      attempt = await db('attempts').where({ id: attempt.id }).first();
    }
    if (attempt.status === 'expired' || attempt.status === 'invalidated') return { id: attempt.id, state: attempt.status, scoreReleased: false, solutionsReleased: false };
    const grade = await latestGrade(db, attempt.id);
    if (!grade || attempt.status !== 'graded') return { id: attempt.id, state: 'pending', scoreReleased: false, solutionsReleased: false };
    if (grade.status === 'provisional') return { id: attempt.id, state: 'review_required', scoreReleased: false, solutionsReleased: false };
    const snapshot = await db('assessment_versions as v').join('assessments as a', 'a.id', 'v.assessment_id')
      .where({ 'v.id': attempt.assessment_version_id }).select('v.*', 'a.status as assessment_status').first();
    const now = new Date((await db.raw('SELECT clock_timestamp() AS now')).rows[0].now);
    const closed = snapshot.assessment_status === 'closed' || Boolean(snapshot.closes_at && new Date(snapshot.closes_at) <= now);
    const scoreReleased = snapshot.score_release_policy === 'immediate' || closed;
    const solutionsReleased = snapshot.solution_release_policy === 'after_close' && closed;
    return {
      id: attempt.id, state: scoreReleased ? 'available' : 'withheld', scoreReleased, solutionsReleased,
      ...(scoreReleased ? { score: Number(grade.score), maxScore: Number(grade.max_score), gradedAt: grade.graded_at } : {}),
      ...(solutionsReleased ? { items: await resultItems(db, grade.id, true) } : {}),
    };
  });
}
