import { ArrowLeft, ArrowRight, BrainCircuit, LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { canSubmitDiagnostic, resolveDiagnosticSection } from "../lib/diagnostic";
import type {
  DiagnosticAnswer,
  DiagnosticAttempt,
  DiagnosticConfidence,
  DiagnosticObjectiveStatus,
} from "../lib/types";

type Props = {
  attempt: DiagnosticAttempt;
  busy: boolean;
  error?: string;
  onEvaluate: (answers: DiagnosticAnswer[]) => void;
  onRefresh: () => void;
  onAcceptRecommendation: () => void;
  onStartFromBeginning: () => void;
  onExit: () => void;
};

const statusLabels: Record<DiagnosticObjectiveStatus, string> = {
  ready: "证据完整",
  developing: "部分证据",
  needs_foundation: "出现相反证据",
  evidence_insufficient: "证据不足",
};

const sectionLabels: Record<string, string> = {
  squeeze: "Squeeze",
  excitation: "Excitation",
  scale: "Scale",
  resnet: "ResNet 插入位置",
};

const routeLabels = {
  full: "完整路线",
  focused: "聚焦路线",
  quick_review: "快速复核",
} as const;

const confidenceOptions: Array<{
  value: DiagnosticConfidence;
  label: string;
  detail: string;
}> = [
  { value: "low", label: "低", detail: "主要在猜或记不清" },
  { value: "medium", label: "中", detail: "有依据但不完全确定" },
  { value: "high", label: "高", detail: "能清楚说明依据" },
];

export function DiagnosticFlow({
  attempt,
  busy,
  error,
  onEvaluate,
  onRefresh,
  onAcceptRecommendation,
  onStartFromBeginning,
  onExit,
}: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [confidences, setConfidences] = useState<
    Partial<Record<string, DiagnosticConfidence>>
  >({});
  const headingRef = useRef<HTMLHeadingElement>(null);
  const result = attempt.result;

  useEffect(() => {
    headingRef.current?.focus();
  }, [attempt.status]);

  const recommendedPath = useMemo(
    () => result?.recommended_path ?? [],
    [result],
  );
  const recommendedStart = result ? resolveDiagnosticSection(result) : null;
  const confidenceComplete = canSubmitDiagnostic(attempt.questions, confidences);

  return (
    <div className="diagnostic-flow page-enter">
      <header className="diagnostic-header">
        <button className="back-button" type="button" onClick={onExit}>
          <ArrowLeft size={17} aria-hidden="true" />
          返回阅读室
        </button>
        <div>
          <p className="eyebrow">课前诊断 · 不计入正式掌握度</p>
          <h1 ref={headingRef} tabIndex={-1}>
            {result ? "找到更合适的学习起点" : attempt.material_title || "SENet 课前诊断"}
          </h1>
          <p>
            {result
              ? "这只是基于本次回答的路线建议，不是能力定论。"
              : "先凭现有理解回答三题。此处不提供提示、原文定位或标准答案。"}
          </p>
        </div>
      </header>

      {error && (
        <div className="diagnostic-alert" role="alert">
          {error}
        </div>
      )}

      {attempt.status === "evaluating" && !result ? (
        <section className="diagnostic-pending" aria-labelledby="diagnostic-pending-title">
          <LoaderCircle className="spin" size={28} aria-hidden="true" />
          <div>
            <h2 id="diagnostic-pending-title">诊断正在确认结果</h2>
            <p>系统不会重复提交评分。请读取当前任务状态，已完成的结果会直接恢复。</p>
          </div>
          <button className="primary-button" type="button" onClick={onRefresh} disabled={busy}>
            <RefreshCw size={17} aria-hidden="true" />
            {busy ? "正在读取" : "读取状态"}
          </button>
        </section>
      ) : !result ? (
        <section
          className="diagnostic-sheet"
          aria-labelledby="diagnostic-questions-title"
          aria-busy={busy}
        >
          <div className="diagnostic-intro">
            <BrainCircuit aria-hidden="true" size={24} />
            <div>
              <h2 id="diagnostic-questions-title">只测起点，不提前讲答案</h2>
              <p>回答可以留空，但每题必须标注把握程度。把握程度仅随本次回答记录，不参与评分。</p>
            </div>
          </div>

          <div className="diagnostic-question-list">
            {attempt.questions.map((question, index) => {
              const inputId = `diagnostic-answer-${question.id}`;
              const descriptionId = `diagnostic-description-${question.id}`;
              return (
                <article className="diagnostic-question" key={question.id}>
                  <div className="diagnostic-question-meta" aria-hidden="true">
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <small>{question.kind.toUpperCase()}</small>
                  </div>
                  <label htmlFor={inputId}>{question.prompt}</label>
                  <p id={descriptionId}>请只写你现在能独立想起的内容，不必猜标准表述。</p>
                  <textarea
                    id={inputId}
                    aria-describedby={descriptionId}
                    value={answers[question.id] ?? ""}
                    onChange={(event) =>
                      setAnswers((current) => ({
                        ...current,
                        [question.id]: event.target.value,
                      }))
                    }
                    rows={5}
                    maxLength={4000}
                    disabled={busy}
                  />
                  <small className="diagnostic-count">
                    {(answers[question.id] ?? "").length} / 4000
                  </small>
                  <fieldset className="diagnostic-confidence">
                    <legend>把握程度（必选，仅记录、不参与评分）</legend>
                    <div>
                      {confidenceOptions.map((option) => (
                        <label key={option.value}>
                          <input
                            type="radio"
                            name={`diagnostic-confidence-${question.id}`}
                            value={option.value}
                            checked={confidences[question.id] === option.value}
                            onChange={() =>
                              setConfidences((current) => ({
                                ...current,
                                [question.id]: option.value,
                              }))
                            }
                            disabled={busy}
                          />
                          <span>
                            <strong>{option.label}</strong>
                            <small>{option.detail}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </article>
              );
            })}
          </div>

          <div className="diagnostic-actions">
            <button type="button" className="secondary-button" onClick={onExit} disabled={busy}>
              暂不诊断
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={busy || !confidenceComplete}
              onClick={() =>
                onEvaluate(
                  attempt.questions.map((question) => ({
                    question_id: question.id,
                    response: answers[question.id] ?? "",
                    confidence: confidences[question.id]!,
                  })),
                )
              }
            >
              {busy ? (
                <>
                  <LoaderCircle className="spin" size={18} aria-hidden="true" />
                  正在判断起点
                </>
              ) : (
                <>
                  提交起点诊断
                  <ArrowRight size={18} aria-hidden="true" />
                </>
              )}
            </button>
          </div>
          {!confidenceComplete && (
            <p className="diagnostic-status" role="status">请为三道题分别选择把握程度后再提交。</p>
          )}
          {busy && (
            <p className="diagnostic-status" role="status" aria-live="polite">
              正在根据三项学习目标生成建议路线，请稍候。
            </p>
          )}
        </section>
      ) : (
        <section className="diagnostic-result" aria-labelledby="diagnostic-result-title">
          <div className="diagnostic-result-heading">
            <p className="eyebrow">本次起点建议</p>
            <h2 id="diagnostic-result-title">
              {recommendedStart
                ? `建议先从“${sectionLabels[recommendedStart] ?? recommendedStart}”开始`
                : "建议从材料地图开始"}
            </h2>
            <p>{result.summary || "系统只展示学习路线，不展示标准答案或隐藏评分依据。"}</p>
          </div>

          <div className="diagnostic-route-summary">
            <span>{routeLabels[result.route_type]}</span>
            <p>{result.route_reason}</p>
          </div>

          <ul className="diagnostic-objectives">
            {result.objective_results.map((objective) => (
              <li key={objective.objective_id} data-status={objective.status}>
                <span>{statusLabels[objective.status]}</span>
                <strong>{objective.label}</strong>
                {objective.summary && <p>{objective.summary}</p>}
              </li>
            ))}
          </ul>

          {recommendedPath.length > 0 && (
            <div className="diagnostic-route" aria-label="建议学习顺序">
              <strong>建议顺序</strong>
              <ol>
                {recommendedPath.map((sectionId) => (
                  <li key={sectionId}>{sectionLabels[sectionId] ?? sectionId}</li>
                ))}
              </ol>
            </div>
          )}

          <div className="diagnostic-actions">
            <button type="button" className="secondary-button" onClick={onStartFromBeginning} disabled={busy}>
              从头开始
            </button>
            <button type="button" className="primary-button" onClick={onAcceptRecommendation} disabled={busy}>
              {busy ? "正在打开材料…" : "按建议开始"}
              {!busy && <ArrowRight size={18} aria-hidden="true" />}
            </button>
          </div>
          {busy && (
            <p className="diagnostic-status" role="status" aria-live="polite">
              诊断已完成，正在加载完整材料。
            </p>
          )}
        </section>
      )}
    </div>
  );
}
