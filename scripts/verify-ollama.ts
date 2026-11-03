import { localOllama } from '../server/ollama.ts';

// Prueba explícita con contenido sintético; no lee documentos ni credenciales.
const result = await localOllama.chat({ model: 'qwen3:4b',
  prompt: 'Calcula la derivada de x al cuadrado. Devuelve un objeto con el campo resultado, una cadena.',
  schema: { type: 'object', properties: { resultado: { type: 'string' } }, required: ['resultado'], additionalProperties: false } });
console.log(JSON.stringify(result, null, 2));
