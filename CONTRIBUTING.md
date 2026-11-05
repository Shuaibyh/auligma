# Contribuir a AULIGMA

Gracias por contribuir a AULIGMA, plataforma educativa para aulas universitarias, preguntas matemáticas y evaluaciones. Este repositorio está en desarrollo; **no está desplegado en producción**.

## Antes de empezar

1. Lee `AGENTS.md`, `README.md` y `docs/ARQUITECTURA.md`.
2. Para cambios de experiencia visual, consulta `docs/UI_UX_SISTEMA_DISENO.md`.
3. Para el trabajo de evaluaciones versionadas, revisa `docs/FASE_2_4_PLAN.md`.
4. No compartas matrículas reales, información académica privada, credenciales ni tokens en commits, issues o capturas.

## Entorno de desarrollo

Se requiere Node.js 24 LTS, npm y un entorno local compatible con las instrucciones del README.

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

Las pruebas del backend y de interfaz están definidas en `package.json`:

```powershell
npm.cmd run test:server
npm.cmd run test:e2e
```

Algunas pruebas requieren PostgreSQL, navegadores instalados o servicios locales. **No declares que pasaron si no se ejecutaron**; documenta cuáles se omitieron y por qué. Para persistencia, usa exclusivamente una base de pruebas y verifica su identidad antes de migrar o ejecutar tests.

## Propuesta de cambios

1. Crea una rama de trabajo desde la rama base actualizada; no reescribas el historial compartido.
2. Realiza un cambio acotado y revisable, con pruebas y documentación proporcionales.
3. Usa mensajes descriptivos, por ejemplo `test: cubrir autorización por matrícula` o `docs: documentar validación de publicaciones`.
4. Antes de abrir un pull request, verifica los cambios con `git diff --check`, TypeScript y ESLint; añade pruebas relevantes cuando corresponda.
5. En el pull request, explica **qué cambió, cómo se comprobó y qué queda pendiente**. Adjunta capturas solo si no contienen información personal.
6. Solicita revisión para cambios de autenticación, permisos, migraciones, publicación de evaluaciones, cálculos o exposición de respuestas.

## Principios de calidad

- Conserva la separación entre Docente y Estudiante y valida permisos siempre en el servidor.
- Trata las respuestas de IA como propuestas, no como comprobaciones definitivas ni autorizaciones para publicar.
- En matemática, `INDETERMINADO` requiere revisión humana; no debe presentarse como correcto.
- Respeta revisiones inmutables, historial de intentos y datos de auditoría cuando el dominio los requiera.
- No incorporas nuevas dependencias, modelos o integraciones sin justificar seguridad, mantenimiento y coste.
- Evita commits artificiales: cada cambio debe resolver una necesidad verificable.

## Seguridad y datos

Consulta [SECURITY.md](SECURITY.md) para comunicar vulnerabilidades. No incluyas archivos `.env`, contraseñas, tokens, bases de datos, archivos académicos reales ni carpetas de dependencias o builds en los commits.

**Alcance de esta guía:** recomendaciones para contribuir; no implica que toda la Fase 2.4 esté implementada ni que exista un despliegue público.
