import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import writeXlsxFile from "write-excel-file/node";

async function signIn(page: Page, username: "docente" | "alumno" = "docente") {
  await page.goto("/login");
  await page.getByLabel("Usuario").fill(username);
  await page.getByLabel("Contraseña", { exact: true }).fill("1234");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(username === "docente" ? /\/docente$/ : /\/estudiante$/);
}

test.beforeEach(async ({ page }) => signIn(page));

async function syntheticRoster() {
  const directory = path.resolve("test-results/fase-1-2");
  await mkdir(directory, { recursive: true });
  const filePath = path.join(directory, "participantes-sinteticos.xlsx");
  const data = [
    ["Código de estudiante", "Nombres", "Apellidos", "Dirección de correo", "Roles"],
    ["SYN-101", "Lucía", "Sintética Uno", "lucia@example.invalid", "Estudiante"],
    ["SYN-102", "Mateo", "Sintético Dos", "mateo@example.invalid", "Estudiante"],
    ["SYN-102", "Registro", "Duplicado", "duplicado@example.invalid", "Estudiante"],
    ["", "Alex", "Por Confirmar", "", ""],
    ["SYN-DOC", "Docente", "Sintético", "docente@example.invalid", "Docente"],
  ];
  await writeXlsxFile(data, { sheet: "Participantes" }).toFile(filePath);
  return filePath;
}

test("crea LOGARITMOS con el modelo vigente, mantiene Docente y comienza con banco vacío", async ({ page }) => {
  await page.goto("/docente/aulas");
  await page.getByRole("button", { name: "Crear aula", exact: true }).click();
  await page.getByLabel("Asignatura").fill("LOGARITMOS");
  await page.getByLabel("Sección", { exact: true }).fill("B1");
  await page.getByLabel("Turno").selectOption("Tarde");
  await page.getByRole("button", { name: "Crear aula de demostración" }).click();
  await expect(page.locator("[data-profile=docente]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "LOGARITMOS" })).toBeVisible();
  await expect(page.getByText("2026-II / SECCIÓN B1")).toBeVisible();
  await expect(page.getByText("Tarde · Aula de demostración")).toBeVisible();
  await page.locator(".route-card").filter({ hasText: "Banco de preguntas" }).click();
  await expect(page).toHaveURL(/\/docente\/banco\?aula=/);
  await expect(page.getByText("Todavía no tienes preguntas para esta aula")).toBeVisible();
  await expect(page.getByText(/Derivadas|Integrales|Límites/)).toHaveCount(0);
});

test("lee filas reales de un XLSX, revisa roles y confirma una importación parcial", async ({ page }) => {
  const filePath = await syntheticRoster();
  await page.goto("/docente/aulas/algebra/importar");
  await page.locator('input[type="file"]').setInputFiles(filePath);
  await expect(page.getByRole("heading", { name: "Revisa los participantes" })).toBeVisible();
  await expect(page.getByLabel("Nombres fila 2")).toHaveValue("Lucía");
  await expect(page.getByLabel("Nombres fila 3")).toHaveValue("Mateo");
  await expect(page.getByText("Estudiante demo 04")).toHaveCount(0);
  await expect(page.locator("tbody").getByText("Duplicado", { exact: true })).toHaveCount(2);
  await expect(page.locator("tbody").getByText("Excluido", { exact: true })).toBeVisible();
  await expect(page.locator("tbody").getByText("Participante por confirmar", { exact: true })).toBeVisible();
  await page.getByLabel("Incluir fila 5").check();
  await page.getByRole("button", { name: /Revisar resumen/ }).click();
  await expect(page.getByText("importación parcial")).toBeVisible();
  await page.getByLabel(/He revisado la selección/).check();
  await page.getByRole("button", { name: "Confirmar incorporación" }).click();
  await expect(page.getByRole("heading", { name: "Importación parcial completada" })).toBeVisible();
  await page.getByRole("link", { name: "Ver estudiantes" }).click();
  await expect(page.getByText("Lucía Sintética Uno", { exact: true })).toBeVisible();
  await expect(page.getByText("Alex Por Confirmar", { exact: true })).toBeVisible();
  await expect(page.getByText("Docente Sintético", { exact: true })).toHaveCount(0);
  await expect(page.locator("[data-profile=docente]")).toBeVisible();
});

test("rechaza un XLS heredado con una explicación y permite reintentar", async ({ page }) => {
  await page.goto("/docente/aulas/algebra/importar");
  await page.locator('input[type="file"]').setInputFiles({
    name: "participantes-antiguos.xls",
    mimeType: "application/vnd.ms-excel",
    buffer: Buffer.from("contenido sintético no ejecutable"),
  });
  await expect(page.getByRole("alert")).toContainText("Guárdalo como .xlsx o .csv");
  await page.getByRole("button", { name: "Usar archivo de demostración" }).click();
  await expect(page.getByRole("heading", { name: "Revisa los participantes" })).toBeVisible();
});

test("agrega, edita y retira un estudiante manual sin crear credenciales", async ({ page }) => {
  await page.goto("/docente/aulas/algebra");
  await page.getByRole("button", { name: "Agregar estudiante", exact: true }).click();
  await page.getByLabel("Código institucional").fill("MAN-001");
  await page.getByLabel("Nombres", { exact: true }).fill("Andrea");
  await page.getByLabel("Apellidos", { exact: true }).fill("Sintética Manual");
  await page.getByLabel("Correo electrónico").fill("andrea@example.invalid");
  await page.getByRole("button", { name: "Agregar estudiante", exact: true }).click();
  await expect(page.getByText("Andrea Sintética Manual", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Agregar estudiante", exact: true }).click();
  await page.getByLabel("Código institucional").fill("MAN-001");
  await page.getByLabel("Nombres", { exact: true }).fill("Otra");
  await page.getByLabel("Apellidos", { exact: true }).fill("Persona Sintética");
  await page.getByRole("button", { name: "Agregar estudiante", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Ya existe un estudiante");
  await page.getByRole("button", { name: "Cancelar" }).click();
  await page.getByRole("button", { name: "Editar a Andrea Sintética Manual" }).click();
  await page.getByLabel("Apellidos", { exact: true }).fill("Sintética Editada");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Andrea Sintética Editada", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Retirar a Andrea Sintética Editada" }).click();
  await page.getByRole("button", { name: "Confirmar retiro" }).click();
  await expect(page.getByText("Andrea Sintética Editada", { exact: true })).toHaveCount(0);
  await expect(page.locator("[data-profile=docente]")).toBeVisible();
});

test("edita perfiles locales, protege cambios pendientes y conserva los datos protegidos", async ({ page }) => {
  await page.goto("/docente/perfil");
  await expect(page.getByText("docente.demo@auligma.test", { exact: true })).toBeVisible();
  await page.getByLabel("Nombres", { exact: true }).fill("Profesora");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("link", { name: "Mis aulas", exact: true }).click();
  await expect(page).toHaveURL(/\/docente\/perfil$/);
  await page.getByRole("button", { name: "Guardar perfil" }).click();
  await expect(page.getByRole("status")).toContainText("Perfil de demostración actualizado");
  await expect(page.locator(".profile strong")).toContainText("Profesora Demo");

  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await signIn(page, "alumno");
  await page.goto("/estudiante/perfil");
  await expect(page.getByLabel("Escuela profesional").locator("option")).toHaveCount(6);
  await page.getByLabel("Escuela profesional").selectOption("Agronomía");
  await page.getByRole("button", { name: "Guardar perfil" }).click();
  await expect(page.getByRole("status")).toContainText("Perfil de demostración actualizado");
  await expect(page.getByText("DEM-EST-01", { exact: false })).toBeVisible();
});

test("archiva y restaura un aula sin perder su matrícula local", async ({ page }) => {
  await page.goto("/docente/aulas/algebra");
  await page.getByRole("button", { name: "Agregar estudiante", exact: true }).click();
  await page.getByLabel("Nombres", { exact: true }).fill("Registro");
  await page.getByLabel("Apellidos", { exact: true }).fill("Conservado");
  await page.getByRole("button", { name: "Agregar estudiante", exact: true }).click();
  await page.getByRole("button", { name: "Archivar aula" }).click();
  await expect(page.getByRole("button", { name: "Confirmar archivado" })).toBeDisabled();
  await page.getByLabel(/Escribe Álgebra lineal/).fill("Álgebra lineal");
  await page.getByLabel(/Comprendo que el aula quedará archivada/).check();
  await page.getByRole("button", { name: "Confirmar archivado" }).click();
  await expect(page.getByRole("heading", { name: "Aulas archivadas" })).toBeVisible();
  await expect(page.locator(".archived-list")).toContainText("Álgebra lineal");
  await page.getByRole("button", { name: "Restaurar aula" }).click();
  await page.getByRole("link", { name: /Ver aula/ }).filter({ hasText: "Álgebra lineal" }).click();
  await expect(page.getByText("Registro Conservado", { exact: true })).toBeVisible();
});

test("revisión documental restablece la verificación al editar", async ({ page }) => {
  await page.goto("/docente/revision");
  await page.getByRole("button", { name: "Abrir documento de muestra" }).click();
  await page.getByRole("button", { name: "Simular verificación" }).click();
  await page.getByRole("button", { name: "Aprobar en demostración" }).click();
  await page.getByRole("button", { name: "Confirmar aprobación demo" }).click();
  await expect(page.getByRole("status")).toContainText("Aprobado en esta sesión");
  await page.getByLabel("Enunciado").fill("Nueva transcripción sintética");
  await expect(page.getByRole("button", { name: "Simular verificación" })).toBeVisible();
});

test("la práctica conserva respuestas y muestra retroalimentación preparada", async ({ page }) => {
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await signIn(page, "alumno");
  await page.goto("/estudiante/practica");
  await page.getByRole("radio").nth(1).check();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("button", { name: "Anterior" }).click();
  await expect(page.getByRole("radio").nth(1)).toBeChecked();
  await page.reload();
  await expect(page.getByRole("radio").nth(1)).toBeChecked();
  await page.getByRole("button", { name: "Comprobar respuesta" }).click();
  await expect(page.getByText("Respuesta incorrecta. Revisemos el procedimiento.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Desarrollo paso a paso" })).toBeVisible();
  await expect(page.locator("[data-profile=estudiante]")).toBeVisible();
});
