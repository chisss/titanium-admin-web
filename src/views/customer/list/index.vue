<template>
  <!-- 客户列表页 -->
  <div class="ti-page">
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="客户姓名">
        <el-input v-model="queryParams.name" clearable style="width: 150px" />
      </el-form-item>
      <el-form-item label="证件号">
        <el-input v-model="queryParams.idNo" clearable style="width: 170px" />
      </el-form-item>
      <el-form-item label="手机号">
        <el-input v-model="queryParams.mobile" clearable style="width: 140px" />
      </el-form-item>
    </TiSearchForm>

    <!-- 工具栏 -->
    <div class="ti-toolbar">
      <div class="ti-toolbar-left">
        <el-button type="primary" :icon="Plus" v-permission="'customer:create'" @click="openForm()">
          新增客户
        </el-button>
      </div>
    </div>

    <TiTable
      :data="tableData"
      :total="pagination.total"
      :page-num="pagination.pageNum"
      :page-size="pagination.pageSize"
      :loading="tableLoading"
      :max-height="'var(--ti-table-max-height-lean)'"
      @page-change="onPageChange"
      @size-change="onSizeChange"
      :error="tableError"
      @refresh="retry"
    >
      <!-- 🔴 本表唯一的 flex 列（只写 min-width）：EP 无 flex 列时把表格宽设为「各列宽之和」
           （table-layout.mjs:123-131），整表会比容器窄、右侧留白。选客户姓名承接——内容长度不定 -->
      <el-table-column prop="fullName" label="客户姓名" min-width="140" />
      <el-table-column prop="customerNo" label="客户号" width="180" />
      <el-table-column prop="idType" label="证件类型" width="130">
        <template #default="{ row }">
          {{ customerLabel('idType', row.idType) }}
        </template>
      </el-table-column>
      <el-table-column prop="idNo" label="证件号码" width="200" />
      <el-table-column prop="phoneNumber" label="手机号" width="150" />
      <el-table-column prop="gender" label="性别" width="80">
        <template #default="{ row }">
          {{ customerLabel('gender', row.gender) }}
        </template>
      </el-table-column>
      <el-table-column prop="createTime" label="注册时间" width="180">
        <template #default="{ row }">
          {{ formatDateTime(row.createTime) }}
        </template>
      </el-table-column>
      <!-- @vue-generic {CustomerVO} -->
      <el-table-column label="操作" width="200" fixed="right" class-name="ti-action-column">
        <template #default="{ row }">
          <el-button size="small" :icon="View" @click="handleViewDetail(row.customerId)">详情</el-button>
          <el-button size="small" :icon="Edit" v-permission="'customer:edit'" @click="openForm(row)">
            编辑
          </el-button>
        </template>
      </el-table-column>
    </TiTable>

    <!--
      新增/编辑客户：轻量编辑走**侧边抽屉**，不打断列表上下文（列表页翻页位置与筛选条件全部保留）。
      字段校验就地提示（错误文案挂在字段下方），不另开错误汇总区。
    -->
    <el-drawer v-model="formVisible" :title="editId ? '编辑客户' : '新增客户'" size="480px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="客户姓名" prop="lastName">
          <el-input v-model="form.lastName" maxlength="64" placeholder="请输入客户姓名" />
        </el-form-item>
        <el-form-item label="客户类型" prop="customerType">
          <el-select v-model="form.customerType" clearable placeholder="请选择" style="width: 100%">
            <el-option
              v-for="item in customerOptions('customerType')"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="证件类型" prop="idType">
          <el-select v-model="form.idType" clearable placeholder="请选择" style="width: 100%">
            <el-option
              v-for="item in customerOptions('idType')"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="证件号码" prop="idNo">
          <el-input v-model="form.idNo" maxlength="64" placeholder="请输入证件号码" />
        </el-form-item>
        <el-form-item label="性别" prop="gender">
          <el-select v-model="form.gender" clearable placeholder="请选择" style="width: 100%">
            <el-option
              v-for="item in customerOptions('gender')"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="手机号" prop="phoneNumber">
          <el-input v-model="form.phoneNumber" maxlength="20" placeholder="请输入手机号" />
        </el-form-item>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="form.email" maxlength="128" placeholder="请输入邮箱" />
        </el-form-item>
        <el-form-item label="地址" prop="address">
          <el-input v-model="form.address" type="textarea" :rows="2" maxlength="256" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSubmit">
          {{ editId ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Edit, Plus, View } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { createCustomer, getCustomerList, updateCustomer } from '@/api/customer'
import type { CustomerWriteBody } from '@/api/customer'
import { showErrorIfUnhandled } from '@/api/http'
import { useTable } from '@/composables/useTable'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import type { CustomerVO } from '@/types/business.d'
import { customerLabel, customerOptions } from '@/constants/customer'
import { formatDateTime } from '@/utils/date'
import type { PageResult } from '@/types/api.d'

const queryParams = reactive({
  name: '',
  idNo: '',
  mobile: '',
})
const router = useRouter()

const { tableData, tableLoading, tableError, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange, retry } =
  useTable<CustomerVO, typeof queryParams>((params) => {
    return getCustomerList(params) as Promise<PageResult<CustomerVO>>
  }, queryParams)

const handleViewDetail = (customerId: string) => {
  router.push(`/customer/detail/${customerId}`)
}

const formVisible = ref(false)
const saving = ref(false)
const editId = ref<string | null>(null)
const formRef = ref<FormInstance>()

/** 表单模型：字段名与下游契约一致（`lastName` 承载整体姓名，理由见 {@link CustomerWriteBody}） */
const form = reactive<CustomerWriteBody>({
  lastName: '',
  idType: '',
  idNo: '',
  gender: '',
  phoneNumber: '',
  email: '',
  address: '',
  customerType: '',
})

/**
 * 校验规则：必填与格式均在字段旁就地提示（`trigger` 取 blur/change，输入过程中即时反馈）。
 * <p>格式规则一律「非空才校验」：手机号/邮箱在下游是选填，若空值时也拦，等于把选填字段
 * 变成事实必填，与后端语义背道而驰。</p>
 */
const rules: FormRules = {
  lastName: [{ required: true, message: '请输入客户姓名', trigger: 'blur' }],
  idType: [{ required: true, message: '请选择证件类型', trigger: 'change' }],
  idNo: [{ required: true, message: '请输入证件号码', trigger: 'blur' }],
  phoneNumber: [
    {
      validator: (_rule, value: string, callback) => {
        if (!value || /^1[3-9]\d{9}$/.test(value)) return callback()
        callback(new Error('手机号格式不正确'))
      },
      trigger: 'blur',
    },
  ],
  email: [
    {
      validator: (_rule, value: string, callback) => {
        if (!value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return callback()
        callback(new Error('邮箱格式不正确'))
      },
      trigger: 'blur',
    },
  ],
}

/**
 * 打开抽屉。传入 row 即编辑（以列表行回填 —— 列表字段已覆盖可编辑的全部字段），
 * 不传即新增。每次打开都先重置校验态，避免上一次的红色错误提示残留到本次。
 */
const openForm = (row?: CustomerVO) => {
  editId.value = row?.customerId ?? null
  Object.assign(form, {
    lastName: row?.fullName ?? '',
    idType: row?.idType ?? '',
    idNo: row?.idNo ?? '',
    gender: row?.gender ?? '',
    phoneNumber: row?.phoneNumber ?? '',
    email: row?.email ?? '',
    address: row?.address ?? '',
    customerType: row?.customerType ?? '',
  })
  formRef.value?.clearValidate()
  formVisible.value = true
}

const handleSubmit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    if (editId.value) {
      await updateCustomer(editId.value, { ...form })
      ElMessage.success('保存成功')
    } else {
      const customerId = await createCustomer({ ...form })
      ElMessage.success(`客户创建成功：${customerId}`)
    }
    formVisible.value = false
    await fetchData()
  } catch (e: unknown) {
    // 下游失败原因（如证件号重复、手机号重复）已在拦截器弹出，此处只兜底未提示过的错误
    showErrorIfUnhandled(e, editId.value ? '保存失败' : '创建失败')
  } finally {
    saving.value = false
  }
}

fetchData()
</script>
