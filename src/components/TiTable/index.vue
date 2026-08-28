<template>
  <!-- TiTable：封装 el-table，含分页 -->
  <div class="ti-table-wrap">
    <el-table
      v-loading="loading"
      :data="data"
      v-bind="$attrs"
      stripe
      highlight-current-row
      style="width: 100%"
    >
      <slot />
      <template #empty>
        <slot name="empty"><el-empty :description="t('common.noData')" :image-size="72" /></slot>
      </template>
    </el-table>
    <div v-if="total > 0" class="ti-pagination">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="currentPageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        background
        @size-change="onSizeChange"
        @current-change="onCurrentChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
/** TiTable 属性 */
interface Props {
  /** 表格数据 */
  data: any[]
  /** 总条数 */
  total?: number
  /** 当前页 */
  pageNum?: number
  /** 每页条数 */
  pageSize?: number
  /** 是否加载中 */
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  total: 0,
  pageNum: 1,
  pageSize: 20,
  loading: false,
})

const emit = defineEmits<{
  /** 当前页变化 */
  'update:pageNum': [page: number]
  /** 每页条数变化 */
  'update:pageSize': [size: number]
  /** 页码改变事件 */
  'page-change': [page: number]
  /** 每页条数改变事件 */
  'size-change': [size: number]
}>()

// 双向绑定分页参数
const currentPage = computed({
  get: () => props.pageNum,
  set: (val) => emit('update:pageNum', val),
})

const currentPageSize = computed({
  get: () => props.pageSize,
  set: (val) => emit('update:pageSize', val),
})

const onCurrentChange = (page: number) => {
  emit('page-change', page)
}

const onSizeChange = (size: number) => {
  emit('size-change', size)
}
</script>
