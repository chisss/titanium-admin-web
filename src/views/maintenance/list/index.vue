<template>
  <!-- 保全工单列表 -->
  <div class="ti-page">
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="工单号">
        <el-input v-model="queryParams.workOrderNo" clearable style="width: 160px" />
      </el-form-item>
      <el-form-item label="保单号">
        <el-input v-model="queryParams.policyNo" clearable style="width: 160px" />
      </el-form-item>
      <el-form-item label="保全类型">
        <el-select v-model="queryParams.maintenanceType" clearable placeholder="全部" style="width: 140px">
          <el-option label="信息变更" value="INFO_CHANGE" />
          <el-option label="保额调整" value="SUM_CHANGE" />
          <el-option label="受益人变更" value="BENEFICIARY_CHANGE" />
          <el-option label="缴费方式变更" value="PAYMENT_CHANGE" />
          <el-option label="退保申请" value="SURRENDER" />
          <el-option label="复效申请" value="REINSTATEMENT" />
        </el-select>
      </el-form-item>
      <el-form-item label="工单状态">
        <el-select v-model="queryParams.status" clearable placeholder="全部" style="width: 130px">
          <el-option label="待处理" value="PENDING" />
          <el-option label="处理中" value="PROCESSING" />
          <el-option label="已完成" value="COMPLETED" />
          <el-option label="已驳回" value="REJECTED" />
        </el-select>
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
      :data="tableData.value"
      :total="pagination.total"
      :page-num="pagination.pageNum"
      :page-size="pagination.pageSize"
      :loading="tableLoading"
      @page-change="onPageChange"
      @size-change="onSizeChange"
    >
      <el-table-column prop="workOrderNo" label="工单号" width="180" />
      <el-table-column prop="policyNo" label="保单号" width="160" />
      <el-table-column prop="holderName" label="投保人" width="100" />
      <el-table-column prop="maintenanceTypeLabel" label="保全类型" width="130">
        <template #default="{ row }">
          {{ row.maintenanceTypeLabel || row.maintenanceType }}
        </template>
      </el-table-column>
      <el-table-column prop="applicantName" label="申请人" width="100" />
      <el-table-column prop="applyTime" label="申请时间" width="160" />
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <TiStatusTag :value="row.status" />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button text size="small" :icon="View" @click="toDetail(row.id)">详情</el-button>
          <el-button
            v-if="row.status === 'PENDING'"
            text
            size="small"
            type="primary"
            v-permission="'maintenance:approve'"
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
import { getMaintenanceList } from '@/api/maintenance'
import type { MaintenanceVO } from '@/api/maintenance'
import { useTable } from '@/composables/useTable'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import type { PageResult } from '@/types/api.d'

const router = useRouter()

const queryParams = reactive({
  workOrderNo: '',
  policyNo: '',
  maintenanceType: undefined as string | undefined,
  status: undefined as string | undefined,
  dateRange: undefined as string[] | undefined,
})

const { tableData, tableLoading, pagination, handleSearch, handleReset, onPageChange, onSizeChange } =
  useTable<MaintenanceVO, typeof queryParams>((params) => {
    const { dateRange, ...rest } = params
    return getMaintenanceList({ ...rest, dateRange }) as Promise<PageResult<MaintenanceVO>>
  }, queryParams)

/** 跳转详情/审核页 */
const toDetail = (id: string) => {
  router.push(`/maintenance/detail/${id}`)
}
</script>
