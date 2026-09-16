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
    <!-- 总数已知：常规分页器 -->
    <div v-if="total !== null && total > 0" class="ti-pagination">
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
    <!-- 总数未知（🔴 D-501-57）：不渲染页码与总数，只给「上一页/下一页」+ 本页条数。
         下游只返回裸数组时代理层无从推断全量条数，此时把「未知」如实表达为未知——
         原实现以当前页条数冒充总数，用户看到「共 20 条」（实际 34 条），第 2 页永远不可达。 -->
    <div v-else-if="total === null && data.length > 0" class="ti-pagination">
      <span class="ti-total-unknown">{{ t('common.totalUnknown', { count: data.length }) }}</span>
      <el-button size="small" :disabled="pageNum <= 1" @click="onPrevPage">
        {{ t('common.prevPage') }}
      </el-button>
      <!-- 「下一页」仅在**有证据表明后面还有**时可用：本页已满 ⇒ 可能还有；本页不满 ⇒ 必是末页 -->
      <el-button size="small" :disabled="!hasNextPage" @click="onNextPage">
        {{ t('common.nextPage') }}
      </el-button>
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
  /** 总条数；`null` 表示总数未知（🔴 D-501-57），此时渲染无总数的翻页控件 */
  total?: number | null
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

/** 本页已满 ⇒ 后面可能还有数据；本页不满 ⇒ 必是末页（唯一可证伪「还有下一页」的证据） */
const hasNextPage = computed(() => props.data.length >= props.pageSize)

const emitPage = (page: number) => {
  emit('update:pageNum', page)
  onCurrentChange(page)
}

const onPrevPage = () => emitPage(props.pageNum - 1)

const onNextPage = () => emitPage(props.pageNum + 1)
</script>
