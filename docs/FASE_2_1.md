# AULIGMA — Fase 2.1: entrega para revisión

Fecha: 1 de noviembre de 2026. Identidad: **Geometría razonada**.

## Workspace, preservación y alcance

Se trabajó en `C:\Users\USUARIO\Documents\PROYECTOS RANDOM\AULIGMA`, rama `fase-1.2`. Se inspeccionó el estado Git antes de editar. Los cambios y archivos sin seguimiento de Fase 1.2 se conservaron, sin cambiar de rama, resetear, limpiar ni reinicializar. No se hicieron commits, pushes, merges o despliegues ni instalaciones de software del sistema.

Las skills `auligma-ui-ux`, `frontend-design` y `web-design-guidelines` guiaron la composición editorial, estados de acceso y revisión de formularios, teclado, contraste y movimiento. Sus archivos no fueron modificados por esta fase, ni tampoco `skills-lock.json`. La skill propia ya tenía cambios locales al comenzar; permanecen intactos.

## Arquitectura entregada

Backend Fastify/TypeScript en `server/`; frontend React/Vite conservado. PostgreSQL con Knex para consultas y migraciones transaccionales. Google Authorization Code Flow con PKCE y verificación JWT mediante `jose`. Sesiones opacas persistidas en servidor, cookies HttpOnly/SameSite/Secure, CSRF, CORS, rate limiting, autorización centralizada y errores sin detalles sensibles.

La persistencia quedó acreditada contra PostgreSQL 18 local y el login se validó con Google real para un docente piloto y un estudiante institucional. Las pruebas sintéticas se documentan por separado y no se presentan como accesos institucionales.

Detalle del diseño y contrato: `docs/ARQUITECTURA.md`.

## Archivos creados en esta fase

- `.env.example`.
- `server/config.ts`, `server/db.ts`, `server/google.ts`, `server/identity.ts`, `server/app.ts`, `server/index.ts`, `server/manage.ts`.
- `server/tsconfig.json`, `server/tsconfig.build.json`.
- `server/migrations/202611010001_initial.mjs`.
- `server/tests/security.test.ts`, `server/tests/oauth-flow.test.ts`, `server/tests/postgres.test.ts`.
- `src/auth/api.ts`, `src/auth/RealAuth.tsx`.
- `src/RealApp.tsx`, `src/pages/GoogleLogin.tsx`, `src/pages/PersistentProfile.tsx`, `src/real.css`.
- `playwright.real.config.ts`, `tests-real/auth.spec.ts`.
- `docs/ARQUITECTURA.md`, `docs/GOOGLE_OIDC.md`, `docs/POSTGRESQL.md`, `docs/FASE_2_1.md`.

## Archivos existentes modificados en esta fase

- `README.md`: estado vigente, arranque, separación demo/real y guías, conservando documentación anterior.
- `package.json`, `package-lock.json`: dependencias locales y scripts.
- `src/main.tsx`: selección explícita de modo de desarrollo frente a aplicación real.
- `src/pages/Profile.tsx`: exportación del hook existente de protección de cambios sin guardar, reutilizado por el perfil persistente. El archivo ya existía sin seguimiento.
- `vite.config.ts`: puerto estricto, origen configurable y proxy API.
- `playwright.config.ts`: modo demo explícito, servidor independiente y artefactos separados.
- `tsconfig.json`: comprobación de nuevas pruebas y configuración.
- `eslint.config.js`: exclusión de JavaScript generado en `build/`; se sigue revisando todo el código fuente.

Los demás archivos que aparecen modificados/sin seguimiento en Git ya formaban parte del trabajo previo; no atribuir todo el diff contra HEAD a esta entrega.

## Dependencias locales añadidas

| Responsabilidad | Versiones instaladas |
|---|---|
| Servidor | `fastify` 5.12.7 |
| Cookies/CORS/cabeceras/límites | `@fastify/cookie` 11.1.5, `@fastify/cors` 11.3.1, `@fastify/helmet` 13.2.0, `@fastify/rate-limit` 11.2.1 |
| PostgreSQL/migraciones | `pg` 8.23.1, `knex` 3.3.0 |
| Verificación criptográfica | `jose` 6.2.14 |
| Desarrollo | `tsx` 4.23.15, `@types/pg` 8.23.1 |

El lockfile fija las versiones resueltas. No se añadieron bibliotecas para animaciones ni se modificaron las dependencias anteriores por una actualización mayor automática.

## Tablas, migraciones y endpoints

Una migración inicial crea 12 tablas: `users`, `external_identities`, `student_profiles`, `teacher_profiles`, `teacher_authorizations`, `professional_schools`, `subjects`, `classrooms`, `enrollments`, `sessions`, `oauth_attempts`, `audit_events`. Knex añade sus tablas de control al migrar. Incluye claves foráneas restrictivas, unicidad, checks de rol/privacidad/estado e índices. No hay grupos académicos ni cascadas destructivas.

Se implementaron `GET health`, `GET auth/config`, `GET auth/google/start`, `GET auth/google/callback`, `POST auth/logout`, `GET/PATCH me`, `GET professional-schools`, `GET/POST subjects`, `GET/POST classrooms` y `GET classrooms/:id`, todos bajo `/api/v1`. Consultar las políticas por ruta en `docs/ARQUITECTURA.md`.

## Identidad, autorización y perfiles

- Google: scopes mínimos, state y cookie de correlación, PKCE S256, nonce, firma RS256, emisor, audiencia, vencimiento, email verificado y sub; `azp` comprobado cuando aparece. Transacción OAuth de un solo uso y 10 minutos.
- Estudiante: `hd=undc.edu.pe`, identidad verificada y política estudiantil; sin matrícula no se devuelven aulas. No se infiere acceso por conocer un enlace ni por coincidir nombres.
- Docente: autorización previa, vinculación a sub y comprobación en cada petición. Piloto por allowlist privada habilitada expresamente; prohibida en producción. Revocación por script y sesiones invalidadas.
- Perfil: nombres, apellidos, teléfono opcional, escuela del estudiante, información profesional docente y fotografía raster opcional hasta 128 KB. Google sub, correo, código y rol no son editables. Código universitario pendiente de una regla institucional fiable.
- Sesión: token aleatorio de 256 bits, solo hash en PostgreSQL; expiración absoluta configurable de 1–24 horas (8 por defecto). Sin tokens Google en localStorage ni permisos decididos por el cliente.

## UI/UX y revisión visual

Login exclusivamente Google en modo real; bienvenida editorial, cuenta no autorizada, cancelación, configuración pendiente, inicio en progreso, backend no disponible y sesión caducada. Perfil incompleto guía a completar los datos y el guardado confirma respuesta del servidor. Navegación real: Inicio, Mis cursos, Mi perfil y Ajustes, sin rellenar actividad/progreso con cifras ficticias.

Se mantienen Manrope, Source Serif 4, KaTeX, paleta, claro/oscuro y movimiento reducido. Se corrigieron etiquetas móviles de Ajustes/Cerrar sesión, visibilidad de la geometría, espaciados, contención de textos y composición del formulario. Se reutilizaron componentes de diálogo y diseño existentes.

Se generaron 22 capturas sintéticas en `test-results/fase-2-1/` (excluido de Git): login y perfil a 390/768/1024/1440 en claro/oscuro; cursos a 390/1440 en claro/oscuro; creación de aula a 390/1440. Se inspeccionaron visualmente capturas representativas de escritorio/móvil de login, perfil, cursos y formulario de aula. Las pruebas anteriores regeneraron además sus capturas de Fase 1.2.

Axe comprobó WCAG A/AA hasta 2.2 en los estados cubiertos. La medición espera que terminen las animaciones: la primera ejecución detectó contrastes transitorios durante la entrada, no el estado estable. Sin desbordamientos horizontales en los anchos comprobados. Se probó enlace de salto con teclado y preferencia de movimiento reducido. La comprobación a 720×450 representa el reflow de un escritorio de 1440×900 al 200 %, pero **no sustituye una prueba manual del zoom real del navegador**. Pendientes lector de pantalla, dispositivos físicos y otros motores; no se afirma certificación WCAG.

## Resultados reales de verificación

| Comprobación | Resultado |
|---|---|
| `npm.cmd run typecheck` | Aprobado, frontend y backend |
| `npm.cmd run lint` | Aprobado |
| `npm.cmd run build` | Aprobado |
| `npm.cmd run build:server` | Aprobado |
| `npm.cmd start` / `npm.cmd run dev:server` | Ambos arrancan; servidor compilado responde `health: ok` |
| `npm.cmd run test:server` | 17 aprobadas, incluida integración PostgreSQL real; 0 omitidas |
| `npm.cmd run test:e2e` | 24 casos aprobados; el supervisor no cerró tras imprimir el último caso en Windows |
| `npm.cmd run test:e2e:real` | 11 casos aprobados; el supervisor no cerró tras imprimir el último caso en Windows |
| `npm.cmd run db:migrate` | Migración aplicada en desarrollo y pruebas |
| Google OAuth real | Docente piloto y estudiante institucional validados; perfiles, recarga, logout y cambio de cuenta comprobados |
| `npm.cmd audit --omit=dev --json` | 0 vulnerabilidades reportadas |
| `npm.cmd audit --json` | 11 avisos moderados en la cadena ESLint/minimatch de desarrollo |
| `git diff --check` | Sin errores de espacios; Git advierte normalización LF/CRLF |

Clasificación: las pruebas JWT usan claves sintéticas; la prueba de protocolo OAuth usa almacén/proveedor simulados; las pruebas Fastify y PostgreSQL usan una base exclusiva con fixtures sintéticos; las pruebas navegador usan API simulada para estados de identidad/perfil/aulas. Separadamente, los dos recorridos manuales Google reales acreditaron identidades, perfiles y sesiones en PostgreSQL local sin exponer tokens ni cookies.

La prueba PostgreSQL valida migración, identidades separadas, perfiles, relaciones, matrícula, propiedad, CSRF, sesión caducada, logout, auditoría y revocación. Requiere `DATABASE_TEST_URL`; con la configuración privada vigente se ejecutó sin omisiones. En esta validación final, ambos runners de Playwright imprimieron todos sus casos aprobados pero quedaron detenidos durante el cierre del supervisor en Windows; se interrumpió únicamente el supervisor después del último resultado. No se atribuye una salida limpia al proceso.

## Configuración externa pendiente y riesgos

1. Antes de producción: HTTPS/proxy del mismo origen, backups/restauración, retención, revisión de privilegios DB, limpieza programada de sesiones y rate limiting compartido si hay múltiples procesos.
2. Mantener revocado el secreto OAuth expuesto anteriormente y rotar credenciales mediante el procedimiento privado; el repositorio no contiene credenciales.
3. Completar pruebas manuales negativas autorizadas: cuenta Google no permitida, cancelación de consentimiento y revocación docente. No reutilizar cuentas reales para QA automatizado.
4. Revisar el aviso de desarrollo minimatch sin degradar automáticamente ESLint a versiones antiguas.

No se implementó Fase 2.2: matrícula masiva/conciliación/invitaciones siguen pendientes. Tampoco IA, sílabos o resultados productivos. Los flujos académicos previos siguen siendo demostrativos y solo se habilitan expresamente en desarrollo; nunca acceden a datos reales protegidos.

## Próximo paso

La validación técnica local de Fase 2.1 está cerrada para ambos roles. No avanzar a Fase 2.2 ni desplegar hasta que el responsable autorice expresamente el siguiente alcance y se resuelvan los controles productivos pendientes.
