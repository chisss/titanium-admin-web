<template>
  <!-- 版本对比结果：产品版本比的是配置字段，费率表版本比的是费率行 —— 两类共用同一套渲染，
       差异的「读法」（哪些字段变了 / 哪一行费率变了）必须一致，否则同一份审计材料在两张页面上
       长得不一样，读者要重新学一遍怎么读 -->
  <div class="ti-version-compare">
    <el-alert v-if="!hasDiff" type="success" :closable="false" show-icon :title="emptyText" />
    <template v-else>
      <div class="compare-summary">
        <el-tag v-if="summary.added" type="success" effect="plain">新增 {{ summary.added }}</el-tag>
        <el-tag v-if="summary.removed" type="danger" effect="plain">删除 {{ summary.removed }}</el-tag>
        <el-tag v-if="summary.changed" type="warning" effect="plain">变更 {{ summary.changed }}</el-tag>
        <span class="compare-summary__total">共 {{ summary.total }} 处差异</span>
      </div>

      <template v-if="rowDiff">
        <el-divider content-position="left">费率行差异</el-divider>
        <el-table :data="rowDiffRows" stripe max-height="360" empty-text="本次差异不涉及费率行">
          <el-table-column label="差异" width="90">
            <template #default="{ row }">
              <!-- 三种差异用同一套颜色语义：新增=成功绿、删除=危险红、变更=警告橙（全站色板约定） -->
              <el-tag :type="kindTag(row.kind)" size="small" effect="plain">{{ kindLabel(row.kind) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="业务维度" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">{{ dimensionText(row.dimensionHash) }}</template>
          </el-table-column>
          <el-table-column label="变更内容" min-width="360">
            <template #default="{ row }">
              <!-- 未变更的维度字段不列（那一行只在费率上有差异），故只渲染真正变化的字段 -->
              <div v-for="entry in row.fields" :key="entry.path" class="field-line">
                <span class="field-line__label">{{ fieldLabel(entry.path) }}</span>
                <span class="field-line__before">{{ formatDiffValue(entry.before) }}</span>
                <span class="field-line__arrow">→</span>
                <span class="field-line__after">{{ formatDiffValue(entry.after) }}</span>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </template>

      <el-divider content-position="left">{{ fieldsTitle }}</el-divider>
      <el-table :data="entryRows" stripe max-height="360" empty-text="本次差异不涉及配置字段">
        <el-table-column label="差异" width="90">
          <template #default="{ row }">
            <el-tag :type="kindTag(row.kind)" size="small" effect="plain">{{ kindLabel(row.kind) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="字段" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">{{ fieldLabel(row.path) }}</template>
        </el-table-column>
        <el-table-column label="旧版本" min-width="180">
          <template #default="{ row }">{{ formatDiffValue(row.before) }}</template>
        </el-table-column>
        <el-table-column label="新版本" min-width="180">
          <template #default="{ row }">{{ formatDiffValue(row.after) }}</template>
        </el-table-column>
      </el-table>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  formatDiffValue,
  RATE_TABLE_VERSION_NOISE,
  summarizeDiff,
  summarizeRowDiff,
  type DiffEntry,
  type DiffKind,
  type RowDiff,
} from '@/utils/versionDiff'

/**
 * 版本对比结果渲染（A4）。
 *
 * <p>只负责「怎么显示」，不负责取数与比对：比对是纯函数（`@/utils/versionDiff`），取数留在各自的页面。
 * 这样对比口径只有一份，两个入口（产品版本、费率表版本）不会各写一套 ignore 清单。</p>
 */
const props = defineProps<{
  /** 版本级字段差异（产品版本比配置字段；费率表版本比费率单位/币种/维度等表头字段） */
  entries: DiffEntry[]
  /** 费率表的行级差异（产品版本无此项） */
  rowDiff?: RowDiff<Record<string, unknown>> | null
  /** 字段差异区标题（费率表版本要与之区分，故可覆盖） */
  fieldsTitle?: string
  /** 两个版本完全一致时的提示语 */
  emptyText?: string
}>()

const KIND_LABEL: Record<DiffKind, string> = { ADDED: '新增', REMOVED: '删除', CHANGED: '变更' }
const KIND_TAG: Record<DiffKind, 'success' | 'danger' | 'warning'> = {
  ADDED: 'success',
  REMOVED: 'danger',
  CHANGED: 'warning',
}

/**
 * 差异类型 → 标签文案/颜色。
 *
 * <p>表格插槽给出的行是无类型值，故收敛成两个窄函数，未识别的类型按「变更」呈现：
 * 宁可把一条认不出的差异显示成变更，也不要在审计视图里让它消失。</p>
 */
const kindLabel = (kind: unknown): string => KIND_LABEL[kind as DiffKind] ?? '变更'
const kindTag = (kind: unknown): 'success' | 'danger' | 'warning' => KIND_TAG[kind as DiffKind] ?? 'warning'

/**
 * 字段路径的中文提示。
 *
 * <p>差分引擎给的是点分路径（`pricingBasicRule.baseRate`），路径本身是审计证据不能改写，
 * 但气泡里给出中文名，读者才不用去猜 `baseRate` 是哪一栏。此处只做**展示层**映射，
 * 未登记的新字段原样显示 —— 少一条翻译不会让差异消失，但若因为查不到中文名就隐藏，
 * 那条差异就查不到了。</p>
 */
const FIELD_LABELS: Record<string, string> = {
  'pricingBasicRule.baseRate': '基础费率',
  'pricingBasicRule.pricingType': '定价类型',
  'pricingBasicRule.pricingMode': '定价模式',
  'pricingBasicRule.predefinedInterestRate': '预定利率',
  'pricingBasicRule.expenseLoadingRate': '费用附加率',
  'pricingBasicRule.mortalityTableRef': '生命表引用',
  'pricingBasicRule.minPremium': '最低保费',
  'pricingBasicRule.maxPremium': '最高保费',
  'pricingBasicRule.tableCode': '费率表编码',
  'pricingBasicRule.tableVersion': '费率表版本',
  'underwritingConfig.underwritingMode': '核保模式',
  'underwritingConfig.ruleSetCode': '绑定的核保规则集',
  'underwritingConfig.manualReviewAmountThreshold': '人工复核金额阈值',
  'underwritingConfig.underwritingSLADays': '核保时效（天）',
  'underwritingConfig.autoApprovalCondition': '免核保条件',
  'underwritingConfig.requiredDocuments': '核保必需材料',
  'underwritingConfig.surchargeAcceptable': '接受加费承保',
  'underwritingConfig.specialAgreementAcceptable': '接受特别约定',
  rate: '费率',
  minimumPremium: '最低保费',
  maximumPremium: '最高保费',
  rateUnit: '费率单位',
  currency: '币种',
  dimensionKeys: '定价维度',
  effectiveFrom: '生效时间',
  effectiveTo: '失效时间',
  productName: '产品名称',
  productDesc: '产品描述',
  form: '产品形态',
  insuranceType: '险种类型',
  category: '产品类别',
}

const fieldLabel = (path: string) => {
  const label = FIELD_LABELS[path]
  return label ? `${label}（${path}）` : path
}

/** 费率行的维度描述：拿不到 dimensionHash 时退回行下标提示，不伪造维度内容 */
const dimensionText = (hash?: string) => hash || '（该行未返回维度键）'

const summary = computed(() => {
  const entrySummary = summarizeDiff(props.entries)
  const rowSummary = props.rowDiff
    ? summarizeRowDiff(props.rowDiff)
    : { added: 0, removed: 0, changed: 0, total: 0 }
  return {
    added: entrySummary.added + rowSummary.added,
    removed: entrySummary.removed + rowSummary.removed,
    changed: entrySummary.changed + rowSummary.changed,
    total: entrySummary.total + rowSummary.total,
  }
})
const hasDiff = computed(() => summary.value.total > 0)
const fieldsTitle = computed(() => props.fieldsTitle ?? '配置字段差异')
const emptyText = computed(() => props.emptyText ?? '两个版本的配置完全一致')

/** 逐字段差异行：ADDED/REMOVED/CHANGED 一律走同一张表，读者不必分三张表看 */
const entryRows = computed<DiffEntry[]>(() => props.entries)

/**
 * 行差异拍平为表格行：新增/删除行的「变更内容」列出该行的全部业务字段。
 *
 * <p>新增/删除的行没有「前后对照」，只有一份值；若不把它们的内容显示出来，
 * 审阅者只知道「多了一行」却不知道那一行是什么费率，等于没有证据。</p>
 */
const rowDiffRows = computed(() => {
  const diff = props.rowDiff
  if (!diff) return []
  const rows: Array<{ kind: DiffKind; dimensionHash?: string; fields: DiffEntry[] }> = []
  for (const row of diff.added) rows.push({ kind: 'ADDED', dimensionHash: row.dimensionHash as string, fields: flattenRow(row) })
  for (const row of diff.removed) rows.push({ kind: 'REMOVED', dimensionHash: row.dimensionHash as string, fields: flattenRow(row) })
  for (const item of diff.changed) {
    rows.push({ kind: 'CHANGED', dimensionHash: item.after.dimensionHash as string, fields: item.fields })
  }
  return rows
})

/**
 * 整行展开为 `字段路径 → 值` 的差异条目（用于新增/删除行的内容展示）。
 *
 * <p>🔴 过滤依据与「变更行」共用 {@link RATE_TABLE_VERSION_NOISE}，不另写一份硬编码清单：
 * 原先此处手写 `['dimensionHash','rowId']`，而变更行走的是噪声清单（当时不含 `rowId`），
 * 于是同一条「rowId 不是证据」的判断只落在新增/删除上——变更行反而把 rowId 当成差异列出。
 * 两份清单一旦各写各的就会再次漂移，故收敛为一份。</p>
 *
 * <p>`dimensionHash` 额外排除：它是该行的**身份**（已在「业务维度」列单独展示），
 * 不是可比较的业务字段；且它在噪声清单里没有位置——它是行匹配键。</p>
 */
function flattenRow(row: Record<string, unknown>): DiffEntry[] {
  const noise = [...RATE_TABLE_VERSION_NOISE, 'dimensionHash']
  return Object.entries(row)
    .filter(([key]) => !noise.includes(key))
    .map(([key, value]) => ({ path: key, kind: 'ADDED' as DiffKind, before: undefined, after: value }))
}
</script>

<style scoped lang="scss">
.compare-summary {
  display: flex;
  align-items: center;
  gap: $space-2;
  margin-bottom: $space-3;
  &__total { color: $text-secondary; margin-left: $space-1; }
}
.field-line {
  display: flex;
  gap: $space-2;
  line-height: 1.7;
  /* 文本色用 AA 达标的 *-text 变体（$danger-color/$success-color 是元素色，直接当正文用对比度不足） */
  &__label { color: $text-secondary; }
  &__before { color: $danger-text; text-decoration: line-through; }
  &__arrow { color: $text-secondary; }
  &__after { color: $success-text; }
}
</style>
