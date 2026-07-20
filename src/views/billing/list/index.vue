<template>
  <!-- 账单管理列表 -->
  <div class="ti-page">
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="账单号">
        <el-input v-model="queryParams.billNo" clearable style="width: 160px" />
      </el-form-item>
      <el-form-item label="保单号">
        <el-input v-model="queryParams.policyNo" clearable style="width: 160px" />
      </el-form-item>
      <el-form-item label="投保人">
        <el-input v-model="queryParams.holderName" clearable style="width: 130px" />
      </el-form-item>
      <el-form-item label="账单状态">
        <el-select v-model="queryParams.status" clearable placeholder="全部" style="width: 130px">
          <el-option label="待缴费" value="PENDING" />
          <el-option label="已缴费" value="PAID" />
          <el-option label="已逾期" value="OVERDUE" />
          <el-option label="已取消" value="CANCELLED" />
        </el-select>
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
      :data="tableData.value"
      :total="pagination.total"
      :page-num="pagination.pageNum"
      :page-size="pagination.pageSize"
      :loading="tableLoading"
      @page-change="onPageChange"
      @size-change="onSizeChange"
    >
      <el-table-column prop="billNo" label="账单号" width="180" />
      <el-table-column prop="policyNo" label="保单号" width="160" />
      <el-table-column prop="holderName" label="投保人" width="100" />
      <el-table-column prop="amount" label="金额" width="120">
        <template #default="{ row }">¥{{ row.amount?.toLocaleString() }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <TiStatusTag :value="row.status" />
        </template>
      </el-table-column>
      <el-table-column prop="dueDate" label="到期日" width="120" />
      <el-table-column prop="paidDate" label="实缴日" width="120">
        <template #default="{ row }">{{ row.paidDate || '-' }}</template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="160" />
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button text size="small" :icon="View" @click="toDetail(row.id)">详情</el-button>
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
import type { PageResult } from '@/types/api.d'

const router = useRouter()

const queryParams = reactive({
  billNo: '',
  policyNo: '',
  holderName: '',
  status: undefined as string | undefined,
  dateRange: undefined as string[] | undefined,
})

const { tableData, tableLoading, pagination, handleSearch, handleReset, onPageChange, onSizeChange } =
  useTable<BillVO, typeof queryParams>((params) => {
    const { dateRange, ...rest } = params
    return getBillList({ ...rest, dateRange }) as Promise<PageResult<BillVO>>
  }, queryParams)

/** 跳转详情页 */
const toDetail = (id: string) => {
  router.push(`/billing/detail/${id}`)
}
</script>
