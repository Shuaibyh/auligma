# Fase 2.4 — Hito 4: intentos estudiantiles

## Alcance implementado

El Hito 4 incorpora el recorrido estudiante sobre versiones publicadas: consulta de actividades, lectura de reglas, inicio o reanudación de un intento, autoguardado versionado y entrega final idempotente. No calcula notas, no muestra resultados matemáticos y no expone retroalimentación; esas capacidades pertenecen a hitos posteriores.

## Política conservadora

- Cada estudiante dispone de un intento por versión publicada.
- `opens_at` habilita el inicio. `closes_at` es el límite definitivo y también la expiración del intento. `due_at` se comunica como vencimiento informativo, pero no altera por sí solo la posibilidad de entregar.
- Si una publicación no define `closes_at`, el intento no recibe un límite adicional. Toda decisión temporal usa `clock_timestamp()` de PostgreSQL; la hora del navegador solo presenta la cuenta regresiva mediante el desfase entregado por el servidor.
- El orden de alternativas se copia al iniciar y queda persistido. En este hito se conserva el orden de la versión publicada; no se activa aleatorización sin una política explícita.
- Un intento `submitted`, `expired` o `invalidated` no vuelve a estado editable.
- Un cierre manual impide nuevos intentos. Un intento ya iniciado conserva su snapshot, pero sus escrituras siguen sujetas a matrícula activa y a su fecha de expiración.

## Persistencia

La migración `202611040002_student_attempts.mjs` añade:

- `attempts`: identidad del estudiante, matrícula y versión publicada; número, estado, tiempos, versión optimista y claves idempotentes.
- `attempt_items`: copia del orden de preguntas y alternativas para cada intento.
- `attempt_answers`: respuesta estructurada, versión, hora de guardado y clave de operación.

Las claves foráneas compuestas impiden mezclar aula, matrícula, versión, pregunta o respuesta. Un índice parcial garantiza como máximo un intento activo por estudiante y versión. Los triggers bloquean borrados, cambios de identidad, regresiones de versión, mutación de snapshots y respuestas posteriores al cierre del intento.

## Contratos HTTP

| Método | Ruta | Propósito |
| --- | --- | --- |
| `GET` | `/api/v1/classrooms/:id/activities` | Lista actividades publicadas y su estado para la matrícula activa. |
| `GET` | `/api/v1/classrooms/:id/activities/:versionId` | Devuelve reglas, disponibilidad y posibilidad de iniciar o reanudar. |
| `POST` | `/api/v1/classrooms/:id/activities/:versionId/attempts` | Inicia o recupera de forma idempotente el único intento. |
| `GET` | `/api/v1/classrooms/:id/attempts/:attemptId` | Recupera preguntas, orden y respuestas guardadas. |
| `PATCH` | `/api/v1/classrooms/:id/attempts/:attemptId/answers/:itemId` | Guarda una selección con versión esperada y clave de operación. |
| `POST` | `/api/v1/classrooms/:id/attempts/:attemptId/submit` | Finaliza el intento de forma atómica e idempotente. |
| `GET` | `/api/v1/classrooms/:id/attempts/:attemptId/status` | Permite reconciliar el estado después de una desconexión. |

Los DTO estudiantiles excluyen respuesta correcta, explicación, expresión de verificación, resultados de SymPy, hashes de contenido y cualquier campo de calificación. Todas las escrituras exigen sesión estudiantil, origen y CSRF válidos, matrícula activa, alcance por propietario, rate limit, bloqueo transaccional y versión esperada.

## Interfaz

El flujo real ofrece listado, reglas previas, mapa de preguntas, alternativas matemáticas con KaTeX, estado de autoguardado, navegación anterior/siguiente, tiempo restante basado en el servidor, confirmación de entrega y constancia final. La interfaz mantiene los temas claro/oscuro, foco visible, controles de al menos 44 px y adaptación a 390, 768, 1024 y 1440 px.

## Fuera del alcance

- Corrección automática o manual.
- Puntajes, notas, resultados y retroalimentación.
- Analítica docente o estudiantil.
- Reintentos, excepciones de plazo o aleatorización configurable.
- Cambios en OAuth, matrículas, publicación docente o snapshots históricos.

La migración debe validarse mediante aplicación, rollback y reaplicación en `auligma_test`. No se aplica en `auligma_dev` sin autorización explícita.
