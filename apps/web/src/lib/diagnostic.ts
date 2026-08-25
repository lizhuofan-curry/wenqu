import type {
  DiagnosticConfidence,
  DiagnosticQuestion,
  DiagnosticResult,
} from "./types";

const ATTEMPT_PREFIX = "wenqu:diagnostic-attempt:v1";
const ATTEMPT_ID_PATTERN = /^dg_[0-9a-f]{32}$/;

export function diagnosticAttemptKey(userId: string, materialId: string) {
  return `${ATTEMPT_PREFIX}:${encodeURIComponent(userId)}:${encodeURIComponent(materialId)}`;
}

export function readDiagnosticAttemptId(
  storage: Pick<Storage, "getItem">,
  userId: string,
  materialId: string,
) {
  try {
    const value = storage.getItem(diagnosticAttemptKey(userId, materialId));
    return value && ATTEMPT_ID_PATTERN.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeDiagnosticAttemptId(
  storage: Pick<Storage, "setItem">,
  userId: string,
  materialId: string,
  attemptId: string,
) {
  try {
    if (!ATTEMPT_ID_PATTERN.test(attemptId)) return false;
    storage.setItem(diagnosticAttemptKey(userId, materialId), attemptId);
    return true;
  } catch {
    return false;
  }
}

export function resolveDiagnosticSection(result: DiagnosticResult) {
  return result.recommended_section_id ?? result.recommended_path[0] ?? null;
}

export function canSubmitDiagnostic(
  questions: DiagnosticQuestion[],
  confidences: Partial<Record<string, DiagnosticConfidence>>,
) {
  return (
    questions.length > 0 &&
    questions.every((question) => Boolean(confidences[question.id]))
  );
}
