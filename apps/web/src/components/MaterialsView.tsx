import {
  ArrowRight,
  BookOpen,
  Clock3,
  FileSearch,
  FileText,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useRef, useState } from "react";
import type { MaterialSummary } from "../lib/types";

type Props = {
  materials: MaterialSummary[];
  busy: boolean;
  onStart: (id: string) => void;
  onUpload: (file: File) => void;
  onDelete: (id: string) => void;
};

function source_type_label(m: MaterialSummary) {
  if (m.source_type === "builtin") return "CVPR 2018";
  if (m.source_type === "pdf") return "PDF";
  return "MD";
}

export function MaterialsView({ materials, busy, onStart, onUpload, onDelete }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "paper" | "notes" | "completed">("all");
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = materials.filter((item) => {
    const matchesQuery = `${item.title} ${item.subtitle}`
      .toLowerCase()
      .includes(query.toLowerCase());
    const matchesFilter =
      filter === "all" ||
      (filter === "paper" && ["builtin", "pdf"].includes(item.source_type)) ||
      (filter === "notes" && item.source_type === "markdown") ||
      (filter === "completed" && item.progress >= 100);
    return matchesQuery && matchesFilter;
  });

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
            event.target.value = "";
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
          {[
            ["all", "全部"],
            ["paper", "论文"],
            ["notes", "笔记"],
            ["completed", "已完成"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? "active" : ""}
              onClick={() => setFilter(id as typeof filter)}
            >
              {label}
            </button>
          ))}
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
              <span>{material.source_type === "builtin" ? "CVPR 2018" : source_type_label(material)}</span>
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
            {material.source_type !== "builtin" && (
              <button className="card-delete" onClick={(e) => { e.stopPropagation(); onDelete(material.id); }} title="删除材料" aria-label="删除材料">
                <Trash2 size={15} />
              </button>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
