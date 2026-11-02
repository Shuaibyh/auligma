# AULIGMA — Geometría razonada · Sistema de diseño aprobado

> Identidad aprobada para la Fase 1. Dirección editorial académica premium con precisión de laboratorio. La aprobación visual no equivale a una certificación de accesibilidad; las verificaciones se documentan en `docs/FASE_1.md` (ruta desde la raíz).

## 1. Posicionamiento

**Producto:** AULIGMA, plataforma educativa inteligente para la gestión de aulas universitarias, generación asistida de evaluaciones matemáticas mediante IA, verificación de procedimientos y reforzamiento del aprendizaje.

**Personalidad:** académico serio + producto tecnológico contemporáneo. Sobrio, elegante, amable, muy legible. Evitar estética infantil, glows masivos, gradientes exagerados y dashboards saturados.

**Públicos:** docentes universitarios y estudiantes con acceso individual. Objetivos principales: ahorrar tiempo al preparar actividades, facilitar la práctica matemática y ofrecer datos pedagógicos útiles.

**Principio rector:** primero claridad y confianza; después atractivo visual. La experiencia debería sentirse de nivel producto, no de plantilla genérica.

## 2. Diseño aprobado

### Colores semánticos

| Token | Claro (propuesto) | Oscuro (propuesto) | Uso |
|---|---|---|---|
| `--background` | `#F6F7F3` | `#0B1422` | Fondo general |
| `--surface` | `#FFFFFF` | `#131F30` | Paneles/tarjetas |
| `--text` | `#142238` | `#EAF0F6` | Texto principal |
| `--muted` | `#596574` | `#B0BDCB` | Metadatos |
| `--primary` | `#3558D8` | `#9CB4FF` | Acción principal |
| `--accent` | `#087D76` | `#69D6C9` | Datos y éxito |
| `--border` | `#DCE1DC` | `#304154` | Divisores |
| `--warning` | `#85520A` | `#F2C578` | Revisión |
| `--danger` | `#B0243C` | `#FF9CAE` | Error |

Tokens centralizados en `src/styles.css`. El primario oscuro usa tinta oscura como texto del botón. Validar contraste por combinación y estado.

### Tipografía

- Manrope para contenido, navegación, tablas y controles; alojada localmente.
- Source Serif 4 para títulos de página, bienvenida y acentos editoriales; uso selectivo, alojada localmente.
- KaTeX para expresiones matemáticas. Nunca rasterizar fórmulas como imágenes para el contenido central.
- Fallback: `system-ui, sans-serif`.
- Escala: bienvenida 48–80px según ancho, h1 32–44px, secciones 20–28px, cuerpo 16px, soporte 14px, metadatos secundarios 12px.
- Interlineado: cuerpo 1.5–1.6; títulos 1.15–1.25. Prohibido usar texto diminuto para ahorrar espacio.

### Retícula y espaciados

- Unidad base de 4px; espaciados preferentes: 8, 12, 16, 24, 32, 48.
- Sidebar de escritorio: ~248px; ancho de contenido máximo recomendado: 1360px.
- Separación entre secciones: 24–32px; entre tarjetas: 16–24px.
- Radius: controles 10px, tarjetas 16px, modales 18px; sombras discretas.
- Bordes y estados coherentes, sin cajas innecesarias para cada oración.
- Tamaño táctil objetivo cercano o superior a 44×44 px para controles importantes.

### Accesibilidad y movimiento

- Objetivo WCAG 2.2 AA en pantallas clave.
- Focus visible, navegación por teclado, nombres accesibles y estados de error asociados al campo.
- Diseño comprobado a 390, 768 y 1440px; mantener zoom 200% sin pérdida crítica.
- Respeto a `prefers-reduced-motion`; animaciones funcionales de baja duración, nunca imprescindibles.
- No depender únicamente del color para diferenciar aciertos o fallos.

## 3. Navegación

### Docente
`Inicio · Mis aulas · Banco de preguntas · Evaluaciones · Informes · Ajustes`

En una aula: `Resumen · Estudiantes · Materiales · Evaluaciones · Resultados`

### Estudiante
`Mis actividades · Practicar · Mi progreso · Ayuda`

No mostrar a estudiantes páginas de docentes ni información individual de compañeros.

## 4. Pantallas críticas a diseñar ANTES del backend completo

1. **Dashboard docente**: resumen realista sin cifras inventadas; pendientes y acción principal "Crear aula".
2. **Crear aula**: asignatura / periodo / sección / turno / reglas; creación en pocos pasos.
3. **Importador Excel Moodle**: archivo -> revisión de estudiantes -> confirmación. Detectar encabezados y roles automáticamente; mostrar la correspondencia de columnas solo cuando requiera corrección.
4. **Procesar PDF**: documento original a la izquierda; ejercicios identificados y transcripción editable a la derecha (diseño apilado en móvil).
5. **Editor de evaluación**: alternativas, indicador de verificación matemática, distractores, explicación y aprobación del docente.
6. **Portal estudiante**: acceso personal, lista de actividades con estado y fecha.
7. **Resolución matemática**: lectura clara de fórmula, alternativas accesibles, navegación y progreso; nunca mostrar la solución antes del momento permitido.
8. **Resultados y reforzamiento**: errores comunes con acceso a ejercicios recomendados; no atribuir mejoras causales sin pruebas.

## 5. UI kit

Componentes prioritarios: AppShell, Sidebar, MobileNav, PageHeader, Breadcrumbs, Buttons, Input, Select, Combobox, UploadDropzone, DataTable, EmptyState, ValidationAlert, ReviewBadge, MathBlock, QuestionCard, ProgressIndicator, Dialog, Toast y ChartPanel.

La implementación debe usar tokens centralizados. Evaluar `shadcn/ui` por accesibilidad y velocidad, personalizando el sistema visual en lugar de conservar el estilo predeterminado.

## 6. Flujo específico de IA

El resultado de un modelo de IA se considera **borrador**. Exigir tres estados claros:

- `Extraído`: contenido detectado y sin validar.
- `Verificado`: en el producto futuro, expresión y resultado comprobados en el alcance matemático admitido.
- `Aprobado`: en el producto futuro, revisado por docente y apto para publicar.

En Fase 1 los tres estados son explícitamente **simulados**. No certifican corrección matemática ni publican contenido. Editar la transcripción restablece el estado a Extraído. El margen de verificación hace visible esta secuencia junto al ejercicio.

Errores de OCR o soluciones no verificables deben mostrar corrección manual y evidencia de procedencia. La presentación debe inspirar confianza sin simular certeza.

## 7. Evidencias visuales y calidad

Antes de aprobar una fase visual, solicitar a Codex:

- Captura real de al menos: dashboard docente desktop, importador Excel desktop, editor PDF desktop y evaluación estudiante móvil.
- Revisión responsive 390/768/1440px y test de teclado.
- Comprobación de accesibilidad con herramientas disponibles y revisión manual.
- Lista de problemas detectados y correcciones realizadas.
- Confirmación de build, typecheck, lint y pruebas UI.

Si Codex carece de navegador, deberá informar limitación y **no inventar capturas**.

## 8. Alcance de primera iteración

Solo diseñar el sistema de diseño, UI kit y prototipos navegables de los cuatro flujos críticos. No construir toda la plataforma, ni cuentas reales, ni integración IA, ni persistencia en esta fase. Se revisará antes de implementar backend.

## 9. Refinamiento de Fase 1.1

Se conserva la identidad aprobada. El dashboard prioriza aulas y pendientes, y reduce ilustraciones y frases ornamentales. Banco y evaluaciones tienen flujos propios, conectados desde el aula. La práctica dispone de modo concentración, explicaciones preparadas paso a paso y conservación local de respuestas por pestaña. La tipografía funcional secundaria se ajusta a 14 px; los metadatos pueden usar 12 px. Los ajustes están en `src/refinements.css`, sobre los tokens originales. Alcance y verificación: `docs/FASE_1_1.md` (rutas desde la raíz).

## 10. Correcciones de Fase 1.2

El alcance vigente conserva exclusivamente Docente y Estudiante. Las aulas usan asignatura, periodo, sección y turno. La matrícula admite alta manual y lectura local de `.xlsx`/`.csv`; los casos ambiguos requieren confirmación. El banco pertenece explícitamente a cada aula y las evaluaciones no pueden mezclar preguntas de aulas distintas. La vista previa estudiantil permanece dentro del shell Docente. El movimiento funcional usa 140–240 ms, `opacity`/`transform` y respeta `prefers-reduced-motion`. Alcance y verificación: `docs/FASE_1_2.md`.

El acceso de demostración sustituye la elección directa de perfil por un formulario editorial de Usuario y Contraseña. Conserva la construcción geométrica y comunica su carácter temporal mediante una nota secundaria. Las credenciales no aparecen en la interfaz. Google solo muestra un estado accesible de indisponibilidad, sin OAuth, redirección ni sesión. La sesión local nunca debe confundirse con autenticación institucional.
