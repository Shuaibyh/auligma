# AULIGMA — Plan de arquitectura de la Fase 2.4

## Objetivo y alcance

Construir el recorrido verificable:

`Docente crea práctica → selecciona preguntas → revisa y publica → estudiante matriculado responde → envía → servidor corrige → docente consulta resultados`.

Esta especificación no afirma funcionalidades implementadas. No incluye migraciones ni despliegue. Reutiliza Google OAuth/OIDC, sesiones y CSRF, aulas y matrículas, planificación académica, banco persistente, PostgreSQL, Ollama y SymPy.

## Principios de dominio

- Una pregunta generada por IA siempre comienza como borrador. Ollama nunca publica, califica ni aprueba.
- Una publicación referencia revisiones inmutables. Editar una pregunta o evaluación publicada crea otra revisión; no altera intentos anteriores.
- El cliente nunca decide la respuesta correcta, la nota, el tiempo restante ni la elegibilidad del estudiante.
- El resultado de SymPy verifica únicamente la expresión admitida. `INDETERMINADO` exige revisión docente y no se presenta como certeza automática.
- Cada consulta se limita por identidad, rol, aula y matrícula activa. Conocer un UUID no concede acceso.
- Las escrituras críticas usan transacciones, bloqueo de filas, control de versión e idempotencia.

## Modelo de datos propuesto

Las tablas siguientes son un diseño previo; deberán convertirse en una migración aditiva revisada y probada contra `auligma_test` antes de aplicarse.

### Preguntas versionadas

**`question_revisions`**

- `id`, `question_draft_id`, `revision`, `content`, `verification`, `content_hash`.
- `review_status`: `draft | approved | invalid | indeterminate | retired`.
- `created_by`, `approved_by`, `created_at`, `approved_at`.
- Únicos: `(question_draft_id, revision)` y `(question_draft_id, content_hash)`.
- `content` debe asignar un identificador estable a cada alternativa dentro de la revisión. La solución correcta y la explicación permanecen en la representación privada del servidor.

`question_drafts` continúa como espacio editable y propietario. Una revisión aprobada es un snapshot; nunca se actualiza después de ser usada por una publicación.

### Prácticas y evaluaciones

**`assessments`**

- Identidad: `id`, `classroom_id`, `teacher_id`.
- Tipo: `practice | evaluation`.
- Datos editables: título, instrucciones y política actual.
- Estado: `draft | published | closed | archived`.
- `version` para concurrencia optimista y fechas de creación/actualización.

**`assessment_versions`**

- `id`, `assessment_id`, `revision`, `settings`, `total_points`, `content_hash`.
- Ventana: `opens_at`, `due_at`, `closes_at`; duración opcional.
- Políticas: intentos permitidos, orden aleatorio, entrega tardía y momento de retroalimentación.
- `published_by`, `published_at`; inmutable después de publicar.

**`assessment_version_items`**

- `assessment_version_id`, `question_revision_id`, `position`, `points`.
- Configuración acotada por ítem, por ejemplo orden de alternativas.
- Únicos por versión para posición y pregunta cuando no se permitan duplicados.

La planificación se relaciona mediante las revisiones de preguntas, que ya proceden de un nodo académico. No se copia ni reinterpreta el árbol de unidades, semanas o temas.

### Intentos, respuestas y calificaciones

**`attempts`**

- `id`, `assessment_version_id`, `student_user_id`, `attempt_number`.
- Estado: `in_progress | submitted | grading | graded | expired | invalidated`.
- `started_at`, `expires_at`, `submitted_at`, `last_activity_at` y `version`.
- Único `(assessment_version_id, student_user_id, attempt_number)`.
- Como máximo un intento activo por estudiante y versión, protegido transaccionalmente.

**`attempt_items`**

- Snapshot de la presentación: `attempt_id`, `assessment_version_item_id`, `position`, `option_order`.
- Conserva el orden realmente mostrado sin revelar la solución.

**`attempt_answers`**

- `attempt_id`, `attempt_item_id`, respuesta estructurada, `saved_at`, `version`.
- Guardado idempotente por clave de operación y control optimista.
- Resultado de corrección privado: estado, puntos otorgados y detalle técnico mínimo.

**`attempt_grades`**

- `attempt_id`, `grading_revision`, `score`, `max_score`, `status: provisional | final`.
- `graded_by_type: system | teacher`, `graded_by`, `graded_at`, motivo de ajuste.
- Cada recalificación agrega una revisión y evento de auditoría; no sobrescribe el historial.

Los resultados de aula se consultan como proyecciones de intentos y calificaciones. No se mantendrá una segunda nota mutable que pueda divergir.

## Publicación y corrección

1. El docente propietario bloquea la evaluación en una transacción.
2. El servidor comprueba aula activa, versión esperada, al menos una pregunta, puntaje positivo y fechas coherentes.
3. Cada pregunta debe tener revisión aprobada. Las preguntas de opción única requieren exactamente una alternativa correcta y una revisión docente de la explicación.
4. Se crea una `assessment_version` inmutable con sus ítems y hash; luego se cambia el agregado a `published` y se audita.
5. Ningún cambio posterior modifica esa versión. Una corrección editorial crea otra revisión y exige publicación explícita.
6. Al iniciar un intento, el servidor valida matrícula activa y ventana temporal, fija expiración y orden de presentación.
7. La entrega bloquea el intento, es idempotente y corrige contra snapshots privados. No acepta puntajes ni respuestas correctas enviados por el cliente.
8. La retroalimentación respeta la política publicada: inmediata para práctica si el docente lo permite; después del cierre para evaluación por defecto.

## Seguridad y privacidad

- Google identifica; la base de datos autoriza. Todas las rutas exigen sesión vigente, rol y pertenencia real.
- CSRF obligatorio en POST/PUT/PATCH; cookies seguras según el entorno y CORS restringido.
- El estudiante solo accede a versiones publicadas de aulas con matrícula activa y nunca recibe claves de respuesta antes del momento permitido.
- Docentes no acceden a evaluaciones, preguntas, intentos ni resultados de otras aulas.
- Rate limit para inicio, autoguardado y entrega; límites de tamaño y esquema `additionalProperties:false`.
- Auditoría sin contenido académico sensible para publicar, cerrar, iniciar, entregar, recalificar e invalidar.
- Respuestas y analítica son datos académicos privados. No se envían a Ollama ni a servicios externos para calificar.
- La invalidación conserva datos y exige motivo; no hay borrado físico desde la interfaz.
- Las transcripciones y documentos mantienen las reglas privadas actuales y no se incorporan automáticamente a una evaluación.

## Contratos de API propuestos

- Docente: CRUD de borradores de evaluación, selección/reordenamiento de revisiones aprobadas, vista previa, publicación, cierre y resultados.
- Estudiante: lista de actividades elegibles, inicio/reanudación, guardado de respuesta, entrega idempotente y resultado permitido.
- Respuestas con DTO distintos: el DTO estudiantil excluye solución, verificación y explicación privada; el docente recibe metadatos autorizados.
- Errores estables: conflicto de versión, ventana cerrada, intento agotado, matrícula inválida, entrega duplicada y pregunta no aprobada.

## Especificación UI/UX para diseño futuro en Figma

### Recorrido docente

1. **Evaluaciones del aula**: pestañas Borradores, Publicadas y Cerradas; estado, ventana, preguntas e intentos reales, sin métricas inventadas.
2. **Constructor**: encabezado con cambios sin guardar; columna de banco filtrable por unidad/semana/tema; lienzo ordenable con puntos; panel de configuración y resumen.
3. **Revisión previa**: muestra exactamente la experiencia estudiantil, advertencias matemáticas, puntaje total, fechas, intentos y política de retroalimentación.
4. **Confirmación de publicación**: diálogo explícito con impacto e inmutabilidad. Publicar nunca comparte preguntas indeterminadas sin resolución docente.
5. **Resultados**: tabla accesible de estudiantes e intentos, estados y nota; detalle por pregunta y exportación se pospone hasta definir privacidad.

### Recorrido estudiante

1. **Mis actividades**: disponibles, próximas y finalizadas, con fechas absolutas, duración e intentos restantes.
2. **Antes de comenzar**: reglas, ventana, retroalimentación y confirmación; iniciar es una acción explícita.
3. **Resolución**: modo concentración, progreso textual, navegación por preguntas, estado guardado y tiempo del servidor. KaTeX para matemáticas.
4. **Entrega**: resumen de respondidas/no respondidas y confirmación. Un fallo de red conserva el estado y permite reintentar la misma operación.
5. **Resultado**: solo la información habilitada por la política, sin revelar respuestas de evaluaciones abiertas.

### Sistema visual y estados

- Reutilizar AppShell, navegación contextual, Manrope, Source Serif 4, KaTeX y tokens semánticos de «Geometría razonada».
- Diseñar estados vacío, carga, guardado, error, conflicto, permiso denegado, vencido y conexión interrumpida.
- Objetivo WCAG 2.2 AA, foco visible, teclado completo, texto base de 16 px, controles táctiles cercanos a 44 px y `prefers-reduced-motion`.
- Marcos Figma mínimos: 390, 768 y 1440 px para constructor, resolución y resultados. Componentes con variantes de rol, estado y tema claro/oscuro.
- No depender del color para correcto/incorrecto ni mostrar animaciones celebratorias en evaluaciones calificadas.

## Hitos de implementación

1. **Contratos e inmutabilidad**: definir DTO y migración aditiva para revisiones de preguntas, evaluaciones borrador y versiones publicadas; restricciones, índices, auditoría y pruebas PostgreSQL. Sin interfaz estudiantil todavía.
2. **Constructor docente**: crear/editar evaluación, seleccionar revisiones aprobadas, ordenar, puntuar y previsualizar. Protección de cambios y conflictos.
3. **Publicación segura**: transacción de snapshot, validaciones, cierre y pruebas de aislamiento entre aulas.
4. **Intentos estudiantiles**: elegibilidad, inicio/reanudación, autoguardado versionado, tiempo de servidor y entrega idempotente.
5. **Corrección y resultados**: corrección de opción única en servidor, calificación versionada, política de retroalimentación y consulta docente.
6. **QA y endurecimiento**: concurrencia, vencimientos, reconexión, accesibilidad, responsive, auditoría, carga y recorrido Google real controlado.

## Primer hito recomendado

Implementar únicamente el hito 1: convertir un borrador aprobado en una revisión inmutable y permitir que un docente propietario cree una práctica en estado borrador que referencie esas revisiones. La aceptación exige migración aditiva en `auligma_test`, contratos sin solución para estudiantes, pruebas de otro docente/aula, conflictos de versión y ninguna publicación automática.
