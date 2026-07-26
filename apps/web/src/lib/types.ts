export type SourceRef = {
  label: string;
  detail?: string | null;
};

export type Persona = {
  id: string;
  name: string;
  tagline: string;
  tone: string;
  accent: string;
};

export type MaterialSummary = {
  id: string;
  title: string;
  subtitle: string;
  source_type: string;
  estimated_minutes: number;
  difficulty: string;
  progress: number;
  created_at: string;
};

export type MaterialMapItem = {
  key: "problem" | "method" | "evidence" | "conclusion" | "limitations";
  title: string;
  summary: string;
  source: SourceRef;
};

export type LearningSection = {
  id: string;
  title: string;
  eyebrow: string;
  strict_track: string;
  companion_track: string;
  source: SourceRef;
};

export type Question = {
  id: string;
  kind: "concept" | "tensor" | "structure" | "evidence";
  prompt: string;
  hint?: string | null;
  source: SourceRef;
};

export type Material = MaterialSummary & {
  map: MaterialMapItem[];
  learning_goals: string[];
  sections: LearningSection[];
  questions: Question[];
};

export type QuestionResult = {
  question_id: string;
  score: number;
  max_score: number;
  verdict: "掌握" | "部分掌握" | "需要回看";
  feedback: string;
  misconception_tags: string[];
  source: SourceRef;
};

export type EvaluationResult = {
  total_score: number;
  max_score: number;
  mastery: number;
  headline: string;
  summary: string;
  question_results: QuestionResult[];
  retelling: {
    score: number;
    max_score: number;
    feedback: string;
  };
  misconception_tags: string[];
  review_sources: SourceRef[];
  next_step: string;
  evaluator: "rules" | "openai";
};

export type Session = {
  id: string;
  material_id: string;
  persona_id: string;
  status: "active" | "completed";
  started_at: string;
  completed_at?: string | null;
  result?: EvaluationResult | null;
};

export type ArchiveItem = {
  session_id: string;
  material_id: string;
  material_title: string;
  persona_name: string;
  completed_at: string;
  mastery: number;
  headline: string;
  misconception_tags: string[];
  retelling: string;
};

