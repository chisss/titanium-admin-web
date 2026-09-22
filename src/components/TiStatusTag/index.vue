<template>
  <!-- TiStatusTag：业务状态标签，自动映射颜色 -->
  <el-tag
    :type="tagType"
    :size="size"
    effect="light"
    class="ti-status-tag"
  >
    {{ displayLabel }}
  </el-tag>
</template>

<script setup lang="ts">
/** 预定义颜色映射 */
type TagType = 'primary' | 'success' | 'warning' | 'info' | 'danger'

/**
 * 状态语义色板：**码 → 颜色**，全站默认口径。
 *
 * <p><b>维护约定（🔴 补码前必读）</b>：本表按「码的业务语义」取色，**与所属域无关** ——
 * `FAILED` 在通知域、缴费域、保全域都是失败，取一次即可，不要按域各写一份。
 * 同码在不同域语义确有分野的（或需与本域其他状态拉开区分度的），**不在此处改**，
 * 由页面以 `:color` 覆盖（`:color` 优先级高于 `:value`，见下方 `tagType`）。
 * 现存页面覆盖共四处，均为有意的域内取舍，勿抹平：`notification/list`（PENDING 取灰）、
 * `regulatory/list`（PENDING 取灰、SUBMITTED 取橙）、`document/list`（GENERATED 取蓝，
 * 与已签署的绿区分）、`maintenance/configuration`（APPROVED 取蓝，与已发布的绿区分）。</p>
 *
 * <p><b>2026-09 补全背景</b>：普查 23 个状态类字典、63 个去重码，发现 **43 个码在全站任何页面
 * 都落到 `info` 灰** —— 状态列等于没有颜色（用户点名「保全项配置状态没做颜色」，
 * 实测该页 5 个状态里 3 个是灰的）。其中 `FAILED` 尤为严重：它只因 `notification/list`
 * 恰有局部映射而有色，于是**缴费失败、理赔失败、保全生效失败在各自页面全显示为灰**。
 * 新增码一律按下方分组归位，勿零散追加。</p>
 */
const COLOR_MAP: Record<string, TagType> = {
  // 通用颜色关键字 → el-tag type（调用方可直接传 'success' 这类关键字）
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  info: 'info',
  primary: 'primary',

  // ---- 启用/可用态：绿=正式生效，蓝=可用但非正式（试用、投保中） ----
  ACTIVE: 'success',
  EFFECTIVE: 'success',
  TRIAL: 'primary',
  PROPOSAL: 'primary',
  INACTIVE: 'danger', // 停用：人为关闭，取红（与「未生效」的橙区分）

  // ---- 制作→审批→发布 生命周期：灰→橙→绿→灰 ----
  DRAFT: 'info',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'success',
  PUBLISHED: 'success',
  RETIRED: 'info',
  AUDITING: 'warning', // 产品/条款审核中
  INVALID: 'info', // 产品已下架：运营动作而非故障，与草稿同归灰

  // ---- 流转中：橙=还需有人或有时间推它 ----
  PENDING: 'warning',
  SUBMITTED: 'warning',
  PENDING_AUDIT: 'warning',
  PENDING_PAYMENT: 'warning',
  PENDING_EFFECTIVE: 'warning',
  NOT_EFFECTIVE: 'warning',
  ISSUED: 'warning', // 账单域=待缴费（单证域=已签发，由页面自行覆盖）
  UNDERWRITING: 'warning',
  UNDERWRITING_SUSPENDED: 'warning',
  MANUAL_REVIEW: 'warning',
  REVIEW: 'warning',
  AWAITING_INFO: 'warning',
  AUTO_REVIEWING: 'warning',
  MANUAL_REVIEWING: 'warning',
  PENDING_REVIEW: 'warning',
  PROCESSING: 'warning',
  IN_PROGRESS: 'warning',
  // 保全任务级另两码（见 STATUS_TEXT 同位置注释）：都是「还需有人或有外部系统推它」，同归流转中
  WAITING_CONDITION: 'warning',
  WAITING_EXTERNAL: 'warning',
  QUOTED: 'warning',
  EFFECTING: 'warning', // 保全生效处理中
  GENERATING: 'warning', // 单证生成中
  SCHEDULED: 'warning', // 保全已计划=待生效
  RECEIVED: 'warning', // 支付回调已接收、尚未应用
  PARTIALLY_SETTLED: 'warning',
  CLAWBACK_PENDING: 'warning',
  READY: 'warning',
  NOT_STARTED: 'info', // 未发起≠处理中，取灰

  // ---- 核保结论：标准/核保通过=绿；加费/除外/延期附条件=橙；核保拒绝=红 ----
  STANDARD: 'success',
  RATED: 'warning',
  EXCLUDED: 'warning',
  POSTPONED: 'warning',
  UNDERWRITING_APPROVED: 'success',
  UNDERWRITING_REJECTED: 'danger',

  // ---- 核保风险等级（UnderwritingEnum.RiskLevel）：标准体/次标准体/高风险体/不可保体 ----
  // 四码只属 RiskLevel 一个枚举（已全仓核实），符合本表「按码的业务语义、与所属域无关」的收录判据。
  // · STANDARD 与上方核保结论同码**不同义**（「标准体」vs「标准承保」），但同为正向，取色一致故复用；
  // · 另三码此前在表中**一个都没有**，全部落 info 灰——风险等级列等于没有颜色（R7-20）。
  // 🔴 此处**只补颜色、不补文案**：文案在 src/constants/underwriting.ts 的 RISK_LEVEL_TEXT，
  //    因 STANDARD 一码双义而不能进本文件的 STATUS_TEXT，须由调用点显式传 label。
  SUB_STANDARD: 'warning',
  HIGH_RISK: 'danger',
  UNINSURABLE: 'danger',

  // ---- 成功终态 ----
  COMPLETED: 'success',
  SETTLED: 'success',
  PAID: 'success',
  SUCCESS: 'success', // 缴费成功/赔付成功
  APPLIED: 'success', // 已生效（保全）/已应用（支付回调）
  SIGNED: 'success',
  SENT: 'success',
  CONFIRMED: 'success',
  CONVERTED_TO_APPLICATION: 'success',
  // 🔴 「已生成」取蓝而非绿：单证/文件产出只是**中间产物**，真正的终态是「已签署」（SIGNED 绿）。
  // 全仓唯一使用点 `document/list` 本就以 `:color` 覆盖为 primary，此处补为**同值的全局默认**
  // ——两者取值一致，页面覆盖保留（显式优于隐式），不会出现"同一码两处不同色"。
  GENERATED: 'primary',

  // ---- 负向终态（红） ----
  FAILED: 'danger',
  OVERDUE: 'danger',
  REJECTED: 'danger',
  DECLINED: 'danger',
  REJECTED_CLOSED: 'danger',
  CLAWED_BACK: 'danger',
  CONFLICTED: 'danger', // 保全生效存在冲突，需人工介入
  CANCELLED: 'danger',
  TERMINATED: 'danger',
  LAPSED: 'danger',
  SUSPENDED: 'danger',

  // ---- 中性终态（灰：流程自然结束，不含褒贬） ----
  CLOSED: 'info',
  SKIPPED: 'info',
  EXPIRED: 'info',
  ARCHIVED: 'info',
  VOIDED: 'info',
  WITHDRAWN: 'info',
  // 「未知」是兜底语义本身，不含褒贬 ⇒ 中性灰（此前只在 STATUS_TEXT 有文案、COLOR_MAP 无色 ⇒ 配灰底等于没做颜色）
  UNKNOWN: 'info',
}

/**
 * 状态文案兜底表（D-501-42）
 * <p>
 * 此前 {@code displayLabel = label || value} —— **不传 `label` 就裸显英文枚举码**，
 * 实测 `/policy/detail` 页头显示 `TERMINATED`、`/billing/detail` 显示 `ISSUED`/`PENDING`。
 * 全仓 54 处调用点中 46 处已按正确方式传 `label`（多取自后端字典，**域内语义最准**），
 * 本表只作**兜底**：`label` 优先级最高，传了 label 的调用点不受本表影响。
 * </p>
 * <p>
 * 🔴 语义有歧义的码**故意不收录**（如 `ISSUED` 在账单域是「待缴费」、在单证域是「已签发」），
 * 由调用方传 `label` 明确 —— 未命中一律 `console.warn` 暴露，不允许静默回退成英文码。
 * 收录判据：**该码在所有引用它的字典中语义核心一致**。按此判据，`APPLIED` 不收录
 * —— 它在 `MAINTENANCE_EFFECT_STATUS` 是「已生效」、在 `PAYMENT_CALLBACK_STATUS` 是「已应用」，
 * 取任一个都会在另一域说错话。
 * </p>
 */
const STATUS_TEXT: Record<string, string> = {
  // 启用态
  ACTIVE: '启用',
  INACTIVE: '停用',
  EFFECTIVE: '已生效',
  TRIAL: '试用',
  // 流转中
  DRAFT: '草稿',
  PENDING: '待处理',
  PROCESSING: '处理中',
  // 🔴 保全**任务**状态（READY/IN_PROGRESS/SKIPPED）：这三码只在保全工作台使用，
  // 且后端 t_dict_type 中**无对应字典**（保全案件级用 MAINTENANCE_CASE_STATUS 的 PROCESSING，
  // 任务级用 IN_PROGRESS —— 是两层不同词汇，不能复用），故调用点无从取 label，
  // 只能由本兜底表承载。补入前该页状态列裸显英文码并逐行告警。
  IN_PROGRESS: '处理中',
  READY: '待办理',
  SKIPPED: '已跳过',
  // 🔴 同属保全任务级枚举 MaintenanceWorkflowTaskStatus（10 值域），但**此前只补了上面三码**，
  // 另外三码漏补 ⇒ 真机（PENDING 案件）逐行告警并裸显英文。判据同上一组：只在该枚举出现，语义无歧义。
  // 文案逐字取自枚举自带的中文 name，不另行措辞（避免「已报价待结算」被改写成「待结算」丢掉前半段语义）。
  WAITING_CONDITION: '等待条件判定',
  WAITING_EXTERNAL: '等待外部处理',
  QUOTED: '已报价待结算',
  PENDING_PAYMENT: '待缴费',
  PENDING_EFFECTIVE: '待生效',
  PENDING_REVIEW: '待复核',
  PENDING_APPROVAL: '待审批',
  PENDING_AUDIT: '待审核',
  AUTO_REVIEWING: '自动审核中',
  MANUAL_REVIEWING: '人工审核中',
  AUDITING: '审核中',
  PROPOSAL: '投保中',
  SUBMITTED: '已提交',
  CONFIRMED: '已确认',
  CONVERTED_TO_APPLICATION: '已转投保单',
  NOT_EFFECTIVE: '未生效',
  SCHEDULED: '已计划',
  // 核保流转与结论（UNDERWRITING_STATUS 一族）
  UNDERWRITING: '核保中',
  MANUAL_REVIEW: '人工审核',
  REVIEW: '核保复核',
  AWAITING_INFO: '待补充资料',
  STANDARD: '标准承保',
  RATED: '加费承保',
  EXCLUDED: '除外承保',
  POSTPONED: '延期承保',
  UNDERWRITING_APPROVED: '核保通过',
  UNDERWRITING_REJECTED: '核保拒绝',
  UNDERWRITING_SUSPENDED: '核保暂缓',
  // 终态
  APPROVED: '已通过',
  COMPLETED: '已完成',
  SETTLED: '已结清',
  SUCCESS: '成功',
  CLOSED: '已关闭',
  PAID: '已支付',
  PUBLISHED: '已发布',
  SIGNED: '已签署',
  GENERATED: '已生成',
  SENT: '已发送',
  RECEIVED: '已接收',
  GENERATING: '生成中',
  EFFECTING: '生效处理中',
  PARTIALLY_SETTLED: '部分结算',
  ARCHIVED: '已归档',
  RETIRED: '已退役',
  VOIDED: '作废',
  WITHDRAWN: '已撤销',
  CONFLICTED: '存在冲突',
  INVALID: '已下架',
  // 负向终态
  CANCELLED: '已取消',
  TERMINATED: '已终止',
  SUSPENDED: '已中止',
  LAPSED: '已失效',
  EXPIRED: '已过期',
  DECLINED: '已拒绝',
  REJECTED: '已拒绝',
  REJECTED_CLOSED: '拒赔结案',
  OVERDUE: '已逾期',
  CLAWBACK_PENDING: '回拨中',
  CLAWED_BACK: '已回拨',
  FAILED: '失败',
  UNKNOWN: '未知',
  NOT_STARTED: '未发起',
}

interface Props {
  /** 状态值（字典 value 或业务枚举值） */
  value: string
  /** 显示标签（已翻译）；域内语义以调用方传入的字典文案为准，优先级高于内置兜底表 */
  label?: string
  /** 强制指定颜色类型 */
  color?: string
  /** 尺寸 */
  size?: 'large' | 'default' | 'small'
}

const props = withDefaults(defineProps<Props>(), {
  size: 'small',
})

// 计算 el-tag type
const tagType = computed<TagType>(() => {
  return COLOR_MAP[props.color || ''] || COLOR_MAP[props.value] || 'info'
})

// 显示标签：传入 label > 内置兜底文案 > 原值（并告警，避免英文码静默上屏）
const displayLabel = computed(() => {
  if (props.label) return props.label
  const text = STATUS_TEXT[props.value]
  if (text) return text
  console.warn(`[TiStatusTag] 状态码 "${props.value}" 无中文文案，请调用方传 label 指定域内语义`)
  return props.value
})
</script>

<style scoped lang="scss">
.ti-status-tag {
  font-weight: 500;
}
</style>
