export const PROFESSIONAL_SCHOOLS = [
  "Derecho",
  "Contabilidad",
  "Administración",
  "Ingeniería de Sistemas",
  "Agronomía",
  "Administración en Turismo y Hotelería",
] as const;

export type ProfessionalSchool = (typeof PROFESSIONAL_SCHOOLS)[number];
