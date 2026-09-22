<template>
  <!-- 产品管理列表页 -->
  <div class="ti-page">
    <!-- 搜索区 -->
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="产品名称">
        <el-input v-model="queryParams.name" placeholder="模糊搜索" clearable style="width: 180px" />
      </el-form-item>
      <el-form-item label="险种分类">
        <TiDictSelect
          v-model="queryParams.category"
          dict-type="INSURANCE_CATEGORY"
          style="width: 130px"
          @change="onCategoryChange"
        />
      </el-form-item>
      <el-form-item label="二级险种">
        <el-select
          v-model="queryParams.insuranceType"
          clearable
          placeholder="全部"
          :disabled="!queryParams.category"
          style="width: 150px"
        >
          <el-option v-for="opt in insuranceTypeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="产品状态">
        <TiDictSelect v-model="queryParams.status" dict-type="PRODUCT_STATUS" style="width: 130px" />
      </el-form-item>
      <el-form-item label="创建时间">
        <el-date-picker
          v-model="queryParams.dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          style="width: 220px"
        />
      </el-form-item>
    </TiSearchForm>

    <!-- 工具栏 -->
    <div class="ti-toolbar">
      <div class="ti-toolbar-left">
        <el-button type="primary" :icon="Plus" v-permission="'product:create'" @click="goCreate">
          新建产品
        </el-button>
      </div>
      <div class="ti-toolbar-right">
        <!-- 导出为服务端 CSV（后端 /export 端点由 product:export 守卫），故按钮与端点同码 -->
        <el-button :icon="Download" v-permission="'product:export'" :loading="exporting" @click="handleExport">
          导出
        </el-button>
      </div>
    </div>

    <!-- 表格 -->
    <TiTable
      :data="tableData"
      :total="pagination.total"
      :page-num="pagination.pageNum"
      :page-size="pagination.pageSize"
      :loading="tableLoading"
      :max-height="'var(--ti-table-max-height-default)'"
      @page-change="onPageChange"
      @size-change="onSizeChange"
      :error="tableError"
      @refresh="retry"
    >
      <el-table-column type="index" label="序号" width="60" align="center" fixed="left" />
      <el-table-column prop="productNo" label="产品号" width="180" class-name="ti-code-column">
        <template #default="{ row }"><TiCopyText :text="row.productNo || '-'" /></template>
      </el-table-column>
      <el-table-column prop="code" label="产品代码" width="180" class-name="ti-code-column">
        <template #default="{ row }">
          <TiCopyText :text="row.code" />
        </template>
      </el-table-column>
      <el-table-column prop="name" label="产品名称" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">
          <el-button link type="primary" @click="goDetail(row.id)">{{ row.name }}</el-button>
        </template>
      </el-table-column>
      <el-table-column prop="category" label="险种分类" width="100">
        <template #default="{ row }">
          {{ getCategoryLabel(row.category) }}
        </template>
      </el-table-column>
      <el-table-column prop="insuranceType" label="二级险种" width="120">
        <template #default="{ row }">
          {{ insuranceTypeLabel(row.insuranceType) }}
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="110">
        <template #default="{ row }">
          <TiStatusTag :value="row.status" :label="getStatusLabel(row.status)" />
        </template>
      </el-table-column>
      <el-table-column prop="version" label="版本" width="100" align="center">
        <template #default="{ row }">
          <!-- A4：版本号本身即「版本历史」的入口 —— 运营看到「V2.0」时想问的下一句话就是
               「V1.0 是什么样、改了什么」，把入口放在这串号上，比再塞一个「版本历史」按钮更省一次寻找 -->
          <el-button link type="primary" @click="openHistory(row)">{{ row.version || '-' }}</el-button>
        </template>
      </el-table-column>
      <el-table-column prop="minPremium" label="最低保费" width="120" align="right">
        <template #default="{ row }">
          {{ formatAmount(row.minPremium) }}
        </template>
      </el-table-column>
      <el-table-column prop="createdBy" label="创建人" width="100" />
      <el-table-column prop="createdAt" label="创建时间" width="160">
        <template #default="{ row }">
          {{ formatDateTime(row.createdAt) }}
        </template>
      </el-table-column>
      <!-- @vue-generic {ProductVO} -->
      <el-table-column label="操作" width="320" fixed="right" class-name="ti-action-column">
        <template #default="{ row }">
          <!-- 平铺动作收敛为 3 个：详情/修订/配置是各状态通用入口，状态流转收进「更多」 -->
          <el-button size="small" :icon="View" @click="goDetail(row.id)">详情</el-button>
          <!-- 🔴 修订仅对 EFFECTIVE 开放，判据来自后端两处硬约束：
               ① `InsuranceProduct.java:286` 修订要求 `status == EFFECTIVE`；
               ② `ProductProxyController.java:172-174`「原 PUT /{id}『更新产品』端点已删除…
                  不存在原地更新语义」。
               此前这里是 `v-if="row.status === 'DRAFT'"` 的「编辑」按钮 → 跳 create 页，
               而 create 页无条件调 createProduct ⇒ **点一次就产生一份重复产品**（本轮修复）。
               同时 DRAFT 后端没有任何可写入口，故该入口整体移除，不再出现在任何状态上。 -->
          <el-button
            v-if="row.status === 'EFFECTIVE'"
            size="small" :icon="Edit"
            v-permission="'product:edit'"
            @click="goRevise(row)"
          >
            修订
          </el-button>
          <el-button
            size="small" :icon="Setting"
            v-permission="'product:config'"
            @click="goConfig(row.id)"
          >
            配置
          </el-button>
          <el-dropdown
            v-if="['DRAFT', 'AUDITING', 'EFFECTIVE'].includes(row.status)"
            trigger="click"
            @command="(command: string) => runRowCommand(row, command)"
          >
            <el-button size="small" :icon="MoreFilled" :loading="rowPending === actionKey(row.id, 'more')">更多</el-button>
            <template #dropdown>
              <!-- 下拉项用 hasPermission 而非 v-permission：el-dropdown-item 渲染根是 Fragment，
                   指令拿到的只是片段锚点文本节点，removeChild 摘不掉真正的 <li>（会静默失效） -->
              <!-- 🔴 权限码修正（4 处）：原写 product:submit / product:activate / product:deactivate，
                   三者在前端被使用、却在 admin 的 t_permission/t_menu 种子里 **0 命中** ⇒ 对
                   所有非超管永久隐藏（超管因权限集含 "*" 通配而掩盖了问题）。
                   真源是 ProductProxyController 的 @PreAuthorize——/submit、/approve、/reject、
                   /unpublish 四个端点**统一**写 PRODUCT_CONFIG（=product:config），故四处同码。 -->
              <el-dropdown-menu>
                <el-dropdown-item
                  v-if="row.status === 'DRAFT' && hasPermission('product:config')"
                  command="submit"
                >
                  提交审核
                </el-dropdown-item>
                <el-dropdown-item
                  v-if="row.status === 'AUDITING' && hasPermission('product:config')"
                  command="approve"
                >
                  审核通过
                </el-dropdown-item>
                <el-dropdown-item
                  v-if="row.status === 'AUDITING' && hasPermission('product:config')"
                  command="reject"
                  class="ti-dropdown-item--danger"
                >
                  驳回
                </el-dropdown-item>
                <el-dropdown-item
                  v-if="row.status === 'EFFECTIVE' && hasPermission('product:config')"
                  command="deactivate"
                  class="ti-dropdown-item--danger"
                >
                  下架
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </el-table-column>
    </TiTable>

    <!-- A4 版本历史 / 差异对比 / 回滚（监管审计要求：任何一次产品变更都要能说清「从哪一版到哪一版、差在哪」，
         并能回到某个历史版本）。抽屉而非弹窗：内含版本列表 + 差异表，弹窗装不下；
         且对比是只读操作，抽屉不会打断列表上的继续操作。 -->
    <el-drawer v-model="historyVisible" :title="`产品版本历史：${historyCode}`" size="82%">
      <div v-loading="historyLoading">
        <el-alert
          class="history-tip"
          type="info"
          :closable="false"
          show-icon
          title="勾选任意两个版本对比差异；要回到某一版时，以它为底稿生成新版本 —— 已发布的历史版本永远原样保留，不会被改写，回滚同样是一次留痕的新变更。"
        />
        <el-table :data="historyVersions" stripe max-height="280" @selection-change="onHistorySelect" empty-text="暂无历史版本">
          <el-table-column type="selection" width="46" />
          <el-table-column prop="version" label="版本" width="90" />
          <el-table-column label="状态" width="110">
            <template #default="{ row }"><TiStatusTag :value="row.status" :label="getStatusLabel(row.status)" /></template>
          </el-table-column>
          <el-table-column prop="productName" label="产品名称" min-width="160" show-overflow-tooltip />
          <el-table-column label="生效时间" min-width="170">
            <template #default="{ row }">{{ formatDateTime(row.effectiveTime) }}</template>
          </el-table-column>
          <el-table-column label="创建人" width="100">
            <template #default="{ row }">{{ row.createdBy || '-' }}</template>
          </el-table-column>
          <el-table-column label="创建时间" min-width="170">
            <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="由哪一版修订而来" min-width="130">
            <template #default="{ row }">{{ parentVersionLabel(row) }}</template>
          </el-table-column>
        </el-table>
        <div class="history-actions">
          <el-button type="primary" :disabled="selectedVersions.length !== 2" :loading="comparing" @click="compareSelected">对比所选两个版本</el-button>
          <span class="history-actions__note">{{ historySelectNote }}</span>
        </div>

        <template v-if="compareResult">
          <el-divider content-position="left">{{ compareResult.before.version }} → {{ compareResult.after.version }}</el-divider>
          <TiVersionCompare
            :entries="compareResult.entries"
            fields-title="产品配置字段差异"
            empty-text="两个版本的产品配置完全一致"
          />
          <div class="history-rollback">
            <el-button
              type="warning"
              :icon="RefreshLeft"
              :disabled="!canRollback"
              @click="rollbackTo(compareResult.before)"
            >
              以「{{ compareResult.before.version }}」为底稿生成新版本草稿
            </el-button>
          </div>
          <p class="history-actions__note">
            <template v-if="!currentEffective">本版本线当前没有生效版本，无法回滚：产品修订只能以「生效版本」为源（后端硬约束），请先把某一版置为生效。</template>
            <template v-else-if="!hasPermission('product:edit')">回滚需要「product:edit」权限（提交修订端点），当前账号没有。</template>
            <template v-else>
              将以当前生效版本「{{ currentEffective.version }}」为修订源、以「{{ compareResult.before.version }}」的配置为底稿生成新版本草稿；
              创建后仍是草稿，需再走「提交审核 → 审核通过」才生效。
            </template>
          </p>
          <p v-if="currentEffective && hasPermission('product:edit')" class="history-actions__note">
            回滚会把该版本的定价、精算、核保配置一并带回来，这几组字段在提交时另有字段级权限校验（{{ missingFieldPerms || '本账号四个字段码齐备' }}）；
            与当前生效版本一致的字段不会被校验。
          </p>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Download, View, Edit, Setting, MoreFilled, RefreshLeft } from '@element-plus/icons-vue'
import { computed } from 'vue'
import {
  getProductList,
  approveProduct,
  rejectProduct,
  deactivateProduct,
  submitProductForReview,
  exportProducts,
  listProductVersions,
  getProductDetailRaw,
  type ProductVersionVO,
} from '@/api/product'
import { useTable } from '@/composables/useTable'
import { useRowAction, confirmAction, actionKey } from '@/composables/useRowAction'
import { useDict } from '@/composables/useDict'
import { usePermission } from '@/composables/usePermission'
import { useUserStore } from '@/stores/user'
import { formatDateTime } from '@/utils/date'
import { formatAmount } from '@/utils/format'
import { compareVersions } from '@/utils/version'
import { diffRecords, PRODUCT_VERSION_NOISE, type DiffEntry } from '@/utils/versionDiff'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import TiCopyText from '@/components/TiCopyText/index.vue'
import TiVersionCompare from '@/components/TiVersionCompare/index.vue'
import { insuranceTypesOf, insuranceTypeLabel } from '@/constants/insurance'
import type { ProductVO } from '@/types/business.d'

const router = useRouter()

/** 下拉权限判定：el-dropdown-item 为多根组件，v-permission 指令在此失效，须显式判断 */
const { hasPermission } = usePermission()

/**
 * 「导出」按钮的在途标志。
 *
 * <p>🔴 导出是**服务端生成 CSV**（`exportProducts` 返回 blob），行数多时是本站最慢的请求之一，
 * 而原先按钮点下去毫无变化——用户既不知道在跑、也不知道该等多久，只会反复点，
 * 每点一次都是一次全量导出。</p>
 */
const exporting = ref(false)

// 查询参数
const queryParams = reactive({
  name: '',
  category: undefined as string | undefined,
  insuranceType: undefined as string | undefined,
  status: undefined as string | undefined,
  dateRange: undefined as string[] | undefined,
})

// 二级险种选项：随一级险种大类联动
const insuranceTypeOptions = computed(() => insuranceTypesOf(queryParams.category))

// 一级险种大类变化：清空已选二级险种
const onCategoryChange = () => {
  queryParams.insuranceType = undefined
}

// 字典
const { getLabel: getCategoryLabel } = useDict('INSURANCE_CATEGORY')
const { getLabel: getStatusLabel } = useDict('PRODUCT_STATUS')

// 表格数据
const { tableData, tableLoading, tableError, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange, retry } =
  useTable<ProductVO, typeof queryParams>((params) => {
    const { dateRange, ...rest } = params
    return getProductList({
      ...rest,
      startDate: dateRange?.[0],
      endDate: dateRange?.[1],
    } as Parameters<typeof getProductList>[0])
  }, queryParams)

// 初始加载
fetchData()

/** 行内状态推进（提交/通过/驳回/下架）的 pending 与错误兜底统一由 useRowAction 承担 */
const { rowPending, run } = useRowAction(fetchData)

const goCreate = () => router.push('/product/create')
const goDetail = (id: string) => router.push(`/product/detail/${id}`)
const goConfig = (id: string) => router.push(`/product/config/${id}`)

/**
 * 跳转修订向导。
 *
 * <p>带上被修订产品ID（向导据此加载原版本、并在提交时走 `POST /{id}/revise`）。
 * 修订**不改写**当前生效版本，只生成新版本草稿，故先把后果告诉用户再跳转——
 * 这与「编辑」的心智模型不同，不说明会被当成原地修改。</p>
 */
const goRevise = async (row: ProductVO) => {
  const ok = await confirmAction(
    `确认修订产品「${row.name}」？将基于当前生效版本生成**新版本草稿**，当前生效版本保持不变。`,
    '修订产品',
    { type: 'info' },
  )
  if (!ok) return
  router.push(`/product/create?id=${row.id}`)
}

// ==================== A4 版本历史 / 对比 / 回滚 ====================
//
// 版本线的归组键是 **productCode** 而非 productId：产品修订继承编码、派生新 productId，
// 故「同一编码的全部行」才是这条版本线。用 productId 归组只会得到一行。

const historyVisible = ref(false)
const historyLoading = ref(false)
/** 当前抽屉对应的产品编码（版本线归组键） */
const historyCode = ref('')
const historyVersions = ref<ProductVersionVO[]>([])
const selectedVersions = ref<ProductVersionVO[]>([])
const comparing = ref(false)

/** 对比结果：两个版本条目 + 从**详情原始载荷**算出的字段差异 */
const compareResult = ref<{ before: ProductVersionVO; after: ProductVersionVO; entries: DiffEntry[] } | null>(null)

/** 版本线里的当前生效版本 —— 回滚必须落到它身上（后端只允许修订 EFFECTIVE） */
const currentEffective = computed(() => historyVersions.value.find((item) => item.status === 'EFFECTIVE'))

/**
 * 回滚入口的可用性。
 *
 * <p>🔴 回滚 = 「以当前生效版本为修订源 + 用历史版本的配置作底稿」。缺任一前提都做不成：
 * 没有生效版本就没有可修订的源（后端 `InsuranceProduct.java:286` 要求源版本 EFFECTIVE），
 * 没有 `product:edit` 就调不动 `/revise` 端点。两者都不满足时**必须说明是哪一条**，
 * 否则按钮灰着、用户只能猜。</p>
 */
const canRollback = computed(() => !!currentEffective.value && hasPermission('product:edit'))

/** 当前账号缺少的**字段级**权限码（回滚会改写定价/精算/核保配置，提交时由 BFF 逐个字段校验） */
const missingFieldPerms = computed(() => {
  const codes: Array<[string, string]> = [
    ['product:pricing:edit', '定价基础'],
    ['product:rate-table:edit', '费率表引用'],
    ['product:actuarial:edit', '精算基础'],
    ['underwriting:config:edit', '核保配置'],
  ]
  return codes.filter(([code]) => !hasPermission(code)).map(([code, name]) => `${name}（${code}）`).join('、')
})

/** 勾选提示：恰选两个才谈得上对比，多于/少于两个时明说而不是让按钮徒然灰着 */
const historySelectNote = computed(() => {
  const count = selectedVersions.value.length
  if (count === 2) return '新旧按版本号判定，较早的一版为「旧版本」；回滚同样作用于其中较早的那一版'
  return `已选 ${count} 个版本：需恰好选中 2 个才能对比`
})

function onHistorySelect(rows: unknown[]) {
  selectedVersions.value = rows as ProductVersionVO[]
}

/**
 * 「由哪一版修订而来」：把父版本指针翻成版本号；首版无父指针。
 *
 * <p>入参收敛为 {@code unknown}：表格插槽给出的行是无类型值，此处自行判定形状
 * （与费率表抽屉的 `onHistorySelect` 同一处理）。</p>
 */
function parentVersionLabel(row: unknown) {
  const item = row as ProductVersionVO
  if (!item?.originalProductId) return '首个版本'
  const parent = historyVersions.value.find((candidate) => candidate.productId === item.originalProductId)
  return parent ? parent.version : '（父版本不在本版本线内）'
}

/**
 * 打开某个产品的版本历史。
 *
 * @param row 列表里任意一行（取它的 code 作为版本线）
 */
async function openHistory(row: unknown) {
  const product = row as ProductVO
  historyCode.value = product.code
  // 换一条版本线就把上一次的对比结果清掉：留着的话新抽屉里会挂着另一个产品的差异表
  compareResult.value = null
  selectedVersions.value = []
  historyVisible.value = true
  await loadHistoryVersions()
}

/** 拉取该编码的全部版本（后端已按创建时间倒序返回，新版在前） */
async function loadHistoryVersions() {
  if (!historyCode.value) return
  historyLoading.value = true
  try {
    historyVersions.value = await listProductVersions(historyCode.value)
  } finally {
    historyLoading.value = false
  }
}

/**
 * 对比所选两个版本。
 *
 * <p>🔴 快照必须取**详情原始载荷**（`getProductDetailRaw`）而不是列表行：版本条目刻意不带配置块
 * （带上就等于一次版本历史查询传输 N 份产品配置），且列表行经视图模型裁剪过字段——
 * 拿它当快照，被裁掉的字段会以「一侧缺失」的形式冒出来，看起来像「这一版删了它」。</p>
 * <p>新旧按**版本号**判定，不按勾选顺序：勾选顺序是界面操作痕迹，版本先后是业务事实。</p>
 */
async function compareSelected() {
  const [first, second] = selectedVersions.value
  if (!first || !second) return
  const [before, after] = compareVersions(first.version, second.version) <= 0 ? [first, second] : [second, first]
  comparing.value = true
  try {
    const [beforeRaw, afterRaw] = await Promise.all([
      getProductDetailRaw(before.productId),
      getProductDetailRaw(after.productId),
    ])
    compareResult.value = {
      before,
      after,
      entries: diffRecords(beforeRaw, afterRaw, { ignore: PRODUCT_VERSION_NOISE }),
    }
  } catch {
    // 取数失败就不留半份对比结果：显示一份「差异为空」比不显示危险得多
    compareResult.value = null
    ElMessage.error('版本详情加载失败，无法对比，请稍后重试')
  } finally {
    comparing.value = false
  }
}

/**
 * 以某一历史版本为底稿发起回滚（生成新版本草稿）。
 *
 * <p>🔴 回滚**不是**「让旧版本重新生效」——已发布版本不可改写。落地形态是：
 * 以当前生效版本为**修订源**（后端要求源版本 EFFECTIVE），把历史版本的配置填进向导，
 * 产出一个**新版本草稿**，再由用户走「提交审核 → 审核通过」。这也正是审计期望的形状：
 * 每一次「回到过去」都留下一条新纪录，而不是把历史抹掉。</p>
 * <p>底稿版本在向导里是 `?from=`，修订源是 `?id=`：两个参数不同即为回滚模式。</p>
 */
async function rollbackTo(source: ProductVersionVO) {
  const target = currentEffective.value
  if (!target) return ElMessage.warning('本版本线当前没有生效版本，无法回滚')
  const confirmed = await confirmAction(
    `将以「${source.version}」的配置为底稿，在生效版本「${target.version}」上生成新版本草稿。\n` +
      '该历史版本本身不会被改动；新版本仍需再走「提交审核 → 审核通过」才生效。',
    '回滚确认',
    { type: 'warning' },
  )
  if (!confirmed) return
  router.push(`/product/create?id=${target.productId}&from=${source.productId}`)
}

const handleSubmit = async (row: ProductVO) => {
  if (!(await confirmAction(`确认提交产品"${row.name}"审核？`, '提示', { type: 'warning' }))) return
  await run(actionKey(row.id, 'more'), async () => {
    await submitProductForReview(row.id)
    ElMessage.success('提交成功')
  })
}

// 审核通过：产品域无独立"上架/发布"态，审核通过(AUDITING→EFFECTIVE)即生效可售
const handleApprove = async (row: ProductVO) => {
  const ok = await confirmAction(
    `确认审核通过产品"${row.name}"？通过后产品即生效可售。`,
    '提示',
    { type: 'warning' },
  )
  if (!ok) return
  await run(actionKey(row.id, 'more'), async () => {
    const user = useUserStore().userInfo
    await approveProduct(row.id, { auditResult: 'PASS', auditOpinion: '审核通过', auditorId: user?.id, auditorName: user?.nickname })
    ElMessage.success('审核通过，产品已生效')
  })
}

// 驳回审核：AUDITING→DRAFT，退回修改
const handleReject = async (row: ProductVO) => {
  let input: { value: string } | null = null
  try {
    input = await ElMessageBox.prompt(`请输入驳回产品"${row.name}"的原因`, '驳回审核', {
      inputType: 'textarea',
      inputValidator: (v) => (v && v.trim() ? true : '驳回原因不能为空'),
    })
  } catch {
    return // 用户取消：prompt 同样以 reject 表达取消，必须吞掉
  }
  if (!input?.value) return
  await run(actionKey(row.id, 'more'), async () => {
    const user = useUserStore().userInfo
    await rejectProduct(row.id, { auditResult: 'REJECT', auditOpinion: input.value, auditorId: user?.id, auditorName: user?.nickname })
    ElMessage.success('已驳回')
  })
}

// 下架：EFFECTIVE→INVALID，停止新增投保
const handleDeactivate = async (row: ProductVO) => {
  const ok = await confirmAction(
    `确认下架产品"${row.name}"？此操作将停止新增投保。`,
    '警告',
    { type: 'warning', confirmButtonClass: 'el-button--danger' },
  )
  if (!ok) return
  await run(actionKey(row.id, 'more'), async () => {
    await deactivateProduct(row.id)
    ElMessage.success('下架成功')
  })
}

/** 操作列「更多」下拉派发：命令值即动作语义，与下拉项 command 一一对应 */
const runRowCommand = (row: ProductVO, command: string) => {
  const handlers: Record<string, (target: ProductVO) => void> = {
    submit: handleSubmit,
    approve: handleApprove,
    reject: handleReject,
    deactivate: handleDeactivate,
  }
  handlers[command]?.(row)
}

const handleExport = async () => {
  exporting.value = true
  try {
    // 服务端导出为 CSV（UTF-8 带 BOM，Excel 可直接打开），故扩展名须与响应格式一致
    const blob = await exportProducts(queryParams)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `产品列表_${new Date().toLocaleDateString()}.csv`
    a.click()
    // 延迟释放：立即 revoke 会使部分浏览器的下载中断
    setTimeout(() => URL.revokeObjectURL(url), 0)
  } catch {
    // 失败原因已由响应拦截器统一提示（含下游业务码语义），此处仅避免未捕获 rejection 导致「点了没反应」
    return
  } finally {
    exporting.value = false
  }
}
</script>

<style scoped lang="scss">
/* 版本历史抽屉（与费率表抽屉同形：同一份审计材料在两处长得一样，读者不必重新学怎么读） */
.history-tip { margin-bottom: $space-3; }
.history-actions {
  display: flex;
  align-items: center;
  gap: $space-3;
  margin: $space-3 0;
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
}
</style>
