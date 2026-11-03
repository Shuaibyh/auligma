import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OllamaClient } from '../ollama.ts';

const input = { model: 'qwen3:4b', prompt: 'Documento sintético', schema: { type: 'object' } };
test('Ollama: restringe servidor y modelos locales', async () => {
  assert.throws(() => new OllamaClient(1000, 'https://example.com'));
  await assert.rejects(new OllamaClient().chat({ ...input, model: 'modelo-remoto' }));
});
test('Ollama: salida estructurada y descarga de memoria solicitada', async () => {
  const transport: typeof fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    assert.equal(body.keep_alive, 0); assert.equal(body.think, false);
    assert.equal(body.options.num_ctx, 4096); assert.equal(options?.redirect, 'error');
    return Response.json({ done: true, message: { content: '{"title":"Sintético"}' }, eval_count: 10, eval_duration: 1e9 });
  };
  const result = await new OllamaClient(1000, undefined, transport).chat(input);
  assert.deepEqual(result.payload, { title: 'Sintético' }); assert.equal(result.metrics.tokensPerSecond, 10);
});
test('Ollama: rechaza JSON inválido y salida truncada', async () => {
  for (const result of [{ done: true, message: { content: 'inválido' } }, { done: true, done_reason: 'length', message: { content: '{}' } }]) {
    await assert.rejects(new OllamaClient(1000, undefined, async () => Response.json(result)).chat(input));
  }
});
test('Ollama: serializa inferencias y respeta cancelación', async () => {
  let active = 0; let maximum = 0;
  const transport: typeof fetch = async () => {
    active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 5)); active--;
    return Response.json({ done: true, message: { content: '{}' } });
  };
  const client = new OllamaClient(1000, undefined, transport);
  await Promise.all([client.chat(input), client.chat(input)]); assert.equal(maximum, 1);
  await assert.rejects(client.chat({ ...input, signal: AbortSignal.abort() }));
});
