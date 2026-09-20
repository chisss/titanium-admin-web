# UI-REVIEW — Titanium 管理后台前端设计一致性审计

> **轮次**：第一轮（扫描评估）
> **审计日期**：2026-09-17
> **审计对象**：`titanium-admin-web`（Vue 3.5 + TS + Vite 6 + Element Plus 2.14.3）
> **审计范围**：48 个视图文件 + 5 个共享组件 + 布局层 4 组件 + 路由/国际化/样式基建，共 123 个源文件、约 24k 行视图代码
> **审计基线**：`/Users/sunwei/titanium-project/.impeccable.md`（项目设计契约）+ GSD 六支柱标准
> **审计方法**：6 路并行代理（5 路代码级静态审计 + 1 路 Playwright 真机渲染走查），关键结论经独立复核

---

## 一、六支柱评分

| 支柱 | 得分 | 一句话诊断 |
|------|------|-----------|
| **Copywriting** | **2/4** | 业务术语专业精准、无泛化文案，但 i18n 契约完全未落地，检索动词三套分裂（搜索/查询/刷新） |
| **Visuals** | **2/4** | 骨架成形、删除类语义色统一，但存在**两套表格视觉语言**、同类操作跨页三色分裂、详情页 4 种骨架 |
| **Color** | **2/4** | 主色本体落地，但 **Element Plus 5 个派生变量仍是出厂亮蓝**，139 处硬编码色值，10 处幻影令牌 |
| **Typography** | **2/4** | 14px 主体稳定，但实际使用 **11 档字号、最常见 13px 不在令牌表内**，字重 5 档无令牌 |
| **Spacing** | **2/4** | 无任何间距令牌、248 处 px 硬编码、258 处内联 style 绕过体系、共享类近乎零采用 |
| **Experience Design** | **1/4** | 🔴 **错误态契约 0 覆盖**（失败等价于"暂无数据"）、产品创建最终提交零校验、状态变更按钮权限覆盖仅 52% |
| **合计** | **11 / 24** | 骨架与工程化基础扎实，短板集中在**令牌层未收敛**与**失败路径不可见** |

### 评分依据分布（各路审计独立打分）

| 维度 | audit-tokens | audit-buttons | audit-forms | audit-tables | audit-ux | audit-visual |
|------|:---:|:---:|:---:|:---:|:---:|:---:|
| Copywriting | — | — | 2 | — | 2 | — |
| Visuals | — | 2 | 2 | 2 | 2 | 2 |
| Color | 2 | — | — | — | — | 2 |
| Typography | 2 | — | — | — | — | 2 |
| Spacing | 2 | — | — | 2 | — | 2 |
| Experience | — | 2 | **1** | 2 | 2 | **1** |

---

## 二、🔴 P0 级发现（阻断发布 / 数据正确性 / 安全）

### P0-1　Element Plus 主题派生变量缺失 → 全站主色断层

**证据**：`src/assets/styles/index.scss:173-176` 仅覆盖 `--el-color-primary` 与 `--el-color-primary-light-3` 两个变量。Element Plus 2.14.3 主色系共 8 个变量，缺 6 个。

**构建产物级取证**：`dist/assets/index-*.css` 中 light-5/7/8/9/dark-2 的全站唯一声明均落在 EP 出厂块（字节 288486–288626），项目覆盖在 367725+ → **6 个派生变量 100% 生效为 EP 出厂蓝**：

| 变量 | 实际值 | 影响面 |
|---|---|---|
| `--el-color-primary-light-5` | `#a0cfff` | 主按钮 disabled/loading 态、键盘聚焦环、tag plain 边框 |
| `--el-color-primary-light-7` | `#c6e2ff` | 默认按钮 hover 边框 |
| `--el-color-primary-light-8` | `#d9ecff` | el-tag primary 边框 |
| `--el-color-primary-light-9` | `#ecf5ff` | 默认按钮 hover 底色、**el-tag primary 底色**、**el-table 当前行高亮**、el-dropdown hover |
| `--el-color-primary-dark-2` | `#337ecc` | **主按钮按下态** |
| `--el-color-primary-rgb` | `64,158,255` | rgba 派生场景 |

**真机实证**（1440×900 实测渲染值）：
- `/system/menu` 上 **31 个 `.el-tag--primary` 实测 `bg=rgb(236,245,255)`、`border=rgb(217,236,255)`，文字却是深蓝 `#1a3a6b`** —— 深蓝字压在淡天蓝底上
- 数据看板"最新保单"的"投保中"标签复现同一断层
- 主按钮按下 `#337ecc`、禁用 `#a0cfff`
- `TiTable:9` 全局启用 `highlight-current-row` → 当前行高亮色 `#ecf5ff` **影响全部 48 个列表页**
- **另有 2 处把 EP 出厂蓝直接抄进业务代码**：`views/policy/intention/index.vue:204`、`views/policy/application/index.vue:202` 的 `color: #409eff`

**次要缺陷**：已覆盖的 `--el-color-primary-light-3: #4a7cc9` **值不符合派生公式**（混白 30% 应为 `#5f7597`），现值比主色更艳，**破坏 light 阶梯单调性**。

**未断裂（勿误报）**：el-pagination 当前页、el-switch、el-checkbox、el-radio、el-input focus、v-loading、el-tabs、el-step 均绑定 `--el-color-primary` 本体，实测正常。

### P0-2　错误态契约 0 覆盖 —— 请求失败与"确实没有数据"在界面上完全同形

**契约**：`.impeccable.md` —— "Every list must expose loading, empty, error, pagination, and refresh states."

**根因**：`src/composables/useTable.ts:44-71` 的 `fetchData` **只有 `try/finally`、没有 `catch`**，且 hook 不返回任何 error 状态。

**失败链路**：接口失败 → 拦截器弹一次瞬时 `ElMessage`（`src/api/http.ts:164/184`）→ `tableData` 保持 `[]` → `TiTable:14` 渲染 i18n 文案「暂无数据」。

**后果**：界面向用户**断言「系统里没有这类保单/工单」**，而真相是「接口挂了」。全 29 个列表页中 **0 页**有「加载失败 + 重试」。`TiTable` 组件本身只有 loading/empty/pagination，**无 error/refresh 插槽**。

**真机实证**：`/claim/config` 两接口 500 时界面显示「暂无数据」；`/clause/edit` 保障接口 500 静默降级。

**并发问题**：`useTable.ts:99-103` 的 `onMounted` 自动 `fetchData()` 在失败时产生未捕获 Promise 拒绝（全仓无 `unhandledrejection` 兜底）。

**次生同形问题**：`src/components/TiDictSelect/index.vue` 绑定 `useDict` 的 loading，但**无 empty 态、无 error 态**；`useDict.ts:27-34` 的 `load()` **没有 catch** → 字典接口失败时用户看到**空下拉且无任何提示**。

### P0-3　产品创建向导最终提交零校验 —— 非法产品定义可直接落库

**证据**：`src/views/product/create/index.vue`
- `handleSave()`（`:672`）直接调用 `createProduct()`，**无 `validate()`**
- `step3Ref` 在 `:254` 绑定、`:455` 声明却**从未被调用**
- `nextStep()`（`:632`）只校验 `currentStep===0/1`，**第 2→3、3→4 步无任何校验**

**同类缺口**：
| 页面 | 缺陷 | 证据 |
|---|---|---|
| `product/template-config` | **8 个表单零校验**（无 `:rules`/`:model`/`FormInstance`/`validate()`） | `:25,49,76,115,134,157,183` |
| `product/revise` | **4 个表单零校验** | `:24,44,124,158` |
| `MaintenanceConfigurationEditor` | **10 个 `required` 属性纯装饰**（无 `:model`/`:rules`，靠 5 段 `ElMessage.warning` if 链兜底） | `:5-20` vs `:133-149` |
| `policy/detail` | 4 个弹窗表单无 rules，6 处 `required` 仅画星号 | `:129,142,158,174` |
| `rule-engine/list` | 2 个表单无 rules | `:25,60` |

**面上数据**：`el-form-item` 共 420 个，**仅 116 个（28%）带 `prop=`** → **72% 的字段无法展示字段级错误**。`setFields` 全站 **0 次**使用。

### P0-4　状态变更按钮权限覆盖仅 52% —— 12 个变更型按钮零权限控制

**契约**：`.impeccable.md` —— "Keep button permissions aligned with backend authorities and route permissions."

**高危清单**：
- `maintenance/workbench/index.vue:74-80` —— **领取/开始/审核通过/审核拒绝/完成/立即生效/重试 7 个状态迁移按钮全部无 `v-permission`**（整个 maintenance 域仅 `list/index.vue:16` 有 1 处）
- `maintenance/configuration/index.vue:36` —— 生命周期动作集合无权限
- `system/dict/index.vue:80,81` —— 编辑 + 删除均无权限（删除虽有确认框但无权限校验）
- `product/pricing-plans/index.vue:35,36,38` —— 审批/运行测试/退役
- `product/rate-tables/index.vue:33` —— 退役
- `system/tenant/index.vue:57,60` —— 编辑 + 启用/禁用
- `document/list/index.vue:53` —— 下载

**面上数据**：`v-permission` 共 83 次 / 21 个文件；60 个 `.vue` 中 **39 个完全无权限控制**；操作列覆盖 **52/100**，工具栏 **15/26**。

### P0-5　表格列宽溢出 34% 且固定列遮挡数据列

**真机实测**（1440×900，`/policy/list`）：

```
表格容器 clientW           = 882px
列宽声明总和 (10 列)        = 1240px   → 溢出 358px (34%)
.el-scrollbar__wrap        = scrollW 1240 / clientW 882 / overflowX auto
实测横向滚动               = ✓ 可滚动（maxScroll 358px）
横向滚动条静态态            = display:none（悬停后 display:block, thumb 621.68px）
.el-scrollbar 高度          = 1457px，垂直滚动条 display:none → 页面级滚动，表头无固定
```

**列几何（scrollLeft=0）**：
| 列 | 位置 | 状态 |
|---|---|---|
| 保单号 / 投保人 / 被保人 / 产品名称 / 保费 / 保额 | 236–946 | 可见 |
| 状态 | 946–1056 | ⚠️ 右侧 38px 被固定"操作"列（1018–1118）**压盖** |
| 起保日期 | 1056–1166 | ⚠️ 仅 62px 可见 |
| 到期日期 | 1166–1276 | 🔴 完全在视野外 |

**容器为何只有 882px**：`1440 − 200(Sidebar) − 280(DataPanel) = 960 − 40(.ti-page padding) − 32(.ti-table-wrap padding) ≈ 882`。**常驻 chrome 吃掉 33% 视口**。

**同类页面**：`product/list` 12 列 1720px、`billing/detail` 1575px、`commission-payables` 1535px、`clause/list` 1480px、`policy/intention` 1400px、`workbench` 1430px、`customer/detail` 1570px。对照组 `claim/list` 7 列 = 882px 恰好等于容器，全列可见 —— **证明是列宽定义问题而非组件缺陷**。

> **审计裁决说明**：本项经两路审计分歧后由实测裁定。`audit-visual` 判定「列永久不可见、无滚动条可达」属**过重**（滚动功能实际可用）；`audit-tables` 判定「横向滚动可用性有保障」属**过早**（默认视野仍丢 2 列且遮挡 38px，滚动条静止不可见、无任何视觉线索）。实测结论：**列技术上可达，但默认视图丢失 2 列 + 遮挡 38px + 可发现性差**。

### P0-6　分页缺陷两处

| # | 位置 | 缺陷 |
|---|---|---|
| 1 | `system/role/index.vue:12` | `<TiTable>` **缺 `:page-num`/`:page-size` 绑定** → 点第 2 页数据确实翻页，但**分页器高亮永远回到第 1 页**，用户看到"第 1 页的字样 + 第 2 页的数据"，无法连续翻页 |
| 2 | `maintenance/list/index.vue` | ≤600px 时 scoped 样式 `display:none` 掉 `.desktop-case-table`（含分页器），改显 `.mobile-case-list`（`:45-63`）卡片列表，**该列表无任何分页控件** → 移动端只能看第 1 页 20 条，**后续页永久不可达** |

**另**：`system/dict:189` 用 `pageSize: 200` 单次拉取，字典类型超 200 条即静默截断。全仓无「删除末页最后一条后回退页码」逻辑。

---

## 三、分维度详述

### 3.1　设计令牌与主题层（Color / Typography / Spacing）

**令牌定义现状**（`src/assets/styles/variables.scss`，48 行 / 29 个令牌）：
- 颜色 15（主色族 3 / 侧边栏 5 / 顶栏 1 / 功能色 4 / 内容区 3）
- 尺寸 6、字体 4、圆角 1、阴影 2
- 🔴 **未定义任何间距令牌**（无 `$space-*`）、**无字重令牌**、**无色阶**（text-primary/secondary）、无 z-index、无断点令牌

**注入机制正常**：`vite.config.ts:34` `additionalData` 全局注入成立，**0 个 .vue 需手动 @use**。
🔴 **但 45 个含 `<style>` 的文件中 14 个是裸 `<style scoped>`（无 `lang="scss"`）** → Sass 管线不介入，**这 14 个文件结构上无法使用任何令牌**。

**消费率极低**：57 个视图中仅 **14 个**消费令牌；**17 个 `lang="scss"` 文件零令牌消费**。**死令牌 3 个**（0 处消费）：`$sidebar-text`（Sidebar 改用字面量 `#c0cda`）、`$font-size-sm`、`$font-size-lg`。

**硬编码色值**：**25 个色值 / 139 处 / 30 个 .vue 文件**（另有 26 处 `rgba()`）

| 色值 | 次数 | 文件 | 应复用令牌 |
|---|---|---|---|
| `#909399` | 41 | 14 | **`$info-color`**（值完全相同，其中 21 处在内联 style） |
| `#303133` | 15 | 11 | 需新增 `$text-primary` |
| `#86909c` | 10 | 7 | 见幻影令牌 |
| `#606266` | 10 | 9 | 需新增 `$text-regular` |
| `#1a3a6b` | 9 | 4 | `$primary-color`（ECharts JS 配置，SCSS 不可达） |
| `#e6a23c` / `#67c23a` / `#f56c6c` | 6/4/3 | 4/3/3 | `$warning/$success/$danger` |
| `#c0c4cc` | 5 | 5 | 需新增 `$text-disabled` |
| `#ebeef5` | 4 | 3 | `$border-color` |
| `#409eff` | 2 | 2 | 🔴 **EP 出厂蓝被抄进业务代码** |
| 其余 12 个 | 各 1–4 | — | 需令牌化或删除（含 `#9b59b6` 紫色占位、`#0a1628` 登录深底） |

**🔴 幻影令牌**：`var(--ti-text-secondary, #86909c)` 出现 **10 处 / 7 个文件**（`product/rate-tables:166`、`product/actuarial-workbench:399,405`、`product/pricing-plans:283,287`、`rule-engine/list:103`、`channel/commission-schemes:217,221`、`billing/commission-payables:152`、`billing/detail:188`），但 **`--ti-*` 全仓 0 处定义** → 10 处全部走 fallback 字面量，令牌名纯属幻觉。

**字号**：令牌声明 12/14/16 三档但**消费 0 次**；实际使用 **11 档** —— 13px×20(16 文件)、12px×17、18px×11、15px×9、16px×6、14px×6、22px×3、11px×3、20px×2、24px×1、120px×1。🔴 **最常用的 13px 反倒不在令牌表内**。

**字重**：**无令牌**，5 档全靠硬编码（600×17、700×5、500×3、900×1、400×1）。

**间距**：**无令牌（0 个）**，padding 34 + margin 157 + gap 57 = **248 处 px 声明**。主体落在 4px 网格，但 6/10/14/18px 属离格。

**圆角**：令牌 8px，实际 8px×3 / 6px×3 / 3px×3 / 16px×1；🔴 EP `--el-border-radius-base:4px` **从未覆盖** → 卡片 8px 与按钮/输入框 4px **双圆角体系**。

> ✅ **已处置（ui-001/ui-002，2026-09-17）**：`--el-border-radius-base` 已覆盖为 `$radius-md`(6px)，真机实测主按钮 `border-radius: 6px` 已生效。令牌层由 29 个补至 **74 个**（新增间距 8 / 字重 4 / 文本色阶 5 / 断点 2 / z-index 7 / 字号 7 档 / 搜索控件宽 3 / 表单宽 3 / 操作列宽 4 / 表头行高 2）。

**内联 style 258 处，覆盖 42/48 个 views** —— 完全绕开令牌层。

**共享类采用率极不均衡**：`ti-page` 44 文件、`ti-toolbar` 19、`ti-card` 15、`ti-action-column`/`ti-code-column` 12，而 **`ti-search-area` 仅 1、`ti-pagination` 1、`status-tag` 1、`ti-table-wrap` 3** → `index.scss:76-164` 定义的共享词汇近乎僵尸。

**主题完整性**：**无暗色模式 / 无主题切换**（`dark|useDark|toggleTheme|prefers-color-scheme|data-theme` 命中 **0**）。Sidebar/Topbar 令牌被半绕过（`Sidebar.vue:18-20` ElMenu props 写死 `#0f1e3d/#c0ccda/#ffffff`，与令牌逐字重复双写）。登录页 `login/index.vue:157` 独立深蓝渐变 `#0a1628→#0f1e3d→#1a3a6b` 为全站唯一绕过主色令牌的大面积着色。

**EP 样式双份引入**：`main.ts:6` 全量 `element-plus/dist/index.css` + ElementPlusResolver 逐组件 `style/css` → dist 产出 **62 个 `el-*.css`**，且 `base.css` 含 `:root{--el-color-primary:#409eff}`，当前构建靠 **字节顺序侥幸**（index.scss 在 367725、EP 默认在 288424）才生效。

> ✅ **已处置（ui-001，2026-09-17）**：覆盖块选择器改为 `:root:root`（特异性 0,2,0），**无条件**压过 EP 的 `:root`（0,1,0），与产物字节序彻底解耦——原方案任何一次 chunk 拆分都会静默回退到出厂蓝。真机取证：`document.styleSheets` 中 `:root => #409eff`(EP) 与 `:root:root => #1a3a6b`(项目) 并存，计算值取后者。
> 派生变量由 2 个补至 **10 个全量**（light-3/5/7/8/9 + dark-2 + rgb 三元组 + 圆角 + 字号），全部用 SCSS `mix()` 按 EP 官方公式派生而非写死色值。**并修正一处既有缺陷**：light-3 原写死 `#4a7cc9`，比主色 `#1a3a6b` 更艳（正确值 `#5f7597`），导致主按钮 hover 比常态更抢眼、light 阶梯单调性被破坏。修正后实测 hover 更浅、active 更深、disabled 更浅，方向全部正确。

### 3.2　按钮与操作元素（Visuals / Experience）

**属性矩阵**（324 个 `el-button` / 53 个文件）：

| 维度 | 分布 |
|---|---|
| type | 不写 141 (43.5%) / primary 116 (35.8%) / danger 38 (11.7%) / success 18 (5.6%) / warning 6 (1.9%) / `:type` 动态 5；**info 0 次** |
| size | 不写 242 (74.7%) / small 81 (25.0%) / large 1 (0.3%) |
| 修饰符 | link 66 / text 26 / plain 2 / circle 1 / **round 0、bg 0** |
| 语义 | icon 95 / loading 45 / disabled **仅 9** |
| 图标按钮 | 仅 11 个（`:icon` 无文案）；tooltip 1、aria-label 7、**两者皆无 4** |

**工具栏（`.ti-toolbar`）**：19 页使用，但 **15 页用 `.ti-toolbar-left`、仅 6 页用 `.ti-toolbar-right`**；4 页虽套 `.ti-toolbar` 却不写 left/right 结构（`product/rate-tables:9-20`、`product/pricing-plans:7-18`、`rule-engine/list:4-10`、`channel/commission-schemes:8`）。
- 新建类按钮 **100% 为 `type="primary"`** ✓，但 `claim/list:35` 是**唯一一页主操作放右**
- **16 个工具栏页无刷新按钮**（仅 maintenance×2、rule-engine 有）

**操作列（`.ti-action-column`）采用率 12/31 = 39%**；未采用 19 页相邻按钮仍吃 EP 默认 `margin-left:12px`，且 `.cell` 未 `nowrap`，宽列有换行风险。未采用清单：`billing/commission-payables:37`、`billing/payment-operations:118`、`channel/commission-schemes:50`、`customer/list:44`、`maintenance/configuration:34`、`maintenance/list:38`、`maintenance/workbench:72`、`notification/list:66`、`policy/application:74`、`policy/intention:83`、`product/actuarial-workbench:49/75/102/129`、`product/pricing-plans:32`、`product/rate-tables:29`、`rule-engine/list:18`、`system/dict:78`、`system/log:57`、`system/menu:48`

**语义色惯例**：
- 删除 → **danger 100% 一致** ✓
- 启用/激活、发布 → success 一致 ✓
- 🔴 **停用/禁用三色分裂**：danger（`channel/list:72`、`clause/list:71`、`system/tenant:56`）vs **warning**（`rule-engine/list:19`）
- 🔴 **审批/审核三色**：primary（`underwriting/list:58`）vs 默认+link（`product/actuarial-workbench:50`）vs 默认（`claim/config/ConfigPanel:28`）
- 🔴 **提交三色**：primary（`clause/list:70`）vs warning（`product/list:127`）vs 默认（`channel/commission-schemes:53`）
- 🔴 **详情/查看两色**：默认 11 页一致 vs **primary+link 2 页破例**（`policy/application:74`、`policy/intention:83`）
- 真机新增：`/system/role` 行内「分配权限」用 **warning 橙**（非警示动作套警示色）

**操作列宽 32 处 `width=` vs 14 处 `min-width=`，19 档离散值**（70/74/75/80/90/100/110/120/150/160/190/200/220/230/260/280/300/320/380）。🔴 **收纳：0 处"更多"下拉** —— `product/pricing-plans:32`（380px，6 个 flat 按钮）、`product/list:112`（320px，7 个）、`clause/list:60`（300px，6 个）、`maintenance/workbench:72`（280px，7 个）全部平铺。

**危险操作确认**：
- ✅ **持久化破坏性操作 12/12 全部有确认弹窗**，文案均说明后果（如"停用后将不能被出单流程调用"）
- 🔴 **`confirmButtonClass` 全站 0 次** → 所有"确认删除/停用/退役"的危险确认按钮都是**默认蓝色主按钮**，无危险色区分
- `confirmButtonText` 仅 8 处显式定制
- 🔴 **49/52 处 `await ElMessageBox.confirm` 未包 try/catch**，且 `main.ts` 无 `errorHandler`/`unhandledrejection` 兜底 → 用户点"取消"产生未捕获 Promise rejection
- 危险确认 `type` 大多 `'warning'` ✓，例外：`policy/detail:266,287` 用 `'info'`
- 无确认的表单内删除 8 处（未保存草稿内的行删除，风险中低）

**失败/成功反馈**：✅ `src/api/http.ts:160-185` 统一 `ElMessage.error`（含 401 续期重放、403、超时、Blob 错误体解析），**空 catch 0 处**；98 处 `ElMessage.success` 覆盖 32 文件。语义分布：success 98 / warning 41 / **error 仅 16** / info 2。
- ⚠️ `http.ts:159` 用 `res.code === 403` 比对**数字 HTTP 码**，与项目"业务码为 8 位字符串"规约（CLAUDE.md §8.2）不符

**禁用态与门控**：按钮级 `:disabled` **仅 8 处**；生命周期门控改用 **v-if 隐藏**（31 个顶层操作列中 24 个按 `row.status` 显隐）→ 满足"不依赖后端拒绝"的意图，但**偏离字面"禁用而非隐藏"**：非法命令不可见，用户无法感知某状态下有哪些能力。

**loading / 防重**：45/324 带 `:loading`（13.9%），提交类按钮 38/85（45%）。EP 语义 `loading` 即 `disabled`（`element-plus/es/components/button/src/use-button.mjs:31,32,50`）→ 带 loading 天然防连点。
🔴 **7 个弹窗提交按钮无 `:loading`**：`product/pricing-plans:101,122`、`product/rate-tables:53,69`、`rule-engine/list:33,68`、另 1 处；**全站无任何 `if (saving.value) return` 式守卫（0 处）** → 双击可重复建单。

### 3.3　表单与输入控件（Visuals / Experience / Copywriting）

**`label-width` 7 种取值**（60 个 `el-form`，48 个显式声明）：

| 值 | 次数 | 代表 |
|---|---|---|
| 100px | 15 | `regulatory/list:100`、`system/tenant:70` |
| 120px | 11 | `product/create:26,80,256`、`system/config:8,23,41` |
| 110px | 8 | `rule-engine/list:25,60`、`claim/config/ConfigPanel:41` |
| 140px | 7 | `product/template-config:25,49,76,115,134,157,183` |
| 90px | 4 | `notification/list:75`、`system/user:67`、`system/role:36` |
| 180px / 条件式 | 1 / 2 | `product/actuarial-workbench:173` / `pricing-plans:48` |

🔴 **同层级系统管理页横跨 90/100/110/120 四种**；`system/dict` **一页内同时用 100px(:92) 与 110px(:118)**。12 个无 `label-width` 的表单属 `label-position="top"` 合理豁免。

**`label-position`**：隐式 right 主流；显式 top 6 / left 1 / 条件 2。🔴 **`actuarial-workbench` 单页混用 `left`(:173) 与 `top`(:181,202,226,246)** —— 两个相邻弹窗标签对齐方式不同。

**`size`**：`<el-form size=>` **0 次** → 无表单级尺寸令牌。控件级 `size="small"` 130 处、`large` 3 处（全在 `login:29,39,54`）。

**`status-icon`/`validate-on-rule-change`/`hide-required-asterisk`/`scroll-to-error`**：**全项目 0 次**。长表单（`product/create` 5 步 713 行）无 `scroll-to-error`，校验失败时错误提示可能落在视口外。

**搜索表单**：`TiSearchForm` 采用 **20 个视图 / 21 处实例**。未采用 8 页各自实现：

| 页面 | 实现 |
|---|---|
| `channel/commission-schemes:9-24`、`product/pricing-plans:8-16`、`product/rate-tables:10-18` | `ti-toolbar` 内裸 `<el-form inline>` |
| `product/actuarial-workbench:17-26` | `context-bar` 内裸 inline form，**无重置按钮** |
| `rule-engine/list:5-8` | `ti-toolbar` 内裸 inline form + 刷新 |
| `system/menu:4-10`、`system/role:4-10` | **完全无搜索区** |
| `system/dict:10` | 左栏自建 `el-input` 过滤 + `filteredTypes` |

🔴 **检索动词三套分裂**：`TiSearchForm` 用「**搜索**」+「**重置**」（`:9,:10`）；4 个未采用页用「**查询**」且**均无重置按钮**（`rate-tables:17`、`actuarial-workbench:144`、`pricing-plans:15`、`commission-schemes:23`）；`rule-engine/list:7` 与 `maintenance/*` 用「**刷新**」。

**搜索控件宽度 19 页 14 种像素值**（110/120/130/140/150/155/160/165/170/180/190/200/220/240）。同语义「状态」下拉 6 种宽度：`system/tenant:12`=110 / `channel/list:15`=120 / `notification/list:9`=130 / `system/log:12`=110 / `maintenance/list:10`=140 / `product/list:29`=130。
🔴 搜索区**无响应式断点**（`TiSearchForm` 内部 `el-form :inline`，不用 `el-col` 栅格），窄屏靠横向溢出。「展开/收起高级搜索」仅 `billing/payment-operations` 一页使用 → **该能力闲置率 95%**。

**编辑表单布局 4 类并存**：`el-steps` 分步（仅 `product/create:10-16`）/ `<h3>` 分区标题（`product/revise:7`、`clause/edit:7,90`、`maintenance/create:6`）/ `el-descriptions` 只读回显 / 无分组单列。`el-tabs`/`el-collapse` 在表单分组中**零使用**。`section-title` 类无统一定义（`underwriting/detail:202`、`billing/detail:173`、`customer/detail:303` 各自 scoped 重复声明，另有 `.subsection-title` 第三套）。

**提交/取消按钮**：
- 🔴 **顺序不一致**：整页表单中 `clause/edit:82`、`product/revise:206` 是「**主按钮在前**」，其余整页与所有弹窗是「取消在前」
- 主操作文案 **11 种**：保存/创建/创建草稿/保存草稿/创建并配置规则/保存费率行/保存测试用例/保存规则/确认/确认中止/提交修订/关闭
- 取消文案 2 种：「取消」（弹窗与整页 footer）/「返回」（页头 `:icon="ArrowLeft"`），**页头"返回" + footer"取消"同页并存**（`clause/edit:6,:83`）语义重复

**输入控件**：
- `el-select` 53 处：宽度 **3 套写法**（`style="width:100%"` 15 处 / 硬编码 px 15 处 9 种值 / 依赖父容器 0 处）；类名 **3 套**（`product-select`/`status-select`/`full-width`）；`clearable` **仅 15/53 = 28%**，`filterable` 19/53 = 36%
- 字典下拉：`TiDictSelect` 已在 **26 个文件**使用 ✓；**硬编码选项 4 处**（`billing/payment-operations:66`、`underwriting/detail:100-104`、`system/menu:73-75`、`maintenance/configuration:129-133`）
- `el-date-picker` 27 处：`value-format` 按类型自洽 ✓（**后端契约未分裂**）；🔴 **仅 2 处设 `format`**，其余 25 处不设 → 用户在前者看到 `2026-09-17 10:30:00`、后者看到 `2026-09-17T10:30:00`；🔴 25 处无宽度 style → 宽度随父容器漂移
- `el-input-number` 103 处：`:precision` 覆盖 50/103；`:min` 89/103；`:max` **仅 34/103**（缺 max 可输入天文数字）；金额字段统一 `:precision="2"` ✓ 但🔴 **硬编码无币种感知**（`CURRENCY` 字典已在 `rate-tables:49` 可用却未驱动小数位）
- 🔴 **24 处 `el-input-number` 直接嵌在 `el-table-column` 单元格内**（`rate-tables`、`pricing-plans`、`actuarial-workbench`、`commission-schemes`）→ 表格行内直接编辑**无"编辑/保存"态区分，误触即改数据**
- 🔴 `el-upload` **全项目 0 处** → 产品/理赔文档场景**无法上传文件**（`product/create:328,343` 只选文档类型/格式）
- `el-cascader` 0 处；`el-tree-select` 仅 1 处（`system/menu:61`）

**校验**：`el-form-item` 420 个仅 **116 个（28%）带 `prop=`**；必填规则 `required:true` 89 处，带 `message` 68 处（76%），文案模式统一（`请输入X`/`请选择X`）✓；自定义 `validator` **仅 3 处**且无共享 `validators.ts`；`.validate()` 28 次 / 19 文件；🔴 **`setFields` 0 次** → 后端字段级错误全部退化为 7 处全局 `ElMessage.error`。

### 3.4　表格 / 列表页 / 分页（Visuals / Spacing / Experience）

**TiTable 采用率 22/29 列表页 = 75.9%**（全视图 TiTable 实例 26 / 裸 el-table 实例 45）。`useTable` **20/22 = 90.9%**；`usePagination` 独立采用 **0**（仅经 useTable 间接）。

**TiTable 封装内容**（`src/components/TiTable/index.vue`，112 行）：props `data/total/pageNum/pageSize/loading`；内置 `v-loading`(:5)、**硬编码 `stripe` + `highlight-current-row`(:8-9，不可关)**、`#empty` 默认 i18n(:14)、分页器(:19-28)；其余经 `v-bind="$attrs"` 透传。
**真实缺口仅 3 项**：① `border` 未暴露（硬编码无边框）② 无 `height/max-height` 透传约定（长列表无固定表头）③ **无 error/refresh 插槽与工具栏 slot** —— 这是骨架遵守率崩塌的机制性原因。

**裸 el-table 7 页**：`product/rate-tables:22`(3 表)、`product/pricing-plans:20`(4)、`product/actuarial-workbench:39`(9)、`rule-engine/list:11`(2)、`maintenance/workbench:37`(3)、`system/menu:15`(1 树表)、`system/dict:52`(1)。**不是能力不够**（`$attrs` 透传 + 默认 `#empty` 完全够用），属页面未遵守规范。

**🔴 两套表格视觉语言**：TiTable 26 实例 **全部 `stripe` + 无 border**（硬编码 `TiTable:8`）；裸表 42 实例中 **`border` 42 次**（≈100%）、`stripe` 仅 7 次。

**列定义**：
- 显式 `width` 488/503 列（97%）；🔴 **37 个不同取值**（120×52、110×49、150×38、100×38、90×37、180×37…另有 48/58/74/75/85/95/115/125/135/145/155/175/210/230/240/260/280/300/320/380）
- `min-width` **18 个不同值**
- 同义列离散：「状态」列 **7 种宽**（80/90/100/105/110/120/130）；「创建时间」4 种（160/170/175/180）；**「操作」列 28 种宽（70→380）**
- `fixed` right 31 / left 8；46 个操作列中 31 个 `fixed="right"`（**主列表全部合规** ✓，未固定的 15 个均在弹窗内本地编辑表）
- `align`：center 16 / right 3 / **其余 484 列隐式 left**；`header-align` **0 处**
- 🔴 **金额右对齐仅 3 处**（`underwriting/list:39`、`policy/intention:71`、`policy/application:62`），反向证据 15+ 处（`billing/commission-payables:32`、`billing/detail:53,72`、`billing/list:43`、`policy/list:67,70`、`customer/detail:72`、`actuarial-workbench:164`）→ **同一系统两种口径**
- `show-overflow-tooltip` **33/503 = 6.6%**
- `sortable` **全仓 0 处**（前端与 `sortable="custom"` 均无）→ 20 个分页列表**无任何排序能力**
- 序号列仅 6 处、**两种写法**（`label="序号" width="60" align="center" fixed="left"` vs `label="#" width="48"`）；**`:index` 偏移 0 处**（第 2 页序号重新从 1 起）；其余 40+ 表**完全无序号列**
- `.ti-code-column` 13 列 / 12 文件（覆盖率约 1/3），未覆盖的编码列窄屏会换行

**三态**：
- **loading** 基本达标（22/22 TiTable 页由 `TiTable:5` 统一提供；裸表页 5/7 主表有 `v-loading`）；缺口：`actuarial-workbench` 5/9 表、`pricing-plans` 3/4、`rate-tables` 2/3、`product/revise:176`、`template-config:217,247`、`rule-engine/list:55`、`billing/detail:63,75`
- **empty** 达标但不统一：TiTable 默认走 i18n（20/23 宿主受益）；非 TiTable 页 **30 处硬编码中文 `description=`**；`maintenance/workbench` 无 empty 插槽 → 落 EP 默认文案
- 🔴 **error 契约项 0 覆盖** —— 见 P0-2
- **refresh**：显式刷新按钮仅 6 页；20 页靠 TiSearchForm「重置」间接刷新；**完全无刷新入口**：`system/role`、`system/menu`、`system/dict`、`channel/commission-schemes`

**分页（本模块最成功收敛）**：全仓 `el-pagination` **仅 1 处**（`TiTable:19`）→ `layout`、`page-sizes [10,20,50,100]`、默认 20 **单一来源，离散度 0**。`usePagination.ts:30-34` 改 pageSize 正确重置 pageNum=1；`useTable.ts:74-77` 搜索正确 `resetPage()`；`total=null` 的"总数未知"语义在三处保持不降级为 0 ✓。
**缺陷**：见 P0-6（`system/role` 绑定缺失、`maintenance/list` 移动端无分页）；7 个列表页无分页（`rule-engine/list`、`system/dict`、`product/rate-tables`、`product/pricing-plans`、`system/menu` 等）。

**四段式骨架遵守率**：

| 类 | 显式采用 | 占 48 视图 |
|---|---|---|
| `.ti-page` | 44 | **91.7%** |
| `.ti-search-area` | 0（仅经 TiSearchForm 间接 20 页） | **41.7%** |
| `.ti-toolbar` | 19 | **39.6%** |
| `.ti-table-wrap` | 1 显式 + 23 经 TiTable | **50%** |
| `.ti-pagination` | 0（仅 TiTable 内部） | 0%（无自建分页故无害） |

**五段全齐的列表页仅 13/29 = 44.8%**。

**视觉后果**：未用 TiSearchForm 的页把搜索项塞进 `.ti-toolbar` 或裸 `el-form` → **搜索区失去卡片容器**（无背景/圆角/阴影），与相邻表格卡片垂直贴合；🔴 `.ti-page` padding **20px**（`index.scss:57`）vs `.ti-table-wrap` padding **16px**（`:107`）→ **搜索卡片控件左沿与表格列左沿差 4px**（全局性）。多处用行内 `style="margin-bottom:12px"` 重复 `.ti-toolbar` 已定义间距（`system/role:4`、`system/menu:4`）。

**列宽与适配**：容器预算 1440 − 200 − 40 − 32 ≈ 1168px（实测 882px，因 DataPanel 常驻）。**20 个分页列表无一张设 `height/max-height`** → 无固定表头（真机实测表体高 1457px）。仅 2 张弹窗表用 `max-height`（`pricing-plans:133`、`product/create:133`）。

### 3.5　页面骨架 / 详情页 / 容器选择（Visuals / Experience）

**页面标题 🔴 严重离散**：仅 10 个页面有自渲染标题，**其余 34 个（含全部主力列表页）无任何标题**；有标题的 6 个列表页还用了 **4 种容器**（`.page-header`+h2 / 裸 h2 / `.page-intro`+h2+p）。`policy/list`、`product/list`、`claim/list`、`customer/list`、`billing/list` **均直接以 TiSearchForm 开头，零标题**。

**面包屑**：全在 Topbar，`layouts/AppLayout.vue:86-89` 是**硬编码两级**`首页 / {meta.title}`，丢弃路由层级 → 在 `/product/detail/1` 只显示"首页 / 产品详情"，"产品管理 / 产品列表"上下文丢失；末级无 `path` 不可点。

**🔴 滚动容器嵌套双滚动**：`.app-layout__content{overflow-y:auto}`（`AppLayout.vue:127`）内嵌 `.ti-page{height:100%;overflow-y:auto}`（`index.scss:56-60`）→ 滚动条归属不确定。

**底部按钮区 5 种写法**：`__footer`（`product/create:393,706`）、`.form-actions`（`maintenance/create:69,161`）、`.revise-footer`（`product/revise:205,451`）、`.config-footer`（`template-config:258,548`）、el-dialog footer（`clause/edit:248`）。

**🔴 详情页结构离散度：8 页 → 4 种骨架**

| 页面 | 头部容器 | 标题元素 | 位置 | 主操作 | 返回 |
|---|---|---|---|---|---|
| `policy/detail:5` | `.detail-header` | h3.detail-title | card 内 | 下拉「操作」 | 返回 / `$router.back()` |
| `claim/detail:5` | `.ti-detail-header` | **span**.header-title | **card 外** | 平铺按钮组 | **返回列表** / `push('/claim/list')` |
| `customer/detail:5` | `.detail-header` | h3 | card 内 | 无 | 返回 / back() |
| `product/detail:5` | `.detail-header` | h3 | card 内 | 修订/配置 | 返回 / back() |
| `clause/detail:5` | `.detail-header` | h3 | card 内 | 编辑 | 返回 / back() |
| `underwriting/detail:5` | `.detail-header` | h3 | card 内 | 弹窗提交决策 | 返回 / back() |
| `billing/detail:5` | `.detail-header` | h3 | card 内 | 无 | 返回 / back() |
| `maintenance/workbench:4` | `.workbench-heading` | h3 | card 内 | 刷新 | 返回 / `router.back()` |

4 种骨架：①通用（product/clause/underwriting/billing/customer，内部仍有差异）②claim 独有 ③policy 独有（el-tabs 5 tab）④workbench 独有。
- `el-tabs` **仅 policy 用**；`el-descriptions` `:column` **8 种取值**（3×17、2×9、`isNarrowScreen?1:3`×3、`detailColumns`×3、1×3、4×2…）；`border` 全部开启 ✓；`size` 仅 `policy:84` 一处
- 返回：11 页 `back()` vs 1 页 `push()`；文案「返回」16 处 vs「返回列表」1 处
- 🔴 **`.detail-header` 在 7 个文件各写一份**（`product:444`、`clause:142`、`customer:275`、`underwriting:189`、`billing:160`、`policy:477`、`clause-edit:453`，clause/edit 的 `margin-bottom` 已漂移为 24px）；claim 另立 `.ti-detail-header`(:473)；workbench 用 `.workbench-heading`(:425)
- 🔴 `claim/detail:26` 同时叠加 `el-card` + `.ti-card` → **两套卡片样式同时生效**

**🔴 容器选择冲突**：创建类任务 12 种容器并存 —— 新建产品/条款/保全用**全页面**、新建费率表/定价包/规则集/渠道/用户用**弹窗**（440–1180px）、新建税费策略/动态因子/费用项/保全项配置用**抽屉**。
**最强冲突证据**：同一个 `product/actuarial-workbench` 页面内，「新建计算模型」用**弹窗**(`:245`)，「新建税费策略/动态因子/费用项」用**抽屉**(`:180/201/225`)。
**违背契约**：`.impeccable.md` 规定「聚焦的创建/编辑用抽屉或对话框；复杂配置用全页面」—— 但**含表格编辑的复杂配置（费率表/定价包/规则集）压在 560–660px 弹窗里**，阈值无规律。

**el-dialog 属性**：37 个；`width` **18 种取值**（绝对 px 11 种：560×9、520×3、480×3、440×3、640×2、400×2、620、660、500、460、1180 vs 响应式 `min()` 7 种，**两代写法并存**）；`top` 仅 1 处设置；`destroy-on-close` 仅 6 文件；`close-on-click-modal="false"` **仅 2/37**。el-drawer：7 个业务抽屉，`size` 从 72% 到 `min(920px,100vw)` 无统一。

**详情呈现三容器**：全页面路由（保单/理赔/账单/核保/客户/条款/产品）、抽屉（费率表/规则集/定价包/佣金方案/佣金应付/保全项配置/精算组件）、**弹窗**（意向单 `policy/intention:90`、投保单 `policy/application:81`）。

### 3.6　交互反馈 / 可访问性 / 国际化（Experience / Copywriting）

**交互反馈**：
- `ElMessage` 157 次：success 98 / warning 41 / **error 仅 16** / info 2 —— 语义与 type 对应正确 ✓
- 加载：`v-loading` 20 文件；**`el-skeleton` 仅 3 处**（`DataPanel:12`、`maintenance/configuration:52`、`claim/detail:64`）
- 🔴 **长时间操作零进度反馈**：全站 `el-progress` **0 处**。定价包测试用例执行（`pricing-plans:126`）、精算试算（`actuarial-workbench:144`）、费率发布校验（`rate-tables:157`）均无进度条或阶段提示
- 🔴 **无权限静默消失**：`directives/permission.ts:26` 直接 `removeChild`，无任何说明；`staticRoutes.ts` 只有 login/404，**无 403 页**
- 吞异常 3 处：`product/detail:438`、`product/revise:422`、`clause/detail:134`

**国际化（基线 151 词条）**：
- ✅ zh-CN + en-US 各 151 条，**key 逐名 diff 无差异，完全对齐**，英文翻译质量尚可
- 🔴 **实际引用 4 条**，全在 `components/TiTable/index.vue:14,34,36,40` → **147/151 = 97.4% 从未被引用**，`menu.ts` 47 条全为死词条
- 🔴 **语言切换是假的**：`main.ts:24` `app.use(ElementPlus, { locale: zhCn })` 硬钉中文，全仓无 `el-config-provider` → 切 en-US 后 EP 内建文案（分页器、日期选择器、MessageBox 按钮）仍是中文
- 硬编码规模：template 段 **601 行** + script 段非注释 **549 行** = **1150 行**；`placeholder` 含中文 **227 处**；`label="..."` **1351 处，i18n 覆盖 0**；`index.html:2` `lang="zh-CN"` 固定
- 重灾区文件：`product/revise`(68 行)、`product/detail`(46)、`product/create`(32)、`underwriting/detail`(29)、`clause/edit`(24)
- menu 词条 vs 路由：`dynamicRoutes.ts` 58 条 `meta.title`，menu.ts 47 条，键名不可机械推导且**零引用**；侧边栏实际渲染后端 `menuTree`（`Sidebar.vue:31,41,49`），与 menu.ts 完全脱钩
- 切换后不跟随：侧边栏菜单、面包屑、浏览器标题、DataPanel、AiChat、Topbar 用户菜单、全部业务页正文

**可访问性**：
- 🔴 **`:focus-visible` / `:focus` 全站 0 处** → 违反契约"visible keyboard focus"；仅 `Topbar:48` 一个非原生可聚焦元素带 `tabindex="0"`
- 🔴 **`el-tooltip` 全站仅 2 处**（`billing/payment-operations:5-7`），违反契约"Icon-only actions require tooltips"
- 图标按钮 83 处 `:icon` 中仅 **6 处带 `aria-label`**；`aria-label` 全站共 11 处
- **对比度风险**：`#909399` 全站 41 处（白底约 **3.0:1**，低于 AA 4.5:1）—— `DataPanel:248` 指标卡标签、`DataPanel:128,135` ECharts 轴标签（**字号仅 10px**）、`404.vue:48`；`#c0c4cc` 5 处约 **1.7:1**（`AiChat:214` 消息时间）
- **颜色变量化率仅 39%**：views 内硬编码 hex 91 处 vs SCSS 变量引用 59 处

**响应式**：
- ⚠️ **【更正 2026-09-17】** 本节初稿曾断言「断点 10 种取值混用」，**该结论错误**。初稿用的 grep 匹配到的是 `max-width: 640px` 这类**内联容器宽度**，被误计为 `@media` 断点。经 `scripts/ui-guard.mjs` 用 `@media[^{]*(?:max|min)-width` 精确复测，**真实 CSS 断点只有 4 种**（全仓共 16 条媒体查询）：

  | 断点 | 条数 | 出现位置 |
  |---|---|---|
  | 767px | 9 | `Topbar:192`、`AiChat:225`、`pricing-plans:291`、`commission-schemes:223`、`system/dict:479`… |
  | 600px | 4 | maintenance 模块（list / create / configuration） |
  | 900px | 2 | `maintenance/workbench` |
  | 680px | 1 | — |

- 🔴 **真实缺陷是「CSS 断点与 JS 断点不一致」**：JS 侧 `useMediaQuery('(max-width: 767px)')` 在 **6 个文件**统一用 767，而 CSS 侧同时存在 600/680/900 —— 即**同一页面在 JS 判定为"窄屏"的宽度区间，CSS 并不一定切换布局**。同一 maintenance 模块内 600（list/create/configuration）与 900+600（workbench）并存。
- **被误计的那批数字其实是另一个真实缺陷**：内联 `max-width` 容器宽度 **12 处 / 5 种取值**（720×4、640×3、480×3、760×1、560×1），已登记为规则 **S-09**。
- `el-descriptions :column` 仅 6 个文件做 1/3 降级，其余 29 处硬编码 2/3/4 列 → 窄屏挤压

**布局层**：
- 🔴 **Sidebar 详情页无高亮**：`Sidebar.vue:72` `activeMenu = route.path` → 在 `/policy/detail/1` 不匹配任何菜单 index，**详情页侧栏完全无高亮**，叠加两级简写面包屑 = 用户彻底丢失模块上下文（违反契约"Preserve filters and context"）
- Sidebar 折叠状态存内存、**不持久化**，刷新复位
- 🔴 **DataPanel（280px）+ AiChat（80px）常驻占用 360px 视口（25%）**；开关只在各自组件内，Topbar 无全局入口；DataPanel 桌面端恒显；AiChat **无法彻底隐藏**且是**桩实现**（`AiChat:98-108` `setTimeout` 假回复，文案自述"该功能在实际部署中将连接 AI 服务"）
- 🔴 **安全/文案**：`login/index.vue:48` 登录页明文展示"**演示账号：admin / admin123**"
- 死代码：`.status-tag` 4 个状态色（`index.scss:140-164`）几乎零引用（全走 TiStatusTag/el-tag）

### 3.7　真机渲染层实测（Playwright，1440×900 + 768×900）

> 🔴 **本节可信度声明（2026-09-17 事后核实 + 已复测）**
>
> 本节初稿的走查是对**运行中的容器镜像**进行的，而该镜像由 `docker inspect` 证实构建于 **2026-09-09T08:41Z**，落后工作树 **16 个提交**。
>
> **已处置**：镜像已重建（`sha256:220c6cfe`）并重新部署，本节全部条目已在**新构建**上复测。复测结论见 §3.7.1。§3.1–3.6 的源码层结论（grep 取证）针对工作树，不受影响。

#### 3.7.1　新构建复测结果（2026-09-17，镜像 sha256:220c6cfe）

| # | 原发现 | 复测判定 | 实测数据 |
|---|---|---|---|
| 1 | EP 主题派生变量缺失 | ✅ **成立** | `light-5=#a0cfff`、`light-7=#c6e2ff`、`light-8=#d9ecff`、`light-9=#ecf5ff`、`dark-2=#337ecc`、`rgb=64,158,255` 全为 EP 出厂蓝；`--el-border-radius-base=4px` 未覆盖 |
| 2 | 表格列宽溢出 + 固定列遮挡 | ✅ **成立**（数据修正） | `scrollW 1240 / clientW 882`，溢出 358px。**遮挡量更正**：固定操作列占 `1018–1118`，完整覆盖「保额」右 **28px** + 「状态」左 **72px** → 状态列仅剩 **38px 可见**；「起保日期」「到期日期」2 列在容器外，靠横向滚动可达 |
| 3 | `/claim/config` 500 静默降级 | ⏳ 未复测 | 待 R-201 |
| 4 | DataPanel 桩数据 ¥1,234,567 | ❌ **失效，已撤回** | 实测显示 **¥0**；源码 `DataPanel.vue:54,92,104` 已改接 `@/api/dashboard`（提交 `16a9839`） |
| 5 | `/system/role` 三问题 | ⚠️ **部分成立** | 无搜索区 ✅ 成立（无 `.ti-search-area`、无「搜索/查询」文案）；「分配权限」为 `el-button--warning` ✅ 成立；**英文枚举「ACTIVE」❌ 已失效**（实测无 `ACTIVE/INACTIVE/ENABLED/DISABLED` 字样） |
| 6 | `/system/tenant` 两问题 | ⚠️ **部分成立** | ISO 原文 ✅ 成立（实测 `2026-08-04T16:40:23`、`2026-08-17T09:46:50`，且全页无 `YYYY-MM-DD HH:mm:ss` 格式）；**联系人断行 ❌ 未复现**（当前数据下无换行单元格） |
| 7 | 金额小数位混排 | ✅ **成立** | `/policy/list` 41 个金额值中 `¥575.7`、`¥121.2` 为 1 位小数，`¥265`、`¥500,000`、`¥6,000,000` 为 0 位 |
| 8 | 修改密码点击无弹层 | ⏳ 未复测 | 源码含「修改密码」文案，handler 绑定待 R-201 点验 |
| 9 | AI 助手 1240×80 白条 | ✅ **成立** | 实测 `1240×80`，`left=200, top=820` —— 横跨内容区全宽 |
| 10 | 768 响应式不可用 | ✅ **成立**（措辞修正） | Sidebar 恒 **200px** 不收窄；DataPanel 恒 **280px**；内容区仅 **288px**；表格容器仅 **210px**（`scrollW 1240`）；整页 `canScrollX=false`；10 列中仅 **4 列**完全可见（原稿称「只剩 2 列」偏重）。**「完全不可达」过重** —— 表格自身横向滚动可用，但需悬停才浮现滚动条，可发现性极差 |

**另有两项归属性澄清**（原稿表述为「不确定」，实测已可判定）：

- **双滚动嵌套归属确定**：`.ti-page` `scrollHeight 1804 / clientHeight 760 / overflow-y:auto` → **它是唯一实际滚动容器**；`.app-layout__content` `scrollHeight = clientHeight = 760` **不滚动**。故非「归属不确定」，而是「外层容器冗余」。
- **固定表头缺失机制已实测证实**：表体总高 **1457px**（20 行）；表格**内部不纵向滚动**（`innerScrollable=false`）；滚动 `.ti-page` **600px** 后，表头 `top` 由 **283 → −317**，**完全移出视野**。即：滚动容器是页面而非表体，因此**列名在滚到底后不可见** —— S-06 的机制根因在此。
- **常驻 chrome 占比确认**：`200(Sidebar) + 280(DataPanel) = 480px = 33.3%` 视口，与初稿一致。

---

**以下为初稿原文（保留以存证，个别条目已由 §3.7.1 修正）：**

**走查覆盖**：成功 38 页 / 异常 4 项，基线截图 **42 张**已落盘 `docs/ui-audit/baseline-20260917/`。

**实测确认的渲染层问题**：

**走查覆盖**：成功 38 页 / 异常 4 项，基线截图 **42 张**已落盘 `docs/ui-audit/baseline-20260917/`。

**实测确认的渲染层问题**：
1. **`--el-color-primary` 运行时值实测**：本体/light-3 已覆盖；**light-5/7/8/9、dark-2、rgb 仍为出厂蓝**（与 P0-1 构建产物取证一致）
2. **[见 §3.7.1 复测]** **表格列宽溢出**（见 P0-5）+ 表体高 1457px 无固定表头
3. **[见 §3.7.1 复测]** **`/claim/config` 两接口 500 → 界面显示"暂无数据"**（P0-2 的真实复现）
4. **[已撤回]** ~~全局"实时数据"面板与看板 KPI 自相矛盾~~：DataPanel 显示今日保费 **¥1,234,567**，数据看板 KPI 显示 **¥0**，同屏冲突 → **面板数据为伪造/桩数据**
5. **[见 §3.7.1 复测]** **`/system/role`**：无搜索区、状态列直接显示**英文枚举「ACTIVE」**（同页其余文案全中文）、「分配权限」用橙色
6. **[见 §3.7.1 复测]** **`/system/tenant`**：创建时间显示 **ISO 原文 `2026-08-04T16:40:23`**（而 `/system/log` 为 `2026-09-16 10:50:32`）；联系人「出单验收管理员」**断行成「出单验收管/理员」**
7. **[见 §3.7.1 复测]** **金额格式不统一**：保单列表 `¥575.7` 与 `¥500,000` **小数位混排**
8. **[见 §3.7.1 复测]** **顶栏「修改密码」点击无任何弹层**（功能未实现但入口存在）
9. **[见 §3.7.1 复测]** **AI 助手展开为 1240×80 全宽白条**，横跨覆盖页面内容
10. **[见 §3.7.1 复测]** **768×900 响应式不可用**：侧边栏保持 200px 不收窄（占 26% 视口），内容区仅剩约 288px；保单查询 10 列只剩 2 列；产品列表被 320px 固定操作列盖满；整页无横向滚动 → **被挤掉的列完全不可达**
11. **[见 §3.7.1 复测]** **右侧面板 11px 标签**（`DataPanel` metric-card label/trend 共 8 处），低于 12px 可读下限
12. **[见 §3.7.1 复测]** 空态：保全工单搜索不存在项 → EP 默认插画 + 「暂无数据」，**无清除筛选/新建引导**；下方留白约 300px

**控制台**：Vue 层 0 warning、0 未捕获异常；6 条 error（1×401 登录前探测正常、1×404 假 ID、**3×500 静默降级为"暂无数据"**）。

---

## 四、用户决策记录（本轮获得的三项约束性决定）

> 以下三项经 AskUserQuestion 确认，为第二轮的**不可协商前提**。

### 决策 1：视觉方向 = 「收敛 + 质感升级」
**不改变信息架构与业务流程**。做两件事：
- **收敛**：修复 Element Plus 主题 token / 消除硬编码颜色 / 统一排版、间距、列宽、断点
- **质感升级**：详情页头部统一、金额列对齐、固定表头、工具提示、焦点可见、危险确认配色

### 决策 2：i18n = 从前端移除
用户原话：

> 我们大部分语言国际化，都打算在后端做而不是前端做，租户配置后期会引入语言选择，根据租户语言自动切换后台语言，因此前端项目中不需要做 i18n 可以移除。

**本轮落地含义**（与前文 3.6 的 i18n 扫描结论合并）：
- 🔴 **前提变化**：i18n 从「前端补齐」改为「前端移除」。前文"151 词条仅引用 4 条 / 1150 行硬编码"**不再是缺陷**，而是符合目标态的正常结果。
- **待执行**：`TiTable/index.vue:14,34,36,40` 的 4 处 `t()` 替换为中文常量；移除 `vue-i18n` 依赖、`src/locales/`、`main.ts:23` 的 i18n 安装、`main.ts:24` 的 `locale: zhCn` 改为显式中文（保留 EP 中文包，作为"后端下发语言前的默认值"）。
- **保留能力**：EP 内建文案（分页器/日期选择器/MessageBox）继续走 EP locale，为未来"后端下发语言 → 切换 EP locale"留出接入点。**不引入 `el-config-provider` 自动切换**（YAGNI，等后端语言能力就绪再做）。
- **文案质量仍受管**：i18n 移除不等于文案可以乱写。P0-3（向导零校验）、3.6 的动词分裂（搜索/查询/重置/刷新）、3.7 的英文枚举裸露「ACTIVE」、ISO 时间原文，**仍属需修范围**。

### 决策 3：推进策略 = 「底盘优先，再批量扫尾」
1. **第一阶段（底盘）**：设计令牌补全 + Element Plus 主题覆盖 + 共享组件增强 + `useTable` 错误状态 + 全局无障碍样式
2. **第二阶段（扫尾）**：批量清理 35 个页面

**理由**：P0-1（主题派生变量）、P0-2（错误状态契约）是**机制性根因** —— 不修底盘，页面级修改会被反复回退；且 35 页批量扫尾必须建立在"共享组件已可表达目标态"之上，否则每页各写一套，收敛目标自我否定。

---

## 五、第二轮目标契约草案（Objective Contract）

> 本节为**待用户确认**的第二轮验收标准。所有条目均设计为**可机械验证**（`validation.command`），可直接转为 harness 任务。

### 5.1　第一阶段：底盘（D 系列）

| ID | 目标 | 客观验收（validation.command） |
|---|---|---|
| **D-01** | Element Plus 主题 token 完整派生 | 构建产物中 `.ti-theme`/`:root` 声明 `--el-color-primary-light-{3,5,7,8,9}`、`--el-color-primary-dark-2`、`--el-color-primary-rgb` 共 **10 个**变量；且其声明**字节序晚于** `element-plus/dist/index.css`。运行时 Playwright 读 `getComputedStyle(document.documentElement).getPropertyValue('--el-color-primary-light-5')` **≠** `#79bbff`（出厂蓝） |
| **D-02** | 间距/字重/文本色阶/断点令牌补全 | `variables.scss` 新增 `$space-*`（4px 基准 6 档：4/8/12/16/20/24）、`$text-primary/regular/secondary/disabled`、`$font-weight-*`(400/500/600/700)、`$breakpoint-*`(sm 640/md 900/lg 1200)。**令牌数 ≥ 55**（当前 29） |
| **D-03** | 消除幻影令牌 | 全仓 `var(--ti-` 定义处 ≥ 实际引用处；或引用处清零。验收：`grep -rn 'var(--ti-' src \| wc -l` = `grep -rn -- '--ti-[a-z-]*:' src \| wc -l` 的匹配集合一致 |
| **D-04** | 颜色硬编码清零（业务色除外） | `#909399`→`$info-color`、`#303133`→`$text-primary`、`#606266`→`$text-regular`、`#c0c4cc`→`$text-disabled`、`#ebeef5`→`$border-color`、`#409eff`→`$primary-color`、`#e6a23c/#67c23a/#f56c6c`→语义令牌。验收：`grep -rEo '#(909399\|303133\|606266\|c0c4cc\|ebeef5\|409eff)' src --include=*.vue --include=*.scss \| wc -l` = **0**（`#1a3a6b` 等 ECharts JS 配置色除外，转为 TS 常量导出） |
| **D-05** | `<style scoped>` 加 `lang="scss"` | 14 个裸 `<style scoped>` 文件全部改 `lang="scss"`，使其结构上可用令牌。验收：`grep -rn '<style scoped>' src --include=*.vue \| wc -l` = **0** |
| **D-06** | `TiTable` 能力增强 | 新增 props：`stripe?`(默认 false，**改掉硬编码**)、`border?`(默认 false)、`height?`/`maxHeight?`、`showRefresh?`；新增具名插槽：`toolbar`、`error`、`empty`；内置 error 态渲染（图标+文案+重试按钮）。验收：`vue-tsc` 0 错误 + 组件单测覆盖新 props/插槽 |
| **D-07** | `useTable` 错误状态契约 | 返回值新增 `tableError: Ref<Error\|null>`；`fetchData` 增 `catch`，**网络/5xx 失败时置 `tableError` 且 `tableData` 清空**（不得再显示"暂无数据"）；`retry()` 导出。验收：新增单测 `useTable.spec.ts` —— mock fetchFn reject → 断言 `tableError.value !== null` 且 `tableData.value.length === 0` |
| **D-08** | 全局无障碍与焦点样式 | `index.scss` 新增 `:focus-visible` 全局样式（`outline: 2px solid $primary-color; outline-offset: 2px`）；新增 `.ti-icon-btn-tip` 约定 + `TiTable` 操作列图标按钮统一带 `aria-label`。验收：`grep -rn 'focus-visible' src/assets/styles/ \| wc -l` ≥ 1 |
| **D-09** | 危险确认配色 | 全站危险类 `ElMessageBox.confirm` 补 `confirmButtonClass: 'el-button--danger'`。验收：`grep -rn "confirmButtonClass" src --include=*.vue \| wc -l` ≥ 删除/停用确认点总数 |
| **D-10** | 弹窗取消不再产生未捕获 rejection | 52 处 `await ElMessageBox.confirm` 统一改为 `.catch(() => false)` 模式或 `main.ts` 注册 `unhandledrejection` 兜底（二选一，取后者成本更低）。验收：Playwright 打开任一删除确认弹窗点"取消"，`browser_console_messages` 无 unhandled rejection |
| **D-11** | 统一圆角与断点 | `--el-border-radius-base` 由 4px 覆盖为 **6px**（与卡片 8px 形成 6/8 双档而非 4/8）；CSS 断点收敛为 **2 档**。**更正**：基线实为 **4 种**（767/600/900/680），非初稿所称 10 种 —— 见 §3.5 更正说明。验收：`node scripts/ui-guard.mjs --rule=D-11` = PASS（`@media` 断点取值 ≤ 2 种） |
| **D-12** | i18n 移除（依决策 2） | 移除 `vue-i18n` 依赖与 `src/locales/`；`TiTable` 4 处 `t()` 换中文常量。验收：`grep -rn 'vue-i18n\|useI18n\|\$t(' src --include=*.ts --include=*.vue \| wc -l` = **0**；`package.json` 无 `vue-i18n` |

### 5.2　第二阶段：批量扫尾（S 系列）

| ID | 目标 | 客观验收 |
|---|---|---|
| **S-01** | 四段式骨架遵守率 100% | 29 个列表页全部使用 `.ti-page` + `TiSearchForm` + `.ti-toolbar` + `TiTable`。验收：脚本统计达标页数 = 29 |
| **S-02** | 搜索动词统一 | 全站检索动词仅「搜索」+「重置」两种；`.ti-toolbar` 内裸 inline form 清零。验收：`grep -rn '>查询<' src --include=*.vue \| wc -l` = **0**；4 个未采用页改用 `TiSearchForm` |
| **S-03** | 操作列收敛 | 19 个未采用 `.ti-action-column` 的页面全部采用；操作列宽度取值 **≤ 5 档**；>4 个平铺按钮的页面（`pricing-plans` 6 个、`product/list` 7 个、`clause/list` 6 个、`workbench` 7 个）收敛为「3 主 + 更多下拉」。验收：`grep -rEo 'class="[^"]*ti-action-column' src --include=*.vue \| wc -l` = 31 |
| **S-04** | 金额列右对齐 + 千分位 | 全站金额列统一 `align="right"` + 格式化函数（统一 2 位小数 + 千分位）。验收：`grep -rn 'align="right"' src/views --include=*.vue \| wc -l` ≥ 金额列总数；Playwright 校验 `/policy/list` 显示 `¥575.70` 而非 `¥575.7` |
| **S-05** | 状态语义色收敛 | 停用/禁用、审批、提交、详情四组动词各自**唯一**颜色（停用=danger、审批=primary、提交=primary、详情=默认）。验收：脚本按按钮文案+type 做矩阵，同文案 type 唯一 |
| **S-06** | 固定表头 | 全部 20 个分页列表设 `height` 或 `max-height`（`TiTable` 传参）。验收：Playwright 在 `/policy/list` 滚到底部后，表头列名仍可见（`boundingBox().y > 0`） |
| **S-07** | 详情页骨架统一 | 8 个详情页统一为一个 `TiDetailHeader` 组件（标题 + 返回 + 主操作），删除 7 份重复 `.detail-header` scoped 声明。验收：`grep -rn '\.detail-header' src/views --include=*.vue \| wc -l` ≤ 1 |
| **S-08** | 表单标签宽度收敛 | `label-width` 取值 **≤ 3 档**（推荐 100/120/140）。验收：`grep -rEo 'label-width="[0-9]+px"' src --include=*.vue \| sort -u \| wc -l` ≤ 3 |
| **S-09** | 搜索控件宽度收敛 | 搜索区控件宽度统一走令牌（`$search-control-width` 系列）。验收：搜索区硬编码 px 宽度取值 ≤ 4 档 |
| **S-10** | 表格编辑态保护 | 24 处表格内联 `el-input-number` 增加编辑/保存态（或至少 `@change` 二次确认）。验收：`grep -rn 'el-table-column' -A5 src/views --include=*.vue \| grep -c 'el-input-number'` 对应的行内编辑点均有保护 |
| **S-11** | 危险操作防重复提交 | 7 个无 `:loading` 的弹窗提交按钮补 `:loading`。验收：`grep -rn 'el-dialog' -A50 src/views --include=*.vue` 中提交按钮 `:loading` 覆盖率 100% |
| **S-12** | 隐藏入口与桩数据清理 | 移除登录页演示账号（`login/index.vue:48`）；「修改密码」入口要么实现要么移除（`Topbar`）；DataPanel 假数据加"示例数据"标识或接真实接口。验收：Playwright 登录页无 `admin123` 文本 |

### 5.3　第三阶段：真机验收（R 系列）

| ID | 目标 | 验收 |
|---|---|---|
| **R-01** | 契约测试全绿 | 74/74 通过（不回归） |
| **R-02** | 构建零错误 | `vue-tsc` 0 错误 + `vite build` 成功 |
| **R-03** | 真机构建部署 | `npx vite build` → `docker compose up -d --build titanium-admin-web` → `http://localhost:8888` 可访问 |
| **R-04** | 全站渲染走查 | Playwright 覆盖 42 个基线页面，**0 个 console error**（除既有 401 探测）、0 个 5xx 被静默降级 |
| **R-05** | 响应式可用 | 1440×900 + 768×900 双档走查；768 档侧边栏收窄为图标栏、无列不可达 |
| **R-06** | 功能回归 | 六条核心业务链路（登录→保单查询→产品创建→核保决策→理赔受理→保全变更）手工/自动走通 |

### 5.4　质量门（已落地：`scripts/ui-guard.mjs`）

**已实现**，不再只是"拟新增"。零依赖 Node 脚本，用法：

```bash
node scripts/ui-guard.mjs              # 报告全部，按 config 目标判定，有 FAIL 即 exit 1
node scripts/ui-guard.mjs --rule=D-04  # 只校验一条（harness 任务的 validation.command 用这个）
node scripts/ui-guard.mjs --list       # 人类可读清单：实测值 vs 目标
node scripts/ui-guard.mjs --json       # 机器可读
```

**设计意图**：把「风格一致性」从**靠人记住**变成**靠脚本拦住**。目标值集中在 `scripts/ui-guard.config.json`；harness 任务完成时其对应规则由 FAIL 转 PASS，即为该任务的**客观验收**。任何后续页面新增若破坏收敛，构建期即告警。

**逃生舱**：任何一行含 `ui-guard-ignore` 注释即被跳过 —— 异常因此是**显式且可审计**的，而不是把阈值悄悄放宽。

**基线实测（2026-09-17，共 24 条规则，3 条已达标）**：

| 规则 | 基线 | 目标 | 判定 | 说明 |
|---|---:|---|---|---|
| D-01 | 2 | =10 | FAIL | EP 主题派生变量已声明 2/10 |
| D-02 | 29 | ≥55 | FAIL | 设计令牌数 |
| D-03 | 10 | ≤0 | FAIL | 幻影令牌 `--ti-text-secondary` 引用 10 处 / 定义 0 处 |
| D-04 | 90 | ≤0 | FAIL | 硬编码色值 9 种 |
| D-05 | 14 | ≤0 | FAIL | 裸 `<style scoped>` |
| D-06 | 2 | =8 | FAIL | TiTable 能力项 |
| D-07 | 0 | =4 | FAIL | useTable 错误态契约 |
| D-08 | 0 | ≥1 | FAIL | `:focus-visible` 声明 |
| D-09 | 0 | ≥15 | FAIL | `confirmButtonClass` |
| D-11 | 4 | ≤2 | FAIL | CSS 断点取值种类 |
| D-12 | 18 | ≤0 | FAIL | i18n 残留（17 处代码 + package.json + i18n 目录） |
| S-01 | **29** | =29 | **PASS** | `.ti-page` 覆盖 |
| S-01b | 22 | =29 | FAIL | TiTable 覆盖 |
| S-01c | 12 | =46 | FAIL | `.ti-action-column` 覆盖 |
| S-02 | 4 | ≤0 | FAIL | 「查询」按钮 |
| S-03 | 21 | ≤5 | FAIL | 操作列宽取值（共 46 个操作列） |
| S-04 | 3 | ≥15 | FAIL | `align="right"` |
| S-06 | 5 | ≥20 | FAIL | 固定表头 |
| S-07 | 8 | ≤1 | FAIL | `.detail-header` 重复声明 |
| S-08 | 6 | ≤3 | FAIL | `label-width` 取值 |
| S-09 | 5 | ≤4 | FAIL | 内联 `max-width` 取值 |
| S-12 | 2 | ≤0 | FAIL | 演示账号残留 |
| G-01 | **1** | ≤1 | **PASS** | `el-pagination` 单一来源 |
| G-02 | **0** | ≤0 | **PASS** | 构建零错误（由 harness 独立跑 build） |

> 三条 PASS 恰好印证 §八 结论：「局部纪律良好，缺的是唯一真源」——`.ti-page` 骨架、分页器单一来源、构建健康度都已达标。

**本轮修正的守卫自身缺陷（计入审计诚实性）**：
1. `String.prototype.match` 带 `g` 标志时**不返回捕获组** → D-03/D-11/S-03 首轮测量失真为 `undefined`。改用 `matchAll` 修复。
2. S-03 正则假设 `class-name="ti-action-column"` 在 `width` 之前，实际标记中它在**之后** → 首轮测得 0。改为先取整行 `<el-table-column>` 再提宽度。
3. 初版 S-01 只查 `.ti-page` 一条即 29/29 通过，**门槛过弱**（审计明确说"五段全齐仅 13/29"）→ 拆分为 S-01(.ti-page) / S-01b(TiTable) / S-01c(action-column)。

---

## 六、基线截图索引

**位置**：`docs/ui-audit/baseline-20260917/`（42 张 PNG，1440×900）

> ⚠️ **构建时点说明**：本节截图由**运行中的容器镜像**拍摄，该镜像构建于 **2026-09-09 16:41**，落后工作树 **16 个提交**。故截图反映的是**旧构建**，凡涉运行层结论（尤其 DataPanel 数据来源、契约对齐相关）**在重建镜像前不可作为当前事实**。§3.7 已标注需复核项。

| # | 文件 | 内容 |
|---|---|---|
| 01 | `01-login.png` | 登录页 |
| 02 | `02-dashboard.png` | 数据看板 |
| 03 | `03-product-list.png` | 产品列表 |
| 04 | `04-product-detail.png` | 产品详情 |
| 05 | `05-product-create.png` | 产品创建向导 |
| 06 | `06-policy-list.png` | 保单列表 |
| 07 | `07-policy-detail.png` | 保单详情 |
| 08 | `08-policy-application.png` | 投保单 |
| 09 | `09-policy-intention.png` | 意向单 |
| 10 | `10-clause-list.png` | 条款列表 |
| 11 | `11-clause-edit.png` | 条款编辑 |
| 12 | `12-billing-list.png` | 账单列表 |
| 13 | `13-billing-payment-operations.png` | 支付作业 |
| 14 | `14-rule-engine-list.png` | 规则引擎 |
| 15 | `15-maintenance-list.png` | 保全列表 |
| 16 | `16-maintenance-workbench.png` | 保全工作台 |
| 17 | `17-maintenance-configuration.png` | 保全配置 |
| 18 | `18-claim-list.png` | 理赔列表 |
| 19 | `19-claim-config.png` | 理赔配置中心 |
| 20 | `20-claim-config-error-tab.png` | 理赔配置（错误 tab） |
| 21 | `21-underwriting-list.png` | 核保列表 |
| 22 | `22-customer-list.png` | 客户列表 |
| 23 | `23-customer-detail.png` | 客户详情 |
| 24 | `24-channel-list.png` | 渠道列表 |
| 25 | `25-channel-commission-schemes.png` | 佣金方案 |
| 26 | `26-regulatory-list.png` | 监管报告 |
| 27 | `27-notification-list.png` | 通知列表 |
| 28 | `28-document-list.png` | 文档列表 |
| 29 | `29-system-tenant.png` | 租户管理 |
| 30 | `30-system-user.png` | 用户管理 |
| 31 | `31-system-role.png` | 角色管理 |
| 32 | `32-system-menu.png` | 菜单管理 |
| 33 | `33-system-dict.png` | 数据字典 |
| 34 | `34-system-log.png` | 操作日志 |
| 35 | `35-system-config.png` | 系统配置 |
| 36 | `36-404.png` | 404 |
| 37 | `37-dialog-create-user.png` | 弹窗：新建用户 |
| 38 | `38-dialog-change-password.png` | 弹窗：修改密码 |
| 39 | `39-ai-assistant.png` | AI 助手展开态 |
| 40 | `40-responsive-768-product-list.png` | 768 宽：产品列表 |
| 41 | `41-responsive-768-policy-list.png` | 768 宽：保单列表 |
| 42 | `42-empty-state-maintenance-search.png` | 空态：保全搜索无结果 |

> 阶段 R-201 将在**重建镜像**后按同一清单复拍，与基线逐张比对。**基线本身需先复测修正**（见上「构建时点说明」）。

---

## 七、待办与遗留风险

| # | 事项 | 状态 |
|---|---|---|
| 1 | `.planning/` 游离产物（含**另一项目 SchemaPlexAI 登录页截图** `app-1440.png`，与本项目无关） | 🔴 **删除被权限拒绝**，需用户确认后清理 |
| 2 | `login/index.vue:48` 明文演示账号 `admin / admin123` | 已列入 S-12，**上线前必须移除** |
| 3 | DataPanel「实时数据」为桩数据，与看板 KPI 同屏矛盾（¥1,234,567 vs ¥0） | 已列入 S-12 |
| 4 | AiChat 为桩实现（`setTimeout` 假回复），且展开时 1240×80 全宽白条覆盖内容 | 未列入本轮（非样式收敛范畴），**建议单独决策**：保留/移除/接真实服务 |
| 5 | `http.ts:159` 用数字 `403` 比对业务码，违反项目规约 §8.2（业务码为 8 位字符串） | 待确认是否本轮修 |
| 6 | `el-upload` 全站 0 处 → 产品/理赔文档**无法上传文件** | 属**功能缺口**非样式问题，建议单独立项 |
| 7 | EP 样式双份引入（`main.ts:6` 全量 CSS + Resolver 逐组件） | D-01 顺带收敛，构建体积可减少 |

---

## 八、结论

**第一轮评估总分 11/24，判定为「机制性不统一」而非「页面级粗糙」。**

证据结构：
- **不是**个别页面做得差 —— 44/48 页遵守 `.ti-page`（91.7%），分页器全站单一来源（离散度 0），删除操作 danger 色 100% 一致，破坏性操作确认弹窗 12/12 齐备。**局部纪律良好**。
- **而是**缺少**唯一真源**：令牌层有 29 个令牌但消费率极低（57 视图仅 14 个消费）、EP 主题只覆盖 2/10 派生变量、`TiTable` 缺 error/refresh 插槽导致骨架无法被表达、断点 10 种取值、操作列宽 19 档离散。**每页各自"合理"，合起来不成体系**。
- **体验设计 1/4 是短板中的短板**：错误状态契约覆盖 0、`:focus-visible` 0 处、`el-tooltip` 全站 2 处、详情页侧边栏无高亮、静默降级把 500 显示成"暂无数据"—— 这些是**用户会真实受伤**的地方，优先级高于视觉细节。

**第二轮策略已由用户确定**：先补底盘（D-01~D-12），再批量扫尾（S-01~S-12），最后真机验收（R-01~R-06）。以 `scripts/ui-guard.mjs` 机械守卫收敛结果，防止回归。

<!-- CHUNK-3-END -->

---

## 九、第二轮结论（2026-09-17 收官）

> **轮次**：第二轮（收敛执行）　**对应任务**：`ui-203`
> **配套报告**：[ROUND2-BASE.md](./ROUND2-BASE.md)（D 系列底盘）· [ROUND2-VERIFY.md](./ROUND2-VERIFY.md)（渲染层复验）· [ROUND2-REGRESSION.md](./ROUND2-REGRESSION.md)（功能回归）
> **方法边界**：本节评分**非独立审计**，由本批次执行者依据守卫实测值 + 全仓静态扫描给出，与 §一 的 6 路并行独立审计不同源。

### 9.1　机械守卫：3/24 → 24/24

`scripts/ui-guard.mjs` 的 24 条规则**全部达标**（基线 3/24）：

| 阶段 | 达标 | 说明 |
|---|---:|---|
| 基线（本轮开工前） | **3 / 24** | 仅 S-06 / S-09 / G-01 达标 |
| D 系列收官（`ui-012`） | **14 / 24** | D-01~D-12 十一条全绿 |
| S 系列收官（`ui-110`） | **24 / 24** | S 系列全部收敛 |
| 收官复核（`ui-203`） | **24 / 24** | `node scripts/ui-guard.mjs --list` 逐条 PASS，**无放宽 target** |

关键实测值（`--list`）：D-01 派生变量 10/10 · D-02 令牌 82（目标 ≥55） · D-03 幻影 0 · D-04 硬编码色值 0 · D-05 裸 style 0 · D-06 TiTable 能力 8/8 · D-07 useTable 契约 4/4 · D-08 `:focus-visible` 4 处 · D-09 danger 确认 15 处 · D-11 断点 2 档 · D-12 i18n 0 · S-01/S-01b `.ti-page` 29/29、TiTable 29/29 · S-01c 操作列 46/46 · S-02 「查询」0 处 · S-03 操作列宽 5 档 · S-04 金额右对齐 32 列 · S-06 固定表头 29/29 · S-07 详情页重复声明 0 · S-08 label-width 3 档 · S-12 演示账号 0 处 · G-01 分页器 1 处。

### 9.2　六支柱重新评分：11/24 → 17/24

| 支柱 | §一 基线 | 本轮 | 判分依据（可复核） |
|---|:---:|:---:|---|
| **Copywriting** | 2 | **3** | ✅ S-02「查询」清零、`TiSearchForm` 统一；D-12 i18n 按决策移除（由「契约未落地」转为「明确不做」）。⚠️ 仍扣 1 分：时间文案不统一（§9.4） |
| **Visuals** | 2 | **3** | ✅ S-01b 29/29 用 `TiTable`（**两套表格视觉语言合一**）、S-01c 46/46 统一操作列、S-07 详情页骨架重复声明 0。⚠️ 仍扣 1 分：展现层仍有未接字典列、ISO 时间直出 |
| **Color** | 2 | **4** | ✅ **三项硬指标全达标**：D-01 派生变量 10/10（基线 EP 出厂蓝 6 个）、D-03 幻影令牌 0、D-04 硬编码色值 0 |
| **Typography** | 2 | **2** | 🔴 **未改善**。令牌表已补 7 档（13px 入表），但**使用率 4/72 = 5.6%**，11 档硬编码 66 处仍在。病灶由「表缺」转为「**表闲置**」 |
| **Spacing** | 2 | **2** | 🔴 **未改善**。令牌 8 个已建，**使用率 8/263 = 3.0%**，硬编码 255 处（基线 248，**略升**） |
| **Experience Design** | 1 | **3** | ✅ D-06 error 插槽 8/8 + D-07 错误态契约 4/4（**基线 0 覆盖**）、S-06 固定表头 29/29、`ui-108` 产品创建五步校验、`ui-109` 权限码修正。⚠️ 仍扣 1 分：12 页前端零权限控制、空态无引导 |
| **合计** | **11 / 24** | **17 / 24** | 令牌层与失败路径大幅改善；**「补了令牌但未消费」成为新的主要短板** |

### 9.3　🔴 一项必须点明的边界：守卫全绿 ≠ 六支柱达标

Typography / Spacing 两支柱零改善，却是守卫全绿——**两者不矛盾，因为守卫量错了对象**：

- **D-02** 的实现是 `variables.scss` 中 `$xxx:` 的**声明计数**（`names.size`），证明「令牌**已定义**」，**与令牌是否被使用无关**。
- 而 §一 的诊断针对的是**消费侧**（「11 档字号」「248 处 px 硬编码」）。

实测（全仓 `src/` 124 个文件静态扫描）：

```
font-size:   72 处 → 走 $font-size-* 令牌  4 处 (5.6%) / 硬编码 px 66 处（11 档）
间距声明:   263 处 → 走 $space-*  令牌    8 处 (3.0%) / 硬编码 px 255 处
```

> **可复用判据**：**计数型规则必须问它数的是不是我交付的那个东西。** 本批次此前已在 S-12（数的是全文而非产物）、G-01（数的是文本而非组件）上遇到过同族问题；D-02 是第三次，且方向相反——前两次是「数多了」，这次是「数得太浅」。

### 9.4　遗留项在六支柱中的落点

| 遗留项 | 命中支柱 | 状态 |
|---|---|---|
| ISO 时间原文直出（**全站 7 页 8 列**，见 [ROUND2-CLOSURE.md](./ROUND2-CLOSURE.md) §二） | Copywriting / Visuals | 未修，本轮**扩大了实测范围**（原仅登记 1 页） |
| 字号/间距令牌闲置（5.6% / 3.0%） | Typography / Spacing | 未修，已定量 |
| DataPanel 4 处 11px 标签、AI 助手 1000×80 白条 | Typography / Spacing | 未修（属上一条的具体实例） |
| TiTable 空态无引导、12 页零权限控制 | Experience Design | 未修 |

### 9.5　未纳入守卫的契约项登记（CP1 合规项）

§5.1/§5.2 契约中的 **D-10** 与 **S-05** 不在守卫 24 条内。二者**均已论证并登记，非悄悄放宽**，此处按收官要求集中登记：

| 契约项 | 为何不在守卫内 | 登记处 | 实际状态 |
|---|---|---|---|
| **D-10** 取消弹窗不产生未捕获 rejection | 验收对象是**运行期控制台行为**，静态脚本量不了（口径差异，非遗漏） | [ROUND2-BASE.md:59](./ROUND2-BASE.md) + §四 R-7 | **已达标**：[globalError.ts:53](../../src/utils/globalError.ts#L53) 注册 `unhandledrejection` 兜底；由 R 系列真机走查覆盖 |
| **S-05** 状态语义色收敛 | `ui-107` **标题**写 S-05，但门禁是 `--rule=S-03`（量的是**操作列宽度**，非状态色；守卫**无**状态色规则） | [ROUND2-BASE.md:108](./ROUND2-BASE.md)（编号同形不同义） | ⚠️ **该交付物未被其门禁覆盖** —— 属「验收口径错位」，非本轮放宽 target，见 [ROUND2-CLOSURE.md](./ROUND2-CLOSURE.md) §三 |

> **编号体系说明**：任务**标题**里的 `S-0x` 与**门禁**里的 `--rule=S-0x` 是两套编号，同形不同义。**按「门禁为准」行事**是本批次全程采用的判据（`COLOR-CONTRACT.md:145` 已记录同源问题）。

### 9.6　一句话结论

**第二轮把「机制性不统一」收敛为「机制已统一，但令牌消费尚未跟上」**——底盘（Color/i18n/错误态/表格语言）已达标并可机械复验（24/24）；剩余短板集中在**令牌使用率**与**展现层文案格式化**两处，均为**低风险、可增量修**的收尾工作，不影响功能可用性（`ui-202` 实测：样式变更导致的业务回归 **= 0**）。

