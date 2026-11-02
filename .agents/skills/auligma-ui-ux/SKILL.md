---
name: auligma-ui-ux
description: Diseñar, implementar y auditar UI/UX profesional para AULIGMA, plataforma educativa inteligente para la gestión de aulas universitarias, generación asistida de evaluaciones matemáticas mediante IA, verificación de procedimientos y reforzamiento del aprendizaje. Usar al crear o revisar pantallas, componentes, estilos o flujos de AULIGMA.
---

# AULIGMA UI/UX — Skill local de producto

## Misión
Construir una experiencia universitaria moderna, sobria, memorable, accesible, con alta calidad visual y claridad pedagógica. Evitar dashboards genéricos, elementos ornamentales sin función, interfaces abarrotadas o estilos inconsistentes. No afirmar que Figma o capturas han sido inspeccionados si no ocurrió.

## Antes de diseñar
1. Leer `docs/UI_UX_SISTEMA_DISENO.md` y documentos de arquitectura/requisitos relevantes.
2. Identificar actor, tarea, información mínima necesaria, pantalla anterior y siguiente.
3. Definir layout y estados: vacío, cargando, éxito, error, permiso denegado, móvil y escritorio.
4. Diseñar un flujo completo primero (ej. docente: crear aula -> importar nómina -> revisar -> confirmar; o PDF -> extracción -> revisión -> publicación), no 20 pantallas aisladas.
5. Priorizar jerarquía visual, tipografía y espaciado antes de animaciones o decoraciones.

## Sistema visual obligatorio
- Interfaz en español claro, con terminología consistente entre aula, asignatura, sección, semestre, turno y evaluación.
- Usar tokens semánticos para color, escala tipográfica, spacing, elevación y radios; no colores hexadecimales repetidos en componentes.
- Elegir tipografías licenciadas y disponibles, con alternativas de sistema; fórmulas matemáticas con KaTeX (no imitar matemáticas con texto plano).
- Base de texto 16 px; texto secundario 14 px; textos pequeños 12 px solo en metadatos de baja prioridad; títulos desde 24–36 px según contexto.
- Distribución desktop: sidebar estable, encabezado contextual, contenido con ancho cómodo; mobile: navegación accesible sin dependencia de hover.
- Mantener contraste legible (objetivo WCAG AA), foco visible, accesibilidad teclado, objetivos táctiles apropiados y soporte `prefers-reduced-motion`.
- Gráficas siempre con unidades, títulos, leyendas y estados sin datos. Nunca confundir calificaciones/estadísticas de demostración con datos reales.
- Acciones destructivas con confirmación; nunca matricular o publicar evaluaciones sin revisión del docente.

## Componentes y flujos prioritarios
1. Inicio docente: aulas, resumen de actividad, pendientes de revisión, llamadas a la acción claras.
2. Creación de aula: asignatura, semestre, sección y turno.
3. Importación de participantes: mapa de columnas, vista previa de filas, roles dudosos para revisión, duplicados, confirmación explícita.
4. Conversión de PDF: vista del documento junto al ejercicio interpretado, confianza/observaciones y corrección manual; no publicación automática.
5. Editor de evaluación: distractores, respuesta validada, explicación paso a paso, estados de revisión y publicación.
6. Portal estudiante: acceso individual, lista de actividades, evaluación de opción múltiple, pistas controladas y retroalimentación según políticas del docente.
7. Analítica: errores frecuentes, progreso, cohortes sin exposición indebida de datos privados.

## Flujo de trabajo
1. Producir una propuesta de diseño con referencias y decisiones explícitas antes de implementar.
2. Implementar componentes reutilizables en React + TypeScript; usar Tailwind/shadcn/ui cuando realmente beneficie al producto.
3. Separar contenido demo/sintético de datos reales. No utilizar datos personales importados para ejemplos públicos.
4. Realizar revisión visual mediante navegador y capturas comparables, cuando esté disponible.
5. Revisar al menos anchos 390px, 768px, 1440px; probar teclado, carga, errores y formularios.
6. Documentar discrepancias y corregirlas. Nunca declarar 'perfecto' sin revisión real.

## Criterio de entrega por pantalla
- Objetivo principal evidente en menos de 5 segundos.
- Tipografía legible con 200 % de zoom, sin información cortada.
- Alineación y separación consistentes, sin scroll horizontal no intencional.
- Estados de hover, focus, disabled, loading, empty y error donde corresponda.
- Contrastes correctos y validaciones comprensibles.
- Datos sensibles protegidos, roles autorizados.
- Resultado visual revisado en desktop y móvil, y documentación del QA.

## Restricciones
No desarrollar todo el producto en una sola fase. No sacrificar precisión matemática ni protección de datos por estética. No utilizar recursos, logos o imágenes institucionales si no existe autorización.
