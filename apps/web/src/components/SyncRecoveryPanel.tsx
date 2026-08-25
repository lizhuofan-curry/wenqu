import { CloudUpload, LoaderCircle, RefreshCcw, ShieldCheck } from "lucide-react";
import type { LocalStudyRecord } from "../lib/storage";

type SyncRecoveryPanelProps = {
  records: LocalStudyRecord[];
  syncingId: string | null;
  localOnlyRecords: LocalStudyRecord[];
  onRetry: (sessionId: string) => void;
  onRetryAll: () => void;
};

export function SyncRecoveryPanel({
  records,
  syncingId,
  localOnlyRecords,
  onRetry,
  onRetryAll,
}: SyncRecoveryPanelProps) {
  if (!records.length && !localOnlyRecords.length) return null;
  const syncingAll = syncingId === "all";
  const allRecords = [...records, ...localOnlyRecords];

  return (
    <section
      className="sync-recovery"
      aria-labelledby="sync-recovery-title"
      aria-busy={syncingId !== null}
    >
      <div className="sync-recovery-heading">
        <div>
          <p className="eyebrow">
            <ShieldCheck size={14} />
            本机恢复副本
          </p>
          <h3 id="sync-recovery-title" tabIndex={-1}>
            {allRecords.length} 条记录尚未保存到云端
          </h3>
          <p>
            评分结果完整保存在此浏览器。带恢复凭据的记录只需验证服务端签名，不会重新评分或消耗 AI 次数。
          </p>
        </div>
        {records.length > 0 && (
          <button
            className="sync-all-button"
            onClick={onRetryAll}
            disabled={syncingId !== null}
          >
            {syncingAll ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <CloudUpload size={17} />
            )}
            {syncingAll ? "正在逐条同步…" : "全部重新同步"}
          </button>
        )}
      </div>

      <div
        className="sync-recovery-list"
        aria-live="polite"
        aria-relevant="additions removals"
        aria-atomic="false"
      >
        {allRecords.map((record) => {
          const syncing = syncingId === record.session.id;
          const retryable = record.sync?.status === "pending";
          return (
            <article className="sync-recovery-item" key={record.session.id}>
              <div>
                <strong>{record.archive.material_title}</strong>
                <small>
                  {new Date(record.archive.completed_at).toLocaleString("zh-CN")}
                  {record.sync?.attempts
                    ? ` · 已失败 ${record.sync.attempts} 次`
                    : ""}
                  id={`sync-retry-${record.session.id}`}
                </small>
                {record.sync?.lastError && (
                  <p role="alert">{record.sync.lastError}</p>
                )}
              </div>
              {retryable ? (
                <button
                  onClick={() => onRetry(record.session.id)}
                  disabled={syncingId !== null}
                >
                  {syncing ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <RefreshCcw size={16} />
                  )}
                  {syncing ? "正在同步…" : "重新同步"}
                </button>
              ) : (
                <span className="sync-local-only-note">
                  无法自动同步，可在阅读档案导出本机备份
                </span>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
