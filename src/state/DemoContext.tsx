import { createContext, useContext, useState, type ReactNode } from "react";
import {
  initialBank,
  initialAssessments,
  type Question,
  type Assessment,
} from "./academic";
import type { ProfessionalSchool } from "./catalogs";

export type Student = {
  id: string;
  code?: string;
  firstNames: string;
  lastNames: string;
  email?: string;
};

export function studentName(student: Student) {
  return `${student.firstNames} ${student.lastNames}`.trim();
}

export type Classroom = {
  id: string;
  name: string;
  section: string;
  period: string;
  shift: string;
  students: Student[];
  color: string;
  archivedAt?: string;
};

export type StudentProfile = {
  firstNames: string;
  lastNames: string;
  email: string;
  universityCode: string;
  phone: string;
  school: ProfessionalSchool;
  photo?: string;
};

export type TeacherProfile = {
  firstNames: string;
  lastNames: string;
  email: string;
  phone: string;
  professionalInfo: string;
  photo?: string;
};

export type Review = {
  text: string;
  formula: string;
  status: number;
  loaded: boolean;
};

type DemoState = {
  bank: Question[];
  setBank: React.Dispatch<React.SetStateAction<Question[]>>;
  assessments: Assessment[];
  setAssessments: React.Dispatch<React.SetStateAction<Assessment[]>>;
  concentration: boolean;
  setConcentration: React.Dispatch<React.SetStateAction<boolean>>;
  classrooms: Classroom[];
  setClassrooms: React.Dispatch<React.SetStateAction<Classroom[]>>;
  review: Review;
  setReview: React.Dispatch<React.SetStateAction<Review>>;
  dark: boolean;
  toggleTheme: () => void;
  studentProfile: StudentProfile;
  setStudentProfile: React.Dispatch<React.SetStateAction<StudentProfile>>;
  teacherProfile: TeacherProfile;
  setTeacherProfile: React.Dispatch<React.SetStateAction<TeacherProfile>>;
};

const Context = createContext<DemoState | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [bank, setBank] = useState(initialBank);
  const [assessments, setAssessments] = useState(initialAssessments);
  const [concentration, setConcentration] = useState(true);
  const [classrooms, setClassrooms] = useState<Classroom[]>([
    {
      id: "calculo",
      name: "Cálculo diferencial",
      section: "A",
      period: "2026-II",
      shift: "Mañana",
      students: [
        {
          id: "demo-student",
          code: "DEM-001",
          firstNames: "Estudiante",
          lastNames: "demo 01",
          email: "estudiante.demo@auligma.test",
        },
        {
          id: "demo-02",
          code: "DEM-002",
          firstNames: "Estudiante",
          lastNames: "demo 02",
          email: "demo02@example.invalid",
        },
        {
          id: "demo-03",
          code: "DEM-003",
          firstNames: "Estudiante",
          lastNames: "demo 03",
          email: "demo03@example.invalid",
        },
      ],
      color: "blue",
    },
    {
      id: "algebra",
      name: "Álgebra lineal",
      section: "B",
      period: "2026-II",
      shift: "Tarde",
      students: [],
      color: "green",
    },
    {
      id: "matematica",
      name: "Matemática básica",
      section: "C",
      period: "2026-II",
      shift: "Mañana",
      students: [],
      color: "sand",
    },
  ]);
  const [review, setReview] = useState<Review>({
    text: "Determina la derivada de la siguiente función y explica el procedimiento.",
    formula: "f(x) = x^3 - 3x + 2",
    status: 0,
    loaded: false,
  });
  const [dark, setDark] = useState(false);
  const [studentProfile, setStudentProfile] = useState<StudentProfile>({
    firstNames: "Estudiante",
    lastNames: "Demo",
    email: "estudiante.demo@auligma.test",
    universityCode: "DEM-EST-01",
    phone: "",
    school: "Ingeniería de Sistemas",
  });
  const [teacherProfile, setTeacherProfile] = useState<TeacherProfile>({
    firstNames: "Docente",
    lastNames: "Demo",
    email: "docente.demo@auligma.test",
    phone: "",
    professionalInfo: "Docencia universitaria en matemáticas",
  });

  function toggleTheme() {
    setDark((value) => !value);
  }

  return (
    <Context.Provider
      value={{
        bank,
        setBank,
        assessments,
        setAssessments,
        concentration,
        setConcentration,
        classrooms,
        setClassrooms,
        review,
        setReview,
        dark,
        toggleTheme,
        studentProfile,
        setStudentProfile,
        teacherProfile,
        setTeacherProfile,
      }}
    >
      <div data-theme={dark ? "dark" : "light"} className="theme-root">
        {children}
      </div>
    </Context.Provider>
  );
}

export function useDemo() {
  const value = useContext(Context);
  if (!value) throw new Error("Falta el contexto de demostración");
  return value;
}
