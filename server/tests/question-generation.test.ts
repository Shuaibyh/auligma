import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateQuestionDraft } from '../question-drafts.ts';
import { LocalAiError } from '../ollama.ts';
import { verifyMath } from '../math-verifier.ts';

const input = { topic: 'Regla del cociente', subtopic: 'Derivada de funciones racionales', sourceText: '', difficulty: 'intermedia' };
const valid = { statement: 'Deriva f(x)=x**2.', expression: 'x**2', alternatives: ['2*x','x','0','1'], warnings: [], explanation: 'Aplica la regla correspondiente y revisa el procedimiento.', proposedAnswer: 0 };
const verified = async () => ({ status: 'VERIFICADO', singleChoiceValid: true, correctIndices: [0], publicationAllowed: false });
function model(outputs: unknown[]) {
  let calls = 0;
  return { get calls() { return calls; }, async chat() { const value = outputs[calls++]; if (value instanceof Error) throw value; return { payload: value }; } };
}

test('Preguntas: acepta contrato completo y exige cuatro alternativas en el esquema', async () => {
  let schema: Record<string, unknown> | undefined;
  const provider = { async chat(request: { schema: Record<string, unknown> }) { schema = request.schema; return { payload: valid }; } };
  const result = await generateQuestionDraft(input, undefined, provider, verified);
  assert.equal(result.expression, 'x**2'); assert.equal(result.generationAttempts, 1); assert.equal(result.publicationAllowed, false);
  assert.equal(((schema?.properties as Record<string, Record<string, unknown>>).alternatives).minItems, 4);
  assert.equal(((schema?.properties as Record<string, Record<string, unknown>>).alternatives).maxItems, 4);
  assert.equal(((schema?.properties as Record<string, Record<string, unknown>>).alternatives).uniqueItems, true);
});

test('Preguntas: reintenta una sola vez JSON inválido o respuesta incompleta', async () => {
  for (const first of [new LocalAiError('AI_INVALID_JSON', 'output_parse', 'Inválido', true), { ...valid, expression: undefined }]) {
    const provider = model([first, valid]);
    const result = await generateQuestionDraft(input, undefined, provider, verified);
    assert.equal(provider.calls, 2); assert.equal(result.generationAttempts, 2);
  }
});

test('Preguntas: rechaza duplicados e índice fuera de rango después del único reintento', async () => {
  const duplicate = { ...valid, alternatives: ['2*x','2*x','0','1'] };
  const duplicateModel = model([duplicate, duplicate]);
  await assert.rejects(generateQuestionDraft(input, undefined, duplicateModel, verified), (error: unknown) => error instanceof LocalAiError && error.code === 'AI_INVALID_ALTERNATIVES');
  assert.equal(duplicateModel.calls, 2);
  const badIndex = { ...valid, proposedAnswer: 5 };
  const indexModel = model([badIndex, badIndex]);
  await assert.rejects(generateQuestionDraft(input, undefined, indexModel, verified), (error: unknown) => error instanceof LocalAiError && error.code === 'AI_SCHEMA_VALIDATION_FAILED');
  assert.equal(indexModel.calls, 2);
});

test('Preguntas: no reintenta timeout, modelo ausente ni cola ocupada', async () => {
  for (const code of ['AI_TIMEOUT','AI_MODEL_UNAVAILABLE','AI_BUSY'] as const) {
    const provider = model([new LocalAiError(code, 'synthetic', code)]);
    await assert.rejects(generateQuestionDraft(input, undefined, provider, verified), (error: unknown) => error instanceof LocalAiError && error.code === code);
    assert.equal(provider.calls, 1);
  }
});

test('Preguntas: SymPy corrige el índice del modelo y conserva revisión humana', async () => {
  const result = await generateQuestionDraft(input, undefined, model([{ ...valid, proposedAnswer: 3 }]), async () => ({ status: 'VERIFICADO', singleChoiceValid: true, correctIndices: [0], publicationAllowed: false }));
  assert.equal(result.proposedAnswer, 0); assert.match(result.warnings.join(' '), /corrigió/); assert.equal(result.requiresReview, true);
});

test('Preguntas: caso A/C equivalente se detecta y reconstruye sin publicar', async () => {
  const critical = { ...valid, expression: '(3*x**2+2*x)/(x+1)', alternatives: ['(3*x**2+6*x+2)/(x+1)**2','0','3-1/(x+1)**2','1'] };
  const result = await generateQuestionDraft(input, undefined, model([critical, critical]), verifyMath);
  assert.match(result.warnings.join(' '), /reconstruyó/); assert.equal(result.publicationAllowed, false); assert.equal(result.generationAttempts, 2);
});

test('Preguntas: un resultado indeterminado activa solo un reintento y permanece pendiente si se repite', async () => {
  const provider = model([valid, valid]);
  const result = await generateQuestionDraft(input, undefined, provider, async () => ({ status: 'INDETERMINADO', singleChoiceValid: false, publicationAllowed: false }));
  assert.equal(provider.calls, 2); assert.equal(result.generationAttempts, 2); assert.match(result.warnings.join(' '), /no pudo concluir/);
});

test('Preguntas: SymPy reconstruye alternativas tras el reintento inválido', async () => {
  const provider = model([valid, valid]); let calls = 0;
  const verifier = async () => {
    calls++;
    if (calls <= 2) return { status: 'VERIFICADO', singleChoiceValid: false, correctIndices: [], expectedExpression: '2*x', publicationAllowed: false };
    if (calls === 3) return { status: 'VERIFICADO', alternatives: Array.from({ length: 5 }, () => ({ status: 'INCORRECTA' })), publicationAllowed: false };
    return { status: 'VERIFICADO', singleChoiceValid: true, correctIndices: [0], publicationAllowed: false };
  };
  const result = await generateQuestionDraft(input, undefined, provider, verifier);
  assert.deepEqual(result.alternatives, ['2*x','(2*x)+1','(2*x)-1','-1*(2*x)']);
  assert.equal(result.proposedAnswer, 0); assert.match(result.warnings.join(' '), /reconstruyó/); assert.match(result.explanation, /revisa/);
});
