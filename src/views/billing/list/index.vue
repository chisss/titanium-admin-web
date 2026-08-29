<template>
  <!-- 账单管理列表 -->
  <div class="ti-page">
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="账单号">
        <el-input v-model="queryParams.billNo" clearable style="width: 160px" />
      </el-form-item>
      <el-form-item label="保单ID">
        <el-input v-model="queryParams.policyId" clearable style="width: 160px" />
      </el-form-item>
      <el-form-item label="账单状态">
        <TiDictSelect v-model="queryParams.status" dict-type="BILL_STATUS" placeholder="全部" style="width: 130px" />
      </el-form-item>
      <el-form-item label="到期日">
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
      <el-table-column prop="billId" label="账单号" width="180" class-name="ti-code-column">
        <template #default="{ row }">
          <TiCopyText :text="row.billNo || '-'" />
        </template>
      </el-table-column>
      <el-table-column prop="policyId" label="保单ID" width="180" show-overflow-tooltip />
      <el-table-column prop="customerId" label="客户ID" width="180" show-overflow-tooltip />
      <el-table-column prop="amount" label="金额" width="120">
        <template #default="{ row }">¥{{ row.amount?.toLocaleString() }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <TiStatusTag :value="row.status" :label="billStatusLabel(row.status)" />
        </template>
      </el-table-column>
      <el-table-column prop="dueDate" label="到期日" width="120" />
      <el-table-column prop="paidDate" label="实缴日" width="120">
        <template #default="{ row }">{{ row.paidDate || row.paymentDate || '-' }}</template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="160" />
      <el-table-column label="操作" min-width="100" fixed="right" class-name="ti-action-column">
        <template #default="{ row }">
          <el-button size="small" :icon="View" @click="toDetail(row.billId || row.id)">详情</el-button>
        </template>
      </el-table-column>
    </TiTable>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { useRouter } from 'vue-router'
import { View } from '@element-plus/icons-vue'
import { getBillList } from '@/api/billing'
import type { BillVO } from '@/api/billing'
import { useTable } from '@/composables/useTable'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiCopyText from '@/components/TiCopyText/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import { useDict } from '@/composables/useDict'
import type { PageResult } from '@/types/api.d'

const router = useRouter()
const { getLabel: billStatusLabel } = useDict('BILL_STATUS')

const queryParams = reactive({
  billNo: '',
  policyId: '',
  status: undefined as string | undefined,
  dateRange: undefined as string[] | undefined,
})

const { tableData, tableLoading, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange } =
  useTable<BillVO, typeof queryParams>((params) => {
    const { dateRange, ...rest } = params
    return getBillList({ ...rest, dateRange }) as Promise<PageResult<BillVO>>
  }, queryParams)

fetchData()

/** 跳转详情页 */
const toDetail = (id?: string) => {
  if (!id) return
  router.push(`/billing/detail/${id}`)
}
</script>
