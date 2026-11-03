import { chromium } from '@playwright/test';
import { localOllama } from '../server/ollama.ts';
import { exerciseSchema, validateExercise } from '../server/local-exercises.ts';
import { OllamaSyllabusProvider } from '../server/ollama-syllabus.ts';

// Imagen generada en memoria: ejercicio sintético, sin documentos privados.
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 350 } });
  await page.setContent('<main style="font:28px Arial;padding:30px;background:white;color:black"><h2>Ejercicio sintético</h2><p>Calcula la derivada de f(x) = x².</p><p>A: 2x &nbsp; B: x &nbsp; C: 0 &nbsp; D: 2</p></main>');
  const image = await page.screenshot();
  try {
    const result = await localOllama.chat({ model: 'qwen3-vl:2b', schema: exerciseSchema,
      prompt: 'Lee la imagen. Respuesta breve, menos de 150 palabras. statement: enunciado. alternatives: exactamente cuatro cadenas. warnings: lista vacía si no hay ambigüedad. No repitas texto.', images: [image.toString('base64')] });
    validateExercise(result.payload);
    console.log(JSON.stringify({ test: 'visión sintética', ...result }));
  } catch (error) { console.log(JSON.stringify({ test: 'visión sintética', error: (error as Error).message })); }
} finally { await browser.close(); }
const start = performance.now();
const proposal = await new OllamaSyllabusProvider().analyze({
  extractedText: 'Sílabo sintético. Asignatura: Cálculo. Unidad 1: Derivadas. Semana 1: Regla del producto. Semana 2: Regla del cociente.',
  signal: AbortSignal.timeout(120_000),
});
console.log(JSON.stringify({ test: 'sílabo sintético', elapsedMs: performance.now() - start, proposal }));
