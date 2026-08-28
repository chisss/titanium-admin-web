<template>
  <!-- 保单详情页 - 含5个 Tab + 寿险生命周期操作按钮 -->
  <div class="ti-page">
    <div class="ti-card" v-loading="loading">
      <div class="detail-header">
        <el-button :icon="ArrowLeft" text @click="$router.back()">返回</el-button>
        <h3 class="detail-title">保单详情 - {{ policy?.policyNo }}</h3>
        <TiStatusTag v-if="policy" :value="policy.status" />
        <div class="detail-actions" v-if="policy">
          <!-- 状态相关操作按钮 -->
          <el-dropdown trigger="click" @command="handleAction">
            <el-button type="primary">
              操作 <el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="suspend" v-if="policy.status === 'ACTIVE' || policy.status === 'EFFECTIVE'">
                  <el-icon><VideoPause /></el-icon> 中止保单
                </el-dropdown-item>
                <el-dropdown-item command="resume" v-if="policy.status === 'SUSPENDED'">
                  <el-icon><VideoPlay /></el-icon> 恢复保单
                </el-dropdown-item>
                <el-dropdown-item command="terminate" divided>
                  <el-icon><CircleClose /></el-icon> 退保/终止
                </el-dropdown-item>
                <el-dropdown-item command="cancel" v-if="canCancel">
                  <el-icon><Delete /></el-icon> 撤销保单
                </el-dropdown-item>
                <el-dropdown-item command="waive" divided>
                  <el-icon><Discount /></el-icon> 保费豁免
                </el-dropdown-item>
                <el-dropdown-item command="dividend">
                  <el-icon><Money /></el-icon> 红利派发
                </el-dropdown-item>
                <el-dropdown-item command="annuityStart">
                  <el-icon><Coin /></el-icon> 启动年金给付
                </el-dropdown-item>
                <el-dropdown-item command="annuityPay">
                  <el-icon><Wallet /></el-icon> 执行年金给付
                </el-dropdown-item>
                <el-dropdown-item command="mature" divided>
                  <el-icon><Flag /></el-icon> 满期给付
                </el-dropdown-item>
                <el-dropdown-item command="endorsement">
                  <el-icon><Edit /></el-icon> 申请批改
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <el-tabs v-if="policy" v-model="activeTab" class="policy-tabs">
        <!-- Tab1：基本信息 -->
        <el-tab-pane label="基本信息" name="basic">
          <el-descriptions :column="3" border>
            <el-descriptions-item label="保单号">
              <span>{{ policy.policyNo }}</span>
              <el-button text size="small" :icon="CopyDocument" @click="copyText(policy.policyNo)" />
            </el-descriptions-item>
            <el-descriptions-item label="保单形态">{{ policy.policyForm || '-' }}</el-descriptions-item>
            <el-descriptions-item label="产品名称">{{ policy.productName }}</el-descriptions-item>
            <el-descriptions-item label="投保人">{{ policy.policyHolderName }}</el-descriptions-item>
            <el-descriptions-item label="投保人ID">{{ policy.policyHolderId || '-' }}</el-descriptions-item>
            <el-descriptions-item label="被保人">{{ policy.insuredName }}</el-descriptions-item>
            <el-descriptions-item label="被保人ID">{{ policy.insuredId || '-' }}</el-descriptions-item>
            <el-descriptions-item label="年缴保费">¥{{ policy.premium?.toLocaleString() }}</el-descriptions-item>
            <el-descriptions-item label="基本保额">¥{{ policy.sumInsured?.toLocaleString() }}</el-descriptions-item>
            <el-descriptions-item label="生效日期">{{ policy.effectiveDate }}</el-descriptions-item>
            <el-descriptions-item label="到期日期">{{ policy.expiryDate }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ policy.createTime || '-' }}</el-descriptions-item>
          </el-descriptions>
        </el-tab-pane>

        <!-- Tab2：理赔记录 -->
        <el-tab-pane label="理赔记录" name="claims">
          <el-empty description="暂无理赔记录" :image-size="80" />
        </el-tab-pane>

        <!-- Tab3：缴费记录 -->
        <el-tab-pane label="缴费记录" name="payments">
          <el-empty description="暂无缴费记录" :image-size="80" />
        </el-tab-pane>

        <!-- Tab4：保全记录 -->
        <el-tab-pane label="保全记录" name="maintenance">
          <el-table v-loading="maintenanceLoading" :data="maintenanceRecords" border stripe>
            <el-table-column prop="caseId" label="案件 ID" min-width="190" />
            <el-table-column label="保全项" min-width="190"><template #default="{ row }">{{ row.itemCodes?.join('、') || '-' }}</template></el-table-column>
            <el-table-column prop="source" label="来源" width="110"><template #default="{ row }">{{ row.source === 'MANUAL' ? '后台人工' : 'API 自动' }}</template></el-table-column>
            <el-table-column prop="status" label="案件状态" width="120"><template #default="{ row }"><TiStatusTag :value="row.status" /></template></el-table-column>
            <el-table-column prop="effectStatus" label="生效状态" width="120"><template #default="{ row }"><TiStatusTag :value="row.effectStatus || 'NOT_STARTED'" /></template></el-table-column>
            <el-table-column prop="createdAt" label="创建时间" width="175" />
            <el-table-column label="查看" width="100"><template #default="{ row }"><el-button link type="primary" @click="$router.push(`/maintenance/workbench/${row.caseId}`)">工作台</el-button></template></el-table-column>
            <template #empty><el-empty description="暂无保全记录" :image-size="80" /></template>
          </el-table>
        </el-tab-pane>

        <!-- Tab5：操作日志 -->
        <el-tab-pane label="操作日志" name="logs">
          <el-empty description="暂无操作日志" :image-size="80" />
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- 中止保单对话框 -->
    <el-dialog v-model="dialogs.suspend" title="中止保单" width="400px">
      <el-form :model="forms.suspend" label-width="100px">
        <el-form-item label="中止原因" required>
          <el-input v-model="forms.suspend.reason" type="textarea" :rows="3" placeholder="请输入中止原因" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogs.suspend = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitSuspend">确认中止</el-button>
      </template>
    </el-dialog>

    <!-- 恢复保单对话框 -->
    <el-dialog v-model="dialogs.resume" title="恢复保单" width="400px">
      <el-form :model="forms.resume" label-width="100px">
        <el-form-item label="恢复原因" required>
          <el-input v-model="forms.resume.reason" type="textarea" :rows="3" placeholder="请输入恢复原因" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogs.resume = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitResume">确认恢复</el-button>
      </template>
    </el-dialog>

    <!-- 退保/终止对话框 -->
    <el-dialog v-model="dialogs.terminate" title="退保/终止保单" width="440px">
      <el-alert type="warning" :closable="false" style="margin-bottom: 16px">
        <p>退保后将扣除手续费，按现金价值退还保费，操作不可撤销。</p>
      </el-alert>
      <el-form :model="forms.terminate" label-width="110px">
        <el-form-item label="终止原因" required>
          <TiDictSelect v-model="forms.terminate.terminationReason" dict-type="POLICY_TERMINATION_REASON" :clearable="false" style="width: 100%" />
        </el-form-item>
        <el-form-item label="备注说明">
          <el-input v-model="forms.terminate.reason" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogs.terminate = false">取消</el-button>
        <el-button type="danger" :loading="submitting" @click="submitTerminate">确认终止</el-button>
      </template>
    </el-dialog>

    <!-- 申请批改对话框 -->
    <el-dialog v-model="dialogs.endorsement" title="申请批改" width="480px">
      <el-form :model="forms.endorsement" label-width="110px">
        <el-form-item label="批单号" required>
          <el-input v-model="forms.endorsement.endorsementNo" placeholder="请输入批单号" />
        </el-form-item>
        <el-form-item label="批改类型" required>
          <TiDictSelect v-model="forms.endorsement.updateType" dict-type="MAINTENANCE_TYPE" :clearable="false" style="width: 100%" />
        </el-form-item>
        <el-form-item label="变更说明" required>
          <el-input v-model="forms.endorsement.changeSummary" type="textarea" :rows="3" placeholder="请描述具体变更内容" />
        </el-form-item>
        <el-form-item label="生效日期">
          <el-date-picker v-model="forms.endorsement.endorsementEffectiveDate" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" placeholder="默认今日" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogs.endorsement = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitEndorsement">提交批改申请</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft, ArrowDown, VideoPause, VideoPlay, CircleClose,
  Delete, Discount, Money, Coin, Wallet, Flag, Edit, CopyDocument,
} from '@element-plus/icons-vue'
import {
  getPolicyDetail, suspendPolicy, resumePolicy, terminatePolicy,
  cancelPolicy, waivePremium, distributeDividend, startAnnuityPayout,
  payAnnuityBenefit, maturePolicy, applyEndorsement,
  type PolicyDataUpdateType, type TerminationReason,
} from '@/api/policy'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import type { PolicyVO } from '@/types/business.d'
import { getMaintenanceCaseList, type MaintenanceCaseSummary } from '@/api/maintenance'

const route = useRoute()
const loading = ref(false)
const submitting = ref(false)
const policy = ref<PolicyVO | null>(null)
const activeTab = ref('basic')
const maintenanceLoading = ref(false)
const maintenanceRecords = ref<MaintenanceCaseSummary[]>([])

/** 对话框开关 */
const dialogs = reactive({
  suspend: false,
  resume: false,
  terminate: false,
  endorsement: false,
})

/** 表单数据 */
const forms = reactive({
  suspend: { reason: '' },
  resume: { reason: '' },
  terminate: { reason: '', terminationReason: '' as TerminationReason | '' },
  endorsement: {
    endorsementNo: '', updateType: '' as PolicyDataUpdateType | '', endorsementEffectiveDate: '', changeSummary: '',
  },
})

/** 是否可撤销（投保后15天内或待生效状态） */
const canCancel = computed(() =>
  policy.value?.status === 'PENDING' || policy.value?.status === 'PENDING_EFFECTIVE',
)

/** 处理操作菜单命令 */
const handleAction = async (cmd: string) => {
  switch (cmd) {
    case 'suspend': dialogs.suspend = true; break
    case 'resume': dialogs.resume = true; break
    case 'terminate': dialogs.terminate = true; break
    case 'cancel':
      await ElMessageBox.confirm('确认撤销该保单？此操作不可撤销。', '警告', { type: 'warning' })
      await doAction(() => cancelPolicy(policy.value!.policyId, '管理员操作撤销'))
      break
    case 'waive':
      await ElMessageBox.confirm('确认对该保单执行保费豁免？', '确认', { type: 'info' })
      await doAction(() => waivePremium(policy.value!.policyId, { reason: 'INSURED_CRITICAL_ILLNESS' }))
      break
    case 'dividend':
      await ElMessageBox.prompt('请输入本年度红利金额（元）', '红利派发', { inputType: 'number' }).then(({ value }) =>
        doAction(() => distributeDividend(policy.value!.policyId, {
          policyYear: new Date().getFullYear(),
          dividendAmount: Number(value),
          option: 'ACCUMULATE',
        })),
      )
      break
    case 'annuityStart':
      await ElMessageBox.prompt('请输入每期年金给付金额（元）', '启动年金给付', { inputType: 'number' }).then(({ value }) =>
        doAction(() => startAnnuityPayout(policy.value!.policyId, {
          startDate: new Date().toISOString().replace(/\.\d{3}Z$/, ''),
          frequency: 'ANNUALLY', amountPerInstallment: Number(value), currency: 'CNY',
        })),
      )
      break
    case 'annuityPay':
      await ElMessageBox.confirm('确认执行本期年金给付？', '确认', { type: 'info' })
      await doAction(() => payAnnuityBenefit(policy.value!.policyId))
      break
    case 'mature':
      await ElMessageBox.prompt('请输入满期给付金额（元）', '满期给付', { inputType: 'number' }).then(({ value }) =>
        doAction(() => maturePolicy(policy.value!.policyId, { maturityBenefit: Number(value) })),
      )
      break
    case 'endorsement': dialogs.endorsement = true; break
  }
}

/** 通用操作执行（带loading + reload） */
const doAction = async (fn: () => Promise<void>) => {
  submitting.value = true
  try {
    await fn()
    ElMessage.success('操作成功')
    await loadPolicy()
  } finally {
    submitting.value = false
  }
}

/** 提交中止 */
const submitSuspend = async () => {
  if (!forms.suspend.reason.trim()) { ElMessage.warning('请填写中止原因'); return }
  await doAction(() => suspendPolicy(policy.value!.policyId, forms.suspend.reason))
  dialogs.suspend = false
  forms.suspend.reason = ''
}

/** 提交恢复 */
const submitResume = async () => {
  if (!forms.resume.reason.trim()) { ElMessage.warning('请填写恢复原因'); return }
  await doAction(() => resumePolicy(policy.value!.policyId, forms.resume.reason))
  dialogs.resume = false
}

/** 提交终止 */
const submitTerminate = async () => {
  if (!forms.terminate.terminationReason) { ElMessage.warning('请选择终止原因'); return }
  await doAction(() => terminatePolicy(policy.value!.policyId, {
    reason: forms.terminate.reason,
    terminationReason: forms.terminate.terminationReason as TerminationReason,
  }))
  dialogs.terminate = false
}

/** 提交批改 */
const submitEndorsement = async () => {
  if (!forms.endorsement.endorsementNo.trim() || !forms.endorsement.updateType || !forms.endorsement.changeSummary) {
    ElMessage.warning('请填写完整批改信息'); return
  }
  submitting.value = true
  try {
    const result = await applyEndorsement(policy.value!.policyId, {
      endorsementNo: forms.endorsement.endorsementNo,
      updateType: forms.endorsement.updateType as PolicyDataUpdateType,
      endorsementEffectiveDate: forms.endorsement.endorsementEffectiveDate || undefined,
      changeSummary: forms.endorsement.changeSummary,
    })
    ElMessage.success(`批改申请已提交，批改单号：${result}`)
    dialogs.endorsement = false
  } finally {
    submitting.value = false
  }
}

/** 复制文本 */
const copyText = (text: string) => {
  navigator.clipboard.writeText(text).then(() => ElMessage.success('已复制'))
}

/** 加载保单详情 */
const loadPolicy = async () => {
  loading.value = true
  try {
    policy.value = await getPolicyDetail(route.params.id as string)
  } finally {
    loading.value = false
  }
}

const loadMaintenanceRecords = async () => {
  if (!policy.value || maintenanceLoading.value) return
  maintenanceLoading.value = true
  try {
    const result = await getMaintenanceCaseList({
      policyNumber: policy.value.policyNo,
      pageNum: 1,
      pageSize: 100,
    })
    maintenanceRecords.value = result.list || []
  } finally {
    maintenanceLoading.value = false
  }
}

watch(activeTab, (tab) => {
  if (tab === 'maintenance') loadMaintenanceRecords()
})

onMounted(loadPolicy)
</script>

<style scoped lang="scss">
.detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;

  .detail-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    flex: 1;
  }

  .detail-actions {
    margin-left: auto;
  }
}

.policy-tabs {
  :deep(.el-tabs__header) {
    margin-bottom: 16px;
  }
}
</style>
