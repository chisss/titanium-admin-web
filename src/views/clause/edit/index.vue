<template>
  <!-- 条款编辑页 -->
  <div class="ti-page">
    <div class="ti-card">
      <div class="detail-header">
        <el-button :icon="ArrowLeft" text @click="$router.back()">返回</el-button>
        <h3>{{ isEdit ? '编辑条款' : '新增条款' }}</h3>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px" v-loading="loading">
        <el-row :gutter="24">
          <el-col :sm="12">
            <el-form-item label="条款编码" prop="code">
              <el-input v-model="form.code" :disabled="isEdit" placeholder="如：CLAUSE-AUTO-001" />
            </el-form-item>
          </el-col>
          <el-col :sm="12">
            <el-form-item label="条款名称" prop="name">
              <el-input v-model="form.name" placeholder="请输入条款名称" />
            </el-form-item>
          </el-col>
          <el-col :sm="12">
            <el-form-item label="险种分类" prop="category">
              <TiDictSelect v-model="form.category" dict-type="INSURANCE_CATEGORY" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :sm="12">
            <el-form-item label="版本号" prop="version">
              <el-input v-model="form.version" placeholder="如：V1.0" />
            </el-form-item>
          </el-col>
          <el-col :sm="12">
            <el-form-item label="生效日期">
              <el-date-picker v-model="form.effectiveDate" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="条款内容" prop="content">
              <el-input
                v-model="form.content"
                type="textarea"
                :rows="12"
                placeholder="请输入条款正文内容..."
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <div style="padding-top: 16px; border-top: 1px solid #ebeef5; display: flex; gap: 12px;">
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
        <el-button @click="$router.back()">取消</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'
import { createClause, updateClause, getClauseDetail } from '@/api/clause'
import TiDictSelect from '@/components/TiDictSelect/index.vue'

const route = useRoute()
const router = useRouter()

const isEdit = computed(() => !!route.params.id)
const loading = ref(false)
const saving = ref(false)
const formRef = ref<FormInstance>()

const form = reactive({
  code: '',
  name: '',
  category: undefined as string | undefined,
  version: 'V1.0',
  content: '',
  effectiveDate: undefined as string | undefined,
})

const rules: FormRules = {
  code: [{ required: true, message: '请输入条款编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入条款名称', trigger: 'blur' }],
  category: [{ required: true, message: '请选择险种分类', trigger: 'change' }],
  version: [{ required: true, message: '请输入版本号', trigger: 'blur' }],
}

onMounted(async () => {
  if (!isEdit.value) return
  loading.value = true
  try {
    const detail = await getClauseDetail(route.params.id as string)
    Object.assign(form, detail)
  } finally {
    loading.value = false
  }
})

const handleSave = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    if (isEdit.value) {
      await updateClause(route.params.id as string, form)
    } else {
      await createClause(form)
    }
    ElMessage.success('保存成功')
    router.push('/clause/list')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped lang="scss">
.detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;

  h3 { margin: 0; font-size: 18px; }
}
</style>
