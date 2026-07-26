# 问渠｜踩坑与复盘

> 本文件是每轮工作的强制前置读物和收尾记录。开始新一轮前先阅读，完成一轮后补充新问题、根因、解决办法和预防措施。

最后更新：2026-07-27

## 使用规则

1. 开始任何项目修改前，先完整阅读本文件；
2. 不重复尝试已经确认无效的方案；
3. 每轮结束前记录本轮新踩的坑；
4. 每条记录至少写清：现象、根因、解决办法、下次预防；
5. 密钥、令牌、密码和完整数据库地址不得写入本文件。

## 2026-07-27｜Supabase 云端账号上线

### 1. Marketplace 法律确认分为三步

- 现象：Supabase 安装不是一次“同意”即可完成，而是依次询问 Vercel Marketplace 附加条款、Supabase 隐私政策、Supabase 服务条款。
- 根因：三份文件属于独立法律协议，不能把对其中一份的授权自动扩大到另外两份。
- 解决：每出现一份新协议就暂停，让项目所有者查看链接并明确确认。
- 预防：以后安装 Marketplace 服务时，预先说明可能有多段独立条款，逐项记录授权，不代替用户接受。

### 2. `vercel integration add` 会整体重写 `.env.local`

- 现象：Supabase 资源连接成功后，Vercel 下载 Development 变量并重写 `.env.local`，原有本机 `OPENAI_API_KEY` 条目被移除。
- 根因：`vercel env pull` 和 Marketplace 自动同步采用整文件替换，而不是逐项追加。
- 解决：确认密钥未泄露、未进入 Git；OpenAI 若再次使用，需要走安全密钥流程重新写入。DeepSeek 后续直接放入 Vercel 服务端变量。
- 预防：执行 Marketplace 安装或 `vercel env pull` 前，先把自定义本地变量迁移到不会被覆盖的位置，或做不输出密钥内容的安全备份。

### 3. Vercel 自动提供 `NEXT_PUBLIC_`，Vite 默认只暴露 `VITE_`

- 现象：Supabase Marketplace 自动创建 `NEXT_PUBLIC_SUPABASE_*`，但项目是 Vite，默认只将 `VITE_*` 暴露给浏览器。
- 根因：Marketplace 主要按 Next.js 命名变量，和 Vite 的默认 `envPrefix` 不一致。
- 解决：在 `vite.config.ts` 中同时允许 `VITE_` 与 `NEXT_PUBLIC_`，云端客户端优先使用 publishable key，并兼容 anon key。
- 预防：接入任何 Marketplace 服务后，先核对实际下发的变量名和当前构建工具的公开变量规则，再部署。

### 4. 数据库密码不应出现在迁移命令参数中

- 现象：Supabase CLI 的 `--db-url` 会让数据库连接字符串进入进程参数。
- 根因：直接使用 CLI 虽方便，但可能在进程列表或诊断日志中暴露连接信息。
- 解决：新增 Python 迁移脚本，在进程内部读取 `.env.local`，执行带校验值的版本迁移，不打印连接内容。
- 预防：敏感连接只从受保护的环境文件或平台变量读取；迁移输出只记录版本和验证结果。

### 5. PowerShell 会解释未加引号的浏览器引用

- 现象：执行 `agent-browser click @e8` 时，PowerShell 把 `@e8` 当作变量展开，导致点击失败。
- 根因：`@` 在 PowerShell 中具有 splatting 语义。
- 解决：引用浏览器元素时写成带引号的 `'@e8'`，或改用语义定位器。
- 预防：Windows 下所有 agent-browser 的 `@eN` 引用一律加单引号。

### 6. Windows 终端中文输出可能乱码

- 现象：迁移脚本中文成功信息在部分 PowerShell/PTY 输出中显示为乱码。
- 根因：Windows 控制台代码页与 Python UTF-8 输出编码不一致。
- 解决：以退出码、数据库只读校验和结构查询作为最终证据，不依赖乱码文本判断成功。
- 预防：自动化脚本尽量输出简短 ASCII 状态码，中文说明写入 UTF-8 Markdown。

### 7. 多命令并行读取在 Windows 沙箱可能被拒绝

- 现象：并行启动多个 PowerShell 子进程读取技能文件时出现 `CreateProcessAsUserW failed: 5`。
- 根因：Windows 沙箱对子进程并发和默认 PowerShell 启动路径有限制。
- 解决：改用系统 PowerShell 完整路径并按顺序读取。
- 预防：本项目的重要前置文件优先串行读取；并发只用于稳定、互不依赖的只读检查。

### 8. Supabase 的 Vercel 指引没有 Vite 专用版本

- 现象：`vercel integration guide supabase --framework vite` 返回不支持，只列出 Next.js 与 SvelteKit。
- 根因：Marketplace 的框架化指引尚未覆盖 Vite。
- 解决：以实际下发变量、Supabase 官方客户端和 Vite `envPrefix` 规则完成适配，并通过生产构建验证。
- 预防：框架指引缺失时不照搬 Next.js 示例，回到服务商官方 SDK 与当前构建工具规则。

### 9. GitHub 连接器可能只有只读权限

- 现象：分支推送成功后，GitHub 连接器创建 PR 返回 `403 Resource not accessible by integration`。
- 根因：当前连接器安装没有该仓库的 Pull Request 写权限。
- 解决：按照 GitHub 发布规范，改用已认证的 `gh pr create` 创建草稿 PR。
- 预防：先用连接器尝试；遇到明确权限不足时使用官方 GitHub CLI 回退，并继续核对 PR 与 CI 状态。

### 10. 自动化浏览器的 JavaScript 在 PowerShell 中有双重引用风险

- 现象：含双引号或 CSS 选择器的 `agent-browser eval` 被 PowerShell 改写，产生 JavaScript 语法错误。
- 根因：命令经过 PowerShell 和浏览器 CLI 两层解析。
- 解决：能用 `get text`、`errors`、`console` 等原生命令时不使用 `eval`；元素引用统一加单引号。
- 预防：复杂 JavaScript 使用独立脚本或标准输入；不要把多层引号直接塞进 PowerShell 单行命令。
