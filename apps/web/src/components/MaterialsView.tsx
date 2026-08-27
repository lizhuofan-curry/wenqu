import {
  ArrowRight,
  Bookmark,
  BookOpen,
  Clock3,
  FileSearch,
  FileText,
  Loader2,
  RefreshCw,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MaterialSummary } from "../lib/types";
import type { Topic, TopicInput } from "../lib/topics";
import { TopicsSection } from "./TopicsSection";

type Props = {
  materials: MaterialSummary[];
  busy: boolean;
  deletingId: string | null;
  onStart: (id: string) => void;
  onDiagnose: (id: string) => void;
  canDiagnose: boolean;
  onUpload: (file: File) => void;
  onDelete: (id: string) => void;
  onRegenerate: (id: string) => void;
  noteCounts: Record<string, number>;
  onViewNotes: (id: string) => void;
  topics: Topic[];
  topicsError: string;
  onCreateTopic: (input: TopicInput) => void;
  onRenameTopic: (topicId: string, name: string) => void;
  onDeleteTopic: (topicId: string) => void;
  onAddMaterialToTopic: (topicId: string, materialId: string) => void;
  onRemoveMaterialFromTopic: (topicId: string, materialId: string) => void;
};

function source_type_label(m: MaterialSummary) {
  if (m.source_type === "builtin") return "CVPR 2018";
  if (m.source_type === "pdf") return "PDF";
  return "MD";
}

export function MaterialsView({
  materials,
  busy,
  deletingId,
  onStart,
  onDiagnose,
  canDiagnose,
  onUpload,
  onDelete,
  noteCounts,
  onViewNotes,
  onRegenerate,
  topics,
  topicsError,
  onCreateTopic,
  onRenameTopic,
  onDeleteTopic,
  onAddMaterialToTopic,
  onRemoveMaterialFromTopic,
}: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "paper" | "markdown" | "completed">("all");
  const [topicFilter, setTopicFilter] = useState("all");
  const [stepIndex, setStepIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Progress animation during upload
  useEffect(() => {
    if (!busy) { setStepIndex(0); return; }
    const steps = ["读取文件…", "提取文本…", "AI 翻译中…", "生成题目…"];
    setStepIndex(0);
    let i = 0;
    const timer = setInterval(() => {
      i++;
      if (i < steps.length) setStepIndex(i);
    }, 4000);
    return () => clearInterval(timer);
  }, [busy]);

  const stepLabels = ["读取文件…", "提取文本…", "AI 翻译中…", "生成题目…"];
  const filtered = materials.filter((item) => {
    const matchesQuery = `${item.title} ${item.subtitle}`
      .toLowerCase()
      .includes(query.toLowerCase());
    const matchesFilter =
      filter === "all" ||
      (filter === "paper" && ["builtin", "pdf"].includes(item.source_type)) ||
      (filter === "markdown" && item.source_type === "markdown") ||
      (filter === "completed" && item.progress >= 100);
    const matchesTopic =
      topicFilter === "all" ||
      (topicFilter === "ungrouped" && !topics.some((topic) => topic.material_ids.includes(item.id))) ||
      topics.find((topic) => topic.id === topicFilter)?.material_ids.includes(item.id) === true;
    return matchesQuery && matchesFilter && matchesTopic;
  });

  return (
    <div className="standard-page page-enter">
      <header className="page-header">
        <div>
          <p className="eyebrow">你的知识源头</p>
          <h1>资料库</h1>
          <p>把论文、章节和笔记整理成可学习、可追溯的材料。</p>
        </div>
        <button className="primary-button" type="button" onClick={() => inputRef.current?.click()}>
          <UploadCloud size={17} aria-hidden="true" />
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
      <TopicsSection
        topics={topics}
        materials={materials}
        error={topicsError}
        busy={busy}
        canDiagnose={canDiagnose}
        onCreate={onCreateTopic}
        onRename={onRenameTopic}
        onDelete={onDeleteTopic}
        onAddMaterial={onAddMaterialToTopic}
        onRemoveMaterial={onRemoveMaterialFromTopic}
        onStartMaterial={onStart}
        onDiagnoseMaterial={onDiagnose}
      />
      {busy && (
        <div className="upload-overlay" role="status" aria-live="polite" aria-busy="true">
          <div className="upload-dialog">
            <Loader2 className="spin" size={36} aria-hidden="true" />
            <strong>正在处理文件…</strong>
            <p>提取文本、生成地图、AI 翻译、制定题目</p>
            <div className="upload-steps">
              {stepLabels.map((label, i) => (
                <span key={label} className={i === stepIndex ? "active" : i < stepIndex ? "done" : ""}>
                  {i < stepIndex ? "✓ " : i === stepIndex ? "● " : "○ "}
                  {label}
                </span>
              ))}
            </div>
            <div
              className="upload-track"
              role="progressbar"
              aria-label="资料处理进度"
              aria-valuemin={1}
              aria-valuemax={stepLabels.length}
              aria-valuenow={stepIndex + 1}
            >
              <span style={{ width: `${((stepIndex + 1) / stepLabels.length) * 100}%` }} />
            </div>
          </div>
        </div>
      )}
      <div className="library-toolbar">
        <div className="search-box">
          <FileSearch size={18} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题或主题"
            aria-label="搜索标题或主题"
          />
        </div>
        <div className="filter-pills" role="group" aria-label="资料筛选">
          {[
            ["all", "全部"],
            ["paper", "论文"],
            ["markdown", "Markdown"],
            ["completed", "已完成"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={filter === id ? "active" : ""}
              aria-pressed={filter === id}
              onClick={() => setFilter(id as typeof filter)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="topic-filter">
          <span className="sr-only">按专题筛选</span>
          <select
            value={topicFilter}
            onChange={(event) => setTopicFilter(event.target.value)}
            aria-label="按专题筛选"
          >
            <option value="all">全部专题</option>
            <option value="ungrouped">未加入专题</option>
            {topics.map((topic) => (
              <option value={topic.id} key={topic.id}>{topic.name}</option>
            ))}
          </select>
        </label>
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
                {noteCounts[material.id] > 0 && (
                  <button className="material-note-index" type="button" onClick={() => onViewNotes(material.id)}>
                    <Bookmark size={14} aria-hidden="true" />
                    {noteCounts[material.id]} 张笔记
                  </button>
                )}
                <small>{material.progress ? `已学习 ${material.progress}%` : "尚未开始"}</small>
                {canDiagnose && material.id === "senet-cvpr-2018" ? (
                  <div className="library-actions">
                    <button className="secondary-button" type="button" onClick={() => onDiagnose(material.id)} disabled={busy}>
                      先做 3 题诊断
                    </button>
                    <button type="button" onClick={() => onStart(material.id)} disabled={busy}>
                      直接开始
                      <ArrowRight size={15} aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => onStart(material.id)} disabled={busy}>
                    开始陪读
                    <ArrowRight size={15} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
            {material.source_type !== "builtin" && (
              <>
                <button className="card-regenerate" onClick={(e) => { e.stopPropagation(); onRegenerate(material.id); }} title="重新 AI 翻译" aria-label="重新 AI 翻译" disabled={busy}>
                  <RefreshCw size={14} />
                </button>
                <button
                  className="card-delete"
                  onClick={(event) => { event.stopPropagation(); onDelete(material.id); }}
                  title="删除这份资料"
                  aria-label={`删除资料：${material.title}`}
                  disabled={busy || deletingId === material.id}
                >
                  {deletingId === material.id ? <Loader2 className="spin" size={15} /> : <Trash2 size={15} />}
                </button>
              </>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
