# AULIGMA — Fase 2.3.1

## Implementado

### Duplicación docente

- Acceso desde `Planificación → Opciones`.
- Lista exclusiva de aulas activas administradas por el docente autenticado.
- Destino con asignatura, sección, periodo y turno.
- Vista previa de contenidos, matrículas, resultados y estado final.
- Conflicto explícito cuando el destino ya tiene planificación.
- Confirmación única mediante la API existente; la restricción única de PostgreSQL también impide duplicados concurrentes.
- La copia permanece en borrador y no copia matrículas, permisos, notas ni resultados.

### Protección de cambios

- Estado visible «Cambios sin guardar».
- Confirmación al cambiar de elemento o seguir un enlace interno.
- Acciones: seguir editando, descartar, guardar y continuar.
- Aviso nativo del navegador al recargar o cerrar la pestaña.
- Los errores de guardado conservan el estado pendiente.
- Una respuesta de guardado tardía no reemplaza una edición más reciente: se compara la versión local enviada antes de recargar datos.

### Revisión de sílabos

- Comparación entre el texto extraído y una propuesta editable.
- Propuesta manual persistente cuando no existe proveedor de IA.
- Edición de tipo, título, contenedor, página, evidencia, inclusión y orden.
- Agregación y eliminación de ramas completas.
- Guardado como borrador, descarte y vista previa de impacto.
- Importación transaccional con bloqueo de fila, IDs nuevos, jerarquía validada, auditoría y protección contra doble aplicación.
- Ningún elemento importado se publica automáticamente y ningún contenido existente se sobrescribe.

### Preparación de IA

`server/syllabus-ai.ts` define un contrato desacoplado de proveedor, límites de entrada, timeout previsto, esquema estricto y validación de ciclos/profundidad. El endpoint de análisis exige consentimiento externo literal. La implementación actual devuelve indisponibilidad antes de transmitir datos porque todavía no existe un proveedor seleccionado y autorizado.

## Verificado

- TypeScript, ESLint y builds de frontend/backend.
- PostgreSQL real y regresión de matrículas/publicación.
- Propuesta inválida rechazada y jerarquía válida importada aunque llegue desordenada.
- Importación doble rechazada; nodos importados conservados en borrador.
- Duplicación previsualizada sin matrículas ni resultados.
- Playwright en 390, 768, 1024 y 1440 px, temas claro/oscuro y accesibilidad automatizada.
- E2E de error de guardado, advertencia dirty, duplicación única y revisión/importación.

Todas las identidades y el contenido de prueba son sintéticos.

## Requiere configuración

- Seleccionar un proveedor y modelo de IA con salida JSON estructurada.
- Autorizar expresamente el tratamiento externo de texto de sílabos.
- Configurar la credencial únicamente en `.env` después de implementar el adaptador elegido.
- Definir límites mensuales, concurrencia, timeout, región, retención y eliminación.
- Ejecutar una prueba real autorizada; hasta entonces no se declara integración IA funcional.

## Pendiente

- Adaptador y pruebas reales del proveedor que el usuario seleccione.
- Interacción dedicada para combinar/dividir contenidos; actualmente se logra agregando, reordenando y retirando nodos.
- Interceptar atrás/adelante del historial con un enrutador de datos. Enlaces internos, cambios de elemento, recarga y cierre sí están cubiertos.
- Almacenamiento administrado y análisis antimalware para un despliegue público.

## Bloqueado por decisión del usuario

- Proveedor, cuenta, modelo, presupuesto y consentimiento de tratamiento externo.
- Política institucional de retención y región de procesamiento.

## Evaluación de OCR local

No se añadió un motor OCR. Un OCR web/local basado en WASM añade decenas de MB, consumo elevado de CPU/memoria, modelos de idioma y precisión variable en tablas, fórmulas y escaneos degradados. Incorporarlo sin evaluar dispositivos y un corpus institucional perjudicaría rendimiento y confianza.

AULIGMA detecta texto insuficiente y comunica: «Este documento parece estar escaneado. No se pudo extraer texto suficiente». No envía el archivo automáticamente ni inventa contenido. La próxima evaluación debe comparar exactitud, peso, español, fórmulas, aislamiento en worker y retención.

## Auditoría de dependencias

`npm audit` reporta 11 alertas moderadas asociadas a `minimatch < 11.0.1`, transitivas de ESLint, `@eslint/config-array` y typescript-eslint. Son herramientas de desarrollo; el vector requiere patrones glob especialmente construidos durante lint y no forma parte del bundle ni del servidor productivo.

`npm audit --omit=dev` reporta 0 vulnerabilidades. La corrección total sugerida usa `--force` y propone un cambio incompatible a ESLint 4, por lo que no se aplicó. Se recomienda una actualización coordinada en una rama de mantenimiento y repetir lint, TypeScript, builds y suites. Esta auditoría no equivale a una certificación de seguridad.
