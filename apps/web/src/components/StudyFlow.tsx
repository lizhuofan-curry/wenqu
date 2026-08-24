import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  BrainCircuit,
  Check,
  ChevronRight,
  CircleHelp,
  Quote,
  Send,
  Sparkles,
  Target,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { Material, Persona, ReviewTask, Session } from "../lib/types";
import { ReviewComparison } from "./ReviewComparison";

type Stage = "map" | "read" | "quiz" | "retell" | "result";

type StudyFlowProps = {
  material: Material;
  session: Session;
  persona: Persona;
  busy: boolean;
  reviewTask?: ReviewTask;
  onEvaluate: (
    answers: Array<{ question_id: string; response: string }>,
    retelling: string,
  ) => void;
  onExit: () => void;
};

const fullStageOrder: Stage[] = ["map", "read", "quiz", "retell", "result"];
const reviewStageOrder: Stage[] = ["quiz", "retell", "result"];
const stageLabels = {
  map: "材料地图",
  read: "双轨跟读",
  quiz: "理解测验",
  retell: "用话复述",
  result: "学习诊断",
};

export function StudyFlow({
  material,
  session,
  persona,
  busy,
  onEvaluate,
  onExit,
  reviewTask,
}: StudyFlowProps) {
  const [stage, setStage] = useState<Stage>(session.result ? "result" : reviewTask ? "quiz" : "map");
  const [sectionIndex, setSectionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [retelling, setRetelling] = useState("");
  const activeSection = material.sections[sectionIndex];
  const result = session.result;
  const activeStageOrder = reviewTask ? reviewStageOrder : fullStageOrder;
  const currentIndex = activeStageOrder.indexOf(stage);
  const quizComplete = material.questions.every((question) =>
    Boolean(answers[question.id]?.trim()),
  );
  const retellingReady = retelling.trim().length >= 20;

  const progress = useMemo(() => {
    if (stage === "result") return 100;
    return Math.round(((currentIndex + 1) / activeStageOrder.length) * 100);
  }, [activeStageOrder.length, currentIndex, stage]);

  useEffect(() => {
    if (session.result) {
      setStage("result");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [session.result]);

  if (!session.result && (!material.sections.length || !material.questions.length)) {
    return (
      <div className="study-flow page-enter">
        <div className="global-error" role="alert">
          这份材料尚未生成完整的讲解与题目，当前不能开始学习或评分。
          <button onClick={onExit}>返回资料库</button>
        </div>
      </div>
    );
  }

  function goNext() {
    const next = activeStageOrder[Math.min(currentIndex + 1, activeStageOrder.length - 1)];
    setStage(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="study-flow page-enter">
      <header className="study-header">
        <button className="back-button" onClick={onExit}>
          <ArrowLeft size={18} />
          返回阅读室
        </button>
        <div className="study-title">
          <span>{material.difficulty}</span>
          <h1>{material.title}</h1>
        </div>
        <div className="study-persona">
          <span className={`persona-avatar ${persona.id}`}>{persona.name.slice(0, 1)}</span>
          <div>
            <small>本次陪读</small>
            <strong>{persona.name}</strong>
          </div>
        </div>
      </header>

      <div className="progress-shell">
        <div className="progress-steps">
          {activeStageOrder.map((item, index) => (
            <button
              key={item}
              className={index <= currentIndex ? "done" : ""}
              onClick={() => {
                if (index <= currentIndex || session.result) setStage(item);
              }}
            >
              <span>{index < currentIndex || stage === "result" ? <Check size={13} /> : index + 1}</span>
              {stageLabels[item]}
            </button>
          ))}
        </div>
        <div className="progress-bar">
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>

      {material.generation?.status === "fallback" && (
        <div className="global-error" role="status">
          {material.generation.message} 题目当前为通用保底题，不应视为材料专属题。
        </div>
      )}

      {stage === "map" && (
        <section className="study-stage map-stage">
          <div className="stage-intro">
            <p className="eyebrow">先看全局，再进细节</p>
            <h2>这份材料到底在讲什么？</h2>
            <p>先建立地图。你不需要一上来就从摘要硬啃到参考文献。</p>
          </div>
          <div className="map-grid">
            {material.map.map((item, index) => (
              <article className={`map-card map-${item.key}`} key={item.key}>
                <span className="map-index">0{index + 1}</span>
                <h3>{item.title}</h3>
                <p>{item.summary}</p>
                <SourceBadge source={item.source} />
              </article>
            ))}
          </div>
          <div className="goals-card">
            <div>
              <Target size={24} />
              <span>
                <small>完成后你应该能</small>
                <strong>三个学习目标</strong>
              </span>
            </div>
            <ol>
              {material.learning_goals.map((goal) => (
                <li key={goal}>{goal}</li>
              ))}
            </ol>
          </div>
          <StageAction onClick={goNext}>进入双轨讲解</StageAction>
        </section>
      )}

      {stage === "read" && (
        <section className="study-stage read-stage">
          <div className="section-tabs">
            {material.sections.map((section, index) => (
              <button
                key={section.id}
                className={index === sectionIndex ? "active" : ""}
                onClick={() => setSectionIndex(index)}
              >
                <span>{index + 1}</span>
                {section.title}
              </button>
            ))}
          </div>
          <div className="stage-intro compact">
            <p className="eyebrow">{activeSection.eyebrow}</p>
            <h2>{activeSection.title}</h2>
            <SourceBadge source={activeSection.source} />
          </div>
          <div className="dual-track">
            <article className="track-card strict-track">
              <div className="track-title">
                <BookOpenCheck size={20} />
                <div>
                  <small>STRICT TRACK</small>
                  <h3>严格轨</h3>
                </div>
              </div>
              <p>{activeSection.strict_track}</p>
              <div className="track-footnote">
                <CircleHelp size={16} />
                测验与诊断只依据严格轨和原文证据。
              </div>
            </article>
            <article className="track-card companion-track">
              <div className="track-title">
                <Sparkles size={20} />
                <div>
                  <small>COMPANION TRACK</small>
                  <h3>{persona.name}怎么讲</h3>
                </div>
              </div>
              <Quote size={26} className="quote-mark" />
              <p>{activeSection.companion_track}</p>
              <div className="persona-says">{persona.accent}</div>
            </article>
          </div>
          <div className="section-pager">
            <button
              onClick={() => setSectionIndex((value) => Math.max(0, value - 1))}
              disabled={sectionIndex === 0}
            >
              <ArrowLeft size={16} />
              上一节
            </button>
            <span>
              {sectionIndex + 1} / {material.sections.length}
            </span>
            {sectionIndex < material.sections.length - 1 ? (
              <button onClick={() => setSectionIndex((value) => value + 1)}>
                下一节
                <ArrowRight size={16} />
              </button>
            ) : (
              <button className="accent" onClick={goNext}>
                我读完了，开始测验
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        </section>
      )}

      {stage === "quiz" && (
        <section className="study-stage quiz-stage">
          <div className="stage-intro">
            <p className="eyebrow">主动回忆</p>
            <h2>先回答，再看自己是不是真懂</h2>
            <p>答案提交前不会显示标准答案。卡住恰恰说明这里值得回看。</p>
          </div>
          {reviewTask && (
            <div className="review-mode-note">
              <strong>第 {reviewTask.interval_days} 天复习 · 先回忆，不回看原文</strong>
              <p>上次掌握度 {reviewTask.source_mastery}%。重点检查：{reviewTask.source_misconception_tags.join("、") || "核心概念能否完整复述"}</p>
            </div>
          )}

          <div className="question-list">
            {material.questions.map((question, index) => (
              <article className="question-card" key={question.id}>
                <div className="question-top">
                  <span>0{index + 1}</span>
                  <small>{question.kind.toUpperCase()}</small>
                  <SourceBadge source={question.source} />
                </div>
                <h3>{question.prompt}</h3>
                {question.hint && <p className="hint">提示：{question.hint}</p>}
                <textarea
                  value={answers[question.id] || ""}
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      [question.id]: event.target.value,
                    }))
                  }
                  placeholder="用自己的话回答，不用追求像标准答案……"
                  rows={4}
                />
                <span className="char-count">{answers[question.id]?.length || 0} 字</span>
              </article>
            ))}
          </div>
          <StageAction onClick={goNext} disabled={!quizComplete}>
            完成答题，进入复述
          </StageAction>
        </section>
      )}

      {stage === "retell" && (
        <section className="study-stage retell-stage">
          <div className="retell-card">
            <div className="retell-icon">
              <BrainCircuit size={32} />
            </div>
            <p className="eyebrow">最后一步 · 让知识变成你的</p>
            <h2>不用看上文，用 3—5 句话讲清楚</h2>
            <blockquote>
              这篇论文发现了什么问题？Squeeze、Excitation 和 Scale 如何工作？
              它为什么能接入 ResNet？
            </blockquote>
            <textarea
              value={retelling}
              onChange={(event) => setRetelling(event.target.value)}
              placeholder="我理解的 SENet 是……"
              rows={9}
            />
            <div className="retell-meta">
              <span className={retellingReady ? "ready" : ""}>
                {retelling.length} 字 · 至少 20 字
              </span>
              <span>系统会检查遗漏、混淆和错误</span>
            </div>
            <button
              className="primary-button wide"
              disabled={!retellingReady || busy}
              onClick={() =>
                onEvaluate(
                  material.questions.map((question) => ({
                    question_id: question.id,
                    response: answers[question.id],
                  })),
                  retelling,
                )
              }
            >
              提交复述并生成诊断
              <Send size={18} />
            </button>
            {busy && (
              <div className="eval-overlay">
                <div className="eval-loader">
                  <div className="eval-rings">
                    <span />
                    <span />
                    <span />
                  </div>
                  <strong>AI 正在分析你的回答…</strong>
                  <p>逐题对比原文证据，找出理解偏差和遗漏</p>
                  <div className="eval-steps">
                    <span className="done">逐题评分</span>
                    <span className="active">错因诊断</span>
                    <span>生成反馈</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {stage === "result" && result && (
        <section className="study-stage result-stage">
          <div className="result-hero">
            <div className="score-ring" style={{ "--score": result.mastery } as CSSProperties}>
              <strong>{result.mastery}</strong>
              <span>掌握度</span>
            </div>
            <div>
              <p className="eyebrow">本次学习诊断</p>
              <h2>{result.headline}</h2>
              <p>{result.summary}</p>
              <span className="evaluator-chip">
                {result.evaluator === "rules" ? "证据规则评分" : "AI + 评分规则"}
              </span>
            </div>
          </div>

          {reviewTask && <ReviewComparison task={reviewTask} result={result} />}

          <div className="diagnosis-grid">
            {result.question_results.map((item, index) => (
              <article className="diagnosis-card" key={item.question_id}>
                <div className="diagnosis-head">
                  <span>题目 {index + 1}</span>
                  <strong>
                    {item.score}/{item.max_score}
                  </strong>
                  <small className={item.verdict}>{item.verdict}</small>
                </div>
                <p>{item.feedback}</p>
                <SourceBadge source={item.source} />
              </article>
            ))}
          </div>

          {result.misconception_tags.length > 0 && (
            <div className="misconceptions">
              <h3>这次暴露出的错因</h3>
              <div>
                {result.misconception_tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </div>
          )}

          <div className="next-step-card">
            <div>
              <Target size={24} />
              <span>
                <small>下一步</small>
                <strong>{result.next_step}</strong>
              </span>
            </div>
            <button onClick={onExit}>
              保存到阅读档案
              <ChevronRight size={17} />
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function SourceBadge({ source }: { source: { label: string; detail?: string | null } }) {
  return (
    <span className="source-badge" title={source.detail || undefined}>
      {source.label}
      {source.detail && <em> · {source.detail}</em>}
    </span>
  );
}

function StageAction({
  children,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="stage-action">
      <button className="primary-button" onClick={onClick} disabled={disabled}>
        {children}
        <ArrowRight size={18} />
      </button>
    </div>
  );
}
