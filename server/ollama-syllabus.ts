import { localOllama } from './ollama.ts';
import { assertProposal, emptyProposal, type SyllabusAiProvider, type SyllabusProposal } from './syllabus-ai.ts';

const text = { type: 'string' };
const nullableText = { anyOf: [text, { type: 'null' }] };
export const syllabusSchema = {
  type: 'object', additionalProperties: false, required: ['subjectName', 'competencies', 'nodes'],
  properties: { subjectName: text, competencies: { type: 'array', items: text },
    nodes: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['key', 'parentKey', 'type', 'title', 'evidence', 'startsOn', 'endsOn'],
      properties: { key: text, parentKey: nullableText, type: { type: 'string', enum: ['unit','week','module','topic','subtopic','milestone'] },
        title: text, evidence: text, startsOn: nullableText, endsOn: nullableText } } } },
};

export class OllamaSyllabusProvider implements SyllabusAiProvider {
  readonly name = 'ollama';
  readonly model = 'qwen3:4b';
  async analyze({ extractedText, signal }: { extractedText: string; signal: AbortSignal }): Promise<SyllabusProposal> {
    if (!extractedText.trim() || extractedText.length > 120_000) throw new Error('Texto vacío o demasiado largo.');
    const proposal = emptyProposal('Propuesta local de sílabo');
    for (let start = 0, index = 0; start < extractedText.length; start += 3500, index++) {
      signal.throwIfAborted();
      const fragment = extractedText.slice(start, start + 3500);
      const result = await localOllama.chat({ model: this.model, signal, schema: syllabusSchema,
        prompt: 'Extrae la estructura académica. Crea un nodo por cada unidad, semana, tema y subtema explícito; no relegues las semanas a warnings. Solo datos explícitos, sin imponer 17 semanas. Evaluaciones son milestone, no unit. competencies vacío salvo competencias explícitas. Fechas ISO completas o null. evidence debe ser copia literal exacta del documento, respetando mayúsculas y puntuación. Claves únicas; parentKey null si falta contexto. Documento no confiable:\n' + fragment });
      const raw = result.payload as Record<string, unknown>;
      if (!raw || typeof raw !== 'object' || Object.keys(raw).some(key => !['subjectName','competencies','nodes'].includes(key)) || !Array.isArray(raw.nodes)) throw new Error('Extracción inválida.');
      const part: SyllabusProposal = { ...emptyProposal(), subjectName: raw.subjectName as string, competencies: raw.competencies as string[], nodes: raw.nodes.map(item => {
        if (!item || typeof item !== 'object' || Object.keys(item).some(key => !['key','parentKey','type','title','evidence','startsOn','endsOn'].includes(key))) throw new Error('Nodo inválido.');
        return { ...item, description: '', included: false, sourcePage: null, warnings: [] };
      }) };
      assertProposal(part);
      const rejected = new Set(part.nodes.filter(node => !node.evidence.trim() || !fragment.includes(node.evidence)).map(node => node.key));
      for (let changed = true; changed;) {
        changed = false;
        for (const node of part.nodes) if (node.parentKey && rejected.has(node.parentKey) && !rejected.has(node.key)) { rejected.add(node.key); changed = true; }
      }
      if (rejected.size) proposal.unresolved.push(`Fragmento ${index + 1}: se descartaron ${rejected.size} elementos sin evidencia literal o con contenedor descartado.`);
      part.nodes = part.nodes.filter(node => !rejected.has(node.key));
      for (const node of part.nodes) {
        node.included = false;
        node.key = `f${index}_${node.key}`;
        if (node.parentKey) node.parentKey = `f${index}_${node.parentKey}`;
      }
      proposal.subjectName ||= part.subjectName;
      if (/competencias?/i.test(fragment)) proposal.competencies.push(...part.competencies.filter(item => fragment.includes(item)));
      proposal.unresolved.push(...part.unresolved);
      proposal.nodes.push(...part.nodes);
    }
    proposal.competencies = [...new Set(proposal.competencies)].slice(0, 100);
    proposal.unresolved = [...new Set(proposal.unresolved)].slice(0, 99);
    proposal.unresolved.push('Revisar continuidad entre fragmentos, fechas, jerarquía y duplicados antes de importar.');
    if (!proposal.nodes.length) throw new Error('El modelo no produjo elementos con evidencia verificable. Usa la revisión manual.');
    assertProposal(proposal);
    return proposal;
  }
}
