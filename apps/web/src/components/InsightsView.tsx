import {
  ArrowUpRight,
  BrainCircuit,
  Clock3,
  Flame,
  Target,
} from "lucide-react";
import type { ArchiveItem } from "../lib/types";
import type { EvidenceMaterialSnapshot, EvidenceNoteCard } from "../lib/evidenceNotes";
import { buildRetentionReport } from "../lib/retention";
import { EvidenceNotesPanel } from "./EvidenceNotesPanel";
import { RetentionPanel } from "./RetentionPanel";

export function InsightsView({
  items,
  onReview,
  evidenceNotes,
  materials,
  evidenceMaterialSnapshots,
  evidenceMaterialId,
  onEditEvidenceNote,
  onDeleteEvidenceNote,
}: {
  items: ArchiveItem[];
  onReview: () => void;
  evidenceNotes: EvidenceNoteCard[];
  materials: import("../lib/types").MaterialSummary[];
  evidenceMaterialSnapshots: EvidenceMaterialSnapshot[];
  evidenceMaterialId?: string | null;
  onEditEvidenceNote: (note: EvidenceNoteCard, trigger: HTMLElement) => void;
  onDeleteEvidenceNote: (note: EvidenceNoteCard, nextFocus: HTMLElement | null) => void;
}) {
  const baselines = items.filter((item) => !item.review && !item.transfer);
  const reviews = items.filter((item) => Boolean(item.review));
  const transfers = items.filter((item) => Boolean(item.transfer));
  const averageMastery = baselines.length
    ? Math.round(
        baselines.reduce((sum, item) => sum + item.mastery, 0) /
          baselines.length,
      )
    : 0;
  const retention = buildRetentionReport(items);
  const total = Math.max(items.length, 1);
  const baselineShare = Math.round((baselines.length / total) * 100);
  const reviewShare = Math.round((reviews.length / total) * 100);
  const transferShare = Math.round((transfers.length / total) * 100);
  const bars = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - offset));
    const day = date.toLocaleDateString("zh-CN");
    const values = baselines.filter(
      (item) => new Date(item.completed_at).toLocaleDateString("zh-CN") === day,
    );
    return {
      height: values.length
        ? Math.max(12, Math.round(values.reduce((sum, item) => sum + item.mastery, 0) / values.length))
        : 4,
      label: date.toLocaleDateString("zh-CN", { weekday: "narrow" }),
      hasData: values.length > 0,
    };
  });
  return (
    <div className="standard-page page-enter">
      <header className="page-header">
        <div>
          <p className="eyebrow">不是读了多少，而是留下多少</p>
          <h1>学习洞察</h1>
          <p>分开观察原始学习、延迟复测与迁移检验，不用混合平均数制造趋势。</p>
        </div>
        <span className="date-chip">近 7 天</span>
      </header>
      <div className="metric-grid">
        <Metric icon={<Clock3 />} label="原始学习" value={String(baselines.length)} unit="次" change="不含复习与迁移" />
        <Metric icon={<BrainCircuit />} label="基线掌握度" value={String(averageMastery)} unit="%" change="只按原始学习记录" />
        <Metric icon={<Flame />} label="延迟复测" value={String(retention.observedCount)} unit="组" change={`${retention.eligibleCount} 次已到期机会`} />
      </div>
      <RetentionPanel report={retention} />
      <div className="insight-layout">
        <section className="panel chart-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">学习节奏</p>
              <h3>每日原始学习掌握度</h3>
            </div>
            <span className="trend-up">
              <ArrowUpRight size={15} />
              {bars.filter((bar) => bar.hasData).length} 天有基线记录
            </span>
          </div>
          <div className="bar-chart" aria-label="最近七天每日原始学习平均掌握度柱状图">
            {bars.map((bar, index) => (
              <div className="bar-column" key={index}>
                <strong style={{ height: `${bar.height}%` }} />
                <span>{bar.label}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="panel mastery-panel">
          <p className="eyebrow">档案构成</p>
          <h3>三类记录各自归位</h3>
          <div className="mastery-ring" style={{ "--score": String(averageMastery) } as React.CSSProperties}>
            <strong>{averageMastery}</strong>
            <span>基线平均</span>
          </div>
          <div className="skill-lines">
            <Skill label="原始学习" value={baselineShare} />
            <Skill label="延迟复测" value={reviewShare} />
            <Skill label="迁移检验" value={transferShare} />
          </div>
        </section>
      </div>
      <section className="panel suggestion-panel">
        <div className="suggestion-icon">
          <Target size={23} />
        </div>
        <div>
          <p className="eyebrow">今日建议</p>
          <h3>{baselines[0] ? `回看“${baselines[0].material_title}”` : "先完成一次原始学习"}</h3>
          <p>{retention.eligibleCount > retention.observedCount ? "已有到期但未完成的延迟复测，优先补齐可减少失访偏差。" : "按真实错因继续学习；样本不足时不自动声称能力已稳定。"}</p>
        </div>
        <button onClick={onReview}>开始复习</button>
      </section>
      <EvidenceNotesPanel
        notes={evidenceNotes}
        materials={materials}
        materialSnapshots={evidenceMaterialSnapshots}
        initialMaterialId={evidenceMaterialId}
        onEdit={onEditEvidenceNote}
        onDelete={onDeleteEvidenceNote}
      />
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  unit,
  change,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  change: string;
}) {
  return (
    <article className="metric-card">
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>
        {value}
        <small>{unit}</small>
      </strong>
      <em>{change}</em>
    </article>
  );
}

function Skill({ label, value }: { label: string; value: number }) {
  return (
    <div className="skill-line">
      <span>{label}</span>
      <div>
        <strong style={{ width: `${value}%` }} />
      </div>
      <small>{value}%</small>
    </div>
  );
}
