import { ArrowRight, CheckCircle2, GitCompareArrows, Lightbulb } from "lucide-react";
import type { TransferTaskCandidate } from "../lib/types";

type TransferQueueProps = {
  candidates: TransferTaskCandidate[];
  archiveCount: number;
  sourceCount: number;
  busy: boolean;
  onStart: (candidate: TransferTaskCandidate) => void;
};

export function TransferQueue({
  candidates,
  archiveCount,
  sourceCount,
  busy,
  onStart,
}: TransferQueueProps) {
  const emptyState = archiveCount === 0
    ? {
        title: "先完成一次学习诊断",
        detail: "答题和复述完成后，问渠会根据真实错因准备新情境题。",
      }
    : sourceCount === 0
      ? {
          title: "先完成一次新的学习诊断",
          detail: "旧档案仍会保留，但新的迁移题只会从本轮诊断开始准备。",
        }
      : {
          title: "当前错因都已完成迁移检验",
          detail: "接下来用间隔回忆确认理解能否继续保持。",
        };

  return (
    <section className="transfer-queue" aria-labelledby="transfer-queue-title">
      <div className="section-heading transfer-queue-heading">
        <div>
          <p className="eyebrow">同一原理，换个情境</p>
          <h3 id="transfer-queue-title">迁移检验</h3>
        </div>
        <span className={`transfer-count${candidates.length ? " ready" : ""}`}>
          <GitCompareArrows size={16} aria-hidden="true" />
          {candidates.length ? `${candidates.length} 项可检验` : "暂无待检验"}
        </span>
      </div>

      {candidates.length === 0 ? (
        <div className="transfer-empty">
          {archiveCount === 0 ? (
            <Lightbulb size={24} aria-hidden="true" />
          ) : (
            <CheckCircle2 size={24} aria-hidden="true" />
          )}
          <div>
            <strong>{emptyState.title}</strong>
            <p>{emptyState.detail}</p>
          </div>
        </div>
      ) : (
        <div className="transfer-list">
          {candidates.map((candidate) => (
            <article className="transfer-item" key={candidate.id}>
              <div className="transfer-mark" aria-hidden="true">迁</div>
              <div className="transfer-copy">
                <small>{candidate.material_title}</small>
                <h4>{candidate.target.label}</h4>
                <p>不重复原题，用一个新情境确认这处理解是否真正修正。</p>
              </div>
              <button
                type="button"
                onClick={() => onStart(candidate)}
                disabled={busy}
                aria-label={`开始检验：${candidate.target.label}`}
              >
                开始迁移题
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
