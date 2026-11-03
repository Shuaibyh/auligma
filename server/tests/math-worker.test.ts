import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyMath } from '../math-verifier.ts';

test('Matemática: caso crítico A y C equivalentes bloquea opción única', async () => {
  const result = await verifyMath({ operation: 'derivative', expression: '(3*x**2+2*x)/(x+1)', alternatives: ['(3*x**2+6*x+2)/(x+1)**2', '0', '3-1/(x+1)**2', '1'] });
  assert.equal(result.status, 'VERIFICADO');
  assert.deepEqual(result.correctIndices, [0, 2]);
  assert.equal(result.singleChoiceValid, false); assert.equal(result.publicationAllowed, false);
  assert.equal(typeof result.expectedExpression, 'string');
});
test('Matemática: producto, cadena y dominio racional', async () => {
  for (const [expression, answer] of [['x*x', '2*x'], ['(x+1)**3', '3*(x+1)**2'], ['x**3', '3*x**2']]) {
    const result = await verifyMath({ operation: 'derivative', expression, alternatives: [answer, '0'] });
    assert.deepEqual(result.correctIndices, [0]);
  }
  const restricted = await verifyMath({ operation: 'equivalence', expression: 'x+1', alternatives: ['(x**2-1)/(x-1)'] });
  assert.equal(restricted.singleChoiceValid, false);
});
test('Matemática: rechaza ejecución, atributos y exponentes descontrolados', async () => {
  for (const expression of ['__import__("os")', 'x.__class__', 'x**9999', '[x for x in range(10)]']) {
    const result = await verifyMath({ operation: 'equivalence', expression, alternatives: ['x'] });
    assert.equal(result.status, 'INDETERMINADO');
  }
});
