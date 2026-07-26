import {
  ArrowRight,
  BookMarked,
  CheckCircle2,
  Clock3,
  FileText,
  LoaderCircle,
  UploadCloud,
} from "lucide-react";
import { useRef } from "react";
import type { MaterialSummary, Persona } from "../lib/types";

type DashboardProps = {
  materials: MaterialSummary[];
  personas: Persona[];
  selectedPersona: string;
  onSelectPersona: (id: string) => void;
  onStart: (materialId: string) => void;
  onUpload: (file: File) => void;
  busy: boolean;
  uploadStatus: string;
};

export function Dashboard({
  materials,
  personas,
  selectedPersona,
  onSelectPersona,
  onStart,
  onUpload,
  busy,
  uploadStatus,
}: DashboardProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="dashboard page-enter">
      <header className="topbar">
        <div>
          <p className="eyebrow">2026 · 夏日阅读计划</p>
          <h1>晚上好，今天想读懂什么？</h1>
        </div>
        <div className="streak">
          <span>连续陪读</span>
          <strong>1</strong>
          <small>天</small>
        </div>
      </header>

      <section className="hero-panel">
        <div className="hero-copy">
          <span className="hero-kicker">不只是总结</span>
          <h2>
            把论文读懂，
            <br />
            再用自己的话讲出来。
          </h2>
          <p>
            原文证据、双轨讲解、主动回忆和错因档案，陪你走完整个学习闭环。
          </p>
          <button
            className="primary-button"
            onClick={() => materials[0] && onStart(materials[0].id)}
            disabled={busy || materials.length === 0}
          >
            继续 SENet 陪读
            <ArrowRight size={18} />
          </button>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="knowledge-core">
            <span>SE</span>
            <small>channel</small>
          </div>
          <div className="floating-card card-a">Squeeze</div>
          <div className="floating-card card-b">Excitation</div>
          <div className="floating-card card-c">Scale</div>
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="panel upload-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">新材料</p>
              <h3>把难读的资料交给陪读室</h3>
            </div>
            <UploadCloud size={22} />
          </div>
          <button
            className="drop-zone"
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
                <button onClick={() => onStart(material.id)} disabled={busy}>
                  开始陪读
                  <ArrowRight size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

