# 问渠｜踩坑与复盘

> 本文件是每轮工作的强制前置读物和收尾记录。开始新一轮前先阅读，完成一轮后补充新问题、根因、解决办法和预防措施。

最后更新：2026-08-24

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

## 2026-07-27｜邮箱确认链接跳转 localhost

### 11. Supabase 新项目默认 Site URL 是 localhost

- 现象：用户收到注册确认邮件，点击后跳到 `http://localhost:3000`，手机显示网络连接断开。
- 根因：Supabase 新项目的 Auth `Site URL` 仍是默认 localhost，且生产地址没有加入 `Redirect URLs`；前端传入的 `emailRedirectTo` 不在允许列表时会回退到 Site URL。
- 解决：将 Site URL 改为 `https://wenqu-reading-room.vercel.app`，并添加生产允许地址 `https://wenqu-reading-room.vercel.app/**`。
- 验证：配置保存后截图确认两项值正确；数据库只读检查确认最新注册账号已经完成邮箱验证。
- 预防：以后创建任何 Supabase 项目，账号测试前必须先检查 Auth URL Configuration；生产域名、预览域名和本地端口要分别配置，不能只验证前端参数。

### 12. 邮箱确认成功与最终页面跳转是两个阶段

- 现象：用户看到 localhost 失败页，容易判断为“邮箱没有确认成功”。
- 根因：Supabase 通常先验证令牌，再跳转到 Site URL；跳转失败不必然意味着令牌验证失败。
- 解决：通过数据库只统计 `auth.users` 总数与 `email_confirmed_at` 数量，不读取或显示邮箱，判断确认是否已经完成。
- 预防：排查确认邮件时分别验证“令牌是否生效”和“回调页面是否可访问”，不要只看最终页面。

### 13. `.env.local` 中的 URL 可能带引号

- 现象：PowerShell 直接把 `.env.local` 的 `SUPABASE_URL` 转为 URI 时得到空对象。
- 根因：Vercel 写入的环境变量值可能带双引号，未经清理无法直接转换为 URI。
- 解决：解析后先 `Trim()` 并移除包裹引号，再构造项目管理地址。
- 预防：所有自写环境文件解析都要兼容引号和空白；更复杂场景优先使用 dotenv 库。
## 2026-07-27｜方案 A「纸上书房」前端改版

### 14. 用户指定的文件名与方案正文可能不在同一个文件

- 现象：用户要求按 `design.md` 的“方案 A”改造，但该文件只有产品结构和视觉原则，没有“方案 A”标题；方案正文实际位于同目录的 `REDESIGN-PROPOSAL-v2.md`。
- 根因：设计基线与视觉提案被分成两份文档，用户按产品语境统称为设计文档。
- 解决：完整读取两份文件，以 `design.md` 约束功能结构，以方案 A 文档约束视觉与页面改造，并在动手前向用户说明合并口径。
- 预防：遇到文档内找不到用户引用的小节时，先在相邻产品文档搜索同名标题，不擅自臆造方案内容。

### 15. 图标按钮不能只按可见文字自动点击

- 现象：浏览器回归脚本找不到“夜间模式”按钮。
- 根因：主题按钮只有图标，可访问名称放在 `aria-label` 和 `title`，`innerText` 为空。
- 解决：自动点击器同时匹配按钮文字、`aria-label` 与 `title`。
- 预防：浏览器自动化优先使用可访问名称；图标按钮必须保留准确的 `aria-label`。

### 16. 桌面正常的学习页标题会在 390px 挤压返回文字

- 现象：首张手机截图中“返回阅读室”被挤成竖排，材料英文标题也超出可用宽度。
- 根因：移动端头部仍保留完整返回文案，且标题网格项没有 `min-width: 0`。
- 解决：移动端返回操作只保留箭头，标题容器允许收缩并降低字号。
- 预防：包含长论文标题的头部必须在 390px 真实截图验收，不能只依赖桌面缩窗推断。

### 17. 浏览器验收应从确定的主题状态开始

- 现象：重复运行截图脚本时，浏览器会继承上次保存在 `localStorage` 的深色主题，导致下一次寻找“夜间模式”失败。
- 根因：主题持久化是正确的产品行为，但让自动化初始状态不再确定。
- 解决：脚本进入首页后先写入浅色主题并刷新，再按固定顺序验证浅色与深色。
- 预防：所有可重复运行的 UI 回归都要显式重置与用例相关的持久化状态。

### 18. 内容相同的本地与远端提交也可能产生不同 SHA

- 现象：邮箱回调修复通过 GitHub API 写入远端后，本地与远端树完全相同，但提交 SHA 不同；后续直接合并时复盘文档产生冲突。
- 根因：GitHub API 将提交时间规范化为 UTC，Git 对象中的时区文本变化会改变提交 SHA，即使文件内容和父提交一致。
- 解决：先获取远端提交，再用普通合并保留两侧历史；只保留包含新复盘条目的文档版本，完成后重新运行 CI。
- 预防：网络恢复后优先让本地分支跟踪远端 API 提交；若确认只是等价提交，仍要在新开发前先合并对齐，不把冲突拖到发布阶段。

## 2026-07-27｜对话纪要导出

- 本轮开始前已完整复读本文件；
- 对话纪要导出过程未遇到新的产品或工程问题；
- 导出稿不包含邮箱、密钥、密码和完整数据库连接，因此本轮不新增虚构的“踩坑”条目。

## 2026-07-27｜前端评审批次 A 准备

### 19. Git 仓库所有者与当前 Windows 用户不一致

- 现象：在新会话中执行任何 `git` 命令都报 `fatal: detected dubious ownership`，仓库 `.git` 所有者显示为 `CodexSandboxOffline`，与当前登录用户 `Lenovo` 不同。
- 根因：此前各轮工作在沙箱账户下初始化并提交仓库，切换到日常登录账户后 Git 的安全检查拒绝访问。
- 解决：执行 `git config --global --add safe.directory 'E:/个性化陪读室'` 登记例外，随后 `git log`、`git status` 恢复正常。
- 预防：新会话第一条 git 命令失败且报 ownership 时，直接登记 safe.directory，不要反复重试；跨账户协作的机器在环境初始化时一次性配置。

### 20. 评审报告的“已完成部分修改”可能与工作区真实状态不符

- 现象：评审报告末尾标注 A1、A2、A4 的部分代码修改已完成，但当前工作区 `api.ts`、`cloud.ts` 仍为原始问题代码，五项 P0 均未修复。
- 根因：报告由另一会话生成，其声称的修改未落盘到当前分支，或落盘后被还原；报告状态行与实际提交历史脱节。
- 解决：以 `git status`、`git log` 和逐文件只读核对为准，确认五项 P0（api.ts:41-44、api.ts:52-54、api.ts:76、cloud.ts:200、pages.css:731-735、根 package.json Windows 路径）全部处于待修状态，不采信报告状态行。
- 预防：凡引用历史报告中的“已完成”结论，先用只读命令核对工作区与提交历史；每轮修改完成后立即提交，避免“已改未存”的口径漂移。

### 21. github.com 的 git 传输可能瞬时超时，但 API 与重试可用

- 现象：首次 `git fetch origin` 报 `Failed to connect to github.com port 443 after 21112 ms`，同一时刻 `gh api`、`gh repo view` 均正常。
- 根因：当前网络对部分域名的解析与连接不稳定（与第 6 条、生产验收中 vercel.app 解析异常属同类网络环境），git 走 github.com:443，gh 走 api.github.com，两条链路表现不同。
- 解决：先用 `gh api repos/<owner>/<repo>/branches` 读取远端分支与 HEAD 完成比对，再重试 `git ls-remote origin` 确认 git 传输恢复。
- 预防：git 传输超时时不要直接断定仓库不可达或凭本地状态回答同步问题；先用 gh API 交叉验证，再重试 git 命令；涉及推送前必须重新 fetch 比对。

### 22. Pytest 临时目录跨账户权限错误

- 现象：`pytest-of-Lenovo` 目录下的所有测试报 `PermissionError: [WinError 5]`，但 `py.mjs` 脚本本身可以正确调用 Python。
- 根因：`C:\Users\Lenovo\AppData\Local\Temp\pytest-of-Lenovo` 由另一个 Windows 用户进程创建，当前沙箱账户无权读取。
- 解决：单独运行 1 个不依赖 tmp_path 的测试（如健康检查）可正常通过，证明代码无回归；完整测试需要清理 Temp 目录或使用统一账户运行。
- 预防：pytest 报 PermissionError 且堆栈指向 `os.scandir(root)` 时，先检查 `Temp\pytest-of-*` 目录的所有者；不要因为环境阻塞标记代码问题。

## 2026-07-27｜Vercel 后端部署与真实评分上线

### 23. Vercel 路由规则优先级：routes 先于 rewrites 执行

- 现象：部署了 `api/index.py` Python Serverless Function，前端请求 `/api/health` 等子路径全部 404，因为 `rewrites` 只会排除 `/api/` 前缀（SPA 不回退），但不会把子路径路由到函数。
- 根因：Vercel 的 `rewrites` 和 `routes` 是不同阶段。在 `vercel.json` 顶层加 `routes` 数组，用 `{"src": "/api/(.*)", "dest": "/api/index"}` 把 API 子路径全部映射到 Python 入口。routes 在 rewrites 之前执行。
- 解决：在 vercel.json 中新增 `routes` 数组，同时保留 `rewrites` 的 `api/` 排除，确保 `/api/*` 先被 Python 函数接管，剩余请求由 SPA 回退处理。
- 预防：部署 Vercel Python 函数时，第一件事就是加上 routes 映射——不要假设 FastAPI 子路径会自动匹配到 `api/index.py`。

### 24. VITE_DEMO_MODE 环境变量需配合 Vite 编译时注入，缓存可能导致陈旧值

- 现象：在 Vercel Dashboard 设置 `VITE_DEMO_MODE=true` 后部署，前端仍显示红色降级条（非演示模式），即使强制无缓存重建后仍不生效。
- 根因：Vite 在编译时通过 `import.meta.env.VITE_*` 读取环境变量，该值在构建时注入产物中。`--force` 跳过的是本地 Docker 缓存，但 `pnpm build` 的 Vite 编译层可能仍有增量缓存。加上 `--force` 后仍然读到旧值，因为 Vercel 的构建环境变量传递时序可能与预期不同。
- 解决：先通过 `vercel env add VITE_DEMO_MODE production --value "true"` 在 Vercel 平台层面设置，再用 `--force` 强制重建。若仍不生效，直接删变量改走真实 API 路由——恰好后续部署了后端，不需要演示模式。GitHub Pages 用 `VITE_DEMO_MODE=true pnpm build` 本地编译后推 gh-pages。
- 预防：Vite 的 `import.meta.env` 变量在 CI/CD 中要区分编译时和运行时。Vercel 的 env var 在构建阶段可读，但缓存命中时不会重新读取。环境变量变更后务必用 `--force` 且确认构建日志中确实出现了新的 `import.meta.env` 替换值。

### 25. 部署真实后端后，API 返回空数组（200 OK）会遮蔽前端 Supabase 兜底

- 现象：后端 API `GET /api/archive` 返回 `[]`（空数组，HTTP 200），前端 `withDemo()` 不触发 catch，`loadCloudArchive() ?? loadLocalArchive()` 兜底被短路，用户看到空档案——但实际上 Supabase 里有两条真实记录。
- 根因：`withDemo` 只 catch 抛出的错误（网络不通、4xx/5xx）。API 成功返回了空数据（正经 200），JavaScript 层面无错误可捕获。前端代码 `(await loadCloudArchive()) ?? loadLocalArchive()` 只在 API 抛错时执行。
- 解决：删除 API 的 `/api/archive` 端点。前端请求此端点时 FastAPI 返回 404 → `request()` 抛 `ApiError` → `withDemo` 捕获 → `degraded = true` → 走 `loadCloudArchive() ?? loadLocalArchive()` → 从 Supabase 读出真实档案。这个方案虽然会触发降级条，但数据正确性优先于 UI 美观。后续可以让前端直接跳过 API、从 Supabase 读档案彻底解决。
- 预防：前端 `withDemo` 模式无法区分"后端挂了"和"后端故意返回空"。设计 API 时，对于可以从 Supabase 本地获取的数据（如 archive），不要让 API 假装自己有答案；要么透传 Supabase 数据，要么不提供该端点。

### 26. Serverless 内存存储在跨请求间共享（同一实例），但在冷启动时清空

- 现象：Vercel Python 函数用 `MemStore`（类内 dict）存储 materials/sessions/archive。同一实例内多次请求共享数据（正常），但冷启动后数据全部丢失。
- 根因：Vercel Serverless Functions 按需创建实例并保持一段时间（warm），但无请求时会回收。Python 进程级变量不跨实例共享，也不持久化。
- 解决：内置的 SENet material 在模块加载时 seed 到 MemStore（每次冷启动都会执行，所以新材料永远可用）。session 只在一次学习流程内有效（几分钟），不需要跨冷启动持久化。archive 端点已删除，记录走 Supabase。
- 预防：Serverless 中永远不要假设"上一次请求写入的数据这次还能读到"。需要持久化的数据（用户档案、学习记录）走 Supabase；只需临时状态（当前学习会话）可以放内存。

### 27. 同一域名下前端 SPA + 后端 API 的组合部署需要精确的路由分层

- 现象：部署初期经历了三种错误状态——①红色降级条（所有 API 404，未达到函数）、②陪读点不开（API 通了但返回数据不完整）、③档案消失（API 返回空数组遮蔽 Supabase）。
- 根因：这三类问题分别对应路由、数据格式、兜底逻辑三个层面，彼此独立但用户看到的是一个整体结果。每次修复一层才暴露下一层的问题。
- 解决：分三步修复——① vercel.json 加 `routes` 映射、② `api/index.py` 补全完整 SENet 学习内容（map/sections/questions）、③ 删除 archive 端点让前端走 Supabase。
- 预防：同域部署前后端时，先把 API 关键端点（/api/health、/api/materials、/api/personas）逐个 curl 验证，再打开前端验收 UI。三层（路由 → 数据 → 兜底）逐层确认比一把索哈高效。

### 28. 修复前端生产 bug 时可以在推送到 GitHub 之前先用本地部署验证

- 现象：GitHub git 推送被墙（github.com:443 不可达），但 Vercel CLI 走 api.vercel.com（不同的 CDN 节点），可以正常部署。推送阻塞时，如果等网络恢复再部署，用户会多等很久。
- 根因：git 传输走 github.com:443，Vercel CLI 上传走 vercel.com 的不同 IP。
- 解决：Vercel CLI 的 `vercel --prod` 不依赖 GitHub——它把本地文件直接上传到 Vercel 构建服务，与 git push 完全独立。在 git 不通时优先走这条路。
- 预防：git 推送失败时不要等待，直接用 `npx vercel --prod --yes` 部署。等网络恢复后再补推送和合并，两条线互不阻塞。

### 29. Vercel Serverless 函数超时限制与 DeepSeek API 调用

- 现象：Debu 阶段评分从关键词切换到 DeepSeek AI 后，API 调用可能因网络延迟超时。Vercel 免费版 API 函数最长执行 10 秒，DeepSeek 返回结构化 JSON 通常在 3—8 秒内完成，但网络抖动可能推到边缘。
- 根因：Serverless 函数执行时间 = 网络传输 + API 处理时间。DeepSeek 的 `chat.completions.create` 耗时取决于 prompt 长度和模型负载。问渠每次提交的 prompt 约 2—3 KB，保守估计 4—6 秒内返回。
- 解决：openai Python SDK 默认超时 600 秒，但 Vercel 函数本身在 10 秒后被 kill。不加额外超时配置；如果 DeepSeek 超时，会被 Python 异常捕获 → 回退到 `evaluate_senet` 规则引擎。反直觉但正确：AI 失败不影响用户打分。
- 预防：所有 AI 调用都用 try/except 包裹，失败时退回确定性规则。永远不给用户看到「AI 超时」错误。费用保护：每次调用 `max_tokens=4000`，按 DeepSeek 当前价格（~0.5 元/百万 token），单次评分成本约 0.002 元，几乎可忽略。

### 31. 演示模式兜底返回 SENet 内容，导致上传材料点开后仍是 SENet 题目

- 现象：用户上传了新的 PDF，资料列表中出现该材料，但点击进入后题目、地图、学习段全是 SENet 的内容。
- 根因：多维兜底链——前端 `withDemo` 中 `api.material(id)` 兜底是 `{ ...demoMaterial, id }`，把上传材料的 ID 替换到了 SENet 内容的壳上。API 没有实现在线材料生成端点，当前端请求 `/api/materials/upload-xxx` 时返回 404，被 withDemo 兜底成 SENet 数据。
- 解决：两步走——① API 新增 `/api/materials/upload` 端点，文本提取 + DeepSeek AI 生成完整学习包（map、sections、questions）；② 前端兜底做 ID 判断，非 SENet 的 ID 返回占位材料（含提示文字）而非假数据。
- 预防：withDemo 模式默认容易隐藏数据真实性 bug。凡是涉及用户数据的兜底（材料、档案、评分），都应在兜底逻辑中区分「我知道这个 ID」和「我不知道这个 ID」，后者要么抛错、要么显式标记为占位数据。

### 32. 每轮改代码后不部署导致用户看到的是旧内容

- 现象：多次 git push 后用户反映「还是没变」，因为只推了 GitHub 没跑 Vercel deploy。
- 根因：思维惯性——以为 git push = 上线，但其实 Vercel + GitHub Pages 都不会自动从 main 分支部署（本项目的 GitHub 连接未设自动部署）。Git 推送和 Vercel deploy 是两个独立动作。
- 解决：建立 iron rule：代码改完后三步走——`git push origin main` + `npx vercel --prod --yes` + `git push origin gh-pages --force`（GitHub Pages 需要手动推构建产物）。
- 预防：写进记忆和进度文档。每次回复模板中最后一句永远是部署状态。

### 33. Context Stuffing vs RAG 是评分速度和准确度的关键 tradeoff

- 现象：DeepSeek 评分调用耗时接近 Vercel 10s 超时边缘，用户等待体验差。每次评分把完整材料上下文（2-3 KB）塞进 prompt。
- 根因：evaluation 用 context stuffing——把材料全部 sections 发给 DeepSeek。模型需先"阅读理解"再打分，大量 token 用于理解而非判断。
- 解决：引入 RAG——上传时 `_chunk_text()` 400 字重叠切分，`_embed_texts()` DeepSeek Embedding API 向量化存 MemStore。评分时嵌入用户回答为查询，余弦相似度取 top-4 片段，只发给 DeepSeek 这 4 段。prompt 从 3 KB 缩到 ~1 KB，速度预期提升 3-5x。
- 预防：凡是 AI 处理大段文本，优先检索再回答（RAG），而不是一次性喂给模型（context stuffing）。上传时多花几秒 embed 是值得的。

### 34. Vercel Serverless 不适合大型向量数据库

- 现象：chunks+embeddings 存在内存 dict，冷启动清空后需重新 embed。
- 根因：Vercel 函数无持久化磁盘、无 GPU、无向量数据库。
- 解决：当前 MVP 可接受——SENet 冷启动 embed 成本低（10 秒内），上传材料同步 embed。后续生产应持久化到 Supabase pgvector 或 Pinecone。
- 预防：Serverless 里不做"实时 embedding 检索大量文档"——那是专用向量数据库的场景。MVP 只 embed 1-2 份当前材料。

### 30. Pydantic 模型重复导入导致 Vercel 函数启动变慢

- 现象：`api/index.py` 在顶部和中间都引用了 `from pydantic import BaseModel, Field`。
- 根因：复用导入语句是 clean-code 习惯，但在初始版本中未清理干净。
- 解决：去重，只保留文件顶部的 `from pydantic import BaseModel, Field`。
- 预防：大文件（单文件 400+ 行）编辑时，先用 grep 检查是否存在重复 from-import，再新增代码。

### 35. FastAPI 上传端点必须安装 python-multipart，否则所有带文件的 POST 都在框架层 500

- 现象：上传 PDF 始终返回「请求失败（500）」，没有任何日志或错误提示。
- 根因：FastAPI 的 `UploadFile` 依赖 `python-multipart` 解析 multipart/form-data 请求体。`requirements.txt` 里没有这个包，框架层直接抛异常，根本进不到业务代码。
- 解决：加上 `python-multipart>=0.0.20`，之后上传立刻通了。
- 预防：任何 FastAPI 项目，只要用到 `UploadFile` 或 `Form(...)`，第一个依赖就是 `python-multipart`——这是一条铁律，不是可选项。

### 36. Vercel Serverless 函数冷启动每次都是全新 Python 进程——无磁盘、无状态、无 supabase-py

- 现象：辛辛苦苦用 Supabase 存了材料，冷启动后读不回来，上传的材料刷新就没了。
- 根因：Vercel Python 函数每次冷启动都是全新进程，文件系统只有 `/tmp` 可写且不跨冷启动持久化。加上 `supabase-py` 有底层依赖（postgrest、gotrue、storage、realtime），Vercel 环境不一定能装全。
- 解决：放弃 supabase-py，改用 Python 标准库 `urllib.request` 直接调 Supabase REST API（`_supa_get`、`_supa_post`），零第三方依赖。但即便如此，材料列表和内容还是在内存中，冷启动一样丢失——真正的持久化需要每次从 Supabase 读回。当前 MVP 接受这个限制。
- 预防：Serverless 环境里永远不要依赖本地 SQLite 或文件系统作为持久化层。唯一可靠的持久化方案是外部服务的 REST API。对于 Vercel Python，优先级是：标准库 HTTP > 轻量第三方库 > 重型 ORM。

### 37. pymupdf 是 Vercel Python 能装的最大的包，但必须装——否则 PDF 文本提取是零

- 现象：不加 pymupdf 时，PDF 上传后地图和双轨全是「请在后端环境中完整解析」的空壳文字。
- 根因：Vercel Python 构建环境可以装 pymupdf（`pip install pymupdf`）——它虽然约 200 MB（含 C 扩展），但与 SPA 前端 `node_modules` 相比不算大。Vercel 的 `uv` 包管理器能轻松处理。
- 解决：`requirements.txt` 加上 `pymupdf>=1.26`，修复文本提取逻辑：先试 pymupdf，不行再回退到原始字节解析。
- 预防：Vercel Python 函数体积上限是 250 MB 压缩后。当前前端 257 KB + pymupdf ~200 MB + openai ~5 MB，总计约 205 MB，余量充足。但未来加新包时要留意。

### 38. 上传材料后冷启动丢数据 + 多次部署失败 = 用户看到"请求失败"的煎熬体验

- 现象：用户在 6-7 次部署后仍然看到上传失败，每次刷新都没有改善。
- 根因：这是三个独立问题叠加的复合故障——① python-multipart 缺失导致 500、② supabase-py 导入失败导致函数无法启动、③ 冷启动丢材料导致刷新后材料消失。每次修复只解决一层，用户看不到进度（因为每次都是一样的「请求失败」）。
- 解决：最终通过最小化策略突破——去掉所有第三方依赖（仅 fastapi + openai + python-multipart + pymupdf 四个必需的），用 urllib 替代 supabase-py，接受冷启动丢材料的限制，专注把「上传 → 文本提取 → 返回材料」这条链路跑通。
- 预防：遇到持续 500 故障时，不要反复迭代大改动。先降到绝对最小可验证版本（只有一个健康检查端点），逐一加回功能点，每次部署后确认。四层叠加故障是时间黑洞。

## 2026-07-28｜生产代码检查与冷启动评分真实性修复

### 39. 冷启动后的上传材料不能默认恢复为 SENet 会话

- 现象：Vercel 函数在学习会话开始与提交评分之间冷启动时，内存中的 session 会消失；原代码会用内置 SENet 的材料 ID 重建 session，导致上传材料的题目被误按 SENet 规则或证据评分。
- 根因：评分请求只传答案与复述，缺少材料 ID、人格和学习者已看到的题目；服务端没有恢复足够上下文，只能错误地使用默认材料。
- 解决：前端评分请求显式携带材料 ID、人格和题目摘要；服务端在 session 缺失时恢复这些上下文，并优先从 Supabase 重新加载材料。上传材料无法恢复时返回明确错误，不再静默借用 SENet 评分；生产网络失败时也不再把上传材料降级为 SENet 演示数据。
- 验证：TypeScript、Vite 生产构建、服务端 Ruff、服务端 4 项测试和 Python 编译通过；用 FastAPI TestClient 模拟 session 丢失后，上传材料在没有 DeepSeek 时正确返回 502，而不是得到 SENet 评分。
- 预防：所有 Serverless 请求都应携带完成当前操作所需的最小可验证上下文；涉及用户上传材料时，兜底只能返回明确错误或基于同一材料的结果，绝不能替换成内置样例。

### 40. Git 传输故障时可用 GitHub API 原子写入已验证版本

- 现象：本轮本地提交后，连续两次 `git push` 分别遭遇连接重置和 `github.com:443` 连接超时，但 `gh api` 仍可读取远端分支与 CI。
- 根因：Git 传输和 GitHub API 使用不同的网络链路，当前网络对前者不稳定。
- 解决：用 GitHub Git Data API 基于远端 main 的当前 SHA 创建 blob、tree 与单个 commit，再用非强制 ref 更新写入；写入后读回远端 SHA 验证内容已同步。
- 预防：连续两次 Git 传输失败后，不反复重试；在确认远端基线未变化且本地测试通过后，使用原子 API 写入，并在网络恢复后抓取、正常合并历史。

### 41. Vercel CLI 的默认 scope 可能与已链接项目不一致

- 现象：直接执行 `vercel ls` 时显示个人默认 scope 下没有部署；但指定 `.vercel/project.json` 中的团队 ID 后，能看到项目的生产部署，且最新部署为 Ready。
- 根因：CLI 列表命令优先使用当前默认账户 scope，未必自动采用项目链接信息；不同命令对 `--yes` 的支持也不一致。
- 解决：以 `.vercel/project.json` 的 `orgId` 为准，列表查询显式传入 `--scope`；部署完成后从列表中的生产 URL 与状态确认，而不只依赖 CLI 的简短输出。
- 预防：Vercel 生产操作前先检查项目链接与 scope；对不支持的 CLI 参数先看命令帮助，不把参数错误误判成部署失败。

### 42. Vercel 部署 Ready 不等于当前执行网络能访问生产域名

- 现象：v4 部署在 Vercel 侧显示 Ready，函数构建成功并绑定主站别名；但本执行环境请求 `https://wenqu-reading-room.vercel.app/api/health` 在 20 秒后超时。
- 根因：部署控制面和应用访问面使用不同网络链路；当前环境到 `vercel.app` 的访问不稳定，不能把客户端超时直接归因于函数或路由代码。
- 解决：将 Vercel inspect 的 Ready 状态、构建函数清单和本地 FastAPI 健康契约分别记录；生产 HTTP 验收保持为待完成，不把部署成功写成端到端成功。
- 预防：生产发布至少拆分为“平台部署成功”“公开端点可达”“业务闭环完成”三项证据；任一项缺失都如实标记，不用单一 Ready 状态替代。

### 43. 短材料上传成功也必须生成至少一个可阅读段落

- 现象：上传约 1.5 KB 的链式法则 Markdown 后，API 正确返回 201、5 个地图节点和 3 道题，但 `sections` 为空，前端双轨阅读阶段没有可显示内容。
- 根因：上传 fallback 只在正文长度超过 2000 字时创建分段；短而有效的材料跳过了该分支。
- 解决：非空短材料也创建一段严格轨内容；新增自动回归测试，覆盖上传、地图、段落、创建会话和结构化评分接口。
- 预防：对上传结果不能只检查 HTTP 201 或摘要字段；学习流所需的 `map`、`sections`、`questions` 必须分别断言，尤其要有短材料边界用例。

### 44. 关键学习链路不能串行等待两次外部 AI 请求，也不能静默把失败伪装成更新完成

- 现象：用户反馈上传新资料后题目没有及时更新，DeepSeek 评分也不能及时给出。代码检查确认上传会先等待生成学习包、再等待向量接口；评分会先等待向量查询、再等待评分模型。任一请求变慢都会叠加到同一次 Serverless 请求中，而原实现会吞掉生成异常并继续返回“已准备好”的材料。
- 根因：把可选的向量化检索放在上传与评分的同步关键路径；生成和重新生成路径缺少明确状态与错误传播，导致前端无法区分“AI 已更新”和“通用保底内容”。
- 解决：上传只保存原文片段，评分本地选择相关片段后直接发给一次 DeepSeek 评分请求；限制生成和评分输出，保留 Vercel 时间预算。材料新增 `generation` 状态；重新生成失败返回 502/503，学习页显示保底提示；记录不含敏感信息的耗时与异常类型日志。
- 验证：新增回归测试断言上传不会调用 `_embed_texts`，服务端测试 6 passed；TypeScript、Vite 构建、Ruff 与 Python 编译通过。当前执行环境无法访问 Vercel 主站，尚未声称真实生产 DeepSeek 已完成闭环。
- 预防：一次用户操作的同步关键路径最多包含一次外部模型调用；可选增强必须本地化、异步化或放在下一次显式操作。任何 AI 失败都要向界面传递真实状态，测试同时覆盖“成功内容完整”和“外部调用未被额外触发”。

### 45. 中文原文片段选择不能把整段回答视作一个检索词

- 现象：自测“链式法则”回答时，本地片段选择没有优先返回含链式法则的原文，而是返回了无关片段。
- 根因：正则将连续中文字符整体提取为一个长词；学习者回答与原文措辞只要有少许差异，长词就无法命中。
- 解决：中文连续文本改为提取重叠双字词，英文仍按单词匹配；新增回归测试，断言链式法则回答优先关联正确原文。
- 验证：服务端测试 7 passed。生产上传测试请求在当前执行环境的 TCP 连接阶段 10 秒超时，未将这一网络现象误判为应用失败。
- 预防：中文检索与关键词匹配必须使用适合无空格语言的切分策略；任何“本地选择证据”机制至少包含一条中文正向关联测试。

### 46. CI 的静态检查范围必须覆盖实际 Vercel 入口

- 现象：本轮直接对 `api/index.py` 执行 Ruff，发现 87 条规范项；但仓库 `pnpm check` 和 CI 只检查 `services/api`，因此此前“Ruff 通过”并不覆盖线上实际执行的 Vercel 入口。
- 根因：项目同时保留本地服务目录与 Vercel 入口文件，质量脚本只配置了前者，入口在部署构建中会运行却没有被同一静态门禁覆盖。
- 解决：本轮未将 87 条历史规范项与功能修复混为一体；新增 `check:vercel-api`，用 Ruff 的 E9/F 规则检查入口的语法与未定义名称，并执行 Python 编译；根 `pnpm check` 与 GitHub CI 都调用该门禁并运行 `api/tests`。首次执行修复一处无占位符 f-string；完整门禁与 7 项测试通过。
- 预防：CI 与本地质量命令必须按实际部署入口定义检查范围；新增部署入口或路由后，先确认它被 type/lint/test 至少一项自动门禁覆盖，再宣称完整质量检查通过。

### 47. 有后端删除接口不等于用户能找到并安全地完成删除

- 现象：测试上传资料在首页不断堆积；服务端已有删除接口，资料库也有小图标，但首页卡片没有删除入口，旧图标没有确认和删除中状态。
- 根因：功能实现停留在 API 与单一页面，未覆盖用户实际首先看到的首页；危险操作缺少二次确认与防重复提交反馈。
- 解决：首页和资料库统一提供上传材料的垃圾桶按钮；点击后显示不可恢复确认，进行中禁用按钮并显示加载状态。内置材料继续隐藏操作并由服务端返回 403；新增删除与保护回归测试。
- 验证：TypeScript、Vite、两组 Ruff、Vercel 入口编译和 8 项服务端测试通过。
- 预防：涉及创建、更新、删除的用户数据功能，必须同时验证 API、主入口页面、管理页面、确认提示、进行中状态和不可删除资源的保护。

## 2026-08-21｜README 作品集首屏优化

- 本轮开始前已完整复读本文件；
- 本轮只调整 GitHub README 的项目展示结构，并同步更新 `docs/progress/current.md`；
- 未遇到新的产品或工程问题，因此不新增虚构踩坑条目。

## 2026-08-21｜README 功能截图区补齐

- 本轮继续使用已核验的仓库内截图素材补强 README 展示；
- 未新增功能、未部署、未接触密钥或用户数据；
- 未遇到新的产品或工程问题，因此不新增虚构踩坑条目。

## 2026-08-24｜生产接口与多账号数据安全加固

### 48. CORS 不是认证，service role 接口必须在应用层验证用户与资源所有者

- 现象：生产 API 配置了来源限制，但匿名请求仍可上传、删除、重新生成材料和触发 AI；服务端 service role 会绕过数据库 RLS。
- 根因：把“浏览器是否允许跨域读取响应”误当成“调用者是否有权限”，且材料没有 owner 字段，应用层也没有 owner 过滤。
- 解决：用 Supabase `/auth/v1/user` 验证 Bearer token；内置 SENet 保持公共只读/规则评分，上传材料所有端点按 `user_id` 过滤，非所有者统一 404；数据库再用 Force RLS 和 authenticated owner 策略构成第二道边界。
- 预防：任何使用 service role 的多用户接口都要同时回答“调用者是谁、资源属于谁、非所有者看到什么”；CORS 只作为浏览器边界记录，绝不写成认证证据。

### 49. 学习者题目 DTO 与内部评分规则必须分层，冷启动也不能相信客户端回传答案

- 现象：生产材料详情把 `answer_guide`、`max_score` 和内部 owner/hash 一并返回；评分还能重复题号，使掌握度超过 100。
- 根因：生产入口复用内部 material dict，并在 Serverless 冷启动恢复时信任客户端携带的题目和分值。
- 解决：材料响应递归剥离内部字段；评分固定校验 q1/q2/q3 三道唯一题，按服务端保存的题目上限重算每题分数和掌握度，客户端题目只作为兼容输入而不作为评分真值。
- 预防：public DTO 测试要递归检查敏感键；评分测试至少覆盖重复题号、未知题号、超大模型分数和冷启动跨材料恢复。

### 50. 浏览器学习记录必须按稳定 user id 分区，登录不能隐式认领匿名数据

- 现象：同一浏览器从账号 A 切到 B 时，全局 localStorage 记录会被重新标为 B 并同步，退出后也可能继续显示 A 的答案和复述。
- 根因：昵称/profile、活动会话和学习记录共用全局 key，登录逻辑又自动上传所有本机记录。
- 解决：以 Supabase user id 或 `anonymous` 作为命名空间；旧全局数据只迁到匿名区；移除登录自动同步；退出清除可见 profile 与活动会话，但保留原账号私有命名空间供其下次登录读取。
- 预防：账号切换测试必须覆盖 anonymous→A、A→退出→B、B→退出→A；任何本地到云端的 owner 变更都要求显式用户确认。

### 51. AI 配额必须由数据库原子扣减，应用动作名和 SQL 白名单必须有同一契约

- 现象：上传、重新生成和评分可无限触发付费模型；实现过程中应用一度使用 `upload_generation` 等名称，而迁移白名单使用 `upload`，会导致所有调用被拒绝。
- 根因：配额只停留在接口逻辑，没有并发安全的共享计数；应用与迁移分别命名，缺少契约测试。
- 解决：用 `(user_id, UTC date, action)` 主键和条件 UPSERT 原子扣减；RPC 仅 service_role 可执行；动作统一为 `upload`、`regenerate`、`evaluate`，限额分别为 10、10、50。
- 预防：配额测试既要断言 429 发生在 AI 调用前，也要静态核对应用动作集合等于数据库 action 约束集合。

### 52. 持久化失败不能只写日志后返回成功，安全修改也必须覆盖错误路径

- 现象：材料写入或删除 Supabase 失败时，接口仍返回成功；下一次冷启动材料会消失或已删除材料重新出现。
- 根因：为提高“可用性”吞掉了外部存储异常，却把进程内临时状态误报为持久状态。
- 解决：上传失败回滚内存材料并返回 503；删除先完成数据库操作再删内存；重新生成保存失败恢复原材料并返回 503；日志只记录材料 ID 和异常类型，不记录正文或凭据。
- 预防：每个 create/update/delete 测试都应包含持久层异常；成功响应只允许在持久状态已经确定后发出。

### 53. Windows 沙箱补丁与测试缓存失败要保留证据边界并使用仓库内替代路径

- 现象：本轮内置补丁工具更新 existing file 持续出现 `windows sandbox failed: helper_unknown_error`；默认 pytest 临时目录也有已知 ACL 问题。
- 根因：当前执行环境的沙箱刷新/历史缓存权限异常，无法证明是业务代码问题；对新文件写入和仓库内命令仍可工作。
- 解决：先确认目标和差异，再用标准 unified diff 的 `git apply` 最小补丁；测试使用仓库内 `--basetemp` 并禁用 cache provider；临时 patch/reject 文件在验证后精确删除。
- 预防：不得把工具失败写成代码失败；替代编辑仍必须是可审查的最小补丁，禁止整文件覆盖，并在最终状态检查中确认没有临时文件残留。

### 54. RLS 策略存在不代表浏览器应拥有表级直连权限，公共保留 ID 还要防持久化覆盖

- 现象：即使 `materials` 已有 owner RLS，认证用户仍可绕过 API 直接写表，并尝试插入保留 ID `senet-cvpr-2018`；冷启动加载若接受该载荷，会覆盖内置公共材料。
- 根因：把“行级隔离”误当成“最小权限”，且公共内置材料与私有持久化材料共用 ID 空间，没有数据库和应用层双重保留规则。
- 解决：撤销 `anon/authenticated` 对 `materials` 的直接 CRUD，只显式授权服务端 `service_role`；数据库新增保留 ID CHECK，加载器与内存 store 同时拒绝覆盖内置 ID；新增两项回归测试。
- 预防：服务端代理写入的表默认不向浏览器角色授权；所有系统保留 ID 都同时设置数据库约束、加载过滤和单元测试。

### 55. 账号切换必须使所有旧异步请求失效，不能只清空界面状态

- 现象：账号 A 的材料、档案、学习、上传或评分请求可能在切换到 B/退出后才返回；仅清空 React state 仍会被旧响应重新写回，评分甚至可能把 A 的答案保存到 B 的本地或云端档案。
- 根因：异步请求没有绑定认证世代，云端记录保存又在请求中重新读取“当前用户”，使请求发起者与落库所有者可能不一致。
- 解决：用 `useRef` 保存递增的 `authEpoch`；认证变化、退出和卸载时使旧 epoch 失效，所有相关 await 后只允许同 epoch 写界面或本地存储；云端保存额外校验请求捕获的 expected user id。
- 预防：多账号前端回归必须覆盖“A 请求悬挂 → 切换 B/退出 → B 请求先完成 → A 请求晚返回”；任何用户数据写入都同时绑定请求世代与明确 owner。

### 56. 双向分叉时从最新 origin/main 重建分支，不强推旧安全分支

- 现象：旧安全分支与 `origin/main` 双向分叉，草稿 PR #23 出现冲突，直接合并或强推会扩大历史风险。
- 根因：安全修复开发期间 `main` 继续接收 README、CI 和删除交互等提交，旧分支没有及时重放到最新主线。
- 解决：从最新 `origin/main` 新建 `codex/security-hardening-main`，只移植已经验证的最小安全提交并重新运行完整门禁；发布无冲突草稿 PR #24 后关闭 #23，旧分支保留作历史记录，不强推改写。
- 预防：长时间安全分支在发布前先核对 ahead/behind 与 mergeability；发生双向分叉时优先新建最新主线分支移植最小提交，禁止为了消除冲突强推共享历史。

### 57. authEpoch 只代表稳定账号身份变化，不能代表每一次认证事件

- 现象：初版 `applyProfile` 对每个 Supabase 认证事件都递增 `authEpoch`；同账号 `TOKEN_REFRESHED` 或重复 `SIGNED_IN` 会让上传、评分和删除的晚返回被丢弃，而 `finally` 也无法清除 `busy` / `deletingId`，界面可能永久停在处理中。
- 根因：把 token 生命周期事件误当成账号身份变化，并让 `AuthModal` 与 App 认证监听器同时写入 profile，账号命名空间缺少单一落盘源。
- 解决：仅在 stable `userId` 真正发生 `null → A`、`A → B` 或 `B → null` 变化时递增 epoch 并统一清理账号相关瞬态状态；同账号 `TOKEN_REFRESHED` 保持 epoch 不变；云端 profile 只由 App auth watcher 落盘，`AuthModal` 只报告认证成功。
- 预防：前端认证回归固定覆盖四个时序：首次 `null → A`；A 操作悬挂时 `TOKEN_REFRESHED(A)` 后正常完成；A 操作悬挂时切换 B 且 A 晚返回被忽略；B 退出后清空私有状态并恢复公共材料。

### 58. Marketplace Supabase 资源暂停会表现为 pooler tenant/user not found

- 现象：生产发布预检时，`pnpm db:check` 尚未建立数据库连接便返回 `tenant/user not found`；继续核对 Vercel Marketplace 后发现原 Supabase 资源处于 `Suspended` / `Free Plan` 状态。
- 根因：Marketplace 资源暂停后，连接池无法再解析原租户或数据库用户；此时的连接错误不等于迁移脚本有误，也不能证明原数据库或数据已经不存在。
- 解决：先用 integration list 与 resource inspect 确认原资源状态并停止迁移、部署和业务写入；保留 PR #24 为草稿，不新建替代数据库，等待用户从资源 Dashboard 恢复原资源并确认数据与备份可用。
- 预防：生产迁移前先检查 Marketplace 集成与资源状态；资源恢复后先只读核对迁移账本和备份，再建立数据库基线并执行迁移。未确认原资源与备份前，绝不能新建数据库或部署依赖新 schema 的代码。

### 59. 生产数据库无备份且可见性变化时，泛化“继续”不等于具体批准

- 现象：原 Supabase 资源恢复后，迁移前检查确认 Free Plan 没有可用备份，且 3 条历史材料全部没有所有者；安全迁移会让这些记录继续保留，但普通账号不再可见。
- 根因：用户此前对整体修复流程说“继续”，不等于已经知情并批准后来才确认的具体生产影响，尤其不能自动覆盖无备份条件下的数据可见性变化。
- 解决：停止迁移和部署，明确说明无备份状态、受影响记录数量及迁移后的可见性结果，再请求用户针对这些具体影响作出明确批准。
- 预防：生产数据库变更前固定核对备份、迁移账本、受影响行数、可见性变化与恢复路径；发现新的实质风险时必须重新取得具体批准，绝不能用早先的泛化授权绕过审批。

### 60. Vercel 静态 headers 不代表动态 API 已覆盖安全响应头

- 现象：`vercel.json` 已配置 CSP、frame、MIME、Referrer 和 Permissions 等静态响应头，但 Preview 的动态 `/api/health` 响应没有完整继承这些头，也缺少明确的禁止缓存策略。
- 根因：静态资源与 Vercel 动态函数经过不同响应链路；配置文件中存在全局 headers 规则，不能替代对实际动态 API 响应的运行时验证。
- 解决：在 FastAPI 的 CORS 之后增加 HTTP 中间件，对所有 API 响应强制写入 `Cache-Control: no-store`、`Pragma: no-cache`、MIME、frame、Referrer 和 Permissions 安全头，并为健康接口增加逐项回归断言。
- 预防：每次 Preview 验收都要分别检查静态页面与动态 API 的真实响应头；不能用 `vercel.json` 源码检查或前端页面结果推断函数响应已经安全覆盖。

### 61. 数据库迁移授权不自动包含生产网站切换

- 现象：用户明确批准无备份条件下执行安全迁移后，数据库与 Preview 验收均成功，但 Vercel Production 仍指向旧版本。
- 根因：数据库 schema 迁移和生产网站切换是两个独立的高影响动作；前者的批准只覆盖已说明的数据结构与可见性影响，不能自动扩大为发布新应用版本的授权。
- 解决：完成迁移与 Preview 验收后停在发布边界，单独说明 Production 将切换到哪个已验证版本，并再次请求明确授权；未获批准前不执行生产部署或提升。
- 预防：发布清单固定拆分“数据库迁移批准”和“Production 发布批准”，分别记录证据、影响与回退候选，不使用一次泛化授权连续跨越两个边界。

### 62. Preview 与 Production 环境变量范围不一致时不能盲目 promote

- 现象：Preview 健康检查显示 `ai_configured=false`，但 Production 范围已经配置 DeepSeek；直接提升 Preview 会把缺少生产范围配置的构件带到主域名。
- 根因：`promote` 不会重新构建应用，而是保留原 Preview deployment 构建时获得的环境变量范围；代码提交相同不代表构件的运行时配置相同。
- 解决：从干净、精确的提交 `7842089` 重新执行 Production 构建，并在主域名重复健康、动态响应头、匿名权限、规则评分和真实 A/B 隔离验证；明确记录这是同源代码，但不是同一个 artifact。
- 预防：发布前比较 Preview 与 Production 的环境变量 scope，再决定使用 `promote` 还是 Production rebuild；任何 AI、认证或存储变量范围不同都必须重新构建并复验。

## 2026-08-24｜D1/D3/D7 间隔复习队列

- 本轮开始前已完整复读本文件，并继续遵守严格轨事实边界、账号隔离与验证证据边界。

### 63. 可从不可变学习记录推导复习队列，但必须持久化“完成的是哪一次间隔”

- 现象：若只按最近完成时间生成“明日复习”，复习完成后无法区分它是在完成 D1、D3 还是 D7；再次加载页面会重复出现同一任务，另建任务表又会扩大迁移、RLS 和生产发布风险。
- 根因：源学习记录只描述“学过什么”，没有描述后续记录与源会话、复习间隔的关系；单凭材料 ID 或完成时间都无法稳定去重。
- 解决：以源会话 ID 与间隔天数组成稳定任务键，从原始学习记录推导 D1/D3/D7；复习完成时把 `source_session_id` 和 `interval_days` 写入新记录已有的 `session_data` JSONB，本地与云端加载后用该关联消除已完成任务。数据库继续复用现有主键、用户所有权和 RLS，不增加新表或权限。
- 验证：浏览器虚拟一条 9 天前记录后显示 3 个到期任务；完成 D1 后本地记录保存正确关联，队列从 3 项降为 2 项；账户切换路径会清空活动复习上下文。
- 预防：任何从事件记录派生的计划任务，都要同时定义稳定键、完成关联、重复提交策略、删除源资源后的行为与多账号隔离；不能只验证“卡片显示出来”。

## 2026-08-24｜间隔复习 PR 合并记录

- 本轮开始前已完整复读本文件；PR #26 合并及状态记录未遇到新的产品或工程问题，因此不新增虚构踩坑条目。
- 本地 `main` 与远端仍有已知历史分叉，已按第 56 条从最新 `origin/main` 创建短分支记录状态，没有强推、重写或混入本地旧历史。

## 2026-08-24｜间隔复习生产闭环

- 本轮开始前已完整复读本文件；所有一次性生产账号、记录和本地验收脚本均在验证后清理，未记录密钥、令牌或数据库连接地址。

### 64. 跨层可选字段不能只靠 TypeScript 假定存在，完美答案也要跑到结果页

- 现象：生产规则评分得到满分后，三道题的 `source` 为 `null`，结果页 `SourceBadge` 直接读取 `source.detail`，整页白屏；API、类型检查和构建此前都通过。
- 根因：后端只在评分器返回字典时保留来源，而高分规则路径没有返回来源；前端类型把来源写成必填，缺少运行时空值保护，测试也没有覆盖“满分 → 结果页渲染”。
- 解决：后端以服务端题目已有的原文定位补齐每道题来源，并限制字段长度；前端把来源建模为可选并提供“原文证据暂不可用”的诚实降级；API 回归固定断言三道题来源对象与非空 label/detail。
- 预防：跨后端/前端的结果 DTO 必须同时做运行时结构断言和浏览器最终页面测试；正确、部分正确、错误答案都要覆盖，不能用编译成功替代真实返回形状。

### 65. 解决浏览器直写故障时，不能把 service role 变成客户端评分结果的代写器

- 现象：登录用户的 Supabase 读取成功，但 `study_records` 跨域 POST 在浏览器失败；第一版拟新增服务端保存接口，却会接收客户端传来的 mastery、headline 和完整 session_data 后用 service role 写库。
- 根因：为绕开网络故障而机械搬运写入位置，没有重新确认“谁生成评分真值”；service role 会绕过 RLS，若代写客户端结果，就允许用户伪造满分和任意结果结构。
- 解决：否决独立客户端归档接口，改由现有 `evaluate_session` 在服务端完成规则/AI 评分与归一化后，使用服务端材料、人格、回答、复述和结果直接构造记录；客户端额外伪造的 mastery/headline/session_data 会被忽略且永不进入写入体。
- 预防：任何 service-role 写入都要逐字段标注真值来源；评分、额度、所有权或证据字段只能由服务端可信计算产生，不能因为“同源 API”就信任客户端 JSON。

### 66. 所有权与复习来源校验必须早于评分和扣费，持久化失败仍要返回可恢复结果

- 现象：中间实现先 `complete_session()`，再检查 expected user、复习来源和数据库写入；若后置检查失败，warm instance 已把会话标为 completed，首次请求又没有返回结果，用户无法重试并可能浪费 AI 配额。
- 根因：把业务校验和持久化当作评分后的附属步骤，没有按不可逆影响排序；账号竞态哨兵还允许 expected user 缺失时绕过。
- 解决：登录 token 用户必须与请求开始时捕获的 expected user 完全一致，缺失也拒绝云端归属；复习来源同账号、同材料、非自身和 1/3/7 间隔均在评分、AI 配额和完成会话前验证。数据库写失败不伪造成功，也不丢评分：返回 completed 与 `cloud_saved=false`，前端保存账号命名空间下的本地副本。
- 验证：新增客户端伪造结果不入库、缺失 expected user 拒绝、账号切换拒绝、来源查询失败后会话保持 active 且可重试、数据库写失败仍返回 completed 的回归；完整测试 **28 passed**，最终生产一次性账号显示云端同步成功并核验 `REVIEW_LINK_FOUND=true`。
- 预防：处理链固定按“身份/来源校验 → 配额 → 评分 → 完成状态 → 持久化”排序；任何持久化故障都必须有真实可见状态和可恢复副本，不能既返回失败又销毁重试条件。
