import { randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

process.env.AI_PROVIDER = 'ollama';
const [{ verifiedTestDatabase }, { buildApp, hash }, { readConfig }] = await Promise.all([
  import('../server/tests/test-database.ts'), import('../server/app.ts'), import('../server/config.ts'),
]);
const url = process.env.DATABASE_TEST_URL;
const db = await verifiedTestDatabase(url);
await db.migrate.latest();
const config = readConfig({ ...process.env, DATABASE_URL: url });
const app = await buildApp(config, db);
const teacherId = randomUUID(), studentId = randomUUID(), identityId = randomUUID(), subjectId = randomUUID(), classroomId = randomUUID();
const teacherToken = randomBytes(32).toString('base64url'), secondToken = randomBytes(32).toString('base64url'), studentToken = randomBytes(32).toString('base64url');
const csrf = 'synthetic-question-flow';
const headers = (token: string) => ({ cookie: `auligma_session=${token}`, origin: config.frontendUrl, 'x-csrf-token': csrf });
let draftId: string | undefined;
const started = performance.now();
try {
  await db.transaction(async tx => {
    await tx('users').insert([{ id: teacherId, email: `${randomUUID()}@example.invalid`, role: 'docente' }, { id: studentId, email: `${randomUUID()}@undc.edu.pe`, role: 'estudiante' }]);
    await tx('teacher_profiles').insert({ user_id: teacherId, first_names: 'Docente', last_names: 'Sintético' });
    await tx('student_profiles').insert({ user_id: studentId, first_names: 'Estudiante', last_names: 'Sintético', school_id: 4 });
    await tx('external_identities').insert({ id: identityId, user_id: teacherId, provider: 'google', subject: identityId });
    await tx('teacher_authorizations').insert({ id: identityId, email: `${randomUUID()}@example.invalid`, google_sub: identityId, kind: 'institutional', evidence: 'Aceptación sintética local' });
    await tx('subjects').insert({ id: subjectId, teacher_id: teacherId, name: 'Cálculo sintético' });
    await tx('classrooms').insert({ id: classroomId, teacher_id: teacherId, subject_id: subjectId, section: 'QA', period: '2099-I', shift: 'Mañana' });
    await tx('sessions').insert([{ token_hash: hash(teacherToken), user_id: teacherId, csrf_token: csrf, expires_at: new Date(Date.now() + 300000) },
      { token_hash: hash(secondToken), user_id: teacherId, csrf_token: csrf, expires_at: new Date(Date.now() + 300000) },
      { token_hash: hash(studentToken), user_id: studentId, csrf_token: csrf, expires_at: new Date(Date.now() + 300000) }]);
  });
  const generated = await app.inject({ method: 'POST', url: `/api/v1/classrooms/${classroomId}/ai/questions`, headers: headers(teacherToken),
    payload: { topic: 'Regla del cociente', subtopic: 'Derivada de funciones racionales', sourceText: '', difficulty: 'intermedia', consent: true } });
  assert.equal(generated.statusCode, 200, generated.body);
  const question = generated.json();
  assert.equal(question.alternatives.length, 4); assert.ok(question.expression); assert.equal(question.publicationAllowed, false);
  const checked = await app.inject({ method: 'POST', url: `/api/v1/classrooms/${classroomId}/ai/verify`, headers: headers(teacherToken),
    payload: { operation: 'derivative', expression: question.expression, alternatives: question.alternatives, reviewed: true } });
  assert.equal(checked.statusCode, 200, checked.body); assert.equal(checked.json().singleChoiceValid, true); assert.equal(checked.json().publicationAllowed, false);
  const base = `/api/v1/classrooms/${classroomId}/question-drafts`;
  const saved = await app.inject({ method: 'POST', url: base, headers: headers(teacherToken), payload: { statement: question.statement, alternatives: question.alternatives,
    proposedAnswer: question.proposedAnswer, explanation: question.explanation, difficulty: 'intermedia', topic: 'Regla del cociente', operation: 'derivative', expression: question.expression,
    reviewed: true, nodeId: null, materialId: null } });
  assert.equal(saved.statusCode, 201, saved.body); draftId = saved.json().id;
  const reconnect = await verifiedTestDatabase(url);
  try { const row = await reconnect('question_drafts').where({ id: draftId }).first(); assert.equal(row.node_id, null); assert.equal(row.material_id, null); assert.equal(row.version, 1); }
  finally { await reconnect.destroy(); }
  const recovered = await app.inject({ url: `${base}/${draftId}`, headers: headers(secondToken) });
  assert.equal(recovered.statusCode, 200, recovered.body); assert.equal(recovered.json().content.statement, question.statement);
  const edited = await app.inject({ method: 'PUT', url: `${base}/${draftId}`, headers: headers(secondToken), payload: { ...recovered.json().content,
    explanation: `${recovered.json().content.explanation} Revisión docente sintética.`, version: 1 } });
  assert.equal(edited.statusCode, 200, edited.body); assert.equal(edited.json().version, 2); assert.match(edited.json().content.explanation, /Revisión docente sintética/);
  assert.equal((await app.inject({ url: base, headers: headers(studentToken) })).statusCode, 403);
  process.stdout.write(JSON.stringify({ database: 'auligma_test', generation: 'qwen3:4b-real', generated: true, sympySingleChoice: true,
    persistedAfterReconnect: true, recoveredWithSecondSession: true, editedVersion: 2, studentDenied: true, publicationAllowed: false,
    elapsedMs: Math.round(performance.now() - started) }));
} finally {
  await app.close();
  await db.transaction(async tx => {
    if (draftId) await tx('question_drafts').where({ id: draftId }).delete();
    await tx('audit_events').whereIn('actor_id', [teacherId, studentId]).delete();
    await tx('sessions').whereIn('user_id', [teacherId, studentId]).delete();
    await tx('classrooms').where({ id: classroomId }).delete(); await tx('subjects').where({ id: subjectId }).delete();
    await tx('teacher_authorizations').where({ id: identityId }).delete(); await tx('external_identities').where({ id: identityId }).delete();
    await tx('teacher_profiles').where({ user_id: teacherId }).delete(); await tx('student_profiles').where({ user_id: studentId }).delete();
    await tx('users').whereIn('id', [teacherId, studentId]).delete();
  });
  await db.destroy();
}
