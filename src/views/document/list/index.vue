<template>
  <!-- 文档档案列表页 -->
  <div class="ti-page">
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="保单号">
        <el-input v-model="queryParams.policyNo" placeholder="精确查询" clearable style="width: 160px" />
      </el-form-item>
      <el-form-item label="客户ID">
        <el-input v-model="queryParams.customerId" placeholder="精确查询" clearable style="width: 160px" />
      </el-form-item>
      <el-form-item label="文档类型">
        <TiDictSelect v-model="queryParams.documentType" dict-type="DOCUMENT_TYPE" style="width: 150px" />
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="queryParams.status" clearable placeholder="全部" style="width: 130px">
          <el-option label="待签署" value="PENDING_SIGN" />
          <el-option label="已签署" value="SIGNED" />
          <el-option label="已归档" value="ARCHIVED" />
        </el-select>
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
      <el-table-column prop="documentNo" label="文档编号" width="180" class-name="ti-code-column">
        <template #default="{ row }">
          <TiCopyText :text="row.documentNo" />
        </template>
      </el-table-column>
      <el-table-column prop="documentType" label="文档类型" width="140" />
      <el-table-column prop="policyNo" label="关联保单号" width="160" class-name="ti-code-column">
        <template #default="{ row }">{{ row.policyNo || '-' }}</template>
      </el-table-column>
      <el-table-column prop="customerName" label="客户" width="140">
        <template #default="{ row }">{{ row.customerName || row.customerId || '-' }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <TiStatusTag :value="row.status" :color="STATUS_COLOR[row.status]" :label="STATUS_LABEL[row.status]" />
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="160" />
      <!-- @vue-generic {DocumentVO} -->
      <el-table-column label="操作" min-width="150" fixed="right" class-name="ti-action-column">
        <template #default="{ row }">
          <el-button size="small" :icon="View" @click="handleView(row)">详情</el-button>
          <el-button
            v-if="row.status === 'SIGNED' || row.status === 'ARCHIVED'"
            size="small" type="primary"
            :icon="Download"
            @click="handleDownload(row)"
          >
            下载
          </el-button>
        </template>
      </el-table-column>
    </TiTable>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { View, Download } from '@element-plus/icons-vue'
import { getDocumentList, getDocumentDetail, downloadDocument } from '@/api/document'
import type { DocumentVO } from '@/api/document'
import { useTable } from '@/composables/useTable'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import TiCopyText from '@/components/TiCopyText/index.vue'

/** 状态标签颜色映射 */
const STATUS_COLOR: Record<string, string> = {
  PENDING_SIGN: 'warning',
  SIGNED: 'success',
  ARCHIVED: 'info',
}

/** 状态中文标签映射 */
const STATUS_LABEL: Record<string, string> = {
  PENDING_SIGN: '待签署',
  SIGNED: '已签署',
  ARCHIVED: '已归档',
}

const queryParams = reactive({
  policyNo: '',
  customerId: '',
  documentType: undefined as string | undefined,
  status: undefined as string | undefined,
})

const { tableData, tableLoading, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange } =
  useTable<DocumentVO, typeof queryParams>((params) => getDocumentList(params), queryParams)

fetchData()

/** 查看详情 */
const handleView = async (row: DocumentVO) => {
  const detail = await getDocumentDetail(row.id)
  ElMessageBox.alert(
    `文档编号：${detail.documentNo}<br/>文档类型：${detail.documentType}<br/>关联保单：${detail.policyNo || '-'}<br/>状态：${STATUS_LABEL[detail.status] || detail.status}`,
    '文档详情',
    { dangerouslyUseHTMLString: true },
  )
}

/** 下载文档 */
const handleDownload = async (row: DocumentVO) => {
  await downloadDocument(row.id)
  ElMessage.success('已发起下载')
}
</script>
