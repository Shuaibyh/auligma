import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const classroomId = '44444444-4444-4444-8444-444444444444';
const versionId = '55555555-5555-4555-8555-555555555555';
const attemptId = '66666666-6666-4666-8666-666666666666';
const itemOne = '77777777-7777-4777-8777-777777777771';
const itemTwo = '77777777-7777-4777-8777-777777777772';
const optionA = '88888888-8888-4888-8888-888888888881';
const optionB = '88888888-8888-4888-8888-888888888882';
const student = { id: 'student-h4', role: 'estudiante', email: 'student@undc.edu.pe', firstNames: 'Estudiante', lastNames: 'Sintético', phone: '', photo: null, schoolId: 4, universityCode: 'SYN-01', professionalInfo: '', profileComplete: true };
const now = '2099-04-01T15:00:00.000Z';

async function mockAttemptApi(page: Page) {
  let status = 'in_progress'; let version = 1; let submittedAt: string | null = null;
  const answers: Record<string, string | null> = { [itemOne]: null, [itemTwo]: null };
  const activity = { id: versionId, title: 'Práctica de derivadas', instructions: 'Selecciona una alternativa por pregunta.', type: 'practice', totalPoints: 4,
    questionCount: 2, opensAt: '2099-04-01T14:00:00.000Z', dueAt: '2099-04-01T16:00:00.000Z', closesAt: '2099-04-01T17:00:00.000Z',
    state: 'available', attemptsAllowed: 1, canStart: true, canResume: false, attempt: null, serverNow: now };
  const attempt = () => ({ id: attemptId, activityVersionId: versionId, classroomId, title: activity.title, instructions: activity.instructions, type: 'practice', status,
    version, startedAt: now, expiresAt: activity.closesAt, submittedAt, serverNow: now, answeredCount: Object.values(answers).filter(Boolean).length,
    questions: [
      { id: itemOne, position: 1, statement: 'Calcula la derivada de f(x)=x².', topic: 'Derivadas', difficulty: 'básica', alternatives: [{ id: optionA, text: '2x' }, { id: optionB, text: 'x' }], selectedOptionId: answers[itemOne], savedAt: answers[itemOne] ? now : null },
      { id: itemTwo, position: 2, statement: 'Calcula la derivada de g(x)=x³.', topic: 'Derivadas', difficulty: 'básica', alternatives: [{ id: optionA, text: '3x^2' }, { id: optionB, text: 'x^2' }], selectedOptionId: answers[itemTwo], savedAt: answers[itemTwo] ? now : null },
    ] });
  await page.route('**/api/v1/me', route => route.fulfill({ json: { user: student, csrfToken: 'student-h4-csrf' } }));
  await page.route(`**/api/v1/classrooms/${classroomId}/activities**`, async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (request.method() === 'GET' && path.endsWith('/activities')) return route.fulfill({ json: [activity] });
    if (request.method() === 'GET') return route.fulfill({ json: activity });
    expect(request.headers()['x-csrf-token']).toBe('student-h4-csrf');
    return route.fulfill({ status: 201, json: attempt() });
  });
  await page.route(`**/api/v1/classrooms/${classroomId}/attempts/${attemptId}**`, async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (request.method() === 'GET' && path.endsWith('/status')) return route.fulfill({ json: { id: attemptId, status, version, submittedAt, expiresAt: activity.closesAt, serverNow: now } });
    if (request.method() === 'GET' && path.endsWith('/result')) return route.fulfill({ json: { id: attemptId, state: 'pending', scoreReleased: false, solutionsReleased: false } });
    if (request.method() === 'GET') return route.fulfill({ json: attempt() });
    expect(request.headers()['x-csrf-token']).toBe('student-h4-csrf');
    if (request.method() === 'PATCH') { const body = request.postDataJSON(); const itemId = path.split('/answers/')[1]; answers[itemId] = body.selectedOptionId; version++; return route.fulfill({ json: attempt() }); }
    if (path.endsWith('/submit')) { status = 'submitted'; submittedAt = now; version++; return route.fulfill({ json: attempt() }); }
    return route.fulfill({ status: 404, json: { error: { message: 'Ruta sintética no cubierta.' } } });
  });
  return { attempt };
}

test('Hito 4: lista, inicia, autoguarda, recupera y entrega un intento', async ({ page }) => {
  await mockAttemptApi(page);
  await page.goto(`/estudiante/cursos/${classroomId}/actividades`);
  await expect(page.getByRole('heading', { name: 'Prácticas publicadas' })).toBeVisible();
  await page.getByRole('link', { name: 'Revisar actividad' }).click();
  await expect(page.getByRole('heading', { name: 'Práctica de derivadas' })).toBeVisible();
  await page.getByRole('button', { name: 'Comenzar intento' }).click();
  await expect(page).toHaveURL(new RegExp(`/intentos/${attemptId}$`));
  await page.locator('.answer-option').first().click();
  await expect(page.getByText('Guardado', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('1 de 2 respondidas')).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.locator('.answer-option').first().click();
  await page.getByRole('button', { name: 'Revisar y entregar' }).click();
  await expect(page.getByRole('dialog')).toContainText('2 respondidas');
  await page.getByRole('button', { name: 'Confirmar entrega' }).click();
  await expect(page.getByRole('heading', { name: 'Práctica de derivadas' })).toBeVisible();
  await expect(page.getByText('ENTREGA REGISTRADA')).toBeVisible();
  await expect(page.getByText(/corrección sigue en proceso/)).toBeVisible();
});

for (const width of [390, 768, 1024, 1440]) test(`Hito 4: intento accesible y responsive a ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 }); await mockAttemptApi(page);
  await page.goto(`/estudiante/cursos/${classroomId}/intentos/${attemptId}`);
  await expect(page.getByRole('heading', { name: 'Práctica de derivadas' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `test-results/fase-2-4/hito-4-intento-${width}-claro.png`, fullPage: true });
  await page.getByRole('button', { name: 'Activar modo oscuro' }).click();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `test-results/fase-2-4/hito-4-intento-${width}-oscuro.png`, fullPage: true });
});
