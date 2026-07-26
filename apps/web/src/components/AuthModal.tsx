import { CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, X } from "lucide-react";
import { useState } from "react";

type AuthModalProps = {
  open: boolean;
  initialMode: "login" | "register";
  onClose: () => void;
  onSuccess: (name: string) => void;
};

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

  if (!open) return null;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const displayName = name.trim() || email.split("@")[0] || "问渠学友";
    localStorage.setItem("wenqu-demo-user", displayName);
    setDone(true);
    window.setTimeout(() => {
      onSuccess(displayName);
      setDone(false);
      onClose();
    }, 650);
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
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
            <h2>欢迎来到问渠</h2>
            <p>演示账户已创建，你的学习记录会保存在当前浏览器。</p>
          </div>
        ) : (
          <>
            <div className="auth-heading">
              <p className="eyebrow">建立你的学习档案</p>
              <h2>{mode === "register" ? "从一次真正读懂开始" : "欢迎回来"}</h2>
              <p>注册即可保存复述、掌握度和错因轨迹。</p>
            </div>
            <form onSubmit={submit}>
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
                  <button type="button" onClick={() => setVisible((value) => !value)}>
                    {visible ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </label>
              <label className="privacy-check">
                <input type="checkbox" required />
                <span>我同意演示版服务说明与隐私约定</span>
              </label>
              <button className="primary-button wide" type="submit">
                {mode === "register" ? "创建账户" : "登录"}
              </button>
            </form>
            <p className="auth-switch">
              {mode === "register" ? "已有账户？" : "还没有账户？"}
              <button
                onClick={() => setMode(mode === "register" ? "login" : "register")}
              >
                {mode === "register" ? "直接登录" : "免费注册"}
              </button>
            </p>
            <p className="demo-notice">当前为公开演示版，不会向服务器提交账户信息。</p>
          </>
        )}
      </section>
    </div>
  );
}
