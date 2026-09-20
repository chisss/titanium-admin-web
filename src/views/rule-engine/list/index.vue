<template>
  <div class="ti-page">
    <!-- 检索区（全站列表页三件套之首）：规则类型是真检索（走后端 type 入参），
         编码 / 名称 / 状态三项在前端过滤 —— 理由与证据见 load() 的注释 -->
    <TiSearchForm :model="query" @search="load" @reset="load">
      <!-- 规则类型**不给清空入口**：后端该入参是 @RequestParam(defaultValue = "PRICING")，
           但传空串并不等价于「全部类型」——下游 RuleSetType.fromCode("") 返回 null、直接查不到东西，
           界面于是渲染成一个「该类型下没有规则集」的假空态（真实原因是条件非法）。 -->
      <el-form-item label="规则类型"><TiDictSelect v-model="query.ruleSetType" dict-type="RULE_SET_TYPE" :clearable="false" class="ti-search-control-md" /></el-form-item>
      <el-form-item label="规则集编码"><el-input v-model="query.ruleSetCode" clearable placeholder="模糊匹配" class="ti-search-control-md" /></el-form-item>
      <el-form-item label="规则集名称"><el-input v-model="query.ruleSetName" clearable placeholder="模糊匹配" class="ti-search-control-md" /></el-form-item>
      <el-form-item label="状态"><TiDictSelect v-model="query.status" dict-type="RULE_SET_STATUS" placeholder="全部" class="ti-search-control-sm" /></el-form-item>
    </TiSearchForm>

    <!-- 主操作独居工具栏左侧：全站同类页的**单个**主操作一律放 ti-toolbar-left
         （放在右侧会被 space-between 推到最右，那是布局副作用、不是约定，先例见 product/rate-tables 的注记） -->
    <div class="ti-toolbar">
      <div class="ti-toolbar-left">
        <el-button type="primary" :icon="Plus" v-permission="'rule-engine:create'" @click="openCreate">新建规则集</el-button>
      </div>
      <div class="ti-toolbar-right"><el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button></div>
    </div>

    <!-- 🔴 不传 :total：TiTable 是**服务端分页**组件（它认定 :data 就是当前页、从不切片），
         而本接口一次返回所选类型下的**全量**规则集（证据链见 load() 注释）。
         若传 total，组件会渲染出一个真实存在的分页器，但翻到第 2 页取回的仍是同一批行 ——
         那正是「裸数组配服务端分页器＝假分页」。全量展示（不渲染分页器）才是这里的实话。
         :error 用上失败态：接口挂掉时界面必须说「加载失败」，而不是替用户断言「暂无规则集」 -->
    <TiTable
      :data="visibleRows"
      :loading="loading"
      :error="error"
      :max-height="'var(--ti-table-max-height-default)'"
      @refresh="load"
    >
      <el-table-column prop="ruleSetCode" label="规则集编码" min-width="150" class-name="ti-code-column" />
      <el-table-column prop="ruleSetName" label="名称" min-width="150" />
      <el-table-column prop="ruleSetVersion" label="版本" width="90" />
      <el-table-column label="类型" width="100"><template #default="{ row }">{{ typeLabel(row.ruleSetType) }}</template></el-table-column>
      <!-- 规则数已核实为**真计数**、不是恒为 0 的占位：列表接口确实返回 rules
           （读模型把累计规则序列化进 rulesJson 列，查询映射器再反序列化回 rules），
           而 rules 为空数组/缺列恰是「这条规则集确实没有规则」，取 0 是实话。
           计数型判据先确认「数的是不是那个对象」，此处数的是本行的规则。 -->
      <el-table-column label="规则数" width="80"><template #default="{ row }">{{ row.rules?.length ?? 0 }}</template></el-table-column>
      <el-table-column label="状态" width="90"><template #default="{ row }"><TiStatusTag :value="row.status" :label="statusLabel(row.status)" /></template></el-table-column>
      <!-- @vue-generic {RuleSet} -->
      <el-table-column label="操作" fixed="right" min-width="200" class-name="ti-action-column">
        <template #default="{ row }">
          <!-- 🔴 激活/停用的 v-if 与后端状态机**逐一对应**（不是照状态名顺手写的）：
               RuleSet 聚合的 ActivateRuleSetCommand 只接受 DRAFT/ACTIVE，DeactivateRuleSetCommand 只接受 ACTIVE，
               也就是说「已停用（INACTIVE）」在后端是**不可再激活**的（会报「只有草稿版本可发布」）。
               故 INACTIVE 行只留只读的「查看规则」，不给一个点了必报错的按钮。
               颜色依 COLOR-CONTRACT：激活属状态推进 → success，停用属破坏性 → danger，查看为中性导航 → 不加 type -->
          <el-button size="small" :icon="View" :loading="detailLoading === row.ruleSetId" @click="showDetail(row)">查看规则</el-button>
          <el-button v-if="row.status === 'DRAFT'" size="small" type="success" :icon="Select" v-permission="'rule-engine:toggle'" :loading="rowPending === actionKey(row.ruleSetId, 'toggle')" @click="toggle(row, true)">激活</el-button>
          <el-button v-if="row.status === 'ACTIVE'" size="small" type="danger" :icon="SwitchButton" v-permission="'rule-engine:toggle'" :loading="rowPending === actionKey(row.ruleSetId, 'toggle')" @click="toggle(row, false)">停用</el-button>
        </template>
      </el-table-column>
      <template #empty><el-empty :description="emptyText"><el-button type="primary" :icon="Plus" v-permission="'rule-engine:create'" @click="openCreate">新建规则集</el-button></el-empty></template>
    </TiTable>

    <el-dialog v-model="createVisible" title="新建规则集草稿" width="620px">
      <el-form ref="createFormRef" :model="form" :rules="createRules" label-width="120px">
        <el-form-item label="编码" prop="ruleSetCode"><el-input v-model="form.ruleSetCode" /></el-form-item>
        <el-form-item label="名称" prop="ruleSetName"><el-input v-model="form.ruleSetName" /></el-form-item>
        <el-form-item label="版本" prop="ruleSetVersion"><el-input v-model="form.ruleSetVersion" /></el-form-item>
        <el-form-item label="输入版本" prop="inputSchemaVersion"><el-input v-model="form.inputSchemaVersion" /></el-form-item>
        <el-form-item label="类型" prop="ruleSetType"><TiDictSelect v-model="form.ruleSetType" dict-type="RULE_SET_TYPE" :clearable="false" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="form.description" type="textarea" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="createVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="submitCreate">创建并配置规则</el-button></template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="规则集详情" size="72%">
      <el-descriptions :column="detailColumns" border>
        <el-descriptions-item label="编码">{{ detail?.ruleSetCode }}</el-descriptions-item>
        <el-descriptions-item label="名称">{{ detail?.ruleSetName }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ statusLabel(detail?.status || '') }}</el-descriptions-item>
        <el-descriptions-item label="版本">{{ detail?.ruleSetVersion || '-' }}</el-descriptions-item>
        <el-descriptions-item label="输入版本">{{ detail?.inputSchemaVersion || '-' }}</el-descriptions-item>
        <el-descriptions-item label="规则类型">{{ typeLabel(detail?.ruleSetType || '') }}</el-descriptions-item>
        <el-descriptions-item label="描述" :span="3">{{ detail?.description || '-' }}</el-descriptions-item>
        <el-descriptions-item v-if="detail?.artifactHash" label="工件哈希" :span="3"><span class="hash-text">{{ detail.artifactHash }}</span></el-descriptions-item>
      </el-descriptions>
      <div class="rule-toolbar"><el-divider content-position="left">规则定义</el-divider><el-button v-if="detail?.status === 'DRAFT'" type="primary" size="small" v-permission="'rule-engine:edit'" @click="openRuleDialog">追加规则</el-button></div>
      <!-- 抽屉内的规则明细表：局部数据、无分页，不收编 TiTable，只统一视觉语言
           （全站主表格语言 = 斑马纹 + 无纵向边框，与 TiTable 默认一致）。
           它不需要 v-loading：详情是**先取到再开抽屉**（见 showDetail），抽屉一打开数据就在手上，
           在途反馈落在触发按钮「查看规则」上 -->
      <el-table :data="detail?.rules || []" stripe>
        <el-table-column prop="priority" label="优先级" width="85" />
        <el-table-column prop="ruleName" label="规则名称" min-width="150" />
        <el-table-column label="条件表达式" min-width="190"><template #default="{ row }"><code>{{ row.condition || '恒真' }}</code></template></el-table-column>
        <el-table-column label="命中动作" width="105"><template #default="{ row }">{{ actionLabel(row.action) }}</template></el-table-column>
        <el-table-column label="计算表达式" min-width="210"><template #default="{ row }"><code>{{ row.computeExpression || '-' }}</code></template></el-table-column>
        <el-table-column label="动作参数" min-width="180"><template #default="{ row }"><span class="params-text">{{ formatParams(row.actionParams) }}</span></template></el-table-column>
        <template #empty><el-empty description="当前草稿暂无规则" :image-size="72" /></template>
      </el-table>
    </el-drawer>

    <el-dialog v-model="ruleVisible" title="追加规则" width="660px">
      <el-form ref="ruleFormRef" :model="ruleForm" :rules="ruleRules" label-width="120px">
        <el-form-item label="规则名称" prop="rule.ruleName"><el-input v-model="ruleForm.rule.ruleName" /></el-form-item>
        <el-form-item label="优先级" prop="rule.priority"><el-input-number v-model="ruleForm.rule.priority" :min="0" /></el-form-item>
        <el-form-item label="条件表达式" prop="rule.condition"><el-input v-model="ruleForm.rule.condition" placeholder="如 age < 60" /></el-form-item>
        <el-form-item label="命中动作" prop="rule.action"><TiDictSelect v-model="ruleForm.rule.action" dict-type="RULE_ACTION" :clearable="false" /></el-form-item>
        <el-form-item label="计算表达式" prop="rule.computeExpression"><el-input v-model="ruleForm.rule.computeExpression" placeholder="如 sumInsured * baseRate" /></el-form-item>
        <el-form-item label="动作参数" prop="actionParamsText"><el-input v-model="ruleForm.actionParamsText" type="textarea" placeholder="JSON 对象，可留空" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="ruleVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="submitRule">保存规则</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Plus, Refresh, Select, SwitchButton, View } from '@element-plus/icons-vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiTable from '@/components/TiTable/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import { useDetailColumns } from '@/composables/useDetailColumns'
import { useDict } from '@/composables/useDict'
import { useRowAction, actionKey, confirmAction } from '@/composables/useRowAction'
import { showErrorIfUnhandled } from '@/api/http'
import { activateRuleSet, addRule, createRuleSet, deactivateRuleSet, getRuleSet, listRuleSets, type RuleSet } from '@/api/rule-engine'

/**
 * 检索条件。键名与后端字段同名，便于与接口对照。
 *
 * <p>其中只有 `ruleSetType` 会真正发给后端（见 load 注释），其余三项由本页前端过滤。</p>
 */
const query = reactive({ ruleSetType: 'PRICING', ruleSetCode: '', ruleSetName: '', status: '' })
/** 后端返回的**全量**数据（当前类型下） */
const rows = ref<RuleSet[]>([])
/** 应用前端检索条件后交给表格的数据。与 rows 分开存是必要的：过滤发生在点「搜索」时，
 *  若直接把表格绑成 computed(query)，边打字边筛，那个「搜索」按钮就成了摆设（点不点都一样）。 */
const visibleRows = ref<RuleSet[]>([])
/** 本次生效的检索条件里是否含前端项（决定空态文案是「没匹配上」还是「确实没有」） */
const filtersApplied = ref(false)
const loading = ref(false)
/** 接口失败的对象；非空即进入失败态（TiTable 的失败态优先于空态） */
const error = ref<Error | null>(null)

const { getLabel: statusLabel } = useDict('RULE_SET_STATUS')
const { getLabel: typeLabel } = useDict('RULE_SET_TYPE')
const { getLabel: actionLabel } = useDict('RULE_ACTION')

const createVisible = ref(false); const detailVisible = ref(false); const detail = ref<RuleSet | null>(null); const ruleVisible = ref(false)
/**
 * 两个弹窗保存按钮共用的在途标志。
 *
 * 🔴 两个弹窗（新建规则集 / 追加规则）的 footer 按钮原先**没有任何 pending 绑定**：
 * 点下「创建并配置规则」后请求在途期间按钮纹丝不动，用户以为没点中而重复点击——
 * 规则集编码是唯一键，第二次点击会拿到一个「已存在」的报错。
 * 两个弹窗都是模态的、不可能同时在途，故共用一个布尔量即可（不需要按行/按弹窗区分）。
 */
const saving = ref(false)
/** 查看规则的在途行键：点击到抽屉打开之间有一次详情请求，期间按钮要给得出反馈 */
const detailLoading = ref<string | null>(null)
/** 描述区：字段短，宽屏 3 档（useDetailColumns 是本仓收敛用法） */
const detailColumns = useDetailColumns(3)

const ruleForm = reactive({ actionParamsText: '{}', rule: { ruleName: '', priority: 10, condition: '', action: 'PASS', computeExpression: '' } })
const form = reactive({ ruleSetCode: '', ruleSetName: '', ruleSetVersion: 'V1.0', inputSchemaVersion: 'V1.0', ruleSetType: 'PRICING', description: '' })
const formatParams = (value?: Record<string, unknown>) => value && Object.keys(value).length ? JSON.stringify(value) : '-'

/**
 * 空态文案。
 *
 * <p>「检索没匹配上」与「该类型下确实没有」是两回事，不能都写成「暂无数据」：
 * 前者要引导用户改条件（此时列表里本来是有数据的），后者才是可以新建的空集。</p>
 *
 * <p>字典尚未加载完时 `getLabel` 原样返回编码，此时不拼类型名（否则会出现「暂无 PRICING 类规则集」）。</p>
 */
const emptyText = computed(() => {
  if (filtersApplied.value) return '没有符合检索条件的规则集'
  const typeName = typeLabel(query.ruleSetType)
  return typeName === query.ruleSetType ? '暂无规则集' : `暂无${typeName}类规则集`
})

/** 把三项前端条件应用到全量数据上（为什么在前端过滤见 load 注释） */
function applyFilter() {
  const code = query.ruleSetCode.trim().toLowerCase()
  const name = query.ruleSetName.trim()
  const status = query.status
  filtersApplied.value = Boolean(code || name || status)
  visibleRows.value = rows.value.filter((row) =>
    (!code || (row.ruleSetCode || '').toLowerCase().includes(code))
    && (!name || (row.ruleSetName || '').includes(name))
    && (!status || row.status === status))
}

/**
 * 加载规则集。
 *
 * <p>🔴 已核实「本接口不分页」：它一次返回所选类型的**全量**数据。证据链
 * 前端 `src/api/rule-engine.ts` 的 `listRuleSets` 只带 `type` 一个 query 参数（无 page/size）
 * → admin `RuleEngineProxyController#listRuleSets` 入参同样只有 tenantId + type
 * → 下游规则引擎 `RuleEngineController#listRuleSets` 也只按 type 查读模型。
 * 请求未带分页参数时，代理层的 `ProxyResponseBodyAdvice` 按裸数组推断出的 total 就是全集条数，
 * 也就是说「本页条数 = 全集条数」——传不传 :total 都不改变「一屏即全部」这个事实，
 * 传了反而会造出一个翻页后原地不动的假分页器（见模板注释）。</p>
 *
 * <p>🔴 已核实「本接口不支持编码/名称/状态检索」：`type` 是后端唯一认得的入参，
 * 另外三个条件发过去会被**静默忽略**——用户点「搜索」后界面纹丝不动，
 * 得到一个「有按钮、没反应」的检索区（本仓反复出现的缺陷形态）。故这三项在本页前端过滤，
 * 先例与判据同 `src/views/system/role/index.vue`（该页后端列表同样不收检索条件）。</p>
 */
async function load() {
  loading.value = true
  try {
    const result = await listRuleSets(query.ruleSetType)
    rows.value = result.list || []
    error.value = null
    applyFilter()
  } catch (e) {
    // 失败与「确实没有数据」必须可区分：清空数据并置错误，界面才会说「加载失败」而不是「暂无规则集」
    rows.value = []
    visibleRows.value = []
    error.value = e instanceof Error ? e : new Error('规则集加载失败')
  } finally { loading.value = false }
}

/** 行内动作（激活/停用）的 pending 与错误兜底统一由 useRowAction 承担 */
const { rowPending, run } = useRowAction(load)

/**
 * 两个弹窗表单的实例与规则。
 * 🔴 原先两处都只有 `submitXxx` 里的一串 `if (!x) { ElMessage.warning() }`——判断本身是对的，
 * 但弹窗内 6 个字段同时摆在眼前时，全局消息条指不出**哪一个**框有问题。
 * 规则与这些 if 一一对应（判据不变，只是把结论落到字段上）。
 * `whitespace: true` 不可省：async-validator 默认只判「非空字符串」，一串空格能通过 required，
 * 而原 if 用的是隐式真值判断（空串为假、纯空白串为真）——这里取更严的一侧。
 */
const createFormRef = ref<FormInstance>()
const ruleFormRef = ref<FormInstance>()

const createRules: FormRules = {
  ruleSetCode: [{ required: true, whitespace: true, message: '请输入规则集编码', trigger: 'blur' }],
  ruleSetName: [{ required: true, whitespace: true, message: '请输入规则集名称', trigger: 'blur' }],
  ruleSetVersion: [{ required: true, whitespace: true, message: '请输入规则集版本', trigger: 'blur' }],
  inputSchemaVersion: [{ required: true, whitespace: true, message: '请输入输入版本', trigger: 'blur' }],
  ruleSetType: [{ required: true, message: '请选择规则类型', trigger: 'change' }],
}

/** 追加规则：规则名必填；计算表达式**仅定价规则**必填；动作参数必须是合法 JSON */
const ruleRules: FormRules = {
  'rule.ruleName': [{ required: true, whitespace: true, message: '请输入规则名称', trigger: 'blur' }],
  'rule.computeExpression': [{
    validator: (_r, v: string, cb) => {
      // 条件必填：判据取自原 submitRule —— 只有定价规则必须有计算表达式
      if (detail.value?.ruleSetType !== 'PRICING' || (v ?? '').trim()) return cb()
      cb(new Error('定价规则必须填写计算表达式'))
    },
    trigger: 'blur',
  }],
  actionParamsText: [{
    validator: (_r, v: string, cb) => {
      const text = (v ?? '').trim()
      if (!text) return cb()   // 可留空
      try { JSON.parse(text); cb() } catch { cb(new Error('动作参数必须是合法 JSON')) }
    },
    trigger: 'blur',
  }],
}

function openCreate() { form.ruleSetType = query.ruleSetType; createVisible.value = true }
async function submitCreate() {
  if (!(await createFormRef.value?.validate().then(() => true).catch(() => false))) return
  saving.value = true
  try {
    const createdCode = form.ruleSetCode
    await createRuleSet(form)
    createVisible.value = false; query.ruleSetType = form.ruleSetType
    ElMessage.success('规则集草稿已创建，请继续配置规则')
    await load(); detail.value = await getRuleSet(createdCode); detailVisible.value = true
  } finally { saving.value = false }
}
async function toggle(row: RuleSet, active: boolean) {
  const ok = await confirmAction(
    active ? '确认激活该规则集？' : '停用后将不能被出单流程调用，确认继续？',
    '状态变更确认',
    { type: 'warning' },
  )
  if (!ok) return
  // pending 键取 `行主键:动作名`（actionKey）：激活与停用按状态互斥、当前不会同时可见，
  // 但键里写清动作名既让 rowPending 自解释，也保证今后本行再加动作按钮时不会退化成「点一个另一个也转圈」
  await run(actionKey(row.ruleSetId, 'toggle'), async () => {
    if (active) await activateRuleSet(row.ruleSetId)
    else await deactivateRuleSet(row.ruleSetId)
    ElMessage.success(active ? '规则集已激活' : '规则集已停用')
    // 详情抽屉若正开着同一条规则集，其状态标签也要跟着更新——否则抽屉里还写着旧状态，
    // 与背后刚刷新的列表自相矛盾
    if (detail.value?.ruleSetId === row.ruleSetId) detail.value = await getRuleSet(row.ruleSetCode)
  })
}
/**
 * 查看规则：**先取到详情再开抽屉**。
 *
 * <p>取数期间在「查看规则」按钮上转圈（detailLoading 按行键绑定）：慢接口下点下去毫无动静，
 * 用户会以为没点中而重复点击。取不到就不开抽屉——否则抽屉里是一片空描述区，
 * 看起来像「这条规则集什么都没有」，而真相是这一次请求失败了。</p>
 */
async function showDetail(row: RuleSet) {
  detailLoading.value = row.ruleSetId
  try {
    detail.value = await getRuleSet(row.ruleSetCode)
    detailVisible.value = true
  } catch (e) {
    // 拦截器已弹过业务消息的不重复弹（同 useRowAction 口径）
    showErrorIfUnhandled(e)
  } finally { detailLoading.value = null }
}
function openRuleDialog() { ruleForm.rule.ruleName = ''; ruleForm.rule.priority = 10; ruleForm.rule.condition = ''; ruleForm.rule.action = 'PASS'; ruleForm.rule.computeExpression = ''; ruleForm.actionParamsText = '{}'; ruleVisible.value = true }
async function submitRule() {
  if (!detail.value) return
  if (!(await ruleFormRef.value?.validate().then(() => true).catch(() => false))) return
  // 合法性已由 actionParamsText 的 validator 保证，此处不再 try/catch
  const text = ruleForm.actionParamsText.trim()
  const actionParams: Record<string, unknown> = text ? JSON.parse(text) : {}
  saving.value = true
  try {
    await addRule(detail.value.ruleSetId, { rule: { ...ruleForm.rule, actionParams } })
    ruleVisible.value = false; ElMessage.success('规则已追加')
    detail.value = await getRuleSet(detail.value.ruleSetCode); await load()
  } finally { saving.value = false }
}
onMounted(load)
</script>

<style scoped lang="scss">
// 抽屉内「规则定义」标题行：分隔线占满剩余宽度，右侧留给「追加规则」按钮
.rule-toolbar { display: flex; align-items: center; justify-content: space-between; margin-top: $space-4; }
.rule-toolbar :deep(.el-divider) { flex: 1; margin-right: $space-4; }
.hash-text, code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
.params-text { word-break: break-all; }
</style>
