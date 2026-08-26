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
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  canStartDiagnosticQuiz,
  diagnosticRoutePosition,
  resolveInitialSectionIndex,
  resolveRecommendedSectionIds,
  transitionDiagnosticRoute,
  updateDiagnosticReviewQueue,
} from "../lib/diagnostic";
import type { DiagnosticRouteState } from "../lib/diagnostic";
import type { EvidenceNoteDraftContext } from "./EvidenceNoteDialog";
import type { Material, Persona, ReviewTask, Session } from "../lib/types";
import { ReviewComparison } from "./ReviewComparison";

type Stage = "map" | "read" | "review" | "quiz" | "retell" | "result";

export type DiagnosticStudyPlan = {
  sectionId?: string | null;
  recommendedPath: string[];
  mode: "recommended" | "beginning";
};

type StudyFlowProps = {
  material: Material;
  session: Session;
  persona: Persona;
  busy: boolean;
  reviewTask?: ReviewTask;
  diagnosticPlan?: DiagnosticStudyPlan;
  onCreateEvidenceNote: (context: EvidenceNoteDraftContext, trigger: HTMLElement) => void;
  onEvaluate: (
    answers: Array<{ question_id: string; response: string }>,
    retelling: string,
  ) => void;
  onExit: () => void;
};

const fullStageOrder: Stage[] = ["map", "read", "quiz", "retell", "result"];
const checkpointStageOrder: Stage[] = ["map", "read", "review", "quiz", "retell", "result"];
const reviewStageOrder: Stage[] = ["quiz", "retell", "result"];
const stageLabels = {
  map: "材料地图",
  read: "双轨跟读",
  review: "复核检查点",
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
  diagnosticPlan,
  onCreateEvidenceNote,
}: StudyFlowProps) {
  const sectionIds = useMemo(() => material.sections.map((section) => section.id), [material.sections]);
  const recommendedIds = useMemo(
    () => resolveRecommendedSectionIds(diagnosticPlan?.recommendedPath ?? [], sectionIds),
    [diagnosticPlan?.recommendedPath, sectionIds],
  );
  const recommendedSections = recommendedIds.map((sectionId) =>
    material.sections.find((section) => section.id === sectionId)!,
  );
  const initialSectionIndex = resolveInitialSectionIndex(
    diagnosticPlan?.mode ?? "beginning",
    diagnosticPlan?.sectionId,
    recommendedIds,
    sectionIds,
  );
  const [stage, setStage] = useState<Stage>(
    session.result
      ? "result"
      : reviewTask
        ? "quiz"
        : diagnosticPlan?.mode === "recommended" && recommendedIds.length > 0
          ? "read"
          : "map",
  );
  const [sectionIndex, setSectionIndex] = useState(initialSectionIndex);
  const [routeState, setRouteState] = useState<DiagnosticRouteState>(
    diagnosticPlan?.mode === "recommended" ? "following" : "manual",
  );
  const [reviewQueue, setReviewQueue] = useState<string[]>([]);
  const [understoodSectionIds, setUnderstoodSectionIds] = useState<string[]>([]);
  const [checkpointActive, setCheckpointActive] = useState(false);
  const [quizStarted, setQuizStarted] = useState(Boolean(reviewTask || session.result));
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const titleRef = useRef<HTMLHeadingElement>(null);
  const sectionHeadingRef = useRef<HTMLHeadingElement>(null);
  const [retelling, setRetelling] = useState("");
  const activeSection = material.sections[sectionIndex];
  const result = session.result;
  const routeFrozen = quizStarted;
  const activeStageOrder = reviewTask
    ? reviewStageOrder
    : checkpointActive || stage === "review"
      ? checkpointStageOrder
      : fullStageOrder;
  const currentIndex = activeStageOrder.indexOf(stage);
  const quizComplete = material.questions.every((question) =>
    Boolean(answers[question.id]?.trim()),
  );
  const retellingReady = retelling.trim().length >= 20;

  const recommendedSection = recommendedSections[0] ?? null;
  const routePosition = diagnosticRoutePosition(recommendedIds, activeSection?.id ?? "");

  const progress = useMemo(() => {
    if (stage === "result") return 100;
    if (currentIndex <= 0) return 0;
    return Math.round((currentIndex / (activeStageOrder.length - 1)) * 100);
  }, [activeStageOrder.length, currentIndex, stage]);

  useEffect(() => {
    titleRef.current?.focus();
  }, [session.id]);

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
    if (stage === "read" && !reviewTask && reviewQueue.length > 0) {
      setCheckpointActive(true);
      setStage("review");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const next = activeStageOrder[Math.min(currentIndex + 1, activeStageOrder.length - 1)];
    if (next === "quiz") setQuizStarted(true);
    setStage(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openSection(sectionId: string, routeEvent?: "route" | "manual") {
    const nextIndex = material.sections.findIndex((section) => section.id === sectionId);
    if (nextIndex < 0) return;
    if (routeEvent) {
      setRouteState((current) =>
        transitionDiagnosticRoute(current, routeEvent === "route" ? "follow" : "manual", routeFrozen),
      );
    }
    setSectionIndex(nextIndex);
    setStage("read");
    window.scrollTo({ top: 0, behavior: "auto" });
    window.requestAnimationFrame(() => sectionHeadingRef.current?.focus());
  }

  function changeRoute(event: "follow" | "manual" | "dismiss") {
    if (routeFrozen) return;
    setRouteState((current) => transitionDiagnosticRoute(current, event));
    if (event === "follow" && recommendedSection) openSection(recommendedSection.id, "route");
  }

  function markSection(needsReview: boolean) {
    if (routeFrozen || !activeSection) return;
    setReviewQueue((current) =>
      updateDiagnosticReviewQueue(current, activeSection.id, needsReview),
    );
    setUnderstoodSectionIds((current) =>
      needsReview
        ? current.filter((sectionId) => sectionId !== activeSection.id)
        : current.includes(activeSection.id)
          ? current
          : [...current, activeSection.id],
    );
  }

  function removeReviewItem(sectionId: string) {
    if (routeFrozen) return;
    setReviewQueue((current) => updateDiagnosticReviewQueue(current, sectionId, false));
    setUnderstoodSectionIds((current) =>
      current.includes(sectionId) ? current : [...current, sectionId],
    );
  }

  function startQuiz() {
    if (!canStartDiagnosticQuiz(reviewQueue)) return;
    setQuizStarted(true);
    setStage("quiz");
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
          <h1 ref={titleRef} tabIndex={-1}>{material.title}</h1>
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
              className={index < currentIndex ? "done" : index === currentIndex ? "active" : ""}
              aria-current={index === currentIndex ? "step" : undefined}
              disabled={index > currentIndex && !session.result}
              onClick={() => {
                if (index <= currentIndex || session.result) {
                  if (item === "quiz") setQuizStarted(true);
                  setStage(item);
                }
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


      {diagnosticPlan && !reviewTask && (
        <aside className="diagnostic-study-note" role="note" aria-label="课前诊断路线建议">
          <div>
            <strong>
              {recommendedSection
                ? `诊断建议：先看“${recommendedSection.title}”`
                : "诊断建议：从材料地图建立全局认识"}
            </strong>
            <p>
              {routeFrozen
                ? "测验已经开始，路线已冻结；这不会改变正式评分载荷。"
                : routeState === "following"
                  ? "正在按建议浏览；可随时停止或手动改选，不会强制跳过其他章节。"
                  : routeState === "manual"
                    ? "你正在自由浏览全部章节；建议仍保留，可随时回到建议路线。"
                    : "你已停止按建议浏览；全部章节仍可访问，也可随时恢复建议。"}
            </p>
            {routePosition && routeState === "following" && (
              <p className="diagnostic-route-position" role="status">
                建议位置 {routePosition.current} / {routePosition.total}
              </p>
            )}
            {recommendedSections.length > 0 && (
              <nav className="diagnostic-study-route" aria-label="建议章节顺序">
                {recommendedSections.map((section, index) => (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => openSection(section.id, "route")}
                    disabled={routeFrozen}
                    aria-current={activeSection.id === section.id && stage === "read" ? "location" : undefined}
                  >
                    {index + 1}. {section.title}
                  </button>
                ))}
              </nav>
            )}
          </div>
          {!routeFrozen && recommendedSection && (
            <button
              type="button"
              onClick={() => changeRoute(routeState === "following" ? "dismiss" : "follow")}
            >
              {routeState === "following" ? "停止按建议" : "回到建议路线"}
            </button>
          )}
        </aside>
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
                <SourceNoteAction
                  source={item.source}
                  onCreate={(trigger) => onCreateEvidenceNote({
                    material_id: material.id,
                    material_title: material.title,
                    section_id: `map:${item.key}`,
                    section_title: `知识地图 · ${item.title}`,
                    source: evidenceSourceSnapshot(item.source),
                  }, trigger)}
                />
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
                onClick={() => openSection(section.id, "manual")}
              >
                <span>{index + 1}</span>
                {section.title}
              </button>
            ))}
          </div>
          <div className="stage-intro compact">
            <p className="eyebrow">{activeSection.eyebrow}</p>
            <h2 ref={sectionHeadingRef} tabIndex={-1}>
              {activeSection.title}
            </h2>
            <SourceNoteAction
              source={activeSection.source}
              onCreate={(trigger) => onCreateEvidenceNote({
                material_id: material.id,
                material_title: material.title,
                section_id: activeSection.id,
                section_title: activeSection.title,
                source: evidenceSourceSnapshot(activeSection.source),
              }, trigger)}
            />
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
          {diagnosticPlan && !reviewTask && !routeFrozen && (
            <div className="section-understanding" aria-label="本节理解状态">
              <strong>这一节现在怎么样？</strong>
              <button
                type="button"
                className={understoodSectionIds.includes(activeSection.id) ? "active" : ""}
                onClick={() => markSection(false)}
              >
                已理解
              </button>
              <button
                type="button"
                className={reviewQueue.includes(activeSection.id) ? "active" : ""}
                onClick={() => markSection(true)}
              >
                仍需复核
              </button>
            </div>
          )}
          <div className="section-pager">
            <button
              onClick={() => openSection(material.sections[sectionIndex - 1].id, "manual")}
              disabled={sectionIndex === 0}
            >
              <ArrowLeft size={16} />
              上一节
            </button>
            <span>
              {sectionIndex + 1} / {material.sections.length}
            </span>
            {sectionIndex < material.sections.length - 1 ? (
              <button onClick={() => openSection(material.sections[sectionIndex + 1].id, "manual")}>
                下一节
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                className="accent"
                onClick={() => {
                  if (reviewQueue.length > 0) {
                    setCheckpointActive(true);
                    setStage("review");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  } else {
                    startQuiz();
                  }
                }}
              >
                我读完了，开始测验
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        </section>
      )}

      {stage === "review" && (
        <section className="study-stage review-checkpoint" aria-labelledby="review-checkpoint-title">
          <div className="stage-intro">
            <p className="eyebrow">进入测验前</p>
            <h2 id="review-checkpoint-title">先复核你标记的章节</h2>
            <p>这是本次会话内的自选清单，不会写入档案或评分载荷。</p>
          </div>
          <ul>
            {reviewQueue.map((sectionId) => {
              const section = material.sections.find((item) => item.id === sectionId);
              if (!section) return null;
              return (
                <li key={sectionId}>
                  <strong>{section.title}</strong>
                  <div>
                    <button type="button" onClick={() => openSection(sectionId, "manual")}>查看章节</button>
                    <button type="button" onClick={() => removeReviewItem(sectionId)}>已复核，移除</button>
                  </div>
                </li>
              );
            })}
          </ul>
          <StageAction onClick={startQuiz} disabled={!canStartDiagnosticQuiz(reviewQueue)}>
            {reviewQueue.length > 0 ? `还有 ${reviewQueue.length} 节待复核` : "完成复核，开始测验"}
          </StageAction>
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
                {!reviewTask ? (
                  <SourceNoteAction
                    source={item.source}
                    onCreate={(trigger) => onCreateEvidenceNote({
                      material_id: material.id,
                      material_title: material.title,
                      section_id: `result:${item.question_id}`,
                      section_title: `学习诊断 · 题目 ${index + 1}`,
                      source: evidenceSourceSnapshot(item.source),
                    }, trigger)}
                  />
                ) : <SourceBadge source={item.source} />}
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

function SourceBadge({ source }: { source?: { label: string; detail?: string | null } | null }) {
  if (!source) {
    return <span className="source-badge">原文证据暂不可用</span>;
  }

  return (
    <span className="source-badge" title={source.detail || undefined}>
      {source.label}
      {source.detail && <em> · {source.detail}</em>}
    </span>
  );
}

function evidenceSourceSnapshot(source?: { label: string; detail?: string | null } | null) {
  if (!source?.label) return undefined;
  return {
    label: source.label,
    detail: source.detail || undefined,
  };
}

function SourceNoteAction({
  source,
  onCreate,
}: {
  source?: { label: string; detail?: string | null } | null;
  onCreate: (trigger: HTMLElement) => void;
}) {
  return (
    <div className="source-note-action">
      <SourceBadge source={source} />
      <button type="button" onClick={(event) => onCreate(event.currentTarget)}>
        记一张
      </button>
    </div>
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
