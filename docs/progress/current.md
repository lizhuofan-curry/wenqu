# 问渠｜当前项目进展

> 本文档是项目的实时进度基线。每次完成实际工作后，由 Codex 自动更新；版本里程碑另存于 `docs/progress/v.x.md`。

最后更新：2026-07-27

## 当前阶段

**阶段：v.1 浏览器学习记录已可验证，进入服务端账号与集中数据建设**

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
[ ] 邀请第一位真实学习者
[ ] 部署真实服务端账户与集中数据库
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

## 当前已知限制

- 当前公开版记录只保存在完成操作的浏览器；换设备、清除网站数据后不会同步；
- 修复发布前完成的那次手机练习没有进入服务器，也无法从其他设备补取；
- 注册仍是浏览器本地档案，不是服务端身份认证；
- DeepSeek 接入代码已完成，但尚未安全配置用户的 `DEEPSEEK_API_KEY`；
- 服务端仍为本地单用户 SQLite，不具备生产环境多人隔离；
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
