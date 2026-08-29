<template>
  <div class="ti-page maintenance-list">
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="保单号"><el-input v-model="queryParams.policyNumber" clearable /></el-form-item>
      <el-form-item label="保全项"><el-input v-model="queryParams.itemCode" clearable placeholder="项目编码" /></el-form-item>
      <el-form-item label="来源">
        <TiDictSelect v-model="queryParams.source" dict-type="MAINTENANCE_CHANNEL" placeholder="全部" style="width: 140px" />
      </el-form-item>
      <el-form-item label="案件状态">
        <TiDictSelect v-model="queryParams.status" dict-type="MAINTENANCE_CASE_STATUS" placeholder="全部" style="width: 140px" />
      </el-form-item>
    </TiSearchForm>

    <div class="ti-toolbar">
      <div class="ti-toolbar-left">
        <el-button type="primary" :icon="Plus" v-permission="'maintenance:create'" @click="router.push('/maintenance/create')">创建保全</el-button>
      </div>
      <div class="ti-toolbar-right"><el-button :icon="Refresh" @click="fetchData">刷新</el-button></div>
    </div>

    <TiTable
      class="desktop-case-table"
      :data="tableData"
      :total="pagination.total"
      :page-num="pagination.pageNum"
      :page-size="pagination.pageSize"
      :loading="tableLoading"
      @page-change="onPageChange"
      @size-change="onSizeChange"
    >
      <el-table-column prop="maintenanceNo" label="保全号" min-width="170" />
      <el-table-column prop="id" label="保全ID" min-width="180" show-overflow-tooltip />
      <el-table-column prop="policyId" label="保单ID" min-width="180" show-overflow-tooltip />
      <el-table-column prop="customerId" label="客户ID" min-width="180" show-overflow-tooltip />
      <el-table-column prop="policyNumber" label="保单号" min-width="150" />
      <el-table-column label="保全项" min-width="190"><template #default="{ row }">{{ row.itemCodes?.join('、') || '-' }}</template></el-table-column>
      <el-table-column prop="source" label="来源" width="100"><template #default="{ row }">{{ maintenanceChannelLabel(row.source) }}</template></el-table-column>
      <el-table-column prop="status" label="案件状态" width="125"><template #default="{ row }"><TiStatusTag :value="row.status" :label="maintenanceStatusLabel(row.status)" /></template></el-table-column>
      <el-table-column prop="effectStatus" label="生效状态" width="125"><template #default="{ row }"><TiStatusTag :value="row.effectStatus || 'NOT_STARTED'" :label="effectStatusLabel(row.effectStatus || 'NOT_STARTED')" /></template></el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="170"><template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template></el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button size="small" :icon="View" @click="router.push(`/maintenance/workbench/${row.caseId}`)">工作台</el-button>
        </template>
      </el-table-column>
    </TiTable>

    <div class="mobile-case-list" v-loading="tableLoading">
      <article v-for="row in tableData" :key="row.caseId" class="case-card">
        <div class="case-card__heading">
          <strong>{{ row.policyNumber || '-' }}</strong>
          <TiStatusTag :value="row.status" />
        </div>
        <div class="case-card__items">{{ row.itemCodes?.join('、') || '-' }}</div>
        <div class="case-card__meta">
          <span>{{ maintenanceChannelLabel(row.source) }}</span>
          <span>生效：{{ effectStatusLabel(row.effectStatus || 'NOT_STARTED') }}</span>
          <span>{{ formatDateTime(row.createdAt) }}</span>
        </div>
        <el-button type="primary" plain @click="router.push(`/maintenance/workbench/${row.caseId}`)">进入工作台</el-button>
      </article>
      <el-empty v-if="!tableLoading && tableData.length === 0" description="暂无保全案件" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Refresh, View } from '@element-plus/icons-vue'
import { getMaintenanceCaseList } from '@/api/maintenance'
import type { MaintenanceCaseSummary } from '@/api/maintenance'
import { useTable } from '@/composables/useTable'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import { useDict } from '@/composables/useDict'
import { formatDateTime } from '@/utils/date'
import type { PageResult } from '@/types/api.d'

const router = useRouter()
const queryParams = reactive({ caseId: '', policyNumber: '', customerId: '', itemCode: '', source: undefined as string | undefined, status: undefined as string | undefined })
const { getLabel: maintenanceChannelLabel } = useDict('MAINTENANCE_CHANNEL')
const { getLabel: maintenanceStatusLabel } = useDict('MAINTENANCE_CASE_STATUS')
const { getLabel: effectStatusLabel } = useDict('MAINTENANCE_EFFECT_STATUS')
const { tableData, tableLoading, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange } =
  useTable<MaintenanceCaseSummary, typeof queryParams>((params) => getMaintenanceCaseList(params) as unknown as Promise<PageResult<MaintenanceCaseSummary>>, queryParams)

fetchData()
</script>

<style scoped>
.ti-toolbar-left { display: flex; gap: 8px; }
.mobile-case-list { display: none; }
@media (max-width: 600px) {
  .ti-toolbar { align-items: stretch; flex-direction: column; gap: 8px; }
  .ti-toolbar-left { flex-wrap: wrap; }
  .desktop-case-table { display: none; }
  .mobile-case-list { display: grid; gap: 10px; }
  .case-card { border: 1px solid var(--el-border-color); border-radius: 6px; padding: 12px; background: var(--el-bg-color); }
  .case-card__heading { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .case-card__items { margin: 10px 0; font-weight: 500; }
  .case-card__meta { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 12px; color: var(--el-text-color-secondary); font-size: 12px; }
  .case-card__meta span:last-child { grid-column: 1 / -1; }
  .case-card .el-button { width: 100%; }
}
</style>
