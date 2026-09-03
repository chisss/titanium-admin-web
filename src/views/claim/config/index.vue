<template>
  <!-- 理赔配置中心：7 组规则配置（元数据驱动面板） -->
  <div class="ti-page">
    <el-card shadow="never">
      <el-tabs v-model="activeTab" type="border-card">
        <el-tab-pane v-for="panel in panels" :key="panel.key" :label="panel.label" :name="panel.key">
          <ConfigPanel
            :title="panel.label"
            :fields="panel.fields"
            :columns="panel.columns"
            :list-fn="panel.listFn"
            :save-fn="panel.saveFn"
            :delete-fn="panel.deleteFn"
            :id-key="panel.idKey"
            :extra-actions="panel.extraActions"
          />
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import ConfigPanel from './ConfigPanel.vue'
import type { ColumnDef, ExtraAction, FieldDef } from './ConfigPanel.vue'
import {
  listFlowTemplates,
  saveFlowTemplate,
  deleteFlowTemplate,
  listPayoutRules,
  savePayoutRule,
  deletePayoutRule,
  listQuickPayRules,
  saveQuickPayRule,
  deleteQuickPayRule,
  listDocumentTemplates,
  saveDocumentTemplate,
  deleteDocumentTemplate,
  listTimeLimitRules,
  saveTimeLimitRule,
  deleteTimeLimitRule,
  listHospitalNetworks,
  saveHospitalNetwork,
  deleteHospitalNetwork,
  suspendHospital,
  activateHospital,
  terminateHospital,
  listBlacklists,
  saveBlacklist,
  deleteBlacklist,
  revokeBlacklist,
} from '@/api/claimConfig'
import {
  HOSPITAL_STATUS_LABELS,
  BLACKLIST_STATUS_LABELS,
} from '@/api/claimConfig'

const activeTab = ref('flow')

/** 理赔类型选项（metadata ClaimEnum.ClaimType） */
const CLAIM_TYPE_OPTIONS = [
  { value: 'MEDICAL', label: '医疗理赔' },
  { value: 'ACCIDENT', label: '意外理赔' },
  { value: 'DEATH', label: '身故理赔' },
  { value: 'DISABILITY', label: '伤残理赔' },
  { value: 'PROPERTY', label: '财产理赔' },
  { value: 'LIABILITY', label: '责任理赔' },
]

/** 险种线选项（metadata InsuranceProductType code，常用项，支持手动输入） */
const INSURANCE_LINE_OPTIONS = [
  { value: 'TERM_LIFE', label: '定期寿险' },
  { value: 'WHOLE_LIFE', label: '终身寿险' },
  { value: 'ENDOWMENT', label: '两全保险' },
  { value: 'ANNUITY', label: '年金保险' },
  { value: 'CRITICAL_ILLNESS', label: '重大疾病保险' },
  { value: 'MEDICAL', label: '医疗保险' },
  { value: 'DISABILITY_INCOME', label: '失能收入损失保险' },
  { value: 'LONG_TERM_CARE', label: '护理保险' },
  { value: 'ACCIDENT_COMPREHENSIVE', label: '综合意外险' },
  { value: 'TRANSPORT_ACCIDENT', label: '交通意外险' },
  { value: 'TRAVEL_ACCIDENT', label: '旅行意外险' },
  { value: 'AUTO', label: '机动车辆保险' },
]

/** 理赔环节选项（与流程模板 stageSequence 元素对齐） */
const CLAIM_STAGE_OPTIONS = [
  { value: 'REPORT', label: '报案受理' },
  { value: 'SURVEY', label: '查勘' },
  { value: 'ASSESSMENT', label: '定损' },
  { value: 'REVIEW', label: '核赔审核' },
  { value: 'SETTLEMENT', label: '结算支付' },
  { value: 'CLOSE', label: '结案归档' },
]

/** 医院等级选项 */
const HOSPITAL_LEVEL_OPTIONS = [
  { value: '一级', label: '一级' },
  { value: '二级', label: '二级' },
  { value: '三级', label: '三级' },
  { value: '宠物专科', label: '宠物专科' },
]

/** 标的类型选项（claim 域 BlacklistSubjectType） */
const SUBJECT_TYPE_OPTIONS = [
  { value: 'PERSON', label: '人员' },
  { value: 'VEHICLE', label: '车辆' },
  { value: 'HOSPITAL', label: '医院' },
  { value: 'REPAIR_SHOP', label: '修理厂' },
]

/** 状态中文映射回退 */
const hospitalStatusLabel = (v: unknown) => HOSPITAL_STATUS_LABELS[String(v)] ?? String(v ?? '-')
const blacklistStatusLabel = (v: unknown) => BLACKLIST_STATUS_LABELS[String(v)] ?? String(v ?? '-')

/** 数组列渲染（['a','b'] → a、b） */
const joinArr = (v: unknown) => (Array.isArray(v) ? (v.length ? v.join('、') : '-') : String(v ?? '-'))
/** 布尔渲染 */
const boolLabel = (v: unknown) => (v === true ? '是' : v === false ? '否' : '-')

/**
 * 类型适配：VO 接口无索引签名，无法直接赋给 ConfigPanel 的
 * Record<string, unknown> 签名，此处做一次安全断言包装。
 */
const asRecordList =
  <T>(fn: () => Promise<T[]>) =>
  (): Promise<Record<string, unknown>[]> =>
    fn().then((result) => result as unknown as Record<string, unknown>[])
const asSave =
  <T>(fn: (data: Partial<T>) => Promise<string>) =>
  (data: Record<string, unknown>): Promise<string> =>
    fn(data as Partial<T>)

/** 面板元数据集合（7 组） */
const panels: Array<{
  key: string
  label: string
  idKey: string
  fields: FieldDef[]
  columns: ColumnDef[]
  listFn: () => Promise<Record<string, unknown>[]>
  saveFn: (data: Record<string, unknown>) => Promise<string>
  deleteFn: (id: string) => Promise<void>
  extraActions?: ExtraAction[]
}> = [
  // ==================== 1. 流程模板 ====================
  {
    key: 'flow',
    label: '流程模板',
    idKey: 'templateId',
    fields: [
      { key: 'insuranceLine', label: '险种线', type: 'select', required: true, options: INSURANCE_LINE_OPTIONS },
      { key: 'claimType', label: '案件类型', type: 'select', required: true, options: CLAIM_TYPE_OPTIONS },
      { key: 'stageSequence', label: '环节序列', type: 'tags', required: true, placeholder: '按顺序填写环节 code，英文逗号分隔，如 REPORT,SURVEY,ASSESSMENT' },
      { key: 'responsibleRole', label: '责任角色', type: 'input' },
    ],
    columns: [
      { prop: 'templateId', label: '模板ID', minWidth: '180' },
      { prop: 'insuranceLine', label: '险种线', width: '110' },
      { prop: 'claimType', label: '案件类型', width: '110' },
      { prop: 'stageSequence', label: '环节序列', minWidth: '220', formatter: joinArr },
      { prop: 'responsibleRole', label: '责任角色', width: '110' },
    ],
    listFn: asRecordList(listFlowTemplates),
    saveFn: asSave(saveFlowTemplate),
    deleteFn: deleteFlowTemplate,
  },
  // ==================== 2. 赔付规则 ====================
  {
    key: 'payout',
    label: '赔付规则',
    idKey: 'ruleId',
    fields: [
      { key: 'insuranceLine', label: '险种线', type: 'select', required: true, options: INSURANCE_LINE_OPTIONS },
      { key: 'claimType', label: '理赔类型', type: 'select', required: true, options: CLAIM_TYPE_OPTIONS },
      { key: 'deductible', label: '免赔额（元）', type: 'number', min: 0, precision: 2 },
      { key: 'payoutRatio', label: '赔付比例（%）', type: 'number', required: true, min: 0, max: 100, precision: 0 },
      { key: 'perClaimLimit', label: '单次限额（元）', type: 'number', min: 0, precision: 2 },
      { key: 'annualLimit', label: '年度限额（元）', type: 'number', min: 0, precision: 2 },
      { key: 'exclusions', label: '责任免除清单', type: 'tags' },
    ],
    columns: [
      { prop: 'ruleId', label: '规则ID', minWidth: '180' },
      { prop: 'insuranceLine', label: '险种线', width: '110' },
      { prop: 'claimType', label: '理赔类型', width: '110' },
      { prop: 'deductible', label: '免赔额', width: '100' },
      { prop: 'payoutRatio', label: '赔付比例%', width: '100' },
      { prop: 'perClaimLimit', label: '单次限额', width: '110' },
    ],
    listFn: asRecordList(listPayoutRules),
    saveFn: asSave(savePayoutRule),
    deleteFn: deletePayoutRule,
  },
  // ==================== 3. 快赔规则 ====================
  {
    key: 'quickPay',
    label: '快赔规则',
    idKey: 'ruleId',
    fields: [
      { key: 'claimType', label: '理赔类型', type: 'select', required: true, options: CLAIM_TYPE_OPTIONS },
      { key: 'enabled', label: '通道开关', type: 'switch', activeText: '启用', inactiveText: '停用' },
      { key: 'amountThreshold', label: '金额阈值（元）', type: 'number', required: true, min: 0, precision: 2 },
    ],
    columns: [
      { prop: 'ruleId', label: '规则ID', minWidth: '180' },
      { prop: 'claimType', label: '理赔类型', width: '110' },
      { prop: 'enabled', label: '通道开关', width: '100', formatter: boolLabel },
      { prop: 'amountThreshold', label: '金额阈值', width: '110' },
    ],
    listFn: asRecordList(listQuickPayRules),
    saveFn: asSave(saveQuickPayRule),
    deleteFn: deleteQuickPayRule,
  },
  // ==================== 4. 单证模板 ====================
  {
    key: 'document',
    label: '单证模板',
    idKey: 'templateId',
    fields: [
      { key: 'insuranceLine', label: '险种线', type: 'select', required: true, options: INSURANCE_LINE_OPTIONS },
      { key: 'claimType', label: '理赔类型', type: 'select', required: true, options: CLAIM_TYPE_OPTIONS },
      { key: 'requiredDocuments', label: '必填材料清单', type: 'tags', placeholder: '如 诊断证明,发票原件,身份证复印件' },
      { key: 'optionalDocuments', label: '选填材料清单', type: 'tags' },
    ],
    columns: [
      { prop: 'templateId', label: '模板ID', minWidth: '180' },
      { prop: 'insuranceLine', label: '险种线', width: '110' },
      { prop: 'claimType', label: '理赔类型', width: '110' },
      { prop: 'requiredDocuments', label: '必填材料', minWidth: '200', formatter: joinArr },
    ],
    listFn: asRecordList(listDocumentTemplates),
    saveFn: asSave(saveDocumentTemplate),
    deleteFn: deleteDocumentTemplate,
  },
  // ==================== 5. 时限规则 ====================
  {
    key: 'timeLimit',
    label: '时限规则',
    idKey: 'ruleId',
    fields: [
      { key: 'insuranceLine', label: '险种线', type: 'select', required: true, options: INSURANCE_LINE_OPTIONS },
      { key: 'claimStage', label: '案件环节', type: 'select', required: true, options: CLAIM_STAGE_OPTIONS },
      { key: 'limitHours', label: '处理时限（小时）', type: 'number', required: true, min: 1, precision: 0 },
      { key: 'alertHours', label: '预警时限（小时）', type: 'number', min: 0, precision: 0 },
    ],
    columns: [
      { prop: 'ruleId', label: '规则ID', minWidth: '180' },
      { prop: 'insuranceLine', label: '险种线', width: '110' },
      { prop: 'claimStage', label: '案件环节', width: '110' },
      { prop: 'limitHours', label: '处理时限', width: '100' },
      { prop: 'alertHours', label: '预警时限', width: '100' },
    ],
    listFn: asRecordList(listTimeLimitRules),
    saveFn: asSave(saveTimeLimitRule),
    deleteFn: deleteTimeLimitRule,
  },
  // ==================== 6. 医院网络 ====================
  {
    key: 'hospital',
    label: '医院网络',
    idKey: 'hospitalId',
    fields: [
      { key: 'hospitalName', label: '医院名称', type: 'input', required: true },
      { key: 'hospitalLevel', label: '医院等级', type: 'select', options: HOSPITAL_LEVEL_OPTIONS },
      { key: 'agreementStatus', label: '协议状态', type: 'select', required: true, options: Object.entries(HOSPITAL_STATUS_LABELS).map(([value, label]) => ({ value, label })) },
      { key: 'payoutRatio', label: '定点赔付比例（%）', type: 'number', min: 0, max: 100, precision: 0 },
      { key: 'directSettlement', label: '直赔医院', type: 'switch', activeText: '是', inactiveText: '否' },
      { key: 'address', label: '医院地址', type: 'input' },
      { key: 'contactPhone', label: '联系电话', type: 'input' },
    ],
    columns: [
      { prop: 'hospitalId', label: '医院ID', minWidth: '180' },
      { prop: 'hospitalName', label: '医院名称', minWidth: '140' },
      { prop: 'hospitalLevel', label: '等级', width: '90' },
      { prop: 'agreementStatus', label: '协议状态', width: '100', formatter: hospitalStatusLabel },
      { prop: 'payoutRatio', label: '赔付比例%', width: '100' },
      { prop: 'directSettlement', label: '直赔', width: '70', formatter: boolLabel },
    ],
    listFn: asRecordList(listHospitalNetworks),
    saveFn: asSave(saveHospitalNetwork),
    deleteFn: deleteHospitalNetwork,
    extraActions: [
      {
        key: 'suspend',
        label: '暂停',
        type: 'warning',
        visible: (row) => row.agreementStatus === 'ACTIVE',
        confirmText: '确认暂停该医院协议？暂停后不再按定点比例赔付。',
        run: suspendHospital,
      },
      {
        key: 'activate',
        label: '恢复',
        type: 'success',
        visible: (row) => row.agreementStatus === 'SUSPENDED',
        run: activateHospital,
      },
      {
        key: 'terminate',
        label: '终止',
        type: 'danger',
        visible: (row) => row.agreementStatus === 'ACTIVE' || row.agreementStatus === 'SUSPENDED',
        confirmText: '确认终止该医院协议？终止后不再参与资格校验。',
        run: terminateHospital,
      },
    ],
  },
  // ==================== 7. 黑名单 ====================
  {
    key: 'blacklist',
    label: '黑名单',
    idKey: 'blacklistId',
    fields: [
      { key: 'subjectType', label: '标的类型', type: 'select', required: true, options: SUBJECT_TYPE_OPTIONS },
      { key: 'subjectId', label: '标的ID', type: 'input', required: true, placeholder: '人员ID/车牌/医院ID/修理厂ID' },
      { key: 'subjectName', label: '标的名称', type: 'input' },
      { key: 'reasonCode', label: '拉黑原因 code', type: 'input', required: true, placeholder: '如 FRAUD_SUSPECTED' },
      { key: 'effectiveTime', label: '生效时间', type: 'datetime' },
    ],
    columns: [
      { prop: 'blacklistId', label: '黑名单ID', minWidth: '180' },
      { prop: 'subjectType', label: '标的类型', width: '100' },
      { prop: 'subjectName', label: '标的名称', minWidth: '120' },
      { prop: 'reasonCode', label: '拉黑原因', width: '150' },
      { prop: 'status', label: '状态', width: '90', formatter: blacklistStatusLabel },
    ],
    listFn: asRecordList(listBlacklists),
    saveFn: asSave(saveBlacklist),
    deleteFn: deleteBlacklist,
    extraActions: [
      {
        key: 'revoke',
        label: '撤销',
        type: 'success',
        visible: (row) => row.status === 'ACTIVE',
        confirmText: '确认撤销该黑名单记录？',
        run: revokeBlacklist,
      },
    ],
  },
]
</script>
