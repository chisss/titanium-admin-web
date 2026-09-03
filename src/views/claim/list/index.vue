<template>
  <!-- 理赔案件列表 -->
  <div class="ti-page">
    <!-- 搜索区 -->
    <TiSearchForm
      :model="queryParams"
      @search="handleSearch"
      @reset="handleReset"
    >
      <el-form-item label="报案号">
        <el-input v-model="queryParams.claimNo" placeholder="理赔编号" clearable style="width: 180px" />
      </el-form-item>
      <el-form-item label="保单号">
        <el-input v-model="queryParams.policyId" placeholder="保单ID" clearable style="width: 180px" />
      </el-form-item>
      <el-form-item label="理赔类型">
        <el-select v-model="queryParams.claimType" placeholder="全部" clearable style="width: 140px">
          <el-option v-for="opt in claimTypeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="案件状态">
        <el-select v-model="queryParams.status" placeholder="全部" clearable style="width: 130px">
          <el-option v-for="opt in claimStatusOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
        </el-select>
      </el-form-item>
    </TiSearchForm>

    <!-- 工具栏 -->
    <div class="ti-toolbar">
      <div class="ti-toolbar-left">
        <span class="toolbar-stat">共 <b>{{ pagination.total }}</b> 条案件</span>
      </div>
      <div class="ti-toolbar-right">
        <el-button type="primary" :icon="Plus" @click="dialogVisible = true">新建案件</el-button>
      </div>
    </div>

    <!-- 表格 -->
    <TiTable
      :data="tableData"
      :total="pagination.total"
      :page-num="pagination.pageNum"
      :page-size="pagination.pageSize"
      :loading="tableLoading"
      row-key="claimId"
      @page-change="onPageChange"
      @size-change="onSizeChange"
    >
      <el-table-column prop="claimNumber" label="报案号" width="190" fixed="left" class-name="ti-code-column" />
      <el-table-column prop="policyId" label="保单号" min-width="180" show-overflow-tooltip />
      <el-table-column label="理赔类型" width="100">
        <template #default="{ row }">{{ claimTypeLabel(row.claimType) }}</template>
      </el-table-column>
      <el-table-column prop="incidentDate" label="出险日期" width="110">
        <template #default="{ row }">{{ formatDate(row.incidentDate) }}</template>
      </el-table-column>
      <el-table-column prop="claimAmount" label="申请赔付" width="120">
        <template #default="{ row }">¥{{ row.claimAmount?.toLocaleString() }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <TiStatusTag :value="row.status" :label="claimStatusLabel(row.status)" />
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="报案时间" width="160">
        <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" min-width="100" fixed="right" class-name="ti-action-column">
        <template #default="{ row }">
          <el-button size="small" :icon="View" @click="goDetail(row.claimId)">详情</el-button>
        </template>
      </el-table-column>
    </TiTable>

    <!-- 新建案件弹窗 -->
    <el-dialog v-model="dialogVisible" title="新建理赔案件" width="560px" destroy-on-close>
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-width="100px">
        <el-form-item label="保单ID" prop="policyId">
          <el-input v-model="createForm.policyId" placeholder="请输入生效保单ID（失焦自动带出客户）" clearable @blur="autoFillCustomer" />
        </el-form-item>
        <el-form-item label="客户ID" prop="customerId">
          <el-input v-model="createForm.customerId" placeholder="请输入客户ID（报案人）" clearable />
        </el-form-item>
        <el-form-item label="理赔类型" prop="claimType">
          <el-select v-model="createForm.claimType" placeholder="请选择" style="width: 100%">
            <el-option v-for="opt in claimTypeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="出险日期" prop="incidentDate">
          <el-date-picker
            v-model="createForm.incidentDate"
            type="datetime"
            placeholder="请选择出险日期"
            value-format="YYYY-MM-DDTHH:mm:ss"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="事故描述" prop="incidentDescription">
          <el-input v-model="createForm.incidentDescription" type="textarea" :rows="2" placeholder="请描述事故经过" />
        </el-form-item>
        <el-form-item label="申请金额" prop="claimAmount">
          <el-input-number v-model="createForm.claimAmount" :min="0.01" :precision="2" style="width: 200px" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="createLoading" @click="submitCreate">提交报案</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { View, Plus } from '@element-plus/icons-vue'
import {
  getClaimList,
  createClaim,
} from '@/api/claim'
import type { ClaimCaseVO, CreateClaimRequest } from '@/api/claim'
import { useTable } from '@/composables/useTable'
import { useDict } from '@/composables/useDict'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import { getPolicyDetail } from '@/api/policy'

const router = useRouter()

/** 理赔类型字典（后端字典驱动，支持国际化） */
const { dictOptions: claimTypeOptions, getLabel: claimTypeLabel } = useDict('CLAIM_TYPE')

/** 理赔状态字典（后端字典驱动，支持国际化） */
const { dictOptions: claimStatusOptions, getLabel: claimStatusLabel } = useDict('CLAIM_STATUS')

const formatDate = (dateStr: string | undefined) => {
  if (!dateStr) return '-'
  return dateStr.split('T')[0] // YYYY-MM-DD
}

const formatDateTime = (dateStr: string | undefined) => {
  if (!dateStr) return '-'
  return dateStr.replace('T', ' ')
}

const queryParams = reactive({
  claimNo: '',
  policyId: '',
  claimType: undefined as string | undefined,
  status: undefined as string | undefined,
})

const { tableData, tableLoading, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange } =
  useTable<ClaimCaseVO, typeof queryParams>((params) => getClaimList(params), queryParams)

fetchData()

const goDetail = (id: string) => router.push(`/claim/detail/${id}`)

// ===== 新建案件 =====

const dialogVisible = ref(false)
const createLoading = ref(false)
const createFormRef = ref<FormInstance>()
const createForm = reactive<CreateClaimRequest>({
  customerId: '',
  policyId: '',
  claimType: '',
  incidentDate: '',
  incidentDescription: '',
  claimAmount: 100,
})

const createRules: FormRules = {
  policyId: [{ required: true, message: '请输入保单ID', trigger: 'blur' }],
  customerId: [{ required: true, message: '请输入客户ID', trigger: 'blur' }],
  claimType: [{ required: true, message: '请选择理赔类型', trigger: 'change' }],
  incidentDate: [{ required: true, message: '请选择出险日期', trigger: 'change' }],
  incidentDescription: [{ required: true, message: '请填写事故描述', trigger: 'blur' }],
  claimAmount: [{ required: true, message: '请填写申请金额', trigger: 'blur' }],
}

/** 保单ID失焦时按保单详情自动带出投保人ID作为客户ID（可手动修改） */
const autoFillCustomer = async () => {
  const policyId = createForm.policyId?.trim()
  if (!policyId || createForm.customerId) return
  try {
    const detail = await getPolicyDetail(policyId)
    if (detail?.policyHolderId) {
      createForm.customerId = detail.policyHolderId
      ElMessage.success('已按保单自动带出客户ID')
    }
  } catch {
    // 保单不存在等错误由 http 拦截器统一展示
  }
}

/** 提交报案（客户ID必填，支持保单失焦自动带出，亦可手动填写） */
const submitCreate = async () => {
  const valid = await createFormRef.value?.validate().catch(() => false)
  if (!valid) return
  createLoading.value = true
  try {
    const claimId = await createClaim({ ...createForm })
    ElMessage.success(`报案成功：${claimId}`)
    dialogVisible.value = false
    fetchData()
    // 读模型投影最终一致：创建命令返回时投影可能尚未落库，延迟二次刷新兜底
    window.setTimeout(fetchData, 1500)
  } catch {
    // 错误提示由 http 拦截器统一展示
  } finally {
    createLoading.value = false
  }
}
</script>

<style scoped lang="scss">
.ti-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;

  .toolbar-stat {
    font-size: 13px;
    color: #606266;
  }
}
</style>
