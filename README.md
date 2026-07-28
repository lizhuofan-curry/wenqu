# 问渠 Wenqu

> 问渠不替你读，而是陪你把知识变成自己的话。

[主网站 · 在线体验问渠](https://wenqu-reading-room.vercel.app/) · [GitHub Pages 静态演示](https://lizhuofan-curry.github.io/wenqu/)

[![CI](https://github.com/lizhuofan-curry/wenqu/actions/workflows/ci.yml/badge.svg)](https://github.com/lizhuofan-curry/wenqu/actions/workflows/ci.yml)
![Version](https://img.shields.io/badge/version-v.4-3975f6)
![React](https://img.shields.io/badge/React-19-61dafb)
![FastAPI](https://img.shields.io/badge/FastAPI-Python-0f9d79)

![问渠纸上书房视觉基线](docs/product/prototypes/wenqu-v2/01-home-light.png)

**问渠**取意于朱熹《观书有感》"问渠那得清如许，为有源头活水来"。它是一间强调原文证据的 AI 陪读阅读室，不止概括材料，而是带学习者完成一条完整闭环：

```text
材料地图 → 双轨跟读 → 主动回忆 → 用话复述 → 错因诊断 → 阅读档案
```

v.3 "纸上书房"以东方人文色谱与现代学习工作台结合：宣纸暖白/墨色夜读双主题、期刊纸张严格轨、暖色便签陪读轨、稿纸复述、朱砂批注诊断。v.4 在此基础上上线 Vercel 同域 FastAPI、DeepSeek 语义评分、上传材料学习包生成与冷启动真实性保护。

首份内置材料为 CVPR 2018 论文 *Squeeze-and-Excitation Networks*，支持完整运行的地图、讲解、三道理解题、复述、AI 优先且可回退的规则评分和学习档案。

## 为什么不是另一个 PDF 聊天框

- **先建立地图**：先辨认问题、方法、证据、结论与局限，再进入细节。
- **严格轨 + 陪读轨**：一条负责准确和引用，一条负责把难点讲得愿意听。
- **提交前隐藏答案**：通过主动回忆暴露真实理解缺口。
- **诊断错因，不只给分**：区分空间与通道、sigmoid 与 softmax、瓶颈与输出维度等具体误解。
- **回到原文**：正式反馈带论文页码、公式或结构图位置。
- **留下学习档案**：保存复述、掌握度和误解标签，而不是只留一段聊天记录。

## 当前可用功能

- 东方人文「纸上书房」双主题视觉与响应式布局；
- 今日阅读、资料库、学习洞察、错因图谱和阅读档案；
- Vercel 主站同域 React SPA + FastAPI Python Serverless API；
- GitHub Pages 静态演示模式（`VITE_DEMO_MODE=true`）；
- Supabase 真实邮箱注册、登录、RLS 用户隔离与跨设备学习档案；
- 三种陪读人格：黄风教练、安静师姐、严格研究员；
- SENet 材料地图与三个学习目标；
- 严格轨 / 陪读轨双栏阅读；
- 三道开放式理解题与稿纸复述；
- 朱砂批注诊断：得分、错因标签、正式反馈和原文定位；
- 本地学习记录与 JSON 导出；
- PDF / Markdown 上传、文本提取与 AI 学习包生成；
- DeepSeek 结构化语义评分、原文片段选择和失败时的证据规则回退；上传与评分各只发起一次模型请求，避免向量调用阻塞学习流；
- 上传材料会话的冷启动恢复保护：无法确认原材料时明确报错，不会错误套用 SENet 诊断；
- React 19 + TypeScript + Vite 前端，FastAPI + Pydantic 后端。

## 在线演示

| 地址 | 说明 |
|---|---|
| https://wenqu-reading-room.vercel.app/ | **主网站**：生产 API、上传材料与 AI 评分 |
| https://lizhuofan-curry.github.io/wenqu/ | GitHub Pages 静态演示：仅内置演示学习流 |

主网站使用同域生产 API；DeepSeek 密钥仅保存在 Vercel 服务端环境变量，绝不进入浏览器或仓库。GitHub Pages 是静态演示，不承诺上传与在线评分。未配置 Supabase 时，账号与记录保存在当前浏览器；配置后自动升级为真实邮箱账号和跨设备档案。

## 项目结构

```text
apps/web/                    React + TypeScript 前端
services/api/                FastAPI、评分、AI 与 SQLite
supabase/migrations/         云端账号与学习记录数据库迁移
scripts/                     跨平台开发脚本
docs/product/                产品架构、设计文档与原型
docs/research/senet/         SENet 证据与学习包
docs/progress/               版本进展与复盘
docs/workflow/               自动化工作流
resources/papers/            本地论文，不提交 Git
.github/workflows/           CI 自动审查
```

更完整的目录说明见 [docs/STRUCTURE.md](docs/STRUCTURE.md)。

## 本地运行

### 1. 准备环境

- Node.js 22+
- pnpm 11+
- Python 3.12+

### 2. 安装依赖

```powershell
pnpm install
python -m venv services/api/.venv
node scripts/py.mjs -m pip install -r services/api/requirements-dev.txt
```

### 3. 配置 AI（上传自定义材料时需要）

```powershell
Copy-Item .env.example .env.local
```

推荐使用 DeepSeek：

```dotenv
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-flash
```

也可以把 `AI_PROVIDER` 改为 `openai` 并设置 `OPENAI_API_KEY`。密钥只由后端读取，
不会进入浏览器或 Git；内置 SENet 学习流程不需要模型密钥。

### 浏览器数据说明

- 昵称、邮箱、答案、复述和诊断保存在当前浏览器的 `localStorage`；
- 密码不会保存，也不会提交到服务器；
- 完成学习后可在"阅读档案"下载 JSON 数据备份；
- 未配置 Supabase 时，清理浏览器网站数据或更换设备后，本地记录不会自动同步；
- 配置 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY` 后，登录用户的记录会自动跨设备同步；
- 浏览器只使用 Supabase 公开 anon key，数据由 RLS 按用户身份隔离。

### 4. 启动

```powershell
pnpm dev
```

- 前端：http://localhost:5173
- API 文档：http://localhost:8000/docs

## 自动审查

每次推送和 Pull Request 都会运行：

- 前端 TypeScript 类型检查；
- 前端生产构建；
- 后端 Ruff 静态检查；
- FastAPI 接口与完整 SENet 学习闭环测试。

本地执行同一套检查：

```powershell
pnpm check
```

CI 不调用 OpenAI 或 DeepSeek API，也不需要仓库密钥。

## 产品与开发文档

- [v.0 产品架构](docs/product/architecture.md)
- [v.0 产品设计](docs/product/design.md)
- [v.3 纸上书房改版方案](docs/product/REDESIGN-PROPOSAL-v2.md)
- [v.4 真实评分与上传材料上线](docs/progress/v.4.md)
- [当前进展与下一步](docs/progress/current.md)
- [踩坑与复盘](docs/progress/lessons-learned.md)
- [内容生产自动化工作流](docs/workflow/content-workflow.md)
- [DeepSeek 接入与数据边界](docs/deployment/deepseek.md)
- [Supabase 真实账号与跨设备记录](docs/deployment/supabase.md)

## 路线图

- **v.0**：跑通 SENet 的可验证陪读闭环；
- **v.1**：蓝白品牌双主题、资料库/洞察/错因图谱、公开演示模式；
- **v.2**：Supabase 真实账号、RLS 用户隔离、跨设备学习档案；
- **v.3**：纸上书房双主题视觉、沉浸学习流、样式模块化拆分；
- **v.4**：Vercel 同域后端、DeepSeek 评分、原文片段选择、上传材料学习包与冷启动真实性保护；
- **v.5**：首轮 5 人学习测试、调用频率与费用保护、隐私合规、监控与封闭测试。

## 设计参考

产品模式参考了 [PageLM](https://github.com/CaviraOSS/PageLM)、[Study Buddy](https://github.com/michaelborck-education/study-buddy)、[Kotaemon](https://github.com/Cinnamon/kotaemon)、[DeepTutor](https://github.com/HKUDS/DeepTutor) 与 [OpenDataLoader PDF](https://github.com/opendataloader-project/opendataloader-pdf)。本项目只借鉴公开产品与架构模式，不复制不明许可的实现代码。

---

问渠当前处于 v.4 生产验证阶段。现在最重要的是稳定“上传材料 → 学习 → 评分”闭环，并完成首轮 5 人真实学习者测试。
