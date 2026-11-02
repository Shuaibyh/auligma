# AULIGMA — Fase 2.3: planificación académica

## Estado verificable

La Fase 2.3 incorpora una base real y persistente de planificación académica sobre PostgreSQL. El docente propietario puede crear una planificación por aula, organizar unidades, semanas, módulos, temas, subtemas e hitos en una jerarquía flexible, reordenar elementos, guardar fechas, publicar de forma selectiva y retirar contenido sin borrado físico. El estudiante matriculado solo recibe nodos y materiales publicados.

La interfaz sigue «Geometría razonada»: árbol estructural, lienzo editorial e inspector de publicación en escritorio; flujo vertical legible en móvil. Se verificó a 390, 768, 1024 y 1440 px, en tema claro y oscuro, sin desbordamiento horizontal y con auditoría automatizada WCAG.

## Persistencia

La migración `202611010004_academic_planning.mjs` añade:

- `academic_plans`: planificación única por aula, duración y revisión.
- `academic_nodes`: contenido jerárquico, posición, estado borrador/publicado, fechas y retiro lógico.
- `academic_week_units`: relación explícita entre semanas y una o varias unidades.
- `academic_materials`: enlaces, apuntes y metadatos de archivos privados.
- `syllabus_sources`: PDF original, huella SHA-256, estado y texto extraído.
- `planning_proposals`: estructura para propuestas externas pendientes de revisión humana.
- `academic_plan_revisions`: instantáneas de cambios relevantes.

Las claves foráneas son restrictivas. No se copian matrículas ni resultados al duplicar una planificación. La migración es incremental y fue aplicada sobre la base de desarrollo existente sin recrearla.

## API y seguridad

Las rutas nuevas viven bajo `/api/v1/classrooms/:id`. Toda operación docente vuelve a comprobar propiedad del aula; toda lectura estudiantil exige matrícula activa y aula activa. Un UUID conocido no concede acceso.

El servidor impide ciclos, limita la profundidad a seis niveles, valida tipos, posiciones, fechas, tamaños y formatos. Los archivos se guardan fuera del árbol público, con nombre aleatorio y permisos privados; la descarga pasa siempre por autorización. Se aceptan PDF y DOCX de hasta 10 MB y se comprueba su firma binaria. `.auligma-data/` está excluido de Git.

La duplicación completa entre aulas del mismo docente está implementada en la API. La copia queda en borrador y es independiente. El selector de destino en la interfaz queda pendiente; no se presenta como una operación completada.

## Sílabo e inteligencia artificial

El PDF del sílabo se almacena de forma privada y su texto se extrae localmente con `pdfjs-dist`. Se distinguen archivo inválido, PDF válido sin texto extraíble, fallo de extracción y texto recuperado. No se ejecuta OCR.

No hay un proveedor de IA configurado. Por ello AULIGMA no envía el sílabo a terceros, no fabrica una propuesta y responde `503 ai_not_configured` al solicitarla. Las tablas separan fuente, propuesta y aceptación para una integración posterior con revisión humana obligatoria. La edición estructurada de una propuesta generada y su comparación antes de aceptar siguen pendientes hasta seleccionar y configurar un proveedor real.

## Verificación ejecutada

- Migraciones Knex sobre PostgreSQL real.
- Inventario de 20 tablas, 20 claves primarias, 39 foráneas, 18 restricciones únicas, 36 comprobaciones y 53 índices.
- Suite del backend: 19/19 pruebas aprobadas.
- Casos de planificación: ciclo rechazado, reordenamiento, publicación selectiva, aislamiento estudiantil, materiales privados, duplicación sin matrículas y aula archivada inaccesible.
- PDF: rechazo de contenido inválido, archivo válido sin texto y archivo válido con texto extraíble.
- TypeScript, ESLint y builds de frontend/backend aprobados.
- Prueba Playwright específica en cuatro anchos, temas claro/oscuro y recorrido estudiantil publicado.

Las identidades y contenidos automatizados son sintéticos. No se incorporaron usuarios, cursos ni archivos académicos reales.

## Límites antes de ampliar la fase

- Conectar el selector visual de aula de destino a la API de duplicación.
- Implementar advertencia de cambios editoriales sin guardar.
- Diseñar la revisión/edición de propuestas cuando exista un proveedor de IA aprobado.
- Añadir OCR solo si se define una política de privacidad, retención y proveedor.
- Definir almacenamiento privado administrado y análisis antimalware antes de un despliegue público.
