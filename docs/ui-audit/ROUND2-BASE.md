# ROUND2-BASE — 第二轮底盘（D 系列）验收报告

> 验收日期：2026-09-17　　对应任务：`ui-012`
> 上游契约：[UI-REVIEW.md](./UI-REVIEW.md) §5.1「第一阶段：底盘（D 系列）」
> 守卫实现：[scripts/ui-guard.mjs](../../scripts/ui-guard.mjs)　目标值：[scripts/ui-guard.config.json](../../scripts/ui-guard.config.json)
>
> **结论：D 系列 11 条守卫规则全部达标，底盘可交付，S 系列具备开工前提。**

---

## 一、验收结论（四道门）

| # | 门 | 命令 | 结果 |
|---|---|---|---|
| 1 | 守卫逐条 | `for r in D-01…D-12; do node scripts/ui-guard.mjs --rule=$r; done` | **11/11 PASS** |
| 2 | 契约测试 | `npm run test:contracts` | **116 pass / 0 fail**（duration 627ms） |
| 3 | 类型与构建 | `npx vue-tsc --noEmit` → `npm run build` | TSC **0 错误**；vite `✓ built in 6.96s`，退出码 0 |
| 4 | 本报告 | 落盘 `docs/ui-audit/ROUND2-BASE.md` | 完成 |
| — | 守卫全量 | `node scripts/ui-guard.mjs`（无参数） | **14/24 达标**（基线 3/24） |

任务书 `validation.command` 原样执行，末行输出 `GATE_GREEN`，退出码 0。

**产物体积**（`dist/assets/`，本轮实测）：

| 产物 | 原始 | gzip |
|---|---:|---:|
| `element-plus-*.js` | 1074.09 kB | 338.04 kB |
| `echarts-*.js` | 1036.31 kB | 342.73 kB |
| `vue-vendor-*.js` | 110.49 kB | 43.03 kB |
| `index-BuIwxcM7.js` | 93.97 kB | 35.11 kB |
| `index-DpM90E90.js` | 47.66 kB | 10.68 kB |
| `index-BJTXINII.js` | 29.39 kB | 8.16 kB |
| `index-DDg4Rc7w.js` | 24.73 kB | 6.71 kB |
| `index-kOstiJZ5.js` | 23.40 kB | 7.24 kB |

两个 >500 kB 的 chunk（`element-plus` / `echarts`）均为**第三方库本体**，非本轮令牌补齐所致；本轮新增的界面代码分布在 5 个 `index-*.js` 里，合计 219 kB。**未因 D 系列改动显著膨胀**。

---

## 二、D-01 ~ D-12 逐条落点

守卫只在**未达标**时打印细节，故下列「实测」列取自 `node scripts/ui-guard.mjs --json`。

| ID | 目标（契约摘要） | 落点（file:line） | 实测 | 目标 | 判定 |
|---|---|---|---:|---|---|
| **D-01** | EP 主题派生变量 10 个完整覆盖 | [src/assets/styles/index.scss:274](../../src/assets/styles/index.scss#L274) `:root:root`，变量体在 :276–296 | 10 | =10 | ✅ |
| **D-02** | 设计令牌 ≥ 55 | [src/assets/styles/variables.scss](../../src/assets/styles/variables.scss)（间距/字重/文本色阶/断点补全） | 76 | ≥55 | ✅ |
| **D-03** | 幻影令牌清零 | 全仓 `var(--ti-` 0 处（基线 10 处引用，全部指向不存在定义的 `--ti-text-secondary`） | 0 | ≤0 | ✅ |
| **D-04** | 硬编码色值清零 | [variables.scss:43-63](../../src/assets/styles/variables.scss#L43-L63) 承接全部语义色定义；`.vue`/`.scss` 内 0 处，`.ts` 内亦 0 处 | 0 | ≤0 | ✅ |
| **D-05** | 裸 `<style scoped>` 补 `lang="scss"` | 46 个 `<style scoped lang="scss">`，裸形态 0 个 | 0 | ≤0 | ✅ |
| **D-06** | TiTable 能力增强 | [TiTable/index.vue:4-46](../../src/components/TiTable/index.vue#L4-L46)（toolbar :6 / error :23 / empty :44）；props 声明 :97-129（`stripe` :97,123、`border` :99,124、`height` :101,125、`maxHeight` :103,126、`showRefresh` :105,127、`error` :113,129） | 8 | =8 | ✅ |
| **D-07** | useTable 错误状态契约 | [useTable.ts:45](../../src/composables/useTable.ts#L45) `tableError`、:74 成功路径清错、:86-90 `catch` + 归一化、:100/:141 `retry` 导出、:17-19 `normalizeError` | 4 | =4 | ✅ |
| **D-08** | 全局 `:focus-visible` | [index.scss:67](../../src/assets/styles/index.scss#L67)（`:where(…)` 兜底，特异性 0）+ [:88-90](../../src/assets/styles/index.scss#L88-L90)（表格行/菜单项/下拉项） | 4 | ≥1 | ✅ |
| **D-09** | 危险确认按钮 danger 色 | 15 处 `confirmButtonClass: 'el-button--danger'`（如 [product/list/index.vue:259](../../src/views/product/list/index.vue#L259)） | 15 | ≥15 | ✅ |
| **D-10** | 取消弹窗不产生未捕获 rejection | [src/utils/globalError.ts:53](../../src/utils/globalError.ts#L53) 注册 `unhandledrejection` 兜底（:41 注释说明覆盖范围） | — | 真机 | ✅ |
| **D-11** | 圆角 6/8 双档 + 断点收敛 ≤2 档 | 圆角 [index.scss:293](../../src/assets/styles/index.scss#L293) `--el-border-radius-base: #{$radius-md}`；断点 [variables.scss:134-135](../../src/assets/styles/variables.scss#L134-L135) `$breakpoint-mobile: 767px` / `$breakpoint-narrow: 900px` | 2 档（18 处断点） | ≤2 | ✅ |
| **D-12** | i18n 移除 | `package.json` 无 `vue-i18n`；`src/main.ts:27` 不再装运行时；原 `src/i18n/` 目录**不存在**；4 处 `vue-i18n` 字样**全部是解释移除的注释**（[main.ts:27](../../src/main.ts#L27)、[useDict.ts:21](../../src/composables/useDict.ts#L21)、[Topbar.vue:102](../../src/layouts/components/Topbar.vue#L102)、[login/index.vue:123](../../src/views/login/index.vue#L123)） | 0 | ≤0 | ✅ |

> **D-10 无守卫规则**：它的验收对象是「点取消后浏览器控制台无 unhandled rejection」，属运行期行为，静态脚本量不了。守卫 24 条里因此没有 D-10 —— 这不是遗漏，是口径差异，已在 §四 R-7 记录。

---

## 三、守卫前后对比：3/24 → 14/24

基线数据取自 [UI-REVIEW.md:583-610](./UI-REVIEW.md#L583-L610)（2026-09-17 首轮实测）。

> 下表的「现状」列是 **D 系列收官时（2026-09-17）的快照**，S 系列任务会逐条把它翻绿（`ui-101` 已把 S-02 从 4 推到 0）。**最新进度一律以 `node scripts/ui-guard.mjs` 无参全量实跑为准，不回填本表** —— 否则这份「底盘验收报告」会变成一份每次都得同步的活文档，而它记录的是「底盘交付那一刻底盘把 S 系列推到了哪里」。

| 规则 | 基线 | 现状 | 目标 | 判定变化 | 说明 |
|---|---:|---:|---|---|---|
| D-01 | 2 | **10** | =10 | FAIL → ✅ | EP 派生变量 2/10 → 10/10 |
| D-02 | 29 | **76** | ≥55 | FAIL → ✅ | 令牌 29 → 76 |
| D-03 | 10 | **0** | ≤0 | FAIL → ✅ | 幻影令牌清零 |
| D-04 | 90 | **0** | ≤0 | FAIL → ✅ | 硬编码色值 9 种 90 处 → 0 |
| D-05 | 14 | **0** | ≤0 | FAIL → ✅ | 裸 `<style scoped>` 清零 |
| D-06 | 2 | **8** | =8 | FAIL → ✅ | TiTable 能力项 2/8 → 8/8 |
| D-07 | 0 | **4** | =4 | FAIL → ✅ | useTable 错误契约 0/4 → 4/4 |
| D-08 | 0 | **4** | ≥1 | FAIL → ✅ | `:focus-visible` 0 → 4 处 |
| D-09 | 0 | **15** | ≥15 | FAIL → ✅ | danger 确认按钮 0 → 15 |
| D-11 | 4 | **2** | ≤2 | FAIL → ✅ | 断点 4 档 → 2 档 |
| D-12 | 18 | **0** | ≤0 | FAIL → ✅ | i18n 17 处代码 + 依赖 + 目录 → 0 |
| S-01 | **29** | 29 | =29 | ✅ → ✅ | `.ti-page` 覆盖（基线即达标） |
| G-01 | **1** | 1 | ≤1 | ✅ → ✅ | `el-pagination` 单一来源 |
| G-02 | **0** | 0 | ≤0 | ✅ → ✅ | 构建零错误 |
| **达标合计** | **3/24** | **14/24** | | | 净增 11 条，全部来自 D 系列 |

### 仍未达标的 10 条（S 系列工作面）

| 规则 | 目标 | 现状 | 缺口 | 归属任务（门禁口径） |
|---|---|---:|---:|---|
| S-01b | =29 | 22 | 7 页仍用裸 `el-table`（`maintenance/workbench`、`product/actuarial-workbench`、`product/pricing-plans`、`product/rate-tables`、`rule-engine/list`、`system/dict`、`system/menu`） | ui-103 |
| S-01c | =46 | 12 | 34 个操作列未用 `.ti-action-column` | ui-102 |
| S-02 | ≤0 | 4 | 4 处中文「查询」按钮（`channel/commission-schemes:23`、`product/actuarial-workbench:144`、`product/pricing-plans:15`、`product/rate-tables:17`） | ui-101 |
| S-03 | ≤5 | 21 | 46 个操作列散成 21 种宽度 | ui-107 |
| S-04 | ≥15 | 3 | 金额列右对齐覆盖不足 | ui-104 |
| S-06 | ≥20 | 5 | 分页列表固定表头覆盖不足 | ui-103 ⚠️ |
| S-07 | ≤1 | 8 | `.detail-header` 重复声明 8 处（**真实影响面见 §四 R-1**） | ui-105 |
| S-08 | ≤3 | 6 | `label-width` 6 种取值 | ui-106 |
| S-09 | ≤4 | 5 | 内联 `max-width` 5 种取值 | ui-106 ⚠️ |
| S-12 | ≤0 | 2 | [login/index.vue:48](../../src/views/login/index.vue#L48) 演示账号 2 处 | ui-110 |

> 🔴 **本列已于 ui-101 收官时修正，原值有 7 行是错的。** 判据改为**唯一可机械核对的口径**：`harness-tasks.json` 中各任务 `validation.command` 里 `--rule=` 的实读值 —— 谁的门禁点了这条规则，谁才负责把它翻绿（`ui-101→S-02`、`ui-102→S-01c`、`ui-103→S-01b`、`ui-104→S-04`、`ui-105→S-07`、`ui-106→S-08`、`ui-107→S-03`、`ui-110→S-12`）。
>
> 原表是**按任务序号顺排**填的（101/102/103/104/106/107/105/108/109/110），并非读过门禁后再填 —— 于是 8 行里有 7 行把规则挂到了不负责它的任务上（S-01b 挂 ui-101、S-02 挂 ui-103、S-03 挂 ui-104、S-04 挂 ui-106、S-06 挂 ui-107、S-08 挂 ui-108、S-09 挂 ui-109）。**这正是本报告 §四 R-2 在守卫源码里逐例修掉的那同一种病，换了个位置发作：图表里的关联关系没有任何来源，读的人却会当成事实。** 下游按原表行事会把力气花在错的任务上。

> ⚠️ **带此标记的两行（S-06 / S-09）没有任何任务的门禁点到它们**：ui-103 的标题写「S-01b/S-06」、ui-106 的标题写「S-08/S-09」，但门禁只跑 `--rule=S-01b` / `--rule=S-08`。即**标题覆盖的规则数 > 门禁检验的规则数** —— 这两个任务可以「门禁全绿」收工，而 S-06/S-09 仍原样红灯。**ui-103 与 ui-106 不得以守卫翻绿为完成判据**，须在收尾时另行实读这两条规则的实测值（与 §四 R-1 对 ui-105 的要求同源）。
>
> 另注：`ui-102` 的**标题**写作「S-03 操作列收敛」而门禁是 `--rule=S-01c`；`ui-107` 的**标题**写作「S-05 状态语义色收敛」而门禁是 `--rule=S-03`（量的是操作列宽度，不是状态色，且守卫**没有**状态色规则）。标题里的 S-0x 是本文档的编号体系、门禁里的 S-0x 是守卫的规则 id，两套编号**同形不同义**，易被误读为同一件事。按「门禁为准」行事。

> **S 系列未动的原因**：底盘是扫尾的前提（任务书 checkpoint 4 原话）。D 系列交付的 `TiTable` 插槽、`useTable.tableError`、令牌类、`.ti-action-column` 等，正是 S 系列各页改造所需的**目标形态**；先做扫尾会先把页面改一遍、再因底盘定型而返工。

---

## 四、遗留风险

底盘达标 ≠ 问题消失。以下 8 条是**本轮确认存在、但不在 D 系列职责内**的风险，按「会不会在下游任务里静默放行」排序。

### 🔴 R-1　S-07 的真实影响面是 13 份重复页头，守卫只看得见 7 份

守卫口径 `\.detail-header` 实测 8 处 / 7 个文件。但按类名重新普查，**形状相同的手写页头共 13 个文件 / 15 处 scoped 声明**：

| 类名 | 模板使用 | scoped 声明 | 守卫可见 |
|---|---:|---:|---|
| `.detail-header` | 7 文件 | 8 处 | ✅ 计入（值 = 8） |
| `.ti-detail-header`（[claim/detail:5](../../src/views/claim/detail/index.vue#L5)，声明 :473） | 1 | 1 | ❌ 看不见 |
| `.config-header`（[product/template-config:5](../../src/views/product/template-config/index.vue#L5)，声明 :527） | 1 | 1 | ❌ 看不见 |
| `.revise-header`（[product/revise:5](../../src/views/product/revise/index.vue#L5)，声明 :428） | 1 | 1 | ❌ 看不见 |
| `.page-heading`（`product/actuarial-workbench`、`maintenance/create`） | 2 | 3 | ❌ 看不见 |
| `.page-header`（[billing/payment-operations:3](../../src/views/billing/payment-operations/index.vue#L3)，声明 :238） | 1 | 1 | ❌ 看不见 |

**其中 4 处与 `.detail-header` 形状完全一致**（`product/revise`、`product/template-config`、`claim/detail` 及 7 个 `.detail-header` 页：都是「返回按钮 + `<h3>` 标题 + 状态标签 + 右侧操作区」，见 [product/detail:5-9](../../src/views/product/detail/index.vue#L5-L9) 与 [product/revise:5-9](../../src/views/product/revise/index.vue#L5-L9) 逐行同构）。

> ⚠️ **对 ui-105 的直接影响**：若只按守卫口径把 `.detail-header` 收敛到 ≤1，守卫会显示**达标**，而 `config-header` / `revise-header` / `ti-detail-header` 三份重复仍原样留在代码里 —— 这正是「名不副实的规则比没有规则更糟」的形态。ui-105 应以**类名普查**为完成判据，而不是以守卫翻绿为完成判据。

另：`TiDetailHeader` 组件已就位（[src/components/TiDetailHeader/index.vue](../../src/components/TiDetailHeader/index.vue)，已在 [src/types/components.d.ts](../../src/types/components.d.ts) 注册），但**当前 0 个视图调用它** —— 截至本轮它只是「能力齐备、无驱动」。

### 🔴 R-2　守卫存在「计数口径 ≠ 规则标题」的同名缺陷（本轮累计 6 例）

同一种病反复出现：**断言了一个比标题更弱的条件**，于是规则可以「达标」而实际什么都没检查。逐例：

| # | 规则 | 缺陷 | 后果 |
|---|---|---|---|
| 1 | D-04 | 令牌定义文件里的 `#67c23a` 被计成违规 | 「目标 ≤0」永不可达，会诱导用 `ui-guard-ignore` 糊 |
| 2 | D-08 | 注释里提到 `:focus-visible` 也算命中 | 只写说明、一条规则都没有的文件也能达标 |
| 3 | D-09 | 数的是「含 `confirmButtonClass` 的行」，类名拼错也算 | 门槛看着达标，实际可能一处都没标红 |
| 4 | D-11 | 只认 `(\d+)px` 字面量，令牌化后量到 0 | 规则「通过」时什么都没检查 |
| 5 | D-12 | 注释被误计 + 目录判据查 `src/locales`（本项目 i18n 从来放 `src/i18n`，该路径**恒不存在**） | 死判据：看着像安全网，一次也没响过 |
| 6 | **ui-011 任务书** | 验收规则选 `--rule=D-06`，而 D-06 量的是 **TiTable 的能力项**（`stripe/border/toolbar/error/empty/height/maxHeight/showRefresh`），与 ui-011 交付的 `TiDetailHeader`/`TiSearchForm` **毫无关系** | 该守卫对该交付物**永不可能失败**，验收为零信号 |

前 5 例已在守卫源码里修正并留下注释（见 [scripts/ui-guard.mjs](../../scripts/ui-guard.mjs) 各规则内 🔴 段落）；第 6 例在任务书里，本轮未改（任务书为输入文件，改动需用户确认）。**后续任务选定 `--rule=` 时须先读该规则实现，确认它量的是本任务的交付物。**

### ⚠️ R-3　「加类覆盖 EP 组件属性」在本项目里默认不生效

详见 [src/assets/styles/index.scss:139-159](../../src/assets/styles/index.scss#L139-L159) 的实测记录（该处注释即本条的完整存档，含真机像素与排查过程）。

EP 自带 `.el-input { width: var(--el-input-width) }` / `.el-select { width: var(--el-select-width) }`，与**单类名特异性同为 (0,1,0)**；而 `unplugin-vue-components` + `ElementPlusResolver` 会在 `index.scss` **之后**再注入一份组件样式 → EP 恒赢。必须写成 `.my-class.my-class` 取 (0,2,0)（同文件 `:root:root` 是同一手法）。

**S 系列大量任务是「给页面加统一类」（S-01b/S-01c/S-03/S-08/S-09），凡该类要改的是 EP 组件自身的同名属性，都必须双写类名并真机量一次计算值。** 排查手法：给裸 `div` 挂同一个类验证规则存在 → 遍历 `document.styleSheets` 用 `el.matches(selectorText)` 找压掉它的规则。

### ⚠️ R-4　契约测试数量基线已过时（任务书写作时 74，实际 100 → 现 116）

任务书 checkpoint 2 写「74/74（基线 74/74）」，实际：基线 **100**，本轮结束 **116**（新增 TiDetailHeader 7 例 + TiSearchForm 9 例）。R-01 若沿用「74/74」会**误判回归**。以后续实测数为准。

### ⚠️ R-5　构建耗时基线已过时（任务书 6.78s）

本轮三次实测：5.31s / 6.96s（同机连续跑存在正常波动）。**未因令牌补齐而变慢**，`vue-tsc` 0 错误。任务书 checkpoint 3 的 6.78s 是首轮某次单点值，不宜作为回归判据 —— 判据应是「构建成功 + 类型零错误」。

### ⚠️ R-6　契约 §5.1 D-02 与 D-11 互相冲突，实现按 D-11 取值

D-02 要求 `$breakpoint-*`（sm 640 / md 900 / lg 1200）= **3 档**；D-11 要求断点取值 **≤2 档**。两者不可同时满足。实现取 [variables.scss:134-135](../../src/assets/styles/variables.scss#L134-L135) 的 767 / 900 **两档**（保住 D-11 这条有守卫的硬目标）。若后续需要第三档，须先改 D-11 目标值并说明理由。

### ⚠️ R-7　D-10 没有守卫规则，其验收不可复现为脚本

D-10（弹窗取消不产生 unhandled rejection）的验收对象是运行期控制台行为，静态脚本量不了，故 24 条规则里没有 D-10。当前实现为 [src/utils/globalError.ts:53](../../src/utils/globalError.ts#L53) 注册 `unhandledrejection` 兜底（而非逐处 `await … .catch()`）。**该条只有 Playwright 走查能验证**，已归入 R 系列。

### 📌 R-8　首轮已记录、本轮未处理的四项

| # | 事项 | 现状 |
|---|---|---|
| 1 | `.planning/ui-reviews/…/app-1440.png`（**SchemaPlexAI 项目**的登录页截图，与本项目无关） | **仍在**（`rm -rf` 被权限拒绝，需用户确认后清理） |
| 2 | [src/api/http.ts:154,159](../../src/api/http.ts#L154) 用数字 `401`/`403` 比对业务码 | 未改；违反项目规约 §8.2（业务码应为 8 位字符串） |
| 3 | [src/layouts/components/AiChat.vue:98-99](../../src/layouts/components/AiChat.vue#L98-L99) 仍是 `setTimeout` 假回复 | 未改；属功能缺口非样式范畴，建议单独决策 |
| 4 | 全站 `el-upload` **0 处** | 产品/理赔文档无法上传文件，属功能缺口，建议单独立项 |

> 另：`main.ts` 全量引入 EP CSS + Resolver 逐组件注入的**双份样式**问题（首轮 §七 第 7 项）本轮**未收敛** —— 它正是 R-3 那个「EP 规则排在后面」的成因。收敛它会同时减小产物体积，但属于构建配置变更，未纳入 D 系列。

---

## 五、与任务书的偏差

| # | 任务书记载 | 实际 | 处理 |
|---|---|---|---|
| 1 | checkpoint 2「契约测试 74/74（基线 74/74）」 | 基线 100，现值 **116** | 以实测为准，已在 R-4 记录 |
| 2 | checkpoint 3「构建基线 vite 6.78s」 | 实测 5.31s / 6.96s（波动） | 以「构建成功 + TSC 0 错误」为判据，已在 R-5 记录 |
| 3 | ui-011 的 `validation.command` 用 `--rule=D-06` | D-06 量 TiTable 能力项，与 ui-011 交付物无关 | 未改任务书（输入文件）；已记为 R-2 第 6 例 |
| 4 | S-07 目标「8 个详情页…删除 7 份重复」 | 真实重复页头 **13 文件 / 15 处** | 已记为 R-1，ui-105 须按类名普查收口 |
| 5 | 契约 §5.1 D-02 断点 3 档 | 实现 2 档（767/900） | 契约自相冲突，取 D-11 口径，已记为 R-6 |

**补充说明**（非偏差，属本轮主动增强）：ui-011 除契约要求外，额外修掉了「`TiSearchForm` 重置按钮在页面未绑 `@reset` 时完全空转」这个洞（原实现的按钮只是 `emit`），并新增声明式字段配置。增强对既有 20 个调用点**零行为变化**（`handleReset` 先还原后 emit，页面语义始终最后生效），已由契约测试 ②③ 两条互为约束地钉住。

---

## 六、结论

**底盘（D 系列）验收通过，可以进入扫尾（S 系列）。**

三条支撑：

1. **机械可验证**：11 条守卫规则逐条 PASS，且每条规则的**计数口径已与标题校准**（本轮修掉 5 例口径缺陷，见 R-2）。守卫不是「跑绿了」，是「量到了它声称要量的东西」。
2. **不回归**：116 条契约测试全绿（含本轮新增 16 条）；`vue-tsc` 0 错误；构建成功、产物体积未见异常膨胀。
3. **有真机证据**：D 系列不止步于静态检查 —— `:root:root` 与 `.ti-search-control-*` 的双写选择器都是**先真机量到不符合、再定位到 EP 同特异性规则按顺序压掉、再修正、再复量**得出的（R-3）。这是本轮唯一一处单测完全看不见、只有真机能暴露的缺陷。

**开工 S 系列前必读 R-1（节流阀）与 R-3（EP 覆盖手法）** —— 前者决定 ui-105 的完成判据，后者决定 **ui-102 / ui-103 / ui-106 / ui-107** 的改法是否真的生效（R-3 正文点名的是规则 S-01b / S-01c / S-03 / S-08 / S-09，按 §三 的门禁口径换算成任务即此四个；本条原写作 `ui-101/102/103/108/109`，同样是 §三 那套顺排映射的产物，已一并修正）。

> 本报告与 [UI-REVIEW.md](./UI-REVIEW.md) 配套：前者是**第一轮的诊断**，后者是**底盘交付后的状态**。首轮的三条 PASS（`.ti-page` 覆盖、分页器单一来源、构建健康度）在底盘完成后**全部保持达标**，未出现回退。
