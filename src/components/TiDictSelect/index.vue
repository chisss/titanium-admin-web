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
      v-for="item in dictOptions"
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
}

const props = withDefaults(defineProps<Props>(), {
  clearable: true,
  multiple: false,
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
</script>
