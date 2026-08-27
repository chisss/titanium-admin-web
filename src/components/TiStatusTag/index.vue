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
  PENDING_REVIEW: 'warning',
  INACTIVE: 'danger',
  CANCELLED: 'danger',
  TERMINATED: 'danger',
  DECLINED: 'danger',
  REJECTED: 'danger',
  EXPIRED: 'info',
  PROPOSAL: 'primary',
}

interface Props {
  /** 状态值（字典 value 或业务枚举值） */
  value: string
  /** 显示标签（已翻译） */
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

// 显示标签：优先使用传入的 label，否则显示 value
const displayLabel = computed(() => props.label || props.value)
</script>

<style scoped lang="scss">
.ti-status-tag {
  font-weight: 500;
}
</style>
