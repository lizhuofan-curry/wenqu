import type { ArchiveItem, EvaluationResult } from "./types";

export const RETENTION_INTERVALS = [1, 3, 7] as const;
export const RETENTION_METHODOLOGY_VERSION = "retention-v1";

export type RetentionIntervalReport = {
  intervalDays: 1 | 3 | 7;
  eligibleCount: number;
  observedCount: number;
  missingCount: number;
  onTimeCount: number;
  lateCount: number;
  excludedCount: number;
  retentionRate?: number;
  baselineScore?: number;
  delayedScore?: number;
  scoreDeltaPp?: number;
  actualDelayMedianDays?: number;
  actualDelayRangeDays?: [number, number];
};

export type RetentionReport = {
  status: "no_baseline" | "awaiting" | "ready";
  baselineCount: number;
  eligibleCount: number;
  observedCount: number;
  coverage?: number;
  excludedCount: number;
  intervals: RetentionIntervalReport[];
  methodologyVersion: typeof RETENTION_METHODOLOGY_VERSION;
};

type Points = {
  baselineEarned: number;
  delayedEarned: number;
  maximum: number;
  retained: number;
};

function timestamp(value: string | undefined) {
  if (!value) return undefined;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : undefined;
}

function trustedBaseline(item: ArchiveItem) {
  return (
    item.server_verified === true &&
    !item.review &&
    !item.transfer &&
    Boolean(item.rubric_fingerprint) &&
    Boolean(item.result) &&
    timestamp(item.completed_at) !== undefined
  );
}

function scoreMap(result: EvaluationResult) {
  const scores = new Map<string, { score: number; maximum: number }>();
  for (const row of result.question_results || []) {
    if (
      row.question_id &&
      Number.isFinite(row.score) &&
      Number.isFinite(row.max_score) &&
      row.max_score > 0
    ) {
      scores.set(row.question_id, {
        score: Math.max(0, Math.min(row.score, row.max_score)),
        maximum: row.max_score,
      });
    }
  }
  return scores;
}

function pairedPoints(
  baseline: EvaluationResult,
  delayed: EvaluationResult,
): Points | undefined {
  if (baseline.evaluator !== delayed.evaluator) return undefined;
  const sourceScores = scoreMap(baseline);
  const delayedScores = scoreMap(delayed);
  if (!sourceScores.size || delayedScores.size !== sourceScores.size) {
    return undefined;
  }
  let baselineEarned = 0;
  let delayedEarned = 0;
  let maximum = 0;
  let retained = 0;

  for (const [key, source] of sourceScores) {
    const followup = delayedScores.get(key);
    if (!followup || followup.maximum !== source.maximum) return undefined;
    baselineEarned += source.score;
    delayedEarned += followup.score;
    maximum += source.maximum;
    retained += Math.min(source.score, followup.score);
  }
  if (maximum <= 0 || baselineEarned <= 0) return undefined;
  return { baselineEarned, delayedEarned, maximum, retained };
}

function validMeasurement(
  review: ArchiveItem,
  baseline: ArchiveItem,
  intervalDays: 1 | 3 | 7,
) {
  const link = review.review;
  const sourceTime = timestamp(baseline.completed_at);
  const reviewTime = timestamp(review.completed_at);
  if (
    review.server_verified !== true ||
    review.transfer ||
    !review.result ||
    !link ||
    link.measurement_version !== 1 ||
    link.interval_days !== intervalDays ||
    link.source_session_id !== baseline.session_id ||
    review.material_id !== baseline.material_id ||
    link.source_rubric_fingerprint !== baseline.rubric_fingerprint ||
    review.rubric_fingerprint !== baseline.rubric_fingerprint ||
    sourceTime === undefined ||
    reviewTime === undefined
  ) {
    return false;
  }
  const dueTime = sourceTime + intervalDays * 86_400_000;
  const declaredSourceTime = timestamp(link.source_completed_at);
  const declaredDueTime = timestamp(link.due_at);
  const declaredReviewTime = timestamp(link.review_completed_at);
  return (
    reviewTime >= dueTime &&
    declaredSourceTime === sourceTime &&
    declaredDueTime === dueTime &&
    declaredReviewTime === reviewTime &&
    link.actual_delay_seconds === Math.floor((reviewTime - sourceTime) / 1000)
  );
}

function rounded(value: number) {
  return Math.round(value * 10) / 10;
}

function median(values: number[]) {
  if (!values.length) return undefined;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

export function buildRetentionReport(
  items: ArchiveItem[],
  now = new Date(),
): RetentionReport {
  const baselines = items.filter(trustedBaseline);
  const reviews = items.filter((item) => Boolean(item.review));
  const excludedSessionIds = new Set(
    reviews
      .filter(
        (review) =>
          review.server_verified !== true ||
          review.review?.measurement_version !== 1,
      )
      .map((review) => review.session_id),
  );

  const intervals = RETENTION_INTERVALS.map((intervalDays) => {
    const eligible = baselines.filter((baseline) => {
      const sourceTime = timestamp(baseline.completed_at);
      return (
        sourceTime !== undefined &&
        sourceTime + intervalDays * 86_400_000 <= now.getTime()
      );
    });
    const points: Points[] = [];
    const delays: number[] = [];
    let onTimeCount = 0;
    let lateCount = 0;
    const intervalExcludedSessionIds = new Set<string>();

    for (const baseline of eligible) {
      const candidates = reviews
        .filter(
          (review) =>
            review.review?.source_session_id === baseline.session_id &&
            review.review.interval_days === intervalDays,
        )
        .sort((a, b) => a.completed_at.localeCompare(b.completed_at));
      let accepted = false;
      for (const review of candidates) {
        if (accepted || !validMeasurement(review, baseline, intervalDays)) {
          intervalExcludedSessionIds.add(review.session_id);
          excludedSessionIds.add(review.session_id);
          continue;
        }
        const comparison = pairedPoints(baseline.result!, review.result!);
        if (!comparison) {
          intervalExcludedSessionIds.add(review.session_id);
          excludedSessionIds.add(review.session_id);
          continue;
        }
        accepted = true;
        points.push(comparison);
        delays.push(
          (Date.parse(review.completed_at) - Date.parse(baseline.completed_at)) /
            86_400_000,
        );
        if (review.review?.timing_status === "on_time") onTimeCount += 1;
        else lateCount += 1;
      }
    }

    const totals = points.reduce(
      (sum, row) => ({
        baselineEarned: sum.baselineEarned + row.baselineEarned,
        delayedEarned: sum.delayedEarned + row.delayedEarned,
        maximum: sum.maximum + row.maximum,
        retained: sum.retained + row.retained,
      }),
      { baselineEarned: 0, delayedEarned: 0, maximum: 0, retained: 0 },
    );
    const delayMedian = median(delays);
    return {
      intervalDays,
      eligibleCount: eligible.length,
      observedCount: points.length,
      missingCount: Math.max(0, eligible.length - points.length),
      onTimeCount,
      lateCount,
      excludedCount: intervalExcludedSessionIds.size,
      retentionRate: totals.baselineEarned
        ? rounded((totals.retained / totals.baselineEarned) * 100)
        : undefined,
      baselineScore: totals.maximum
        ? rounded((totals.baselineEarned / totals.maximum) * 100)
        : undefined,
      delayedScore: totals.maximum
        ? rounded((totals.delayedEarned / totals.maximum) * 100)
        : undefined,
      scoreDeltaPp: totals.maximum
        ? rounded(
            ((totals.delayedEarned - totals.baselineEarned) / totals.maximum) *
              100,
          )
        : undefined,
      actualDelayMedianDays:
        delayMedian === undefined ? undefined : rounded(delayMedian),
      actualDelayRangeDays: delays.length
        ? [rounded(Math.min(...delays)), rounded(Math.max(...delays))]
        : undefined,
    } satisfies RetentionIntervalReport;
  });

  const eligibleCount = intervals.reduce(
    (sum, interval) => sum + interval.eligibleCount,
    0,
  );
  const observedCount = intervals.reduce(
    (sum, interval) => sum + interval.observedCount,
    0,
  );
  return {
    status:
      baselines.length === 0
        ? "no_baseline"
        : observedCount === 0
          ? "awaiting"
          : "ready",
    baselineCount: baselines.length,
    eligibleCount,
    observedCount,
    coverage: eligibleCount
      ? rounded((observedCount / eligibleCount) * 100)
      : undefined,
    excludedCount: excludedSessionIds.size,
    intervals,
    methodologyVersion: RETENTION_METHODOLOGY_VERSION,
  };
}
