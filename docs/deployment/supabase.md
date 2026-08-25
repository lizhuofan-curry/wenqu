# 问渠 Supabase 上线清单

## 目标

把当前“只保存在浏览器”的演示账号升级为真实邮箱账号，并让同一账号在手机和电脑上看到相同的学习记录。

## 一次性配置

1. 在 Vercel 项目 `wenqu-reading-room` 中添加 Supabase Marketplace 集成。
2. 在新建的 Supabase 项目打开 SQL Editor，执行：
   `supabase/migrations/202607270001_initial_auth_and_records.sql`
3. 在 Vercel 确认以下 Marketplace 变量已存在于 Production、Preview 和 Development：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`（优先）
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`（兼容旧项目）
4. 问渠的 Vite 构建已经允许读取上述 `NEXT_PUBLIC_` 公开变量，也继续兼容
   `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY`。
5. 在 Supabase Authentication → URL Configuration 中加入：
   - `https://wenqu-reading-room.vercel.app`
   - 实际生产域名及其回调路径
6. 重新部署 Vercel。

数据库迁移使用：

```powershell
pnpm db:migrate
```

脚本只在进程内读取 `.env.local` 的非池化连接，不输出密码；每个迁移版本会记录校验值，
已经执行的版本不会重复执行，已执行文件被修改时会主动停止。

`VITE_SUPABASE_ANON_KEY` 是配合 RLS 使用的浏览器公开密钥，不是管理员密钥。
`service_role` 密钥不得以 `VITE_` 开头，也不得进入 Git。

## 云同步失败恢复

恢复中心依赖 `supabase/migrations/202608250001_server_owned_study_records.sql`，迁移后：

- `authenticated` 只能读取自己的 `study_records`，不能直接插入、修改或删除评分档案；
- `service_role` 只能读取和追加档案，不能覆盖或删除既有评分结果；
- 既有记录不会被删除，正常评分和恢复重试都由服务端追加写入；
- 重复恢复同一 `session_id` 时使用幂等冲突忽略，不会生成重复档案。

Vercel 的 Production、Preview 和 Development 还必须配置至少 32 个 UTF-8 字节的独立高熵值 `ARCHIVE_RETRY_SECRET`。
它用于 HMAC 签发完整服务端评分记录，不能复用 Supabase service role key。浏览器重试时只提交签名凭据与预期账号；后端重新验证 Bearer 身份、凭据签名、账号归属和有效期，不重新评分或扣减 AI 配额。

迁移与环境变量属于生产安全闸门：先在 Preview 配置并验收，再单独批准生产数据库迁移和 Production 发布。执行后运行 `pnpm db:check`，确认策略与表权限和仓库预期一致。

### 2026-08-25 Production 执行记录

- `202608250001_server_owned_study_records.sql` 已在生产执行；执行前后 `study_records` 均为 **11 条**，迁移未删除既有记录；
- PR #33 已合并，merge commit 为 `51d9022`；
- [Production 主站](https://wenqu-reading-room.vercel.app/) 已重新构建并处于 READY；
- Production 已配置独立、至少 32 字节的 `ARCHIVE_RETRY_SECRET`，密钥值不写入仓库或本文档；
- 登录账号直接向 `study_records` 插入记录返回 HTTP 403；
- 内置 SENet 真实规则评分得到 88 分，响应确认 `cloud_saved=true`；
- 同一 HMAC 恢复凭据连续提交两次，数据库最终只保留一条相同的服务端档案；
- 验收使用的临时账号、评分记录、恢复记录与本地临时脚本均已清理。

## 错因驱动迁移题

迁移题依赖 `supabase/migrations/202608250002_transfer_tasks.sql`，且必须在 `202608250001_server_owned_study_records.sql` 已应用并验证后执行。第二阶段迁移会：

- 为 `study_records` 增加 nullable `server_verified_at`；历史记录保持 `NULL`，仍可阅读，但不能作为可信迁移题来源；
- 在建表前检查是否已有符合确定性任务 ID 格式的 `tr_...` 档案，发现预占即停止迁移，不覆盖、不删除；
- 创建只供 `service_role` 读取、插入和更新的私有 `transfer_tasks`，不向 `anon` 或 `authenticated` 开放任何表权限或 RLS policy；
- 创建仅 `service_role` 可执行的 `claim_transfer_task`，只允许同 owner 的 `ready` 任务原子切换为 `evaluating`；
- 不自动回收 `evaluating`。供应商调用结果未知时宁可冻结并人工核对，也不自动重试造成第二次计费。

推荐生产顺序：

1. 应用并验收 `202608250001_server_owned_study_records.sql`；
2. 配置合格的 `ARCHIVE_RETRY_SECRET`，部署并验收云同步恢复中心；
3. 只读确认不存在 `study_records.session_id` 为 `tr_` 加 32 位十六进制字符的预占记录；
4. 应用 `202608250002_transfer_tasks.sql`，运行 `pnpm db:check`；
5. 确认 `authenticated` 对 `transfer_tasks` 无权限，`service_role` 仅有 `SELECT/INSERT/UPDATE`，claim RPC 仅 service role 可执行；
6. 再部署迁移题应用，使用新完成的服务端可信基线做一次 prepare、一次评分和一次重复提交验收。

不得把旧档案批量补写 `server_verified_at`，也不得通过浏览器或人工 SQL 伪造该字段。旧记录若要进入迁移训练，用户应重新完成一次学习基线。

## 可信延迟保持率

延迟保持率依赖 `supabase/migrations/202608250003_retention_measurements.sql`。它只接受同一账号、同一材料、同一服务端可信来源会话、同一评分器、同一完整题组与同一 rubric fingerprint 的 D1/D3/D7 复习，并以服务端时间判断是否到期。迁移会创建不向浏览器开放的测量占位表、仅供 `service_role` 执行的原子 claim RPC，以及防止同一来源与间隔重复落库的唯一约束。

`202608250003_retention_measurements.sql` 依赖第二阶段迁移提供的 `server_verified_at`，因此生产顺序必须严格保持：

1. `202608250001_server_owned_study_records.sql`（已生产执行并验收）；
2. `202608250002_transfer_tasks.sql`（尚未获得生产授权，尚未应用）；
3. `202608250003_retention_measurements.sql`（尚未获得生产授权，尚未应用）；
4. `202608250004_diagnostic_attempts.sql`（尚未获得生产授权，尚未应用）。

在 002、003 与 004 分别完成只读预检、明确生产授权、迁移后 ACL/RPC 校验和应用发布前，不得把迁移题、延迟保持率或课前诊断标记为生产可用。真实 D1 保持率还必须等待新服务端可信基线产生并经过至少一个实际复习间隔，不能用即时重复评分代替。

## 开发中：课前诊断私有任务

课前目标级起点建议依赖 `supabase/migrations/202608250004_diagnostic_attempts.sql`。001 已在生产执行并验收；002、003、004 当前均未获得生产迁移授权、均未应用。必须保持 **001 → 002 → 003 → 004** 的严格顺序，不能因为应用代码或 CI 通过就越过前序迁移。

004 的数据库边界如下：

- `diagnostic_attempts` 启用并强制执行 RLS（`FORCE ROW LEVEL SECURITY`），不创建客户端 policy；`public`、`anon`、`authenticated` 对表和三个 RPC 均无权限；
- `service_role` 对任务表只有 `SELECT`，并且只有它可以执行 `prepare_diagnostic_attempt`、`claim_diagnostic_attempt`、`complete_diagnostic_attempt` 三个固定 `search_path` 的 RPC；写入、状态领取和完成都只能经这些服务端函数发生；
- 首次课前基线以 `(user_id, material_id, material_revision, diagnostic_version)` 唯一。不同 client request 仍返回同一首次基线；确定性评分中断后只允许完全相同的提交恢复，不同提交不得覆盖；
- 诊断题私有 contract、submission 和结果保存在 `diagnostic_attempts`，诊断流程不插入、更新或删除 `study_records`，也不把课前证据计入正式学习档案。


## 验收

1. 手机注册并确认邮箱。
2. 手机登录，完成一次 SENet 练习。
3. 电脑使用同一邮箱登录。
4. 阅读档案应出现刚才的练习。
5. 用另一个账号登录，不应看到第一个账号的数据。
6. 退出登录后，云端档案不应继续显示。
7. 模拟一次数据库写入失败，页面应保留本机副本并显示恢复入口。
8. 恢复成功后入口消失、云端只出现一条相同会话记录；重复提交仍只保留一条。
9. 篡改恢复凭据或由账号 B 提交账号 A 的凭据时，API 必须拒绝且不写库。

## 回退策略

没有配置 Supabase 环境变量时，问渠会自动回到浏览器本地模式，现有演示功能不会中断。
没有配置 `ARCHIVE_RETRY_SECRET` 时，评分仍会返回并保存在当前浏览器，但失败记录不能自动重试；界面必须明确显示为仅本机保存，不能误报已同步。
