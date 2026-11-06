import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const student = {id:'synthetic',role:'estudiante',email:'synthetic@example.invalid',firstNames:'Estudiante',lastNames:'Sintético',phone:'',photo:null,schoolId:null,universityCode:null,professionalInfo:'',profileComplete:false};
test('API real: configuración pendiente y demo incapaz de iniciar sesión', async ({page,request}) => {
  await page.addInitScript(() => sessionStorage.setItem('auligma.demo.session','demo-teacher'));
  await page.goto('/docente'); await expect(page).toHaveURL(/login/);
  await expect(page.getByRole('button',{name:'Continuar con Google'})).toBeDisabled();
  await expect(page.getByLabel('Contraseña',{exact:true})).toHaveCount(0);
  expect((await request.get('/api/v1/me')).status()).toBe(401);
  expect((await request.get('/api/v1/classrooms')).status()).toBe(401);
});
test('API simulada: perfil, persistencia al recargar, curso vacío, sesión y logout', async ({page}) => {
  let current = {...student}; let authenticated = true;
  await page.route('**/api/v1/me', async route => {
    if (route.request().method() === 'PATCH') {
      expect(route.request().headers()['x-csrf-token']).toBe('synthetic-csrf');
      current = {...current,...route.request().postDataJSON(),profileComplete:true};
      await route.fulfill({json:{user:current}});
    } else await route.fulfill({status:authenticated ? 200 : 401,json:authenticated ? {user:current,csrfToken:'synthetic-csrf'} : {error:{message:'Sesión finalizada'}}});
  });
  await page.route('**/api/v1/classrooms',route => route.fulfill({json:[]}));
  await page.route('**/api/v1/auth/logout',route => { authenticated=false; return route.fulfill({json:{ok:true}}); });
  await page.goto('/estudiante'); await expect(page).toHaveURL(/perfil/);
  await page.getByLabel('Nombres',{exact:true}).fill('Nombre Sintético');
  await page.getByLabel('Escuela profesional').selectOption('4');
  await page.getByRole('button',{name:'Guardar perfil'}).click();
  await expect(page.getByRole('status')).toHaveText('Tu perfil se guardó correctamente.');
  await page.reload(); await expect(page.getByLabel('Nombres',{exact:true})).toHaveValue('Nombre Sintético');
  await page.getByRole('link',{name:'Mis cursos',exact:true}).click();
  await expect(page.getByText('Todavía no tienes cursos asignados')).toBeVisible();
  await page.getByRole('button',{name:'Cerrar sesión'}).click(); await expect(page).toHaveURL(/login/);
  await page.goto('/estudiante'); await expect(page).toHaveURL(/login/);
});
test('API simulada: backend no disponible y errores Google', async ({page}) => {
  await page.route('**/api/v1/**',route => route.abort());
  await page.goto('/login'); await expect(page.getByRole('alert')).toContainText('No podemos conectar');
  await expect(page.getByRole('button',{name:'Volver a intentar'})).toBeVisible();
  for (const [code,message] of [['cancelled','Cancelaste'],['authentication_failed','No pudimos verificar'],['google_unreachable','no pudo contactar con Google'],['account_not_authorized','no tiene autorización']]) {
    await page.goto(`/login?error=${code}`); await expect(page.getByRole('alert')).toContainText(message);
  }
});
for (const width of [390,768,1024,1440]) test(`Login y perfil: ${width}px, ambos temas y axe`, async ({page}) => {
  await page.setViewportSize({width,height:1000});
  await page.goto('/login');
  for (const dark of [false,true]) {
    if (dark) await page.getByRole('button',{name:'Activar modo oscuro'}).click();
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
    await page.screenshot({path:`test-results/fase-2-1/login-${width}-${dark?'oscuro':'claro'}.png`,fullPage:true});
  }
  await page.route('**/api/v1/me',route => route.fulfill({json:{user:student,csrfToken:'synthetic-csrf'}}));
  await page.goto('/estudiante/perfil');
  for (const dark of [false,true]) {
    if (dark) await page.getByRole('button',{name:'Activar modo oscuro'}).click();
    await expect(page.getByRole('heading',{name:'Completa tu perfil'})).toBeVisible();
    await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
    await page.screenshot({path:`test-results/fase-2-1/perfil-${width}-${dark?'oscuro':'claro'}.png`,fullPage:true});
  }
});
test('Teclado, movimiento reducido y tamaño equivalente a zoom 200%', async ({page}) => {
  await page.setViewportSize({width:720,height:450});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/login');
  await page.getByRole('link',{name:'Saltar al contenido'}).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#contenido')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
test('API simulada: sesión caducada y cambios de perfil sin guardar', async ({page}) => {
  let expired = false;
  await page.route('**/api/v1/me',route => route.fulfill({status:expired ? 401 : 200,json:expired ? {error:{message:'Tu sesión terminó.'}} : {user:{...student,schoolId:4,profileComplete:true},csrfToken:'synthetic-csrf'}}));
  await page.goto('/estudiante/perfil');
  await page.getByLabel('Nombres',{exact:true}).fill('Cambio pendiente');
  page.once('dialog',dialog => dialog.dismiss());
  await page.getByRole('link',{name:'Mis cursos',exact:true}).click();
  await expect(page).toHaveURL(/perfil/);
  expired=true;
  await page.getByRole('button',{name:'Guardar perfil'}).click();
  await expect(page).toHaveURL(/login/);
  await expect(page.getByRole('alert')).toContainText('Tu sesión terminó');
});
for(const width of [390,1440]) test(`API simulada: aula docente, formulario y estado vacío a ${width}px`, async ({page}) => {
  await page.setViewportSize({width,height:1000});
  const teacher={...student,role:'docente',profileComplete:true};
  const courses:{id:string;name:string;section:string;period:string;shift:string}[]=[];
  await page.route('**/api/v1/me',route=>route.fulfill({json:{user:teacher,csrfToken:'synthetic-csrf'}}));
  await page.route('**/api/v1/subjects',route=>route.fulfill({json:route.request().method()==='POST'?{id:'synthetic-subject',name:'Asignatura sintética'}:[]}));
  await page.route('**/api/v1/classrooms',route=>{
    if(route.request().method()==='POST') {
      const body=route.request().postDataJSON(); expect(body).not.toHaveProperty('teacherId');
      courses.push({id:'synthetic-classroom',name:'Asignatura sintética',section:body.section,period:body.period,shift:body.shift});
      return route.fulfill({status:201,json:courses[0]});
    }
    return route.fulfill({json:courses});
  });
  await page.route('**/api/v1/classrooms?includeArchived=true',route=>route.fulfill({json:courses}));
  await page.goto('/docente/cursos');
  await expect(page.getByText('Tu próxima aula comienza aquí')).toBeVisible();
  await page.getByRole('button',{name:'Crear aula',exact:true}).click();
  await page.getByLabel('Nombre de la asignatura').fill('Asignatura sintética');
  await page.getByLabel('Sección',{exact:true}).fill('A');
  await page.getByLabel('Periodo',{exact:true}).fill('2099-I');
  await page.evaluate(()=>Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await page.screenshot({path:`test-results/fase-2-1/crear-aula-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Crear aula privada',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Asignatura sintética'})).toBeVisible();
  for(const dark of [false,true]) {
    if(dark) await page.getByRole('button',{name:'Activar modo oscuro'}).click();
    await page.evaluate(()=>Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
    expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
    await page.screenshot({path:`test-results/fase-2-1/cursos-${width}-${dark?'oscuro':'claro'}.png`,fullPage:true});
  }
});
