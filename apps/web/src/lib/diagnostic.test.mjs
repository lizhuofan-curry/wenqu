import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canSubmitDiagnostic,
  diagnosticAttemptKey,
  readDiagnosticAttemptId,
  resolveDiagnosticSection,
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
const studyFlowSource = readFileSync(new URL("../components/StudyFlow.tsx", import.meta.url), "utf8");
assert.match(
  appSource,
  /sectionId:\s*mode === "recommended" \? resolveDiagnosticSection\(result\) : undefined/,
);
assert.match(
  studyFlowSource,
  /diagnosticPlan\?\.mode === "recommended" && suggestedSectionIndex >= 0 \? suggestedSectionIndex : 0/,
);

console.log("diagnostic-ui: 9 assertions passed");
