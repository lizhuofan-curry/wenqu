# 问渠｜当前项目进展

> 本文档是项目的实时进度基线。每次完成实际工作后，由 Codex 自动更新；版本里程碑另存于 `docs/progress/v.x.md`。

最后更新：2026-08-24

## 2026-08-24｜安全加固已推送 GitHub（待迁移、待部署）

- 生产 API 已加入 Supabase Bearer 登录校验；匿名用户只能读取并用规则评分内置 SENet，上传材料的读取、上传、删除、重新生成、建会话和 AI 评分均按用户所有权隔离，非所有者统一返回 404。
- 生产材料响应递归移除 `answer_guide`、`max_score`、`_hash` 和 `_owner_id`；评分请求固定为 q1/q2/q3 三道唯一题，回答、复述和材料 ID 均有长度/格式约束，模型分数由服务端题目上限重新裁剪，掌握度限制在 0—100。
- 上传只接受 UTF-8 Markdown 或有效 PDF，校验扩展名、MIME、大小、PDF 文件头与解析结果；删除公开 debug；Supabase 保存/删除失败会回滚并返回 503，不再假成功。
- 前端 API 自动携带当前 Supabase access token；本地 profile、学习记录和活动会话按 `userId` 命名空间隔离，旧全局记录仅迁移到匿名区。认证世代号会使账号切换/退出前的材料、档案、学习、上传、评分、删除和重新生成请求自动失效，云端记录还校验请求发起时的 user id，避免 A 的晚返回写入 B。
- 云同步结果改为界面可见；空 sections/questions 会阻止进入学习页；401/403/409/422/429 等服务端错误不再被演示数据掩盖。
- 新增 `202608240001_security_hardening.sql`：materials owner 外键/索引、保留 ID 约束、4 表 Force RLS、10 条 owner 策略、仅 service role 可直连材料表，以及 service-role-only 的 UTC 原子 AI 日配额（evaluate/upload/regenerate = 50/10/10）。旧 ownerless 材料保留但普通账号不可见、不可写。
- CI 新增 `pnpm audit --audit-level high`；构建链 `nanoid` 升至 3.3.18；Vercel 增加 CSP、点击劫持、MIME、Referrer 与 Permissions 安全响应头。
- 新增生产 API 安全回归矩阵；本地与生产 API 测试合计 **22 passed**。前端强制 TypeScript 检查与生产构建通过（JS 262.42 kB，gzip 84.02 kB），JavaScript 高危审计为 0，生产 API Python 编译与 Ruff E9/F 通过。
- 安全实现、迁移、测试与本报告已由提交 `5f2c39f` 推送到 GitHub 分支 `codex/security-hardening`，并创建草稿 PR #23；因该分支相对远端 `main` ahead 10 / behind 10，PR 已明确标注不得直接合并，需先移植到最新 `origin/main`。本轮未执行真实 Supabase 迁移、未部署，也未读取或修改真实用户材料。

### 当前阶段

**阶段：安全修复已推送到 GitHub `codex/security-hardening` 分支，等待受控数据库迁移、与最新 `origin/main` 对齐及部署前复核。**

### 当前最高优先级

先在 Supabase 受控环境应用 `202608240001_security_hardening.sql` 并运行更新后的只读 `db:check`；验证 RLS 与配额 RPC 后，再部署同一版本的 API/前端并完成“账号 A 上传 → 账号 B 不可见 → 账号 A 学习与评分”的生产闭环。

## 2026-07-28｜上传与 DeepSeek 评分及时性修复 ✅

- 根据用户反馈检查发现：上传流程会先等待 DeepSeek 生成，再同步等待可选向量接口；评分也会先等待向量查询、再等待 DeepSeek 评分。在 Vercel Serverless 的时间预算内，这会放大等待并造成“题目没有更新”或“评分没有返回”。
- `api/index.py`：上传后仅保存本地原文片段；评分用本地关键词选择原文证据，不再把向量接口串在关键路径上。上传与评分各保留一次 DeepSeek 请求，并收紧输出长度、记录安全的耗时与错误类型日志。
- 上传 AI 失败会明确标记为“保底学习流”，学习页不会再显示“正在生成”的过时文案；资料库“重新生成”在模型失败或未返回内容时会明确报错，只有实际更新后才返回成功。
- `apps/web/src/lib/types.ts`、`StudyFlow.tsx`：将保底状态展示给学习者，并说明通用保底题不应被当成材料专属题。
- `api/tests/test_upload_material.py`：新增“上传不得调用向量服务”永久回归；完整质量检查通过，服务端测试 **6 passed**。
- 已发布到 Vercel：`dpl_8H1aZFr4rrokaHnGPe1Pd6aomPL6` 状态 `Ready`，主域名已绑定，`api/index` 函数构建成功（41.47 MB）。
- 自测补充：生产上传请求在 TCP 连接阶段 10 秒超时，未抵达应用层；本地完整接口回归继续验证。测试中发现中文回答的原文片段选择把整段中文当成一个词，已改为中文双字词匹配，确保“链式法则”等回答优先关联正确原文；服务端测试现为 **7 passed**。
- 中文证据选择修复已发布到 Vercel：`dpl_5M4DMDv44bLZjjPKWNZCuoJZjTFZ` 状态 `Ready`，主域名已绑定，`api/index` 函数构建成功（41.47 MB）。
- 代码卫生发现：仓库 `pnpm check` 的 Ruff 范围仅为 `services/api`，未覆盖实际 Vercel 入口 `api/index.py`；直接检查该入口发现 87 条历史 Ruff 规范项。构建和 7 项接口测试仍通过，但入口静态检查尚未达标，已列为下一项工程任务。
- 入口门禁已补齐：`check:vercel-api` 现检查 `api/index.py` 的语法/未定义名称并执行 Python 编译；`pnpm check` 与 GitHub CI 都包含该门禁和 `api/tests`。首次运行修复了一处无占位符 f-string；更新后的完整门禁通过。

### 当前最高优先级

在用户网络完成一次真实“上传材料 → 学习 → DeepSeek 评分”闭环验收；如仍超时，读取新加的安全耗时日志定位单次 DeepSeek 调用。其余历史 Ruff 规范项按独立任务分批清理，避免与功能修复混改。

## 2026-07-28｜上传材料删除功能补齐 ✅

- 根因修复：删除 API 原本已存在，资料库有不显眼的图标入口，但首页“你的书桌”卡片没有删除入口，也没有确认与删除中状态，测试资料因此难以清理。
- 首页和资料库的所有上传材料现在都显示垃圾桶操作；点击后会要求确认“永久删除”，请求进行中禁止重复点击并显示加载状态。
- 内置 SENet 材料仍不展示删除操作，服务端也保持 403 保护；删除成功后材料立即从当前列表移除。
- 新增服务端回归：上传材料可删除、对应片段会清除、内置材料拒绝删除；完整门禁通过，服务端测试扩展至 **8 passed**。
- 已发布到 Vercel：`dpl_DCcTh8tUXdVWpyeLsvQfx5RLLZ9y` 状态 `Ready`，主域名已绑定，`api/index` 函数构建成功（41.47 MB）。

## 2026-07-28｜v.4 真实评分与上传材料上线 ✅

- 确立 `https://wenqu-reading-room.vercel.app/` 为主网站；GitHub Pages 仅保留为静态演示入口。
- v.4 汇总 Vercel 同域 API、DeepSeek 语义评分、原文片段选择、上传材料生成、Supabase 材料恢复与冷启动真实性保护。
- README 已校正主网站、版本号、GitHub Pages 边界与生产能力说明；`/api/health` 版本号同步更新为 `v.4`。
- Vercel 最新生产部署状态为 `Ready`，构建耗时 38 秒，`api/index` 函数构建成功；GitHub CI 对应提交成功。
- 本执行环境访问主站 `/api/health` 在 20 秒后超时，尚不能以部署 Ready 代替公网 API 与上传评分闭环验收。
- 本轮普通 Git 推送再次遭遇连接重置；按已记录流程改用 GitHub Git Data API 同步，并以远端 tree SHA 作为内容一致性证据。

## 2026-07-28｜短 Markdown 上传学习流修复 ✅

- 以 OpenStax *Calculus Volume 1* 3.6 节“Chain Rule”为来源制作链式法则验证材料；上传实测发现短 Markdown 可返回 201、地图和题目，却生成 `0` 段双轨内容，学习页会为空。
- `api/index.py`：对任何成功解析的非空短材料至少生成一段严格轨内容；不再要求正文超过 2000 字才可进入双轨学习。
- 新增 `api/tests/test_upload_material.py`：固定覆盖短 Markdown 上传、5 节点地图、至少一段内容、创建会话和结构化评分接口。
- 验证：服务端测试由 4 项扩展到 **5 passed**；TypeScript、Vite 构建、Ruff 与 Python 编译均通过。
- 生产部署：修复已部署至 Vercel `dpl_64L54mZoz7HUUzqAM8h1wEmw3PZF`，状态 `Ready`，并绑定主网站别名。
- 生产边界：本次评分使用确定性测试替身验证接口契约，不代表真实 DeepSeek 调用；主站从当前执行环境不可达，真实上传闭环仍待公网访问恢复后完成。

## 2026-07-28｜生产冷启动评分真实性修复 ✅

- 代码检查发现：Vercel 函数在学习会话开始与评分提交之间发生冷启动时，原实现会把丢失的上传材料会话默认恢复为 SENet；这会使诊断依据错材料，违反“陪读不得添加严格轨中不存在的事实”的项目原则。
- `api/index.py`：评分请求新增材料 ID、人格与题目摘要；session 丢失时按这些上下文恢复，并优先从 Supabase 重载材料；上传材料上下文不足时明确报错，绝不改用 SENet。
- `apps/web/src/lib/api.ts`：生产网络错误现在会正确标记为降级；上传材料在 API 不可用时不再静默退回 SENet 演示会话或评分。
- `apps/web/src/App.tsx`：启动与提交评分都传递已展示给学习者的最小题目上下文，确保冷启动恢复可验证。

### 验证结果

- TypeScript：通过；Vite 生产构建：通过；
- Ruff（`services/api`）：通过；服务端测试：4 passed（测试临时目录限定为项目 `tmp`，避开 Windows 跨账户权限问题）；
- `api/index.py`：Python 编译通过；
- 冷启动回归：模拟上传材料 session 丢失且未配置 DeepSeek 时返回明确 502，不会误用 SENet 评分。

### 接下来要做

1. 部署本次真实性修复到 Vercel，并在生产站完成一次“上传材料 → 学习 → 评分”的冷启动恢复验证。

## 2026-07-27｜前端评审批次 A 代码修复完成 ✅

- 流程对齐完成后，按 A1→A2→A3→A4→A5 顺序完成全部五项 P0 修复：

### A1 生产构建默认演示模式
- `apps/web/src/lib/api.ts:41-43`：删除 `import.meta.env.PROD && import.meta.env.VITE_DEMO_MODE !== “false”` 分支，演示模式仅 `VITE_DEMO_MODE === “true”` 或 `file:` 时启用；
- 新增 `isDemo()` 导出，便于 UI 读取演示状态；
- `apps/web/src/components/Shell.tsx`：新增 `demoMode` prop + 金色「演示模式」标识条；
- `apps/web/src/styles/shell.css`：新增 `.demo-bar` 样式。

### A2 归档真值性 bug
- `apps/web/src/lib/cloud.ts:200`：未登录时 `return []` → `return null`；
- `apps/web/src/lib/api.ts:76`：`||` → `??`，空数组不再遮蔽本地档案。

### A3 掌握环视觉造假
- `apps/web/src/styles/pages.css:731-735`：删除 `.mastery-ring` 硬编码 `72%` 覆写，使用父规则 `var(--score, 72)`；
- `apps/web/src/components/InsightsView.tsx:72`：传入 `style={{ “--score”: String(averageMastery) }}`。

### A4 网络降级可恢复
- `apps/web/src/lib/api.ts:53-57`：删 `useDemo = true` 永久翻转，改为 `degraded = true` 单次标记；
- 新增 `isDegraded()` 导出；
- `apps/web/src/components/Shell.tsx`：新增 `degraded` prop + 朱砂色「网络连接失败」提示条；
- `apps/web/src/styles/shell.css`：新增 `.degraded-bar` 样式。

### A5 跨平台脚本
- 新增 `scripts/py.mjs`：Node 脚本跨平台探测 venv Python 路径（先 Windows `Scripts/`，后 POSIX `bin/`）；
- 根 `package.json`：`dev`/`test:api`/`check:api`/`db:migrate`/`db:check` 全部改为 `node scripts/py.mjs` 驱动。

### 验证结果
- TypeScript `--force`：零错误；
- Vite 生产构建：通过（CSS 41 kB, JS 250 kB）；
- Ruff：All checks passed；
- Pytest：1 passed（健康检查通过），3 个 PermissionError（与本次改动无关的沙箱跨账户临时目录权限问题，详见 lessons-learned 第 22 条）；
- `py.mjs` 跨平台：Windows 上正确找到并驱动 Python venv。

### 涉及文件
`lib/api.ts`, `lib/cloud.ts`, `components/Shell.tsx`, `components/InsightsView.tsx`, `styles/pages.css`, `styles/shell.css`, `App.tsx`, `package.json`, `.gitignore`, `scripts/py.mjs`（新）

## 2026-07-27｜前端评审批次 B 代码修复完成 ✅

- 在批次 A 基础上完成全部五项 P1 修复：

### B1 API 客户端加固
- `apps/web/src/lib/api.ts`：新增 `ApiError` 类携带 HTTP `status`；新增 `BASE_URL`（默认 `"/api"`，可由 `VITE_API_BASE_URL` 覆盖）；新增 `AbortSignal.timeout(15000)` 超时；
- `apps/web/src/vite-env.d.ts`：补 `VITE_API_BASE_URL`、`VITE_DEMO_MODE` 类型声明（之前由 `vite/client` 索引签名兜底为 `any`）；
- 所有 `request()` 路径相对化（`/api/personas` → `/personas`），由 `BASE_URL` 拼接。

### B2 AuthModal 键盘可访问性
- `apps/web/src/components/AuthModal.tsx`：新增 `useEffect` 监听 Escape 关闭；新增焦点陷阱（Tab/Shift+Tab 循环）；新增初始聚焦（`requestAnimationFrame` 聚焦第一个可聚焦元素）；新增 `inert` 属性标记 `#root`；关闭时恢复先前焦点。

### B3 演示内容冒充真实数据
- `Dashboard.tsx`：Hero 按钮文本动态读取 `materials[0].title/estimated_minutes`；进度环空态显示 0% + "尚无记录"；快速入口文案动态化；封面副标题动态化；
- `InsightsView.tsx`：删 `items.length * 18` 假学习时长（改为不编造数字）；删重复指标；修复 `key={height + index}` 碰撞 → `key={index}`；
- `MisconceptionsView.tsx`：概念图/公式/证据链改为仅在有真实错因时展示，空态显示占位提示；
- `styles/pages.css`：新增 `.empty-graph` 空态样式。

### B4 双写失败无补偿
- `apps/web/src/lib/api.ts`：`saveRecordToCloud(record)` 改为 `.catch(console.error)` 不阻断 evaluate 返回；本地记录始终已落盘。

### B5 复习入口硬编码
- `apps/web/src/App.tsx`：洞察/错因页的 onReview 从最近的 archive 条目推导 material_id，回退到 materials[0]。

### 验证结果
- TypeScript `--force`：零错误；
- Vite 生产构建：通过（CSS 41 kB, JS 251 kB）；
- Ruff：All checks passed；
- Pytest：1 passed, 3 PermissionError（环境问题同上）；

### 涉及文件
`lib/api.ts`, `components/AuthModal.tsx`, `components/Dashboard.tsx`, `components/InsightsView.tsx`, `components/MisconceptionsView.tsx`, `styles/pages.css`, `App.tsx`, `vite-env.d.ts`

## 2026-07-27｜前端评审批次 C 代码修复完成 ✅

- 在批次 A/B 基础上完成全部四项 P2 修复：

### C1 代码分割（supabase-js 懒加载）
- `apps/web/src/lib/cloud.ts`：删除静态 `import { createClient } from "@supabase/supabase-js"`，改为 `import("@supabase/supabase-js")` 动态懒加载；
- `cloudEnabled=false` 时不再打包 supabase-js，生产 JS 从 467 kB 降至 **253 kB**（减少 214 kB / 46%）；
- `watchCloudAuth` 改为 async，`App.tsx` useEffect 适配 `.then()` 模式获取 cleanup 函数。

### C2 死代码清理
- `Shell.tsx`：删除空的假搜索框（⌘K 未实现）和装饰性通知铃按钮，清理 `Search`/`Bell` 导入；
- `ArchiveView.tsx`：死按钮退化为纯装饰 `<ArrowRight>` 图标；
- `storage.ts`：删除 `saveProfile` 中 LEGACY_USER_KEY 冗余双写（loadProfile 中保留迁移读取路径）。

### C3 杂项修复
- `MaterialsView.tsx`：上传 input 选完文件后加 `event.target.value = ""`，支持连续选同一文件；
- 根 `package.json`：`build`/`typecheck` 中 `npm` → `pnpm`，与 `packageManager` 声明一致；
- `.env.example`：加注释分隔服务端（AI_PROVIDER 等）与客户端（VITE_*）变量。

### C4 vercel.json 修复
- `vercel.json` rewrite 规则新增 `api/` 排除，避免同域 API 请求被 SPA 回退吞为 `index.html`（200），产生非 TypeError 静默故障。

### 验证结果
- TypeScript：零错误；
- Vite build：JS 252.64 kB（gzip 80.95 kB），CSS 41.16 kB（gzip 8.90 kB）；
- Ruff：All checks passed；
- Pytest：1 passed, 3 PermissionError（已知环境问题）。

### 涉及文件
`lib/cloud.ts`（重写）, `components/Shell.tsx`, `components/ArchiveView.tsx`, `components/MaterialsView.tsx`, `lib/storage.ts`, `App.tsx`, `package.json`, `.env.example`, `vercel.json`

## 2026-07-27｜DeepSeek AI 真实评分上线 ✅

- 在 `api/index.py` 中接入 DeepSeek API（通过 OpenAI SDK 兼容模式），实现语义级评分：
  - 当 `DEEPSEEK_API_KEY` 已配置时，`evaluate_session` 调用 `evaluate_with_deepseek()` 走 AI 评分
  - AI 失败时自动回退到规则引擎（`evaluate_senet`），不影响用户体验
  - 使用 `AIEvaluationResult` Pydantic Schema 约束结构输出，`response_format={"type": "json_object"}`
- 新增 `AIEvaluationResult` / `AIQuestionResult` / `AIRetellingResult` 三个轻量 Pydantic 模型
- `api/requirements.txt` 新增 `openai>=1.100` 依赖
- 评分对比：

| 维度 | 规则引擎（之前） | DeepSeek AI（现在） |
|---|---|---|
| 评分方式 | 关键词匹配 | 语义理解 |
| 反馈内容 | 固定模板 | 针对具体回答定制 |
| 错因诊断 | 关键词缺失标签 | AI 推断真实误解 |
| 掌握度 | 关键词覆盖率 × 权重 | AI 综合评估 |
| 复述评估 | 步骤覆盖计数 | 理解深度 + 覆盖 |

### 涉及文件
`api/index.py`, `api/requirements.txt`

## 2026-07-27｜AI 上传材料生成 + 超时兜底优化 ✅

- **上传材料支持**：新增 `POST /api/materials/upload` 端点，支持 PDF/Markdown 文本提取 → DeepSeek AI 自动生成完整学习包（map/sections/questions/learning_goals）
- **超时优化**：DeepSeek 评分超时从 8s 缩到 5s，`max_retries=0`，超时立即退回规则评分
- **前端兜底修复**：演示模式下非 SENet 材料不再返回假数据，改为占位提示；上传材料评分失败时显示具体错误
- **加载动画**：提交复述后全屏遮罩 + 三点跳动 + 进度指示器，减少等待无聊感
- **非 SENet 材料评分**：上传材料的评分全部走 DeepSeek AI（无关键词兜底），失败时报 502 而非假数据

### 涉及文件
`api/index.py`, `apps/web/src/lib/api.ts`, `apps/web/src/components/StudyFlow.tsx`, `apps/web/src/styles/study.css`

## 2026-07-27｜Vercel 后端部署 + DeepSeek API 配置 + 生产站修复 ✅

### 背景
评审三批（A/B/C）全部完成后，生产站功能正常但评分逻辑仍是内置演示数据（永远 72%），且无后端评分。用户希望实现真实 AI 驱动的评分，同时修复体验问题。

### 后端部署过程
1. **创建 Vercel Python Serverless Function**：新建 `api/index.py`（FastAPI）和 `api/requirements.txt`。核心思路：轻量无状态，SENet 内置材料 seed 到内存 store，scoring 用纯 Python 规则引擎（不依赖 pymupdf/openai 重型包），不支持的文件上传/OCR 暂不部署。
2. **路由修复**：初始部署后 API 404，根因是 Vercel 的 rewrites 不自动把 `/api/*` 子路径映射到函数。在 `vercel.json` 新增 `routes` 数组，`/api/(.*)` → `/api/index`，在 rewrites 之前执行。
3. **数据完整性问题**：初版 `get_material` 只返回摘要字段，StudyFlow 需要 map/sections/questions/learning_goals 完整数据 → 补全 `SENET_MATERIAL` dict 内联所有学习内容。
4. **档案消失问题**：API 的 `/api/archive` 返回空数组（200 OK），不是错误 → `withDemo` 不触发 catch → Supabase 兜底被短路 → 用户看到空档案。修复：删除 API 的 archive 端点，返回 404 触发前端 fallback 到 Supabase `loadCloudArchive()`。

### 创新与变化

**架构创新**：
- **首次实现前后端同域部署**：之前前后端分离（前端 Vercel/Pages，后端本地 FastAPI）。现在 `api/index.py` + `vercel.json routes` 让 Python 函数和 React SPA 在同一域名下协同——这是 Vercel 混合部署模式（前端静态 + 后端 serverless）。
- **Serverless 评分引擎**：将 `evaluate_senet` 规则评分逻辑从本地 SQLite 后端移植到 Vercel 无状态函数中。不需要数据库，不需要 AI 调用，冷启动即可评分。
- **双站点策略**：Vercel 站 = 真实 API（`VITE_DEMO_MODE` 不设），GitHub Pages = 纯静态演示模式（`VITE_DEMO_MODE=true` 编译）。同一套代码，编译时环境变量控制行为。

**体验变化**：
| 之前 | 之后 |
|---|---|
| 评分永远 72% | 按关键词动态打分，对错反映实际回答 |
| 掌握度假数据 | 每道题独立评分，错因标签动态生成 |
| 红色降级条 | 无条（后端健康） |
| 金色演示条 | Vercel 无、Pages 有（分别适配合适模式） |
| 档案死按钮 | 点击展开复述内容 |
| 顶栏左搜索框/通知铃 | 删除冗余元素，导航右对齐 |
| 复习入口硬编码 `materials[0]` | 从最近档案自动推导 material_id |

**包体积变化**：
| 阶段 | JS 大小 |
|---|---|
| 评审批次 A 之前 | ~467 kB（supabase-js 静态导入） |
| 批次 C 之后 | ~253 kB（`import()` 懒加载） |
| 加上 Python API 后 | 前端 ~254 kB + 后端 ~1 kB（纯规则） |

### 遇到的困难与解决
1. **Vercel routes vs rewrites 陷阱**：详见 lessons-learned #23。
2. **VITE_DEMO_MODE 缓存不生效**：详见 lessons-learned #24。
3. **API 空数组遮蔽 Supabase**：详见 lessons-learned #25。
4. **GitHub 推送被墙**：git 连 github.com:443 超时，Vercel CLI 走独立通道部署。详见 lessons-learned #28。
5. **DeepSeek API Key**：用户通过 `vercel env add` 安全注入到 Vercel 环境变量，后端 `config.py` 从 `os.getenv("DEEPSEEK_API_KEY")` 读取——密钥不进 Git、不出现聊天记录、不打日志。

### 验证结果
- TypeScript：零错误
- Vite build：通过（JS 254 kB / gzip 81.7 kB + Python chunk 214 kB）
- Vercel 部署：`dpl_G6YmsB9tdsDhkeNpx3Ffdjqe3SjC` → READY
- 跨设备验收：手机注册 → 学习 → 电脑登录同一账号 → 档案/掌握度/复述同步 ✅
- API 验证：`/api/health` 返回 `ai_configured=true, ai_provider=deepseek, model=deepseek-v4-flash`（虽未实际调用，但密钥已配置）

### 涉及文件
`api/index.py`（新）, `api/requirements.txt`（新）, `vercel.json`, `apps/web/src/components/ArchiveView.tsx`, `apps/web/src/styles/pages.css`

## 2026-07-27｜当前对话已整理导出

- 已将本轮从产品规划、SENet 首版、云端账号到 v.3 前端改版的主要对话整理为 Markdown；
- 纪要保留产品决策、技术架构、完成内容、关键问题、验证证据和下一步；
- 已主动排除邮箱、密码、API 密钥和完整数据库连接等敏感信息；
- 导出文件保存到用户桌面：`问渠项目对话纪要-2026-07-27.md`。

## 2026-07-27｜v.3「纸上书房」前端改版完成

- 按产品改版方案 A，将通用蓝白后台升级为“东方人文 × 现代编辑器”的纸上书房；
- 建立宣纸暖白、墨色夜读两套独立主题，主色改为黛蓝、朱砂、暖金和竹青；
- 全站标题改用中文衬线字体，正文、证据编号和页码建立明确的字体分工；
- 侧栏改为朱砂短线激活态，并加入“问渠”印章与《观书有感》取义卡；
- 首页 Hero 改为真实 SENet 材料封面叠放和今日进度环，“今日三件事”取代普通功能宫格；
- 资料库使用纸色封面和墨线进度，筛选改为下划线标签；
- 学习流程切换为无侧栏沉浸布局，材料地图、双轨阅读、稿纸复述、批注式诊断均已重绘；
- 登录注册弹窗改为印章品牌、底线输入和独立暗色设计，原有 Supabase 账号逻辑未改；
- 原 58 KB 单文件样式拆为 `tokens / base / shell / pages / study / auth` 六层，删除两套主题互相覆盖的问题；
- 新增可重复运行的浏览器原型采集脚本，自动验证浅色、深色、资料库、注册、学习流程和手机布局；
- 保存 6 张真实运行原型图至 `docs/product/prototypes/wenqu-v2/`；
- `pnpm check` 全部通过：TypeScript、Vite、Ruff 通过，Pytest `4 passed`；
- 浏览器自动点击验收通过，页面内容完整、无 Vite 错误层、无运行时错误；
- 首轮手机截图发现学习页返回文字被挤成竖排，已改为移动端返回箭头并复验通过。
- v.3 已推送到 GitHub 草稿 PR #18；
- GitHub CI 的 Web 与 API 两项自动审查均已通过。

对应版本记录：`docs/progress/v.3.md`

## 2026-07-27｜v.2 云端账号与生产数据库已上线

- 已加入 Supabase 真实邮箱注册、登录、会话保持和退出登录；
- 已加入本地学习记录登录后自动迁移、完成练习自动写入云端、阅读档案读取云端；
- 已创建 `profiles`、`study_records` 与完整 RLS 用户隔离迁移脚本；
- 已补充 Supabase 环境变量、回调地址、安全边界和手机/电脑验收文档；
- 无 Supabase 配置时继续使用浏览器本地模式，现有演示站不会中断；
- `pnpm check` 已通过：TypeScript、Vite、Ruff 全部通过，Pytest `4 passed`；
- 三份 Marketplace / Supabase 法律文件均由项目所有者逐项明确授权；
- 已创建并连接 Supabase 资源 `supabase-aureolin-button`；
- 已执行首个生产迁移，并通过 Auth、表、RLS、策略和触发器只读验收；
- 已部署到 `https://wenqu-reading-room.vercel.app`；
- 生产浏览器显示“云端同步已开启”，注册弹窗确认使用 Supabase Auth，控制台错误为 0；
- 已创建 GitHub 草稿 PR #18，Web 与 API CI 全部通过；
- 已建立 `docs/progress/lessons-learned.md`，并在 `AGENTS.md` 中设为每轮开始必读、结束必写。

对应版本记录：`docs/progress/v.2.md`

## 2026-07-27｜邮箱确认回调已修复

- 用户真实注册邮件点击后跳转到 `http://localhost:3000`；
- 已确认前端 `emailRedirectTo` 传入生产地址，根因是 Supabase Auth URL Configuration 仍为默认值；
- 已打开准确的 Supabase URL Configuration 页面；
- Site URL 已改为 `https://wenqu-reading-room.vercel.app`；
- `https://wenqu-reading-room.vercel.app/**` 已加入 Redirect URLs；
- 当前数据库中共有 2 个账号，其中 1 个邮箱已确认；未读取或记录邮箱内容；
- 最新注册账号状态已只读确认是“邮箱已确认”；
- 用户可直接回到生产站使用原邮箱和密码登录，无需重新注册或重发邮件；
- 下一步完成一次手机学习，再在电脑登录同一账号验证跨设备记录。

### 当前最高优先级

部署已验证的冷启动真实性修复到 Vercel，随后完成一次生产站“上传材料 → 学习 → 评分”闭环验收。

## 当前阶段

**阶段：v.4 线上版本仍在运行；安全修复已在本地分支完成，待数据库迁移、部署与生产隔离验收。**

```text
[x] 产品架构与产品设计
[x] SENet 证据学习包
[x] React 第一版前端
[x] FastAPI 第一版后端
[x] 前后端真实浏览器联调
[x] 规则评分与 SQLite 阅读档案
[x] OpenAI Responses API 接入
[x] 本地类型检查、构建、静态检查与接口测试
[x] GitHub README、截图、CI 与 Dependabot
[x] 创建远程仓库并验证首次 CI
[x] 问渠品牌与蓝白双主题
[x] 资料库、学习洞察、错因图谱和前端账户交互
[x] 无后端公开演示模式
[x] v.1 产品原型图归档
[x] 公网站点发布与公开权限确认
[x] GitHub 仓库更名为 wenqu 并转为公开
[x] 修复密码显隐语义与本地账户说明
[x] 完整学习数据保存到浏览器并支持 JSON 导出
[x] 学习洞察与错因图谱改为读取真实记录
[x] DeepSeek / OpenAI 可切换后端与结构化输出校验
[x] Supabase 真实账号、RLS 与云端学习记录
[x] 方案 A「纸上书房」双主题前端
[x] 桌面 / 手机自动化视觉回归与原型归档
[x] 前端代码评审 A/B/C 三批 14 项全部修复
[x] Vercel Python Serverless 后端在线评分
[x] DeepSeek API Key 已安全注入生产环境
[x] 跨设备数据同步验收（手机→电脑档案互通）
[x] 真实 DeepSeek AI 评分调用（语义评估）
[x] 原文片段选择：chunk + 本地相关片段选择 + 评分
[x] 上传材料 PDF 文本提取 + 地图/双轨填充
[ ] 上传材料完整闭环（评分后持久化到 Supabase）
[ ] 邀请第一位真实学习者
[ ] 邀请首位项目共创者
[ ] 完成 5 人首轮学习测试
```

## 2026-07-27 已完成

### 手机实测问题修复

- 核对服务器 SQLite，确认手机完成的那次练习没有落库；数据库只有 2 条凌晨本地测试会话；
- 根因是公开站点使用纯静态演示模式，注册昵称只保存在手机浏览器，学习会话只存在页面内存；
- 修正密码按钮语义：闭眼表示当前隐藏，睁眼表示当前可见，并加入清晰的辅助说明；
- 注册改为保存昵称、邮箱和创建时间，密码明确不保存；
- 完成练习后持久化保存 3 道回答、复述、诊断、错因与完成时间；
- 阅读档案新增 JSON 测试数据导出；
- 学习洞察、错因图谱和首页指标改为读取真实浏览器记录，不再显示预置数据；
- 资料库“全部 / 论文 / 笔记 / 已完成”筛选已具有真实交互；
- “开始复习”和“开始巩固”按钮已接回 SENet 学习流程；
- 保存完整浏览器验收截图 `docs/product/prototypes/wenqu-v1/10-functional-data-flow.png`。

### DeepSeek 接入

- 后端增加 `AI_PROVIDER=deepseek|openai` 可切换配置；
- DeepSeek 默认使用 `deepseek-v4-flash` 与官方 OpenAI 兼容接口；
- 材料生成和学习诊断均启用 JSON 输出，并经过 Pydantic 二次校验；
- 健康检查返回实际 AI 提供商、模型和密钥配置状态；
- 增加 DeepSeek JSON 模式自动测试；
- 当前 `.env.local` 尚未配置 `DEEPSEEK_API_KEY`，因此未进行真实额度调用。

### 问渠 v.1 前端产品化

- 产品名称由“知隅”更新为“问渠 Wenqu”，取意“问渠那得清如许，为有源头活水来”；
- 正式 React 前端更新为蓝白主题，并支持白天 / 夜间模式和主题持久化；
- 增加今日阅读、资料库、学习洞察、错因图谱五级产品导航；
- 增加前端注册 / 登录弹窗，演示账户只保存在当前浏览器；
- 增加无需 FastAPI、数据库和 AI 密钥的公开演示模式；
- SENet 材料地图、双轨讲解、理解测验、复述和诊断仍可完整运行；
- 浏览器实际验证导航点击、注册弹窗、主题切换和学习流程跳转；
- 保存 8 张真实运行原型图至 `docs/product/prototypes/wenqu-v1/`；
- 参考 Frappe Learning、Study Buddy、OATutor 与 WeKnora 的公开产品模式，只提炼信息结构与交互原则，未复制代码。

### 公网发布

- 推荐生产地址：<https://lizhuofan-curry.github.io/wenqu/>；
- Vercel 备用地址：<https://wenqu-reading-room.vercel.app>；
- Sites 历史地址：<https://wenqu-reading-room.z7074836.chatgpt.site>；
- Sites 项目已设为 `public`，任何获得链接的人都可访问；
- 生产版本：Sites version 5；
- 部署源码提交：`46c97f3`；
- 修复部署环境中根构建脚本无法调用 pnpm 的问题；
- 将 Vite 产物统一输出到根目录 `dist/`；
- 增加 Sites 静态资源运行入口与单页应用路由回退；
- GitHub `main` 与 Sites 源码仓库均已推送。
- GitHub Pages 已更新到功能修复包 `index-CpZzVvT4.js`，部署运行 `30218593171` 成功；
- Sites v5 部署状态为 `succeeded`，源码提交为 `46c97f3`；
- Vercel 生产部署 `dpl_E4gyYubir1dZj7PTvzUFMAhRANn2` 状态为 `READY`，别名仍为 <https://wenqu-reading-room.vercel.app>；
- 公网 GitHub Pages 重新完成注册、密码切换、SENet 五阶段、诊断和档案保存；
- 公网验证得到 1 条 `completed` 记录、3 道回答、完整复述，控制台错误为 `0`。

### 产品与视觉

- 将产品命名为“知隅 Zhiyu”，明确一句话主张；
- 完成 v.0 产品架构、页面结构、交互状态和视觉方向；
- 完成深色阅读室首页、人格选择、材料卡片和上传入口；
- 完成材料地图、双轨跟读、理解测验、复述、诊断和阅读档案页面；
- 生成真实运行截图 `docs/assets/zhiyu-v0-home.png`；
- 调研 PageLM、Study Buddy、Kotaemon、DeepTutor 和 OpenDataLoader PDF，只借鉴公开产品模式。

### SENet 学习闭环

- 保存并核对 CVPR 2018 SENet 原论文；
- 建立问题、方法、证据、结论和局限五段地图；
- 建立 Squeeze、Excitation、Scale 和 SE-ResNet 四段双轨讲解；
- 建立三道隐藏答案的开放题和一项用户复述；
- 规则评分可以返回掌握度、逐题反馈、错因标签、原文位置和下一步；
- 学习结果写入本地 SQLite，并可在阅读档案查看。

### 前后端与工程化

- React 19 + TypeScript + Vite 前端；
- FastAPI + Pydantic + SQLite 后端；
- 9 个 REST API，覆盖材料、人格、会话、评分、上传和档案；
- PDF / Markdown 文本提取与 OpenAI 学习包生成入口；
- OpenAI 密钥只从后端 `.env.local` 读取，不进入浏览器和 Git；
- GitHub Actions 自动执行前端类型检查、生产构建、后端 Ruff 和 Pytest；
- Dependabot 每周检查 npm、pip 和 GitHub Actions 依赖。

## 验证证据

### 问渠 v.1 前端

- `pnpm --filter @study-room/web build`：通过；
- TypeScript 严格类型检查：通过；
- Vite 生产构建：通过；
- 最终 `pnpm check`：TypeScript、Vite、Ruff 与 Pytest 全部通过；
- 本轮 `pnpm check`：TypeScript、Vite、Ruff 全部通过，Pytest `4 passed`；
- 产物：JS 约 242.88 kB（gzip 约 77.65 kB），CSS 约 45.76 kB（gzip 约 10.07 kB）；
- Playwright + Chrome 验证：首页 → 资料库 / 学习洞察 / 错因图谱 / 注册弹窗；
- Playwright + Chrome 验证：首页 → SENet 材料地图 → 双轨讲解；
- 浏览器初次验收发现缺少站点图标的 404，已补充问渠 SVG 图标并消除该资源缺口。

### 生产部署

- Sites 版本 4：`succeeded`；
- Vercel 项目 `wenqu-reading-room`：生产部署 `READY`；
- GitHub Pages `/wenqu/`：HTTP `200 OK`；
- 品牌 SVG 图标已经补齐；
- 用户与自动化执行环境访问 `chatgpt.site` 均被 Cloudflare Bot Management 返回 403，发生在应用运行入口之前；
- 当前网络将 `vercel.app` 解析到错误地址，Vercel 后台虽为 `READY`，但不作为中国网络的首选入口；
- GitHub Pages 在同一网络中可达，Chrome 已完成“资料库 → 学习洞察 → 错因图谱 → 注册弹窗 → SENet 材料地图”真实点击验收；
- 生产浏览器控制台错误：`0`；
- 生产验收截图：`docs/product/prototypes/wenqu-v1/09-production-github-pages.png`。

### 本地完整数据流

- Chrome 实际完成注册、密码显示 / 隐藏、SENet 五阶段、诊断和档案保存；
- 密码输入类型验证：`password → text → password`；
- 完成后浏览器记录数：`1`，状态：`completed`；
- 记录包含 3 道回答和完整复述；
- 本地账户保存昵称与邮箱，测试密码未出现在 `localStorage`；
- 浏览器控制台错误：`0`；
- 验收截图：`docs/product/prototypes/wenqu-v1/10-functional-data-flow.png`。

### 自动检查

执行 `pnpm check`：

- TypeScript 类型检查：通过；
- Vite 生产构建：通过；
- 产物：JS 约 218.11 kB，gzip 约 69.18 kB；
- Ruff 静态检查：通过；
- Pytest：`3 passed`；
- 覆盖健康检查、隐藏答案边界、SENet 完整学习闭环和错误文件类型。

### 浏览器联调

真实启动前端与后端后，浏览器自动完成：

1. 加载阅读室首页；
2. 点击“继续 SENet 陪读”；
3. 创建后端学习会话；
4. 显示材料地图；
5. 进入双轨跟读并显示严格轨。

结果：通过。

### OpenAI 联调

- 第一次真实调用发现普通 Pydantic Schema 不满足严格结构输出要求；
- 已改用 OpenAI SDK 的 `responses.parse` Pydantic 入口；
- 第二次调用已越过 Schema 校验，但项目返回 `insufficient_quota`；
- 结论：请求已到达 OpenAI，密钥已被识别；当前阻塞是 API 项目额度，而非代码、网络或密钥格式；
- 内置 SENet 全流程不调用模型，因此不受额度影响。

### GitHub 发布

- 仓库：<https://github.com/lizhuofan-curry/wenqu>；
- 仓库名称已由 `zhiyu-study-room` 更新为 `wenqu`；
- 当前可见性：Public；
- 仓库描述：📚 问渠 Wenqu｜以原文证据为核心的 AI 个性化陪读室：材料地图、双轨讲解、主动回忆、复述诊断与错因图谱 ✨；
- `main` 已推送；
- CI 运行：<https://github.com/lizhuofan-curry/wenqu/actions/runs/30213103782>；
- Web typecheck and build：成功；
- API lint and tests：成功；
- Dependabot 的 npm、pip 和 GitHub Actions 检查已启用。
- 本轮功能合并 CI `30218940398`：Web 与 API 两个任务均成功。

## 当前已知限制

- DeepSeek AI 评分已上线（SENet + 上传材料均可带入本地选择的原文片段）；上传与评分关键路径不再调用向量接口；
- 上传材料的持久化仍依赖内存（Supabase REST API 已接但冷启动需手动恢复），后续应实现完整读回管线；
- 上传 PDF 文本提取依赖 pymupdf（200 MB），扫描版 PDF 不支持 OCR；
- Serverless 冷启动丢 session（已通过 session 存储 questions 缓解），非 SENet 材料冷启动评分有待改进；
- 尚未完成 5 人首轮真实学习者测试、隐私协议和应用商店合规。

## 接下来自动进行

### P0｜稳定生产运行
1. 确认 Vercel 站 `wenqu-reading-room.vercel.app` 评分、档案、跨设备同步均正常；
2. 监控 API 冷启动延迟和错误率；
3. GitHub 推送恢复后同步剩余提交。

### P1｜真实 DeepSeek AI 评分 ✅
1. ~~后端 `evaluate_session` 中 SENet 走规则，非 SENet 走 `evaluate_with_ai`~~ → 已上线：SENet 优先走 DeepSeek，失败回退规则
2. ~~验证结构化输出（Pydantic 二次校验）和证据引用~~ → `AIEvaluationResult.model_validate_json()` 二次校验
3. 加入调用频率和费用保护（待做）

### P2｜首轮真实用户验证
1. 邀请第一位目标学习者完成 SENet；
2. 记录完成时间、退出点、题目答案和复述；
3. 检查用户是否认可系统指出的误解；
4. 完成 5 人测试后决定下一阶段优先级。

### P3｜朋友共创与上架准备
1. 邀请朋友成为 GitHub 协作者；
2. 使用分支、Issue 和 Pull Request 协作；
3. 增加贡献指南和模板；
4. 完成隐私说明、数据删除、日志与生产监控。
