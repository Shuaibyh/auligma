import { execFile } from 'node:child_process';
import path from 'node:path';

export type MathInput = { operation: 'derivative' | 'equivalence'; expression: string; alternatives: string[] };
let activeWorker = false;
export function verifyMath(input: MathInput): Promise<Record<string, unknown>> {
  if (JSON.stringify(input).length > 8000) return Promise.reject(new Error('Expresión demasiado grande.'));
  if (activeWorker) return Promise.resolve({ status: 'INDETERMINADO', singleChoiceValid: false, publicationAllowed: false, explanation: 'Verificador ocupado; vuelve a intentarlo.' });
  activeWorker = true;
  const python = process.env.MATH_PYTHON || path.resolve('.venv-math', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  return new Promise(resolve => {
    const process = execFile(python, ['-I', path.resolve('server/math_worker.py')], { timeout: 5000, maxBuffer: 32_768, windowsHide: true, encoding: 'utf8' }, (error, stdout) => {
      activeWorker = false;
      const unknown = { status: 'INDETERMINADO', singleChoiceValid: false, publicationAllowed: false, explanation: 'Verificador no disponible o tiempo agotado.' };
      if (error) return resolve(unknown);
      try { resolve(JSON.parse(stdout)); } catch { resolve(unknown); }
    });
    process.stdin?.on('error', () => undefined);
    process.stdin?.end(JSON.stringify(input));
  });
}
