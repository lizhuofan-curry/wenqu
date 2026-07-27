import { CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { saveProfile } from "../lib/storage";
import type { LocalProfile } from "../lib/storage";
import {
  cloudEnabled,
  loginCloudAccount,
  registerCloudAccount,
} from "../lib/cloud";

type AuthModalProps = {
  open: boolean;
  initialMode: "login" | "register";
  onClose: () => void;
  onSuccess: (profile: LocalProfile) => void;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function AuthModal({
  open,
  initialMode,
  onClose,
  onSuccess,
}: AuthModalProps) {
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !containerRef.current) return;
      const focusable = containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const focusFirst = () => {
      if (!containerRef.current) return;
      const first = containerRef.current.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    };
    const timer = requestAnimationFrame(focusFirst);

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(timer);
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const displayName = name.trim() || email.split("@")[0] || "问渠学友";
    const profile = {
      displayName,
      email: email.trim().toLowerCase(),
      createdAt: new Date().toISOString(),
    };
    setBusy(true);
    setError("");
    try {
      if (cloudEnabled) {
        if (mode === "register") {
          const result = await registerCloudAccount(
            displayName,
            profile.email,
            password,
          );
          setSuccessMessage(result.message);
          setDone(true);
          if (result.profile) {
            saveProfile(result.profile);
            onSuccess(result.profile);
          }
        } else {
          const cloudProfile = await loginCloudAccount(profile.email, password);
          saveProfile(cloudProfile);
          setSuccessMessage("登录成功，本机已有记录已同步到你的云端档案。");
          setDone(true);
          onSuccess(cloudProfile);
        }
      } else {
        saveProfile(profile);
        setSuccessMessage(
          "本地档案已创建。昵称、邮箱和学习记录保存在当前浏览器，密码不会保存。",
        );
        setDone(true);
        onSuccess(profile);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "账户操作失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose} ref={containerRef}>
      <section
        className="auth-modal"
        role="dialog"
        aria-modal="true"
        aria-label={mode === "register" ? "注册问渠" : "登录问渠"}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="关闭">
          <X size={19} />
        </button>
        <div className="auth-brand">
          <span className="brand-mark">问</span>
          <div>
            <strong>问渠</strong>
            <small>为有源头活水来</small>
          </div>
        </div>
        {done ? (
          <div className="auth-success">
            <CheckCircle2 size={44} />
            <h2>{mode === "register" ? "欢迎来到问渠" : "欢迎回来"}</h2>
            <p>{successMessage}</p>
            <button className="primary-button wide" onClick={onClose}>
              开始阅读
            </button>
          </div>
        ) : (
          <>
            <div className="auth-heading">
              <p className="eyebrow">建立你的学习档案</p>
              <h2>{mode === "register" ? "从一次真正读懂开始" : "欢迎回来"}</h2>
              <p>注册即可保存复述、掌握度和错因轨迹。</p>
            </div>
            <form onSubmit={(event) => void submit(event)}>
              {mode === "register" && (
                <label>
                  <span>怎么称呼你</span>
                  <div className="input-shell">
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="例如：小渠"
                    />
                  </div>
                </label>
              )}
              <label>
                <span>邮箱</span>
                <div className="input-shell">
                  <Mail size={17} />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </div>
              </label>
              <label>
                <span>密码</span>
                <div className="input-shell">
                  <LockKeyhole size={17} />
                  <input
                    type={visible ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={6}
                    placeholder="至少 6 位"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setVisible((value) => !value)}
                    aria-label={visible ? "隐藏密码" : "显示密码"}
                    title={visible ? "当前密码可见，点击隐藏" : "当前密码已隐藏，点击显示"}
                  >
                    {visible ? <Eye size={17} /> : <EyeOff size={17} />}
                  </button>
                </div>
              </label>
              <label className="privacy-check">
                <input type="checkbox" required />
                <span>我同意演示版服务说明与隐私约定</span>
              </label>
              <button className="primary-button wide" type="submit" disabled={busy}>
                {busy ? "请稍候…" : mode === "register" ? "创建账户" : "登录"}
              </button>
              {error && <p className="auth-error" role="alert">{error}</p>}
            </form>
            <p className="auth-switch">
              {mode === "register" ? "已有账户？" : "还没有账户？"}
              <button
                onClick={() => setMode(mode === "register" ? "login" : "register")}
              >
                {mode === "register" ? "直接登录" : "免费注册"}
              </button>
            </p>
            <p className="demo-notice">
              {cloudEnabled
                ? "云端账号已开启：密码由 Supabase Auth 安全处理，问渠不保存明文密码。"
                : "当前为浏览器本地档案：不向服务器提交账户信息，也不会保存密码。"}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
