# SENet 第一次陪读｜自适应学习路线 MVP 证据契约

> 适用范围：仅内置 SENet、CVPR 2018 论文第 3 节和本学习包的三个目标。
>
> MVP 边界：路线只在当前学习会话内生效，不保存为跨会话学习结论。

## 一、目标与非目标

本 MVP 根据课前诊断的目标级证据，给出可解释、可撤销的浏览顺序，并允许学习者通过显式自评选择更完整、继续当前路线或自由浏览。

三个目标保持不变：

1. L1：理解显式通道重标定，以及输入相关权重与永久剪枝的边界；
2. L2：推导 Squeeze、Excitation、Scale 的张量形状；
3. L3：理解 SE 在 ResNet residual 分支中的插入位置。

本 MVP 不做以下事情：

- 不测量 CNN、ResNet 或深度学习能力等级；
- 不证明长期掌握、迁移或保持；
- 不证明自适应路线导致学习提升；
- 不把点击、停留时间、把握程度或路线选择当成知识证据；
- 不根据正式测验错因、正式总分、`mastery`、复述得分或档案记录更新路线。

## 二、唯一允许的路线输入

### 2.1 课前诊断证据

服务端课前诊断为 L1、L2、L3 分别返回以下公开状态：

| 公开状态 | 内部类别 | 含义 |
|---|---|---|
| `ready` | supported | 本次课前题已展示完整目标证据 |
| `developing` | partial | 本次课前题只展示部分目标证据 |
| `needs_foundation` | contradictory | 本次课前题出现相反证据 |
| `evidence_insufficient` | insufficient | 当前没有充分证据 |

`contradictory` 与 `insufficient` 均属于 severe，但对外必须分别显示“出现相反证据”和“证据不足”。空白不得改写成概念错误。

### 2.2 学习者显式自评

学习过程中只接受由学习者主动触发的本次会话选择：

- `continue`：继续当前建议顺序；
- `need_more`：把学习者明确指出的当前章节加入本次会话复核队列；
- `choose_section`：自行打开材料地图或任意章节；
- `start_full`：主动改走完整路线；
- `stop_for_now`：结束本次学习，稍后再决定。

显式自评是导航偏好，不是知识证据。它不得把目标状态改成 `ready/developing/needs_foundation/evidence_insufficient`，也不得改变课前基线。

### 2.3 明确禁止读取的输入

路线选择器不得读取或派生使用：

- 正式题 `question_results`、错因标签、题分或总分；
- `retelling` 内容或得分；
- `mastery`、headline、正式反馈或档案历史；
- confidence 的高低；
- 阅读时长、滚动、点击数、章节完成标记；
- 陪读人格、账号画像或上传材料。

即使这些字段已经存在于前端状态或服务端响应，也不得传入 MVP 路线策略函数。

## 三、初始推荐规则

规则先计算推荐，不替学习者做不可撤销决定：

1. 任一目标出现 critical conflict，推荐 `full`；
2. 没有 critical conflict，但 severe 目标达到两个及以上，推荐 `full`；
3. 不满足完整路线条件，且存在任一 partial 或恰有一个 severe，推荐 `focused`；
4. 三个目标均为 supported，推荐 `quick_review`。

critical conflict 仅来自版本匹配的课前诊断，包括：

- 把 SE 明确解释为永久剪枝或训练后固定通道权重；
- 把瓶颈维当成 Scale 后最终通道数；
- 把 SE 放到 residual 与 identity 相加之后；
- 让 identity 分支经过 SE。

默认目标优先级为 critical conflict → insufficient/contradictory → partial；同级按 L1 → L2 → L3。章节映射为：

| 目标 | 建议章节 |
|---|---|
| L1 | Excitation → Scale |
| L2 | Squeeze → Excitation → Scale |
| L3 | ResNet 插入位置 |

`full` 固定为 Squeeze → Excitation → Scale → ResNet 插入位置。`focused` 从最高优先级缺口开始，追加其他缺口章节并自然去重。`quick_review` 仍需保留三个目标的快速主动回忆，不得宣称可以跳过课后异题或复述。

## 四、推荐与实际选择分离

会话中必须同时保留：

```text
diagnostic_objective_states
recommended_route
recommended_path
route_state
review_queue
quiz_started
```

- `recommended_*` 只由课前诊断决定；
- `route_state` 仅为 `following / manual / dismissed`，由学习者显式停止、恢复或手动选章改变；
- `review_queue` 只保存学习者明确标记“仍需复核”的有效章节 ID，按加入顺序去重；
- `quiz_started` 初始为 `false`，开始正式测验时变为 `true`，随后冻结路线与复核队列；
- 用户选择更短或不同章节时，系统可以执行导航，但不得篡改推荐理由或课前证据；
- 用户选择更完整路线时，应立即尊重，不要求再次证明理由；
- 任一路线均可返回材料地图、从头开始或打开任意章节。

## 五、路线、复核队列与冻结规则

### 5.1 显式路线状态

- `continue` 或点击建议章节可将 `route_state` 设为 `following`；
- `choose_section` 或从头开始将 `route_state` 设为 `manual`；
- `stop_for_now` 或“停止按建议”将 `route_state` 设为 `dismissed`；
- `dismissed` 只表示停止按建议导航，不表示已经理解，且可以在测验前显式恢复为 `following`；
- 任何状态都可以查看材料地图和全部章节，不允许用路线状态强制跳过内容。

### 5.2 会话内复核队列

- `need_more` 只把学习者明确指出的当前有效章节加入 `review_queue`；相同章节重复选择时保持一项；
- `need_more` 不改变 `recommended_route`、`recommended_path`、`route_state` 或任何课前目标状态，也不创建新的证据、等级或错因；
- 无法确定章节时显示当前材料的章节选择，不根据回答、confidence、停留时间或点击猜测要加入哪一节；
- 学习者选择“已理解”或在复核检查点显式移除后，该章节从队列删除；删除只表示本次不再要求复核，不证明掌握；
- 尝试进入正式测验时，只要队列非空就插入复核检查点；检查点必须允许逐项打开章节和显式移除，队列清空前不能开始测验。

### 5.3 测验冻结

- 只有 `review_queue` 为空时才能把 `quiz_started` 设为 `true` 并进入正式测验；
- `quiz_started=true` 后冻结 `route_state` 与 `review_queue`，不得再停止、恢复、改写路线或增删复核项；
- 冻结后仍允许返回阅读、材料地图或任意章节查看内容，但这些导航不会解冻或改变路线与队列；
- 正式测验、复述和评分结果不得回写或重新计算本次路线状态。

## 六、允许与禁止的推断

允许：

- “你在 P2 中展示了部分形状证据，建议先看 Squeeze。”
- “目前 L3 证据不足，因此本次建议加入 ResNet 插入位置。”
- “你选择了更完整讲解，路线已在本次会话中展开。”
- “这是建议顺序，可以从头开始或打开其他章节。”

禁止：

- “你是初级/高级 SENet 学习者。”
- “你已经掌握或长期记住 SENet。”
- “空白说明你不懂。”
- “高信心说明能力更强。”
- “你点击了章节，所以已经学会。”
- “系统判断这些内容可以安全跳过。”
- “个性化路线提高了你的成绩。”
- “正式测验或复述证明本路线有效。”

## 七、版本与持久化边界

MVP 的自适应选择是 session-only：刷新、退出或换设备后，不承诺恢复 `route_state`、`review_queue` 或 `quiz_started`。持久化的课前诊断仍服从其自身 diagnostic、rubric 与 scorer fingerprint 契约。

在任何跨会话保存、回放、效果分析或历史路线比较上线前，必须新增：

```text
route_policy_version
route_policy_fingerprint
route_policy_input_snapshot
route_state
review_queue
quiz_started
```

`route_policy_fingerprint` 必须覆盖状态映射、critical conflict、阈值、目标优先级、章节映射、复核队列和测验冻结规则。版本或 fingerprint 不一致时失败闭合，不得用新策略静默重解释旧路线。

## 八、有效性声明

本策略只把已版本化的课前目标证据转换为可解释导航，并尊重学习者的显式选择。它不是心理测量量表，也没有证明推荐准确、路线优于完整阅读或路线造成学习提升。正式题、课后异题与次日迁移仍是独立证据来源，但不进入本 MVP 的会话内路线更新。
