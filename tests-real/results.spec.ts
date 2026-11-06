import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const classroomId = '94444444-4444-4444-8444-444444444444';
const attemptId = '96666666-6666-4666-8666-666666666666';
const itemId = '97777777-7777-4777-8777-777777777777';
const teacher = { id: 'teacher-h5', role: 'docente', email: 'teacher@example.invalid', firstNames: 'Docente', lastNames: 'Sintético', phone: '', photo: null, schoolId: null, universityCode: null, professionalInfo: '', profileComplete: true };
const student = { ...teacher, id: 'student-h5', role: 'estudiante', email: 'student@undc.edu.pe', firstNames: 'Estudiante', schoolId: 4 };
const now = '2099-04-01T15:00:00.000Z';

async function mockTeacher(page: Page) {
  await page.route('**/api/v1/me', route => route.fulfill({ json: { user: teacher, csrfToken: 'h5-csrf' } }));
  await page.route(`**/api/v1/classrooms/${classroomId}/results`, route => route.fulfill({ json: [{ id: 'assessment-h5', title: 'Práctica de derivadas', status: 'published', counts: { submitted: 1, pending: 0, provisional: 1, final: 0 }, attempts: [{ id: attemptId, status: 'graded', submittedAt: now, studentId: student.id, studentName: 'Estudiante Sintético', assessmentRevision: 1, grade: { revision: 1, score: 0, maxScore: 2, status: 'provisional', source: 'system', reviewRequired: true, gradedAt: now } }] }] }));
}

async function mockStudent(page: Page) {
  await page.route('**/api/v1/me', route => route.fulfill({ json: { user: student, csrfToken: 'h5-csrf' } }));
  await page.route(`**/api/v1/classrooms/${classroomId}/attempts/${attemptId}`, route => route.fulfill({ json: { id: attemptId, activityVersionId: 'version-h5', classroomId, title: 'Práctica de derivadas', instructions: '', type: 'practice', status: 'graded', version: 4, startedAt: now, expiresAt: null, submittedAt: now, serverNow: now, answeredCount: 1, questions: [] } }));
  await page.route(`**/api/v1/classrooms/${classroomId}/attempts/${attemptId}/result`, route => route.fulfill({ json: { id: attemptId, state: 'available', scoreReleased: true, solutionsReleased: true, score: 2, maxScore: 2, gradedAt: now, items: [{ id: itemId, position: 1, statement: 'Deriva x².', pointsAwarded: 2, maxPoints: 2, outcome: 'correct', selectedOptionId: 'option-a', alternatives: [{ id: 'option-a', text: '2x' }], correctOptionId: 'option-a', explanation: 'Se aplica la regla de potencia.' }] } }));
}

for (const width of [390, 768, 1024, 1440]) test(`Hito 5: panel docente accesible a ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 }); await mockTeacher(page); await page.goto(`/docente/cursos/${classroomId}/resultados`);
  await expect(page.getByRole('heading', { name: 'Correcciones y calificaciones' })).toBeVisible();
  await expect(page.getByText('Estudiante Sintético')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `test-results/fase-2-4/hito-5-docente-${width}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Activar modo oscuro' }).click();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `test-results/fase-2-4/hito-5-docente-${width}-oscuro.png`, fullPage: true });
});

for (const width of [390, 768, 1024, 1440]) test(`Hito 5: resultado estudiantil accesible a ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 }); await mockStudent(page); await page.goto(`/estudiante/cursos/${classroomId}/intentos/${attemptId}`);
  await expect(page.getByText('ENTREGA REGISTRADA')).toBeVisible(); await expect(page.getByLabel('Puntaje 2 de 2')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `test-results/fase-2-4/hito-5-estudiante-${width}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Activar modo oscuro' }).click();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `test-results/fase-2-4/hito-5-estudiante-${width}-oscuro.png`, fullPage: true });
});
