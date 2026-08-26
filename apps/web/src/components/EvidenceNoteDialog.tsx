import { useEffect, useId, useRef, useState } from "react";
import { BookmarkPlus, X } from "lucide-react";
import {
  MAX_EVIDENCE_NOTE_LENGTH,
  type EvidenceNoteCard,
  type EvidenceNoteContentKind,
  type EvidenceNoteInput,
} from "../lib/evidenceNotes";

export type EvidenceNoteDraftContext = Omit<EvidenceNoteInput, "content" | "content_kind">;

type Props = {
  context: EvidenceNoteDraftContext;
  note?: EvidenceNoteCard | null;
  returnFocus?: HTMLElement | null;
  error?: string;
  onClose: () => void;
  onSave: (content: string, kind: EvidenceNoteContentKind) => void;
};

export function EvidenceNoteDialog({ context, note, returnFocus, error, onClose, onSave }: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const contentId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const [content, setContent] = useState(note?.content || "");
  const [kind, setKind] = useState<EvidenceNoteContentKind>(note?.content_kind || "learner_statement");

  useEffect(() => {
    textareaRef.current?.focus();
    return () => returnFocus?.focus();
  }, [returnFocus]);

  useEffect(() => {
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) || []).filter((element) => !element.hasAttribute("hidden"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleDialogKeys);
    return () => document.removeEventListener("keydown", handleDialogKeys);
  }, [onClose]);

  return (
    <div className="evidence-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        ref={dialogRef}
        className="evidence-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header>
          <span className="evidence-margin-tab" aria-hidden="true">批注</span>
          <div>
            <p className="eyebrow">保存时定位快照</p>
            <h2 id={titleId}>{note ? "编辑我的笔记" : "记一张证据笔记卡"}</h2>
          </div>
          <button className="evidence-icon-button" type="button" onClick={onClose} aria-label="关闭笔记编辑器">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <p id={descriptionId} className="evidence-local-notice">
          仅保存在此浏览器，不会云同步，也不会进入评分、掌握度或学习档案。
        </p>

        <dl className="evidence-source-snapshot">
          <div><dt>材料</dt><dd>{context.material_title}</dd></div>
          <div><dt>位置</dt><dd>{context.section_title}</dd></div>
          <div>
            <dt>来源定位</dt>
            <dd>{context.source ? `${context.source.label}${context.source.detail ? ` · ${context.source.detail}` : ""}` : "未附原文定位（普通学习笔记）"}</dd>
          </div>
        </dl>

        <fieldset className="evidence-kind-choice">
          <legend>这张卡记录什么？</legend>
          <label>
            <input type="radio" name="evidence-kind" checked={kind === "learner_statement"} onChange={() => setKind("learner_statement")} />
            <span><strong>我的理解</strong><small>只记录你的表述，不代表论文事实。</small></span>
          </label>
          <label>
            <input type="radio" name="evidence-kind" checked={kind === "question_or_hypothesis"} onChange={() => setKind("question_or_hypothesis")} />
            <span><strong>待核对</strong><small>保存问题或假设，状态固定为待核对。</small></span>
          </label>
        </fieldset>

        <label className="evidence-content-label" htmlFor={contentId}>笔记内容</label>
        <textarea
          id={contentId}
          ref={textareaRef}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={MAX_EVIDENCE_NOTE_LENGTH}
          rows={7}
          placeholder={kind === "learner_statement" ? "用自己的话写下此刻的理解……" : "写下仍需回到原文核对的问题……"}
        />
        <div className="evidence-dialog-meta">
          <span>{content.length} / {MAX_EVIDENCE_NOTE_LENGTH} 字</span>
          {error && <span className="evidence-dialog-error" role="alert">{error}</span>}
        </div>
        <footer>
          <button type="button" className="secondary-button" onClick={onClose}>取消</button>
          <button type="button" className="primary-button" disabled={!content.trim()} onClick={() => onSave(content, kind)}>
            <BookmarkPlus size={17} aria-hidden="true" />
            {note ? "保存修改" : "保存笔记"}
          </button>
        </footer>
      </section>
    </div>
  );
}
