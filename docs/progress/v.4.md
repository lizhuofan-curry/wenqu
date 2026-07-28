# 问渠｜v.4「真实评分与上传材料」上线

日期：2026-07-28

## 已完成

- 将 <https://wenqu-reading-room.vercel.app/> 确立为问渠主网站；
- Vercel 同域部署 React SPA 与 FastAPI Python Serverless API；
- 上线 DeepSeek 结构化语义评分，SENet 在 AI 不可用时仍使用可追溯的规则评分；
- 上线 PDF / Markdown 上传、文字提取、材料地图、双轨内容、理解题与 AI 重新生成；
- 加入 RAG 片段检索，评分优先使用与当前回答相关的材料上下文；
- 材料通过 Supabase REST 保存，并在函数冷启动时尝试恢复；
- 修复上传材料会话的冷启动恢复：上下文不足时明确失败，不会把用户材料错误改判为 SENet；
- 修复短 Markdown 上传后双轨内容为空的问题，并加入永久回归测试；
- README 更新为 v.4，并明确主网站与 GitHub Pages 静态演示的能力边界。

## 生成或修改的文件

- `api/index.py`
- `apps/web/src/App.tsx`
- `apps/web/src/lib/api.ts`
- `README.md`
- `docs/progress/current.md`
- `docs/progress/lessons-learned.md`
- `docs/progress/v.4.md`

## 验证结果

- GitHub CI：提交 `0365d28` 的 Web 与 API 检查通过；
- 本地 TypeScript、Vite 生产构建、服务端 Ruff、Python 编译通过；
- 服务端测试：5 passed（含短 Markdown 上传、会话与评分接口回归）；
- 冷启动回归：上传材料的 session 缺失时，未配置 DeepSeek 会返回明确 502，不会得到 SENet 评分；
- Vercel 生产部署：最新部署 `Ready`，构建耗时 38 秒，`api/index` 函数构建成功（41.46 MB）；
- 生产端点：本执行环境请求主站 `/api/health` 于 20 秒后超时，因此“公网端点可达”和完整业务闭环仍待独立验收，未将部署 Ready 误记为端到端成功。

## 接下来自动进行

1. 在主网站验证 `/api/health`、材料与人格路由；
2. 完成一次真实“上传材料 → 学习 → DeepSeek 评分”生产验收，并记录结果；
3. 增加调用频率与费用保护，再进入首轮 5 人学习测试。
