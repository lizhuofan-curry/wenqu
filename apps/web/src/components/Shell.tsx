import {
  Archive,
  BookOpen,
  Compass,
  MessageCircleQuestion,
  Settings2,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";

type View = "home" | "study" | "archive";

type ShellProps = {
  children: ReactNode;
  view: View;
  onNavigate: (view: View) => void;
  studyEnabled: boolean;
};

export function Shell({ children, view, onNavigate, studyEnabled }: ShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => onNavigate("home")}>
          <span className="brand-mark">知</span>
          <span>
            <strong>知隅</strong>
            <small>陪读阅读室</small>
          </span>
        </button>

        <nav className="main-nav" aria-label="主导航">
          <button
            className={view === "home" ? "active" : ""}
            onClick={() => onNavigate("home")}
          >
            <Compass size={18} />
            阅读室
          </button>
          <button
            className={view === "study" ? "active" : ""}
            onClick={() => studyEnabled && onNavigate("study")}
            disabled={!studyEnabled}
          >
            <BookOpen size={18} />
            正在陪读
          </button>
          <button
            className={view === "archive" ? "active" : ""}
            onClick={() => onNavigate("archive")}
          >
            <Archive size={18} />
            阅读档案
          </button>
        </nav>

        <div className="sidebar-note">
          <Sparkles size={18} />
          <p>AI 不替你学习，它负责发现你以为自己懂了的地方。</p>
        </div>

        <div className="sidebar-footer">
          <button aria-label="帮助">
            <MessageCircleQuestion size={18} />
          </button>
          <button aria-label="设置">
            <Settings2 size={18} />
          </button>
          <span>v.0</span>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}

