# 操作按钮配色契约（COLOR-CONTRACT）

> 出自 ui-107。**后续所有新增/修改的操作按钮一律按本文选色**，不要再就单个页面「看起来顺眼」临时决定。
> 契约的机械执行版在 `scripts/ui-guard.mjs` 里**没有**对应规则（语义色无法机械判定），
> 故本文是唯一真源；新增按钮时人工对照。

---

## 一、适用范围（先划清，再谈颜色）

| 场景 | 是否受本契约约束 | 说明 |
|---|---|---|
| `class-name="ti-action-column"` 列内的行内操作按钮 | ✅ 是 | 契约主体 |
| 详情页 `TiDetailHeader` 的 `#actions` | ✅ 是（按动词） | 页面级，见 §四 |
| 列表页工具条（`.ti-toolbar`）的主按钮 | ✅ 是（按动词） | 「新建 X」应为 `primary` |
| 表单页/Dialog footer 的主提交按钮 | ⚠️ **否** | 一律 `primary`，与动词无关——一个表单只有一个主操作，它就是 primary |
| 「更多」下拉里的 `el-dropdown-item` | ✅ 是（**只标破坏性**） | 见 §三 |
| `el-alert` / `el-tag` / 状态标签 | ⚠️ 否 | 那表达的是**数据状态**，不是动作。状态色由 `TiStatusTag` 统一负责 |

---

## 二、动词 → 配色（四桶）

| 桶 | 动词（同义词一并归入） | `type` | 理由 |
|---|---|---|---|
| **① 收回 / 破坏** | 停用、禁用、下架、退役、作废、删除、移除、撤销、终止、中止、驳回、拒绝、取消 | `danger` | 动作使既有权益/数据失效或倒退 |
| **② 推进 / 建设** | 启用、激活、发布、通过、审批通过、恢复、上架、完成、满期给付 | `success` | 动作使对象获得某种可用资格 |
| **③ 流转 / 受理** | 审批、审核、提交、提交审批、确认、登记结算、人工对账 | `primary` | 动作推动对象进入下一环节 |
| **④ 中性导航** | 查看、详情、明细、编辑、配置、维护、领取、生命周期、工作台 | **不写 `type`**（EP 默认灰） | 只读取内容或进入编辑态，不改变业务状态 |

**唯一的例外桶**：`warning`（橙）——只允许用于**「可逆但需注意」的纠正性动作**，当前全站仅 1 例：佣金「发起回拨」（`billing/commission-payables`，财务冲正）。
🔴 **禁止把 `warning` 用在**：停用（归 ①）、中性配置入口（如「分配权限」，归 ④）。这两类在本次收敛中各修正了 1 处。

### 形态（link / 平铺）不在契约内

「文字按钮」与「带边框按钮」是**页面级家族选择**，不是配色问题。**实测全站 0 个页面在同一操作列内混用两种形态**，故不作约束：新页面跟随所在页既有形态即可。

> 数据（本次实读）：`详情` link 2 / 平铺 11、`查看` link 7 / 平铺 2、`删除` link 10 / 平铺 4 —— 分布在**不同页面**上，页内自洽。

---

## 三、「更多」下拉：只给破坏性动作上色

`el-dropdown-item` **没有 `type` 属性**（props 只有 `command` / `disabled` / `divided` / `icon`），所以下拉项默认一个都着不了色。而全站恰恰把最不可逆的动作放进了下拉。

**规则：只有 ① 桶（破坏性）的下拉项着色，②③④ 桶保持默认。**
这与仓库既有的确认框判据**同源**（`claim/config/ConfigPanel.vue` 的 `ExtraAction.destructive`：只给危险动作标红，理由是「把红色用在非危险动作上，等于训练用户忽略红色」；反过来，危险动作不上红同样是失真）。

用法：

```html
<!-- 静态文案 -->
<el-dropdown-item command="deactivate" class="ti-dropdown-item--danger">下架</el-dropdown-item>

<!-- 动态文案（文案来自数组时，destructive 必须与 label 分开声明，不从文案猜） -->
<el-dropdown-item :class="{ 'ti-dropdown-item--danger': action.destructive }">{{ action.label }}</el-dropdown-item>
```

样式定义在 `src/assets/styles/index.scss`（**全局类，非 scoped**——下拉菜单被 teleport 到 body，页面作用域样式够不着）：
特异性 (0,2,0) 与 (0,4,0)，分别压过 EP 的 `.el-dropdown-menu__item`(0,1,0) 与 `.el-dropdown-menu__item:not(.is-disabled):hover`(0,3,0)，**不依赖产物字节序**。

### `destructive` 的判据

> **执行后既有数据/权益状态不可恢复。**

- 「驳回」「退役」「中止保单」「退保/终止」「撤销保单」「下架」→ 是
- 「退回草稿」→ **否**（虽然后退，但可重新提交）
- 「恢复保单」「审核通过」「发布」→ 否

---

## 四、几个刻意的非对称（容易被误读为不一致）

1. **同一个「编辑」，在行内是灰的、在详情页头部是 primary 的。**
   行内「编辑」是并列动作之一（④ 桶）；详情页头部的「编辑」是**该页唯一的主操作**（页面级 CTA，按上表 §一「表单页/Dialog footer」一栏处理）。
   判据不是动词，是**该按钮在当下是不是唯一的主操作**。
2. **`product/list` 的「提交审核」在下拉里是黑的。**
   它是 ③ 桶（本该 primary），但下拉项只标破坏性（§三），故不着色。这是**规则的结果，不是遗漏**。
3. **`maintenance/workbench` 的「领取」灰、「开始」primary。**
   两者互斥（同一行只会出现一个），不构成同屏对比；「开始」标记任务已推进到可执行态。

---

## 五、本次收敛清单（ui-107）

### 5.1 误色修正（5 处）

| 位置 | 动词 | 前 | 后 | 依据 |
|---|---|---|---|---|
| `rule-engine/list/index.vue:23` | 停用 | `link type="warning"` | `link type="danger"` | 全站其它停用/退役/下架均为 danger |
| `system/role/index.vue:39` | 分配权限 | `type="warning"` | 去掉 `type` | 中性配置入口套了警示色 |
| `policy/application/index.vue:77` | 详情 | `link type="primary"` | `link` | ④ 桶 |
| `policy/intention/index.vue:86` | 详情 | `link type="primary"` | `link` | ④ 桶 |
| `product/rate-tables/index.vue:41` | 明细 | `link type="primary"` | `link` | ④ 桶 |

### 5.2 审批入口统一（6 处 → `primary`）

`channel/commission-schemes:59`、`product/actuarial-workbench:62/92/123/154`、`product/pricing-plans:47`
—— 全部为 `link` → `link type="primary"`。

依据是同制度已有先例 `regulatory/list`：`查看(默认) / 提交(primary) / 通过(success) / 驳回(danger)` ——
同一行四个动作四种颜色、各表一义。收敛后 commission-schemes 的行为 `查看(默认) / 审批(primary) / 发布(success) / 退役(danger)`，结构完全对齐。

### 5.3 下拉项破坏性着色（9 处）

| 文件 | 动作 |
|---|---|
| `product/list/index.vue:157,164` | 驳回、下架 |
| `clause/list/index.vue:101,114` | 驳回、停用 |
| `policy/detail/index.vue:18,24,27` | 中止保单、退保/终止、撤销保单 |
| `maintenance/workbench/index.vue:94` | 审核拒绝 |
| `maintenance/configuration/index.vue:44` | 动态绑定 `action.destructive`（驳回、退役） |

新增：`src/assets/styles/index.scss` 的 `.ti-dropdown-item--danger`；`maintenance/configuration` 的动作表加 `destructive?: boolean`。

---

## 六、收敛前后数据

判定口径：**同一动词在行内操作列里是否出现 >1 种颜色**（忽略 link/平铺形态）。脚本 `/tmp/s05-verify.mjs`（一次性普查，非仓库产物），数据源为全站 `src/views` 的 287 个 `el-button`，其中行内操作按钮 98 个。

| 动词 | 收敛前 | 收敛后 |
|---|---|---|
| 停用 | `danger` × 1 ／ **`warning+link` × 1** | `danger` × 2（仅形态不同） |
| 审批 | **`primary+link` × 6 ／ `默认+link` 家族=0**（原为 6 处无色 vs `primary` 平铺 2 处） | `primary+link` × 6 |
| 详情 | `默认` × 11 ／ **`primary+link` × 2** | `默认` 家族 × 13 |
| 明细 | **`primary+link` × 1**（同族唯一） | `默认+link` × 1 |
| 分配权限 | **`warning` × 1** | `默认` × 1 |
| 提交 | `primary` 全站一致 | 不变（无分裂，见 §七） |

**结果：存在多色分裂的动词 0 个。**

---

## 七、与任务书的偏差（如实记录）

1. **任务书 CP1 列的三处「提交」分裂，两处已不存在。**
   原文称「提交 —— primary（clause/list:70）vs warning（product/list:127）vs 默认（commission-schemes:53）」。
   实读：`product/list` 的「提交审核」已被 **ui-102** 收进「更多」下拉（现 :154，不再有 `type="warning"`）；
   `commission-schemes` 现无「提交」按钮（只有审批/发布/退役）。现存的「提交」仅 `clause/list:73`（提交审批）与 `regulatory/list:72`（提交），**两者都是 primary**。
   ⇒ ③ 桶本次**无需改动**，任务书的分裂描述对当前代码已失效。
2. **任务书引用的行号普遍漂移**：`channel/list:72→:73`、`system/tenant:56→:58`、`underwriting/list:58→:61`、`actuarial-workbench:50→:62/92/123/154`（**1 处实为 4 处**）、`policy/application:74→:77`、`policy/intention:83→:86`。档位事实无误，行号须以实读为准。
3. **`claim/config/ConfigPanel:28` 不是「审批」按钮。** 那是 `:type="action.type"` 的**通用扩展动作渲染位**，而 `extraActions` 在全仓**无任何调用方传入**（该 prop 只有 ConfigPanel 自己声明），故 `visibleActions()` 恒为空数组 ⇒ 这个渲染位实际是死代码。任务书把它当成一处「审批=默认」的分裂点，前提不成立。
4. **范围外扩展（已做）**：任务书只讲四组动词的**颜色分裂**，未提下拉项。但下拉项**零着色**是同一问题的另一种形态——同一个「退役」在操作列是红字、在「更多」里是黑字，语义相反。故一并处理（§三、§5.3）。不做的代价是：契约文档会在第一页就被 `policy/detail` 的「退保/终止」推翻。
5. **本任务的门禁 `--rule=S-03` 与交付物无关。** S-03 量的是「操作列**宽度**取值 ≤5 档」（ui-102 已收敛，故门禁一跑即绿），守卫里**根本没有状态语义色的规则**（规则表见 `scripts/ui-guard.mjs`：D-01~D-12、S-01/S-01b/S-01c/S-02/S-03/S-04/S-06/S-07/S-08/S-09/S-12，无 S-05）。
   ⇒ 门禁对本任务是**空转**的，完成判据只能是本文 + 真机复量。
   这是 `ROUND2-BASE.md` §三已登记的两套 S-0x 编号同形不同义问题的具体后果（标题写 S-05、门禁写 S-03）。

---

## 八、已知未改动项（不是遗漏，是判断）

| 项 | 现状 | 为什么不改 |
|---|---|---|
| `document/list:59` 「下载」 | `primary` | 「下载/导出」不在四桶内。该行只有「详情 + 下载」两个动作，下载是唯一有副作用的，primary 尚可辨 |
| `system/user` 「重置密码」 | 默认灰 | 与并列的「编辑」同桶（④）；真正的危险（改密码）在弹窗里，弹窗确认按钮已按 destructive 处理 |
| `billing/commission-payables` 「发起回拨」 | `warning+link` | **唯一允许的 warning**：财务冲正，可逆但需注意，既非 danger 也非 success |
| 「更多」下拉里的 ②③ 桶动作（发布/通过等） | 不着色 | §三规则：下拉项只标破坏性 |
| `el-alert` 宽色横幅、`TiStatusTag` | — | 表达数据状态而非动作，不在契约内 |

---

## 九、`el-tag` 分类标记的用色（🔴 R9-F03 / R10-05 新增）

§一 把 `el-tag` 划在契约外（「表达数据状态而非动作，状态色由 `TiStatusTag` 负责」），但 `el-tag` 还承担第三种用途——**静态分类标记**（主条款/附加条款、目录/菜单/按钮、差异类型），§一~§八 均未覆盖，R9 走查正是在这里抓到误用。

**规则**：分类标记**不得**使用为一个动作桶保留的颜色。

| 色 | 保留给 | 分类标记可否使用 |
|---|---|---|
| `danger` | ① 收回/破坏桶（停用、下架、退役、删除、移除…） | 🔴 **否**。标「主条款」会让用户读作「这里是危险项」 |
| `warning` | 全站唯一的「可逆但需注意」纠正性动作（佣金发起回拨，见 §八） | 🔴 **否**，除非确为「需注意」语义（如试算告警） |
| `success` | ② 推进/建设桶 | ⚠️ 仅当该分类的语义就是「成功/通过」的正端 |
| `primary` | ③ 流转/受理桶 | ✅ 用作**主要/主**的一档（先例：金额通道、菜单「菜单」） |
| `info` | ④ 中性导航（不着色）的灰蓝同族 | ✅ 用作**次级/次要**的一档 |

**本轮修正（3 处）**：`product/detail` 与 `product/revise` 的「主条款」（`danger` → `primary`）；`product/detail` 与 `clause/detail` 的「附加」（`warning` → `info`，与同页「附加条款」对齐）。

**已核实的允许清单**（共 10 个文件 / 14 处，逐条依据见 `tests/semantic-color-contracts.test.mjs` 的 `ALLOWED`）：其中唯一的**取舍而非定论**是 `system/menu` 的「按钮」借用了 `warning`——菜单类型三档需要三种可区分色，而 EP 语义色板里除 `info`/`primary` 外没有中性第三档。若将来引入中性分类色（如 `ti-tag--category`），应改用它。

**守卫**：`tests/semantic-color-contracts.test.mjs` —— 语义色 `el-tag` 一律**登记制**（未登记即失败、处数逐处核对、登记项死亡即失败）。不写成「禁止 `el-tag` 出现语义色」是因为本仓确有 4 类合法用例，一刀切会立刻产生豁免，规则随即空转。

