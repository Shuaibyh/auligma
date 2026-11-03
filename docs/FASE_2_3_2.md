# AULIGMA — Fase 2.3.2: IA local

## Alcance implementado

Integración incremental sobre la rama `fase-1.2`, sin despliegues ni cambios de credenciales. Se conserva el proveedor externo desactivado y la planificación manual. En el cierre controlado se validó PostgreSQL real y se añadió el banco persistente de borradores mediante una migración aditiva. No se recrearon bases. Los resultados históricos siguientes se conservan como antecedentes; el resultado vigente figura en «Cierre controlado».

- `server/ollama.ts`: API oficial `/api/chat`, JSON Schema, `think:false`, contexto 4096, límite de respuesta, timeout, cola de hasta cuatro solicitudes y una inferencia simultánea por proceso. `keep_alive:0` solicita descargar el modelo después de cada inferencia; aumenta la latencia de arranque pero limita memoria retenida.
- Destino fijo `http://127.0.0.1:11434`; se rechazan URLs distintas y redirecciones. Solo se permiten `qwen3:4b` y `qwen3-vl:2b`. No se descargan modelos ni se llama a proveedores de nube.
- `server/ollama-syllabus.ts`: fragmentos de 3500 caracteres, hasta 120000 caracteres; extracción reducida convertida al contrato de revisión existente. Validación de campos, fechas, jerarquía y evidencia literal. Elementos sin evidencia y sus descendientes se descartan con advertencia; si no queda ninguno, se rechaza la propuesta. Todos los elementos comienzan sin seleccionar.
- `server/local-ai-routes.ts`: creación de propuestas privadas en `planning_proposals`, usando el proveedor compatible `configured_ai` y el modelo real. Reutiliza revisión, importación en borrador y publicación separada. Control de propietario, consentimiento local, duplicados simultáneos, desconexión y auditoría sin contenido documental.
- `server/local-exercises.ts`: transcripción de PNG (hasta 2 MB y cuatro millones de píxeles), verificación matemática y preparación de preguntas por tema. Autorización docente y propiedad del aula; rutas bajo los controles existentes de sesión y CSRF.
- `server/math_worker.py`: SymPy en proceso aislado, expresiones de una variable `x`, enteros y operaciones `+ - * / **`. AST validado, sin `eval`, `exec`, `parse_expr` ni `sympify` sobre cadenas. Límites de longitud, profundidad, nodos, exponentes y complejidad; timeout externo de cinco segundos y concurrencia uno por servidor. No es un sandbox del sistema operativo para ejecutar código arbitrario: únicamente admite la gramática descrita.
- `src/components/LocalAiPanel.tsx`: panel desplegable reutilizando estilos y componentes de Geometría razonada. Selección de fuente, consentimiento, procesamiento, cancelación del análisis, transcripción editable, verificación y advertencias. Cambiar expresiones invalida el resultado anterior.

## Inicio local

Ollama debe estar disponible en loopback con los dos modelos ya instalados. No es necesario cambiar `.env` ni las credenciales para iniciar el modo local:

```powershell
npm.cmd run dev:local-ai
```

Este comando carga la configuración existente y establece `AI_PROVIDER=ollama` únicamente cuando no hay un proveedor explícito. En otra terminal, iniciar el frontend con `npm.cmd run dev`. No sobrescribe decisiones de otros proveedores. También puede configurarse explícitamente `AI_PROVIDER=ollama` para los comandos habituales del backend.

`OLLAMA_TIMEOUT_MS` admite 100 a 300000 ms; por defecto 120000 por solicitud, incluido tiempo de cola. El análisis completo del sílabo tiene un límite de diez minutos. `OLLAMA_BASE_URL` solo admite el origen local indicado. Los nombres de modelo están fijados en el adaptador para evitar cargas imprevistas.

SymPy 1.14.0 y mpmath 1.3.0 están instalados en `.venv-math`, excluido de Git. Para reconstruir ese entorno:

```powershell
python -m venv .venv-math
.\.venv-math\Scripts\python.exe -m pip install -r server/requirements-math.txt
```

No cambia el Python global. `MATH_PYTHON` permite seleccionar un intérprete desde configuración administrativa; nunca desde una petición HTTP. En producción, conservar `server/math_worker.py` junto al proyecto y ejecutar desde la raíz. Si falta el intérprete o vence el timeout, el resultado es `INDETERMINADO` y no habilita publicación.

## Rutas nuevas

| Método | Ruta relativa a `/api/v1/classrooms/:id` | Resultado |
|---|---|---|
| POST | `/syllabus/:sourceId/propose-local` | Propuesta privada persistente, requiere `consent:true` |
| POST | `/ai/transcribe` | Transcripción PNG para revisión; no guarda la imagen |
| POST | `/ai/verify` | Verificación simbólica tras `reviewed:true` |
| POST | `/ai/questions` | Propuesta de pregunta, cuatro a ocho alternativas, explicación y dificultad |

El endpoint externo anterior permanece bloqueado; no se reutiliza su consentimiento de envío externo para procesamiento local.

## Mediciones reales del 3 de noviembre de 2026

Hardware consultado: NVIDIA RTX 4050 Laptop, 6141 MiB de VRAM reportados por `nvidia-smi` (no 4 GB). Memoria del sistema: 15929568 KiB totales y 4145972 KiB libres en la medición. La memoria disponible fluctúa.

| Prueba sintética | Resultado | Medición |
|---|---|---|
| Qwen3 4B, derivada de x² | `2x` | 8,77 s total; 8,23 s carga; 34,31 tokens/s |
| Qwen3-VL 2B, imagen generada en memoria | Enunciado y A:2x, B:x, C:0, D:2 reconocidos | 13,33 s total; 6,87 s carga; 86,71 tokens/s |
| Sílabo reducido: Cálculo, una unidad y dos semanas | Tres nodos con evidencia literal y sin selección automática | 12,52 s de extremo a extremo |
| Pregunta sobre potencias | Cuatro alternativas y explicación para la derivada de x⁴ | 15,31 s de extremo a extremo |

Durante visión, `/api/ps` reportó `size=2001133894` y `size_vram=2001133894`, contexto 4096. `nvidia-smi` registró 3109 MiB usados y 91 % de utilización de GPU. Esto acredita la carga visual medida en GPU; no es una garantía de todos los casos. Al finalizar las pruebas, `/api/ps` quedó vacío. No se midió consumo eléctrico fiable ni rendimiento multiusuario.

Todas las muestras fueron sintéticas y la inferencia fue real. No se suministró un sílabo institucional real para esta validación. Scripts reproducibles: `scripts/verify-ollama.ts`, `scripts/verify-local-ai.ts`, `scripts/verify-syllabus-ai.ts` y `scripts/verify-question-draft.ts`, ejecutables con `node --import tsx`.

## Caso matemático crítico

Entrada: `(3*x**2+2*x)/(x+1)`; operación `derivative`. Alternativas A `(3*x**2+6*x+2)/(x+1)**2` y C `3-1/(x+1)**2`.

SymPy confirma ambas mediante identidad racional, conserva la exclusión `x+1 != 0`, devuelve índices `[0,2]` y `singleChoiceValid:false`. La interfaz indica opción única bloqueada. Ningún endpoint de esta fase publica preguntas; `publicationAllowed` permanece en `false`, incluso cuando una comprobación pasa. La futura Fase 2.4 deberá volver a verificar en servidor al publicar, nunca confiar en una bandera del cliente.

Se comprueban producto, cociente y cadena en el alcance racional/polinómico. Expresiones con funciones trigonométricas, radicales, varias variables o sintaxis no admitida devuelven `INDETERMINADO`. Una alternativa con restricciones adicionales no se acepta como equivalente en todo el dominio original. Las alternativas duplicadas se detectan algebraicamente; los casos con dominios distintos requieren revisión. No se usan muestras numéricas como prueba universal.

## Pruebas y problemas encontrados

- Backend: primera ejecución completa con 26 aprobadas y tres omitidas por ausencia deliberada de `DATABASE_TEST_URL`; prueba adicional de autorización/consentimiento aprobada. No se ejecutó la suite contra PostgreSQL existente.
- TypeScript, ESLint y builds de frontend/backend aprobados durante implementación. Persiste la advertencia previa de bundle mayor de 500 kB.
- La primera respuesta visual alcanzó el límite de salida y se rechazó. Una instrucción breve y delimitada permitió transcribir la muestra en las ejecuciones siguientes.
- El esquema completo del editor provocó omisiones de semanas y evidencias incorrectas. Se redujo el esquema de extracción y se mantuvo validación estricta; los campos editoriales se completan en backend.
- Una explicación generada afirmó que no necesitaba verificación adicional. Es contenido no confiable: la interfaz conserva revisión obligatoria y el servidor no autoriza publicación. Revisar siempre la explicación antes de utilizarla.
- La primera corrida de interfaz detectó un selector sin nombre accesible exacto y fixtures antiguos incompletos de `syllabus-sources`; se corrigieron ambos. Las pruebas UI usan identidades y respuestas de sesión sintéticas; el caso matemático invoca SymPy real.

## Verificación de continuidad — 3 de noviembre de 2026

Se recuperaron 30 archivos pendientes (9 modificados y 21 nuevos), sin descartarlos ni cambiar de rama. El remoto de desarrollo coincidía con `060c814` y `main` con `eb71c06`; no había commits locales adicionales ni divergencia en `fase-1.2`.

La nueva ejecución completó 27 pruebas de backend y omitió tres de PostgreSQL de forma explícita. `npm.cmd run test:e2e:local-ai` terminó correctamente con 11 pruebas aprobadas en 53,3 segundos, incluidos 390/768/1440 px, accesibilidad y el caso A/C con SymPy real. El cierre de procesos pendiente de la sesión anterior se completó al ejecutar Playwright con permisos adecuados.

Los archivos candidatos no incluyen `.env`, documentos privados, modelos ni el entorno Python. El respaldo conserva el alcance parcial descrito en Limitaciones; no equivale a declarar terminada toda la fase ni valida la persistencia nueva en PostgreSQL real. No se fusiona `main`.

## Evaluación de Docling y OCR

Evaluación documental, sin instalación de Docling ni descarga de OCR. La documentación oficial distingue los modelos requeridos por PDF y los formatos de Office que no los necesitan. Con unos 4 GiB de RAM libre durante la medición, se conserva la extracción PDF existente y se pospone la cadena PDF/OCR adicional hasta medir un corpus y dependencias en un entorno separado. DOCX continúa admitido como material privado, pero esta fase no incorpora extracción semántica de DOCX.

Referencias: [instalación oficial](https://docling-project.github.io/docling/getting_started/installation/), [FAQ de Docling](https://docling-project.github.io/docling/faq/), [API oficial de Ollama](https://github.com/ollama/ollama/blob/main/docs/api.md), [parsers de SymPy y precauciones](https://docs.sympy.org/latest/modules/parsing.html).

## Cierre controlado — 3 de noviembre de 2026

### PostgreSQL y persistencia

`DATABASE_TEST_URL` ya estaba configurada privadamente. Se comprobó conexión local y `current_database() = 'auligma_test'` antes de migraciones. `server/tests/test-database.ts` hace obligatoria esa comprobación para las suites PostgreSQL; rechaza cualquier otra base, incluida `auligma_dev`. No se imprimieron ni cambiaron contraseñas.

Migración `server/migrations/202611030001_question_drafts.mjs`: crea exclusivamente `question_drafts`, con docente/aula y referencias opcionales a `academic_nodes` y `academic_materials`; contenido JSONB (enunciado, alternativas, respuesta propuesta, explicación, dificultad, tema y expresiones), resultado SymPy, estado de revisión, versión y fechas. No duplica modelos académicos. Aplicada primero en pruebas y después, verificando identidad y única migración pendiente, en `auligma_dev`. No altera filas académicas existentes. La reversión automática está desactivada para evitar borrar borradores.

`server/persistent-questions.ts` implementa estas rutas relativas a `/api/v1/classrooms/:id`:

| Método | Ruta | Alcance |
|---|---|---|
| GET | `/question-drafts?q=&nodeId=` | Hasta 100 borradores recientes, búsqueda literal y filtro por nodo |
| GET | `/question-drafts/:draftId` | Recuperar contenido guardado |
| POST | `/question-drafts` | Guardar nuevo borrador |
| PUT | `/question-drafts/:draftId` | Actualizar con versión esperada; conflicto 409 sin sobrescribir |
| POST | `/question-drafts/:draftId/discard` | Descarte lógico con versión y `confirmed:true`; conserva datos |

Todas exigen docente autorizado y propietario del aula activa. Material y nodo deben pertenecer al aula; si se indica nodo, el material debe corresponder a él. Escritura y auditoría son transaccionales; se bloquean referencias durante la escritura. El estudiante no recibe este banco. El contenido privado no se copia al registro de auditoría.

Cada guardado con `reviewed:true` ejecuta nuevamente SymPy en servidor, no admite resultados de verificación enviados por el cliente. `reviewed` requiere una única alternativa correcta, coincidencia con la respuesta propuesta y explicación no vacía declarada revisada por el docente. A/C equivalentes producen `invalid`; sintaxis no admitida o verificador ocupado/no disponible producen `indeterminate`. El resto queda `draft`. Ningún estado publica exámenes ni certifica semánticamente el texto de la explicación. El límite de un trabajador SymPy es compartido por las rutas del proceso.

### Interfaz y pruebas vigentes

Recorrido: aula → planificación → asistente local → borrador por tema → seleccionar nodo/material → revisar → guardar → consultar. `QuestionDraftBank` permite recuperar después de recargar y editar con versión, buscar, filtrar y descartar con confirmación. Errores de guardado conservan los campos. Se mantienen tokens y componentes de Geometría razonada; la revisión visual corrigió botones estrechos apilándolos en móvil.

| Verificación | Resultado real |
|---|---|
| Backend completo, ejecución secuencial | **32 aprobadas, 0 fallidas, 0 omitidas** |
| Tres casos PostgreSQL antes omitidos | Planificación, matrícula/aislamiento y concurrencia aprobados |
| Banco PostgreSQL + SymPy reales | Escritura confirmada desde otra conexión y sesión, versiones concurrentes 200/409, material/tema, otro docente/aula, descarte lógico, A/C y resultado indeterminado |
| Playwright | **14 aprobadas**, proceso terminado con código 0; sesión y API académica simuladas, SymPy real en los casos de equivalencia |
| Banco UI | Recarga, recuperación y conservación ante error; 390/768/1440 px, Axe claro/oscuro sin infracciones detectadas |
| TypeScript, ESLint, builds frontend/backend | Aprobados; persiste aviso de bundle frontend mayor de 500 kB |
| Ollama | Servicio local disponible; `qwen3:4b` y `qwen3-vl:2b` instalados al cierre |

La suite prueba errores de Ollama, timeout y modelo ausente mediante transporte simulado; no elimina modelos para simular fallos. Las mediciones de inferencia real son las documentadas anteriormente, no se repitieron en este cierre. OAuth usa proveedor/identidades sintéticos: no se afirma una nueva autenticación Google real. Las pruebas de persistencia usan Fastify real y PostgreSQL, no mocks; las de navegador no constituyen un recorrido completo navegador–Google–PostgreSQL–Ollama real.

Comando reproducible backend: `node --env-file-if-exists=.env --import tsx --test --test-concurrency=1 server/tests/*.test.ts`. UI: `npm.cmd run test:e2e:local-ai`. En el primer intento UI los casos terminaron, pero el servidor Vite no cerró dentro del sandbox; se identificó y terminó únicamente ese proceso y la repetición fuera del sandbox finalizó normalmente. Capturas locales no versionadas en `test-results/fase-2-3-2/banco-*-claro.png` y `banco-*-oscuro.png`.

Los fixtures sintéticos se revierten o eliminan por sus UUID únicamente en la base de pruebas verificada. No hubo commits, pushes, cambios de rama, despliegues, descarga de modelos ni modificación de credenciales durante este cierre.

## Corrección del generador local — 3 de noviembre de 2026

El error docente «No se pudo preparar un borrador válido» no conservaba diagnóstico: cualquier excepción de Qwen, transporte o validación terminaba como `question_failed`, y el registro solo mostraba `service_unavailable`. La ejecución exacta de «Regla del cociente / Derivada de funciones racionales / intermedia» demostró además tres defectos del contrato: el modelo podía contradecir `proposedAnswer` en su explicación, omitir la multiplicación explícita o la función completa requerida por SymPy, y producir alternativas duplicadas o algebraicamente ambiguas.

La corrección mantiene Qwen3 4B y el backend existente:

- `OllamaClient` clasifica de forma tipada modelo no disponible, timeout, JSON inválido, salida truncada, cola ocupada y fallo interno. No registra prompts, contenido, cookies ni credenciales.
- El endpoint registra únicamente correlación, etapa, código, modelo, duración e intentos; devuelve mensajes docentes específicos con referencia.
- El esquema exige `expression`, exactamente cuatro alternativas con `uniqueItems`, explicación no vacía e índice 0–3. La expresión y alternativas usan la gramática segura que SymPy admite.
- Solo errores de formato, contrato o comprobación matemática activan un reintento; modelo ausente, timeout y cola no se repiten. El máximo permanece en dos inferencias totales.
- SymPy contrasta la respuesta del modelo. Si el segundo resultado tiene expresión válida pero no forma opción única, reconstruye una alternativa correcta y tres distractores que vuelve a comprobar simbólicamente. Sustituye explicaciones contradictorias por una guía neutral y editable. Esto sigue siendo un borrador con revisión humana y `publicationAllowed:false`.
- La interfaz recibe y completa la expresión original, conserva tema/subtema ante error y evita solicitudes duplicadas mientras procesa.

Aceptación real con Ollama: 56,4 s, dos intentos. Qwen generó `f(x)=(2*x+3)/(x-1)`; SymPy produjo una única respuesta correcta y tres distractores no equivalentes. La explicación final no afirma certeza automática. El caso crítico A/C continúa devolviendo índices `[0,2]` y bloquea opción única en la ruta de verificación; la reconstrucción solo pertenece al generador de nuevos borradores.

`scripts/verify-question-flow.ts` ejecutó además el recorrido HTTP real con Qwen y SymPy contra `auligma_test` en 54,3 s: generación, comprobación de opción única, guardado sin nodo/material, reconexión, recuperación con otra sesión docente, edición a versión 2 y denegación al estudiante. Los fixtures sintéticos se eliminaron por UUID al finalizar y nunca se autorizó publicación.

Regresión vigente: **40 backend aprobadas, 0 fallidas, 0 omitidas** y **15 Playwright aprobadas**. TypeScript, ESLint y builds frontend/backend aprobaron; persiste el aviso conocido de bundle mayor de 500 kB. PostgreSQL real de pruebas confirmó borrador sin nodo/material, reconexión, edición versionada y aislamiento. La prueba de navegador usa API simulada; por restricciones de control del navegador queda pendiente repetir manualmente el guardado con la sesión Google real y confirmar después el registro en `auligma_dev`.

## Limitaciones y siguiente fase

- Los borradores guardados sí persisten en PostgreSQL; las ediciones todavía no guardadas y las transcripciones permanecen en memoria. Guardar antes de salir o recargar. No existe autoguardado offline.
- El banco mantiene la versión vigente y detecta conflictos; no guarda un historial completo recuperable de todas las versiones. El descarte conserva filas, pero no hay interfaz de restauración todavía. La lista tiene límite de 100 y carece de paginación.
- La búsqueda filtra el nodo seleccionado, no todo su subárbol. La vinculación se elige explícitamente en el asistente, no cambia automáticamente con la selección del árbol.
- Solo PNG para visión en esta iteración; convertir fotografías JPEG/WebP a PNG antes de subir. El reconocimiento de escritura manuscrita, diagramas complejos y mala iluminación no está acreditado.
- Los fragmentos no se fusionan semánticamente entre sí: revisar continuidad y duplicados. No se garantiza extracción exhaustiva ni competencias/fechas ausentes.
- La cola es por proceso; no ejecutar varios backends contra la misma GPU. No se afirma soporte concurrente para múltiples docentes. El tiempo en cola y los límites evitan carga ilimitada.
- Antes de Fase 2.4: prueba integral con sesión Google y documentos reales autorizados, historial recuperable, paginación y restauración; validar nuevamente al publicar, ampliar el dominio matemático con pruebas y medir carga multiusuario. Las explicaciones y la correspondencia entre enunciado y expresión requieren juicio docente. La IA nunca sustituye su aprobación.

## Cierre definitivo — 3 de noviembre de 2026

La prueba manual docente confirmó el guardado de la pregunta «Deriva la función f(x) = (2*x + 3)/(x - 1)». Una auditoría posterior de solo lectura en `auligma_dev` encontró exactamente un borrador activo: versión 1, estado `draft`, cuatro alternativas, explicación presente, docente activo, aula `LIMITES` y nodo «regla del cociente». Existe un único evento `question_draft.saved`. El contenido conserva `reviewed:false`, no tiene verificación persistida y la única tabla de preguntas es `question_drafts`; por tanto, no se publicó automáticamente. Usuarios y matrículas permanecieron en dos y una filas, respectivamente.

La recuperación y edición se validaron contra `auligma_test` con Fastify y PostgreSQL reales: una segunda sesión docente recuperó el registro, la actualización pasó de versión 1 a 2, otra conexión leyó la edición y el estudiante recibió 403. Otro docente y otra aula tampoco pueden acceder; los identificadores se comprueban junto con aula y propietario. El caso A/C equivalente continúa bloqueado, un resultado SymPy indeterminado no se acepta como revisado y el analizador matemático no ejecuta Python arbitrario.

Para evitar la confusión observada tras F5, el navegador recuerda únicamente el modo del asistente por aula mediante `sessionStorage`; no guarda contenido académico. Al volver al modo de preguntas, el panel se abre, consulta automáticamente el banco y muestra los borradores sin regenerarlos. Los cambios del editor sin guardar muestran un aviso y activan la protección nativa antes de recargar o salir.

Regresión final: **40 pruebas backend aprobadas**, **15 Playwright aprobadas**, TypeScript, ESLint, builds frontend/backend y `git diff --check` correctos. Playwright cubrió 390, 768 y 1440 px y Axe sin infracciones en el flujo del banco. Fastify, Vite y Ollama respondieron 200; `qwen3:4b` y `qwen3-vl:2b` estaban disponibles. OAuth se regresionó con proveedor e identidades sintéticos: el inicio Google real corresponde a la validación manual informada por el docente, no a una automatización de esta ejecución.

No se modificaron credenciales, perfiles, matrículas ni el borrador real. No hubo commits, push, despliegue, cambio de rama, descarga de modelos ni uso de servicios externos.
