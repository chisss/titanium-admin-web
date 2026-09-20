<template>
  <!-- 监管报告管理列表页 -->
  <div class="ti-page">
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="报告类型">
        <TiDictSelect v-model="queryParams.reportType" dict-type="REGULATORY_REPORT_TYPE" style="width: 180px" />
      </el-form-item>
      <el-form-item label="状态">
        <TiDictSelect v-model="queryParams.status" dict-type="REGULATORY_STATUS" placeholder="全部" style="width: 130px" />
      </el-form-item>
      <el-form-item label="报告期间">
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
      :max-height="'var(--ti-table-max-height-default)'"
      @page-change="onPageChange"
      @size-change="onSizeChange"
    >
      <!-- 🔴 主键是 reportId：下游响应无 id / reportNo（D-501-59） -->
      <el-table-column prop="reportId" label="报告编号" width="220" class-name="ti-code-column">
        <template #default="{ row }">
          <TiCopyText :text="row.reportId" />
        </template>
      </el-table-column>
      <el-table-column prop="reportType" label="报告类型" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">{{ reportTypeLabel(row.reportType) }}</template>
      </el-table-column>
      <!-- 报告期间由 startDate / endDate 合成：下游无 reportDate 字段 -->
      <el-table-column label="报告期间" width="210">
        <template #default="{ row }">{{ row.startDate && row.endDate ? `${row.startDate} ~ ${row.endDate}` : '-' }}</template>
      </el-table-column>
      <el-table-column prop="companyId" label="报送主体" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">{{ row.companyId || '-' }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <TiStatusTag :value="row.status" :color="STATUS_COLOR[row.status]" :label="regulatoryStatusLabel(row.status)" />
        </template>
      </el-table-column>
      <!-- 时间列统一走全局日期工具，避免直出后端 ISO 串（2026-09-18 全站实测）；prop 同步改为真实字段 submittedAt（此前误写 updatedAt，与实际渲染字段不符） -->
      <el-table-column prop="submittedAt" label="提交时间" width="170">
        <template #default="{ row }">{{ formatDateTime(row.submittedAt) }}</template>
      </el-table-column>
      <!-- @vue-generic {RegulatoryReportVO} -->
      <el-table-column label="操作" min-width="200" fixed="right" class-name="ti-action-column">
        <template #default="{ row }">
          <el-button size="small" :icon="View" @click="handleView(row)">查看</el-button>
          <!-- 状态机实际取值只有 PENDING/SUBMITTED/APPROVED/REJECTED，字典中的 DRAFT 从不产生 -->
          <el-button
            v-if="row.status === 'PENDING'"
            size="small" type="primary"
            v-permission="'regulatory:submit'"
            :loading="rowPending === actionKey(row.reportId, 'submit')"
            @click="handleSubmit(row)"
          >
            提交
          </el-button>
          <el-button
            v-if="row.status === 'SUBMITTED'"
            size="small" type="success"
            v-permission="'regulatory:approve'"
            :loading="rowPending === actionKey(row.reportId, 'approve')"
            @click="handleApprove(row)"
          >
            通过
          </el-button>
          <el-button
            v-if="row.status === 'SUBMITTED'"
            size="small" type="danger"
            v-permission="'regulatory:approve'"
            :loading="rowPending === actionKey(row.reportId, 'reject')"
            @click="handleReject(row)"
          >
            驳回
          </el-button>
        </template>
      </el-table-column>
    </TiTable>

    <!-- 新建报告对话框：字段以下游 CreateRegulatoryReportDTO 必填项为准 -->
    <el-dialog v-model="dialogVisible" title="新建监管报告" width="560px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="报送主体" prop="companyId">
          <el-input v-model="form.companyId" placeholder="监管报送主体（默认为当前租户）" />
        </el-form-item>
        <el-form-item label="报告类型" prop="reportType">
          <TiDictSelect v-model="form.reportType" dict-type="REGULATORY_REPORT_TYPE" style="width: 100%" />
        </el-form-item>
        <el-form-item label="报告期间" prop="period">
          <el-date-picker
            v-model="form.period"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="报告总金额" prop="totalAmount">
          <el-input-number v-model="form.totalAmount" :min="0" :precision="2" :controls="false" style="width: 100%" />
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
import { ref, reactive, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, View } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'
import {
  getRegulatoryReportList, getRegulatoryReportDetail, createRegulatoryReport,
  submitRegulatoryReport, approveRegulatoryReport, rejectRegulatoryReport,
} from '@/api/regulatory'
import type { RegulatoryReportVO } from '@/api/regulatory'
import { useTable } from '@/composables/useTable'
import { useUserStore } from '@/stores/user'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import TiCopyText from '@/components/TiCopyText/index.vue'
import { useDict } from '@/composables/useDict'
import { formatDateTime } from '@/utils/date'
import { useRowAction, confirmAction, actionKey } from '@/composables/useRowAction'

/** 状态标签颜色映射（值域与下游 RegulatoryReportStatus 对齐） */
const STATUS_COLOR: Record<string, string> = {
  PENDING: 'info',
  SUBMITTED: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
}

const { getLabel: regulatoryStatusLabel } = useDict('REGULATORY_STATUS')
const { getLabel: reportTypeLabel } = useDict('REGULATORY_REPORT_TYPE')
const userStore = useUserStore()

const queryParams = reactive({
  reportType: undefined as string | undefined,
  status: undefined as string | undefined,
  startDate: undefined as string | undefined,
  endDate: undefined as string | undefined,
})

/**
 * 报告期间范围：**直接派生自 queryParams**，不再是一份独立的影子状态。
 *
 * <p>🔴 原实现是 `const dateRange = ref()` + `watch(dateRange)` 往 queryParams 里回写
 * startDate/endDate。单看没问题，但「重置」只清 queryParams（TiSearchForm 还原 model、
 * useTable.handleReset 删掉全部键），**dateRange 不在这份数据里、无人清它** ——
 * 于是重置后列表已经不按期间过滤了，日期框里却仍显示着旧的区间：
 * 控件在说谎，用户会以为结果被 2026-01-01~03-01 过滤过。</p>
 *
 * <p>改成 get/set 计算属性后，日期框只是 queryParams 的一个视图，两者不可能再不同步。</p>
 */
const dateRange = computed<string[] | undefined>({
  get: () => (queryParams.startDate && queryParams.endDate ? [queryParams.startDate, queryParams.endDate] : undefined),
  set: (val) => {
    queryParams.startDate = val?.[0]
    queryParams.endDate = val?.[1]
  },
})

const { tableData, tableLoading, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange } =
  useTable<RegulatoryReportVO, typeof queryParams>((params) => getRegulatoryReportList(params), queryParams)

fetchData()

/** 行内状态推进（提交/通过/驳回）的 pending 与错误兜底统一由 useRowAction 承担 */
const { rowPending, run } = useRowAction(fetchData)

const dialogVisible = ref(false)
const saving = ref(false)
const formRef = ref<FormInstance>()

const form = reactive({
  companyId: '',
  reportType: undefined as string | undefined,
  period: undefined as string[] | undefined,
  totalAmount: undefined as number | undefined,
})

const rules: FormRules = {
  companyId: [{ required: true, message: '请输入报送主体', trigger: 'blur' }],
  reportType: [{ required: true, message: '请选择报告类型', trigger: 'change' }],
  period: [{ required: true, message: '请选择报告期间', trigger: 'change' }],
}

/** 报告期间展示：下游以 startDate / endDate 两字段承载，缺一即整体不可用 */
const periodText = (row: RegulatoryReportVO) =>
  row.startDate && row.endDate ? `${row.startDate} ~ ${row.endDate}` : '-'

/** 打开新建对话框 */
const openDialog = () => {
  // 报送主体默认取当前租户，允许按实际报送主体修改
  form.companyId = userStore.tenantId
  form.reportType = undefined
  form.period = undefined
  form.totalAmount = undefined
  dialogVisible.value = true
}

/** 保存报告 */
const handleSave = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    await createRegulatoryReport({
      companyId: form.companyId,
      reportType: form.reportType!,
      startDate: form.period![0],
      endDate: form.period![1],
      totalAmount: form.totalAmount,
    })
    ElMessage.success('创建成功')
    dialogVisible.value = false
    fetchData()
  } finally {
    saving.value = false
  }
}

/** 查看详情（失败须有反馈：此前无 try/catch，主键取错致 404 时界面毫无反应） */
const handleView = async (row: RegulatoryReportVO) => {
  try {
    const detail = await getRegulatoryReportDetail(row.reportId)
    const lines = [
      `报告编号：${detail.reportId}`,
      `报送主体：${detail.companyId || '-'}`,
      `报告期间：${periodText(detail)}`,
      `状态：${regulatoryStatusLabel(detail.status)}`,
    ]
    if (detail.submittedAt) lines.push(`提交：${detail.submittedBy || '-'} @ ${detail.submittedAt}`)
    if (detail.approvedAt) lines.push(`审批：${detail.approvedBy || '-'} @ ${detail.approvedAt}`)
    if (detail.rejectedAt) lines.push(`驳回：${detail.rejectedBy || '-'} @ ${detail.rejectedAt}`)
    if (detail.rejectReason) lines.push(`驳回原因：${detail.rejectReason}`)
    if (detail.comments) lines.push(`审批意见：${detail.comments}`)
    ElMessageBox.alert(lines.join('<br/>'), '报告详情', { dangerouslyUseHTMLString: true })
  } catch {
    ElMessage.error('获取报告详情失败')
  }
}

/** 提交报告 */
const handleSubmit = async (row: RegulatoryReportVO) => {
  if (!(await confirmAction(`确认提交报告"${row.reportId}"？`, '提示', { type: 'warning' }))) return
  await run(actionKey(row.reportId, 'submit'), async () => {
    await submitRegulatoryReport(row.reportId)
    ElMessage.success('提交成功')
  })
}

/** 审批通过 */
const handleApprove = async (row: RegulatoryReportVO) => {
  let comment: string | undefined
  try {
    ({ value: comment } = await ElMessageBox.prompt('请输入审批意见（可选）', '审批通过', {
      type: 'success',
      inputPlaceholder: '审批意见',
      confirmButtonText: '通过',
    }))
  } catch {
    return
  }
  await run(actionKey(row.reportId, 'approve'), async () => {
    await approveRegulatoryReport(row.reportId, { comment })
    ElMessage.success('已通过')
  })
}

/** 驳回报告 */
const handleReject = async (row: RegulatoryReportVO) => {
  let comment: string | undefined
  try {
    ({ value: comment } = await ElMessageBox.prompt('请输入驳回原因', '驳回报告', {
      type: 'warning',
      inputPlaceholder: '驳回原因',
      confirmButtonText: '驳回',
    }))
  } catch {
    return
  }
  await run(actionKey(row.reportId, 'reject'), async () => {
    await rejectRegulatoryReport(row.reportId, { comment })
    ElMessage.success('已驳回')
  })
}
</script>
