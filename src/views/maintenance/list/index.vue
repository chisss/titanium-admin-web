<template>
  <div class="ti-page maintenance-list">
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="案件 ID"><el-input v-model="queryParams.caseId" clearable /></el-form-item>
      <el-form-item label="保单号"><el-input v-model="queryParams.policyNumber" clearable /></el-form-item>
      <el-form-item label="客户 ID"><el-input v-model="queryParams.customerId" clearable /></el-form-item>
      <el-form-item label="保全项"><el-input v-model="queryParams.itemCode" clearable placeholder="项目编码" /></el-form-item>
      <el-form-item label="来源">
        <el-select v-model="queryParams.source" clearable placeholder="全部" style="width: 120px">
          <el-option label="后台人工" value="MANUAL" /><el-option label="API 自动" value="API" />
        </el-select>
      </el-form-item>
      <el-form-item label="案件状态">
        <el-select v-model="queryParams.status" clearable placeholder="全部" style="width: 140px">
          <el-option v-for="status in statuses" :key="status.value" v-bind="status" />
        </el-select>
      </el-form-item>
    </TiSearchForm>

    <div class="ti-toolbar">
      <div class="ti-toolbar-left">
        <el-button type="primary" :icon="Plus" v-permission="'maintenance:create'" @click="router.push('/maintenance/create')">创建保全</el-button>
        <el-button :icon="Setting" @click="router.push('/maintenance/configuration')">保全项配置</el-button>
      </div>
      <div class="ti-toolbar-right"><el-button :icon="Refresh" @click="fetchData">刷新</el-button></div>
    </div>

    <TiTable
      :data="tableData"
      :total="pagination.total"
      :page-num="pagination.pageNum"
      :page-size="pagination.pageSize"
      :loading="tableLoading"
      @page-change="onPageChange"
      @size-change="onSizeChange"
    >
      <el-table-column prop="id" label="保全ID" min-width="180" class-name="ti-code-column"><template #default="{ row }">{{ row.caseId }}</template></el-table-column>
      <el-table-column prop="policyId" label="保单ID" min-width="150"><template #default="{ row }">{{ row.policyNumber || row.policyId }}</template></el-table-column>
      <el-table-column prop="customerId" label="客户ID" min-width="145" />
      <el-table-column label="保全项" min-width="190"><template #default="{ row }">{{ row.itemCodes?.join('、') || '-' }}</template></el-table-column>
      <el-table-column prop="source" label="来源" width="100"><template #default="{ row }">{{ row.source === 'MANUAL' ? '后台人工' : 'API 自动' }}</template></el-table-column>
      <el-table-column prop="status" label="案件状态" width="125"><template #default="{ row }"><TiStatusTag :value="row.status" /></template></el-table-column>
      <el-table-column prop="effectStatus" label="生效状态" width="125"><template #default="{ row }"><TiStatusTag :value="row.effectStatus || 'NOT_STARTED'" /></template></el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="170" />
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button size="small" :icon="View" @click="router.push(`/maintenance/workbench/${row.caseId}`)">工作台</el-button>
          <el-button size="small" text @click="router.push(`/maintenance/detail/${row.caseId}`)">旧版详情</el-button>
        </template>
      </el-table-column>
    </TiTable>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Refresh, Setting, View } from '@element-plus/icons-vue'
import { getMaintenanceCaseList } from '@/api/maintenance'
import type { MaintenanceCaseSummary } from '@/api/maintenance'
import { useTable } from '@/composables/useTable'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import type { PageResult } from '@/types/api.d'

const router = useRouter()
const queryParams = reactive({ caseId: '', policyNumber: '', customerId: '', itemCode: '', source: undefined as string | undefined, status: undefined as string | undefined })
const statuses = [
  { label: '待处理', value: 'PENDING' }, { label: '处理中', value: 'PROCESSING' },
  { label: '已完成', value: 'COMPLETED' }, { label: '已拒绝', value: 'REJECTED' }, { label: '已撤销', value: 'WITHDRAWN' },
]
const { tableData, tableLoading, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange } =
  useTable<MaintenanceCaseSummary, typeof queryParams>((params) => getMaintenanceCaseList(params) as unknown as Promise<PageResult<MaintenanceCaseSummary>>, queryParams)

fetchData()
</script>

<style scoped>
.ti-toolbar-left { display: flex; gap: 8px; }
@media (max-width: 600px) { .ti-toolbar { align-items: stretch; flex-direction: column; gap: 8px; } .ti-toolbar-left { flex-wrap: wrap; } }
</style>
