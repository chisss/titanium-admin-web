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

const COLOR_MAP: Record<string, TagType> = {
  // 通用颜色关键字 → el-tag type
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  info: 'info',
  primary: 'primary',
  // 业务状态快捷映射
  ACTIVE: 'success',
  EFFECTIVE: 'success',
  APPROVED: 'success',
  COMPLETED: 'success',
  SETTLED: 'success',
  DRAFT: 'info',
  PENDING: 'warning',
  ISSUED: 'warning',
  PENDING_PAYMENT: 'warning',
  PENDING_EFFECTIVE: 'warning',
  AUTO_REVIEWING: 'warning',
  MANUAL_REVIEWING: 'warning',
  PROCESSING: 'warning',
  IN_PROGRESS: 'warning',
  READY: 'warning',
  PENDING_REVIEW: 'warning',
  SKIPPED: 'info',
  PAID: 'success',
  CLOSED: 'info',
  INACTIVE: 'danger',
  CANCELLED: 'danger',
  TERMINATED: 'danger',
  DECLINED: 'danger',
  REJECTED: 'danger',
  EXPIRED: 'info',
  PROPOSAL: 'primary',
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
  PENDING_PAYMENT: '待缴费',
  PENDING_EFFECTIVE: '待生效',
  PENDING_REVIEW: '待复核',
  AUTO_REVIEWING: '自动审核中',
  MANUAL_REVIEWING: '人工审核中',
  AUDITING: '审核中',
  PROPOSAL: '投保中',
  SUBMITTED: '已提交',
  // 终态
  APPROVED: '已通过',
  COMPLETED: '已完成',
  SETTLED: '已结清',
  CLOSED: '已关闭',
  PAID: '已支付',
  PUBLISHED: '已发布',
  SIGNED: '已签署',
  GENERATED: '已生成',
  ARCHIVED: '已归档',
  RETIRED: '已退役',
  // 负向终态
  CANCELLED: '已取消',
  TERMINATED: '已终止',
  SUSPENDED: '已中止',
  LAPSED: '已失效',
  EXPIRED: '已过期',
  DECLINED: '已拒绝',
  REJECTED: '已拒绝',
  FAILED: '失败',
  UNKNOWN: '未知',
  NOT_STARTED: '未开始',
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
