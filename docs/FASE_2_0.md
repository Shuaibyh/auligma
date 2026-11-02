# AULIGMA — Propuesta de arquitectura para la Fase 2.0

> Documento de diseño. No existe backend, autenticación real, PostgreSQL, servicio de correo ni despliegue implementado. El inicio de este hito requiere aprobación explícita.

## 1. Decisiones y límites

- Frontend existente: React, TypeScript y Vite.
- Backend propuesto: Node.js LTS con Fastify y TypeScript, organizado por dominios. Fastify aporta validación por esquema, encapsulación de plugins y un núcleo pequeño; la decisión debe confirmarse antes de instalarlo.
- Persistencia propuesta: PostgreSQL con migraciones versionadas y transacciones.
- Dos roles visibles: `DOCENTE` y `ESTUDIANTE`. No se crea un rol visible de administrador.
- La autorización docente se representa mediante una aprobación institucional separada del rol visible.
- No existe tabla ni concepto de grupos.
- El servidor es la autoridad para sesiones, permisos, matrículas, publicación, intentos y acciones destructivas.
- Los archivos importados se procesarán con minimización de datos; no se conservará el archivo original salvo una política institucional expresa.

## 2. Arquitectura propuesta

```text
Navegador React
  │ HTTPS + cookie de sesión HttpOnly/Secure/SameSite
  ▼
API Fastify
  ├─ Identidad y sesiones
  ├─ Perfiles y autorización docente
  ├─ Aulas y matrículas
  ├─ Banco de preguntas
  ├─ Evaluaciones, intentos y resultados
  ├─ Importación y conciliación
  └─ Auditoría
  │
  ├─ PostgreSQL
  └─ Proveedor de correo transaccional aprobado
```

El frontend y la API pueden desplegarse por separado, siempre bajo HTTPS y con una política CORS limitada al origen oficial. No se asume infraestructura, dominio ni proveedor institucional disponible.

## 3. Modelo de datos mínimo

Todas las claves principales serían UUID. Las fechas se guardarían como `timestamptz`. Las tablas académicas usarían borrado lógico o estados cuando exista historial que conservar.

| Entidad | Campos y restricciones principales |
|---|---|
| `users` | correo normalizado `UNIQUE`, correo verificado, rol visible, estado, versión de sesión, fechas |
| `student_profiles` | `user_id UNIQUE FK`, nombres, apellidos, teléfono, código universitario opcional `UNIQUE`, `school_id FK` |
| `teacher_profiles` | `user_id UNIQUE FK`, nombres, apellidos, teléfono, información profesional |
| `teacher_authorizations` | correo o `user_id`, estado pendiente/aprobado/revocado, evidencia institucional, aprobador interno y fechas; no crea un rol visible |
| `professional_schools` | las 6 escuelas oficiales, código estable y nombre `UNIQUE` |
| `subjects` | nombre, código opcional y propietario/institución |
| `academic_periods` | código `UNIQUE`, inicio, cierre y estado |
| `classrooms` | `teacher_id FK`, `subject_id FK`, `period_id FK`, sección, turno, estado activa/archivada, `archived_at`; unicidad contextual |
| `enrollments` | `classroom_id FK`, `student_user_id FK` nullable durante conciliación, correo/código normalizados, estado y procedencia; `UNIQUE(classroom_id, student_user_id)` cuando exista identidad |
| `email_verifications` | usuario/correo, hash del código, propósito, expiración, usos, intentos y consumo |
| `topics` | `classroom_id FK`, nombre y `UNIQUE(classroom_id, nombre_normalizado)` |
| `questions` | `classroom_id FK`, `topic_id FK`, autor, enunciado, fórmula, procedimiento, explicación, estado, versión y fechas |
| `question_options` | `question_id FK`, posición, contenido, es_correcta; entre 2 y 6 por pregunta y exactamente una correcta mediante transacción/trigger diferible |
| `assessments` | aula, autor, modalidad, fechas, instrucciones, estado, política de intentos y `max_attempts` nullable con `CHECK` coherente |
| `assessment_questions` | evaluación, pregunta, posición y copia versionada del contenido publicado |
| `attempts` | evaluación, estudiante, número, inicio, entrega, estado; índice por evaluación/estudiante |
| `answers` | intento, pregunta publicada, alternativa o respuesta, fechas; `UNIQUE(attempt_id, assessment_question_id)` |
| `results` | intento `UNIQUE FK`, puntuación, máximo, estado y fecha; no sustituye el detalle de respuestas |
| `audit_logs` | actor, acción, entidad, identificador, metadatos minimizados, IP resumida/según política y fecha; solo anexado |

Índices adicionales: correo y código normalizados; aulas por docente/estado/periodo; matrículas por estudiante/estado; preguntas por aula/tema/estado; evaluaciones por aula/estado/fechas; intentos por estudiante/evaluación. Las claves foráneas académicas no usarán borrado en cascada indiscriminado.

## 4. Identidad, verificación y sesiones

1. El usuario introduce su correo institucional.
2. El servidor valida dominio permitido y limitación de frecuencia, sin inferir permisos por el formato.
3. Genera un OTP criptográficamente aleatorio, almacena solo su hash con expiración corta y lo envía mediante un proveedor aprobado.
4. Verificar consume el OTP una sola vez. Los intentos fallidos y reenvíos tienen límites por cuenta, IP y ventana temporal.
5. Se crea una sesión rotatoria almacenada en servidor; el navegador recibe una cookie `HttpOnly`, `Secure` y `SameSite`.
6. Cambiar correo, permisos o acciones de alto riesgo exige autenticación reciente.

OAuth/OIDC institucional solo se integrará si la UNDC entrega metadatos, cliente, redirect URIs y atributos confiables. No se almacenará la contraseña del correo. Un correo verificado permite identificar la cuenta; la capacidad docente requiere además `teacher_authorizations.status = approved`.

## 5. Conciliación de matrículas

- Coincidencia fuerte: correo institucional verificado.
- Coincidencia secundaria: código universitario ya vinculado a la misma identidad.
- Nombres y apellidos: solo evidencia auxiliar.
- Conflictos o datos incompletos: estado `pending_review`; nunca vinculación automática por nombre parecido.
- Una cuenta activa sin matrícula muestra «Todavía no tienes aulas asignadas».
- Retirar una matrícula no elimina la cuenta ni resultados históricos.

## 6. Contratos API iniciales

Todos los cuerpos se validarán con esquemas, devolverán errores estructurados y aplicarán autorización en servidor.

| Método y ruta | Propósito | Autorización |
|---|---|---|
| `POST /v1/auth/otp/request` | solicitar código | pública con rate limit |
| `POST /v1/auth/otp/verify` | verificar y crear sesión | código válido |
| `POST /v1/auth/logout` | revocar sesión | sesión |
| `GET/PATCH /v1/me` | consultar/editar perfil permitido | propietario |
| `GET/POST /v1/classrooms` | listar/crear aulas | docente autorizado |
| `GET/PATCH /v1/classrooms/:id` | consultar/configurar aula | docente propietario o estudiante matriculado para lectura limitada |
| `POST /v1/classrooms/:id/archive` | archivar con reautenticación | docente propietario |
| `POST /v1/classrooms/:id/restore` | restaurar | docente propietario |
| `GET/POST /v1/classrooms/:id/enrollments` | matrícula | docente propietario |
| `PATCH/DELETE /v1/classrooms/:id/enrollments/:enrollmentId` | corregir/retirar matrícula | docente propietario |
| `GET/POST /v1/classrooms/:id/questions` | banco contextual | docente propietario |
| `PATCH/DELETE /v1/questions/:id` | editar/retirar pregunta | autor autorizado en su aula |
| `POST /v1/questions/:id/review` | confirmar revisión | docente autorizado |
| `GET/POST /v1/classrooms/:id/assessments` | evaluaciones | docente propietario |
| `POST /v1/assessments/:id/publish` | publicar copia validada | docente propietario |
| `POST /v1/assessments/:id/attempts` | iniciar intento atómico | estudiante matriculado y elegible |
| `PUT /v1/attempts/:id/answers/:questionId` | guardar respuesta | propietario del intento activo |
| `POST /v1/attempts/:id/submit` | entregar y cerrar intento | propietario |

Las respuestas nunca confiarán en `teacherId`, `studentId`, puntuaciones o pertenencia enviados por el navegador. La identidad se obtiene de la sesión y las relaciones se consultan en PostgreSQL.

## 7. Archivado, eliminación y retención

Archivar cambia el estado del aula y registra actor/fecha, pero conserva matrículas, preguntas, publicaciones, intentos y resultados. Restaurar revierte el estado sin recrear relaciones. La eliminación definitiva sería un proceso separado, restringido, sujeto a reautenticación, periodo de espera y política institucional de retención. Antes de implementarla deben definirse plazos para resultados, auditoría y solicitudes de privacidad.

## 8. Migraciones e implementación propuesta

1. Estructura de API, observabilidad, manejo de errores y migración inicial.
2. Catálogos, usuarios, perfiles y autorización docente.
3. OTP, sesiones, rotación, revocación y pruebas de abuso.
4. Aulas, matrículas y conciliación.
5. Preguntas y alternativas versionadas.
6. Evaluaciones, publicación, intentos y respuestas transaccionales.
7. Archivado, auditoría, retención y exportaciones autorizadas.

Cada migración debe tener avance y reversión segura cuando sea viable, ejecutarse primero en un entorno no productivo y respaldarse antes de cambios destructivos.

## 9. Seguridad y privacidad pendientes de aprobación

- Modelo de amenazas, CSRF, CORS, CSP, cabeceras, validación y límites de carga.
- Gestión de secretos fuera del repositorio y rotación.
- Cifrado en tránsito y en reposo ofrecido por la infraestructura.
- Logs sin OTP, cookies, contenido sensible ni nóminas completas.
- Backups cifrados, restauración probada y objetivos RPO/RTO.
- Pruebas de acceso entre cuentas, aulas y roles.
- Aviso de privacidad, base legal, plazos de retención y canal de derechos del titular.

## 10. Criterio para iniciar backend

Antes de escribir código deben aprobarse: proveedor de hosting, dominio y HTTPS; dominios institucionales válidos; mecanismo OTP u OIDC; proveedor de correo; procedimiento de autorización docente; retención de historial; diagrama/modelo final y contratos API. Hasta entonces el frontend seguirá indicando con claridad que opera con datos sintéticos y memoria local.
