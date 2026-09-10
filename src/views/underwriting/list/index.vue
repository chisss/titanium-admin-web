<template>
  <!-- 核保工单列表 -->
  <div class="ti-page">
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="核保类型">
        <TiDictSelect v-model="queryParams.underwritingType" dict-type="UNDERWRITING_TYPE" placeholder="全部" style="width: 150px" />
      </el-form-item>
      <el-form-item label="核保状态">
        <TiDictSelect v-model="queryParams.status" dict-type="UNDERWRITING_STATUS" placeholder="全部" style="width: 150px" />
      </el-form-item>
      <el-form-item label="申请时间">
        <el-date-picker
          v-model="queryParams.dateRange"
          type="daterange"
          range-separator="至"
          value-format="YYYY-MM-DD"
          style="width: 220px"
        />
      </el-form-item>
    </TiSearchForm>

    <TiTable
      :data="tableData"
      :total="pagination.total"
      :page-num="pagination.pageNum"
      :page-size="pagination.pageSize"
      :loading="tableLoading"
      @page-change="onPageChange"
      @size-change="onSizeChange"
    >
      <el-table-column prop="caseNo" label="核保案号" width="200" class-name="ti-code-column">
        <template #default="{ row }">
          <TiCopyText :text="row.caseNo || '-'" />
        </template>
      </el-table-column>
      <el-table-column prop="underwritingType" label="核保类型" width="110">
        <template #default="{ row }">{{ underwritingTypeLabel(row.underwritingType) }}</template>
      </el-table-column>
      <el-table-column prop="amount" label="核保金额" width="130" align="right">
        <template #default="{ row }">{{ row.amount != null ? `¥${Number(row.amount).toLocaleString()}` : '-' }}</template>
      </el-table-column>
      <el-table-column prop="riskLevel" label="风险等级" width="110">
        <template #default="{ row }">{{ riskLevelLabel(row.riskLevel) }}</template>
      </el-table-column>
      <el-table-column prop="createdAt" label="申请时间" width="160">
        <template #default="{ row }">{{ row.createdAt || '-' }}</template>
      </el-table-column>
      <el-table-column prop="status" label="核保状态" width="120">
        <template #default="{ row }">
          <TiStatusTag :value="row.status" :label="underwritingStatusLabel(row.status)" />
        </template>
      </el-table-column>
      <el-table-column prop="underwritingCompletedTime" label="核保完成时间" width="160">
        <template #default="{ row }">{{ row.underwritingCompletedTime || '-' }}</template>
      </el-table-column>
      <el-table-column label="操作" min-width="140" fixed="right" class-name="ti-action-column">
        <template #default="{ row }">
          <el-button size="small" :icon="View" @click="toDetail(row.underwritingId)">详情</el-button>
          <el-button
            v-if="row.status === 'MANUAL_REVIEW'"
            text
            size="small"
            type="primary"
            v-permission="'underwriting:approve'"
            @click="toDetail(row.underwritingId)"
          >
            审核
          </el-button>
        </template>
      </el-table-column>
    </TiTable>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { useRouter } from 'vue-router'
import { View } from '@element-plus/icons-vue'
import { getUnderwritingList } from '@/api/underwriting'
import type { UnderwritingCaseVO } from '@/api/underwriting'
import { useTable } from '@/composables/useTable'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiCopyText from '@/components/TiCopyText/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import { useDict } from '@/composables/useDict'
import type { PageResult } from '@/types/api.d'

const router = useRouter()
const { getLabel: underwritingStatusLabel } = useDict('UNDERWRITING_STATUS')
const { getLabel: underwritingTypeLabel } = useDict('UNDERWRITING_TYPE')

/** 风险等级文案（对齐 metadata UnderwritingEnum.RiskLevel，无字典故本地映射） */
const riskLevelLabel = (code?: string): string => {
  const map: Record<string, string> = {
    STANDARD: '标准体', SUB_STANDARD: '次标准体', HIGH_RISK: '高风险体', UNINSURABLE: '不可保体',
  }
  return code ? map[code] ?? code : '-'
}

const queryParams = reactive({
  underwritingType: undefined as string | undefined,
  status: undefined as string | undefined,
  dateRange: undefined as string[] | undefined,
})

const { tableData, tableLoading, pagination, handleSearch, handleReset, onPageChange, onSizeChange } =
  useTable<UnderwritingCaseVO, typeof queryParams>((params) => {
    const { dateRange, underwritingType, status, pageNum, pageSize } = params
    return getUnderwritingList({
      status,
      underwritingType,
      // 申请时间范围转下游 ISO-8601 起止时刻
      startTime: dateRange?.[0] ? `${dateRange[0]}T00:00:00` : undefined,
      endTime: dateRange?.[1] ? `${dateRange[1]}T23:59:59` : undefined,
      pageNum,
      pageSize,
    }) as Promise<PageResult<UnderwritingCaseVO>>
  }, queryParams)

/** 跳转详情/审核页 */
const toDetail = (underwritingId: string) => {
  router.push(`/underwriting/detail/${underwritingId}`)
}
</script>
