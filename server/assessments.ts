import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Knex } from 'knex';
import type { Principal } from './enrollments.ts';
import { ApiError } from './identity.ts';
import { verifyMath } from './math-verifier.ts';

type TeacherGuard = (request: FastifyRequest) => Promise<Principal>;
type DraftContent = {
  statement: string; alternatives: string[]; proposedAnswer: number; explanation: string;
  difficulty: string; topic: string; operation: 'derivative' | 'equivalence'; expression: string;
  reviewed: boolean; nodeId: string | null; materialId: string | null;
};
type RevisionContent = Omit<DraftContent, 'alternatives' | 'proposedAnswer' | 'reviewed'> & {
  alternatives: { id: string; text: string }[];
};

const uuid = { type: 'string', format: 'uuid' };
const params = (extra: Record<string, unknown> = {}) => ({ type: 'object', additionalProperties: false, required: ['id', ...Object.keys(extra)], properties: { id: uuid, ...extra } });
const text = (maxLength: number, minLength = 0) => ({ type: 'string', minLength, maxLength });
const version = { type: 'integer', minimum: 1 };
const points = { type: 'number', exclusiveMinimum: 0, maximum: 1000, multipleOf: 0.01 };

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value);
}
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
function stableOptionId(draftId: string, draftVersion: number, index: number, value: string) {
  const source = createHash('sha256').update(`${draftId}:${draftVersion}:${index}:${value}`).digest('hex').slice(0, 32).split('');
  source[12] = '5'; source[16] = ['8', '9', 'a', 'b'][Number.parseInt(source[16], 16) % 4];
  const hex = source.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function verificationStatus(result: Record<string, unknown>, proposedAnswer: number) {
  const indices = result.correctIndices;
  if (result.status !== 'VERIFICADO') return 'indeterminate';
  return result.singleChoiceValid === true && Array.isArray(indices) && indices.length === 1 && indices[0] === proposedAnswer ? 'draft' : 'invalid';
}

export function registerAssessmentRoutes(app: FastifyInstance, db: Knex, teacher: TeacherGuard) {
  async function owner(request: FastifyRequest, classroomId: string, connection: Knex = db) {
    const user = await teacher(request);
    const row = await connection('classrooms as c').join('subjects as s', 's.id', 'c.subject_id')
      .where({ 'c.id': classroomId, 'c.teacher_id': user.id }).whereNull('c.archived_at').whereNull('c.deleted_at').whereNull('s.archived_at').first('c.id');
    if (!row) throw new ApiError(404, 'not_found', 'Aula no disponible.');
    return user;
  }

  function revisionDto(row: Record<string, unknown>) {
    return {
      id: row.id, questionDraftId: row.question_draft_id, revision: row.revision, content: row.content,
      correctOptionId: row.correct_option_id, verification: row.verification, reviewStatus: row.review_status,
      contentHash: row.content_hash, createdAt: row.created_at, approvedAt: row.approved_at,
    };
  }

  async function assessmentDto(connection: Knex, assessment: Record<string, unknown>) {
    const items = await connection('assessment_items as i').join('question_revisions as q', 'q.id', 'i.question_revision_id')
      .where({ 'i.assessment_id': assessment.id }).orderBy('i.position')
      .select('i.id', 'i.position', 'i.points', 'q.id as question_revision_id', 'q.revision as question_revision',
        'q.content', 'q.correct_option_id', 'q.review_status', 'q.verification');
    return {
      id: assessment.id, classroomId: assessment.classroom_id, type: assessment.type, status: assessment.status,
      title: assessment.title, instructions: assessment.instructions, version: assessment.version,
      createdAt: assessment.created_at, updatedAt: assessment.updated_at,
      totalPoints: items.reduce((sum, item) => sum + Number(item.points), 0),
      items: items.map(item => ({
        id: item.id, position: item.position, points: Number(item.points), questionRevisionId: item.question_revision_id,
        questionRevision: item.question_revision, reviewStatus: item.review_status, content: item.content,
        correctOptionId: item.correct_option_id, verification: item.verification,
      })),
      publicationAllowed: false,
    };
  }

  async function lockedAssessment(tx: Knex.Transaction, userId: string, classroomId: string, assessmentId: string, expectedVersion: number) {
    const row = await tx('assessments').where({ id: assessmentId, classroom_id: classroomId, teacher_id: userId, status: 'draft' }).forUpdate().first();
    if (!row) throw new ApiError(404, 'not_found', 'Práctica en borrador no disponible.');
    if (row.version !== expectedVersion) throw new ApiError(409, 'version_conflict', 'La práctica cambió. Vuelve a consultarla antes de guardar.');
    return row;
  }

  async function applyOrder(tx: Knex.Transaction, assessmentId: string, ids: string[]) {
    if (!ids.length) return;
    await tx('assessment_items').where({ assessment_id: assessmentId }).increment('position', 10_000);
    for (const [index, id] of ids.entries()) await tx('assessment_items').where({ id, assessment_id: assessmentId }).update({ position: index + 1 });
  }

  app.get<{ Params: { id: string } }>('/api/v1/classrooms/:id/question-revisions', { schema: { params: params() } }, async request => {
    const user = await owner(request, request.params.id);
    const rows = await db('question_revisions').where({ classroom_id: request.params.id, teacher_id: user.id }).orderBy('created_at', 'desc');
    return rows.map(revisionDto);
  });

  app.post<{ Params: { id: string; draftId: string } }>('/api/v1/classrooms/:id/question-drafts/:draftId/revisions', {
    schema: { params: params({ draftId: uuid }), body: { type: 'object', additionalProperties: false, maxProperties: 0 } },
  }, async (request, reply) => {
    const user = await owner(request, request.params.id);
    const source = await db('question_drafts').where({ id: request.params.draftId, classroom_id: request.params.id, teacher_id: user.id }).whereNull('discarded_at').first();
    if (!source) throw new ApiError(404, 'not_found', 'Borrador de pregunta no disponible.');
    const draft = source.content as DraftContent;
    if (!draft.reviewed || !draft.explanation?.trim() || !Array.isArray(draft.alternatives) || draft.alternatives.length < 2 || draft.proposedAnswer < 0 || draft.proposedAnswer >= draft.alternatives.length) {
      throw new ApiError(409, 'question_review_required', 'Revisa el enunciado, la explicación, las alternativas y la respuesta antes de crear una revisión.');
    }
    const verification = await verifyMath({ operation: draft.operation, expression: draft.expression, alternatives: draft.alternatives });
    const reviewStatus = verificationStatus(verification, draft.proposedAnswer);
    const alternatives = draft.alternatives.map((value, index) => ({ id: stableOptionId(source.id, source.version, index, value), text: value }));
    const content: RevisionContent = {
      statement: draft.statement, alternatives, explanation: draft.explanation, difficulty: draft.difficulty, topic: draft.topic,
      operation: draft.operation, expression: draft.expression, nodeId: draft.nodeId, materialId: draft.materialId,
    };
    const correctOptionId = alternatives[draft.proposedAnswer].id;
    const contentHash = digest({ content, correctOptionId, verification });
    const row = await db.transaction(async tx => {
      await owner(request, request.params.id, tx);
      const current = await tx('question_drafts').where({ id: source.id, classroom_id: request.params.id, teacher_id: user.id, version: source.version }).whereNull('discarded_at').forUpdate().first();
      if (!current || canonical(current.content) !== canonical(source.content)) throw new ApiError(409, 'version_conflict', 'El borrador cambió durante la revisión. Vuelve a consultarlo.');
      const last = await tx('question_revisions').where({ question_draft_id: source.id }).max<{ max: string | number | null }>('revision as max').first();
      try {
        const [created] = await tx('question_revisions').insert({ id: randomUUID(), question_draft_id: source.id, classroom_id: request.params.id,
          teacher_id: user.id, revision: Number(last?.max || 0) + 1, content: JSON.stringify(content), correct_option_id: correctOptionId,
          verification: JSON.stringify(verification), review_status: reviewStatus, content_hash: contentHash, created_by: user.id }).returning('*');
        await tx('audit_events').insert({ id: randomUUID(), actor_id: user.id, action: 'question_revision.created', resource_id: created.id,
          resource_type: 'question_revision', details: { reviewStatus } });
        return created;
      } catch (error) {
        if ((error as { code?: string }).code === '23505') throw new ApiError(409, 'revision_exists', 'Este contenido ya tiene una revisión inmutable.');
        throw error;
      }
    });
    return reply.code(201).send(revisionDto(row));
  });

  app.post<{ Params: { id: string; revisionId: string }; Body: { confirmed: boolean } }>('/api/v1/classrooms/:id/question-revisions/:revisionId/approve', {
    schema: { params: params({ revisionId: uuid }), body: { type: 'object', additionalProperties: false, required: ['confirmed'], properties: { confirmed: { type: 'boolean', const: true } } } },
  }, async request => {
    const user = await owner(request, request.params.id);
    const source = await db('question_revisions').where({ id: request.params.revisionId, classroom_id: request.params.id, teacher_id: user.id }).first();
    if (!source) throw new ApiError(404, 'not_found', 'Revisión de pregunta no disponible.');
    if (source.review_status !== 'draft') throw new ApiError(409, 'revision_not_approvable', 'La revisión no cumple las condiciones de aprobación.');
    const content = source.content as RevisionContent;
    const alternatives = content.alternatives.map(item => item.text);
    const correctIndex = content.alternatives.findIndex(item => item.id === source.correct_option_id);
    const verification = await verifyMath({ operation: content.operation, expression: content.expression, alternatives });
    if (verificationStatus(verification, correctIndex) !== 'draft') throw new ApiError(409, 'math_validation_failed', 'La comprobación matemática no permite aprobar esta revisión.');
    return db.transaction(async tx => {
      await owner(request, request.params.id, tx);
      const current = await tx('question_revisions').where({ id: source.id, classroom_id: request.params.id, teacher_id: user.id }).forUpdate().first();
      if (!current || current.review_status !== 'draft') throw new ApiError(409, 'version_conflict', 'La revisión ya cambió de estado.');
      const [approved] = await tx('question_revisions').where({ id: source.id }).update({ review_status: 'approved', approved_by: user.id, approved_at: tx.fn.now() }).returning('*');
      await tx('audit_events').insert({ id: randomUUID(), actor_id: user.id, action: 'question_revision.approved', resource_id: source.id,
        resource_type: 'question_revision', details: {} });
      return revisionDto(approved);
    });
  });

  const assessmentBase = '/api/v1/classrooms/:id/assessments';
  app.get<{ Params: { id: string } }>(assessmentBase, { schema: { params: params() } }, async request => {
    const user = await owner(request, request.params.id);
    const rows = await db('assessments').where({ classroom_id: request.params.id, teacher_id: user.id }).orderBy('updated_at', 'desc');
    return Promise.all(rows.map(row => assessmentDto(db, row)));
  });

  app.post<{ Params: { id: string }; Body: { title: string; instructions: string } }>(assessmentBase, {
    schema: { params: params(), body: { type: 'object', additionalProperties: false, required: ['title', 'instructions'], properties: { title: text(200, 1), instructions: text(6000) } } },
  }, async (request, reply) => {
    const user = await owner(request, request.params.id);
    const row = await db.transaction(async tx => {
      await owner(request, request.params.id, tx);
      const [created] = await tx('assessments').insert({ id: randomUUID(), classroom_id: request.params.id, teacher_id: user.id,
        type: 'practice', status: 'draft', title: request.body.title.trim(), instructions: request.body.instructions.trim() }).returning('*');
      await tx('audit_events').insert({ id: randomUUID(), actor_id: user.id, action: 'assessment.created', resource_id: created.id,
        resource_type: 'assessment', details: { type: 'practice', status: 'draft' } });
      return created;
    });
    return reply.code(201).send(await assessmentDto(db, row));
  });

  app.get<{ Params: { id: string; assessmentId: string } }>(assessmentBase + '/:assessmentId', { schema: { params: params({ assessmentId: uuid }) } }, async request => {
    const user = await owner(request, request.params.id);
    const row = await db('assessments').where({ id: request.params.assessmentId, classroom_id: request.params.id, teacher_id: user.id }).first();
    if (!row) throw new ApiError(404, 'not_found', 'Práctica no disponible.');
    return assessmentDto(db, row);
  });

  app.get<{ Params: { id: string; assessmentId: string } }>(assessmentBase + '/:assessmentId/preview', { schema: { params: params({ assessmentId: uuid }) } }, async request => {
    const user = await owner(request, request.params.id);
    const row = await db('assessments').where({ id: request.params.assessmentId, classroom_id: request.params.id, teacher_id: user.id, status: 'draft' }).first();
    if (!row) throw new ApiError(404, 'not_found', 'Vista previa no disponible.');
    return assessmentDto(db, row);
  });

  app.patch<{ Params: { id: string; assessmentId: string }; Body: { version: number; title?: string; instructions?: string } }>(assessmentBase + '/:assessmentId', {
    schema: { params: params({ assessmentId: uuid }), body: { type: 'object', additionalProperties: false, required: ['version'], anyOf: [{ required: ['title'] }, { required: ['instructions'] }], properties: { version, title: text(200, 1), instructions: text(6000) } } },
  }, async request => {
    const user = await owner(request, request.params.id);
    const row = await db.transaction(async tx => {
      const current = await lockedAssessment(tx, user.id, request.params.id, request.params.assessmentId, request.body.version);
      const changes = { ...(request.body.title !== undefined ? { title: request.body.title.trim() } : {}),
        ...(request.body.instructions !== undefined ? { instructions: request.body.instructions.trim() } : {}), version: current.version + 1, updated_at: tx.fn.now() };
      const [updated] = await tx('assessments').where({ id: current.id }).update(changes).returning('*');
      await tx('audit_events').insert({ id: randomUUID(), actor_id: user.id, action: 'assessment.updated', resource_id: current.id,
        resource_type: 'assessment', details: { version: updated.version } });
      return updated;
    });
    return assessmentDto(db, row);
  });

  app.post<{ Params: { id: string; assessmentId: string }; Body: { version: number; questionRevisionId: string; points: number; position?: number } }>(assessmentBase + '/:assessmentId/items', {
    schema: { params: params({ assessmentId: uuid }), body: { type: 'object', additionalProperties: false, required: ['version', 'questionRevisionId', 'points'], properties: { version, questionRevisionId: uuid, points, position: { type: 'integer', minimum: 1, maximum: 500 } } } },
  }, async (request, reply) => {
    const user = await owner(request, request.params.id);
    const row = await db.transaction(async tx => {
      const assessment = await lockedAssessment(tx, user.id, request.params.id, request.params.assessmentId, request.body.version);
      const revision = await tx('question_revisions').where({ id: request.body.questionRevisionId, classroom_id: request.params.id, teacher_id: user.id, review_status: 'approved' }).forShare().first();
      if (!revision) throw new ApiError(409, 'approved_question_required', 'Selecciona una revisión aprobada de esta aula.');
      const existing = await tx('assessment_items').where({ assessment_id: assessment.id }).orderBy('position').forUpdate();
      if (existing.some(item => item.question_revision_id === revision.id)) throw new ApiError(409, 'duplicate_item', 'La pregunta ya pertenece a esta práctica.');
      const desired = request.body.position ?? existing.length + 1;
      if (desired > existing.length + 1) throw new ApiError(400, 'invalid_position', 'La posición no corresponde a la práctica.');
      const id = randomUUID();
      await tx('assessment_items').insert({ id, assessment_id: assessment.id, classroom_id: request.params.id, question_revision_id: revision.id,
        position: existing.length + 1, points: request.body.points });
      const ordered = existing.map(item => item.id); ordered.splice(desired - 1, 0, id); await applyOrder(tx, assessment.id, ordered);
      const [updated] = await tx('assessments').where({ id: assessment.id }).update({ version: assessment.version + 1, updated_at: tx.fn.now() }).returning('*');
      await tx('audit_events').insert({ id: randomUUID(), actor_id: user.id, action: 'assessment.item_added', resource_id: assessment.id,
        resource_type: 'assessment', details: { questionRevisionId: revision.id, position: desired } });
      return updated;
    });
    return reply.code(201).send(await assessmentDto(db, row));
  });

  app.patch<{ Params: { id: string; assessmentId: string; itemId: string }; Body: { version: number; points?: number; position?: number } }>(assessmentBase + '/:assessmentId/items/:itemId', {
    schema: { params: params({ assessmentId: uuid, itemId: uuid }), body: { type: 'object', additionalProperties: false, required: ['version'], anyOf: [{ required: ['points'] }, { required: ['position'] }], properties: { version, points, position: { type: 'integer', minimum: 1, maximum: 500 } } } },
  }, async request => {
    const user = await owner(request, request.params.id);
    const row = await db.transaction(async tx => {
      const assessment = await lockedAssessment(tx, user.id, request.params.id, request.params.assessmentId, request.body.version);
      const items = await tx('assessment_items').where({ assessment_id: assessment.id }).orderBy('position').forUpdate();
      const currentIndex = items.findIndex(item => item.id === request.params.itemId);
      if (currentIndex < 0) throw new ApiError(404, 'not_found', 'Pregunta de la práctica no disponible.');
      if (request.body.position !== undefined) {
        if (request.body.position > items.length) throw new ApiError(400, 'invalid_position', 'La posición no corresponde a la práctica.');
        const [moved] = items.splice(currentIndex, 1); items.splice(request.body.position - 1, 0, moved); await applyOrder(tx, assessment.id, items.map(item => item.id));
      }
      if (request.body.points !== undefined) await tx('assessment_items').where({ id: request.params.itemId, assessment_id: assessment.id }).update({ points: request.body.points });
      const [updated] = await tx('assessments').where({ id: assessment.id }).update({ version: assessment.version + 1, updated_at: tx.fn.now() }).returning('*');
      await tx('audit_events').insert({ id: randomUUID(), actor_id: user.id, action: 'assessment.item_updated', resource_id: assessment.id,
        resource_type: 'assessment', details: { itemId: request.params.itemId, ...(request.body.position !== undefined ? { position: request.body.position } : {}), ...(request.body.points !== undefined ? { points: request.body.points } : {}) } });
      return updated;
    });
    return assessmentDto(db, row);
  });

  app.post<{ Params: { id: string; assessmentId: string; itemId: string }; Body: { version: number; confirmed: boolean } }>(assessmentBase + '/:assessmentId/items/:itemId/remove', {
    schema: { params: params({ assessmentId: uuid, itemId: uuid }), body: { type: 'object', additionalProperties: false, required: ['version', 'confirmed'], properties: { version, confirmed: { type: 'boolean', const: true } } } },
  }, async request => {
    const user = await owner(request, request.params.id);
    const row = await db.transaction(async tx => {
      const assessment = await lockedAssessment(tx, user.id, request.params.id, request.params.assessmentId, request.body.version);
      const item = await tx('assessment_items').where({ id: request.params.itemId, assessment_id: assessment.id }).forUpdate().first();
      if (!item) throw new ApiError(404, 'not_found', 'Pregunta de la práctica no disponible.');
      await tx('assessment_items').where({ id: item.id }).delete();
      const remaining = await tx('assessment_items').where({ assessment_id: assessment.id }).orderBy('position').forUpdate(); await applyOrder(tx, assessment.id, remaining.map(value => value.id));
      const [updated] = await tx('assessments').where({ id: assessment.id }).update({ version: assessment.version + 1, updated_at: tx.fn.now() }).returning('*');
      await tx('audit_events').insert({ id: randomUUID(), actor_id: user.id, action: 'assessment.item_removed', resource_id: assessment.id,
        resource_type: 'assessment', details: { itemId: item.id } });
      return updated;
    });
    return assessmentDto(db, row);
  });
}
