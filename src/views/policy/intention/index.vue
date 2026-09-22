<template>
  <!-- 意向单查询列表页 -->
  <div class="ti-page">
    <!-- 搜索区 -->
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="意向单号">
        <el-input v-model="queryParams.proposalNo" placeholder="精确查询" clearable style="width: 180px" />
      </el-form-item>
      <el-form-item label="产品编码">
        <el-input v-model="queryParams.productCode" placeholder="精确查询" clearable style="width: 160px" />
      </el-form-item>
      <el-form-item label="意向状态">
        <!-- 🔴 剔除字典中的历史死码（读侧 IntentStatus 独有、投影从不写入）：选中它们只会得到 0 条 -->
        <TiDictSelect
          v-model="queryParams.status"
          dict-type="POLICY_INTENT_STATUS"
          :exclude-values="POLICY_INTENT_STATUS_DEAD_CODES"
          placeholder="请选择"
          style="width: 140px"
        />
      </el-form-item>
      <el-form-item label="创建日期">
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
          <template v-else>共 <b>{{ pagination.total }}</b> 条意向单</template>
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
      row-key="proposalId"
      @page-change="onPageChange"
      @size-change="onSizeChange"
      :error="tableError"
      @refresh="retry"
    >
      <el-table-column type="index" label="序号" width="60" align="center" fixed="left" />
      <el-table-column prop="proposalNo" label="意向单号" width="160" fixed="left">
        <template #default="{ row }">
          <TiCopyText :text="row.proposalNo" />
        </template>
      </el-table-column>
      <el-table-column prop="expectedProductCode" label="产品编码" min-width="150" show-overflow-tooltip />
      <el-table-column prop="bizNo" label="出单业务号" min-width="190" show-overflow-tooltip />
      <el-table-column prop="status" label="意向状态" width="110">
        <template #default="{ row }">
          <TiStatusTag :value="row.status" :label="getStatusLabel(row.status)" />
        </template>
      </el-table-column>
      <el-table-column prop="channel" label="销售渠道" width="110">
        <template #default="{ row }">
          {{ getChannelLabel(row.channel) }}
        </template>
      </el-table-column>
      <el-table-column prop="intendedPremium" label="意向保费" width="130" align="right">
        <template #default="{ row }">
          {{ formatAmount(row.intendedPremium) }}
        </template>
      </el-table-column>
      <el-table-column prop="lineCount" label="险种段" width="90" align="center" />
      <el-table-column prop="createTime" label="创建时间" width="180">
        <template #default="{ row }">
          {{ formatDateTime(row.createTime) }}
        </template>
      </el-table-column>
      <!-- @vue-generic {ProposalVO} -->
      <el-table-column label="操作" width="120" fixed="right" class-name="ti-action-column">
        <template #default="{ row }">
          <el-button size="small" :icon="View" @click="openDetail(row.proposalId)">详情</el-button>
        </template>
      </el-table-column>
    </TiTable>

    <el-dialog
      v-model="detailVisible"
      title="意向单详情"
      width="min(820px, 92vw)"
      destroy-on-close
    >
      <div v-loading="detailLoading" class="detail-content">
        <el-descriptions v-if="proposalDetail" :column="detailColumns" border>
          <el-descriptions-item label="意向单号">{{ proposalDetail.proposalNo }}</el-descriptions-item>
          <el-descriptions-item label="出单业务号">{{ proposalDetail.bizNo || '-' }}</el-descriptions-item>
          <el-descriptions-item label="意向状态">
            <TiStatusTag
              :value="proposalDetail.status"
              :label="getStatusLabel(proposalDetail.status)"
            />
          </el-descriptions-item>
          <el-descriptions-item label="保单形态">{{ proposalDetail.policyForm || '-' }}</el-descriptions-item>
          <el-descriptions-item label="产品编码">
            {{ proposalDetail.expectedProductCode || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="险种分类">{{ proposalDetail.insuranceType || '-' }}</el-descriptions-item>
          <el-descriptions-item label="意向保额">
            {{ formatAmount(proposalDetail.intendedSumInsured) }}
          </el-descriptions-item>
          <el-descriptions-item label="意向保费">
            {{ formatAmount(proposalDetail.intendedPremium) }}
          </el-descriptions-item>
          <el-descriptions-item label="销售渠道">{{ getChannelLabel(proposalDetail.channel) }}</el-descriptions-item>
          <el-descriptions-item label="险种段数量">{{ proposalDetail.lineCount ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="保险起期">
            {{ formatDateTime(proposalDetail.insurancePeriodStart) }}
          </el-descriptions-item>
          <el-descriptions-item label="保险止期">
            {{ formatDateTime(proposalDetail.insurancePeriodEnd) }}
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatDateTime(proposalDetail.createTime) }}</el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ formatDateTime(proposalDetail.updateTime) }}</el-descriptions-item>
        </el-descriptions>
      </div>

      <!-- 🔴 footer 为新增：跳转入口需要落点，且关闭按钮此前只能靠右上角 ×。
           按钮**仅在真有下游单据时**出现 —— 状态对但拿不到 ID 时不显示，
           否则会造出「点进去无目标」的死入口（详见 linkedInsuranceId 的注释）。 -->
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
        <el-button
          v-if="canGoToInsurance"
          type="primary"
          :icon="Right"
          @click="goToInsurance"
        >
          查看投保单
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
import { getIssuanceProgress, getProposalDetail, getProposalList, type ProposalVO } from '@/api/insurance'
import { useTable } from '@/composables/useTable'
import { formatDateTime } from '@/utils/date'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiCopyText from '@/components/TiCopyText/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import { useDetailColumns } from '@/composables/useDetailColumns'
import { useDict } from '@/composables/useDict'
import { POLICY_INTENT_STATUS_DEAD_CODES, PROPOSAL_STATUS_CONVERTED } from '@/constants/policy'
import { formatAmount } from '@/utils/format'

const router = useRouter()
const route = useRoute()

/** 意向单查询参数 */
const queryParams = reactive({
  proposalNo: '',
  customerId: '',
  productCode: '',
  status: undefined as string | undefined,
  dateRange: undefined as string[] | undefined,
})

const { getLabel: getStatusLabel } = useDict('POLICY_INTENT_STATUS')
const { getLabel: salesChannelLabel } = useDict('SALES_CHANNEL')
const getChannelLabel = (channel?: string): string => channel ? salesChannelLabel(channel) : '-'

/** 表格数据 */
const { tableData, tableLoading, tableError, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange, retry } =
  useTable<ProposalVO, typeof queryParams>((params) => {
    const { dateRange, ...rest } = params
    // 注意：后端暂不支持日期范围查询，先去掉 dateRange
    return getProposalList(rest)
  }, queryParams)

// 初始加载
fetchData()

/** 描述区：字段中短，宽屏 2 档 */
const detailColumns = useDetailColumns(2)

const detailVisible = ref(false)
const detailLoading = ref(false)
const proposalDetail = ref<ProposalVO>()

/**
 * 下游投保单 ID（跳转入口的落点）。
 *
 * <p>🔴 **不能只靠状态判定入口是否显示**：三张单据在读模型里互缺外键
 * （意向单视图无 `insurance_id` 列，见 `t_proposal_view`），投保单 ID 只能经 `bizNo` 桥
 * 从出单进度取（`getIssuanceProgress`）。状态为「已转投保单」但桥没给出 ID 时
 * （历史数据无进度行、或跨租户）**不显示按钮** —— 否则是「点进去无目标」的死入口。</p>
 */
const linkedInsuranceId = ref<string>()

/** 取下游投保单 ID；拿不到一律返回 undefined 而非抛出（辅助请求，失败不影响主视图） */
const loadLinkedInsuranceId = async (bizNo?: string): Promise<string | undefined> => {
  if (!bizNo) return undefined
  try {
    return (await getIssuanceProgress(bizNo))?.insuranceId || undefined
  } catch {
    return undefined
  }
}

/** 跳转入口可见性：状态「已转投保单」**且**桥返回了目标 ID —— 两者缺一不可 */
const canGoToInsurance = computed(
  () => proposalDetail.value?.status === PROPOSAL_STATUS_CONVERTED && !!linkedInsuranceId.value,
)

/**
 * 打开意向单详情（🔴 单一入口）。
 * 列表行点击与「从保单详情带 proposalId 跳入」共用同一路径 —— 两套打开逻辑必然漂移。
 */
const openDetail = async (proposalId: string) => {
  if (!proposalId) return
  detailVisible.value = true
  detailLoading.value = true
  proposalDetail.value = undefined
  linkedInsuranceId.value = undefined
  try {
    proposalDetail.value = await getProposalDetail(proposalId)
  } catch {
    // 详情自身失败：拦截器已弹业务消息，关闭空对话框即可（与改动前口径一致）
    detailVisible.value = false
    detailLoading.value = false
    return
  }
  detailLoading.value = false
  linkedInsuranceId.value = await loadLinkedInsuranceId(proposalDetail.value.bizNo)
}

/** 跳投保单页并直接展开该单详情（投保单页读 query.insuranceId 自动打开） */
const goToInsurance = () => {
  detailVisible.value = false
  router.push({ path: '/policy/application', query: { insuranceId: linkedInsuranceId.value } })
}

/**
 * 从其它页面带 `?proposalId=` 跳进来时直接打开详情
 * （保单详情页的「查看意向单」入口走此路径，因意向单详情是对话框、无独立路由）。
 */
watch(
  () => route.query.proposalId,
  async (proposalId) => {
    if (typeof proposalId === 'string' && proposalId) await openDetail(proposalId)
  },
  { immediate: true },
)

/** 导出意向单 */
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
  min-height: 180px;
}
</style>
