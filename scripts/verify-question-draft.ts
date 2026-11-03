import { generateQuestionDraft } from '../server/question-drafts.ts';
// Únicamente material sintético. No persiste ni publica la salida.
const start = performance.now();
const draft = await generateQuestionDraft({ topic: 'Derivadas polinómicas', subtopic: 'Potencias', difficulty: 'básica', sourceText: 'Material sintético: la derivada de x**n es n*x**(n-1), para n entero positivo.' });
console.log(JSON.stringify({ elapsedMs: performance.now() - start, draft }));
