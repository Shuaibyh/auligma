export type ProposalNodeType = 'unit'|'week'|'module'|'topic'|'subtopic'|'milestone';

export type ProposalNode = {
  key: string;
  parentKey: string | null;
  type: ProposalNodeType;
  title: string;
  description: string;
  startsOn: string | null;
  endsOn: string | null;
  included: boolean;
  sourcePage: number | null;
  evidence: string;
  warnings: string[];
};

export type SyllabusProposal = {
  version: 1;
  title: string;
  subjectName: string;
  competencies: string[];
  notes: string;
  unresolved: string[];
  nodes: ProposalNode[];
};

export interface SyllabusAiProvider {
  readonly name: string;
  readonly model: string;
  analyze(input: { extractedText: string; signal: AbortSignal }): Promise<SyllabusProposal>;
}
export const MAX_AI_INPUT_CHARS = 120_000;
export const AI_TIMEOUT_MS = 45_000;

export function emptyProposal(title = 'Propuesta de planificación'): SyllabusProposal {
  return { version: 1, title, subjectName: '', competencies: [], notes: '', unresolved: [], nodes: [] };
}
export function configuredSyllabusProvider(): SyllabusAiProvider | null {
  // La selección del proveedor requiere una decisión explícita del propietario de AULIGMA.
  // No se infiere una cuenta ni se lee una clave genérica para evitar envíos accidentales.
  return null;
}

export function assertProposal(value: SyllabusProposal) {
  if (value.version !== 1 || !value.title.trim() || value.title.length > 160 || value.nodes.length > 500) throw new Error('invalid_proposal');
  const keys = new Set<string>();
  for (const node of value.nodes) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(node.key) || keys.has(node.key) || !node.title.trim() || node.title.length > 200) throw new Error('invalid_proposal');
    keys.add(node.key);
  }
  for (const node of value.nodes) if (node.parentKey && !keys.has(node.parentKey)) throw new Error('invalid_proposal');
  const byKey=new Map(value.nodes.map(node=>[node.key,node]));
  const depth=(key:string,trail=new Set<string>()):number=>{if(trail.has(key))throw new Error('invalid_proposal');const node=byKey.get(key);if(!node)throw new Error('invalid_proposal');if(!node.parentKey)return 1;const next=new Set(trail).add(key);const value=1+depth(node.parentKey,next);if(value>6)throw new Error('invalid_proposal');return value;};
  for(const node of value.nodes)depth(node.key);
}

export function orderedIncludedNodes(value:SyllabusProposal) {
  const included=value.nodes.filter(node=>node.included),pending=new Map(included.map(node=>[node.key,node])),result:ProposalNode[]=[];
  while(pending.size){let progressed=false;for(const [key,node] of pending){if(!node.parentKey||result.some(parent=>parent.key===node.parentKey)){result.push(node);pending.delete(key);progressed=true;}}if(!progressed)throw new Error('invalid_proposal');}
  return result;
}
