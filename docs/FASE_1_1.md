# AULIGMA — Fase 1.1: refinamiento profesional UI/UX

## Alcance

Se conserva React, TypeScript, Vite, Tailwind, React Router, Radix Dialog, Lucide y KaTeX. No se añadieron dependencias. Manrope, Source Serif 4 y los tokens aprobados mantienen la identidad «Geometría razonada». Las Skills de producto, diseño frontend y pautas web orientaron los flujos, la composición y las verificaciones; sus archivos no se modificaron.

## Espacio docente

- Dashboard: aulas en primer plano, retirada de la ilustración dominante y de frases repetidas, pendientes de preguntas/evaluaciones y accesos directos al trabajo académico.
- Aulas: metadatos de sección, semestre y turno más legibles. El detalle enlaza al banco y a evaluaciones manteniendo el aula de destino en la URL. El importador de esta entrega fue sustituido por la lectura local documentada en Fase 1.2.
- Banco: listado de cuatro preguntas sintéticas; búsqueda y filtros de tema/estado sincronizados con la URL; estado vacío recuperable. Detalle y edición de enunciado, fórmula, alternativas, respuesta, regla, pasos, explicaciones de error y recomendación.
- Revisión: editar invalida el estado Revisada. Para recuperarlo se exige reconocimiento explícito de revisión manual, campos completos, alternativas distintas y sintaxis LaTeX válida. Esta comprobación sintáctica no valida el razonamiento matemático.
- Evaluaciones: listado propio, creación, título, aula, modalidad, preguntas, apertura/cierre, intentos e instrucciones. Los cambios se conservan en memoria al navegar. Estados Borrador → Pendiente de revisión → Publicada.
- Publicación: requiere título, aula existente, preguntas revisadas, fechas completas con cierre posterior, reglas y confirmación. Fase 1.2 añadió intentos ilimitados o un máximo positivo. Cada publicación conserva una copia de las preguntas para aislarla de ediciones posteriores.

## Espacio estudiante

- Inicio: actividades con curso, sección y semestre; estados Pendiente, En progreso y Completada derivados de respuestas locales. Se priorizan actividades en progreso, después pendientes y finalmente completadas.
- Las prácticas publicadas por el docente aparecen en el perfil ficticio. Se usa el mismo contenido publicado; el banco editable no altera las respuestas de una actividad ya publicada.
- Concentración: oculta la navegación lateral y el pie, conserva salida a actividades, cambio de tema y botón para recuperar la navegación completa. Fórmulas ampliadas y progreso visible.
- Respuestas y preguntas comprobadas se conservan por actividad en la pestaña mediante `sessionStorage`. La navegación entre preguntas utiliza la URL. Hay respaldo en memoria y aviso si el navegador bloquea el almacenamiento. Reiniciar exige confirmación y afecta solo a esa actividad.
- Retroalimentación: resultado explícito, regla, tres pasos preparados, error específico por alternativa incorrecta y recomendación breve. No se presenta IA ni verificación automática de procedimientos.
- Progreso: intentadas, aciertos, errores, respuestas sin comprobar y avance por tema. Las recomendaciones usan reglas deterministas: priorizar errores, luego pendientes y, por último, repaso del procedimiento correcto. Se distingue explícitamente de calificaciones oficiales y de mediciones de dominio.

## Comprobación manual de los ejemplos

1. Derivada: para f(x) = x³ − 3x + 2, linealidad y potencia dan f′(x) = 3x² − 3. La constante deriva a cero. Distractores: conservar la constante, omitir el coeficiente o reducir incorrectamente el exponente.
2. Límite: x² + 1 es continuo en 2; la sustitución da 2² + 1 = 5. Distractores: no elevar al cuadrado, omitir la constante o sumar incorrectamente.
3. Primitiva: ∫2x dx = x² + C. La comprobación por derivación devuelve 2x. Distractores: omitir la división por el exponente nuevo, derivar en lugar de integrar o conservar el exponente.

La cuarta pregunta del banco reutiliza la derivada como material pendiente de revisión. Las ediciones del usuario necesitan su propia revisión manual antes de publicarse.

## Verificación

Los scripts son `npm.cmd run build`, `npm.cmd run typecheck`, `npm.cmd run lint` y `npm.cmd run test:e2e`.

Resultado final: build, TypeScript y lint completados correctamente; **14 de 14 pruebas aprobadas** en Chrome (1,7 minutos). Las comprobaciones automatizadas de accesibilidad y desbordamiento de las pantallas cubiertas no detectaron infracciones. Se generaron las 54 capturas previstas y se inspeccionaron vistas de escritorio y móvil, incluidos el formulario oscuro de evaluación y la retroalimentación móvil. Esto no equivale a una certificación de accesibilidad.

La suite original comprueba aulas, importación, revisión documental, práctica y teclado. La suite `tests/refinement.spec.ts` añade el recorrido Dashboard → Aula → Banco → Evaluación → Publicación; bloqueo por revisión inválida; y Mis actividades → Resolver → Retroalimentación → Mi progreso, incluida recuperación tras recargar.

Las pruebas visuales cubren 390, 768 y 1440 px en claro y oscuro para nueve pantallas. Incluyen axe con reglas WCAG A/AA hasta 2.2, comprobación de desbordamiento horizontal y 54 capturas en `test-results/fase-1-1/`. Las capturas se regeneran al ejecutar la suite y están excluidas de Git. Se inspeccionan imágenes reales de Chrome, no maquetas.

## Límites

- No hay backend, autenticación, base de datos, IA, lectura real de Excel/PDF ni calificaciones productivas.
- Fechas e intentos se validan como configuración, pero no restringen el acceso a prácticas de demostración. La modalidad Evaluación se configura y publica como muestra, sin iniciar un examen estudiantil.
- El perfil estudiantil ficticio incluye todas las aulas de muestra, sin matrícula ni permisos reales.
- Configuración docente y publicaciones nuevas viven en memoria: recargar las restablece. Las respuestas de una publicación nueva pueden permanecer en la pestaña, pero la actividad deja de estar disponible tras ese reinicio.
- No se afirma certificación WCAG. Quedan pendientes lector de pantalla real, zoom de navegador al 200 %, dispositivos físicos y Safari/Firefox.
- El cierre de esta fase no incluye despliegues y no se avanzó a Fase 2. Su respaldo estable se realiza en el repositorio privado del proyecto.
