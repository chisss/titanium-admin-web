<template>
  <!-- 核保工单列表 -->
  <div class="ti-page">
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="案件号">
        <el-input v-model="queryParams.caseNo" clearable style="width: 160px" />
      </el-form-item>
      <el-form-item label="被保人">
        <el-input v-model="queryParams.insuredName" clearable style="width: 130px" />
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
      <el-table-column prop="caseNo" label="案件号" width="180" class-name="ti-code-column">
        <template #default="{ row }">
          <TiCopyText :text="row.caseNo" />
        </template>
      </el-table-column>
      <el-table-column prop="policyNo" label="保单号" width="160" class-name="ti-code-column">
        <template #default="{ row }">
          <TiCopyText :text="row.policyNo" />
        </template>
      </el-table-column>
      <el-table-column prop="insuredName" label="被保人" width="100" />
      <el-table-column prop="productName" label="产品名称" min-width="160" show-overflow-tooltip />
      <el-table-column prop="sumInsured" label="保额" width="120">
        <template #default="{ row }">¥{{ row.sumInsured?.toLocaleString() }}</template>
      </el-table-column>
      <el-table-column prop="applyTime" label="申请时间" width="160" />
      <el-table-column prop="status" label="核保状态" width="120">
        <template #default="{ row }">
          <TiStatusTag :value="row.status" :label="underwritingStatusLabel(row.status)" />
        </template>
      </el-table-column>
      <el-table-column prop="decisionTime" label="决策时间" width="160">
        <template #default="{ row }">{{ row.decisionTime || '-' }}</template>
      </el-table-column>
      <el-table-column label="操作" min-width="140" fixed="right" class-name="ti-action-column">
        <template #default="{ row }">
          <el-button size="small" :icon="View" @click="toDetail(row.id)">详情</el-button>
          <el-button
            v-if="row.status === 'MANUAL_REVIEWING'"
            text
            size="small"
            type="primary"
            v-permission="'underwriting:approve'"
            @click="toDetail(row.id)"
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

const queryParams = reactive({
  caseNo: '',
  insuredName: '',
  status: undefined as string | undefined,
  dateRange: undefined as string[] | undefined,
})

const { tableData, tableLoading, pagination, handleSearch, handleReset, onPageChange, onSizeChange } =
  useTable<UnderwritingCaseVO, typeof queryParams>((params) => {
    const { dateRange, ...rest } = params
    return getUnderwritingList({ ...rest, dateRange }) as Promise<PageResult<UnderwritingCaseVO>>
  }, queryParams)

/** 跳转详情/审核页 */
const toDetail = (id: string) => {
  router.push(`/underwriting/detail/${id}`)
}
</script>
