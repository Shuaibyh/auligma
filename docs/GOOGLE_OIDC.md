# AULIGMA — Configuración de Google OpenID Connect

## Estado

El código implementa Authorization Code + PKCE S256, `state`, `nonce`, verificación RS256/JWKS y sesiones propias. En desarrollo local se validaron con Google real un docente piloto autorizado y un estudiante de Google Workspace con `hd=undc.edu.pe`. Ambos crearon identidades, perfiles y sesiones independientes en PostgreSQL; se comprobaron recarga, actualización de perfil, logout y cambio de cuenta. Las pruebas automatizadas criptográficas siguen usando exclusivamente claves y tokens sintéticos.

## Preparación en Google Cloud

1. Seleccionar un proyecto autorizado y configurar Google Auth Platform: marca, audiencia y contacto de soporte del responsable del proyecto.
2. Elegir audiencia interna si se dispone del proyecto institucional de Workspace. Un docente piloto con Gmail personal requiere audiencia externa y, mientras la aplicación esté en pruebas, incorporación explícita como usuario de prueba.
3. Crear un cliente OAuth de tipo **Aplicación web**. En desarrollo, registrar exactamente `http://127.0.0.1:3001/api/v1/auth/google/callback` como URI de redirección autorizada. No intercambiar `localhost` y `127.0.0.1`.
4. Este flujo es servidor a servidor y no usa Google Identity Services en JavaScript: no necesita un origen JavaScript autorizado para el intercambio. Si la consola solicita registrar el origen del frontend, corresponde a `http://127.0.0.1:5173`.
5. Configurar únicamente `openid`, `email`, `profile`. No habilitar permisos de Gmail, Drive, Calendar ni contactos.
6. Guardar `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en `.env`, nunca en variables `VITE_*`, código cliente, capturas o archivos versionados.
7. Configurar `DATABASE_URL`, ejecutar migraciones e iniciar backend y frontend. Si se cambian puertos, modificar `FRONTEND_URL`, `BACKEND_URL` y la URI registrada en Google.

En Windows, ejecutar `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\configure-google-oauth.ps1` desde la raíz del proyecto. El configurador comprueba que `.env` esté ignorado por Git, solicita el Client ID localmente y recibe el Client Secret mediante una entrada oculta. También puede habilitar un único docente piloto en el entorno de desarrollo. No pasar credenciales como argumentos, variables visibles del comando ni mensajes de chat.

Google Cloud puede imponer condiciones adicionales de publicación/verificación según la audiencia y el proyecto. Esta fase no publica la aplicación ni configura cuentas externas automáticamente.

## Autorización

- Estudiante: identidad Google firmada, `email_verified=true` y `hd=undc.edu.pe`. La política inicial reconoce como estudiante a una identidad institucional sin autorización docente. El sufijo del correo por sí solo nunca basta.
- Docente institucional: registro previo en `teacher_authorizations`; el primer acceso vincula el `sub` validado. Un cambio de `sub` para el mismo correo requiere revisión, no se vincula automáticamente.
- Docente piloto: `ENABLE_PILOT_TEACHERS=true` y correo en `PILOT_TEACHER_EMAILS`, lista privada separada por comas. Debe autenticarse realmente con Google. El primer acceso crea una autorización de tipo `pilot` y la vincula al `sub`. Una revocación no se reactiva por mantener el correo en la lista.
- Producción rechaza `ENABLE_PILOT_TEACHERS=true`. Una excepción administrativa requeriría un registro institucional explícito con evidencia y el procedimiento de autorización siguiente; el código no permite trasladar la excepción de desarrollo automáticamente.

Para aprovisionamiento institucional, establecer `AUTHORIZATION_EMAIL` y `AUTHORIZATION_EVIDENCE` en el entorno privado de PowerShell y ejecutar:

```powershell
npm.cmd run teacher:authorize
```

No pegar direcciones personales en comandos que vayan a compartirse. La evidencia debe describir la aprobación y su responsable/referencia administrativa; el script se ejecuta con acceso restringido a la base, sin un tercer rol visible. Después, retirar esas variables del entorno. No existe endpoint público de aprovisionamiento.

Revocar con las mismas variables y `npm.cmd run teacher:revoke`. Revoca sesiones de la identidad vinculada. Además, cada petición docente comprueba la autorización actual. Desactivar el piloto o retirar un correo de la lista también bloquea sus sesiones en la siguiente petición.

## Protocolo y sesión

`GET /api/v1/auth/google/start` guarda una transacción OAuth de 10 minutos en PostgreSQL y establece una cookie de correlación HttpOnly. La autorización pide PKCE, state y nonce aleatorios. El callback consume atómicamente la transacción, vinculada al navegador. Reutilización, caducidad, cancelación y errores no crean sesión.

El servidor intercambia el código mediante HTTPS con Google, verifica firma, emisor, audiencia, `exp`, `iat`, `nonce`, `azp` cuando esté presente, correo verificado y `sub`. Los tokens Google no se conservan ni se envían a React. `jose` obtiene y cachea las claves públicas de Google. Los endpoints de autorización, token y JWKS están fijados a Google; no se aceptan proveedores o URLs enviados por el navegador.

La sesión usa un secreto aleatorio de 256 bits; PostgreSQL guarda únicamente su SHA-256, identidad, vencimiento y token CSRF. La cookie es HttpOnly, SameSite=Lax y Secure en HTTPS; producción usa `__Host-auligma`. Caduca a las 8 horas por defecto, sin renovación silenciosa. Una nueva autenticación sustituye la sesión del navegador; cerrar sesión revoca su registro. Las mutaciones requieren el token CSRF obtenido en `/me` y coincidencia exacta de `Origin`.

Para producción, servir SPA y `/api` bajo el mismo origen HTTPS mediante proxy inverso. No se han diseñado cookies entre sitios de terceros. El proxy debe conservar `Origin`, no registrar parámetros del callback, códigos, cookies, cuerpos de perfil ni respuestas OAuth. Configurar HTTPS y secretos es trabajo operativo pendiente; no se realizó despliegue.

## Validación real y pendientes

Se completaron los recorridos Google reales de docente piloto y estudiante institucional mientras la aplicación permanecía en modo Testing. Se verificaron rol derivado por el backend, `sub` único sin exponer su valor, `hd` institucional, perfil persistente, sesión tras recarga, logout y ausencia de matrículas inventadas. El incidente inicial `authentication_failed` se localizó en `TOKEN_EXCHANGE`: el proceso estaba aislado sin salida HTTPS (`EACCES`), no en las credenciales ni en Google Cloud. El backend ahora emite diagnósticos por etapa y referencia sin registrar códigos OAuth, tokens, cookies, secretos, `state`, nonce ni datos personales.

Siguen pendientes para un entorno productivo: HTTPS y cookie Secure, proxy del mismo origen, prueba de revocación administrativa con procedimiento autorizado, cuenta real no autorizada, cancelación de consentimiento y políticas operativas de secretos/retención. No registrar tokens ni datos personales como evidencia.

Fuentes oficiales consultadas: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [jose](https://github.com/panva/jose).
