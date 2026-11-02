import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function signIn(page: Page, username: "docente" | "alumno" = "docente") {
  await page.goto("/login");
  await page.getByLabel("Usuario").fill(username);
  await page.getByLabel("Contraseña", { exact: true }).fill("1234");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
}

test.beforeEach(async ({ page }) => signIn(page));

test("banco por aula, pregunta revisada, intentos ilimitados y vista previa docente", async ({ page }) => {
  await page.goto("/docente/aulas");
  await page.getByRole("button", { name: "Crear aula", exact: true }).click();
  await page.getByLabel("Asignatura").fill("LOGARITMOS");
  await page.getByLabel("Sección", { exact: true }).fill("B1");
  await page.getByLabel("Turno").selectOption("Tarde");
  await page.getByRole("button", { name: "Crear aula de demostración" }).click();
  await page.locator(".route-card").filter({ hasText: "Banco de preguntas" }).click();
  await page.getByRole("link", { name: "Crear primera pregunta" }).click();
  await expect(page.getByLabel("Aula de destino")).toHaveValue(/.+/);
  await page.getByLabel("Tema", { exact: true }).fill("Ecuaciones logarítmicas");
  await page.getByLabel("Enunciado", { exact: true }).fill("Resuelve la ecuación logarítmica.");
  await page.getByLabel(/Expresión matemática/).fill("\\log_2(x)=3");
  const alternatives = page.getByRole("group", { name: "Alternativas y respuesta correcta" });
  await alternatives.getByRole("button", { name: "Agregar alternativa" }).click();
  await expect(alternatives.getByLabel("Alternativa 5", { exact: true })).toBeVisible();
  await alternatives.getByRole("button", { name: "Quitar alternativa" }).click();
  for (const [index, value] of ["x=4", "x=8", "x=6", "x=9"].entries())
    await alternatives.getByLabel(`Alternativa ${index + 1}`, { exact: true }).fill(value);
  await alternatives.getByRole("radio", { name: "Correcta" }).nth(1).check();
  await page.getByLabel("Regla o concepto utilizado").fill("Definición de logaritmo como exponente.");
  await page.getByLabel("Paso 1").fill("Convierte log₂(x) = 3 a su forma exponencial.");
  await page.getByLabel("Paso 2").fill("Escribe x = 2³.");
  await page.getByLabel("Paso 3").fill("Calcula x = 8 y comprueba el dominio.");
  await page.getByRole("button", { name: "Guardar pregunta" }).click();
  await expect(page.getByText("Pendiente de revisión", { exact: true })).toBeVisible();
  await page.getByLabel(/He comprobado manualmente/).check();
  await page.getByRole("button", { name: "Marcar revisada · demo" }).click();
  await expect(page.getByText("Revisada", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Editar pregunta" }).click();
  await page.getByLabel("Tema", { exact: true }).fill("Ecuaciones logarítmicas avanzadas");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Pendiente de revisión", { exact: true })).toBeVisible();
  await page.getByLabel(/He comprobado manualmente/).check();
  await page.getByRole("button", { name: "Marcar revisada · demo" }).click();
  await page.getByRole("link", { name: "Usar en evaluación" }).click();
  await page.getByLabel("Título", { exact: true }).fill("Práctica de logaritmos");
  await page.getByLabel("Apertura", { exact: true }).fill("2026-10-27T09:00");
  await page.getByLabel("Cierre", { exact: true }).fill("2026-10-28T09:00");
  await page.getByLabel("Reglas e instrucciones").fill("Resuelve y comprueba cada equivalencia.");
  await expect(page.getByRole("radio", { name: /Intentos ilimitados/ })).toBeChecked();
  await page.getByRole("radio", { name: /Número específico/ }).check();
  await page.getByLabel("Máximo de intentos").fill("7");
  await page.getByRole("radio", { name: /Intentos ilimitados/ }).check();
  await page.getByRole("radio", { name: /Número específico/ }).check();
  await expect(page.getByLabel("Máximo de intentos")).toHaveValue("7");
  await page.getByLabel("Máximo de intentos").fill("0");
  await expect(page.getByText("Configura un número entero positivo de intentos.")).toBeVisible();
  await page.getByRole("radio", { name: /Intentos ilimitados/ }).check();
  await page.getByRole("button", { name: "Enviar a revisión" }).click();
  await page.getByLabel("He revisado preguntas, fechas y reglas.").check();
  await page.getByRole("button", { name: "Simular publicación" }).click();
  await page.getByRole("button", { name: "Confirmar publicación demo" }).click();
  await page.getByRole("link", { name: "Previsualizar como estudiante" }).click();
  await expect(page.locator("[data-profile=docente]")).toBeVisible();
  await expect(page.getByText("Sigues en el espacio Docente.")).toBeVisible();
  await expect(page.getByText("Estudiante demo")).toHaveCount(0);
  await page.getByRole("link", { name: "Volver al editor docente" }).click();
  await expect(page.getByLabel("Título", { exact: true })).toHaveValue("Práctica de logaritmos");
  await page
    .getByRole("navigation", { name: "Navegación principal" })
    .getByRole("link", { name: "Banco de preguntas", exact: true })
    .click();
  await page
    .locator(".question-row")
    .filter({ hasText: "Resuelve la ecuación logarítmica." })
    .getByRole("link", { name: "Ver y editar" })
    .click();
  await page.getByRole("button", { name: "Eliminar pregunta" }).click();
  await page.getByRole("button", { name: "Confirmar eliminación" }).click();
  await expect(page.getByText("Todavía no tienes preguntas para esta aula")).toBeVisible();
});

test("las preguntas y evaluaciones se aíslan entre aulas", async ({ page }) => {
  await page.goto("/docente/banco?aula=algebra");
  await expect(page.getByText("Todavía no tienes preguntas para esta aula")).toBeVisible();
  await expect(page.getByText(/derivada|integral|límite/i)).toHaveCount(0);
  await page.goto("/docente/evaluaciones/nueva?aula=algebra");
  await expect(page.getByText("Todavía no tienes preguntas para esta aula")).toBeVisible();
  await expect(page.locator(".question-choice")).toHaveCount(0);
  await expect(page.locator("[data-profile=docente]")).toBeVisible();
});

test("movimiento reducido elimina las animaciones y conserva la navegación", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/docente");
  await page.getByRole("link", { name: "Mis aulas", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Mis aulas" })).toBeVisible();
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await page.getByRole("button", { name: "Crear aula", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

for (const width of [390, 768, 1440])
  test(`Fase 1.2 visual, temas y accesibilidad a ${width}px`, async ({ page }) => {
    test.setTimeout(150000);
    await page.setViewportSize({ width, height: 1000 });
    const paths = [
      "/docente",
      "/docente/aulas",
      "/docente/aulas/calculo",
      "/docente/aulas/algebra/importar",
      "/docente/banco?aula=calculo",
      "/docente/banco/derivada-polinomio?aula=calculo",
      "/docente/evaluaciones",
      "/docente/evaluaciones/control",
      "/docente/evaluaciones/repaso/previsualizar",
      "/docente/perfil",
      "/estudiante",
      "/estudiante/perfil",
    ];
    let role: "docente" | "alumno" = "docente";
    for (const route of paths) {
      if (route.startsWith("/estudiante") && role !== "alumno") {
        await page.getByRole("button", { name: "Cerrar sesión" }).click();
        await signIn(page, "alumno");
        role = "alumno";
      }
      await page.goto(route);
      await expect(page.locator("h1")).toBeVisible();
      if (route.endsWith("/importar")) {
        await page.getByRole("button", { name: "Usar archivo de demostración" }).click();
        await expect(page.getByRole("heading", { name: "Revisa los participantes" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Revisa los participantes" })).toBeFocused();
      }
      for (const dark of [false, true]) {
        if (dark) await page.getByRole("button", { name: "Activar modo oscuro" }).click();
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => {})));
        });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
        const name = route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
        await page.screenshot({
          path: `test-results/fase-1-2/${width}-${name}-${dark ? "oscuro" : "claro"}.png`,
          fullPage: true,
        });
        const result = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        expect(result.violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target) }))).toEqual([]);
      }
    }
  });
