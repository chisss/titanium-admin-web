<template>
  <!-- TiDictSelect：字典下拉选择框，自动加载字典数据并适配当前语言 -->
  <el-select
    v-model="selectedValue"
    :placeholder="placeholder || '请选择'"
    :loading="loading"
    :clearable="clearable"
    :multiple="multiple"
    v-bind="$attrs"
  >
    <el-option
      v-for="item in selectableOptions"
      :key="item.value"
      :label="item.label"
      :value="item.value"
    >
      <span>{{ item.label }}</span>
    </el-option>
  </el-select>
</template>

<script setup lang="ts">
import { useDict } from '@/composables/useDict'

interface Props {
  /** 绑定值 */
  modelValue: string | string[] | undefined
  /** 字典类型编码 */
  dictType: string
  /** 占位文本 */
  placeholder?: string
  /** 是否可清空 */
  clearable?: boolean
  /** 是否多选 */
  multiple?: boolean
  /**
   * 需要从选项中剔除的字典值。
   * <p>用于「字典值域 ⊃ 当前场景合法值域」的字段：字典是全局值域的权威，
   * 但具体场景可能只接受其中一部分 —— 剔除而非另建字典，避免第二套权威。</p>
   */
  excludeValues?: string[]
}

const props = withDefaults(defineProps<Props>(), {
  clearable: true,
  multiple: false,
  excludeValues: () => [],
})

const emit = defineEmits<{
  'update:modelValue': [value: string | string[] | undefined]
  change: [value: string | string[] | undefined]
}>()

// 双向绑定
const selectedValue = computed({
  get: () => props.modelValue,
  set: (val) => {
    emit('update:modelValue', val)
    emit('change', val)
  },
})

// 加载字典选项
const { dictOptions, loading } = useDict(props.dictType)

// 剔除当前场景不接受的字典值（如保费试算用例的性别没有「未知/不限」语义）
const selectableOptions = computed(() =>
  props.excludeValues.length
    ? dictOptions.value.filter((item) => !props.excludeValues.includes(item.value))
    : dictOptions.value,
)
</script>
