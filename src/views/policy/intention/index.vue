<template>
  <!-- 意向单查询列表页 -->
  <div class="ti-page">
    <!-- 搜索区 -->
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="意向单号">
        <el-input v-model="queryParams.proposalNo" placeholder="精确查询" clearable style="width: 180px" />
      </el-form-item>
      <el-form-item label="客户ID">
        <el-input v-model="queryParams.customerId" placeholder="精确查询" clearable style="width: 180px" />
      </el-form-item>
      <el-form-item label="产品编码">
        <el-input v-model="queryParams.productCode" placeholder="精确查询" clearable style="width: 160px" />
      </el-form-item>
      <el-form-item label="意向状态">
        <el-select v-model="queryParams.status" placeholder="请选择" clearable style="width: 140px">
          <el-option label="草稿" value="DRAFT" />
          <el-option label="已提交" value="SUBMITTED" />
          <el-option label="已转投保单" value="CONVERTED_TO_APPLICATION" />
          <el-option label="作废" value="VOIDED" />
        </el-select>
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
        <span class="toolbar-stat">共 <b>{{ pagination.total }}</b> 条意向单</span>
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
      row-key="proposalId"
      @page-change="onPageChange"
      @size-change="onSizeChange"
    >
      <el-table-column type="index" label="序号" width="60" align="center" fixed="left" />
      <el-table-column prop="proposalNo" label="意向单号" width="160" fixed="left">
        <template #default="{ row }">
          <TiCopyText :text="row.proposalNo" />
        </template>
      </el-table-column>
      <el-table-column prop="customerId" label="客户ID" width="180" show-overflow-tooltip />
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
          {{ row.intendedPremium != null ? `¥${row.intendedPremium.toLocaleString()}` : '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="lineCount" label="险种段" width="90" align="center" />
      <el-table-column prop="createTime" label="创建时间" width="180">
        <template #default="{ row }">
          {{ formatDateTime(row.createTime) }}
        </template>
      </el-table-column>
      <!-- @vue-generic {ProposalVO} -->
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" :icon="View" @click="handleDetail(row)">详情</el-button>
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
        <el-descriptions v-if="proposalDetail" :column="2" border>
          <el-descriptions-item label="意向单号">{{ proposalDetail.proposalNo }}</el-descriptions-item>
          <el-descriptions-item label="意向单ID">{{ proposalDetail.proposalId }}</el-descriptions-item>
          <el-descriptions-item label="出单业务号">{{ proposalDetail.bizNo || '-' }}</el-descriptions-item>
          <el-descriptions-item label="意向状态">
            <TiStatusTag
              :value="proposalDetail.status"
              :label="getStatusLabel(proposalDetail.status)"
            />
          </el-descriptions-item>
          <el-descriptions-item label="客户ID">{{ proposalDetail.customerId || '-' }}</el-descriptions-item>
          <el-descriptions-item label="保单形态">{{ proposalDetail.policyForm || '-' }}</el-descriptions-item>
          <el-descriptions-item label="产品编码">
            {{ proposalDetail.expectedProductCode || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="险种分类">{{ proposalDetail.insuranceType || '-' }}</el-descriptions-item>
          <el-descriptions-item label="意向保额">
            {{ formatMoney(proposalDetail.intendedSumInsured) }}
          </el-descriptions-item>
          <el-descriptions-item label="意向保费">
            {{ formatMoney(proposalDetail.intendedPremium) }}
          </el-descriptions-item>
          <el-descriptions-item label="销售渠道">{{ getChannelLabel(proposalDetail.channel) }}</el-descriptions-item>
          <el-descriptions-item label="渠道ID">{{ proposalDetail.channelId || '-' }}</el-descriptions-item>
          <el-descriptions-item label="营销包ID">{{ proposalDetail.marketPackageId || '-' }}</el-descriptions-item>
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
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Download, View } from '@element-plus/icons-vue'
import { getProposalDetail, getProposalList, type ProposalVO } from '@/api/insurance'
import { useTable } from '@/composables/useTable'
import { formatDateTime } from '@/utils/date'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiCopyText from '@/components/TiCopyText/index.vue'

/** 意向单查询参数 */
const queryParams = reactive({
  proposalNo: '',
  customerId: '',
  productCode: '',
  status: undefined as string | undefined,
  dateRange: undefined as string[] | undefined,
})

/** 意向状态标签 */
const getStatusLabel = (status: string): string => {
  const statusMap: Record<string, string> = {
    DRAFT: '草稿',
    SUBMITTED: '已提交',
    CONVERTED_TO_APPLICATION: '已转投保单',
    VOIDED: '作废',
  }
  return statusMap[status] || status
}

/** 渠道来源标签 */
const getChannelLabel = (channel?: string): string => {
  if (!channel) return '-'
  const channelMap: Record<string, string> = {
    AGENT: '代理人',
    BANCASSURANCE: '银保',
    ONLINE: '线上直销',
    BROKER: '经纪人',
    TELEMARKETING: '电销',
    GROUP_SALES: '团险直销',
  }
  return channelMap[channel] || channel
}

/** 表格数据 */
const { tableData, tableLoading, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange } =
  useTable<ProposalVO, typeof queryParams>((params) => {
    const { dateRange, ...rest } = params
    // 注意：后端暂不支持日期范围查询，先去掉 dateRange
    return getProposalList(rest)
  }, queryParams)

// 初始加载
fetchData()

const detailVisible = ref(false)
const detailLoading = ref(false)
const proposalDetail = ref<ProposalVO>()

/** 查看详情 */
const handleDetail = async (row: ProposalVO) => {
  detailVisible.value = true
  detailLoading.value = true
  proposalDetail.value = undefined
  try {
    proposalDetail.value = await getProposalDetail(row.proposalId)
  } catch {
    detailVisible.value = false
  } finally {
    detailLoading.value = false
  }
}

const formatMoney = (value?: number): string => value == null ? '-' : `¥${value.toLocaleString()}`

/** 导出意向单 */
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
  min-height: 180px;
}
</style>
