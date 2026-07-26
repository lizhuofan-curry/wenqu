import { Archive, ArrowRight, Brain, CalendarDays } from "lucide-react";
import type { ArchiveItem } from "../lib/types";

export function ArchiveView({ items }: { items: ArchiveItem[] }) {
  return (
    <div className="archive-page page-enter">
      <header className="topbar">
        <div>
          <p className="eyebrow">你真正留下来的东西</p>
          <h1>阅读档案</h1>
        </div>
        <div className="archive-count">
          <Archive size={20} />
          <strong>{items.length}</strong>
          <span>次完整学习</span>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="empty-archive">
          <Brain size={44} />
          <h2>还没有完整的阅读档案</h2>
          <p>完成一次答题和复述后，这里会记录你理解了什么、曾经错在哪里。</p>
        </div>
      ) : (
        <div className="archive-list">
          {items.map((item) => (
            <article className="archive-card" key={item.session_id}>
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
              <button aria-label="查看档案">
                <ArrowRight size={18} />
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

