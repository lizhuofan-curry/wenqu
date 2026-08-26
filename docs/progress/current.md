# 问渠｜当前项目进展

> 本文档是项目的实时进度基线。每次完成实际工作后，由 Codex 自动更新；版本里程碑另存于 `docs/progress/v.x.md`。


## 2026-08-26｜课前诊断生产发布安全收口

- 内置 SENet 新增独立、版本化的三道课前诊断题，不复用正式学习后的 `q1/q2/q3`；准备接口只返回题号、类型和题面，不向浏览器发送答案、证据点、来源定位或隐藏评分规则。上传材料首版明确返回 422，不调用 AI。
- 服务端按三个学习目标分别生成 `ready`、`developing`、`needs_foundation`、`evidence_insufficient` 四态证据；空白、过短、无关和照抄不伪装成错误，明确冲突优先于关键词命中。每题 `confidence=low|medium|high` 必填并随首次提交保存，但不参与评分。
- 诊断结果只公开目标状态、非答案摘要和 `full / focused / quick_review` 路线；不公开分数、标准答案、检查词、rubric 或原文定位。路线仅表示建议起点，不宣称掌握，可随时撤销、改选或从头开始。
- 新增私有迁移 `202608250004_diagnostic_attempts.sql`：任务表 Force RLS、无客户端 policy，只有 service role 可读并执行固定 `search_path` 的 prepare/claim/complete RPC；首次基线按账号、材料、材料 revision 和诊断版本唯一。确定性评分在进程中断后允许完全相同的提交恢复完成，不同提交不能覆盖首次基线。
- 隐藏 contract 同时绑定独立 rubric fingerprint 与实际可执行评分器源码 fingerprint；题面、隐藏规则、材料 revision 或评分实现变化时失败闭合，不能跨版本复用结果。诊断不会写入 `study_records`。
- 前端支持登录后准备、完成结果恢复、账号切换隔离和 `evaluating` 状态读取；建议路径只保留当前材料真实章节并去重，按顺序提供 44px 可点击导航，点击后聚焦章节 `h2`，手机端按钮满宽。
- 已把 PR #35 安全提交 `4f23d0b` 以普通 merge 合入 PR #36 本地历史；复盘文档冲突完整保留两侧内容并顺延编号，没有丢弃任何代码或经验记录。
- `202608250004_diagnostic_attempts.sql` 已删除内层 `BEGIN/COMMIT`，由迁移 runner 独占事务；生产检查器新增迁移账本 SHA-256、诊断表 Force RLS/零策略、service role 只读表权限、全部约束/索引以及 prepare/claim/complete 三个 RPC 的空 search_path、security definer、service-role-only execute 与关键行为验证。
- 当前验证证据：诊断后端专项 **34 passed**，完整 API **97 passed**，保持率 **8 scenarios passed**，诊断 UI **9 assertions passed**；TypeScript、Vite Production build（**1807 modules**）、两套 Ruff 与 Python 编译均通过。最终完整 `pnpm check` 退出码为 **0**，仅保留 1 条既有 Starlette/httpx 第三方弃用警告。
- PR #36 当前仍 **OPEN、未合并**；项目所有者已明确授权 002→003→004 生产迁移，但截至本记录三项迁移均尚未执行，课前诊断仍不能写成已上线能力。

### 当前阶段

**阶段：PR #36 已在本地合入通过 CI 的 #35 安全历史，004 原子性与永久生产检查器已修正，完整本地门禁通过；等待提交推送和新 GitHub CI，生产 002–004 尚未执行。**

### 当前最高优先级

提交并推送 PR #36 安全收口，等待新 API/Web CI；随后把已验证历史逐层合入 #37/#38。数据库生产顺序保持 **002 → 003 → 004**：每层只从精确 PR 快照执行单项迁移，现场验证账本/ACL/RPC 后才合并、部署和进入下一层。

不得因为本地测试通过就跳过 PR/CI、一次执行多项迁移，或从堆叠开发分支直接发布 Production。

最后更新：2026-08-26

## 2026-08-25｜云同步恢复中心已上线；延迟保持率完成主体实现

- 生产数据库已只执行并登记 202608250001_server_owned_study_records.sql：迁移前后 study_records 均为 **11 条**，无记录删除；最终 authenticated 完整表权限仅 SELECT，service role 仅 SELECT/INSERT，RLS 只保留 owner SELECT policy。
- Vercel Production 已配置独立 48 字节随机 ARCHIVE_RETRY_SECRET，类型为 Sensitive/Secret；密钥未输出、未写入仓库或项目文档。PR #33 已合并为 51d9022，从该精确干净快照发布。
- 当前 Production deployment 为 dpl_E7pkn7rBJPTrCxSRm2Fw91dRLesT，状态 READY，正式别名仍为 <https://wenqu-reading-room.vercel.app>。
- 一次性生产账号验收通过：/api/health 返回恢复密钥配置有效；登录账号直接 POST study_records 返回 **403**；真实 SENet 规则评分为 **88 分**、evaluator=rules 且 cloud_saved=true。
- 同一 HMAC 恢复凭据连续调用两次均成功，数据库核验只保留 **1 条**相同会话记录；临时测试账号与其评分/恢复记录已全部删除。阶段一恢复记录严格使用 PR #33 合同，没有提前伪造第二阶段 server_verified_at。
- 延迟保持率主体代码已在 codex/delayed-retention 完成：云端档案读取保留题级结果和 rubric fingerprint；只比较精确来源、同题满分、同评分器、同 rubric 且服务端验证的 D1/D3/D7 记录，迁移题、复述分、旧历史记录和提前提交全部排除。
- 指标同时显示题目旧分保留率、基线/延迟正确率、净变化、实际间隔、有效/到期样本数、准时/迟到/失访与排除数；基线总分为 0 时不伪造百分比，提升超过基线时保持率封顶 100%，新增能力单列变化百分点。
- 服务端已补齐可信来源、原始基线、服务器到期时间、材料 revision、重复间隔和原子 claim 校验；202608250003_retention_measurements.sql 创建 Force RLS 私有认领表、service-role-only RPC 和 retention-v1 唯一索引。该迁移尚未应用生产。
- 洞察页已修正既有误导口径：不再把 mastery 柱图称为“有效时间”，不再固定声称“稳步上升”，也不再用同一平均数伪造三项能力；“已修正”改为证据更窄的“本轮未再次检出”。
- 延迟保持率提交 `4fde84f` 已推送并创建 stacked PR [#35](https://github.com/lizhuofan-curry/wenqu/pull/35)；保持率公式专项已扩展为 **8 组场景**，完整 `pnpm check` 通过（Production build 1805 modules，后端 **62 passed**，仅 1 条第三方弃用警告），PR #35 的 API 与 Web CI 均通过。
- PR #34 已 retarget 到 `main`，API 与 Web CI 均通过；PR #35 仍以 PR #34 分支为 base，尚未合并。
- 项目所有者已于 2026-08-26 明确授权在 Supabase Free Plan、无数据库备份的当前条件下，按 002→003→004 顺序执行生产迁移并继续合并发布；截至本记录，三项迁移尚未执行。
- PR #35 发布前安全修正已完成：003 迁移由 runner 独占事务；私有声明表取消 service role 直连权限；RPC 固定空 search_path；迁移预检、partial unique index 与 API 预查均只接受 `server_verified_at IS NOT NULL` 的可信记录。
- 生产检查器新增当前仓库迁移文件 SHA-256 与账本精确一致检查，并验证保持率表的 Force RLS、零策略、零非 owner 直连 ACL、约束、可信唯一索引和 service-role-only 原子 RPC。完整 `pnpm check` 通过：前端构建 1805 modules、保持率 8 场景、后端 **63 passed**，仅 1 条第三方弃用警告。
- 真实 D1 保持率不能用合成时间或旧历史记录代替：必须在第二阶段上线后新建服务端可信 baseline，并在实际经过至少 24 小时后完成同口径复测才可验收。

### 当前阶段

**阶段：云同步恢复中心已上线；002–004 生产迁移已获明确授权但尚未执行；PR #35 发布安全补丁和完整本地 CI 已完成，等待提交推送后按 #34→#38 的堆叠顺序逐阶段迁移、合并、部署与验收。**

### 当前最高优先级

严格保持以下发布与验收顺序：

1. 提交并推送 PR #35 安全补丁，等待新 CI；
2. 将补丁逐层合并到 PR #36–#38，并先修正 004 迁移事务和生产检查器；
3. 从精确 PR #34 快照只执行 002，验证后合并、部署并完成迁移题验收；
4. 从精确 PR #35 快照只执行 003，验证后合并、部署并创建可信保持率 baseline；
5. 从精确 PR #36 快照只执行 004，验证后依次合并和发布 #36–#38；
6. 实际等待至少 24 小时后完成真实 D1 同口径复测与保持率验收。

不得把尚未合并的 PR #34–#38、尚未应用的 002–004 迁移，或尚未实际等待满 24 小时的 D1 写成已上线或已验收。
最后更新：2026-08-26

## 2026-08-25｜错因驱动迁移检验完成实现与本地门禁

- 首页新增独立“迁移检验”队列；只从当前登录账号、已同步且由服务端新写入的错因档案生成候选。旧档案、仅本机档案、D1/D3/D7 复习记录和迁移记录都不会递归成为新来源。
- 作答流程使用与普通复习区分开的新情境题；提交前不展示原答案、提示、错因详情或证据，提交后才返回“已迁移 / 部分迁移 / 尚未迁移”、反馈和原文定位。键盘焦点、44px 移动触控目标与 `prefers-reduced-motion` 已覆盖。
- 服务端以 owner、来源会话、最低掌握题、稳定错因代码、材料 revision 和生成版本构造确定性任务 ID；私有 rubric 和证据写入 `transfer_tasks`，浏览器只接收公开题面。上传材料旧评分规则不匹配时返回 409，要求重新完成基线。
- 新迁移先为 `study_records` 增加 nullable `server_verified_at`，历史行保持不可信；建表前发现任何确定性 `tr_...` 归档 ID 预占会 fail closed。`transfer_tasks` 强制 RLS 且无客户端 policy，完整 ACL 仅 service role 的 `SELECT/INSERT/UPDATE`；claim RPC 仅 service role 可执行。
- 付费评分采用 at-most-once 状态机：只有 `ready` 可原子 claim；quota 或取材料在模型调用前失败时恢复，模型一旦发起后遇到 timeout/空响应/JSON 校验失败则保持 `evaluating`，第二次提交返回 409 且不再调用模型。完成结果先落私有任务，再幂等追加学习档案；归档失败复用签名恢复凭据，不重新评分。
- CI 门禁已扩展到新 API 模块；完整 `pnpm check` 通过：前端 typecheck、Vite Production build（1803 modules）、两套 Ruff/Python 编译成功，后端 **56 passed**，仅 1 条第三方 Starlette/httpx 弃用警告。专项迁移测试 **23 passed**，其中包含迁移核心 **12 项**；`git diff --check` 通过。
- 功能提交 `d1a901c` 已推送到 `codex/misconception-transfer`；stacked PR #34 以 PR #33 分支为 base，API lint/tests 与 Web typecheck/build 两项 GitHub CI 均通过。PR 明确禁止绕过 #33 独立合并或部署。
- 本阶段仍在 stacked 分支，尚未应用第二阶段生产迁移、合并或发布；不能宣称迁移检验已经上线。云同步恢复中心 PR #33 仍需先完成自己的数据库/密钥/Production 安全闸门。

### 当前阶段

**阶段：错因驱动迁移检验代码、本地安全门禁、GitHub PR #34 与两项 CI 已完成；生产迁移、合并和发布依赖 PR #33 先完成。**

### 当前最高优先级

保持发布顺序为“PR #33 的服务端独占写迁移与恢复密钥 → 云同步 Production 验收 → 迁移题第二阶段迁移与 ACL/RPC 验证 → 合并 PR #34 → 迁移题 Production 验收”。等待生产闸门期间继续开发下一项“延迟保持率”，不得提前把未上线能力写成生产可用。

## 2026-08-25｜云同步恢复中心完成实现、双路复审与 GitHub CI

- 首页与阅读档案新增“尚未保存到云端”恢复中心：登录用户可单条或批量重试带服务端签名凭据的失败档案；重试不重新评分、不重复消耗 AI 配额，并按会话主键幂等追加。
- 评分服务只对完整的服务端规范化记录签发 HMAC 恢复凭据；接口重新校验 Bearer 身份、请求开始时账号、凭据 owner、版本和 90 天有效期。`ARCHIVE_RETRY_SECRET` 少于 32 个 UTF-8 字节时安全禁用，健康接口仅返回配置是否合格的布尔值。
- 浏览器同步状态明确区分 `pending`、`local-only` 与 `synced`，全部按 owner 命名空间读写；账号切换后的迟到请求不能改写新账号状态。缺少恢复凭据的记录刷新后仍显示“仅本机”，不会误报已同步。
- 阅读档案把云端记录与当前账号的本机待恢复记录按 `session_id` 合并；只有本机副本时仍能导出 JSON。档案卡片改为真实键盘 disclosure，并加入 `aria-expanded`、`aria-controls` 与恢复列表 live region。
- 浏览器端不再直接写 Supabase 评分档案；恢复凭据只保存在 `sync.retryToken`，不重复进入会话对象或本机导出数据。
- 新增迁移 `202608250001_server_owned_study_records.sql`：撤销目标角色全部表权限后，只授予 authenticated `SELECT`、service_role `SELECT, INSERT`；删除登录用户直接增删改策略，既有记录不删除。`pnpm db:check` 已升级为 `pg_class + aclexplode` 完整 ACL 精确集合检查。
- 两路独立复审分别检查服务端可信边界/迁移顺序和多账号竞态/移动端/无障碍；所有 blocking finding 已修复。尚未实现的“同步成功后主动焦点迁移”记录为非阻塞后续项，当前列表变更已通过 `aria-live` 播报。
- 完整 `pnpm check` 通过：TypeScript、Vite Production build（1801 modules）、两组 Ruff/Python 编译均成功；后端 **37 passed**，仅 1 条第三方 Starlette/httpx 弃用警告；`git diff --check` 另行作为提交前门禁。
- 本轮同步更新 `.env.example`、`README.md`、`docs/deployment/supabase.md` 与复盘文件，明确强密钥、浏览器存储边界、迁移权限影响和生产发布顺序。
- 功能提交 `8c840ab` 已推送到 `codex/cloud-sync-recovery`，PR #33 的 Web typecheck/build 与 API lint/tests 两项 GitHub CI 均通过；PR 明确标注数据库迁移必须先于应用部署。
- 当前仅完成本地实现与验证，尚未应用生产数据库迁移、配置 Production 恢复密钥、合并 `main` 或发布 Vercel，不能宣称该功能已经上线。

### 当前阶段

**阶段：云同步恢复中心已完成实现、独立复审、本地门禁与 GitHub CI；PR #33 等待生产安全闸门。**

### 当前最高优先级

获得单独明确授权后，严格按“先应用并验证服务端独占写迁移 → 配置至少 32 字节的独立 Production 恢复密钥 → 合并并部署新应用 → 真实评分与重复恢复验收”执行；当前不得提前合并 PR #33。

## 2026-08-24｜README 已同步最新生产能力

- `README.md` 已补充 D1/D3/D7 间隔复习、前后掌握度对比、服务端可信评分归档、多账号竞态保护与云端写入失败本地恢复等已上线能力。
- 在线入口和功能清单已同步生产闭环现状；路线图把下一阶段明确为 5 人真实学习测试、持续监控与“稍后重试云同步”评估。
- 安全说明已纠正：密码不保存在浏览器或问渠后端，而由 Supabase Auth 处理；不再使用“密码不会提交到服务器”这一容易混淆身份服务边界的表述。
- 本轮仅修改项目说明与进展文档，不改变前端、后端、数据库或 Vercel Production 构件。
- GitHub 发布路径为 PR #32；首轮 API lint/tests 与 Web typecheck/build 两项 CI 均通过，文档提交为 `dc4b547`。

### 当前阶段

**阶段：生产功能、README 对外说明和内部进展基线已重新对齐。**

### 当前最高优先级

进入持续监控和首位真实学习者验证；重点观察评分完成率、`cloud_saved=false` 的实际出现频率与跨设备档案刷新，并评估是否增加“稍后重试云同步”入口。

## 2026-08-24｜间隔复习已完成生产发布与真实云端闭环验收

- D1/D3/D7 功能在生产验收中先后暴露并修复两条真实故障：评分结果缺少可选 `source` 时结果页白屏；已登录用户的浏览器直连 Supabase POST 未能写入云端。
- 结果证据契约已双重加固：后端总是用题目原文证据补齐 `question_results.source`，前端同时对缺失来源显示诚实降级提示，不再因空值崩溃。对应 PR #28 合并提交 `5f1fec9`。
- 云端档案改为由 `evaluate_session` 在服务端评分完成后直接构造并写入；浏览器只提交回答、复述、明确账号与复习来源，不再把客户端 mastery、headline 或 session_data 当作入库真值。
- 登录 token 用户必须与请求开始时捕获的 `expected_user_id` 完全一致；匿名记录不会被登录账号自动认领。复习来源在评分、AI 配额和完成会话之前验证同账号、同材料、非自身及 1/3/7 天间隔。
- 数据库写入失败会返回真实 completed 结果与 `cloud_saved=false`，前端保存当前账号命名空间的本地恢复副本，不再让评分结果随云故障丢失。最终实现经独立安全复审无 blocking finding。
- 完整门禁通过：TypeScript、Vite Production build、两组 Ruff/Python 编译均通过；后端 **28 passed**，仅 1 条第三方 Starlette/httpx 弃用警告；PR #30 的 Web/API 两项 GitHub CI 均通过，合并提交 `c785e6d`。
- 最终 Production deployment 为 `dpl_GNx7K4Pyk9cmDXE448p5RknxZp3z`，状态 `Ready`，主域名 <https://wenqu-reading-room.vercel.app> 已绑定该构件；部署代码为 `c785e6dd22c5e748c90a3642c9afee17896f2ce9`。
- 最终部署最近 1 小时 `error` 日志为 0；生产别名 `/api/health` HTTP 200、`Cache-Control: no-store`，首页 CSP/HSTS/Permissions/Referrer/nosniff/DENY 均生效。构件专属 URL 受 Vercel SSO 保护，匿名 302 不作为健康失败；JSON API 未观察到 CSP，不能宣称 CSP 覆盖所有路径。
- 最终一次性账号实测通过：登录后显示 D1/D3/D7 三项到期任务；D1 直接进入主动回忆；结果页显示 100 分、三条原文证据和 72%→100% 对比；界面明确显示“本次记录已同步到云端”；数据库核验 `REVIEW_LINK_FOUND=true`；测试账号及记录已级联删除，浏览器错误为 0。
- 生产匿名 API 回归继续通过：health 200、材料列表仅内置 SENet、规则评分 100，三题 `source.label/detail` 均非空；此前真实临时账号 A/B 材料隔离验收也通过且已清理。

### 当前阶段

**阶段：D1/D3/D7 间隔复习、结果证据防崩溃与服务端可信云端归档均已合入 `main`、发布 Production，并完成真实一次性账号闭环验收。**

### 当前最高优先级

进入持续监控和首位真实学习者验证；重点观察评分完成率、`cloud_saved=false` 的实际出现频率与跨设备档案刷新，并评估是否增加“稍后重试云同步”入口。


## 2026-08-24｜D1/D3/D7 间隔复习队列已合并

- 首页新增“今日复习”，从真实学习档案自动推导第 1、3、7 天任务；到期优先显示，未到期任务保持不可点击，不伪造学习进度。
- 复习模式直接进入主动回忆，跳过材料地图和双轨原文；题目、评分规则和原文证据仍复用原材料，未新增陪读事实。
- 结果页新增“和上一次相比”，展示掌握度变化、已修正与仍需巩固的错因；完成记录保存来源会话与间隔天数，D1/D3/D7 分别去重。
- 本地记录继续按浏览器账号命名空间隔离；云端复用现有受 RLS 保护的 `study_records.session_data` JSONB 保存复习关联，因此本轮不新增数据库表、迁移或权限面。
- 账号切换、退出、普通学习和离开学习页都会清除当前复习上下文；已删除材料对应的历史任务不会生成失效入口。
- 验证：TypeScript 与 Vite 生产构建通过，API Ruff/编译通过；后端测试使用项目内隔离临时目录后 **23 passed**（1 条第三方弃用警告）；浏览器完成“到期任务 → 跳过原文 → 答题复述 → 结果对比 → D1 去重”闭环，390 px 视口无横向溢出，复习按钮高度约 44 px。
- GitHub 提交 `75046a3` 与验证记录 `dbf30d0` 已通过 PR #26 合入 `main`，合并提交为 `2dd1a31`；最终 Web typecheck/build 与 API lint/tests 两项 CI 均通过。

### 当前阶段

**阶段：间隔复习功能已完成实现、本地验收、GitHub CI 并合入 `main`；尚未发布 Vercel Production。**

### 当前最高优先级

在获得单独明确授权后，从已合并的精确 `main` 提交执行 Vercel Production 构建与完整生产验收；本功能不需要生产数据库迁移。

## 2026-08-24｜安全加固生产迁移与生产发布完成

- 生产 API 已加入 Supabase Bearer 登录校验；匿名用户只能读取并用规则评分内置 SENet，上传材料的读取、上传、删除、重新生成、建会话和 AI 评分均按用户所有权隔离，非所有者统一返回 404。
- 生产材料响应递归移除 `answer_guide`、`max_score`、`_hash` 和 `_owner_id`；评分请求固定为 q1/q2/q3 三道唯一题，回答、复述和材料 ID 均有长度/格式约束，模型分数由服务端题目上限重新裁剪，掌握度限制在 0—100。
- 上传只接受 UTF-8 Markdown 或有效 PDF，校验扩展名、MIME、大小、PDF 文件头与解析结果；删除公开 debug；Supabase 保存/删除失败会回滚并返回 503，不再假成功。
- 前端 API 自动携带当前 Supabase access token；本地 profile、学习记录和活动会话按 `userId` 命名空间隔离，旧全局记录仅迁移到匿名区。认证世代号会使账号切换/退出前的材料、档案、学习、上传、评分、删除和重新生成请求自动失效，云端记录还校验请求发起时的 user id，避免 A 的晚返回写入 B。同账号 `TOKEN_REFRESHED` 不再递增认证世代或卡住进行中状态；云端 profile 统一由 App 认证监听器落盘。
- 云同步结果改为界面可见；空 sections/questions 会阻止进入学习页；401/403/409/422/429 等服务端错误不再被演示数据掩盖。
- 新增 `202608240001_security_hardening.sql`：materials owner 外键/索引、保留 ID 约束、4 表 Force RLS、10 条 owner 策略、仅 service role 可直连材料表，以及 service-role-only 的 UTC 原子 AI 日配额（evaluate/upload/regenerate = 50/10/10）。旧 ownerless 材料保留但普通账号不可见、不可写。
- CI 新增 `pnpm audit --audit-level high`；构建链 `nanoid` 升至 3.3.18；Vercel 增加 CSP、点击劫持、MIME、Referrer 与 Permissions 安全响应头。
- 新增生产 API 安全回归矩阵；完整 `pnpm check` 通过，其中 API 测试为 **23 passed**，仅有 1 条第三方 Starlette/httpx 弃用警告。前端强制 TypeScript 检查与生产构建、JavaScript 高危审计、生产 API Python 编译与 Ruff E9/F 均通过。
- 修复已发布到 `codex/security-hardening-main`：该分支从最新 `origin/main`（`8ed99be`）重建，移植完成时相对主线 behind 0 / ahead 1；核心安全提交 `65b6e89`，认证竞态修复提交 `282f2b3`；草稿 PR #24 为 `MERGEABLE` / `CLEAN`，Web 与 API 两项 CI 均成功。旧 PR #23 已关闭，旧分支 `codex/security-hardening` 保留作历史记录。
- 用户已明确接受“Free Plan 无可用备份，且迁移后 3 条无所有者历史材料对普通账号不可见”的具体影响。
- 数据库只应用了 `202608240001_security_hardening.sql`；随后 `pnpm db:check` 通过，确认 4 张表启用并强制 RLS、10 条账号隔离策略、材料 owner 索引以及 AI 配额 RPC 与权限均符合预期。
- Preview 首轮发现动态 API 缺失静态安全响应头后，已在应用中间件强制 `no-store` 与安全头；修复提交为 `f474e6c`。
- 第二个 Preview deployment `dpl_4xcUyK13MqtQiBZYLf1BS9PDhfvz` 验收通过：匿名材料列表只显示内置材料，私有路由返回 401，内置材料会话以规则评分完成。
- 真实临时账号 A/B 隔离验收通过：A 的上传材料对 B 的列表、详情、删除、重新生成和建会话均不可见或返回 404；测试材料与两个临时账号已完成清理。可清理验收脚本提交为 `72cdf23`。
- 用户已明确授权将提交 `7842089` 对应的安全版本发布到 Vercel Production。
- Production deployment `dpl_HynvKsiBZbsh6fStQCcj8XvczN28` 状态为 `Ready`，主域名 <https://wenqu-reading-room.vercel.app> 已绑定该部署。
- 主域名 `/api/health` 返回 HTTP 200，`ai_configured=true`、provider 为 `deepseek`、model 为 `deepseek-v4-flash`。
- 生产静态页面与动态 API 安全响应头均通过实测，动态 API 明确返回 `Cache-Control: no-store`。
- 生产匿名材料列表只显示内置材料，匿名访问私有材料详情返回 401；匿名内置材料会话已用规则评分完成。
- 生产真实临时账号 A/B 隔离再次通过，测试材料与两个临时账号均已清理。
- 发布后 30 分钟范围内的 error 扫描和 HTTP 5xx 扫描均未发现日志。

### 当前阶段

**阶段：生产安全版本已上线，数据库隔离、动态 API 安全头、匿名边界、规则评分与真实 A/B 隔离均已通过生产验证。**

### 当前最高优先级

等待 PR #24 最新提交完成 CI 后合并到 `main`；随后进入持续监控与真实用户验证，继续区分部署健康、错误日志和实际学习闭环证据。

## 2026-08-21｜README 功能截图区补齐 ✅

- `README.md`：新增“功能截图”区，直接展示首页、资料库、材料地图和移动端学习流四张现有真实运行截图，让访问者不用翻目录即可看到产品形态。
- 本次只引用仓库已有截图素材，不新增未验证截图，不改变前端、后端、部署或评分逻辑。
- 验证：后续随本轮统一执行 Markdown diff 检查、提交推送和远端 README 读回验证。

### 当前最高优先级

继续完成一次真实“上传材料 → 学习 → DeepSeek 评分”闭环验收；截图区用于展示产品形态，不替代真实用户测试。

## 2026-08-21｜README 作品集首屏优化 ✅

- `README.md`：强化项目首屏定位，把“AI 个性化陪读室”的目标、适用人群、核心差异、在线入口和 v.4 能力放到截图下方；新增“10 秒看懂问渠”表格，便于 GitHub 访问者快速理解项目价值。
- 本次只修改文档，不触碰前后端学习闭环、评分逻辑、部署配置或数据边界。
- 验证：本地 `README.md` 写入成功；后续随本轮统一执行 Git diff、提交、推送和远端读回验证。

### 当前最高优先级

继续完成一次真实“上传材料 → 学习 → DeepSeek 评分”闭环验收；README 已更清晰展示现有 v.4 能力，但不能替代真实用户测试。

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

**阶段：生产安全版本已上线并完成健康、响应头、匿名权限、规则评分与真实 A/B 隔离验收；等待 PR #24 完成 CI 后合并 `main`，随后进入监控与真实用户验证。**

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
