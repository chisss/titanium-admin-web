<template>
  <!-- 系统配置页 -->
  <div class="ti-page">
    <el-card shadow="never" v-loading="loading">
      <!-- 🔴 加载失败必须阻断保存，不能只是提示：
           本页是**全量替换**式保存（saveSystemConfigs(form) 整体 PUT），
           而 form 的初值是前端默认值（defaultPageSize 20 / port 465 / ssl true / 其余空串）。
           原先 loadConfigs() 在 setup 顶层裸调且无 catch，接口一失败就静默保留默认值，
           此时点「保存」= 把默认值写进生产 —— SMTP 主机、端口、账号与短信 AccessKey 会被清空/覆盖。
           故加载未成功前，保存按钮一律不可用。 -->
      <el-alert
        v-if="loadError"
        class="ti-alert"
        type="error"
        :closable="false"
        show-icon
        title="配置加载失败，已禁止保存"
      >
        <p class="ti-alert__text">
          当前表单显示的并非服务端真实配置（仍是前端默认值），保存会覆盖线上配置，因此已停用保存按钮。
          {{ loadError }}
        </p>
        <el-button size="small" @click="loadConfigs">重新加载</el-button>
      </el-alert>

      <el-tabs v-model="activeTab">
        <!-- 全局参数 -->
        <el-tab-pane label="全局参数" name="global">
          <el-form ref="globalFormRef" :model="form.globalConfig" :rules="globalRules" label-width="120px" class="ti-form-width--compact">
            <el-form-item label="默认分页大小" prop="defaultPageSize">
              <el-input-number v-model="form.globalConfig.defaultPageSize" :min="1" :max="200" />
            </el-form-item>
            <el-form-item label="文件上传上限" prop="maxFileSize">
              <el-input v-model="form.globalConfig.maxFileSize" placeholder="如 10MB" />
            </el-form-item>
            <el-form-item label="Token过期" prop="tokenExpiry">
              <el-input v-model="form.globalConfig.tokenExpiry" placeholder="如 8h" />
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 邮件配置 -->
        <el-tab-pane label="邮件配置" name="email">
          <el-form ref="emailFormRef" :model="form.emailConfig" :rules="emailRules" label-width="120px" class="ti-form-width--compact">
            <el-form-item label="SMTP服务器" prop="host">
              <el-input v-model="form.emailConfig.host" placeholder="如 smtp.example.com" />
            </el-form-item>
            <el-form-item label="端口" prop="port">
              <el-input-number v-model="form.emailConfig.port" :min="1" :max="65535" />
            </el-form-item>
            <el-form-item label="邮箱账号" prop="username">
              <el-input v-model="form.emailConfig.username" placeholder="如 noreply@x.com" />
            </el-form-item>
            <el-form-item label="启用SSL">
              <el-switch v-model="form.emailConfig.ssl" />
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 短信配置 -->
        <el-tab-pane label="短信配置" name="sms">
          <el-form ref="smsFormRef" :model="form.smsConfig" :rules="smsRules" label-width="120px" class="ti-form-width--compact">
            <el-form-item label="服务商" prop="provider">
              <TiDictSelect v-model="form.smsConfig.provider" dict-type="CLOUD_SERVICE_PROVIDER" placeholder="请选择" style="width: 100%" />
            </el-form-item>
            <el-form-item label="AccessKey" prop="accessKey">
              <el-input v-model="form.smsConfig.accessKey" placeholder="访问密钥" show-password />
            </el-form-item>
            <el-form-item label="短信签名" prop="signName">
              <el-input v-model="form.smsConfig.signName" placeholder="如 Titanium保险" />
            </el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>

      <div class="ti-config-footer">
        <!-- 🔴 保存必须等三件事同时成立：加载已完成、无加载错误、无字段校验错误。
             「加载未完成即可保存」是本页最危险的路径（全量 PUT 覆盖生产配置）。 -->
        <el-button
          type="primary"
          :loading="saving"
          :disabled="!loaded || loading || !!loadError"
          v-permission="'system:config:save'"
          @click="handleSave"
        >
          保存
        </el-button>
        <span v-if="!loaded && !loadError" class="ti-config-footer__hint">正在读取服务端配置，请稍候…</span>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { getSystemConfigs, saveSystemConfigs, type SystemConfig } from '@/api/systemConfig'
import TiDictSelect from '@/components/TiDictSelect/index.vue'

const activeTab = ref('global')
const saving = ref(false)
const loading = ref(false)
/** 加载错误文案；非空即禁止保存（见模板顶部说明） */
const loadError = ref('')
/** 是否已成功读取服务端配置 —— 保存的唯一前置条件 */
const loaded = ref(false)

const globalFormRef = ref<FormInstance>()
const emailFormRef = ref<FormInstance>()
const smsFormRef = ref<FormInstance>()

const form = reactive<Required<SystemConfig>>({
  globalConfig: { defaultPageSize: 20, maxFileSize: '', tokenExpiry: '' },
  emailConfig: { host: '', port: 465, username: '', ssl: true },
  smsConfig: { provider: '', accessKey: '', signName: '' },
})

/**
 * 校验规则只覆盖**结构上可判定**的约束，不臆造后端未声明的格式。
 *
 * <p>「整组要么全配、要么全不配」是这两组配置自身的结构事实：只填 SMTP 主机不填账号、
 * 或只选短信服务商不填签名，都是必然不可用的半配置状态。而完全留空属于「未启用该通道」，
 * 是合法状态，不能强制必填。</p>
 *
 * <p>🔴 不再对 maxFileSize / tokenExpiry 施加格式正则：placeholder 只给了「如 10MB」「如 8h」
 * 这类**示例**，后端实际接受的格式（是否允许 10240、10MB、10 MB、1d…）无从确证，
 * 凭空收紧会把合法取值挡在门外——这类「猜出来的校验」比没有校验更有害。</p>
 */
const anyFilled = (...values: unknown[]) => values.some((v) => v !== '' && v !== null && v !== undefined)

const globalRules: FormRules = {
  defaultPageSize: [{ required: true, type: 'number', message: '请填写默认分页大小', trigger: 'change' }],
}

const emailRules: FormRules = {
  host: [
    {
      validator: (_rule, _value, callback) => {
        if (anyFilled(form.emailConfig.host, form.emailConfig.username)) {
          if (!form.emailConfig.host) return callback(new Error('配置邮件通道时，SMTP服务器不能为空'))
          if (!form.emailConfig.username) return callback(new Error('配置邮件通道时，邮箱账号不能为空'))
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
}

const smsRules: FormRules = {
  provider: [
    {
      validator: (_rule, _value, callback) => {
        if (anyFilled(form.smsConfig.provider, form.smsConfig.accessKey, form.smsConfig.signName)) {
          if (!form.smsConfig.provider) return callback(new Error('配置短信通道时，服务商不能为空'))
          if (!form.smsConfig.accessKey) return callback(new Error('配置短信通道时，AccessKey 不能为空'))
          if (!form.smsConfig.signName) return callback(new Error('配置短信通道时，短信签名不能为空'))
        }
        callback()
      },
      trigger: 'change',
    },
  ],
}

/**
 * 读取服务端配置。
 *
 * <p>🔴 失败时**必须同时**置 loadError 并保持 loaded=false：只提示不阻断，用户仍会点保存，
 * 而全量 PUT 会把前端默认值写进生产（SMTP 主机/端口/账号、短信 AccessKey 均被清空）。</p>
 */
const loadConfigs = async () => {
  loading.value = true
  loadError.value = ''
  try {
    const data = await getSystemConfigs()
    if (data.globalConfig) Object.assign(form.globalConfig, data.globalConfig)
    if (data.emailConfig) Object.assign(form.emailConfig, data.emailConfig)
    if (data.smsConfig) Object.assign(form.smsConfig, data.smsConfig)
    loaded.value = true
  } catch (e) {
    loaded.value = false
    // 不把原始错误对象直接抛给用户；能取到 message 就附上，便于区分网络故障与后端报错
    loadError.value = e instanceof Error && e.message ? e.message : '请检查网络或稍后重试'
    console.error('[system/config] 配置加载失败', e)
  } finally {
    loading.value = false
  }
}

onMounted(loadConfigs)

const handleSave = async () => {
  // 双保险：按钮已禁用，这里再挡一次（键盘触发、程序调用等路径）
  if (!loaded.value || loadError.value) {
    ElMessage.warning('配置尚未成功加载，保存会覆盖线上配置，已阻止本次操作')
    return
  }
  // 三个 tab 的表单都要校验：保存是整体提交，任一 tab 半配置都会落库
  const results = await Promise.all(
    [globalFormRef, emailFormRef, smsFormRef].map((r) => r.value?.validate().then(() => true).catch(() => false)),
  )
  if (results.some((ok) => !ok)) {
    ElMessage.warning('还有未填写或不合规的配置项，请检查各标签页')
    return
  }
  saving.value = true
  try {
    await saveSystemConfigs(form)
    ElMessage.success('保存成功')
    // 保存后重新拉取：确认服务端实际落库的值与表单一致（全量 PUT 的写回可能与提交值不同，
    // 例如后端对 AccessKey 做掩码），避免界面与真实配置长期背离
    await loadConfigs()
  } finally {
    saving.value = false
  }
}
</script>

<style scoped lang="scss">
.ti-alert {
  margin-bottom: $space-4;

  &__text {
    margin: 0 0 $space-2;
    font-size: $font-size-sm;
    line-height: 1.6;
  }
}

.ti-config-footer {
  display: flex;
  align-items: center;
  gap: $space-3;
  margin-top: $space-4;
  padding-left: 120px;

  &__hint {
    font-size: $font-size-sm;
    color: $text-secondary;
  }
}
</style>
