import assert from "node:assert/strict";
import { buildRetentionReport } from "./retention.ts";

const fingerprint = "a".repeat(64);

function result(scores, evaluator = "rules") {
  return {
    total_score: scores.reduce((sum, score) => sum + score, 0),
    max_score: 12,
    mastery: 50,
    headline: "test",
    summary: "test",
    question_results: scores.map((score, index) => ({
      question_id: `q${index + 1}`,
      score,
      max_score: 4,
      verdict: "部分掌握",
      feedback: "test",
      misconception_tags: [],
    })),
    retelling: { score: 4, max_score: 4, feedback: "ignored" },
    misconception_tags: [],
    review_sources: [],
    next_step: "test",
    evaluator,
  };
}

function baseline(scores = [2, 2, 2]) {
  return {
    session_id: "source",
    material_id: "material",
    material_title: "Material",
    persona_name: "Reader",
    completed_at: "2026-08-01T00:00:00.000Z",
    mastery: 50,
    headline: "baseline",
    misconception_tags: [],
    retelling: "baseline",
    server_verified: true,
    rubric_fingerprint: fingerprint,
    result: result(scores),
  };
}

function review({
  id = "review-d1",
  interval = 1,
  completedAt = "2026-08-02T12:00:00.000Z",
  scores = [4, 1, 2],
  version = 1,
  verified = true,
  evaluator = "rules",
} = {}) {
  const sourceAt = "2026-08-01T00:00:00.000Z";
  const dueAt = new Date(
    Date.parse(sourceAt) + interval * 86_400_000,
  ).toISOString();
  return {
    session_id: id,
    material_id: "material",
    material_title: "Material",
    persona_name: "Review",
    completed_at: completedAt,
    mastery: 58,
    headline: "review",
    misconception_tags: [],
    retelling: "review",
    server_verified: verified,
    rubric_fingerprint: fingerprint,
    result: result(scores, evaluator),
    review: {
      source_session_id: "source",
      interval_days: interval,
      source_completed_at: sourceAt,
      due_at: dueAt,
      review_completed_at: completedAt,
      actual_delay_seconds: Math.floor(
        (Date.parse(completedAt) - Date.parse(sourceAt)) / 1000,
      ),
      timing_status:
        Date.parse(completedAt) <= Date.parse(dueAt) + 86_400_000
          ? "on_time"
          : "late",
      source_rubric_fingerprint: fingerprint,
      measurement_version: version,
      prior_completed_intervals: [],
    },
  };
}

{
  const report = buildRetentionReport(
    [baseline(), review()],
    new Date("2026-08-10T00:00:00.000Z"),
  );
  assert.equal(report.status, "ready");
  assert.equal(report.baselineCount, 1);
  assert.equal(report.eligibleCount, 3);
  assert.equal(report.observedCount, 1);
  assert.equal(report.coverage, 33.3);
  assert.equal(report.intervals[0].retentionRate, 83.3);
  assert.equal(report.intervals[0].baselineScore, 50);
  assert.equal(report.intervals[0].delayedScore, 58.3);
  assert.equal(report.intervals[0].scoreDeltaPp, 8.3);
  assert.equal(report.intervals[0].actualDelayMedianDays, 1.5);
}

{
  const improved = review({ scores: [4, 4, 4] });
  const report = buildRetentionReport(
    [baseline(), improved],
    new Date("2026-08-03T00:00:00.000Z"),
  );
  assert.equal(report.intervals[0].retentionRate, 100);
  assert.equal(report.intervals[0].scoreDeltaPp, 50);
}

{
  const duplicate = review({
    id: "review-duplicate",
    completedAt: "2026-08-02T18:00:00.000Z",
  });
  const report = buildRetentionReport(
    [baseline(), review(), duplicate],
    new Date("2026-08-03T00:00:00.000Z"),
  );
  assert.equal(report.observedCount, 1);
  assert.equal(report.excludedCount, 1);
}
{
  const mismatchedMaterial = {
    ...review(),
    material_id: "other-material",
  };
  const report = buildRetentionReport(
    [baseline(), mismatchedMaterial],
    new Date("2026-08-03T00:00:00.000Z"),
  );
  assert.equal(report.observedCount, 0);
  assert.equal(report.excludedCount, 1);
}

{
  const untrusted = review({ verified: false });
  const report = buildRetentionReport(
    [baseline(), untrusted],
    new Date("2026-08-03T00:00:00.000Z"),
  );
  assert.equal(report.observedCount, 0);
  assert.equal(report.excludedCount, 1);
}

{
  const zero = buildRetentionReport(
    [baseline([0, 0, 0]), review()],
    new Date("2026-08-03T00:00:00.000Z"),
  );
  assert.equal(zero.status, "awaiting");
  assert.equal(zero.observedCount, 0);
}

{
  const incompatible = buildRetentionReport(
    [baseline(), review({ verified: false }), review({ id: "ai", evaluator: "ai" })],
    new Date("2026-08-03T00:00:00.000Z"),
  );
  assert.equal(incompatible.observedCount, 0);
  assert.ok(incompatible.excludedCount >= 2);
}

{
  const future = buildRetentionReport(
    [{ ...baseline(), completed_at: "2026-08-20T00:00:00.000Z" }],
    new Date("2026-08-10T00:00:00.000Z"),
  );
  assert.equal(future.eligibleCount, 0);
  assert.equal(future.coverage, undefined);
}

console.log("retention-v1: 8 scenarios passed");
