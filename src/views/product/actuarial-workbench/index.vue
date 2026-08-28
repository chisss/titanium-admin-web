<template>
  <div class="actuarial-page ti-page">
    <div class="page-heading">
      <div>
        <h2>精算工作台</h2>
        <p>按产品维护费用语义和计算依赖，发布后由定价包固定引用。</p>
      </div>
      <div class="asset-links">
        <el-button v-permission="'product:actuarial:edit'" @click="policyVisible = true">显示策略</el-button>
        <el-button @click="router.push('/product/rate-tables')">费率表</el-button>
        <el-button @click="router.push('/product/pricing-plans')">定价包</el-button>
        <el-button @click="router.push('/rule-engine/list')">规则集</el-button>
      </div>
    </div>

    <div class="context-bar">
      <el-form inline>
        <el-form-item label="产品">
          <el-select v-model="productId" filterable placeholder="选择产品" class="product-select" @change="loadAssets">
            <el-option v-for="product in products" :key="product.id" :label="`${product.name} (${product.code})`" :value="product.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态"><TiDictSelect v-model="status" dict-type="CONFIG_LIFECYCLE_STATUS" class="status-select" @change="loadAssets" /></el-form-item>
        <el-button :icon="Refresh" :loading="loading" aria-label="刷新精算配置" @click="loadAssets" />
      </el-form>
      <div v-if="currentProduct" class="context-meta">
        <span>{{ currentProduct.code }}</span><span>版本 {{ currentProduct.version || '-' }}</span>
      </div>
    </div>

    <el-alert v-if="!productId" title="请选择产品后维护精算配置。" type="info" :closable="false" />
    <el-tabs v-else v-model="activeTab" class="workbench-tabs">
      <el-tab-pane name="components">
        <template #label>费用项 <el-badge :value="components.length" type="info" /></template>
        <div class="tab-toolbar">
          <span>每个费用项固定分类、方向、承担方和账务归属。</span>
          <el-button type="primary" v-permission="'product:actuarial:edit'" @click="openComponentCreate">新建费用项</el-button>
        </div>
        <el-table v-loading="loading" :data="components" border>
          <el-table-column prop="componentCode" label="费用项编码" min-width="150" />
          <el-table-column prop="componentVersion" label="版本" width="90" />
          <el-table-column prop="componentName" label="名称" min-width="150" />
          <el-table-column label="分类" width="130"><template #default="{ row }">{{ labelOf(categoryOptions, row.category) }}</template></el-table-column>
          <el-table-column label="金额通道" width="110"><template #default="{ row }"><el-tag :type="row.amountChannel === 'INTERNAL_COST' ? 'warning' : 'primary'" effect="plain">{{ labelOf(channelOptions, row.amountChannel) }}</el-tag></template></el-table-column>
          <el-table-column label="方向" width="90"><template #default="{ row }">{{ labelOf(directionOptions, row.direction) }}</template></el-table-column>
          <el-table-column label="承担方" width="100"><template #default="{ row }">{{ labelOf(payerOptions, row.payerType) }}</template></el-table-column>
          <el-table-column prop="accountingClass" label="账务分类" min-width="140" />
          <el-table-column label="状态" width="100"><template #default="{ row }"><TiStatusTag :value="row.status" :label="statusLabel(row.status)" /></template></el-table-column>
          <el-table-column label="操作" fixed="right" width="220">
            <template #default="{ row }">
              <el-button link @click="showComponent(row)">查看</el-button>
              <el-button v-if="row.status === 'DRAFT'" link v-permission="'product:actuarial:edit'" @click="transitionComponent(row, 'approve')">审批</el-button>
              <el-button v-if="row.status === 'APPROVED'" link type="success" v-permission="'product:actuarial:edit'" @click="transitionComponent(row, 'publish')">发布</el-button>
              <el-button v-if="row.status === 'PUBLISHED'" link type="danger" v-permission="'product:actuarial:edit'" @click="transitionComponent(row, 'retire')">退役</el-button>
            </template>
          </el-table-column>
          <template #empty><el-empty description="当前产品暂无费用项"><el-button type="primary" v-permission="'product:actuarial:edit'" @click="openComponentCreate">新建费用项</el-button></el-empty></template>
        </el-table>
      </el-tab-pane>

      <el-tab-pane name="models">
        <template #label>计算模型 <el-badge :value="models.length" type="info" /></template>
        <div class="tab-toolbar">
          <span>节点按依赖顺序计算；内部成本节点不进入客户应付输出。</span>
          <el-button type="primary" v-permission="'product:actuarial:edit'" @click="openModelCreate">新建计算模型</el-button>
        </div>
        <el-table v-loading="loading" :data="models" border>
          <el-table-column prop="modelCode" label="模型编码" min-width="160" />
          <el-table-column prop="modelVersion" label="版本" width="90" />
          <el-table-column prop="modelName" label="名称" min-width="180" />
          <el-table-column prop="currency" label="币种" width="80" />
          <el-table-column label="规模" width="130"><template #default="{ row }">{{ row.nodes.length }} 节点 / {{ row.edges.length }} 依赖</template></el-table-column>
          <el-table-column prop="effectiveFrom" label="生效时间" min-width="170" />
          <el-table-column label="状态" width="100"><template #default="{ row }"><TiStatusTag :value="row.status" :label="statusLabel(row.status)" /></template></el-table-column>
          <el-table-column label="操作" fixed="right" width="220">
            <template #default="{ row }">
              <el-button link @click="showModel(row)">查看</el-button>
              <el-button v-if="row.status === 'DRAFT'" link v-permission="'product:actuarial:edit'" @click="transitionModel(row, 'approve')">审批</el-button>
              <el-button v-if="row.status === 'APPROVED'" link type="success" v-permission="'product:actuarial:edit'" @click="transitionModel(row, 'publish')">发布</el-button>
              <el-button v-if="row.status === 'PUBLISHED'" link type="danger" v-permission="'product:actuarial:edit'" @click="transitionModel(row, 'retire')">退役</el-button>
            </template>
          </el-table-column>
          <template #empty><el-empty description="当前产品暂无计算模型"><el-button type="primary" v-permission="'product:actuarial:edit'" @click="openModelCreate">新建计算模型</el-button></el-empty></template>
        </el-table>
      </el-tab-pane>

      <el-tab-pane name="taxes">
        <template #label>税费策略 <el-badge :value="taxPolicies.length" type="info" /></template>
        <div class="tab-toolbar">
          <span>税费以独立版本维护，定价包只引用已发布版本；法规依据和价内外模式随计算事实留痕。</span>
          <el-button type="primary" v-permission="'product:actuarial:edit'" @click="openTaxPolicyCreate">新建税费策略</el-button>
        </div>
        <el-table v-loading="loading" :data="taxPolicies" border>
          <el-table-column prop="policyCode" label="策略编码" min-width="150" />
          <el-table-column prop="policyVersion" label="版本" width="90" />
          <el-table-column prop="policyName" label="名称" min-width="170" />
          <el-table-column prop="jurisdictionCode" label="司法辖区" width="110" />
          <el-table-column label="税率" width="90"><template #default="{ row }">{{ percentText(row.taxRate) }}</template></el-table-column>
          <el-table-column label="模式" width="100"><template #default="{ row }">{{ taxPriceModeLabel(row.priceMode) }}</template></el-table-column>
          <el-table-column prop="regulatoryReferenceId" label="法规依据" min-width="150" />
          <el-table-column label="状态" width="100"><template #default="{ row }"><TiStatusTag :value="row.status" :label="statusLabel(row.status)" /></template></el-table-column>
          <el-table-column label="操作" fixed="right" width="230">
            <template #default="{ row }">
              <el-button link @click="showTaxPolicy(row)">查看</el-button>
              <el-button v-if="row.status === 'DRAFT'" link v-permission="'product:actuarial:edit'" @click="transitionTaxPolicy(row, 'approve')">审批</el-button>
              <el-button v-if="row.status === 'APPROVED'" link type="success" v-permission="'product:actuarial:edit'" @click="transitionTaxPolicy(row, 'publish')">发布</el-button>
              <el-button v-if="row.status === 'PUBLISHED'" link type="danger" v-permission="'product:actuarial:edit'" @click="transitionTaxPolicy(row, 'retire')">退役</el-button>
            </template>
          </el-table-column>
          <template #empty><el-empty description="当前产品暂无税费策略"><el-button type="primary" v-permission="'product:actuarial:edit'" @click="openTaxPolicyCreate">新建税费策略</el-button></el-empty></template>
        </el-table>
      </el-tab-pane>

      <el-tab-pane name="factors">
        <template #label>动态因子 <el-badge :value="dynamicFactors.length" type="info" /></template>
        <div class="tab-toolbar">
          <span>将 Feature Center 固化特征变换为规则引擎可用的数值因子。</span>
          <el-button type="primary" v-permission="'product:actuarial:edit'" @click="openDynamicFactorCreate">新建动态因子</el-button>
        </div>
        <el-table v-loading="loading" :data="dynamicFactors" border>
          <el-table-column prop="factorCode" label="因子编码" min-width="150" />
          <el-table-column prop="factorVersion" label="版本" width="90" />
          <el-table-column prop="factorName" label="名称" min-width="160" />
          <el-table-column prop="featureCode" label="特征编码" min-width="150" />
          <el-table-column prop="featureDefinitionVersion" label="特征版本" width="110" />
          <el-table-column label="变换" min-width="150"><template #default="{ row }">{{ factorTransformLabel(row) }}</template></el-table-column>
          <el-table-column label="重放" width="80"><template #default="{ row }"><el-tag :type="row.replayable ? 'success' : 'danger'" effect="plain">{{ row.replayable ? '支持' : '禁止' }}</el-tag></template></el-table-column>
          <el-table-column label="状态" width="100"><template #default="{ row }"><TiStatusTag :value="row.status" :label="statusLabel(row.status)" /></template></el-table-column>
          <el-table-column label="操作" fixed="right" width="230">
            <template #default="{ row }">
              <el-button link @click="showDynamicFactor(row)">查看</el-button>
              <el-button v-if="row.status === 'DRAFT'" link v-permission="'product:actuarial:edit'" @click="transitionDynamicFactor(row, 'approve')">审批</el-button>
              <el-button v-if="row.status === 'APPROVED'" link type="success" v-permission="'product:actuarial:edit'" @click="transitionDynamicFactor(row, 'publish')">发布</el-button>
              <el-button v-if="row.status === 'PUBLISHED'" link type="danger" v-permission="'product:actuarial:edit'" @click="transitionDynamicFactor(row, 'retire')">退役</el-button>
            </template>
          </el-table-column>
          <template #empty><el-empty description="当前产品暂无动态因子"><el-button type="primary" v-permission="'product:actuarial:edit'" @click="openDynamicFactorCreate">新建动态因子</el-button></el-empty></template>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="计算明细" name="calculations">
        <div class="calculation-query">
          <el-input v-model="calculationId" clearable placeholder="确认计算 ID" @keyup.enter="loadCalculation" />
          <el-button type="primary" :loading="calculationLoading" @click="loadCalculation">查询</el-button>
        </div>
        <template v-if="calculation">
          <el-descriptions :column="4" border class="calculation-summary">
            <el-descriptions-item label="业务单号">{{ calculation.bizNo }}</el-descriptions-item>
            <el-descriptions-item label="币种">{{ calculation.currency }}</el-descriptions-item>
            <el-descriptions-item label="客户应付">{{ amountText(calculation.calculationTotals.customerPayable) }}</el-descriptions-item>
            <el-descriptions-item label="内部成本">{{ amountText(calculation.calculationTotals.internalCostTotal, maskingPolicy.maskInternalAmount) }}</el-descriptions-item>
            <el-descriptions-item label="定价包">{{ calculation.pricingPlanVersion }}</el-descriptions-item>
            <el-descriptions-item label="计算模型">{{ calculation.calculationModelCode || '-' }}/{{ calculation.calculationModelVersion || '-' }}</el-descriptions-item>
            <el-descriptions-item label="状态">{{ calculation.status }}</el-descriptions-item>
            <el-descriptions-item label="计算 ID"><span class="hash">{{ calculation.calculationId }}</span></el-descriptions-item>
          </el-descriptions>
          <el-table :data="calculation.calculationLines" border>
            <el-table-column prop="componentCode" label="费用项" min-width="160" />
            <el-table-column label="通道" width="110"><template #default="{ row }"><el-tag :type="row.amountChannel === 'INTERNAL_COST' ? 'warning' : 'primary'" effect="plain">{{ labelOf(channelOptions, row.amountChannel) }}</el-tag></template></el-table-column>
            <el-table-column label="分类" width="130"><template #default="{ row }">{{ labelOf(categoryOptions, row.category) }}</template></el-table-column>
            <el-table-column prop="accountingClass" label="账务分类" min-width="130" />
            <el-table-column label="计费基数" width="120"><template #default="{ row }">{{ amountText(row.baseAmount, isMaskedAmount(row)) }}</template></el-table-column>
            <el-table-column label="费率" width="110"><template #default="{ row }">{{ amountText(row.rate, isMaskedAmount(row)) }}</template></el-table-column>
            <el-table-column label="金额" width="120"><template #default="{ row }">{{ amountText(row.calculatedAmount, isMaskedAmount(row)) }}</template></el-table-column>
            <el-table-column prop="nodeCode" label="计算节点" min-width="120" />
          </el-table>
        </template>
        <el-empty v-else description="输入确认计算 ID 查询费用明细" />
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="policyVisible" title="租户精算显示策略" width="min(480px, calc(100vw - 24px))">
      <el-form label-position="left" label-width="180px">
        <el-form-item label="脱敏内部成本金额"><el-switch v-model="maskingPolicy.maskInternalAmount" /></el-form-item>
        <el-form-item label="脱敏内部费用字段"><el-switch v-model="maskingPolicy.maskInternalFields" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="policyVisible = false">取消</el-button><el-button type="primary" :loading="policySaving" @click="saveMaskingPolicy">保存</el-button></template>
    </el-dialog>

    <el-drawer v-model="taxPolicyCreateVisible" title="新建税费策略草稿" size="min(640px, 100vw)">
      <el-form ref="taxPolicyFormRef" :model="taxPolicyForm" :rules="taxPolicyRules" label-position="top">
        <div class="form-grid">
          <el-form-item label="策略编码" prop="policyCode"><el-input v-model="taxPolicyForm.policyCode" placeholder="例如 VAT_STANDARD" /></el-form-item>
          <el-form-item label="版本" prop="policyVersion"><el-input v-model="taxPolicyForm.policyVersion" placeholder="例如 V1" /></el-form-item>
          <el-form-item class="span-2" label="策略名称" prop="policyName"><el-input v-model="taxPolicyForm.policyName" /></el-form-item>
          <el-form-item label="司法辖区" prop="jurisdictionCode"><el-input v-model="taxPolicyForm.jurisdictionCode" placeholder="例如 CN" /></el-form-item>
          <el-form-item label="税率" prop="taxRate"><el-input-number v-model="taxPolicyForm.taxRate" :min="0" :max="1" :precision="6" :step="0.01" controls-position="right" /></el-form-item>
          <el-form-item label="税费分类" prop="category"><el-select v-model="taxPolicyForm.category"><el-option v-for="option in taxCategoryOptions" :key="option.value" v-bind="option" /></el-select></el-form-item>
          <el-form-item label="价内外模式" prop="priceMode"><el-segmented v-model="taxPolicyForm.priceMode" :options="taxPriceModeOptions" /></el-form-item>
          <el-form-item class="span-2" label="税基费用项" prop="baseComponentCodes"><el-select v-model="taxPolicyForm.baseComponentCodes" multiple filterable allow-create placeholder="选择或输入费用项编码" style="width: 100%"><el-option v-for="item in publishedComponents" :key="`${item.componentCode}:${item.componentVersion}`" :label="`${item.componentName} (${item.componentCode})`" :value="item.componentCode" /></el-select></el-form-item>
          <el-form-item label="账务分类" prop="accountingClass"><el-input v-model="taxPolicyForm.accountingClass" placeholder="例如 TAX_PAYABLE" /></el-form-item>
          <el-form-item label="法规依据" prop="regulatoryReferenceId"><el-input v-model="taxPolicyForm.regulatoryReferenceId" /></el-form-item>
          <el-form-item label="免税特征编码"><el-input v-model="taxPolicyForm.exemptionFeatureCode" placeholder="可选，由 feature-center 提供" /></el-form-item>
          <el-form-item label="生效时间" prop="effectiveFrom"><el-date-picker v-model="taxPolicyForm.effectiveFrom" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" /></el-form-item>
          <el-form-item class="span-2" label="说明"><el-input v-model="taxPolicyForm.description" type="textarea" :rows="3" /></el-form-item>
        </div>
      </el-form>
      <template #footer><el-button @click="taxPolicyCreateVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="saveTaxPolicy">创建草稿</el-button></template>
    </el-drawer>

    <el-drawer v-model="dynamicFactorCreateVisible" title="新建动态因子草稿" size="min(720px, 100vw)">
      <el-form ref="dynamicFactorFormRef" :model="dynamicFactorForm" :rules="dynamicFactorRules" label-position="top">
        <div class="form-grid">
          <el-form-item label="因子编码" prop="factorCode"><el-input v-model="dynamicFactorForm.factorCode" placeholder="例如 VEHICLE_RISK_FACTOR" /></el-form-item>
          <el-form-item label="版本" prop="factorVersion"><el-input v-model="dynamicFactorForm.factorVersion" placeholder="例如 V1" /></el-form-item>
          <el-form-item class="span-2" label="因子名称" prop="factorName"><el-input v-model="dynamicFactorForm.factorName" /></el-form-item>
          <el-form-item label="Feature Center 特征编码" prop="featureCode"><el-input v-model="dynamicFactorForm.featureCode" /></el-form-item>
          <el-form-item label="特征定义版本" prop="featureDefinitionVersion"><el-input v-model="dynamicFactorForm.featureDefinitionVersion" placeholder="例如 V1" /></el-form-item>
          <el-form-item label="特征来源" prop="sourceType"><el-select v-model="dynamicFactorForm.sourceType"><el-option v-for="option in factorSourceOptions" :key="option.value" v-bind="option" /></el-select></el-form-item>
          <el-form-item label="取值时点" prop="valueTimePolicy"><el-select v-model="dynamicFactorForm.valueTimePolicy"><el-option v-for="option in factorTimeOptions" :key="option.value" v-bind="option" /></el-select></el-form-item>
          <el-form-item label="原始值下限"><el-input-number v-model="dynamicFactorForm.lowerBound" :precision="6" controls-position="right" /></el-form-item>
          <el-form-item label="原始值上限"><el-input-number v-model="dynamicFactorForm.upperBound" :precision="6" controls-position="right" /></el-form-item>
          <el-form-item label="缺失策略" prop="missingPolicy"><el-select v-model="dynamicFactorForm.missingPolicy"><el-option v-for="option in factorMissingOptions" :key="option.value" v-bind="option" /></el-select></el-form-item>
          <el-form-item label="缺失默认值"><el-input-number v-model="dynamicFactorForm.defaultValue" :disabled="dynamicFactorForm.missingPolicy !== 'USE_DEFAULT'" :precision="6" controls-position="right" /></el-form-item>
          <el-form-item label="变换类型" prop="transformType"><el-segmented v-model="dynamicFactorForm.transformType" :options="factorTransformOptions" /></el-form-item>
          <el-form-item label="线性参数"><div class="inline-numbers"><el-input-number v-model="dynamicFactorForm.multiplier" :disabled="dynamicFactorForm.transformType === 'IDENTITY'" :precision="6" controls-position="right" /><span>× x +</span><el-input-number v-model="dynamicFactorForm.offset" :disabled="dynamicFactorForm.transformType === 'IDENTITY'" :precision="6" controls-position="right" /></div></el-form-item>
          <el-form-item label="生效时间" prop="effectiveFrom"><el-date-picker v-model="dynamicFactorForm.effectiveFrom" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" /></el-form-item>
          <el-form-item label="可重放"><el-switch v-model="dynamicFactorForm.replayable" /></el-form-item>
          <el-form-item class="span-2" label="说明"><el-input v-model="dynamicFactorForm.description" type="textarea" :rows="3" /></el-form-item>
        </div>
      </el-form>
      <template #footer><el-button @click="dynamicFactorCreateVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="saveDynamicFactor">创建草稿</el-button></template>
    </el-drawer>

    <el-drawer v-model="componentCreateVisible" title="新建费用项草稿" size="min(640px, 100vw)">
      <el-form ref="componentFormRef" :model="componentForm" :rules="componentRules" label-position="top">
        <div class="form-grid">
          <el-form-item label="费用项编码" prop="componentCode"><el-input v-model="componentForm.componentCode" placeholder="例如 BASE_PREMIUM" /></el-form-item>
          <el-form-item label="版本" prop="componentVersion"><el-input v-model="componentForm.componentVersion" placeholder="例如 V1" /></el-form-item>
          <el-form-item class="span-2" label="名称" prop="componentName"><el-input v-model="componentForm.componentName" /></el-form-item>
          <el-form-item label="业务分类" prop="category"><el-select v-model="componentForm.category"><el-option v-for="option in categoryOptions" :key="option.value" v-bind="option" /></el-select></el-form-item>
          <el-form-item label="金额通道" prop="amountChannel"><el-segmented v-model="componentForm.amountChannel" :options="channelOptions" /></el-form-item>
          <el-form-item label="金额方向" prop="direction"><el-segmented v-model="componentForm.direction" :options="directionOptions" /></el-form-item>
          <el-form-item label="承担方" prop="payerType"><el-select v-model="componentForm.payerType"><el-option v-for="option in payerOptions" :key="option.value" v-bind="option" /></el-select></el-form-item>
          <el-form-item label="计算来源" prop="calculationSource"><el-select v-model="componentForm.calculationSource"><el-option v-for="option in sourceOptions" :key="option.value" v-bind="option" /></el-select></el-form-item>
          <el-form-item label="账务分类" prop="accountingClass"><el-input v-model="componentForm.accountingClass" placeholder="例如 PREMIUM" /></el-form-item>
          <el-form-item label="生效时间" prop="effectiveFrom"><el-date-picker v-model="componentForm.effectiveFrom" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" /></el-form-item>
          <el-form-item label="客户可见"><el-switch v-model="componentForm.customerVisible" /></el-form-item>
          <el-form-item class="span-2" label="说明"><el-input v-model="componentForm.description" type="textarea" :rows="3" /></el-form-item>
        </div>
      </el-form>
      <template #footer><el-button @click="componentCreateVisible = false">继续浏览</el-button><el-button type="primary" :loading="saving" @click="saveComponent">创建草稿</el-button></template>
    </el-drawer>

    <el-dialog v-model="modelCreateVisible" title="新建计算模型草稿" width="min(1180px, 94vw)" top="4vh">
      <el-form ref="modelFormRef" :model="modelForm" :rules="modelRules" label-position="top">
        <div class="model-header-grid">
          <el-form-item label="模型编码" prop="modelCode"><el-input v-model="modelForm.modelCode" placeholder="例如 LIFE_PRICE_V1" /></el-form-item>
          <el-form-item label="版本" prop="modelVersion"><el-input v-model="modelForm.modelVersion" placeholder="例如 V1" /></el-form-item>
          <el-form-item label="名称" prop="modelName"><el-input v-model="modelForm.modelName" /></el-form-item>
          <el-form-item label="币种" prop="currency"><TiDictSelect v-model="modelForm.currency" dict-type="CURRENCY" :clearable="false" filterable /></el-form-item>
          <el-form-item label="生效时间" prop="effectiveFrom"><el-date-picker v-model="modelForm.effectiveFrom" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" /></el-form-item>
        </div>
        <div class="editor-heading"><div><h3>计算节点</h3><span>非输出节点必须绑定一个已发布费用项。</span></div><el-button @click="addComputeNode">新增节点</el-button></div>
        <el-table :data="modelForm.nodes" border class="editor-table">
          <el-table-column label="节点编码" width="150"><template #default="{ row }"><el-input v-model="row.nodeCode" :disabled="row.nodeType === 'OUTPUT'" /></template></el-table-column>
          <el-table-column label="名称" min-width="150"><template #default="{ row }"><el-input v-model="row.nodeName" /></template></el-table-column>
          <el-table-column label="类型" width="120"><template #default="{ row }"><el-select v-model="row.nodeType" @change="normalizeNode(row)"><el-option v-for="option in nodeTypeOptions" :key="option.value" v-bind="option" /></el-select></template></el-table-column>
          <el-table-column label="运算" width="155"><template #default="{ row }"><el-select v-model="row.operator" :disabled="row.nodeType === 'OUTPUT'"><el-option v-for="option in operatorOptions" :key="option.value" v-bind="option" /></el-select></template></el-table-column>
          <el-table-column label="费用项" min-width="220"><template #default="{ row }"><el-select v-if="row.nodeType !== 'OUTPUT'" :model-value="componentRef(row)" filterable @change="selectComponent(row, $event)"><el-option v-for="component in publishedComponents" :key="`${component.componentCode}:${component.componentVersion}`" :label="`${component.componentName} (${component.componentCode}/${component.componentVersion})`" :value="`${component.componentCode}:${component.componentVersion}`" /></el-select><span v-else class="muted">客户应付输出</span></template></el-table-column>
          <el-table-column label="参数" width="130"><template #default="{ row }"><el-input-number v-if="['FIXED_AMOUNT', 'PERCENTAGE_OF'].includes(row.operator)" v-model="row.parameterValue" :min="0" :precision="6" controls-position="right" /><span v-else class="muted">自动</span></template></el-table-column>
          <el-table-column label="顺序" width="90"><template #default="{ row }"><el-input-number v-model="row.executionOrder" :min="0" controls-position="right" /></template></el-table-column>
          <el-table-column label="操作" width="70"><template #default="{ row, $index }"><el-button v-if="row.nodeType !== 'OUTPUT'" link type="danger" @click="removeNode($index)">删除</el-button></template></el-table-column>
        </el-table>
        <div class="editor-heading"><div><h3>依赖关系</h3><span>前序节点金额作为后序节点输入；内部成本无需连接到客户应付。</span></div><el-button @click="modelForm.edges.push({ fromNodeCode: '', toNodeCode: '' })">新增依赖</el-button></div>
        <el-table :data="modelForm.edges" border class="edge-table">
          <el-table-column label="前序节点"><template #default="{ row }"><el-select v-model="row.fromNodeCode" filterable><el-option v-for="node in modelForm.nodes" :key="node.nodeCode" :label="`${node.nodeName || node.nodeCode} (${node.nodeCode})`" :value="node.nodeCode" /></el-select></template></el-table-column>
          <el-table-column label="后序节点"><template #default="{ row }"><el-select v-model="row.toNodeCode" filterable><el-option v-for="node in modelForm.nodes" :key="node.nodeCode" :label="`${node.nodeName || node.nodeCode} (${node.nodeCode})`" :value="node.nodeCode" /></el-select></template></el-table-column>
          <el-table-column label="操作" width="80"><template #default="{ $index }"><el-button link type="danger" @click="modelForm.edges.splice($index, 1)">删除</el-button></template></el-table-column>
        </el-table>
      </el-form>
      <template #footer><el-button @click="modelCreateVisible = false">继续浏览</el-button><el-button type="primary" :loading="saving" @click="saveModel">创建草稿</el-button></template>
    </el-dialog>

    <el-drawer v-model="detailVisible" :title="detailTitle" size="min(720px, 100vw)">
      <template v-if="componentDetail">
        <el-descriptions :column="2" border><el-descriptions-item label="编码">{{ componentDetail.componentCode }}</el-descriptions-item><el-descriptions-item label="版本">{{ componentDetail.componentVersion }}</el-descriptions-item><el-descriptions-item label="分类">{{ labelOf(categoryOptions, componentDetail.category) }}</el-descriptions-item><el-descriptions-item label="通道">{{ labelOf(channelOptions, componentDetail.amountChannel) }}</el-descriptions-item><el-descriptions-item label="账务分类">{{ componentDetail.accountingClass }}</el-descriptions-item><el-descriptions-item label="客户可见">{{ componentDetail.customerVisible ? '是' : '否' }}</el-descriptions-item><el-descriptions-item label="内容哈希" :span="2"><span class="hash">{{ componentDetail.contentHash || '-' }}</span></el-descriptions-item></el-descriptions>
      </template>
      <template v-if="modelDetail">
        <el-descriptions :column="2" border><el-descriptions-item label="编码">{{ modelDetail.modelCode }}</el-descriptions-item><el-descriptions-item label="版本">{{ modelDetail.modelVersion }}</el-descriptions-item><el-descriptions-item label="币种">{{ modelDetail.currency }}</el-descriptions-item><el-descriptions-item label="状态">{{ statusLabel(modelDetail.status) }}</el-descriptions-item><el-descriptions-item label="内容哈希" :span="2"><span class="hash">{{ modelDetail.contentHash || '-' }}</span></el-descriptions-item></el-descriptions>
        <el-divider content-position="left">计算节点</el-divider>
        <el-table :data="modelDetail.nodes" border><el-table-column prop="nodeCode" label="编码" /><el-table-column prop="nodeName" label="名称" /><el-table-column prop="operator" label="运算" /><el-table-column label="费用项"><template #default="{ row }">{{ row.componentCode ? `${row.componentCode}/${row.componentVersion}` : '-' }}</template></el-table-column></el-table>
        <el-divider content-position="left">依赖关系</el-divider>
        <el-table :data="modelDetail.edges" border><el-table-column prop="fromNodeCode" label="前序节点" /><el-table-column prop="toNodeCode" label="后序节点" /></el-table>
      </template>
      <template v-if="taxPolicyDetail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="编码">{{ taxPolicyDetail.policyCode }}</el-descriptions-item><el-descriptions-item label="版本">{{ taxPolicyDetail.policyVersion }}</el-descriptions-item>
          <el-descriptions-item label="名称">{{ taxPolicyDetail.policyName }}</el-descriptions-item><el-descriptions-item label="司法辖区">{{ taxPolicyDetail.jurisdictionCode }}</el-descriptions-item>
          <el-descriptions-item label="税率">{{ percentText(taxPolicyDetail.taxRate) }}</el-descriptions-item><el-descriptions-item label="价内外模式">{{ taxPriceModeLabel(taxPolicyDetail.priceMode) }}</el-descriptions-item>
          <el-descriptions-item label="税基费用项" :span="2">{{ taxPolicyDetail.baseComponentCodes.join(', ') }}</el-descriptions-item>
          <el-descriptions-item label="法规依据">{{ taxPolicyDetail.regulatoryReferenceId }}</el-descriptions-item><el-descriptions-item label="账务分类">{{ taxPolicyDetail.accountingClass }}</el-descriptions-item>
          <el-descriptions-item label="内容哈希" :span="2"><span class="hash">{{ taxPolicyDetail.contentHash || '-' }}</span></el-descriptions-item>
        </el-descriptions>
      </template>
      <template v-if="dynamicFactorDetail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="编码">{{ dynamicFactorDetail.factorCode }}</el-descriptions-item><el-descriptions-item label="版本">{{ dynamicFactorDetail.factorVersion }}</el-descriptions-item>
          <el-descriptions-item label="原始特征">{{ dynamicFactorDetail.featureCode }}</el-descriptions-item><el-descriptions-item label="特征版本">{{ dynamicFactorDetail.featureDefinitionVersion }}</el-descriptions-item>
          <el-descriptions-item label="来源">{{ labelOf(factorSourceOptions, dynamicFactorDetail.sourceType) }}</el-descriptions-item><el-descriptions-item label="取值时点">{{ labelOf(factorTimeOptions, dynamicFactorDetail.valueTimePolicy) }}</el-descriptions-item>
          <el-descriptions-item label="原始值范围">{{ dynamicFactorDetail.lowerBound ?? '-∞' }} 至 {{ dynamicFactorDetail.upperBound ?? '+∞' }}</el-descriptions-item><el-descriptions-item label="缺失策略">{{ labelOf(factorMissingOptions, dynamicFactorDetail.missingPolicy) }}</el-descriptions-item>
          <el-descriptions-item label="变换">{{ factorTransformLabel(dynamicFactorDetail) }}</el-descriptions-item><el-descriptions-item label="可重放">{{ dynamicFactorDetail.replayable ? '是' : '否' }}</el-descriptions-item>
          <el-descriptions-item label="内容哈希" :span="2"><span class="hash">{{ dynamicFactorDetail.contentHash || '-' }}</span></el-descriptions-item>
        </el-descriptions>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import { useDict } from '@/composables/useDict'
import { getProductList } from '@/api/product'
import type { ProductVO } from '@/types/business.d'
import { approveCalculationModel, approveChargeComponent, approveDynamicFactor, approveTaxPolicy, createCalculationModel, createChargeComponent, createDynamicFactor, createTaxPolicy, getActuarialMaskingPolicy, getCalculationModel, getChargeComponent, getDynamicFactor, getPremiumCalculation, getTaxPolicy, listCalculationModels, listChargeComponents, listDynamicFactors, listTaxPolicies, publishCalculationModel, publishChargeComponent, publishDynamicFactor, publishTaxPolicy, retireCalculationModel, retireChargeComponent, retireDynamicFactor, retireTaxPolicy, updateActuarialMaskingPolicy, type ActuarialMaskingPolicy, type CalculationEdge, type CalculationLine, type CalculationModel, type CalculationNode, type ChargeComponent, type DynamicFactor, type PremiumCalculation, type TaxPolicy } from '@/api/actuarial'

const router = useRouter()
const products = ref<ProductVO[]>([]); const productId = ref(''); const status = ref(''); const activeTab = ref('components'); const loading = ref(false); const saving = ref(false)
const components = ref<ChargeComponent[]>([]); const models = ref<CalculationModel[]>([]); const taxPolicies = ref<TaxPolicy[]>([]); const dynamicFactors = ref<DynamicFactor[]>([])
const componentCreateVisible = ref(false); const modelCreateVisible = ref(false); const taxPolicyCreateVisible = ref(false); const dynamicFactorCreateVisible = ref(false); const detailVisible = ref(false)
const policyVisible = ref(false); const policySaving = ref(false); const calculationLoading = ref(false); const calculationId = ref('')
const maskingPolicy = reactive<ActuarialMaskingPolicy>({ maskInternalAmount: false, maskInternalFields: false })
const calculation = ref<PremiumCalculation | null>(null)
const componentDetail = ref<ChargeComponent | null>(null); const modelDetail = ref<CalculationModel | null>(null); const taxPolicyDetail = ref<TaxPolicy | null>(null); const dynamicFactorDetail = ref<DynamicFactor | null>(null)
const componentFormRef = ref<FormInstance>(); const modelFormRef = ref<FormInstance>(); const taxPolicyFormRef = ref<FormInstance>(); const dynamicFactorFormRef = ref<FormInstance>()
const currentProduct = computed(() => products.value.find((item) => item.id === productId.value))
const publishedComponents = computed(() => components.value.filter((item) => item.status === 'PUBLISHED'))
const detailTitle = computed(() => componentDetail.value ? '费用项详情' : modelDetail.value ? '计算模型详情' : taxPolicyDetail.value ? '税费策略详情' : '动态因子详情')
const { getLabel: statusLabel } = useDict('CONFIG_LIFECYCLE_STATUS')
const { dictOptions: categoryOptions } = useDict('PRICE_COMPONENT_CATEGORY')
const { dictOptions: taxCategoryOptions } = useDict('TAX_CATEGORY')
const { dictOptions: taxPriceModeOptions, getLabel: taxPriceModeLabel } = useDict('TAX_PRICE_MODE')
const { dictOptions: factorSourceOptions } = useDict('FACTOR_SOURCE_TYPE')
const { dictOptions: factorTimeOptions } = useDict('FACTOR_VALUE_TIME')
const { dictOptions: factorMissingOptions } = useDict('FACTOR_MISSING_POLICY')
const { dictOptions: factorTransformOptions } = useDict('FACTOR_TRANSFORM_TYPE')
const { dictOptions: channelOptions } = useDict('AMOUNT_CHANNEL')
const { dictOptions: directionOptions } = useDict('ACCOUNTING_DIRECTION')
const { dictOptions: payerOptions } = useDict('PAYER_TYPE')
const { dictOptions: sourceOptions } = useDict('CALCULATION_SOURCE')
const { dictOptions: nodeTypeOptions } = useDict('CALCULATION_NODE_TYPE')
const { dictOptions: operatorOptions } = useDict('CALCULATION_OPERATOR')
const labelOf = (options: Array<{ label: string; value: string }>, value: string) => options.find((item) => item.value === value)?.label || value
const percentText = (value?: number) => value === undefined || value === null ? '-' : `${(value * 100).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}%`
const amountText = (value?: number, masked = false) => value === undefined || value === null ? masked ? '已脱敏' : '-' : String(value)
const factorTransformLabel = (value: unknown) => { const factor = value as DynamicFactor; return factor.transformType === 'IDENTITY' ? '原值' : `${factor.multiplier} × x + ${factor.offset}` }
const isMaskedAmount = (value: unknown) => (value as CalculationLine).amountChannel === 'INTERNAL_COST' && maskingPolicy.maskInternalAmount
const now = () => new Date().toISOString().slice(0, 19)
const componentForm = reactive({ componentCode: '', componentVersion: 'V1', componentName: '', description: '', category: 'RISK_PREMIUM', amountChannel: 'CUSTOMER_PRICE', direction: 'DEBIT', payerType: 'POLICYHOLDER', calculationSource: 'BASE_PREMIUM', accountingClass: 'PREMIUM', customerVisible: true, effectiveFrom: now() })
const modelForm = reactive<{ modelCode: string; modelVersion: string; modelName: string; description: string; currency: string; effectiveFrom: string; nodes: CalculationNode[]; edges: CalculationEdge[] }>({ modelCode: '', modelVersion: 'V1', modelName: '', description: '', currency: 'CNY', effectiveFrom: now(), nodes: [], edges: [] })
const taxPolicyForm = reactive({ policyCode: '', policyVersion: 'V1', policyName: '', description: '', jurisdictionCode: '', category: 'TAX', payerType: 'POLICYHOLDER', priceMode: 'EXCLUSIVE', taxRate: 0, baseComponentCodes: [] as string[], accountingClass: 'TAX_PAYABLE', regulatoryReferenceId: '', exemptionFeatureCode: '', effectiveFrom: now() })
const dynamicFactorForm = reactive<{ factorCode: string; factorVersion: string; factorName: string; description: string; featureCode: string; featureDefinitionVersion: string; sourceType: DynamicFactor['sourceType']; valueTimePolicy: DynamicFactor['valueTimePolicy']; lowerBound?: number; upperBound?: number; missingPolicy: DynamicFactor['missingPolicy']; defaultValue?: number; transformType: DynamicFactor['transformType']; multiplier: number; offset: number; replayable: boolean; effectiveFrom: string }>({ factorCode: '', factorVersion: 'V1', factorName: '', description: '', featureCode: '', featureDefinitionVersion: 'V1', sourceType: 'REQUEST', valueTimePolicy: 'BUSINESS_TIME', missingPolicy: 'REJECT', transformType: 'IDENTITY', multiplier: 1, offset: 0, replayable: true, effectiveFrom: now() })
const required = { required: true, message: '请补齐此字段', trigger: 'blur' }
const componentRules: FormRules = { componentCode: [required], componentVersion: [required], componentName: [required], category: [required], amountChannel: [required], direction: [required], payerType: [required], calculationSource: [required], accountingClass: [required], effectiveFrom: [required] }
const modelRules: FormRules = { modelCode: [required], modelVersion: [required], modelName: [required], currency: [required], effectiveFrom: [required] }
const taxPolicyRules: FormRules = { policyCode: [required], policyVersion: [required], policyName: [required], jurisdictionCode: [required], category: [required], priceMode: [required], taxRate: [required], baseComponentCodes: [required], accountingClass: [required], regulatoryReferenceId: [required], effectiveFrom: [required] }
const dynamicFactorRules: FormRules = { factorCode: [required], factorVersion: [required], factorName: [required], featureCode: [required], featureDefinitionVersion: [required], sourceType: [required], valueTimePolicy: [required], missingPolicy: [required], transformType: [required], effectiveFrom: [required] }

async function loadProducts() { const result = await getProductList({ pageNum: 1, pageSize: 100 }); products.value = result.list; if (!productId.value && products.value.length) productId.value = products.value[0].id; await loadAssets() }
async function loadAssets() { if (!productId.value) { components.value = []; models.value = []; taxPolicies.value = []; dynamicFactors.value = []; return }; loading.value = true; try { const [componentResult, modelResult, taxResult, factorResult] = await Promise.all([listChargeComponents(productId.value, status.value || undefined), listCalculationModels(productId.value, status.value || undefined), listTaxPolicies(productId.value, status.value || undefined), listDynamicFactors(productId.value, status.value || undefined)]); components.value = componentResult; models.value = modelResult; taxPolicies.value = taxResult; dynamicFactors.value = factorResult } finally { loading.value = false } }
function openComponentCreate() { Object.assign(componentForm, { componentCode: '', componentVersion: 'V1', componentName: '', description: '', category: 'RISK_PREMIUM', amountChannel: 'CUSTOMER_PRICE', direction: 'DEBIT', payerType: 'POLICYHOLDER', calculationSource: 'BASE_PREMIUM', accountingClass: 'PREMIUM', customerVisible: true, effectiveFrom: now() }); componentCreateVisible.value = true }
async function saveComponent() { if (!await componentFormRef.value?.validate()) return; if (componentForm.amountChannel === 'INTERNAL_COST' && componentForm.payerType === 'POLICYHOLDER') return ElMessage.warning('内部成本不能由投保人承担'); saving.value = true; try { await createChargeComponent(productId.value, { ...componentForm }); componentCreateVisible.value = false; ElMessage.success('费用项草稿已创建'); await loadAssets() } finally { saving.value = false } }
async function transitionComponent(value: unknown, action: 'approve' | 'publish' | 'retire') { const row = value as ChargeComponent; if (action !== 'approve') await ElMessageBox.confirm(action === 'publish' ? '发布后可被计算模型引用，确认发布？' : '退役后不能被新模型引用，确认退役？', action === 'publish' ? '发布费用项' : '退役费用项', { type: 'warning' }); const invoke = action === 'approve' ? approveChargeComponent : action === 'publish' ? publishChargeComponent : retireChargeComponent; await invoke(productId.value, row.componentId); ElMessage.success(`费用项已${action === 'approve' ? '审批' : action === 'publish' ? '发布' : '退役'}`); await loadAssets() }
async function showComponent(value: unknown) { const row = value as ChargeComponent; componentDetail.value = await getChargeComponent(productId.value, row.componentId); modelDetail.value = null; taxPolicyDetail.value = null; dynamicFactorDetail.value = null; detailVisible.value = true }
function openModelCreate() { Object.assign(modelForm, { modelCode: '', modelVersion: 'V1', modelName: '', description: '', currency: 'CNY', effectiveFrom: now(), nodes: [{ nodeCode: 'BASE', nodeName: '标准保费', nodeType: 'INPUT', operator: 'STANDARD_PREMIUM', executionOrder: 10 }, { nodeCode: 'TOTAL', nodeName: '客户应付', nodeType: 'OUTPUT', operator: 'SUM', executionOrder: 100 }], edges: [{ fromNodeCode: 'BASE', toNodeCode: 'TOTAL' }] }); modelCreateVisible.value = true }
function addComputeNode() { const index = modelForm.nodes.filter((node) => node.nodeType !== 'OUTPUT').length + 1; modelForm.nodes.splice(modelForm.nodes.length - 1, 0, { nodeCode: `ITEM_${index}`, nodeName: `费用项 ${index}`, nodeType: 'COMPUTE', operator: 'PERCENTAGE_OF', parameterValue: 0, executionOrder: index * 10 }) }
function removeNode(index: number) { const code = modelForm.nodes[index].nodeCode; modelForm.nodes.splice(index, 1); modelForm.edges = modelForm.edges.filter((edge) => edge.fromNodeCode !== code && edge.toNodeCode !== code) }
function normalizeNode(value: unknown) { const node = value as CalculationNode; if (node.nodeType === 'OUTPUT') { node.nodeCode = 'TOTAL'; node.operator = 'SUM'; node.componentCode = undefined; node.componentVersion = undefined; node.parameterValue = undefined } else if (node.nodeType === 'INPUT') { node.operator = 'STANDARD_PREMIUM'; node.parameterValue = undefined } }
const componentRef = (value: unknown) => { const node = value as CalculationNode; return node.componentCode ? `${node.componentCode}:${node.componentVersion}` : '' }
function selectComponent(value: unknown, refValue: string) { const node = value as CalculationNode; const [code, version] = refValue.split(':'); node.componentCode = code; node.componentVersion = version }
function validateGraph() { const codes = modelForm.nodes.map((node) => node.nodeCode.trim()); if (codes.some((code) => !code)) return '请补齐节点编码'; if (new Set(codes).size !== codes.length) return '节点编码不能重复'; if (modelForm.nodes.filter((node) => node.operator === 'STANDARD_PREMIUM').length !== 1) return '必须且只能有一个标准保费节点'; if (modelForm.nodes.filter((node) => node.nodeType === 'OUTPUT').length !== 1) return '必须且只能有一个输出节点'; if (modelForm.nodes.some((node) => node.nodeType !== 'OUTPUT' && (!node.componentCode || !node.componentVersion))) return '所有非输出节点都必须绑定已发布费用项'; if (modelForm.edges.some((edge) => !edge.fromNodeCode || !edge.toNodeCode || edge.fromNodeCode === edge.toNodeCode)) return '请修正未完成或自引用的依赖关系'; return '' }
async function saveModel() { if (!await modelFormRef.value?.validate()) return; const graphError = validateGraph(); if (graphError) return ElMessage.warning(graphError); saving.value = true; try { await createCalculationModel(productId.value, { ...modelForm, nodes: modelForm.nodes.map((node) => ({ ...node, parameterValue: ['FIXED_AMOUNT', 'PERCENTAGE_OF'].includes(node.operator) ? node.parameterValue : undefined })) }); modelCreateVisible.value = false; ElMessage.success('计算模型草稿已创建'); await loadAssets() } finally { saving.value = false } }
async function transitionModel(value: unknown, action: 'approve' | 'publish' | 'retire') { const row = value as CalculationModel; if (action !== 'approve') await ElMessageBox.confirm(action === 'publish' ? '发布后可被定价包固定引用，确认发布？' : '退役后不能被新定价包引用，确认退役？', action === 'publish' ? '发布计算模型' : '退役计算模型', { type: 'warning' }); const invoke = action === 'approve' ? approveCalculationModel : action === 'publish' ? publishCalculationModel : retireCalculationModel; await invoke(productId.value, row.modelId); ElMessage.success(`计算模型已${action === 'approve' ? '审批' : action === 'publish' ? '发布' : '退役'}`); await loadAssets() }
async function showModel(value: unknown) { const row = value as CalculationModel; modelDetail.value = await getCalculationModel(productId.value, row.modelId); componentDetail.value = null; taxPolicyDetail.value = null; dynamicFactorDetail.value = null; detailVisible.value = true }
function openTaxPolicyCreate() { Object.assign(taxPolicyForm, { policyCode: '', policyVersion: 'V1', policyName: '', description: '', jurisdictionCode: '', category: 'TAX', payerType: 'POLICYHOLDER', priceMode: 'EXCLUSIVE', taxRate: 0, baseComponentCodes: [], accountingClass: 'TAX_PAYABLE', regulatoryReferenceId: '', exemptionFeatureCode: '', effectiveFrom: now() }); taxPolicyCreateVisible.value = true }
async function saveTaxPolicy() { if (!await taxPolicyFormRef.value?.validate()) return; saving.value = true; try { await createTaxPolicy(productId.value, { ...taxPolicyForm }); taxPolicyCreateVisible.value = false; ElMessage.success('税费策略草稿已创建'); await loadAssets() } finally { saving.value = false } }
async function transitionTaxPolicy(value: unknown, action: 'approve' | 'publish' | 'retire') { const row = value as TaxPolicy; if (action !== 'approve') await ElMessageBox.confirm(action === 'publish' ? '发布后可被定价包精确引用，确认发布？' : '退役后不能被新定价包引用，确认退役？', action === 'publish' ? '发布税费策略' : '退役税费策略', { type: 'warning' }); const invoke = action === 'approve' ? approveTaxPolicy : action === 'publish' ? publishTaxPolicy : retireTaxPolicy; await invoke(productId.value, row.policyId); ElMessage.success(`税费策略已${action === 'approve' ? '审批' : action === 'publish' ? '发布' : '退役'}`); await loadAssets() }
async function showTaxPolicy(value: unknown) { const row = value as TaxPolicy; taxPolicyDetail.value = await getTaxPolicy(productId.value, row.policyId); componentDetail.value = null; modelDetail.value = null; dynamicFactorDetail.value = null; detailVisible.value = true }
function openDynamicFactorCreate() { Object.assign(dynamicFactorForm, { factorCode: '', factorVersion: 'V1', factorName: '', description: '', featureCode: '', featureDefinitionVersion: 'V1', sourceType: 'REQUEST', valueTimePolicy: 'BUSINESS_TIME', lowerBound: undefined, upperBound: undefined, missingPolicy: 'REJECT', defaultValue: undefined, transformType: 'IDENTITY', multiplier: 1, offset: 0, replayable: true, effectiveFrom: now() }); dynamicFactorCreateVisible.value = true }
async function saveDynamicFactor() { if (!await dynamicFactorFormRef.value?.validate()) return; if (dynamicFactorForm.lowerBound !== undefined && dynamicFactorForm.upperBound !== undefined && dynamicFactorForm.lowerBound > dynamicFactorForm.upperBound) return ElMessage.warning('原始值下限不能大于上限'); if (dynamicFactorForm.missingPolicy === 'USE_DEFAULT' && dynamicFactorForm.defaultValue === undefined) return ElMessage.warning('使用默认值时必须填写缺失默认值'); saving.value = true; try { const payload = { ...dynamicFactorForm, multiplier: dynamicFactorForm.transformType === 'IDENTITY' ? 1 : dynamicFactorForm.multiplier, offset: dynamicFactorForm.transformType === 'IDENTITY' ? 0 : dynamicFactorForm.offset }; await createDynamicFactor(productId.value, payload); dynamicFactorCreateVisible.value = false; ElMessage.success('动态因子草稿已创建'); await loadAssets() } finally { saving.value = false } }
async function transitionDynamicFactor(value: unknown, action: 'approve' | 'publish' | 'retire') { const row = value as DynamicFactor; if (action !== 'approve') await ElMessageBox.confirm(action === 'publish' ? '发布后可被定价包精确引用，确认发布？' : '退役后不能被新定价包引用，确认退役？', action === 'publish' ? '发布动态因子' : '退役动态因子', { type: 'warning' }); const invoke = action === 'approve' ? approveDynamicFactor : action === 'publish' ? publishDynamicFactor : retireDynamicFactor; await invoke(productId.value, row.factorId); ElMessage.success(`动态因子已${action === 'approve' ? '审批' : action === 'publish' ? '发布' : '退役'}`); await loadAssets() }
async function showDynamicFactor(value: unknown) { const row = value as DynamicFactor; dynamicFactorDetail.value = await getDynamicFactor(productId.value, row.factorId); componentDetail.value = null; modelDetail.value = null; taxPolicyDetail.value = null; detailVisible.value = true }
async function loadMaskingPolicy() { Object.assign(maskingPolicy, await getActuarialMaskingPolicy()) }
async function saveMaskingPolicy() { policySaving.value = true; try { Object.assign(maskingPolicy, await updateActuarialMaskingPolicy({ ...maskingPolicy })); policyVisible.value = false; ElMessage.success('显示策略已保存'); if (calculation.value) await loadCalculation() } finally { policySaving.value = false } }
async function loadCalculation() { if (!calculationId.value.trim()) return ElMessage.warning('请输入确认计算 ID'); calculationLoading.value = true; try { calculation.value = await getPremiumCalculation(calculationId.value.trim()) } finally { calculationLoading.value = false } }
onMounted(async () => { await Promise.all([loadProducts(), loadMaskingPolicy()]) })
</script>

<style scoped>
.actuarial-page { min-width: 0; }
.page-heading, .context-bar, .tab-toolbar, .editor-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.page-heading { margin-bottom: 16px; }
.page-heading h2, .editor-heading h3 { margin: 0 0 6px; }
.page-heading p, .tab-toolbar span, .editor-heading span, .muted { margin: 0; color: var(--ti-text-secondary, #86909c); }
.asset-links { display: flex; flex-wrap: wrap; gap: 8px; }
.context-bar { min-height: 58px; padding: 10px 14px; margin-bottom: 12px; border: 1px solid var(--el-border-color-light); background: var(--el-fill-color-blank); }
.context-bar :deep(.el-form-item) { margin-bottom: 0; }
.product-select { width: 320px; }
.status-select { width: 140px; }
.context-meta { display: flex; gap: 16px; color: var(--ti-text-secondary, #86909c); font-size: 13px; }
.workbench-tabs :deep(.el-tabs__header) { margin-bottom: 12px; }
.workbench-tabs :deep(.el-badge__content) { transform: translateY(-1px) scale(.86); }
.tab-toolbar { min-height: 44px; margin-bottom: 10px; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
.span-2 { grid-column: 1 / -1; }
.inline-numbers { display: flex; align-items: center; gap: 8px; width: 100%; }
.inline-numbers :deep(.el-input-number) { flex: 1; min-width: 0; }
.model-header-grid { display: grid; grid-template-columns: 1.2fr .7fr 1.4fr .7fr 1.1fr; gap: 0 14px; }
.editor-heading { margin: 14px 0 8px; }
.editor-heading h3 { font-size: 15px; }
.editor-heading span { font-size: 12px; }
.editor-table, .edge-table { width: 100%; }
.calculation-query { display: flex; width: min(560px, 100%); gap: 8px; margin-bottom: 12px; }
.calculation-summary { margin-bottom: 12px; }
.hash { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
@media (max-width: 900px) { .page-heading, .context-bar, .tab-toolbar { align-items: flex-start; flex-direction: column; } .product-select { width: min(320px, 72vw); } .form-grid, .model-header-grid { grid-template-columns: minmax(0, 1fr); } .span-2 { grid-column: auto; } .tab-toolbar :deep(.el-button) { align-self: flex-end; } }
</style>
