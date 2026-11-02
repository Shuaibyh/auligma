# AULIGMA — Fase 2.2: matrículas institucionales

Fecha: 1 de noviembre de 2026. Estado: **implementada para validación real**. La aceptación con cuentas personales aún requiere interacción humana y no se presenta como completada.

## Alcance entregado

El modo real incorpora matrículas privadas por correo institucional. El docente propietario administra únicamente sus asignaturas, aulas y nóminas. El estudiante consulta únicamente aulas activas vinculadas con su usuario institucional.

Recorrido principal:

1. El docente crea o selecciona un aula.
2. Pega uno o varios correos `@undc.edu.pe`.
3. AULIGMA analiza formato, dominio, vacíos, duplicados, matrículas existentes y revocaciones.
4. La interfaz muestra una vista previa seleccionable y no guarda automáticamente.
5. La confirmación crea matrículas activas para usuarios institucionales existentes o preautorizaciones para quienes todavía no ingresaron.
6. Durante un login Google posterior, el servidor concilia el correo verificado con las preautorizaciones y activa el acceso.
7. Cada consulta protegida vuelve a comprobar la matrícula. Revocar bloquea el aula inmediatamente.

## Respaldo y preservación

Antes de cambios estructurales se creó un respaldo local verificable en el directorio temporal de Windows, con manifiesto SHA-256. Contiene 76 archivos y excluye `.env`, `.git`, `node_modules`, datos, artefactos, claves y credenciales. No se cambió de rama, no se recreó PostgreSQL y no se eliminaron perfiles ni trabajo anterior.

## Modelo PostgreSQL

La migración incremental `202611010002_institutional_enrollments.mjs` amplía `enrollments` con responsable y fechas de autorización, vinculación y actualización; añade restricciones de coherencia e índice por aula y estado.

También crea `enrollment_requests`, separada de las matrículas autorizadas, con estudiante, aula, correo, estado, fechas y responsable de resolución. La base de desarrollo quedó verificada con 13 tablas, 14 claves foráneas, 14 restricciones únicas, 17 checks y 35 índices. La escritura sintética de persistencia se eliminó después de reconectar.

| Estado de datos | Etiqueta de producto | Acceso |
|---|---|---|
| `preauthorized` | Pendiente de primer acceso | No |
| `active` | Activa | Sí, mientras el aula esté disponible |
| `revoked` | Revocada | No |
| solicitud `pending` | Solicitud pendiente | No |
| solicitud `approved` | Aprobada por docente | Genera o reactiva matrícula |
| solicitud `rejected` | Rechazada | No |

## Normalización

Se eliminan espacios exteriores y se convierte el correo a minúsculas. No se eliminan puntos, signos `+` ni otros caracteres de la parte local. El dominio debe ser exactamente `undc.edu.pe`. El backend vuelve a validar todos los correos al confirmar; no confía en la vista previa del navegador.

## API

- `GET /api/v1/classrooms?includeArchived=true`: aulas docentes, incluido archivo recuperable.
- `POST /api/v1/classrooms` y `PATCH /api/v1/classrooms/:id`: creación, edición, archivado y restauración.
- `POST /api/v1/classrooms/:id/enrollments/preview`: análisis sin escritura, hasta 500 direcciones.
- `GET/POST /api/v1/classrooms/:id/enrollments`: nómina o confirmación masiva.
- `PATCH /api/v1/classrooms/:id/enrollments/:enrollmentId`: revocación o reautorización.
- `POST /api/v1/classrooms/:id/enrollment-requests`: solicitud estudiantil sin acceso automático.
- `GET/PATCH /api/v1/classrooms/:id/enrollment-requests[...]`: revisión del docente propietario.

## Integridad y seguridad

- Sesión, rol, CSRF y Origin se verifican antes de escrituras.
- La propiedad del aula se obtiene desde la sesión; un ID del cliente no acredita autorización.
- Las operaciones masivas y la conciliación usan transacciones y bloqueos asesores.
- Las restricciones únicas evitan matrículas y solicitudes duplicadas.
- La identidad Google estable sigue siendo `sub`; el correo verificado solo localiza una preautorización institucional.
- No se crean usuarios artificiales para correos preautorizados.
- La nómina nunca se devuelve al estudiante.
- Las respuestas no incluyen SQL, secretos, tokens ni trazas.

## UI/UX

La pantalla docente incorpora resumen de estados, búsqueda, filtros, tabla responsiva, acciones confirmadas, vista previa editable, selección masiva y estados de carga, error, vacío y éxito. A 390 px la nómina se transforma en tarjetas legibles sin scroll horizontal de página.

El estudiante obtiene tarjetas reales con asignatura, sección, periodo, turno y docente. El detalle muestra solo datos existentes. Cuando no hay planificación publicada se informa sin inventar contenido. El importador Excel anterior permanece aislado en el modo demostrativo y no aparece como flujo abandonado en el modo real.

## Pruebas

- TypeScript, ESLint y builds de frontend/backend.
- 18 pruebas de backend aprobadas.
- PostgreSQL real de pruebas: lista de 45 direcciones sintéticas, usuario existente, usuario futuro, conciliación idempotente, duplicados, dominio incorrecto, solicitudes, rechazo, aprobación, IDOR, URL manipulada, sesión caducada, revocación, reautorización, archivado y perfil persistente.
- 16 casos Playwright del modo real aprobados en 390, 768, 1024 y 1440 px, con axe, claro/oscuro, teclado y movimiento reducido donde corresponde.
- El supervisor de Playwright en Windows permanece abierto tras imprimir el último caso; los procesos se detienen de forma acotada. Es una incidencia del runner, no un resultado funcional omitido.

## Validación real pendiente

No se insertó ningún correo personal mediante SQL ni se incluyó en pruebas o documentación. Falta ejecutar desde la interfaz, con intervención del usuario:

1. crear o seleccionar el aula de aceptación;
2. autorizar el correo institucional real;
3. cambiar a la cuenta estudiantil en Google y comprobar aula, recarga y persistencia;
4. volver como docente y probar la revocación;
5. decidir expresamente si la matrícula final debe permanecer activa o revocada.

No se considera completada esta prueba hasta realizar esos pasos con Google real.

## Pendientes para Fase 2.3

La planificación por semanas, unidades, temas, subtemas, contenidos y evaluaciones continúa fuera de este alcance. Antes de producción también siguen pendientes HTTPS/proxy, backups y restauración operativa, retención, observabilidad y rate limiting compartido.

El pulido posterior del modal y el ciclo de vida seguro de aulas se documenta en `docs/FASE_2_2_1.md`.
