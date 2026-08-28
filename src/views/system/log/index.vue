<template>
  <!-- 操作日志页 -->
  <div class="ti-page">
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="操作用户">
        <el-input v-model="queryParams.username" clearable style="width: 140px" />
      </el-form-item>
      <el-form-item label="功能模块">
        <el-input v-model="queryParams.module" clearable style="width: 140px" />
      </el-form-item>
      <el-form-item label="操作状态">
        <TiDictSelect v-model="queryParams.status" dict-type="OPERATION_RESULT" placeholder="全部" style="width: 110px" />
      </el-form-item>
      <el-form-item label="操作时间">
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
      <el-table-column prop="username" label="操作用户" width="120" />
      <el-table-column prop="module" label="功能模块" width="120" />
      <el-table-column prop="action" label="操作类型" width="120" />
      <el-table-column prop="requestIp" label="IP地址" width="130" />
      <el-table-column prop="duration" label="耗时(ms)" width="100">
        <template #default="{ row }">
          <span :class="{ 'slow-op': row.duration > 1000 }">{{ row.duration }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 'SUCCESS' ? 'success' : 'danger'" size="small">
            {{ operationResultLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="message" label="备注" min-width="180" show-overflow-tooltip />
      <el-table-column prop="createdAt" label="操作时间" width="160" />
      <!-- @vue-generic {OperationLog} -->
      <el-table-column label="操作" width="80" fixed="right">
        <template #default="{ row }">
          <el-button size="small" :icon="View" @click="viewDetail(row)">详情</el-button>
        </template>
      </el-table-column>
    </TiTable>

    <!-- 日志详情对话框 -->
    <el-dialog v-model="detailVisible" title="日志详情" width="560px">
      <el-descriptions v-if="selectedLog" :column="2" border>
        <el-descriptions-item label="操作用户">{{ selectedLog.username }}</el-descriptions-item>
        <el-descriptions-item label="IP地址">{{ selectedLog.requestIp }}</el-descriptions-item>
        <el-descriptions-item label="功能模块">{{ selectedLog.module }}</el-descriptions-item>
        <el-descriptions-item label="操作类型">{{ selectedLog.action }}</el-descriptions-item>
        <el-descriptions-item label="耗时">{{ selectedLog.duration }} ms</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="selectedLog.status === 'SUCCESS' ? 'success' : 'danger'" size="small">
            {{ operationResultLabel(selectedLog.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="操作时间" :span="2">{{ selectedLog.createdAt }}</el-descriptions-item>
        <el-descriptions-item v-if="selectedLog.message" label="备注信息" :span="2">
          {{ selectedLog.message }}
        </el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { View } from '@element-plus/icons-vue'
import { getOperationLogs } from '@/api/log'
import { useTable } from '@/composables/useTable'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import { useDict } from '@/composables/useDict'
import type { OperationLog } from '@/types/business.d'
import type { PageResult } from '@/types/api.d'

const { getLabel: operationResultLabel } = useDict('OPERATION_RESULT')

const queryParams = reactive({
  username: '',
  module: '',
  status: undefined as string | undefined,
  dateRange: undefined as string[] | undefined,
})

const { tableData, tableLoading, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange } =
  useTable<OperationLog, typeof queryParams>((params) => {
    const { dateRange, ...rest } = params
    return getOperationLogs({ ...rest, dateRange }) as Promise<PageResult<OperationLog>>
  }, queryParams)

fetchData()

const detailVisible = ref(false)
const selectedLog = ref<OperationLog | null>(null)

const viewDetail = (row: OperationLog) => {
  selectedLog.value = row
  detailVisible.value = true
}
</script>

<style scoped lang="scss">
.slow-op {
  color: $warning-color;
  font-weight: 600;
}
</style>
