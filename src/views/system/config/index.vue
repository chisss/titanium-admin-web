<template>
  <!-- 系统配置页 -->
  <div class="ti-page">
    <el-card shadow="never">
      <el-tabs v-model="activeTab">
        <!-- 全局参数 -->
        <el-tab-pane label="全局参数" name="global">
          <el-form :model="form.globalConfig" label-width="120px" style="max-width: 480px">
            <el-form-item label="默认分页大小">
              <el-input-number v-model="form.globalConfig.defaultPageSize" :min="1" :max="200" />
            </el-form-item>
            <el-form-item label="文件上传上限">
              <el-input v-model="form.globalConfig.maxFileSize" placeholder="如 10MB" />
            </el-form-item>
            <el-form-item label="Token过期">
              <el-input v-model="form.globalConfig.tokenExpiry" placeholder="如 8h" />
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 邮件配置 -->
        <el-tab-pane label="邮件配置" name="email">
          <el-form :model="form.emailConfig" label-width="120px" style="max-width: 480px">
            <el-form-item label="SMTP服务器">
              <el-input v-model="form.emailConfig.host" placeholder="如 smtp.example.com" />
            </el-form-item>
            <el-form-item label="端口">
              <el-input-number v-model="form.emailConfig.port" :min="1" :max="65535" />
            </el-form-item>
            <el-form-item label="邮箱账号">
              <el-input v-model="form.emailConfig.username" placeholder="如 noreply@x.com" />
            </el-form-item>
            <el-form-item label="启用SSL">
              <el-switch v-model="form.emailConfig.ssl" />
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 短信配置 -->
        <el-tab-pane label="短信配置" name="sms">
          <el-form :model="form.smsConfig" label-width="120px" style="max-width: 480px">
            <el-form-item label="服务商">
              <el-select v-model="form.smsConfig.provider" placeholder="请选择" style="width: 100%">
                <el-option label="阿里云" value="ALIYUN" />
                <el-option label="腾讯云" value="TENCENT" />
                <el-option label="华为云" value="HUAWEI" />
              </el-select>
            </el-form-item>
            <el-form-item label="AccessKey">
              <el-input v-model="form.smsConfig.accessKey" placeholder="访问密钥" show-password />
            </el-form-item>
            <el-form-item label="短信签名">
              <el-input v-model="form.smsConfig.signName" placeholder="如 Titanium保险" />
            </el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>

      <div class="ti-config-footer">
        <el-button type="primary" :loading="saving" v-permission="'system:config:save'" @click="handleSave">
          保存
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { getSystemConfigs, saveSystemConfigs, type SystemConfig } from '@/api/systemConfig'

const activeTab = ref('global')
const saving = ref(false)

const form = reactive<Required<SystemConfig>>({
  globalConfig: { defaultPageSize: 20, maxFileSize: '', tokenExpiry: '' },
  emailConfig: { host: '', port: 465, username: '', ssl: true },
  smsConfig: { provider: '', accessKey: '', signName: '' },
})

const loadConfigs = async () => {
  const data = await getSystemConfigs()
  if (data.globalConfig) Object.assign(form.globalConfig, data.globalConfig)
  if (data.emailConfig) Object.assign(form.emailConfig, data.emailConfig)
  if (data.smsConfig) Object.assign(form.smsConfig, data.smsConfig)
}

loadConfigs()

const handleSave = async () => {
  saving.value = true
  try {
    await saveSystemConfigs(form)
    ElMessage.success('保存成功')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.ti-config-footer {
  margin-top: 16px;
  padding-left: 120px;
}
</style>
