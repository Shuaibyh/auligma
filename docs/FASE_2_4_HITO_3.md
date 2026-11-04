# Fase 2.4 — Hito 3: publicación segura

## Alcance implementado

El docente propietario puede publicar una práctica en una transacción, consultar sus snapshots inmutables y cerrarla manualmente. Este hito no crea actividades estudiantiles, intentos, respuestas, corrección, calificaciones ni analítica.

## Contratos docentes

Rutas relativas a `/api/v1/classrooms/:id/assessments/:assessmentId`:

| Método | Ruta | Alcance |
| --- | --- | --- |
| `POST` | `/publish` | Publica el borrador esperado y devuelve el snapshot inmutable. |
| `GET` | `/versions` | Lista las versiones publicadas de la práctica. |
| `GET` | `/versions/:versionId/preview` | Recupera una versión inmutable para vista previa docente. |
| `POST` | `/close` | Cierra manualmente una práctica publicada sin eliminar su historial. |

Todas las mutaciones exigen sesión docente, origen válido, CSRF, propiedad del aula, confirmación explícita y control de versión.

## Reglas de publicación

- La evaluación se bloquea con `FOR UPDATE` y debe estar en estado `draft`.
- La versión esperada debe coincidir con el borrador bloqueado.
- Debe existir al menos una pregunta; sus posiciones son consecutivas y sus puntajes positivos.
- Todas las revisiones siguen aprobadas y pertenecen al aula.
- Las fechas usan ISO 8601 con zona horaria. Apertura precede a vencimiento y cierre; vencimiento no supera el cierre.
- El snapshot conserva título, instrucciones, tipo, versión fuente, disponibilidad, revisiones, orden y puntajes.
- El hash SHA-256 se calcula sobre una representación canónica del contenido publicado.
- Un reintento idéntico devuelve la misma versión; la restricción única y el bloqueo impiden duplicados concurrentes.
- Los triggers PostgreSQL impiden actualizar o eliminar versiones e ítems publicados.

## Cierre

El cierre bloquea la evaluación, exige su versión actual y cambia `published → closed`. Un reintento idéntico es idempotente. No modifica snapshots ni revisiones de preguntas y registra un evento de auditoría sin contenido académico sensible.

## Interfaz

El recorrido docente incorpora estados Borradores, Publicadas y Cerradas; configuración opcional de disponibilidad; confirmación de inmutabilidad; historial de versiones; vista previa publicada y cierre confirmado. No existe navegación estudiantil hacia estas rutas.

## Persistencia

La migración aditiva `202611040001_assessment_publication.mjs` amplía `assessment_versions` con `source_version`, `opens_at`, `due_at` y `closes_at`, además de restricciones temporales e índices. Debe probarse primero en `auligma_test`; no se aplica en `auligma_dev` sin autorización expresa.
