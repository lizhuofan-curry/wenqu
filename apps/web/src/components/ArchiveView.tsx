import { Archive, Brain, CalendarDays, ChevronDown, ChevronUp, Download } from "lucide-react";
import { useState } from "react";
import type { ArchiveItem } from "../lib/types";
import { exportLocalData, type LocalStudyRecord } from "../lib/storage";
import { cloudEnabled } from "../lib/cloud";
import { SyncRecoveryPanel } from "./SyncRecoveryPanel";

type ArchiveViewProps = {
  items: ArchiveItem[];
  pendingSyncRecords: LocalStudyRecord[];
  localOnlySyncRecords: LocalStudyRecord[];
  syncingRecordId: string | null;
  onRetrySync: (sessionId: string) => void;
  onRetryAllSync: () => void;
};

export function ArchiveView({
  items,
  pendingSyncRecords,
  syncingRecordId,
  onRetrySync,
  localOnlySyncRecords,
  onRetryAllSync,
}: ArchiveViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="archive-page page-enter">
      <header className="topbar">
        <div>
          <p className="eyebrow">你真正留下来的东西</p>
          <h1>阅读档案</h1>
        </div>
        <div className="archive-actions">
          <button
            className="primary-button"
            onClick={exportLocalData}
            disabled={!items.length && !pendingSyncRecords.length && !localOnlySyncRecords.length}
          >
            <Download size={17} />
            {cloudEnabled ? "导出本机备份" : "导出测试数据"}
          </button>
          <div className="archive-count">
            <Archive size={20} />
            <strong>{items.length}</strong>
            <span>次完整学习</span>
          </div>
        </div>
      </header>

      <SyncRecoveryPanel
        records={pendingSyncRecords}
        syncingId={syncingRecordId}
        localOnlyRecords={localOnlySyncRecords}
        onRetry={onRetrySync}
        onRetryAll={onRetryAllSync}
      />

      {items.length === 0 ? (
        <div className="empty-archive">
          <Brain size={44} />
          <h2>还没有完整的阅读档案</h2>
          <p>完成一次答题和复述后，这里会记录你理解了什么、曾经错在哪里。</p>
        </div>
      ) : (
        <div className="archive-list">
          {items.map((item) => {
            const open = expandedId === item.session_id;
            return (
              <article
                className={`archive-card${open ? " expanded" : ""}`}
                key={item.session_id}
              >
                <button
                  className="archive-card-toggle"
                  type="button"
                  aria-expanded={open}
                  aria-controls={`archive-detail-${item.session_id}`}
                  aria-label={`${open ? "收起" : "展开"}“${item.material_title}”的学习档案`}
                  onClick={() => setExpandedId(open ? null : item.session_id)}
                />
                <div className="archive-score">
                  <strong>{item.mastery}</strong>
                  <span>掌握度</span>
                </div>
                <div className="archive-main">
                  <div className="archive-meta">
                    <span>
                      <CalendarDays size={14} />
                      {new Date(item.completed_at).toLocaleDateString("zh-CN")}
                    </span>
                    <span>{item.persona_name}</span>
                  </div>
                  <h2>{item.material_title}</h2>
                  <p>{item.headline}</p>
                  {item.misconception_tags.length > 0 && (
                    <div className="archive-tags">
                      {item.misconception_tags.map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
                {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                <div
                  id={`archive-detail-${item.session_id}`}
                  className="archive-detail"
                  hidden={!open}
                >
                  <div className="archive-detail-section">
                    <strong>我的复述</strong>
                    <p>{item.retelling || "（未记录复述内容）"}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
