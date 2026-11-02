export type Question = {
  id: string;
  classroomId: string;
  topic: string;
  text: string;
  formula: string;
  options: string[];
  correct: number;
  state: "Pendiente de revisión" | "Revisada";
  rule: string;
  steps: string[];
  errors: string[];
  recommendation: string;
};

// Ejemplos preparados y ligados explícitamente al aula de Cálculo diferencial.
// Sus soluciones fueron revisadas manualmente y no proceden de un servicio de IA.
export const preparedQuestions: Question[] = [
  {
    id: "derivada-polinomio",
    classroomId: "calculo",
    topic: "Derivadas de polinomios",
    text: "¿Cuál es la derivada de esta función?",
    formula: "f(x)=x^3-3x+2",
    options: ["3x^2-3", "3x^2+2", "x^2-3", "3x-3"],
    correct: 0,
    state: "Revisada",
    rule: "Linealidad y regla de la potencia: la derivada de xⁿ es n·xⁿ⁻¹.",
    steps: [
      "Deriva x³: multiplica por 3 y reduce el exponente a 2, obteniendo 3x².",
      "Deriva −3x: el resultado es −3. La derivada de la constante 2 es 0.",
      "Suma los términos: f′(x) = 3x² − 3.",
    ],
    errors: [
      "",
      "La constante 2 no permanece al derivar: su derivada es 0.",
      "Al derivar x³ debes multiplicar por el exponente 3.",
      "El exponente de x³ se reduce a 2, no a 1.",
    ],
    recommendation: "Practica la regla de la potencia antes de combinar términos.",
  },
  {
    id: "derivada-en-punto",
    classroomId: "calculo",
    topic: "Derivada en un punto",
    text: "Calcula f′(2) para la función indicada.",
    formula: "f(x)=x^2+1",
    options: ["2", "3", "4", "5"],
    correct: 2,
    state: "Revisada",
    rule: "Primero deriva la función y luego evalúa la derivada en el punto.",
    steps: [
      "Deriva x² + 1 mediante la regla de la potencia: f′(x) = 2x.",
      "Sustituye x por 2 en la expresión de la derivada.",
      "Calcula 2·2 = 4; por tanto, f′(2) = 4.",
    ],
    errors: [
      "Has evaluado sin aplicar correctamente la derivada de x².",
      "La constante desaparece, pero todavía debes evaluar 2x en x = 2.",
      "",
      "5 es f(2), no f′(2). El ejercicio pide el valor de la derivada.",
    ],
    recommendation: "Distingue entre evaluar la función y evaluar su derivada.",
  },
  {
    id: "regla-cadena",
    classroomId: "calculo",
    topic: "Regla de la cadena",
    text: "Deriva la siguiente función compuesta.",
    formula: "g(x)=(2x+1)^3",
    options: ["3(2x+1)^2", "6(2x+1)^2", "6(2x+1)^3", "2(2x+1)^2"],
    correct: 1,
    state: "Revisada",
    rule: "Regla de la cadena: deriva la función exterior y multiplica por la derivada de la interior.",
    steps: [
      "Deriva la potencia exterior: 3(2x + 1)².",
      "Deriva la función interior 2x + 1: su derivada es 2.",
      "Multiplica ambos factores: g′(x) = 6(2x + 1)².",
    ],
    errors: [
      "Falta multiplicar por la derivada de la función interior, que es 2.",
      "",
      "Al derivar una potencia, el exponente se reduce en una unidad.",
      "Debes incluir también el factor 3 de la potencia exterior.",
    ],
    recommendation: "Separa la función exterior de la interior antes de derivar.",
  },
];

export const initialBank: Question[] = preparedQuestions.map((question) => ({
  ...question,
  options: [...question.options],
  steps: [...question.steps],
  errors: [...question.errors],
}));

export type AttemptPolicy =
  | { mode: "unlimited" }
  | { mode: "limited"; maxAttempts: number };

export type Assessment = {
  id: string;
  title: string;
  classroomId: string;
  questionIds: string[];
  mode: "Práctica" | "Evaluación";
  start: string;
  end: string;
  attemptPolicy: AttemptPolicy;
  instructions: string;
  status: "Borrador" | "Pendiente de revisión" | "Publicada";
  snapshot?: Question[];
};

export const initialAssessments: Assessment[] = [
  {
    id: "repaso",
    title: "Comprender el cambio",
    classroomId: "calculo",
    questionIds: preparedQuestions.map((q) => q.id),
    mode: "Práctica",
    start: "2026-10-01T08:00",
    end: "2026-12-31T23:59",
    attemptPolicy: { mode: "unlimited" },
    instructions:
      "Resuelve a tu ritmo y consulta cada explicación después de comprobar la respuesta.",
    status: "Publicada",
    snapshot: preparedQuestions,
  },
  {
    id: "control",
    title: "Control de derivadas",
    classroomId: "calculo",
    questionIds: ["regla-cadena"],
    mode: "Evaluación",
    start: "",
    end: "",
    attemptPolicy: { mode: "limited", maxAttempts: 1 },
    instructions: "Revisa el procedimiento antes de enviar.",
    status: "Borrador",
  },
  {
    id: "repaso-cadena",
    title: "Repaso de regla de la cadena",
    classroomId: "calculo",
    questionIds: ["regla-cadena"],
    mode: "Práctica",
    start: "2026-10-01T08:00",
    end: "2026-12-31T23:59",
    attemptPolicy: { mode: "limited", maxAttempts: 3 },
    instructions: "Identifica la función interior antes de derivar.",
    status: "Pendiente de revisión",
  },
];

export function publicationIssues(
  item: Assessment,
  bank: Question[],
  classroomIds: string[],
) {
  const issues: string[] = [];
  if (!item.title.trim()) issues.push("Escribe un título.");
  if (!classroomIds.includes(item.classroomId))
    issues.push("Selecciona un aula existente.");
  if (!item.questionIds.length)
    issues.push("Selecciona al menos una pregunta.");
  if (
    item.questionIds.some(
      (id) =>
        !bank.some(
          (q) =>
            q.id === id &&
            q.classroomId === item.classroomId &&
            q.state === "Revisada",
        ),
    )
  )
    issues.push("Revisa las preguntas y comprueba que pertenezcan al aula.");
  if (
    !item.start ||
    !item.end ||
    !Number.isFinite(Date.parse(item.start)) ||
    !Number.isFinite(Date.parse(item.end))
  )
    issues.push("Completa las fechas de apertura y cierre.");
  else if (Date.parse(item.end) <= Date.parse(item.start))
    issues.push("El cierre debe ser posterior a la apertura.");
  if (
    item.attemptPolicy.mode === "limited" &&
    (!Number.isInteger(item.attemptPolicy.maxAttempts) ||
      item.attemptPolicy.maxAttempts < 1)
  )
    issues.push("Configura un número entero positivo de intentos.");
  if (!item.instructions.trim())
    issues.push("Describe las reglas de la actividad.");
  return issues;
}
