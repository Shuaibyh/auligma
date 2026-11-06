import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { buildApp, hash } from '../app.ts';
import { revisionContentHash } from '../assessments.ts';
import { readConfig } from '../config.ts';
import { createDatabase } from '../db.ts';
import { verifiedTestDatabase } from './test-database.ts';

const url = process.env.DATABASE_TEST_URL;
const migration = '202611030002_assessment_foundation.mjs';
const publicationMigration = '202611040001_assessment_publication.mjs';
const attemptsMigration = '202611040002_student_attempts.mjs';
const gradingMigration = '202611050001_attempt_grading.mjs';
const validContent = (expression = 'x**2', alternatives = ['2*x', 'x', '0', '1']) => ({
  statement: `Pregunta sintética sobre ${expression}`, alternatives, proposedAnswer: 0,
  explanation: 'Explicación sintética revisada por el docente.', difficulty: 'intermedia', topic: 'Derivadas sintéticas',
  operation: 'derivative', expression, reviewed: true, nodeId: null, materialId: null,
});

test('Hito 2: la huella de revisión es determinista e independiente de la evidencia matemática', () => {
  const content = {
    statement: 'Pregunta sintética sobre x**2', alternatives: [{ id: '11111111-1111-4111-8111-111111111111', text: '2*x' }],
    explanation: 'Explicación sintética.', difficulty: 'intermedia', topic: 'Derivadas sintéticas', operation: 'derivative' as const,
    expression: 'x**2', nodeId: null, materialId: null,
  };
  const correctOptionId = content.alternatives[0].id;
  const before = revisionContentHash(content, correctOptionId);
  const after = revisionContentHash(JSON.parse(JSON.stringify(content)), correctOptionId);
  assert.equal(before, after);
  assert.equal(before.length, 64);
});

test('PostgreSQL real: migración aditiva de evaluaciones admite rollback y reaplicación', { skip: !url && 'Falta DATABASE_TEST_URL', timeout: 30000 }, async () => {
  const db = await verifiedTestDatabase(url);
  try {
    await db.migrate.latest();
    assert.equal(await db.schema.hasTable('question_revisions'), true);
    assert.equal(await db.schema.hasTable('assessments'), true);
    assert.equal(await db.schema.hasTable('assessment_versions'), true);
    await db.migrate.down({ name: gradingMigration });
    await db.migrate.down({ name: attemptsMigration });
    await db.migrate.down({ name: publicationMigration });
    await db.migrate.down({ name: migration });
    assert.equal(await db.schema.hasTable('question_revisions'), false);
    assert.equal(await db.schema.hasTable('assessments'), false);
    assert.equal(await db.schema.hasTable('question_drafts'), true);
    await db.migrate.up({ name: migration });
    await db.migrate.up({ name: publicationMigration });
    await db.migrate.up({ name: attemptsMigration });
    await db.migrate.up({ name: gradingMigration });
    assert.equal(await db.schema.hasTable('assessment_version_items'), true);
  } finally { await db.destroy(); }
});

test('PostgreSQL real: revisiones inmutables y prácticas en borrador con aislamiento', { skip: !url && 'Falta DATABASE_TEST_URL', timeout: 150000 }, async () => {
  const db = await verifiedTestDatabase(url);
  await db.migrate.latest();
  const baseline = {
    users: Number((await db('users').count('* as n').first())?.n),
    enrollments: Number((await db('enrollments').count('* as n').first())?.n),
    drafts: Number((await db('question_drafts').count('* as n').first())?.n),
  };
  const teacherId = randomUUID(), otherTeacherId = randomUUID(), studentId = randomUUID();
  const subjectId = randomUUID(), otherSubjectId = randomUUID(), classroomId = randomUUID(), otherClassroomId = randomUUID();
  const validDraftId = randomUUID(), secondDraftId = randomUUID(), invalidDraftId = randomUUID(), indeterminateDraftId = randomUUID(), otherDraftId = randomUUID();
  const teacherIdentity = randomUUID(), otherIdentity = randomUUID(), studentIdentity = randomUUID();
  const teacherToken = randomBytes(32).toString('base64url'), otherToken = randomBytes(32).toString('base64url'), studentToken = randomBytes(32).toString('base64url');
  const teacherEmail = `${randomUUID()}@example.invalid`, otherEmail = `${randomUUID()}@example.invalid`, studentEmail = `${randomUUID()}@undc.edu.pe`;
  const csrf = 'assessment-csrf';
  const config = readConfig({ DATABASE_URL: url });
  const headers = (token: string) => ({ cookie: `auligma_session=${token}`, origin: config.frontendUrl, 'x-csrf-token': csrf });
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;
  try {
    await db.transaction(async tx => {
      await tx('users').insert([
        { id: teacherId, email: teacherEmail, role: 'docente' }, { id: otherTeacherId, email: otherEmail, role: 'docente' },
        { id: studentId, email: studentEmail, role: 'estudiante' },
      ]);
      await tx('teacher_profiles').insert([{ user_id: teacherId, first_names: 'Docente', last_names: 'Sintético' }, { user_id: otherTeacherId, first_names: 'Otro', last_names: 'Docente' }]);
      await tx('student_profiles').insert({ user_id: studentId, first_names: 'Estudiante', last_names: 'Sintético' });
      await tx('external_identities').insert([
        { id: randomUUID(), user_id: teacherId, provider: 'google', subject: teacherIdentity },
        { id: randomUUID(), user_id: otherTeacherId, provider: 'google', subject: otherIdentity },
        { id: randomUUID(), user_id: studentId, provider: 'google', subject: studentIdentity, hosted_domain: 'undc.edu.pe' },
      ]);
      await tx('teacher_authorizations').insert([
        { id: randomUUID(), email: teacherEmail, google_sub: teacherIdentity, kind: 'institutional', evidence: 'Fixture sintético Hito 1' },
        { id: randomUUID(), email: otherEmail, google_sub: otherIdentity, kind: 'institutional', evidence: 'Fixture sintético Hito 1' },
      ]);
      await tx('subjects').insert([{ id: subjectId, teacher_id: teacherId, name: `Práctica sintética ${randomUUID()}` }, { id: otherSubjectId, teacher_id: otherTeacherId, name: `Otra práctica ${randomUUID()}` }]);
      await tx('classrooms').insert([
        { id: classroomId, subject_id: subjectId, teacher_id: teacherId, section: 'H1', period: '2099-I', shift: 'Mañana' },
        { id: otherClassroomId, subject_id: otherSubjectId, teacher_id: otherTeacherId, section: 'H2', period: '2099-I', shift: 'Tarde' },
      ]);
      await tx('enrollments').insert({ id: randomUUID(), classroom_id: classroomId, institutional_email: studentEmail, student_user_id: studentId,
        status: 'active', authorized_by: teacherId, authorized_at: tx.fn.now(), linked_at: tx.fn.now() });
      await tx('sessions').insert([
        { token_hash: hash(teacherToken), user_id: teacherId, csrf_token: csrf, expires_at: new Date(Date.now() + 300000) },
        { token_hash: hash(otherToken), user_id: otherTeacherId, csrf_token: csrf, expires_at: new Date(Date.now() + 300000) },
        { token_hash: hash(studentToken), user_id: studentId, csrf_token: csrf, expires_at: new Date(Date.now() + 300000) },
      ]);
      await tx('question_drafts').insert([
        { id: validDraftId, teacher_id: teacherId, classroom_id: classroomId, content: JSON.stringify(validContent()), review_status: 'reviewed' },
        { id: secondDraftId, teacher_id: teacherId, classroom_id: classroomId, content: JSON.stringify(validContent('x**3', ['3*x**2', 'x**2', '3*x', '0'])), review_status: 'reviewed' },
        { id: invalidDraftId, teacher_id: teacherId, classroom_id: classroomId, content: JSON.stringify(validContent('x**2', ['2*x', '2*x', '0', '1'])), review_status: 'invalid' },
        { id: indeterminateDraftId, teacher_id: teacherId, classroom_id: classroomId, content: JSON.stringify(validContent('sin(x)', ['1', '0', 'x', '-1'])), review_status: 'indeterminate' },
        { id: otherDraftId, teacher_id: otherTeacherId, classroom_id: otherClassroomId, content: JSON.stringify(validContent()), review_status: 'reviewed' },
      ]);
    });
    app = await buildApp(config, db);
    const base = `/api/v1/classrooms/${classroomId}`;
    const createRevision = async (draftId: string) => app!.inject({ method: 'POST', url: `${base}/question-drafts/${draftId}/revisions`, headers: headers(teacherToken), payload: {} });
    const valid = await createRevision(validDraftId); assert.equal(valid.statusCode, 201, valid.body); assert.equal(valid.json().reviewStatus, 'draft');
    assert.equal(valid.json().content.alternatives.length, 4); assert.ok(valid.json().content.alternatives.every((item: { id: string }) => /^[0-9a-f-]{36}$/.test(item.id)));
    assert.ok(!Object.hasOwn(valid.json().content, 'proposedAnswer'));
    const duplicateRevision = await createRevision(validDraftId); assert.equal(duplicateRevision.statusCode, 409);
    const invalid = await createRevision(invalidDraftId); assert.equal(invalid.statusCode, 201, invalid.body); assert.equal(invalid.json().reviewStatus, 'invalid');
    const indeterminate = await createRevision(indeterminateDraftId); assert.equal(indeterminate.statusCode, 201, indeterminate.body); assert.equal(indeterminate.json().reviewStatus, 'indeterminate');
    const second = await createRevision(secondDraftId); assert.equal(second.statusCode, 201, second.body);

    const approve = (revisionId: string) => app!.inject({ method: 'POST', url: `${base}/question-revisions/${revisionId}/approve`, headers: headers(teacherToken), payload: { confirmed: true } });
    const approved = await approve(valid.json().id); assert.equal(approved.statusCode, 200, approved.body); assert.equal(approved.json().reviewStatus, 'approved');
    const approvedSecond = await approve(second.json().id); assert.equal(approvedSecond.statusCode, 200, approvedSecond.body);
    assert.equal((await approve(invalid.json().id)).statusCode, 409);
    assert.equal((await approve(indeterminate.json().id)).statusCode, 409);
    await assert.rejects(db('question_revisions').where({ id: valid.json().id }).update({ content_hash: 'f'.repeat(64) }), (error: { code?: string }) => error.code === '55000');

    const foreignOption = randomUUID();
    const otherRevisionId = randomUUID();
    await db('question_revisions').insert({ id: otherRevisionId, question_draft_id: otherDraftId, classroom_id: otherClassroomId, teacher_id: otherTeacherId,
      revision: 1, content: JSON.stringify({ ...validContent(), alternatives: [{ id: foreignOption, text: '2*x' }, { id: randomUUID(), text: 'x' }] }),
      correct_option_id: foreignOption, verification: JSON.stringify({ status: 'VERIFICADO', singleChoiceValid: true, correctIndices: [0] }),
      review_status: 'approved', content_hash: 'a'.repeat(64), created_by: otherTeacherId, approved_by: otherTeacherId, approved_at: db.fn.now() });

    const created = await app.inject({ method: 'POST', url: `${base}/assessments`, headers: headers(teacherToken), payload: { title: 'Práctica de derivadas', instructions: 'Resuelve con procedimiento.' } });
    assert.equal(created.statusCode, 201, created.body); assert.equal(created.json().status, 'draft'); assert.equal(created.json().publicationAllowed, false);
    const assessmentId = created.json().id;
    assert.equal((await app.inject({ method: 'POST', url: `${base}/assessments/${assessmentId}/items`, headers: headers(teacherToken), payload: { version: 1, questionRevisionId: valid.json().id, points: 0 } })).statusCode, 400);
    const firstItem = await app.inject({ method: 'POST', url: `${base}/assessments/${assessmentId}/items`, headers: headers(teacherToken), payload: { version: 1, questionRevisionId: valid.json().id, points: 2 } });
    assert.equal(firstItem.statusCode, 201, firstItem.body); assert.equal(firstItem.json().version, 2);
    assert.equal((await app.inject({ method: 'POST', url: `${base}/assessments/${assessmentId}/items`, headers: headers(teacherToken), payload: { version: 2, questionRevisionId: invalid.json().id, points: 2 } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: `${base}/assessments/${assessmentId}/items`, headers: headers(teacherToken), payload: { version: 2, questionRevisionId: otherRevisionId, points: 2 } })).statusCode, 409);
    const secondItem = await app.inject({ method: 'POST', url: `${base}/assessments/${assessmentId}/items`, headers: headers(teacherToken), payload: { version: 2, questionRevisionId: second.json().id, points: 3, position: 1 } });
    assert.equal(secondItem.statusCode, 201, secondItem.body); assert.deepEqual(secondItem.json().items.map((item: { questionRevisionId: string }) => item.questionRevisionId), [second.json().id, valid.json().id]);
    const validItemId = secondItem.json().items[1].id;
    const reordered = await app.inject({ method: 'PATCH', url: `${base}/assessments/${assessmentId}/items/${validItemId}`, headers: headers(teacherToken), payload: { version: 3, position: 1, points: 2.5 } });
    assert.equal(reordered.statusCode, 200, reordered.body); assert.equal(reordered.json().items[0].id, validItemId); assert.equal(reordered.json().totalPoints, 5.5);
    assert.equal((await app.inject({ method: 'PATCH', url: `${base}/assessments/${assessmentId}`, headers: headers(teacherToken), payload: { version: 3, title: 'Versión obsoleta' } })).statusCode, 409);

    const concurrent = await Promise.all(['A', 'B'].map(title => app!.inject({ method: 'PATCH', url: `${base}/assessments/${assessmentId}`, headers: headers(teacherToken), payload: { version: 4, title: `Práctica concurrente ${title}` } })));
    assert.deepEqual(concurrent.map(response => response.statusCode).sort(), [200, 409]);
    const current = concurrent.find(response => response.statusCode === 200)!.json();
    const removed = await app.inject({ method: 'POST', url: `${base}/assessments/${assessmentId}/items/${validItemId}/remove`, headers: headers(teacherToken), payload: { version: current.version, confirmed: true } });
    assert.equal(removed.statusCode, 200, removed.body); assert.equal(removed.json().items.length, 1); assert.equal(removed.json().items[0].position, 1);
    const preview = await app.inject({ url: `${base}/assessments/${assessmentId}/preview`, headers: headers(teacherToken) }); assert.equal(preview.statusCode, 200); assert.equal(preview.json().publicationAllowed, true);

    assert.equal((await app.inject({ url: `${base}/assessments/${assessmentId}`, headers: headers(studentToken) })).statusCode, 403);
    assert.equal((await app.inject({ url: `${base}/question-revisions`, headers: headers(studentToken) })).statusCode, 403);
    assert.equal((await app.inject({ url: `${base}/assessments/${assessmentId}`, headers: headers(otherToken) })).statusCode, 404);
    assert.equal((await app.inject({ method: 'PATCH', url: `${base}/assessments/${assessmentId}/items/${secondItem.json().items[0].id}`, headers: headers(otherToken), payload: { version: removed.json().version, points: 100 } })).statusCode, 404);

    const reconnect = createDatabase(url);
    const reconnectedApp = await buildApp(config, reconnect);
    try {
      const recovered = await reconnectedApp.inject({ url: `${base}/assessments/${assessmentId}`, headers: headers(teacherToken) });
      assert.equal(recovered.statusCode, 200, recovered.body); assert.equal(recovered.json().items.length, 1);
    } finally { await reconnectedApp.close(); await reconnect.destroy(); }

    assert.equal(Number((await db('assessment_versions').count('* as n').first())?.n), 0);
    assert.equal(Number((await db('assessment_version_items').count('* as n').first())?.n), 0);
    assert.ok(Number((await db('audit_events').where({ resource_id: assessmentId }).count('* as n').first())?.n) >= 5);
  } finally {
    if (app) await app.close();
    await db.migrate.down({ name: gradingMigration });
    await db.migrate.down({ name: attemptsMigration });
    await db.migrate.down({ name: publicationMigration });
    await db.migrate.down({ name: migration });
    await db.transaction(async tx => {
      await tx('audit_events').whereIn('actor_id', [teacherId, otherTeacherId, studentId]).delete();
      await tx('question_drafts').whereIn('id', [validDraftId, secondDraftId, invalidDraftId, indeterminateDraftId, otherDraftId]).delete();
      await tx('sessions').whereIn('user_id', [teacherId, otherTeacherId, studentId]).delete();
      await tx('enrollments').where({ classroom_id: classroomId }).delete();
      await tx('classrooms').whereIn('id', [classroomId, otherClassroomId]).delete();
      await tx('subjects').whereIn('id', [subjectId, otherSubjectId]).delete();
      await tx('teacher_authorizations').whereIn('google_sub', [teacherIdentity, otherIdentity]).delete();
      await tx('external_identities').whereIn('user_id', [teacherId, otherTeacherId, studentId]).delete();
      await tx('student_profiles').where({ user_id: studentId }).delete();
      await tx('teacher_profiles').whereIn('user_id', [teacherId, otherTeacherId]).delete();
      await tx('users').whereIn('id', [teacherId, otherTeacherId, studentId]).delete();
    });
    await db.migrate.up({ name: migration });
    await db.migrate.up({ name: publicationMigration });
    await db.migrate.up({ name: attemptsMigration });
    await db.migrate.up({ name: gradingMigration });
    assert.equal(Number((await db('users').count('* as n').first())?.n), baseline.users);
    assert.equal(Number((await db('enrollments').count('* as n').first())?.n), baseline.enrollments);
    assert.equal(Number((await db('question_drafts').count('* as n').first())?.n), baseline.drafts);
    await db.destroy();
  }
});
