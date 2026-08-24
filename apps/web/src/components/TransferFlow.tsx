import { ArrowLeft, BookOpenCheck, CheckCircle2, RotateCcw, Send } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { TransferAttemptResult, TransferTask } from "../lib/types";

type TransferFlowProps = {
  task: TransferTask;
  result?: TransferAttemptResult;
  busy: boolean;
  onSubmit: (answer: string) => void;
  onExit: () => void;
};

const verdictCopy = {
  transferred: {
    label: "已迁移",
    detail: "你能在新情境中正确使用这条原理。",
    icon: CheckCircle2,
  },
  partial: {
    label: "部分迁移",
    detail: "方向已经接近，但关键条件还需要说得更准确。",
    icon: RotateCcw,
  },
  not_yet: {
    label: "尚未迁移",
    detail: "这处理解在新情境中仍会卡住，先沿证据回看再试。",
    icon: RotateCcw,
  },
} as const;

export function TransferFlow({
  task,
  result,
  busy,
  onSubmit,
  onExit,
}: TransferFlowProps) {
  const [answer, setAnswer] = useState("");
  const answerId = useId();
  const descriptionId = useId();
  const resultTitleRef = useRef<HTMLHeadingElement>(null);
  const ready = answer.trim().length >= 10;
  const verdict = result ? verdictCopy[result.verdict] : null;
  const VerdictIcon = verdict?.icon;

  useEffect(() => {
    if (result) {
      resultTitleRef.current?.focus();
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    }
  }, [result]);

  return (
    <div className="transfer-flow page-enter" aria-busy={busy}>
      <header className="transfer-flow-header">
        <button type="button" className="back-button" onClick={onExit}>
          <ArrowLeft size={18} aria-hidden="true" />
          返回阅读室
        </button>
        <div>
          <p className="eyebrow">错因驱动 · 新情境</p>
          <strong>{task.material_title}</strong>
        </div>
        <span className="transfer-mode-chip">迁移检验</span>
      </header>

      {!result ? (
        <main className="transfer-prompt-card" aria-labelledby="transfer-prompt-title">
          <p className="eyebrow">{task.scenario_label}</p>
          <h1 id="transfer-prompt-title">{task.prompt}</h1>
          <p id={descriptionId} className="transfer-prompt-guidance">
            请直接分析这个新情境。提交前不提供原题、提示或原文位置。
          </p>
          <label htmlFor={answerId}>你的分析</label>
          <textarea
            id={answerId}
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            aria-describedby={descriptionId}
            placeholder="先判断应使用哪条原理，再说明理由……"
            rows={9}
            disabled={busy}
          />
          <div className="transfer-answer-meta">
            <span className={ready ? "ready" : ""}>{answer.length} 字 · 至少 10 字</span>
            <span>本题不会重复上一次的题干</span>
          </div>
          <button
            type="button"
            className="primary-button wide transfer-submit"
            onClick={() => onSubmit(answer.trim())}
            disabled={!ready || busy}
          >
            {busy ? "正在检验迁移…" : "提交迁移分析"}
            <Send size={18} aria-hidden="true" />
          </button>
          {busy && (
            <p className="transfer-live-status" role="status" aria-live="polite">
              正在依据隐藏评分规则与原文证据检查你的分析。
            </p>
          )}
        </main>
      ) : verdict && VerdictIcon ? (
        <main className={`transfer-result transfer-result-${result.verdict}`}>
          <div className="transfer-result-heading" role="status" aria-live="polite">
            <VerdictIcon size={30} aria-hidden="true" />
            <div>
              <p className="eyebrow">迁移检验结果</p>
              <h1 ref={resultTitleRef} tabIndex={-1}>{verdict.label}</h1>
              <p>{verdict.detail}</p>
            </div>
          </div>

          <section className="transfer-result-target" aria-labelledby="transfer-target-title">
            <small>本次检验的错因</small>
            <h2 id="transfer-target-title">{task.target.label}</h2>
            <code>{task.target.code}</code>
          </section>

          <section className="transfer-feedback" aria-labelledby="transfer-feedback-title">
            <h2 id="transfer-feedback-title">诊断反馈</h2>
            <p>{result.feedback}</p>
          </section>

          <section className="transfer-evidence" aria-labelledby="transfer-evidence-title">
            <div>
              <BookOpenCheck size={20} aria-hidden="true" />
              <h2 id="transfer-evidence-title">提交后核对原文证据</h2>
            </div>
            {result.evidence.length ? (
              <ul>
                {result.evidence.map((source, index) => (
                  <li key={`${source.label}-${source.detail || index}`}>
                    <strong>{source.label}</strong>
                    {source.detail && <span>{source.detail}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p>本次结果没有返回可定位的原文证据，请不要把它视为已验证结论。</p>
            )}
          </section>

          <button type="button" className="primary-button wide" onClick={onExit}>
            返回阅读室
          </button>
        </main>
      ) : null}
    </div>
  );
}
