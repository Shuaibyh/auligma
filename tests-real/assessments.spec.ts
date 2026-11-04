import { expect, test, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const classroom = { id: '77777777-7777-4777-8777-777777777777', name: 'Cálculo diferencial sintético', section: 'C1', period: '2099-I', shift: 'Mañana', teacherName: 'Docente Sintético', archivedAt: null };
const teacher = { id: 'assessment-teacher', role: 'docente', email: 'teacher@example.invalid', firstNames: 'Docente', lastNames: 'Sintético', phone: '', photo: null, schoolId: null, universityCode: null, professionalInfo: '', profileComplete: true };
const student = { ...teacher, id: 'assessment-student', role: 'estudiante', email: 'student@undc.edu.pe', firstNames: 'Estudiante', schoolId: 4 };
const revisions = [
  { id: '88888888-8888-4888-8888-888888888881', revision: 1, reviewStatus: 'approved', content: { statement: 'Calcula la derivada de f(x)=x²+3x.', alternatives: [{ id: 'a', text: '2x+3' }, { id: 'b', text: 'x+3' }, { id: 'c', text: '2x' }, { id: 'd', text: '3x²' }], explanation: 'Aplica linealidad.', difficulty: 'intermedia', topic: 'Derivadas' } },
  { id: '88888888-8888-4888-8888-888888888882', revision: 2, reviewStatus: 'approved', content: { statement: 'Deriva g(x)=(x+1)/(x-1).', alternatives: [{ id: 'e', text: '-2/(x-1)²' }, { id: 'f', text: '2/(x-1)²' }, { id: 'g', text: '1' }, { id: 'h', text: '0' }], explanation: 'Usa la regla del cociente.', difficulty: 'intermedia', topic: 'Regla del cociente' } },
  { id: '88888888-8888-4888-8888-888888888883', revision: 1, reviewStatus: 'indeterminate', content: { statement: 'Pregunta pendiente de revisión matemática.', alternatives: [{ id: 'i', text: 'A' }, { id: 'j', text: 'B' }], explanation: '', difficulty: 'avanzada', topic: 'Verificación' } },
];

type Item = { id: string; position: number; points: number; questionRevisionId: string; questionRevision: number; reviewStatus: string; content: typeof revisions[number]['content'] };
type Assessment = { id: string; classroomId: string; type: 'practice'; status: 'draft'; title: string; instructions: string; version: number; createdAt: string; updatedAt: string; totalPoints: number; items: Item[]; publicationAllowed: false };

function makeAssessment(items: Item[] = []): Assessment {
  return { id: '99999999-9999-4999-8999-999999999999', classroomId: classroom.id, type: 'practice', status: 'draft', title: 'Práctica de derivadas', instructions: 'Resuelve cada ejercicio y revisa tu procedimiento.', version: 3, createdAt: '2099-01-01T12:00:00Z', updatedAt: '2099-01-02T12:00:00Z', totalPoints: items.reduce((sum, item) => sum + item.points, 0), items, publicationAllowed: false };
}

async function mockAssessmentApi(page: Page, seeded = true) {
  let assessment = makeAssessment(seeded ? [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', position: 1, points: 2, questionRevisionId: revisions[0].id, questionRevision: 1, reviewStatus: 'approved', content: revisions[0].content }] : []);
  const sync = () => { assessment.items.forEach((item, index) => { item.position = index + 1; }); assessment.totalPoints = assessment.items.reduce((sum, item) => sum + item.points, 0); assessment.updatedAt = new Date().toISOString(); };
  await page.route('**/api/v1/me', route => route.fulfill({ json: { user: teacher, csrfToken: 'assessment-csrf' } }));
  await page.route(`**/api/v1/classrooms/${classroom.id}`, route => route.fulfill({ json: classroom }));
  await page.route(`**/api/v1/classrooms/${classroom.id}/question-revisions`, route => route.fulfill({ json: revisions }));
  await page.route(`**/api/v1/classrooms/${classroom.id}/assessments**`, async route => {
    const request = route.request(); const url = new URL(request.url()); const method = request.method();
    expect(request.headers()['x-csrf-token'] || method === 'GET').toBeTruthy();
    if (url.pathname.endsWith('/assessments') && method === 'GET') return route.fulfill({ json: [assessment] });
    if (url.pathname.endsWith('/assessments') && method === 'POST') { const body = request.postDataJSON(); assessment = { ...makeAssessment([]), title: body.title, instructions: body.instructions, version: 1 }; return route.fulfill({ status: 201, json: assessment }); }
    if (url.pathname.endsWith('/preview') && method === 'GET') return route.fulfill({ json: assessment });
    if (url.pathname.endsWith(`/assessments/${assessment.id}`) && method === 'GET') return route.fulfill({ json: assessment });
    if (url.pathname.endsWith(`/assessments/${assessment.id}`) && method === 'PATCH') { const body = request.postDataJSON(); assessment = { ...assessment, title: body.title, instructions: body.instructions, version: assessment.version + 1 }; sync(); return route.fulfill({ json: assessment }); }
    if (url.pathname.endsWith('/items') && method === 'POST') { const body = request.postDataJSON(); const source = revisions.find(row => row.id === body.questionRevisionId)!; assessment.items.push({ id: `item-${assessment.items.length + 1}`, position: assessment.items.length + 1, points: body.points, questionRevisionId: source.id, questionRevision: source.revision, reviewStatus: source.reviewStatus, content: source.content }); assessment.version++; sync(); return route.fulfill({ status: 201, json: assessment }); }
    const item = assessment.items.find(row => url.pathname.includes(`/items/${row.id}`));
    if (item && url.pathname.endsWith('/remove') && method === 'POST') { assessment.items = assessment.items.filter(row => row.id !== item.id); assessment.version++; sync(); return route.fulfill({ json: assessment }); }
    if (item && method === 'PATCH') { const body = request.postDataJSON(); if (body.points !== undefined) item.points = body.points; if (body.position !== undefined) { assessment.items = assessment.items.filter(row => row.id !== item.id); assessment.items.splice(body.position - 1, 0, item); } assessment.version++; sync(); return route.fulfill({ json: assessment }); }
    return route.fulfill({ status: 404, json: { error: { message: 'Ruta sintética no cubierta.' } } });
  });
  return { value: () => assessment };
}

test('Hito 2: crea, recupera, compone, ordena y previsualiza un borrador real', async ({ page }) => {
  const state = await mockAssessmentApi(page, false);
  await page.goto(`/docente/cursos/${classroom.id}/evaluaciones`);
  await page.getByRole('button', { name: 'Nueva evaluación' }).click();
  await page.getByLabel('Título').fill('Evaluación incremental');
  await page.getByLabel('Instrucciones').fill('Justifica cada respuesta.');
  await page.getByRole('button', { name: 'Crear borrador' }).click();
  await expect(page.getByRole('heading', { name: 'Constructor de evaluaciones' })).toBeVisible();
  await page.getByRole('button', { name: 'Añadir', exact: true }).first().click();
  await page.getByRole('button', { name: 'Añadir', exact: true }).first().click();
  await expect(page.getByText('2 preguntas')).toBeVisible();
  await page.getByLabel('Puntos').last().fill('3.5');
  await page.locator('.assessment-item').last().getByRole('button', { name: 'Guardar' }).click();
  await page.getByRole('button', { name: 'Subir pregunta 2' }).click();
  await expect.poll(() => state.value().items[0].content.topic).toBe('Regla del cociente');
  await page.getByRole('link', { name: 'Vista previa' }).click();
  await expect(page.getByText('Esta vista no publica ni registra respuestas.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Publicar/ })).toBeDisabled();
  await expect(page.locator('fieldset input:checked')).toHaveCount(0);
});
for (const width of [390, 768, 1024, 1440]) test(`Hito 2: constructor accesible y responsive a ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await mockAssessmentApi(page);
  await page.goto(`/docente/cursos/${classroom.id}/evaluaciones/${makeAssessment().id}`);
  await expect(page.getByRole('heading', { name: 'Constructor de evaluaciones' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `test-results/fase-2-4/hito-2-constructor-${width}-claro.png`, fullPage: true });
  await page.getByRole('button', { name: 'Activar modo oscuro' }).click();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `test-results/fase-2-4/hito-2-constructor-${width}-oscuro.png`, fullPage: true });
});

test('Hito 2: un estudiante no entra al constructor docente', async ({ page }) => {
  let privateApiCalled = false;
  await page.route('**/api/v1/me', route => route.fulfill({ json: { user: student, csrfToken: 'student-csrf' } }));
  await page.route('**/api/v1/classrooms/*/assessments**', (route: Route) => { privateApiCalled = true; return route.fulfill({ status: 403, json: { error: { message: 'No autorizado.' } } }); });
  await page.goto(`/estudiante/cursos/${classroom.id}/evaluaciones`);
  await expect(page).toHaveURL(/\/estudiante$/);
  expect(privateApiCalled).toBeFalsy();
});
