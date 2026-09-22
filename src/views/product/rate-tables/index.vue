<template>
  <div class="ti-page">
    <div class="page-intro">
      <div>
        <h2>费率表配置</h2>
        <p>维护产品定价所引用的版本化费率数据。发布前必须完成校验，已发布版本不可直接修改。</p>
      </div>
    </div>
    <!-- 搜索区：两个字段都保留 @change 即时筛选（原有习惯），搜索键作为显式入口并存 -->
    <TiSearchForm :model="queryParams" @search="loadTables" @reset="handleReset">
      <el-form-item label="产品">
        <el-select v-model="productId" filterable clearable placeholder="选择产品" style="width: 320px" @change="loadTables">
          <el-option v-for="product in products" :key="product.id" :label="`${product.name} (${product.code})`" :value="product.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="状态"><TiDictSelect v-model="status" dict-type="RATE_TABLE_STATUS" style="width: 140px" @change="loadTables" /></el-form-item>
    </TiSearchForm>
    <!-- 主操作独居工具栏：全站同类页（system/user、system/role、system/menu、product/list）
         的单个主操作一律放 ti-toolbar-left，此处沿用；原先它靠 space-between 的第二个子元素
         被推到右侧，那是布局副作用而非约定 -->
    <div class="ti-toolbar">
      <div class="ti-toolbar-left">
        <el-button type="primary" :disabled="!productId" v-permission="'product:rate-table:create'" @click="createDialog = true">新建费率表</el-button>
      </div>
    </div>
    <el-alert v-if="!productId" title="请选择产品，再维护该产品的费率表版本。" type="info" :closable="false" />
    <TiTable
      v-else
      :data="tables"
      :loading="loading"
      :max-height="'var(--ti-table-max-height-default)'"
      :error="tableError"
      @refresh="loadTables"
    >
      <el-table-column prop="tableCode" label="费率表编码" min-width="160" />
      <el-table-column prop="tableVersion" label="版本" width="100" />
      <el-table-column prop="rateUnit" label="费率单位" width="150"><template #default="{ row }">{{ rateUnitLabel(row.rateUnit) }}</template></el-table-column>
      <el-table-column prop="currency" label="币种" width="90" />
      <el-table-column prop="rowCount" label="费率行数" width="100" />
      <el-table-column label="状态" width="110"><template #default="{ row }"><TiStatusTag :value="row.status" :label="statusLabel(row.status)" /></template></el-table-column>
      <el-table-column label="操作" fixed="right" width="400" class-name="ti-action-column">
        <template #default="{ row }">
          <!-- 🔴 这几处的权限判在 `v-if` 表达式里，不用 v-permission 指令：这些按钮**自带 v-if**
               （DRAFT/PUBLISHED 状态门），指令在 mounted 里 `el.parentNode.removeChild(el)` 直接改
               真实 DOM，与同一元素上的动态挂载/卸载叠加会让 vnode 树与实际 DOM 不一致。
               权限码取自 ProductProxyController：/validate 与 /rows 用 PRODUCT_RATE_TABLE_EDIT，
               /publish 与 /retire 共用 PRODUCT_RATE_TABLE_PUBLISH（退役不是独立码）。 -->
          <el-button size="small" :icon="Tickets" @click="openDetail(row)">明细</el-button>
          <!-- A4：版本历史按 tableCode 归组（同一费率表编码的历次版本），入口放在行内与「明细」并列 -->
          <el-button size="small" :icon="Clock" @click="openHistory(row)">版本历史</el-button>
          <el-button v-if="row.status === 'DRAFT' && hasPermission('product:rate-table:edit')" size="small" @click="openRows(row)">维护费率行</el-button>
          <!-- pending 键统一取 `行主键:动作名`（actionKey）：校验/发布与退役虽按状态互斥、当前不会
               同时可见，但键里写清动作名既让 rowPending 自解释，也保证今后本行再加动作按钮时，
               不会退化成「两个按钮共用一个键、点一个另一个也转圈」 -->
          <el-button v-if="row.status === 'DRAFT' && hasPermission('product:rate-table:publish')" size="small" type="success" :icon="Select" :loading="rowPending === actionKey(row.tableId, 'publish')" @click="validate(row)">校验/发布</el-button>
          <el-button v-if="row.status === 'PUBLISHED' && hasPermission('product:rate-table:publish')" size="small" type="danger" :icon="Remove" :loading="rowPending === actionKey(row.tableId, 'retire')" @click="retire(row)">退役</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty description="当前产品暂无费率表">
          <el-button type="primary" v-permission="'product:rate-table:create'" @click="createDialog = true">新建费率表</el-button>
        </el-empty>
      </template>
    </TiTable>

    <!-- A4 版本历史与回滚（监管审计要求：任何一次费率变更都要能说清「从哪一版到哪一版、差在哪」，
         并能回到某个历史版本）。抽屉而非弹窗：内含版本列表 + 差异表，弹窗装不下；
         且对比是只读操作，抽屉不会打断列表上的继续操作。 -->
    <el-drawer v-model="historyVisible" :title="`费率表版本历史：${historyTableCode}`" size="82%">
      <div v-loading="historyLoading">
        <el-alert
          class="history-tip"
          type="info"
          :closable="false"
          show-icon
          title="勾选任意两个版本对比差异；确认要回到某一版时，以它为源新建草稿 —— 回滚同样走「草稿 → 校验 → 发布」，已发布版本永远原样保留，不会被改写。"
        />
        <el-table :data="historyVersions" stripe max-height="280" @selection-change="onHistorySelect" empty-text="暂无历史版本">
          <el-table-column type="selection" width="46" />
          <el-table-column prop="tableVersion" label="版本" width="100" />
          <el-table-column label="状态" width="110"><template #default="{ row }"><TiStatusTag :value="row.status" :label="statusLabel(row.status)" /></template></el-table-column>
          <el-table-column prop="rowCount" label="费率行数" width="100" />
          <el-table-column label="生效时间" min-width="170"><template #default="{ row }">{{ formatDateTime(row.effectiveFrom) }}</template></el-table-column>
          <el-table-column label="内容哈希" min-width="170"><template #default="{ row }"><span class="hash-text">{{ row.contentHash || '-' }}</span></template></el-table-column>
        </el-table>
        <div class="history-actions">
          <el-button type="primary" :disabled="selectedVersions.length !== 2" :loading="comparing" @click="compareSelected">对比所选两个版本</el-button>
          <span class="history-actions__note">{{ historySelectNote }}</span>
        </div>

        <template v-if="compareResult">
          <el-divider content-position="left">{{ compareResult.before.tableVersion }} → {{ compareResult.after.tableVersion }}</el-divider>
          <el-alert v-if="compareResult.rowDiffSkipped" class="history-tip" type="warning" :closable="false" show-icon title="所选版本的部分费率行未返回业务维度键（dimensionHash），本次只对比了费率表配置，未做行级对比。用行号或行主键匹配会得出「全删全增」的假差异，不如不比。" />
          <TiVersionCompare
            :entries="compareResult.entries"
            :row-diff="compareResult.rowDiff"
            fields-title="费率表字段差异（费率单位/币种/维度等）"
            empty-text="两个版本的费率表配置与费率行完全一致"
          />
          <div class="history-rollback">
            <span class="history-actions__label">新版本生效时间</span>
            <!-- 生效时间只在这一刻能定：草稿建好后没有改表头的入口。
                 默认当前时间而非源版本的生效时间 —— 照抄源版本会让「回滚出来的新版本」声称自己在过去就已生效，
                 那是追溯适用旧费率，正是审计最忌讳的一种动作。 -->
            <el-date-picker
              v-model="rollbackEffectiveFrom"
              type="datetime"
              value-format="YYYY-MM-DDTHH:mm:ss"
              :placeholder="rollbackDefaultTime"
              :disabled="!canRollback"
              class="history-rollback__time"
            />
            <el-button
              type="warning"
              :icon="RefreshLeft"
              :loading="rollbackSaving"
              :disabled="!canRollback || !rollbackEffectiveFrom"
              @click="rollbackTo(compareResult.before)"
            >
              以「{{ compareResult.before.tableVersion }}」为源新建草稿
            </el-button>
          </div>
          <p class="history-actions__note">
            <template v-if="canRollback">
              将新建 {{ nextVersionLabel }} 草稿并写入该版本的 {{ compareResult.before.rows?.length || 0 }} 行费率（版本号按本编码已有版本推进）；
              创建后仍是草稿，需再走「校验 → 发布」才生效。
            </template>
            <template v-else>
              回滚需要「product:rate-table:create」与「product:rate-table:edit」两个权限（前者建草稿、后者写费率行），当前账号缺少：{{ missingRollbackPerms }}。
            </template>
          </p>
        </template>
      </div>
    </el-drawer>

    <el-dialog v-model="createDialog" title="新建费率表草稿" width="560px">
      <el-form :model="createForm" label-width="120px">
        <el-form-item label="费率表编码"><el-input v-model="createForm.tableCode" /></el-form-item>
        <el-form-item label="版本"><el-input v-model="createForm.tableVersion" /></el-form-item>
        <el-form-item label="费率单位"><TiDictSelect v-model="createForm.rateUnit" dict-type="RATE_UNIT" :clearable="false" /></el-form-item>
        <el-form-item label="币种"><TiDictSelect v-model="createForm.currency" dict-type="CURRENCY" :clearable="false" filterable /></el-form-item>
        <el-form-item label="生效时间"><el-date-picker v-model="createForm.effectiveFrom" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" /></el-form-item>
        <el-form-item label="维度键"><TiDictSelect v-model="createForm.dimensionKeys" dict-type="RATE_DIMENSION" multiple filterable /></el-form-item>
      </el-form>
      <!-- 对话框内的保存按钮走 saving + try/finally 范式，不用 useRowAction：对话框是模态的，
           同一时刻只可能有一个保存在途，pending 绑到行主键没有对象可绑 -->
      <template #footer><el-button @click="createDialog = false">取消</el-button><el-button type="primary" :loading="createSaving" @click="submitCreate">创建</el-button></template>
    </el-dialog>

    <!-- 🔴 费率口径说明（可引导性改造）：见脚本区「费率口径说明与保费试算」注释。
         本对话框此前只有 8 位小数的裸费率输入框，无单位、无币种、无结果预览。 -->
    <el-dialog v-model="rowsDialog" title="维护费率行" width="min(1400px, 96vw)" top="4vh">
      <el-alert class="ti-alert rate-basis" type="info" :closable="false" show-icon title="费率口径与保费试算">
        <p class="rate-basis__row">
          <span class="rate-basis__label">费率单位</span>{{ unitMeta?.name || '未识别' }}
          <span class="rate-basis__sep">·</span>
          <span class="rate-basis__label">币种</span>{{ currencyCode }}
          <span class="rate-basis__sep">·</span>
          <span class="rate-basis__label">公式</span>{{ unitMeta?.formula || '—' }}
        </p>
        <p v-if="basisExample" class="rate-basis__row">{{ basisExample }}</p>
        <p class="rate-basis__row">
          保费还会被「最低保费 / 最高保费」收窄——算出的值低于下限按下限收、高于上限按上限收；
          命中时「试算保费」列会标出界限，避免费率调了却看不出效果。
        </p>
        <div class="rate-basis__bar">
          <span class="rate-basis__label">试算基准保额</span>
          <el-input-number
            v-model="previewSumInsured"
            :min="1"
            :precision="2"
            controls-position="right"
            class="rate-basis__input"
          />
          <span class="rate-basis__label">{{ currencyCode }}</span>
          <span v-if="unitMeta && !unitMeta.scalesWithSumInsured" class="rate-basis__note">
            该单位下保费与保额无关，此值仅用于对齐后端的保额校验（要求大于 0）
          </span>
        </div>
      </el-alert>

      <el-table :data="editingRows" stripe empty-text="暂无费率行，点「新增一行」新增">
        <el-table-column label="年龄起" width="100"><template #default="{ row }"><el-input-number v-model="row.ageFrom" :min="0" controls-position="right" /></template></el-table-column>
        <el-table-column label="年龄止(开区间)" width="130"><template #default="{ row }"><el-input-number v-model="row.ageToExclusive" :min="1" controls-position="right" /></template></el-table-column>
        <el-table-column label="性别" width="110"><template #default="{ row }"><TiDictSelect v-model="row.gender" dict-type="GENDER" :clearable="false" /></template></el-table-column>
        <el-table-column label="缴费年限（年）" width="128"><template #default="{ row }"><el-input-number v-model="row.paymentTermYears" :min="1" controls-position="right" /></template></el-table-column>
        <el-table-column label="保障年限（年）" width="128"><template #default="{ row }"><el-input-number v-model="row.coverageTermYears" :min="1" controls-position="right" /></template></el-table-column>
        <el-table-column :label="rateColumnLabel" width="180"><template #default="{ row }"><el-input-number v-model="row.rate" :min="0" :precision="8" controls-position="right" /></template></el-table-column>
        <el-table-column :label="minPremiumLabel" width="140"><template #default="{ row }"><el-input-number v-model="row.minimumPremium" :min="0" :precision="2" controls-position="right" /></template></el-table-column>
        <el-table-column :label="maxPremiumLabel" width="140"><template #default="{ row }"><el-input-number v-model="row.maximumPremium" :min="0" :precision="2" controls-position="right" /></template></el-table-column>
        <!-- 🔴 本表唯一的 flex 列：整表都是定长控件（输入框一律 150px、金额右对齐），取操作列之前的
             最后一个数据列承接剩余宽——EP 无 flex 列时表格宽 = 各列宽之和（table-layout.mjs:123-131）。
             该列内容是「试算金额 + 可选告警标签」，右对齐，多出的宽不会形成可见空档 -->
        <el-table-column label="试算保费" min-width="170" align="right">
          <template #default="{ $index }">
            <span class="preview-amount">{{ previewCells[$index]?.text }}</span>
            <el-tooltip v-if="previewCells[$index]?.tag" :content="previewCells[$index].tip" placement="top">
              <el-tag size="small" type="warning" class="preview-tag">{{ previewCells[$index].tag }}</el-tag>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" class-name="ti-action-column"><template #default="{ $index }"><el-button size="small" type="danger" :icon="Delete" @click="editingRows.splice($index, 1)">删除</el-button></template></el-table-column>
      </el-table>
      <el-button class="add-row" @click="addRow">新增一行</el-button>
      <template #footer><el-button @click="rowsDialog = false">取消</el-button><el-button type="primary" :loading="rowsSaving" @click="saveRows">保存费率行</el-button></template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="费率表明细" size="72%">
      <el-descriptions :column="detailColumns" border>
        <el-descriptions-item label="费率表">{{ detail?.tableCode }}</el-descriptions-item>
        <el-descriptions-item label="版本">{{ detail?.tableVersion }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ statusLabel(detail?.status || '') }}</el-descriptions-item>
        <el-descriptions-item label="费率单位">{{ rateUnitLabel(detail?.rateUnit || '') }}</el-descriptions-item>
        <el-descriptions-item label="币种">{{ detail?.currency }}</el-descriptions-item>
        <!-- 时间统一走全局日期工具，避免直出后端 ISO 串（2026-09-18 全站实测） -->
        <el-descriptions-item label="生效时间">{{ formatDateTime(detail?.effectiveFrom) }}</el-descriptions-item>
        <el-descriptions-item label="定价维度" :span="3">
          <el-tag v-for="key in detail?.dimensionKeys || []" :key="key" class="dimension-tag">{{ dimensionLabel(key) }}</el-tag>
        </el-descriptions-item>
      </el-descriptions>
      <el-divider content-position="left">费率行</el-divider>
      <el-table :data="detail?.rows || []" stripe empty-text="暂无费率行">
        <el-table-column prop="ageFrom" label="年龄起" width="90" />
        <el-table-column prop="ageToExclusive" label="年龄止" width="90" />
        <el-table-column label="性别" width="90"><template #default="{ row }">{{ genderLabel(row.gender) }}</template></el-table-column>
        <el-table-column prop="paymentTermYears" label="缴费年限" width="110" />
        <el-table-column prop="coverageTermYears" label="保障年限" width="110" />
        <el-table-column prop="rate" :label="detailRateColumnLabel" min-width="140" />
        <!-- 🔴 金额列必须带币种：formatAmount 缺省按人民币渲染，外币费率表此前会被显示成 ¥ 符号 -->
        <el-table-column prop="minimumPremium" :label="`最低保费（${detailCurrency}）`" min-width="130" align="right">
          <template #default="{ row }">{{ formatAmount(row.minimumPremium, detailCurrency) }}</template>
        </el-table-column>
        <el-table-column prop="maximumPremium" :label="`最高保费（${detailCurrency}）`" min-width="130" align="right">
          <template #default="{ row }">{{ formatAmount(row.maximumPremium, detailCurrency) }}</template>
        </el-table-column>
      </el-table>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, toRefs, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Clock, Delete, RefreshLeft, Remove, Select, Tickets } from '@element-plus/icons-vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import TiVersionCompare from '@/components/TiVersionCompare/index.vue'
import { useDetailColumns } from '@/composables/useDetailColumns'
import { useDict } from '@/composables/useDict'
import { usePermission } from '@/composables/usePermission'
import { useRowAction, confirmAction, actionKey } from '@/composables/useRowAction'
import { useTableError } from '@/composables/useTable'
import { formatAmount } from '@/utils/format'
import { formatDateTime, nowDateTimeValue } from '@/utils/date'
import { compareVersions, nextVersion } from '@/utils/version'
import { diffRecords, diffRowsByKey, RATE_TABLE_VERSION_NOISE, type DiffEntry, type RowDiff } from '@/utils/versionDiff'
import { listRateTables, getRateTable, createRateTable, replaceRateTableRows, validateRateTable, publishRateTable, retireRateTable, type RateTable, type RateTableRow } from '@/api/pricing'
import { getProductList } from '@/api/product'
import {
  previewPremium,
  rateUnitMeta,
  type PremiumPreview,
} from '@/constants/pricing'
import type { ProductVO } from '@/types/business.d'

// 检索条件收进单一对象：TiSearchForm 的 `:model` 与下方字段绑定必须指向**同一份数据**。
// 若字段仍绑在独立的 ref 上、另一个对象当 model，重置还原的是 model 的副本，
// 界面纹丝不动 —— 又是一个「有按钮、没反应」。toRefs 把两个字段变成 queryParams 的属性视图，
// 于是模板里 `v-model="productId"` 与脚本里 `productId.value` 全都零改动。
const queryParams = reactive({ productId: '', status: '' })
const { productId, status } = toRefs(queryParams)
const products = ref<ProductVO[]>([])
const tables = ref<RateTable[]>([])
/** 描述区：字段短，宽屏 3 档 */
const detailColumns = useDetailColumns(3)
/** 操作列的权限判定（判在 v-if 表达式里，见模板注释） */
const { hasPermission } = usePermission()

/**
 * 行内状态推进（校验/发布、退役）的 pending 与错误兜底统一由 useRowAction 承担：
 * 置 pending → 发请求 → 成功后刷新列表 → finally 复位；失败不刷新，列表保持原状，
 * 用户才看得出这一步没成。校验/发布与退役都是低频高危的状态推进，
 * 请求期间按钮毫无变化会被当成没点中而重复提交。
 */
const { rowPending, run } = useRowAction(loadTables)

const loading = ref(false)
// 失败态：接口挂了不得渲染成「暂无数据」（🔴 R7-13）
const { tableError, clearTableError, setTableError } = useTableError()
/**
 * 两个对话框各自一个在途标记，不复用一个 `saving`：新建草稿与保存费率行是两个独立的
 * 保存作用域，名字里带对话框名才能一眼看出「转的是哪个按钮的圈」
 * （本仓先例：product/create 的 saving 与 templateSaving 并存）。
 */
const createSaving = ref(false)
const rowsSaving = ref(false)
const createDialog = ref(false)
const rowsDialog = ref(false)
const detailVisible = ref(false)
const detail = ref<RateTable | null>(null)
const current = ref<RateTable | null>(null)
const editingRows = ref<RateTableRow[]>([])
const createForm = reactive({ tableCode: '', tableVersion: 'V1.0', rateUnit: 'SUM_INSURED_RATIO', currency: 'CNY', effectiveFrom: '', dimensionKeys: ['age'] })
const { getLabel: statusLabel } = useDict('RATE_TABLE_STATUS')
const { getLabel: dimensionLabel } = useDict('RATE_DIMENSION')
const { getLabel: rateUnitLabel } = useDict('RATE_UNIT')
const { getLabel: genderDictLabel } = useDict('GENDER')
const genderLabel = (value?: string) => value ? genderDictLabel(value) : '-'

// ---------------------------------------------------------------------------
// 费率口径说明与保费试算（可引导性改造）
//
// 「费率」是量纲不固定的字段：同一列里填 3.5，在「每千元保额」下是每千元收 3.5 元，
// 在「保额比例」下却是保额的 350%。此前本对话框既不显示单位也不显示币种，录入 8 位小数
// 的费率时无从判断量级。公式、钳制顺序与舍入口径一律照抄后端
// `PremiumCompositionService.calculate()`，见 `@/constants/pricing`（那里是唯一翻译点）。
// ---------------------------------------------------------------------------

/** 试算基准保额默认值：10 万，寿险/健康险的常见量级，且与各单位示例费率换算后都是整数（便于对照量纲） */
const DEFAULT_PREVIEW_SUM_INSURED = 100000
/** 试算基准保额（仅前端预览用，不随费率行提交） */
const previewSumInsured = ref(DEFAULT_PREVIEW_SUM_INSURED)

/**
 * 各单位用于讲解的示例费率。
 *
 * <p>三个值在当前基准保额下换算出的保费**刻意相等**（350）：只有让「0.0035 / 3.5 / 350」
 * 三个数指向同一个结果，量纲差异才看得见——这正是录错单位时最该被拦住的地方。</p>
 */
const SAMPLE_RATES: Record<string, number> = {
  SUM_INSURED_RATIO: 0.0035,
  PER_THOUSAND_SUM_INSURED: 3.5,
  FIXED_AMOUNT: 350,
}

/** 当前费率行的单位语义（来源是费率表自身的 rateUnit，非用户可改） */
const unitMeta = computed(() => rateUnitMeta(current.value?.rateUnit))
/** 明细抽屉的单位语义（与录入对话框是两个独立来源，明细看的是已发布的实际配置） */
const detailUnitMeta = computed(() => rateUnitMeta(detail.value?.rateUnit))
const currencyCode = computed(() => current.value?.currency || 'CNY')
/** 明细抽屉的币种：与录入对话框各自取自各自的费率表对象 */
const detailCurrency = computed(() => detail.value?.currency || 'CNY')

/** 「费率」列表头带上量纲：仅靠值本身无法判断 3.5 的含义 */
const rateColumnLabel = computed(() => `费率（${unitMeta.value?.rateUnit || '单位未知'}）`)
const detailRateColumnLabel = computed(() => `费率（${detailUnitMeta.value?.rateUnit || '单位未知'}）`)
/** 最低/最高保费是本表币种下的金额，币种写在表头以免读者按人民币理解外币表 */
const minPremiumLabel = computed(() => `最低保费（${currencyCode.value}）`)
const maxPremiumLabel = computed(() => `最高保费（${currencyCode.value}）`)

/**
 * 逐行试算结果，与 `editingRows` 同序同长。
 *
 * <p>用下标对齐而非在模板里逐格调用 `previewPremium`：模板里要判空与取值会调用两次，
 * 且本页「操作」列已有 `#default="{ $index }"` 的下标用法，风格一致。</p>
 */
const previews = computed<Array<PremiumPreview | null>>(() =>
  editingRows.value.map((row) => previewPremium(row, current.value?.rateUnit, previewSumInsured.value)),
)

/**
 * 「试算保费」单元格的展示数据。
 *
 * <p>把「算不出来」也收敛成一种可渲染状态（`tag` 为空串），模板里就不再出现空值分支 ——
 * 否则每个取值点都要写一次非空断言，读起来全是噪声。钳制提示的文案在此一次算好。</p>
 */
const previewCells = computed(() =>
  previews.value.map((preview) => {
    // 试算前提不成立（费率缺失、单位未识别）时显示占位符，不用 0 冒充结果
    if (!preview) return { text: '-', tag: '', tip: '' }
    const text = formatAmount(preview.premium, currencyCode.value)
    if (!preview.bound) return { text, tag: '', tip: '' }
    // 命中上下限必须显式标出：静默钳制比报错更隐蔽——用户以为自己在调费率，
    // 实际每次都被收窄到同一个数，费率高低对最终保费毫无影响
    const boundText = preview.bound === 'minimum' ? '最低保费' : '最高保费'
    return {
      text,
      tag: preview.bound === 'minimum' ? '按下限' : '按上限',
      tip: `按费率算出 ${formatAmount(preview.computed, currencyCode.value)}，已被${boundText}收窄为 ${text}`,
    }
  }),
)

/**
 * 讲解句：把「公式 + 本表币种 + 一个换算实例」压成一行。
 *
 * <p>实例不走独立算式，直接复用 `previewPremium`——示例与实际试算共用同一份公式，
 * 不会出现「说明里算得对、列里算错」的两套口径。</p>
 */
const basisExample = computed(() => {
  const meta = unitMeta.value
  const sample = SAMPLE_RATES[current.value?.rateUnit || '']
  if (!meta || sample === undefined) return ''
  const preview = previewPremium({ rate: sample }, current.value?.rateUnit, previewSumInsured.value)
  if (!preview) return ''
  const amount = formatAmount(preview.premium, currencyCode.value)
  return meta.scalesWithSumInsured
    ? `如费率 ${sample} ⇒ 保额 ${formatAmount(previewSumInsured.value, currencyCode.value)} 时收 ${amount}`
    : `如费率 ${sample} ⇒ 每单收 ${amount}`
})

async function loadTables() {
  if (!productId.value) return
  loading.value = true
  try { tables.value = await listRateTables(productId.value, status.value || undefined); clearTableError() } catch (err) { tables.value = []; setTableError(err) } finally { loading.value = false }
}
async function loadProducts() {
  const result = await getProductList({ pageNum: 1, pageSize: 100 })
  products.value = result.list
  if (!productId.value && products.value.length) {
    productId.value = products.value[0].id
    await loadTables()
  }
}
/**
 * 重置检索条件。
 *
 * <p>还原 productId/status 由 TiSearchForm 自己完成（它先还原、再 emit，见其 handleReset 注释），
 * 这里只处理组件管不到的部分。**且刻意不重新自动选中第一个产品** ——
 * 重置的语义是「清空全部条件」，落在本页就是回到「请选择产品」这个设计好的空态
 * （模板里的 el-alert 就是为它准备的）。若在此处重新自动选中，用户在默认产品上点重置
 * 会看不到任何变化，反倒是「有按钮、没反应」。列表残留一并清掉，避免空态下留着上一个产品的数据。</p>
 */
function handleReset() {
  tables.value = []
}
async function submitCreate() {
  // 校验前置到 pending 置位之前：不满足直接 return，无需再把按钮从 loading 态手动复位
  if (!createForm.tableCode || !createForm.effectiveFrom) return ElMessage.warning('请补齐费率表编码和生效时间')
  createSaving.value = true
  try {
    await createRateTable(productId.value, createForm)
    createDialog.value = false
    ElMessage.success('费率表草稿已创建')
    await loadTables()
  } finally {
    // 失败时不关对话框、不刷新列表：表单里填的内容留在原地，改完可直接重试
    createSaving.value = false
  }
}
function openRows(row: unknown) {
  const table = row as RateTable
  current.value = table
  editingRows.value = table.rows.map((item) => ({ ...item }))
  // 每次打开重置试算基准保额：它是本次录入的临时参照物，沿用上一次的数值会把上一张表的
  // 保额量级无声带进来，让「试算保费」与用户此刻的心理预期对不上
  previewSumInsured.value = DEFAULT_PREVIEW_SUM_INSURED
  rowsDialog.value = true
}
function addRow() { editingRows.value.push({ gender: 'ALL', paymentTermYears: 1, coverageTermYears: 1, rate: 0 }) }
async function saveRows() {
  if (!current.value) return
  rowsSaving.value = true
  try {
    await replaceRateTableRows(productId.value, current.value.tableId, editingRows.value)
    rowsDialog.value = false
    ElMessage.success('费率行已保存')
    await loadTables()
  } finally {
    // 失败时对话框与编辑中的费率行一律保留：整表替换是一次性提交，关掉就等于用户刚录入的行白填
    rowsSaving.value = false
  }
}
/**
 * 校验并发布草稿费率表。
 *
 * <p>一个按钮承载两步写操作（先校验、后发布），故确认框必须在 `run` 之内：
 * 只有校验请求返回「通过」才谈得上发布，把确认提到 `run` 之外就断了这条依赖。
 * pending 因此覆盖「校验 → 等用户确认 → 发布」全程——校验是后端重算，
 * 期间按钮无反馈会被当成没点中而重复触发，重复校验/重复发布代价远大于一次多余的转圈。</p>
 */
async function validate(row: unknown) {
  const table = row as RateTable
  await run(actionKey(table.tableId, 'publish'), async () => {
    await validateRateTable(productId.value, table.tableId)
    // 用户取消用 return 表达：取消不是错误，抛出会被 run 当成失败走错误分支。
    // 校验结果保留不回收，刷新列表也照常（校验可能已改动服务端状态）。
    if (!(await confirmAction('费率表校验通过，确认发布该版本？', '发布确认', { type: 'warning' }))) return
    await publishRateTable(productId.value, table.tableId)
    ElMessage.success('费率表已发布')
  })
}
async function retire(row: unknown) {
  const table = row as RateTable
  // 与 validate 相反，这里先确认再置 pending：用户还在确认框上犹豫时按钮不该在背后转圈
  if (!(await confirmAction('退役后该版本不能再用于新计算，确认继续？', '退役确认', { type: 'warning', confirmButtonClass: 'el-button--danger' }))) return
  await run(actionKey(table.tableId, 'retire'), async () => {
    await retireRateTable(productId.value, table.tableId)
    ElMessage.success('费率表已退役')
  })
}
async function openDetail(row: unknown) { const table = row as RateTable; detail.value = await getRateTable(productId.value, table.tableId); detailVisible.value = true }

// ---------------------------------------------------------------------------
// A4 版本历史 / 差异对比 / 回滚
//
// 费率表的「版本」不是一张独立表，而是同一个 `tableCode` 下的多条记录（tableVersion 由用户填），
// 下游也没有「版本历史」端点 —— 故版本线由前端按 tableCode 归组得出。归组的**键必须是 tableCode**：
// 同一产品下会有多张不同编码的费率表（寿险费率表、附加险费率表…），按产品归组会把它们混成一条版本线，
// 对比出来的差异里全是不相干的另一张表的内容。
// ---------------------------------------------------------------------------

const historyVisible = ref(false)
const historyLoading = ref(false)
const historyTableCode = ref('')
const historyVersions = ref<RateTable[]>([])
const selectedVersions = ref<RateTable[]>([])
const comparing = ref(false)
const rollbackSaving = ref(false)
const rollbackEffectiveFrom = ref('')
const rollbackDefaultTime = nowDateTimeValue()

/** 对比结果：两个版本快照 + 字段差异 + 行差异（行差异在维度键缺失时为 null） */
const compareResult = ref<{
  before: RateTable
  after: RateTable
  entries: DiffEntry[]
  rowDiff: RowDiff<RateTableRow> | null
  rowDiffSkipped: boolean
} | null>(null)

/**
 * 回滚需要**两个**后端权限，缺一不可。
 *
 * <p>「建草稿」与「写费率行」是两个端点、两个权限码（`ProductProxyController` 的
 * `PRODUCT_RATE_TABLE_CREATE` 与 `PRODUCT_RATE_TABLE_EDIT`）。只判 create 的后果不是 403 那么简单：
 * create 会成功、replace 才失败，于是库里留下一个**空费率表草稿**，而用户只看到一句报错。</p>
 */
const canRollback = computed(() => hasPermission('product:rate-table:create') && hasPermission('product:rate-table:edit'))
/** 缺哪个码就说哪个码（只说「无权」用户不知道去找谁开） */
const missingRollbackPerms = computed(() => {
  const missing: string[] = []
  if (!hasPermission('product:rate-table:create')) missing.push('product:rate-table:create（新建草稿）')
  if (!hasPermission('product:rate-table:edit')) missing.push('product:rate-table:edit（写费率行）')
  return missing.join('、')
})
/** 下一个版本号：按本编码已有版本推进，与下游 `generateNewVersion` 同口径（见 @/utils/version） */
const nextVersionLabel = computed(() => nextVersion(historyVersions.value.map((table) => table.tableVersion)))

/** 勾选提示：恰选两个才谈得上对比，多于两个时明说而不是让按钮徒然灰着 */
const historySelectNote = computed(() => {
  const count = selectedVersions.value.length
  if (count === 2) return '新旧按版本号判定，较早的一版为「旧版本」'
  return `已选 ${count} 个版本：需恰好选中 2 个才能对比`
})

function onHistorySelect(rows: unknown[]) {
  selectedVersions.value = rows as RateTable[]
}

/**
 * 打开某张费率表的版本历史。
 *
 * @param row 列表里任意一行（取它的 tableCode 作为版本线）
 */
async function openHistory(row: unknown) {
  const table = row as RateTable
  historyTableCode.value = table.tableCode
  // 换一条版本线就把上一次的对比结果清掉：留着的话新抽屉里会挂着另一张表的差异表
  compareResult.value = null
  selectedVersions.value = []
  historyVisible.value = true
  // 生效时间默认当前时间，且只在本抽屉首次打开时取一次（用户改过就不覆盖他的输入）
  if (!rollbackEffectiveFrom.value) rollbackEffectiveFrom.value = rollbackDefaultTime
  await loadHistoryVersions()
}

/**
 * 拉取该编码的全部版本。
 *
 * <p>🔴 刻意**不带 status 过滤**：版本历史必须包含已退役与草稿版本。回滚的目标通常正是
 * 「已退役的上一版」，按状态过滤会把目标版本挡在门外，用户看到的「历史」只剩当前在用的那一版，
 * 于是这个入口看起来像有、实际永远没有可回滚的对象。</p>
 */
async function loadHistoryVersions() {
  if (!productId.value) return
  historyLoading.value = true
  try {
    const all = await listRateTables(productId.value)
    historyVersions.value = all
      .filter((table) => table.tableCode === historyTableCode.value)
      // 新版在前：历史列表的第一行应是当前版本
      .sort((a, b) => compareVersions(b.tableVersion, a.tableVersion))
  } finally {
    historyLoading.value = false
  }
}

/**
 * 字段级对比的快照：剔除 `rows`。
 *
 * <p>行集合是「整表替换」的，当数组整体比较只会产出一条「整个列表变了」——那条差异什么也没说。
 * 行级差异另走 `diffRowsByKey`，按业务维度键逐行配对（见下方 compareSelected）。</p>
 */
function headerSnapshot(table: RateTable) {
  const { rows: _rows, ...header } = table
  return header
}

/** 行级对比的前提：两侧每一行都带业务维度键。缺了就不比，而不是换一种匹配法硬比 */
function rowsComparable(tables: RateTable[]) {
  return tables.every((table) => (table.rows || []).every((row) => !!row.dimensionHash))
}

/**
 * 对比所选两个版本。
 *
 * <p>新旧按**版本号**判定，不按勾选顺序：勾选顺序是界面操作痕迹，版本先后是业务事实。
 * 顺序若取决于先点哪个，同一对版本换个点法就会得到一份前后颠倒的差异报告。</p>
 */
async function compareSelected() {
  const [first, second] = selectedVersions.value
  if (!first || !second) return
  const [before, after] = compareVersions(first.tableVersion, second.tableVersion) <= 0 ? [first, second] : [second, first]
  comparing.value = true
  try {
    const entries = diffRecords(headerSnapshot(before), headerSnapshot(after), { ignore: RATE_TABLE_VERSION_NOISE })
    const rowDiffSkipped = !rowsComparable([before, after])
    const rowDiff = rowDiffSkipped
      ? null
      : diffRowsByKey(before.rows || [], after.rows || [], (row) => row.dimensionHash || '', {
          ignore: RATE_TABLE_VERSION_NOISE,
        })
    compareResult.value = { before, after, entries, rowDiff, rowDiffSkipped }
  } finally {
    comparing.value = false
  }
}

/**
 * 以某一历史版本为源新建草稿（回滚）。
 *
 * <p>写入的是**该版本的实际费率行**（取自详情/列表响应的 rows），不是「把旧版本改成生效」——
 * 已发布版本不可改写，回滚只能是一个新版本，这也正是审计期望的形态（每次变更都留痕）。</p>
 */
async function rollbackTo(source: RateTable) {
  if (!rollbackEffectiveFrom.value) return ElMessage.warning('请先选择新版本的生效时间')
  const targetVersion = nextVersionLabel.value
  const rows = source.rows || []
  const confirmed = await confirmAction(
    `将以「${source.tableVersion}」为源新建草稿 ${targetVersion}，写入 ${rows.length} 行费率，生效时间 ${formatDateTime(rollbackEffectiveFrom.value)}。\n` +
      '只创建草稿，不影响任何已发布版本；新版本需再走「校验 → 发布」才生效。',
    '回滚确认',
    { type: 'warning' },
  )
  if (!confirmed) return

  rollbackSaving.value = true
  try {
    const newTableId = await createRateTable(productId.value, {
      tableCode: source.tableCode,
      tableVersion: targetVersion,
      rateUnit: source.rateUnit,
      currency: source.currency,
      effectiveFrom: rollbackEffectiveFrom.value,
      dimensionKeys: source.dimensionKeys,
    })
    try {
      await replaceRateTableRows(productId.value, newTableId, rows)
    } catch (error) {
      // 🔴 两步写在这里必然出现中间态：草稿已经建出来了，费率行没写进去。
      //    若只抛一句通用错误，用户会以为整个动作失败并重来一次 —— 于是库里多出一个空草稿，
      //    而且没人知道它是谁留下的。故报错必须点名「草稿已创建」并给出它的版本号与去向。
      ElMessage.error(`${targetVersion} 草稿已创建，但费率行写入失败：请在列表中打开该草稿重新维护费率行，或删除后重试`)
      await loadTables()
      await loadHistoryVersions()
      throw error
    }
    ElMessage.success(`已按「${source.tableVersion}」新建草稿 ${targetVersion}，请校验后发布`)
    // 列表与版本线都会因新草稿而变化：两者都刷新，抽屉保持打开，用户能立刻看到新版本出现在历史里
    await loadTables()
    compareResult.value = null
    selectedVersions.value = []
    rollbackEffectiveFrom.value = nowDateTimeValue()
    await loadHistoryVersions()
  } finally {
    rollbackSaving.value = false
  }
}

onMounted(loadProducts)
</script>

<style scoped lang="scss">
.page-intro { margin-bottom: 18px; } h2 { margin: 0 0 $space-2; } p { color: $text-secondary; margin: 0; } .add-row { margin-top: $space-3; }
/* 试算结果标签：贴在同格的金额右侧，与数字同处一个单元格才能一眼对应 */
.preview-tag { margin-left: $space-1; }

/* 费率口径说明：解释性文案，行距放宽以便扫读；值用主色、标签用次要色形成两栏感 */
.rate-basis {
  margin-bottom: $space-4;
  &__row { color: $text-primary; line-height: 1.6; &:last-child { margin-bottom: 0; } }
  &__label { color: $text-secondary; }
  &__sep { margin: 0 $space-2; color: $text-secondary; }
  &__bar { display: flex; align-items: center; gap: $space-2; margin-top: $space-3; }
  &__input { width: 170px; }
  &__note { font-size: $font-size-sm; color: $text-secondary; }
}

/* 版本历史抽屉 */
.history-tip { margin-bottom: $space-3; }
.history-actions {
  display: flex;
  align-items: center;
  gap: $space-3;
  margin: $space-3 0;
  &__label { color: $text-secondary; }
  /* 说明句是本区唯一的「为什么/下一步」出处，行距放宽到可扫读；颜色取次要色以免与差异表争视线 */
  &__note { font-size: $font-size-sm; color: $text-secondary; line-height: 1.7; white-space: pre-line; }
}
.history-rollback {
  display: flex;
  align-items: center;
  gap: $space-3;
  margin-top: $space-4;
  /* 回滚是覆盖式动作，用一条上边界把它与上面的差异表在视觉上分开，避免误点 */
  padding-top: $space-4;
  border-top: 1px solid $border-color;
  &__time { width: 200px; }
}
/* 哈希是定长十六进制串，等宽字体才列得齐、便于逐位比对两个版本（字体栈沿用本仓既有 .hash-text 写法） */
.hash-text { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: $font-size-sm; color: $text-secondary; word-break: break-all; }
</style>
