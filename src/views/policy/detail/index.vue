<template>
  <!-- 保单详情页 - 含5个 Tab + 寿险生命周期操作按钮 -->
  <div class="ti-page">
    <div class="ti-card" v-loading="loading">
      <TiDetailHeader :title="pageTitle">
        <!-- 🔴 状态徽章须传 label：TiStatusTag 只有颜色映射、没有域内文案（D-501-42，此前裸显 TERMINATED） -->
        <template #meta>
          <TiStatusTag v-if="policy" :value="policy.status" :label="policyStatusLabel(policy.status)" />
        </template>
        <template #actions v-if="policy">
          <!-- 状态相关操作按钮 -->
          <!-- 🔴 :loading 不可删：下拉里 cancel/waive/dividend/annuityStart/annuityPay/mature
               六类操作**不经过对话框**，直接由 ElMessageBox 确认后调 doAction。doAction 虽会置
               submitting=true，但其原先唯一的绑定处是 4 个 dialog footer 按钮——对话框此时并未
               打开，于是这六类操作**全程无任何可见反馈**（接口慢时界面像卡死）。
               绑到下拉触发按钮后，操作期间按钮转圈，且顺带防止重复点击。 -->
          <el-dropdown trigger="click" @command="handleAction">
            <el-button type="primary" :loading="submitting">
              操作 <el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <!-- 🔴 菜单项**全量渲染**、按门禁 :disabled，而不是逐项 v-if 隐藏。
                   原先十项里九项无状态门禁（仅 suspend 一项有，且判的是不存在的幻码），
                   用户点「退保/终止」填完整张表单才被后端拒绝；若改成隐藏，同一份菜单在不同
                   状态下长相不一，用户也无法建立状态机心智模型。禁用 + 原因文案把
                   「为什么现在不能做」直接教给用户。判据全部来自后端聚合根守卫，
                   见 constants/policy.ts 的逐行指针。 -->
              <el-dropdown-menu>
                <el-dropdown-item
                  v-for="item in actionMenu"
                  :key="item.key"
                  :command="item.key"
                  :divided="item.divided"
                  :disabled="!item.allowed"
                  :class="{ 'ti-dropdown-item--danger': item.danger }"
                >
                  <el-icon><component :is="item.icon" /></el-icon>
                  <span>{{ item.label }}</span>
                  <!-- 阻断原因直接内联显示，而非 title 提示：
                       禁用态元素在多数浏览器不派发 hover 事件，tooltip 会点不出来 -->
                  <span v-if="!item.allowed" class="action-blocked">{{ item.reason }}</span>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </TiDetailHeader>

      <!-- R7-12 CP4：加载中走骨架屏（对齐 claim/detail:66），失败态见下。
           🔴 为什么失败态不能也停在骨架屏：骨架屏表达的是「正在加载」，失败后继续转是在**说假话**，
           用户会一直等；而全局 toast 是**瞬时的**（R7-13 结论：它不构成失败态的兜底）。
           此处用全站既有的 el-empty + 重试（本页 own 的「暂无被保标的」已在用该组件），
           不引入 el-result 这个全站零使用的新 idiom。 -->
      <el-skeleton v-if="!policy && !loadError" :rows="8" animated />
      <el-empty v-else-if="!policy" description="保单详情加载失败，请重试" :image-size="80">
        <el-button type="primary" @click="loadPolicy">重新加载</el-button>
      </el-empty>
      <el-tabs v-else v-model="activeTab" class="policy-tabs">
        <!-- Tab1：基本信息 -->
        <el-tab-pane label="基本信息" name="basic">
          <!-- 🔴 分组标题（R7-12 CP1）：对齐 claim/detail:30、billing/detail、underwriting/detail
               的既有做法（el-divider content-position="left" + 每组独立 el-descriptions）。
               分组判据是**运营提问的顺序**：先认单（这是哪张单、谁的单）→ 再算钱 → 最后看期间。
               ⚠️ 不把 18 个字段塞进一个 el-descriptions：EP 会按列数机械折行，
               语义相邻的字段被拆到不同行，读起来是一堆没有结构的键值对。 -->
          <el-divider content-position="left">保单信息</el-divider>
          <el-descriptions :column="detailColumns" border>
            <el-descriptions-item label="保单号">
              <!-- R7-12 CP2：原为 `el-button text :icon="CopyDocument"`（全仓唯一写法），
                   换成 TiCopyText —— 它除复制外还带等宽字体与超长省略，且**自带非安全上下文的
                   execCommand 降级**（navigator.clipboard 在 http 源下不可用，原写法点了一直无反应）。 -->
              <TiCopyText :text="policy.policyNo" />
            </el-descriptions-item>
            <el-descriptions-item label="保单形态">{{ policy.policyForm || '-' }}</el-descriptions-item>
            <el-descriptions-item label="产品名称">{{ policy.productName || '-' }}</el-descriptions-item>
            <!-- 产品编码 / 险种段数量 / 销售渠道：详情接口一直返回、此前从未渲染（R7-12 CP3 扩面） -->
            <el-descriptions-item label="产品编码">
              <TiCopyText :text="policy.productCode || '-'" />
            </el-descriptions-item>
            <el-descriptions-item label="险种段数量">{{ policy.lineCount ?? '-' }}</el-descriptions-item>
            <el-descriptions-item label="投保人">{{ policy.policyHolderName || '-' }}</el-descriptions-item>
            <el-descriptions-item label="被保人">{{ policy.insuredName || '-' }}</el-descriptions-item>
            <el-descriptions-item label="销售渠道">{{ salesChannelText(policy.salesChannel) }}</el-descriptions-item>
          </el-descriptions>

          <el-divider content-position="left">保费信息</el-divider>
          <el-descriptions :column="detailColumns" border>
            <el-descriptions-item label="年缴保费">{{ formatAmount(policy.premium) }}</el-descriptions-item>
            <el-descriptions-item label="总保费">{{ formatAmount(policy.totalPremium) }}</el-descriptions-item>
            <el-descriptions-item label="基本保额">{{ formatAmount(policy.sumInsured) }}</el-descriptions-item>
            <!-- 🔴 收费方式与收讫状态**不得走 TiDictSelect 的字典**（R7-12 实测）：
                 本页这两个码来自 policy 域枚举 PremiumCollectionMode / PremiumCollectionStatus；
                 而库里的 PAYMENT_COLLECTION_STATUS 字典是 **billing 域单笔缴费流水**语义
                 （PAID/PENDING/FAILED），其值与真实数据只有 PENDING 一个重合 ——
                 COLLECTED(31 行)/UNCOLLECTED(55 行) 都不在字典内，用它渲染会**裸显英文码**。
                 PremiumCollectionStatus 的类注释亦明载二者「不可互相替代」（本枚举含「部分收讫」
                 这一流水状态无法表达的语义）。文案逐字取自枚举自带中文 name，见本地映射常量。 -->
            <el-descriptions-item label="收费方式">{{ collectionModeText(policy.collectionMode) }}</el-descriptions-item>
            <el-descriptions-item label="收讫状态">
              <el-tag size="small" :type="collectionStatusMeta(policy.collectionStatus).type">
                {{ collectionStatusMeta(policy.collectionStatus).text }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="已收讫金额">{{ formatAmount(policy.collectedAmount) }}</el-descriptions-item>
          </el-descriptions>

          <el-divider content-position="left">保险期间</el-divider>
          <el-descriptions :column="detailColumns" border>
            <el-descriptions-item label="生效日期">{{ formatDate(policy.effectiveDate) }}</el-descriptions-item>
            <el-descriptions-item label="到期日期">{{ formatDate(policy.expiryDate) }}</el-descriptions-item>
            <el-descriptions-item label="等待期止期">{{ formatDate(policy.waitingPeriodEndDate) }}</el-descriptions-item>
            <el-descriptions-item label="犹豫期止期">{{ formatDate(policy.hesitationPeriodEndDate) }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ formatDateTime(policy.createTime) }}</el-descriptions-item>
            <el-descriptions-item label="更新时间">{{ formatDateTime(policy.updateTime) }}</el-descriptions-item>
          </el-descriptions>

          <!-- 🔴 关联单据（R7-07）：保单 → 意向单 / 核保单。
               反向链路（意向单 → 投保单 → 保单）由那两页的详情对话框承担，本区承担下行方向。
               🔴 此处**有意不含「投保单」**：保单的 insurance_id 在 web VO 层被丢弃
               （PolicyView 有该列、PolicyQueryServiceImpl 已 setApplicationId，但
               PolicyDetailVO 全文无该字段），后端不返回 ⇒ 渲染出来必是恒空项。
               保单 → 投保单须经 bizNo 桥（出单进度），而保单视图亦无 bizNo 列，本页无从发起。 -->
          <section v-if="policy.proposalId || policy.underwritingId" class="linked-docs">
            <el-divider content-position="left">关联单据</el-divider>
            <div class="linked-docs__actions">
              <el-button v-if="policy.proposalId" :icon="Document" @click="goToProposal">查看意向单</el-button>
              <el-button v-if="policy.underwritingId" :icon="DocumentChecked" @click="goToUnderwriting">查看核保单</el-button>
            </div>
          </section>

          <section v-if="subjects.length" class="subject-section">
            <!-- 🔴 标题与前三个分组统一为 el-divider（R7-12）：此前是裸 `<h4>`，
                 而 `.subject-section` 在全项目**没有任何样式定义**（`grep` 零命中），
                 于是它按浏览器默认 h4 渲染 —— 比上方分组标题小一号、且没有分隔线，
                 视觉层级低于它自己要统领的子项表格（子表的标题反而是粗体）。
                 计数徽标随标题同行右置，样式在本文件 style 段就近定义。 -->
            <el-divider content-position="left">
              被保标的
              <span class="subject-section__count">{{ subjects.length }} 项</span>
            </el-divider>
            <div class="subject-list">
              <article v-for="subject in subjects" :key="subject.subjectId || subject.subjectName" class="subject-item">
                <div class="subject-item__title">
                  <strong>{{ subject.subjectName || subjectTypeLabel(subject.subjectType) }}</strong>
                  <!-- 🔴 `:label` 不可省（R7-20）：TiStatusTag 的全局 STATUS_TEXT 里
                       `STANDARD` =「标准承保」，那是**核保结论**的文案；本处渲染的是
                       标的**风险等级**，正确文案是「标准体」。不传 label 时该码会命中兜底表
                       并**静默显示成「标准承保」**——一句看起来合理、实则说错的话，且不触发告警。
                       另三码（次标准体/高风险体/不可保体）不在兜底表内，会告警并裸显英文码。 -->
                  <TiStatusTag v-if="subject.riskLevel" :value="subject.riskLevel" :label="riskLevelLabel(subject.riskLevel)" />
                </div>
                <el-descriptions :column="detailColumns" border size="small">
                  <el-descriptions-item label="标的类型">{{ subjectTypeLabel(subject.subjectType) }}</el-descriptions-item>
                  <el-descriptions-item label="标的保额">{{ formatAmount(subject.subjectSumInsured) }}</el-descriptions-item>
                  <el-descriptions-item v-for="field in subjectFields(subject)" :key="field.key" :label="field.label">
                    {{ field.value }}
                  </el-descriptions-item>
                </el-descriptions>
              </article>
            </div>
          </section>
          <el-empty v-else-if="!loading" description="暂无被保标的信息" :image-size="64" />
        </el-tab-pane>

        <!-- Tab2：理赔记录 -->
        <!-- 🔴 此前是硬编码 `<el-empty description="暂无理赔记录" />`：**无论该保单有多少笔理赔
             都恒显示"暂无"**。接口侧 `getClaimList` 早就接受 policyId 过滤，是纯前端未接线。
             这类"假空态"比报错更危险——它让用户确信「这单没理赔过」。 -->
        <el-tab-pane label="理赔记录" name="claims">
          <el-table v-loading="claimsLoading" :data="claims" border stripe>
            <el-table-column prop="claimNumber" label="报案号" min-width="170" />
            <el-table-column label="理赔类型" width="130"><template #default="{ row }">{{ claimTypeLabel(row.claimType) }}</template></el-table-column>
            <!-- 时间列统一走全局日期工具，避免直出后端 ISO 串（2026-09-18 全站实测） -->
            <el-table-column label="出险时间" width="175"><template #default="{ row }">{{ formatDateTime(row.incidentDate) }}</template></el-table-column>
            <el-table-column label="申请赔付" width="130" align="right"><template #default="{ row }">{{ formatAmount(row.claimAmount) }}</template></el-table-column>
            <el-table-column label="核定赔付" width="130" align="right"><template #default="{ row }">{{ formatAmount(row.settledAmount) }}</template></el-table-column>
            <el-table-column label="状态" width="120"><template #default="{ row }"><TiStatusTag :value="row.status" :label="claimStatusLabel(row.status)" /></template></el-table-column>
            <!-- 🔴 操作列统一：label 用「查看」但仍是操作列 —— 宽度取 table.ts 的 120 档、
                 挂 ti-action-column（间距/不换行），按钮走常规形态而非 link（S-15 口径） -->
            <el-table-column label="查看" width="120" class-name="ti-action-column">
              <template #default="{ row }">
                <el-button size="small" :icon="View" @click="$router.push(`/claim/detail/${row.claimId}`)">详情</el-button>
              </template>
            </el-table-column>
            <template #empty><el-empty description="该保单暂无理赔记录" :image-size="80" /></template>
          </el-table>
        </el-tab-pane>

        <!-- Tab3：缴费记录 -->
        <!-- 🔴 同 Tab2：原先恒显示"暂无缴费记录"，而 `getPremiumSchedule(policyId)` 已存在。 -->
        <el-tab-pane label="缴费记录" name="payments">
          <el-table v-loading="paymentsLoading" :data="payments" border stripe>
            <!-- 🔴 整表 4 列都是定长数据（期次/日期/金额/状态），无「内容长度不定」的承接列可用。
                 此时**不能只挑一列改 min-width**：EP 会把表格全部剩余宽砸给那一列（实测状态列
                 990px、列内只有一个「待缴费」标签），比窄表更难看。改用 EP 原生做法——**全列
                 min-width**（无数字 width），EP 走 flexColumns.length>1 分支按 minWidth 比例分摊
                 （table-layout.mjs:100-108），四列各放大 ~1.8 倍、均匀铺满，无单列空档。 -->
            <el-table-column prop="period" label="期次" min-width="80" />
            <el-table-column prop="dueDate" label="到期日" min-width="140"><template #default="{ row }">{{ formatDate(row.dueDate) }}</template></el-table-column>
            <el-table-column label="应缴金额" min-width="150" align="right"><template #default="{ row }">{{ formatAmount(row.amount, row.currency) }}</template></el-table-column>
            <el-table-column label="状态" min-width="120">
              <!-- 缴费计划状态无专用字典（与 billing/detail 同口径），就近定义域内语义 -->
              <template #default="{ row }"><TiStatusTag :value="row.status" :label="SCHEDULE_STATUS_TEXT[row.status] || row.status" /></template>
            </el-table-column>
            <template #empty><el-empty description="该保单暂无缴费计划" :image-size="80" /></template>
          </el-table>
        </el-tab-pane>

        <!-- Tab4：保全记录 -->
        <el-tab-pane label="保全记录" name="maintenance">
          <el-table v-loading="maintenanceLoading" :data="maintenanceRecords" border stripe>
            <el-table-column label="保全项" min-width="190"><template #default="{ row }">{{ row.itemCodes?.join('、') || '-' }}</template></el-table-column>
            <el-table-column prop="source" label="来源" width="110"><template #default="{ row }">{{ row.source === 'MANUAL' ? '后台人工' : 'API 自动' }}</template></el-table-column>
            <el-table-column prop="status" label="案件状态" width="120"><template #default="{ row }"><TiStatusTag :value="row.status" :label="maintenanceStatusLabel(row.status)" /></template></el-table-column>
            <el-table-column prop="effectStatus" label="生效状态" width="120"><template #default="{ row }"><TiStatusTag :value="row.effectStatus || 'NOT_STARTED'" :label="effectStatusLabel(row.effectStatus || 'NOT_STARTED')" /></template></el-table-column>
            <!-- 时间列统一走全局日期工具，避免直出后端 ISO 串（2026-09-18 全站实测） -->
            <el-table-column prop="createdAt" label="创建时间" width="175">
              <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
            </el-table-column>
            <!-- 🔴 同 Tab2：操作列 120 档 + ti-action-column，跳保全工作台 -->
            <el-table-column label="查看" width="120" class-name="ti-action-column">
              <template #default="{ row }">
                <el-button size="small" :icon="View" @click="$router.push(`/maintenance/workbench/${row.caseId}`)">工作台</el-button>
              </template>
            </el-table-column>
            <template #empty><el-empty description="暂无保全记录" :image-size="80" /></template>
          </el-table>
        </el-tab-pane>

        <!-- Tab5：操作日志 -->
        <!-- 🔴 本 tab 保持空态是**接口能力所限，不是待接线**：`getOperationLogs` 仅接受
             username / module / status / dateRange 四个过滤条件，**没有 policyId 参数**，
             故无法按保单维度检索。原先是裸 `暂无操作日志`，从文案上无法与「确实没有日志」
             区分——用户会把「查不了」误读成「没发生」。现明确说明原因并给出可用出口。 -->
        <el-tab-pane label="操作日志" name="logs">
          <el-empty :image-size="80">
            <template #description>
              <p class="empty-explain">
                操作日志接口暂不支持按保单号检索（后端仅开放 操作人 / 模块 / 结果 / 时间范围 四个筛选条件），
                因此本页无法展示该保单的专属日志。
              </p>
            </template>
            <el-button @click="$router.push('/system/log')">前往操作日志查询</el-button>
          </el-empty>
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- 中止保单对话框 -->
    <el-dialog v-model="dialogs.suspend" title="中止保单" width="400px">
      <el-form ref="suspendFormRef" :model="forms.suspend" :rules="suspendRules" label-width="100px">
        <el-form-item label="中止原因" prop="reason">
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
      <el-form ref="resumeFormRef" :model="forms.resume" :rules="resumeRules" label-width="100px">
        <el-form-item label="恢复原因" prop="reason">
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
      <el-alert type="warning" :closable="false" class="ti-dialog-alert">
        <p>退保后将扣除手续费，按现金价值退还保费，操作不可撤销。</p>
      </el-alert>
      <el-form ref="terminateFormRef" :model="forms.terminate" :rules="terminateRules" label-width="120px">
        <el-form-item label="终止原因" prop="terminationReason">
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
      <el-form ref="endorsementFormRef" :model="forms.endorsement" :rules="endorsementRules" label-width="120px">
        <el-form-item label="批单号" prop="endorsementNo">
          <el-input v-model="forms.endorsement.endorsementNo" placeholder="请输入批单号" />
        </el-form-item>
        <el-form-item label="批改类型" prop="updateType">
          <TiDictSelect v-model="forms.endorsement.updateType" dict-type="MAINTENANCE_TYPE" :clearable="false" style="width: 100%" />
        </el-form-item>
        <el-form-item label="变更说明" prop="changeSummary">
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
import { ref, computed, onMounted, reactive, watch, type Ref, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import {
  ArrowDown, VideoPause, VideoPlay, CircleClose,
  Delete, Discount, Money, Coin, Wallet, Flag, Edit,
  Document, DocumentChecked, View,
} from '@element-plus/icons-vue'
import {
  getPolicyDetail, getPolicySubjects, suspendPolicy, resumePolicy, terminatePolicy,
  cancelPolicy, waivePremium, distributeDividend, startAnnuityPayout,
  payAnnuityBenefit, maturePolicy, applyEndorsement,
  type PolicyDataUpdateType, type TerminationReason,
} from '@/api/policy'
import TiDetailHeader from '@/components/TiDetailHeader/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import TiCopyText from '@/components/TiCopyText/index.vue'
import type { PolicyVO } from '@/types/business.d'
import type { PolicySubjectVO } from '@/api/policy'
import { getMaintenanceCaseList, type MaintenanceCaseSummary } from '@/api/maintenance'
import { getClaimList, type ClaimCaseVO } from '@/api/claim'
import { getPremiumSchedule, type PremiumScheduleVO } from '@/api/billing'
import { checkPolicyAction, type PolicyActionKey } from '@/constants/policy'
import { riskLevelLabel } from '@/constants/underwriting'
import { useDict } from '@/composables/useDict'
import { usePermission } from '@/composables/usePermission'
import { useDetailColumns } from '@/composables/useDetailColumns'
import { formatDate, formatDateTime } from '@/utils/date'
import { formatAmount } from '@/utils/format'

/** 状态文案取自后端字典（域内语义最准，D-501-42） */
const { getLabel: policyStatusLabel } = useDict('POLICY_STATUS')
const { getLabel: maintenanceStatusLabel } = useDict('MAINTENANCE_CASE_STATUS')
const { getLabel: effectStatusLabel } = useDict('MAINTENANCE_EFFECT_STATUS')
/** 销售渠道：与意向单页同源字典（`SALES_CHANNEL` 六值：代理人/银保/经纪人/团险直销/线上直销/电销） */
const { getLabel: salesChannelLabel } = useDict('SALES_CHANNEL')

/** 保单信息各面板：字段短，宽屏 3 档 */
const detailColumns = useDetailColumns(3)

const route = useRoute()
const router = useRouter()

/**
 * 保单 → 意向单。
 * <p>意向单详情是**对话框、无独立路由**（列表页 `views/policy/intention`），
 * 故经 query 驱动，由该页读 `?proposalId=` 自动展开。</p>
 */
const goToProposal = () => {
  if (!policy.value?.proposalId) return
  router.push({ path: '/policy/intention', query: { proposalId: policy.value.proposalId } })
}

/** 保单 → 核保单：核保单有独立路由（`/underwriting/detail/:id`），直接跳 */
const goToUnderwriting = () => {
  if (!policy.value?.underwritingId) return
  router.push(`/underwriting/detail/${policy.value.underwritingId}`)
}
/** 动作菜单的权限判据（权威码逐条见 ACTION_MENU_SPEC 的 permission 字段注释） */
const { hasPermission } = usePermission()
const loading = ref(false)
/** 主详情加载失败（R7-12 CP4）：与「加载中」区分开，否则失败后页面永久停在骨架屏 */
const loadError = ref(false)
const submitting = ref(false)
const policy = ref<PolicyVO | null>(null)
/**
 * 页头标题：保单号未取到时**只显示「保单详情」**。
 * 🔴 原写法是模板里直接拼 `` `保单详情 - ${policy?.policyNo ?? ''}` ``，
 * 加载中/加载失败时渲染成「保单详情 -」—— 末尾一根悬空横杠，看着像数据被截断了。
 */
const pageTitle = computed(() => (policy.value?.policyNo ? `保单详情 - ${policy.value.policyNo}` : '保单详情'))
const subjects = ref<PolicySubjectVO[]>([])
const activeTab = ref('basic')
const maintenanceLoading = ref(false)
const maintenanceRecords = ref<MaintenanceCaseSummary[]>([])
const claimsLoading = ref(false)
const claims = ref<ClaimCaseVO[]>([])
const paymentsLoading = ref(false)
const payments = ref<PremiumScheduleVO[]>([])

/** 理赔类型/状态字典（与 claim 域同源，支持国际化） */
const { getLabel: claimTypeLabel } = useDict('CLAIM_TYPE')
const { getLabel: claimStatusLabel } = useDict('CLAIM_STATUS')

/** 缴费计划状态无专用字典（与 billing/detail 同口径），就近定义域内语义 */
const SCHEDULE_STATUS_TEXT: Record<string, string> = { PENDING: '待缴费', PAID: '已缴费', OVERDUE: '已逾期' }

/**
 * 收费方式文案（R7-12 CP3）。
 *
 * <p>🔴 **不能走字典**：`collection_mode` 的值域来自 policy 域枚举
 * {@code PremiumCollectionMode}（OFFLINE/ONLINE/FREE/PAY_AFTER_USE/WITHHOLD），
 * 而库中并没有该枚举对应的字典类型 —— 拿 `SALES_CHANNEL` 顶上会在 `ONLINE` 上**说错话**
 * （字典里 `ONLINE`=「线上直销」，而此处 `ONLINE`=「线上支付」，**同码双义**）。
 * 文案逐字取自枚举自带中文 name。</p>
 *
 * <p>live 实测值域（87 行保单）：ONLINE 74 / FREE 11 / OFFLINE 2。</p>
 */
const COLLECTION_MODE_TEXT: Record<string, string> = {
  OFFLINE: '线下收费',
  ONLINE: '线上支付',
  FREE: '免支付',
  PAY_AFTER_USE: '先享后付',
  WITHHOLD: '代扣',
}

/**
 * 收讫状态文案 + 语义色（R7-12 CP3）。
 *
 * <p>🔴 **同样不能走字典，且此处是最危险的一处**：库中 `PAYMENT_COLLECTION_STATUS` 字典
 * （PAID 已收款 / PENDING 待收款 / FAILED 收款失败）是 **billing 域单笔缴费流水**的语义；
 * 本字段的值域来自 policy 域 {@code PremiumCollectionStatus}（保单「应收 vs 实收」的聚合状态）。
 * 两个值域**只有一个 `PENDING` 重合** —— live 实测 87 行里 COLLECTED 31 / UNCOLLECTED 55
 * （均不在字典内，用字典渲染会裸显英文码）、PENDING 仅 1 行（唯一会「看起来对了」的行）。
 * 最坏组合是「大部分行裸显英文码、个别行显示得像是正确的」——比全错更难发现。
 * {@code PremiumCollectionStatus} 的类注释亦明载二者「不可互相替代」（本枚举含「部分收讫」
 * 这一流水状态无法表达的语义）。</p>
 *
 * <p>文案逐字取自枚举自带中文 name；颜色按业务语义给定（未收讫=待办中性、部分收讫=需关注、
 * 已收讫=完成、后付=特殊约定、逾期=异常）。</p>
 */
const COLLECTION_STATUS_META: Record<string, { text: string; type: 'success' | 'warning' | 'info' | 'danger' | 'primary' }> = {
  UNCOLLECTED: { text: '未收讫', type: 'info' },
  PARTIALLY_COLLECTED: { text: '部分收讫', type: 'warning' },
  COLLECTED: { text: '已收讫', type: 'success' },
  DEFERRED: { text: '后付', type: 'primary' },
  OVERDUE: { text: '逾期', type: 'danger' },
}

/** 收费方式取文案；未登记码原样回显（不臆造文案，可见即待登记） */
const collectionModeText = (code?: string): string =>
  code ? COLLECTION_MODE_TEXT[code] || code : '-'

/**
 * 销售渠道取文案。
 * 包一层是因为 `useDict` 的 `getLabel` 签名收 `string`（不接受 undefined），
 * 与意向单页 `getChannelLabel` 同款处理。
 */
const salesChannelText = (code?: string): string => (code ? salesChannelLabel(code) : '-')

/** 收讫状态取「文案 + 颜色」；未登记码按中性色原样回显 */
const collectionStatusMeta = (code?: string): { text: string; type: 'success' | 'warning' | 'info' | 'danger' | 'primary' } =>
  code ? COLLECTION_STATUS_META[code] || { text: code, type: 'info' } : { text: '-', type: 'info' }

/** 各 tab 的加载完成标记：避免每次切回都重复请求（数据在一屏会话内不会变） */
const loadedTabs = new Set<string>()

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

/**
 * 四个操作弹窗的表单实例与校验规则。
 * 🔴 原先这四个表单**只有 `required` 属性、没有 rules**：required 在 Element Plus 里
 * 只是标签前的星号装饰，不产生任何校验（RulesProp 为空即不校验）。
 * 各 submit 里确有 `if (!x) { ElMessage.warning() }` —— 判断是对的，但反馈只落在全局
 * 消息条上：用户看不到**哪个**输入框有问题，弹窗里 4 个字段时尤其难定位。
 * 现在规则与这些 if 一一对应（判据不变，只是把结论落到字段上），if 保留为兜底。
 */
const suspendFormRef = ref<FormInstance>()
const resumeFormRef = ref<FormInstance>()
const terminateFormRef = ref<FormInstance>()
const endorsementFormRef = ref<FormInstance>()

/** 合同不可逆：reason 的必填判据来自既有 required 与 submitSuspend 的 if
 *  `whitespace: true` 不可省：async-validator 默认只判「非空字符串」，
 *  一串空格能通过 required —— 而原 if 用的是 `.trim()`，判据更严。 */
const suspendRules: FormRules = {
  reason: [{ required: true, whitespace: true, message: '请填写中止原因', trigger: 'blur' }],
}
const resumeRules: FormRules = {
  reason: [{ required: true, whitespace: true, message: '请填写恢复原因', trigger: 'blur' }],
}
const terminateRules: FormRules = {
  terminationReason: [{ required: true, message: '请选择终止原因', trigger: 'change' }],
}
const endorsementRules: FormRules = {
  endorsementNo: [{ required: true, whitespace: true, message: '请输入批单号', trigger: 'blur' }],
  updateType: [{ required: true, message: '请选择批改类型', trigger: 'change' }],
  changeSummary: [{ required: true, whitespace: true, message: '请描述具体变更内容', trigger: 'blur' }],
}

/**
 * 操作菜单的**静态结构**（不含门禁结论）。
 *
 * <p>组件对象刻意放在模块级常量、不进任何响应式容器：把 imported 组件塞进 `reactive`/深层
 * 响应式结构会让 Vue 尝试代理组件实例并告警。门禁结论由 {@link actionMenu} 逐项计算叠加。</p>
 *
 * <p>⚠️ 不要写成 `as const`：字面量断言会让每个数组元素成为互不相同的窄类型，
 * 于是 `divided`/`danger` 这两个**可选**字段在未声明的元素上不存在，
 * 模板里的 `item.divided` 直接编译失败。</p>
 */
const ACTION_MENU_SPEC: ReadonlyArray<{
  key: PolicyActionKey
  label: string
  icon: Component
  /** 该动作落到的后端端点所需权限码（逐条取自 `PolicyProxyController` 的 `@PreAuthorize`） */
  permission: string
  /** 危险操作：标签走 danger 色，且确认框用红色主按钮 */
  danger?: boolean
  /** 与前一组之间加分隔线 */
  divided?: boolean
}> = [
  // `PUT /policies/{id}/suspend|resume` → POLICY_FREEZE
  { key: 'suspend', label: '中止保单', icon: VideoPause, danger: true, permission: 'policy:freeze' },
  { key: 'resume', label: '恢复保单', icon: VideoPlay, permission: 'policy:freeze' },
  // `PUT /policies/{id}/terminate|mature` → POLICY_TERMINATE
  { key: 'terminate', label: '退保/终止', icon: CircleClose, danger: true, divided: true, permission: 'policy:terminate' },
  // `PUT /policies/{id}/cancel` → POLICY_CANCEL
  { key: 'cancel', label: '撤销保单', icon: Delete, danger: true, permission: 'policy:cancel' },
  // `PUT /policies/{id}/waive-premium`、`POST /policies/{id}/dividend`、
  // `POST /policies/{id}/annuity-payout/start|pay` → POLICY_PAYOUT（四个动作同一码）
  { key: 'waive', label: '保费豁免', icon: Discount, divided: true, permission: 'policy:payout' },
  { key: 'dividend', label: '红利派发', icon: Money, permission: 'policy:payout' },
  { key: 'annuityStart', label: '启动年金给付', icon: Coin, permission: 'policy:payout' },
  { key: 'annuityPay', label: '执行年金给付', icon: Wallet, permission: 'policy:payout' },
  { key: 'mature', label: '满期给付', icon: Flag, divided: true, permission: 'policy:terminate' },
  { key: 'endorsement', label: '申请批改', icon: Edit, permission: 'maintenance:create' },
]

/**
 * 操作菜单 = 静态结构 + 门禁结论 + 权限结论。
 *
 * <p>门禁判据全部来自后端聚合根守卫的单一真源 `constants/policy.ts`，本文件不再内联任何
 * 状态判断——此前内联的 `status === 'ACTIVE'`（幻码）正是这种内联的产物；内联判据既无法与
 * 后端守卫对齐，也没人守护它的值域正确性（前端曾长期用**写侧**码判**读侧**数据）。</p>
 *
 * <p>权限码取自 `PolicyProxyController` 的 `@PreAuthorize`，逐动作与端点对齐；
 * 无权限的动作**整项移出菜单**（而非置灰）——置灰表达的是「此刻不可做」，
 * 与「你永远做不了」是两回事，混在一起会让人反复回来试。</p>
 */
const actionMenu = computed(() =>
  ACTION_MENU_SPEC.filter((item) => hasPermission(item.permission)).map((item) => ({
    ...item,
    ...checkPolicyAction(item.key, policy.value),
  })),
)

/** 处理操作菜单命令 */
const handleAction = async (cmd: string) => {
  // 兜底守卫：菜单项已按门禁 :disabled，正常路径下收不到被阻断的命令；
  // 键盘导航等边缘路径若仍派发，这里拦下并说明原因，绝不放行到接口。
  const gate = checkPolicyAction(cmd as PolicyActionKey, policy.value)
  if (!gate.allowed) {
    ElMessage.warning(gate.reason)
    return
  }
  switch (cmd) {
    case 'suspend': dialogs.suspend = true; break
    case 'resume': dialogs.resume = true; break
    case 'terminate': dialogs.terminate = true; break
    case 'cancel':
      if (!(await confirmAction('确认撤销该保单？此操作不可撤销。', '撤销保单'))) break
      await doAction(() => cancelPolicy(policy.value!.policyId, '管理员操作撤销'))
      break
    case 'waive':
      if (!(await confirmAction('确认对该保单执行保费豁免？豁免后该保单不再缴纳后续保费。', '保费豁免'))) break
      await doAction(() => waivePremium(policy.value!.policyId, { reason: 'INSURED_CRITICAL_ILLNESS' }))
      break
    case 'dividend': {
      const dividendAmount = await promptAmount('请输入本年度红利金额（元）', '红利派发')
      if (dividendAmount === null) break
      // policyYear 取当前自然年：此处是既定业务口径，不改语义；
      // 但它**必须显式进入确认文案**——原先它只存在于代码里，运营无从知晓这笔红利被记到哪一年。
      const policyYear = new Date().getFullYear()
      if (!(await confirmAction(
        `确认按 ${policyYear} 保单年度派发红利 ${formatAmount(dividendAmount)}？领取方式为「累积生息」。`,
        '红利派发',
      ))) break
      await doAction(() => distributeDividend(policy.value!.policyId, {
        policyYear,
        dividendAmount,
        option: 'ACCUMULATE',
      }))
      break
    }
    case 'annuityStart': {
      const amountPerInstallment = await promptAmount('请输入每期年金给付金额（元）', '启动年金给付')
      if (amountPerInstallment === null) break
      if (!(await confirmAction(
        `确认自今日起按年给付年金，每期 ${formatAmount(amountPerInstallment)}？启动后给付期不可重复启动。`,
        '启动年金给付',
      ))) break
      await doAction(() => startAnnuityPayout(policy.value!.policyId, {
        startDate: new Date().toISOString().replace(/\.\d{3}Z$/, ''),
        frequency: 'ANNUALLY',
        amountPerInstallment,
        // ⚠️ 已知缺口：币种硬编码 CNY。PolicyVO 未下发保单币种字段，无法取到真实值；
        //    多币种租户下此处会记错币种。需 policy 域在 PolicyDetailVO 补 currency 后改为取详情值。
        currency: 'CNY',
      }))
      break
    }
    case 'annuityPay':
      if (!(await confirmAction('确认执行本期年金给付？', '执行年金给付'))) break
      await doAction(() => payAnnuityBenefit(policy.value!.policyId))
      break
    case 'mature': {
      const maturityBenefit = await promptAmount('请输入满期给付金额（元）', '满期给付')
      if (maturityBenefit === null) break
      if (!(await confirmAction(
        `确认给付满期生存金 ${formatAmount(maturityBenefit)}？保单将转为「满期」终态，不可撤销。`,
        '满期给付',
      ))) break
      await doAction(() => maturePolicy(policy.value!.policyId, { maturityBenefit }))
      break
    }
    case 'endorsement': dialogs.endorsement = true; break
  }
}

/**
 * 确认框：用户取消/关闭时返回 `false`，而不是抛出 `'cancel'` 拒绝。
 *
 * <p>🔴 原先各分支直接 `await ElMessageBox.confirm(...)`，且**无 catch**——用户点「取消」
 * 即产生未处理的 Promise 拒绝，控制台报错而界面毫无反馈。</p>
 */
const confirmAction = async (message: string, title: string, danger = true): Promise<boolean> => {
  try {
    await ElMessageBox.confirm(message, title, {
      type: danger ? 'warning' : 'info',
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      ...(danger ? { confirmButtonClass: 'el-button--danger' } : {}),
    })
    return true
  } catch {
    return false
  }
}

/**
 * 金额录入框：带 `inputValidator` 的实时校验，非法输入**无法提交**。
 *
 * <p>🔴 原先三处 `ElMessageBox.prompt(..., { inputType: 'number' })` 均无 `inputValidator`：
 * `Number('')` = 0、`Number('abc')` = NaN、`-5` 原样通过，全都直接发给后端——
 * 而这几个操作全是**不可逆的资金动作**（红利派发、年金给付、满期给付）。
 * 后端虽会以「金额必须大于零」拒绝，但那是提交之后的事，用户填了个空值就点确认属于必然失败。</p>
 *
 * @returns 合法金额；用户取消或输入非法返回 `null`（调用方据此直接结束，不进入后续确认）。
 */
const promptAmount = async (message: string, title: string): Promise<number | null> => {
  try {
    const { value } = await ElMessageBox.prompt(message, title, {
      inputType: 'number',
      confirmButtonText: '下一步',
      cancelButtonText: '取消',
      inputValidator: (input: string) => {
        const text = (input ?? '').trim()
        if (!text) return '金额不能为空'
        const num = Number(text)
        if (!Number.isFinite(num)) return '请输入有效的数字'
        if (num <= 0) return '金额必须大于零'
        // 货币最小单位是分：多于两位小数后端 BigDecimal 会拒或静默截断，此处提前拦下
        if (Math.round(num * 100) !== num * 100) return '金额最多保留两位小数'
        return true
      },
    })
    return Number(value)
  } catch {
    return null
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
  if (!(await suspendFormRef.value?.validate().then(() => true).catch(() => false))) return
  await doAction(() => suspendPolicy(policy.value!.policyId, forms.suspend.reason))
  dialogs.suspend = false
  forms.suspend.reason = ''
}

/** 提交恢复 */
const submitResume = async () => {
  if (!(await resumeFormRef.value?.validate().then(() => true).catch(() => false))) return
  await doAction(() => resumePolicy(policy.value!.policyId, forms.resume.reason))
  dialogs.resume = false
}

/** 提交终止 */
const submitTerminate = async () => {
  if (!(await terminateFormRef.value?.validate().then(() => true).catch(() => false))) return
  await doAction(() => terminatePolicy(policy.value!.policyId, {
    reason: forms.terminate.reason,
    terminationReason: forms.terminate.terminationReason as TerminationReason,
  }))
  dialogs.terminate = false
}

/** 提交批改 */
const submitEndorsement = async () => {
  if (!(await endorsementFormRef.value?.validate().then(() => true).catch(() => false))) return
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

const subjectTypeLabel = (type?: string) => ({
  VEHICLE: '车辆', PROPERTY: '财产', ORGANIZATION: '组织', PERSON: '人员',
  HOUSEHOLD: '家庭财产', CARGO: '货物', VESSEL: '船舶', AIRCRAFT: '航空器',
}[type || ''] || type || '标的')

const subjectFieldLabels: Record<string, string> = {
  licensePlate: '车牌号', vin: 'VIN', firstRegistrationDate: '初次登记日期',
  usageType: '用途类型', ncd: 'NCD 系数', model: '厂牌型号',
  address: '地址', propertyAddress: '财产地址', buildingStructure: '建筑结构',
  fireProtectionGrade: '消防等级', fireProtectionLevel: '消防等级', occupancyType: '占用性质',
  propertyUsage: '财产用途', propertyValue: '财产价值', industry: '行业', employeeCount: '员工数',
  payroll: '工资总额', payrollAmount: '工资总额', workplaceAddress: '工作场所地址', age: '年龄', gender: '性别',
  occupation: '职业类别', smokingStatus: '吸烟状况',
  // D-501-41 补齐：此前未登记，详情页直出英文键名 relationToHolder
  relationToHolder: '与投保人关系', preExistingCondition: '既往症', socialSecurity: '社保', medicalRegion: '就医地区',
}

/**
 * 枚举型标的属性值中文化（D-501-41）。
 * 码源为后端枚举（不是前端自造）：gender ← metadata `CustomerGender`，relationToHolder ← policy `FamilyRelation`。
 * 🔴 无后端枚举可依据的码（usageType/buildingStructure/occupancyType/propertyUsage/industry 等）**不得在此臆造文案**，
 * 由下方 warnUnmappedSubjectValue 告警暴露，待后端下发货值字典后再补（见台账 D-501-41 结构性建议 3）。
 */
const subjectEnumValueLabels: Record<string, Record<string, string>> = {
  gender: { MALE: '男', FEMALE: '女', UNKNOWN: '未知' },
  relationToHolder: { SELF: '本人', SPOUSE: '配偶', CHILD: '子女', PARENT: '父母' },
}

/** 布尔型属性键：直出 true/false 可读性差，统一渲染「是/否」 */
const subjectBooleanKeys = new Set(['preExistingCondition', 'socialSecurity'])

/** 疑似枚举码（全大写下划线风格），用于识别"该翻却没翻"的值并告警 */
const looksLikeEnumCode = (text: string) => /^[A-Z][A-Z0-9_]{1,}$/.test(text)

/**
 * 标的属性值 → 展示文案：枚举码走映射表，布尔走是/否，其余原样。
 * 未覆盖的枚举码**回退原文并告警**（不静默），避免"英文码直出"再次成为缺陷温床。
 */
const subjectFieldValue = (key: string, value: unknown): string => {
  if (value == null || value === '') return '-'
  if (subjectBooleanKeys.has(key)) return value === true || value === 'true' ? '是' : '否'
  const text = String(value)
  const mapped = subjectEnumValueLabels[key]?.[text]
  if (mapped) return mapped
  if (looksLikeEnumCode(text)) {
    console.warn(`[policy/detail] 标的属性 "${key}" 的值码 "${text}" 无中文映射，请补后端货值字典`)
  }
  return text
}

/** 属性键 → 中文标签：未登记键回退业务化描述 + 告警（对齐 subjectTypeLabel 的「中文兜底」风格，观察项 O-1） */
const subjectFieldLabel = (key: string): string => {
  const label = subjectFieldLabels[key]
  if (label) return label
  console.warn(`[policy/detail] 标的属性键 "${key}" 未登记中文标签，建议迁至后端货值字典`)
  return `其他属性（${key}）`
}

const subjectFields = (subject: PolicySubjectVO) => {
  let attributes: Record<string, unknown> = {}
  if (subject.attributesJson) {
    try {
      const parsed = JSON.parse(subject.attributesJson)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) attributes = parsed
    } catch {
      attributes = {}
    }
  }
  return Object.entries(attributes).map(([key, value]) => ({
    key,
    label: subjectFieldLabel(key),
    value: subjectFieldValue(key, value),
  }))
}

/** 加载保单详情 */
const loadPolicy = async () => {
  loading.value = true
  // 新一轮加载开始：清掉上一轮的失败标记，回到骨架屏。
  // 🔴 与 tab 加载器（loadTabData）的「只在成功分支清错」不同，此处是**用户主动重试**的入口，
  // 清在开头才能让「重新加载」按钮有可见反馈；失败路径由下方 catch 重新置位，不会被吞掉。
  loadError.value = false
  try {
    policy.value = await getPolicyDetail(route.params.id as string)
    // 保单重新加载后，各 tab 的旧数据与「已加载」标记一并作废：
    // 本页多处操作（终止/豁免/满期…）成功后都会调 loadPolicy，若不重置，
    // 终止后再切到理赔 tab 会看到操作前的陈旧列表。
    loadedTabs.clear()
    claims.value = []
    payments.value = []
    maintenanceRecords.value = []
    // 当前 tab 若已是数据 tab，立即重载（watch 不会因 loadedTabs 清空而自动触发）
    void loadTabData(activeTab.value)
    try {
      subjects.value = await getPolicySubjects(route.params.id as string)
    } catch {
      // 标的是详情扩展数据，下游暂不可用时保留主保单详情并显示空态。
      subjects.value = []
    }
  } catch {
    // 详情自身失败：http 拦截器已弹业务消息（瞬时），此处置持久失败态给出重试出口。
    loadError.value = true
  } finally {
    loading.value = false
  }
}

/**
 * 各 tab 的数据加载器。
 *
 * <p>三者共用一套形态：置 loading → 请求 → 失败时**清空并提示**（而不是让 Promise 拒绝
 * 逸出成未处理拒绝）。原先 `loadMaintenanceRecords` 只有 finally 没有 catch，接口报错时
 * 表格停在旧数据上、控制台报未处理拒绝，用户看不出是「没有」还是「没查到」。</p>
 */
const tabLoaders: Record<string, () => Promise<void>> = {
  async maintenance() {
    const result = await getMaintenanceCaseList({
      policyNumber: policy.value!.policyNo,
      pageNum: 1,
      pageSize: 100,
    })
    maintenanceRecords.value = result.list || []
  },
  async claims() {
    const result = await getClaimList({ policyId: policy.value!.policyId, pageNum: 1, pageSize: 100 })
    claims.value = result.list || []
  },
  async payments() {
    payments.value = await getPremiumSchedule(policy.value!.policyId)
  },
}

/** tab 名 → 该 tab 的 { 列表容器, loading 标志 }，供统一加载器读写 */
const tabState: Record<string, { loading: Ref<boolean> }> = {
  maintenance: { loading: maintenanceLoading },
  claims: { loading: claimsLoading },
  payments: { loading: paymentsLoading },
}

/**
 * 加载指定 tab 的数据（幂等：同一 tab 只请求一次；保单切换时由 {@link loadPolicy} 重置）。
 * 失败时给出用户可见提示——理赔/缴费是「查不到」和「没有」必须区分开的场景。
 */
const loadTabData = async (tab: string) => {
  const loader = tabLoaders[tab]
  const state = tabState[tab]
  if (!loader || !state || !policy.value || loadedTabs.has(tab)) return
  state.loading.value = true
  try {
    await loader()
    loadedTabs.add(tab)
  } catch (e: unknown) {
    ElMessage.error(`${tab === 'claims' ? '理赔记录' : tab === 'payments' ? '缴费记录' : '保全记录'}加载失败，请稍后重试`)
    // 已在此处消费错误，无需再冒泡：标为未加载，切回该 tab 会自动重试
    console.error('[policy/detail] tab 数据加载失败', tab, e)
  } finally {
    state.loading.value = false
  }
}

watch(activeTab, (tab) => {
  void loadTabData(tab)
})

onMounted(loadPolicy)
</script>

<style scoped lang="scss">
.policy-tabs {
  :deep(.el-tabs__header) {
    margin-bottom: 16px;
  }
}

/* 被门禁阻断的操作项：原因文案紧跟菜单项标签，弱化为次要文字。
   🔴 必须用 :deep()：dropdown 菜单默认 teleport 到 body，scoped 样式作用不到。
   颜色与间距取设计令牌（$text-secondary / $space-* / $font-size-*），不写字面量。 */
:deep(.el-dropdown-menu__item) {
  .action-blocked {
    margin-left: $space-2;
    font-size: $font-size-sm;
    color: $text-secondary;
  }

  /* EP 的 is-disabled 会把整项变灰，原因文案作为「为什么灰」必须仍然读得清 */
  &.is-disabled .action-blocked {
    color: $text-secondary;
  }
}

.empty-explain {
  max-width: 460px;
  margin: 0 auto $space-3;
  font-size: $font-size-md;
  line-height: 1.6;
  color: $text-secondary;
}

/* 关联单据区（R7-07）：分隔标题左侧对齐，按钮横向排列。
   间距取设计令牌，不写字面量。 */
.linked-docs {
  margin-top: $space-3;

  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: $space-2;
  }
}

/* 被保标的区（R7-12）：标题已并入 el-divider，此处只补该区此前**完全缺失**的布局样式
   （`.subject-section` / `.subject-item` 在全项目零定义，全靠浏览器默认值）。
   仅补「纵向堆叠 + 标题行横排」两件默认样式做不到的事，不重设字号字重——
   那会与上方 el-divider 的既有观感打架。 */
.subject-section {
  margin-top: $space-3;

  /* 计数徽标跟在「被保标的」标题后，弱化为次要文字 */
  &__count {
    margin-left: $space-2;
    font-size: $font-size-sm;
    font-weight: normal;
    color: $text-secondary;
  }
}

.subject-list {
  display: flex;
  flex-direction: column;
  gap: $space-3;
}

.subject-item__title {
  display: flex;
  align-items: center;
  gap: $space-2;
  margin-bottom: $space-2;
}
</style>
