// 布局断点常量（JS 侧）—— 🔴 与样式侧同值，改动必须两边同步
//
// 背景：断点原先是**两套各写各的字面量**——CSS 侧出现 4 种取值（767/600/900/680），
// JS 侧 6 个组件一律 `useMediaQuery('(max-width: 767px)')`。两边不一致的后果是
// 「JS 认定已是窄屏、CSS 却没切布局」：例如 700px 视口下侧边栏已收成图标栏，
// 页面却是宽屏排版，横向溢出。收口为 2 档（移动/窄桌面）后，两边必须取同一组数字。
//
// ⚠️ 为什么 CSS 与 JS 不能真正共用一份定义：
// `@media` 查询里**不允许**使用 `var(--x)`，CSS 自定义属性参与不了媒体查询求值；
// 而 SCSS 变量在编译期就被内联成字面量，JS 运行时读不到。
// 故此处是**镜像**而非单一真源，靠 tests/layout-breakpoint-contracts.test.mjs 机械校验同步，
// 任一侧改了另一侧没跟上即 `npm run test:contracts` 失败。
// 为什么不引入构建期代码生成：为 1 个数字加一条构建链路，成本远超收益（YAGNI）。

/**
 * 移动端断点（与 SCSS `$breakpoint-mobile` 同值）。
 *
 * <p>语义：**不超过**该宽度时侧边栏收为图标栏、多列表格转卡片、表单按钮转竖排。</p>
 *
 * <p>🔴 R-05 实测后由 767 修正为 768：`max-width: 767px` 把**正好 768** 的视口
 * （iPad 竖屏，最常见的平板宽度）推向桌面档，而桌面档在该宽度下不可用——
 * Sidebar 200 + DataPanel 280 占去 62.5% 视口，内容区只剩 288px、10 列仅 2 列可见；
 * 而 767 走移动档时内容区是 767px、6 列可见。1px 之差对应 479px 的内容区落差。
 * 详见 variables.scss 中该令牌处的实测表。</p>
 */
export const BREAKPOINT_MOBILE = 768

/**
 * 移动端媒体查询串。
 *
 * <p>导出**查询串本身**而非让各调用方自行拼 `(max-width: ${BREAKPOINT_MOBILE}px)`——
 * 拼接一旦散落在调用点，改数字仍要逐个改，等于没收敛。`useMediaQuery` 正好接受该串。</p>
 */
export const MEDIA_MAX_MOBILE = `(max-width: ${BREAKPOINT_MOBILE}px)`

// ⚠️ 未导出 $breakpoint-narrow(900) 的 JS 镜像：JS 侧目前**没有任何**消费方用它。
// 预先导出会变成无人使用的死常量，且掩盖「CSS 单方面用了窄桌面档」这一事实。
// 将来 JS 真需要判断窄桌面时，在此补 BREAKPOINT_NARROW 并同步契约测试。
