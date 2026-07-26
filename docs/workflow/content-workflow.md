# 个性化陪读阅读室｜自动化工作流说明

## 工作流目的

让每一份陪读材料都经过同一套可复查流程，并确保项目进展不会只存在于聊天记录里。

## 状态流转

```text
BACKLOG
   ↓
SOURCE_READY
   ↓
EVIDENCE_CHECKED
   ↓
LEARNING_PACK_READY
   ↓
INTERNAL_VALIDATION
   ↓
USER_TESTING
   ↓
REVISION
   ↓
GO / REVISE / STOP
```

| 状态 | 进入条件 | 产物 |
|---|---|---|
| `BACKLOG` | 已选择主题 | 待办说明 |
| `SOURCE_READY` | 官方原始材料已保存 | 原论文、来源说明 |
| `EVIDENCE_CHECKED` | 公式、图表、页码已核对 | 证据地图 |
| `LEARNING_PACK_READY` | 学习者版和评测者版已分离 | 学习包、评分规则 |
| `INTERNAL_VALIDATION` | 开始模拟答案检查 | 内部演练记录 |
| `USER_TESTING` | 内部演练通过 | 用户测试记录 |
| `REVISION` | 已收集真实反馈 | 修订记录 |
| `GO / REVISE / STOP` | 达到阶段判断点 | 决策说明 |

## 每轮自动更新内容

Codex 在完成项目工作后自动维护 `docs/progress/current.md`，并把版本里程碑写入对应的 `docs/progress/v.x.md`：

1. 更新日期和当前阶段；
2. 勾选已完成任务；
3. 记录本次产物；
4. 记录验证证据；
5. 把下一项 P0 任务写清楚；
6. 用 Markdown 向用户同步同样的信息。

## 文件命名约定

每篇材料使用独立目录：

```text
resources/papers/<材料名称>/
  原始材料（不提交 Git）

docs/research/<材料名称>/
  source-notes.md
  learning-pack/
    01-learner.md
    02-evaluation-rules.md
    03-internal-validation.md
    04-user-test.md
    05-revision-and-decision.md
```

## 质量闸门

### 进入内部演练前

- 原始材料来自权威来源；
- 关键解释均有页码或章节；
- 学习者版不包含标准答案；
- 评测者版包含评分点和错因标签。

### 进入真实用户测试前

- 正确、部分正确和错误答案均已演练；
- 评分能够解释；
- 错误反馈能够跳回正确原文；
- 没有把推断写成论文明确结论。

### 进入公开测试前

- 至少 5 位目标用户完成测试；
- 多数参与者愿意完成答题；
- 有用户能明确说出系统发现的误解；
- 至少 2 位用户愿意使用第二份材料；
- 陪读人格对完成率有正向作用，而不只是觉得有趣；
- 前后端检查、构建和自动化测试全部通过；
- 不向浏览器、日志和 Git 仓库泄露密钥。
