import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canSubmitDiagnostic,
  canStartDiagnosticQuiz,
  diagnosticAttemptKey,
  diagnosticRoutePosition,
  readDiagnosticAttemptId,
  resolveInitialSectionIndex,
  resolveRecommendedSectionIds,
  resolveDiagnosticSection,
  transitionDiagnosticRoute,
  updateDiagnosticReviewQueue,
  writeDiagnosticAttemptId,
} from "./diagnostic.ts";

const storage = new Map();
const adapter = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
};

assert.notEqual(
  diagnosticAttemptKey("user-a", "senet-cvpr-2018"),
  diagnosticAttemptKey("user-b", "senet-cvpr-2018"),
);
assert.equal(writeDiagnosticAttemptId(adapter, "user-a", "senet-cvpr-2018", "invalid"), false);
const attemptId = `dg_${"a".repeat(32)}`;
assert.equal(writeDiagnosticAttemptId(adapter, "user-a", "senet-cvpr-2018", attemptId), true);
assert.equal(readDiagnosticAttemptId(adapter, "user-a", "senet-cvpr-2018"), attemptId);
assert.equal(readDiagnosticAttemptId(adapter, "user-b", "senet-cvpr-2018"), null);

const questions = [{ id: "q1" }, { id: "q2" }, { id: "q3" }];
assert.equal(canSubmitDiagnostic(questions, { q1: "low", q2: "medium" }), false);
assert.equal(canSubmitDiagnostic(questions, { q1: "low", q2: "medium", q3: "high" }), true);
assert.equal(
  resolveDiagnosticSection({
    objective_results: [],
    recommended_section_id: null,
    recommended_path: ["excitation", "scale"],
    route_type: "focused",
    route_reason: "test",
  }),
  "excitation",
);

const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
const sourceBetween = (source, start, end) => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `missing source boundary: ${start}`);
  return source.slice(startIndex, endIndex);
};

const studyFlowSource = readFileSync(new URL("../components/StudyFlow.tsx", import.meta.url), "utf8");
assert.match(
  appSource,
  /sectionId:\s*mode === "recommended" \? resolveDiagnosticSection\(result\) : undefined/,
);
assert.match(
  studyFlowSource,
  /const initialSectionIndex = resolveInitialSectionIndex\(\s*diagnosticPlan\?\.mode \?\? "beginning",\s*diagnosticPlan\?\.sectionId,\s*recommendedIds,\s*sectionIds,\s*\);/,
);

const sectionIds = ["squeeze", "excitation", "scale"];
assert.deepEqual(resolveRecommendedSectionIds(["scale", "missing", "excitation", "scale"], sectionIds), ["scale", "excitation"]);
assert.deepEqual(resolveRecommendedSectionIds([], sectionIds), []);
assert.equal(resolveInitialSectionIndex("beginning", "scale", ["scale"], sectionIds), 0);
assert.equal(resolveInitialSectionIndex("recommended", "scale", ["excitation"], sectionIds), 2);
assert.equal(resolveInitialSectionIndex("recommended", "missing", ["excitation"], sectionIds), 1);
assert.equal(resolveInitialSectionIndex("recommended", null, ["missing"], sectionIds), 0);
assert.equal(transitionDiagnosticRoute("following", "manual"), "manual");
assert.equal(transitionDiagnosticRoute("manual", "dismiss"), "dismissed");
assert.equal(transitionDiagnosticRoute("dismissed", "follow"), "following");
assert.equal(transitionDiagnosticRoute("following", "manual", true), "following");
assert.deepEqual(updateDiagnosticReviewQueue([], "scale", true), ["scale"]);
assert.deepEqual(updateDiagnosticReviewQueue(["scale"], "scale", true), ["scale"]);
assert.deepEqual(updateDiagnosticReviewQueue(["scale", "excitation"], "scale", false), ["excitation"]);
assert.equal(canStartDiagnosticQuiz(["scale"]), false);
assert.equal(canStartDiagnosticQuiz([]), true);
assert.deepEqual(diagnosticRoutePosition(["scale", "excitation"], "excitation"), { current: 2, total: 2 });
assert.equal(diagnosticRoutePosition(["scale", "excitation"], "squeeze"), null);

const routeStateIdentifiers = /\b(?:diagnosticPlan|routeState|reviewQueue|understoodSectionIds|checkpointActive|quizStarted)\b/;
const formalEvaluate = sourceBetween(
  appSource,
  "  async function evaluate(",
  "  async function retryPendingSync(",
);
assert.doesNotMatch(formalEvaluate, routeStateIdentifiers);

const formalApiEvaluate = sourceBetween(
  apiSource,
  "  evaluate: async (",
  "  upload: async (file: File)",
);
assert.doesNotMatch(formalApiEvaluate, /\b(?:diagnostic_plan|adaptive_route|route_state|review_queue|needs_review|visited_sections)\b/);
assert.match(formalApiEvaluate, /body:\s*JSON\.stringify\(\{\s*answers,\s*retelling,\s*material_id: materialId,\s*persona_id: personaId,\s*questions,\s*expected_user_id: expectedUserId,\s*review_source_session_id:/);

const startStudy = sourceBetween(appSource, "  async function startStudy(", "  async function startDiagnostic(");
assert.match(startStudy, /setDiagnosticPlan\(studyPlan \|\| null\)/);
const startReview = sourceBetween(appSource, "  function startReview(task: ReviewTask)", "  async function startTransfer(");
assert.match(startReview, /startStudy\(task\.material_id, undefined, task\)/);
assert.doesNotMatch(startReview, routeStateIdentifiers);
assert.match(studyFlowSource, /reviewTask\s*\?\s*"quiz"/);
assert.match(studyFlowSource, /const activeStageOrder = reviewTask\s*\?\s*reviewStageOrder/);
assert.match(studyFlowSource, /diagnosticPlan && !reviewTask/);

console.log("diagnostic-ui: 35 assertions passed");
