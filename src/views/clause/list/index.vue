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
          <el-option label="待审批" value="PENDING_APPROVAL" />
          <el-option label="生效中" value="ACTIVE" />
          <el-option label="已停用" value="INACTIVE" />
          <el-option label="已过期" value="EXPIRED" />
          <el-option label="已归档" value="ARCHIVED" />
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
      :data="tableData"
      :total="pagination.total"
      :page-num="pagination.pageNum"
      :page-size="pagination.pageSize"
      :loading="tableLoading"
      @page-change="onPageChange"
      @size-change="onSizeChange"
    >
      <el-table-column type="index" label="序号" width="60" align="center" fixed="left" />
      <el-table-column prop="code" label="条款编码" width="180" class-name="ti-code-column">
        <template #default="{ row }">
          <TiCopyText :text="row.code" />
        </template>
      </el-table-column>
      <el-table-column prop="name" label="条款名称" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">
          <el-button link type="primary" @click="goDetail(row.id)">{{ row.name }}</el-button>
        </template>
      </el-table-column>
      <el-table-column prop="category" label="险种分类" width="110">
        <template #default="{ row }">{{ getCategoryLabel(row.category) || row.category || '-' }}</template>
      </el-table-column>
      <el-table-column prop="version" label="版本" width="80" />
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <TiStatusTag :value="row.status" />
        </template>
      </el-table-column>
      <el-table-column prop="effectiveDate" label="生效日期" width="110" />
      <el-table-column prop="createdAt" label="创建时间" width="160" />
      <!-- @vue-generic {ClauseVO} -->
      <el-table-column label="操作" min-width="300" fixed="right" class-name="ti-action-column">
        <template #default="{ row }">
          <el-button
            v-if="row.status === 'DRAFT'"
            size="small"
            :icon="Edit"
            v-permission="'clause:edit'"
            @click="goEdit(row.id)"
          >
            编辑
          </el-button>
          <el-button
            v-if="row.status === 'DRAFT'"
            size="small"
            type="primary"
            v-permission="'clause:approve'"
            @click="handleSubmitApproval(row)"
          >
            提交审批
          </el-button>
          <el-button
            v-if="row.status === 'PENDING_APPROVAL'"
            size="small"
            type="success"
            v-permission="'clause:approve'"
            @click="openApprovalDialog('approve', row)"
          >
            通过
          </el-button>
          <el-button
            v-if="row.status === 'PENDING_APPROVAL'"
            size="small"
            type="danger"
            v-permission="'clause:approve'"
            @click="openApprovalDialog('reject', row)"
          >
            驳回
          </el-button>
          <el-button
            v-if="row.status === 'INACTIVE'"
            size="small" type="success"
            v-permission="'clause:approve'"
            @click="handleActivate(row)"
          >
            启用
          </el-button>
          <el-button
            v-if="row.status === 'ACTIVE'"
            size="small" type="danger"
            v-permission="'clause:approve'"
            @click="handleDeactivate(row)"
          >
            停用
          </el-button>
        </template>
      </el-table-column>
    </TiTable>

    <el-dialog
      v-model="approvalDialogVisible"
      :title="approvalAction === 'approve' ? '审批通过' : '审批驳回'"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form ref="approvalFormRef" :model="approvalForm" :rules="approvalRules" label-width="90px">
        <el-form-item label="条款名称">
          <el-text>{{ approvalRow?.name }}</el-text>
        </el-form-item>
        <el-form-item label="审批类型" prop="approvalType">
          <el-select v-model="approvalForm.approvalType" placeholder="请选择审批类型" style="width: 100%">
            <el-option
              v-for="option in APPROVAL_TYPE_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="approvalAction === 'reject' ? '驳回原因' : '审批意见'" prop="comment">
          <el-input
            v-model="approvalForm.comment"
            type="textarea"
            :rows="4"
            :placeholder="approvalAction === 'reject' ? '请输入驳回原因' : '请输入审批意见（可选）'"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="approvalDialogVisible = false">取消</el-button>
        <el-button
          :type="approvalAction === 'approve' ? 'success' : 'danger'"
          :loading="approvalSaving"
          @click="handleApproval"
        >
          确认{{ approvalAction === 'approve' ? '通过' : '驳回' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'
import {
  activateClause,
  approve as approveClause,
  deactivateClause,
  getClauseList,
  reject as rejectClause,
  submitApproval,
} from '@/api/clause'
import type { ClauseApprovalType, ClauseVO } from '@/api/clause'
import { useTable } from '@/composables/useTable'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import TiCopyText from '@/components/TiCopyText/index.vue'
import { useDict } from '@/composables/useDict'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()

// 险种分类编码 → 中文标签（与产品详情页同口径，避免列表直显原始码）
const { getLabel: getCategoryLabel } = useDict('INSURANCE_CATEGORY')

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
const goDetail = (id: string) => router.push(`/clause/detail/${id}`)

const currentOperator = () => {
  const id = userStore.userInfo?.id
  if (!id) {
    ElMessage.error('无法获取当前操作人，请重新登录后再试')
    return null
  }
  return { id, name: userStore.displayName }
}

const handleSubmitApproval = async (row: ClauseVO) => {
  const operator = currentOperator()
  if (!operator) return
  await ElMessageBox.confirm(`确认提交条款"${row.name}"审批？提交后将不可编辑。`, '提示', {
    type: 'warning',
  })
  await submitApproval(row.id, operator.id)
  ElMessage.success('已提交审批')
  await fetchData()
}

type ApprovalAction = 'approve' | 'reject'

const APPROVAL_TYPE_OPTIONS: Array<{ label: string; value: ClauseApprovalType }> = [
  { label: '法务审批', value: 'LEGAL' },
  { label: '精算审批', value: 'ACTUARIAL' },
  { label: '管理审批', value: 'MANAGEMENT' },
]
const approvalDialogVisible = ref(false)
const approvalSaving = ref(false)
const approvalFormRef = ref<FormInstance>()
const approvalAction = ref<ApprovalAction>('approve')
const approvalRow = ref<ClauseVO>()
const approvalForm = reactive({
  approvalType: undefined as ClauseApprovalType | undefined,
  comment: '',
})
const approvalRules = computed<FormRules>(() => ({
  approvalType: [{ required: true, message: '请选择审批类型', trigger: 'change' }],
  comment: approvalAction.value === 'reject'
    ? [{ required: true, message: '请输入驳回原因', trigger: 'blur' }]
    : [],
}))

const openApprovalDialog = (action: ApprovalAction, row: ClauseVO) => {
  approvalAction.value = action
  approvalRow.value = row
  approvalForm.approvalType = undefined
  approvalForm.comment = ''
  approvalDialogVisible.value = true
}

const handleApproval = async () => {
  const valid = await approvalFormRef.value?.validate().catch(() => false)
  if (!valid || !approvalForm.approvalType || !approvalRow.value) return
  const operator = currentOperator()
  if (!operator) return
  approvalSaving.value = true
  try {
    const request = {
      approvalType: approvalForm.approvalType,
      approverId: operator.id,
      approverName: operator.name,
      comment: approvalForm.comment.trim() || undefined,
    }
    if (approvalAction.value === 'approve') {
      await approveClause(approvalRow.value.id, request)
      ElMessage.success('审批已通过')
    } else {
      await rejectClause(approvalRow.value.id, request)
      ElMessage.success('审批已驳回')
    }
    approvalDialogVisible.value = false
    await fetchData()
  } finally {
    approvalSaving.value = false
  }
}

const handleActivate = async (row: ClauseVO) => {
  const operator = currentOperator()
  if (!operator) return
  await ElMessageBox.confirm(`确认重新启用条款"${row.name}"？`, '提示', { type: 'warning' })
  await activateClause(row.id, operator.id)
  ElMessage.success('启用成功')
  await fetchData()
}

const handleDeactivate = async (row: ClauseVO) => {
  const operator = currentOperator()
  if (!operator) return
  await ElMessageBox.confirm(`确认停用条款"${row.name}"？`, '警告', { type: 'warning' })
  await deactivateClause(row.id, operator.id)
  ElMessage.success('停用成功')
  await fetchData()
}
</script>
