import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const teacher={id:'planning-teacher',role:'docente',email:'teacher@example.invalid',firstNames:'Docente',lastNames:'Sintético',phone:'',photo:null,schoolId:null,universityCode:null,professionalInfo:'',profileComplete:true};
const student={...teacher,id:'planning-student',role:'estudiante',email:'student@undc.edu.pe',firstNames:'Estudiante',schoolId:4};
const classroom={id:'44444444-4444-4444-8444-444444444444',name:'Curso sintético de planificación',section:'P1',period:'2099-I',shift:'Mañana',teacherName:'Docente Sintético',archivedAt:null};
const nodes=[
  {id:'unit',planId:'plan',parentId:null,type:'unit',title:'Unidad sintética',description:'Bloque temático verificable.',position:1000,status:'published',publishedAt:'2099-01-01',archivedAt:null,startsOn:null,endsOn:null},
  {id:'week',planId:'plan',parentId:'unit',type:'week',title:'Semana sintética',description:'Organización semanal.',position:1000,status:'published',publishedAt:'2099-01-01',archivedAt:null,startsOn:null,endsOn:null},
  {id:'topic',planId:'plan',parentId:'week',type:'topic',title:'Tema publicado',description:'Contenido visible.',position:1000,status:'published',publishedAt:'2099-01-01',archivedAt:null,startsOn:null,endsOn:null},
  {id:'draft',planId:'plan',parentId:'week',type:'subtopic',title:'Borrador docente',description:'No visible al estudiante.',position:2000,status:'draft',publishedAt:null,archivedAt:null,startsOn:null,endsOn:null},
];

for (const width of [390,768,1440]) test(`Fase 2.3.2: revisión local y bloqueo matemático a ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await mockTeacherPlanning(page);
  await page.route(`**/api/v1/classrooms/${classroom.id}/ai/verify`, async route => {
    const { verifyMath } = await import('../server/math-verifier');
    await route.fulfill({ json: await verifyMath(route.request().postDataJSON()) });
  });
  await page.goto(`/docente/cursos/${classroom.id}/planificacion`);
  await page.getByText('Asistente local · Sílabos y ejercicios', { exact: true }).click();
  await page.getByLabel('Análisis', { exact: true }).selectOption('exercise');
  await expect(page.getByRole('button', { name: 'Analizar localmente' })).toBeDisabled();
  await page.getByLabel('Expresión original').fill('(3*x**2+2*x)/(x+1)');
  await page.getByLabel('Alternativas corregidas').fill('(3*x**2+6*x+2)/(x+1)**2\n0\n3-1/(x+1)**2\n1');
  await expect(page.getByRole('button', { name: 'Verificar con SymPy' })).toBeDisabled();
  await page.getByLabel('Revisé y corregí las expresiones.').check();
  await page.getByRole('button', { name: 'Verificar con SymPy' }).click();
  await expect(page.getByText('Alternativas correctas: A, C')).toBeVisible();
  await expect(page.getByText(/Opción única bloqueada/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `test-results/fase-2-3-2/local-${width}-claro.png`, fullPage: true });
  await page.getByRole('button', { name: 'Activar modo oscuro' }).click();
  await page.screenshot({ path: `test-results/fase-2-3-2/local-${width}-oscuro.png`, fullPage: true });
  await page.getByLabel('Expresión original').fill('x**2');
  await expect(page.getByText('Alternativas correctas: A, C')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Verificar con SymPy' })).toBeDisabled();
});

for(const width of [390,768,1024,1440])test(`Fase 2.3: editor académico responsive a ${width}px`,async({page})=>{
  await page.route(`**/api/v1/classrooms/${classroom.id}/syllabus-sources`,route=>route.fulfill({json:[]}));
  await page.setViewportSize({width,height:1000});
  await page.route('**/api/v1/me',route=>route.fulfill({json:{user:teacher,csrfToken:'planning-csrf'}}));
  await page.route('**/api/v1/classrooms?includeArchived=true',route=>route.fulfill({json:[classroom]}));
  await page.route(`**/api/v1/classrooms/${classroom.id}`,route=>route.fulfill({json:classroom}));
  await page.route(`**/api/v1/classrooms/${classroom.id}/planning`,route=>route.fulfill({json:{plan:{id:'plan',title:'Plan sintético',weekCount:18,revision:4},nodes,materials:[{id:'material',nodeId:'topic',kind:'link',title:'Recurso sintético',description:'',mimeType:null,sizeBytes:0,externalUrl:'https://example.invalid',status:'published'}]}}));
  await page.goto(`/docente/cursos/${classroom.id}/planificacion`);
  await expect(page.getByRole('heading',{name:'Plan sintético'})).toBeVisible();
  await page.getByRole('button',{name:'Expandir Unidad sintética'}).click();
  await page.getByRole('button',{name:'Expandir Semana sintética'}).click();
  await page.getByRole('button',{name:/Tema publicado/}).click();
  await expect(page.getByRole('textbox',{name:'Título',exact:true})).toHaveValue('Tema publicado');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await page.screenshot({path:`test-results/fase-2-3/editor-${width}-claro.png`,fullPage:true});
  await page.getByRole('button',{name:'Activar modo oscuro'}).click();
  await page.screenshot({path:`test-results/fase-2-3/editor-${width}-oscuro.png`,fullPage:true});
});

test('Fase 2.3: estudiante recibe solo estructura publicada',async({page})=>{
  await page.route('**/api/v1/me',route=>route.fulfill({json:{user:student,csrfToken:'planning-csrf'}}));
  await page.route(`**/api/v1/classrooms/${classroom.id}`,route=>route.fulfill({json:classroom}));
  await page.route(`**/api/v1/classrooms/${classroom.id}/planning`,route=>route.fulfill({json:{plan:{id:'plan',title:'Plan sintético',weekCount:18,revision:4},nodes:nodes.filter(node=>node.status==='published'),materials:[]}}));
  await page.goto(`/estudiante/cursos/${classroom.id}/planificacion`);
  await expect(page.getByRole('heading',{name:'Tema publicado'})).toBeVisible();
  await expect(page.getByText('Borrador docente')).toHaveCount(0);
  await expect(page.getByRole('navigation',{name:'Ruta académica'})).toBeVisible();
});

async function mockTeacherPlanning(page:import('@playwright/test').Page){
  await page.route('**/api/v1/me',route=>route.fulfill({json:{user:teacher,csrfToken:'planning-csrf'}}));
  await page.route(`**/api/v1/classrooms/${classroom.id}`,route=>route.fulfill({json:classroom}));
  await page.route(`**/api/v1/classrooms/${classroom.id}/planning`,route=>route.fulfill({json:{plan:{id:'plan',title:'Plan sintético',weekCount:18,revision:4},nodes,materials:[]}}));
  await page.route(`**/api/v1/classrooms/${classroom.id}/syllabus-sources`,route=>route.fulfill({json:[]}));
}

test('Fase 2.3.1: protege cambios sin guardar y conserva el estado tras un error',async({page})=>{
  await mockTeacherPlanning(page);
  await page.route(`**/api/v1/classrooms/${classroom.id}/planning/nodes/topic`,route=>route.fulfill({status:503,json:{error:{code:'service_unavailable',message:'Fallo sintético al guardar.'}}}));
  await page.goto(`/docente/cursos/${classroom.id}/planificacion`);
  await page.getByRole('button',{name:'Expandir Unidad sintética'}).click();
  await page.getByRole('button',{name:'Expandir Semana sintética'}).click();
  await page.getByRole('button',{name:/Tema publicado/}).click();
  await page.getByRole('textbox',{name:'Título',exact:true}).fill('Edición pendiente');
  await expect(page.getByText('Cambios sin guardar')).toBeVisible();
  await page.getByRole('button',{name:/Borrador docente/}).click();
  await expect(page.getByRole('heading',{name:'Tienes cambios sin guardar'})).toBeVisible();
  await page.getByRole('button',{name:'Seguir editando'}).click();
  await expect(page.getByRole('textbox',{name:'Título',exact:true})).toHaveValue('Edición pendiente');
  await page.getByRole('button',{name:'Guardar cambios'}).click();
  await expect(page.getByText('Fallo sintético al guardar.')).toBeVisible();
  await expect(page.getByText('Cambios sin guardar')).toBeVisible();
});

test('Fase 2.3.1: previsualiza y confirma una única duplicación segura',async({page})=>{
  await mockTeacherPlanning(page);let duplicateCalls=0;
  const target={id:'55555555-5555-4555-8555-555555555555',name:'Álgebra sintética',section:'P2',period:'2099-I',shift:'Tarde',hasPlanning:false,eligible:true};
  await page.route(`**/api/v1/classrooms/${classroom.id}/planning/destinations`,route=>route.fulfill({json:[target]}));
  await page.route(`**/api/v1/classrooms/${classroom.id}/planning/duplicate-preview`,route=>route.fulfill({json:{target,conflict:false,canDuplicate:true,reason:null,impact:{nodes:4,enrollments:0,results:0,status:'draft'}}}));
  await page.route(`**/api/v1/classrooms/${classroom.id}/planning/duplicate`,route=>{duplicateCalls++;return route.fulfill({status:201,json:{id:'copy'}});});
  await page.goto(`/docente/cursos/${classroom.id}/planificacion`);
  await page.getByRole('button',{name:'Opciones'}).click();
  await page.getByLabel('Aula de destino').selectOption(target.id);
  await expect(page.getByText('Vista previa del impacto')).toBeVisible();
  await expect(page.getByText('Matrículas',{exact:true}).locator('..')).toContainText('0');
  await page.getByRole('button',{name:'Confirmar duplicación'}).click();
  await expect(page.getByText(/Planificación duplicada/)).toBeVisible();
  expect(duplicateCalls).toBe(1);
});

test('Fase 2.3.1: revisa, guarda e importa una propuesta solo como borrador',async({page})=>{
  await mockTeacherPlanning(page);
  const source={id:'66666666-6666-4666-8666-666666666666',fileName:'silabo-sintetico.pdf',status:'extracted',text:'Unidad I. Semana 1. Contenido sintético verificable.',externalConsent:false,createdAt:'2099-01-01'};
  const empty={version:1,title:'Revisión de silabo-sintetico.pdf',subjectName:'',competencies:[],notes:'',unresolved:[],nodes:[]};
  await page.unroute(`**/api/v1/classrooms/${classroom.id}/syllabus-sources`);
  await page.route(`**/api/v1/classrooms/${classroom.id}/syllabus-sources`,route=>route.fulfill({json:[source]}));
  await page.route(`**/api/v1/classrooms/${classroom.id}/syllabus/${source.id}/proposals/manual`,route=>route.fulfill({status:201,json:{id:'proposal',sourceId:source.id,status:'ready',payload:empty,source}}));
  await page.route(`**/api/v1/classrooms/${classroom.id}/planning-proposals/proposal`,async route=>route.fulfill({json:{id:'proposal',sourceId:source.id,status:'ready',payload:route.request().postDataJSON(),source}}));
  await page.route(`**/api/v1/classrooms/${classroom.id}/planning-proposals/proposal/impact`,route=>route.fulfill({json:{create:{units:1,weeks:0,modules:0,topics:0,subtopics:0,milestones:0,total:1},modify:0,existing:4,publishes:0,warning:'Solo borradores.'}}));
  await page.route(`**/api/v1/classrooms/${classroom.id}/planning-proposals/proposal/apply`,route=>route.fulfill({json:{impact:{total:1}}}));
  await page.goto(`/docente/cursos/${classroom.id}/planificacion`);
  await page.getByRole('button',{name:'Revisar estructura'}).click();
  await expect(page.getByRole('heading',{name:'Revisar propuesta de planificación'})).toBeVisible();
  await page.getByRole('button',{name:'Agregar elemento principal'}).click();
  await page.locator('.proposal-node-grid input').first().fill('Unidad revisada');
  await page.screenshot({path:'test-results/fase-2-3-1/propuesta-revision-1280.png',fullPage:true});
  await page.getByRole('button',{name:'Guardar revisión'}).click();
  await page.getByRole('button',{name:'Revisar impacto'}).click();
  await expect(page.getByText('Impacto antes de importar')).toBeVisible();
  await page.getByRole('button',{name:'Confirmar importación'}).click();
  await expect(page.getByText(/Propuesta importada como borrador/)).toBeVisible();
});
