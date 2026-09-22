<template>
  <!-- 文档档案列表页 -->
  <div class="ti-page">
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="关联业务单据ID">
        <el-input v-model="queryParams.businessId" placeholder="保单号/赔案号/保全案件号" clearable style="width: 200px" />
      </el-form-item>
      <el-form-item label="文档类型">
        <TiDictSelect v-model="queryParams.documentType" dict-type="DOCUMENT_TYPE" style="width: 150px" />
      </el-form-item>
      <el-form-item label="状态">
        <TiDictSelect v-model="queryParams.status" dict-type="DOCUMENT_STATUS" placeholder="全部" style="width: 130px" />
      </el-form-item>
    </TiSearchForm>

    <TiTable
      :data="tableData"
      :total="pagination.total"
      :page-num="pagination.pageNum"
      :page-size="pagination.pageSize"
      :loading="tableLoading"
      :max-height="'var(--ti-table-max-height-lean)'"
      @page-change="onPageChange"
      @size-change="onSizeChange"
      :error="tableError"
      @refresh="retry"
    >
      <el-table-column prop="fileName" label="文件名" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">{{ row.fileName || '-' }}</template>
      </el-table-column>
      <el-table-column prop="documentType" label="文档类型" width="130">
        <template #default="{ row }">{{ documentTypeLabel(row.documentType) }}</template>
      </el-table-column>
      <el-table-column prop="businessId" label="关联业务" min-width="200" class-name="ti-code-column">
        <template #default="{ row }">
          <template v-if="row.businessId">
            <span class="ti-business-type">{{ businessTypeLabel(row.businessType) }}</span>
            <TiCopyText :text="row.businessId" />
          </template>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="fileFormat" label="格式/大小" width="130">
        <template #default="{ row }">{{ row.fileFormat || '-' }} / {{ formatFileSize(row.fileSize) }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <TiStatusTag :value="row.status" :color="STATUS_COLOR[row.status]" :label="documentStatusLabel(row.status)" />
        </template>
      </el-table-column>
      <el-table-column prop="createTime" label="创建时间" width="170">
        <template #default="{ row }">{{ formatDateTime(row.createTime) }}</template>
      </el-table-column>
      <!-- @vue-generic {DocumentVO} -->
      <el-table-column label="操作" width="200" fixed="right" class-name="ti-action-column">
        <template #default="{ row }">
          <el-button size="small" :icon="View" @click="handleView(row)">详情</el-button>
          <!-- 下载按钮仅在文件已落盘的状态可见：GENERATING 阶段文件尚未生成，点了必然 404 -->
          <!-- 🔴 权限码是 document:list，**没有更细的 document:download**：admin 种子 128 个码里
               document 域只有 list 一个，DocumentProxyController 的 `GET /{documentId}/download`
               本身就用 DOCUMENT_LIST 守着。故这里是「与后端逐字对齐」而非「编造一个更细的码」——
               编造不存在的码会让按钮对非超管永久隐藏（比不加权限更危险）。
               实际效果上本页用户必然已持有该码（否则进不来），故这条检查恒真，作用是**如实地把
               真实权威写在代码里**，而不是留一个看起来"忘了判权限"的按钮。 -->
          <el-button
            v-if="DOWNLOADABLE_STATUS.includes(row.status) && hasPermission('document:list')"
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
import { ElMessageBox } from 'element-plus'
import { View, Download } from '@element-plus/icons-vue'
import { getDocumentList, getDocumentDetail, downloadDocument } from '@/api/document'
import { showErrorIfUnhandled } from '@/api/http'
import type { DocumentVO } from '@/api/document'
import { useTable } from '@/composables/useTable'
import { formatDateTime } from '@/utils/date'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import TiCopyText from '@/components/TiCopyText/index.vue'
import { useDict } from '@/composables/useDict'
import { usePermission } from '@/composables/usePermission'

/** 状态标签颜色映射（对齐领域状态机 GENERATING → GENERATED → SIGNED → ARCHIVED） */
const STATUS_COLOR: Record<string, string> = {
  GENERATING: 'warning',
  GENERATED: 'primary',
  SIGNED: 'success',
  ARCHIVED: 'info',
}

/** 文件已落盘、可下载的状态（GENERATING 仅登记了元信息，文件尚未生成） */
const DOWNLOADABLE_STATUS = ['GENERATED', 'SIGNED', 'ARCHIVED']

/**
 * 关联业务类型展示名兜底。
 * <p>本域单证仅由 policy / claim / maintenance 三域触发生成（见模块规约 §4.4 三条入站链路），
 * 故只映射这三个业务域类型；其余取值原样呈现，不臆造文案。</p>
 */
const BUSINESS_TYPE_LABEL: Record<string, string> = {
  POLICY: '保单',
  CLAIM: '赔案',
  MAINTENANCE: '保全',
}

const { getLabel: documentStatusLabel } = useDict('DOCUMENT_STATUS')
const { getLabel: documentTypeLabel } = useDict('DOCUMENT_TYPE')
/** 下载按钮的权限判定（判在 v-if 表达式里，见模板注释） */
const { hasPermission } = usePermission()

const businessTypeLabel = (businessType?: string): string =>
  businessType ? BUSINESS_TYPE_LABEL[businessType] || businessType : ''

/** 文件大小可读化（读模型存字节数） */
const formatFileSize = (size?: number): string => {
  if (size === undefined || size === null || size < 0) return '-'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

const queryParams = reactive({
  /** 关联业务单据ID（由 BFF 转成下游的 policyId 过滤键） */
  businessId: '',
  documentType: undefined as string | undefined,
  status: undefined as string | undefined,
})

const { tableData, tableLoading, tableError, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange, retry } =
  useTable<DocumentVO, typeof queryParams>((params) => getDocumentList(params), queryParams)

fetchData()

/** 查看详情 */
const handleView = async (row: DocumentVO) => {
  try {
    const detail = await getDocumentDetail(row.documentId)
    const signer = detail.signerName
      ? `<br/>签署人：${detail.signerName}${detail.signedAt ? `（${formatDateTime(detail.signedAt)}）` : ''}`
      : ''
    ElMessageBox.alert(
      `文件名：${detail.fileName || '-'}<br/>文档类型：${documentTypeLabel(detail.documentType)}<br/>`
        + `关联业务：${businessTypeLabel(detail.businessType)} ${detail.businessId || '-'}<br/>`
        + `格式/大小：${detail.fileFormat || '-'} / ${formatFileSize(detail.fileSize)}<br/>`
        + `状态：${documentStatusLabel(detail.status)}${signer}`,
      '文档详情',
      { dangerouslyUseHTMLString: true },
    )
  } catch (error) {
    // 失败原因已由响应拦截器统一提示（如单证不存在），此处仅避免未捕获 rejection
    showErrorIfUnhandled(error, '详情加载失败')
  }
}

/** 下载文档（取回文件字节后由浏览器落盘；失败走拦截器提示，不谎报「已发起下载」） */
const handleDownload = async (row: DocumentVO) => {
  try {
    const blob = await downloadDocument(row.documentId)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = row.fileName || `${row.documentId}.bin`
    a.click()
    // 延迟释放：立即 revoke 会使部分浏览器的下载中断
    setTimeout(() => URL.revokeObjectURL(url), 0)
  } catch (error) {
    showErrorIfUnhandled(error, '下载失败')
  }
}
</script>

<style scoped lang="scss">
.ti-business-type {
  margin-right: 6px;
  color: var(--el-text-color-secondary);
}
</style>
