<template>
  <!-- 监管报告管理列表页 -->
  <div class="ti-page">
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="报告类型">
        <TiDictSelect v-model="queryParams.reportType" dict-type="REGULATORY_REPORT_TYPE" style="width: 180px" />
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="queryParams.status" clearable placeholder="全部" style="width: 130px">
          <el-option label="草稿" value="DRAFT" />
          <el-option label="待审" value="SUBMITTED" />
          <el-option label="已批准" value="APPROVED" />
          <el-option label="已驳回" value="REJECTED" />
        </el-select>
      </el-form-item>
      <el-form-item label="报告日期">
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          style="width: 240px"
        />
      </el-form-item>
    </TiSearchForm>

    <div class="ti-toolbar">
      <div class="ti-toolbar-left">
        <el-button type="primary" :icon="Plus" v-permission="'regulatory:create'" @click="openDialog()">
          新建报告
        </el-button>
      </div>
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
      <el-table-column prop="reportNo" label="报告编号" width="180" class-name="ti-code-column">
        <template #default="{ row }">
          <TiCopyText :text="row.reportNo" />
        </template>
      </el-table-column>
      <el-table-column prop="reportType" label="报告类型" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">{{ row.reportTypeLabel || row.reportType }}</template>
      </el-table-column>
      <el-table-column prop="reportDate" label="报告日期" width="120">
        <template #default="{ row }">{{ row.reportDate || '-' }}</template>
      </el-table-column>
      <el-table-column prop="submittedAt" label="提交时间" width="160">
        <template #default="{ row }">{{ row.submittedAt || '-' }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <TiStatusTag :value="row.status" :color="STATUS_COLOR[row.status]" :label="STATUS_LABEL[row.status]" />
        </template>
      </el-table-column>
      <!-- @vue-generic {RegulatoryReportVO} -->
      <el-table-column label="操作" min-width="220" fixed="right" class-name="ti-action-column">
        <template #default="{ row }">
          <el-button size="small" :icon="View" @click="handleView(row)">查看</el-button>
          <el-button
            v-if="row.status === 'DRAFT'"
            size="small" type="primary"
            v-permission="'regulatory:submit'"
            @click="handleSubmit(row)"
          >
            提交
          </el-button>
          <el-button
            v-if="row.status === 'SUBMITTED'"
            size="small" type="success"
            v-permission="'regulatory:approve'"
            @click="handleApprove(row)"
          >
            通过
          </el-button>
          <el-button
            v-if="row.status === 'SUBMITTED'"
            size="small" type="danger"
            v-permission="'regulatory:approve'"
            @click="handleReject(row)"
          >
            驳回
          </el-button>
        </template>
      </el-table-column>
    </TiTable>

    <!-- 新建报告对话框 -->
    <el-dialog v-model="dialogVisible" title="新建监管报告" width="520px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="报告类型" prop="reportType">
          <TiDictSelect v-model="form.reportType" dict-type="REGULATORY_REPORT_TYPE" style="width: 100%" />
        </el-form-item>
        <el-form-item label="报告日期" prop="reportDate">
          <el-date-picker v-model="form.reportDate" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, View } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'
import {
  getRegulatoryReportList, getRegulatoryReportDetail, createRegulatoryReport,
  submitRegulatoryReport, approveRegulatoryReport, rejectRegulatoryReport,
} from '@/api/regulatory'
import type { RegulatoryReportVO } from '@/api/regulatory'
import { useTable } from '@/composables/useTable'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import TiCopyText from '@/components/TiCopyText/index.vue'

/** 状态标签颜色映射 */
const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'info',
  SUBMITTED: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
}

/** 状态中文标签映射 */
const STATUS_LABEL: Record<string, string> = {
  DRAFT: '草稿',
  SUBMITTED: '待审',
  APPROVED: '已批准',
  REJECTED: '已驳回',
}

const queryParams = reactive({
  reportType: undefined as string | undefined,
  status: undefined as string | undefined,
  startDate: undefined as string | undefined,
  endDate: undefined as string | undefined,
})

// 报告日期范围（拆分为 startDate/endDate 后传给后端）
const dateRange = ref<string[] | undefined>(undefined)
watch(dateRange, (val) => {
  queryParams.startDate = val?.[0]
  queryParams.endDate = val?.[1]
})

const { tableData, tableLoading, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange } =
  useTable<RegulatoryReportVO, typeof queryParams>((params) => getRegulatoryReportList(params), queryParams)

fetchData()

const dialogVisible = ref(false)
const saving = ref(false)
const formRef = ref<FormInstance>()

const form = reactive({
  reportType: undefined as string | undefined,
  reportDate: undefined as string | undefined,
})

const rules: FormRules = {
  reportType: [{ required: true, message: '请选择报告类型', trigger: 'change' }],
  reportDate: [{ required: true, message: '请选择报告日期', trigger: 'change' }],
}

/** 打开新建对话框 */
const openDialog = () => {
  form.reportType = undefined
  form.reportDate = undefined
  dialogVisible.value = true
}

/** 保存报告 */
const handleSave = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    await createRegulatoryReport(form)
    ElMessage.success('创建成功')
    dialogVisible.value = false
    fetchData()
  } finally {
    saving.value = false
  }
}

/** 查看详情 */
const handleView = async (row: RegulatoryReportVO) => {
  const detail = await getRegulatoryReportDetail(row.id)
  ElMessageBox.alert(
    `报告编号：${detail.reportNo}<br/>报告类型：${detail.reportTypeLabel || detail.reportType}<br/>状态：${STATUS_LABEL[detail.status] || detail.status}`,
    '报告详情',
    { dangerouslyUseHTMLString: true },
  )
}

/** 提交报告 */
const handleSubmit = async (row: RegulatoryReportVO) => {
  await ElMessageBox.confirm(`确认提交报告"${row.reportNo}"？`, '提示', { type: 'warning' })
  await submitRegulatoryReport(row.id)
  ElMessage.success('提交成功')
  fetchData()
}

/** 审批通过 */
const handleApprove = async (row: RegulatoryReportVO) => {
  const { value: comment } = await ElMessageBox.prompt('请输入审批意见（可选）', '审批通过', {
    type: 'success',
    inputPlaceholder: '审批意见',
    confirmButtonText: '通过',
  })
  await approveRegulatoryReport(row.id, { comment })
  ElMessage.success('已通过')
  fetchData()
}

/** 驳回报告 */
const handleReject = async (row: RegulatoryReportVO) => {
  const { value: comment } = await ElMessageBox.prompt('请输入驳回原因', '驳回报告', {
    type: 'warning',
    inputPlaceholder: '驳回原因',
    confirmButtonText: '驳回',
  })
  await rejectRegulatoryReport(row.id, { comment })
  ElMessage.success('已驳回')
  fetchData()
}
</script>
