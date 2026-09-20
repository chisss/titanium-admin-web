# ROUND2-REGRESSION — 第二轮功能回归报告（R-06）

> 验收日期：2026-09-17　　对应任务：`ui-202`（前置 `ui-201`）
> 上游报告：[ROUND2-VERIFY.md](./ROUND2-VERIFY.md)（渲染层复验）
> 任务判据：**六条核心业务链路功能回归 —— 确保样式变更未伤业务**
>
> **结论：六条链路全部可用；「样式变更导致的回归」计数 = 0。**
> 过程中发现并修复 1 处**既有**缺口（`TiStatusTag` 缺 3 个状态码映射，非样式变更所致），另发现 4 项遗留。

---

## 一、方法与判据

### 1.1　「回归」的判定口径

任务要求区分「业务功能是否被第二轮的样式变更破坏」。为避免把无关问题计入，本报告采用三分法：

| 类别 | 定义 | 是否计入回归数 |
|---|---|---|
| **样式变更导致的回归** | 第二轮（ui-101~ui-110）的样式/布局改动使**原本可用**的业务功能变为不可用 | ✅ 计入 |
| **既有缺口** | 与样式变更无关、在本轮之前即存在的功能/文案缺失 | ❌ 不计入，单列 |
| **验证中新增** | 为验证「可用性」而执行的正常业务操作产生的状态推进 | ❌ 不计入，须披露 |

**判定依据**：一条链路只有在「操作 → 数据变化 → 界面反馈」三者闭环成立时才算通过；任一端断裂即判失败并归因。

### 1.2　验证对象与镜像溯源

| 项 | 值 |
|---|---|
| 容器 | `titanium-admin-web`（nginx，`http://localhost:8888`） |
| 链路一~五的验证镜像 | `sha256:008dd327ca5f`（含 ui-101~ui-110 与 ui-201 断点修复） |
| `TiStatusTag` 修复后的复验镜像 | `sha256:e2ef2f6a57a4`（2026-09-17T10:28:10Z） |

沿用 ui-201 定型①：**复测可信度 = 镜像与工作树的一致性**。链路一~五在 `008dd327ca5f` 上完成，该镜像与当时工作树一致（产物探针：`admin123` 0 命中、`修改密码` 0 命中 —— ui-110 成果在产物内）。

### 1.3　为何部分验证采用「内存注入」而非改库

工作台 7 个按钮中的最后一个（**重试**）要求 `task_status='FAILED'`，而全库当前 **0 条** FAILED 记录：

```
SELECT step_type, task_status, COUNT(*) FROM t_maintenance_workflow_task_view GROUP BY 1,2;
→ FAILED 未出现在结果集中
```

两条候选路径：

1. **直接 `UPDATE` 读模型造出 FAILED 态** —— 被权限系统拦截（理由：对共享库的持久写入未获授权）。**这是正确的拦截，未绕过**。
2. **拦截网络响应、在浏览器内存中改写 `status`** —— 零持久写入，且仍走真实前端渲染路径。

本报告采纳路径 2。同理，`/system/role` 真实仅 **2 条**数据（凑不出第 2 页），其分页绑定验证亦在内存注入的 25 条上进行。**两处注入均已在验证后卸载并复验回滚**（§2.5、§2.1）。此类验证的证据力边界：能证明**前端渲染与门控逻辑正确**，不能证明后端对 FAILED 态的实际重试行为 —— 后者由源码取证补齐（§2.5-7）。

---

## 二、逐条链路实测

任务标题称「六条链路」，checkpoint 列 4 项（第 3 项含两条），实际覆盖为：**① 登录　② 保单查询　③ 产品创建向导　④ 核保决策　⑤ 理赔受理　⑥ 保全变更**。

### 2.1　链路二：保单查询（CP1）

**路由** `/policy/list`，初始 **共 30 条 / 20 条每页 / 2 页**。

| # | 实测步骤 | 实测结果 | 判定 |
|---|---|---|---|
| 1 | 姓名框输入 `张三` → 点「搜索」 | **共 30 条 → 共 4 条**，4 行，姓名去重后仅 `["张三"]` | ✅ |
| 2 | 点「重置」 | **恢复共 30 条**，20 行；输入框 `value=""`（已清空） | ✅ |
| 3 | 点分页器第 2 页 | `active=2`、`rows=10`（30−20=10，末页余数正确） | ✅ |

**ui-109 分页绑定修复验证（`/system/role`）**

`ui-109` 修的是 `:page-num` / `:page-size` 未传导致「分页器高亮弹回第 1 页、而数据真的翻了」——用户看到「第 1 页的字样 + 第 2 页的数据」。源码佐证见 [role/index.vue:22-30](../../src/views/system/role/index.vue#L22-L30) 的注释。

**该页真实数据只有 2 条角色，只有 1 页**，自然状态下无法触发翻页。故注入 25 条（复制原 2 条并改 `id`）后实测：

| # | 实测步骤 | `active` | `rows` | 分页器文本 | 判定 |
|---|---|---|---|---|---|
| 1 | 初始（20 条/页） | 1 | 20 | 共 25 条 20条/页 1 2 | ✅ |
| 2 | 点第 2 页 | **2** | **5** | — | ✅ 高亮**跟随**数据 |
| 3 | 改「10 条/页」 | **1** | **10** | 共 25 条 10条/页 1 2 3 | ✅ 重置到第 1 页 + 页数重算 |
| 4 | 点第 3 页 | **3** | **5** | — | ✅ |
| 5 | 「前往」输入 2 回车 | **2** | **10** | — | ✅ 跳页 |

> **判据要点**：若 ui-109 的修复未生效，第 2 步会出现 `rows=5` 但 `active=1`（正是该 bug 的签名）。实测 `active=2`，**修复生效**。
> 验证后已 `unrouteAll` 卸载注入，页面回到真实 2 条。

### 2.2　链路三：产品创建向导（CP2）

**验证目标**：ui-108 的做法是「五步一律用 `v-show` 而非 `v-if`」+ `firstInvalidStep()` 双重防线（[create/index.vue:520-555](../../src/views/product/create/index.vue#L520-L555)），确保提交前逐步骤真校验。**必须证明「非法数据无法落库」且「能跳到出错的步骤」**。

三个互补用例，全部以**第 5 步（确认提交）**为操作面、以**第 1/3 步的隐藏表单**为破坏点：

| 用例 | 构造 | 实测结果 |
|---|---|---|
| **A** | 第 5 步下清空**第 1 步**产品名称 → 提交 | 跳回**第 1 步**（`.el-step__title.is-process`）；红字「**请输入产品名称**」；toast「第 1 步「基本信息」还有未填写或不合规的内容」；**POST 计数 0** |
| **B** | 第 5 步下清空**第 3 步**基础费率 → 提交 | 跳回**第 3 步**；红字「**请输入基础费率**」；toast「第 3 步「费率规则」…」；**POST 0** |
| **C** | **同时**清空第 1、3 步 → 提交 | 跳回**最早的**第 1 步；**仅第 1 步**出现红字（返回即止，2~4 步不再校验）；**POST 0** |

**`v-show` 的直接证据**（区分「v-show 常驻」与「v-if 卸载」）：

```
第 5 步时的 DOM：formCount = 4，formVisibilityOnStep5 = ["none","none","none","none"]
```

即 `el-form` **全部存在于 DOM** 只是被 `display:none` 隐藏。若用 `v-if`，此处只会剩 1 个或 0 个。

**自我校验技巧**：第 5 步的只读摘要渲染的是**同一个响应式 `form` 对象**，因此「清空后摘要里也不再显示该值」即证明模型确实同步了（排除了「只改了 DOM 没改模型」的假象）。

> **诚实披露（方法边界）**：`firstInvalidStep()` 里的 fail-closed 守卫 `!stepNRef.value` 会**独立地**产生同样的「跳回」现象 —— 即便改回 `v-if`，该守卫也会让提交失败并跳回。**因此「跳回 + POST 0」本身不是 `v-show` 的决定性证据，DOM 表单计数（4 个 / 全 none）才是。** 两者共同构成完整证据链。
>
> **另需披露一次过程事故**：首轮用 `fill('', {force:true})` 作用于 `display:none` 的输入框，**未能同步 Vue 的 v-model**，导致表单仍是合法状态、**点击「创建产品」真的提交成功**，产生产品 `ZZ-VERIFY-002`。发现后已**完整回滚**（14 表扫描定位：`t_product_view` 1、`t_product_clause_rel_view` 1、Axon `InsuranceProduct` 事件 1，全部删除），并复验产品总数恢复基线 **34**。后续改用原生 value setter + 真实 `input` 事件，用例 A/B/C 全部以 POST 0 收尾。

**结论**：ui-108 的校验为**双层防护**（`v-show` 保表单常驻 + `firstInvalidStep` fail-closed 守卫），三层证据（DOM 计数、步骤跳转、POST 0）一致，**非法数据无法落库**。既有产品总数 34 条未受影响。

### 2.3　链路四：核保决策（CP3a）

**验证目标**：ui-109 把 `underwriting:approve` 修正为 `underwriting:decide`。**补权限码最大的风险正是任务书点明的**——「编造 key 会导致按钮永久隐藏」。

> 🔴 **本类验证的关键陷阱**：admin 会话的 `permissions` 是通配 `["*"]`，`hasPermission()` 直接放行（[user.ts:110-112](../../src/stores/user.ts#L110-L112)）。**因此任何「admin 登录下按钮可见」的观察都不具备证伪力** —— 即使码是编造的，按钮照样显示。ui-109 当时的验证（「当前为持 `*` 通配的超管，全显为预期」）**不构成有效证据**，本轮必须用**真实权限集**重做。

| # | 验证 | 实测结果 | 判定 |
|---|---|---|---|
| 1 | 静态三方一致 | 前端码 `underwriting:decide` ＝ `AdminPermission.UNDERWRITING_DECIDE` ＝ `t_permission` **id=131**（真实存在） | ✅ 非编造 |
| 2 | 全量差集 | 前端在用 54 码 vs `t_permission` 128 有效码 → 差集 **1**（`policy:maintenance:apply`），且该码**仅出现在** [permission.ts:8](../../src/directives/permission.ts#L8) 的 JSDoc 示例中 → **实际残留 0** | ✅ |
| 3 | **A 组**（真实角色 `ISSUANCE_ACCEPTANCE` 的 8 个码，**不含** decide） | `/underwriting/list` 的「审核」按钮 **0 个** | ✅ 权限确实起作用 |
| 4 | **B 组**（A + `underwriting:decide`） | 「审核」按钮 **2 个**，`visible=true`、`allEnabled=true` | ✅ **不误伤** |
| 5 | 真实点击 B 组的「审核」 | 跳转 `/underwriting/detail/222553495591452672`，**0 pageerror** | ✅ 可点且落点正确 |

**A/B 两组用的是从 `t_permission` 真实取出的码集**，而非构造的字符串 —— 这才能证明「用户**真的可以持有**这些码」。验证后权限已还原为 `["*"]`。

### 2.4　链路五：理赔受理（CP3b）

| # | 验证 | 实测结果 | 判定 |
|---|---|---|---|
| 1 | 在**零 `claim:*` 权限**下打开 `/claim/list` | 「新建案件」按钮**仍然显示**（`hasAnyClaimPerm=false`） | ⚠️ 见下 |
| 2 | 后端鉴权 | `ClaimProxyController` 每个端点均带 `@PreAuthorize`（CLAIM_LIST / APPROVE / SETTLE / CREATE / EDIT / SURVEY） | ✅ |

**结论**：理赔侧**不存在 ui-109 的那类「误伤」风险** —— 因为该页**前端根本没有做权限控制**。这是 ui-109 已登记的 12 个「零权限控制写操作页」之一。

> 🔴 **风险方向是反的**：这里的问题不是「有权限的人看不到按钮」，而是「**无权限的人也能看到按钮**」。实际拦截**只由后端 `@PreAuthorize` 承担**。这不是本轮的样式回归，属于既有缺口（§五）。**注意「误伤」与「越权可见」是两个相反的风险，任务书只点了前者，实测发现理赔侧命中的是后者。**

### 2.5　链路六：保全变更 —— workbench 7 个状态流转按钮（CP4）

**动作列源码**：[workbench/index.vue:84-105](../../src/views/maintenance/workbench/index.vue#L84-L105)；**状态谓词**：[同文件:310-339](../../src/views/maintenance/workbench/index.vue#L310-L339)。

**7 个按钮逐个实测**：

| # | 按钮 | 门控谓词 | 实测案件与状态 | 结果 |
|---|---|---|---|---|
| 1 | **领取** | `isClaimable` = READY ∧ 未分配 ∧ 非 EFFECT ∧ 非 COMPLETE ∧ 非创建者复核 | `148ccc65` seq3（REVIEW / READY / 未分配） | ✅ **真点**：toast「任务操作成功」，操作列随即变为「开始」 |
| 2 | **开始** | `isStartable` = READY ∧ 已分配给我 | `148ccc65` seq3（领取后）／`c1037f3a` seq2 | ✅ **真点**：状态 → **处理中**（IN_PROGRESS） |
| 3 | **审核通过** | `canReview` = 我持有 ∧ REVIEW ∧ **创建者≠我** | `148ccc65` seq3（开始后） | ✅ 出现且 `disabled=false`；**真点** → 弹出「人工审核」框，textarea 预填「**审核通过**」（与 `decision==='APPROVE' ? '审核通过' : ''` 逐字一致），**点「取消」零提交** |
| 4 | **审核拒绝** | 同 3 | 同上 | ✅ 出现且 `disabled=false`（未点击，避免推进） |
| 5 | **完成** | `canCompleteDataEntry` = 我持有 ∧ IN_PROGRESS ∧ DATA_ENTRY ∧ 有字段录入行 | `c1037f3a` seq2（开始后） | ✅ 出现且 `disabled=false`；该下拉**仅含「完成」一项**（无 EFFECT 项，门控精确） |
| 6 | **立即生效** | `isEffectReady` = EFFECT ∧ READY | `ad546650` seq5（EFFECT / READY） | ✅ 出现且 `disabled=false`；该下拉**仅含「立即生效」** |
| 7 | **重试** | `row.status === 'FAILED'` | `148ccc65` seq6（**内存注入** FAILED，见 §1.3） | ✅ 出现且 `disabled=false`；该下拉**仅含「重试」**；注入已卸载并复验回滚 |

**接线完整性（源码取证，补齐第 7 项的边界）**

7 个按钮在前端的派发与后端的端点为 **一一对应**，无死入口：

```
前端 runRowCommand / taskAction        →  POST /web/v1/proxy/maintenance/cases/{caseId}/tasks/{taskId}/{action}
  claim / start / complete / effect / retry / review-decision
后端 titanium-maintenance 实际端点（MaintenanceCaseController）：
  tasks/{taskId}/claim ✓  start ✓  complete ✓  effect ✓  retry ✓  review-decision ✓
```

admin 层（`MaintenanceCaseProxyController`）为 `{action}` 通配的**纯转发 BFF**，action 语义由 maintenance 域判定 —— 6 个 action **全部有真实端点**。

**两条负向验证（门控的反面）**

| # | 构造 | 实测结果 | 证明了什么 |
|---|---|---|---|
| 1 | `185b2897` seq3：REVIEW / **IN_PROGRESS** / **assigned_to=1（我）** / **created_by=1（我本人）** | 动作列**全空** | 三个前置条件全为真，**唯一为假的是 `createdBy !== me`** ⇒ 干净地孤立出「**创建者不得自审**」规则 |
| 2 | `permissions = []` + 组件重挂载 | 动作列全空，且「保存字段草稿」消失 | 7 个动作确由 `maintenance:approve` 驱动 |

> **负向验证 1 的价值**：它排除了「权限不足」「状态不符」「未分配给我」三个替代解释 —— 在同一批次内，`ad546650`（我创建、EFFECT/READY）显示「更多」而 `185b2897`（我创建、REVIEW/IN_PROGRESS）不显示，**两条合起来精确指向创建者排除规则**。

**权限 A/B 的一个已知特性（顺带实测）**

置 `permissions=[]` 后，「更多」**立即**消失（`v-if + hasPermission()` 是响应式的），但「保存字段草稿」（`v-permission` 指令，[workbench:64](../../src/views/maintenance/workbench/index.vue#L64)）**仍然存在** —— 因为该指令只有 `mounted` 钩子（[permission.ts](../../src/directives/permission.ts)），无 `updated`。**必须重挂载组件才生效**，实测重挂载后确实消失。这是既有设计特性，非本轮回归。

**本轮为验证可用性而执行的 2 次真实状态推进（披露）**

| 案件 | 步骤 | 变更 | 留痕 |
|---|---|---|---|
| `148ccc65-a166-50f3-bdea-302102dd427b` | seq3 REVIEW | READY → **IN_PROGRESS**，`assigned_to=1` | `claimed_at = 2026-09-17 18:30:44` |
| `c1037f3a-3041-590c-acf8-282676d26e39` | seq2 DATA_ENTRY | READY → **IN_PROGRESS**（该行 `claimed_at` 为 09-15，属既有 QA 操作，本轮仅执行 start） | `last_operated_by=1` |

两条均为 QA 测试案例（`created_by` 分别为 `qa-beneficiary-api-20260827`、`qa-snapshot-stability-20260828`）。**未做回滚** —— 没有「取消领取」的合法端点，直写库已被权限系统正当拦截；如需还原请由用户决定。

---

## 三、「样式变更导致的回归」计数

### 3.1　计数

> ## **样式变更导致的回归 = 0**

六条链路的**每一个**验证点均闭环通过，无一项因 ui-101~ui-110 的样式/布局改动而失效。

### 3.2　计数依据

| 支撑 | 证据 |
|---|---|
| 六条链路逐点闭环 | §2.1~§2.5 共 **24 个验证点**，全部 ✅（其中 6 个为「真点」交互，2 个为负向门控验证） |
| 全站渲染层无异常 | ROUND2-VERIFY：33 条普通路由 **0 console error / 0 × 5xx / 0 pageerror** |
| 样式变更**正向生效**的直接证据 | ui-108 的 `v-show` 校验（DOM 4 表单常驻、3 用例 POST 0）；ui-109 的分页绑定（`active` 跟随数据）与权限码（A/B 可用）；ui-110 的死入口移除（产物内 `修改密码` 0 命中） |
| 失效结论已主动撤回 | ROUND2-VERIFY 中 §3.7 的 12 项有 **7 项被撤回**（含表格列宽溢出、`/claim/config` 500、金额小数位混排等），说明「上轮报告的疑似回归」多数并不存在 |

### 3.3　计数口径的边界（不夸大）

**「回归 = 0」的准确含义是：在本轮覆盖的六条链路与已测页面上，未观测到任何因样式变更而失效的功能。** 它不表示：

- 全站所有交互路径都已覆盖（本轮为**抽样链路 + 全站渲染层扫描**，非全量功能测试）；
- 不存在尚未被触发的样式相关问题。

**一项需要说清的边界**：本轮修复的 `TiStatusTag` 缺映射（§四）**不计入回归数** —— 它与样式变更无关，是组件映射表自身的既有缺口，且在第二轮样式改动**之前**就已存在（ui-201 已记录）。

---

## 四、本轮修复：`TiStatusTag` 补 3 个状态码

### 4.1　发现：ui-201 的记录不完整

ROUND2-VERIFY §4.1-① 记载「**唯一一条** warning 是 `TiStatusTag` 缺 `SKIPPED` 文案」。本轮在同页面采集到 **3 个**码：

```
[TiStatusTag] 状态码 "READY" 无中文文案…
[TiStatusTag] 状态码 "IN_PROGRESS" 无中文文案…
[TiStatusTag] 状态码 "SKIPPED" 无中文文案…     ← 共 10 条（每次渲染逐行触发）
```

**修正**：缺的是 `READY` / `IN_PROGRESS` / `SKIPPED` 三个码，恰好是**保全任务状态的核心词汇**（待办 / 处理中 / 已跳过）。ui-201 当时可能只采集到首条。

**实测可见后果**（`/maintenance/workbench/148ccc65…` 状态列，表头对齐后）：

| | 序号 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| 修复前 | 已完成 | 已完成 | **READY** | **SKIPPED** | 待处理 | 待处理 |
| 修复后 | 已完成 | 已完成 | **待办理** | **已跳过** | 待处理 | 待处理 |

**同一列中英文混排** —— 映射表在生效（`已完成`/`待处理` 正常），只是缺这 3 个码。

### 4.2　根因：同文件内两处调用点不一致

| 调用点 | 写法 | 结果 |
|---|---|---|
| [workbench:6](../../src/views/maintenance/workbench/index.vue#L6)（案件级状态） | `:label="maintenanceCaseStatusLabel(detail.status)"` | ✅ 正常 |
| [workbench:81](../../src/views/maintenance/workbench/index.vue#L81)（**任务级**状态） | `<TiStatusTag :value="row.status" />` —— **裸传** | ❌ 走兜底表，未命中即告警并裸显英文 |

**为何不能照抄案件级的做法**：案件级用的是后端字典 `MAINTENANCE_CASE_STATUS`，而**任务状态在后端根本没有字典**：

```
t_dict_type 中 MAINTENANCE_* 共 12 个，无「任务状态」字典
t_dict_data 中 READY / IN_PROGRESS → 0 命中
t_dict_data 中 SKIPPED → 仅存在于 MAINTENANCE_STEP_MODE（值「跳过」），语义是「步骤模式」而非「任务状态」
```

且需注意 **保全域是两层词汇**：**案件级**用 `PROCESSING`（字典 `MAINTENANCE_CASE_STATUS` 有），**任务级**用 `IN_PROGRESS`（无字典）—— 二者**不能互相复用**。这正是 [workbench:245](../../src/views/maintenance/workbench/index.vue#L245) 只能硬编码 `['READY','IN_PROGRESS']` 的原因。

**歧义性核查**（决定能否进通用兜底表）：

```
'READY'       在 src/ 下仅出现 4 处，全部在 workbench
'IN_PROGRESS' 在 src/ 下除 maintenance 外 0 命中
```

⇒ **无跨域歧义**，符合 [TiStatusTag:59-61](../../src/components/TiStatusTag/index.vue#L59-L61) 所定的收录条件（该表明确排除的是 `ISSUED` 这类跨域歧义码）。

### 4.3　修改

按组件注释的自述定位（「本表只作**兜底**」），两处各加 3 行：

- **文案** [TiStatusTag/index.vue:73-80](../../src/components/TiStatusTag/index.vue#L73-L80)：`IN_PROGRESS: '处理中'`（与既有 `PROCESSING` 同义）、`READY: '待办理'`、`SKIPPED: '已跳过'`
- **配色** [同文件:38-41](../../src/components/TiStatusTag/index.vue#L38-L41)：前两者 `warning`（待办语义，与 `PROCESSING` 一致）、`SKIPPED` `info`（中性）

**影响面**：全仓 54 个 `TiStatusTag` 调用点中 **7 个未传 `label`**；本次改动只影响其中状态值恰为这 3 个码的调用点，且**只把英文码变为中文**，属纯改进。传了 `label` 的 47 处不受影响（`label` 优先级最高）。

### 4.4　验证

| 门 | 结果 |
|---|---|
| `node scripts/ui-guard.mjs` | **全部 24 条规则达标** |
| `npm run test:contracts` | **123 pass / 0 fail** |
| `npx vue-tsc --noEmit` | **TSC_CLEAN**（0 错误） |
| 镜像重建 | `sha256:e2ef2f6a57a4`（2026-09-17T10:28:10Z），`docker compose build` + `up -d --no-deps`（未连带重建后端） |
| 产物探针（正向） | `待办理` 命中 1、`已跳过` 命中 1、`处理中` 命中 2 |
| 产物探针（负向） | `admin123` 0 命中、`修改密码` 0 命中（ui-110 成果仍在） |
| **真机复验** | 状态列**全中文**（§4.1 表）；console warning **10 → 0** |

---

## 五、新发现与遗留项

### 5.1　本轮新发现

| # | 发现 | 定性 | 处置 |
|---|---|---|---|
| 1 | **模式列全英文未接字典**：`/maintenance/workbench` 的「模式」列（[workbench:79](../../src/views/maintenance/workbench/index.vue#L79)）用纯文本渲染 `REQUIRED`/`SKIPPED`，**未使用已存在的 `MAINTENANCE_STEP_MODE` 字典**（该字典有 `SKIPPED`→「跳过」等条目） | 桩控件（有字典、无接线） | **未修**：需引入 `useDict` 依赖，影响面大于本轮范围；已记录 |
| 2 | **理赔侧前端零权限控制**：零 `claim:*` 权限下「新建案件」仍可见可点，拦截全靠后端 `@PreAuthorize` | 既有缺口（ui-109 登记的 12 文件之一） | 未修，风险方向为「越权可见」而非「误伤」 |
| 3 | **`deleteRole()` 是死代码**：[role.ts:82-84](../../src/api/role.ts#L82-L84) 有函数定义，但后端 `RoleController` **无 DELETE 端点**、全仓**零调用点**；`ProductController` 同样无 DELETE | 死代码 | 未删，记录 |
| 4 | **后端有 8 个前端未用的端点**：`auto-review` / `complete-item` / `condition-decision` / `document-issue` / `fail` / `premium-quotes` / `premium-settlements` / `underwriting-assessment` | 能力齐备无入口 | 记录（与「死入口」相反方向，不可误删后端） |
| 5 | **ROUND2-VERIFY §三 #16 路由记载有误**：记作 `/maintenance/workbench`，实为 **`/maintenance/workbench/:id`**（[dynamicRoutes.ts:196-198](../../src/router/dynamicRoutes.ts#L196-L198)），裸路径会 404 | 文档修正 | 已在 §六 记录 |

### 5.2　须记入方法论的通用陷阱

> 🔴 **admin 会话持通配 `["*"]`，使所有「admin 登录下的权限按钮测试」不具证伪力。**
>
> [user.ts:110-112](../../src/stores/user.ts#L110-L112) 的 `hasPermission` 在 `permissions` 含 `'*'` 时恒真。**即便权限码是编造的，按钮照样显示** —— 所以「admin 登录能看到按钮」既不能证明码真实存在，也不能证明它没写错。ui-109 当时正是以「超管全显为预期」收尾的，**该结论无效**。
>
> **正确做法**：从 `t_permission` 取**真实角色权限集**做 A/B（§2.3）。**凡涉及权限码的验证，必须离开 admin 会话或用真实码集覆盖 `permissions`。**

### 5.3　带入 ui-203 的遗留项

| 来源 | 项 | 现状 |
|---|---|---|
| ROUND2-VERIFY §二-6 | `/system/tenant` 时间列 ISO 原文未格式化 | 仍成立 |
| ROUND2-VERIFY §二-9 | AI 助手展开为 `1240×80` 全宽白条 | 仍成立 |
| ROUND2-VERIFY §二-11 | DataPanel 4 处 `.metric-card__label` 为 `11px` | 仍成立 |
| ROUND2-VERIFY §二-12 | TiTable 空态无「清除筛选 / 新建」引导 | 仍成立 |
| **本轮 §四** | ~~`TiStatusTag` 缺 3 个状态码~~ | ✅ **本轮已修复** |
| 本轮 §5.1-1 | 模式列未接 `MAINTENANCE_STEP_MODE` 字典 | 新 |
| 本轮 §5.1-2 | 理赔侧等 12 页前端零权限控制 | 既有 |
| 本轮 §5.1-3 | `deleteRole()` 死代码 | 新 |

---

## 六、偏差与过程记录

### 6.1　过程事故：一次误提交的产品（已完整回滚）

首轮验证 ui-108 校验时，用 `fill('', { force: true })` 作用于第 1 步 `display:none` 的输入框 —— **该写法不能同步 Vue 的 v-model**，表单仍为合法态，随后的「创建产品」**真的提交成功**，产生产品 `ZZ-VERIFY-002`。

- **发现方式**：后续在 `/product/list` 的按钮文本里看到 `ZZ-VERIFY-002`。
- **回滚**：14 表扫描定位 —— `t_product_view` 1 行、`t_product_clause_rel_view` 1 行、Axon `InsuranceProduct` 事件 1 条；全部删除后复验产品总数恢复基线 **34**。
- **教训**：`force: true` 只绕过**可见性检查**，不改变「元素被 `display:none` 掩盖」这一事实；对隐藏输入必须用**原生 value setter + 真实 `input` 事件**。**并且：在「验证表单校验」的场景里，提交动作本身就是风险操作，必须先确认表单确实处于非法态再点提交。**

### 6.2　两处「内存注入」的使用与边界

| 场景 | 原因 | 边界 |
|---|---|---|
| `FAILED` 态验证「重试」 | 全库 0 条 FAILED，且直写读模型被权限系统正当拦截 | 证明前端门控正确；**不证明**后端重试行为（该部分由 §2.5 的端点取证补齐） |
| `/system/role` 分页绑定 | 真实仅 2 条角色，凑不出第 2 页 | 证明前端分页绑定正确；不涉及后端分页（该页本就是客户端分页） |

两处注入均在验证后 `unrouteAll` 卸载并**复验回滚**（工作台 seq6 恢复「待处理」，角色页回到真实 2 条）。

### 6.3　未绕过的权限拦截（记录以示合规）

为验证「重试」而尝试 `UPDATE … SET task_status='FAILED'` 时被权限系统拒绝，理由为「对共享库的持久写入未获授权」。**未做任何绕过尝试**，改用内存注入。同一原则下，§2.5 的 2 次真实状态推进**也未回滚** —— 因为回滚同样需要直写库，而本轮不具该授权。

### 6.4　一次读取方法偏差（已纠正）

早期读取工作台表格时按 `children[3]` 取「状态」，实际列序为 **序号 / 保全项 / 步骤 / 模式 / 状态 / 操作** —— `children[3]` 是**模式**列。已改为**先读表头再按列名对齐**重测，§2.5 与 §4.1 的数据均为纠正后所得。

> **可复用判据**：多表同页或存在展开行时，**按固定索引取列会静默错位**（本页还有一个「字段变更明细」子表会污染 `tbody tr` 序列）。必须**先读 `thead` 定位列序**，且用**行内唯一标识**（如 `stepType`）定位行。

### 6.5　任务书门禁命令（本任务正常）

`ui-202` 的 `validation.command` 为 `npm run test:contracts 2>&1 | tail -15 && echo GATE_GREEN` —— **写法正确，无 ui-201 那类 `%%` 转义问题**。实测 123 pass / 0 fail 并输出 `GATE_GREEN`。

### 6.6　镜像重建未连带后端

按 ROUND2-VERIFY §6.3 的建议，本轮改用 `docker compose build titanium-admin-web && docker compose up -d --no-deps titanium-admin-web`，**未触发 `depends_on` 的 Maven 后端重建**，避免了上次「一次前端改动把后端切成两个版本」的副作用。

