# AULIGMA

Plataforma educativa inteligente para la gestión de aulas universitarias, generación asistida de evaluaciones matemáticas y reforzamiento del aprendizaje.

## Estado

Fase 2.3 implementada parcialmente y verificada en desarrollo local: backend Fastify, PostgreSQL 18, Google OpenID Connect, sesiones de servidor, matrículas institucionales y planificación académica persistente. Un docente autorizado puede construir jerarquías flexibles, publicar contenido selectivamente, asociar materiales privados, extraer texto de un sílabo PDF y duplicar una planificación mediante la API. El estudiante matriculado ve exclusivamente la estructura publicada. La generación asistida permanece deshabilitada porque no existe un proveedor de IA real configurado. La identidad visual «Geometría razonada» se conserva. No existe despliegue ni configuración productiva.

Guías vigentes: `docs/FASE_2_3_1.md`, `docs/FASE_2_3.md`, `docs/FASE_2_2.md`, `docs/FASE_2_1.md`, `docs/ARQUITECTURA.md`, `docs/GOOGLE_OIDC.md` y `docs/POSTGRESQL.md`. La prueba automatizada usa identidades sintéticas. El recorrido de aceptación con las dos cuentas reales queda pendiente de intervención humana y no se declara completado.

El frontend funcional de Fase 1.2 se conserva como demostración aislada. Incluye login local, rutas separadas por rol, aulas con archivado recuperable, matrícula manual, importación local de participantes, banco de preguntas aislado por aula, evaluaciones configurables, perfiles locales editables, revisión demostrativa de ejercicios y práctica con retroalimentación preparada. Sus datos siguen siendo sintéticos y locales; no se migran automáticamente a la API.

Los dos perfiles disponibles son Docente y Estudiante. La previsualización de una evaluación permanece dentro del espacio Docente y no registra respuestas ni modifica el progreso del perfil Estudiante.

## Desarrollo local

Requisito: Node.js 24 LTS y npm. Desde la raíz del proyecto:

```powershell
npm.cmd ci
npm.cmd run start:server
# En otra terminal:
npm.cmd run dev
```

Copiar `.env.example` a `.env` y completar los valores privados según las guías. Ejecutar `npm.cmd run db:migrate` cuando exista PostgreSQL. Frontend: `http://127.0.0.1:5173`; backend: `http://127.0.0.1:3001`. Vite usa puerto estricto y proxy `/api`; ambos orígenes son configurables. El proceso del backend necesita salida HTTPS hacia los endpoints oficiales de Google. Sin Google configurado, el login muestra indisponibilidad y no simula un acceso exitoso.

Para ejecutar exclusivamente el prototipo anterior en desarrollo, establecer `VITE_DEMO_MODE=true` y reiniciar Vite. Para volver a identidad real, usar `false`. El build de producción siempre deshabilita la demo.

## Demostración conservada de Fase 1.2

Credenciales exclusivamente sintéticas:

| Rol | Usuario | Contraseña |
|---|---|---|
| Docente | `docente` | `1234` |
| Estudiante | `alumno` | `1234` |

Solo en modo DEMO, el botón «Continuar con Google» informa que el método no está habilitado y no crea una sesión. En el modo real, el botón inicia OAuth cuando está configurado. Para salir, utiliza «Cerrar sesión».

Las credenciales DEMO se documentan aquí para desarrollo y pruebas, pero no se muestran ni se autocompletan en la interfaz. Permanecen accesibles en el código cliente, por lo que este mecanismo no es seguro para producción.

La sesión guarda en `sessionStorage` solo `demo-teacher` o `demo-student`. Se recupera al recargar la misma pestaña y se elimina al cerrar sesión. La contraseña no se persiste. Las rutas `/docente/*` y `/estudiante/*` redirigen según el rol activo; esta separación es funcional y no constituye seguridad real.

La configuración docente y la matrícula viven en memoria y se restablecen al recargar. Las respuestas de práctica se conservan por actividad en `sessionStorage` durante la pestaña; si el navegador bloquea el almacenamiento se usa memoria y se informa de la limitación.

## Verificación

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run test:server
npm.cmd run test:e2e
npm.cmd run test:e2e:real
```

Las pruebas usan Google Chrome instalado mediante Playwright. Generan un `.xlsx` con participantes sintéticos para verificar la lectura real del archivo. Las capturas se guardan en `test-results/fase-1-2/` y no se versionan.

## Organización

- `src/App.tsx`: rutas, bienvenida, shells separados por perfil y vista previa docente.
- `src/auth/demoAuth.tsx`: cuentas, sesión mínima, login y logout exclusivamente DEMO.
- `src/pages/Login.tsx`: formulario accesible de acceso local.
- `src/pages/`: aulas, matrícula, importación, banco, evaluaciones, revisión y portal estudiante.
- `src/components/`: componentes compartidos, diálogos Radix y matemáticas KaTeX.
- `src/state/DemoContext.tsx`: estado local tipado de aulas, estudiantes y experiencia.
- `src/state/academic.ts`: preguntas por aula, evaluaciones y políticas de intentos.
- `src/state/importStudents.ts`: lectura segura, encabezados, correspondencia y clasificación de participantes.
- `src/styles.css` y `src/refinements.css`: tokens, temas, responsive y movimiento funcional.
- `tests/`: flujos funcionales, Excel sintético, accesibilidad y capturas responsive.
- `docs/FASE_1_2.md`: causas, implementación, pruebas y límites de esta fase.
- `docs/FASE_2_0.md`: propuesta de datos, API, autenticación y despliegue; no es una implementación de backend.
- `docs/FASE_2_2_1.md`: revisión masiva responsiva y ciclo de vida seguro de aulas reales.
- `docs/FASE_2_3.md`: planificación jerárquica, materiales privados, extracción de sílabo y límites de IA.
- `docs/FASE_2_3_1.md`: duplicación visual, cambios sin guardar, revisión de propuestas, OCR y dependencias.

## Incorporación de participantes

En el modo real, el método principal es la autorización explícita de correos institucionales desde cada aula. El servidor valida, normaliza solo espacios y mayúsculas, evita duplicados y enlaza una preautorización cuando Google verifica posteriormente la misma identidad institucional. Pegar una lista solo prepara una vista previa; el docente debe confirmar antes de escribir en PostgreSQL.

La importación Excel descrita a continuación pertenece exclusivamente a la demostración conservada de Fase 1.2 y no aparece como flujo abandonado en la aplicación real.

AULIGMA lee `.xlsx` y `.csv` en el navegador. Detecta hojas, encabezados y columnas habituales de Moodle; propone estudiantes según el rol y deja los casos ambiguos para confirmación manual. Los `.xls` binarios heredados deben guardarse primero como `.xlsx` o `.csv`.

Límites del prototipo: 5 MB y 2000 filas. Las celdas se tratan como datos, nunca como HTML, y el archivo no se envía a terceros. Los registros importados solo permanecen en memoria. La opción «Usar archivo de demostración» está separada de la carga real.

## Alcance académico

Cada pregunta pertenece explícitamente a un aula y un tema. Una evaluación solo puede seleccionar preguntas de su propia aula. Las nuevas preguntas quedan pendientes hasta que el docente confirme su revisión manual; AULIGMA valida estructura y sintaxis KaTeX, pero no certifica el razonamiento matemático.

Las evaluaciones admiten intentos ilimitados o un máximo entero positivo. Fechas y consumo de intentos siguen siendo demostrativos porque no existe un servicio de ejecución institucional. Publicar conserva una copia local de las preguntas.

La selección de PDF sigue siendo una demostración: la transcripción es editable y sus estados Extraído, Verificado y Aprobado no acreditan corrección matemática productiva.

Revisa `AGENTS.md`, `docs/UI_UX_SISTEMA_DISENO.md` y `docs/FASE_1_2.md` antes de ampliar el producto. Las Skills externas se mantienen intactas.

> No publiques nóminas reales, datos personales, archivos privados ni credenciales.
>
> El login local no debe desplegarse como autenticación productiva. Fase 2.1 incorpora `RealAuthProvider` y sesiones emitidas por backend; las limitaciones académicas descritas en las secciones anteriores corresponden al prototipo conservado.
