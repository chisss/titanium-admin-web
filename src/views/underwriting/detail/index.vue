<template>
  <!-- 核保工单详情 -->
  <div class="ti-page">
    <div class="ti-card" v-loading="loading">
      <div class="detail-header">
        <el-button :icon="ArrowLeft" text @click="$router.back()">返回</el-button>
        <h3>核保工单 - {{ detail?.caseNo }}</h3>
        <TiStatusTag v-if="detail" :value="detail.status" />
      </div>

      <!-- 投保基本信息 -->
      <el-descriptions v-if="detail" :column="3" border style="margin-bottom: 24px">
        <el-descriptions-item label="核保案号">{{ detail.caseNo }}</el-descriptions-item>
        <el-descriptions-item label="保单号">{{ detail.policyNo }}</el-descriptions-item>
        <el-descriptions-item label="投保单号">{{ detail.proposalNo }}</el-descriptions-item>
        <el-descriptions-item label="被保人">{{ detail.insuredName }}</el-descriptions-item>
        <el-descriptions-item label="产品名称" :span="2">{{ detail.productName }}</el-descriptions-item>
        <el-descriptions-item label="保额">¥{{ detail.sumInsured?.toLocaleString() }}</el-descriptions-item>
        <el-descriptions-item label="申请时间">{{ detail.applyTime }}</el-descriptions-item>
        <el-descriptions-item label="决策时间">{{ detail.decisionTime || '-' }}</el-descriptions-item>
      </el-descriptions>

      <!-- 历史决策记录（已有决策时显示） -->
      <template v-if="detail?.decisionResult">
        <div class="section-title">历史决策</div>
        <el-descriptions :column="2" border style="margin-bottom: 24px">
          <el-descriptions-item label="决策结果">
            <el-tag :type="decisionTagType(detail.decisionResult)">
              {{ DECISION_LABELS[detail.decisionResult] || detail.decisionResult }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="决策原因">{{ detail.decisionReason || '-' }}</el-descriptions-item>
        </el-descriptions>
      </template>

      <!-- 核保决策表单 - 待人工核保时显示 -->
      <template v-if="detail?.status === 'MANUAL_REVIEWING'">
        <el-divider />
        <div class="section-title">核保决策</div>
        <el-form
          ref="decisionFormRef"
          :model="decisionForm"
          :rules="decisionRules"
          label-width="100px"
          style="max-width: 560px"
        >
          <el-form-item label="决策类型" prop="decision">
            <el-select v-model="decisionForm.decision" placeholder="请选择决策类型" style="width: 200px">
              <el-option label="标准承保" value="APPROVED" />
              <el-option label="加费承保" value="RATED" />
              <el-option label="除外承保" value="EXCLUDED" />
              <el-option label="延期核保" value="POSTPONED" />
              <el-option label="拒绝承保" value="DECLINED" />
            </el-select>
          </el-form-item>
          <el-form-item
            v-if="decisionForm.decision === 'RATED'"
            label="加费比例"
            prop="extraPremiumRate"
          >
            <el-input-number
              v-model="decisionForm.extraPremiumRate"
              :min="0"
              :max="200"
              :precision="2"
              style="width: 160px"
            />
            <span style="margin-left: 8px; color: #909399">%</span>
          </el-form-item>
          <el-form-item
            v-if="decisionForm.decision === 'EXCLUDED'"
            label="除外项目"
          >
            <el-input
              v-model="exclusionsText"
              type="textarea"
              :rows="2"
              placeholder="每行一个除外项目"
              style="width: 360px"
            />
          </el-form-item>
          <el-form-item label="决策原因" prop="reason">
            <el-input
              v-model="decisionForm.reason"
              type="textarea"
              :rows="3"
              placeholder="请填写决策依据"
              style="width: 360px"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="submitting" @click="handleSubmitDecision">提交决策</el-button>
            <el-button @click="$router.back()">取消</el-button>
          </el-form-item>
        </el-form>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules, TagProps } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import { getUnderwritingDetail, makeDecision } from '@/api/underwriting'
import type { UnderwritingCaseVO, DecisionRequest } from '@/api/underwriting'
import TiStatusTag from '@/components/TiStatusTag/index.vue'

/** 决策结果标签映射 */
const DECISION_LABELS: Record<string, string> = {
  APPROVED: '标准承保',
  RATED: '加费承保',
  EXCLUDED: '除外承保',
  POSTPONED: '延期核保',
  DECLINED: '拒绝承保',
}

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const submitting = ref(false)
const detail = ref<UnderwritingCaseVO | null>(null)
const decisionFormRef = ref<FormInstance>()

const decisionForm = ref<{
  decision: DecisionRequest['decision'] | ''
  reason: string
  extraPremiumRate?: number
}>({ decision: '', reason: '', extraPremiumRate: undefined })

/** 除外项输入（换行分隔） */
const exclusionsText = ref('')

/** 决策类型对应的 Tag 颜色 */
const decisionTagType = (result: string): TagProps['type'] => {
  const map: Record<string, TagProps['type']> = {
    APPROVED: 'success', RATED: 'warning', EXCLUDED: 'warning', POSTPONED: 'info', DECLINED: 'danger',
  }
  return map[result] ?? 'info'
}

const decisionRules: FormRules = {
  decision: [{ required: true, message: '请选择决策类型', trigger: 'change' }],
  reason: [{ required: true, message: '请填写决策原因', trigger: 'blur' }],
}

onMounted(async () => {
  loading.value = true
  try {
    detail.value = await getUnderwritingDetail(route.params.id as string)
  } finally {
    loading.value = false
  }
})

/** 提交核保决策 */
const handleSubmitDecision = async () => {
  const valid = await decisionFormRef.value?.validate().catch(() => false)
  if (!valid) return

  await ElMessageBox.confirm('确认提交核保决策？提交后不可更改。', '决策确认', { type: 'warning' })
  submitting.value = true
  try {
    const payload: DecisionRequest = {
      decision: decisionForm.value.decision as DecisionRequest['decision'],
      reason: decisionForm.value.reason,
      extraPremiumRate: decisionForm.value.decision === 'RATED' ? decisionForm.value.extraPremiumRate : undefined,
      exclusions: decisionForm.value.decision === 'EXCLUDED'
        ? exclusionsText.value.split('\n').filter(Boolean)
        : undefined,
    }
    await makeDecision(route.params.id as string, payload)
    ElMessage.success('核保决策已提交')
    router.back()
  } catch {
    ElMessage.error('提交失败，请重试')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped lang="scss">
.detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;

  h3 {
    margin: 0;
    font-size: 18px;
    flex: 1;
  }
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
}
</style>
