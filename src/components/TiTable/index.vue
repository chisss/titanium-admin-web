<template>
  <!-- TiTable：封装 el-table，含工具栏、失败态与分页 -->
  <div class="ti-table-wrap">
    <!-- 工具栏：调用方操作区（#toolbar 插槽）+ 内置刷新按钮。
         两者任一存在即渲染该行，避免无操作区时留下空白带。 -->
    <div v-if="$slots.toolbar || showRefresh" class="ti-table-toolbar">
      <div class="ti-table-toolbar__main">
        <slot name="toolbar" />
      </div>
      <el-button
        v-if="showRefresh"
        size="small"
        :icon="Refresh"
        :loading="loading"
        aria-label="刷新"
        @click="emitRefresh"
      />
    </div>

    <!-- 🔴 失败态优先于空态：接口失败与「确实没有数据」必须可区分。
         此前只有 #empty 一条路径，两者都渲染成「暂无数据」——界面向用户断言
         「系统里没有这类数据」，而真相是接口挂了。默认渲染与 #error 插槽可覆盖。 -->
    <div v-if="error" class="ti-table-error" role="alert">
      <slot name="error" :error="error" :retry="emitRefresh">
        <el-icon class="ti-table-error__icon"><WarningFilled /></el-icon>
        <p class="ti-table-error__text">{{ error.message }}</p>
        <!-- 🔴 `:loading` 不能省：失败态与表格是互斥渲染的（v-if/v-else），
             重试期间错误块仍占屏，若不在此给出在途反馈，用户点完「重试」界面纹丝不动
             （调用方多在**成功时**才清错，见 useTable 的成功分支），无从判断是否点上了，
             会连点出多次并发请求。 -->
        <el-button size="small" type="primary" plain :loading="loading" @click="emitRefresh">{{ retryText }}</el-button>
      </slot>
    </div>

    <template v-else>
      <el-table
        v-loading="loading"
        :data="data"
        v-bind="$attrs"
        :stripe="stripe"
        :border="border"
        :height="height"
        :max-height="maxHeight"
        :highlight-current-row="highlightCurrentRow"
        style="width: 100%"
      >
        <slot />
        <template #empty>
          <slot name="empty"><el-empty description="暂无数据" :image-size="72" /></slot>
        </template>
      </el-table>
      <!-- 总数已知：常规分页器 -->
      <div v-if="paged && total !== null && total > 0" class="ti-pagination">
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
      <div v-else-if="paged && total === null && data.length > 0" class="ti-pagination">
        <span class="ti-total-unknown">当前页 {{ data.length }} 条，总数未知</span>
        <el-button size="small" :disabled="pageNum <= 1" @click="onPrevPage">
          上一页
        </el-button>
        <!-- 「下一页」仅在**有证据表明后面还有**时可用：本页已满 ⇒ 可能还有；本页不满 ⇒ 必是末页 -->
        <el-button size="small" :disabled="!hasNextPage" @click="onNextPage">
          下一页
        </el-button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { Refresh, WarningFilled } from '@element-plus/icons-vue'

// 🔴 D-12：前端不再持有 i18n 运行时。组件内置文案（空态、翻页）直接写中文，
// **不保留 t() 包裹**——留着 `t('common.noData')` 会让人以为切语言能变，实际不会。
// 业务文案的多语言由后端承担：字典接口随每条数据下发 `i18nLabels`（见 useDict）。
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
  /** 是否显示斑马纹。🔴 默认 `true` 与既有硬编码行为一致，存量实例观感零变化 */
  stripe?: boolean
  /** 是否显示纵向边框 */
  border?: boolean
  /** 表格高度；设置后表头固定、表体滚动 */
  height?: string | number
  /** 表格最大高度；与 height 二选一，超长时表体滚动 */
  maxHeight?: string | number
  /** 是否显示内置刷新按钮（点击 emit `refresh`） */
  showRefresh?: boolean
  /**
   * 是否分页。`false` = **全量模式**：调用方一次取全量、不分页（如
   * `claim/config` 的配置面板），此时不渲染任何分页控件。
   *
   * <p>🔴 为什么要这个开关（R9-F07）：本组件的 `page-sizes` 是**硬编码档位**
   * `[10, 20, 50, 100]`，而调用方曾传 `:page-size="9999"` 来表达「不分页」——
   * 9999 不在档位内，EP 的 sizes 选择器 `selectedLabel` 匹配失败后**回落显示裸值**，
   * 页面上于是出现「共 1 条 | 9999 | ‹1› | 前往 页」这种文案（`9999` 无「条/页」后缀）。
   * 更要紧的是：一个「只能选 9999 的分页器」本身没有任何意义。故不分页应表达为
   * **不渲染分页器**，而不是「传一个超大的 pageSize」。</p>
   */
  paged?: boolean
  /** 是否高亮当前行 */
  highlightCurrentRow?: boolean
  /**
   * 加载失败的错误对象。
   * 🔴 非空即渲染失败态（优先于空态）：调用方接 `useTable` 的 `tableError` 即可，
   * 不传则行为与既有版本完全一致。
   */
  error?: Error | null
  /** 失败态重试按钮文案（D-12 移除 i18n 后此处即为最终文案，不再引入 t()） */
  retryText?: string
}

const props = withDefaults(defineProps<Props>(), {
  total: 0,
  pageNum: 1,
  pageSize: 20,
  loading: false,
  stripe: true,
  border: false,
  height: undefined,
  maxHeight: undefined,
  showRefresh: false,
  paged: true,
  highlightCurrentRow: true,
  error: null,
  retryText: '重试',
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
  /** 请求刷新（点击内置刷新按钮或失败态重试按钮） */
  refresh: []
}>()

/** 双向绑定分页参数 */
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

/** 刷新/重试统一出口：失败态重试与工具栏刷新是同一个语义，调用方只需接一处 */
const emitRefresh = () => {
  emit('refresh')
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

<style lang="scss" scoped>
.ti-table-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: $space-3;
  gap: $space-2;
}

.ti-table-toolbar__main {
  display: flex;
  align-items: center;
  gap: $space-2;
}

.ti-table-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: $space-3;
  padding: $space-10 $space-5;
  text-align: center;
}

.ti-table-error__icon {
  font-size: $font-size-2xl;
  color: $danger-color;
}

.ti-table-error__text {
  margin: 0;
  max-width: $text-block-max-width;
  font-size: $font-size-base;
  line-height: 1.6;
  color: $text-regular;
  // 后端异常报文可能很长且无空格，强制换行避免撑破容器
  overflow-wrap: anywhere;
}
</style>
