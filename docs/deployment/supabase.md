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

## 验收

1. 手机注册并确认邮箱。
2. 手机登录，完成一次 SENet 练习。
3. 电脑使用同一邮箱登录。
4. 阅读档案应出现刚才的练习。
5. 用另一个账号登录，不应看到第一个账号的数据。
6. 退出登录后，云端档案不应继续显示。

## 回退策略

没有配置 Supabase 环境变量时，问渠会自动回到浏览器本地模式，现有演示功能不会中断。
