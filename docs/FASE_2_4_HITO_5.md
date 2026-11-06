# AULIGMA — Fase 2.4, Hito 5

## Alcance implementado

El Hito 5 incorpora corrección oficial en backend para preguntas de opción única, calificaciones versionadas, consulta docente, resultado estudiantil sujeto a políticas de liberación y revisión docente de verificaciones matemáticas no concluyentes.

No incluye analítica del Hito 6, nuevos tipos de pregunta, publicación automática, calificación mediante Ollama ni cambios en respuestas entregadas.

## Diagnóstico previo

- Los intentos del Hito 4 terminaban en `submitted`; no existían `grading`, `graded` ni calificaciones persistentes.
- La clave correcta ya estaba protegida en `question_revisions.correct_option_id`, dentro de revisiones aprobadas e inmutables.
- Los puntajes publicados estaban congelados en `assessment_version_items.points`.
- Las respuestas y el orden de alternativas estaban fijados en `attempt_answers` y `attempt_items`.
- No había políticas versionadas para liberar puntajes o soluciones.
- SymPy admitía `derivative` y `equivalence`; un resultado `INDETERMINADO` no debía convertirse en respuesta incorrecta.

## Persistencia

La migración aditiva `202611050001_attempt_grading.mjs` prepara:

- `attempt_grades`: revisión, puntaje, máximo, estado `provisional|final`, origen `system|teacher`, responsable, motivo, fecha e idempotencia.
- `attempt_item_grades`: resultado y puntaje por ítem vinculados a una revisión de calificación.
- Estados de intento `grading` y `graded` con transiciones protegidas.
- Políticas inmutables por versión: `score_release_policy` y `solution_release_policy`.
- Restricciones para impedir notas negativas, superiores al máximo, revisiones duplicadas y totales inconsistentes.
- Triggers que impiden actualizar o borrar revisiones históricas.

La suma se realiza en centésimas enteras y se persiste como `numeric(10,2)`. Un trigger diferible comprueba que el total coincide con todos los ítems.

## Motor de corrección

`server/grading.ts`:

1. Bloquea el intento dentro de una transacción.
2. Solo admite intentos `submitted` o una recuperación controlada desde `grading`.
3. Lee clave privada, alternativas y puntaje desde snapshots PostgreSQL.
4. Valida que la alternativa respondida pertenezca al ítem.
5. Usa SymPy solo para `derivative` y `equivalence`.
6. Si SymPy no concluye o detecta ambigüedad, crea una nota provisional con revisión pendiente; nunca asigna incorrecto automáticamente.
7. Persiste una sola corrección aun con solicitudes concurrentes.
8. Registra auditoría sin incluir respuestas ni claves correctas.

Ollama no participa en decisiones de calificación.

## API

### Docente propietario

- `GET /api/v1/classrooms/:id/results`
- `GET /api/v1/classrooms/:id/results/attempts/:attemptId`
- `POST /api/v1/classrooms/:id/results/attempts/:attemptId/review`

La revisión exige CSRF, revisión esperada, clave idempotente, motivo y puntajes dentro del máximo publicado. Crea una nueva revisión final y conserva la anterior.

### Estudiante matriculado

- `GET /api/v1/classrooms/:id/attempts/:attemptId/result`

El estudiante solo consulta su intento. Una nota provisional no se revela. El servidor decide si libera el puntaje y, por separado, soluciones y explicaciones. Los DTO restringidos no incluyen verificación, expresión matemática interna ni hash del contenido.

## Políticas de liberación

- `score_release_policy`: `immediate` o `after_close`.
- `solution_release_policy`: `never` o `after_close`.
- Para compatibilidad y privacidad, los valores predeterminados son `after_close` y `never`.
- El cierre se determina con estado de la evaluación, fecha de cierre y reloj PostgreSQL.

## Seguridad e integridad

- Sesión, rol, propiedad del aula y matrícula activa se comprueban en backend.
- UUID no concede acceso por sí solo; los intentos se filtran por aula y propietario.
- Escrituras requieren origen y CSRF válidos.
- Bloqueo `FOR UPDATE`, restricciones únicas y claves de operación protegen concurrencia e idempotencia.
- Respuestas, snapshots y revisiones de calificación son inmutables después de la entrega.
- La auditoría conserva identificadores y metadatos operativos, no soluciones privadas.

## Interfaz

- Panel docente con entregas, pendientes, provisionales, finales y detalle por estudiante.
- Revisión explícita de casos indeterminados con motivo obligatorio.
- Historial inmutable de calificaciones.
- Resultado estudiantil con estados pendiente, retenido, revisión requerida y disponible.
- Diseño responsive, temas claro/oscuro, foco visible, semántica y estados accesibles según el sistema Geometría razonada.

## Migración y operación

La migración debe probarse mediante aplicación, rollback y reaplicación exclusivamente en `auligma_test`. No se aplica en `auligma_dev` sin autorización explícita y respaldo previo.

## Límites conocidos

- Solo se califican preguntas de opción única.
- Un fallo o indeterminación de SymPy deriva a revisión docente.
- No hay liberación manual independiente; las políticas disponibles son inmediata o posterior al cierre.
- No se implementa analítica agregada, exportación ni Hito 6.
