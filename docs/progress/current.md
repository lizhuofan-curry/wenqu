# 问渠｜当前项目进展

> 本文档是项目的实时进度基线。每次完成实际工作后，由 Codex 自动更新；版本里程碑另存于 `docs/progress/v.x.md`。

最后更新：2026-07-27

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

v.3 纸上书房已合并（PR #19）并部署至 https://wenqu-reading-room.vercel.app。下一步：跨设备数据验收 → DeepSeek 生产配置。

## 当前阶段

**阶段：v.3 纸上书房前端完成，云端账号已上线，进入生产发布与跨设备验收**

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

- 未登录状态仍使用当前浏览器本地记录；登录后才会同步到 Supabase；
- 修复发布前、尚未接入 Supabase 时完成的手机练习无法从旧页面内存补取；
- v.3 视觉改版已合并 PR #19 并发布到 Vercel；
- DeepSeek 接入代码已完成，但尚未安全配置用户的 `DEEPSEEK_API_KEY`；
- FastAPI 本地回退仍使用 SQLite；生产账号与学习记录已由 Supabase RLS 按用户隔离；
- v.0 只支持有文本层的 PDF，不支持扫描件 OCR；
- 自动测试出现一条来自 FastAPI TestClient 依赖的弃用警告，不影响当前测试；
- 尚未完成集中数据落库、真实学习者测试、隐私协议和应用商店合规。

## 接下来自动进行

### P0｜建立可远程查看的真实数据链路

1. 选择并接入生产数据库与身份认证；
2. 将账户、学习会话、答案、复述和诊断按用户隔离存储；
3. 增加项目方可查看的匿名测试记录后台；
4. 增加隐私说明、退出登录和数据删除；
5. 完成跨手机与电脑的数据同步验收。

### P1｜安全启用 DeepSeek

1. 在本地和部署平台安全添加 `DEEPSEEK_API_KEY`；
2. 调用健康检查确认提供商与模型；
3. 上传短 Markdown 完成第一次真实生成；
4. 验证所有诊断引用都能回到原材料；
5. 加入单次调用限制和费用保护。

### P2｜首轮真实用户验证

1. 邀请第一位目标学习者完成 SENet；
2. 记录完成时间、退出点、题目答案和复述；
3. 检查用户是否认可系统指出的误解；
4. 使用 `docs/research/senet/learning-pack/04-user-test.md` 记录结果；
5. 完成 5 人测试后决定 v.1 的优先级。

### P3｜建立朋友共创流程

1. 确认朋友的 GitHub 用户名；
2. 从仓库 `Settings → Collaborators` 发出协作者邀请；
3. 约定功能改动通过独立分支和 Pull Request 提交；
4. 使用 GitHub Issues 记录需求、缺陷和产品讨论；
5. 为首次共创补充贡献指南、Issue 模板和 Pull Request 模板。

### P4｜准备上架级测试环境

1. 将 FastAPI、前端和持久化存储拆成可部署配置；
2. 增加生产环境变量、健康检查和日志；
3. 增加最小隐私提示与数据删除入口；
4. 发布封闭测试链接，不直接进入应用商店公开上架。
