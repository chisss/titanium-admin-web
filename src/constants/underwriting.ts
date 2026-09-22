/**
 * 核保域前端常量。
 *
 * <p>本文件承载**跨页面共用的核保状态判据**，避免同一业务规则在列表页与详情页各写一份、
 * 后续只改一处而分裂。</p>
 */

/**
 * 可出具核保结论的状态白名单（非终态）。
 *
 * <p>🔴 判据来自后端的**唯一守卫**：`DecideUnderwritingCommand` 的处理链上只有
 * `requireNotTerminal(...)`（`titanium-underwriting` `Underwriting.java:215-217`），
 * 即**凡非终态均可出结论**。本白名单与后端 `UnderwritingStatusTest` 逐一列举的
 * 非终态集合一一对应（PENDING / MANUAL_REVIEW / REVIEW / AWAITING_INFO）；
 * 其余（APPROVED / STANDARD / RATED / EXCLUDED / POSTPONED / DECLINED / REJECTED / EXPIRED）
 * 均为不可逆终态。</p>
 *
 * <p>缺陷背景：前端此前写死 `status === 'MANUAL_REVIEW'`。而超保额阈值走的是
 * `UnderwritingStatus.REVIEW`（`Underwriting.java:179`），规则结论 REFER 才产 `MANUAL_REVIEW`
 * （`RuleConclusionMappingServiceImpl`），且 `MANUAL_REVIEW` 的另一来源 `ManualReviewCommand`
 * **全仓无 HTTP 入口** —— 于是「因保额超阈值转人工」的案件在界面上永远看不到决策入口，
 * 核保员无从推进（即「核保决策死锁」）。</p>
 *
 * <p>为何用白名单而非「非终态即允许」的补集写法：终态是业务上不可逆的既成结论，其枚举值
 * 未来还会增加，用补集会让新增终态静默获得决策入口；用白名单则新增非终态只是暂时不出入口
 * （界面可见、可修），错向更安全。</p>
 */
export const DECIDABLE_UNDERWRITING_STATUSES: readonly string[] = [
  'PENDING',
  'MANUAL_REVIEW',
  'REVIEW',
  'AWAITING_INFO',
]

/**
 * 该核保案件当前是否允许出具结论。
 *
 * @param status 核保状态码；空值视为不可决策（fail-closed）
 */
export const canDecideUnderwriting = (status?: string | null): boolean =>
  !!status && DECIDABLE_UNDERWRITING_STATUSES.includes(status)

/**
 * 标的风险等级文案（码 → 中文）。
 *
 * <p>真源：后端 `UnderwritingEnum.RiskLevel`（`titanium-metadata` 核保枚举），
 * 四个值的中文名逐字抄录，不另行措辞。该枚举**在后端 t_dict_data 中无对应字典**，
 * 故调用点无从经 `useDict` 取文案，只能就地承载——这就是本表存在的理由。</p>
 *
 * <p>🔴 **为什么不并入 `TiStatusTag` 的全局兜底表**：`STANDARD` 一词在
 * `UNDERWRITING_STATUS`（核保结论）里是「标准承保」、在 `RiskLevel`（风险等级）里是
 * 「标准体」，**同一码两个语义**。若把本组四个值拆开处理（三个进兜底表、`STANDARD` 留在
 * 核保结论的文案上），就会得到最坏组合：漏传 `label` 的调用点里三个值告警、`STANDARD`
 * 却**静默显示成「标准承保」**——一句看起来合理、实则说错的话，且不触发任何告警。
 * 故整组一律不入全局表，四个值的文案全部由调用点显式指定。</p>
 */
export const RISK_LEVEL_TEXT: Record<string, string> = {
  STANDARD: '标准体',
  SUB_STANDARD: '次标准体',
  HIGH_RISK: '高风险体',
  UNINSURABLE: '不可保体',
}

/**
 * 风险等级码 → 中文文案。
 *
 * <p>未收录的码原样返回（不吞成通用兜底）——后端枚举若新增值，界面显示新码比显示
 * 「未知」更利于定位。</p>
 *
 * <p>🔴 **本组四个码的颜色不在此处承载**，而在 `TiStatusTag` 的全局 `COLOR_MAP`：
 * 标准体=绿、次标准体=橙、高风险体与不可保体=红。理由：颜色只表达褒贬强弱、与所属域无关，
 * 且这四码在后端**只属 `RiskLevel` 一个枚举**（已全仓核实），正合该表的收录判据；
 * 而文案因 `STANDARD` 一码双义（见上）必须由调用点显式指定，无法下沉。
 * 二者分开落位是**有意**的取舍，不是遗漏。</p>
 *
 * @param code 风险等级码；空值返回 `-`（与全站空值渲染口径一致）
 */
export const riskLevelLabel = (code?: string | null): string =>
  code ? RISK_LEVEL_TEXT[code] ?? code : '-'
