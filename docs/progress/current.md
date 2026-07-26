# 知隅｜当前项目进展

> 本文档是项目的实时进度基线。每次完成实际工作后，由 Codex 自动更新；版本里程碑另存于 `docs/progress/v.x.md`。

最后更新：2026-07-27

## 当前阶段

**阶段：v.0 本地与 GitHub 验收完成，进入真实学习者验证**

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
[ ] 邀请第一位真实学习者
[ ] 完成 5 人首轮学习测试
```

## 2026-07-27 已完成

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

- 仓库：<https://github.com/lizhuofan-curry/zhiyu-study-room>；
- 当前可见性：Private；
- `main` 已推送；
- CI 运行：<https://github.com/lizhuofan-curry/zhiyu-study-room/actions/runs/30213103782>；
- Web typecheck and build：成功；
- API lint and tests：成功；
- Dependabot 的 npm、pip 和 GitHub Actions 检查已启用。

## 当前已知限制

- 自定义 PDF / Markdown 生成需要为 OpenAI API 项目补充可用额度；
- 当前为本地单用户 SQLite，不包含登录和多人隔离；
- v.0 只支持有文本层的 PDF，不支持扫描件 OCR；
- 自动测试出现一条来自 FastAPI TestClient 依赖的弃用警告，不影响当前测试；
- 尚未完成真实学习者测试、线上部署、隐私协议和应用商店合规。

## 接下来自动进行

### P0｜首轮真实用户验证

1. 邀请第一位目标学习者完成 SENet；
2. 记录完成时间、退出点、题目答案和复述；
3. 检查用户是否认可系统指出的误解；
4. 使用 `docs/research/senet/learning-pack/04-user-test.md` 记录结果；
5. 完成 5 人测试后决定 v.1 的优先级。

### P1｜补充额度后复测动态材料

1. 在 OpenAI API 项目中补充余额或提高限额；
2. 上传短 Markdown，验证学习包生成；
3. 完成该动态材料的一次答题和复述；
4. 检查 AI 诊断是否严格引用材料来源。

### P2｜准备可分享测试环境

1. 将 FastAPI、前端和持久化存储拆成可部署配置；
2. 增加生产环境变量、健康检查和日志；
3. 增加最小隐私提示与数据删除入口；
4. 发布封闭测试链接，不直接进入应用商店公开上架。
