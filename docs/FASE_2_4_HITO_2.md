# Fase 2.4 — Hito 2: constructor docente

## Alcance implementado

El constructor trabaja únicamente con prácticas privadas en estado `draft`. No publica evaluaciones, no crea intentos estudiantiles y no calcula calificaciones.

## Correspondencia entre interfaz y API

| Pantalla o acción | Contrato real |
| --- | --- |
| Listado de borradores del aula | `GET /api/v1/classrooms/:id/assessments` |
| Crear borrador | `POST /api/v1/classrooms/:id/assessments` |
| Recuperar y editar datos generales | `GET` y `PATCH /api/v1/classrooms/:id/assessments/:assessmentId` |
| Consultar revisiones del banco | `GET /api/v1/classrooms/:id/question-revisions` |
| Incorporar una revisión aprobada | `POST /api/v1/classrooms/:id/assessments/:assessmentId/items` |
| Cambiar puntaje u orden | `PATCH /api/v1/classrooms/:id/assessments/:assessmentId/items/:itemId` |
| Retirar una pregunta con confirmación | `POST /api/v1/classrooms/:id/assessments/:assessmentId/items/:itemId/remove` |
| Vista previa docente | `GET /api/v1/classrooms/:id/assessments/:assessmentId/preview` |

Todas las mutaciones usan la versión vigente del borrador. Un conflicto `409` obliga a recargar antes de continuar. El servidor conserva la restricción por docente, aula y revisión aprobada.

## Referencias de diseño verificadas

- `18:632`, `18:698`: listado de evaluaciones.
- `18:712`, `18:782`: constructor de contenido.
- `18:888`, `18:954`: vista previa docente.
- `34:4683`, `34:4876`, `34:5069`, `34:5269`, `34:5469`: temas y adaptación entre 1440 y 390 px.
- `74:6125`, `74:6240`: recorrido docente en escritorio y móvil.

La configuración de disponibilidad, la publicación, los intentos y los resultados se muestran como funciones futuras y permanecen deshabilitados hasta contar con contratos de servidor.

## Cierre de calidad

- El acceso estudiantil redirige antes de solicitar APIs docentes; el servidor mantiene su control de rol e IDOR como defensa principal.
- Los servidores auxiliares de Playwright se administran como procesos Node identificados y se cierran desde el teardown global. Las suites devuelven su código de salida real sin terminar procesos ajenos.
- La aplicación demo y la aplicación real se cargan en chunks separados. El build de producción conserva el chunk inicial por debajo del umbral de 500 kB.
- TypeScript, ESLint, build, 42 pruebas backend, 24 pruebas E2E demo y 38 pruebas E2E reales quedan aprobadas al cierre.
- Los artefactos de prueba y compilación permanecen ignorados por Git. No se incorporan `.env`, almacenamiento privado, entornos Python ni dependencias instaladas.
