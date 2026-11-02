# AULIGMA — Fase 1.2: corrección integral de flujos

## Problemas y causas encontradas

La Fase 1.1 representaba estudiantes como cadenas y guardaba metadatos ajenos al alcance en cada aula. El importador ignoraba el contenido del archivo y siempre mostraba una muestra fija. El banco era global porque `Question` no tenía una relación con `Classroom`; por ello el editor de evaluaciones recorría todas las preguntas. Los intentos eran un número limitado artificialmente a 5. La vista de práctica enlazaba desde el editor a `/estudiante`, de modo que la navegación parecía cambiar de identidad.

## Modelo y flujos corregidos

- `Student` dispone de identificador local, código institucional opcional, nombres, apellidos y correo opcional.
- `Question.classroomId` establece la pertenencia académica. Tema y aula son relaciones independientes.
- `Assessment.attemptPolicy` es una unión discriminada: `{ mode: "unlimited" }` o `{ mode: "limited", maxAttempts }`.
- Las aulas conservan asignatura, periodo, sección y turno.
- La vista previa se sirve en `/docente/evaluaciones/:id/previsualizar`, dentro del shell docente y sin estado de respuestas.

## Importador Excel

`read-excel-file` 9.3.12 lee `.xlsx` localmente en el navegador y enumera sus hojas. Se eligió por su API específica de lectura, licencia MIT, publicación reciente y ausencia de vulnerabilidades conocidas al instalar. No ejecuta macros ni envía el archivo. `.csv` se procesa con un parser local que contempla comas, punto y coma, tabulaciones y campos entre comillas. El formato binario `.xls` no se interpreta: la interfaz explica cómo convertirlo.

El flujo tiene 3 pasos visibles:

1. Seleccionar un archivo real o activar expresamente el archivo de demostración.
2. Revisar estudiantes, incidencias, exclusiones y correcciones. La correspondencia de columnas solo se abre si el docente necesita corregirla.
3. Confirmar el resumen y volver al aula.

Se detectan encabezados entre las primeras 20 filas, con normalización de mayúsculas, tildes y separadores. Se reconocen código, nombre completo, nombres, apellidos, correo y rol. El identificador institucional o correo permite detectar duplicados; si no existe ninguno, se crea un UUID local y el registro requiere confirmación. Un rol inequívoco de estudiante se propone para importar; otros roles se excluyen y los roles vacíos o ambiguos requieren selección explícita.

Estados: Listo para importar, Duplicado, Datos incompletos, Participante por confirmar y Excluido. Límite: 5 MB y 2000 filas. Los datos solo viven en memoria y nunca se escriben en consola, informes o Git.

## Matrícula manual

Dentro del aula, «Agregar estudiante» solicita únicamente código opcional, nombres, apellidos y correo opcional. Valida campos, correo y coincidencias por código, correo o nombre. Editar actualiza de inmediato la matrícula local. Retirar exige confirmación y no elimina ninguna cuenta real porque todavía no existe autenticación.

## Banco por aula y tema

El banco conserva el aula en la URL. Un aula nueva comienza vacía y ofrece «Crear primera pregunta». El formulario permite aula, tema, enunciado, LaTeX opcional con vista previa, entre 2 y 6 alternativas, una única respuesta correcta, regla, 3 pasos y retroalimentación opcional. Guardar deja la pregunta Pendiente de revisión; una confirmación independiente permite marcarla Revisada. Editar invalida la revisión y eliminar exige confirmación.

Las preguntas iniciales pertenecen explícitamente a Cálculo diferencial y tratan derivadas. No se copian a aulas nuevas. Una evaluación filtra el banco mediante `classroomId`; cambiar de aula retira cualquier selección incompatible.

## Intentos y perfiles

El editor ofrece tarjetas de selección para intentos ilimitados o un máximo entero positivo. Cambiar a ilimitados no usa números centinela. El consumo real de intentos no se aplica todavía porque requeriría persistencia e identidad productiva; guardar un borrador nunca consume intentos.

AULIGMA mantiene solo Docente y Estudiante. Crear aulas, importar, editar preguntas, publicar y previsualizar permanecen bajo `data-profile="docente"`. La previsualización no usa `sessionStorage`, no modifica progreso y muestra «Volver al editor docente».

Cada rol dispone de «Mi perfil». Nombres, apellidos, teléfono, fotografía local y los datos permitidos por rol se editan en memoria; correo, código e identificadores se muestran como protegidos. El catálogo estudiantil centraliza exactamente las 6 escuelas profesionales indicadas. Se advierte antes de abandonar o descartar cambios pendientes. La fotografía no sale del navegador y se pierde al recargar.

## Login local de demostración

`src/auth/demoAuth.tsx` aísla exactamente 2 cuentas sintéticas: `docente / 1234` y `alumno / 1234`. `AuthContext` expone identidad, rol, estado, login y logout; no contiene datos académicos. `sessionStorage` conserva únicamente el identificador `demo-teacher` o `demo-student`, nunca la contraseña. El formulario `/login` valida campos, permite mostrar u ocultar la contraseña y funciona con Enter. Las credenciales no se muestran, sugieren ni autocompletan en la interfaz.

«Continuar con Google» es pulsable, pero solo publica un mensaje accesible indicando que el método no está habilitado. No abre ventanas, no modifica el formulario, no redirige y no crea una sesión.

Sin sesión, las rutas privadas redirigen al login. Una cuenta Docente no puede abrir el shell Estudiante y una cuenta Estudiante no puede abrir herramientas Docente; una URL incompatible vuelve al dashboard del rol activo sin modificar la identidad. La previsualización estudiantil de una evaluación continúa dentro de `/docente` y no crea respuestas. Cerrar sesión elimina el identificador temporal y vuelve a `/login`.

Esta barrera solo organiza el prototipo. El código y las credenciales están en el navegador, por lo que no protegen información real. La sustitución prevista está documentada en `docs/FASE_2_0.md`.

## Configuración y archivado de aulas

El docente puede corregir asignatura, periodo, sección y turno sin recrear la matrícula. Archivar exige escribir el nombre exacto y aceptar una confirmación explícita. El aula desaparece de las activas, permanece en una lista recuperable y puede restaurarse conservando estudiantes, preguntas y evaluaciones de la sesión. No existe eliminación definitiva: identidad reciente, auditoría y retención necesitan backend.

## Matriz de requisitos

| Requisito | Estado |
|---|---|
| Sin grupos y solo Docente/Estudiante | Implementado |
| Excel/CSV real, matrícula manual, banco por aula e intentos tipados | Implementado |
| Perfiles locales y archivado recuperable | Implementado en frontend demostrativo |
| Login local, recuperación temporal y separación de rutas | Implementado exclusivamente como DEMO |
| Cuenta única, vinculación de matrículas y permisos | Pendiente de backend |
| OTP/OIDC, autorización docente y correo institucional | Diseñado, no implementado |
| PostgreSQL, API, auditoría y retención | Diseñado en `docs/FASE_2_0.md`, no implementado |

## Movimiento e interfaz

Rutas y paneles entran con opacidad y traslación de 180–220 ms; controles conservan transiciones de 160 ms. Modales, errores y éxitos tienen movimientos breves e interrumpibles. Todo se desactiva con `prefers-reduced-motion`. Se conservaron Manrope, Source Serif 4, KaTeX, los tokens cobalto/mineral, ambos temas y la estructura de navegación.

## Pruebas

La suite genera durante la ejecución un `.xlsx` sintético mediante `write-excel-file`, lo carga por el input real y comprueba encabezados, filas, roles, duplicados, confirmación e incorporación. También cubre:

- LOGARITMOS, periodo 2026-II, sección B1 y turno Tarde.
- Matrícula manual, edición y retiro.
- Banco vacío, creación, revisión y aislamiento entre aulas.
- Intentos ilimitados y validación del máximo específico.
- Publicación y vista previa sin cambio de perfil.
- Conservación de respuestas de práctica y revisión documental.
- Movimiento reducido y diálogo por teclado.
- 390, 768 y 1440 px, claro y oscuro, desbordamiento y axe WCAG 2.2 A/AA.

Resultado final: 24 pruebas superadas. La revisión visual produjo 78 capturas (12 rutas internas y el login, 3 anchos y 2 temas) en `test-results/fase-1-2/`; estos artefactos están excluidos de Git. En las rutas cubiertas no se detectaron desbordamientos de página ni infracciones automáticas de axe para WCAG 2.2 A/AA.

## Limitaciones

- No hay backend, base de datos, autenticación productiva, Moodle conectado, IA ni calificaciones productivas.
- El login DEMO es código cliente con credenciales visibles y no ofrece seguridad. No debe proteger ni procesar datos reales.
- Matrículas, preguntas nuevas y evaluaciones se pierden al recargar.
- `.xls` requiere conversión previa; `.xlsx` y `.csv` sí se leen localmente.
- El prototipo no consume ni bloquea intentos entre dispositivos o sesiones.
- La revisión de una pregunta es confirmación docente; no existe motor de demostración matemática.
- La comprobación automatizada no equivale a certificación WCAG. Quedan pendientes lector de pantalla real, zoom manual al 200 %, dispositivos físicos y Safari/Firefox.
- No se realizaron commits, pushes ni despliegues y no se avanzó a Fase 2.
