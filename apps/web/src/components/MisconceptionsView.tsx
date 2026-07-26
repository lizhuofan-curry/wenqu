import { ArrowRight, BookOpenCheck, GitBranch, Lightbulb, RotateCcw } from "lucide-react";

export function MisconceptionsView() {
  return (
    <div className="standard-page page-enter">
      <header className="page-header">
        <div>
          <p className="eyebrow">把“似懂非懂”变成可修正的问题</p>
          <h1>错因图谱</h1>
          <p>系统按概念关系整理误解，而不是只记录一道做错的题。</p>
        </div>
        <span className="date-chip warning">1 个待巩固</span>
      </header>
      <div className="misconception-layout">
        <section className="panel graph-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">SENet · 通道重标定</p>
              <h3>概念关联图</h3>
            </div>
            <GitBranch size={20} />
          </div>
          <div className="concept-graph">
            <span className="graph-line line-a" />
            <span className="graph-line line-b" />
            <span className="graph-line line-c" />
            <div className="concept-node core">SE Block</div>
            <div className="concept-node node-a">Squeeze</div>
            <div className="concept-node node-b">Excitation</div>
            <div className="concept-node node-c active">Residual 位置</div>
            <div className="concept-node node-d">Scale</div>
          </div>
          <div className="graph-legend">
            <span><i />已掌握</span>
            <span><i className="weak" />待巩固</span>
          </div>
        </section>
        <aside className="panel weak-detail">
          <span className="weak-icon"><Lightbulb size={22} /></span>
          <p className="eyebrow">当前误解</p>
          <h2>残差分支位置</h2>
          <p>你曾把 SE 放在 residual 与 identity 相加之后。论文 Figure 3 表明，SE 先缩放 residual 分支，再执行相加。</p>
          <div className="formula-compare">
            <span className="wrong">SE(F(x) + x)</span>
            <ArrowRight size={16} />
            <span className="right">SE(F(x)) + x</span>
          </div>
          <div className="evidence-note">
            <BookOpenCheck size={17} />
            <span><strong>证据位置</strong>PDF 第 4 页 · Figure 3</span>
          </div>
          <button className="primary-button wide">
            <RotateCcw size={17} />
            开始 8 分钟巩固
          </button>
        </aside>
      </div>
    </div>
  );
}
