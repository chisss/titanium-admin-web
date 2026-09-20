<template>
  <!-- 产品管理列表页 -->
  <div class="ti-page">
    <!-- 搜索区 -->
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="产品名称">
        <el-input v-model="queryParams.name" placeholder="模糊搜索" clearable style="width: 180px" />
      </el-form-item>
      <el-form-item label="险种分类">
        <TiDictSelect
          v-model="queryParams.category"
          dict-type="INSURANCE_CATEGORY"
          style="width: 130px"
          @change="onCategoryChange"
        />
      </el-form-item>
      <el-form-item label="二级险种">
        <el-select
          v-model="queryParams.insuranceType"
          clearable
          placeholder="全部"
          :disabled="!queryParams.category"
          style="width: 150px"
        >
          <el-option v-for="opt in insuranceTypeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="产品状态">
        <TiDictSelect v-model="queryParams.status" dict-type="PRODUCT_STATUS" style="width: 130px" />
      </el-form-item>
      <el-form-item label="创建时间">
        <el-date-picker
          v-model="queryParams.dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          style="width: 220px"
        />
      </el-form-item>
    </TiSearchForm>

    <!-- 工具栏 -->
    <div class="ti-toolbar">
      <div class="ti-toolbar-left">
        <el-button type="primary" :icon="Plus" v-permission="'product:create'" @click="goCreate">
          新建产品
        </el-button>
      </div>
      <div class="ti-toolbar-right">
        <el-button :icon="Download" :loading="exporting" @click="handleExport">导出</el-button>
      </div>
    </div>

    <!-- 表格 -->
    <TiTable
      :data="tableData"
      :total="pagination.total"
      :page-num="pagination.pageNum"
      :page-size="pagination.pageSize"
      :loading="tableLoading"
      :max-height="'var(--ti-table-max-height-default)'"
      @page-change="onPageChange"
      @size-change="onSizeChange"
    >
      <el-table-column type="index" label="序号" width="60" align="center" fixed="left" />
      <el-table-column prop="productNo" label="产品号" width="180" class-name="ti-code-column">
        <template #default="{ row }"><TiCopyText :text="row.productNo || '-'" /></template>
      </el-table-column>
      <el-table-column prop="code" label="产品代码" width="180" class-name="ti-code-column">
        <template #default="{ row }">
          <TiCopyText :text="row.code" />
        </template>
      </el-table-column>
      <el-table-column prop="name" label="产品名称" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">
          <el-button link type="primary" @click="goDetail(row.id)">{{ row.name }}</el-button>
        </template>
      </el-table-column>
      <el-table-column prop="category" label="险种分类" width="100">
        <template #default="{ row }">
          {{ getCategoryLabel(row.category) }}
        </template>
      </el-table-column>
      <el-table-column prop="insuranceType" label="二级险种" width="120">
        <template #default="{ row }">
          {{ insuranceTypeLabel(row.insuranceType) }}
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="110">
        <template #default="{ row }">
          <TiStatusTag :value="row.status" :label="getStatusLabel(row.status)" />
        </template>
      </el-table-column>
      <el-table-column prop="version" label="版本" width="90" align="center">
        <template #default="{ row }">
          {{ row.version || '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="minPremium" label="最低保费" width="120" align="right">
        <template #default="{ row }">
          {{ formatAmount(row.minPremium) }}
        </template>
      </el-table-column>
      <el-table-column prop="createdBy" label="创建人" width="100" />
      <el-table-column prop="createdAt" label="创建时间" width="160">
        <template #default="{ row }">
          {{ formatDateTime(row.createdAt) }}
        </template>
      </el-table-column>
      <!-- @vue-generic {ProductVO} -->
      <el-table-column label="操作" min-width="260" fixed="right" class-name="ti-action-column">
        <template #default="{ row }">
          <!-- 平铺动作收敛为 3 个：详情/编辑/配置是各状态通用入口，状态流转收进「更多」 -->
          <el-button size="small" :icon="View" @click="goDetail(row.id)">详情</el-button>
          <el-button
            v-if="row.status === 'DRAFT'"
            size="small" :icon="Edit"
            v-permission="'product:edit'"
            @click="goEdit(row.id)"
          >
            编辑
          </el-button>
          <el-button
            size="small" :icon="Setting"
            v-permission="'product:config'"
            @click="goConfig(row.id)"
          >
            配置
          </el-button>
          <el-dropdown
            v-if="['DRAFT', 'AUDITING', 'EFFECTIVE'].includes(row.status)"
            trigger="click"
            @command="(command: string) => runRowCommand(row, command)"
          >
            <el-button size="small" :icon="MoreFilled" :loading="rowPending === actionKey(row.id, 'more')">更多</el-button>
            <template #dropdown>
              <!-- 下拉项用 hasPermission 而非 v-permission：el-dropdown-item 渲染根是 Fragment，
                   指令拿到的只是片段锚点文本节点，removeChild 摘不掉真正的 <li>（会静默失效） -->
              <!-- 🔴 权限码修正（4 处）：原写 product:submit / product:activate / product:deactivate，
                   三者在前端被使用、却在 admin 的 t_permission/t_menu 种子里 **0 命中** ⇒ 对
                   所有非超管永久隐藏（超管因权限集含 "*" 通配而掩盖了问题）。
                   真源是 ProductProxyController 的 @PreAuthorize——/submit、/approve、/reject、
                   /unpublish 四个端点**统一**写 PRODUCT_CONFIG（=product:config），故四处同码。 -->
              <el-dropdown-menu>
                <el-dropdown-item
                  v-if="row.status === 'DRAFT' && hasPermission('product:config')"
                  command="submit"
                >
                  提交审核
                </el-dropdown-item>
                <el-dropdown-item
                  v-if="row.status === 'AUDITING' && hasPermission('product:config')"
                  command="approve"
                >
                  审核通过
                </el-dropdown-item>
                <el-dropdown-item
                  v-if="row.status === 'AUDITING' && hasPermission('product:config')"
                  command="reject"
                  class="ti-dropdown-item--danger"
                >
                  驳回
                </el-dropdown-item>
                <el-dropdown-item
                  v-if="row.status === 'EFFECTIVE' && hasPermission('product:config')"
                  command="deactivate"
                  class="ti-dropdown-item--danger"
                >
                  下架
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </el-table-column>
    </TiTable>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Download, View, Edit, Setting, MoreFilled } from '@element-plus/icons-vue'
import { computed } from 'vue'
import { getProductList, approveProduct, rejectProduct, deactivateProduct, submitProductForReview, exportProducts } from '@/api/product'
import { useTable } from '@/composables/useTable'
import { useRowAction, confirmAction, actionKey } from '@/composables/useRowAction'
import { useDict } from '@/composables/useDict'
import { usePermission } from '@/composables/usePermission'
import { useUserStore } from '@/stores/user'
import { formatDateTime } from '@/utils/date'
import { formatAmount } from '@/utils/format'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import TiCopyText from '@/components/TiCopyText/index.vue'
import { insuranceTypesOf, insuranceTypeLabel } from '@/constants/insurance'
import type { ProductVO } from '@/types/business.d'

const router = useRouter()

/** 下拉权限判定：el-dropdown-item 为多根组件，v-permission 指令在此失效，须显式判断 */
const { hasPermission } = usePermission()

/**
 * 「导出」按钮的在途标志。
 *
 * <p>🔴 导出是**服务端生成 CSV**（`exportProducts` 返回 blob），行数多时是本站最慢的请求之一，
 * 而原先按钮点下去毫无变化——用户既不知道在跑、也不知道该等多久，只会反复点，
 * 每点一次都是一次全量导出。</p>
 */
const exporting = ref(false)

// 查询参数
const queryParams = reactive({
  name: '',
  category: undefined as string | undefined,
  insuranceType: undefined as string | undefined,
  status: undefined as string | undefined,
  dateRange: undefined as string[] | undefined,
})

// 二级险种选项：随一级险种大类联动
const insuranceTypeOptions = computed(() => insuranceTypesOf(queryParams.category))

// 一级险种大类变化：清空已选二级险种
const onCategoryChange = () => {
  queryParams.insuranceType = undefined
}

// 字典
const { getLabel: getCategoryLabel } = useDict('INSURANCE_CATEGORY')
const { getLabel: getStatusLabel } = useDict('PRODUCT_STATUS')

// 表格数据
const { tableData, tableLoading, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange } =
  useTable<ProductVO, typeof queryParams>((params) => {
    const { dateRange, ...rest } = params
    return getProductList({
      ...rest,
      startDate: dateRange?.[0],
      endDate: dateRange?.[1],
    } as Parameters<typeof getProductList>[0])
  }, queryParams)

// 初始加载
fetchData()

/** 行内状态推进（提交/通过/驳回/下架）的 pending 与错误兜底统一由 useRowAction 承担 */
const { rowPending, run } = useRowAction(fetchData)

const goCreate = () => router.push('/product/create')
const goDetail = (id: string) => router.push(`/product/detail/${id}`)
const goEdit = (id: string) => router.push(`/product/create?id=${id}`)
const goConfig = (id: string) => router.push(`/product/config/${id}`)

const handleSubmit = async (row: ProductVO) => {
  if (!(await confirmAction(`确认提交产品"${row.name}"审核？`, '提示', { type: 'warning' }))) return
  await run(actionKey(row.id, 'more'), async () => {
    await submitProductForReview(row.id)
    ElMessage.success('提交成功')
  })
}

// 审核通过：产品域无独立"上架/发布"态，审核通过(AUDITING→EFFECTIVE)即生效可售
const handleApprove = async (row: ProductVO) => {
  const ok = await confirmAction(
    `确认审核通过产品"${row.name}"？通过后产品即生效可售。`,
    '提示',
    { type: 'warning' },
  )
  if (!ok) return
  await run(actionKey(row.id, 'more'), async () => {
    const user = useUserStore().userInfo
    await approveProduct(row.id, { auditResult: 'PASS', auditOpinion: '审核通过', auditorId: user?.id, auditorName: user?.nickname })
    ElMessage.success('审核通过，产品已生效')
  })
}

// 驳回审核：AUDITING→DRAFT，退回修改
const handleReject = async (row: ProductVO) => {
  let input: { value: string } | null = null
  try {
    input = await ElMessageBox.prompt(`请输入驳回产品"${row.name}"的原因`, '驳回审核', {
      inputType: 'textarea',
      inputValidator: (v) => (v && v.trim() ? true : '驳回原因不能为空'),
    })
  } catch {
    return // 用户取消：prompt 同样以 reject 表达取消，必须吞掉
  }
  if (!input?.value) return
  await run(actionKey(row.id, 'more'), async () => {
    const user = useUserStore().userInfo
    await rejectProduct(row.id, { auditResult: 'REJECT', auditOpinion: input.value, auditorId: user?.id, auditorName: user?.nickname })
    ElMessage.success('已驳回')
  })
}

// 下架：EFFECTIVE→INVALID，停止新增投保
const handleDeactivate = async (row: ProductVO) => {
  const ok = await confirmAction(
    `确认下架产品"${row.name}"？此操作将停止新增投保。`,
    '警告',
    { type: 'warning', confirmButtonClass: 'el-button--danger' },
  )
  if (!ok) return
  await run(actionKey(row.id, 'more'), async () => {
    await deactivateProduct(row.id)
    ElMessage.success('下架成功')
  })
}

/** 操作列「更多」下拉派发：命令值即动作语义，与下拉项 command 一一对应 */
const runRowCommand = (row: ProductVO, command: string) => {
  const handlers: Record<string, (target: ProductVO) => void> = {
    submit: handleSubmit,
    approve: handleApprove,
    reject: handleReject,
    deactivate: handleDeactivate,
  }
  handlers[command]?.(row)
}

const handleExport = async () => {
  exporting.value = true
  try {
    // 服务端导出为 CSV（UTF-8 带 BOM，Excel 可直接打开），故扩展名须与响应格式一致
    const blob = await exportProducts(queryParams)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `产品列表_${new Date().toLocaleDateString()}.csv`
    a.click()
    // 延迟释放：立即 revoke 会使部分浏览器的下载中断
    setTimeout(() => URL.revokeObjectURL(url), 0)
  } catch {
    // 失败原因已由响应拦截器统一提示（含下游业务码语义），此处仅避免未捕获 rejection 导致「点了没反应」
    return
  } finally {
    exporting.value = false
  }
}
</script>
