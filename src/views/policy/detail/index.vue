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
                <el-dropdown-item command="suspend" v-if="policy.status === 'ACTIVE'">
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
            <el-descriptions-item label="投保单号">{{ policy.proposalNo || '-' }}</el-descriptions-item>
            <el-descriptions-item label="产品名称">{{ policy.productName }}</el-descriptions-item>
            <el-descriptions-item label="投保人">{{ policy.holderName }}</el-descriptions-item>
            <el-descriptions-item label="证件号">{{ policy.holderIdNo }}</el-descriptions-item>
            <el-descriptions-item label="手机号">{{ policy.holderMobile }}</el-descriptions-item>
            <el-descriptions-item label="被保人">{{ policy.insuredName }}</el-descriptions-item>
            <el-descriptions-item label="年缴保费">¥{{ policy.premium?.toLocaleString() }}</el-descriptions-item>
            <el-descriptions-item label="基本保额">¥{{ policy.sumInsured?.toLocaleString() }}</el-descriptions-item>
            <el-descriptions-item label="生效日期">{{ policy.effectiveDate }}</el-descriptions-item>
            <el-descriptions-item label="到期日期">{{ policy.expiryDate }}</el-descriptions-item>
            <el-descriptions-item label="销售渠道">{{ policy.channel }}</el-descriptions-item>
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
          <el-empty description="暂无保全记录" :image-size="80" />
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
          <el-select v-model="forms.terminate.terminationReason" style="width: 100%">
            <el-option label="客户主动退保" value="CUSTOMER_SURRENDER" />
            <el-option label="保费逾期失效" value="LAPSE" />
            <el-option label="满期终止" value="MATURITY" />
            <el-option label="保险责任终止" value="COVERAGE_END" />
          </el-select>
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
        <el-form-item label="批改类型" required>
          <el-select v-model="forms.endorsement.endorsementType" style="width: 100%">
            <el-option label="受益人变更" value="BENEFICIARY_CHANGE" />
            <el-option label="联系方式变更" value="CONTACT_CHANGE" />
            <el-option label="保额变更" value="COVERAGE_CHANGE" />
            <el-option label="证件信息变更" value="ID_CHANGE" />
            <el-option label="地址变更" value="ADDRESS_CHANGE" />
          </el-select>
        </el-form-item>
        <el-form-item label="变更说明" required>
          <el-input v-model="forms.endorsement.changeDescription" type="textarea" :rows="3" placeholder="请描述具体变更内容" />
        </el-form-item>
        <el-form-item label="生效日期">
          <el-date-picker v-model="forms.endorsement.effectiveDate" type="date" placeholder="默认今日" style="width: 100%" />
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
import { ref, computed, onMounted, reactive } from 'vue'
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
} from '@/api/policy'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import type { PolicyVO } from '@/types/business.d'

const route = useRoute()
const loading = ref(false)
const submitting = ref(false)
const policy = ref<PolicyVO | null>(null)
const activeTab = ref('basic')

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
  terminate: { reason: '', terminationReason: '' },
  endorsement: { endorsementType: '', changeDescription: '', effectiveDate: '' },
})

/** 是否可撤销（投保后15天内或待生效状态） */
const canCancel = computed(() =>
  policy.value?.status === 'PENDING',
)

/** 处理操作菜单命令 */
const handleAction = async (cmd: string) => {
  switch (cmd) {
    case 'suspend': dialogs.suspend = true; break
    case 'resume': dialogs.resume = true; break
    case 'terminate': dialogs.terminate = true; break
    case 'cancel':
      await ElMessageBox.confirm('确认撤销该保单？此操作不可撤销。', '警告', { type: 'warning' })
      await doAction(() => cancelPolicy(policy.value!.id, '管理员操作撤销'))
      break
    case 'waive':
      await ElMessageBox.confirm('确认对该保单执行保费豁免？', '确认', { type: 'info' })
      await doAction(() => waivePremium(policy.value!.id, { waiverReason: '健康告知触发豁免' }))
      break
    case 'dividend':
      await ElMessageBox.prompt('请输入本年度红利金额（元）', '红利派发', { inputType: 'number' }).then(({ value }) =>
        doAction(() => distributeDividend(policy.value!.id, {
          dividendYear: new Date().getFullYear(),
          dividendAmount: Number(value),
        })),
      )
      break
    case 'annuityStart':
      await ElMessageBox.confirm('确认启动年金给付计划？', '确认', { type: 'info' })
      await doAction(() => startAnnuityPayout(policy.value!.id, { startDate: new Date().toISOString().split('T')[0] }))
      break
    case 'annuityPay':
      await ElMessageBox.confirm('确认执行本期年金给付？', '确认', { type: 'info' })
      await doAction(() => payAnnuityBenefit(policy.value!.id))
      break
    case 'mature':
      await ElMessageBox.confirm('确认执行满期给付？', '确认', { type: 'info' })
      await doAction(() => maturePolicy(policy.value!.id, {}))
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
  await doAction(() => suspendPolicy(policy.value!.id, forms.suspend.reason))
  dialogs.suspend = false
  forms.suspend.reason = ''
}

/** 提交恢复 */
const submitResume = async () => {
  if (!forms.resume.reason.trim()) { ElMessage.warning('请填写恢复原因'); return }
  await doAction(() => resumePolicy(policy.value!.id, forms.resume.reason))
  dialogs.resume = false
}

/** 提交终止 */
const submitTerminate = async () => {
  if (!forms.terminate.terminationReason) { ElMessage.warning('请选择终止原因'); return }
  await doAction(() => terminatePolicy(policy.value!.id, forms.terminate))
  dialogs.terminate = false
}

/** 提交批改 */
const submitEndorsement = async () => {
  if (!forms.endorsement.endorsementType || !forms.endorsement.changeDescription) {
    ElMessage.warning('请填写完整批改信息'); return
  }
  submitting.value = true
  try {
    const result = await applyEndorsement(policy.value!.id, forms.endorsement)
    ElMessage.success(`批改申请已提交，批改单号：${result.endorsementId}`)
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
