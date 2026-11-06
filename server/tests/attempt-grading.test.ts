import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { buildApp, hash } from '../app.ts';
import { readConfig } from '../config.ts';
import { gradeSubmittedAttempt } from '../grading.ts';
import { verifiedTestDatabase } from './test-database.ts';

const url = process.env.DATABASE_TEST_URL;
const gradingMigration = '202611050001_attempt_grading.mjs';
const attemptsMigration = '202611040002_student_attempts.mjs';
const publicationMigration = '202611040001_assessment_publication.mjs';
const foundationMigration = '202611030002_assessment_foundation.mjs';

test('Hito 5: corrección transaccional, resultados privados y revisión versionada', { skip: !url && 'Falta DATABASE_TEST_URL', timeout: 180000 }, async () => {
  const db = await verifiedTestDatabase(url); await db.migrate.latest();
  const ids = Object.fromEntries(['teacher','otherTeacher','student','otherStudent','subject','otherSubject','classroom','otherClassroom','enrollment','otherEnrollment',
    'draft','revision','assessment','version','versionItem','attempt','attemptItem','secondAttempt','secondAttemptItem','expiredAttempt'].map(key => [key, randomUUID()])) as Record<string,string>;
  const optionA = randomUUID(), optionB = randomUUID(); const csrf = 'grading-csrf';
  const teacherToken = randomBytes(32).toString('base64url'), otherTeacherToken = randomBytes(32).toString('base64url'), studentToken = randomBytes(32).toString('base64url'), otherStudentToken = randomBytes(32).toString('base64url');
  const config = readConfig({ DATABASE_URL: url }); const headers = (token: string, csrfHeader = true) => ({ cookie: `auligma_session=${token}`, origin: config.frontendUrl, ...(csrfHeader ? { 'x-csrf-token': csrf } : {}) });
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;
  try {
    await db.transaction(async tx => {
      const emails = { teacher: `${randomUUID()}@example.invalid`, otherTeacher: `${randomUUID()}@example.invalid`, student: `${randomUUID()}@undc.edu.pe`, otherStudent: `${randomUUID()}@undc.edu.pe` };
      await tx('users').insert([{ id: ids.teacher, email: emails.teacher, role: 'docente' }, { id: ids.otherTeacher, email: emails.otherTeacher, role: 'docente' },
        { id: ids.student, email: emails.student, role: 'estudiante' }, { id: ids.otherStudent, email: emails.otherStudent, role: 'estudiante' }]);
      await tx('teacher_profiles').insert([{ user_id: ids.teacher, first_names: 'Docente', last_names: 'Hito Cinco' }, { user_id: ids.otherTeacher, first_names: 'Docente', last_names: 'Ajeno' }]);
      await tx('student_profiles').insert([{ user_id: ids.student, first_names: 'Estudiante', last_names: 'Propio' }, { user_id: ids.otherStudent, first_names: 'Estudiante', last_names: 'Ajeno' }]);
      const teacherSub = randomUUID(), otherSub = randomUUID();
      await tx('external_identities').insert([{ id: randomUUID(), user_id: ids.teacher, provider: 'google', subject: teacherSub }, { id: randomUUID(), user_id: ids.otherTeacher, provider: 'google', subject: otherSub }]);
      await tx('teacher_authorizations').insert([{ id: randomUUID(), email: emails.teacher, google_sub: teacherSub, kind: 'institutional', evidence: 'Fixture sintético Hito 5' },
        { id: randomUUID(), email: emails.otherTeacher, google_sub: otherSub, kind: 'institutional', evidence: 'Fixture sintético Hito 5' }]);
      await tx('subjects').insert([{ id: ids.subject, teacher_id: ids.teacher, name: 'Resultados sintéticos' }, { id: ids.otherSubject, teacher_id: ids.otherTeacher, name: 'Aula ajena sintética' }]);
      await tx('classrooms').insert([{ id: ids.classroom, teacher_id: ids.teacher, subject_id: ids.subject, section: 'H5', period: '2099-I', shift: 'Mañana' },
        { id: ids.otherClassroom, teacher_id: ids.otherTeacher, subject_id: ids.otherSubject, section: 'H5X', period: '2099-I', shift: 'Tarde' }]);
      await tx('enrollments').insert([{ id: ids.enrollment, classroom_id: ids.classroom, institutional_email: emails.student, student_user_id: ids.student, status: 'active', authorized_by: ids.teacher, authorized_at: tx.fn.now(), linked_at: tx.fn.now() },
        { id: ids.otherEnrollment, classroom_id: ids.classroom, institutional_email: emails.otherStudent, student_user_id: ids.otherStudent, status: 'active', authorized_by: ids.teacher, authorized_at: tx.fn.now(), linked_at: tx.fn.now() }]);
      await tx('sessions').insert([{ token_hash: hash(teacherToken), user_id: ids.teacher, csrf_token: csrf, expires_at: new Date(Date.now()+300000) },
        { token_hash: hash(otherTeacherToken), user_id: ids.otherTeacher, csrf_token: csrf, expires_at: new Date(Date.now()+300000) },
        { token_hash: hash(studentToken), user_id: ids.student, csrf_token: csrf, expires_at: new Date(Date.now()+300000) },
        { token_hash: hash(otherStudentToken), user_id: ids.otherStudent, csrf_token: csrf, expires_at: new Date(Date.now()+300000) }]);
      const draftContent = { statement: 'Deriva x².', alternatives: ['2*x','x'], proposedAnswer: 0, explanation: 'Regla de potencia.', difficulty: 'básica', topic: 'Derivadas', operation: 'derivative', expression: 'x**2', reviewed: true, nodeId: null, materialId: null };
      const revisionContent = { ...draftContent, alternatives: [{ id: optionA, text: '2*x' }, { id: optionB, text: 'x' }] };
      await tx('question_drafts').insert({ id: ids.draft, teacher_id: ids.teacher, classroom_id: ids.classroom, content: JSON.stringify(draftContent), review_status: 'reviewed' });
      await tx('question_revisions').insert({ id: ids.revision, question_draft_id: ids.draft, classroom_id: ids.classroom, teacher_id: ids.teacher, revision: 1,
        content: JSON.stringify(revisionContent), correct_option_id: optionA, verification: JSON.stringify({ status: 'VERIFICADO', singleChoiceValid: true, correctIndices: [0] }), review_status: 'approved', content_hash: '5'.repeat(64), created_by: ids.teacher, approved_by: ids.teacher, approved_at: tx.fn.now() });
      await tx('assessments').insert({ id: ids.assessment, classroom_id: ids.classroom, teacher_id: ids.teacher, type: 'practice', status: 'closed', title: 'Práctica calificada', instructions: '', version: 3 });
      await tx('assessment_versions').insert({ id: ids.version, assessment_id: ids.assessment, classroom_id: ids.classroom, revision: 1, source_version: 1, settings: JSON.stringify({ title: 'Práctica calificada', type: 'practice' }), total_points: '2.50', content_hash: '6'.repeat(64), published_by: ids.teacher, published_at: tx.fn.now(), score_release_policy: 'after_close', solution_release_policy: 'after_close' });
      await tx('assessment_version_items').insert({ id: ids.versionItem, assessment_version_id: ids.version, classroom_id: ids.classroom, question_revision_id: ids.revision, position: 1, points: '2.50', settings: '{}' });
      for (const [attempt, item, student, enrollment, selected] of [[ids.attempt,ids.attemptItem,ids.student,ids.enrollment,optionA],[ids.secondAttempt,ids.secondAttemptItem,ids.otherStudent,ids.otherEnrollment,optionB]]) {
        await tx('attempts').insert({ id: attempt, assessment_version_id: ids.version, classroom_id: ids.classroom, student_user_id: student, enrollment_id: enrollment, attempt_number: 1, status: 'in_progress', start_key: randomUUID(), version: 1 });
        await tx('attempt_items').insert({ id: item, attempt_id: attempt, assessment_version_id: ids.version, assessment_version_item_id: ids.versionItem, position: 1, option_order: JSON.stringify([optionA,optionB]) });
        await tx('attempt_answers').insert({ id: randomUUID(), attempt_id: attempt, attempt_item_id: item, answer: JSON.stringify({ selectedOptionId: selected }), operation_key: randomUUID() });
        await tx('attempts').where({ id: attempt }).update({ status: 'submitted', submission_key: randomUUID(), submitted_at: tx.fn.now(), version: 2 });
      }
      await tx('attempts').insert({ id: ids.expiredAttempt, assessment_version_id: ids.version, classroom_id: ids.classroom, student_user_id: ids.student,
        enrollment_id: ids.enrollment, attempt_number: 2, status: 'expired', start_key: randomUUID(), version: 1 });
    });

    const verified = async () => ({ status: 'VERIFICADO', singleChoiceValid: true, correctIndices: [0] });
    const concurrent = await Promise.all([gradeSubmittedAttempt(db, ids.attempt, verified), gradeSubmittedAttempt(db, ids.attempt, verified)]);
    assert.equal(concurrent[0].id, concurrent[1].id); assert.equal(Number(concurrent[0].score), 2.5); assert.equal(concurrent[0].status, 'final');
    assert.equal(Number((await db('attempt_grades').where({ attempt_id: ids.attempt }).count('* as n').first())?.n), 1);
    const provisional = await gradeSubmittedAttempt(db, ids.secondAttempt, async () => ({ status: 'INDETERMINADO', singleChoiceValid: false }));
    assert.equal(provisional.status, 'provisional'); assert.equal(provisional.review_required, true);
    await assert.rejects(gradeSubmittedAttempt(db, ids.expiredAttempt, verified), (error: { statusCode?: number; code?: string }) => error.statusCode === 409 && error.code === 'attempt_not_submitted');
    await assert.rejects(gradeSubmittedAttempt(db, randomUUID(), verified), (error: { statusCode?: number }) => error.statusCode === 404);

    app = await buildApp(config, db);
    await db('assessments').where({ id: ids.assessment }).update({ status: 'published' });
    const withheld = await app.inject({ url: `/api/v1/classrooms/${ids.classroom}/attempts/${ids.attempt}/result`, headers: headers(studentToken) });
    assert.equal(withheld.statusCode, 200, withheld.body); assert.equal(withheld.json().state, 'withheld'); assert.doesNotMatch(withheld.body, /"score"|correctOptionId|explanation/);
    await db('assessments').where({ id: ids.assessment }).update({ status: 'closed' });
    const studentResult = await app.inject({ url: `/api/v1/classrooms/${ids.classroom}/attempts/${ids.attempt}/result`, headers: headers(studentToken) });
    assert.equal(studentResult.statusCode, 200, studentResult.body); assert.equal(studentResult.json().score, 2.5); assert.equal(studentResult.json().solutionsReleased, true);
    assert.match(studentResult.body, /correctOptionId/); assert.doesNotMatch(studentResult.body, /verification|contentHash|expression/);
    assert.equal((await app.inject({ url: `/api/v1/classrooms/${ids.classroom}/attempts/${ids.attempt}/result`, headers: headers(otherStudentToken) })).statusCode, 404);
    assert.equal((await app.inject({ url: `/api/v1/classrooms/${ids.classroom}/results`, headers: headers(otherTeacherToken) })).statusCode, 404);
    const teacherDetail = await app.inject({ url: `/api/v1/classrooms/${ids.classroom}/results/attempts/${ids.secondAttempt}`, headers: headers(teacherToken) });
    assert.equal(teacherDetail.statusCode, 200, teacherDetail.body); assert.equal(teacherDetail.json().grade.reviewRequired, true);
    const reviewOperation = randomUUID(); const reviewPayload = { expectedRevision: 1, operationId: reviewOperation, reason: 'Revisión docente del caso indeterminado.', adjustments: [{ attemptItemId: ids.secondAttemptItem, points: 1.25 }] };
    assert.equal((await app.inject({ method: 'POST', url: `/api/v1/classrooms/${ids.classroom}/results/attempts/${ids.secondAttempt}/review`, headers: headers(teacherToken, false), payload: reviewPayload })).statusCode, 403);
    const reviewed = await app.inject({ method: 'POST', url: `/api/v1/classrooms/${ids.classroom}/results/attempts/${ids.secondAttempt}/review`, headers: headers(teacherToken), payload: reviewPayload });
    assert.equal(reviewed.statusCode, 200, reviewed.body); assert.equal(reviewed.json().revision, 2); assert.equal(reviewed.json().score, 1.25);
    const retried = await app.inject({ method: 'POST', url: `/api/v1/classrooms/${ids.classroom}/results/attempts/${ids.secondAttempt}/review`, headers: headers(teacherToken), payload: reviewPayload });
    assert.equal(retried.statusCode, 200); assert.equal(retried.json().revision, 2);
    assert.equal(Number((await db('attempt_grades').where({ attempt_id: ids.secondAttempt }).count('* as n').first())?.n), 2);
    await assert.rejects(db('attempt_grades').where({ attempt_id: ids.secondAttempt, revision: 1 }).update({ score: 2 }), (error: { code?: string }) => error.code === '55000');
  } finally {
    if (app) await app.close();
    await db.migrate.down({ name: gradingMigration }); await db.migrate.down({ name: attemptsMigration }); await db.migrate.down({ name: publicationMigration }); await db.migrate.down({ name: foundationMigration });
    await db.transaction(async tx => {
      await tx('audit_events').whereIn('actor_id', [ids.teacher, ids.otherTeacher, ids.student, ids.otherStudent]).orWhereIn('resource_id', [ids.attempt, ids.secondAttempt]).delete();
      await tx('question_drafts').where({ id: ids.draft }).delete(); await tx('sessions').whereIn('user_id', [ids.teacher, ids.otherTeacher, ids.student, ids.otherStudent]).delete();
      await tx('enrollments').whereIn('id', [ids.enrollment, ids.otherEnrollment]).delete(); await tx('classrooms').whereIn('id', [ids.classroom, ids.otherClassroom]).delete();
      await tx('subjects').whereIn('id', [ids.subject, ids.otherSubject]).delete(); await tx('teacher_authorizations').whereIn('email', await tx('users').whereIn('id',[ids.teacher,ids.otherTeacher]).pluck('email')).delete();
      await tx('external_identities').whereIn('user_id', [ids.teacher,ids.otherTeacher]).delete(); await tx('student_profiles').whereIn('user_id',[ids.student,ids.otherStudent]).delete();
      await tx('teacher_profiles').whereIn('user_id',[ids.teacher,ids.otherTeacher]).delete(); await tx('users').whereIn('id',[ids.teacher,ids.otherTeacher,ids.student,ids.otherStudent]).delete();
    });
    await db.migrate.up({ name: foundationMigration }); await db.migrate.up({ name: publicationMigration }); await db.migrate.up({ name: attemptsMigration }); await db.migrate.up({ name: gradingMigration }); await db.destroy();
  }
});
