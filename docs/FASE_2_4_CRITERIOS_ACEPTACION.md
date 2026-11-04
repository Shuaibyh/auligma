# AULIGMA — Criterios de aceptación de la Fase 2.4

> Lista de trabajo y prueba, **no reporte de funcionalidades terminadas**. Se deriva de `docs/FASE_2_4_PLAN.md` y debe ajustarse al código real de cada hito. No se han ejecutado pruebas por el hecho de crear este documento.

## Recorrido objetivo

Docente crea borrador → revisa preguntas → publica una versión inmutable → estudiante matriculado inicia y entrega un intento → servidor corrige → docente consulta resultados autorizados.

## Condiciones previas

- Trabajar sobre una rama actualizada y respaldada.
- Usar PostgreSQL de pruebas **`auligma_test`**, nunca la base de desarrollo o producción para pruebas destructivas.
- Preparar dos docentes, dos aulas y estudiantes sintéticos con matrículas activas e inactivas.
- Registrar versión de código, comandos ejecutados, resultados y omisiones reales.

## Matriz de aceptación

| ID | Escenario | Resultado esperado |
|---|---|---|
| A01 | Docente crea práctica en su aula | Se guarda borrador asociado a su identidad y aula |
| A02 | Docente ajeno intenta abrir o editar ese borrador | Acceso denegado; no filtra contenido privado |
| A03 | Se incluye una pregunta de otra aula | Rechazo por servidor |
| A04 | Se intenta publicar sin preguntas aprobadas | Publicación bloqueada con error comprensible |
| A05 | Se publica un borrador válido | Versión y preguntas referenciadas quedan inmutables |
| A06 | Se modifica la pregunta original después de publicar | Intentos y versiones previas mantienen su snapshot |
| A07 | Estudiante sin matrícula activa consulta la evaluación | No recibe contenido ni claves privadas |
| A08 | Estudiante autorizado inicia dentro de la ventana | Se crea o recupera su intento conforme a la política |
| A09 | Dos solicitudes simultáneas intentan crear el mismo intento | No se crean intentos activos duplicados |
| A10 | Se repite un guardado con la misma clave idempotente | No duplica respuesta ni pierde la versión anterior |
| A11 | Dos escrituras usan versiones desactualizadas | Se devuelve conflicto; no sobrescribe silenciosamente |
| A12 | Se repite la entrega por fallo de red | Devuelve resultado consistente; no recalifica dos veces |
| A13 | El cliente envía una nota o solución inventada | Servidor ignora o rechaza esos campos |
| A14 | Dos alternativas son matemáticamente equivalentes en opción única | Bloqueo de publicación o revisión de la pregunta |
| A15 | SymPy devuelve `INDETERMINADO` | No se presenta como verificación positiva |
| A16 | Estudiante solicita resultados antes del momento permitido | No se revelan respuestas correctas ni explicación privada |
| A17 | Docente recalifica con motivo autorizado | Se agrega revisión de calificación; historial previo permanece |
| A18 | Docente de otra aula consulta resultados | Acceso denegado y sin filtración de existencia |
| A19 | Se cierra, archiva o invalida la actividad | Se conservan historiales y auditoría según las reglas |
| A20 | Falla red o expira sesión en una acción crítica | Error recuperable sin publicar ni entregar de manera implícita |

## UX y accesibilidad

Verificar, cuando existan las pantallas correspondientes:

- Estados vacío, carga, guardado, error, conflicto, vencimiento y conexión interrumpida.
- Teclado y foco visible en constructor, orden de preguntas, diálogos y entrega.
- Mensajes de error claros sin depender solamente del color.
- Pruebas visuales en 390, 768 y 1440 px; tema claro y oscuro.
- En estudiante, progreso y tiempo vinculados al servidor, no al reloj del navegador.

## Evidencia de verificación

Para cada caso registrar: **fecha, commit, base de prueba, resultado (aprobado / fallido / no ejecutado), evidencia sin datos sensibles y responsable**.

Comandos disponibles en la raíz, según `package.json`:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:server
npm.cmd run test:e2e
```

Las suites existentes pueden no cubrir todos los escenarios; deben añadirse pruebas específicas conforme se implemente cada hito. No marcar un criterio como aprobado por tener únicamente una pantalla, un diseño de Figma o una especificación.
