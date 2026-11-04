# Seguridad de AULIGMA

AULIGMA maneja flujos de identidad, matrículas y potencialmente respuestas académicas. La seguridad y la privacidad tienen prioridad sobre la rapidez de desarrollo.

## Estado de soporte

El repositorio está en **desarrollo activo** y no documenta una versión desplegada en producción. Este archivo no garantiza tiempos de respuesta, programas de recompensas ni soporte de versiones publicadas.

## Cómo informar una vulnerabilidad

**No publiques detalles de una vulnerabilidad, credenciales, datos de estudiantes ni instrucciones de explotación en un issue público.**

1. Comprueba si el repositorio tiene habilitado el mecanismo privado **Report a vulnerability** en la pestaña **Security** de GitHub; úsalo si está disponible.
2. Si no está habilitado, contacta privadamente al responsable del repositorio por un canal acordado antes de enviar detalles sensibles. No supongas que un issue público es un canal privado.
3. Incluye descripción del impacto, componentes afectados, requisitos para reproducir y evidencia **sintética y redactada**; evita enviar tokens reales, bases de datos o datos académicos.
4. Da oportunidad de evaluar y corregir el problema antes de divulgarlo públicamente.

No se ha configurado ni anunciado aquí una dirección de correo de seguridad específica.

## Áreas críticas para revisión

- **Autenticación:** Google OIDC, sesiones, caducidad, cookies, CSRF y redirecciones.
- **Autorización:** aislamiento por docente, aula, estudiante y matrícula activa; conocer un UUID no autoriza recursos.
- **Evaluaciones:** revisión y publicación explícitas, respuestas correctas privadas y puntuaciones calculadas exclusivamente en el servidor.
- **Persistencia:** migraciones aditivas, transacciones, control de versiones, idempotencia y protección frente a duplicados.
- **IA y matemáticas:** salidas de modelos no confiables; resultados `INDETERMINADO` requieren revisión docente.
- **Datos:** información personal y académica solo en entornos autorizados; no subir `.env`, volcados de base de datos, tokens ni material institucional a GitHub.

## Desarrollo y pruebas seguras

- Usa únicamente usuarios y datos sintéticos en pruebas automatizadas.
- Comprueba el nombre de la base de pruebas antes de ejecutar migraciones o suites con escrituras.
- Limita el acceso de los usuarios de PostgreSQL por entorno; no reutilices credenciales productivas.
- No ejecutes escaneos intrusivos contra sistemas institucionales o de terceros sin autorización.
- Revisa dependencias, validación de entradas, límites de tamaño y permisos antes de cualquier despliegue.

## Referencias del proyecto

Lee `AGENTS.md`, `docs/GOOGLE_OIDC.md`, `docs/POSTGRESQL.md` y `docs/FASE_2_4_PLAN.md` para el diseño previsto. La existencia de un control documentado **no significa** que esté implementado o auditado en todas las rutas.
