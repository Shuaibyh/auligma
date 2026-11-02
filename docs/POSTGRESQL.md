# AULIGMA — PostgreSQL local y migraciones

## Estado comprobado

PostgreSQL 18 está activo en desarrollo local. Se aprovisionaron un rol de aplicación sin privilegios administrativos y bases separadas de desarrollo y pruebas; las migraciones Knex están aplicadas. La verificación estructural confirmó las 12 tablas del dominio, claves, restricciones e índices esperados. `.env` permanece privado y excluido de Git.

## Configuración

Usar una instancia PostgreSQL existente o provisionada por el responsable. Crear una base y un usuario exclusivos de AULIGMA. El usuario de migración necesita crear tablas e índices; el usuario de ejecución debe disponer solo de las operaciones necesarias. Aplicar credenciales distintas y mínimo privilegio antes de producción.

Copiar `.env.example` a `.env` y configurar, de forma privada:

```dotenv
DATABASE_URL=postgresql://USUARIO:CLAVE@127.0.0.1:5432/auligma
```

Los valores anteriores son marcadores, no credenciales. Codificar caracteres especiales de usuario/contraseña en la URL. Para servidores remotos, exigir TLS y verificación de certificado según la configuración de `pg` y del proveedor; no deshabilitar la verificación TLS.

```powershell
npm.cmd run db:migrate
npm.cmd run start:server
```

Knex ejecuta `server/migrations/202611010001_initial.mjs` en una transacción y registra versiones/bloqueos en sus tablas internas. Repetir `db:migrate` solo aplica migraciones nuevas. No hay un script de reseteo ni un rollback destructivo: corregir mediante migraciones adicionales, con respaldo previo.

## Modelo inicial

| Tabla | Restricciones principales |
|---|---|
| `users` | UUID, correo normalizado único, dos roles, estado activo |
| `external_identities` | proveedor Google + sub únicos, usuario único, dominio validado |
| `student_profiles` | FK compuesta exige rol estudiante; escuela opcional hasta completar; código único nullable |
| `teacher_profiles` | FK compuesta exige rol docente |
| `teacher_authorizations` | correo y sub únicos, aprobación, tipo, evidencia y revocación |
| `professional_schools` | seis escuelas, IDs estables 1–6 |
| `subjects` | docente propietario; nombre único por docente; archivado |
| `classrooms` | asignatura y propietario coherentes mediante FK compuesta; sección/periodo únicos por asignatura; privacidad obligatoria |
| `enrollments` | matrícula por aula y correo; estudiante nullable en preautorización; estados definidos; activa exige estudiante |
| `sessions` | hash opaco, FK usuario, CSRF y expiración |
| `oauth_attempts` | hash de state y navegador, nonce, verificador PKCE, expiración |
| `audit_events` | eventos mínimos, actor/recurso y fecha; sin contenido de perfil ni tokens |

No hay cascadas de borrado académico. Los índices soportan docente/archivado, estudiante/estado, sesiones por usuario y expiración, OAuth caducado y auditoría por actor/fecha. La conciliación por correo y las altas masivas quedan para Fase 2.2; iniciar sesión no matricula a nadie.

El código universitario permanece vacío mientras no exista una regla institucional validada. No se deduce arbitrariamente del correo. El catálogo de las seis escuelas está sembrado en la migración y expuesto por la API; la UI conserva también sus etiquetas existentes y sus IDs estables.

## Pruebas PostgreSQL

`DATABASE_TEST_URL` apunta a una base **exclusiva de pruebas**. `npm.cmd run test:server` carga `.env`, aplica migraciones y crea fixtures sintéticos dentro de una transacción que revierte al terminar. El esquema de pruebas permanece; no se borra ninguna base.

La suite comprobó unicidad, identidades separadas, dominio, autorización piloto, persistencia del perfil, FK, propiedad de aulas, matrícula y revocación, sesiones caducadas, CSRF, rechazo de cambio de rol, logout y auditoría. Sin esa variable se marca omitida, nunca aprobada. No usar la base de desarrollo o producción en `DATABASE_TEST_URL`.

## Mantenimiento pendiente de operación

`npm.cmd run db:cleanup` elimina únicamente sesiones y transacciones OAuth caducadas. No elimina datos académicos. Programar esta limpieza en la infraestructura elegida. La retención de usuarios, perfiles, imágenes y auditoría requiere una política institucional antes de producción. No se ha fijado una eliminación automática de esos datos.

Preparar backups cifrados, prueba de restauración, roles mínimos, rotación de credenciales y monitoreo. `archived_at` prepara archivado recuperable de asignaturas/aulas; esta fase no expone acciones de borrado ni implementa todo el flujo de archivado real.

Referencia: [migraciones Knex](https://knexjs.org/guide/migrations.html).
