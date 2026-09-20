<template>
  <!-- 新建/编辑产品 - 分步向导 -->
  <div class="ti-page">
    <div class="ti-card">
      <div class="product-create__header">
        <h3>{{ isEdit ? '编辑产品' : '新建产品' }}</h3>
      </div>

      <!-- 步骤条 -->
      <el-steps :active="currentStep" finish-status="success" class="product-create__steps">
        <el-step title="基本信息" />
        <el-step title="险种配置" />
        <el-step title="费率规则" />
        <el-step title="文档配置" />
        <el-step title="确认提交" />
      </el-steps>

      <!-- 步骤内容 -->
      <div class="product-create__content">
        <!--
          🔴 五步一律用 v-show 而非 v-if（P0-3）：
          v-if 会在离开步骤时**卸载 el-form**，提交时 step1Ref/step2Ref/step3Ref 全为 undefined，
          `ref.value?.validate()` 因可选链**静默通过** —— 这正是「非法产品定义可直接落库」的机制。
          v-show 保持表单常驻（display:none），提交前才能逐步骤真正校验并让用户看到字段级红字。
          表单字段少（约 40 个 form-item），常驻渲染开销可忽略。
        -->
        <!-- 第一步：基本信息 -->
        <el-form
          v-show="currentStep === 0"
          ref="step1Ref"
          :model="form"
          :rules="step1Rules"
          label-width="120px"
          scroll-to-error
        >
          <el-form-item label="产品名称" prop="productName">
            <el-input v-model="form.productName" placeholder="请输入产品名称" style="width: 320px" />
          </el-form-item>
          <el-form-item label="产品代码" prop="productCode">
            <el-input v-model="form.productCode" placeholder="如：MED-HIGH-001" style="width: 220px" />
          </el-form-item>
          <el-form-item label="险种分类" prop="category">
            <TiDictSelect
              v-model="form.category"
              dict-type="INSURANCE_CATEGORY"
              style="width: 200px"
              @change="onCategoryChange"
            />
          </el-form-item>
          <el-form-item label="二级险种" prop="insuranceType">
            <el-select
              v-model="form.insuranceType"
              placeholder="请选择二级险种"
              :disabled="!form.category"
              style="width: 200px"
            >
              <el-option
                v-for="opt in insuranceTypeOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="产品形态" prop="form">
            <el-radio-group v-model="form.form">
              <el-radio-button value="INDIVIDUAL">个险</el-radio-button>
              <el-radio-button value="GROUP">团险</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="产品类别" prop="productCategory">
            <el-radio-group v-model="form.productCategory">
              <el-radio-button value="MAIN">主险</el-radio-button>
              <el-radio-button value="RIDER">附加险</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="产品描述">
            <el-input v-model="form.productDesc" type="textarea" :rows="4" style="width: 480px" />
          </el-form-item>
        </el-form>

        <!-- 第二步：险种配置 -->
        <el-form
          v-show="currentStep === 1"
          ref="step2Ref"
          :model="form"
          :rules="step2Rules"
          label-width="120px"
          scroll-to-error
        >
          <el-form-item label="产品模板" prop="templateId">
            <el-select
              v-model="form.templateId"
              placeholder="请选择产品模板（决定出单/核保/理赔流程）"
              style="width: 360px"
              :loading="templateLoading"
              no-data-text="该险种暂无可用模板，请先创建模板"
            >
              <el-option
                v-for="tpl in templates"
                :key="tpl.templateId"
                :label="`${tpl.templateName}（${tpl.templateCode}）`"
                :value="tpl.templateId"
              />
            </el-select>
            <el-button link type="primary" style="margin-left: 12px" @click="showTemplateDialog = true">
              + 新建模板
            </el-button>
          </el-form-item>

          <el-form-item label="绑定条款" prop="clauseIds">
            <el-select
              v-model="form.clauseIds"
              multiple
              placeholder="选择该产品承保的条款（至少一条）"
              style="width: 480px"
              :loading="clauseLoading"
              @change="onClauseSelectionChange"
            >
              <el-option
                v-for="c in clauses"
                :key="c.id"
                :label="`${c.name}（${c.code}）`"
                :value="c.id"
              />
            </el-select>
          </el-form-item>

          <el-form-item v-if="form.clauseIds && form.clauseIds.length" label="主条款" prop="mainClauseId">
            <el-select v-model="form.mainClauseId" placeholder="指定主条款" style="width: 360px">
              <el-option
                v-for="id in form.clauseIds"
                :key="id"
                :label="clauseLabel(id)"
                :value="id"
              />
            </el-select>
          </el-form-item>

          <!-- 保障责任预览：所选条款下的 Coverage -->
          <el-form-item v-if="coverages.length" label="保障责任">
            <el-table :data="coverages" size="small" border style="width: 640px" :max-height="260">
              <el-table-column prop="coverageName" label="责任名称" min-width="140" />
              <el-table-column prop="coverageType" label="类型" width="130" />
              <el-table-column label="保额/限额" width="130" align="right">
                <template #default="{ row }">
                  {{ formatAmount(row.coverageAmount ?? row.maxPayout) }}
                </template>
              </el-table-column>
              <el-table-column label="报销比例" width="100">
                <template #default="{ row }">
                  {{ row.reimbursementRatio != null ? (row.reimbursementRatio * 100).toFixed(0) + '%' : '-' }}
                </template>
              </el-table-column>
            </el-table>
          </el-form-item>

          <el-divider content-position="left">投保条件</el-divider>
          <el-form-item label="投保年龄" prop="insureCondition.maxAge">
            <el-input-number v-model="form.insureCondition.minAge" :min="0" :max="120" placeholder="最小" />
            <span style="margin: 0 8px">至</span>
            <el-input-number v-model="form.insureCondition.maxAge" :min="0" :max="120" placeholder="最大" />
            <span style="margin-left: 8px; color: var(--el-text-color-secondary)">周岁</span>
          </el-form-item>
          <el-form-item v-if="form.form === 'GROUP'" label="团体人数" prop="insureCondition.maxGroupSize">
            <el-input-number v-model="form.insureCondition.minGroupSize" :min="1" placeholder="最少" />
            <span style="margin: 0 8px">至</span>
            <el-input-number v-model="form.insureCondition.maxGroupSize" :min="1" placeholder="最多" />
            <span style="margin-left: 8px; color: var(--el-text-color-secondary)">人</span>
          </el-form-item>
          <el-form-item label="健康告知">
            <el-input
              v-model="form.insureCondition.healthNotice"
              type="textarea"
              :rows="2"
              placeholder="如：需如实告知既往病史、住院史等"
              style="width: 480px"
            />
          </el-form-item>

          <!-- 核保配置：产品级核保策略 + 规则引擎规则集联动绑定 -->
          <el-divider content-position="left">核保配置</el-divider>
          <el-form-item label="核保模式">
            <el-radio-group v-model="form.underwritingConfig.underwritingMode">
              <el-radio-button value="AUTO">自动核保</el-radio-button>
              <el-radio-button value="MANUAL">人工核保</el-radio-button>
              <el-radio-button value="SMART">智能核保</el-radio-button>
              <el-radio-button value="HYBRID">混合核保</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="核保规则集">
            <el-select
              v-model="form.underwritingConfig.ruleSetCode"
              placeholder="选择该产品核保流程使用的规则集（可不选）"
              clearable
              filterable
              style="width: 420px"
              :loading="ruleSetLoading"
              no-data-text="暂无核保规则集，请先到规则引擎创建"
            >
              <el-option
                v-for="rs in underwritingRuleSets"
                :key="rs.ruleSetCode"
                :label="`${rs.ruleSetName}（${rs.ruleSetCode}）`"
                :value="rs.ruleSetCode"
              />
            </el-select>
            <span style="margin-left: 10px; color: var(--el-text-color-secondary); font-size: 12px">
              未选择时核保域回退内置评分逻辑
            </span>
          </el-form-item>
          <el-form-item label="自动核保条件">
            <el-input
              v-model="form.underwritingConfig.autoApprovalCondition"
              type="textarea"
              :rows="2"
              placeholder="如：标准体且保额低于人工核保阈值时自动通过"
              style="width: 480px"
            />
          </el-form-item>
          <el-form-item label="转人工阈值">
            <el-input-number
              v-model="form.underwritingConfig.manualReviewAmountThreshold"
              :min="0"
              :step="10000"
              :precision="0"
              placeholder="保额超过该值转人工核保"
            />
            <span style="margin-left: 8px; color: var(--el-text-color-secondary)">元</span>
          </el-form-item>
          <el-form-item label="核保时效">
            <el-input-number
              v-model="form.underwritingConfig.underwritingSLADays"
              :min="1"
              :max="90"
              :precision="0"
              placeholder="核保完成时限"
            />
            <span style="margin-left: 8px; color: var(--el-text-color-secondary)">天</span>
          </el-form-item>
          <el-form-item label="必需材料">
            <!--
              受控词表：材料一律从 src/constants/material.ts 取，不给自由文本输入框。
              入库值取材料的 label：后端 UnderwritingConfig.requiredDocuments 是 List<String>，
              产品详情页按 `join('、')` 原样展示，存中文名才能读（存编码会显示成 ID_CARD）。
            -->
            <el-select
              v-model="form.underwritingConfig.requiredDocuments"
              multiple
              filterable
              collapse-tags
              collapse-tags-tooltip
              placeholder="选择核保需要的材料（可多选）"
              style="width: 480px"
            >
              <el-option v-for="opt in MATERIAL_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.label" />
            </el-select>
          </el-form-item>
          <el-form-item label="承保弹性">
            <el-switch v-model="form.underwritingConfig.surchargeAcceptable" active-text="支持加费承保" />
            <el-switch
              v-model="form.underwritingConfig.specialAgreementAcceptable"
              active-text="支持特别约定"
              style="margin-left: 24px"
            />
          </el-form-item>
        </el-form>

        <!-- 第三步：费率规则 -->
        <!--
          🔴 :model 取根对象 form 而非 form.pricingBasicRule：
          「定价模式」绑的是 form.pricingMode（不在 pricingBasicRule 内），
          若 model 只传子对象，el-form-item 会按相对路径去 pricingBasicRule 里取值 → 恒为 undefined → 永远误报。
          故 model 传根对象，rules 的键一律写全路径（pricingBasicRule.baseRate 等）。
        -->
        <el-form
          v-show="currentStep === 2"
          ref="step3Ref"
          :model="form"
          :rules="step3Rules"
          label-width="120px"
          scroll-to-error
        >
          <el-form-item label="定价类型" prop="pricingBasicRule.pricingType">
            <el-radio-group v-model="form.pricingBasicRule.pricingType">
              <el-radio-button value="FIXED">固定费率</el-radio-button>
              <el-radio-button value="STEP">阶梯费率</el-radio-button>
              <el-radio-button value="FACTOR">因子定价</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="定价模式" prop="pricingMode">
            <el-radio-group v-model="form.pricingMode">
              <el-radio-button value="RATE_TABLE">费率表</el-radio-button>
              <el-radio-button value="ACTUARIAL_FORMULA">精算公式</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="基础费率" prop="pricingBasicRule.baseRate">
            <el-input-number
              v-model="form.pricingBasicRule.baseRate"
              :min="0"
              :precision="4"
              :step="0.001"
              placeholder="如 0.0125"
            />
            <span style="margin-left: 8px; color: var(--el-text-color-secondary)">费率系数</span>
          </el-form-item>
          <el-form-item label="保费区间" prop="pricingBasicRule.maxPremium">
            <el-input-number v-model="form.pricingBasicRule.minPremium" :min="0" :precision="2" placeholder="最低" />
            <span style="margin: 0 8px">至</span>
            <el-input-number v-model="form.pricingBasicRule.maxPremium" :min="0" :precision="2" placeholder="最高" />
            <span style="margin-left: 8px; color: var(--el-text-color-secondary)">元</span>
          </el-form-item>
          <el-form-item v-if="form.pricingMode === 'RATE_TABLE'" label="费率表ID">
            <el-input v-model="form.pricingBasicRule.rateTableId" placeholder="关联费率表编码（可选）" style="width: 280px" />
          </el-form-item>
        </el-form>

        <!-- 第四步：文档配置（所需投保材料 + 生成文档模板，纯产品配置） -->
        <!--
          表格行的校验用 el-form-item 的**内联 :rules**（而非 form 级 rules）：
          行是动态增删的，form 级 rules 的键无法随行数变化；prop 只用于按路径取值与定位错误。
          :model 传 form.documentConfig，故 prop 写成 requiredMaterials.${index}.materialCode 形式（相对该 model）。
        -->
        <el-form
          v-show="currentStep === 3"
          ref="step4Ref"
          :model="form.documentConfig"
          label-width="0"
          class="product-create__doc"
          scroll-to-error
        >
          <el-divider content-position="left">所需投保材料</el-divider>
          <el-table :data="form.documentConfig.requiredMaterials" size="small" border style="width: 100%">
            <el-table-column label="材料编码" width="220">
              <template #default="{ row, $index }">
                <el-form-item
                  :prop="`requiredMaterials.${$index}.materialCode`"
                  :rules="materialCodeRules($index)"
                >
                  <!--
                    受控词表（禁用 allow-create）：材料只能从 src/constants/material.ts 选，
                    防止操作员录成「身份证 / 身份证明 / 身份证复印件」等无法聚类的写法。
                  -->
                  <el-select
                    v-model="row.materialCode"
                    placeholder="请选择材料"
                    filterable
                    size="small"
                    style="width: 100%"
                    @change="onMaterialChange(row)"
                  >
                    <el-option
                      v-for="opt in MATERIAL_OPTIONS"
                      :key="opt.value"
                      :label="`${opt.label}（${opt.value}）`"
                      :value="opt.value"
                    />
                  </el-select>
                </el-form-item>
              </template>
            </el-table-column>
            <el-table-column label="材料名称" min-width="180">
              <template #default="{ row }">
                <!-- 材料名称由所选编码唯一确定（一码一名），故只读展示，不做输入控件 -->
                <span class="product-create__material-name">{{ row.materialName || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="是否必需" width="90" align="center">
              <template #default="{ row }">
                <el-switch v-model="row.mandatory" />
              </template>
            </el-table-column>
            <el-table-column label="说明" min-width="180">
              <template #default="{ row }">
                <el-input v-model="row.description" placeholder="提交要求" size="small" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100" align="center" class-name="ti-action-column">
              <template #default="{ $index }">
                <el-button size="small" type="danger" :icon="Delete" @click="removeMaterial($index)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-button link type="primary" style="margin-top: 8px" @click="addMaterial">+ 添加材料</el-button>

          <el-divider content-position="left">生成文档模板</el-divider>
          <el-table :data="form.documentConfig.documentTemplates" size="small" border style="width: 100%">
            <el-table-column label="文档类型" width="180">
              <template #default="{ row, $index }">
                <el-form-item
                  :prop="`documentTemplates.${$index}.documentType`"
                  :rules="[{ required: true, message: '请选择文档类型', trigger: 'change' }]"
                >
                  <TiDictSelect v-model="row.documentType" dict-type="PRODUCT_DOCUMENT_TYPE" placeholder="选择类型" size="small" style="width: 100%" />
                </el-form-item>
              </template>
            </el-table-column>
            <el-table-column label="模板编码" width="150">
              <template #default="{ row, $index }">
                <el-form-item
                  :prop="`documentTemplates.${$index}.templateCode`"
                  :rules="[{ required: true, message: '请输入模板编码', trigger: 'blur' }]"
                >
                  <el-input v-model="row.templateCode" placeholder="模板编码" size="small" />
                </el-form-item>
              </template>
            </el-table-column>
            <el-table-column label="模板名称" min-width="160">
              <template #default="{ row, $index }">
                <el-form-item
                  :prop="`documentTemplates.${$index}.templateName`"
                  :rules="[{ required: true, message: '请输入模板名称', trigger: 'blur' }]"
                >
                  <el-input v-model="row.templateName" placeholder="模板名称" size="small" />
                </el-form-item>
              </template>
            </el-table-column>
            <el-table-column label="输出格式" width="110">
              <template #default="{ row }">
                <TiDictSelect v-model="row.outputFormat" dict-type="PRODUCT_DOCUMENT_FORMAT" :clearable="false" size="small" style="width: 100%" />
              </template>
            </el-table-column>
            <el-table-column label="自动生成" width="90" align="center">
              <template #default="{ row }">
                <el-switch v-model="row.autoGenerate" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100" align="center" class-name="ti-action-column">
              <template #default="{ $index }">
                <el-button size="small" type="danger" :icon="Delete" @click="removeDocTemplate($index)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-button link type="primary" style="margin-top: 8px" @click="addDocTemplate">+ 添加文档模板</el-button>
        </el-form>

        <!-- 第五步：确认提交（只读汇总，无输入项故无需校验；同样用 v-show 保持一致） -->
        <div v-show="currentStep === 4">
          <el-descriptions :column="detailColumns" border>
            <el-descriptions-item label="产品名称">{{ form.productName }}</el-descriptions-item>
            <el-descriptions-item label="产品代码">{{ form.productCode }}</el-descriptions-item>
            <el-descriptions-item label="险种分类">{{ form.category }}</el-descriptions-item>
            <el-descriptions-item label="二级险种">{{ insuranceTypeLabel(form.insuranceType) }}</el-descriptions-item>
            <el-descriptions-item label="产品形态">{{ form.form === 'GROUP' ? '团险' : '个险' }}</el-descriptions-item>
            <el-descriptions-item label="产品模板">{{ templateLabel(form.templateId) }}</el-descriptions-item>
            <el-descriptions-item label="绑定条款数">{{ form.clauseIds.length }}</el-descriptions-item>
            <el-descriptions-item label="投保年龄">
              {{ form.insureCondition.minAge ?? '-' }} ~ {{ form.insureCondition.maxAge ?? '-' }} 周岁
            </el-descriptions-item>
            <el-descriptions-item label="定价类型">{{ pricingTypeLabel }}</el-descriptions-item>
            <el-descriptions-item label="基础费率">{{ form.pricingBasicRule.baseRate ?? '-' }}</el-descriptions-item>
            <el-descriptions-item label="保费区间">
              {{ formatAmount(form.pricingBasicRule.minPremium) }} ~ {{ formatAmount(form.pricingBasicRule.maxPremium) }}
            </el-descriptions-item>
            <el-descriptions-item label="投保材料">{{ form.documentConfig.requiredMaterials.length }} 项</el-descriptions-item>
            <el-descriptions-item label="文档模板">{{ form.documentConfig.documentTemplates.length }} 个</el-descriptions-item>
            <el-descriptions-item label="核保模式">{{ underwritingModeLabel(form.underwritingConfig.underwritingMode) }}</el-descriptions-item>
            <el-descriptions-item label="核保规则集">
              {{ form.underwritingConfig.ruleSetCode ?? '未绑定（内置评分逻辑）' }}
            </el-descriptions-item>
            <el-descriptions-item label="转人工阈值">
              {{ formatAmount(form.underwritingConfig.manualReviewAmountThreshold) }}
            </el-descriptions-item>
            <el-descriptions-item label="核保必需材料">{{ form.underwritingConfig.requiredDocuments.length }} 项</el-descriptions-item>
          </el-descriptions>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="product-create__footer">
        <el-button v-if="currentStep > 0" @click="currentStep--">上一步</el-button>
        <el-button v-if="currentStep < 4" type="primary" @click="nextStep">下一步</el-button>
        <el-button v-if="currentStep === 4" type="primary" :loading="saving" @click="handleSave">
          {{ isEdit ? '保存修改' : '创建产品' }}
        </el-button>
        <el-button @click="$router.back()">取消</el-button>
      </div>
    </div>

    <!-- 新建模板对话框 -->
    <el-dialog v-model="showTemplateDialog" title="新建产品模板" width="480px">
      <el-form :model="templateForm" label-width="100px">
        <el-form-item label="模板名称">
          <el-input v-model="templateForm.templateName" placeholder="如：中高端医疗险模板" />
        </el-form-item>
        <el-form-item label="模板编码">
          <el-input v-model="templateForm.templateCode" placeholder="如：TPL-MED-001" />
        </el-form-item>
        <el-form-item label="出单模式">
          <TiDictSelect v-model="templateForm.issuanceMode" dict-type="ISSUANCE_MODE" :clearable="false" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showTemplateDialog = false">取消</el-button>
        <el-button type="primary" :loading="templateSaving" @click="handleCreateTemplate">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDetailColumns } from '@/composables/useDetailColumns'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormItemRule, FormRules } from 'element-plus'
import { Delete } from '@element-plus/icons-vue'
import {
  createProduct,
  getTemplatesByCategory,
  createTemplate,
  toTemplateInsuranceType,
  type CreateProductForm,
  type ProductTemplateVO,
  type RequiredMaterialForm,
} from '@/api/product'
import { getClauseList, getCoverages, type ClauseVO, type CoverageVO } from '@/api/clause'
import { listRuleSets, type RuleSet } from '@/api/rule-engine'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import { formatAmount } from '@/utils/format'
import { insuranceTypesOf, insuranceTypeLabel } from '@/constants/insurance'
import { MATERIAL_OPTIONS, materialLabel } from '@/constants/material'
import { useUserStore } from '@/stores/user'

/** 描述区：字段中短，宽屏 2 档 */
const detailColumns = useDetailColumns(2)

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

// 二级险种选项：随一级险种大类联动
const insuranceTypeOptions = computed(() => insuranceTypesOf(form.category))

const isEdit = computed(() => !!route.query.id)
const currentStep = ref(0)
const saving = ref(false)
const step1Ref = ref<FormInstance>()
const step2Ref = ref<FormInstance>()
const step3Ref = ref<FormInstance>()
const step4Ref = ref<FormInstance>()

/** 步骤标题：与模板 <el-step> 顺序一一对应，用于校验失败时定位提示 */
const STEP_TITLES = ['基本信息', '险种配置', '费率规则', '文档配置', '确认提交']

/**
 * 各步骤的表单实例，下标与 STEP_TITLES 对齐（第 5 步是只读汇总页，无表单）。
 * 🔴 必须配合模板的 v-show（而非 v-if）：v-if 会在离开步骤时卸载 el-form，
 * 提交时这里全是 undefined，`validate()` 被可选链静默跳过 —— 即 P0-3 的成因。
 */
const stepFormRefs = [step1Ref, step2Ref, step3Ref, step4Ref]

/** 校验指定步骤；该步无表单（如第 5 步只读汇总页）时视为通过。
 *  ⚠️ 这里的「无表单即通过」只对第 5 步成立——前 4 步的表单由 v-show 保证常驻，
 *  一旦有人改回 v-if，本函数会静默放行。提交路径（firstInvalidStep）因此**不**走这条放行。 */
const validateStep = async (step: number): Promise<boolean> => {
  const formRef = stepFormRefs[step]
  if (!formRef?.value) return true
  return formRef.value.validate().then(() => true).catch(() => false)
}

/**
 * 🔴 提交前的全步骤校验（P0-3 核心修复）。
 * 不能只校验「当前步」：提交按钮在第 5 步，而前 4 步的数据仍可被返回修改，
 * 且后端只硬校验 productName/productCode/templateId/clauseIds/insureCondition，
 * 对 pricingBasicRule 无任何校验 —— 空费率、倒挂的保费区间都会直接落库成脏数据。
 * 返回第一个不合格的步骤下标；全部通过返回 -1。
 *
 * 四步**写开而不循环**：提交是唯一的落库出口，这一步究竟校验了哪几步必须一眼可见。
 * 第 5 步（确认提交）是只读汇总页，无表单实例，故只校验前 4 步。
 *
 * 🔴 实例缺失时判为**不合格**（fail-closed）：`ref.value?.validate()` 的写法在实例缺失时
 * 可选链短路，`undefined.then` 要么抛错、要么被写成静默通过——后者正是 P0-3 的成因。
 */
const firstInvalidStep = async (): Promise<number> => {
  if (!step1Ref.value || !(await step1Ref.value.validate().then(() => true).catch(() => false))) return 0
  if (!step2Ref.value || !(await step2Ref.value.validate().then(() => true).catch(() => false))) return 1
  if (!step3Ref.value || !(await step3Ref.value.validate().then(() => true).catch(() => false))) return 2
  if (!step4Ref.value || !(await step4Ref.value.validate().then(() => true).catch(() => false))) return 3
  return -1
}

const form = reactive<CreateProductForm>({
  productName: '',
  productCode: '',
  category: undefined,
  insuranceType: undefined,
  form: 'INDIVIDUAL',
  productCategory: 'MAIN',
  productDesc: '',
  templateId: undefined,
  clauseIds: [],
  mainClauseId: undefined,
  insureCondition: { minAge: undefined, maxAge: undefined },
  pricingBasicRule: { pricingType: 'FIXED', baseRate: undefined, minPremium: undefined, maxPremium: undefined },
  pricingMode: 'RATE_TABLE',
  documentConfig: { requiredMaterials: [], documentTemplates: [] },
  // 核保配置：默认智能核保（规则引擎），阈值 50 万转人工
  underwritingConfig: {
    underwritingMode: 'SMART',
    autoApprovalCondition: '',
    manualReviewAmountThreshold: 500000,
    requiredDocuments: [],
    underwritingSLADays: 5,
    surchargeAcceptable: true,
    specialAgreementAcceptable: false,
    ruleSetCode: undefined,
  },
})

// 文档配置行操作
function addMaterial() {
  form.documentConfig.requiredMaterials.push({
    materialCode: '',
    materialName: '',
    mandatory: true,
    description: '',
  })
}
function removeMaterial(index: number) {
  form.documentConfig.requiredMaterials.splice(index, 1)
}

/**
 * 材料编码变更 → 回填材料名称。
 * 🔴 一个编码只对应一个固定中文名（见 @/constants/material），名称不由操作员维护：
 *    选完编码即写入，名称列只读展示；换编码时名称随之刷新，不会残留上一个材料的旧名。
 */
function onMaterialChange(row: RequiredMaterialForm) {
  row.materialName = materialLabel(row.materialCode)
}

/**
 * 材料行校验规则（表格内联 :rules，按行下标定位）。
 * ① 必选：控件已是受控下拉，trigger 用 change 而非 blur；
 * ② 同一材料不得重复添加：按整表比对——同一编码出现两次即两行都报错（值相等、下标不同）。
 *    行是动态增删的，form 级 rules 的固定键表达不了这种跨行约束。
 */
function materialCodeRules(index: number): FormItemRule[] {
  return [
    { required: true, message: '请选择材料', trigger: 'change' },
    {
      validator: (_rule, value: string, callback) => {
        if (!value) return callback()
        const duplicated = form.documentConfig.requiredMaterials.some(
          (item, i) => i !== index && item.materialCode === value,
        )
        callback(duplicated ? new Error('该材料已添加，请勿重复') : undefined)
      },
      trigger: 'change',
    },
  ]
}

// ===== 核保配置：核保规则集联动下拉 =====

/** 核保规则集列表（type=UNDERWRITING，规则引擎域 RuleSetType） */
const underwritingRuleSets = ref<RuleSet[]>([])
const ruleSetLoading = ref(false)

async function loadUnderwritingRuleSets() {
  ruleSetLoading.value = true
  try {
    const res = await listRuleSets('UNDERWRITING')
    underwritingRuleSets.value = res.list ?? []
  } catch {
    underwritingRuleSets.value = []
  } finally {
    ruleSetLoading.value = false
  }
}

const underwritingModeLabel = (v?: string) =>
  ({ AUTO: '自动核保', MANUAL: '人工核保', SMART: '智能核保', HYBRID: '混合核保' } as Record<string, string>)[v ?? ''] ?? '-'
function addDocTemplate() {
  form.documentConfig.documentTemplates.push({
    documentType: undefined,
    templateCode: '',
    templateName: '',
    outputFormat: 'PDF',
    autoGenerate: true,
  })
}
function removeDocTemplate(index: number) {
  form.documentConfig.documentTemplates.splice(index, 1)
}

const step1Rules: FormRules = {
  productName: [{ required: true, message: '请输入产品名称', trigger: 'blur' }],
  productCode: [{ required: true, message: '请输入产品代码', trigger: 'blur' }],
  category: [{ required: true, message: '请选择险种分类', trigger: 'change' }],
  insuranceType: [{ required: true, message: '请选择二级险种', trigger: 'change' }],
}
const step2Rules: FormRules = {
  templateId: [{ required: true, message: '请选择产品模板', trigger: 'change' }],
  clauseIds: [
    {
      required: true,
      validator: (_r, v, cb) => (v && v.length ? cb() : cb(new Error('请至少绑定一条条款'))),
      trigger: 'change',
    },
  ],
  // 区间类字段：el-input-number 的 :min/:max 只管单值范围，管不到「下限 > 上限」这种跨字段非法组合
  'insureCondition.maxAge': [
    {
      validator: (_r, v, cb) => (v == null || form.insureCondition.minAge == null || v >= form.insureCondition.minAge
        ? cb()
        : cb(new Error('投保年龄上限不得低于下限'))),
      trigger: 'change',
    },
  ],
  'insureCondition.maxGroupSize': [
    {
      validator: (_r, v, cb) => (v == null || form.insureCondition.minGroupSize == null || v >= form.insureCondition.minGroupSize
        ? cb()
        : cb(new Error('团体人数上限不得低于下限'))),
      trigger: 'change',
    },
  ],
}

/**
 * 费率规则（第 3 步）。键一律写**相对于 form 的全路径**——该表单的 :model 是根对象 form。
 * 🔴 baseRate 设必填的依据：后端 toCreateProductPayload 的硬校验只覆盖
 * productName/productCode/templateId/clauseIds/insureCondition，**不含 pricingBasicRule**；
 * 而三种定价类型（FIXED/STEP/FACTOR）都以 baseRate 为基准，留空即落库成无法计费的脏数据。
 */
const step3Rules: FormRules = {
  'pricingBasicRule.pricingType': [{ required: true, message: '请选择定价类型', trigger: 'change' }],
  pricingMode: [{ required: true, message: '请选择定价模式', trigger: 'change' }],
  'pricingBasicRule.baseRate': [
    { required: true, type: 'number', message: '请输入基础费率', trigger: 'change' },
  ],
  // 保费区间非必填，但两者都填时必须下限 ≤ 上限
  'pricingBasicRule.maxPremium': [
    {
      validator: (_r, v, cb) => (v == null || form.pricingBasicRule.minPremium == null || v >= form.pricingBasicRule.minPremium
        ? cb()
        : cb(new Error('保费上限不得低于下限'))),
      trigger: 'change',
    },
  ],
}

// ===== 模板 =====
const templates = ref<ProductTemplateVO[]>([])
const templateLoading = ref(false)
const showTemplateDialog = ref(false)
const templateSaving = ref(false)
const templateForm = reactive({ templateName: '', templateCode: '', issuanceMode: 'TWO_STEP' })

async function loadTemplates() {
  if (!form.category) return
  templateLoading.value = true
  try {
    templates.value = (await getTemplatesByCategory(form.category)).filter((t) => t.status === 'ACTIVE')
  } catch {
    templates.value = []
  } finally {
    templateLoading.value = false
  }
}

// ===== 条款 =====
const clauses = ref<ClauseVO[]>([])
const clauseLoading = ref(false)
const coverages = ref<CoverageVO[]>([])

async function loadClauses() {
  clauseLoading.value = true
  try {
    const res = await getClauseList({ pageNum: 1, pageSize: 100 })
    // 仅展示 ACTIVE 条款供绑定
    clauses.value = (res.list ?? []).filter((c) => c.status === 'ACTIVE')
  } catch {
    clauses.value = []
  } finally {
    clauseLoading.value = false
  }
}

async function onClauseSelectionChange(ids: string[]) {
  // 默认主条款取第一条
  if (ids.length && !form.mainClauseId) form.mainClauseId = ids[0]
  if (form.mainClauseId && !ids.includes(form.mainClauseId)) form.mainClauseId = ids[0]
  // 汇总所选条款的保障责任预览
  const all: CoverageVO[] = []
  for (const id of ids) {
    try {
      const cs = await getCoverages(id)
      all.push(...(cs ?? []))
    } catch {
      /* 单条失败不阻断预览 */
    }
  }
  coverages.value = all
}

function onCategoryChange() {
  // 险种分类变化：重置二级险种与模板选择并重新加载
  form.insuranceType = undefined
  form.templateId = undefined
  loadTemplates()
}

// ===== 展示辅助 =====
function clauseLabel(id?: string) {
  const c = clauses.value.find((x) => x.id === id)
  return c ? `${c.name}（${c.code}）` : (id ?? '')
}
function templateLabel(id?: string) {
  const t = templates.value.find((x) => x.templateId === id)
  return t ? `${t.templateName}（${t.templateCode}）` : (id ?? '-')
}
const pricingTypeLabel = computed(() => {
  const m: Record<string, string> = { FIXED: '固定费率', STEP: '阶梯费率', FACTOR: '因子定价' }
  return form.pricingBasicRule.pricingType ? m[form.pricingBasicRule.pricingType] : '-'
})

const nextStep = async () => {
  // 每一步都先校验当前步（原先只校验了第 1、2 步，第 3、4 步可任意跳过）
  if (!(await validateStep(currentStep.value))) return
  if (currentStep.value === 0) {
    // 进入险种配置：加载模板、条款与核保规则集（联动下拉数据源）
    await Promise.all([loadTemplates(), loadClauses(), loadUnderwritingRuleSets()])
  }
  currentStep.value++
}

async function handleCreateTemplate() {
  if (!templateForm.templateName || !templateForm.templateCode) {
    ElMessage.warning('请填写模板名称与编码')
    return
  }
  const insuranceType = toTemplateInsuranceType(form.category)
  if (!insuranceType) {
    ElMessage.warning('请先在第一步选择险种分类')
    return
  }
  templateSaving.value = true
  try {
    await createTemplate({
      templateCode: templateForm.templateCode,
      templateName: templateForm.templateName,
      insuranceType,
      issuanceMode: templateForm.issuanceMode,
    })
    ElMessage.success('模板创建成功')
    showTemplateDialog.value = false
    await loadTemplates()
  } finally {
    templateSaving.value = false
  }
}

const handleSave = async () => {
  // 🔴 提交前逐步骤校验（P0-3 核心修复，原先这里零校验直接落库）。
  // 校验放在 saving 置位之前：失败即 return，不能把提交按钮卡在 loading 态。
  const invalidStep = await firstInvalidStep()
  if (invalidStep >= 0) {
    // 跳回第一个出错的步骤；等它由 display:none 变为可见后再校验一次，
    // 以便 el-form 的 scroll-to-error 能把用户滚到具体字段（隐藏元素滚不动）
    currentStep.value = invalidStep
    await nextTick()
    await validateStep(invalidStep)
    ElMessage.warning(`第 ${invalidStep + 1} 步「${STEP_TITLES[invalidStep]}」还有未填写或不合规的内容，请检查`)
    return
  }
  saving.value = true
  try {
    // 落库当前登录用户为创建人（后端无用户上下文，沿用 customer 域约定：由前端随请求体传入 createdBy）
    await createProduct({ ...form, createdBy: userStore.displayName })
    ElMessage.success('创建成功')
    router.push('/product/list')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped lang="scss">
.product-create {
  &__header {
    margin-bottom: 24px;

    h3 {
      margin: 0;
      font-size: 18px;
      color: $text-primary;
    }
  }

  &__steps {
    margin-bottom: 32px;
  }

  &__content {
    min-height: 280px;
    padding: 8px 0 24px;
  }

  &__footer {
    display: flex;
    gap: 12px;
    padding-top: 16px;
    border-top: 1px solid $border-color;
  }

  // 文档配置「材料名称」列：由所选材料编码带出，只读展示（弱化为说明文字，无输入控件）
  &__material-name {
    color: $text-secondary;
    font-size: $font-size-sm;
  }

  // 文档配置：校验项嵌在表格单元格里，去掉 EP 默认的 18px 下边距以免撑高行高。
  // 错误文案由 .el-form-item__error 绝对定位呈现，不占布局空间，故去掉边距不影响报错显示。
  &__doc {
    :deep(.el-form-item) {
      margin-bottom: 0;
    }
  }
}
</style>
