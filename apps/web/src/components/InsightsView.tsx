import {
  ArrowUpRight,
  BookCheck,
  BrainCircuit,
  Clock3,
  Flame,
  Target,
} from "lucide-react";

const bars = [38, 52, 46, 68, 58, 82, 72];

export function InsightsView() {
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
        <Metric icon={<Clock3 />} label="专注学习" value="126" unit="分钟" change="+18%" />
        <Metric icon={<BookCheck />} label="完成材料" value="3" unit="份" change="+1" />
        <Metric icon={<BrainCircuit />} label="平均掌握度" value="82" unit="%" change="+6%" />
        <Metric icon={<Flame />} label="连续学习" value="6" unit="天" change="最佳 9 天" />
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
            <strong>82</strong>
            <span>综合掌握</span>
          </div>
          <div className="skill-lines">
            <Skill label="概念辨析" value={88} />
            <Skill label="张量推导" value={84} />
            <Skill label="结构定位" value={72} />
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
        <button>开始复习</button>
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
