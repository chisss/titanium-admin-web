<template>
  <div class="ti-page">
    <div class="ti-card" v-loading="loading">
      <div class="detail-header">
        <el-button :icon="ArrowLeft" text @click="router.back()">返回</el-button>
        <h3>保全工单 - {{ detail?.id || route.params.id }}</h3>
        <TiStatusTag v-if="detail" :value="detail.status" />
      </div>

      <el-descriptions v-if="detail" :column="detailColumnCount" border>
        <el-descriptions-item label="保全ID">{{ detail.id }}</el-descriptions-item>
        <el-descriptions-item label="保单ID">{{ detail.policyId }}</el-descriptions-item>
        <el-descriptions-item label="客户ID">{{ detail.customerId }}</el-descriptions-item>
        <el-descriptions-item label="保全类型">{{ detail.maintenanceType }}</el-descriptions-item>
        <el-descriptions-item label="生效方式">{{ detail.effectiveTimeType || '-' }}</el-descriptions-item>
        <el-descriptions-item label="指定生效时间">{{ formatTime(detail.specificEffectiveDate) }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatTime(detail.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="创建人">{{ detail.createdBy || '-' }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{ formatTime(detail.updatedAt) }}</el-descriptions-item>
        <el-descriptions-item label="说明" :span="detailColumnCount">{{ detail.description || '-' }}</el-descriptions-item>
      </el-descriptions>

      <section v-if="detail" class="pricing-section">
        <div class="section-heading">
          <div>
            <div class="section-title">{{ isSurrender ? '退保价值与退款' : '费用计算' }}</div>
            <span v-if="isSurrender">Product 确定现金价值，Billing 与 Payment 承接贷项和实际退款。</span>
            <span v-else>Product 生成不可变差额事实，Billing 仅登记客户余额影响。</span>
          </div>
          <TiStatusTag
            :value="settlementView.premiumSettlementStatus"
            :label="settlementStatusLabel(settlementView.premiumSettlementStatus)"
            :color="settlementStatusColor(settlementView.premiumSettlementStatus)"
          />
        </div>

        <el-alert
          v-if="settlementView.premiumSettlementStatus === 'SETTLED'"
          title="退款已完成"
          description="Billing 退款指令与 Payment 退款订单均已完成，可通过下方证据编号追溯资金处理。"
          type="success"
          :closable="false"
          show-icon
        />
        <el-alert
          v-else-if="settlementView.premiumSettlementStatus === 'SETTLEMENT_PENDING'"
          title="资金结算处理中"
          description="余额事实已登记，退款指令正在执行；可使用相同输入安全重试并刷新结果。"
          type="warning"
          :closable="false"
          show-icon
        />
        <el-alert
          v-else-if="settlementView.premiumSettlementStatus === 'SETTLEMENT_FAILED'"
          title="资金结算失败"
          description="余额事实仍然有效，系统不会重复入账；请核对失败原因后使用相同输入重试。"
          type="error"
          :closable="false"
          show-icon
        />
        <el-alert
          v-else-if="settlementView.premiumSettlementStatus === 'POSTED'"
          title="余额事实已登记/待结算"
          description="该状态仅表示 Billing 已登记追加应收或贷方余额，不表示已完成收款或退款。"
          type="success"
          :closable="false"
          show-icon
        />
        <el-alert
          v-else-if="settlementView.premiumSettlementStatus === 'ADJUSTMENT_CONFIRMED'"
          title="Product 差额已确认，Billing 入账尚未完成"
          description="可使用相同输入重试，系统会复用已确认事实并继续登记余额。"
          type="warning"
          :closable="false"
          show-icon
        />
        <el-alert
          v-else-if="settlementView.premiumSettlementStatus === 'NOT_REQUIRED'"
          title="本次变更不影响客户余额"
          description="Product 已确认差额为零，因此不创建 Billing 余额事实。"
          type="info"
          :closable="false"
          show-icon
        />

        <el-steps :active="settlementActiveStep" finish-status="success" align-center class="settlement-steps">
          <el-step title="替代计算" :description="settlementView.replacementCalculationId ? '已确认' : '待执行'" />
          <el-step title="差额事实" :description="settlementView.adjustmentId ? '已确认' : '待生成'" />
          <el-step title="余额登记" :description="billingStepDescription" />
          <el-step title="资金处理" :description="fundsStepDescription" />
        </el-steps>

        <el-descriptions :column="detailColumnCount" border class="settlement-evidence">
          <el-descriptions-item label="原计算ID">{{ settlementView.originalCalculationId || '-' }}</el-descriptions-item>
          <el-descriptions-item label="替代计算ID">{{ settlementView.replacementCalculationId || '-' }}</el-descriptions-item>
          <el-descriptions-item label="Product 差额ID">{{ settlementView.adjustmentId || '-' }}</el-descriptions-item>
          <el-descriptions-item label="差额结果哈希">
            <span class="hash-text">{{ settlementView.adjustmentResultHash || '-' }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="Billing 登记ID">{{ settlementView.billingPostingId || '-' }}</el-descriptions-item>
          <el-descriptions-item label="Billing 状态">{{ billingStatusLabel }}</el-descriptions-item>
          <el-descriptions-item label="退款指令ID">{{ settlementView.refundInstructionId || '-' }}</el-descriptions-item>
          <el-descriptions-item label="Payment 退款单">{{ settlementView.refundOrderId || '-' }}</el-descriptions-item>
          <el-descriptions-item label="退款状态">{{ refundStatusLabel }}</el-descriptions-item>
          <el-descriptions-item label="佣金调整事实">{{ settlementView.commissionAdjustmentCount ?? 0 }} 条</el-descriptions-item>
          <el-descriptions-item label="余额方向">
            <el-tag v-if="settlementView.direction" :type="directionTagType" effect="plain">
              {{ directionLabel }}
            </el-tag>
            <span v-else>-</span>
          </el-descriptions-item>
          <el-descriptions-item label="余额金额">{{ amountText(settlementView.amount, settlementView.currency) }}</el-descriptions-item>
        </el-descriptions>

        <el-descriptions
          v-if="isSurrender"
          title="退保价值证据"
          :column="detailColumnCount"
          border
          class="settlement-evidence"
        >
          <el-descriptions-item label="退保策略">
            {{ surrenderEvidence.surrenderPolicyCode || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="策略版本">
            {{ surrenderEvidence.surrenderPolicyVersion || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="保单年度">
            {{ surrenderEvidence.surrenderPolicyYear || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="犹豫期天数">
            {{ surrenderEvidence.coolingOffDays ?? '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="犹豫期结论">
            {{ coolingOffConclusion }}
          </el-descriptions-item>
          <el-descriptions-item label="退款类型">
            {{ surrenderRefundTypeLabel }}
          </el-descriptions-item>
          <el-descriptions-item label="现金价值率">
            {{ rateText(surrenderEvidence.cashValueRate) }}
          </el-descriptions-item>
          <el-descriptions-item label="客户保留金额">
            {{ amountText(surrenderEvidence.retainedCustomerAmount, settlementView.currency) }}
          </el-descriptions-item>
          <el-descriptions-item label="内部成本保留率">
            {{ rateText(surrenderEvidence.internalCostRetentionRate) }}
          </el-descriptions-item>
          <el-descriptions-item label="退保策略哈希" :span="detailColumnCount">
            <span class="hash-text">{{ surrenderEvidence.surrenderPolicyContentHash || '-' }}</span>
          </el-descriptions-item>
        </el-descriptions>

        <template v-if="canSubmitSettlement && isSurrender">
          <el-divider />
          <div class="subsection-heading">
            <div>
              <div class="subsection-title">退保价值输入</div>
              <span>金额由 Product 的版本化策略计算，不接受人工录入。</span>
            </div>
            <el-button :icon="Refresh" text @click="resetSurrenderForm">重置</el-button>
          </div>
          <el-form
            ref="surrenderFormRef"
            :model="surrenderForm"
            :rules="surrenderRules"
            label-position="top"
            class="settlement-form"
          >
            <div class="form-grid surrender-form-grid">
              <el-form-item label="原计算ID" prop="originalCalculationId">
                <el-input v-model="surrenderForm.originalCalculationId" placeholder="出单确认计算ID" />
              </el-form-item>
              <el-form-item label="退保日期" prop="surrenderDate">
                <el-date-picker
                  v-model="surrenderForm.surrenderDate"
                  type="date"
                  value-format="YYYY-MM-DD"
                  style="width: 100%"
                />
              </el-form-item>
              <el-form-item label="保单年度" prop="policyYear">
                <el-input-number v-model="surrenderForm.policyYear" :min="1" controls-position="right" />
              </el-form-item>
              <el-form-item label="业务时间" prop="businessTime">
                <el-date-picker
                  v-model="surrenderForm.businessTime"
                  type="datetime"
                  value-format="YYYY-MM-DDTHH:mm:ss"
                  style="width: 100%"
                />
              </el-form-item>
              <el-form-item label="退保原因" prop="reason" class="reason-field">
                <el-input v-model="surrenderForm.reason" type="textarea" :rows="2" maxlength="300" show-word-limit />
              </el-form-item>
            </div>
            <div class="settlement-actions">
              <el-button type="primary" :icon="Coin" :loading="settlementLoading" @click="handleSurrenderSettlement">
                {{ settlementActionLabel }}
              </el-button>
            </div>
          </el-form>
        </template>

        <template v-else-if="canSubmitSettlement && isReversal">
          <el-divider />
          <div class="subsection-heading">
            <div>
              <div class="subsection-title">费用冲正输入</div>
              <span>冲正会生成 Product 反向差额并登记 Billing；已退款金额转为追加应收，不伪造原支付退款。</span>
            </div>
          </div>
          <el-form
            ref="reversalFormRef"
            :model="reversalForm"
            :rules="reversalRules"
            label-position="top"
            class="settlement-form"
          >
            <div class="form-grid surrender-form-grid">
              <el-form-item label="被冲正差额ID" prop="sourceAdjustmentId">
                <el-input v-model="reversalForm.sourceAdjustmentId" placeholder="原 Product 差额ID" />
              </el-form-item>
              <el-form-item label="业务时间" prop="businessTime">
                <el-date-picker
                  v-model="reversalForm.businessTime"
                  type="datetime"
                  value-format="YYYY-MM-DDTHH:mm:ss"
                  style="width: 100%"
                />
              </el-form-item>
              <el-form-item label="冲正原因" prop="reason" class="reason-field">
                <el-input v-model="reversalForm.reason" type="textarea" :rows="2" maxlength="300" show-word-limit />
              </el-form-item>
            </div>
            <div class="settlement-actions">
              <el-button type="warning" :icon="Refresh" :loading="settlementLoading" @click="handleReversalSettlement">
                生成冲正并登记
              </el-button>
            </div>
          </el-form>
        </template>
        <template v-else-if="canSubmitSettlement">
          <el-divider />
          <div class="subsection-heading">
            <div class="subsection-title">重算输入</div>
            <el-button :icon="Refresh" text @click="resetSettlementForm">重置</el-button>
          </div>
          <el-form
            ref="settlementFormRef"
            :model="settlementForm"
            :rules="settlementRules"
            label-position="top"
            class="settlement-form"
          >
            <div class="form-grid">
              <el-form-item label="原计算ID" prop="originalCalculationId">
                <el-input v-model="settlementForm.originalCalculationId" placeholder="出单确认计算ID" />
              </el-form-item>
              <el-form-item label="产品ID" prop="productId">
                <el-input v-model="settlementForm.productId" />
              </el-form-item>
              <el-form-item label="产品版本" prop="productVersion">
                <el-input v-model="settlementForm.productVersion" placeholder="例如 V1.0" />
              </el-form-item>
              <el-form-item label="业务时间" prop="businessTime">
                <el-date-picker
                  v-model="settlementForm.businessTime"
                  type="datetime"
                  value-format="YYYY-MM-DDTHH:mm:ss"
                  style="width: 100%"
                />
              </el-form-item>
              <el-form-item label="币种" prop="currency">
                <el-select v-model="settlementForm.currency" filterable allow-create style="width: 100%">
                  <el-option label="CNY" value="CNY" />
                  <el-option label="USD" value="USD" />
                  <el-option label="HKD" value="HKD" />
                </el-select>
              </el-form-item>
              <el-form-item label="变更后保额" prop="sumInsured">
                <el-input-number v-model="settlementForm.sumInsured" :min="0.01" :precision="2" controls-position="right" />
              </el-form-item>
              <el-form-item label="年龄" prop="age">
                <el-input-number v-model="settlementForm.age" :min="0" :max="120" controls-position="right" />
              </el-form-item>
              <el-form-item label="性别" prop="gender">
                <el-select v-model="settlementForm.gender" style="width: 100%">
                  <el-option label="男" value="M" />
                  <el-option label="女" value="F" />
                  <el-option label="未知" value="UNKNOWN" />
                </el-select>
              </el-form-item>
              <el-form-item label="缴费年限" prop="paymentTermYears">
                <el-input-number v-model="settlementForm.paymentTermYears" :min="1" controls-position="right" />
              </el-form-item>
              <el-form-item label="保障年限" prop="coverageTermYears">
                <el-input-number v-model="settlementForm.coverageTermYears" :min="1" controls-position="right" />
              </el-form-item>
              <el-form-item label="缴费期数" prop="paymentPeriods">
                <el-input-number v-model="settlementForm.paymentPeriods" :min="1" controls-position="right" />
              </el-form-item>
              <el-form-item label="保单年度" prop="policyYear">
                <el-input-number v-model="settlementForm.policyYear" :min="1" controls-position="right" />
              </el-form-item>
              <el-form-item label="渠道ID">
                <el-input v-model="settlementForm.channelId" clearable placeholder="可选" />
              </el-form-item>
              <el-form-item label="重算原因" prop="reason" class="reason-field">
                <el-input v-model="settlementForm.reason" type="textarea" :rows="2" maxlength="300" show-word-limit />
              </el-form-item>
            </div>

            <div class="adjustment-heading">
              <div>
                <div class="subsection-title">核保调整</div>
                <span>仅填写本次保全重算需要继续生效的加费或折扣。</span>
              </div>
              <el-button :icon="Plus" @click="addUnderwritingAdjustment">添加调整</el-button>
            </div>
            <el-table :data="settlementForm.underwritingAdjustments" border size="small">
              <el-table-column label="调整编码" min-width="150">
                <template #default="{ row }"><el-input v-model="row.adjustmentCode" /></template>
              </el-table-column>
              <el-table-column label="类型" min-width="135">
                <template #default="{ row }">
                  <el-select v-model="row.type" style="width: 100%">
                    <el-option label="比例加费" value="SURCHARGE_RATE" />
                    <el-option label="比例折扣" value="DISCOUNT_RATE" />
                    <el-option label="定额加费" value="SURCHARGE_AMOUNT" />
                    <el-option label="定额折扣" value="DISCOUNT_AMOUNT" />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column label="数值" width="145">
                <template #default="{ row }"><el-input-number v-model="row.value" :min="0" :precision="4" /></template>
              </el-table-column>
              <el-table-column label="原因" min-width="180">
                <template #default="{ row }"><el-input v-model="row.reason" /></template>
              </el-table-column>
              <el-table-column label="规则版本" min-width="130">
                <template #default="{ row }"><el-input v-model="row.ruleVersion" /></template>
              </el-table-column>
              <el-table-column label="操作" width="72" fixed="right">
                <template #default="{ $index }">
                  <el-tooltip content="删除调整" placement="top">
                    <el-button
                      :icon="Delete"
                      type="danger"
                      text
                      aria-label="删除核保调整"
                      @click="removeUnderwritingAdjustment($index)"
                    />
                  </el-tooltip>
                </template>
              </el-table-column>
              <template #empty><el-empty description="无核保调整" :image-size="54" /></template>
            </el-table>

            <div class="settlement-actions">
              <el-button type="primary" :icon="Coin" :loading="settlementLoading" @click="handleSettlement">
                {{ settlementActionLabel }}
              </el-button>
            </div>
          </el-form>
        </template>
      </section>

      <template v-if="detail?.status === 'PENDING'">
        <el-divider />
        <div class="action-section">
          <div class="section-title">审核操作</div>
          <el-form :model="auditForm" label-width="80px" class="audit-form">
            <el-form-item label="审核意见">
              <el-input
                v-model="auditForm.changeReason"
                type="textarea"
                :rows="3"
                placeholder="审核通过时可不填；驳回时必填"
              />
            </el-form-item>
          </el-form>
          <div class="action-buttons">
            <el-button v-permission="'maintenance:approve'" type="primary" :loading="actionLoading" @click="handleApprove">
              审核通过
            </el-button>
            <el-button v-permission="'maintenance:approve'" type="danger" :loading="actionLoading" @click="handleReject">
              审核驳回
            </el-button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { ArrowLeft, Coin, Delete, Plus, Refresh } from '@element-plus/icons-vue'
import { useMediaQuery } from '@vueuse/core'
import {
  approveMaintenance,
  createPremiumSettlement,
  createReversalSettlement,
  createSurrenderSettlement,
  getMaintenanceDetail,
  rejectMaintenance,
} from '@/api/maintenance'
import type {
  MaintenanceVO,
  PremiumSettlementRequest,
  PremiumSettlementVO,
  SurrenderSettlementRequest,
  SurrenderSettlementVO,
  ReversalSettlementRequest,
  UnderwritingAdjustmentInput,
} from '@/api/maintenance'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import { useUserStore } from '@/stores/user'

type SettlementForm = Omit<PremiumSettlementRequest, 'requestSnapshot'>

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const loading = ref(false)
const actionLoading = ref(false)
const settlementLoading = ref(false)
const detail = ref<MaintenanceVO | null>(null)
const settlementResult = ref<PremiumSettlementVO | null>(null)
const surrenderResult = ref<SurrenderSettlementVO | null>(null)
const settlementFormRef = ref<FormInstance>()
const surrenderFormRef = ref<FormInstance>()
const reversalFormRef = ref<FormInstance>()
const isNarrowScreen = useMediaQuery('(max-width: 767px)')
const detailColumnCount = computed(() => isNarrowScreen.value ? 1 : 3)
const auditForm = reactive({ changeReason: '' })
const isSurrender = computed(() => detail.value?.maintenanceType === 'POLICY_TERMINATION')
const isReversal = computed(() => detail.value?.maintenanceType === 'POLICY_REVERSAL')

const initialSettlementForm = (): SettlementForm => ({
  originalCalculationId: detail.value?.originalCalculationId || '',
  productId: '',
  productVersion: 'V1.0',
  businessTime: currentLocalDateTime(),
  currency: 'CNY',
  sumInsured: 100000,
  age: 35,
  gender: 'M',
  paymentTermYears: 1,
  coverageTermYears: 1,
  paymentPeriods: 1,
  underwritingAdjustments: [],
  channelId: '',
  policyYear: 1,
  reason: '',
})
const settlementForm = reactive<SettlementForm>(initialSettlementForm())

const initialSurrenderForm = (): SurrenderSettlementRequest => ({
  originalCalculationId: detail.value?.originalCalculationId || '',
  surrenderDate: currentLocalDate(),
  policyYear: detail.value?.surrenderPolicyYear || 1,
  businessTime: currentLocalDateTime(),
  reason: '',
  updatedBy: userStore.userInfo?.username || userStore.userInfo?.id || 'admin',
})
const surrenderForm = reactive<SurrenderSettlementRequest>(initialSurrenderForm())
const reversalForm = reactive<ReversalSettlementRequest>({
  sourceAdjustmentId: detail.value?.premiumAdjustmentId || '',
  businessTime: currentLocalDateTime(),
  reason: '',
})

const settlementRules: FormRules<SettlementForm> = {
  originalCalculationId: [{ required: true, message: '请输入原计算ID', trigger: 'blur' }],
  productId: [{ required: true, message: '请输入产品ID', trigger: 'blur' }],
  productVersion: [{ required: true, message: '请输入产品版本', trigger: 'blur' }],
  businessTime: [{ required: true, message: '请选择业务时间', trigger: 'change' }],
  currency: [
    { required: true, message: '请输入币种', trigger: 'change' },
    { pattern: /^[A-Za-z]{3}$/, message: '币种必须为3位字母', trigger: 'change' },
  ],
  sumInsured: [{ required: true, message: '请输入变更后保额', trigger: 'change' }],
  age: [{ required: true, message: '请输入年龄', trigger: 'change' }],
  gender: [{ required: true, message: '请选择性别', trigger: 'change' }],
  paymentTermYears: [{ required: true, message: '请输入缴费年限', trigger: 'change' }],
  coverageTermYears: [{ required: true, message: '请输入保障年限', trigger: 'change' }],
  paymentPeriods: [{ required: true, message: '请输入缴费期数', trigger: 'change' }],
  policyYear: [{ required: true, message: '请输入保单年度', trigger: 'change' }],
  reason: [{ required: true, message: '请输入重算原因', trigger: 'blur' }],
}

const surrenderRules: FormRules<SurrenderSettlementRequest> = {
  originalCalculationId: [{ required: true, message: '请输入原计算ID', trigger: 'blur' }],
  surrenderDate: [{ required: true, message: '请选择退保日期', trigger: 'change' }],
  policyYear: [{ required: true, message: '请输入保单年度', trigger: 'change' }],
  businessTime: [{ required: true, message: '请选择业务时间', trigger: 'change' }],
  reason: [{ required: true, message: '请输入退保原因', trigger: 'blur' }],
  updatedBy: [{ required: true, message: '缺少当前操作人', trigger: 'change' }],
}

const reversalRules: FormRules<ReversalSettlementRequest> = {
  sourceAdjustmentId: [{ required: true, message: '请输入被冲正差额ID', trigger: 'blur' }],
  businessTime: [{ required: true, message: '请选择业务时间', trigger: 'change' }],
  reason: [{ required: true, message: '请输入冲正原因', trigger: 'blur' }],
}

const settlementView = computed<PremiumSettlementVO>(() => ({
  maintenanceId: detail.value?.id || String(route.params.id),
  premiumSettlementStatus: settlementResult.value?.premiumSettlementStatus
    || detail.value?.premiumSettlementStatus
    || 'NOT_STARTED',
  originalCalculationId: settlementResult.value?.originalCalculationId
    || detail.value?.originalCalculationId
    || '',
  replacementCalculationId: settlementResult.value?.replacementCalculationId
    || detail.value?.replacementCalculationId,
  adjustmentId: settlementResult.value?.adjustmentId || detail.value?.premiumAdjustmentId,
  adjustmentResultHash: settlementResult.value?.adjustmentResultHash
    || detail.value?.premiumAdjustmentResultHash,
  billingPostingId: settlementResult.value?.billingPostingId || detail.value?.billingPostingId,
  billingPostingStatus: settlementResult.value?.billingPostingStatus
    || (detail.value?.billingPostingId ? 'POSTED' : undefined),
  refundInstructionId: settlementResult.value?.refundInstructionId || detail.value?.refundInstructionId,
  refundOrderId: settlementResult.value?.refundOrderId || detail.value?.refundOrderId,
  refundStatus: settlementResult.value?.refundStatus || detail.value?.refundStatus,
  commissionAdjustmentCount: settlementResult.value?.commissionAdjustmentCount
    ?? detail.value?.commissionAdjustmentCount,
  direction: settlementResult.value?.direction || detail.value?.balanceDirection,
  amount: settlementResult.value?.amount ?? detail.value?.balanceAmount,
  currency: settlementResult.value?.currency || detail.value?.balanceCurrency,
}))

const surrenderEvidence = computed(() => ({
  surrenderPolicyCode: surrenderResult.value?.policyCode || detail.value?.surrenderPolicyCode,
  surrenderPolicyVersion: surrenderResult.value?.policyVersion || detail.value?.surrenderPolicyVersion,
  surrenderPolicyContentHash: surrenderResult.value?.policyContentHash || detail.value?.surrenderPolicyContentHash,
  surrenderPolicyYear: surrenderResult.value?.policyYear || detail.value?.surrenderPolicyYear,
  coolingOffDays: surrenderResult.value?.coolingOffDays ?? detail.value?.coolingOffDays,
  surrenderRefundType: surrenderResult.value?.refundType || detail.value?.surrenderRefundType,
  withinCoolingOff: surrenderResult.value?.withinCoolingOff ?? detail.value?.withinCoolingOff,
  cashValueRate: surrenderResult.value?.cashValueRate ?? detail.value?.cashValueRate,
  retainedCustomerAmount: surrenderResult.value?.retainedCustomerAmount ?? detail.value?.retainedCustomerAmount,
  internalCostRetentionRate: surrenderResult.value?.internalCostRetentionRate
    ?? detail.value?.internalCostRetentionRate,
}))

const canSubmitSettlement = computed(() => [
  'NOT_STARTED',
  'ADJUSTMENT_CONFIRMED',
  'POSTED',
  'SETTLEMENT_PENDING',
  'SETTLEMENT_FAILED',
]
  .includes(settlementView.value.premiumSettlementStatus))
const settlementActiveStep = computed(() => {
  if (['SETTLED', 'NOT_REQUIRED'].includes(settlementView.value.premiumSettlementStatus)) return 4
  if (settlementView.value.billingPostingId) return 3
  if (settlementView.value.adjustmentId) return 2
  if (settlementView.value.replacementCalculationId) return 1
  return 0
})
const billingStepDescription = computed(() => {
  if (settlementView.value.premiumSettlementStatus === 'NOT_REQUIRED') return '无需登记'
  return settlementView.value.billingPostingId ? '事实已登记' : '待登记'
})
const fundsStepDescription = computed(() => {
  if (settlementView.value.premiumSettlementStatus === 'NOT_REQUIRED') return '无需处理'
  if (settlementView.value.premiumSettlementStatus === 'SETTLED') return '退款已完成'
  if (settlementView.value.premiumSettlementStatus === 'SETTLEMENT_FAILED') return '执行失败'
  if (settlementView.value.refundInstructionId) return '退款处理中'
  return settlementView.value.direction === 'DEBIT' ? '待收款' : '待处理'
})
const billingStatusLabel = computed(() => {
  if (settlementView.value.premiumSettlementStatus === 'NOT_REQUIRED') return '无需登记'
  if (settlementView.value.billingPostingStatus !== 'POSTED') return '待登记'
  return settlementView.value.premiumSettlementStatus === 'SETTLED'
    ? '余额事实已登记/资金已结算'
    : '余额事实已登记/待结算'
})
const refundStatusLabel = computed(() => ({
  PENDING: '待提交',
  SUBMITTED: '已提交',
  PROCESSING: '处理中',
  SUCCEEDED: '退款成功',
  FAILED: '退款失败',
  ALLOCATION_REQUIRED: '待登记原收款分配',
})[settlementView.value.refundStatus || ''] || settlementView.value.refundStatus || '-')
const settlementActionLabel = computed(() => {
  if (settlementView.value.premiumSettlementStatus === 'ADJUSTMENT_CONFIRMED') return '继续登记余额'
  if (['POSTED', 'SETTLEMENT_PENDING', 'SETTLEMENT_FAILED']
    .includes(settlementView.value.premiumSettlementStatus)) return '继续资金结算'
  return '计算并登记余额'
})
const directionLabel = computed(() => ({ DEBIT: '追加应收', CREDIT: '贷方余额', NONE: '无余额影响' })[
  settlementView.value.direction || ''
] || settlementView.value.direction || '-')
const directionTagType = computed<'warning' | 'success' | 'info'>(() => {
  if (settlementView.value.direction === 'DEBIT') return 'warning'
  if (settlementView.value.direction === 'CREDIT') return 'success'
  return 'info'
})
const coolingOffConclusion = computed(() => {
  if (surrenderEvidence.value.withinCoolingOff === undefined) return '-'
  return surrenderEvidence.value.withinCoolingOff ? '犹豫期内' : '犹豫期外'
})
const surrenderRefundTypeLabel = computed(() => ({
  FULL_REFUND: '全额退还',
  CASH_VALUE: '按现金价值退还',
})[surrenderEvidence.value.surrenderRefundType || ''] || surrenderEvidence.value.surrenderRefundType || '-')

const settlementLabels: Record<string, string> = {
  NOT_STARTED: '未开始',
  ADJUSTMENT_CONFIRMED: '差额已确认，待入账',
  POSTED: '余额事实已登记/待结算',
  SETTLEMENT_PENDING: '资金结算处理中',
  SETTLEMENT_FAILED: '资金结算失败',
  SETTLED: '资金结算完成',
  NOT_REQUIRED: '无客户余额影响',
}
const settlementStatusLabel = (status: string) => settlementLabels[status] || status
const settlementStatusColor = (status: string) => ({
  NOT_STARTED: 'info',
  ADJUSTMENT_CONFIRMED: 'warning',
  POSTED: 'success',
  SETTLEMENT_PENDING: 'warning',
  SETTLEMENT_FAILED: 'danger',
  SETTLED: 'success',
  NOT_REQUIRED: 'info',
})[status] || 'info'
const amountText = (value?: number, currency?: string) => value === undefined || value === null
  ? '-'
  : `${currency || ''} ${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim()
const rateText = (value?: number) => value === undefined || value === null
  ? '-'
  : `${(value * 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%`
const formatTime = (value?: string) => value ? value.replace('T', ' ').slice(0, 19) : '-'

onMounted(loadDetail)

async function loadDetail() {
  loading.value = true
  try {
    detail.value = await getMaintenanceDetail(route.params.id as string)
    if (!settlementForm.originalCalculationId) {
      settlementForm.originalCalculationId = detail.value.originalCalculationId || ''
    }
    if (!surrenderForm.originalCalculationId) {
      surrenderForm.originalCalculationId = detail.value.originalCalculationId || ''
    }
    if (detail.value.surrenderPolicyYear) {
      surrenderForm.policyYear = detail.value.surrenderPolicyYear
    }
    if (!reversalForm.sourceAdjustmentId) {
      reversalForm.sourceAdjustmentId = detail.value.premiumAdjustmentId || ''
    }
  } finally {
    loading.value = false
  }
}

function currentLocalDateTime() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 19)
}

function currentLocalDate() {
  return currentLocalDateTime().slice(0, 10)
}

function resetSettlementForm() {
  Object.assign(settlementForm, initialSettlementForm())
  settlementFormRef.value?.clearValidate()
}

function resetSurrenderForm() {
  Object.assign(surrenderForm, initialSurrenderForm())
  surrenderFormRef.value?.clearValidate()
}

function addUnderwritingAdjustment() {
  settlementForm.underwritingAdjustments.push({
    adjustmentCode: '',
    type: 'SURCHARGE_RATE',
    value: 0,
    reason: '',
    ruleVersion: '',
  })
}

function removeUnderwritingAdjustment(index: number) {
  settlementForm.underwritingAdjustments.splice(index, 1)
}

function validateUnderwritingAdjustments(adjustments: UnderwritingAdjustmentInput[]) {
  return adjustments.every((item) => item.adjustmentCode.trim() && item.type && item.value >= 0)
}

async function handleSettlement() {
  const valid = await settlementFormRef.value?.validate().catch(() => false)
  if (!valid) return
  if (!validateUnderwritingAdjustments(settlementForm.underwritingAdjustments)) {
    ElMessage.warning('请完整填写核保调整编码、类型和数值')
    return
  }
  await ElMessageBox.confirm(
    '系统将生成或复用 Product 差额事实并登记 Billing 余额；CREDIT 且存在原收款分配时会创建退款指令。确认继续？',
    '费用计算确认',
    { type: 'warning', confirmButtonText: '确认计算' },
  )
  settlementLoading.value = true
  try {
    const request: PremiumSettlementRequest = {
      ...settlementForm,
      currency: settlementForm.currency.toUpperCase(),
      channelId: settlementForm.channelId?.trim() || undefined,
      requestSnapshot: {
        source: 'TITANIUM_ADMIN',
        maintenanceId: detail.value?.id,
        policyId: detail.value?.policyId,
        customerId: detail.value?.customerId,
      },
      underwritingAdjustments: settlementForm.underwritingAdjustments.map((item) => ({ ...item })),
    }
    settlementResult.value = await createPremiumSettlement(route.params.id as string, request)
    const resultMessages: Record<string, string> = {
      NOT_REQUIRED: '费用差额已确认，本次无需登记客户余额',
      SETTLED: '退款已完成，资金证据已保存',
      SETTLEMENT_PENDING: '退款指令已创建，资金处理中',
      SETTLEMENT_FAILED: '余额已登记，但资金处理失败，可安全重试',
      POSTED: '余额事实已登记，后续收付仍待结算',
    }
    ElMessage.success(resultMessages[settlementResult.value.premiumSettlementStatus] || '费用处理检查点已更新')
    await loadDetail()
  } finally {
    settlementLoading.value = false
  }
}

async function handleSurrenderSettlement() {
  const valid = await surrenderFormRef.value?.validate().catch(() => false)
  if (!valid) return
  await ElMessageBox.confirm(
    '系统将按 Product 生效的退保价值策略确定现金价值，并登记 Billing 贷项和 Payment 退款。确认继续？',
    '退保价值确认',
    { type: 'warning', confirmButtonText: '确认计算并退款' },
  )
  settlementLoading.value = true
  try {
    surrenderResult.value = await createSurrenderSettlement(
      route.params.id as string,
      { ...surrenderForm },
    )
    settlementResult.value = surrenderResult.value.settlement
    const status = surrenderResult.value.settlement.premiumSettlementStatus
    const resultMessages: Record<string, string> = {
      SETTLED: '退保现金价值已确认，退款已完成',
      SETTLEMENT_PENDING: '退保现金价值已确认，退款正在处理',
      SETTLEMENT_FAILED: '退保价值与贷项已登记，退款失败，可安全重试',
      POSTED: '退保价值与 Billing 贷项已登记，等待资金结算',
    }
    ElMessage.success(resultMessages[status] || '退保价值处理检查点已更新')
    await loadDetail()
  } finally {
    settlementLoading.value = false
  }
}

async function handleReversalSettlement() {
  const valid = await reversalFormRef.value?.validate().catch(() => false)
  if (!valid) return
  await ElMessageBox.confirm(
    '系统将生成原差额的反向费用事实并登记 Billing。若原差额已退款，反向事实将表现为追加应收。确认继续？',
    '费用冲正确认',
    { type: 'warning', confirmButtonText: '确认冲正' },
  )
  settlementLoading.value = true
  try {
    settlementResult.value = await createReversalSettlement(route.params.id as string, { ...reversalForm })
    ElMessage.success('费用冲正已登记，可通过差额和 Billing 证据追溯')
    await loadDetail()
  } finally {
    settlementLoading.value = false
  }
}

async function handleApprove() {
  await ElMessageBox.confirm('确认审核通过该保全工单？', '审核确认', { type: 'warning' })
  actionLoading.value = true
  try {
    await approveMaintenance(route.params.id as string, auditForm.changeReason || undefined)
    ElMessage.success('审核通过成功')
    await loadDetail()
  } finally {
    actionLoading.value = false
  }
}

async function handleReject() {
  if (!auditForm.changeReason.trim()) {
    ElMessage.warning('请填写驳回原因')
    return
  }
  await ElMessageBox.confirm('确认驳回该保全工单？', '驳回确认', { type: 'warning' })
  actionLoading.value = true
  try {
    await rejectMaintenance(route.params.id as string, auditForm.changeReason)
    ElMessage.success('已驳回')
    await loadDetail()
  } finally {
    actionLoading.value = false
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
    flex: 1;
    margin: 0;
    min-width: 0;
    font-size: 18px;
    overflow-wrap: anywhere;
  }
}

.pricing-section {
  margin-top: 28px;
  padding-top: 24px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.section-heading,
.subsection-heading,
.adjustment-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;

  span {
    color: var(--ti-text-secondary, #86909c);
    font-size: 12px;
  }
}

.section-title,
.subsection-title {
  color: #303133;
  font-weight: 600;
}

.section-title {
  margin-bottom: 4px;
  font-size: 15px;
}

.subsection-title {
  font-size: 14px;
}

.settlement-steps {
  margin: 24px 0;
}

.settlement-evidence {
  margin-top: 18px;
}

.hash-text {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0 16px;
}

.reason-field {
  grid-column: span 3;
}

.settlement-form :deep(.el-input-number) {
  width: 100%;
}

.adjustment-heading {
  margin-top: 6px;
}

.settlement-actions,
.action-buttons {
  display: flex;
  gap: 12px;
  margin-top: 18px;
}

.action-section {
  padding-bottom: 8px;
}

.audit-form {
  max-width: 520px;
}

@media (max-width: 1100px) {
  .form-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .reason-field {
    grid-column: span 2;
  }
}

@media (max-width: 767px) {
  .detail-header,
  .section-heading,
  .subsection-heading,
  .adjustment-heading {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .form-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .reason-field {
    grid-column: span 1;
  }
}
</style>
