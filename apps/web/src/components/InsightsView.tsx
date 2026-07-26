import {
  ArrowUpRight,
  BookCheck,
  BrainCircuit,
  Clock3,
  Flame,
  Target,
} from "lucide-react";
import type { ArchiveItem } from "../lib/types";

export function InsightsView({
  items,
  onReview,
}: {
  items: ArchiveItem[];
  onReview: () => void;
}) {
  const averageMastery = items.length
    ? Math.round(items.reduce((sum, item) => sum + item.mastery, 0) / items.length)
    : 0;
  const bars = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - offset));
    const day = date.toLocaleDateString("zh-CN");
    const values = items.filter(
      (item) => new Date(item.completed_at).toLocaleDateString("zh-CN") === day,
    );
    return values.length
      ? Math.max(12, Math.round(values.reduce((sum, item) => sum + item.mastery, 0) / values.length))
      : 4;
  });
  return (
    <div className="standard-page page-enter">
      <header className="page-header">
        <div>
          <p className="eyebrow">不是读了多少，而是留下多少</p>
          <h1>学习洞察</h1>
          <p>从学习时间、主动回忆和掌握度观察自己的进步。</p>
        </div>
        <span className="date-chip">近 7 天</span>
      </header>
      <div className="metric-grid">
        <Metric icon={<Clock3 />} label="估算学习" value={String(items.length * 18)} unit="分钟" change="来自真实档案" />
        <Metric icon={<BookCheck />} label="完成学习" value={String(items.length)} unit="次" change="浏览器记录" />
        <Metric icon={<BrainCircuit />} label="平均掌握度" value={String(averageMastery)} unit="%" change="按已完成记录" />
        <Metric icon={<Flame />} label="有效记录" value={String(items.length)} unit="条" change="可导出核对" />
      </div>
      <div className="insight-layout">
        <section className="panel chart-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">学习节奏</p>
              <h3>每天投入的有效时间</h3>
            </div>
            <span className="trend-up">
              <ArrowUpRight size={15} />
              稳步上升
            </span>
          </div>
          <div className="bar-chart" aria-label="最近七天学习时长柱状图">
            {bars.map((height, index) => (
              <div className="bar-column" key={height + index}>
                <strong style={{ height: `${height}%` }} />
                <span>{"一二三四五六日"[index]}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="panel mastery-panel">
          <p className="eyebrow">能力雷达</p>
          <h3>你最稳定的学习动作</h3>
          <div className="mastery-ring">
            <strong>{averageMastery}</strong>
            <span>综合掌握</span>
          </div>
          <div className="skill-lines">
            <Skill label="概念辨析" value={averageMastery} />
            <Skill label="张量推导" value={averageMastery} />
            <Skill label="结构定位" value={Math.max(0, averageMastery - 8)} />
          </div>
        </section>
      </div>
      <section className="panel suggestion-panel">
        <div className="suggestion-icon">
          <Target size={23} />
        </div>
        <div>
          <p className="eyebrow">今日建议</p>
          <h3>回看 SENet Figure 3，只需要 8 分钟</h3>
          <p>你的概念解释已经稳定，下一步应集中修正 residual 分支的插入位置。</p>
        </div>
        <button onClick={onReview}>开始复习</button>
      </section>
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
