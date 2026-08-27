# 证据笔记卡云端同步设计（草案）

> 状态：设计草案，未经项目所有者授权前不得执行任何生产数据库迁移或部署。
>
> 日期：2026-08-27
>
> 本文不包含任何密钥、令牌、密码或数据库连接地址；所有 SQL 均为草案，语法参照 `supabase/migrations/` 既有迁移风格，未在任何数据库上执行。

## 一、背景与非目标

### 1.1 现状

证据笔记卡当前是纯浏览器本地功能：

- 前端实现位于 `apps/web/src/lib/evidenceNotes.ts`（310 行，纯函数 + 可注入 `StorageAdapter`），持久化到 localStorage，键为 `wenqu-evidence-note-cards-v1:<encodeURIComponent(ownerId)>`（`evidenceNotes.ts:1-4, 71-73`），外层包 `Envelope{schema_version, owner_id, notes}`，每个 owner 上限 200 条（`MAX_EVIDENCE_NOTES_PER_OWNER`），读取时逐字段白名单重建（`evidenceNotes.ts:122-139`），已有 JSON/Markdown 导出（`evidenceNotes.ts:269-310`）。
- UI 明示「仅保存在此浏览器，不会云同步，也不会进入评分、掌握度或学习档案」（`apps/web/src/components/EvidenceNoteDialog.tsx:81`）。
- 登录/切账号时切换命名空间，匿名数据固定在 `anonymous` 命名空间、不自动迁移（`evidenceNotes.ts:3, 66-69`）。

### 1.2 设计前提（引用现有契约）

- `docs/research/senet/learning-pack/07-evidence-note-cards.md` 第一节明确把「上传、云同步、跨设备恢复或与其他账号共享笔记」列为 MVP 非目标（第 17 行），第九节要求任何云端版本必须作为独立版本设计，具备「用户所有权、数据库 RLS、同步冲突、删除、恢复与审计契约」并通过单独验收（第 165-176 行）。本文档即该独立设计。
- `docs/research/senet/learning-pack/07-evidence-note-validation.md:130` 明确：「真正的论文事实认证与云端同步需要新的服务端 allowlist、版本、权限和独立验证方案。」本文只覆盖云端同步，**不**覆盖官方 allowlist 事实认证。
- README 的公开立场是「首版不跨设备同步」（`README.md:80`），「匿名笔记不会在登录后自动归属账号，也不会跨设备云同步」（`README.md:117`），同时「证据笔记云端同步的独立安全设计」已列入后续路线（`README.md:247`）。本设计落地前，README 相关文案必须同步更新，不能让公开承诺与实际行为脱节。

### 1.3 目标

1. 登录用户的证据笔记卡可在多设备间同步（push/pull）；
2. 同步不削弱现有任何安全边界（owner 隔离、白名单重建、与学习证据隔离、闭卷阶段不暴露入口）；
3. 为并行开发中的本地优先功能「多材料专题」（`Topic{schema_version, id, owner_id, name, description?, color?, material_ids[], created_at, updated_at}`，localStorage 键 `wenqu-topics-v1:<ownerId>`）预留云端 schema，使两个功能共用同一套同步协议骨架。

### 1.4 非目标

- 实时协作、多人在线编辑、presence、WebSocket 推送；
- 离线冲突的自动合并（只做 last-write-wins，见第四节）；
- 论文事实核验、官方 allowlist、`paper_claim`/`verified` 等核验状态；
- 匿名用户的云端备份（匿名命名空间永不上传）；
- 笔记内容的搜索索引、全文检索、AI 摘要或任何模型处理；
- 把笔记引入评分、掌握度、保持率、学习档案或推荐路线。

## 二、数据模型

### 2.1 `evidence_notes` 表 DDL 草案

```sql
create table if not exists public.evidence_notes (
  id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  material_id text not null,
  material_title text not null,
  material_revision text,
  section_id text not null,
  section_title text not null,
  content_kind text not null,
  content text not null,
  source_snapshot jsonb,
  schema_version integer not null default 1,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  constraint evidence_notes_pkey primary key (owner_id, id),
  constraint evidence_notes_kind_check
    check (content_kind in ('learner_statement', 'question_or_hypothesis')),
  constraint evidence_notes_version_check
    check (schema_version = 1),
  constraint evidence_notes_content_check
    check (char_length(btrim(content)) between 1 and 2000),
  constraint evidence_notes_source_check
    check (
      source_snapshot is null
      or (
        jsonb_typeof(source_snapshot) = 'object'
        and source_snapshot - 'label' - 'detail' - 'excerpt' - 'locator' - 'material_revision'
            = '{}'::jsonb
        and (source_snapshot ? 'label')
        and jsonb_typeof(source_snapshot -> 'label') = 'string'
        and char_length(source_snapshot ->> 'label') between 1 and 200
        and coalesce(char_length(source_snapshot ->> 'detail'), 0) <= 500
        and coalesce(char_length(source_snapshot ->> 'excerpt'), 0) <= 1000
        and coalesce(char_length(source_snapshot ->> 'locator'), 0) <= 500
        and coalesce(char_length(source_snapshot ->> 'material_revision'), 0) <= 200
      )
    )
);

create index if not exists evidence_notes_owner_updated_idx
  on public.evidence_notes (owner_id, updated_at);
```

设计要点：

- **主键 `(owner_id, id)`**：与 `study_records (session_id, user_id)` 的复合键模式一致，id 只在账号命名空间内要求唯一，天然防跨账号碰撞；前端 `crypto.randomUUID()` 生成的 id 可直接映射为 uuid。
- **`status` 不落库**：前端 `status` 由 `content_kind` 确定性派生（`evidenceNotes.ts:79-81`），存库只会引入不一致风险；pull 时由服务端按同一规则重建。
- **`created_at`/`updated_at` 由客户端提供**：LWW 冲突规则依赖客户端时间戳，因此不设 `default now()`；时钟风险与边界见 4.3。
- **`deleted_at` 软删**：删除墓碑必须参与同步传播（见 4.4）。
- **`material_id` 不设外键**：内置材料（如 `senet-cvpr-2018`）不一定存在于 `materials` 表，且材料删除时契约要求「保留卡片并标记原材料已删除」（`07-evidence-note-cards.md` 第四节），外键级联会破坏该语义。
- **`content_kind` 用 CHECK 而非 enum**：与 `transfer_tasks_status_check`、`ai_quota_usage_action_check` 的项目先例一致，后续扩值不需要 `alter type`。

### 2.2 前端字段映射表

| `EvidenceNoteCard`（TS，`evidenceNotes.ts:19-34`） | `evidence_notes` 列 | 映射说明 |
|---|---|---|
| `schema_version` (=1) | `schema_version` int | CHECK 固定为 1；未知版本 fail-closed |
| `id` (string) | `id` uuid | 前端已用 `crypto.randomUUID()` |
| `owner_id` (string) | `owner_id` uuid | 仅登录用户有云端行；`anonymous` 永不上传 |
| `material_id` | `material_id` text | 无 FK（见 2.1） |
| `material_title` | `material_title` text | 冗余快照，材料删除后仍可展示 |
| `material_revision?` | `material_revision` text null | 可选 |
| `section_id` | `section_id` text | 含 `map:*`、`result:*` 虚拟定位 |
| `section_title` | `section_title` text | 同上冗余快照 |
| `content_kind` | `content_kind` text CHECK | 两值枚举 |
| `status` | —（不落库） | 服务端按 `content_kind` 派生重建 |
| `content` | `content` text CHECK | trim 后非空且 ≤2000 字符 |
| `source?` | `source_snapshot` jsonb null | 键白名单由 CHECK 强制（见 5.1） |
| `created_at` / `updated_at` (ISO string) | `created_at` / `updated_at` timestamptz | 客户端提供 |
| —（本地无此字段） | `deleted_at` timestamptz null | 仅云端墓碑；pull 后前端转为本地真删 |

### 2.3 `topics` 预留 DDL 草案

```sql
create table if not exists public.topics (
  id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  color text,
  material_ids jsonb not null default '[]'::jsonb,
  schema_version integer not null default 1,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  constraint topics_pkey primary key (owner_id, id),
  constraint topics_name_check
    check (char_length(btrim(name)) between 1 and 120),
  constraint topics_materials_check
    check (
      jsonb_typeof(material_ids) = 'array'
      and jsonb_array_length(material_ids) <= 200
    ),
  constraint topics_version_check
    check (schema_version = 1)
);
```

**`material_ids` 用 jsonb 数组而非 `topic_materials` 连接表，理由：**

1. **与同步语义对齐**：本设计的冲突规则是行级 LWW（见 4.3）。成员关系若拆成连接表，一次「调整专题材料」会变成多行增删，LWW 在多行上不再等价于「最后一次编辑获胜」，需要额外引入 per-membership 时间戳，复杂度显著上升；jsonb 数组让「专题」仍是单行原子。
2. **与本地实体同构**：并行开发中的前端 `Topic` 实体就是 `material_ids[]`，云端 1:1 映射可以复用同一套序列化与白名单重建代码。
3. **无法也不应设 FK**：专题可引用内置材料（不落 `materials` 表）和已删除材料，连接表的外键要么失败要么级联误删。
4. **代价可接受**：放弃的是按材料反查专题的数据库级效率；该查询量级（每用户专题数 × 材料数都很小）用 jsonb 索引或应用层过滤足够。元素为字符串的逐项校验在应用层完成（CHECK 无法含子查询），与 `evidence_notes.source_snapshot` 的处理分层一致。

## 三、RLS 策略草案

### 3.1 对齐 `materials` 的 `*_own` 模式

参照 `supabase/migrations/202608240001_security_hardening.sql:93-112` 的 `materials_*_own` 写法，完整 owner 隔离策略草案：

```sql
alter table public.evidence_notes enable row level security;
alter table public.evidence_notes force row level security;

create policy "evidence_notes_select_own"
  on public.evidence_notes for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "evidence_notes_insert_own"
  on public.evidence_notes for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "evidence_notes_update_own"
  on public.evidence_notes for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "evidence_notes_delete_own"
  on public.evidence_notes for delete
  to authenticated
  using ((select auth.uid()) = owner_id);
```

`topics` 表同构（策略名 `topics_select_own` 等，谓词相同），不再重复列出。

### 3.2 客户端直写 vs 服务端独占写：推荐服务端独占写

**推荐：只对 `authenticated` 开放 `select`，insert/update/delete 全部经 FastAPI 服务端用 service key 写入；不创建 `insert_own`/`update_own`/`delete_own` 策略。** 即：

```sql
revoke all privileges on table public.evidence_notes from public, anon, authenticated;
grant select on table public.evidence_notes to authenticated;
grant select, insert, update on table public.evidence_notes to service_role;
```

理由（均有项目先例）：

1. **行级隔离 ≠ 最小权限**。复盘第 54 条（`lessons-learned.md`）指出，即使 `materials` 已有 owner RLS，允许浏览器直写仍让认证用户绕过 API 的保留 ID 与载荷校验；结论是「服务端代理写入的表默认不向浏览器角色授权」。
2. **白名单重建必须在服务端复刻**。第 88 条要求不可信 JSON 通过校验后还要按白名单重建；若浏览器直写 PostgREST，服务端没有任何机会执行重建，只能退化为纯数据库 CHECK，而 CHECK 无法表达「丢弃未知根字段后放行」这类逻辑（只能整体拒绝）。
3. **200 条上限需要计数语义**。PostgREST 直写无法在 insert 时原子执行「同 owner 未删除行数 < 200」的业务规则，只能依赖 trigger；服务端写可以在事务内先计数再插入，失败时返回明确的 4xx。
4. **sync push 是批量 upsert + LWW 比较**，不是单行 CRUD，天然是服务端逻辑。
5. **与 `study_records` 模式对齐但更简单**：笔记是用户自有内容，不存在评分真值问题（第 65、68 条针对的是 mastery/headline 等必须由服务端计算的字段），因此**不需要** HMAC 签名恢复凭据；push 失败时前端直接保留 localStorage 副本即可，localStorage 本来就是一等持久层。

保留 `select` 给 `authenticated` 的理由：pull 是只读高频路径，直连 PostgREST 可显著降低 Vercel serverless 的冷启动与超时压力（复盘第 27、29 条）；`select` 策略只回答「这是谁的数据」，不涉及真值可信度。若后续评估认为连读也应收口，改为服务端代理的成本很低。

## 四、同步协议

### 4.1 总体形态：增量 pull + 批量 push

- **Pull（增量）**：`GET /api/evidence-notes/sync/pull?since=<ISO-8601 游标>` 或直连 PostgREST `evidence_notes?owner_id=eq.<uid>&updated_at=gt.<cursor>&order=updated_at.asc`。返回 `updated_at > since` 的行（含 `deleted_at` 非空的墓碑）。新设备首次同步传 `since=1970-01-01T00:00:00Z`，即全量。客户端把游标更新为本次响应中最大的 `updated_at`。
- **Push（批量）**：`POST /api/evidence-notes/sync/push`，body 为本设备自上次 push 后变更的笔记数组（含待删除 id 列表）。服务端逐条白名单重建后，按 `(owner_id, id)` upsert，冲突时比较 `updated_at` 执行 LWW。
- **不选全量覆盖**：单设备 200 条上限使全量也可行，但全量 push 会让「两台设备各自新增不同笔记」互相覆盖，数据丢失面远大于增量 LWW，故不采用。

### 4.2 游标细节

- 游标取 `updated_at` 而非自增 id：本表没有单调序列，复合主键无序。
- 同一 `updated_at` 恰好相等的边界：pull 用 `gt`（严格大于）+ 客户端幂等合并（同 id 同 `updated_at` 视为同一版本，跳过），避免游标边界重复或丢行。
- 游标按账号命名空间持久化在 localStorage（如 `wenqu-evidence-sync-v1:<ownerId>`），与笔记键同生命周期。

### 4.3 冲突规则：last-write-wins 及其数据丢失边界

规则：同 `(owner_id, id)` 的两份版本，比较 `updated_at`，大者获胜；相等时 push 方不覆盖（视为同一版本）。

**明确的数据丢失边界（必须写进用户可见说明）：**

1. 同一笔记在两台设备离线同时编辑，先 push 的版本会被后 push 的版本整体覆盖——丢失的是**整份后编辑内容**，不做字段级合并；
2. 一台设备删除、另一台设备同时编辑：删除墓碑的 `updated_at` 与编辑的 `updated_at` 比较，大者获胜，即「编辑可能复活已删笔记」或「删除可能吞掉新编辑」；
3. 客户端时钟不准（用户手动改系统时间）会产生错误的「最新」版本；服务端对 `updated_at` 做 sanity clamp（拒绝早于 `created_at` 或晚于服务器当前时间 +5 分钟的值，对齐 `api/index.py:165` 的签发时间容差写法），但不能彻底消除时钟攻击——可接受，因为攻击者只能破坏自己的笔记；
4. 缓解措施是现有的 JSON/Markdown 导出（`evidenceNotes.ts:269-310`）作为用户自持备份，UI 继续提示「请按需导出备份」。

笔记是个人批注而非协作文档，以上边界与该定位匹配；这也是第一节把「离线冲突自动合并」列为非目标的原因。

### 4.4 删除墓碑传播

- 本地删除 → push 携带 note id，服务端 `update ... set deleted_at = <客户端删除时间>, updated_at = <同一时间>`，不物理删行；
- 其他设备 pull 到墓碑后执行本地真删；
- 墓碑保留 90 天（对齐恢复凭据 90 天有效期的既有口径，`api/index.py:167`），之后由定期清理（pg_cron 或迁移时登记的清理函数）物理删除；清理只删 `deleted_at < now() - interval '90 days'` 的行。

### 4.5 `schema_version` 迁移路径

- 服务端拒绝 `schema_version ≠ 1` 的 push（fail-closed，对齐契约第八节验收门槛「篡改本地 JSON 不能启用未来能力」）；
- 未来 v2：数据库先 `alter table` 放宽 CHECK 并新增可空列（向后兼容），发布服务端双版本读取，再发布前端「读 v1 写 v2 + 本地迁移」；本地 localStorage 键按现有约定升前缀（`wenqu-evidence-note-cards-v2:*`），旧键由显式迁移代码读取一次后废弃；
- 任何版本下，未知字段一律在服务端重建时丢弃，不因版本升级而开始信任客户端扩展字段。

### 4.6 200 条上限的服务端强制

- push 事务内先 `select count(*) from evidence_notes where owner_id = $1 and deleted_at is null`，`count + 本次新增数 > 200` 时整体拒绝并返回明确错误（不截断、不静默丢弃，对齐契约「不截断后冒充用户原文」精神）；
- 上限值 200 在前端常量（`evidenceNotes.ts:4`）与服务端配置中各存一份，用契约测试断言两者相等（对齐复盘第 51 条「应用与迁移白名单必须有同一契约」的做法）；
- 不依赖数据库 trigger 计数，保持应用层可测、错误信息可控。

### 4.7 匿名 → 登录账号的归属迁移

**结论：沿用「不自动迁移」，另提供显式一次性导入入口。**

- 现状（README.md:117 与复盘第 89 条）已确立：登录不自动认领匿名数据，任何归属变更必须是「单独、显式且可审计的用户操作」。云同步不改变这一原则——登录后**不得**后台静默把 `anonymous` 命名空间的笔记 push 到账号下。
- 显式导入流程（可选增强，需单独评审）：用户在登录状态下主动点击「导入本机匿名笔记」，界面列出条数并要求确认；确认后前端以当前登录账号为 owner 逐条重建（重新生成 id 无必要，保留原 id 即可，因为 `(owner_id, id)` 命名空间不同）并走正常 push；导入完成后**保留**匿名本地副本，由用户自行决定是否清除。
- 账号 A → 账号 B 不提供任何迁移入口；A 的云端数据只有 A 能拉取（RLS 保证），换账号即换命名空间，与现状一致。

## 五、安全约束清单

### 5.1 白名单重建的三层复刻

前端 `whitelistStoredNote`（`evidenceNotes.ts:122-139`）的语义必须在云端复刻为两层：

1. **应用层（FastAPI）**：push handler 对每条笔记逐字段重建——只取 `id/material_id/material_title/material_revision/section_id/section_title/content_kind/content/source/created_at/updated_at`，`status` 按 `content_kind` 重算，`source` 再过 `label/detail/excerpt/locator/material_revision` 子字段白名单。注入 `score`、`paper_claim`、`answer_guide`、令牌等未知根字段的一律丢弃（不整体拒绝，与前端行为一致；复盘第 88 条的教训是「类型校验不会删除运行时未知属性」，因此必须是显式重建而非 `model_dump` 原样透传）。
2. **数据库层（兜底）**：2.1 的 `evidence_notes_source_check` 用 `source_snapshot - 允许键... = '{}'::jsonb` 在 jsonb 键集合上做强白名单，长度上限同样入 CHECK。CHECK 只能兜底 source 子对象；根字段白名单无法纯 SQL 表达，依赖应用层，因此服务端独占写（3.2）是必要条件而非可选项。

### 5.2 笔记永不进入评分/掌握度/学习档案的架构保证

- **表隔离**：`evidence_notes`/`topics` 与 `study_records`、`diagnostic_attempts`、`transfer_tasks`、`retention_measurement_claims` 之间**不建立任何外键**，评分管线各表也不得新增指向笔记表的列；
- **代码路径隔离**：评分入口（`evaluate_session`、诊断、迁移、保持率测量）永不查询笔记表；新增 CI 静态断言：对评分相关模块 grep `evidence_notes`/`topics` 必须零命中（沿用复盘第 76 条「新文件进入永久 CI 门禁」的机制）；
- **AI prompt 隔离**：笔记正文、来源快照不得拼入任何模型 prompt（`07-evidence-note-validation.md` 第六节：「不得作为这些函数的参数，也不得被拼入模型评分提示词」）；
- **DTO 隔离**：sync pull 的响应 DTO 与学习者材料 DTO 分层，笔记接口响应不携带评分、路线、掌握度字段，反之亦然。

### 5.3 闭卷测量阶段不暴露入口原则在云端的维持

复盘第 90 条确立：创建入口只放材料地图、双轨阅读和普通学习结果，测验、复述、复核检查点与延迟复习流程隐藏入口。云同步引入的新风险是**同步面板/集中列表成为旁路**：即使创建入口被隐藏，若闭卷阶段仍能打开笔记列表面板看到历史笔记内容，主动回忆同样被污染。因此：

- 同步状态 UI（最后同步时间、失败重试）在闭卷阶段只显示无内容的元信息，不渲染笔记正文与 excerpt；
- 上线前按「开放/闭卷阶段矩阵」跑静态断言 + 交互测试，覆盖新增的 sync 入口路径；
- 该矩阵测试列入验收清单（第六节）。

### 5.4 来源快照 ≠ 论文事实核验

- DDL 中不得出现 `paper_claim`、`verified`、`verification_status`、`score`、`mastery` 等字段（契约第三节的禁止字段清单原样适用于云端表）；
- API 字段命名沿用 `source_snapshot`，响应与 UI 文案保留「创建时的位置快照，不代表内容已核验」；
- 服务端不得对笔记内容做任何模型补写、纠错、摘要或事实比对——同步服务是哑管道（dumb pipe），只做校验、存储、转发。

### 5.5 密钥与敏感信息铁律

- 本文档及后续实现 PR 不包含任何密钥、令牌、连接串；service key 只存在于 Vercel 服务端环境变量；
- 同步接口日志只记录 note id、owner id、异常类型，不记录笔记正文或来源快照（对齐复盘第 52 条的日志口径）；
- 浏览器直连 PostgREST 的 pull 使用用户自己的 Bearer token（`anon`/publishable key + 用户 JWT），service key 永不进浏览器。

## 六、实施前置条件与验收清单

### 6.1 硬边界：生产数据库迁移需项目所有者单独明确授权

- 复盘第 59、61 条确立：泛化的「继续」不构成对生产数据库变更的授权，数据库迁移批准与 Production 发布批准是两个独立边界。本文档的评审通过**不等于**迁移授权；
- 迁移执行前固定核对（对齐第 58、59 条）：Marketplace 资源状态正常、备份可用性已明示、迁移账本只读核对通过、受影响行数（新建表应为零影响）已报告；
- 迁移走项目既有 Python 迁移脚本（内部读取受保护环境变量，不打印连接内容，对齐第 4 条），迁移文件不含顶层 `BEGIN/COMMIT`（第 95 条），执行后从 `pg_class`/`pg_constraint`/ACL 目录核验终态（第 98 条）。

### 6.2 灰度步骤（顺序固定，对齐第 71 条「先收紧权限再发布应用」）

1. 在 Preview/暂存数据库应用迁移，跑 RLS 策略测试与目录终态核验；
2. 生产数据库应用迁移（表已建、权限已收紧，但无任何应用代码读写）——单独授权点；
3. 服务端 sync 端点随 feature flag 部署，默认关闭；前端继续纯本地；
4. Preview 环境开 flag，完成第六节全部验收；
5. 申请 Production 发布授权（独立于迁移授权），发布后灰度观察；
6. 更新 README 与证据笔记 UI 文案（「不会云同步」改为真实的同步说明），更新 `07-evidence-note-cards.md` 的非目标清单——**文档收口必须在功能上线之后或与上线同 PR**，避免公开承诺滞后（复盘第 93 条）。

### 6.3 回滚方案

- **首选**：关闭 feature flag。前端立即回退纯 localStorage 行为（本地一直是事实源之一，用户数据零丢失）；云端表保留但无读写流量；
- **次选**：若需彻底撤回，新增迁移 `drop table public.evidence_notes / topics`——同样需单独授权；执行前提示用户先用既有 JSON 导出自持备份；
- 不回滚已部署的前端本地功能本身（它与云端解耦，是既有已验收能力）。

### 6.4 需要新增的测试类型

1. **RLS 策略测试**：anon / authenticated(A) / authenticated(B) / service_role 四角色矩阵——A 不能 select/insert/update/delete B 的行；authenticated 不能 insert/update/delete 自己的行（服务端独占写）；service_role 全功能正常；
2. **同步协议单测**：LWW（含 `updated_at` 相等、时钟偏移 clamp）、墓碑传播与 90 天清理、游标边界（`gt` 严格大于 + 幂等合并）、200 条上限（含删除后新增释放名额）、`schema_version ≠ 1` fail-closed；
3. **白名单注入测试**：push 载荷注入 `paper_claim`、`score`、`source.hidden_rubric`、超长 excerpt，断言落库行不含这些字段且 excerpt 被截断/拒绝；与前端既有注入测试（`evidenceNotes.ts` 对应测试）形成端到端呼应；
4. **迁移演练**：在暂存克隆库执行迁移 + 回滚迁移，核验账本与目录终态；
5. **开放/闭卷矩阵测试**：静态断言闭卷路径（测验、复述、复核、延迟复习）不渲染笔记正文与创建/同步入口（第 90 条）；
6. **双账号隔离 e2e**：A 推送后切 B，B 的 pull 结果为空；退出登录后匿名命名空间不出现任何云端笔记；
7. **回归断言（对齐 `07-evidence-note-validation.md` 第六节）**：开启同步前后，诊断、正式评分、复述、掌握度、延迟测量的输出在相同输入下完全一致。

---

## 附：本文档引用的核验来源

| 来源 | 位置 |
|---|---|
| 前端笔记实现 | `apps/web/src/lib/evidenceNotes.ts`（310 行；常量 1-6 行，白名单重建 122-139 行，导出 269-310 行） |
| UI 不同步声明 | `apps/web/src/components/EvidenceNoteDialog.tsx:81` |
| 服务端 Bearer 校验 | `api/index.py:215-244` |
| HMAC 恢复凭据（对照模式） | `api/index.py:109-187` |
| materials `*_own` RLS 先例 | `supabase/migrations/202608240001_security_hardening.sql:93-115` |
| study_records 服务端独占写先例 | `supabase/migrations/202608250001_server_owned_study_records.sql` |
| 服务端独占写 + 无客户端策略先例 | `supabase/migrations/202608250002_transfer_tasks.sql:74-79` |
| MVP 契约 | `docs/research/senet/learning-pack/07-evidence-note-cards.md`（非目标第 17 行，云端版要求第 165-176 行） |
| 内部演练 | `docs/research/senet/learning-pack/07-evidence-note-validation.md:130` |
| 安全复盘 | `docs/progress/lessons-learned.md` 第 689-748 行（第 87-94 条），及第 51、52、54、58、59、61、65、68、71、76、90、93、95、98 条 |
| README 立场 | `README.md:80`（首版不跨设备同步）、`README.md:117`（匿名不自动归属）、`README.md:247`（云端同步为独立安全设计的后续路线） |
