# AULIGMA — Checklist de preparación para despliegue

> **Estado:** guía preventiva. AULIGMA no se declara listo para producción. Completar esta lista no sustituye una auditoría, revisión institucional ni pruebas de restauración.

## 1. Alcance y responsables

- [ ] Definir quién administra infraestructura, aplicación y datos académicos.
- [ ] Registrar versión/tag, fecha y alcance del cambio a desplegar.
- [ ] Delimitar qué módulos están realmente implementados y cuáles siguen en demostración.
- [ ] Confirmar autorización institucional para tratar datos reales.
- [ ] Aprobar una política de retención y privacidad antes de recopilar información académica.

## 2. Configuración y secretos

- [ ] Mantener `.env` y credenciales fuera del repositorio y del frontend público.
- [ ] Provisionar secretos por entorno; no reutilizar credenciales de desarrollo.
- [ ] Configurar Google OIDC con orígenes y redirecciones exactos del entorno.
- [ ] Exigir HTTPS, cookies apropiadas, CSRF y CORS restringido.
- [ ] Mantener claves, modelos y servicios locales separados de endpoints públicos.

## 3. PostgreSQL y migraciones

- [ ] Identificar y comprobar explícitamente la base de destino antes de ejecutar migraciones.
- [ ] Respaldar la base mediante proceso protegido y **probar la restauración**.
- [ ] Revisar efectos y compatibilidad de cada migración; preferir cambios aditivos.
- [ ] Ejecutar previamente migraciones y pruebas sobre una base aislada.
- [ ] Aplicar principio de mínimos privilegios a roles de aplicación y mantenimiento.
- [ ] Definir plan de recuperación que no dependa de borrar registros académicos.

## 4. Calidad y seguridad

- [ ] Ejecutar `npm.cmd run typecheck` y `npm.cmd run lint`.
- [ ] Ejecutar `npm.cmd run build` y `npm.cmd run build:server`.
- [ ] Ejecutar suites pertinentes de backend y Playwright con dependencias disponibles.
- [ ] Documentar pruebas omitidas y no confundirlas con aprobadas.
- [ ] Revisar aislamiento docente/aula/matrícula y prohibición de filtrar soluciones.
- [ ] Verificar idempotencia, versiones inmutables, transacciones y registro de auditoría.
- [ ] Revisar las dependencias y la exposición de secretos o datos personales en logs.
- [ ] Comprobar accesibilidad, tamaños de pantalla y manejo de errores recuperables.

## 5. Operación y observabilidad

- [ ] Definir métricas, alertas, disponibilidad y responsable de respuesta a incidentes.
- [ ] Establecer limpieza programada de sesiones y OAuth caducados si corresponde.
- [ ] Monitorear uso de CPU, RAM, GPU, base de datos y límites de los procesos de IA.
- [ ] Definir política de despliegue gradual, observación y reversión de aplicación.
- [ ] Conservar respaldos y registros necesarios sin recopilar contenido sensible innecesario.

## 6. Evidencia de aprobación

Registrar en un acta de release: **commit, versión, entorno, pruebas ejecutadas, resultado, aprobador, riesgos abiertos, fecha y plan de recuperación**.

### Referencias internas

- `README.md`: comandos de desarrollo y verificación.
- `docs/POSTGRESQL.md`: bases, roles y migraciones.
- `docs/GOOGLE_OIDC.md`: identidad y sesión.
- `docs/FASE_2_4_PLAN.md`: publicación, intentos y calificaciones previstas.
- `SECURITY.md`: comunicación de vulnerabilidades.

**No ejecutar migraciones, reiniciar servicios ni desplegar por completar esta documentación.**
