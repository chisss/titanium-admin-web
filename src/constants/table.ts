/**
 * 表格尺寸常量（跨页面共用的唯一真源）。
 *
 * <p>本文件承载那些**模板属性必须消费**的表格尺寸值——`el-table-column` 的 `width` /
 * `min-width` 只接受数字，引用不到 SCSS 变量，故这类值必须以 TS 常量形式存在
 * （SCSS 侧的 `$table-action-width-*` 令牌结构上无法被模板引用，见
 * `docs/ui-audit/ROUND4-FINDINGS.md` §10.2「机制上无法消费的令牌」）。</p>
 */

/**
 * 操作列宽度档位（按列内**同时可见**的动作数量取档）。
 *
 * <p>🔴 取值依据是**真机实测**的按钮渲染宽，不是拍脑袋的档位。实测（2026-09-21，
 * Chrome @1920）：2 字带图标 64px、2 字无图标带边框 48px、3 字带图标 76px、
 * 4 字无图标 72px、4 字带图标 88px；列内需求宽 = 24（单元格左右 padding）
 * + Σ按钮宽 + 8×（按钮数−1）（按钮间距）。逐档验算（取全站该档的**最大实需**，非典型值）：</p>
 *
 * <ul>
 *   <li>1 个：最坏 100（`maintenance/list` 3 字带图标「工作台」）→ <b>120</b></li>
 *   <li>2 个：最坏 184（`rule-engine/list` 4 字带图标「查看规则」+ 2 字「停用」）→ <b>200</b></li>
 *   <li>3 个：最坏 256（`maintenance/configuration` 查看 + 编辑 + 3 字带图标）→ <b>280</b></li>
 *   <li>4 个：最坏 304（`product/list` 详情/修订/配置/更多）→ <b>320</b></li>
 * </ul>
 *
 * <p>🔴 **档位按「同时可见」的动作数定，不是按源码里写了几个**：多数操作列的动作受状态门
 * 与权限码控制（如 `commission-payables` 源码 5 个动作，但 `PARTIALLY_SETTLED` 之外的状态
 * 最多只同时出现 3 个）。定档前必须按状态互斥关系算出上界，否则会把列压窄到裁切。</p>
 *
 * <p>🔴 4 个以上动作**不设档位**：全站约定「超过 4 个平铺按钮收敛为『3 主 + 更多下拉』」
 * （`docs/ui-audit/UI-REVIEW.md` S-03）。</p>
 */
export const ACTION_COL_WIDTH: Readonly<Record<1 | 2 | 3 | 4, number>> = {
  1: 120,
  2: 200,
  3: 280,
  4: 320,
}

/**
 * 宽档特例：列内按钮文字明显长于档位假设时的取值（400）。
 *
 * <p>唯一消费方是 `product/rate-tables` —— 该列 4 个按钮均为 4~5 字且带图标
 * （实测渲染 400px 下右侧仅余 37px，即实需 363px），超出 4 档的 320。属**登记在册的单页特例**，
 * `scripts/ui-guard.mjs` 的规则 S-16（操作列宽度必须落在档位集合内）会把它连同上面四档一起
 * 放行，故新增特例必须在此登记，否则门禁失败。</p>
 */
export const ACTION_COL_WIDTH_XL = 400

/**
 * 操作列宽度的**合法取值集合**（供 `scripts/ui-guard.mjs` S-16 机械校验）。
 *
 * <p>档位值必须写成 `el-table-column` 的数字 `width` 而非 `min-width`：EP 的
 * `updateColumnsWidth`（`element-plus/es/components/table/src/table-layout.mjs`）把
 * 「无数字 width」的列判为 flex 列，当表内唯一 flex 列是操作列时，它会吸收表格全部剩余宽
 * ——实测核保工单操作列渲染 368px(@1920) / 1008px(@2560)，而列内按钮实需仅 128px。</p>
 *
 * <p>🔴 反过来，**每张表必须保留至少 1 个只写 `min-width` 的列**承接剩余宽：无 flex 列时
 * EP 走 else 分支（同文件 `:123-131`）把表格宽设为「各列宽之和」，整表比容器窄、右侧留白
 * （实测 billing/list 修前表格仅 920px、容器 1368px）。承接列的选法按表的形态分三种
 * （由 `scripts/ui-guard.mjs` S-17 保证「至少有一个」）：</p>
 *
 * <ol>
 *   <li><b>有长度不定的文本列</b>（编码/名称/描述）⇒ 只给它写 `min-width`，其余列写数字
 *       `width`。列表页常态，如 billing/list 的账单号、claim/list 的报案号。</li>
 *   <li><b>整表都是定长数据且列数少</b>（≤5）⇒ <b>全列 `min-width`</b>，让 EP 走
 *       `flexColumns.length > 1` 分支按 minWidth 比例分摊。🔴 不可只挑一列：EP 会把
 *       **全部**剩余宽砸给那一列——同型的 policy/detail 缴费计划实测状态列 990px，
 *       列内只有一个「待缴费」标签，比窄表更难看。</li>
 *   <li><b>整表都是定长控件</b>（输入框一律 150px、金额右对齐）⇒ 取操作列之前的最后一个
 *       数据列写 `min-width` 即可，分摊与单列无视觉差异（如 product/rate-tables 编辑表）。</li>
 * </ol>
 */
export const ACTION_COL_WIDTH_ALLOWED: readonly number[] = [
  ACTION_COL_WIDTH[1],
  ACTION_COL_WIDTH[2],
  ACTION_COL_WIDTH[3],
  ACTION_COL_WIDTH[4],
  ACTION_COL_WIDTH_XL,
]
