<template>
  <div class="ti-page" v-loading="loading">
    <div class="ti-card" v-if="detail">
      <TiDetailHeader title="保全工作台">
        <template #meta>
          <TiStatusTag :value="detail.status" :label="maintenanceCaseStatusLabel(detail.status)" />
        </template>
        <template #actions>
          <el-button :icon="Refresh" @click="load">刷新</el-button>
        </template>
      </TiDetailHeader>
      <el-descriptions :column="detailColumns" border>
        <el-descriptions-item label="保全号">{{ detail.maintenanceNo || '-' }}</el-descriptions-item>
        <el-descriptions-item label="保单">{{ detail.policyNumber || detail.policyId }}</el-descriptions-item>
        <el-descriptions-item label="客户">{{ detail.customerId }}</el-descriptions-item>
        <el-descriptions-item label="来源">{{ maintenanceChannelLabel(detail.source) }}</el-descriptions-item>
        <el-descriptions-item label="生效方式">{{ maintenanceEffectiveTypeLabel(detail.effectiveTimeType) }}</el-descriptions-item>
        <el-descriptions-item label="约定生效时间">{{ formatCaseEffectiveTime() }}</el-descriptions-item>
        <el-descriptions-item label="基准版本">{{ detail.policyBaselineVersion ?? '-' }}</el-descriptions-item>
        <el-descriptions-item label="产品/计划版本">{{ detail.productVersion || '-' }} / {{ detail.planVersion || '-' }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatDateTime(detail.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="说明" :span="detailColumns">{{ detail.description || '-' }}</el-descriptions-item>
      </el-descriptions>
      <el-alert
        v-if="hasCreatorOwnedReview"
        class="role-alert"
        type="info"
        :closable="false"
        title="该案件需要由其他复核员完成审核"
      />
    </div>

    <template v-if="detail">
      <div class="ti-card section-card">
        <div class="section-heading"><h4>保全项与字段变更</h4><span>基准值 → 当前值 → 拟变更值 → 已应用值；拟变更值的控件与校验按该保全项的字段配置下发</span></div>
        <!-- 保全项与字段变更：整块是「随页面滚动的编辑表单区」，拟变更值列直接绑 draftValues，
             下方还有「保存字段草稿」提交动作。这类表行数由案件决定且不宜内滚，故不收编 TiTable——
             加固定表头只会让页面里多出一条嵌套滚动条。仅统一视觉语言：斑马纹、去纵向边框 -->
        <el-table :data="fieldEntryRows" stripe class="responsive-table" empty-text="本案件无字段变更">
          <el-table-column prop="itemCode" label="保全项" min-width="140" />
          <el-table-column label="变更对象" min-width="130" show-overflow-tooltip>
            <template #default="{ row }">{{ row.objectId || '保单主体' }}</template>
          </el-table-column>
          <el-table-column prop="fieldCode" label="字段" min-width="140">
            <!-- 必填标记挂在字段名左侧：与表单惯例一致，且不占用输入框的横向空间。
                 判据是「必填且**无**条件规则」——带条件规则的字段必填性由条件决定，
                 一律标必填会把配置明确豁免的字段标错（见 @/constants/maintenance）。 -->
            <template #default="{ row }">
              <span v-if="requiredOf(row)" class="field-required-mark" title="必填字段">*</span>{{ row.fieldCode }}
            </template>
          </el-table-column>
          <el-table-column prop="baseValue" label="基准值" min-width="120" show-overflow-tooltip />
          <el-table-column prop="currentValue" label="当前值" min-width="120" show-overflow-tooltip />
          <!-- 🔴 拟变更值：控件形态与校验全部由后端下发的字段规则驱动（见 @/constants/maintenance）。
               此前对全部数据类型、全部校验类型一律渲染裸 el-input，规则里的 required/allowClear/
               validationType/validationMessage 整份被丢弃 —— 配置好的「邮箱/手机号/身份证」格式要等
               提交后才由后端拒绝，用户拿不到「哪一格错了、该填成什么样」的当场反馈。 -->
          <el-table-column label="拟变更值" min-width="200">
            <template #default="{ row }">
              <div class="field-input">
                <!-- 结构化控件仅用于后端已钉死规范化格式的类型：
                     BOOLEAN 只接受 true/false，GENDER 值域固定 M|F|UNKNOWN，DATE 为 ISO yyyy-MM-dd。
                     DATETIME/INTEGER/DECIMAL 仍走文本 —— 时区偏移与 BigDecimal 精度都不是 JS 数值能
                     无损表达的，硬套选择器/数字框会产出前端表达不了的值。 -->
                <!-- BOOLEAN 只有两个取值，用分段单选而非下拉：两选项都可见，一次点击即改。
                     不为此建字典——true/false 是语言原语，不随租户变化，为它造一条字典行
                     是过度设计（字典契约禁的是页面手写**业务枚举**下拉，此处不是业务枚举）。 -->
                <div v-if="controlOf(row) === 'boolean'" class="field-input__boolean">
                  <el-radio-group
                    v-model="draftValues[changeKey(row)]"
                    size="small"
                    :disabled="isReadOnly"
                  >
                    <el-radio-button value="true">是</el-radio-button>
                    <el-radio-button value="false">否</el-radio-button>
                  </el-radio-group>
                  <!-- 单选钮点下即撤不回，误点会无路可退；可清空的字段补显式「清除」，
                       与下拉的 clearable 等价（allowClear=false 时不出现，与后端判据一致） -->
                  <el-button
                    v-if="clearableOf(row) && hasDraftValue(row)"
                    link
                    type="primary"
                    size="small"
                    :disabled="isReadOnly"
                    @click="clearDraft(row)"
                  >清除</el-button>
                </div>
                <!-- 性别字典含 ALL（不限），但后端 GENDER 校验只接受 M|F|UNKNOWN，故剔除 ALL：
                     否则界面会给出一个必然被后端拒绝的选项 -->
                <TiDictSelect
                  v-else-if="controlOf(row) === 'gender'"
                  v-model="draftValues[changeKey(row)]"
                  dict-type="GENDER"
                  size="small"
                  :exclude-values="['ALL']"
                  :disabled="isReadOnly"
                  :clearable="clearableOf(row)"
                />
                <el-date-picker
                  v-else-if="controlOf(row) === 'date'"
                  v-model="draftValues[changeKey(row)]"
                  type="date"
                  value-format="YYYY-MM-DD"
                  size="small"
                  class="field-input__control"
                  :disabled="isReadOnly"
                  :clearable="clearableOf(row)"
                  placeholder="YYYY-MM-DD"
                />
                <el-input
                  v-else
                  v-model="draftValues[changeKey(row)]"
                  size="small"
                  :disabled="isReadOnly"
                  :placeholder="placeholderOf(row)"
                />
                <!-- 错误提示贴在字段正下方（本轮「错误提示放在字段旁」）：单元格内不长驻
                     冗余信息，只在出错时占位，行高因此只在有问题的那一行变化 -->
                <p v-if="!isReadOnly && fieldErrors[changeKey(row)]" class="field-input__error">
                  {{ fieldErrors[changeKey(row)] }}
                </p>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="appliedValue" label="已应用值" min-width="120" show-overflow-tooltip />
          <!-- 🔴 冲突列：码→色彩映射见 CONFLICT_TAGS。原为 `prop="conflictStatus"` 裸渲染，
               会把枚举码直接印上屏（库内实测 22 行显示 NONE、4 行显示 RESOLVED）且无颜色。 -->
          <el-table-column label="冲突" width="90">
            <template #default="{ row }">
              <TiStatusTag
                v-if="conflictTagOf(row.conflictStatus).text"
                :value="row.conflictStatus || ''"
                :label="conflictTagOf(row.conflictStatus).text"
                :color="conflictTagOf(row.conflictStatus).type"
              />
              <span v-else>-</span>
            </template>
          </el-table-column>
          <!-- 🔴 本列按需建列（有无冲突行决定），不再按 !isReadOnly 无条件占位：
               三个按钮并排要 260px，是这张表在 1920 以下视口横滚的主因，而多数案件零冲突。
               宽度取 table.ts 的 280 档（三个 4 字按钮 + gap + 单元格内边距 ≈ 238px，260 与 280 均为
               合理值，统一收敛到档位集合内），并挂 ti-action-column 走全站操作列样式。 -->
          <el-table-column v-if="!isReadOnly && hasConflictEntryRows" label="冲突处理" width="280" class-name="ti-action-column">
            <template #default="{ row }">
              <template v-if="isConflict(row)">
                <!-- 冲突处置与状态流转同端点（operateCase），后端同判 maintenance:approve -->
                <!-- 三个按钮同排并立，故 pending 必须带动作名（actionKey），否则点「采用当前值」
                     会让「采用拟值」「重新录入」一起转圈，用户以为误触了别的字段 -->
                <el-button size="small" v-permission="'maintenance:approve'" :loading="rowPending === actionKey(changeKey(row), 'USE_CURRENT')" @click="resolveConflict(row, 'USE_CURRENT')">采用当前值</el-button>
                <el-button size="small" type="primary" v-permission="'maintenance:approve'" :loading="rowPending === actionKey(changeKey(row), 'USE_PROPOSED')" @click="resolveConflict(row, 'USE_PROPOSED')">采用拟值</el-button>
                <el-button size="small" v-permission="'maintenance:approve'" :loading="rowPending === actionKey(changeKey(row), 'REENTER')" @click="resolveConflict(row, 'REENTER')">重新录入</el-button>
              </template>
              <span v-else>-</span>
            </template>
          </el-table-column>
        </el-table>
        <!-- 字段草稿走 recordMaintenanceFieldChanges → PUT /items/{itemCode}/changes → maintenance:create -->
        <div v-if="!isReadOnly" class="section-actions">
          <!-- 错误计数与保存按钮并排：按钮保持可点（点下去会点名第一个出错的字段），
               而不是禁用后让用户自己逐格找 —— 禁用按钮说不出「为什么不能点」 -->
          <span v-if="fieldErrorCount" class="section-actions__error">还有 {{ fieldErrorCount }} 个字段待修正</span>
          <el-button type="primary" :loading="savingChanges" v-permission="'maintenance:create'" @click="saveChanges">保存字段草稿</el-button>
        </div>
      </div>

      <div class="ti-card section-card">
        <div class="section-heading"><h4>流程任务</h4><span>按冻结配置顺序执行，越序操作由服务端拒绝</span></div>
        <!-- 流程概览：把副标题那句「按冻结配置顺序执行」先给成一眼可见的结论，再往下才是可操作的明细。
             🔴 不取代下方表格 —— 领取/开始/更多三类行操作只挂在表格行上（时间轴无操作入口）。
             🔴 R10-06（用户点名 F-04）由 el-steps 改为 el-timeline。原先源码里有一条拒绝 timeline 的
                判断（「timeline 表达按时间倒序的事件流，而 6 个任务只有 3 个带 lastOperation，
                 会画出一条缺 3 个节点的轴」）。逐条复核后改判，两条理由：
                 ① 「缺节点」的前提不成立：每个任务都渲染一个 el-timeline-item，**节点由数据决定而非时间**；
                    真正会造成空缺的是空 timestamp 占位行 —— EP 在 placement="top" 下**无条件**渲染
                    该行，故用 `:hide-timestamp="!step.timestamp"` 关掉它（不是编造占位时间）。
                 ② 语义担忧（时间轴＝倒序事件流）由**排序与色源**消解：节点按 sequence 正序，节点色
                    直接取该任务的状态色（与同行表格的 TiStatusTag 同值），不渲染时间刻度。
             🔴 节点色**必须**与 TiStatusTag 的 COLOR_MAP 同值：同一状态在时间轴与表格里颜色不同，
                用户会读成两回事。两侧真值互比的守卫见 tests/maintenance-flow-timeline-contracts.test.mjs。 -->
        <el-timeline v-if="flowSteps.length" class="flow-steps">
          <el-timeline-item
            v-for="step in flowSteps"
            :key="step.key"
            :type="step.type"
            :hollow="step.hollow"
            :size="step.current ? 'large' : 'normal'"
            :timestamp="step.timestamp"
            :hide-timestamp="!step.timestamp"
            placement="top"
          >
            <div class="flow-step">
              <span class="flow-step__title">{{ step.title }}</span>
              <TiStatusTag :value="step.status" />
              <span v-if="step.operator" class="flow-step__operator">{{ step.operator }}</span>
            </div>
          </el-timeline-item>
        </el-timeline>
        <!-- 流程任务：本页唯一「行数无上限 + 带行操作」的主列表（领取/开始/更多三处动作），
             收编 TiTable 拿到固定表头与统一的失败/空态。max-height 用 lean 档——
             本页无检索区、无分页，骨架与无检索的列表页同档 -->
        <!-- 🔴 本表**有意不接** `:error`（R7-13）：它的数据来自页面同一份 `load()`，
             失败时整个案件详情都没取到，失败态归页面级（见模板末尾的 el-alert + 重试）。
             在此再接一个表级失败态会让同一次故障在屏幕上出现两处，且此处并无独立的可取数据。 -->
        <TiTable
          class="ti-table--flush responsive-table"
          :data="detail.workflowTasks"
          :max-height="'var(--ti-table-max-height-lean)'"
        >
          <el-table-column prop="sequence" label="序号" width="70" />
          <el-table-column prop="itemCode" label="保全项" min-width="150" />
          <el-table-column label="步骤" min-width="160"><template #default="{ row }">{{ maintenanceStepTypeLabel(row.stepType) }}</template></el-table-column>
          <el-table-column label="模式" width="110"><template #default="{ row }">{{ maintenanceStepModeLabel(row.mode) }}</template></el-table-column>
          <el-table-column prop="status" label="状态" width="130"><template #default="{ row }"><TiStatusTag :value="row.status" /></template></el-table-column>
          <el-table-column label="操作" width="280" fixed="right" class-name="ti-action-column">
            <template #default="{ row }">
              <!-- 平铺动作收敛为 2 个：领取与开始是任务入口且互斥；审核决策对与其余流转动作进「更多」 -->
              <!-- 🔴 本列一律用 `v-if="<业务态> && hasPermission(...)"` 而非 v-permission 指令，两条理由：
                   ① 这些按钮**自带 v-if**（isClaimable/isStartable）。指令在 mounted 里 `el.parentNode.removeChild(el)`
                      直接改真实 DOM，与 v-if 的动态挂载/卸载叠在同一个元素上时，Vue 的 vnode 树与真实 DOM 会不一致。
                   ② 「更多」下拉的子项是 el-dropdown-item，其渲染根是 Fragment ⇒ 指令拿到的 el 是片段锚点，
                      摘掉的是锚点而不是菜单项（静默失效）。故权限判在外层 el-dropdown 上，子项无需各自判。
                   两者都指向同一结论：**带 v-if 或 Fragment 根的元素，权限判在 v-if 表达式里**。 -->
              <el-button v-if="isClaimable(row) && hasPermission('maintenance:approve')" size="small" :loading="rowPending === actionKey(row.taskId, 'claim')" @click="taskAction(row, 'claim')">领取</el-button>
              <el-button v-if="isStartable(row) && hasPermission('maintenance:approve')" size="small" type="primary" :loading="rowPending === actionKey(row.taskId, 'start')" @click="taskAction(row, 'start')">开始</el-button>
              <el-dropdown
                v-if="(canReview(row) || canCompleteDataEntry(row) || isEffectReady(row) || row.status === 'FAILED') && hasPermission('maintenance:approve')"
                trigger="click"
                @command="(command: string) => runRowCommand(row, command)"
              >
                <!-- 下拉内含 5 个命令（通过/驳回/完成/生效/重试），无法把 loading 绑到具体下拉项；
                     绑在本行触发器上表示「这一行有任务动作在途」 -->
                <el-button size="small" :icon="MoreFilled" :loading="isTaskBusy(row)">更多</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-if="canReview(row)" command="reviewApprove">审核通过</el-dropdown-item>
                    <el-dropdown-item v-if="canReview(row)" command="reviewReject" class="ti-dropdown-item--danger">审核拒绝</el-dropdown-item>
                    <el-dropdown-item v-if="canCompleteDataEntry(row)" command="complete">完成</el-dropdown-item>
                    <el-dropdown-item v-if="isEffectReady(row)" command="effect">立即生效</el-dropdown-item>
                    <el-dropdown-item v-if="row.status === 'FAILED'" command="retry">重试</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </template>
          </el-table-column>
        </TiTable>
      </div>

      <div class="two-column">
        <div class="ti-card section-card">
          <div class="section-heading"><h4>配置与 Offering 快照</h4></div>
          <el-table :data="detail.items" stripe size="small" empty-text="暂无保全项">
            <el-table-column prop="itemCode" label="保全项" min-width="150" />
            <el-table-column prop="configurationVersion" label="配置版本" width="110" />
            <el-table-column prop="configurationContentHash" label="配置哈希" min-width="180" show-overflow-tooltip />
            <el-table-column prop="offeringVersion" label="Offering 版本" width="120" />
          </el-table>
        </div>
        <div class="ti-card section-card">
          <div class="section-heading"><h4>生效计划与回执</h4><span>{{ detail.effectStatus || '-' }}</span></div>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="计划状态">{{ detail.effectSchedule?.status || '-' }}</el-descriptions-item>
            <el-descriptions-item label="下次执行">{{ formatScheduleTime(detail.effectSchedule?.nextExecutionAt) }}</el-descriptions-item>
            <el-descriptions-item label="尝试次数">{{ detail.effectSchedule?.attemptCount ?? 0 }}</el-descriptions-item>
            <el-descriptions-item label="最后尝试">{{ formatScheduleTime(detail.effectSchedule?.lastAttemptAt) }}</el-descriptions-item>
            <el-descriptions-item v-if="detail.effectSchedule?.lastErrorCode" label="失败码">{{ detail.effectSchedule.lastErrorCode }}</el-descriptions-item>
            <el-descriptions-item v-if="detail.effectSchedule?.lastErrorMessage" label="失败原因">{{ detail.effectSchedule.lastErrorMessage }}</el-descriptions-item>
            <el-descriptions-item label="回执版本">{{ detail.workflowTasks.find((task) => task.effectEvidence?.application)?.effectEvidence?.application?.actualPolicyVersion || '-' }}</el-descriptions-item>
            <el-descriptions-item label="回执哈希"><span class="hash-text">{{ detail.workflowTasks.find((task) => task.effectEvidence?.application)?.effectEvidence?.application?.applicationHash || '-' }}</span></el-descriptions-item>
          </el-descriptions>
        </div>
      </div>

      <div v-if="financialTasks.length" class="ti-card section-card">
        <div class="section-heading"><h4>保全收退费与资金凭证</h4><span>报价 → Billing 入账 → Payment 收退费</span></div>
        <div v-for="task in financialTasks" :key="task.taskId" class="financial-evidence">
          <el-descriptions :column="detailColumns" border>
            <el-descriptions-item label="保全项">{{ task.itemCode }}</el-descriptions-item>
            <el-descriptions-item label="收退费">{{ formatAmount(task.premiumQuoteEvidence?.amount, task.premiumQuoteEvidence?.currency) }} · {{ task.premiumQuoteEvidence?.direction || '-' }}</el-descriptions-item>
            <el-descriptions-item label="报价版本">{{ task.premiumQuoteEvidence?.quoteVersion || task.premiumQuoteEvidence?.pricingPlanVersion || '-' }}</el-descriptions-item>
            <el-descriptions-item label="计算明细" :span="detailColumns">{{ task.premiumQuoteEvidence?.detailSummary || '-' }}</el-descriptions-item>
            <el-descriptions-item label="Billing 状态">{{ task.billingPostingEvidence?.status || '-' }}</el-descriptions-item>
            <el-descriptions-item label="Billing 单号"><span class="hash-text">{{ task.billingPostingEvidence?.postingId || '-' }}</span></el-descriptions-item>
            <el-descriptions-item label="Payment 状态">{{ task.fundSettlementEvidence?.type || '-' }} / {{ task.fundSettlementEvidence?.status || task.fundSettlementEvidence?.externalStatus || '-' }}</el-descriptions-item>
            <el-descriptions-item label="Payment 单号"><span class="hash-text">{{ task.fundSettlementEvidence?.orderId || task.fundSettlementEvidence?.instructionId || '-' }}</span></el-descriptions-item>
          </el-descriptions>
        </div>
      </div>

      <div class="ti-card section-card">
        <div class="section-heading"><h4>追溯、冲突与撤销</h4></div>
        <el-descriptions :column="detailColumns" border>
          <el-descriptions-item label="追溯影响">{{ detail.retroactiveImpactAnalysis?.status || '未发起' }} / {{ detail.retroactiveImpactAnalysis?.itemCount ?? 0 }} 项</el-descriptions-item>
          <el-descriptions-item label="追溯期间重算">{{ detail.retroactivePeriodRecalculation?.status || '未发起' }}</el-descriptions-item>
          <el-descriptions-item label="冲突字段">{{ conflictCount }}</el-descriptions-item>
          <el-descriptions-item label="快照引用">{{ snapshotCount }} 份</el-descriptions-item>
        </el-descriptions>
        <div v-if="!isReadOnly" class="section-actions">
          <!-- 刷新冲突/暂停/恢复/立即执行都走 operateCase，后端同判 maintenance:approve -->
          <el-button v-permission="'maintenance:approve'" :loading="rowPending === 'conflict-refresh'" @click="refreshConflicts">刷新冲突</el-button>
          <template v-if="detail.effectSchedule?.scheduleId">
            <!-- 这三个按钮自带 v-if，故同任务动作列：权限判在 v-if 表达式里（不用指令）。
                 三者互斥（同一状态只有一个可见），但仍带动作名——见下方 scheduleAction 注释 -->
            <el-button v-if="detail.effectSchedule.status === 'ACTIVE' && hasPermission('maintenance:approve')" type="warning" :loading="rowPending === actionKey('schedule', 'pause')" @click="scheduleAction('pause')">暂停生效计划</el-button>
            <el-button v-if="['PAUSED', 'FAILED'].includes(detail.effectSchedule.status || '') && hasPermission('maintenance:approve')" type="primary" :loading="rowPending === actionKey('schedule', 'resume')" @click="scheduleAction('resume')">恢复生效计划</el-button>
            <el-button v-if="canExecuteScheduleNow && hasPermission('maintenance:approve')" type="success" :loading="rowPending === actionKey('schedule', 'execute-now')" @click="scheduleAction('execute-now')">立即执行生效计划</el-button>
          </template>
        </div>
      </div>
    </template>
    <!-- 🔴 失败态必须先于「未找到案件」判定（R7-13）：接口挂掉时 detail 同样为 null，
         若只按 detail 判空，界面会断言「这个案件不存在」—— 而真相是这次没查成。
         此处用页面级失败态（el-alert + 重试），与 dashboard/system-config 同一范式；
         表级失败态才走 TiTable 的 :error。 -->
    <el-alert
      v-else-if="tableError"
      class="load-error"
      type="error"
      show-icon
      :closable="false"
      :title="`案件加载失败：${tableError.message}`"
    >
      <el-button text type="primary" size="small" @click="load">重试</el-button>
    </el-alert>
    <el-empty v-else-if="!loading" description="未找到案件" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, MoreFilled } from '@element-plus/icons-vue'
import {
  getMaintenanceConfiguration,
  getMaintenanceCaseDetail,
  operateMaintenanceCase,
  operateMaintenanceTask,
  recordMaintenanceFieldChanges,
} from '@/api/maintenance'
import { getPolicyBeneficiaries } from '@/api/policy'
import type { PolicyBeneficiaryVO } from '@/api/policy'
import type {
  MaintenanceCaseDetail,
  MaintenanceConfigurationFieldRule,
  MaintenanceFieldChange,
  MaintenanceWorkflowTask,
} from '@/api/maintenance'
import TiDetailHeader from '@/components/TiDetailHeader/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiTable from '@/components/TiTable/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import {
  fieldControlKind,
  fieldPlaceholder,
  fieldValueError,
} from '@/constants/maintenance'
import { useUserStore } from '@/stores/user'
import { formatDateTime, formatDateTimeInZone } from '@/utils/date'
import { formatAmount } from '@/utils/format'
import { useDict } from '@/composables/useDict'
import { useDetailColumns } from '@/composables/useDetailColumns'
import { usePermission } from '@/composables/usePermission'
import { useRowAction, actionKey } from '@/composables/useRowAction'
import { useTableError } from '@/composables/useTable'

const route = useRoute()
const userStore = useUserStore()
/**
 * 权限判据的来源：本页所有写操作都打 admin 的 proxy 端点，
 * `MaintenanceCaseProxyController` 上逐个方法标了 `@PreAuthorize`，那是唯一的权威：
 *   · `POST /cases/{caseId}/tasks/{taskId}/{action}`（operateTask）  → maintenance:approve
 *   · `POST /cases/{caseId}/{action}`（operateCase，含冲突处置与生效计划）→ maintenance:approve
 *   · `PUT  /cases/{caseId}/items/{itemCode}/changes`（字段草稿）    → maintenance:create
 * 即：领取/开始/审核通过/审核拒绝/完成/立即生效/重试/采用当前值/采用拟值/重新录入/刷新冲突/
 *     暂停生效计划/恢复生效计划/立即执行生效计划 —— 共用 maintenance:approve；
 *     保存字段草稿走 maintenance:create（与「创建保全」同码）。
 * ⚠️ 不要按按钮文案猜码：`maintenance:approve` 的中文名是「审核保全」，
 *    但后端把**全部状态流转**都挂在这一个码上，前端必须跟后端一致而非跟字面语义一致。
 */
const { hasPermission } = usePermission()
const { getLabel: maintenanceCaseStatusLabel } = useDict('MAINTENANCE_CASE_STATUS')
const { getLabel: maintenanceChannelDictLabel } = useDict('MAINTENANCE_CHANNEL')
const { getLabel: maintenanceEffectiveTypeDictLabel } = useDict('MAINTENANCE_EFFECTIVE_TIME_TYPE')
// 流程任务的「步骤」「模式」两列原先裸渲染英文码（CREATE / DATA_ENTRY / REQUIRED / SKIPPED），
// 而这两个字典在保全项配置编辑器里早已被消费（同一份 t_dict_data）。此处补齐本地化。
const { getLabel: maintenanceStepTypeLabel } = useDict('MAINTENANCE_STEP_TYPE')
const { getLabel: maintenanceStepModeLabel } = useDict('MAINTENANCE_STEP_MODE')
const maintenanceChannelLabel = (value?: string) => value ? maintenanceChannelDictLabel(value) : '-'
const maintenanceEffectiveTypeLabel = (value?: string) => value ? maintenanceEffectiveTypeDictLabel(value) : '-'
const loading = ref(false)
// 页面级失败态：接口挂了不得渲染成「未找到案件」（🔴 R7-13）
const { tableError, clearTableError, setTableError } = useTableError()
const savingChanges = ref(false)
/**
 * 「冲突处理 / 生效计划」两族动作的在途行键（与 `useRowAction` 共用同一套 key 约定）。
 *
 * 🔴 原先这两族共 7 个按钮（采用当前值/采用拟值/重新录入 × 刷新冲突/暂停/恢复/立即执行）
 * 全部没有 pending 绑定：点下去界面纹丝不动，而这几个动作都走 `operateCase`
 * ——**保全案件的状态推进**，重复提交的代价是双份字段变更。接口慢时用户必然再点一次。
 * 与同页 `saveChanges`（有 `savingChanges` + finally）形成同页两套标准。
 *
 * key 用 `actionKey(changeKey(field), action)`：冲突行按「字段」区分，
 * 生效计划按固定前缀 `'schedule'` 区分，两者都不会互相点亮。
 *
 * 🔴 传的是 `() => refreshAfterMutation()` 而非直接传函数引用：`refreshAfterMutation`
 * 在下方才以 `const` 箭头函数定义，`const` **没有提升**，此处直接引用会在 setup 执行到本行时
 * 抛 "Cannot access before initialization"。包一层 thunk 把取值推迟到动作成功之后。
 */
const { rowPending, run } = useRowAction(() => refreshAfterMutation())

/**
 * 该**任务行**是否有动作在途。
 *
 * 任务动作族（领取/开始/通过/驳回/完成/生效/重试）的键是 `taskId:动作名`，
 * 而冲突处理族的键是 `itemCode:objectId:fieldCode:动作名`——两族的键前缀不同，
 * 故本判据只对任务行生效，不会把冲突行的在途状态误判到任务行上。
 */
const isTaskBusy = (row: unknown) =>
  rowPending.value !== null && String(rowPending.value).split(':')[0] === (row as MaintenanceWorkflowTask).taskId
const detail = ref<MaintenanceCaseDetail>()
const draftValues = reactive<Record<string, string>>({})
const fieldRulesByItem = ref<Record<string, MaintenanceConfigurationFieldRule[]>>({})
const beneficiaryObjectsByItem = ref<Record<string, PolicyBeneficiaryVO[]>>({})
/** 保全信息面板：字段中长（说明/计算明细已用 :span 独占整行），宽屏 3 档。
 *  🔴 此前写的是 window.innerWidth < 768 —— 与断点同量级（移动档上界），但 window.innerWidth **不是
 *  响应式来源**，包在 computed 里也不会随窗口缩放重算；改走 useMediaQuery 才真的会降为 1 列。 */
const detailColumns = useDetailColumns(3)

const snapshotCount = computed(() => Object.values(detail.value?.snapshots || {}).filter(Boolean).length)
const isReadOnly = computed(() => ['COMPLETED', 'REJECTED', 'WITHDRAWN'].includes(detail.value?.status || ''))
const conflictCount = computed(() => detail.value?.fieldChanges.filter(isConflict).length || 0)
/**
 * 「冲突处理」列的存在性判据：**表内确实有冲突行才建列**。
 * <p>该列固定 min-width 260px（三个按钮「采用当前值/采用拟值/重新录入」并排的下限），
 * 而绝大多数案件一个冲突都没有 —— 此前它按 `!isReadOnly` 无条件占位，把字段变更表的总宽
 * 从 1230 顶到 1490，是这张表在 1920 以下视口必然横滚的主因。</p>
 * <p>判据取自 `fieldEntryRows` 而非 `conflictCount`：后者的分母是 `detail.fieldChanges`，
 * 含被字段配置判为不可见/不可编辑的行——那些行根本不进表，会造出「列在、整列全是 '-'」的浪费。</p>
 */
const hasConflictEntryRows = computed(() => fieldEntryRows.value.some(isConflict))
/**
 * 流程任务概览（`el-timeline`）。
 *
 * <p>形态由 R10-06 从 `el-steps` 改为 `el-timeline`（用户 R9-F04 点名）。原判断与其复核见模板注释。</p>
 *
 * <p>🔴 概览带**不取代**下方表格：领取/开始/更多三类行操作只在表格里，时间轴不挂操作入口。</p>
 *
 * <p>时间「有则显示」：案件级没有审计事件源（`MaintenanceCaseDetail` 只有
 * createdAt/updatedAt/createdBy/updatedBy，无 audits/history 数组），时间与操作人只能取自
 * 该任务自身的 `lastOperation`。实测 seq 1 CREATE、4 FEE_SETTLEMENT(SKIPPED)、6 COMPLETE
 * 恒为空 —— 空就 `hide-timestamp` 关掉那一行，不用占位符编造一个不存在的时间。</p>
 */
/**
 * 任务状态 → el-timeline 节点色（🔴 必须与 `TiStatusTag` 的 `COLOR_MAP` **同值**）。
 *
 * <p>同一个状态在时间轴上是一种颜色、在下方表格里是另一种颜色，用户会把一个状态读成两回事。
 * 全仓状态色的唯一真源是 `TiStatusTag` 的 `COLOR_MAP`，此处只是它在本页的**投影**：键集合
 * 取后端 `MaintenanceWorkflowTaskStatus` 的**全量 10 码**（🔴 初稿只写了 5 码，剩下的靠
 * `?? 'info'` 兜底 —— 那会让 PENDING / WAITING_CONDITION / WAITING_EXTERNAL / QUOTED 在
 * 时间轴上是灰的、在表格里是橙的，REJECTED 灰 vs 红，正是本任务要消灭的那种不一致）。
 * 三处真值互比（后端枚举 ⊇ 本表键集合、本表取值 ≡ COLOR_MAP）见
 * `tests/maintenance-flow-timeline-contracts.test.mjs` —— 只写死一份清单再断言自己等于
 * 自己，两侧同时改坏也照样绿。</p>
 *
 * <p>`hollow`（空心节点）表达「这一步还没走到」：EP 的 `el-timeline-item` 上，空心比「已跳过」
 * 的灰实心更弱，这是时间轴专有的语汇，`el-steps` 表达不出来。当前推进到的那一步用
 * `size="large"` 放大节点 —— 原实现靠父级 `:active` 推导，还必须提防「显式传 wait 会压掉
 * 当前步」（旧注释记的那处真机缺陷）；现在每项各自取色，那条陷阱从根上不存在了。</p>
 */
/** `el-timeline-item` 的节点色档位（与 `el-tag` 的 `type` 同域，故取值与 COLOR_MAP 一致） */
type NodeType = 'primary' | 'success' | 'warning' | 'info' | 'danger'
const TASK_NODE_TYPE: Record<string, NodeType> = {
  // ---- 流转中（橙）：还需有人或有外部系统推它 ----
  PENDING: 'warning',
  READY: 'warning',
  WAITING_CONDITION: 'warning',
  IN_PROGRESS: 'warning',
  WAITING_EXTERNAL: 'warning',
  QUOTED: 'warning',
  // ---- 已有结果 ----
  COMPLETED: 'success',
  REJECTED: 'danger',
  FAILED: 'danger',
  SKIPPED: 'info',
}
/**
 * 尚未有结果的任务 ⇒ 空心节点。
 *
 * <p>判据直接取**色族**而不另立一份状态清单：`warning` 这一族在 `COLOR_MAP` 里的分组含义
 * 就是「流转中：还需有人或有外部系统推它」，正好等于「这一步还没走到」。两处清单必然漂移，
 * 而这里根本不需要第二份清单 —— 一旦某码被重新归色，节点的实心/空心会自动跟着走。</p>
 */
const isPendingStep = (status: string) => TASK_NODE_TYPE[status] === 'warning'
/** 当前推进到第几步：首个未完成任务的下标；全部完成时取步数（此时没有任何节点被放大） */
const activeFlowStep = computed(() => {
  const tasks = detail.value?.workflowTasks || []
  const index = tasks.findIndex((task) => !['COMPLETED', 'SKIPPED'].includes(task.status))
  return index === -1 ? tasks.length : index
})

const flowSteps = computed(() => (detail.value?.workflowTasks || []).map((task, index) => ({
  key: task.taskId,
  title: `${task.sequence}. ${maintenanceStepTypeLabel(task.stepType)}`,
  /** 原始状态码：交给 TiStatusTag 取色与取文案（保证与表格同源） */
  status: task.status,
  type: TASK_NODE_TYPE[task.status] ?? 'info',
  hollow: isPendingStep(task.status),
  current: index === activeFlowStep.value,
  timestamp: task.lastOperation?.operatedAt ? formatDateTime(task.lastOperation.operatedAt) : '',
  operator: task.lastOperation?.operatedBy || '',
})))
const financialTasks = computed(() => detail.value?.workflowTasks.filter((task) =>
  task.premiumQuoteEvidence || task.billingPostingEvidence || task.fundSettlementEvidence) || [])
const hasCreatorOwnedReview = computed(() => detail.value?.createdBy === userStore.userInfo?.id
  && detail.value?.workflowTasks.some((task) => isReview(task) && ['READY', 'IN_PROGRESS'].includes(task.status)))
const canExecuteScheduleNow = computed(() => {
  const schedule = detail.value?.effectSchedule
  if (!schedule?.scheduleId || schedule.status !== 'ACTIVE' || !schedule.nextExecutionAt) return false
  return new Date(`${schedule.nextExecutionAt}Z`).getTime() <= Date.now()
})
const isBeneficiaryField = (fieldCode: string) => fieldCode.startsWith('policy.beneficiary.')
const beneficiaryValue = (beneficiary: PolicyBeneficiaryVO, fieldCode: string) => {
  if (fieldCode === 'policy.beneficiary.name') return beneficiary.beneficiaryName
  if (fieldCode === 'policy.beneficiary.relationship') return beneficiary.beneficiaryType
  if (fieldCode === 'policy.beneficiary.share') return beneficiary.shareRatio?.toString()
  return undefined
}
/**
 * 字段录入行。
 *
 * <p>在字段变更之上挂一份**该字段的配置规则**（`visible && editable` 已由上一步过滤）——
 * 后端随案件详情下发的 `fieldRules` 里已有 `required / allowClear / validationType /
 * validationPattern / validationMessage / conditionRuleCode`，此前整份被丢弃，只留了
 * `expectedValueType` 当 `dataType`，于是所有字段都退化成一个无校验、无必填提示的裸文本框，
 * 配置好的格式规则要等提交后才由后端拒绝。</p>
 *
 * <p>`rule` 为空表示这一行是**已保存的字段变更**（见 `fieldEntryRows` 注释）。</p>
 */
type FieldEntryRow = MaintenanceFieldChange & { rule?: MaintenanceConfigurationFieldRule }

const fieldEntryRows = computed<FieldEntryRow[]>(() => {
  if (!detail.value) return []
  const savedItems = new Set(detail.value.fieldChanges.map((field) => field.itemCode))
  const unsavedRows = detail.value.items
    .filter((item) => !savedItems.has(item.itemCode))
    .flatMap((item) => {
      const rules = (fieldRulesByItem.value[item.itemCode] || [])
        .filter((rule) => rule.visible && rule.editable)
      const scalarRows = rules
        .filter((rule) => !isBeneficiaryField(rule.fieldCode))
        .map((rule) => ({
          itemCode: item.itemCode,
          fieldCode: rule.fieldCode,
          dataType: rule.expectedValueType || 'TEXT',
          rule,
        }))
      const beneficiaryRows = (beneficiaryObjectsByItem.value[item.itemCode] || [])
        .flatMap((beneficiary) => rules
          .filter((rule) => isBeneficiaryField(rule.fieldCode))
          .map((rule) => {
            const currentValue = beneficiaryValue(beneficiary, rule.fieldCode)
            return {
              itemCode: item.itemCode,
              objectId: beneficiary.beneficiaryId,
              fieldCode: rule.fieldCode,
              dataType: rule.expectedValueType || 'TEXT',
              baseValue: currentValue,
              currentValue,
              rule,
            }
          }))
      return [...scalarRows, ...beneficiaryRows]
    })
  // 已保存的字段变更不带 rule：其值在「记录变更」时已由后端逐条校验（含条件规则与字段目录
  // 可清空性），本页只负责呈现与冲突处置，不再重复判定——重复判定会在规则事后变更时
  // 把历史数据判成「不合规」，而它们早已生效。
  return [...detail.value.fieldChanges, ...unsavedRows]
})
const caseId = String(route.params.id)

const formatCaseEffectiveTime = () => {
  if (!detail.value) return '-'
  if (detail.value.specificEffectiveDate) return formatDateTime(detail.value.specificEffectiveDate)
  if (detail.value.effectiveTimeType === 'IMMEDIATE') return '立即生效'
  return formatDateTime(detail.value.businessEffectiveAt)
}
const formatScheduleTime = (value?: string) => {
  if (!value) return '-'
  const zoneId = detail.value?.effectSchedule?.tenantZoneId || 'Asia/Shanghai'
  const parsed = new Date(value.endsWith('Z') ? value : `${value}Z`)
  if (Number.isNaN(parsed.getTime())) return formatDateTime(value)
  return formatDateTimeInZone(parsed, zoneId)
}
const changeKey = (rawRow: unknown) => {
  const row = rawRow as MaintenanceFieldChange
  return `${row.itemCode}:${row.objectId}:${row.fieldCode}`
}

/**
 * 逐字段实时校验结果（键与草稿值、草稿提交同用 `changeKey`）。
 *
 * <p>校验口径全部来自后端下发的字段规则，见 `@/constants/maintenance`：那里与
 * `MaintenanceFieldRule` 逐条对齐（内置正则逐字抄、必填排除条件规则、先判不许清空）。
 * 前端提前报错只为「当场说清哪里不对」，**不替代后端判定**。</p>
 */
const fieldErrors = computed<Record<string, string>>(() => {
  const errors: Record<string, string> = {}
  for (const row of fieldEntryRows.value) {
    const error = fieldValueError(row.rule, draftValues[changeKey(row)])
    if (error) errors[changeKey(row)] = error
  }
  return errors
})
const fieldErrorCount = computed(() => Object.keys(fieldErrors.value).length)
/** 首个出错字段：保存被拦时点名到具体字段，比「有 3 个字段不合规」可执行得多 */
const firstFieldError = computed(() => {
  for (const row of fieldEntryRows.value) {
    const error = fieldErrors.value[changeKey(row)]
    if (error) return { fieldCode: row.fieldCode, error }
  }
  return null
})
/** 行控件形态：已保存行无规则 ⇒ 文本 */
const controlOf = (rawRow: unknown) => {
  const { rule } = rawRow as FieldEntryRow
  return rule ? fieldControlKind(rule.expectedValueType, rule.validationType) : 'text'
}
/** 「不允许清空」为真时才关掉清除入口；未声明（含已保存行）按可清空处理 */
const clearableOf = (rawRow: unknown) => (rawRow as FieldEntryRow).rule?.allowClear !== false
/** 该行是否已录入待提交的值（决定要不要显示「清除」——空着时显示只会是噪音） */
const hasDraftValue = (rawRow: unknown) => {
  const value = draftValues[changeKey(rawRow)]
  return value !== undefined && value !== null && value !== ''
}
/** 清空单行草稿。结构化控件（单选/日期）自带清除入口缺失，靠此补齐 allowClear 语义 */
const clearDraft = (rawRow: unknown) => {
  delete draftValues[changeKey(rawRow)]
}
/** 无条件规则且明细未被抹除的必填字段才标「必填」（带条件规则的必填性由条件决定，标了会误导；
 *  明细被抹除时 conditionRuleCode 同为 null，无法与「无条件规则」区分，故一并让路） */
const requiredOf = (rawRow: unknown) => {
  const { rule } = rawRow as FieldEntryRow
  return !!rule?.required && !rule.conditionRuleCode && !rule.detailsRedacted
}
const placeholderOf = (rawRow: unknown) => {
  const row = rawRow as FieldEntryRow
  return row.rule ? fieldPlaceholder(row.rule) : (row.proposedValue || '请输入')
}
const isReview = (rawRow: unknown) => (rawRow as MaintenanceWorkflowTask).stepType.toUpperCase().includes('REVIEW')
const isDataEntry = (rawRow: unknown) => ['DATA_ENTRY', 'VALIDATION'].includes((rawRow as MaintenanceWorkflowTask).stepType)
const isAssignedToCurrentUser = (rawRow: unknown) => {
  const task = rawRow as MaintenanceWorkflowTask
  return task.assignment?.assignee === userStore.userInfo?.id
}
const isOwnedInProgress = (rawRow: unknown) => (rawRow as MaintenanceWorkflowTask).status === 'IN_PROGRESS'
  && isAssignedToCurrentUser(rawRow)
const canReview = (row: unknown) => isOwnedInProgress(row) && isReview(row)
  && detail.value?.createdBy !== userStore.userInfo?.id
const canCompleteDataEntry = (rawRow: unknown) => isOwnedInProgress(rawRow) && isDataEntry(rawRow)
  && fieldEntryRows.value.some((field) => field.itemCode === (rawRow as MaintenanceWorkflowTask).itemCode)
// 值域取后端枚举 MaintenanceFieldConflictStatus（NONE/DETECTED/RESOLVED）——原实现多收了一个
// 'CONFLICT'：该字面量在保全域后端**不存在**（全仓 CONFLICT 只用于 HTTP 状态语义），
// 属凭字面相似臆造的码，永远不成立却让谓词看起来比真实值域宽。
const isConflict = (rawRow: unknown) => (rawRow as MaintenanceFieldChange).conflictStatus === 'DETECTED'

/**
 * 「冲突」列的展示口径：码 → { 文案, 语义色 }。
 *
 * <p>🔴 此前该列是 `<el-table-column prop="conflictStatus">` **裸渲染**，把枚举码直接印上屏——
 * 库内实测 22 行显示 `NONE`、4 行显示 `RESOLVED`，且无任何颜色，正是用户点名的那类缺陷。
 * 这三个码**不进** `TiStatusTag` 内置兜底表：`NONE`/`RESOLVED` 是跨域通用词（不同字典里含义
 * 不同，收进全局表会在别处说错话），故按该组件注释给出的口径（语义有分野的码由页面覆盖）
 * 在页面内定义。文案逐字取自枚举自带的中文 name，不另行措辞。</p>
 *
 * <p>🔴 `NONE` 渲染为「-」而非灰色标签：它是**状态的缺席**而不是一种状态，且库内 22/26 行
 * 都是它——逐行挂灰标签只会把真正需要看的红标签稀释掉。同表「冲突处理」列对非冲突行
 * 同样用「-」，两列口径一致。未保存的草稿行没有 `conflictStatus`，也落到「-」。</p>
 */
const CONFLICT_TAGS: Record<string, { text: string; type: 'danger' | 'success' }> = {
  DETECTED: { text: '待解决', type: 'danger' },
  RESOLVED: { text: '已解决', type: 'success' },
}
/** 无冲突/未保存行共用的空描述，避免每次渲染新分配对象 */
const NO_CONFLICT_TAG = { text: '', type: '' } as const
const conflictTagOf = (status?: string) => (status && CONFLICT_TAGS[status]) || NO_CONFLICT_TAG
const isEffect = (rawRow: unknown) => (rawRow as MaintenanceWorkflowTask).stepType === 'EFFECT'
const isCreatorReviewTask = (rawRow: unknown) => isReview(rawRow)
  && detail.value?.createdBy === userStore.userInfo?.id
const isClaimable = (rawRow: unknown) => {
  const task = rawRow as MaintenanceWorkflowTask
  return task.status === 'READY' && !task.assignment && !isEffect(task)
    && task.stepType !== 'COMPLETE' && !isCreatorReviewTask(task)
}
const isStartable = (rawRow: unknown) => {
  const task = rawRow as MaintenanceWorkflowTask
  return task.status === 'READY' && isAssignedToCurrentUser(task)
    && !isEffect(task) && !isCreatorReviewTask(task)
}
const isEffectReady = (rawRow: unknown) => isEffect(rawRow)
  && (rawRow as MaintenanceWorkflowTask).status === 'READY'
const operationId = () => `manual-${Date.now()}`
const waitForProjection = () => new Promise((resolve) => window.setTimeout(resolve, 300))

const loadFieldRules = async (caseDetail: MaintenanceCaseDetail) => {
  const missingItems = caseDetail.items.filter((item) => item.configurationId && !fieldRulesByItem.value[item.itemCode])
  const configurations = await Promise.all(missingItems.map((item) => getMaintenanceConfiguration(item.configurationId!)))
  missingItems.forEach((item, index) => {
    fieldRulesByItem.value[item.itemCode] = configurations[index].definition?.fieldRules || []
  })
}

const loadBeneficiaryObjects = async (caseDetail: MaintenanceCaseDetail) => {
  const beneficiaryItems = caseDetail.items.filter((item) =>
    (fieldRulesByItem.value[item.itemCode] || []).some((rule) => isBeneficiaryField(rule.fieldCode)),
  )
  if (!beneficiaryItems.length || caseDetail.fieldChanges.some((field) => isBeneficiaryField(field.fieldCode))) return
  const beneficiaries = await getPolicyBeneficiaries(caseDetail.policyId)
  const editableBeneficiaries = beneficiaries.filter((beneficiary) => beneficiary.beneficiaryId)
  const contexts = editableBeneficiaries.length ? editableBeneficiaries : [{
    beneficiaryId: globalThis.crypto.randomUUID().replaceAll('-', ''),
  }]
  beneficiaryItems.forEach((item) => { beneficiaryObjectsByItem.value[item.itemCode] = contexts })
}

const load = async () => {
  loading.value = true
  try {
    detail.value = await getMaintenanceCaseDetail(caseId)
    await loadFieldRules(detail.value)
    await loadBeneficiaryObjects(detail.value)
    fieldEntryRows.value.forEach((row) => {
      draftValues[changeKey(row)] = row.proposedValue
        || draftValues[changeKey(row)]
        || row.currentValue
        || ''
    })
    clearTableError()
  } catch (err) {
    // 失败必须清掉 detail：留着上一个案件的数据会让用户以为这就是本次结果（比空白更危险）
    detail.value = undefined
    setTableError(err)
  } finally { loading.value = false }
}

const refreshAfterMutation = async () => {
  await waitForProjection()
  await load()
}

const taskAction = async (rawTask: unknown, action: string) => {
  const task = rawTask as MaintenanceWorkflowTask
  const body: Record<string, unknown> = { operationId: operationId() }
  if (action === 'complete') Object.assign(body, { resultCode: 'PASS', reason: '后台操作完成' })
  if (action === 'retry') body.reason = '后台人工重试'
  await run(actionKey(task.taskId, action), async () => {
    await operateMaintenanceTask(caseId, task.taskId, action, body)
    ElMessage.success('任务操作成功')
  })
}

const review = async (rawTask: unknown, decision: string) => {
  const task = rawTask as MaintenanceWorkflowTask
  let result: { value: string }
  try {
    result = await ElMessageBox.prompt('请输入审核意见', '人工审核', { inputValue: decision === 'APPROVE' ? '审核通过' : '', inputType: 'textarea' })
  } catch {
    return // 用户取消：prompt 以 reject 表达取消
  }
  await run(actionKey(task.taskId, decision), async () => {
    await operateMaintenanceTask(caseId, task.taskId, 'review-decision', {
      operationId: operationId(), decision, policyVersion: task.reviewEvidence?.policyVersion || '1', comment: result.value,
    })
    ElMessage.success('审核意见已提交')
  })
}

const applyEffect = async (rawTask: unknown) => {
  const task = rawTask as MaintenanceWorkflowTask
  await run(actionKey(task.taskId, 'effect'), async () => {
    await operateMaintenanceTask(caseId, task.taskId, 'effect', { operationId: operationId() })
    ElMessage.success('保全已生效')
  })
}

/** 操作列「更多」下拉派发：命令值即动作语义，与下拉项 command 一一对应 */
const runRowCommand = (row: unknown, command: string) => {
  const handlers: Record<string, (target: unknown) => void> = {
    reviewApprove: (target) => review(target, 'APPROVE'),
    reviewReject: (target) => review(target, 'REJECT'),
    complete: (target) => taskAction(target, 'complete'),
    effect: (target) => applyEffect(target),
    retry: (target) => taskAction(target, 'retry'),
  }
  handlers[command]?.(row)
}

const saveChanges = async () => {
  if (!detail.value) return
  // 🔴 校验前置到 pending 置位之前：不满足直接 return，无需再把按钮从 loading 态手动复位。
  //    这里拦的是**前端已能判定**的错（必填缺失、不允许清空、格式不符），全部来自后端下发的
  //    字段规则；拦下来是为了当场说明白，而不是省掉后端那次校验。
  if (fieldErrorCount.value) {
    const first = firstFieldError.value
    ElMessage.warning(`还有 ${fieldErrorCount.value} 个字段不符合配置要求，如「${first?.fieldCode}」：${first?.error}`)
    return
  }
  savingChanges.value = true
  try {
    const groups = new Map<string, Array<Record<string, unknown>>>()
    fieldEntryRows.value.forEach((row) => {
      const list = groups.get(row.itemCode) || []
      list.push({ objectId: row.objectId || null, fieldCode: row.fieldCode, dataType: row.dataType || 'TEXT', canonicalValue: draftValues[changeKey(row)] || null })
      groups.set(row.itemCode, list)
    })
    for (const [itemCode, proposals] of groups) await recordMaintenanceFieldChanges(caseId, itemCode, proposals)
    ElMessage.success('字段草稿已保存')
    await refreshAfterMutation()
  } finally { savingChanges.value = false }
}

const refreshConflicts = async () => {
  await run('conflict-refresh', async () => {
    await operateMaintenanceCase(caseId, 'field-conflicts/refresh', { operationId: operationId() })
    ElMessage.success('冲突状态已刷新')
  })
}

const resolveConflict = async (rawField: unknown, action: 'USE_CURRENT' | 'USE_PROPOSED' | 'REENTER') => {
  const field = rawField as MaintenanceFieldChange
  // 键取「冲突字段」本身（itemCode:objectId:fieldCode，与草稿值的键同一套），
  // 于是「A 字段正在处理」不会点亮 B 字段的按钮
  const key = actionKey(changeKey(field), action)
  let canonicalValue: string | undefined
  if (action === 'REENTER') {
    try {
      const result = await ElMessageBox.prompt('请输入新的字段值', '重新录入冲突字段', {
        inputValue: draftValues[changeKey(field)] || field.proposedValue || '',
      })
      canonicalValue = result.value
    } catch {
      return // 用户取消：prompt 以 reject 表达取消
    }
  }
  await run(key, async () => {
    await operateMaintenanceCase(caseId, 'field-conflicts/resolve', {
      operationId: operationId(),
      itemCode: field.itemCode,
      objectId: field.objectId || detail.value?.policyId,
      fieldCode: field.fieldCode,
      action,
      ...(action === 'REENTER' ? { dataType: field.dataType || 'TEXT', canonicalValue } : {}),
      reason: '后台操作员解决字段冲突',
    })
    ElMessage.success('冲突字段已处理')
  })
}

const scheduleAction = async (action: 'pause' | 'resume' | 'execute-now') => {
  let reason = '后台操作员提前执行'
  if (action !== 'execute-now') {
    try {
      const result = await ElMessageBox.prompt(
        action === 'pause' ? '请输入暂停原因' : '请输入恢复原因',
        action === 'pause' ? '暂停生效计划' : '恢复生效计划',
        { inputType: 'textarea', inputValidator: (value) => value.trim() ? true : '原因不能为空' },
      )
      reason = result.value
    } catch {
      return // 用户取消
    }
  }
  // 键带动作名：暂停/恢复/立即执行三者虽互斥，但「立即执行」可在执行中让状态流转，
  // 带上动作名可确保转圈的永远是刚点的那一个
  await run(actionKey('schedule', action), async () => {
    await operateMaintenanceCase(caseId, `effect-schedule/${action}`, { operationId: operationId(), reason })
    ElMessage.success('操作成功')
  })
}

onMounted(load)
</script>

<style scoped lang="scss">
.section-heading, .section-actions { display: flex; align-items: center; gap: 12px; }
.section-heading { justify-content: space-between; }
.section-heading { margin-bottom: 14px; }
.section-heading h4 { margin: 0; }
.section-heading span { color: var(--el-text-color-secondary); font-size: 12px; }
.section-card { margin-top: 16px; }
/* 流程概览带：把副标题那句「按冻结配置顺序执行」先给成一眼可见的结论。
   R10-06 由 el-steps 换为 el-timeline（用户点名 F-04）——三层信息 el-steps 一个都给不出：
   节点色 = 任务状态色（与右侧表格的 TiStatusTag 同源）、未达终态的节点空心（「还没走到」）、
   当前推进到的那一步节点放大（原实现靠父级 :active 推导，还得提防「显式传 wait 会压掉当前步」）。
   🔴 左内边距比 EP 默认（ul 40px + wrapper 28px = 68px）各收一档：卡片里 68px 的悬挂缩进
   会把 6 个节点挤成一条竖排细线，而这一带的作用是**一眼看清全流程**。 */
.flow-steps { margin-bottom: $space-4; padding: $space-3 $space-4 $space-1; border-radius: $radius-md; background: var(--el-fill-color-lighter); }
.flow-steps.is-start { padding-left: $space-5; }
.flow-steps :deep(.el-timeline-item) { padding-bottom: $space-3; }
.flow-steps :deep(.el-timeline-item.is-start .el-timeline-item__wrapper) { padding-left: $space-5; }
/* 刻度与节点圆心对齐：EP 给 timestamp 留 padding-top:4px / margin-bottom:8px，而节点圆心距
   行首 6px（node-size-normal 12px 的半径）⇒ 那 4px 的 padding 正好把刻度压到圆心下方 4px。
   本页 6 个节点里 3 个无时刻，留白全落在空处，收紧为 0 / $space-1。 */
.flow-steps :deep(.el-timeline-item__timestamp.is-top) { margin-bottom: $space-1; padding-top: 0; font-size: $font-size-sm; }
.flow-step { display: flex; flex-wrap: wrap; align-items: center; gap: $space-2; }
.flow-step__title { color: $text-primary; font-size: $font-size-base; font-weight: $font-weight-medium; }
.flow-step__operator { color: $text-secondary; font-size: $font-size-sm; }
.role-alert { margin-top: 14px; }
.section-actions { justify-content: flex-end; margin-top: 14px; }
/* 🔴 `repeat(2, minmax(0, 1fr))` 而非 `1fr 1fr`：grid 子项默认 `min-width: auto`，
   会把「内容最小宽度」当成列宽下限。左卡里的快照表列 min-width 合计 649px（卡片 padding 后 689），
   于是 900~1400px 视口区间内左列被顶到 689、右列只剩 115.9px ——
   右卡 el-descriptions 的标签实测被压到 **37px 宽 / 1553px 高**，即逐字竖排成一列。
   （1920px 下容器 1394 = 689×2+16 恰好够，所以宽屏看不出来；用户点名「视觉样式需要提升」，
   现场实际在 1440/1280 这些主流分辨率上。）minmax(0, …) 把下限归零，两列严格等宽。 */
.two-column { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.hash-text { word-break: break-all; font-family: monospace; }
.financial-evidence + .financial-evidence { margin-top: 14px; }
@media (max-width: $breakpoint-narrow) { .two-column { grid-template-columns: 1fr; } }
@media (max-width: $breakpoint-mobile) { .section-heading { align-items: flex-start; flex-direction: column; } /* 窄屏给表格一个横向最小宽度，让列不被压扁——选择器必须只命中 el-table 本身：此前写成 .responsive-table 裸类名，收编 TiTable 后该类名同时落在 .ti-table-wrap 根节点上，会把整张卡片撑到 900px 冲破栅格 */ .el-table.responsive-table, .responsive-table .el-table { min-width: 900px; } }
/* 必填标记：* 用 $danger-text 而非 $danger-color —— 后者是**填充色**，当文字色对比度实测仅 2.61，故文字一律用其压暗变体（见 variables.scss 说明） */
.field-required-mark { margin-right: $space-1; color: $danger-text; }
/* 字段旁错误提示：只在出错时占位，不预留固定高度，避免整表行高被少数出错行拉齐 */
.field-input__error { margin: $space-1 0 0; font-size: $font-size-sm; line-height: 1.5; color: $danger-text; }
.section-actions__error { font-size: $font-size-sm; color: $danger-text; }
/* 布尔字段的分段单选与「清除」并排：字号不同，靠 baseline 对齐而非默认的 stretch */
.field-input__boolean { display: flex; align-items: center; gap: $space-2; }
</style>
