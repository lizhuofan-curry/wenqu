import {
  Archive,
  BarChart3,
  Bell,
  BookOpen,
  BrainCircuit,
  Compass,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Search,
  Sun,
  UserPlus,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

export type View =
  | "home"
  | "study"
  | "materials"
  | "insights"
  | "misconceptions"
  | "archive";

type ShellProps = {
  children: ReactNode;
  view: View;
  onNavigate: (view: View) => void;
  studyEnabled: boolean;
  userName: string;
  onAuth: (mode: "login" | "register") => void;
  onSignOut: () => void;
  cloudEnabled: boolean;
  demoMode: boolean;
  degraded: boolean;
};

const items: Array<{
  id: Exclude<View, "study">;
  label: string;
  icon: typeof Compass;
}> = [
  { id: "home", label: "今日阅读", icon: Compass },
  { id: "materials", label: "资料库", icon: BookOpen },
  { id: "insights", label: "学习洞察", icon: BarChart3 },
  { id: "misconceptions", label: "错因图谱", icon: BrainCircuit },
  { id: "archive", label: "阅读档案", icon: Archive },
];

export function Shell({
  children,
  view,
  onNavigate,
  studyEnabled,
  userName,
  onAuth,
  onSignOut,
  cloudEnabled,
  demoMode,
  degraded,
}: ShellProps) {
  const [dark, setDark] = useState(() => localStorage.getItem("wenqu-theme") === "dark");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("wenqu-theme", dark ? "dark" : "light");
  }, [dark]);

  function go(next: View) {
    onNavigate(next);
    setMobileOpen(false);
  }

  return (
    <div className={view === "study" ? "app-shell study-mode" : "app-shell"}>
      <aside className={mobileOpen ? "sidebar open" : "sidebar"}>
        <button className="mobile-close" onClick={() => setMobileOpen(false)}>
          <X size={20} />
        </button>
        <button className="brand" onClick={() => go("home")}>
          <span className="brand-mark">问</span>
          <span>
            <strong>问渠</strong>
            <small>个性化陪读室</small>
          </span>
        </button>

        <div className="nav-label">学习空间</div>
        <nav className="main-nav" aria-label="主导航">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={view === item.id ? "active" : ""}
                onClick={() => go(item.id)}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
          {studyEnabled && (
            <button
              className={view === "study" ? "active" : ""}
              onClick={() => go("study")}
            >
              <span className="live-dot" />
              正在陪读
            </button>
          )}
        </nav>

        <div className="source-card">
          <span className="source-seal" aria-hidden="true">问渠</span>
          <div>
            <span>问渠 · 取义</span>
            <p>问渠那得清如许，为有源头活水来。</p>
            <small>—— 朱熹《观书有感》</small>
          </div>
        </div>

        <div className="sidebar-footer">
          <span className="status-dot" />
          <div>
            <strong>{cloudEnabled ? "云端同步已开启" : "本地记录已开启"}</strong>
            <small>{cloudEnabled ? "登录后可跨设备查看" : "完成后可导出数据"}</small>
          </div>
          <em>v.2</em>
        </div>
      </aside>

      <div className="app-body">
        <header className="global-topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen(true)}>
            <Menu size={20} />
          </button>
          <div className="global-search">
            <Search size={17} />
            <input placeholder="搜索资料、笔记或错因…" />
            <kbd>⌘ K</kbd>
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button"
              onClick={() => setDark((value) => !value)}
              aria-label={dark ? "切换到白天模式" : "切换到夜间模式"}
              title={dark ? "白天模式" : "夜间模式"}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="icon-button" aria-label="通知">
              <Bell size={18} />
              <span className="notice-dot" />
            </button>
            {userName ? (
              <>
                <button className="user-chip" title="当前登录用户">
                  <span>{userName.slice(0, 1)}</span>
                  {userName}
                </button>
                <button className="login-button" onClick={onSignOut}>
                  <LogOut size={16} />
                  退出
                </button>
              </>
            ) : (
              <>
                <button className="login-button" onClick={() => onAuth("login")}>
                  <LogIn size={16} />
                  登录
                </button>
                <button className="register-button" onClick={() => onAuth("register")}>
                  <UserPlus size={16} />
                  免费注册
                </button>
              </>
            )}
          </div>
        </header>
        {demoMode && (
          <div className="demo-bar" role="status">
            当前为演示模式，数据来自本地内置示例，非真实后端。
          </div>
        )}
        {degraded && !demoMode && (
          <div className="degraded-bar" role="alert">
            网络连接失败，当前显示本地数据。后续操作将重试连接后端。
          </div>
        )}
        <main className="main-content">{children}</main>
      </div>
      {mobileOpen && <button className="mobile-overlay" onClick={() => setMobileOpen(false)} />}
    </div>
  );
}
