# AULIGMA — Fase 2.2.1: pulido UX y ciclo de vida seguro de aulas

Fecha: 1 de noviembre de 2026. Estado: **implementada y verificada en desarrollo local**.

## Resultado

El flujo «Agregar estudiantes» deja de usar una tabla rígida. La revisión ahora presenta una lista fluida con edición por dirección, estado y mensaje propios, selección individual, selección de todos los válidos, deselección completa y un resumen de válidos, inválidos, duplicados, matrículas existentes y seleccionados. El pie de confirmación permanece visible dentro del diálogo y el contenido se desplaza solo en vertical.

La comprobación visual cubre 390, 768, 1024 y 1440 px en temas claro y oscuro. No se detectó desplazamiento horizontal del diálogo ni de la página. El fondo queda inerte mientras el diálogo Radix está abierto, el foco permanece contenido y todos los controles tienen nombre accesible.

## Ciclo de vida del aula

- **Archivar:** exige revisar el nombre, impacto real en matrículas y una casilla de comprensión. Suspende acceso estudiantil y modificaciones; conserva nómina e historial.
- **Restaurar:** solo está disponible para un aula archivada y devuelve el acceso según las matrículas vigentes.
- **Eliminar:** solo está disponible después de archivar. Exige el nombre exacto de la asignatura y una casilla adicional.

La eliminación implementada es **lógica**: establece `deleted_at` y `deleted_by`. El aula deja de aparecer en listados, detalle, solicitudes y operaciones de matrícula, pero sus relaciones no se borran físicamente. Esta decisión conserva integridad referencial y trazabilidad; no existe restauración desde la interfaz después de eliminar.

La vista «Mis cursos» separa aulas activas y archivadas. Una aula archivada puede consultarse, restaurarse o eliminarse mediante los diálogos reforzados.

## PostgreSQL y auditoría

La migración `202611010003_classroom_lifecycle.mjs` añade:

- `archived_by`, `deleted_at` y `deleted_by` en `classrooms`;
- checks que vinculan cada fecha con su actor y prohíben eliminar sin archivar;
- `resource_type` y `details` JSONB en `audit_events`;
- índices para consultas de ciclo de vida y auditoría.

Se registran creación/autorización de matrícula, archivado, restauración, eliminación lógica e intentos de ciclo de vida rechazados. Los detalles incluyen identificadores, conteos, estado o motivo técnico mínimo; no incluyen correos, credenciales, tokens ni secretos.

La base de desarrollo fue verificada después de migrar: 13 tablas de aplicación, 16 claves foráneas, 14 restricciones únicas, 20 checks y 37 índices. La conexión usa `auligma_app` sin privilegios de superusuario, creación de bases, roles o replicación. La prueba sintética de persistencia se eliminó después de reconectar.

## Seguridad

- Sesión, rol docente, Origin y CSRF continúan obligatorios.
- La propiedad se comprueba en PostgreSQL para cada consulta y mutación; conocer un UUID ajeno devuelve 404.
- Las aulas eliminadas se excluyen en el servidor, no solo en la interfaz.
- Los intentos no autorizados o con confirmación incorrecta quedan auditados sin exponer datos del aula ajena.
- No se modificaron secretos OAuth ni `.env`.

## Verificación ejecutada

- `npm.cmd run typecheck`: aprobado.
- `npm.cmd run lint`: aprobado.
- `npm.cmd run build`: aprobado.
- `npm.cmd run test:server`: 18/18 aprobadas con PostgreSQL real.
- Playwright del modo real: los 17 casos funcionales quedaron aprobados al ejecutar los grupos; incluye cuatro anchos, claro/oscuro, axe, selección masiva y ciclo archivar–restaurar–eliminar.
- `scripts/verify-postgres.mjs`: conexión, esquema, persistencia tras reconexión y limpieza sintética aprobadas.

En Windows, el supervisor de Playwright puede permanecer abierto después de imprimir el último caso; se detuvo de forma acotada. Los resultados funcionales anteriores corresponden a casos efectivamente impresos como aprobados, no a resultados asumidos.

## Inventario de esta iteración

- Backend: `server/app.ts`, `server/enrollments.ts`.
- Esquema: `server/migrations/202611010003_classroom_lifecycle.mjs`.
- UI real: `src/RealApp.tsx`, `src/pages/RealClassroom.tsx`, `src/components/ui.tsx`, `src/real.css`.
- Pruebas: `server/tests/postgres.test.ts`, `tests-real/enrollments.spec.ts`.
- Documentación: este archivo, `docs/FASE_2_2.md`, `docs/ARQUITECTURA.md` y `README.md`.

Se preservaron los cambios locales anteriores. No se cambió de rama y no se realizaron commits, pushes ni despliegues.
