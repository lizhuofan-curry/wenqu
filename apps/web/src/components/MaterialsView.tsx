import {
  ArrowRight,
  BookOpen,
  Clock3,
  FileSearch,
  FileText,
  MoreHorizontal,
  UploadCloud,
} from "lucide-react";
import { useRef, useState } from "react";
import type { MaterialSummary } from "../lib/types";

type Props = {
  materials: MaterialSummary[];
  busy: boolean;
  onStart: (id: string) => void;
  onUpload: (file: File) => void;
};

export function MaterialsView({ materials, busy, onStart, onUpload }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = materials.filter((item) =>
    `${item.title} ${item.subtitle}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="standard-page page-enter">
      <header className="page-header">
        <div>
          <p className="eyebrow">你的知识源头</p>
          <h1>资料库</h1>
          <p>把论文、章节和笔记整理成可学习、可追溯的材料。</p>
        </div>
        <button className="primary-button" onClick={() => inputRef.current?.click()}>
          <UploadCloud size={17} />
          添加资料
        </button>
        <input
          ref={inputRef}
          hidden
          type="file"
          accept=".pdf,.md,.markdown"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onUpload(file);
          }}
        />
      </header>
      <div className="library-toolbar">
        <div className="search-box">
          <FileSearch size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题或主题"
          />
        </div>
        <div className="filter-pills">
          <button className="active">全部</button>
          <button>论文</button>
          <button>笔记</button>
          <button>已完成</button>
        </div>
      </div>
      <div className="library-grid">
        {filtered.map((material, index) => (
          <article className="library-card" key={material.id}>
            <div className={`library-cover cover-${index % 3}`}>
              {material.source_type === "builtin" ? (
                <BookOpen size={30} />
              ) : (
                <FileText size={30} />
              )}
              <span>{material.source_type === "builtin" ? "CVPR 2018" : "YOUR DOC"}</span>
              <button aria-label="更多操作">
                <MoreHorizontal size={18} />
              </button>
            </div>
            <div className="library-card-body">
              <div className="material-meta">
                <span>{material.difficulty}</span>
                <span>
                  <Clock3 size={13} />
                  {material.estimated_minutes} 分钟
                </span>
              </div>
              <h2>{material.title}</h2>
              <p>{material.subtitle}</p>
              <div className="material-progress">
                <span style={{ width: `${Math.max(material.progress, 8)}%` }} />
              </div>
              <div className="library-card-foot">
                <small>{material.progress ? `已学习 ${material.progress}%` : "尚未开始"}</small>
                <button onClick={() => onStart(material.id)} disabled={busy}>
                  开始陪读
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
