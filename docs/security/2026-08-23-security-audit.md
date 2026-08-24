# 问渠安全与可靠性审计

日期：2026-08-23
范围：本地 `main`（`0540363`）、GitHub `origin/main`（`8ed99be`）、Vercel 生产站只读验证
性质：只检查、测试和记录；未修复业务代码，未执行线上写请求

## 结论

当前不建议继续邀请真实学习者上传私人材料。必须先完成 P0：材料与 AI 接口鉴权、材料所有权隔离、跨账号本地记录隔离、隐藏评分答案。

> 2026-08-24 状态更新：下述审计结论仍准确描述当时的 `main`/生产版本；对应 P0/P1 修复已推送到 `codex/security-hardening-main` 并发布为无冲突草稿 PR #24，完整回归与两项 CI 均通过，但尚未应用 Supabase 迁移或部署，因此生产安全状态尚未改变。

## P0｜严重

### 1. 匿名访客拥有材料和 AI 接口的实际写权限

- `api/index.py:35-73` 使用 Supabase service-role/anon key 代表服务端读写；`api/index.py:622-633` 没有认证依赖。
- 上传、删除、重新生成和评分分别位于 `api/index.py:838-1007`、`:1018-1033`、`:1036-1100`、`:1132-1184`，均不校验用户身份、资源所有者或配额。
- `api/tests/test_upload_material.py:143-165` 甚至把无凭据删除返回 200 当作正常用例。
- 隔离 TestClient 已确认：匿名读取 200、任意扩展名上传 201、匿名删除 200；未对线上执行写请求。

影响：任何人可枚举、读取、删除或改写用户材料，并通过上传、重新生成和评分消耗 DeepSeek/Vercel 配额。

### 2. 同一浏览器切换账号会把 A 的学习隐私同步到 B

- `apps/web/src/lib/storage.ts:53-69` 将完整会话、答案和复述保存在不分用户的全局 localStorage key。
- `apps/web/src/lib/cloud.ts:154-162` 登录后立即同步本机全部记录；`:172-215` 把这些记录重新标记为当前登录用户并写入云端。
- `apps/web/src/lib/cloud.ts:165-170` 退出仅执行 Supabase sign-out，没有清除或隔离本机记录。

复现路径：A 登录并完成学习 → 退出 → B 在同一浏览器登录 → A 的答案、复述和完整 session 被写入 B 的云端档案。

### 3. `materials` 表没有所有权模型，RLS 名称与实际策略不符

- `supabase/migrations/202607270002_uploaded_materials.sql:1-4` 没有 `user_id/owner_id`。
- `:9-12` 允许所有角色读取；`:14-17` 的 insert policy 未写 `to authenticated` 且 `with check (true)`；`:19-21` 的 update policy同样 `using (true)`。
- 服务端使用 service-role 时还会绕过 RLS。

Supabase 官方规则要求多用户数据以所有者字段配合 `to authenticated` 与 `auth.uid()` 强制隔离；当前设计不满足这一边界。

## P1｜高

### 4. 生产接口把隐藏评分答案直接发给学习者

- `api/index.py:682-690` 直接返回内部 material dict；题目包含 `answer_guide` 和 `max_score`。
- 本地 API 已有正确的 `QuestionPublic/QuestionInternal` 分层（`services/api/app/models.py:37-66`），但生产 Vercel 入口没有使用。
- 生产只读验证确认：3/3 道内置题均返回 `answer_guide`，首题答案字段长度 51。

### 5. 会话和评分请求可伪造，掌握度能超过 100

- `api/index.py:606-614` 对答案数量、题号唯一性、文本长度几乎没有约束。
- `:1132-1142` 在 session 不存在时信任调用方提供的 ID、材料和题目并创建会话。
- 规则评分对重复题号重复累加，但分母固定（`:264-275`、`:368`）。隔离测试重复提交同一题，得到 `mastery=106`。

### 6. AI 调用没有速率限制、并发控制或用户配额

匿名 upload/regenerate/evaluate 均可触发外部模型；回答和复述也没有严格体积上限。

### 7. 退出后仍可能暴露上一个用户的本机档案

- `apps/web/src/lib/api.ts:214-215` 无云会话时直接回退本地档案。
- `apps/web/src/lib/storage.ts:72-87` 可导出同一浏览器中的 profile 与全部记录。

## P2｜中

1. 生产上传未做扩展名/MIME/magic 白名单（`api/index.py:838-876`）。
2. AI prompt 把不可信材料、rubric 和回答混在 user 内容中；生成结果缺少逐字段原文蕴含校验，冷启动又不恢复原文 chunks（`api/index.py:76-87`、`:543-585`、`:805-835`、`:1146-1164`）。
3. Supabase 持久化异常被吞掉，API 仍返回成功（`api/index.py:1000-1007`、`:1026-1033`、`:1095-1100`）。
4. 云同步失败只写控制台，界面仍显示“云端同步已开启”。
5. API 断线时上传材料 fallback 返回空 `sections`，StudyFlow 后续可能崩溃（`apps/web/src/lib/api.ts:198-212`、`StudyFlow.tsx:175-188`）。
6. 公开 `/api/debug` 暴露 Python 版本、Supabase 配置状态和内存对象计数（`api/index.py:779-788`）。
7. `vercel.json` 未配置 CSP、防点击劫持、`X-Content-Type-Options`、Referrer/Permissions Policy；生产只确认 HSTS 存在。
8. 数据库检查与 CI 未检查 `materials`；本轮 `pnpm db:check` 因本地 Supabase tenant 连接失效而失败，云端实际 RLS 尚未验证。
9. GitHub main 未保护；Secret Scanning、Push Protection、Dependabot security alerts 均关闭。
10. Python 依赖使用宽版本、无 lock/hash；GitHub Actions 只固定 major tag。

## 供应链与测试结果

- TypeScript、Vite 生产构建、两组 Ruff 和 Python 编译：通过。
- Pytest 首轮：5 passed、3 setup errors；错误来自已知 Windows Temp ACL。改用仓库内临时目录复跑：8 passed，1 条 Starlette/httpx 弃用警告。
- `pnpm audit --prod`：生产依赖未发现已知漏洞。
- 完整 `pnpm audit`：发现 1 个 high 级开发/构建链漏洞 `nanoid <3.3.18`（GHSA-2v37-7h3g-55p8），路径为 Vite → PostCSS → nanoid。
- Python CVE 扫描：未验证，项目环境没有 `pip-audit`，本轮未安装工具。
- 常见 provider key 签名的 Git 历史扫描未命中；GitHub Secret Scanning 关闭，因此不能证明不存在其他格式秘密。
- GitHub 远端最新 CI `32454118678`：成功。
- 本地与远端分叉：本地 ahead 8 / behind 10；没有合并、推送或部署。

## 已确认的安全边界

- 当前 React 渲染未发现可直接利用的 `dangerouslySetInnerHTML/eval`；AI 和用户文本由 React 转义。
- 生产 CORS 会拒绝恶意 Origin；CORS 配置有效，但不能替代认证。
- `.env.local` 未被 Git 跟踪；未输出或记录任何密钥值。
- 没有读取真实用户上传材料的标题、ID 或正文，没有执行线上上传、删除、重生成或评分。

## 修复顺序

1. 所有材料写接口和 AI 接口验证 Supabase JWT，增加 owner 校验、限流、并发锁和用户配额。
2. `materials` 增加 `user_id`，RLS 显式 `to authenticated` 并使用 `(select auth.uid()) = user_id`；内置公共材料与用户私有材料分开。
3. 本地记录按 user id 分区；匿名记录首次绑定前要求显式确认；退出与切换账号不得跨 owner 自动同步。
4. 生产 API 只返回 public question DTO，绝不返回 `answer_guide/max_score`。
5. 严格校验 session、题号、题数、文本长度、score/max_score 和 AI 输出。
6. 删除/保护 debug，补安全头；扩展 CI、数据库 RLS 实测和前端安全回归。

## 2026-08-24｜本地修复验证

### 已闭环（代码与离线迁移）

1. 生产 API 验证 Supabase Bearer token；匿名仅能查看内置 SENet 并使用确定性规则评分，上传材料与 AI 端点要求登录。
2. 材料、会话和原文片段按 owner 隔离；用户 B 对用户 A 的详情、删除、重新生成、建会话和评分请求统一得到 404。
3. 新迁移为 `materials` 增加 nullable `user_id`、外键、索引、保留 ID CHECK 与 Force RLS；撤销浏览器角色直连 CRUD，只显式授权 service role，历史 ownerless 行保留但普通用户不可见、不可写。
4. 生产 material DTO 不再返回答案、分值上限、hash 或 owner；会话 DTO 不返回内部 owner。
5. 题号固定为 q1/q2/q3 且必须唯一；回答和复述有长度边界；AI 分数以服务端题目上限归一化，掌握度限制为 0—100。
6. AI 配额通过 service-role-only RPC 原子扣减；UTC 每日 evaluate/upload/regenerate 上限为 50/10/10，拒绝时在模型调用前返回 429。
7. 上传校验扩展名、MIME、10 MB 大小、PDF magic 和解析结果；损坏/伪 PDF 返回 400；公开 debug 已删除。
8. 本地学习记录按 user id 分区，移除登录自动迁移；认证世代只在 stable user id 变化时递增，使账号切换前的材料、档案、学习、上传、评分、删除和重新生成请求晚返回时失效，同账号 `TOKEN_REFRESHED` 不会误伤在途操作；云端记录保存还校验请求发起时的 owner，同步失败与本机兜底在界面明确展示。
9. Supabase 材料持久化异常不再吞掉：上传/重新生成回滚，删除先确认数据库成功，均返回明确 503。
10. 增加 CSP、frame/MIME/referrer/permissions 响应头；CI 加入依赖审计；`nanoid` 升至 3.3.18。

### 验证证据

- `api/tests`：18 passed；`services/api/tests + api/tests`：22 passed。
- 前端 TypeScript 强制重建：通过；Vite 生产构建：通过（JS 262.42 kB，gzip 84.02 kB）。
- 生产 API：Python compile 与 Ruff E9/F 通过。
- `pnpm audit --audit-level high`：0 known vulnerabilities。
- Vercel CSP JSON 离线解析与现有 Google Fonts 源兼容检查：通过。
- SQL 离线检查：10 条 owner policy、4 张 Force RLS 表、材料保留 ID CHECK、浏览器角色无材料表 CRUD、service role 材料 CRUD、3 个配额动作、UTC 原子 UPSERT 与 service-role-only execute 均存在；更新后的 `db:check` Python compile/Ruff 通过。

### 尚未闭环

- 迁移尚未应用到真实 Supabase，RLS/RPC 只完成离线检查；生产数据库状态未验证。
- 代码已推送并发布为草稿 PR #24，但尚未部署或在公网执行 A/B 账号隔离闭环；当前生产站仍应按原审计结论看待。
- prompt injection/生成内容逐字段原文蕴含校验、Python 锁定依赖、GitHub 分支保护/Secret Scanning 等原 P2 项未在本轮全部解决。
- Python CVE 扫描仍未执行；本轮只验证 JavaScript 依赖审计。

### 发布前门槛

1. 应用迁移并运行只读 `pnpm db:check`。
2. 以账号 A 上传材料，确认账号 B 无法枚举、读取、删除、重新生成或评分。
3. 验证匿名 SENet 仍可完整学习且只走规则评分；验证登录账号超额返回 429。
4. 部署后检查实际响应头、真实 Supabase 持久化和冷启动恢复，再决定是否邀请真实学习者。
