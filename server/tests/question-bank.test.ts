import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { verifiedTestDatabase } from './test-database.ts';
import { buildApp, hash } from '../app.ts';
import { readConfig } from '../config.ts';

test('PostgreSQL real: borradores, reconexión, versiones, aislamiento y SymPy', { skip: !process.env.DATABASE_TEST_URL && 'Falta DATABASE_TEST_URL', timeout: 60000 }, async () => {
  const db = await verifiedTestDatabase(process.env.DATABASE_TEST_URL);
  await db.migrate.latest();
  const teacherId = randomUUID(), identityId = randomUUID(), subjectId = randomUUID(), classroomId = randomUUID(), otherRoom = randomUUID(), planId = randomUUID(), nodeId = randomUUID();
  const otherTeacher = randomUUID(), materialId = randomUUID();
  const otherToken = randomBytes(32).toString('base64url'), otherEmail = `${randomUUID()}@example.invalid`;
  const token = randomBytes(32).toString('base64url'), email = `${randomUUID()}@example.invalid`;
  const config = readConfig({ DATABASE_URL: process.env.DATABASE_TEST_URL });
  const headers = { cookie: `auligma_session=${token}`, origin: config.frontendUrl, 'x-csrf-token': 'draft-csrf' };
  const app = await buildApp(config, db);
  const base = `/api/v1/classrooms/${classroomId}/question-drafts`;
  const content = { statement: 'Deriva la función sintética f(x)=(2*x+3)/(x-1)', alternatives: ['2/(x-1)-(2*x+3)/(x-1)**2','(2/(x-1)-(2*x+3)/(x-1)**2)+1','(2/(x-1)-(2*x+3)/(x-1)**2)-1','-1*(2/(x-1)-(2*x+3)/(x-1)**2)'], proposedAnswer: 0,
    explanation: 'Aplica la regla del cociente y revisa cada término.', difficulty: 'intermedia', topic: 'Regla del cociente', expression: '(2*x+3)/(x-1)', operation: 'derivative', reviewed: false, nodeId: null, materialId: null };
  try {
    await db.transaction(async tx => {
      await tx('users').insert({ id: teacherId, email, role: 'docente' });
      await tx('teacher_profiles').insert({ user_id: teacherId, first_names: 'Docente', last_names: 'Sintético' });
      await tx('users').insert({ id: otherTeacher, email: otherEmail, role: 'docente' });
      await tx('teacher_profiles').insert({ user_id: otherTeacher, first_names: 'Otro', last_names: 'Sintético' });
      await tx('external_identities').insert({ id: otherTeacher, user_id: otherTeacher, provider: 'google', subject: otherTeacher });
      await tx('teacher_authorizations').insert({ id: otherTeacher, email: otherEmail, google_sub: otherTeacher, kind: 'institutional', evidence: 'Prueba sintética' });
      await tx('sessions').insert({ token_hash: hash(otherToken), user_id: otherTeacher, csrf_token: 'draft-csrf', expires_at: new Date(Date.now() + 120000) });
      await tx('external_identities').insert({ id: identityId, user_id: teacherId, provider: 'google', subject: identityId });
      await tx('teacher_authorizations').insert({ id: identityId, email, google_sub: identityId, kind: 'institutional', evidence: 'Prueba sintética' });
      await tx('subjects').insert({ id: subjectId, teacher_id: teacherId, name: 'Asignatura sintética' });
      await tx('classrooms').insert([classroomId, otherRoom].map(id => ({ id, teacher_id: teacherId, subject_id: subjectId, section: id.slice(0, 8), period: '2099-I', shift: 'Mañana' })));
      await tx('academic_plans').insert({ id: planId, classroom_id: classroomId, title: 'Plan sintético', created_by: teacherId, updated_by: teacherId });
      await tx('academic_nodes').insert({ id: nodeId, plan_id: planId, classroom_id: classroomId, type: 'topic', title: 'Derivadas', created_by: teacherId, updated_by: teacherId });
      await tx('academic_materials').insert({ id: materialId, classroom_id: classroomId, node_id: nodeId, kind: 'note', title: 'Nota sintética', text_content: 'Fuente sintética', created_by: teacherId, updated_by: teacherId });
      await tx('sessions').insert({ token_hash: hash(token), user_id: teacherId, csrf_token: 'draft-csrf', expires_at: new Date(Date.now() + 120000) });
    });
    assert.equal((await app.inject({ url: base })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: base, headers: { cookie: headers.cookie }, payload: content })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: base, headers, payload: { ...content, publicationAllowed: true } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: `/api/v1/classrooms/${otherRoom}/question-drafts`, headers, payload: { ...content, nodeId } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: `/api/v1/classrooms/${otherRoom}/question-drafts`, headers, payload: { ...content, nodeId: null, materialId } })).statusCode, 400);
    const created = await app.inject({ method: 'POST', url: base, headers, payload: content });
    assert.equal(created.statusCode, 201, created.body);
    const id = created.json().id;
    assert.equal(created.json().version, 1);
    assert.equal(created.json().material_id, null); assert.equal(created.json().node_id, null);
    assert.equal((await app.inject({ url: base, headers: { ...headers, cookie: `auligma_session=${otherToken}` } })).statusCode, 404);
    const reconnect = await verifiedTestDatabase(process.env.DATABASE_TEST_URL);
    try { assert.equal((await reconnect('question_drafts').where({ id }).first()).content.statement, content.statement); } finally { await reconnect.destroy(); }
    // Nueva sesión, mismo docente: no depende de memoria del navegador o servidor.
    const newToken = randomBytes(32).toString('base64url');
    await db('sessions').insert({ token_hash: hash(newToken), user_id: teacherId, csrf_token: 'draft-csrf', expires_at: new Date(Date.now() + 120000) });
    assert.equal((await app.inject({ url: `${base}/${id}`, headers: { ...headers, cookie: `auligma_session=${newToken}` } })).json().content.statement, content.statement);
    assert.equal((await app.inject({ url: `${base}?q=cociente`, headers })).json().length, 1);
    assert.equal((await app.inject({ url: `/api/v1/classrooms/${otherRoom}/question-drafts/${id}`, headers })).statusCode, 404);
    const concurrent = await Promise.all([1, 2].map(() => app.inject({ method: 'PUT', url: `${base}/${id}`, headers, payload: { ...content, version: 1 } })));
    assert.deepEqual(concurrent.map(item => item.statusCode).sort(), [200, 409]);
    const reviewed = await app.inject({ method: 'PUT', url: `${base}/${id}`, headers, payload: { ...content, version: 2, reviewed: true } });
    assert.equal(reviewed.statusCode, 200, reviewed.body); assert.equal(reviewed.json().review_status, 'reviewed');
    const critical = await app.inject({ method: 'PUT', url: `${base}/${id}`, headers, payload: { ...content, version: 3, reviewed: true, expression: '(3*x**2+2*x)/(x+1)', alternatives: ['(3*x**2+6*x+2)/(x+1)**2', '0', '3-1/(x+1)**2', '1'] } });
    assert.equal(critical.statusCode, 200, critical.body); assert.equal(critical.json().review_status, 'invalid'); assert.deepEqual(critical.json().verification.correctIndices, [0, 2]);
    const unknown = await app.inject({ method: 'PUT', url: `${base}/${id}`, headers, payload: { ...content, version: 4, reviewed: true, expression: 'sin(x)' } });
    assert.equal(unknown.json().review_status, 'indeterminate');
    assert.equal((await app.inject({ method: 'POST', url: `${base}/${id}/discard`, headers, payload: { version: 5, confirmed: false } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: `${base}/${id}/discard`, headers, payload: { version: 5, confirmed: true } })).statusCode, 200);
    assert.equal((await app.inject({ url: base, headers })).json().length, 0);
    assert.ok((await db('question_drafts').where({ id }).first()).discarded_at);
    await db('teacher_authorizations').where({ id: identityId }).update({ approved: false });
    assert.equal((await app.inject({ url: base, headers })).statusCode, 403);
  } finally {
    await app.close();
    // Solo fixtures identificados mediante UUID de esta ejecución, en auligma_test validada.
    await db.transaction(async tx => {
      await tx('question_drafts').where({ teacher_id: teacherId }).delete();
      await tx('audit_events').where({ actor_id: teacherId }).delete();
      await tx('academic_materials').where({ id: materialId }).delete();
      await tx('academic_nodes').where({ plan_id: planId }).delete();
      await tx('academic_plans').where({ id: planId }).delete();
      await tx('sessions').whereIn('user_id', [teacherId, otherTeacher]).delete();
      await tx('classrooms').whereIn('id', [classroomId, otherRoom]).delete();
      await tx('subjects').where({ id: subjectId }).delete();
      await tx('teacher_authorizations').whereIn('id', [identityId, otherTeacher]).delete();
      await tx('external_identities').whereIn('id', [identityId, otherTeacher]).delete();
      await tx('teacher_profiles').whereIn('user_id', [teacherId, otherTeacher]).delete();
      await tx('users').whereIn('id', [teacherId, otherTeacher]).delete();
    });
    await db.destroy();
  }
});
