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
