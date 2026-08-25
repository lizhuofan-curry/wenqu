import { useEffect, useRef, useState } from "react";
import { Clipboard, Download, FileQuestion, Pencil, Search, Trash2 } from "lucide-react";
import {
  exportEvidenceNotesJson,
  exportEvidenceNotesMarkdown,
  evidenceNoteLocationStatus,
  type EvidenceMaterialSnapshot,
  type EvidenceNoteCard,
} from "../lib/evidenceNotes";
import type { MaterialSummary } from "../lib/types";

type Props = {
  notes: EvidenceNoteCard[];
  materials: MaterialSummary[];
  materialSnapshots: EvidenceMaterialSnapshot[];
  initialMaterialId?: string | null;
  onEdit: (note: EvidenceNoteCard, trigger: HTMLElement) => void;
  onDelete: (note: EvidenceNoteCard, nextFocus: HTMLElement | null) => void;
};

export function EvidenceNotesPanel({ notes, materials, materialSnapshots, initialMaterialId, onEdit, onDelete }: Props) {
  const [query, setQuery] = useState("");
  const [materialId, setMaterialId] = useState(initialMaterialId || "all");
  const [status, setStatus] = useState("");
  const itemRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => setMaterialId(initialMaterialId || "all"), [initialMaterialId]);

  const filtered = notes.filter((note) => {
    const location = evidenceNoteLocationStatus(note, materialSnapshots);
    const matchesMaterial = materialId === "all" ||
      (materialId === "missing_material" && location === "missing_material") ||
      (materialId === "stale_location" && location === "stale_location") ||
      (!["missing_material", "stale_location"].includes(materialId) && note.material_id === materialId);
    const haystack = `${note.material_title} ${note.section_title} ${note.content} ${note.source?.label || ""}`.toLowerCase();
    return matchesMaterial && haystack.includes(query.trim().toLowerCase());
  });

  async function copyNote(note: EvidenceNoteCard) {
    const markdown = exportEvidenceNotesMarkdown([note], note.section_title).content;
    try {
      await navigator.clipboard.writeText(markdown);
      setStatus("已复制这张笔记的 Markdown。");
    } catch {
      setStatus("复制失败，请使用导出按钮保存笔记。");
    }
  }

  function download(format: "json" | "markdown") {
    const file = format === "json"
      ? exportEvidenceNotesJson(notes, "问渠-证据笔记卡")
      : exportEvidenceNotesMarkdown(notes, "问渠｜证据笔记卡");
    const url = URL.createObjectURL(new Blob([file.content], { type: file.mimeType }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.filename;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus(`已导出 ${format === "json" ? "JSON" : "Markdown"} 备份。`);
  }

  return (
    <section className="panel evidence-notes-panel" aria-labelledby="evidence-notes-title">
      <header className="evidence-panel-header">
        <div>
          <p className="eyebrow">页边批注索引签</p>
          <h2 id="evidence-notes-title">我的证据笔记卡</h2>
          <p>共 {notes.length} 张，仅保存在这个浏览器。它们是你的理解或待核对问题，不是论文事实。</p>
        </div>
        <div className="evidence-export-actions">
          <button type="button" onClick={() => download("markdown")} disabled={!notes.length}><Download size={16} />导出 Markdown</button>
          <button type="button" onClick={() => download("json")} disabled={!notes.length}><Download size={16} />导出 JSON</button>
        </div>
      </header>
      <div className="evidence-toolbar">
        <label>
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">搜索笔记</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索材料、位置或笔记" />
        </label>
        <label>
          <span className="sr-only">按材料筛选</span>
          <select value={materialId} onChange={(event) => setMaterialId(event.target.value)}>
            <option value="all">全部材料</option>
            <option value="missing_material">原材料已删除</option>
            <option value="stale_location">原位置可能已变化</option>
            {materials.filter((item) => notes.some((note) => note.material_id === item.id)).map((item) => (
              <option value={item.id} key={item.id}>{item.title}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="evidence-panel-status" role="status" aria-live="polite">{status}</p>
      {filtered.length ? (
        <ol className="evidence-note-list">
          {filtered.map((note, index) => {
            const location = evidenceNoteLocationStatus(note, materialSnapshots);
            return (
              <li key={note.id} ref={(node) => {
                if (node) itemRefs.current.set(note.id, node);
                else itemRefs.current.delete(note.id);
              }} tabIndex={-1}>
                <span className="evidence-margin-tab" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <div className="evidence-note-heading">
                  <div>
                    <small>{note.content_kind === "learner_statement" ? "我的理解" : "待核对"}</small>
                    <h3>{note.section_title}</h3>
                  </div>
                  <span className={note.status === "pending" ? "pending" : "personal"}>
                    {note.status === "pending" && <FileQuestion size={14} />}
                    {note.status === "pending" ? "待核对" : "我的理解"}
                  </span>
                </div>
                <p className="evidence-note-body">{note.content}</p>
                <div className="evidence-note-source">
                  <strong>{note.material_title}</strong>
                  <span>{note.source ? `创建时来源：${note.source.label}${note.source.detail ? ` · ${note.source.detail}` : ""}` : "未附来源定位，作为普通学习笔记保存"}</span>
                  {location === "missing_material" && <em>原材料已删除，保存时定位仍保留</em>}
                  {location === "stale_location" && <em>原位置可能已变化，请回到当前材料重新核对</em>}
                </div>
                <div className="evidence-note-actions">
                  <button type="button" onClick={() => void copyNote(note)}><Clipboard size={15} />复制</button>
                  <button type="button" onClick={(event) => onEdit(note, event.currentTarget)}><Pencil size={15} />编辑</button>
                  <button type="button" className="danger" onClick={() => {
                    if (!window.confirm("永久删除这张笔记卡吗？此操作无法恢复。")) return;
                    const next = filtered[index + 1] || filtered[index - 1];
                    onDelete(note, next ? itemRefs.current.get(next.id) || null : null);
                  }}><Trash2 size={15} />删除</button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="evidence-empty" tabIndex={-1}>
          <h3>{notes.length ? "没有符合条件的笔记" : "还没有证据笔记卡"}</h3>
          <p>{notes.length ? "换一个关键词或材料筛选。" : "阅读材料时，在来源定位旁选择“记一张”。"}</p>
        </div>
      )}
    </section>
  );
}
