import { CalendarClock, ShieldCheck } from "lucide-react";
import type {
  RetentionIntervalReport,
  RetentionReport,
} from "../lib/retention";

export function RetentionPanel({ report }: { report: RetentionReport }) {
  const emptyMessage =
    report.status === "no_baseline"
      ? "完成一次登录状态下的可信学习后，系统才会建立延迟基线。"
      : "尚未形成可比复测。到期后完成至少一次 D1、D3 或 D7 复习即可开始观察。";

  return (
    <section className="panel retention-panel" aria-labelledby="retention-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">同题、同版本、服务端验证</p>
          <h2 id="retention-heading">延迟保持率</h2>
          <p>
            比较原始学习中已经得到的题目分，经过 D1、D3、D7 后还保留了多少；新学会的部分另记为分数变化。
          </p>
        </div>
        <span className="retention-trust">
          <ShieldCheck size={16} aria-hidden="true" />
          retention-v1
        </span>
      </div>

      <dl className="retention-summary">
        <Summary label="可信基线" value={`${report.baselineCount} 条`} />
        <Summary label="可比复测" value={`${report.observedCount} / ${report.eligibleCount}`} />
        <Summary
          label="到期覆盖率"
          value={report.coverage === undefined ? "尚未到期" : `${report.coverage}%`}
        />
      </dl>

      {report.status === "ready" ? (
        <div className="retention-intervals">
          {report.intervals.map((interval) => (
            <IntervalRow key={interval.intervalDays} interval={interval} />
          ))}
        </div>
      ) : (
        <div className="retention-empty">
          <CalendarClock size={22} aria-hidden="true" />
          <p>{emptyMessage}</p>
        </div>
      )}

      <p className="retention-method">
        只汇总同一来源、同一评分版本、完整同题且评分器一致的服务端记录。迁移题、复述分、提前提交和旧历史记录不纳入。
        {report.excludedCount > 0
          ? ` 当前另有 ${report.excludedCount} 条记录因不可比或重复被排除。`
          : ""}
      </p>
      {report.observedCount > 0 && report.observedCount < 5 ? (
        <p className="retention-caution" role="note">
          样本较少：这些是个人观察值，不代表稳定趋势，也不能证明复习造成了提升。
        </p>
      ) : null}
    </section>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function IntervalRow({ interval }: { interval: RetentionIntervalReport }) {
  const delta =
    interval.scoreDeltaPp === undefined
      ? "暂无变化"
      : interval.scoreDeltaPp > 0
        ? `提高 ${interval.scoreDeltaPp} 个百分点`
        : interval.scoreDeltaPp < 0
          ? `下降 ${Math.abs(interval.scoreDeltaPp)} 个百分点`
          : "持平";
  const range = interval.actualDelayRangeDays;
  const delay =
    interval.actualDelayMedianDays === undefined
      ? "暂无实际间隔"
      : range && range[0] !== range[1]
        ? `实际中位 ${interval.actualDelayMedianDays} 天（${range[0]}–${range[1]} 天）`
        : `实际 ${interval.actualDelayMedianDays} 天`;

  return (
    <article className="retention-row">
      <div className="retention-label">
        <strong>D{interval.intervalDays}</strong>
        <span>计划 {interval.intervalDays} 天 · {delay}</span>
      </div>
      <div className="retention-score">
        <span>观察保持率</span>
        <strong>
          {interval.retentionRate === undefined
            ? "暂无可信样本"
            : `${interval.retentionRate}%`}
        </strong>
        {interval.baselineScore !== undefined && interval.delayedScore !== undefined ? (
          <small>
            题目分 {interval.baselineScore}% → {interval.delayedScore}% · {delta}
          </small>
        ) : null}
      </div>
      <div className="retention-sample">
        <strong>{interval.observedCount} / {interval.eligibleCount}</strong>
        <span>
          有效 / 到期 · 准时 {interval.onTimeCount} · 迟到 {interval.lateCount} ·
          未完成 {interval.missingCount}
        </span>
      </div>
    </article>
  );
}
