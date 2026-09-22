/**
 * 保单生命周期操作门禁（前端侧的**唯一真源**）。
 *
 * <p>🔴 本文件的每一条判据都来自后端聚合根的一处守卫，不做任何推测。改动前必须回读
 * `titanium-policy/titanium-policy-domain/.../aggregate/Policy.java` 并同步行号注释。</p>
 *
 * <p><b>为什么必须有这个文件</b>：保单详情页的操作菜单此前**十项里九项无任何状态门禁**
 * （仅 suspend 一项写了判断，且判的是不存在的幻码）。用户点「退保/终止」，填完一整个对话框
 * （终止原因 + 备注）才被后端以 {@code Only EFFECTIVE, SUSPENDED or LAPSED policies can be
 * terminated} 拒绝——即审计 A6 所称的「不可逆操作零门禁」。门禁写在前端不是为了替代后端校验
 * （后端仍是权威），而是为了让**不可能成功的操作不发生**：用户不该在必被拒绝的表单里浪费时间。</p>
 *
 * <p><b>为什么门禁要「禁用」而不是「隐藏」</b>：隐藏会让同一份菜单在不同状态下长得不一样，
 * 运营无法据此建立状态机心智模型；禁用 + 原因提示把「为什么现在不能做」直接教给用户。
 * 依据项目设计契约 `.impeccable.md`：<i>Disable commands that are invalid for the current
 * lifecycle state instead of relying on backend rejection.</i></p>
 */

/** 保单生命周期操作的动作键（与详情页 el-dropdown 的 command 一致） */
export type PolicyActionKey =
  | 'suspend'
  | 'resume'
  | 'terminate'
  | 'cancel'
  | 'waive'
  | 'dividend'
  | 'annuityStart'
  | 'annuityPay'
  | 'mature'
  | 'endorsement'

/**
 * 门禁判据所需的最小保单视图。
 *
 * <p>刻意只声明**实际存在于 `PolicyVO` 的字段**：`PolicyVO` 没有 `insuranceType` /
 * `premiumWaived` / `annuityPayoutPlan`，故年金与满期的险种级、计划级判据在前端**拿不到依据**
 * （详见下方 {@link POLICY_ACTION_RULES} 中相关条目的 residual 说明）。若在此凭空添加字段，
 * 门禁会静默失效——那比没有门禁更糟。</p>
 */
export interface PolicyGateSubject {
  status?: string | null
  /** 保单形态码，取 `PolicyForm`：TRADITIONAL/…/INVESTMENT_LINKED/UNIVERSAL */
  policyForm?: string | null
}

/** 单条门禁规则 */
export interface PolicyActionRule {
  /**
   * 后端守卫允许的状态白名单（空数组 = 后端未设状态前置，任意状态均可尝试）。
   * 逐一对应 Policy.java 的守卫行号，见 {@link POLICY_ACTION_RULES} 的行内注释。
   */
  statuses: readonly string[]
  /** 状态不满足时的提示文案（点明**需要什么** + 当前是什么） */
  reason: string
  /**
   * 险种/形态级追加判据的**前端能力说明**。
   * 非空表示：后端还有一层本前端拿不到数据的校验，返回值即该层要求。
   * UI 必须把这句话显示出来，把「可能被后端拒」提前告知，而不是假装门禁已经完备。
   */
  residual?: string
  /**
   * 状态之外的**可判定**追加判据（依据 PolicyVO 中确实存在的字段）。
   * 返回 null 表示通过，返回字符串表示被阻断的原因。
   */
  extraBlock?: (subject: PolicyGateSubject) => string | null
}

/**
 * 前端可见的保单状态全量码（= **读侧** `PolicyEnum.PolicyStatus`，7 个）。
 *
 * <p>🔴 判据：**前端只能用读侧码**。`PolicyVO.status` 来自查询侧投影，写侧的
 * `PolicyStatusCode` 经 `PolicyProjectionEventHandler` 映射后才落进读模型
 * （`NOT_EFFECTIVE` → `PENDING_EFFECTIVE`，见
 * `titanium-policy-query/.../PolicyProjectionEventHandler.java:284-292`），
 * 二者**不是同一套枚举**（`PolicyViewRepository.java:89` 亦注释强调「勿混用」）。</p>
 *
 * <p>🔴 历史缺陷有两层，本文件都修过：① 前端 `PolicyStatus` 类型里曾写着 `PROPOSAL` /
 * `PENDING` / `PENDING_PAYMENT` / `ACTIVE` / `PENDING_EFFECTIVE` 五个后端从不产生的码；
 * ② 修 ① 时把真源认成了**写侧** `PolicyStatusCode`，于是 `NOT_EFFECTIVE` 被当成正确值，
 * 而读侧数据里根本没有这个码——直接后果是「撤销保单」判 `NOT_EFFECTIVE` 而永不可达。
 * **口径必须是「门禁消费的数据来自哪一侧」，不是「哪个枚举看起来更权威」。**</p>
 */
export const POLICY_STATUSES = [
  'PENDING_EFFECTIVE',
  'EFFECTIVE',
  'SUSPENDED',
  'TERMINATED',
  'EXPIRED',
  'LAPSED',
  'CANCELLED',
] as const

/** 投连/万能形态：收益走账户价值与结算利率，非分红机制（`PolicyForm.isInvestmentLinked()`） */
const INVESTMENT_LINKED_FORMS = ['INVESTMENT_LINKED', 'UNIVERSAL']

/**
 * 字典 `POLICY_STATUS` 中**查询侧永不产生**的历史死码（3 个）。
 *
 * <p>🔴 根因是字典表里并存了两批数据：早期 seed 与 `admin_business_dictionary_*.sql` 各写了一份，
 * 两批的**并集 10 项**超出了读侧真实值域。死码三位：`PROPOSAL`（投保中）/`ACTIVE`（生效中）来自
 * 更早的 {@code PolicyEnum.IntentStatus} 与旧状态命名，`NOT_EFFECTIVE` 则是**写侧**
 * `PolicyStatusCode` 的码——它在读侧投影时已被映射为 `PENDING_EFFECTIVE`
 * （`PolicyProjectionEventHandler` / `PolicyViewRepository` 均注释强调「二者非同一枚举，勿混用」）。
 * live 实测：列表接口按这三个码筛选**均返回 0 条**，而 `EFFECTIVE` 返回 19 条。</p>
 *
 * <p>处置方式是**剔除而非改字典**：字典是全局值域权威，同一个 `POLICY_STATUS` 被多个页面复用，
 * 改字典会连带影响其它场景；且这些码在字典里并非「错误数据」，只是不属于本场景。
 * 消费方：保单查询页状态下拉（{@code views/policy/list/index.vue}）。</p>
 */
export const POLICY_STATUS_DEAD_CODES: string[] = ['ACTIVE', 'PROPOSAL', 'NOT_EFFECTIVE']

/**
 * 字典 `POLICY_INTENT_STATUS` 中**意向单读模型永不产生**的历史死码（2 个）。
 *
 * <p>🔴 与 `POLICY_STATUS` 同根因、**方向相反**：字典表里并存了两批数据（早期 seed 与
 * `admin_business_dictionary_*.sql`），并集 6 项超出真实值域 4 项。意向单侧真正流通的是
 * **写侧** `ProposalStatusCode`（4 码：`DRAFT`/`SUBMITTED`/`CONVERTED_TO_APPLICATION`/`VOIDED`）
 * ——`ProposalProjectionEventHandler` 把写侧枚举**原样**写入 `t_proposal_view`
 * （:78/:91/:101/:111 四处 `view.setStatus(ProposalStatusCode.xxx)`），读模型里只有写侧码。
 * 而 `CONFIRMED`/`CANCELLED` 是**读侧** `PolicyEnum.IntentStatus` 独有（该枚举 3 码中的 2 个），
 * 投影从不写入。</p>
 *
 * <p>⚠️ **勿按「哪个枚举更权威」推断**——保单查询页的死码恰好相反（`NOT_EFFECTIVE` 是**写侧**
 * 独有、读侧已被映射为 `PENDING_EFFECTIVE`）。唯一判据是**该视图的投影写入了哪一侧的码**，
 * 必须逐视图实读确认，不能从相邻页面外推。</p>
 *
 * <p>live 实测（2026-09-21，:5199）：`CONVERTED_TO_APPLICATION`（已转投保单）返回 17 条 = 全量，
 * `CONFIRMED`（已确认）与 `CANCELLED`（已作废）均返回 0 条。</p>
 *
 * <p>消费方：意向单查询页状态下拉（{@code views/policy/intention/index.vue}）。</p>
 */
export const POLICY_INTENT_STATUS_DEAD_CODES: string[] = ['CONFIRMED', 'CANCELLED']

/**
 * 字典 `POLICY_APPLICATION_STATUS` 中**投保单读模型永不产生**的历史死码（3 个）。
 *
 * <p>同上述意向单条目：本视图投影写入的是**写侧** `InsuranceStatusCode`（8 码：`DRAFT`/
 * `SUBMITTED`/`UNDERWRITING`/`UNDERWRITING_APPROVED`/`UNDERWRITING_REJECTED`/
 * `UNDERWRITING_SUSPENDED`/`ISSUED`/`VOIDED`），`InsuranceProjectionEventHandler` 五处
 * `setStatus` 全用写侧枚举。字典 11 项 = 写侧 8 码 + 读侧 `PolicyEnum.ProposalStatus` 独有的 3 码。</p>
 *
 * <p>🔴 `REJECTED` 是死码，而 `UNDERWRITING_REJECTED` 是活码——两者同时存在于字典
 * （条目 920014「已驳回」/ 920178「核保拒绝」），剔除必须**精确匹配**，勿改成前缀或包含判断，
 * 否则会误伤活码。</p>
 *
 * <p>live 实测（2026-09-21，:5199）：`ISSUED`（已承保）返回 19 条 = 全量，
 * `PENDING_AUDIT`（待审核）与 `COMPLETED`（已完成）均返回 0 条。</p>
 *
 * <p>消费方：投保单查询页状态下拉（{@code views/policy/application/index.vue}）。</p>
 */
export const POLICY_APPLICATION_STATUS_DEAD_CODES: string[] = ['PENDING_AUDIT', 'REJECTED', 'COMPLETED']

/**
 * 意向单「已转投保单」状态码（字典 `POLICY_INTENT_STATUS`）。
 *
 * <p>用于「意向单 → 投保单」的跳转入口判据：这是意向单唯一已产出下游投保单的状态。
 * live 实测（2026-09-21）该态 17 条。</p>
 *
 * <p>🔴 **状态成立只是入口显示的一半条件**：三张单据在读模型里**互缺外键**
 * （意向单视图无 `insurance_id` 列、投保单视图无 `policy_id` 列、保单视图的 `insurance_id`
 * 又被 VO 层丢弃），下游单据 ID 只能经 `bizNo` 桥取得（`getIssuanceProgress`，
 * 见 `@/api/insurance`）。故入口须「状态成立 **且** 桥返回了目标 ID」才渲染，
 * 否则会造出「状态看着对、点进去无目标」的死入口。</p>
 */
export const PROPOSAL_STATUS_CONVERTED = 'CONVERTED_TO_APPLICATION'

/**
 * 投保单「已承保」状态码（字典 `POLICY_APPLICATION_STATUS`）。
 *
 * <p>用于「投保单 → 保单」的跳转入口判据：这是投保单出单完成的终态，
 * 也是唯一已产出保单的状态。live 实测（2026-09-21）该态 19 条。</p>
 *
 * <p>🔴 入口显示条件同 {@link PROPOSAL_STATUS_CONVERTED}：须叠加桥返回的保单 ID。</p>
 */
export const INSURANCE_STATUS_ISSUED = 'ISSUED'

/**
 * 十项操作的完整门禁表。
 *
 * <p>行号指针：`Policy.java`（`titanium-policy-domain/.../aggregate/`）。</p>
 */
export const POLICY_ACTION_RULES: Record<PolicyActionKey, PolicyActionRule> = {
  // :336 `status != EFFECTIVE` → "Only EFFECTIVE policies can be suspended"
  suspend: {
    statuses: ['EFFECTIVE'],
    reason: '仅生效（EFFECTIVE）保单可中止',
  },
  // :348 `status != SUSPENDED` → "Only SUSPENDED policies can be resumed"
  resume: {
    statuses: ['SUSPENDED'],
    reason: '仅暂停（SUSPENDED）保单可恢复',
  },
  // :387-388 `currentStatus != EFFECTIVE && != SUSPENDED && != LAPSED`
  terminate: {
    statuses: ['EFFECTIVE', 'SUSPENDED', 'LAPSED'],
    reason: '仅生效、暂停或失效状态的保单可退保/终止',
  },
  // :607 `this.status.statusCode() != PolicyStatusCode.NOT_EFFECTIVE`
  //   → "Only NOT_EFFECTIVE policies can be cancelled"
  // 🔴 后端守卫判的是**写侧**码，前端拿到的却是**读侧**码：写侧 `NOT_EFFECTIVE` 经投影映射为
  //    读侧 `PENDING_EFFECTIVE`（PolicyProjectionEventHandler.java:284-292），故此处必须写
  //    `PENDING_EFFECTIVE`。此前判 `NOT_EFFECTIVE`（更早还判过 `PENDING || PENDING_EFFECTIVE`
  //    两个幻码）⇒ 本项永久 disabled，全站唯一能撤销未生效保单的入口实际不可达。
  cancel: {
    statuses: ['PENDING_EFFECTIVE'],
    reason: '仅未生效（待生效）保单可撤销',
  },
  // :1208 `status != EFFECTIVE`；:1211 `this.premiumWaived` 重复豁免拒绝
  waive: {
    statuses: ['EFFECTIVE'],
    reason: '仅生效（EFFECTIVE）保单可办理保费豁免',
    residual: '已办理过豁免的保单会被后端幂等拒绝（前端无 premiumWaived 字段，无法预先置灰）',
  },
  // :1238 `status != EFFECTIVE`；:1244 `policyForm.isInvestmentLinked()` 拒绝
  dividend: {
    statuses: ['EFFECTIVE'],
    reason: '仅生效（EFFECTIVE）保单可派发红利',
    extraBlock: (p) =>
      p.policyForm && INVESTMENT_LINKED_FORMS.includes(p.policyForm)
        ? '投连/万能险收益走账户价值与结算利率，不适用红利派发'
        : null,
  },
  // :1091 `status != EFFECTIVE`；:1094 `insuranceType != ANNUITY`；:1097 已启动拒绝
  annuityStart: {
    statuses: ['EFFECTIVE'],
    reason: '仅生效（EFFECTIVE）保单可启动年金给付',
    residual: '且须为年金险（ANNUITY）且给付期未启动——后端仍有这两层校验，前端无 insuranceType 字段',
  },
  // :1121 `this.annuityPayoutPlan == null` → "年金给付期未启动，不可给付"
  // 后端**不校验 status**，唯一前置是给付计划已启动；该字段前端同样拿不到。
  annuityPay: {
    statuses: [],
    reason: '需年金给付期已启动',
    residual: '唯一前置是给付计划已启动（前端无 annuityPayoutPlan 字段，无法预先置灰）',
  },
  // :1153 `status != EFFECTIVE`；:1158 `insuranceType != ENDOWMENT`（null 时放行）
  mature: {
    statuses: ['EFFECTIVE'],
    reason: '仅生效（EFFECTIVE）保单可满期给付',
    residual: '且须为两全险（ENDOWMENT）——后端仍有险种校验，前端无 insuranceType 字段',
  },
  // :405 `status != EFFECTIVE`；:408 `updateType.changesStatus()` 拒绝
  endorsement: {
    statuses: ['EFFECTIVE'],
    reason: '仅生效（EFFECTIVE）保单可申请批改',
    extraBlock: () => null,
    residual: '状态类变更不得走批改入口（前端选项来自 MAINTENANCE_TYPE 字典，若含状态类码将被后端拒绝）',
  },
}

/**
 * 判定某操作在当前保单状态下是否可执行。
 *
 * @param action 动作键
 * @param subject 最小保单视图
 * @returns `{ allowed, reason }` —— `reason` 在 allowed 为 true 时为空串，
 *          否则给出**可用于 tooltip 的中文原因**。
 */
export function checkPolicyAction(
  action: PolicyActionKey,
  subject: PolicyGateSubject | null | undefined,
): { allowed: boolean; reason: string } {
  const rule = POLICY_ACTION_RULES[action]
  // 保单未加载：全部禁用，且不谎称是状态问题
  if (!subject?.status) return { allowed: false, reason: '保单信息加载中' }

  if (rule.statuses.length && !rule.statuses.includes(subject.status)) {
    return { allowed: false, reason: `${rule.reason}，当前状态：${subject.status}` }
  }
  const blocked = rule.extraBlock?.(subject)
  if (blocked) return { allowed: false, reason: blocked }
  return { allowed: true, reason: '' }
}
