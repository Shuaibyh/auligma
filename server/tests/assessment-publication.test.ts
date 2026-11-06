import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { buildApp, hash } from '../app.ts';
import { readConfig } from '../config.ts';
import { verifiedTestDatabase } from './test-database.ts';

const url = process.env.DATABASE_TEST_URL;
const foundationMigration = '202611030002_assessment_foundation.mjs';
const publicationMigration = '202611040001_assessment_publication.mjs';
const attemptsMigration = '202611040002_student_attempts.mjs';
const gradingMigration = '202611050001_attempt_grading.mjs';

test('Hito 3: publicación transaccional, inmutable, aislada e idempotente', { skip: !url && 'Falta DATABASE_TEST_URL', timeout: 180000 }, async () => {
  const db = await verifiedTestDatabase(url);
  await db.migrate.latest();
  const ids = {
    teacher: randomUUID(), otherTeacher: randomUUID(), student: randomUUID(), subject: randomUUID(), otherSubject: randomUUID(),
    classroom: randomUUID(), otherClassroom: randomUUID(), identity: randomUUID(), otherIdentity: randomUUID(), studentIdentity: randomUUID(),
    draft: randomUUID(), draftPending: randomUUID(), revision: randomUUID(), pendingRevision: randomUUID(),
  };
  const teacherToken = randomBytes(32).toString('base64url');
  const otherToken = randomBytes(32).toString('base64url');
  const studentToken = randomBytes(32).toString('base64url');
  const teacherEmail = `${randomUUID()}@example.invalid`;
  const otherEmail = `${randomUUID()}@example.invalid`;
  const studentEmail = `${randomUUID()}@undc.edu.pe`;
  const csrf = 'publication-csrf';
  const config = readConfig({ DATABASE_URL: url });
  const headers = (token: string, includeCsrf = true) => ({ cookie: `auligma_session=${token}`, origin: config.frontendUrl, ...(includeCsrf ? { 'x-csrf-token': csrf } : {}) });
  const base = `/api/v1/classrooms/${ids.classroom}/assessments`;
  const availability = { opensAt: '2099-04-01T13:00:00-05:00', dueAt: '2099-04-02T13:00:00-05:00', closesAt: '2099-04-03T13:00:00-05:00' };
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;
  const assessments: string[] = [];
  async function assessment(options: { status?: string; version?: number; item?: 'approved' | 'pending' | 'gap' | 'none' } = {}) {
    const id = randomUUID(); assessments.push(id);
    await db('assessments').insert({ id, classroom_id: ids.classroom, teacher_id: ids.teacher, type: 'practice', status: options.status ?? 'draft',
      title: `Práctica sintética ${assessments.length}`, instructions: 'Contenido sintético para probar publicación.', version: options.version ?? 1 });
    if (options.item && options.item !== 'none') await db('assessment_items').insert({ id: randomUUID(), assessment_id: id, classroom_id: ids.classroom,
      question_revision_id: options.item === 'pending' ? ids.pendingRevision : ids.revision, position: options.item === 'gap' ? 2 : 1, points: 2 });
    return id;
  }
  try {
    await db.transaction(async tx => {
      await tx('users').insert([
        { id: ids.teacher, email: teacherEmail, role: 'docente' }, { id: ids.otherTeacher, email: otherEmail, role: 'docente' },
        { id: ids.student, email: studentEmail, role: 'estudiante' },
      ]);
      await tx('teacher_profiles').insert([{ user_id: ids.teacher, first_names: 'Docente', last_names: 'Publicación' }, { user_id: ids.otherTeacher, first_names: 'Otro', last_names: 'Docente' }]);
      await tx('student_profiles').insert({ user_id: ids.student, first_names: 'Estudiante', last_names: 'Sintético' });
      await tx('external_identities').insert([
        { id: randomUUID(), user_id: ids.teacher, provider: 'google', subject: ids.identity },
        { id: randomUUID(), user_id: ids.otherTeacher, provider: 'google', subject: ids.otherIdentity },
        { id: randomUUID(), user_id: ids.student, provider: 'google', subject: ids.studentIdentity, hosted_domain: 'undc.edu.pe' },
      ]);
      await tx('teacher_authorizations').insert([
        { id: randomUUID(), email: teacherEmail, google_sub: ids.identity, kind: 'institutional', evidence: 'Fixture sintético Hito 3' },
        { id: randomUUID(), email: otherEmail, google_sub: ids.otherIdentity, kind: 'institutional', evidence: 'Fixture sintético Hito 3' },
      ]);
      await tx('subjects').insert([{ id: ids.subject, teacher_id: ids.teacher, name: 'Publicación sintética' }, { id: ids.otherSubject, teacher_id: ids.otherTeacher, name: 'Otra aula sintética' }]);
      await tx('classrooms').insert([
        { id: ids.classroom, subject_id: ids.subject, teacher_id: ids.teacher, section: 'H3', period: '2099-I', shift: 'Mañana' },
        { id: ids.otherClassroom, subject_id: ids.otherSubject, teacher_id: ids.otherTeacher, section: 'H3B', period: '2099-I', shift: 'Tarde' },
      ]);
      await tx('sessions').insert([
        { token_hash: hash(teacherToken), user_id: ids.teacher, csrf_token: csrf, expires_at: new Date(Date.now() + 300000) },
        { token_hash: hash(otherToken), user_id: ids.otherTeacher, csrf_token: csrf, expires_at: new Date(Date.now() + 300000) },
        { token_hash: hash(studentToken), user_id: ids.student, csrf_token: csrf, expires_at: new Date(Date.now() + 300000) },
      ]);
      const draftContent = { statement: 'Deriva x².', alternatives: ['2x', 'x'], proposedAnswer: 0, explanation: 'Regla de la potencia.', difficulty: 'básica', topic: 'Derivadas', operation: 'derivative', expression: 'x**2', reviewed: true, nodeId: null, materialId: null };
      await tx('question_drafts').insert([
        { id: ids.draft, teacher_id: ids.teacher, classroom_id: ids.classroom, content: JSON.stringify(draftContent), review_status: 'reviewed' },
        { id: ids.draftPending, teacher_id: ids.teacher, classroom_id: ids.classroom, content: JSON.stringify(draftContent), review_status: 'reviewed' },
      ]);
      const revisionContent = { ...draftContent, alternatives: [{ id: randomUUID(), text: '2x' }, { id: randomUUID(), text: 'x' }] };
      await tx('question_revisions').insert([
        { id: ids.revision, question_draft_id: ids.draft, classroom_id: ids.classroom, teacher_id: ids.teacher, revision: 1,
          content: JSON.stringify(revisionContent), correct_option_id: revisionContent.alternatives[0].id, verification: JSON.stringify({ status: 'VERIFICADO', singleChoiceValid: true, correctIndices: [0] }),
          review_status: 'approved', content_hash: 'a'.repeat(64), created_by: ids.teacher, approved_by: ids.teacher, approved_at: tx.fn.now() },
        { id: ids.pendingRevision, question_draft_id: ids.draftPending, classroom_id: ids.classroom, teacher_id: ids.teacher, revision: 1,
          content: JSON.stringify(revisionContent), correct_option_id: revisionContent.alternatives[0].id, verification: JSON.stringify({ status: 'VERIFICADO', singleChoiceValid: true, correctIndices: [0] }),
          review_status: 'draft', content_hash: 'b'.repeat(64), created_by: ids.teacher },
      ]);
    });
    app = await buildApp(config, db);

    const validId = await assessment({ item: 'approved' });
    const publishUrl = `${base}/${validId}/publish`;
    assert.equal((await app.inject({ method: 'POST', url: publishUrl, headers: headers(teacherToken, false), payload: { version: 1, confirmed: true, ...availability } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: publishUrl, headers: headers(studentToken), payload: { version: 1, confirmed: true, ...availability } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: publishUrl, headers: headers(otherToken), payload: { version: 1, confirmed: true, ...availability } })).statusCode, 404);
    const published = await app.inject({ method: 'POST', url: publishUrl, headers: headers(teacherToken), payload: { version: 1, confirmed: true, ...availability } });
    assert.equal(published.statusCode, 200, published.body);
    assert.equal(published.json().sourceVersion, 1); assert.equal(published.json().revision, 1); assert.equal(published.json().items.length, 1);
    assert.match(published.json().contentHash, /^[0-9a-f]{64}$/);
    const retry = await app.inject({ method: 'POST', url: publishUrl, headers: headers(teacherToken), payload: { version: 1, confirmed: true, ...availability } });
    assert.equal(retry.statusCode, 200, retry.body); assert.equal(retry.json().id, published.json().id);
    assert.equal(Number((await db('assessment_versions').where({ assessment_id: validId }).count('* as n').first())?.n), 1);

    const concurrentId = await assessment({ item: 'approved' });
    const concurrent = await Promise.all([1, 2].map(() => app!.inject({ method: 'POST', url: `${base}/${concurrentId}/publish`, headers: headers(teacherToken), payload: { version: 1, confirmed: true, ...availability } })));
    assert.deepEqual(concurrent.map(response => response.statusCode), [200, 200]);
    assert.equal(concurrent[0].json().id, concurrent[1].json().id);
    assert.equal(Number((await db('assessment_versions').where({ assessment_id: concurrentId }).count('* as n').first())?.n), 1);

    const emptyId = await assessment({ item: 'none' });
    assert.equal((await app.inject({ method: 'POST', url: `${base}/${emptyId}/publish`, headers: headers(teacherToken), payload: { version: 1, confirmed: true, ...availability } })).statusCode, 409);
    const gapId = await assessment({ item: 'gap' });
    assert.equal((await app.inject({ method: 'POST', url: `${base}/${gapId}/publish`, headers: headers(teacherToken), payload: { version: 1, confirmed: true, ...availability } })).statusCode, 409);
    const pendingId = await assessment({ item: 'pending' });
    assert.equal((await app.inject({ method: 'POST', url: `${base}/${pendingId}/publish`, headers: headers(teacherToken), payload: { version: 1, confirmed: true, ...availability } })).statusCode, 409);
    const staleId = await assessment({ item: 'approved', version: 2 });
    assert.equal((await app.inject({ method: 'POST', url: `${base}/${staleId}/publish`, headers: headers(teacherToken), payload: { version: 1, confirmed: true, ...availability } })).statusCode, 409);
    const invalidDatesId = await assessment({ item: 'approved' });
    assert.equal((await app.inject({ method: 'POST', url: `${base}/${invalidDatesId}/publish`, headers: headers(teacherToken), payload: { version: 1, confirmed: true, opensAt: availability.closesAt, dueAt: availability.opensAt, closesAt: availability.dueAt } })).statusCode, 400);
    assert.equal(Number((await db('assessment_versions').whereIn('assessment_id', [emptyId, gapId, pendingId, staleId, invalidDatesId]).count('* as n').first())?.n), 0);
    await assert.rejects(db('assessment_items').insert({ id: randomUUID(), assessment_id: emptyId, classroom_id: ids.classroom, question_revision_id: ids.revision, position: 1, points: 0 }), (error: { code?: string }) => error.code === '23514');

    const versions = await app.inject({ url: `${base}/${validId}/versions`, headers: headers(teacherToken) });
    assert.equal(versions.statusCode, 200); assert.equal(versions.json().length, 1);
    const preview = await app.inject({ url: `${base}/${validId}/versions/${published.json().id}/preview`, headers: headers(teacherToken) });
    assert.equal(preview.statusCode, 200); assert.equal(preview.json().contentHash, published.json().contentHash);
    assert.equal((await app.inject({ url: `${base}/${validId}/versions`, headers: headers(studentToken) })).statusCode, 403);
    assert.equal((await app.inject({ url: `${base}/${validId}/versions`, headers: headers(otherToken) })).statusCode, 404);
    await assert.rejects(db('assessment_versions').where({ id: published.json().id }).update({ total_points: 99 }), (error: { code?: string }) => error.code === '55000');
    await assert.rejects(db('assessment_version_items').where({ assessment_version_id: published.json().id }).delete(), (error: { code?: string }) => error.code === '55000');

    const closePayload = { version: 2, confirmed: true };
    assert.equal((await app.inject({ method: 'POST', url: `${base}/${validId}/close`, headers: headers(otherToken), payload: closePayload })).statusCode, 404);
    const closed = await app.inject({ method: 'POST', url: `${base}/${validId}/close`, headers: headers(teacherToken), payload: closePayload });
    assert.equal(closed.statusCode, 200, closed.body); assert.equal(closed.json().status, 'closed'); assert.equal(closed.json().version, 3);
    const closedRetry = await app.inject({ method: 'POST', url: `${base}/${validId}/close`, headers: headers(teacherToken), payload: closePayload });
    assert.equal(closedRetry.statusCode, 200); assert.equal(closedRetry.json().version, 3);
    assert.equal(Number((await db('audit_events').where({ resource_id: validId, action: 'assessment.closed' }).count('* as n').first())?.n), 1);
    assert.equal(Number((await db('assessment_versions').where({ assessment_id: validId }).count('* as n').first())?.n), 1);
  } finally {
    if (app) await app.close();
    await db.migrate.down({ name: gradingMigration });
    await db.migrate.down({ name: attemptsMigration });
    await db.migrate.down({ name: publicationMigration });
    await db.migrate.down({ name: foundationMigration });
    await db.transaction(async tx => {
      await tx('audit_events').whereIn('actor_id', [ids.teacher, ids.otherTeacher, ids.student]).delete();
      await tx('question_drafts').whereIn('id', [ids.draft, ids.draftPending]).delete();
      await tx('sessions').whereIn('user_id', [ids.teacher, ids.otherTeacher, ids.student]).delete();
      await tx('classrooms').whereIn('id', [ids.classroom, ids.otherClassroom]).delete();
      await tx('subjects').whereIn('id', [ids.subject, ids.otherSubject]).delete();
      await tx('teacher_authorizations').whereIn('google_sub', [ids.identity, ids.otherIdentity]).delete();
      await tx('external_identities').whereIn('user_id', [ids.teacher, ids.otherTeacher, ids.student]).delete();
      await tx('student_profiles').where({ user_id: ids.student }).delete();
      await tx('teacher_profiles').whereIn('user_id', [ids.teacher, ids.otherTeacher]).delete();
      await tx('users').whereIn('id', [ids.teacher, ids.otherTeacher, ids.student]).delete();
    });
    await db.migrate.up({ name: foundationMigration });
    await db.migrate.up({ name: publicationMigration });
    await db.migrate.up({ name: attemptsMigration });
    await db.migrate.up({ name: gradingMigration });
    await db.destroy();
  }
});
