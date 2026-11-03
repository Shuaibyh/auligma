import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertProposal, emptyProposal } from '../syllabus-ai.ts';
import { validateExercise, validatePng } from '../local-exercises.ts';
import { OllamaClient } from '../ollama.ts';

test('IA: rechaza tipos y fechas inválidos del modelo', () => {
  assert.throws(() => assertProposal({ ...emptyProposal(), competencies: null } as never));
  assert.throws(() => assertProposal({ ...emptyProposal(), nodes: [null] } as never));
  assert.throws(() => assertProposal({ ...emptyProposal(), nodes: [{ key: 'a', parentKey: null, type: 'unit', title: 'A', description: '', startsOn: '2026-02-31', endsOn: null, included: true, sourcePage: null, evidence: '', warnings: [] }] }));
});
test('Visión: rechaza campos extra, tipos inválidos e imágenes arbitrarias', () => {
  validateExercise({ statement: 'Sintético', alternatives: [], warnings: [] });
  assert.throws(() => validateExercise({ statement: '', alternatives: [], warnings: [], approved: true }));
  assert.throws(() => validateExercise({ statement: '', alternatives: [4], warnings: [] }));
  assert.throws(() => validatePng(Buffer.from('<svg/>').toString('base64')));
});
test('Ollama: servidor no disponible, timeout y cola limitada', async () => {
  const input = { model: 'qwen3:4b', prompt: 'Sintético', schema: {} };
  await assert.rejects(new OllamaClient(100, undefined, async () => { throw new Error('ECONNREFUSED'); }).chat(input));
  const transport: typeof fetch = async (_url, options) => new Promise((_resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 200);
    options?.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('cancelado')); }, { once: true });
  });
  const client = new OllamaClient(100, undefined, transport);
  const pending = Array.from({ length: 4 }, () => client.chat(input));
  const settled = Promise.allSettled(pending);
  await assert.rejects(client.chat(input), /cola/);
  assert.ok((await settled).every(result => result.status === 'rejected'));
});
