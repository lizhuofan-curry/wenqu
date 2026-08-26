import { ArrowRight, CheckCircle2, RotateCcw } from "lucide-react";
import type { EvaluationResult, ReviewTask } from "../lib/types";

export function ReviewComparison({
  task,
  result,
}: {
  task: ReviewTask;
  result: EvaluationResult;
}) {
  const remaining = result.misconception_tags;
  const resolved = task.source_misconception_tags.filter(
    (tag) => !remaining.includes(tag),
  );

  return (
    <section className="review-comparison" aria-labelledby="review-comparison-title">
      <p className="eyebrow">第 {task.interval_days} 天复习结果</p>
      <h3 id="review-comparison-title">和上一次相比</h3>
      <div className="review-score-change">
        <strong>{task.source_mastery}%</strong>
        <ArrowRight size={20} />
        <strong>{result.mastery}%</strong>
      </div>
      <div className="review-tag-groups">
        <div>
          <small><CheckCircle2 size={13} /> 本轮未再次检出</small>
          <p>{resolved.length ? resolved.join("、") : "本轮没有减少的错因标签"}</p>
        </div>
        <div>
          <small><RotateCcw size={13} /> 仍需巩固</small>
          <p>{remaining.length ? remaining.join("、") : "本轮没有识别到明显错因"}</p>
        </div>
      </div>
    </section>
  );
}
