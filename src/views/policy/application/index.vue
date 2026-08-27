<template>
  <!-- 投保单查询列表页 -->
  <div class="ti-page">
    <!-- 搜索区 -->
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="投保单号">
        <el-input v-model="queryParams.insuranceNo" placeholder="精确查询" clearable style="width: 180px" />
      </el-form-item>
      <el-form-item label="投保人ID">
        <el-input v-model="queryParams.holderId" placeholder="精确查询" clearable style="width: 180px" />
      </el-form-item>
      <el-form-item label="主险产品ID">
        <el-input v-model="queryParams.productId" placeholder="精确查询" clearable style="width: 180px" />
      </el-form-item>
      <el-form-item label="投保状态">
        <el-select v-model="queryParams.status" placeholder="请选择" clearable style="width: 140px">
          <el-option label="草稿" value="DRAFT" />
          <el-option label="已提交" value="SUBMITTED" />
          <el-option label="核保中" value="UNDERWRITING" />
          <el-option label="核保通过" value="UNDERWRITING_APPROVED" />
          <el-option label="核保拒绝" value="UNDERWRITING_REJECTED" />
          <el-option label="核保暂缓" value="UNDERWRITING_SUSPENDED" />
          <el-option label="已承保" value="ISSUED" />
          <el-option label="作废" value="VOIDED" />
        </el-select>
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
        <span class="toolbar-stat">共 <b>{{ pagination.total }}</b> 条投保单</span>
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
      row-key="insuranceId"
      @page-change="onPageChange"
      @size-change="onSizeChange"
    >
      <el-table-column type="index" label="序号" width="60" align="center" fixed="left" />
      <el-table-column prop="insuranceNo" label="投保单号" width="180" fixed="left">
        <template #default="{ row }">
          <TiCopyText :text="row.insuranceNo" />
        </template>
      </el-table-column>
      <el-table-column prop="productId" label="主险产品ID" min-width="160" show-overflow-tooltip />
      <el-table-column prop="holderId" label="投保人ID" width="180" show-overflow-tooltip />
      <el-table-column prop="bizNo" label="出单业务号" min-width="190" show-overflow-tooltip />
      <el-table-column prop="status" label="投保状态" width="120">
        <template #default="{ row }">
          <TiStatusTag :value="row.status" :label="getStatusLabel(row.status)" />
        </template>
      </el-table-column>
      <el-table-column prop="exactPremium" label="总保费" width="130" align="right">
        <template #default="{ row }">
          {{ row.exactPremium != null ? `¥${row.exactPremium.toLocaleString()}` : '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="lineCount" label="险种段" width="90" align="center" />
      <el-table-column prop="createTime" label="投保时间" width="180">
        <template #default="{ row }">
          {{ formatDateTime(row.createTime) }}
        </template>
      </el-table-column>
      <!-- @vue-generic {InsuranceVO} -->
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" :icon="View" @click="handleDetail(row)">详情</el-button>
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
        <el-descriptions v-if="insuranceDetail" :column="2" border>
          <el-descriptions-item label="投保单号">{{ insuranceDetail.insuranceNo }}</el-descriptions-item>
          <el-descriptions-item label="投保单ID">{{ insuranceDetail.insuranceId }}</el-descriptions-item>
          <el-descriptions-item label="出单业务号">{{ insuranceDetail.bizNo || '-' }}</el-descriptions-item>
          <el-descriptions-item label="投保状态">
            <TiStatusTag
              :value="insuranceDetail.status"
              :label="getStatusLabel(insuranceDetail.status)"
            />
          </el-descriptions-item>
          <el-descriptions-item label="关联意向单ID">{{ insuranceDetail.proposalId || '-' }}</el-descriptions-item>
          <el-descriptions-item label="投保人ID">{{ insuranceDetail.holderId || '-' }}</el-descriptions-item>
          <el-descriptions-item label="保单形态">{{ insuranceDetail.policyForm || '-' }}</el-descriptions-item>
          <el-descriptions-item label="被保险人数">{{ insuranceDetail.insuredCount ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="主险产品ID">{{ insuranceDetail.productId || '-' }}</el-descriptions-item>
          <el-descriptions-item label="险种分类">{{ insuranceDetail.insuranceType || '-' }}</el-descriptions-item>
          <el-descriptions-item label="基本保额">
            {{ formatMoney(insuranceDetail.sumInsured, insuranceDetail.currency) }}
          </el-descriptions-item>
          <el-descriptions-item label="总保费">
            {{ formatMoney(insuranceDetail.exactPremium, insuranceDetail.currency) }}
          </el-descriptions-item>
          <el-descriptions-item label="缴费频率">{{ insuranceDetail.paymentFrequency || '-' }}</el-descriptions-item>
          <el-descriptions-item label="缴费年数">{{ insuranceDetail.premiumPaymentYears ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="收费方式">{{ insuranceDetail.collectionMode || '-' }}</el-descriptions-item>
          <el-descriptions-item label="险种段数量">{{ insuranceDetail.lineCount ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="渠道ID">{{ insuranceDetail.channelId || '-' }}</el-descriptions-item>
          <el-descriptions-item label="营销包ID">{{ insuranceDetail.marketPackageId || '-' }}</el-descriptions-item>
          <el-descriptions-item label="保险起期">
            {{ formatDateTime(insuranceDetail.insurancePeriodStart) }}
          </el-descriptions-item>
          <el-descriptions-item label="保险止期">
            {{ formatDateTime(insuranceDetail.insurancePeriodEnd) }}
          </el-descriptions-item>
          <el-descriptions-item label="核保单号">{{ insuranceDetail.underwritingId || '-' }}</el-descriptions-item>
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
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Download, View } from '@element-plus/icons-vue'
import { getInsuranceDetail, getInsuranceList, type InsuranceVO } from '@/api/insurance'
import { useTable } from '@/composables/useTable'
import { formatDateTime } from '@/utils/date'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiCopyText from '@/components/TiCopyText/index.vue'

/** 投保单查询参数 */
const queryParams = reactive({
  insuranceNo: '',
  holderId: '',
  productId: '',
  status: undefined as string | undefined,
  dateRange: undefined as string[] | undefined,
})

/** 投保单状态标签 */
const getStatusLabel = (status: string): string => {
  const statusMap: Record<string, string> = {
    DRAFT: '草稿',
    SUBMITTED: '已提交',
    UNDERWRITING: '核保中',
    UNDERWRITING_APPROVED: '核保通过',
    UNDERWRITING_REJECTED: '核保拒绝',
    UNDERWRITING_SUSPENDED: '核保暂缓',
    ISSUED: '已承保',
    VOIDED: '作废',
  }
  return statusMap[status] || status
}

/** 表格数据 */
const { tableData, tableLoading, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange } =
  useTable<InsuranceVO, typeof queryParams>((params) => {
    const { dateRange, ...rest } = params
    // 注意：后端暂不支持日期范围查询，先去掉 dateRange
    return getInsuranceList(rest)
  }, queryParams)

// 初始加载
fetchData()

const detailVisible = ref(false)
const detailLoading = ref(false)
const insuranceDetail = ref<InsuranceVO>()

/** 查看详情 */
const handleDetail = async (row: InsuranceVO) => {
  detailVisible.value = true
  detailLoading.value = true
  insuranceDetail.value = undefined
  try {
    insuranceDetail.value = await getInsuranceDetail(row.insuranceId)
  } catch {
    detailVisible.value = false
  } finally {
    detailLoading.value = false
  }
}

const formatMoney = (value?: number, currency = 'CNY'): string => {
  if (value == null) return '-'
  return `${currency} ${value.toLocaleString()}`
}

/** 导出投保单 */
const handleExport = () => {
  ElMessage.info('导出功能开发中...')
  // TODO: 实现导出功能
}
</script>

<style scoped lang="scss">
.toolbar-stat {
  font-size: 14px;
  color: #606266;

  b {
    color: #409eff;
    font-size: 16px;
  }
}

.detail-content {
  min-height: 220px;
}
</style>
