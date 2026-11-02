import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const baseStudent = {id:'synthetic',role:'estudiante',email:'synthetic@example.invalid',firstNames:'Estudiante',lastNames:'Sintético',phone:'',photo:null,schoolId:4,universityCode:null,professionalInfo:'',profileComplete:true};

for (const width of [390,768,1024,1440]) test(`Fase 2.2: matrícula por correos, revisión y nómina a ${width}px`, async ({page}) => {
  await page.setViewportSize({width,height:1000});
  const teacher={...baseStudent,id:'synthetic-teacher',role:'docente',email:'teacher@example.invalid',firstNames:'Docente',lastNames:'Sintético',schoolId:null};
  const classroom={id:'11111111-1111-4111-8111-111111111111',name:'Matemática sintética',section:'S1',period:'2099-I',shift:'Tarde',teacherName:'Docente Sintético',archivedAt:null};
  const roster:{id:string;email:string;status:string;firstNames:string;lastNames:string;authorizedAt:string;linkedAt:null;revokedAt:null}[]=[];
  await page.route('**/api/v1/me',route=>route.fulfill({json:{user:teacher,csrfToken:'synthetic-csrf'}}));
  await page.route(`**/api/v1/classrooms/${classroom.id}`,route=>route.fulfill({json:classroom}));
  await page.route(`**/api/v1/classrooms/${classroom.id}/enrollment-requests`,route=>route.fulfill({json:[]}));
  await page.route(`**/api/v1/classrooms/${classroom.id}/enrollments/preview`,async route=>{
    expect(route.request().headers()['x-csrf-token']).toBe('synthetic-csrf');
    const values=(route.request().postDataJSON().input as string).split(/[,;\n]/).map(value=>value.trim()).filter(Boolean);
    const seen=new Set<string>();
    const items=values.map(input=>{const email=input.toLowerCase();const valid=/^[a-z0-9][a-z0-9._%+-]*@undc\.edu\.pe$/.test(email);const duplicate=seen.has(email);seen.add(email);return {input,email,status:!valid?'invalid':duplicate?'duplicate':'valid',selected:valid&&!duplicate,message:!valid?'Usa un correo institucional @undc.edu.pe válido.':duplicate?'Dirección repetida en esta lista.':'Listo para autorizar.'};});
    await route.fulfill({json:{items,totals:{detected:items.length,valid:items.filter(item=>item.status==='valid').length,invalid:items.filter(item=>item.status==='invalid').length,duplicates:items.filter(item=>item.status==='duplicate').length,alreadyEnrolled:0,revoked:0,willAuthorize:items.filter(item=>item.status==='valid').length}}});
  });
  await page.route(`**/api/v1/classrooms/${classroom.id}/enrollments`,async route=>{
    if(route.request().method()==='GET') return route.fulfill({json:roster});
    const emails=route.request().postDataJSON().emails as string[];
    emails.forEach((email,index)=>roster.push({id:`synthetic-${index}`,email,status:'preauthorized',firstNames:'',lastNames:'',authorizedAt:new Date('2099-01-01').toISOString(),linkedAt:null,revokedAt:null}));
    return route.fulfill({status:201,json:{authorized:emails.length,skipped:0}});
  });
  await page.goto(`/docente/cursos/${classroom.id}`);
  await expect(page.getByRole('heading',{name:'Estudiantes',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Agregar estudiantes'}).click();
  await page.getByLabel('Correos institucionales').fill('student.001@undc.edu.pe\nstudent.002@undc.edu.pe\nstudent.002@undc.edu.pe\nincorrecto@example.invalid');
  await page.getByRole('button',{name:'Revisar lista'}).click();
  await expect(page.getByText('Se revisaron 4 direcciones.')).toBeVisible();
  await expect(page.getByText('Duplicada',{exact:true})).toBeVisible();
  await expect(page.getByText('Inválida',{exact:true})).toBeVisible();
  await expect(page.getByText('2 seleccionados')).toBeVisible();
  await page.getByRole('button',{name:'Deseleccionar'}).click();
  await expect(page.getByRole('button',{name:/Confirmar 0 matrículas/})).toBeDisabled();
  await page.getByRole('button',{name:'Seleccionar válidos'}).click();
  expect(await page.locator('.enrollment-modal').evaluate(element=>element.scrollWidth<=element.clientWidth)).toBeTruthy();
  await page.screenshot({path:`test-results/fase-2-2-1/matriculas-${width}-claro.png`,fullPage:true});
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Activar modo oscuro'}).click();
  await page.getByRole('button',{name:'Agregar estudiantes'}).click();
  await page.getByLabel('Correos institucionales').fill('student.001@undc.edu.pe\nstudent.002@undc.edu.pe\nstudent.002@undc.edu.pe\nincorrecto@example.invalid');
  await page.getByRole('button',{name:'Revisar lista'}).click();
  await expect(page.locator('.enrollment-modal')).toHaveAttribute('data-theme','dark');
  await page.screenshot({path:`test-results/fase-2-2-1/matriculas-${width}-oscuro.png`,fullPage:true});
  await page.getByRole('button',{name:/Confirmar 2 matrículas/}).click();
  await expect(page.getByRole('status')).toContainText('Se autorizaron correctamente 2 estudiantes');
  await page.getByRole('button',{name:'Volver a la nómina'}).click();
  await expect(page.getByText('Pendiente de primer acceso').first()).toBeVisible();
  await page.evaluate(()=>Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await page.screenshot({path:`test-results/fase-2-2-1/nomina-${width}-oscuro.png`,fullPage:true});
});

test('Fase 2.2.1: ciclo seguro archiva, restaura y exige nombre exacto para eliminar', async ({page}) => {
  const teacher={...baseStudent,id:'synthetic-teacher',role:'docente',email:'teacher@example.invalid',firstNames:'Docente',lastNames:'Sintético',schoolId:null};
  const classroom={id:'33333333-3333-4333-8333-333333333333',name:'Álgebra sintética',section:'A1',period:'2099-I',shift:'Noche',teacherName:'Docente Sintético',archivedAt:null as string|null};
  const actions:string[]=[];
  await page.route('**/api/v1/me',route=>route.fulfill({json:{user:teacher,csrfToken:'synthetic-csrf'}}));
  await page.route(`**/api/v1/classrooms/${classroom.id}/lifecycle-impact`,route=>route.fulfill({json:{id:classroom.id,name:classroom.name,archivedAt:classroom.archivedAt,students:{total:3,active:2,preauthorized:1,revoked:0},planning:{available:false,count:null},assessments:{available:false,count:null},deletionStrategy:'logical'}}));
  await page.route(`**/api/v1/classrooms/${classroom.id}`,async route=>{
    if(route.request().method()==='GET') return route.fulfill({json:classroom});
    const body=route.request().postDataJSON();actions.push(body.action);
    classroom.archivedAt=body.action==='archive' ? new Date().toISOString():body.action==='restore' ? null:classroom.archivedAt;
    return route.fulfill({json:{id:classroom.id,archived_at:classroom.archivedAt,deleted_at:body.action==='delete' ? new Date().toISOString():null}});
  });
  await page.route(`**/api/v1/classrooms/${classroom.id}/enrollment-requests`,route=>route.fulfill({json:[]}));
  await page.route(`**/api/v1/classrooms/${classroom.id}/enrollments`,route=>route.fulfill({json:[]}));
  await page.goto(`/docente/cursos/${classroom.id}`);
  await page.getByRole('button',{name:'Archivar aula'}).click();
  await expect(page.locator('.impact-grid article').filter({hasText:'matrículas conservadas'})).toContainText('3');
  await page.getByText(/Comprendo que los estudiantes/).click();
  await page.getByRole('button',{name:'Archivar aula',exact:true}).last().click();
  await expect(page.getByText('Esta aula está archivada')).toBeVisible();
  await page.getByRole('button',{name:'Restaurar aula'}).click();
  await page.getByRole('button',{name:'Restaurar aula',exact:true}).last().click();
  await expect(page.getByRole('button',{name:'Archivar aula'})).toBeVisible();
  await page.getByRole('button',{name:'Archivar aula'}).click();
  await page.getByText(/Comprendo que los estudiantes/).click();
  await page.getByRole('button',{name:'Archivar aula',exact:true}).last().click();
  await page.getByRole('button',{name:'Eliminar aula'}).click();
  const deleteButton=page.getByRole('button',{name:'Eliminar aula',exact:true}).last();
  await expect(deleteButton).toBeDisabled();
  await page.getByLabel(/Escribe Álgebra sintética/).fill('Álgebra sintética');
  await page.getByText(/Comprendo que esta acción/).click();
  await expect(deleteButton).toBeEnabled();
  await deleteButton.click();
  expect(actions).toEqual(['archive','restore','archive','delete']);
});

test('Fase 2.2: estudiante ve solo el aula autorizada y su estado académico', async ({page}) => {
  const classroom={id:'22222222-2222-4222-8222-222222222222',name:'Curso sintético',section:'E1',period:'2099-II',shift:'Mañana',teacherName:'Docente Sintético',archivedAt:null};
  await page.route('**/api/v1/me',route=>route.fulfill({json:{user:baseStudent,csrfToken:'synthetic-csrf'}}));
  await page.route('**/api/v1/classrooms',route=>route.fulfill({json:[classroom]}));
  await page.route(`**/api/v1/classrooms/${classroom.id}`,route=>route.fulfill({json:classroom}));
  await page.goto('/estudiante/cursos');
  await expect(page.getByRole('heading',{name:'Curso sintético'})).toBeVisible();
  await page.getByRole('link',{name:/Curso sintético/}).click();
  await expect(page.getByText('Tu aula está disponible')).toBeVisible();
  await expect(page.getByText('Tu docente todavía no ha publicado contenidos')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Tu aula está disponible')).toBeVisible();
});
