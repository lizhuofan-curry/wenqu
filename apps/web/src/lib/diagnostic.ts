import type {
  DiagnosticConfidence,
  DiagnosticQuestion,
  DiagnosticResult,
} from "./types";

const ATTEMPT_PREFIX = "wenqu:diagnostic-attempt:v1";
const ATTEMPT_ID_PATTERN = /^dg_[0-9a-f]{32}$/;

export type DiagnosticRouteState = "following" | "manual" | "dismissed";
export type DiagnosticRouteEvent = "follow" | "manual" | "dismiss";

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

export function resolveRecommendedSectionIds(
  recommendedPath: string[],
  validSectionIds: string[],
) {
  const valid = new Set(validSectionIds);
  const seen = new Set<string>();
  return recommendedPath.filter((sectionId) => {
    if (!valid.has(sectionId) || seen.has(sectionId)) return false;
    seen.add(sectionId);
    return true;
  });
}

export function resolveInitialSectionIndex(
  mode: "recommended" | "beginning",
  requestedSectionId: string | null | undefined,
  recommendedPath: string[],
  validSectionIds: string[],
) {
  if (mode === "beginning") return 0;
  const ordered = resolveRecommendedSectionIds(recommendedPath, validSectionIds);
  const requestedIndex = requestedSectionId ? validSectionIds.indexOf(requestedSectionId) : -1;
  if (requestedIndex >= 0) return requestedIndex;
  const firstRecommendedIndex = ordered.length > 0 ? validSectionIds.indexOf(ordered[0]) : -1;
  return Math.max(0, firstRecommendedIndex);
}

export function transitionDiagnosticRoute(
  current: DiagnosticRouteState,
  event: DiagnosticRouteEvent,
  frozen = false,
): DiagnosticRouteState {
  if (frozen) return current;
  if (event === "follow") return "following";
  if (event === "dismiss") return "dismissed";
  return "manual";
}

export function updateDiagnosticReviewQueue(
  queue: string[],
  sectionId: string,
  needsReview: boolean,
) {
  if (needsReview) return queue.includes(sectionId) ? queue : [...queue, sectionId];
  return queue.filter((item) => item !== sectionId);
}

export function canStartDiagnosticQuiz(reviewQueue: string[]) {
  return reviewQueue.length === 0;
}

export function diagnosticRoutePosition(recommendedPath: string[], sectionId: string) {
  const index = recommendedPath.indexOf(sectionId);
  return index >= 0 ? { current: index + 1, total: recommendedPath.length } : null;
}
