# AULIGMA — Fase 2.3.2: IA local

## Alcance implementado

Integración incremental sobre la rama `fase-1.2`, sin despliegues ni cambios de credenciales. Se conserva el proveedor externo desactivado y la planificación manual. No se ejecutaron migraciones ni se recreó PostgreSQL. Tras la interrupción, el usuario autorizó respaldar estos avances en la rama de desarrollo; esta fase sigue pendiente de validación integral con una base de pruebas dedicada.

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

## Limitaciones y siguiente fase

- El sílabo usa la persistencia existente; la integración transaccional nueva requiere QA con una base de pruebas dedicada antes de declararse verificada con PostgreSQL real.
- Transcripciones y preguntas permanecen en memoria del formulario; no existe aún banco persistente real de preguntas ni publicación/calificación de Fase 2.4. No recargar antes de conservar manualmente el contenido útil.
- Solo PNG para visión en esta iteración; convertir fotografías JPEG/WebP a PNG antes de subir. El reconocimiento de escritura manuscrita, diagramas complejos y mala iluminación no está acreditado.
- Los fragmentos no se fusionan semánticamente entre sí: revisar continuidad y duplicados. No se garantiza extracción exhaustiva ni competencias/fechas ausentes.
- La cola es por proceso; no ejecutar varios backends contra la misma GPU. No se afirma soporte concurrente para múltiples docentes. El tiempo en cola y los límites evitan carga ilimitada.
- Antes de Fase 2.4: persistir preguntas y sus versiones, vincular temas/materiales, validar nuevamente en publicación, ampliar el dominio matemático con pruebas y medir documentos reales autorizados. La IA nunca sustituye la aprobación del docente.
