<template>
  <div class="ti-page maintenance-create">
    <div class="ti-card">
      <div class="page-heading">
        <div>
          <h3>创建保全案件</h3>
          <p>选择保单和已发布保全项，案件创建后进入独立保全工作台。</p>
        </div>
        <el-button text :icon="ArrowLeft" @click="router.back()">返回</el-button>
      </div>

      <el-alert
        title="后台人工建案"
        description="保单快照、产品版本和保全项配置由服务端冻结，操作员只提交业务变更输入。"
        type="info"
        :closable="false"
        show-icon
        class="page-alert"
      />

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="create-form">
        <el-form-item label="保单 ID" prop="policyId">
          <el-input v-model="form.policyId" clearable placeholder="输入需要变更的保单 ID" />
        </el-form-item>
        <el-form-item label="保全项" prop="itemCodes">
          <el-select
            v-model="form.itemCodes"
            multiple
            filterable
            clearable
            :loading="configurationLoading"
            placeholder="请选择已发布的保全项"
            class="full-width"
          >
            <el-option
              v-for="item in publishedItems"
              :key="item.code"
              :label="`${item.name} (${item.code})`"
              :value="item.code"
            />
          </el-select>
          <div v-if="publishedItems.length === 0 && !configurationLoading" class="field-tip">
            暂无配置数据，可先到“保全项配置”确认已发布配置。
          </div>
        </el-form-item>
        <el-form-item label="生效方式" prop="effectiveTimeType">
          <el-select v-model="form.effectiveTimeType" class="full-width">
            <el-option v-for="option in effectiveOptions" :key="option.value" v-bind="option" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.effectiveTimeType === 'SPECIFIED_DATE'" label="指定生效时间" prop="specificEffectiveDate">
          <el-date-picker
            v-model="form.specificEffectiveDate"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss"
            class="full-width"
          />
        </el-form-item>
        <el-form-item label="案件说明">
          <el-input v-model="form.description" type="textarea" :rows="4" maxlength="500" show-word-limit />
        </el-form-item>
        <el-form-item label="客户端幂等键" prop="clientRequestKey">
          <el-input v-model="form.clientRequestKey" clearable>
            <template #append><el-button :icon="Refresh" @click="regenerateKey">重新生成</el-button></template>
          </el-input>
        </el-form-item>
      </el-form>

      <div class="form-actions">
        <el-button @click="router.back()">取消</el-button>
        <el-button type="primary" :loading="submitting" :icon="Check" @click="submit">创建并进入工作台</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Check, Refresh } from '@element-plus/icons-vue'
import { createMaintenanceCase, getMaintenanceConfigurations } from '@/api/maintenance'

const router = useRouter()
const waitForProjection = () => new Promise((resolve) => window.setTimeout(resolve, 500))
const formRef = ref()
const submitting = ref(false)
const configurationLoading = ref(false)
const publishedItems = ref<Array<{ code: string; name: string }>>([])

const form = reactive({
  policyId: '',
  itemCodes: [] as string[],
  effectiveTimeType: 'IMMEDIATE',
  specificEffectiveDate: '',
  description: '',
  clientRequestKey: `manual-${Date.now()}`,
})

const effectiveOptions = [
  { label: '立即生效', value: 'IMMEDIATE' },
  { label: '次期生效', value: 'NEXT_PERIOD' },
  { label: '指定日期', value: 'SPECIFIED_DATE' },
  { label: '追溯生效', value: 'RETROACTIVE' },
  { label: '未来生效', value: 'FUTURE' },
  { label: '下一缴费日', value: 'NEXT_BILLING_DATE' },
  { label: '保单周年日', value: 'POLICY_ANNIVERSARY' },
]

const rules = {
  policyId: [{ required: true, message: '请输入保单 ID', trigger: 'blur' }],
  itemCodes: [{ type: 'array', required: true, min: 1, message: '至少选择一个保全项', trigger: 'change' }],
  effectiveTimeType: [{ required: true, message: '请选择生效方式', trigger: 'change' }],
  specificEffectiveDate: [{ required: true, message: '请选择指定生效时间', trigger: 'change' }],
  clientRequestKey: [{ required: true, message: '请输入幂等键', trigger: 'blur' }],
}

const loadConfigurations = async () => {
  configurationLoading.value = true
  try {
    const result = await getMaintenanceConfigurations({ status: 'PUBLISHED', pageNum: 1, pageSize: 200 })
    publishedItems.value = (result.list || [])
      .map((item) => ({
        status: item.status,
        code: item.itemCode || item.definition?.itemCode || '',
        name: item.name || item.definition?.name || item.itemCode || item.definition?.itemCode || '',
      }))
      .filter((item) => item.status === 'PUBLISHED' && item.code)
  } finally {
    configurationLoading.value = false
  }
}

const regenerateKey = () => { form.clientRequestKey = `manual-${Date.now()}` }

const submit = async () => {
  await formRef.value?.validate()
  submitting.value = true
  try {
    const result = await createMaintenanceCase({ ...form, specificEffectiveDate: form.specificEffectiveDate || undefined })
    ElMessage.success('案件创建成功')
    await waitForProjection()
    router.replace(`/maintenance/workbench/${result.maintenanceId}`)
  } finally {
    submitting.value = false
  }
}

onMounted(loadConfigurations)
</script>

<style scoped>
.page-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 18px; }
.page-heading h3 { margin: 0 0 6px; }
.page-heading p { margin: 0; color: var(--el-text-color-secondary); }
.page-alert { margin-bottom: 24px; }
.create-form { max-width: 760px; }
.full-width { width: 100%; }
.field-tip { color: var(--el-text-color-secondary); font-size: 12px; margin-top: 6px; }
.form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 12px; }
@media (max-width: 600px) {
  .page-heading { align-items: stretch; flex-direction: column-reverse; }
  .form-actions { flex-direction: column-reverse; }
  .form-actions .el-button { width: 100%; margin-left: 0; }
}
</style>
