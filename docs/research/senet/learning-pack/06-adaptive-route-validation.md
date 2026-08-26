# SENet 第一次陪读｜自适应学习路线 MVP 内部演练

> 本文件仅使用合成课前状态和合成自评事件，不包含真实用户答案。
>
> 演练验证规则能否按约定执行，不证明推荐有效、学习提升或因果效果。

## 一、演练前断言

- 路线输入只有版本匹配的课前诊断状态和学习者显式自评；
- 正式错因、正式题分、总分、`mastery` 与 retelling 均不进入路线函数；
- confidence 必填于课前诊断，但不影响路线；
- 推荐路线与 `route_state / review_queue / quiz_started` 分别保留于当前会话；
- 用户可以从头开始、选择任意章节、改走完整路线或退出；
- `need_more` 只向会话内复核队列去重加入有效章节，不改变推荐等级或知识证据；
- 复核队列清空后才能开始测验；测验开始后路线与队列冻结，但仍可返回阅读；
- 所有输出描述目标级当前证据，不输出能力等级、长期掌握或因果结论。

## 二、18 种合成场景

| # | 课前状态或会话事件 | 期望推荐/选择 | 关键断言 |
|---:|---|---|---|
| 1 | L1/L2/L3 均 `ready` | 推荐 `quick_review` | 仍保留三个目标快速回忆，不写“已掌握” |
| 2 | L1 `developing`，其余 `ready` | 推荐 `focused`：Excitation → Scale | 单个 partial 不升级完整路线 |
| 3 | L1、L2 `developing`，L3 `ready` | 推荐 `focused`，按目标优先级合并去重 | 两个 partial 不等同于两个 severe |
| 4 | L2 `evidence_insufficient`，其余 `ready` | 推荐 `focused`：Squeeze → Excitation → Scale | 单个空白只表示证据不足 |
| 5 | 两个目标 `evidence_insufficient` | 推荐 `full` | 两个 severe 触发完整路线，但不贴概念错因 |
| 6 | L1 出现永久剪枝 critical conflict，其余 `ready` | 推荐 `full` | critical conflict 覆盖高总题数表现 |
| 7 | 三题全部空白 | 推荐 `full`，允许手动改选 | 不输出“完全不懂”或能力等级 |
| 8 | 三个目标状态相同，仅 confidence 从 low 改为 high | 推荐与路径完全相同 | confidence 不计分、不路由 |
| 9 | 推荐 `quick_review`，用户选择 `start_full` | `route_state=manual`，打开完整材料顺序 | 推荐证据不变，立即尊重更完整选择 |
| 10 | 推荐 `focused`，用户选择 `choose_section=ResNet` | 打开 ResNet | 不把该选择解释为 L3 缺口或 L3 已掌握 |
| 11 | 推荐 `full`，用户主动选择较短或自由浏览 | `route_state=manual` 或 `dismissed`，保留 full 推荐说明 | 不强制完整路线，也不篡改课前状态 |
| 12 | 当前推荐 `quick_review`，用户在 Scale 选择 `need_more` | `review_queue=[Scale]`，推荐与证据不变 | 自评只加入显式复核项，不升级路线等级 |
| 13 | 当前推荐 `focused`，同一会话对 Scale 重复选择 `need_more` | 队列仍只有一个 Scale | 同一章节会话内去重，不新增证据或错因 |
| 14 | `review_queue` 非空时尝试进入测验 | 插入复核检查点并阻止测验 | 可逐项打开和移除；清空前 `quiz_started=false` |
| 15 | 清空队列后开始测验，再返回阅读 | `quiz_started=true`，路线与队列冻结 | 仍可查看全部章节，但不能停止/恢复路线或增删队列 |
| 16 | 用户选择 `continue` 或声称“我懂了” | 继续当前路线，不自动降级或标记 ready | 正向自评不是掌握证据 |
| 17 | 正式题分、错因、mastery 或 retelling 随后变化 | MVP 推荐和冻结后的 `route_state` 不因这些字段改变 | 正式评分与路线输入严格隔离 |
| 18 | 用户退出或刷新后重新进入 | 不承诺恢复 `route_state/review_queue/quiz_started`；按当前持久化课前诊断重新建议 | MVP session-only，不伪造跨会话连续性 |

## 三、额外失败闭合检查

以下情况不得猜测路线：

- 缺少任一目标状态，或状态不在公开四态内；
- recommended path 含当前材料不存在的章节；
- 课前诊断版本、rubric fingerprint 或 scorer fingerprint 不匹配；
- 自评事件类型不在白名单，或章节 ID 不属于当前材料；
- 路线函数意外收到正式评分、retelling 或 mastery 作为决策参数。

处理方式：保留材料地图和完整路线入口，显示“当前无法生成可靠的目标级建议”，不得默认成 quick review，也不得输出具体错因。

## 四、输出文案检查

每个场景都必须通过以下检查：

- [x] 说明依据来自哪一个课前目标状态或哪一次用户显式选择；
- [x] 区分推荐路线与 `route_state / review_queue / quiz_started`；
- [x] 使用“本题证据”“建议”“本次会话”等有限表述；
- [x] 不显示课前隐藏评分细则或标准答案；
- [x] 不读取正式错因、正式得分、mastery 或 retelling；
- [x] 不把空白、confidence、点击或自评当成能力证据；
- [x] 不宣称长期掌握、迁移、保持或因果提升；
- [x] 保留从头、任意章节、完整路线和退出入口。

## 五、进入实现前的验收门槛

1. 18 个场景均有确定且可解释的输出；
2. 路线函数签名不接受正式评分结果对象；
3. recommended path 先按当前材料章节白名单过滤，保留输入顺序并自然去重；
4. `review_queue` 只接受显式有效章节并在会话内去重，不改变路线等级或课前证据；
5. 退出、刷新和账号切换不会把另一会话的路线状态或复核队列带入当前会话；
6. 在引入跨会话持久化前，不将 route policy version/fingerprint 标记为已落库能力；
7. `review_queue` 非空时不能开始测验；队列清空并开始测验后，路线和队列冻结但阅读仍可访问；
8. 后续若改变阈值、章节映射、队列或冻结规则，必须同步更新本文件与策略 fingerprint 设计。

## 六、结论

上述演练通过只能说明 MVP 路线规则在合成输入下可执行且边界清晰。真实有效性仍需单独验证题面可理解性、路线接受度、退出率、课后异题和延迟迁移；观察到的差异不能直接归因为自适应路线。
