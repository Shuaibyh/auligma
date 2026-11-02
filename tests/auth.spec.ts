import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function login(page: Page, username: string, password = "1234", withEnter = false) {
  await page.goto("/login");
  await page.getByLabel("Usuario").fill(username);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  if (withEnter) await page.getByLabel("Contraseña", { exact: true }).press("Enter");
  else await page.getByRole("button", { name: "Iniciar sesión" }).click();
}

test("inicia como docente, recupera la sesión y mantiene la identidad", async ({ page }) => {
  await login(page, "docente");
  await expect(page).toHaveURL(/\/docente$/);
  await expect(page.locator("[data-profile=docente]")).toBeVisible();
  await expect(page.locator(".profile strong")).toHaveText("Docente Demo");
  expect(await page.evaluate(() => sessionStorage.getItem("auligma.demo.session"))).toBe("demo-teacher");
  expect(await page.evaluate(() => JSON.stringify(sessionStorage))).not.toContain("1234");
  await page.reload();
  await expect(page.locator("[data-profile=docente]")).toBeVisible();
  await page.goto("/estudiante/progreso");
  await expect(page).toHaveURL(/\/docente$/);
  await page.goto("/docente/aulas");
  await expect(page.getByRole("heading", { name: "Mis aulas" })).toBeVisible();
});

test("inicia como estudiante, solo muestra su aula vinculada y bloquea rutas docentes", async ({ page }) => {
  await login(page, "alumno", "1234", true);
  await expect(page).toHaveURL(/\/estudiante$/);
  await expect(page.locator("[data-profile=estudiante]")).toBeVisible();
  await expect(page.locator(".profile strong")).toHaveText("Estudiante Demo");
  await expect(page.getByRole("heading", { name: "Mis aulas" })).toBeVisible();
  await expect(page.getByText("Cálculo diferencial", { exact: true })).toBeVisible();
  await expect(page.getByText("Álgebra lineal", { exact: true })).toHaveCount(0);
  await page.goto("/docente/evaluaciones");
  await expect(page).toHaveURL(/\/estudiante$/);
  await expect(page.getByRole("link", { name: "Evaluaciones" })).toHaveCount(0);
  await page.reload();
  await expect(page.locator("[data-profile=estudiante]")).toBeVisible();
});

for (const [username, password] of [["docente", "incorrecta"], ["desconocido", "1234"]]) {
  test(`rechaza credenciales inválidas para ${username}`, async ({ page }) => {
    await login(page, username, password);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("alert")).toContainText("Usuario o contraseña incorrectos");
    await expect(page.getByLabel("Contraseña", { exact: true })).toHaveValue("");
  });
}

test("valida campos, no expone credenciales y mantiene el control de contraseña", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("docente / 1234", { exact: true })).toHaveCount(0);
  await expect(page.getByText("alumno / 1234", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Prototipo · Fase 1\.2/)).toHaveCount(0);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByRole("alert")).toHaveText("Escribe el usuario de demostración.");
  await expect(page.getByLabel("Usuario")).toBeFocused();
  await page.getByLabel("Usuario").fill("docente");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByRole("alert")).toHaveText("Escribe la contraseña de demostración.");
  await page.getByLabel("Contraseña", { exact: true }).fill("1234");
  await expect(page.getByLabel("Contraseña", { exact: true })).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Mostrar contraseña" }).click();
  await expect(page.getByLabel("Contraseña", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Ocultar contraseña" }).click();
  await expect(page.getByLabel("Contraseña", { exact: true })).toHaveAttribute("type", "password");
});

test("Google informa que no está habilitado sin crear sesión ni modificar el formulario", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Usuario").fill("usuario escrito manualmente");
  await page.getByLabel("Contraseña", { exact: true }).fill("clave temporal");
  const google = page.getByRole("button", { name: "Continuar con Google" });
  await expect(google).toBeEnabled();
  await google.click();
  await expect(page.getByRole("status")).toHaveText("El acceso con Google aún no está habilitado. Utiliza el inicio de sesión disponible.");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Usuario")).toHaveValue("usuario escrito manualmente");
  await expect(page.getByLabel("Contraseña", { exact: true })).toHaveValue("clave temporal");
  expect(await page.evaluate(() => sessionStorage.getItem("auligma.demo.session"))).toBeNull();
});

test("redirige sin sesión y cerrar sesión impide reabrir el dashboard", async ({ page }) => {
  await page.goto("/docente/aulas");
  await expect(page).toHaveURL(/\/login$/);
  await login(page, "docente");
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => sessionStorage.getItem("auligma.demo.session"))).toBeNull();
  await page.goto("/docente");
  await expect(page).toHaveURL(/\/login$/);
});

for (const width of [390, 768, 1440]) {
  test(`login accesible y responsive a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/login");
    for (const dark of [false, true]) {
      if (dark) await page.getByRole("button", { name: "Activar modo oscuro" }).click();
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(result.violations.map((violation) => violation.id)).toEqual([]);
      await page.screenshot({ path: `test-results/fase-1-2/login-${width}-${dark ? "oscuro" : "claro"}.png`, fullPage: true });
    }
  });
}
