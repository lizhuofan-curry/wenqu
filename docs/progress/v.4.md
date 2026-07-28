# 问渠｜v.4「真实评分与上传材料」上线

日期：2026-07-28

## 已完成

- 将 <https://wenqu-reading-room.vercel.app/> 确立为问渠主网站；
- Vercel 同域部署 React SPA 与 FastAPI Python Serverless API；
- 上线 DeepSeek 结构化语义评分，SENet 在 AI 不可用时仍使用可追溯的规则评分；
- 上线 PDF / Markdown 上传、文字提取、材料地图、双轨内容、理解题与 AI 重新生成；
- 加入原文片段选择，评分优先使用与当前回答相关的材料上下文；
- 材料通过 Supabase REST 保存，并在函数冷启动时尝试恢复；
- 修复上传材料会话的冷启动恢复：上下文不足时明确失败，不会把用户材料错误改判为 SENet；
- 修复短 Markdown 上传后双轨内容为空的问题，并加入永久回归测试；
- 修复上传与评分串行等待两次外部模型调用的问题：原文片段在本地选择，上传与评分各只保留一次 DeepSeek 请求；
- 上传 AI 生成失败时明确标为保底学习流，重新生成失败时返回真实错误，不再将未更新题目伪装成成功；
- 修复中文回答的原文片段选择：使用中文双字词匹配，避免将整段中文误作单一检索词；
- 将实际 Vercel 入口纳入质量门禁：`pnpm check` 与 GitHub CI 现在检查 `api/index.py` 的语法/未定义名称、Python 编译和入口专属接口测试；
- 补齐上传材料删除：首页与资料库均提供带确认和进行中状态的删除入口；内置 SENet 材料受前后端双重保护；
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
- 服务端测试：7 passed（含短 Markdown 上传、会话、评分接口、无向量调用和中文原文片段选择回归）；
- 更新后的完整本地门禁：TypeScript、Vite、`services/api` Ruff、`api/index.py` 入口静态检查与编译、7 项 Pytest 全部通过；
- 删除回归加入后：服务端测试 **8 passed**；
- 冷启动回归：上传材料的 session 缺失时，未配置 DeepSeek 会返回明确 502，不会得到 SENet 评分；
- Vercel 生产部署：短 Markdown 修复已部署为 `dpl_64L54mZoz7HUUzqAM8h1wEmw3PZF`，状态 `Ready`，`api/index` 函数构建成功（41.47 MB）；
- Vercel 生产部署：上传与评分及时性修复已部署为 `dpl_8H1aZFr4rrokaHnGPe1Pd6aomPL6`，状态 `Ready`，并绑定主网站别名；
- Vercel 生产部署：中文原文证据选择修复已部署为 `dpl_5M4DMDv44bLZjjPKWNZCuoJZjTFZ`，状态 `Ready`，并绑定主网站别名；
- Vercel 生产部署：上传材料删除功能已部署为 `dpl_DCcTh8tUXdVWpyeLsvQfx5RLLZ9y`，状态 `Ready`，并绑定主网站别名；
- 生产端点：本执行环境请求主站 `/api/health` 于 20 秒后超时，因此“公网端点可达”和完整业务闭环仍待独立验收，未将部署 Ready 误记为端到端成功。

## 接下来自动进行

1. 在主网站验证 `/api/health`、材料与人格路由；
2. 完成一次真实“上传材料 → 学习 → DeepSeek 评分”生产验收，并记录结果；
3. 增加调用频率与费用保护，再进入首轮 5 人学习测试。
