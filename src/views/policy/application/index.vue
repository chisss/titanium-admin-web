<template>
  <!-- 投保单查询列表页 -->
  <div class="ti-page">
    <!-- 搜索区 -->
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="投保单号">
        <el-input v-model="queryParams.insuranceNo" placeholder="精确查询" clearable style="width: 180px" />
      </el-form-item>
      <el-form-item label="投保状态">
        <!-- 🔴 剔除字典中的历史死码（读侧 ProposalStatus 独有、投影从不写入）：选中它们只会得到 0 条 -->
        <TiDictSelect
          v-model="queryParams.status"
          dict-type="POLICY_APPLICATION_STATUS"
          :exclude-values="POLICY_APPLICATION_STATUS_DEAD_CODES"
          placeholder="请选择"
          style="width: 140px"
        />
      </el-form-item>
      <el-form-item label="投保日期">
        <el-date-picker
          v-model="queryParams.dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          style="width: 240px"
        />
      </el-form-item>
    </TiSearchForm>

    <!-- 工具栏 -->
    <div class="ti-toolbar">
      <div class="ti-toolbar-left">
        <span class="toolbar-stat">
          <!-- 🔴 D-501-57：总数未知时不得显示猜测值，如实说明并给出本页条数 -->
          <template v-if="pagination.total === null">本页 <b>{{ tableData.length }}</b> 条，总数未知</template>
          <template v-else>共 <b>{{ pagination.total }}</b> 条投保单</template>
        </span>
      </div>
      <div class="ti-toolbar-right">
        <el-button :icon="Download" @click="handleExport">导出</el-button>
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
      row-key="insuranceId"
      @page-change="onPageChange"
      @size-change="onSizeChange"
      :error="tableError"
      @refresh="retry"
    >
      <el-table-column type="index" label="序号" width="60" align="center" fixed="left" />
      <el-table-column prop="insuranceNo" label="投保单号" width="180" fixed="left">
        <template #default="{ row }">
          <TiCopyText :text="row.insuranceNo" />
        </template>
      </el-table-column>
      <el-table-column prop="bizNo" label="出单业务号" min-width="190" show-overflow-tooltip />
      <el-table-column prop="status" label="投保状态" width="120">
        <template #default="{ row }">
          <TiStatusTag :value="row.status" :label="getStatusLabel(row.status)" />
        </template>
      </el-table-column>
      <el-table-column prop="exactPremium" label="总保费" width="130" align="right">
        <template #default="{ row }">
          {{ formatAmount(row.exactPremium) }}
        </template>
      </el-table-column>
      <el-table-column prop="lineCount" label="险种段" width="90" align="center" />
      <el-table-column prop="createTime" label="投保时间" width="180">
        <template #default="{ row }">
          {{ formatDateTime(row.createTime) }}
        </template>
      </el-table-column>
      <!-- @vue-generic {InsuranceVO} -->
      <el-table-column label="操作" width="120" fixed="right" class-name="ti-action-column">
        <template #default="{ row }">
          <el-button size="small" :icon="View" @click="openDetail(row.insuranceId)">详情</el-button>
        </template>
      </el-table-column>
    </TiTable>

    <el-dialog
      v-model="detailVisible"
      title="投保单详情"
      width="min(860px, 92vw)"
      destroy-on-close
    >
      <div v-loading="detailLoading" class="detail-content">
        <el-descriptions v-if="insuranceDetail" :column="detailColumns" border>
          <el-descriptions-item label="投保单号">{{ insuranceDetail.insuranceNo }}</el-descriptions-item>
          <el-descriptions-item label="出单业务号">{{ insuranceDetail.bizNo || '-' }}</el-descriptions-item>
          <el-descriptions-item label="投保状态">
            <TiStatusTag
              :value="insuranceDetail.status"
              :label="getStatusLabel(insuranceDetail.status)"
            />
          </el-descriptions-item>
          <el-descriptions-item label="保单形态">{{ insuranceDetail.policyForm || '-' }}</el-descriptions-item>
          <el-descriptions-item label="被保险人数">{{ insuranceDetail.insuredCount ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="险种分类">{{ insuranceDetail.insuranceType || '-' }}</el-descriptions-item>
          <el-descriptions-item label="基本保额">
            {{ formatAmount(insuranceDetail.sumInsured, insuranceDetail.currency) }}
          </el-descriptions-item>
          <el-descriptions-item label="总保费">
            {{ formatAmount(insuranceDetail.exactPremium, insuranceDetail.currency) }}
          </el-descriptions-item>
          <el-descriptions-item label="缴费频率">{{ insuranceDetail.paymentFrequency || '-' }}</el-descriptions-item>
          <el-descriptions-item label="缴费年数">{{ insuranceDetail.premiumPaymentYears ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="收费方式">{{ insuranceDetail.collectionMode || '-' }}</el-descriptions-item>
          <el-descriptions-item label="险种段数量">{{ insuranceDetail.lineCount ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="保险起期">
            {{ formatDateTime(insuranceDetail.insurancePeriodStart) }}
          </el-descriptions-item>
          <el-descriptions-item label="保险止期">
            {{ formatDateTime(insuranceDetail.insurancePeriodEnd) }}
          </el-descriptions-item>
          <el-descriptions-item label="核保结论">
            {{ insuranceDetail.underwritingResultCode || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="承保时间">{{ formatDateTime(insuranceDetail.issuedTime) }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatDateTime(insuranceDetail.createTime) }}</el-descriptions-item>
          <el-descriptions-item label="更新时间" :span="2">
            {{ formatDateTime(insuranceDetail.updateTime) }}
          </el-descriptions-item>
        </el-descriptions>
      </div>

      <!-- 🔴 footer 为新增：跳转入口需要落点，且关闭按钮此前只能靠右上角 ×。
           按钮**仅在真有下游保单时**出现（见 canGoToPolicy）。 -->
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
        <el-button
          v-if="canGoToPolicy"
          type="primary"
          :icon="Right"
          @click="goToPolicy"
        >
          查看保单
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Download, Right, View } from '@element-plus/icons-vue'
import { getInsuranceDetail, getInsuranceList, getIssuanceProgress, type InsuranceVO } from '@/api/insurance'
import { useTable } from '@/composables/useTable'
import { formatDateTime } from '@/utils/date'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiCopyText from '@/components/TiCopyText/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import { useDetailColumns } from '@/composables/useDetailColumns'
import { useDict } from '@/composables/useDict'
import { INSURANCE_STATUS_ISSUED, POLICY_APPLICATION_STATUS_DEAD_CODES } from '@/constants/policy'
import { formatAmount } from '@/utils/format'

const router = useRouter()
const route = useRoute()

/** 投保单查询参数 */
const queryParams = reactive({
  insuranceNo: '',
  holderId: '',
  productId: '',
  status: undefined as string | undefined,
  dateRange: undefined as string[] | undefined,
})

const { getLabel: getStatusLabel } = useDict('POLICY_APPLICATION_STATUS')

/** 表格数据 */
const { tableData, tableLoading, tableError, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange, retry } =
  useTable<InsuranceVO, typeof queryParams>((params) => {
    const { dateRange, ...rest } = params
    // 注意：后端暂不支持日期范围查询，先去掉 dateRange
    return getInsuranceList(rest)
  }, queryParams)

// 初始加载
fetchData()

/** 描述区：字段中短，宽屏 2 档 */
const detailColumns = useDetailColumns(2)

const detailVisible = ref(false)
const detailLoading = ref(false)
const insuranceDetail = ref<InsuranceVO>()

/**
 * 下游保单 ID（跳转入口的落点）。
 *
 * <p>🔴 **不能只靠状态判定入口是否显示**：投保单视图 `t_insurance_view` 无 `policy_id` 列
 * （投保单与保单之间在读模型里没有任何外键），保单 ID 只能经 `bizNo` 桥从出单进度取
 * （`getIssuanceProgress`）。状态为「已承保」但桥没给出 ID 时**不显示按钮** ——
 * 否则是「点进去无目标」的死入口。</p>
 */
const linkedPolicyId = ref<string>()

/**
 * 取下游保单 ID；拿不到一律返回 undefined 而非抛出（辅助请求，失败不影响主视图）。
 *
 * <p>取首张保单：出单进度表的 `policy_ids` 列只在**拆分出单策略**下非空
 * （live 实测 2026-09-21：107 行中 0 行，全部为合并策略的单张保单），
 * 故当前不存在需要展示多张的场景；若将来启用拆分策略，此处应改为列表让用户选择。</p>
 */
const loadLinkedPolicyId = async (bizNo?: string): Promise<string | undefined> => {
  if (!bizNo) return undefined
  try {
    return (await getIssuanceProgress(bizNo))?.policies?.[0]?.policyId || undefined
  } catch {
    return undefined
  }
}

/** 跳转入口可见性：状态「已承保」**且**桥返回了目标 ID —— 两者缺一不可 */
const canGoToPolicy = computed(
  () => insuranceDetail.value?.status === INSURANCE_STATUS_ISSUED && !!linkedPolicyId.value,
)

/**
 * 打开投保单详情（🔴 单一入口）。
 * 列表行点击与「从意向单带 insuranceId 跳入」共用同一路径 —— 两套打开逻辑必然漂移。
 */
const openDetail = async (insuranceId: string) => {
  if (!insuranceId) return
  detailVisible.value = true
  detailLoading.value = true
  insuranceDetail.value = undefined
  linkedPolicyId.value = undefined
  try {
    insuranceDetail.value = await getInsuranceDetail(insuranceId)
  } catch {
    // 详情自身失败：拦截器已弹业务消息，关闭空对话框即可（与改动前口径一致）
    detailVisible.value = false
    detailLoading.value = false
    return
  }
  detailLoading.value = false
  linkedPolicyId.value = await loadLinkedPolicyId(insuranceDetail.value.bizNo)
}

/** 跳保单详情页（保单详情有独立路由，直接跳） */
const goToPolicy = () => {
  detailVisible.value = false
  router.push(`/policy/detail/${linkedPolicyId.value}`)
}

/**
 * 从意向单带 `?insuranceId=` 跳进来时直接打开详情
 * （投保单详情是对话框、无独立路由，故经 query 驱动）。
 */
watch(
  () => route.query.insuranceId,
  async (insuranceId) => {
    if (typeof insuranceId === 'string' && insuranceId) await openDetail(insuranceId)
  },
  { immediate: true },
)

/** 导出投保单 */
const handleExport = () => {
  ElMessage.info('导出功能开发中...')
  // TODO: 实现导出功能
}
</script>

<style scoped lang="scss">
.toolbar-stat {
  font-size: 14px;
  color: $text-regular;

  b {
    color: $primary-color;
    font-size: 16px;
  }
}

.detail-content {
  min-height: 220px;
}
</style>
