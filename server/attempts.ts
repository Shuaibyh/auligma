import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Knex } from 'knex';
import type { Principal } from './enrollments.ts';
import { ApiError } from './identity.ts';
import { gradeSubmittedAttempt } from './grading.ts';

type PrincipalGuard = (request: FastifyRequest) => Promise<Principal>;
type RevisionContent = { statement?: string; alternatives?: { id: string; text: string }[]; difficulty?: string; topic?: string };

const uuid = { type: 'string', format: 'uuid' } as const;
const params = (extra: Record<string, unknown> = {}) => ({
  type: 'object', additionalProperties: false, required: ['id', ...Object.keys(extra)], properties: { id: uuid, ...extra },
} as const);
const operationBody = { type: 'object', additionalProperties: false, required: ['operationId'], properties: { operationId: uuid } } as const;

function effectiveStatus(attempt: Record<string, unknown>, now: Date) {
  if (attempt.status === 'in_progress' && attempt.expires_at && new Date(String(attempt.expires_at)) <= now) return 'expired';
  return attempt.status;
}

export function registerAttemptRoutes(app: FastifyInstance, db: Knex, principal: PrincipalGuard) {
  async function student(request: FastifyRequest) {
    const user = await principal(request);
    if (user.role !== 'estudiante') throw new ApiError(403, 'student_required', 'Esta operaciÃ³n requiere una cuenta estudiantil.');
    return user;
  }

  async function activeEnrollment(connection: Knex | Knex.Transaction, classroomId: string, studentId: string, lock = false) {
    let query = connection('enrollments as e').join('classrooms as c', 'c.id', 'e.classroom_id')
      .join('subjects as s', 's.id', 'c.subject_id')
      .where({ 'e.classroom_id': classroomId, 'e.student_user_id': studentId, 'e.status': 'active' })
      .whereNull('c.archived_at').whereNull('c.deleted_at').whereNull('s.archived_at').select('e.id').first();
    if (lock) query = query.forUpdate();
    const row = await query;
    if (!row) throw new ApiError(404, 'not_found', 'Actividad no disponible.');
    return row as { id: string };
  }

  async function databaseNow(connection: Knex | Knex.Transaction) {
    const result = await connection.raw('SELECT clock_timestamp() AS now');
    return new Date(result.rows[0].now);
  }

  function activityState(row: Record<string, unknown>, now: Date) {
    if (row.assessment_status === 'closed') return 'closed';
    if (row.opens_at && new Date(String(row.opens_at)) > now) return 'upcoming';
    if (row.closes_at && new Date(String(row.closes_at)) <= now) return 'closed';
    if (['submitted', 'grading', 'graded'].includes(String(row.attempt_status))) return 'submitted';
    if (row.attempt_status === 'expired') return 'expired';
    if (row.attempt_status === 'in_progress') return effectiveStatus({ status: row.attempt_status, expires_at: row.expires_at }, now) === 'expired' ? 'expired' : 'in_progress';
    return row.assessment_status === 'published' ? 'available' : 'closed';
  }

  async function attemptDto(connection: Knex | Knex.Transaction, attempt: Record<string, unknown>) {
    const now = await databaseNow(connection);
    const snapshot = await connection('assessment_versions').where({ id: attempt.assessment_version_id }).first();
    const settings = (snapshot?.settings || {}) as Record<string, unknown>;
    const rows = await connection('attempt_items as ai')
      .join('assessment_version_items as vi', 'vi.id', 'ai.assessment_version_item_id')
      .join('question_revisions as q', 'q.id', 'vi.question_revision_id')
      .leftJoin('attempt_answers as aa', function joinAnswer() {
        this.on('aa.attempt_item_id', '=', 'ai.id').andOn('aa.attempt_id', '=', 'ai.attempt_id');
      })
      .where({ 'ai.attempt_id': attempt.id }).orderBy('ai.position')
      .select('ai.id', 'ai.position', 'ai.option_order', 'q.content', 'aa.answer', 'aa.saved_at');
    const questions = rows.map(row => {
      const content = row.content as RevisionContent;
      const alternatives = Array.isArray(content.alternatives) ? content.alternatives : [];
      const byId = new Map(alternatives.map(option => [option.id, option]));
      const order: unknown[] = Array.isArray(row.option_order) ? row.option_order : [];
      return {
        id: row.id, position: row.position, statement: String(content.statement || ''),
        topic: String(content.topic || ''), difficulty: String(content.difficulty || ''),
        alternatives: order.map(optionId => byId.get(String(optionId))).filter(Boolean),
        selectedOptionId: row.answer?.selectedOptionId ?? null, savedAt: row.saved_at ?? null,
      };
    });
    return {
      id: attempt.id, activityVersionId: attempt.assessment_version_id, classroomId: attempt.classroom_id,
      title: String(settings.title || 'Actividad'), instructions: String(settings.instructions || ''), type: settings.type || 'practice',
      status: effectiveStatus(attempt, now), version: attempt.version, startedAt: attempt.started_at,
      expiresAt: attempt.expires_at, submittedAt: attempt.submitted_at, serverNow: now.toISOString(),
      questions, answeredCount: questions.filter(question => question.selectedOptionId).length,
    };
  }

  async function ownedAttempt(connection: Knex | Knex.Transaction, classroomId: string, attemptId: string, studentId: string, lock = false) {
    let query = connection('attempts').where({ id: attemptId, classroom_id: classroomId, student_user_id: studentId }).first();
    if (lock) query = query.forUpdate();
    const row = await query;
    if (!row) throw new ApiError(404, 'not_found', 'Intento no disponible.');
    return row as Record<string, unknown>;
  }

  async function expireIfNeeded(tx: Knex.Transaction, attempt: Record<string, unknown>, now: Date) {
    if (attempt.status !== 'in_progress' || !attempt.expires_at || new Date(String(attempt.expires_at)) > now) return false;
    await tx('attempts').where({ id: attempt.id }).update({ status: 'expired', version: Number(attempt.version) + 1, last_activity_at: now });
    await tx('audit_events').insert({ id: randomUUID(), actor_id: attempt.student_user_id, action: 'attempt.expired', resource_id: attempt.id,
      resource_type: 'attempt', details: { assessmentVersionId: attempt.assessment_version_id } });
    return true;
  }

  const base = '/api/v1/classrooms/:id';

  app.get<{ Params: { id: string } }>(base + '/activities', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } }, schema: { params: params() },
  }, async request => {
    const user = await student(request); await activeEnrollment(db, request.params.id, user.id);
    const now = await databaseNow(db);
    const rows = await db('assessment_versions as v').join('assessments as a', 'a.id', 'v.assessment_id')
      .leftJoin('attempts as t', function joinAttempt() { this.on('t.assessment_version_id', '=', 'v.id').andOnVal('t.student_user_id', '=', user.id); })
      .where({ 'v.classroom_id': request.params.id }).whereIn('a.status', ['published', 'closed'])
      .orderBy('v.published_at', 'desc')
      .select('v.id', 'v.settings', 'v.total_points', 'v.opens_at', 'v.due_at', 'v.closes_at', 'v.published_at',
        'a.status as assessment_status', 't.id as attempt_id', 't.status as attempt_status', 't.version as attempt_version', 't.expires_at');
    const counts = await db('assessment_version_items').whereIn('assessment_version_id', rows.map(row => row.id)).groupBy('assessment_version_id')
      .select('assessment_version_id').count<{ assessment_version_id: string; count: string }[]>({ count: '*' });
    const byVersion = new Map(counts.map(row => [row.assessment_version_id, Number(row.count)]));
    return rows.map(row => {
      const settings = row.settings as Record<string, unknown>;
      return { id: row.id, title: settings.title || 'Actividad', instructions: settings.instructions || '', type: settings.type || 'practice',
        totalPoints: Number(row.total_points), questionCount: byVersion.get(row.id) || 0, opensAt: row.opens_at, dueAt: row.due_at,
        closesAt: row.closes_at, publishedAt: row.published_at, state: activityState(row, now), attemptsAllowed: 1,
        attempt: row.attempt_id ? { id: row.attempt_id, status: effectiveStatus({ status: row.attempt_status, expires_at: row.expires_at }, now), version: row.attempt_version } : null,
        serverNow: now.toISOString() };
    });
  });

  app.get<{ Params: { id: string; versionId: string } }>(base + '/activities/:versionId', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } }, schema: { params: params({ versionId: uuid }) },
  }, async request => {
    const user = await student(request); await activeEnrollment(db, request.params.id, user.id);
    const now = await databaseNow(db);
    const row = await db('assessment_versions as v').join('assessments as a', 'a.id', 'v.assessment_id')
      .leftJoin('attempts as t', function joinAttempt() { this.on('t.assessment_version_id', '=', 'v.id').andOnVal('t.student_user_id', '=', user.id); })
      .where({ 'v.id': request.params.versionId, 'v.classroom_id': request.params.id }).whereIn('a.status', ['published', 'closed'])
      .select('v.*', 'a.status as assessment_status', 't.id as attempt_id', 't.status as attempt_status', 't.version as attempt_version', 't.expires_at').first();
    if (!row) throw new ApiError(404, 'not_found', 'Actividad no disponible.');
    const count = Number((await db('assessment_version_items').where({ assessment_version_id: row.id }).count('* as n').first())?.n || 0);
    const settings = row.settings as Record<string, unknown>; const state = activityState(row, now);
    return { id: row.id, title: settings.title || 'Actividad', instructions: settings.instructions || '', type: settings.type || 'practice',
      totalPoints: Number(row.total_points), questionCount: count, opensAt: row.opens_at, dueAt: row.due_at, closesAt: row.closes_at,
      state, attemptsAllowed: 1, canStart: state === 'available', canResume: state === 'in_progress', serverNow: now.toISOString(),
      attempt: row.attempt_id ? { id: row.attempt_id, status: effectiveStatus({ status: row.attempt_status, expires_at: row.expires_at }, now), version: row.attempt_version } : null };
  });

  app.post<{ Params: { id: string; versionId: string }; Body: { operationId: string } }>(base + '/activities/:versionId/attempts', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, schema: { params: params({ versionId: uuid }), body: operationBody },
  }, async (request, reply) => {
    const user = await student(request);
    const result = await db.transaction(async tx => {
      const enrollment = await activeEnrollment(tx, request.params.id, user.id, true);
      const now = await databaseNow(tx);
      const snapshot = await tx('assessment_versions as v').join('assessments as a', 'a.id', 'v.assessment_id')
        .where({ 'v.id': request.params.versionId, 'v.classroom_id': request.params.id }).forUpdate()
        .select('v.*', 'a.status as assessment_status').first();
      if (!snapshot) throw new ApiError(404, 'not_found', 'Actividad no disponible.');
      const sameOperation = await tx('attempts').where({ student_user_id: user.id, start_key: request.body.operationId }).first();
      if (sameOperation) {
        if (sameOperation.assessment_version_id !== snapshot.id) throw new ApiError(409, 'operation_conflict', 'La operaciÃ³n ya se utilizÃ³ para otra actividad.');
        return { attempt: sameOperation } as const;
      }
      const previous = await tx('attempts').where({ assessment_version_id: snapshot.id, student_user_id: user.id }).orderBy('attempt_number', 'desc').first();
      if (previous?.status === 'in_progress') {
        if (await expireIfNeeded(tx, previous, now)) return { expired: true } as const;
        return { attempt: previous } as const;
      }
      if (previous) throw new ApiError(409, 'attempt_limit_reached', 'Esta actividad admite un solo intento.');
      if (snapshot.assessment_status !== 'published') throw new ApiError(409, 'activity_closed', 'La actividad ya no admite nuevos intentos.');
      if (snapshot.opens_at && new Date(snapshot.opens_at) > now) throw new ApiError(409, 'activity_not_open', 'La actividad todavÃ­a no estÃ¡ disponible.');
      if (snapshot.closes_at && new Date(snapshot.closes_at) <= now) throw new ApiError(409, 'activity_closed', 'El plazo de la actividad terminÃ³.');
      const sourceItems = await tx('assessment_version_items as vi').join('question_revisions as q', 'q.id', 'vi.question_revision_id')
        .where({ 'vi.assessment_version_id': snapshot.id }).orderBy('vi.position').select('vi.id', 'vi.position', 'q.content');
      if (!sourceItems.length) throw new ApiError(409, 'activity_empty', 'La actividad no contiene preguntas disponibles.');
      const attempt = { id: randomUUID(), assessment_version_id: snapshot.id, classroom_id: request.params.id, student_user_id: user.id,
        enrollment_id: enrollment.id, attempt_number: 1, status: 'in_progress', start_key: request.body.operationId, started_at: now,
        expires_at: snapshot.closes_at || null, last_activity_at: now, version: 1 };
      await tx('attempts').insert(attempt);
      await tx('attempt_items').insert(sourceItems.map(item => {
        const content = item.content as RevisionContent; const alternatives = Array.isArray(content.alternatives) ? content.alternatives : [];
        if (alternatives.length < 2) throw new ApiError(409, 'invalid_activity_snapshot', 'Una pregunta publicada no tiene alternativas vÃ¡lidas.');
        return { id: randomUUID(), attempt_id: attempt.id, assessment_version_id: snapshot.id, assessment_version_item_id: item.id,
          position: item.position, option_order: JSON.stringify(alternatives.map(option => option.id)) };
      }));
      await tx('audit_events').insert({ id: randomUUID(), actor_id: user.id, action: 'attempt.started', resource_id: attempt.id,
        resource_type: 'attempt', details: { assessmentVersionId: snapshot.id, attemptNumber: 1 } });
      return { attempt } as const;
    });
    if ('expired' in result) throw new ApiError(409, 'attempt_expired', 'El plazo del intento anterior terminÃ³.');
    return reply.code(201).send(await attemptDto(db, result.attempt));
  });

  app.get<{ Params: { id: string; attemptId: string } }>(base + '/attempts/:attemptId', {
    config: { rateLimit: { max: 90, timeWindow: '1 minute' } }, schema: { params: params({ attemptId: uuid }) },
  }, async request => {
    const user = await student(request); await activeEnrollment(db, request.params.id, user.id);
    return attemptDto(db, await ownedAttempt(db, request.params.id, request.params.attemptId, user.id));
  });

  app.patch<{ Params: { id: string; attemptId: string; itemId: string }; Body: { version: number; operationId: string; selectedOptionId: string } }>(base + '/attempts/:attemptId/answers/:itemId', {
    config: { rateLimit: { max: 90, timeWindow: '1 minute' } }, schema: { params: params({ attemptId: uuid, itemId: uuid }), body: {
      type: 'object', additionalProperties: false, required: ['version', 'operationId', 'selectedOptionId'], properties: {
        version: { type: 'integer', minimum: 1 }, operationId: uuid, selectedOptionId: uuid,
      },
    } },
  }, async request => {
    const user = await student(request);
    const result = await db.transaction(async tx => {
      await activeEnrollment(tx, request.params.id, user.id, true);
      const attempt = await ownedAttempt(tx, request.params.id, request.params.attemptId, user.id, true);
      const now = await databaseNow(tx);
      if (await expireIfNeeded(tx, attempt, now)) return { expired: true } as const;
      if (attempt.status !== 'in_progress') throw new ApiError(409, 'attempt_finished', 'El intento ya no admite cambios.');
      const repeated = await tx('attempt_answers').where({ attempt_id: attempt.id, operation_key: request.body.operationId }).first();
      if (repeated) {
        if (repeated.attempt_item_id !== request.params.itemId || repeated.answer?.selectedOptionId !== request.body.selectedOptionId) {
          throw new ApiError(409, 'operation_conflict', 'La operación ya se utilizó para otro guardado.');
        }
        return { attempt } as const;
      }
      if (Number(attempt.version) !== request.body.version) throw new ApiError(409, 'version_conflict', 'Hay una versiÃ³n mÃ¡s reciente del intento. Recarga antes de continuar.');
      const item = await tx('attempt_items').where({ id: request.params.itemId, attempt_id: attempt.id }).first();
      if (!item || !Array.isArray(item.option_order) || !item.option_order.includes(request.body.selectedOptionId)) {
        throw new ApiError(404, 'not_found', 'Pregunta o alternativa no disponible.');
      }
      const current = await tx('attempt_answers').where({ attempt_id: attempt.id, attempt_item_id: item.id }).first();
      const answer = JSON.stringify({ selectedOptionId: request.body.selectedOptionId });
      if (current) await tx('attempt_answers').where({ id: current.id }).update({ answer, version: current.version + 1, operation_key: request.body.operationId, saved_at: now });
      else await tx('attempt_answers').insert({ id: randomUUID(), attempt_id: attempt.id, attempt_item_id: item.id, answer,
        version: 1, operation_key: request.body.operationId, saved_at: now });
      const [updated] = await tx('attempts').where({ id: attempt.id }).update({ version: Number(attempt.version) + 1, last_activity_at: now }).returning('*');
      return { attempt: updated } as const;
    });
    if ('expired' in result) throw new ApiError(409, 'attempt_expired', 'El plazo del intento terminÃ³.');
    return attemptDto(db, result.attempt);
  });

  app.post<{ Params: { id: string; attemptId: string }; Body: { version: number; operationId: string; confirmed: true } }>(base + '/attempts/:attemptId/submit', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, schema: { params: params({ attemptId: uuid }), body: {
      type: 'object', additionalProperties: false, required: ['version', 'operationId', 'confirmed'], properties: {
        version: { type: 'integer', minimum: 1 }, operationId: uuid, confirmed: { type: 'boolean', const: true },
      },
    } },
  }, async request => {
    const user = await student(request);
    const result = await db.transaction(async tx => {
      await activeEnrollment(tx, request.params.id, user.id, true);
      const attempt = await ownedAttempt(tx, request.params.id, request.params.attemptId, user.id, true);
      const now = await databaseNow(tx);
      if (['submitted', 'grading', 'graded'].includes(String(attempt.status))) {
        if (attempt.submission_key !== request.body.operationId) throw new ApiError(409, 'attempt_finished', 'El intento ya fue entregado.');
        return { attempt } as const;
      }
      if (await expireIfNeeded(tx, attempt, now)) return { expired: true } as const;
      if (attempt.status !== 'in_progress') throw new ApiError(409, 'attempt_finished', 'El intento ya no puede enviarse.');
      if (Number(attempt.version) !== request.body.version) throw new ApiError(409, 'version_conflict', 'Hay respuestas mÃ¡s recientes. Recarga antes de enviar.');
      const [submitted] = await tx('attempts').where({ id: attempt.id }).update({ status: 'submitted', submitted_at: now,
        submission_key: request.body.operationId, version: Number(attempt.version) + 1, last_activity_at: now }).returning('*');
      const answered = Number((await tx('attempt_answers').where({ attempt_id: attempt.id }).count('* as n').first())?.n || 0);
      await tx('audit_events').insert({ id: randomUUID(), actor_id: user.id, action: 'attempt.submitted', resource_id: attempt.id,
        resource_type: 'attempt', details: { assessmentVersionId: attempt.assessment_version_id, answered } });
      return { attempt: submitted } as const;
    });
    if ('expired' in result) throw new ApiError(409, 'attempt_expired', 'El plazo del intento terminÃ³ antes del envÃ­o.');
    if (result.attempt.status !== 'graded') await gradeSubmittedAttempt(db, String(result.attempt.id));
    return attemptDto(db, await ownedAttempt(db, request.params.id, request.params.attemptId, user.id));
  });

  app.get<{ Params: { id: string; attemptId: string } }>(base + '/attempts/:attemptId/status', {
    config: { rateLimit: { max: 90, timeWindow: '1 minute' } }, schema: { params: params({ attemptId: uuid }) },
  }, async request => {
    const user = await student(request); await activeEnrollment(db, request.params.id, user.id);
    const attempt = await ownedAttempt(db, request.params.id, request.params.attemptId, user.id);
    const now = await databaseNow(db);
    return { id: attempt.id, status: effectiveStatus(attempt, now), version: attempt.version, submittedAt: attempt.submitted_at,
      expiresAt: attempt.expires_at, serverNow: now.toISOString() };
  });
}
