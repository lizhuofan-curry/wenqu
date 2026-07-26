# 问渠｜DeepSeek 接入与数据边界

更新日期：2026-07-27

## 当前状态

- FastAPI 已支持 `deepseek` 与 `openai` 两种 AI 提供商；
- DeepSeek 使用 OpenAI 兼容的 `/chat/completions` 接口；
- 默认模型为 `deepseek-v4-flash`；
- JSON 输出会再次经过 Pydantic 校验，结构不完整时不会写入材料库；
- 内置 SENet 仍使用证据规则评分，不消耗模型额度；
- 自定义 PDF / Markdown 的学习包生成和诊断可以使用 DeepSeek。

## 本地安全配置

只在未提交 Git 的 `.env.local` 中填写：

```dotenv
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

不要把真实密钥写进 README、前端变量、GitHub 仓库或聊天记录。

## 公开部署要求

DeepSeek 密钥必须配置在托管平台的服务端环境变量中，前端只能调用自己的后端。
生产环境还需要：

1. 部署 FastAPI 或等价的服务端函数；
2. 接入持久化数据库，不能依赖 Serverless 临时磁盘或本地 SQLite；
3. 建立真实身份认证和用户数据隔离；
4. 增加请求限流、额度保护、日志脱敏和数据删除入口；
5. 完成隐私政策后再开放真实注册。

## 当前公开版的数据边界

当前公开静态站会把昵称、邮箱、答案、复述与诊断保存在该设备浏览器的
`localStorage`，密码不会保存。阅读档案支持导出 JSON，适合首轮可用性测试，
但它不是多设备账号系统，也不能让项目方远程查看测试数据。

## 官方接口依据

- DeepSeek API Base URL：<https://api.deepseek.com>
- Chat Completions：<https://api-docs.deepseek.com/api/create-chat-completion>
- JSON Output：<https://api-docs.deepseek.com/guides/json_mode/>
- 当前模型列表：<https://api-docs.deepseek.com/quick_start/pricing/>
