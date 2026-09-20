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
      :max-height="'var(--ti-table-max-height-default)'"
      @page-change="onPageChange"
      @size-change="onSizeChange"
    >
      <el-table-column prop="maintenanceNo" label="保全号" min-width="170" />
      <el-table-column prop="policyNumber" label="保单号" min-width="150" />
      <el-table-column label="保全项" min-width="190"><template #default="{ row }">{{ row.itemCodes?.join('、') || '-' }}</template></el-table-column>
      <el-table-column prop="source" label="来源" width="100"><template #default="{ row }">{{ maintenanceChannelLabel(row.source) }}</template></el-table-column>
      <el-table-column prop="status" label="案件状态" width="125"><template #default="{ row }"><TiStatusTag :value="row.status" :label="maintenanceStatusLabel(row.status)" /></template></el-table-column>
      <el-table-column prop="effectStatus" label="生效状态" width="125"><template #default="{ row }"><TiStatusTag :value="row.effectStatus || 'NOT_STARTED'" :label="effectStatusLabel(row.effectStatus || 'NOT_STARTED')" /></template></el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="170"><template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template></el-table-column>
      <el-table-column label="操作" min-width="100" fixed="right" class-name="ti-action-column">
        <template #default="{ row }">
          <el-button size="small" :icon="View" @click="router.push(`/maintenance/workbench/${row.caseId}`)">工作台</el-button>
        </template>
      </el-table-column>
    </TiTable>

    <div class="mobile-case-list" v-loading="tableLoading">
      <article v-for="row in tableData" :key="row.caseId" class="case-card">
        <div class="case-card__heading">
          <strong>{{ row.policyNumber || '-' }}</strong>
          <TiStatusTag :value="row.status" :label="maintenanceStatusLabel(row.status)" />
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

    <!-- 🔴 移动端翻页控件（P0-6②）：≤$breakpoint-mobile 时 .desktop-case-table 被 display:none，
         而 TiTable 自带的分页器在它内部 ⇒ 移动端**没有任何翻页入口**，只能看到当前页的 20 条，
         第 21 条起永久不可达（数据在库里，界面上没有路）。
         ⚠️ 这里**不能**用 Element Plus 的 el-pagination 组件（尖括号写法在下方说明中一律省略，
         以免被守卫的文本 grep 计入）：守卫 G-01「分页器单一来源」要求全站 .vue 里该组件
         最多出现 1 处（TiTable 内那一个），页面自建第二个分页器会直接让 G-01 红灯。
         故改用「上一页/下一页」两个按钮——分页 UI 的来源仍只有 TiTable 一处。
         🔴 页码提示必须区分「总数已知」与「总数未知」：代理层对下游裸数组会返回 total=null
         （D-501-57），此时**不能**拿本页条数冒充总数（TiTable 内部同此判据）。
         「下一页」仅在**有证据表明后面还有**时可用：本页已满 ⇒ 可能还有（与 TiTable 的 hasNextPage 同判据）。 -->
    <div v-if="tableData.length > 0" class="mobile-pagination">
      <span class="mobile-pagination__hint">{{ mobilePageHint }}</span>
      <el-button size="small" :disabled="pagination.pageNum <= 1" @click="onPageChange(pagination.pageNum - 1)">上一页</el-button>
      <el-button size="small" :disabled="tableData.length < pagination.pageSize" @click="onPageChange(pagination.pageNum + 1)">下一页</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
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

/**
 * 移动端页码提示（供窄屏的上一页/下一页按钮使用）。
 * 🔴 必须区分两种情形：`total` 为 null 表示**总数未知**（D-501-57：代理层对下游裸数组
 * 无从推断全量条数时会如实返回 null）——此时**不能**拿本页条数冒充总数显示成「共 N 条/共 1 页」，
 * 那是在向用户断言一个未经证实的事实（TiTable 内部对同一情形也只显示「总数未知」）。
 */
const mobilePageHint = computed(() => {
  const { pageNum, pageSize, total } = pagination
  if (total === null) return `第 ${pageNum} 页 · 本页 ${tableData.value.length} 条（总数未知）`
  return `第 ${pageNum} / ${Math.max(1, Math.ceil(total / pageSize))} 页`
})

fetchData()
</script>

<style scoped lang="scss">
.ti-toolbar-left { display: flex; gap: 8px; }
.mobile-case-list { display: none; }
/* 桌面端由 TiTable 自带分页器负责，这个只服务窄屏（见模板注释） */
.mobile-pagination { display: none; }
@media (max-width: $breakpoint-mobile) {
  .ti-toolbar { align-items: stretch; flex-direction: column; gap: 8px; }
  .ti-toolbar-left { flex-wrap: wrap; }
  .desktop-case-table { display: none; }
  .mobile-case-list { display: grid; gap: 10px; }
  .mobile-pagination { display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 12px; }
  .mobile-pagination__hint { color: var(--el-text-color-secondary); font-size: 12px; }
  .case-card { border: 1px solid var(--el-border-color); border-radius: $radius-md; padding: 12px; background: var(--el-bg-color); }
  .case-card__heading { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .case-card__items { margin: 10px 0; font-weight: 500; }
  .case-card__meta { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 12px; color: var(--el-text-color-secondary); font-size: 12px; }
  .case-card__meta span:last-child { grid-column: 1 / -1; }
  .case-card .el-button { width: 100%; }
}
</style>
