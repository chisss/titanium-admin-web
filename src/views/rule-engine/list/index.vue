<template>
  <div class="ti-page">
    <div class="page-intro"><h2>规则集管理</h2><p>统一维护核保、定价、理赔和保全规则。规则发布前请先验证输入特征与执行结果。</p></div>
    <div class="ti-toolbar">
      <el-form inline>
        <el-form-item label="规则类型"><el-select v-model="type" style="width: 150px" @change="load"><el-option v-for="item in types" :key="item.value" v-bind="item" /></el-select></el-form-item>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
      </el-form>
      <el-button type="primary" v-permission="'rule-engine:create'" @click="openCreate">新建规则集</el-button>
    </div>
    <el-table v-loading="loading" :data="ruleSets" border>
      <el-table-column prop="ruleSetCode" label="规则集编码" min-width="170" />
      <el-table-column prop="ruleSetName" label="名称" min-width="160" />
      <el-table-column prop="ruleSetVersion" label="版本" width="110" />
      <el-table-column label="类型" width="110"><template #default="{ row }">{{ typeLabel(row.ruleSetType) }}</template></el-table-column>
      <el-table-column label="规则数" width="90"><template #default="{ row }">{{ row.rules?.length || 0 }}</template></el-table-column>
      <el-table-column label="状态" width="110"><template #default="{ row }"><TiStatusTag :value="row.status" :label="statusLabel(row.status)" /></template></el-table-column>
      <el-table-column label="操作" fixed="right" width="260">
        <template #default="{ row }"><el-button link @click="showDetail(row)">查看规则</el-button><el-button v-if="row.status === 'DRAFT'" link type="success" v-permission="'rule-engine:toggle'" @click="toggle(row, true)">激活</el-button><el-button v-if="row.status === 'ACTIVE'" link type="warning" v-permission="'rule-engine:toggle'" @click="toggle(row, false)">停用</el-button></template>
      </el-table-column>
      <template #empty><el-empty :description="`暂无${typeLabel(type)}规则集`"><el-button type="primary" v-permission="'rule-engine:create'" @click="openCreate">新建规则集</el-button></el-empty></template>
    </el-table>

    <el-dialog v-model="createVisible" title="新建规则集草稿" width="620px">
      <el-form :model="form" label-width="110px">
        <el-form-item label="编码"><el-input v-model="form.ruleSetCode" /></el-form-item>
        <el-form-item label="名称"><el-input v-model="form.ruleSetName" /></el-form-item>
        <el-form-item label="版本"><el-input v-model="form.ruleSetVersion" /></el-form-item>
        <el-form-item label="输入版本"><el-input v-model="form.inputSchemaVersion" /></el-form-item>
        <el-form-item label="类型"><el-select v-model="form.ruleSetType"><el-option v-for="item in types" :key="item.value" v-bind="item" /></el-select></el-form-item>
        <el-form-item label="描述"><el-input v-model="form.description" type="textarea" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="createVisible = false">取消</el-button><el-button type="primary" @click="submitCreate">创建并配置规则</el-button></template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="规则集详情" size="72%">
      <el-descriptions :column="3" border>
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
      <el-table :data="detail?.rules || []" border>
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
      <el-form :model="ruleForm" label-width="110px">
        <el-form-item label="规则名称"><el-input v-model="ruleForm.rule.ruleName" /></el-form-item>
        <el-form-item label="优先级"><el-input-number v-model="ruleForm.rule.priority" :min="0" /></el-form-item>
        <el-form-item label="条件表达式"><el-input v-model="ruleForm.rule.condition" placeholder="如 age < 60" /></el-form-item>
        <el-form-item label="命中动作"><el-select v-model="ruleForm.rule.action"><el-option label="通过" value="PASS" /><el-option label="拒绝" value="REJECT" /><el-option label="人工复核" value="REFER" /></el-select></el-form-item>
        <el-form-item label="计算表达式"><el-input v-model="ruleForm.rule.computeExpression" placeholder="如 sumInsured * baseRate" /></el-form-item>
        <el-form-item label="动作参数"><el-input v-model="ruleForm.actionParamsText" type="textarea" placeholder="JSON 对象，可留空" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="ruleVisible = false">取消</el-button><el-button type="primary" @click="submitRule">保存规则</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import { activateRuleSet, addRule, createRuleSet, deactivateRuleSet, getRuleSet, listRuleSets, type RuleSet } from '@/api/rule-engine'

const type = ref('PRICING'); const loading = ref(false); const ruleSets = ref<RuleSet[]>([]); const createVisible = ref(false); const detailVisible = ref(false); const detail = ref<RuleSet | null>(null); const ruleVisible = ref(false)
const ruleForm = reactive({ actionParamsText: '{}', rule: { ruleName: '', priority: 10, condition: '', action: 'PASS', computeExpression: '' } })
const types = [{ label: '定价', value: 'PRICING' }, { label: '核保', value: 'UNDERWRITING' }, { label: '校验', value: 'VALIDATION' }, { label: '理赔', value: 'CLAIM' }, { label: '保全', value: 'MAINTENANCE' }]
const form = reactive({ ruleSetCode: '', ruleSetName: '', ruleSetVersion: 'V1.0', inputSchemaVersion: 'V1.0', ruleSetType: 'PRICING', description: '' })
const statusLabel = (value: string) => ({ DRAFT: '草稿', ACTIVE: '已激活', INACTIVE: '已停用' }[value] || value)
const typeLabel = (value: string) => types.find((item) => item.value === value)?.label || value
const actionLabel = (value: string) => ({ PASS: '通过', REJECT: '拒绝', REFER: '人工复核' }[value] || value)
const formatParams = (value?: Record<string, unknown>) => value && Object.keys(value).length ? JSON.stringify(value) : '-'

async function load() { loading.value = true; try { const result = await listRuleSets(type.value); ruleSets.value = result.list || [] } finally { loading.value = false } }
function openCreate() { form.ruleSetType = type.value; createVisible.value = true }
async function submitCreate() { if (!form.ruleSetCode || !form.ruleSetName || !form.ruleSetVersion || !form.inputSchemaVersion) return ElMessage.warning('请补齐规则集编码、名称和版本信息'); const createdCode = form.ruleSetCode; await createRuleSet(form); createVisible.value = false; type.value = form.ruleSetType; ElMessage.success('规则集草稿已创建，请继续配置规则'); await load(); detail.value = await getRuleSet(createdCode); detailVisible.value = true }
async function toggle(row: unknown, active: boolean) { const ruleSet = row as RuleSet; await ElMessageBox.confirm(active ? '确认激活该规则集？' : '停用后将不能被出单流程调用，确认继续？', '状态变更确认', { type: 'warning' }); if (active) await activateRuleSet(ruleSet.ruleSetId); else await deactivateRuleSet(ruleSet.ruleSetId); ElMessage.success(active ? '规则集已激活' : '规则集已停用'); await load(); if (detail.value?.ruleSetId === ruleSet.ruleSetId) detail.value = await getRuleSet(ruleSet.ruleSetCode) }
async function showDetail(row: unknown) { const ruleSet = row as RuleSet; detail.value = await getRuleSet(ruleSet.ruleSetCode); detailVisible.value = true }
function openRuleDialog() { ruleForm.rule.ruleName = ''; ruleForm.rule.priority = 10; ruleForm.rule.condition = ''; ruleForm.rule.action = 'PASS'; ruleForm.rule.computeExpression = ''; ruleForm.actionParamsText = '{}'; ruleVisible.value = true }
async function submitRule() { if (!detail.value) return; if (!ruleForm.rule.ruleName) return ElMessage.warning('请填写规则名称'); if (detail.value.ruleSetType === 'PRICING' && !ruleForm.rule.computeExpression) return ElMessage.warning('定价规则必须填写计算表达式'); let actionParams: Record<string, unknown> = {}; try { actionParams = ruleForm.actionParamsText.trim() ? JSON.parse(ruleForm.actionParamsText) : {} } catch { return ElMessage.warning('动作参数必须是合法 JSON') } await addRule(detail.value.ruleSetId, { rule: { ...ruleForm.rule, actionParams } }); ruleVisible.value = false; ElMessage.success('规则已追加'); detail.value = await getRuleSet(detail.value.ruleSetCode); await load() }
load()
</script>

<style scoped>
.page-intro { margin-bottom: 18px; }
h2 { margin: 0 0 8px; }
p { color: var(--ti-text-secondary, #86909c); margin: 0; }
.rule-toolbar { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; }
.rule-toolbar :deep(.el-divider) { flex: 1; margin-right: 16px; }
.hash-text, code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
.params-text { word-break: break-all; }
</style>
