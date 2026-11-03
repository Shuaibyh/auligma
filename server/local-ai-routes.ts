import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Knex } from 'knex';
import type { Principal } from './enrollments.ts';
import { ApiError } from './identity.ts';
import { configuredSyllabusProvider } from './syllabus-ai.ts';
import { registerExerciseRoutes } from './local-exercises.ts';

export function registerLocalAiRoutes(app: FastifyInstance, db: Knex, teacher: (request: FastifyRequest) => Promise<Principal>) {
  registerExerciseRoutes(app, db, teacher);
  const active = new Set<string>();
  app.post<{ Params: { id: string; sourceId: string }; Body: { consent: boolean } }>(
    '/api/v1/classrooms/:id/syllabus/:sourceId/propose-local', {
      schema: { params: { type: 'object', additionalProperties: false, required: ['id', 'sourceId'], properties: { id: { type: 'string', format: 'uuid' }, sourceId: { type: 'string', format: 'uuid' } } },
        body: { type: 'object', additionalProperties: false, required: ['consent'], properties: { consent: { type: 'boolean', const: true } } } },
    }, async (request, reply) => {
      const user = await teacher(request);
      const classroom = await db('classrooms as c').join('subjects as s', 's.id', 'c.subject_id').where({ 'c.id': request.params.id, 'c.teacher_id': user.id }).whereNull('c.archived_at').whereNull('c.deleted_at').whereNull('s.archived_at').first();
      if (!classroom) throw new ApiError(404, 'not_found', 'Aula no disponible.');
      const source = await db('syllabus_sources').where({ id: request.params.sourceId, classroom_id: request.params.id, created_by: user.id }).first();
      if (!source || source.extraction_status !== 'extracted') throw new ApiError(409, 'text_required', 'Selecciona un sílabo con texto extraído.');
      const provider = configuredSyllabusProvider();
      if (!provider) throw new ApiError(503, 'ai_not_configured', 'Configura AI_PROVIDER=ollama en el backend local.');
      const key = `${user.id}:${source.id}`;
      if (active.has(key)) throw new ApiError(409, 'ai_busy', 'Este documento ya se está procesando.');
      if (active.size >= 4) throw new ApiError(429, 'ai_busy', 'La cola de documentos está llena.');
      active.add(key);
      const controller = new AbortController();
      const disconnected = () => { if (!reply.raw.writableEnded) controller.abort(); };
      reply.raw.once('close', disconnected);
      try {
        const payload = await provider.analyze({ extractedText: source.extracted_text, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(600_000)]) });
        controller.signal.throwIfAborted();
        // Revalidación después del trabajo lento: un aula archivada no recibe propuestas nuevas.
        await teacher(request);
        const row = await db.transaction(async tx => {
          const current = await tx('classrooms').where({ id: request.params.id, teacher_id: user.id }).whereNull('archived_at').whereNull('deleted_at').forUpdate().first();
          if (!current) throw new ApiError(404, 'not_found', 'Aula no disponible.');
          const [created] = await tx('planning_proposals').insert({ id: randomUUID(), source_id: source.id, classroom_id: request.params.id, provider: 'configured_ai', model: provider.model, status: 'ready', payload }).returning('*');
          await tx('audit_events').insert({ id: randomUUID(), actor_id: user.id, action: 'planning.proposal_created', resource_id: created.id, resource_type: 'planning_proposal', details: { provider: 'ollama', model: provider.model, localConsent: true } });
          return created;
        });
        return reply.code(201).send({ id: row.id, sourceId: source.id, status: row.status, payload: row.payload,
          source: { id: source.id, fileName: source.original_name, text: source.extracted_text, status: source.extraction_status, externalConsent: false } });
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(503, 'local_ai_failed', 'El análisis local falló, fue cancelado o agotó su tiempo. Comprueba Ollama y el modelo. La planificación manual sigue disponible.');
      } finally { active.delete(key); reply.raw.off('close', disconnected); }
    });
}
