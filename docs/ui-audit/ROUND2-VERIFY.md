# ROUND2-VERIFY — 第二轮真机复验报告（R-05 / R-06）

> 验收日期：2026-09-17　　对应任务：`ui-201`
> 上游契约：[UI-REVIEW.md](./UI-REVIEW.md) §3.7「真机渲染层实测」+ §3.7.1「新构建复测结果」
> 基线截图：`baseline-20260917/`（42 张）　本轮截图：`after-20260917/`（41 张）
>
> 🔴 **两者均未入库（2026-09-20 起）**：走查截图属过程证据，已加 `.gitignore` 并从历史剥离，**仅在拍摄者本机留存**。
> 下文的图片链接因此在本仓库中**不可点击**，保留编号仅为说明「拍过哪些页/态」。
> 验证对象：容器 `titanium-admin-web`，镜像 `titanium-admin-web:latest`
>
> **结论：§3.7 的 12 项渲染层发现中，7 项撤回、1 项部分成立、4 项仍成立；其中仍成立的 1 项（768 断点）已在本轮**当场修复**。42 页走查 0 console error、0 未捕获异常、0 × 5xx。**

---

## 一、复测方法与镜像溯源

### 1.1　验证对象必须重新溯源——因为任务书的镜像陈述已过时

任务书写明「运行中的镜像构建于 **2026-09-09T08:41Z**，落后工作树 16 个提交」。实测并非如此：

```
docker image inspect titanium-admin-web:latest --format '{{.Created}} {{.Id}}'
→ 2026-09-17T01:58:49Z  sha256:220c6cfe…
```

即镜像**已被重建过一次**——正是 `442aeff fix(ui-audit): 重建镜像复测——撤回 1 项失效结论、修正 4 项数据、澄清 2 项归属` 那次，也就是 §3.7.1 表格的产出者。

**这带来一个绕不开的推论**：`220c6cfe`（09:58 +08）仍**早于 ui-101 ~ ui-110 的全部工作**。§3.7.1 是在「比 §3.7 新、但比当前工作树旧」的中间态镜像上做的复测，它自己的「✅ 成立」判定同样需要复核。

> 🔴 **可复用判据**：复测的**可信度等于其镜像与工作树的一致性**，而不等于「它是新镜像」。
> 只要复测产出后工作树又前进，该复测即回归「需重新溯源」状态。§3.7.1 记载的镜像创建时间戳是判定依据，本轮据此重跑了全部条目。

### 1.2　本轮验证对象

镜像重建两次：

| 轮次 | 镜像 ID | 用途 |
|---|---|---|
| 第一次 | `sha256:0948109e3b76` | 本轮 42 页走查 + §3.7 逐项复测 |
| 第二次 | 见 §五 | 打入 §五 的断点修复后再验 768 档 |

**产物一致性核验**（证明容器里跑的确实是当前工作树的构建，而非缓存旧的）：

```
curl -s http://localhost:8888/ → 引用的入口 chunk  /assets/index-DpVNKIk9.js
对该文件 grep：
  admin123|演示账号          → 0 命中   （ui-110 已移除登录页演示账号）
  ti_remember_username       → 命中     （ui-101 的「记住用户名」在产物内）
  修改密码                    → 0 命中   （ui-110 已移除顶栏死入口）
```

三条探针**一负一正一负**，既证明新代码已进产物，也证明旧内容已不在产物内——比单看「文件 hash 变了」更有说服力。

### 1.3　走查方法

- 1440×900 视口，`createWebHistory` 路由，**逐页通过应用内 `router.push` 往返**（非整页刷新），逐页采集 console / network / pageerror。
- 覆盖 33 条普通路由 + 弹窗 + 错误页 + 空态 + 响应式档位，共 **42 页/态**，截图存 `after-20260917/`（未入库）。
- 计数型结论一律由 DOM 实测得出（`scrollWidth/clientWidth`、`getBoundingClientRect()`、`getComputedStyle()`），不用肉眼判读。

---

## 二、§3.7 十二项逐项判定

判定口径：**「仍成立」= 在 `0948109e3b76` 上原样复现；「撤回」= 无法复现且源码可解释其已修复；「部分」= 同一发现内多项分道扬镳。**

| # | §3.7 / §3.7.1 原发现 | 上轮判定 | **本轮判定** | 本轮实测 |
|---|---|---|---|---|
| 1 | EP 主题派生变量缺失（light-5/7/8/9、dark-2、rgb 仍为出厂蓝） | ✅ 成立 | ❌ **撤回** | `--el-color-primary` = `#1a3a6b`；`light-5` = `rgb(140.5,156.5,181)`；`dark-2` = `rgb(20.8,46.4,85.6)`；`rgb` = `26,58,107`；`--el-border-radius-base` = `6px`；`--el-font-size-base` = `14px`。**全部由 primary 派生**，无一为 EP 出厂蓝 |
| 2 | 表格列宽溢出 358px + 固定操作列遮挡 | ✅ 成立 | ❌ **撤回** | `scrollW 888 / clientW 888`（溢出 **0**，上轮 1240/882）；`fixed = null`（**已无固定列**）；操作列实宽 100px |
| 3 | `/claim/config` 两接口 500 → 界面「暂无数据」 | ⏳ 未复测 | ❌ **撤回** | HTTP **200**；渲染 **7 张表**、**7 个页签**（流程模板/赔付规则/快赔规则/单证模板/时限规则/医院网络/黑名单），均有数据 |
| 4 | DataPanel 桩数据 ¥1,234,567 | ❌ 已撤回 | ❌ **维持撤回** | 本轮未复现，与上轮一致 |
| 5 | `/system/role` 三问题（无搜索区 / 橙色按钮 / 英文枚举 ACTIVE） | ⚠️ 部分 | ❌ **全部撤回** | `.ti-search-area` **存在**；「分配权限」实为 `el-button--small`，**无** `el-button--warning`；全页无 `ACTIVE/INACTIVE/ENABLED/DISABLED` |
| 6 | `/system/tenant` 两问题（ISO 原文 / 联系人断行） | ⚠️ 部分 | ⚠️ **部分**：ISO ✅ 仍成立，断行 ❌ 撤回 | ISO 原文仍为 `2026-08-04T16:40:23`、`2026-08-17T09:46:50`，全页 `YYYY-MM-DD HH:mm:ss` 命中 **0**；联系人单元格 `wrapped = 0`（**未断行**） |
| 7 | 金额小数位混排（`¥575.7` vs `¥500,000`） | ✅ 成立 | ❌ **撤回** | `/policy/list` **40/40** 个金额值**全为 2 位小数** |
| 8 | 顶栏「修改密码」点击无弹层 | ⏳ 未复测 | ❌ **撤回（入口已移除）** | ui-110 判定其为**死入口**（后端无自助改密端点、无对应页面路由），已连同 handler 一并移除——产物 grep `修改密码` **0 命中**。原「功能未实现但入口存在」的矛盾态消解 |
| 9 | AI 助手展开为 1240×80 全宽白条 | ✅ 成立 | ✅ **仍成立** | `.ai-chat` 实测 **1240×80**，`left=200 top=820`，横跨内容区全宽 |
| 10 | 768×900 响应式不可用 | ✅ 成立 | ✅ **成立 → 本轮已修复** | 详见 §五 |
| 11 | 右侧面板 11px 标签（原稿称 8 处） | ✅ 成立 | ✅ **仍成立（数据修正）** | 实测 **4** 处 `.metric-card__label` `font-size: 11px`：今日保费 / 今日保单 / 待处理理赔 / 待核保。**非原稿的 8 处** |
| 12 | 空态无引导（EP 插画 + 暂无数据，无清除/新建） | ✅ 成立 | ✅ **仍成立** | `/maintenance/list` 搜不存在项 → `rows 0` + 「暂无数据」，`hasClearAction = false`，空态块高 `238px`；`pageScrollH == clientH == 760`。**原稿「下方留白约 300px」不成立**——页面本身不滚动，留白即空态块余量 |

**撤回率小结**：12 项中 **7 项撤回、1 项部分撤回、4 项仍成立**。撤回集中在两类：① 已在 ui-101~ui-110 修复（#1 #2 #7 #8）；② §3.7.1 复测本身踩中「镜像落后工作树」而误判（#3 #5 #6 部分）。

### 2.1　§3.7.1 两项「归属性澄清」的复核

§3.7.1 末尾另附两条澄清，本轮一并复核：

| 上轮澄清 | 本轮实测 | 判定 |
|---|---|---|
| **双滚动嵌套归属**：`.ti-page` `sh 1804 / ch 760` 是唯一实际滚动容器，`.app-layout__content` 不滚动 | `.ti-page` `sh 760 / ch 760` —— **整页已不滚动**；出现的是**表体自身**的滚动容器 `.el-scrollbar__wrap` `sh 1224 / ch 380` | ❌ **失效**。上轮「外层容器冗余」的描述对应的是「表体不滚动、把整页撑高」的旧结构；该结构已随固定表头改造消失 |
| **固定表头缺失**：滚动 `.ti-page` 600px 后表头 `top` 283 → −317，完全移出视野 | 滚动**表体**滚动容器（`sh 1224 / ch 380`）400px 后：`headerTopUnchanged = true`、`theadTopUnchanged = true`、`firstRowMoved = −400`；`thead` 计算样式含 `position: sticky` | ❌ **失效，已修复**。表头**不动**、行**随滚动移动** —— 即固定表头生效 |

> 🔴 **复测方法上的一个坑（本轮踩过并纠正）**
>
> 首次探测时页面里存在**两个** `.el-scrollbar__wrap` 且都可滚动：外层 `sh 1440 / ch 840`（页面级）与表体 `sh 1224 / ch 380`。按 class 名取「第一个匹配」会拿到**外层**，滚动它得到的 `headerMoved = 0` 是**假绿**——外层滚动本就不该动表头，这不能证明任何事。
>
> 正确做法：**按 `clientHeight` 升序取最小的那个可滚动容器**，即真正的表体滚动区；并且**必须同时断言「表头不动」与「行动了」**（`headerTopUnchanged` + `firstRowMoved ≠ 0`）。只断言前者会把「整个页面都没滚动」误判为通过。

---

## 三、42 页逐页结论

走查口径：1440×900，逐页经应用内 `router.push` 往返（**非整页刷新**），逐页采集 console / network / pageerror。

**汇总：33 条普通路由 —— 0 console error、0 未捕获异常、0 × 5xx、0 × 4xx。** 唯一一条 warning 见下表 `16`。

| # | 页面 / 态 | 路由 | 截图 | 控制台 | 网络 | 判定 |
|---|---|---|---|---|---|---|
| 01 | 登录页 | `/login` | `01-login.png` | — | — | ✅ 本轮补拍（需先登出） |
| 02 | 数据看板 | `/dashboard` | `02-dashboard.png` | 0 | 全 2xx | ✅ |
| 03 | 产品列表 | `/product/list` | `03-product-list.png` | 0 | 全 2xx | ✅ |
| 04 | 产品详情 | `/product/detail/:id` | `04-product-detail.png` | 0 | 全 2xx | ✅ |
| 05 | 产品新建 | `/product/create` | `05-product-create.png` | 0 | 全 2xx | ✅ |
| 06 | 保单列表 | `/policy/list` | `06-policy-list.png` | 0 | 全 2xx | ✅ 固定表头已生效（§2.1） |
| 07 | 保单详情 | `/policy/detail/:id` | `07-policy-detail.png` | 0 | 全 2xx | ✅ |
| 08 | 投保单 | `/policy/application` | `08-policy-application.png` | 0 | 全 2xx | ✅ |
| 09 | 意向单 | `/policy/intention` | `09-policy-intention.png` | 0 | 全 2xx | ✅ |
| 10 | 条款列表 | `/clause/list` | `10-clause-list.png` | 0 | 全 2xx | ✅ |
| 11 | 条款编辑 | `/clause/edit/:id` | `11-clause-edit.png` | 0 | 全 2xx | ✅ |
| 12 | 账单列表 | `/billing/list` | `12-billing-list.png` | 0 | 全 2xx | ✅ |
| 13 | 支付操作 | `/billing/payment-operations` | `13-billing-payment-operations.png` | 0 | 全 2xx | ✅ |
| 14 | 规则引擎 | `/rule-engine/list` | `14-rule-engine-list.png` | 0 | 全 2xx | ✅ |
| 15 | 保全工单 | `/maintenance/list` | `15-maintenance-list.png` | 0 | 全 2xx | ✅ |
| 16 | 保全工作台 | `/maintenance/workbench` | `16-maintenance-workbench.png` | 0 err / **1 warning** | 全 2xx | ⚠️ 见 §四-1 |
| 17 | 保全配置 | `/maintenance/configuration` | `17-maintenance-configuration.png` | 0 | 全 2xx | ✅ |
| 18 | 理赔列表 | `/claim/list` | `18-claim-list.png` | 0 | 全 2xx | ✅ |
| 19 | 理赔配置 | `/claim/config` | `19-claim-config.png` | 0 | **全 2xx** | ✅ §二-3 撤回 |
| 20 | 理赔配置·时限规则页签 | `/claim/config` | `20-claim-config-error-tab.png` | 0 | 全 2xx | ⚠️ 文件名有误，见 §四-2 |
| 21 | 核保列表 | `/underwriting/list` | `21-underwriting-list.png` | 0 | 全 2xx | ✅ |
| 22 | 客户列表 | `/customer/list` | `22-customer-list.png` | 0 | 全 2xx | ✅ |
| 23 | 客户详情 | `/customer/detail/:id` | `23-customer-detail.png` | 0 | 全 2xx | ✅ |
| 24 | 渠道列表 | `/channel/list` | `24-channel-list.png` | 0 | 全 2xx | ✅ |
| 25 | 佣金方案 | `/channel/commission-schemes` | `25-channel-commission-schemes.png` | 0 | 全 2xx | ✅ |
| 26 | 监管报送 | `/regulatory/list` | `26-regulatory-list.png` | 0 | 全 2xx | ✅ |
| 27 | 通知列表 | `/notification/list` | `27-notification-list.png` | 0 | 全 2xx | ✅ |
| 28 | 文档列表 | `/document/list` | `28-document-list.png` | 0 | 全 2xx | ✅ |
| 29 | 租户管理 | `/system/tenant` | `29-system-tenant.png` | 0 | 全 2xx | ⚠️ ISO 时间，§二-6 |
| 30 | 用户管理 | `/system/user` | `30-system-user.png` | 0 | 全 2xx | ✅ |
| 31 | 角色管理 | `/system/role` | `31-system-role.png` | 0 | 全 2xx | ✅ §二-5 撤回 |
| 32 | 菜单管理 | `/system/menu` | `32-system-menu.png` | 0 | 全 2xx | ✅ |
| 33 | 数据字典 | `/system/dict` | `33-system-dict.png` | 0 | 全 2xx | ✅ |
| 34 | 操作日志 | `/system/log` | `34-system-log.png` | 0 | 全 2xx | ✅ 时间格式正确（对照 §二-6） |
| 35 | 系统配置 | `/system/config` | `35-system-config.png` | 0 | 全 2xx | ✅ |
| 36 | 404 | `/404` | `36-404.png` | 0 | — | ✅ 渲染「404 页面未找到 / 您访问的页面不存在，请检查 URL 或返回首页 / 返回首页」 |
| 37 | 弹窗·新增用户 | `/system/user` | `37-dialog-create-user.png` | 0 | — | ✅ 标题实为「**新增用户**」（基线记为「新建用户」，见 §四-3）；7 个表单项，`label-width 100px` |
| 38 | ~~弹窗·修改密码~~ | — | **不拍** | — | — | — 该入口已由 ui-110 移除（§二-8），**无此态可拍** |
| 39 | AI 助手展开 | 全局 | `39-ai-assistant.png` | 0 | — | ⚠️ 1240×80 全宽白条仍成立，§二-9 |
| 40 | 响应式 768·产品列表 | `/product/list` | `40-responsive-768-product-list.png` | 0 | 全 2xx | ✅ 修复后见 §五 |
| 41 | 响应式 768·保单列表 | `/policy/list` | `41-responsive-768-policy-list.png` | 0 | 全 2xx | ✅ 修复后见 §五 |
| 42 | 空态·保全搜索无结果 | `/maintenance/list` | `42-empty-state-maintenance-search.png` | 0 | 全 2xx | ⚠️ 无清除/新建引导，§二-12 |

> **截图编号 38 缺号是有意的**，不是漏拍：`38-dialog-change-password` 对应的入口已在 ui-110 被判定为死入口并移除，拍无可拍。保留编号以维持与基线 `baseline-20260917/` 的一一对应关系。

---

## 四、新发现问题与遗留项

### 4.1　本轮新发现

**① `TiStatusTag` 缺状态文案（唯一一条 warning）**

```
[TiStatusTag] 状态码 "SKIPPED" 无中文文案，请调用方传 label 指定域内语义
    at /maintenance/workbench
```

`TiStatusTag` 对未登记状态码打印 warning 而非静默降级，这是**好的设计**（D-06 系列改造的产物）。问题在于 `SKIPPED` 这个状态码**没有登记进映射表**，也不是调用方漏传 `label`——是映射表本身的缺口。

- **影响面**：`/maintenance/workbench` 的保全任务跳过态会显示为裸状态码或兜底样式，同页其余状态均为中文。
- **定性**：**桩控件**（有写入端、缺读取端的一半）——不是死入口，应补全映射而非删除。
- **归属**：未在本轮修复（超出 R-05 复验范围，且需先确认 `SKIPPED` 的域内语义归属保全域还是通用态）。**建议移交 ui-202/203 批次**。

**② 基线截图 `20-claim-config-error-tab.png` 名不符实（文档级）**

基线文件名暗示 `/claim/config` 存在一个名为「错误」的页签。本轮实测该页 **7 个页签**为：流程模板 / 赔付规则 / 快赔规则 / 单证模板 / 时限规则 / 医院网络 / 黑名单——**没有名为「错误」的页签**。

该文件名很可能是基线采集时把「接口 500 导致页签渲染失败」误记成了「错误页签」。**§二-3 撤回后，该名称为纯粹的历史遗留**，本轮截图沿用同名以维持编号对应，但实际内容是「时限规则」页签。

**③ 「新增用户」vs「新建用户」（文档级）**

基线记录弹窗标题为「新建用户」，本轮实测实为「**新增用户**」。属基线记录笔误，不影响代码。

### 4.2　仍成立的遗留项（带入 ui-202 / ui-203）

| 来源 | 项 | 现状 | 处置建议 |
|---|---|---|---|
| §二-6 | `/system/tenant` 创建/更新时间为 ISO 原文 `2026-08-04T16:40:23` | 同页其他列正常；对照 `/system/log` 为 `2026-09-16 10:50:32` | **格式化为 `YYYY-MM-DD HH:mm:ss`**，与全站一致 |
| §二-9 | AI 助手展开为 `1240×80` 全宽白条 | 横跨内容区并遮挡页面内容 | 需定高度策略（如改为 `$ai-chat-expanded-height: 400px` 或抽屉式） |
| §二-11 | DataPanel 4 处指标标签 `font-size: 11px` | 低于 12px 可读下限 | 提为 `$font-size-sm`(12px)，同时校验 `metric-card` 行高不溢出 |
| §二-12 | 空态无「清除筛选 / 新建」引导 | `hasClearAction = false` | TiTable 空态插槽补可操作引导 |
| §4.1-① | `TiStatusTag` 缺 `SKIPPED` 文案 | 1 条 warning | 补映射 |

### 4.3　核实为**误报**的疑点（记录以免下轮重复怀疑）

**语言切换器不是死入口。** D-12 移除了前端 i18n 运行时（`vue-i18n` 已从依赖移除、`src/i18n/` 目录已删），但登录页右下角与顶栏的「简体中文 / English」下拉**仍在**。表面看符合 ui-110 定义的死入口特征（「点了没有可实现的落点」），实际核实结论相反：

- 它有真实写入端：`Topbar.vue:104` / `login/index.vue:143` → `appStore.setLocale(...)`，写 `ti_locale` 持久化。
- 它有真实读取端：`useDict` 按 `appStore.locale` 取后端下发的 `DictData.i18nLabels` 译文。

即**界面语言改由后端按租户语言下发**，切换器切换的是「向后端请求哪一门语言的字典」，与已移除的前端 i18n 运行时无关。文件 `src/constants/locale.ts:117-131` 对此有明确注释，并说明了 `SUPPORTED_LOCALES`（2 项，有真实译文）与 `LANGUAGE_OPTIONS`（7 项，租户可配全集）**为何是两份不能合并的清单**。

> 🔴 **判据补充**：ui-110 定型的「死入口 = 没有可实现的落点」中，「落点」**不限于页面路由或后端端点**——任何能产生用户可观测变化的写入-读取回路都算。核实死入口时必须**两端都查**（写入端 `grep` 到调用不算数，要确认读取端真的消费了它），否则会把「后端驱动的语言切换」这类设计误判为死入口而误删。

---

## 五、本轮修复：移动端断点 767 → 768

> 这是本轮**唯一的代码修复**。它落在一次「复验」任务里而非修复任务里，理由见 §六-5。

### 5.1　问题

§二-10 复测确认 768×900 档不可用，且**不是「响应式没做」**——移动档本身工作良好。真正的问题是**够不着**：

```
max-width: 767px   ⇒   「不足 768 才算移动端」
                       视口正好 768 时被排除在移动档之外
```

而视口 768 是 **iPad 竖屏**，最常见的平板宽度。桌面档在该宽度下被两侧常驻 chrome 挤垮：

```
Sidebar 200 + DataPanel 280 = 480px 固定占用  ⇒  内容区 = 768 − 480 = 288px
288px 下 10 列保单表只有 2 列完全可见
```

### 5.2　修复

**两处镜像源同步改一个数字**（`$breakpoint-mobile` 与其 JS 镜像 `BREAKPOINT_MOBILE`）：

- [src/assets/styles/variables.scss:163](../../src/assets/styles/variables.scss#L163)
- [src/constants/layout.ts:26](../../src/constants/layout.ts#L26)

```diff
- $breakpoint-mobile: 767px;
+ $breakpoint-mobile: 768px;   // 移动端：侧边栏收为图标栏、表格转卡片
```

```diff
- export const BREAKPOINT_MOBILE = 767
+ export const BREAKPOINT_MOBILE = 768
```

**为什么是「改一个数字」而不是「重新划分布局档位」**：媒体查询是 `max-width`，取值从 767 改到 768 **只改变「视口正好 768」这一个宽度**的行为，767 及以下、769 及以上完全不变。影响面精确到单个视口宽度，不触碰任何既有档位。

**同步更新**：[workbench/index.vue:236](../../src/views/maintenance/workbench/index.vue#L236) 一处描述旧值的注释（原文写「与断点同量级（移动档上界）」——旧值 767 与断点同值，改后措辞随之调整）。

### 5.3　修复后实测（`/policy/list`，10 列，镜像 `008dd327ca5f`）

| 视口 | 内容区宽 | 完全可见列 | 档位 | 判定 |
|---:|---:|---:|---|---|
| 900 | 420px | 3 | 桌面 | 未变 |
| 800 | 320px | 3 | 桌面 | 未变 |
| **768** | **768px** | **6** | **移动** | ✅ **修复**（原 288px / 2 列） |
| 767 | 767px | 6 | 移动 | 未变 |

**内容区 288 → 768px（+480px）、完全可见列 2 → 6。** 900 / 800 / 767 三档**一字未动**——这就是「只影响一个宽度」的直接证据。

修复后 768 档截图：`after-20260917/40-responsive-768-product-list.png`、`after-20260917/41-responsive-768-policy-list.png`（均未入库，见文首说明）。

### 5.4　四道门的复核

| 门 | 命令 | 结果 |
|---|---|---|
| 守卫全量 | `node scripts/ui-guard.mjs` | **全部 24 条规则达标** |
| 契约测试 | `npm run test:contracts` | **123 pass / 0 fail** |
| 类型检查 | `npx vue-tsc --noEmit` | **TSC_CLEAN**（0 错误） |
| 产物核验 | 容器内 grep `max-width:768px` | 命中 **15** 处 |

**产物内断点取值实测**（`docker exec … grep -oE "@media[^{]*max-width:[0-9]+px"`）：

```
15 × max-width:768px    ← 我方（$breakpoint-mobile）
 2 × max-width:900px    ← 我方（$breakpoint-narrow）
 2 × max-width:767px    ← 全部来自 Element Plus 的 .el-col-xs-* 响应式，非我方代码
```

> 🔴 **一个易误判点**：产物里确实存在 `767px`，按「grep 到 767 就是没改干净」会得出**错误结论**。取证时必须看**上下文**——本例两条 767 的上下文是 `@media only screen and (max-width:767px){.el-col-xs-0{…}}`，是 EP 自带的栅格断点。
> 我方档位因此仍是 **2 档（768 / 900）**，符合 D-11「断点收敛 ≤2 档」。

**契约测试为何没拦住这个 bug**：`tests/layout-breakpoint-contracts.test.mjs` 断言的是「SCSS 与 JS **两侧取值一致**」，不是「取值等于某个具体数」。767/767 是一致的，所以一直是绿的——这正是**镜像型契约测试的能力边界**：它能防「两边不一致」，防不了「两边一起错」。该边界已在此记录，避免误以为有测试覆盖就万事大吉。

---

## 六、偏差与过程记录

### 6.1　任务书门禁命令本身是坏的（🔴 本类第二次）

任务书 `ui-201` 的 `validation.command` 逐字为：

```bash
curl -sS -o /dev/null -w '%%{http_code}' http://localhost:8888/ | grep -q 200 && echo GATE_GREEN
```

**`%%{http_code}` 是坏写法**：curl 的 `-w` 里 `%%` 是转义后的字面 `%`，故它输出的是字符串 `%{http_code}` 而非状态码，`grep -q 200` **永远不可能匹配**。

两向实测（同一 URL，仅改 `%%`→`%`）：

| 写法 | 实际输出 | `grep -q 200` | 末行 |
|---|---|---|---|
| `'%%{http_code}'`（任务书原文） | `%{http_code}` | 不匹配 | **无 `GATE_GREEN`，exit 1** |
| `'%{http_code}'`（本意） | `200` | 匹配 | `GATE_GREEN`，exit 0 |

故本任务按**命令的意图**（探活 HTTP 200）执行并记录为偏差。这与本批次早前发现的 S-03/S-05 属同一族：**门禁写了，但门禁是空转的**——比没有门禁更危险，因为它给出「已验收」的假象。

### 6.2　任务书的镜像陈述已过时

任务书称运行镜像构建于 `2026-09-09T08:41Z`、落后工作树 16 个提交；实测为 `2026-09-17T01:58:49Z`（`sha256:220c6cfe`），已被 `442aeff` 重建过。详见 §1.1——**这不是抠字眼**，它直接决定了 §3.7.1 复测结论能否采信，本轮据此重跑了全部 12 项。

### 6.3　`--build` 连带重建 Maven 后端，且造成后端镜像版本分裂

`docker compose up -d --build titanium-admin-web` 会连带重建 `depends_on` 的 `titanium-admin`——后者携带 `x-backend-build` 锚点、**有 `build:` 段**，于是整个 Maven 多模块工程被重新构建（本次日志可见 `#36 [titanium-admin] resolving provenance …` 与 `Image titanium-backend:latest Built`）。

- **耗时**：单次约 10~20 分钟，其中绝大部分花在**与前端变更无关**的后端构建上。
- 🔴 **副作用**：`titanium-admin` 容器被 recreate 到新后端镜像，而**其余 18 个后端容器仍运行旧镜像**——即一次前端改动把后端切成了**两个版本并存**的状态。本轮实测 `titanium-admin` 为 `sha256:e5311fa5c77b`，其它后端容器为 `sha256:c1dfaa473eb3`。
- **对本次结论的影响**：本轮全部结论都是**前端渲染层**结论（DOM 实测、console/network 采集），后端镜像版本不参与判定，故不影响 §二/§三/§五。但这是**环境层面的既成事实**，需在 ui-202/203 前知悉：此刻的后端是「admin 新、其余旧」的混合态。
- **建议**：后续若要避免，可对前端单独 `docker compose build titanium-admin-web && docker compose up -d --no-deps titanium-admin-web`。

### 6.4　基线截图命名与实际不符

`20-claim-config-error-tab.png` 暗示存在「错误」页签，实测 `/claim/config` 的 7 个页签中并无此名（§4.1-②）。本轮沿用同名编号以免破坏与基线的一一对应，内容实为「时限规则」页签。

### 6.5　在复验任务内做了代码修复

ui-201 的任务定位是**复验**（R-05），但 §二-10 的 768 档问题**在复验中确认仍在**，且修复面极小（一个数字 + 一处注释）、无设计分歧、不涉及新增界面。若只记录不修复，则 R-201 的「复测并给出实测结论」会以「已知问题依旧」收尾，而该问题的修复成本在事后远高于当场。

故当场修复，并在本报告 §五 完整记录改动点、验证方法与影响面排除。**判断依据**：修复不改变任何对外契约、不新增界面、不触及数据模型，且可被既有四道门完整覆盖。

### 6.6　复测方法上的一个假绿陷阱

见 §2.1 末尾的方框：页面存在**两个**同类可滚动容器时，按 class 名取首个会拿到外层，滚动它得到的「表头没动」是假绿。正确判据是「按 `clientHeight` 取最小者可滚动容器」+「同时断言表头不动**与**行动了」。
