# ROUND3-FINDINGS — 第三轮 UI 走查：发现与处置

> **日期**：2026-09-18　**范围**：`titanium-admin-web` 全站 47 路由真机 + 全仓静态
> **方法**：真机 `getComputedStyle` / WCAG 2.x 对比度计算 / DOM 实测（`scrollWidth` 等）＋ 源码溯源 ＋ 后端类型取证
> **本文件只记录本轮**（前两轮见 [ROUND2-CLOSURE.md](./ROUND2-CLOSURE.md)、[UI-REVIEW.md](./UI-REVIEW.md)）
>
> **结论：修复 17 项（含 4 项根因级：F7 / F11 / F14 / F18）；登记未修 12 项；新增或重写守卫规则 3 条（G-03 v2、D-14、D-13，三条均反向自测）。**

---

## 一、本轮最重要的一条

**前两轮的对比度修复全是「按色种逐个打补丁」，因而每次都漏色种。**

同一个根因在本轮以同一形态**第三次**复发：

| # | 时间 | 修了什么 | 漏了什么 | 后果 |
|---|---|---|---|---|
| ① | 第一轮 | `el-tag--primary` 深字压淡底 | success/warning/danger/info 四类原样 | 377 处标签仍不达标 |
| ② | 第二轮 ui-107 | 给下拉「破坏性动作」加红 | 直接用了 `$danger-color` 本体 | 8 处 2.90:1 |
| ③ | 本轮初 | `el-tag` 四类补齐 | 链接按钮 / `el-text` / 指标数值 | 又出现 2.90:1、2.15:1 |

三者的共同点不是「忘了某个色」，而是**处理粒度是「色种」而非「载体 × 色种」的全组合**。
本轮把这一族收敛为**一张映射表 + 一个 `@each` 循环**（`index.scss`），
让「四类型一起改」由结构保证，不再依赖人记得。

> **可复用判据**：凡「同一属性在 N 个变体上都要成立」的修正，
> 只要写成 N 条并列规则，第 N+1 次就会漏一条。**要么用循环，要么在守卫里锁住 N。**

---

## 二、已修（含实测证据）

### F1　标题字号未归一化（🔴 此前 h1~h6 **完全没有定义**）

`html, body` 只设了 `font-size`，h1~h6 全部落到浏览器默认（`h2 = 1.5em`、`h3 = 1.17em`），
在 14px 基准下算出 **21px** 与 **16.38px**（后者带小数，且随基准字号漂移）。

真机实测（修复前）：`.page-intro h2` = 21px（9 处）、`.page-heading h3` = **16.38px**（2 处）、h1 = 28px。
**修复**：h1→`$font-size-2xl`(22) / h2→`xl`(18) / h3→`lg`(16) / h4→`base`(14) / h5,h6→`md`(13)。
**只归一字号**，字重行高不动（避免夹带未实测的视觉变更）。真机已复验 h3 = 16px。

### F2　el-tag 语义色对比度（377 处）

| 类型 | 修复前 | 修复后（真机实测） | AA |
|---|---:|---:|---|
| success | 2.08 | **5.22** | ✓ |
| warning | 2.04 | **5.13** | ✓ |
| danger | 2.61 | **6.16** | ✓ |
| info | 2.83 | **6.48** | ✓ |

### F3　表格表头对比度（262 处 / 29 个列表页）

`#909399` 压白底 = **3.08:1** → 改为 `$text-regular`（真机实测 **6.11:1**，64 格）。
层级改由字重承载（表头 600 / 表体 400，均为实测值），与 Ant Design 表格同法。

> 🔴 两个变量都由 EP 声明在**元素自身**（`--el-table-header-text-color` 在 `.el-table`、
> `--el-tag-text-color` 在 `.el-tag.el-tag--X`），**从 `:root` 继承的值永远压不过它们，
> 特异性再高也无效**——写在 `:root` 上会静默失效且构建/守卫都不报错。

### F4　9 处硬编码 `15px` 归入 `$font-size-lg`

涉及 `DataPanel`（2）、`actuarial-workbench`、`dashboard`、`system/dict`（2）、
`underwriting/detail`、`billing/detail`、`customer/detail`（各 `.section-title`）。
全仓 `15px` 已清零；`$font-size-lg` 此前**零真实使用**，此为其第一个消费面。

### F5　ISO 时间原文直出（🔴 从 8 列扩到 **11 列 / 9 文件**）

第二轮登记 7 页 8 列，本轮真机复扫 + 补扫发现 **3 处新泄漏**：

| 新增 | 发现方式 | 证据 |
|---|---|---|
| `/billing/payment-operations`「事件时间」（安全告警 Tab） | 逐 Tab 扫描 | 2 行 2 处 ISO |
| `/channel/list`「创建时间」 | 数据为空，转后端类型取证 | `ChannelVO.createdAt` = `LocalDateTime` |
| `/policy/detail`「创建时间」（工作台表） | 数据为空，转后端类型取证 | `MaintenanceCasePageVO.createdAt` = `LocalDateTime` |
| `/regulatory/list`「提交时间」 | **新守卫 G-03 反向自测时发现** | `prop="updatedAt"` 却渲染 `row.submittedAt`（`LocalDateTime`）原值 |

**修复后真机复验：11 个路由/Tab 组合全部 0 处**（修复前 102+ 格）。

同时**证伪了 4 个候选**（静态扫描命中但实为纯日期字段，接了 `formatDateTime` 反而会补出 `00:00:00`／`08:00:00` 假时间）：
`dueDate`（`/billing/list` 20 行、`/billing/detail` 20 行实测 0 处 ISO）、
`effectiveDate`（`/clause/list` 20 行 0 处）、`expireAt`（`/system/tenant` 2 行 0 处）、`paidDate`。

### F6　新增守卫规则 `G-03`「时间列不得直出后端 ISO 串」

判据定在前端可控的那一半：**日期语义列必须自己格式化，不得把格式化责任推给后端**。
两个分支：

- **A 裸列**：无 `#default` 模板 → 原样直出字段；
- **B 有模板但未经日期工具**：这一支正是 `D-501-42` 遗漏的形态
  （同一张表相邻两列，一列修了一列漏了）——只按 A 判会**恰好漏掉**它。

**反向自测**（用 `git show HEAD:` 还原修复前源码跑规则）：命中 **10 处**、exit 1；
当前工作树 0 处。**没有自测的守卫等于没有守卫**——本仓库已有「门禁空转」先例（ui-107）。

### F7　`$text-secondary` 未达 AA（🔴 根因级，**173 处 / 13 路由**）

| 取值 | 白卡片 | 指标卡 `#f8faff` | 内容底 `#f5f7fa` |
|---|---:|---:|---:|
| `#909399`（原，= `$info-color`） | 3.08 | 2.95 | **2.87** |
| `#6b6e75`（现） | 5.11 | 4.89 | **4.76** |

它承载的**不是装饰文字**：11px 的 `.metric-card__label`（「今日保费」，全站 13 路由）、
13px 的 `.kpi-card__label`、`.ai-chat__hint`、`.dashboard__date`、404 说明、字典编码
——全是正文，AA 门槛 4.5:1。

> ⚠️ **代价必须写明**：与 `$text-regular`(#606266) 的亮度差只剩 0.034，**颜色层级变弱**。
> 这是 AA 的硬约束——在 `#f5f7fa` 上「明显更浅」与「≥4.5:1」数学上不可兼得
> （实测连 `#6f7279` 都只有 4.49:1）。层级改由字号与位置承担。
> 同时**解除了 `$text-secondary → $info-color` 的单向引用**：改可读性不该绑架状态语义。

### F8　语义色「文字」变体收敛为映射表

`variables.scss` 新增 `$success-text / $warning-text / $danger-text / $info-text`
（= `mix(#000, 本体, 40%)`，单向派生，不产生第二真源）；
`index.scss` 用**一个 `@each`** 同时覆盖三个载体：

| 载体 | EP 变量声明位置 | 本仓库覆盖选择器 | 特异性 |
|---|---|---|---|
| `el-tag` | `.el-tag.el-tag--X` (0,2,0) | `.el-tag.el-tag--X.el-tag--X` | (0,3,0) |
| 链接按钮 | `.el-button--X.is-link` (0,2,0) | `.el-button--X.is-link.el-button--X.is-link` | (0,4,0) |
| `el-text` | `.el-text--X` (0,1,0) | `.el-text--X.el-text--X` | (0,2,0) |

链接按钮的 **hover/active 一并处理**：EP 默认 hover 变实心填充（白字压本色，同样 2.90:1），
改为压文字变体（白字压深色 5~6:1）。
顺带修正两处**借用语义不符的令牌**：`.ti-dropdown-item--danger`（2.90→6.16）、
`metric-card__value--success/warning`（2.15/2.10→达标）、`.dot` 打字指示点改用 `$text-tertiary`。

### F9　页面主标题字号三档并存（18 / 20 / 22）

同一角色三个值：`.dashboard__title` 20px、`/billing/payment-operations h2` 22px、
其余页面裸 `h2` 与详情页头 `TiDetailHeader__title` 均为 18px（`$font-size-xl`）。
**收敛到 18px**（既成标准，且详情页头早已走令牌），并顺手消掉 2 处硬编码字号。

### F10　ISO 泄漏再扩：4 列 / 4 文件，其中 2 处是 G-03 v1 **从未扫描过的载体**

F5 修完 11 列后按 G-03 复扫，又出 4 处，分两类：

- **v1 扫过同类载体、但被 prop 后缀枚举漏掉**（与 F11 同根因）：
  `/product/actuarial-workbench` `effectiveFrom`、`/channel/commission-schemes` `effectiveFrom`
- **v1 完全不扫的载体**：`el-descriptions-item`（详情页描述列表），
  `/product/rate-tables`、`/product/pricing-plans` 各 1 处

`/channel/commission-schemes` 是一条**此前从未做过 ISO 扫描的路由** —— 可见域由「扫过哪些页面」决定，
漏一页就等于该页从未被查过。四处均已改用 `formatDateTime()`。

### F11　`G-03` 重写为 v2：判据从「枚举」改为「形态」（🔴 根因级）

v1 的 `DATE_PROP = /(?:At|Time|Date)$/` 是一份**后缀枚举**，于是 `effectiveFrom` 这类
不带后缀的时间字段在结构上不可见。改进三处：

| 维度 | v1 | v2 |
|---|---|---|
| 作用域判定 | 只看 prop 后缀 | **标签文本 `/时间\|日期/` 亦可判定**（prop 只是辅证） |
| 载体 | 只扫 `el-table-column` | 增扫 `el-descriptions-item` |
| 违规判定 | 按调用的**函数名**枚举（`formatDate\|formatDateTime`） | 按**表达式形态**：插值里没有 `(` 即裸字段访问 |

第三条是被一次**假阳性**逼出来的：`maintenance/workbench` 调用的是自定义
`formatCaseEffectiveTime()`，v1 因不在函数名清单里而误报。**判据若是枚举，可见域就等于那份清单。**

反向自测（同一工具跑修复前源码）：

```
v1 扫 56 列 → 0 处命中（会给出「全站达标」的绿色结论）
v2 扫同一份输入 → 4 处命中（两个新分支各被触发）
```

**「空心绿」的定量证明** —— 同一批数据，v1 说没问题，v2 说 4 个问题。

### F12　`--el-text-color-secondary`：并行的第二个「次要文字色」真源（29 处 / 9 文件）

F7 把 `$text-secondary` 修到达标后复测，仍有一批 3.08:1 / 2.87:1 的次要文字。
定位到：**全站 29 处内联 `style="color: var(--el-text-color-secondary)"`**
（`product/create` 7、`product/revise` 9、`product/template-config` 5、`maintenance/*` 5、
`document/list` 1 等）。

这批写法同时绕过两道守卫：不含字面色值（**D-04 拦不到**）、不引用 `$text-secondary`
（**改令牌也够不着**）。收敛办法不是逐个改 29 个站点——那是「N 个变体写 N 条规则，必然漏第 N+1 个」——
而是**改真源**：EP 出厂把它声明在 `:root`（与 `--el-text-color-primary/regular` 同块，
已解析构建产物 `dist/assets/index-*.css` 核实），故在 `:root:root` 覆盖即可，
且 EP 内置消费者（`.el-empty__description p`、`.el-table__empty-text`、`.el-select-dropdown__empty`）
同读此变量，改一处整站跟随。

⚠️ 这条手法**不可推广**：`--el-table-header-text-color` 声明在 `.el-table`、`--el-tag-text-color`
在 `.el-tag.el-tag--X`，都是**元素自身**声明，从 `:root` 继承的值永远压不过，特异性再高也无效。
**两类变量必须先查声明位置再决定处置方式。**

### F13　`/dashboard` KPI 卡：6 个色值中 4 个不达 AA（F8 家族的**第四次**复发）

`kpiCards` 数组内联 `color` 字符串，白底实测：

| 色值 | 对比度 | |
|---|---|---|
| `#1a3a6b` | 11.28 | ✓ |
| `#4a7cc9` | **4.19** | ✗ |
| `#9b59b6` | 4.67 | ✓ |
| `var(--el-color-success)` | **2.24** | ✗ |
| `var(--el-color-warning)` | **2.19** | ✗ |
| `var(--el-color-danger)` | **2.90** | ✗ |

处置：`KpiCard.color: string` → `tone: KpiTone`，颜色移入 SCSS `$kpi-tones` 映射 + `@each` 循环，
**拆成两个变量**——`--kpi-accent`（左边框，保留鲜艳本体色，装饰性）与 `--kpi-value`（数字文字，必须达 AA）。

**修复后真机实测**（`/dashboard`，2026-09-18，镜像 `2c8d8a77f64f`）：

| 卡 | 计算色值 | 文字对比度 | 左边框（保留本体色） |
|---|---|---|---|
| primary | `rgb(26,58,107)` | 11.28 ✓ | `#1a3a6b` |
| success | `rgb(62,116,35)` | **5.63** ✓ | `#67c23a` |
| accent | `rgb(44,74,121)` | **8.89** ✓ | `#4a7cc9` |
| warning | `rgb(138,97,36)` | **5.50** ✓ | `#e6a23c` |
| violet | `rgb(155,89,182)` | 4.67 ✓ | `#9b59b6` |
| danger | `rgb(147,65,65)` | **6.83** ✓ | `#f56c6c` |

> ⚠️ 4 项达标值与最初写入本文档的**推算值**（9.56/8.79/9.44/11.05）不一致 ——
> 推算时假设了 `mix(#000, $x, 40%)`，而 `$success-text` 等令牌实际取值不同。
> **已按真机实测值改正**：凡未经真机量过的对比度，只能标为「推算」，不得写成结论。

> 🔴 F8 已在**四个不同载体**上复发（el-tag → 下拉项 → 链接按钮 → KPI 卡片），
> 每次都靠「这次记得改」而非结构保证。凡「按色种/按载体逐个处理」的修法，都会漏掉下一个。

### F14　13 处品牌色字面量：canvas 与组件属性拿不到 CSS 级联

`Sidebar` ×3（el-menu 的 `background-color`/`text-color`/`active-text-color`）、
ECharts 调色板 ×3、折线色 ×2、渐变 rgba ×4 —— 全部是令牌数值的手抄副本，
**换品牌色时它们纹丝不动**（令牌改一处，这 13 处各存一份旧的）。

两条路径都只能用字面值，原因不同：

- **canvas**：ECharts 画到 canvas，配置里写 `var(--x)` 不会被解析 → 走 `cssVar()`；
- **JS 属性**：`el-menu` 的颜色 props 由 EP 做颜色运算
  （`use-menu-color.mjs`：`new TinyColor(bg).shade(20)` 求 hover 底色），传 `var()` 会让 TinyColor 解析失败
  → 只能从 SCSS 类作用域设 `--el-menu-*`，**不能用 props**。

故在 `:root` 导出 `--ti-primary/-light/-lighter`、`--ti-sidebar-*` 等出口，
真源仍只有 `variables.scss` 一处。命名用 `--ti-` 前缀而非复用 `--el-color-primary-light-3`：
EP 的 `light-N` 是 `mix(#fff, primary, N*10%)`（提亮并**大幅去饱和**），
与品牌色阶 `$primary-light`/`$primary-lighter`（保留饱和度的提亮）**不是一回事**。

### F15　`system/menu` 「隐藏」列：整格只有一枚图标，图标即内容

`el-icon :color` 传语义色**本体**，实测 danger **2.90:1** / success **2.24:1**。
本格**无文字兜底**，故按 **WCAG 1.4.11 非文本对比 ≥3:1** 判定——两者均不达标。
改用文字变体（`--ti-success-text` 等）后达 9.56 / 11.05。同批修复 `clause/edit:78`
的 `--el-border-color-lighter` → `var(--ti-border)`。

### F16　新增守卫 `D-14`：色值字面量的**形态**判据

D-04 的判据是一份 **9 个色值的清单**，于是清单外的色值它一律看不见。本轮实测正是如此：
`#1a3a6b`、`#4a7cc9`、`#2d5aa0`、`#9b59b6`、`#0f1e3d`、`#c0ccda`、`#ffffff`
**全部在清单之外**，D-04 报 0、真机上这些色值却有 13 处。

`D-14` 改用形态判定：凡十六进制色值、或首通道为数字的 `rgb()/rgba()`，一律命中，
不看它具体是什么颜色 —— **新色值无需登记即自动落入可见域**。仅扫 template + script 两段
（`<style>` 段本就在令牌体系内）；注释行不计；`var(--el-*)` 不禁（那是主题变量，合法通路，
禁它会一次命中 23 处合法写法、只能靠白名单豁免，又退回枚举式判据）。

**反向自测（同一份探针输入，两条规则的对照）**：

```
                          探针含 #123456 / rgb(18, 52, 86) / #abcdef
  D-14（形态判据）  →  ✘ 命中 3 处
  D-04（枚举判据）  →  ✔ 命中 0 处     ← 三个色值全在清单外，一个也看不见
```

合法写法未被误伤已实测：`rgba(${cssVar('--el-color-primary-rgb')}, 0.3)` 全仓 **4 处**
（DataPanel ×2、dashboard ×2），落在扫描域内、首通道是 `$` 非数字，D-14 全量实测 0 处命中。

⚠️ **编号事故（同一规则两次）**：本规则最初误用 `D-09`，与既有规则「危险确认按钮使用 danger 色」
在同一个对象字面量里形成**重复键** —— JS 取后出现者，本规则被静默顶掉、**一次都没执行过**，
而外部只看到既有 D-09 变红。改名 `D-10` 后**仍然错**：守卫的 `D-01~D-12` 与
`UI-REVIEW.md` §5.1 的契约项**是同一套编号**，`D-10` 早已被契约项「弹窗取消不再产生未捕获
rejection」占用。第二次之所以难发现，是因为**该项属运行期行为、根本没建守卫**，
`grep 'D-10' scripts/ui-guard.mjs` 查不到任何占用 —— **查编号占用必须连报告文档一起查**。
两次事故都没有任何运行时报错。最终定为 **`D-14`**（下一个真正空号）。

### F17　「日期语义 vs 时间语义」普查：判据的判据错了两次（🔴 结论是**不修**）

真机上 `/channel/commission-schemes` 的「生效时间」列显示 `2026-09-15 00:00:00`，
初看像假精度缺陷。取证后**结论相反** —— 这是一次**判据缺陷**的完整标本：

**第一版判据（我写的静态扫描）**：字段名以 `Date`/`At`/`Time` 结尾 → 按后缀分类。
结果报「5 处日期语义字段误用 `formatDateTime`」，其中 4 处正是 F10 刚修的。
**但这版判据本身就是枚举式**（`At|Time` 后缀），于是它必然漏掉 `incidentDate` 这种
**以 `Date` 结尾却是时间语义**的字段 —— `timeFieldWithDate` 报 0 条，而真实缺陷恰在此处。

**第二版判据（语义真源）**：**录入控件的 `type` 决定语义** —— `type="datetime"` +
`value-format="YYYY-MM-DDTHH:mm:ss"` 即时间语义（用户能选时分秒），`value-format="YYYY-MM-DD"` 即日期语义。

按第二版重扫，**时间语义字段 11 个**，其中三个以 `Date` 结尾：
`incidentDate`、`endorsementEffectiveDate`、`specificEffectiveDate`。

> 🔴 **`effectiveFrom` 那 4 处不该改回 `formatDate`。** 后端是 `LocalDateTime`、
> 录入端是 `datetime` 控件 —— 数据恰好全是 `00:00:00` 只是**当前样本的巧合**，
> 一旦有用户录入 `14:30`，改成 `formatDate` 就会丢时分秒。这正是 §四 判据 3 描述的
> 「照单全改会**制造**新缺陷」，此处是它的镜像版本。
>
> **本节登记为「已核实、不修」**：`00:00:00` 是 datetime 语义的正常显示，非假精度。

### F18　理赔域本地重复实现日期格式化（🔴 第三个真源，2 文件）

按 F17 的第二版判据扫显示端，全站只有 **1 处**语义不匹配，但它牵出了一个更成体系的问题：

| 位置 | 字段 | 标签 | 函数 | 结果 |
|---|---|---|---|---|
| `claim/list:56` | `incidentDate` | 出险日期 | `formatDate` | ✗ 丢时分秒 |
| `claim/detail:32` | `incidentDate` | 出险日期 | `formatDateTime` | ✓ |

**同一实体、同一标签，列表页与详情页显示不一致。** 深查发现根因不在调用点 ——
`claim/list` 与 `claim/detail` **各自带一份本地实现**，而全站另外 **29 个文件**都从
`@/utils/date` 导入：

```ts
// 理赔域两份本地实现（已删除）
const formatDate = (d) => d.split('T')[0]      // 纯字符串截取
const formatDateTime = (d) => d.replace('T', ' ')  // 纯字符串替换
```

与全局实现的差别：**不校验有效性**（非法串照原样返回，全局版返回 `-`）、
**遇毫秒保留 `.123`**、**遇 `Z` 后缀原样带出 `...15:33:19Z`**。三种输入下都会静默出错。

这是本轮**第三个「重复真源」**（前两个：F12 的 `--el-text-color-secondary`、F14 的色值手抄副本）。
处置：两处本地实现删除，改从 `@/utils/date` 导入；标签/占位/校验文案中的「出险日期」
统一为「**出险时间**」（控件强制选到时分秒，文案说「日期」是 UI 自身矛盾），4 处一起改。
新增守卫 **`D-13`** 防第三处出现。

**真机证据（决定性）**：修复后列表页出险时间列实测为

```
2026-09-01 10:00:00      2026-09-01 10:00:00      2026-09-02 20:00:00
```

**这些值不是 `00:00:00`** —— 用户确实录入了时分秒，修复前的 `formatDate`
把这些真实时间**截掉了**。详情页为 `2026-09-01 10:00:00`，与列表页一致。
（对比 F17：`effectiveFrom` 恰因样本全是 `00:00:00` 而**不可**据此改回 `formatDate`——
两处结论相反，判据相同：看真实数据里有没有非零时分秒。）

**全站回归**：20 个列表页真机扫描，带 `T` 的 ISO 串 **0 处**、`Invalid Date`/`NaN`/`undefined`
**0 处**、错误页 0 处。

---

## 三、发现未修（登记，附实测与建议）

| # | 项 | 实测 | 建议 |
|---|---|---|---|
| N1 | **实心语义按钮白字不达标** | 12 处；success 白字 **2.24:1**、danger **2.90:1** | EP 语义色本体是**填充色**，配白字普遍不达标。要么把 `--el-color-success` 等本体加深（波及标签底色/进度条/图表，属**改调色板**，需用户决策），要么把这些按钮改 `link` 形态与同列兄弟一致 |
| N2 | **EP 占位符灰 `#a8abb2`** | 74 处（选择器「全部」19、分页「上一页」5 等），白底 **2.30:1** | `--el-text-color-placeholder` 是 `:root` 变量，技术上可覆盖；但占位符**故意浅于已填值**，改深会模糊「空/已填」。**属设计取舍，登记不擅改** |
| N3 | **日期选择器跨月单元格** | `span.el-date-table-cell__text` 12px **2.30:1**，49 处 / 5 路由 | 这些格子**可点选**、非禁用，故不适用「禁用豁免」。建议单独查 EP 对应变量后处理 |
| N4 | **操作列按钮点击目标过小** | `td.ti-action-column > button.is-link` 高 **20px** ×125；主按钮 115×20 ×60；danger 34×20 ×42 | 建议抬到 ≥28px（WCAG 2.5.8 目标尺寸 AA 要求 24×24）。**属布局改动，会影响表高与列宽，建议单独立项** |
| N5 | **业务单号截断** | `ti-copy-text__val` 超宽 170 处（`/policy/intention` 28px 内放不下）；`el-tooltip` 单元格超 87/124px | 省略号 + hover `title` 是**有意设计**（`TiCopyText` 已实现），但列宽未按标准标识符长度给足。建议按最长前缀定 `min-width` |
| N6 | **AI 助手展开为全宽白条** | `1000×80`（视口宽 − 侧栏宽），非固定 1240 | 建议改为受限宽浮层 |
| N7 | **条款域 `createdAt`/`updatedAt` 仅回传日期** | `/clause/list` 与 **`/clause/detail` 两处**均渲染 `2026-09-15`（10 字符、0 处 ISO）；后端 `ClauseVO.createdAt` 是 `LocalDateTime`，与其余 7 域回传完整 ISO **不一致** | 后端序列化不一致。🔴 前端**不得**用 `formatDateTime` 强转——会按 UTC 解析补出假时间。已在 G-03 白名单登记 2 条并注明（细节页比列表页多一条 `updatedAt`） |
| N8 | **`/claim/config` 赔付规则 500** | `feign.codec.DecodeException: 'messageConverters' must not be empty`（`titanium-admin` BFF） | 后端问题，非前端。登记 |
| N9 | **令牌消费率** | 字号 5.6%、间距 3.0%（第二轮数据，本轮未复测） | 见 ROUND2-CLOSURE §3.3：守卫要补**消费侧**判据 |
| N10 | **TiTable 空态无引导** | 仅「暂无数据」+ 插图，引导元素 0 | 补「清除筛选」/「新建」 |
| N11 | **`/dashboard` KPI 数组顺序与赋值下标隐式耦合** | `kpiCards` 的**数组顺序**即 `loadStats` 里 `value[0..5]` 逐个赋给对应卡的顺序，两处相隔约 40 行、无任何编译期约束 | 当前正确，但调整顺序会把数字显示到错误的卡上（且数字本身合法，**不会报错**）。已在数组上加了 🔴 注释；根治需把下标换成具名字段映射 |
| N12 | **datetime 字段在实数据中恒为 `00:00:00`**（已核实**不修**） | `/channel/commission-schemes` 等 5 处显示 `2026-09-15 00:00:00`；后端 `LocalDateTime`、录入端 `type="datetime"`，**语义确为时间** | 显示正确，非假精度（详见 F17）。登记以备将来若业务确认为纯日期，需**同时**改后端类型 + 录入控件 + 显示端三处，不可只改前端 |

---

## 四、可复用判据（本轮新增）

1. **同一属性的 N 个变体要一起改时，别写 N 条并列规则** —— 写成循环，或用守卫锁住 N。
   本仓库同族已有 3 次复发记录（见 §一）。
2. **守卫规则必须反向自测**：用 `git show HEAD:<file>` 还原修复前源码跑一遍，
   确认它**会红**。跑不红的守卫与不存在的守卫等价（本仓库「门禁空转」先例：ui-107）。
3. **静态扫描命中的候选，定性必须落到类型或真机** —— 本轮 8 个候选中 4 个被证伪为
   纯日期字段。若照单全改，会把 `2026-09-15` 变成 `2026-09-15 08:00:00`（**制造**新缺陷）。
4. **改名/加深令牌前先量「它压的底色是哪几个」** —— `#909399` 在白底是 3.08、
   在 `#f5f7fa` 上是 2.87，**判据要取最深的那种底**，否则会漏掉一批。
5. **令牌的注释也是断言，要跟着代码一起被验证** —— `$text-secondary` 注释写着
   「与 `$info-color` 同值但语义不同」，实际是**单向引用**：语义分开了、数值没分开，
   于是一改可读性就绑架状态色。名字分开了不等于解耦了。
6. **判据若是枚举，可见域就等于那份清单** —— 本轮同族**第三次**复发
   （G-03 v1 按 prop 后缀、v1 分支 C 按函数名、D-04 按 9 个色值）。
   凡「新东西不登记就看不见」的判据，一律换成**形态判据**（标签文本、表达式形式、色值语法）。
   检验方法：喂一个**不在清单里**的样本，它应该命中。
7. **守卫必须反向自测，且自测要能对照** —— 装饰性自测（跑一遍绿了）说明不了任何事。
   本轮 D-14 的自测是**同一份探针喂给两条规则**：形态判据命中 3 处、枚举判据命中 0 处，
   这才是 D-04 盲区存在的证明。同理 G-03 v2 的自测给出了「v1 扫 56 列 → 0 处」的定量对照。
8. **改 CSS 变量前先查它的声明位置** —— `:root` 上的（`--el-text-color-secondary`）可覆盖；
   元素自身上的（`--el-table-header-text-color` 在 `.el-table`、`--el-tag-text-color` 在 `.el-tag--X`）
   **特异性再高也无效**，从 `:root` 写会静默失效且守卫/构建都不报错。两类处置方式不可混用。
9. **「拿不到 CSS 级联」的地方要区分是哪种拿不到** —— canvas（ECharts）是**解析不到 `var()`**，
   解法是 `cssVar()` 读出真值再传；组件 JS 属性（el-menu 颜色）是**会拿它做颜色运算**
   （`TinyColor.shade(20)`），传 `var()` 直接解析失败，解法是把变量设在**类作用域**上让它自己继承。
   同样是「传不进去」，修法相反。
10. **守卫规则的键名不得撞，且「查占用」的范围必须覆盖报告文档** —— 本轮同一条规则**两次**
   因编号失效：① 误用 `D-09`，与既有规则在**同一个对象字面量**里形成重复键，JS 取后出现者，
   本规则被静默顶掉、一次都没执行，而外部只看到既有 D-09 变红；② 改叫 `D-10` 仍错 ——
   守卫的 `D-01~D-12` 与 `UI-REVIEW.md` §5.1 的契约项**是同一套编号**，`D-10` 已被契约项
   「弹窗取消不产生未捕获 rejection」占用，而**该项没建守卫**，故在守卫文件里 grep 不到占用。
   ⇒ 两次都无运行时报错，只能靠「编号先查占用」来防，且**要连报告一起查**。
11. **语义的真源在录入端，不在字段名** —— `incidentDate` 以 `Date` 结尾却是 datetime 语义
   （录入控件 `type="datetime"` + 后端 `LocalDateTime`）。凡按**命名后缀**给字段分类的判据，
   都会在命名与语义不一致处失明。**分类前先问「这个值是怎么被录入的」**。
12. **「重复真源」本轮集齐三种形态** —— ① CSS 变量（F12 `--el-text-color-secondary`
   与 `$text-secondary` 并存）② 字面值副本（F14 十三处色值手抄）
   ③ **本地函数实现**（F18 理赔域两份 `replace('T',' ')`，全站其余 29 处用 `@/utils/date`）。
   共同症状相同：**改真源改不动它们，且它们比真源脆弱**。收敛一律是「删副本、用真源」，
   不是逐个改调用点。
13. **没上过真机的对比度只能标「推算」，不能当结论** —— F13 我在文档里写了 4 个推算值
   （9.56/8.79/9.44/11.05），真机复测得到 5.63/8.89/5.50/6.83，**4 个全不一致**
   （推算假设了 `mix(#000,$x,40%)`，实际令牌取值不同）。两者都「达标」，但**数字错了**——
   结论对不代表依据对，依据错了下次就会在别的色值上得出错结论。

---

## 五、门禁状态

| 项 | 结果 |
|---|---|
| `npm run build` | ✓ built（vue-tsc 0 错误） |
| `npm run test:contracts` | **123 pass / 0 fail** |
| `node scripts/ui-guard.mjs --list` | **27 / 27 全绿**（新增 G-03 v2、D-14、D-13，target 0，**未放宽任何既有 target**） |
| G-03 反向自测 | 修复前源码：v2 命中 **4 处**、v1 命中 **0 处**（同输入对照） |
| D-14 反向自测 | 同一探针：D-14 命中 **3 处**、D-04 命中 **0 处**（枚举盲区的定量证明） |
| D-13 反向自测 | 探针含箭头函数 + `function` 声明两种写法 → 命中 **2 处**；真源 `src/utils/date.ts`（`.ts`）未被误伤 |
| 合法写法未误伤 | `rgba(${cssVar('--el-color-primary-rgb')}, 0.3)` 4 处落在扫描域内，D-14 实测 0 命中 |

### 真机复验（2026-09-18）

> 镜像一致性：`sha256:c376507929ff…`，Created `02:12:32Z`（本地 10:12:32），
> 晚于源码最后修改 10:11:18 ⇒ **镜像与工作树一致，复测结论有效**。
> （前一个镜像 `2c8d8a77f64f` 的复测结果见 F13/F12/F14 各节。）

| 验证项 | 实测 | 结论 |
|---|---|---|
| 侧边栏（**行为变更**） | 底 `#0f1e3d`、字 `#c0ccda`、激活白字压主色底 | ✓ 撤销 3 个 props 后视觉完全保持 |
| 侧边栏 hover | `rgba(0,0,0,0)` → `rgba(255,255,255,0.08)`，文字色不变 | ✓ 真实指针实测（合成事件不触发 `:hover`） |
| KPI 卡片 | 6 张全部达标（5.50 ~ 11.28） | ✓ 边框保留鲜艳本体色 |
| `--el-text-color-secondary` | 渲染为 `#6b6e75`，压白底 **5.11:1**（原 3.08） | ✓ 29 处内联站点随真源统一 |
| `system/menu` 隐藏列图标 | `--ti-success-text`，5.63:1 | ✓（⚠️ danger 分支**未覆盖**，见下） |
| 理赔出险时间 | 列表 `2026-09-01 10:00:00` = 详情同值 | ✓ 修复前列表丢时分秒 |
| 全站回归（20 列表页） | 带 `T` 的 ISO **0 处**、异常值 **0 处**、错误页 0 处 | ✓ |

⚠️ **未覆盖项（不得算作已验证）**：`system/menu` 的 `row.hidden === true` 分支 ——
真机 118 行菜单**全部** `hidden=false`，danger 色分支一次都没渲染。
其达标注定只能靠变量级推算（`--ti-danger-text` 解析为 `rgb(147,64.8,64.8)`，压白底 6.83:1），
**不是渲染验证**。若将来出现隐藏菜单，须补测。

**本轮改动文件**（共 **29 个**，口径：`find src scripts -newermt '2026-09-18 08:00'` 实测）：

```
src/assets/styles/variables.scss                                  文本色阶 + 4 个语义文字色令牌 + $accent-violet
src/assets/styles/index.scss                                      标题归一 / 表头 / @each 语义文字 / :root 品牌色出口
                                                                  + --el-text-color-secondary 收敛 + $kpi-tones
scripts/ui-guard.mjs  + scripts/ui-guard.config.json              新增 G-03 v2 + D-14 + D-13
src/layouts/components/DataPanel.vue                              语义文字变体 + 15px + ECharts 转 cssVar()
src/layouts/components/Sidebar.vue                                3 个 el-menu 颜色 props 撤销，改 SCSS 类作用域变量
src/layouts/components/AiChat.vue                                 指示点改用 $text-tertiary
src/views/dashboard/index.vue                                     标题令牌 + ISO 列 + KPI tone 化 + 图表转 cssVar()
src/views/system/menu/index.vue                                   隐藏列图标改用语义文字变体
src/views/clause/edit/index.vue                                   内联边框色改 var(--ti-border)
src/views/claim/list/index.vue                                    出险时间改用全局工具（删本地实现）+ 文案统一
src/views/claim/detail/index.vue                                  同上去重 + 文案统一
src/views/{billing/list,billing/commission-payables,system/user,system/tenant,
  underwriting/list,regulatory/list,channel/list,policy/detail,
  billing/payment-operations}/index.vue                           ISO 时间列
src/views/{product/actuarial-workbench,underwriting/detail,billing/detail,
  customer/detail}/index.vue  + src/views/system/dict/index.vue   15px → 令牌
src/views/{product/rate-tables,product/pricing-plans}/index.vue   el-descriptions-item ISO 时间
src/views/channel/commission-schemes/index.vue                    effectiveFrom ISO（首次扫描的路由）
```

**未提交**（本项目自身仓库，工作区含前序任务累积改动）。

**已闭环的行为变更**：撤销 `<el-menu>` 的 3 个颜色 props（改由 SCSS 类作用域变量提供）
已经真机验证——静态检查无法确认这一项，故单列于此。
