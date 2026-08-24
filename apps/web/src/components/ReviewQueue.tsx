import { ArrowRight, CalendarClock, CheckCircle2, Clock3 } from "lucide-react";
import type { ReviewTask } from "../lib/types";
import { isReviewDue, reviewTimingLabel } from "../lib/reviews";

type ReviewQueueProps = {
  tasks: ReviewTask[];
  busy: boolean;
  onStart: (task: ReviewTask) => void;
};

export function ReviewQueue({ tasks, busy, onStart }: ReviewQueueProps) {
  const dueTasks = tasks.filter((task) => isReviewDue(task));
  const visibleTasks = (dueTasks.length ? dueTasks : tasks).slice(0, 3);

  return (
    <section className="review-queue" aria-labelledby="review-queue-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">间隔回忆</p>
          <h3 id="review-queue-title">今日复习</h3>
        </div>
        <span className={`review-count${dueTasks.length ? " due" : ""}`}>
          <CalendarClock size={16} />
          {dueTasks.length ? `${dueTasks.length} 项到期` : "暂无到期"}
        </span>
      </div>

      {visibleTasks.length === 0 ? (
        <div className="review-empty">
          <CheckCircle2 size={24} />
          <div>
            <strong>今天还没有复习任务</strong>
            <p>完成一次学习后，会自动安排第 1、3、7 天的主动回忆。</p>
          </div>
        </div>
      ) : (
        <div className="review-list">
          {visibleTasks.map((task) => {
            const due = isReviewDue(task);
            return (
              <article className={`review-item${due ? " due" : ""}`} key={task.id}>
                <div className="review-day">
                  <strong>D{task.interval_days}</strong>
                  <span>第 {task.interval_days} 天</span>
                </div>
                <div className="review-copy">
                  <small>
                    <Clock3 size={13} />
                    {reviewTimingLabel(task)} · 上次 {task.source_mastery}%
                  </small>
                  <h4>{task.material_title}</h4>
                  <p>
                    {task.source_misconception_tags.length
                      ? `重点检查：${task.source_misconception_tags.join("、")}`
                      : "不看原文，先确认核心概念还能否完整复述。"}
                  </p>
                </div>
                <button onClick={() => onStart(task)} disabled={busy || !due}>
                  {due ? "开始复习" : "尚未到期"}
                  {due && <ArrowRight size={16} />}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
