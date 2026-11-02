import type { Student } from "./DemoContext";

export const MAX_ROSTER_SIZE = 5 * 1024 * 1024;
export const MAX_ROSTER_ROWS = 2000;

export type ImportField =
  | "code"
  | "fullName"
  | "firstNames"
  | "lastNames"
  | "email"
  | "role";

export type ColumnMapping = Record<ImportField, number | null>;
export type ImportStatus =
  | "Listo para importar"
  | "Duplicado"
  | "Datos incompletos"
  | "Participante por confirmar"
  | "Excluido";

export type RosterSheet = {
  name: string;
  rows: string[][];
};

export type ParsedRoster = {
  fileName: string;
  fileSize: number;
  sheets: RosterSheet[];
};

export type ImportCandidate = {
  id: string;
  sourceRow: number;
  code: string;
  firstNames: string;
  lastNames: string;
  email: string;
  role: string;
  selected: boolean;
  status: ImportStatus;
  reason: string;
};

const aliases: Record<ImportField, string[]> = {
  code: ["codigo", "codigo de estudiante", "idnumber", "id number", "identificador"],
  fullName: ["nombre completo", "nombre y apellidos", "participante", "usuario"],
  firstNames: ["nombre", "nombres", "firstname", "first name"],
  lastNames: ["apellido", "apellidos", "apellido s", "lastname", "last name"],
  email: ["correo", "correo electronico", "direccion de correo", "email", "e mail"],
  role: ["rol", "roles", "role", "roles de sistema"],
};

export function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stringCell(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "").trim();
}

export function detectHeader(rows: string[][]) {
  let best = { index: -1, score: 0, mapping: emptyMapping() };
  rows.slice(0, 20).forEach((row, index) => {
    const mapping = detectMapping(row);
    const score = Object.values(mapping).filter((value) => value !== null).length;
    const hasName =
      mapping.fullName !== null ||
      mapping.firstNames !== null ||
      mapping.lastNames !== null;
    if (hasName && score > best.score) best = { index, score, mapping };
  });
  return best;
}

export function emptyMapping(): ColumnMapping {
  return {
    code: null,
    fullName: null,
    firstNames: null,
    lastNames: null,
    email: null,
    role: null,
  };
}

export function detectMapping(headers: string[]): ColumnMapping {
  const mapping = emptyMapping();
  headers.forEach((header, index) => {
    const normalized = normalize(header);
    (Object.keys(aliases) as ImportField[]).forEach((field) => {
      if (
        mapping[field] === null &&
        aliases[field].some((alias) => normalize(alias) === normalized)
      )
        mapping[field] = index;
    });
  });
  return mapping;
}

function csvRows(source: string) {
  const delimiter = [",", ";", "\t"].sort(
    (a, b) =>
      (source.split("\n")[0]?.split(b).length || 0) -
      (source.split("\n")[0]?.split(a).length || 0),
  )[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows.slice(0, MAX_ROSTER_ROWS + 20);
}

export async function readRosterFile(file: File): Promise<ParsedRoster> {
  if (file.size > MAX_ROSTER_SIZE)
    throw new Error("El archivo supera el límite de 5 MB.");
  const extension = file.name.split(".").pop()?.toLocaleLowerCase();
  if (extension === "xls")
    throw new Error(
      "El formato .xls heredado no es compatible. Guárdalo como .xlsx o .csv y vuelve a intentarlo.",
    );
  if (extension === "csv") {
    const rows = csvRows(await file.text());
    if (!rows.length) throw new Error("El archivo CSV no contiene filas legibles.");
    return {
      fileName: file.name,
      fileSize: file.size,
      sheets: [{ name: "CSV", rows }],
    };
  }
  if (extension !== "xlsx")
    throw new Error("Selecciona un archivo .xlsx o .csv.");
  try {
    const { default: readXlsxFile } = await import("read-excel-file/browser");
    const workbook = await readXlsxFile(file);
    const sheets = workbook.map((sheet) => ({
      name: sheet.sheet,
      rows: sheet.data
        .slice(0, MAX_ROSTER_ROWS + 20)
        .map((row) => row.map(stringCell)),
    }));
    if (!sheets.some((sheet) => sheet.rows.length))
      throw new Error("El libro no contiene hojas con datos.");
    return { fileName: file.name, fileSize: file.size, sheets };
  } catch (error) {
    if (error instanceof Error && error.message.includes("hojas con datos"))
      throw error;
    throw new Error(
      "No pudimos leer el archivo. Comprueba que sea un .xlsx válido y vuelve a intentarlo.",
      { cause: error },
    );
  }
}

function cell(row: string[], index: number | null) {
  return index === null ? "" : (row[index] || "").trim();
}

function duplicateOf(candidate: ImportCandidate, students: Student[]) {
  const code = normalize(candidate.code);
  const email = normalize(candidate.email);
  return students.some(
    (student) =>
      (!!code && normalize(student.code) === code) ||
      (!!email && normalize(student.email) === email),
  );
}

export function classifyCandidate(
  candidate: ImportCandidate,
  students: Student[],
  peers: ImportCandidate[],
) {
  const name = `${candidate.firstNames} ${candidate.lastNames}`.trim();
  if (!name) return result(candidate, "Datos incompletos", "Falta el nombre del participante.", false);
  if (candidate.email && !/^\S+@\S+\.\S+$/.test(candidate.email))
    return result(candidate, "Datos incompletos", "El correo no tiene un formato válido.", false);
  const duplicateInFile = peers.some(
    (peer) =>
      peer.id !== candidate.id &&
      ((candidate.code && normalize(peer.code) === normalize(candidate.code)) ||
        (candidate.email && normalize(peer.email) === normalize(candidate.email))),
  );
  if (duplicateInFile || duplicateOf(candidate, students))
    return result(candidate, "Duplicado", "El código o correo ya aparece en la nómina o en el aula.", false);
  const role = normalize(candidate.role);
  if (role && /(docente|profesor|teacher|manager|gestor|administrador)/.test(role))
    return result(candidate, "Excluido", "El rol indica que no es estudiante.", false);
  if (role && !/(estudiante|student|alumno)/.test(role))
    return result(candidate, "Participante por confirmar", "El rol no identifica inequívocamente a un estudiante.", candidate.selected);
  if (!role)
    return result(candidate, "Participante por confirmar", "El archivo no indica el rol; confirma este participante.", candidate.selected);
  if (!candidate.code && !candidate.email)
    return result(candidate, "Participante por confirmar", "No tiene código ni correo; se usará un identificador local.", candidate.selected);
  return result(candidate, "Listo para importar", "Datos reconocidos y rol de estudiante.", true);
}

function result(
  candidate: ImportCandidate,
  status: ImportStatus,
  reason: string,
  selected: boolean,
) {
  return { ...candidate, status, reason, selected };
}

export function buildCandidates(
  sheet: RosterSheet,
  headerIndex: number,
  mapping: ColumnMapping,
  students: Student[],
) {
  const base = sheet.rows
    .slice(headerIndex + 1)
    .filter((row) => row.some((value) => value.trim()))
    .map((row, index): ImportCandidate => {
      const fullName = cell(row, mapping.fullName);
      return {
        id: `fila-${headerIndex + index + 2}`,
        sourceRow: headerIndex + index + 2,
        code: cell(row, mapping.code),
        firstNames: cell(row, mapping.firstNames) || fullName,
        lastNames: cell(row, mapping.lastNames),
        email: cell(row, mapping.email),
        role: cell(row, mapping.role),
        selected: false,
        status: "Participante por confirmar",
        reason: "Pendiente de revisión.",
      };
    });
  return base.map((candidate) => classifyCandidate(candidate, students, base));
}

export function candidateToStudent(candidate: ImportCandidate): Student {
  return {
    id: crypto.randomUUID(),
    code: candidate.code || undefined,
    firstNames: candidate.firstNames.trim(),
    lastNames: candidate.lastNames.trim(),
    email: candidate.email || undefined,
  };
}
