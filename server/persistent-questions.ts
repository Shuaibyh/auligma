import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Knex } from 'knex';
import type { Principal } from './enrollments.ts';
import { ApiError } from './identity.ts';
import { verifyMath, type MathInput } from './math-verifier.ts';

type Content = {
  statement: string; alternatives: string[]; proposedAnswer: number; explanation: string;
  difficulty: string; topic: string; operation: MathInput['operation']; expression: string;
  reviewed: boolean; nodeId: string | null; materialId: string | null;
};
type Params = { id: string; draftId: string };
const uuid = { type: 'string', format: 'uuid' };
const nullableId = { anyOf: [uuid, { type: 'null' }] };
const text = (maxLength: number, minLength = 0) => ({ type: 'string', maxLength, minLength });
const properties = {
  statement: text(6000, 1), alternatives: { type: 'array', minItems: 2, maxItems: 8, items: text(500, 1) },
  proposedAnswer: { type: 'integer', minimum: 0, maximum: 7 }, explanation: text(4000),
  difficulty: { type: 'string', enum: ['básica', 'intermedia', 'avanzada'] }, topic: text(160),
  operation: { type: 'string', enum: ['derivative', 'equivalence'] }, expression: text(500),
  reviewed: { type: 'boolean' }, nodeId: nullableId, materialId: nullableId,
};
const params = { type: 'object', required: ['id'], properties: { id: uuid, draftId: uuid }, additionalProperties: false };
export function registerPersistentQuestions(app: FastifyInstance, db: Knex, teacher: (request: FastifyRequest) => Promise<Principal>) {
  async function owner(request: FastifyRequest<{ Params: Params }>, connection: Knex = db) {
    const user = await teacher(request);
    const query = connection('classrooms as c').join('subjects as s', 's.id', 'c.subject_id')
      .where({ 'c.id': request.params.id, 'c.teacher_id': user.id }).whereNull('c.archived_at').whereNull('c.deleted_at').whereNull('s.archived_at').first('c.id');
    if (connection !== db) query.forShare('c', 's');
    const room = await query;
    if (!room) throw new ApiError(404, 'not_found', 'Aula no disponible.');
    return user;
  }
  const base = '/api/v1/classrooms/:id/question-drafts';
  app.get<{ Params: Params; Querystring: { q?: string; nodeId?: string } }>(base, { schema: { params, querystring: { type: 'object', additionalProperties: false, properties: { q: text(160), nodeId: uuid } } } }, async request => {
    const user = await owner(request);
    const query = db('question_drafts').where({ classroom_id: request.params.id, teacher_id: user.id }).whereNull('discarded_at');
    if (request.query.nodeId) query.where({ node_id: request.query.nodeId });
    if (request.query.q) query.whereRaw("position(lower(?) in lower((content->>'statement') || ' ' || (content->>'topic'))) > 0", [request.query.q]);
    return query.orderBy('updated_at', 'desc').limit(100);
  });
  app.get<{ Params: Params }>(base + '/:draftId', { schema: { params } }, async request => {
    const user = await owner(request);
    const row = await db('question_drafts').where({ id: request.params.draftId, classroom_id: request.params.id, teacher_id: user.id }).whereNull('discarded_at').first();
    if (!row) throw new ApiError(404, 'not_found', 'Borrador no disponible.');
    return row;
  });
  for (const method of ['POST', 'PUT'] as const) app.route<{ Params: Params; Body: Content & { version?: number } }>({
    method, url: base + (method === 'PUT' ? '/:draftId' : ''),
    schema: { params, body: { type: 'object', additionalProperties: false, required: [...Object.keys(properties), ...(method === 'PUT' ? ['version'] : [])], properties: { ...properties, ...(method === 'PUT' ? { version: { type: 'integer', minimum: 1 } } : {}) } } },
    handler: async (request, reply) => {
      await owner(request);
      const { version, ...content } = request.body;
      if (!content.statement.trim() || content.proposedAnswer >= content.alternatives.length || content.alternatives.some(item => !item.trim())) throw new ApiError(400, 'invalid_question', 'Revisa el enunciado, las alternativas y la respuesta propuesta.');
      const verification = content.reviewed ? await verifyMath({ operation: content.operation, expression: content.expression, alternatives: content.alternatives }) : null;
      const indices = verification?.correctIndices;
      const status = !verification ? 'draft' : verification.status !== 'VERIFICADO' ? 'indeterminate'
        : verification.singleChoiceValid === true && Array.isArray(indices) && indices.length === 1 && indices[0] === content.proposedAnswer && content.explanation.trim() ? 'reviewed' : 'invalid';
      const saved = await db.transaction(async tx => {
        const user = await owner(request, tx);
        if (content.nodeId && !await tx('academic_nodes').where({ id: content.nodeId, classroom_id: request.params.id }).whereNull('archived_at').forShare().first()) throw new ApiError(400, 'invalid_node', 'El tema no pertenece a esta aula o está archivado.');
        if (content.materialId && !await tx('academic_materials').where({ id: content.materialId, classroom_id: request.params.id, ...(content.nodeId ? { node_id: content.nodeId } : {}) }).whereNull('deleted_at').forShare().first()) throw new ApiError(400, 'invalid_material', 'El material no corresponde al aula y tema seleccionados.');
        const values = { content: JSON.stringify(content), verification: verification ? JSON.stringify(verification) : null, node_id: content.nodeId, material_id: content.materialId, review_status: status, updated_at: tx.fn.now() };
        let row;
        if (method === 'POST') [row] = await tx('question_drafts').insert({ ...values, id: randomUUID(), classroom_id: request.params.id, teacher_id: user.id }).returning('*');
        else {
          [row] = await tx('question_drafts').where({ id: request.params.draftId, classroom_id: request.params.id, teacher_id: user.id, version }).whereNull('discarded_at').update({ ...values, version: tx.raw('version + 1') }).returning('*');
          if (!row) throw new ApiError(409, 'version_conflict', 'El borrador cambió o ya no está disponible. Conserva tus cambios y vuelve a consultar.');
        }
        await tx('audit_events').insert({ id: randomUUID(), actor_id: user.id, action: 'question_draft.saved', resource_id: row.id });
        return row;
      });
      reply.code(method === 'POST' ? 201 : 200); return saved;
    },
  });
  app.post<{ Params: Params; Body: { version: number; confirmed: boolean } }>(base + '/:draftId/discard', { schema: { params, body: { type: 'object', additionalProperties: false, required: ['version', 'confirmed'], properties: { version: { type: 'integer', minimum: 1 }, confirmed: { type: 'boolean', const: true } } } } }, async request => {
    return db.transaction(async tx => {
      const user = await owner(request, tx);
      const rows = await tx('question_drafts').where({ id: request.params.draftId, classroom_id: request.params.id, teacher_id: user.id, version: request.body.version }).whereNull('discarded_at').update({ discarded_at: tx.fn.now(), updated_at: tx.fn.now(), version: tx.raw('version + 1') }).returning('id');
      if (!rows.length) throw new ApiError(409, 'version_conflict', 'El borrador cambió o ya fue descartado.');
      await tx('audit_events').insert({ id: randomUUID(), actor_id: user.id, action: 'question_draft.discarded', resource_id: rows[0].id });
      return { discarded: true };
    });
  });
}
