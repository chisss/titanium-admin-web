<template>
  <!-- 核保工单详情 -->
  <div class="ti-page">
    <div class="ti-card" v-loading="loading">
      <div class="detail-header">
        <el-button :icon="ArrowLeft" text @click="$router.back()">返回</el-button>
        <h3>核保工单 - {{ detail?.caseNo || detail?.underwritingId }}</h3>
        <TiStatusTag v-if="detail" :value="detail.status" :label="underwritingStatusLabel(detail.status)" />
      </div>

      <!-- 核保基本信息 -->
      <el-descriptions v-if="detail" :column="3" border style="margin-bottom: 24px">
        <el-descriptions-item label="核保案号">
          <TiCopyText :text="detail.caseNo || '-'" />
        </el-descriptions-item>
        <el-descriptions-item label="核保类型">{{ underwritingTypeLabel(detail.underwritingType ?? '') }}</el-descriptions-item>
        <el-descriptions-item label="核保金额">
          {{ detail.amount != null ? `¥${Number(detail.amount).toLocaleString()}` : '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="风险等级">{{ riskLevelLabel(detail.riskLevel) }}</el-descriptions-item>
        <el-descriptions-item label="结论类型">{{ conclusionTypeLabel(detail.conclusionType) }}</el-descriptions-item>
        <el-descriptions-item label="审核类型">{{ auditTypeLabel(detail.auditType) }}</el-descriptions-item>
        <el-descriptions-item label="核保员">{{ detail.underwriterName || detail.underwriterId || '-' }}</el-descriptions-item>
        <!-- D-501-42：三处时间此前直出后端 ISO 串，统一走全局日期工具 -->
        <el-descriptions-item label="申请时间">{{ formatDateTime(detail.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="核保开始时间">{{ formatDateTime(detail.underwritingStartTime) }}</el-descriptions-item>
        <el-descriptions-item label="核保完成时间">{{ formatDateTime(detail.underwritingCompletedTime) }}</el-descriptions-item>
        <el-descriptions-item label="处理耗时">
          {{ detail.processingHours != null ? `${detail.processingHours} 小时` : '-' }}
        </el-descriptions-item>
      </el-descriptions>

      <!-- 核保结论与保费信息（有结论字段时显示） -->
      <template v-if="detail && hasConclusion(detail)">
        <div class="section-title">核保结论</div>
        <el-descriptions :column="3" border style="margin-bottom: 24px">
          <el-descriptions-item v-if="detail.rejectReason" label="拒保原因" :span="3">{{ detail.rejectReason }}</el-descriptions-item>
          <el-descriptions-item v-if="detail.reviewComments" label="复核意见" :span="3">{{ detail.reviewComments }}</el-descriptions-item>
          <el-descriptions-item v-if="detail.premiumSurchargeRate != null" label="加费比例">
            {{ Number(detail.premiumSurchargeRate).toLocaleString() }}%
          </el-descriptions-item>
          <el-descriptions-item v-if="detail.surchargeReason" label="加费原因" :span="2">{{ detail.surchargeReason }}</el-descriptions-item>
          <el-descriptions-item v-if="detail.exclusions" label="除外责任" :span="3">{{ detail.exclusions }}</el-descriptions-item>
          <el-descriptions-item v-if="detail.postponePeriodMonths != null" label="延期月数">
            {{ detail.postponePeriodMonths }} 个月
          </el-descriptions-item>
          <el-descriptions-item v-if="detail.postponeReason" label="延期原因" :span="2">{{ detail.postponeReason }}</el-descriptions-item>
          <el-descriptions-item label="基础保费">{{ formatMoney(detail.basePremium) }}</el-descriptions-item>
          <el-descriptions-item label="加费金额">{{ formatMoney(detail.additionalPremium) }}</el-descriptions-item>
          <el-descriptions-item label="折扣金额">{{ formatMoney(detail.discountAmount) }}</el-descriptions-item>
          <el-descriptions-item label="最终保费">{{ formatMoney(detail.finalPremium) }}</el-descriptions-item>
          <el-descriptions-item label="是否需要复核">{{ detail.requiresReview ? '是' : '否' }}</el-descriptions-item>
          <el-descriptions-item label="复核人意见">{{ detail.reviewerComments || '-' }}</el-descriptions-item>
        </el-descriptions>
      </template>

      <!-- 核保决策表单 - 人工审核状态时显示 -->
      <template v-if="detail?.status === 'MANUAL_REVIEW'">
        <el-divider />
        <div class="section-title">核保决策</div>
        <el-form
          ref="decisionFormRef"
          :model="decisionForm"
          :rules="decisionRules"
          label-width="100px"
          style="max-width: 560px"
        >
          <el-form-item label="审核类型" prop="auditType">
            <el-select v-model="decisionForm.auditType" placeholder="请选择审核类型" style="width: 200px">
              <el-option v-for="item in auditTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
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
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import { getUnderwritingDetail, makeDecision } from '@/api/underwriting'
import type { UnderwritingCaseVO, DecisionRequest } from '@/api/underwriting'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiCopyText from '@/components/TiCopyText/index.vue'
import { useDict } from '@/composables/useDict'
import { formatDateTime } from '@/utils/date'

const { getLabel: underwritingStatusLabel } = useDict('UNDERWRITING_STATUS')
const { getLabel: underwritingTypeLabel } = useDict('UNDERWRITING_TYPE')

/** 审核类型选项（对齐 metadata UnderwritingEnum.AuditType，无字典故本地定义） */
const auditTypeOptions = [
  { value: 'MANUAL', label: '人工核保' },
  { value: 'AUTOMATIC', label: '自动核保' },
  { value: 'HYBRID', label: '混合核保' },
]

/** 风险等级文案（对齐 metadata UnderwritingEnum.RiskLevel） */
const riskLevelLabel = (code?: string): string => {
  const map: Record<string, string> = {
    STANDARD: '标准体', SUB_STANDARD: '次标准体', HIGH_RISK: '高风险体', UNINSURABLE: '不可保体',
  }
  return code ? map[code] ?? code : '-'
}

/** 结论类型文案（对齐 metadata UnderwritingEnum.ConclusionType） */
const conclusionTypeLabel = (code?: string): string => {
  const map: Record<string, string> = {
    ACCEPT: '接受投保', MODIFY: '修改条件承保', REJECT: '拒绝投保', POSTPONE: '延期投保', EXCLUDED: '除外承保',
  }
  return code ? map[code] ?? code : '-'
}

/** 审核类型文案（对齐 metadata UnderwritingEnum.AuditType） */
const auditTypeLabel = (code?: string): string => {
  const map: Record<string, string> = { AUTOMATIC: '自动核保', MANUAL: '人工核保', HYBRID: '混合核保' }
  return code ? map[code] ?? code : '-'
}

/** 金额格式化 */
const formatMoney = (value?: number): string => {
  return value != null ? `¥${Number(value).toLocaleString()}` : '-'
}

/** 是否有可展示的核保结论信息 */
const hasConclusion = (detail: UnderwritingCaseVO): boolean => {
  return Boolean(
    detail.rejectReason || detail.reviewComments || detail.premiumSurchargeRate != null
    || detail.surchargeReason || detail.exclusions || detail.postponePeriodMonths != null
    || detail.postponeReason || detail.basePremium != null || detail.additionalPremium != null
    || detail.finalPremium != null || detail.discountAmount != null || detail.requiresReview != null
    || detail.reviewerComments,
  )
}

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const submitting = ref(false)
const detail = ref<UnderwritingCaseVO | null>(null)
const decisionFormRef = ref<FormInstance>()

const decisionForm = ref<{ auditType: string }>({ auditType: 'MANUAL' })

const decisionRules: FormRules = {
  auditType: [{ required: true, message: '请选择审核类型', trigger: 'change' }],
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
      auditType: decisionForm.value.auditType,
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
