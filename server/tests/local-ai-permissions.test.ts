import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import type { Knex } from 'knex';
import { registerLocalAiRoutes } from '../local-ai-routes.ts';
import { ApiError } from '../identity.ts';

test('IA local: deniega solicitudes sin autorización y sin consentimiento', async () => {
  const app = Fastify({ ajv: { customOptions: { removeAdditional: false } } });
  const db = (() => { throw new Error('No se debe acceder a datos sin autorización.'); }) as unknown as Knex;
  registerLocalAiRoutes(app, db, async () => { throw new ApiError(403, 'forbidden', 'No autorizado.'); });
  const id = '44444444-4444-4444-8444-444444444444';
  for (const [suffix, payload] of [
    [`syllabus/${id}/propose-local`, { consent: true }],
    ['ai/transcribe', { image: 'abcd', consent: true }],
    ['ai/verify', { expression: 'x', alternatives: ['x'], operation: 'equivalence', reviewed: true }],
    ['ai/questions', { topic: 'Álgebra', subtopic: '', sourceText: '', difficulty: 'básica', consent: true }],
  ] as const) {
    const response = await app.inject({ method: 'POST', url: `/api/v1/classrooms/${id}/${suffix}`, payload });
    assert.equal(response.statusCode, 403, response.body);
  }
  const rejected = await app.inject({ method: 'POST', url: `/api/v1/classrooms/${id}/ai/transcribe`, payload: { image: 'abcd', consent: false } });
  assert.equal(rejected.statusCode, 400);
  await app.close();
});
