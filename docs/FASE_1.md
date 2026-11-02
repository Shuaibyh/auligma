# AULIGMA — Entrega de Fase 1

## Experiencias implementadas

- Bienvenida editorial con construcción geométrica original, marca provisional y elección de perfil simulado.
- Inicio docente con aulas, tareas de revisión y accesos a los flujos principales.
- Aulas: búsqueda, creación mediante diálogo Radix, validación, sección, periodo y turno. Vista vacía y listado de participantes.
- Importación: el prototipo inicial solo utilizó una muestra; Fase 1.2 lo sustituyó por lectura local de `.xlsx`/`.csv`, revisión de roles e incorporación de filas seleccionadas.
- Revisión: documento sintético junto a transcripción editable, vista matemática, control de sintaxis LaTeX y margen Extraído → Verificado → Aprobado. Todos los estados son simulados. Editar reinicia la revisión y aprobar requiere confirmación.
- Portal estudiantil independiente: actividad, tres preguntas, respuestas, navegación con parámetro de URL, explicaciones preparadas, progreso y reinicio.
- Banco de preguntas, evaluaciones, informes, ayuda y ajustes: pantallas navegables con contenido demostrativo. No constituyen editores ni informes productivos.
- Tema claro y oscuro, fuentes locales, estados vacíos, errores, cargas, foco y controles deshabilitados según el flujo.

## Decisiones de implementación

React, TypeScript, Vite, Tailwind, React Router, Lucide, KaTeX y Radix Dialog. Las versiones exactas están fijadas en `package.json` y `package-lock.json`. El estado vive en un contexto tipado; recargar reinicia la demostración. No hay almacenamiento persistente ni conexiones de aplicación con servicios externos.

Manrope se utiliza en controles y contenido; Source Serif 4 en aperturas y títulos seleccionados. Los tokens conservan marfil frío, tinta, cobalto y verde mineral. El verde de texto pequeño tiene una variante más oscura para contraste. El renderizador matemático y la revisión documental se cargan en módulos separados.

Las Skills `auligma-ui-ux`, `frontend-design` y `web-design-guidelines` guiaron, respectivamente, los recorridos educativos, la composición editorial y las revisiones de accesibilidad e interacción. No se modificaron sus archivos.

## Verificación y límites

La instalación se completó y npm informó cero vulnerabilidades. Build, TypeScript y lint finalizaron correctamente. La suite de Playwright finalizó con **7 pruebas aprobadas**, cubriendo creación e importación, revisión, práctica, navegación, teclado y las tres anchuras. Axe no encontró infracciones en los estados comprobados con etiquetas WCAG A/AA hasta 2.2. Estas pruebas se ejecutaron en Google Chrome.

Se capturan bienvenida, dashboard, aulas, importación en revisión, documento y transcripción, portal estudiantil y práctica en 390, 768 y 1440 px. También se captura la práctica en oscuro. Las imágenes se guardan en `test-results/visual/`; una nueva ejecución las regenera.

Correcciones durante la verificación: contraste del texto de la ilustración, verde textual, escala auxiliar, acceso por teclado a tablas desplazables y separación de opciones de navegación móvil. La medición de contraste espera a que terminen las transiciones para medir el estado estable.

Las pruebas automáticas y la inspección de capturas no constituyen una certificación WCAG 2.2 AA. Pendientes: revisión con lector de pantalla real, zoom de navegador al 200 %, Safari/Firefox y dispositivos físicos. No se evaluó procesamiento real de Excel/PDF, precisión de IA ni integraciones porque no existen en esta fase.

## Próxima revisión

Validar los recorridos con docentes y estudiantes; decidir el alcance del editor completo de evaluaciones y los requisitos de persistencia antes de otra fase. Esta entrega no implementa backend ni autentificación real y no se ha publicado ni enviado a GitHub.
