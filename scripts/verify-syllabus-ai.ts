import { OllamaSyllabusProvider } from '../server/ollama-syllabus.ts';
const started = performance.now();
const proposal = await new OllamaSyllabusProvider().analyze({
  extractedText: 'Sílabo sintético. Asignatura: Cálculo.\nUnidad 1: Derivadas.\nSemana 1: Regla del producto.\nSemana 2: Regla del cociente.',
  signal: AbortSignal.timeout(120_000),
});
console.log(JSON.stringify({ elapsedMs: performance.now() - started, proposal }));
