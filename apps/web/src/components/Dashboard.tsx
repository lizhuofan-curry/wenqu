import {
  ArrowRight,
  BookMarked,
  CheckCircle2,
  Clock3,
  FileText,
  LoaderCircle,
  UploadCloud,
  BarChart3,
  BrainCircuit,
  ChevronRight,
  Flame,
  Library,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useRef } from "react";
import type { CSSProperties } from "react";
import type { LocalStudyRecord } from "../lib/storage";
import type {
  ArchiveItem,
  MaterialSummary,
  Persona,
  ReviewTask,
  TransferTaskCandidate,
} from "../lib/types";
import { ReviewQueue } from "./ReviewQueue";
import { SyncRecoveryPanel } from "./SyncRecoveryPanel";
import { TransferQueue } from "./TransferQueue";

type DashboardProps = {
  materials: MaterialSummary[];
  personas: Persona[];
  selectedPersona: string;
  onSelectPersona: (id: string) => void;
  onStart: (materialId: string) => void;
  onDiagnose: (materialId: string) => void;
  canDiagnose: boolean;
  onUpload: (file: File) => void;
  onDelete: (id: string) => void;
  busy: boolean;
  deletingId: string | null;
  uploadStatus: string;
  onNavigate: (view: "materials" | "insights" | "misconceptions") => void;
  archive: ArchiveItem[];
  reviewTasks: ReviewTask[];
  onStartReview: (task: ReviewTask) => void;
  showTransferQueue: boolean;
  transferCandidates: TransferTaskCandidate[];
  transferArchiveCount: number;
  transferSourceCount: number;
  onStartTransfer: (candidate: TransferTaskCandidate) => void;
  pendingSyncRecords: LocalStudyRecord[];
  localOnlySyncRecords: LocalStudyRecord[];
  syncingRecordId: string | null;
  onRetrySync: (sessionId: string) => void;
  onRetryAllSync: () => void;
};

export function Dashboard({
  materials,
  personas,
  selectedPersona,
  onSelectPersona,
  onStart,
  onDiagnose,
  canDiagnose,
  onUpload,
  onDelete,
  busy,
  deletingId,
  uploadStatus,
  onNavigate,
  archive,
  reviewTasks,
  onStartReview,
  showTransferQueue,
  transferCandidates,
  transferArchiveCount,
  transferSourceCount,
  onStartTransfer,
  pendingSyncRecords,
  localOnlySyncRecords,
  syncingRecordId,
  onRetrySync,
  onRetryAllSync,
}: DashboardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const averageMastery = archive.length
    ? Math.round(archive.reduce((sum, item) => sum + item.mastery, 0) / archive.length)
    : 0;

  const builtInMaterial = materials.find((item) => item.id === "senet-cvpr-2018");
  const heroMaterial = builtInMaterial ?? materials[0];
  return (
    <div className="dashboard page-enter">
      <header className="topbar">
        <div>
          <p className="eyebrow">2026 · 夏日求知计划</p>
          <h1>晚上好，今天想真正读懂什么？</h1>
          <p className="topbar-subtitle">问渠不替你读，而是陪你把知识变成自己的话。</p>
        </div>
        <div className="streak">
          <Flame size={17} />
          <span>已完成陪读</span>
          <strong>{archive.length}</strong>
          <small>次</small>
        </div>
      </header>

      <section className="hero-panel">
        <div className="hero-copy">
          <span className="hero-kicker"><Sparkles size={14} /> 今日继续</span>
          <h2>
            从“看过”到“会讲”，
            <br />
            只差一次主动回忆。
          </h2>
          <p>
            原文证据、双轨讲解、主动回忆和错因档案，陪你走完整个学习闭环。
          </p>
          <div className="diagnostic-entry-actions">
            {canDiagnose && builtInMaterial ? (
              <button
                className="secondary-button"
                type="button"
                onClick={() => onDiagnose(heroMaterial.id)}
                disabled={busy}
              >
                <BrainCircuit size={18} aria-hidden="true" />
                先做 3 题诊断
              </button>
            ) : null}
            <button
              className="primary-button"
              type="button"
              onClick={() => heroMaterial && onStart(heroMaterial.id)}
              disabled={busy || !heroMaterial}
            >
              {heroMaterial ? `直接开始 · 约 ${heroMaterial.estimated_minutes} 分钟` : "开始你的第一份材料"}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="hero-visual" aria-label="今日阅读材料与进度">
          <div className="book-stack" aria-hidden="true">
            <span className="book-sheet book-sheet-back" />
            <span className="book-sheet book-sheet-middle" />
            <article className="book-cover">
              <small>{heroMaterial?.source_type === "builtin" ? "今日材料 · CVPR 2018" : "今日材料 · 你的资料"}</small>
              <strong>{heroMaterial?.title ?? "你的下一份学习材料"}</strong>
              <span>{heroMaterial?.subtitle ?? "选择一份材料开始学习"}</span>
              <em>问渠陪读本</em>
            </article>
          </div>
          <div
            className="today-progress"
            style={{ "--progress": `${Math.max(averageMastery, 0) * 3.6}deg` } as CSSProperties}
          >
            <strong>{archive.length ? averageMastery : 0}<small>%</small></strong>
            <span>{archive.length ? "平均掌握" : "尚无记录"}</span>
          </div>
        </div>
      </section>


      {showTransferQueue && (
        <TransferQueue
          candidates={transferCandidates}
          archiveCount={transferArchiveCount}
          sourceCount={transferSourceCount}
          busy={busy}
          onStart={onStartTransfer}
        />
      )}
      <ReviewQueue
        tasks={reviewTasks}
        busy={busy}
        onStart={onStartReview}
      />
      <SyncRecoveryPanel
        records={pendingSyncRecords}
        syncingId={syncingRecordId}
        localOnlyRecords={localOnlySyncRecords}
        onRetry={onRetrySync}
        onRetryAll={onRetryAllSync}
      />
      <section className="quick-grid">
        <button type="button" onClick={() => onNavigate("materials")}>
          <span className="quick-index">壹</span>
          <span className="quick-icon blue"><Library size={20} /></span>
          <span><strong>继续上次阅读</strong><small>{materials.length ? `${materials[0].title} · 约 ${materials[0].estimated_minutes} 分钟` : "先添加一份资料"}</small></span>
          <em>{materials[0] ? `${materials[0].estimated_minutes} 分钟` : "待添加"}</em>
          <ChevronRight size={17} />
        </button>
        <button type="button" onClick={() => onNavigate("insights")}>
          <span className="quick-index">贰</span>
          <span className="quick-icon violet"><BarChart3 size={20} /></span>
          <span>
            <strong>回看一条错因</strong>
            <small>{archive.length ? `平均掌握度 ${averageMastery}%` : "完成一次学习后生成"}</small>
          </span>
          <em>8 分钟</em>
          <ChevronRight size={17} />
        </button>
        <button type="button" onClick={() => onNavigate("misconceptions")}>
          <span className="quick-index">叁</span>
          <span className="quick-icon coral"><BrainCircuit size={20} /></span>
          <span>
            <strong>整理错因图谱</strong>
            <small>
              {archive.flatMap((item) => item.misconception_tags).length} 个错因记录
            </small>
          </span>
          <em>5 分钟</em>
          <ChevronRight size={17} />
        </button>
      </section>

      <div className="dashboard-grid">
        <section className="panel upload-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">新材料</p>
              <h3>把难读的资料变成学习路径</h3>
            </div>
            <UploadCloud size={22} />
          </div>
          <button
            className="drop-zone"
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {busy ? <LoaderCircle className="spin" size={30} /> : <FileText size={30} />}
            <strong>{busy ? "正在拆解材料…" : "上传 PDF 或 Markdown"}</strong>
            <span>v.0 支持文本型 PDF，最多 30 页 / 10 MB</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.md,.markdown,application/pdf,text/markdown"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file);
              event.target.value = "";
            }}
          />
          {uploadStatus && <p className="upload-status">{uploadStatus}</p>}
        </section>

        <section className="panel persona-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">陪读人格</p>
              <h3>选择你愿意听进去的声音</h3>
            </div>
            <span className="tiny-label">可随时更换</span>
          </div>
          <div className="persona-list">
            {personas.map((persona) => (
              <button
                key={persona.id}
                className={selectedPersona === persona.id ? "persona active" : "persona"}
                onClick={() => onSelectPersona(persona.id)}
              >
                <span className={`persona-avatar ${persona.id}`}>
                  {persona.name.slice(0, 1)}
                </span>
                <span className="persona-copy">
                  <strong>{persona.name}</strong>
                  <small>{persona.tagline}</small>
                </span>
                {selectedPersona === persona.id && <CheckCircle2 size={18} />}
              </button>
            ))}
          </div>
        </section>
      </div>

      <section className="materials-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">你的书桌</p>
            <h3>继续最近的材料</h3>
          </div>
          <span className="muted">{materials.length} 份材料</span>
        </div>
        <div className="material-grid">
          {materials.map((material, index) => (
            <article className="material-card" key={material.id}>
              <div className={`material-cover cover-${index % 3}`}>
                <BookMarked size={26} />
                <span>{material.source_type === "builtin" ? "CVPR" : "YOUR DOC"}</span>
              </div>
              <div className="material-body">
                <div className="material-meta">
                  <span>{material.difficulty}</span>
                  <span>
                    <Clock3 size={13} />
                    {material.estimated_minutes} 分钟
                  </span>
                </div>
                <h4>{material.title}</h4>
                <p>{material.subtitle}</p>
                {canDiagnose && material.id === "senet-cvpr-2018" ? (
                  <div className="diagnostic-entry-actions compact">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => onDiagnose(material.id)}
                      disabled={busy}
                    >
                      先做 3 题诊断
                    </button>
                    <button type="button" onClick={() => onStart(material.id)} disabled={busy}>
                      直接开始
                      <ArrowRight size={16} aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => onStart(material.id)} disabled={busy}>
                    开始陪读
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
              {material.source_type !== "builtin" && (
                <button
                  className="card-delete"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(material.id);
                  }}
                  title="删除这份资料"
                  aria-label={`删除资料：${material.title}`}
                  disabled={busy || deletingId === material.id}
                >
                  {deletingId === material.id ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}
                </button>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
