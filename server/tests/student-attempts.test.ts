import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { buildApp, hash } from '../app.ts';
import { readConfig } from '../config.ts';
import { verifiedTestDatabase } from './test-database.ts';

const url = process.env.DATABASE_TEST_URL;
const migration = '202611040002_student_attempts.mjs';
const gradingMigration = '202611050001_attempt_grading.mjs';
const publicationMigration = '202611040001_assessment_publication.mjs';
const foundationMigration = '202611030002_assessment_foundation.mjs';

test('Hito 4: intento estudiantil aislado, versionado, idempotente y sin soluciones', { skip: !url && 'Falta DATABASE_TEST_URL', timeout: 180000 }, async () => {
  const db = await verifiedTestDatabase(url); await db.migrate.latest();
  const ids = { teacher: randomUUID(), student: randomUUID(), otherStudent: randomUUID(), subject: randomUUID(), classroom: randomUUID(),
    enrollment: randomUUID(), otherEnrollment: randomUUID(), draft: randomUUID(), revision: randomUUID(), assessment: randomUUID(), version: randomUUID(), versionItem: randomUUID(),
    upcomingAssessment: randomUUID(), upcomingVersion: randomUUID(), upcomingItem: randomUUID() };
  const token = randomBytes(32).toString('base64url'); const otherToken = randomBytes(32).toString('base64url'); const csrf = 'attempt-csrf';
  const config = readConfig({ DATABASE_URL: url });
  const headers = (value: string, withCsrf = true) => ({ cookie: `auligma_session=${value}`, origin: config.frontendUrl, ...(withCsrf ? { 'x-csrf-token': csrf } : {}) });
  const optionA = randomUUID(); const optionB = randomUUID();
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;
  try {
    await db.transaction(async tx => {
      await tx('users').insert([
        { id: ids.teacher, email: `${randomUUID()}@example.invalid`, role: 'docente' },
        { id: ids.student, email: `${randomUUID()}@undc.edu.pe`, role: 'estudiante' },
        { id: ids.otherStudent, email: `${randomUUID()}@undc.edu.pe`, role: 'estudiante' },
      ]);
      await tx('teacher_profiles').insert({ user_id: ids.teacher, first_names: 'Docente', last_names: 'Sintético' });
      await tx('student_profiles').insert([{ user_id: ids.student, first_names: 'Ada', last_names: 'Prueba' }, { user_id: ids.otherStudent, first_names: 'Otra', last_names: 'Persona' }]);
      await tx('subjects').insert({ id: ids.subject, teacher_id: ids.teacher, name: 'Intentos sintéticos' });
      await tx('classrooms').insert({ id: ids.classroom, subject_id: ids.subject, teacher_id: ids.teacher, section: 'H4', period: '2099-I', shift: 'Mañana' });
      await tx('enrollments').insert([
        { id: ids.enrollment, classroom_id: ids.classroom, institutional_email: (await tx('users').where({ id: ids.student }).first()).email,
          student_user_id: ids.student, status: 'active', authorized_by: ids.teacher, authorized_at: tx.fn.now(), linked_at: tx.fn.now() },
        { id: ids.otherEnrollment, classroom_id: ids.classroom, institutional_email: (await tx('users').where({ id: ids.otherStudent }).first()).email,
          student_user_id: ids.otherStudent, status: 'active', authorized_by: ids.teacher, authorized_at: tx.fn.now(), linked_at: tx.fn.now() },
      ]);
      await tx('sessions').insert([
        { token_hash: hash(token), user_id: ids.student, csrf_token: csrf, expires_at: new Date(Date.now() + 300000) },
        { token_hash: hash(otherToken), user_id: ids.otherStudent, csrf_token: csrf, expires_at: new Date(Date.now() + 300000) },
      ]);
      const draftContent = { statement: 'Deriva x².', alternatives: ['2x', 'x'], proposedAnswer: 0, explanation: 'Se aplica la regla de potencia.', difficulty: 'básica', topic: 'Derivadas', operation: 'derivative', expression: 'x**2', reviewed: true, nodeId: null, materialId: null };
      await tx('question_drafts').insert({ id: ids.draft, teacher_id: ids.teacher, classroom_id: ids.classroom, content: JSON.stringify(draftContent), review_status: 'reviewed' });
      const revisionContent = { ...draftContent, alternatives: [{ id: optionA, text: '2x' }, { id: optionB, text: 'x' }] };
      await tx('question_revisions').insert({ id: ids.revision, question_draft_id: ids.draft, classroom_id: ids.classroom, teacher_id: ids.teacher,
        revision: 1, content: JSON.stringify(revisionContent), correct_option_id: optionA, verification: JSON.stringify({ status: 'VERIFICADO', correctIndices: [0] }),
        review_status: 'approved', content_hash: 'c'.repeat(64), created_by: ids.teacher, approved_by: ids.teacher, approved_at: tx.fn.now() });
      await tx('assessments').insert({ id: ids.assessment, classroom_id: ids.classroom, teacher_id: ids.teacher, type: 'practice', status: 'published', title: 'Práctica segura', instructions: 'Responde una pregunta.', version: 2 });
      await tx('assessment_versions').insert({ id: ids.version, assessment_id: ids.assessment, classroom_id: ids.classroom, revision: 1, source_version: 1,
        settings: JSON.stringify({ title: 'Práctica segura', instructions: 'Responde una pregunta.', type: 'practice' }), total_points: 2,
        content_hash: 'd'.repeat(64), published_by: ids.teacher, published_at: tx.fn.now(), opens_at: new Date(Date.now() - 60000), closes_at: new Date(Date.now() + 3600000) });
      await tx('assessment_version_items').insert({ id: ids.versionItem, assessment_version_id: ids.version, classroom_id: ids.classroom,
        question_revision_id: ids.revision, position: 1, points: 2, settings: '{}' });
      await tx('assessments').insert({ id: ids.upcomingAssessment, classroom_id: ids.classroom, teacher_id: ids.teacher, type: 'practice', status: 'published', title: 'Práctica próxima', instructions: '', version: 2 });
      await tx('assessment_versions').insert({ id: ids.upcomingVersion, assessment_id: ids.upcomingAssessment, classroom_id: ids.classroom, revision: 1, source_version: 1,
        settings: JSON.stringify({ title: 'Práctica próxima', instructions: '', type: 'practice' }), total_points: 2, content_hash: 'e'.repeat(64),
        published_by: ids.teacher, published_at: tx.fn.now(), opens_at: new Date(Date.now() + 3600000), closes_at: new Date(Date.now() + 7200000) });
      await tx('assessment_version_items').insert({ id: ids.upcomingItem, assessment_version_id: ids.upcomingVersion, classroom_id: ids.classroom,
        question_revision_id: ids.revision, position: 1, points: 2, settings: '{}' });
    });
    app = await buildApp(config, db); const activity = `/api/v1/classrooms/${ids.classroom}/activities/${ids.version}`;
    const list = await app.inject({ url: `/api/v1/classrooms/${ids.classroom}/activities`, headers: headers(token) });
    assert.equal(list.statusCode, 200, list.body); assert.equal(list.json().find((row: { id: string }) => row.id === ids.version).state, 'available');
    assert.doesNotMatch(list.body, /correctOptionId|verification|contentHash|explanation|expression/);
    const upcoming = await app.inject({ url: `/api/v1/classrooms/${ids.classroom}/activities/${ids.upcomingVersion}`, headers: headers(token) });
    assert.equal(upcoming.statusCode, 200); assert.equal(upcoming.json().state, 'upcoming'); assert.equal(upcoming.json().canStart, false);
    assert.equal((await app.inject({ method: 'POST', url: `/api/v1/classrooms/${ids.classroom}/activities/${ids.upcomingVersion}/attempts`,
      headers: headers(token), payload: { operationId: randomUUID() } })).statusCode, 409);
    await db('enrollments').where({ id: ids.otherEnrollment }).update({ status: 'revoked', revoked_at: db.fn.now() });
    assert.equal((await app.inject({ url: `/api/v1/classrooms/${ids.classroom}/activities`, headers: headers(otherToken) })).statusCode, 404);
    await db('enrollments').where({ id: ids.otherEnrollment }).update({ status: 'active', revoked_at: null });
    assert.equal((await app.inject({ method: 'POST', url: `${activity}/attempts`, headers: headers(token, false), payload: { operationId: randomUUID() } })).statusCode, 403);

    const operationId = randomUUID();
    const started = await Promise.all([1, 2].map(() => app!.inject({ method: 'POST', url: `${activity}/attempts`, headers: headers(token), payload: { operationId } })));
    assert.deepEqual(started.map(response => response.statusCode), [201, 201]);
    assert.equal(started[0].json().id, started[1].json().id);
    const resumed = await app.inject({ method: 'POST', url: `${activity}/attempts`, headers: headers(token), payload: { operationId: randomUUID() } });
    assert.equal(resumed.statusCode, 201); assert.equal(resumed.json().id, started[0].json().id);
    assert.doesNotMatch(started[0].body, /correctOptionId|verification|contentHash|explanation|expression|proposedAnswer/);
    const attempt = started[0].json(); const itemId = attempt.questions[0].id;
    assert.equal((await app.inject({ url: `/api/v1/classrooms/${ids.classroom}/attempts/${attempt.id}`, headers: headers(otherToken) })).statusCode, 404);

    const saveOperation = randomUUID();
    const saved = await app.inject({ method: 'PATCH', url: `/api/v1/classrooms/${ids.classroom}/attempts/${attempt.id}/answers/${itemId}`,
      headers: headers(token), payload: { version: attempt.version, operationId: saveOperation, selectedOptionId: optionA } });
    assert.equal(saved.statusCode, 200, saved.body); assert.equal(saved.json().answeredCount, 1); assert.equal(saved.json().version, attempt.version + 1);
    const retry = await app.inject({ method: 'PATCH', url: `/api/v1/classrooms/${ids.classroom}/attempts/${attempt.id}/answers/${itemId}`,
      headers: headers(token), payload: { version: attempt.version, operationId: saveOperation, selectedOptionId: optionA } });
    assert.equal(retry.statusCode, 200, retry.body); assert.equal(retry.json().version, saved.json().version);
    assert.equal((await app.inject({ method: 'PATCH', url: `/api/v1/classrooms/${ids.classroom}/attempts/${attempt.id}/answers/${itemId}`,
      headers: headers(token), payload: { version: attempt.version, operationId: randomUUID(), selectedOptionId: optionB } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'PATCH', url: `/api/v1/classrooms/${ids.classroom}/attempts/${attempt.id}/answers/${itemId}`,
      headers: headers(token), payload: { version: saved.json().version, operationId: randomUUID(), selectedOptionId: randomUUID() } })).statusCode, 404);

    const submitOperation = randomUUID();
    const submitted = await app.inject({ method: 'POST', url: `/api/v1/classrooms/${ids.classroom}/attempts/${attempt.id}/submit`, headers: headers(token),
      payload: { version: saved.json().version, operationId: submitOperation, confirmed: true } });
    assert.equal(submitted.statusCode, 200, submitted.body); assert.equal(submitted.json().status, 'graded');
    const submitRetry = await app.inject({ method: 'POST', url: `/api/v1/classrooms/${ids.classroom}/attempts/${attempt.id}/submit`, headers: headers(token),
      payload: { version: saved.json().version, operationId: submitOperation, confirmed: true } });
    assert.equal(submitRetry.statusCode, 200, submitRetry.body); assert.equal(submitRetry.json().status, 'graded');
    assert.equal((await app.inject({ method: 'POST', url: `${activity}/attempts`, headers: headers(token), payload: { operationId: randomUUID() } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'PATCH', url: `/api/v1/classrooms/${ids.classroom}/attempts/${attempt.id}/answers/${itemId}`,
      headers: headers(token), payload: { version: submitted.json().version, operationId: randomUUID(), selectedOptionId: optionB } })).statusCode, 409);
    await assert.rejects(db('attempt_answers').where({ attempt_id: attempt.id }).update({ answer: JSON.stringify({ selectedOptionId: optionB }), version: 3 }), (error: { code?: string }) => error.code === '55000');
    assert.equal(Number((await db('attempts').where({ assessment_version_id: ids.version, student_user_id: ids.student }).count('* as n').first())?.n), 1);
    assert.equal(Number((await db('audit_events').where({ resource_id: attempt.id, action: 'attempt.submitted' }).count('* as n').first())?.n), 1);
  } finally {
    if (app) await app.close();
    await db.migrate.down({ name: gradingMigration });
    await db.migrate.down({ name: migration });
    await db.migrate.down({ name: publicationMigration });
    await db.migrate.down({ name: foundationMigration });
    await db.transaction(async tx => {
      await tx('audit_events').whereIn('actor_id', [ids.student, ids.otherStudent]).delete();
      await tx('question_drafts').where({ id: ids.draft }).delete();
      await tx('sessions').whereIn('user_id', [ids.student, ids.otherStudent]).delete();
      await tx('enrollments').whereIn('id', [ids.enrollment, ids.otherEnrollment]).delete();
      await tx('classrooms').where({ id: ids.classroom }).delete(); await tx('subjects').where({ id: ids.subject }).delete();
      await tx('student_profiles').whereIn('user_id', [ids.student, ids.otherStudent]).delete(); await tx('teacher_profiles').where({ user_id: ids.teacher }).delete();
      await tx('users').whereIn('id', [ids.teacher, ids.student, ids.otherStudent]).delete();
    });
    await db.migrate.up({ name: foundationMigration });
    await db.migrate.up({ name: publicationMigration });
    await db.migrate.up({ name: migration }); await db.migrate.up({ name: gradingMigration }); await db.destroy();
  }
});
