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
        <el-step title="确认提交" />
      </el-steps>

      <!-- 步骤内容 -->
      <div class="product-create__content">
        <!-- 第一步：基本信息 -->
        <el-form
          v-if="currentStep === 0"
          ref="step1Ref"
          :model="form"
          :rules="step1Rules"
          label-width="120px"
        >
          <el-form-item label="产品名称" prop="name">
            <el-input v-model="form.name" placeholder="请输入产品名称" style="width: 320px" />
          </el-form-item>
          <el-form-item label="产品代码" prop="code">
            <el-input v-model="form.code" placeholder="如：AUTO-COMP-001" style="width: 220px" />
          </el-form-item>
          <el-form-item label="险种分类" prop="category">
            <TiDictSelect v-model="form.category" dict-type="INSURANCE_CATEGORY" style="width: 200px" />
          </el-form-item>
          <el-form-item label="最低保费" prop="minPremium">
            <el-input-number v-model="form.minPremium" :min="0" :precision="2" placeholder="元" />
          </el-form-item>
          <el-form-item label="最高保额" prop="maxCoverage">
            <el-input-number v-model="form.maxCoverage" :min="0" :precision="2" placeholder="元" />
          </el-form-item>
          <el-form-item label="产品描述">
            <el-input v-model="form.description" type="textarea" :rows="4" style="width: 480px" />
          </el-form-item>
        </el-form>

        <!-- 第二步：险种配置 -->
        <div v-if="currentStep === 1" class="product-create__placeholder">
          <el-icon size="48" color="#c0c4cc"><DocumentChecked /></el-icon>
          <p>险种配置：根据所选险种分类，配置具体的承保范围、责任条款等</p>
          <p style="color: #c0c4cc; font-size: 13px">（实际项目中接入产品配置模块）</p>
        </div>

        <!-- 第三步：费率规则 -->
        <div v-if="currentStep === 2" class="product-create__placeholder">
          <el-icon size="48" color="#c0c4cc"><TrendCharts /></el-icon>
          <p>费率规则：配置基础费率表、折扣系数、附加费率等</p>
        </div>

        <!-- 第四步：确认提交 -->
        <div v-if="currentStep === 3">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="产品名称">{{ form.name }}</el-descriptions-item>
            <el-descriptions-item label="产品代码">{{ form.code }}</el-descriptions-item>
            <el-descriptions-item label="险种分类">{{ form.category }}</el-descriptions-item>
            <el-descriptions-item label="最低保费">¥{{ form.minPremium }}</el-descriptions-item>
          </el-descriptions>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="product-create__footer">
        <el-button v-if="currentStep > 0" @click="currentStep--">上一步</el-button>
        <el-button v-if="currentStep < 3" type="primary" @click="nextStep">下一步</el-button>
        <el-button v-if="currentStep === 3" type="primary" :loading="saving" @click="handleSave">
          {{ isEdit ? '保存修改' : '创建产品' }}
        </el-button>
        <el-button @click="$router.back()">取消</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { DocumentChecked, TrendCharts } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'
import { createProduct, updateProduct } from '@/api/product'
import TiDictSelect from '@/components/TiDictSelect/index.vue'

const route = useRoute()
const router = useRouter()

const isEdit = computed(() => !!route.query.id)
const currentStep = ref(0)
const saving = ref(false)
const step1Ref = ref<FormInstance>()

const form = reactive({
  name: '',
  code: '',
  category: undefined as string | undefined,
  minPremium: undefined as number | undefined,
  maxCoverage: undefined as number | undefined,
  description: '',
})

const step1Rules: FormRules = {
  name: [{ required: true, message: '请输入产品名称', trigger: 'blur' }],
  code: [{ required: true, message: '请输入产品代码', trigger: 'blur' }],
  category: [{ required: true, message: '请选择险种分类', trigger: 'change' }],
}

const nextStep = async () => {
  if (currentStep.value === 0) {
    const valid = await step1Ref.value?.validate().catch(() => false)
    if (!valid) return
  }
  currentStep.value++
}

const handleSave = async () => {
  saving.value = true
  try {
    if (isEdit.value) {
      await updateProduct(route.query.id as string, form as any)
      ElMessage.success('修改成功')
    } else {
      await createProduct(form as any)
      ElMessage.success('创建成功')
    }
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
      color: #303133;
    }
  }

  &__steps {
    margin-bottom: 32px;
  }

  &__content {
    min-height: 280px;
    padding: 8px 0 24px;
  }

  &__placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 40px;
    color: #606266;
    background: #f9fbff;
    border-radius: 8px;
    border: 1px dashed $border-color;
  }

  &__footer {
    display: flex;
    gap: 12px;
    padding-top: 16px;
    border-top: 1px solid $border-color;
  }
}
</style>
