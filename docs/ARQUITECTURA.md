# AULIGMA — Arquitectura implementada hasta Fase 2.3

## Límites y decisiones

React/TypeScript/Vite permanecen en `src/`. Fastify/TypeScript vive en `server/`, dentro del mismo paquete npm para evitar complejidad innecesaria. Node 24 ejecuta TypeScript mediante `tsx`. Knex es el único query builder y gestor de migraciones; `pg` es su driver. Las consultas son parametrizadas y las escrituras relacionadas usan transacciones. `jose` valida JWT con claves públicas Google; no se implementa criptografía propia.

`npm.cmd run build:server` compila JavaScript a `build/server/` (excluido de Git); `npm.cmd start` ejecuta ese resultado sin necesitar `tsx` en runtime. `start:server` y `dev:server` son accesos de desarrollo. Las migraciones se aplican desde la raíz y requieren conservar `server/migrations/` en el entorno de operación.

Fastify valida cuerpos con JSON Schema y rechaza propiedades adicionales, incluidos correo, rol, IDs y permisos en la edición del perfil. Los errores no devuelven SQL, tokens ni trazas. `helmet`, CORS limitado, rate limiting y las verificaciones centralizadas de sesión/CSRF complementan la autorización. El logger automático de solicitudes está desactivado para evitar códigos OAuth en URLs; OAuth registra solo referencia, etapa, código diagnóstico seguro y banderas de progreso, nunca códigos de autorización, tokens, cookies, secretos o claims personales.

La SPA usa `/api/v1` relativo y Vite lo reenvía al backend. Producción requiere un proxy HTTPS bajo el mismo origen; el backend escucha solo en loopback. No se ha seleccionado ni desplegado infraestructura pública.

## Recorridos

1. La UI consulta `/me` y `/auth/config`; no recupera identidad de localStorage.
2. Google devuelve un código al servidor; el servidor valida token y política institucional/docente.
3. Se emite cookie opaca y se vuelve a la SPA. `/me` devuelve identidad y CSRF, mantenidos en memoria.
4. Un perfil incompleto dirige a completar nombres, apellidos y escuela cuando corresponda. La API protege los datos inmutables.
5. Mis cursos consulta aulas propias o matrículas activas; un UUID conocido no concede acceso.

`src/RealApp.tsx` implementa inicio, cursos, detalle, perfil y ajustes reales. No expone evaluaciones, estadísticas o progreso ficticios. `src/App.tsx` y los módulos anteriores se conservan para desarrollo sintético, disponibles únicamente con `import.meta.env.DEV && VITE_DEMO_MODE=true`. Las credenciales demo no crean cookies de la API. El build productivo no habilita ese modo aunque se establezca la variable.

## Contrato implementado

| Método | Ruta | Política |
|---|---|---|
| GET | `/api/v1/health` | liveness, no acredita conexión a PostgreSQL |
| GET | `/api/v1/auth/config` | disponibilidad de configuración, sin secretos |
| GET | `/api/v1/auth/google/start` | público limitado; genera transacción OAuth |
| GET | `/api/v1/auth/google/callback` | state/browser, expiración, consumo único, PKCE, token válido |
| GET | `/api/v1/me` | sesión activa y autorización vigente |
| PATCH | `/api/v1/me` | solo perfil propio, campos permitidos, Origin + CSRF |
| POST | `/api/v1/auth/logout` | revoca sesión actual; Origin + CSRF |
| GET | `/api/v1/professional-schools` | sesión |
| GET/POST | `/api/v1/subjects` | docente autorizado; propietario derivado de sesión |
| GET | `/api/v1/classrooms` | propias para docente; matrícula activa para estudiante |
| POST | `/api/v1/classrooms` | docente autorizado, asignatura propia, CSRF |
| GET | `/api/v1/classrooms/:id` | propiedad o matrícula activa; resto 404 |
| GET | `/api/v1/classrooms/:id/lifecycle-impact` | docente propietario; impacto real sin modificar datos |
| PATCH | `/api/v1/classrooms/:id` | docente propietario; edición, archivado, restauración o eliminación lógica confirmada |
| POST | `/api/v1/classrooms/:id/enrollments/preview` | docente propietario; validación sin escritura |
| GET/POST | `/api/v1/classrooms/:id/enrollments` | nómina privada o confirmación transaccional |
| PATCH | `/api/v1/classrooms/:id/enrollments/:enrollmentId` | revocar o reautorizar; docente propietario |
| GET | `/api/v1/classrooms/:id/enrollment-requests` | solicitudes visibles solo al docente propietario |
| POST | `/api/v1/classrooms/:id/enrollment-requests` | estudiante autenticado; no concede acceso |
| PATCH | `/api/v1/classrooms/:id/enrollment-requests/:requestId` | resolución expresa del docente propietario |
| GET/PUT | `/api/v1/classrooms/:id/planning` | lectura autorizada o creación/edición docente del plan |
| POST/PATCH | `/api/v1/classrooms/:id/planning/nodes` | estructura jerárquica, orden, publicación y retiro lógico |
| POST | `/api/v1/classrooms/:id/planning/duplicate` | copia independiente en otra aula propia; no copia matrículas |
| GET/POST | `/api/v1/classrooms/:id/planning/destinations`, `duplicate-preview` | destinos propios e impacto previo sin escritura |
| POST | `/api/v1/classrooms/:id/planning/nodes/:nodeId/materials` | enlace o apunte privado asociado al contenido |
| POST | `/api/v1/classrooms/:id/planning/nodes/:nodeId/materials/file` | PDF/DOCX privado con validación binaria y límite |
| GET/PATCH | `/api/v1/classrooms/:id/materials/:materialId` | descarga autorizada o cambio de estado docente |
| POST | `/api/v1/classrooms/:id/syllabus` | almacenamiento privado y extracción local de PDF |
| POST | `/api/v1/classrooms/:id/syllabus/:sourceId/propose` | indisponible hasta configurar un proveedor de IA real |
| GET/POST | `/api/v1/classrooms/:id/syllabus-sources`, `syllabus/:sourceId/proposals/manual` | fuente extraída y revisión manual persistente |
| GET/PATCH | `/api/v1/classrooms/:id/planning-proposals/:proposalId` | consulta y edición docente de propuesta privada |
| GET/POST | `/api/v1/classrooms/:id/planning-proposals/:proposalId/impact`, `apply`, `discard` | impacto, importación transaccional o descarte |

No hay endpoints reales de resultados, evaluaciones o aprovisionamiento público. El sílabo sí tiene carga y extracción local real; la generación con IA permanece explícitamente indisponible. Un identificador de aula nunca concede acceso: todas las consultas vuelven a comprobar propiedad docente o matrícula activa.

## Persistencia y privacidad

Una identidad estable usa `sub`, nunca solo el correo. No se vinculan cuentas diferentes por coincidencia de correo. Autorizaciones docentes se vinculan al primer sub validado y son revocables. Una identidad institucional sin autorización docente se reconoce como estudiante; el catálogo de matrículas es independiente.

Fotografías opcionales se guardan como imágenes raster en el perfil: PNG/JPG/WebP, hasta 128 KB, validación de cabecera y formato, sin SVG ni URLs externas. No se implementa subida documental ni almacenamiento de archivos general. Para una escala mayor, migrar imágenes a almacenamiento privado con procesamiento raster y política de retención.

Los datos académicos tienen FKs restrictivas y no usan borrados en cascada. El archivado es recuperable. La eliminación de un aula es lógica y solo se permite después de archivar: `deleted_at` y `deleted_by` la excluyen de todas las consultas ordinarias mientras conservan matrículas e historial para auditoría. Aulas y matrículas permanecen independientes por sección/periodo. Asignaturas podrán alojar planificación/unidades/semanas sin mezclar matrículas ni resultados entre aulas.

Las matrículas conservan el correo institucional autorizado, el estudiante vinculado cuando existe, responsable y fechas de autorización, vinculación, actualización y revocación. `preauthorized` representa “Pendiente de primer acceso”; `active`, “Activa”; `revoked`, “Revocada”. Las solicitudes usan una tabla separada con `pending`, `approved` y `rejected`. La conciliación se ejecuta en la transacción de identidad Google bajo bloqueo asesor y es idempotente.

## Límites operativos

Rate limiting usa memoria del proceso; despliegues con varias instancias necesitarán un almacén compartido. Sesiones y transacciones OAuth sí residen en PostgreSQL. No hay renovación silenciosa: el vencimiento solicita nueva autenticación. Las pruebas PostgreSQL y los recorridos OAuth reales de ambos roles se completaron en desarrollo local. Antes de producción aún se requieren limpieza periódica, backups/restauración, retención, HTTPS/proxy y rate limiting compartido.

Fuentes: [validación Fastify](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/), [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [jose](https://github.com/panva/jose), [Knex](https://knexjs.org/guide/migrations.html).
