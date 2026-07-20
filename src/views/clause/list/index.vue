<template>
  <!-- 条款列表页 -->
  <div class="ti-page">
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="条款名称">
        <el-input v-model="queryParams.name" placeholder="模糊搜索" clearable style="width: 180px" />
      </el-form-item>
      <el-form-item label="条款编码">
        <el-input v-model="queryParams.code" placeholder="精确查询" clearable style="width: 150px" />
      </el-form-item>
      <el-form-item label="险种分类">
        <TiDictSelect v-model="queryParams.category" dict-type="INSURANCE_CATEGORY" style="width: 150px" />
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="queryParams.status" clearable placeholder="全部" style="width: 120px">
          <el-option label="草稿" value="DRAFT" />
          <el-option label="生效中" value="ACTIVE" />
          <el-option label="已停用" value="INACTIVE" />
        </el-select>
      </el-form-item>
    </TiSearchForm>

    <div class="ti-toolbar">
      <div class="ti-toolbar-left">
        <el-button type="primary" :icon="Plus" v-permission="'clause:create'" @click="goEdit()">
          新增条款
        </el-button>
      </div>
    </div>

    <TiTable
      :data="tableData.value"
      :total="pagination.total"
      :page-num="pagination.pageNum"
      :page-size="pagination.pageSize"
      :loading="tableLoading"
      @page-change="onPageChange"
      @size-change="onSizeChange"
    >
      <el-table-column prop="code" label="条款编码" width="160" />
      <el-table-column prop="name" label="条款名称" min-width="200" show-overflow-tooltip />
      <el-table-column prop="category" label="险种分类" width="110" />
      <el-table-column prop="version" label="版本" width="80" />
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <TiStatusTag :value="row.status" />
        </template>
      </el-table-column>
      <el-table-column prop="effectiveDate" label="生效日期" width="110" />
      <el-table-column prop="createdAt" label="创建时间" width="160" />
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button text size="small" :icon="Edit" v-permission="'clause:edit'" @click="goEdit(row.id)">
            编辑
          </el-button>
          <el-button
            v-if="row.status === 'DRAFT'"
            text size="small" type="success"
            v-permission="'clause:activate'"
            @click="handleActivate(row)"
          >
            启用
          </el-button>
          <el-button
            v-if="row.status === 'ACTIVE'"
            text size="small" type="danger"
            v-permission="'clause:deactivate'"
            @click="handleDeactivate(row)"
          >
            停用
          </el-button>
        </template>
      </el-table-column>
    </TiTable>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit } from '@element-plus/icons-vue'
import { getClauseList, activateClause, deactivateClause } from '@/api/clause'
import type { ClauseVO } from '@/api/clause'
import { useTable } from '@/composables/useTable'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'

const router = useRouter()

const queryParams = reactive({
  name: '',
  code: '',
  category: undefined as string | undefined,
  status: undefined as string | undefined,
})

const { tableData, tableLoading, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange } =
  useTable<ClauseVO, typeof queryParams>((params) => getClauseList(params), queryParams)

fetchData()

const goEdit = (id?: string) => router.push(id ? `/clause/edit/${id}` : '/clause/edit')

const handleActivate = async (row: ClauseVO) => {
  await ElMessageBox.confirm(`确认启用条款"${row.name}"？`, '提示', { type: 'warning' })
  await activateClause(row.id)
  ElMessage.success('启用成功')
  fetchData()
}

const handleDeactivate = async (row: ClauseVO) => {
  await ElMessageBox.confirm(`确认停用条款"${row.name}"？`, '警告', { type: 'warning' })
  await deactivateClause(row.id)
  ElMessage.success('停用成功')
  fetchData()
}
</script>
