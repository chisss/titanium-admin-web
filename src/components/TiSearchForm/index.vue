<template>
  <!-- TiSearchForm：搜索表单容器，支持展开/收起高级搜索 -->
  <div class="ti-search-area">
    <el-form :model="model" :inline="inline" @submit.prevent="handleSearch">
      <!-- 基础搜索区 -->
      <div class="ti-search-basic">
        <slot />
        <el-form-item>
          <el-button type="primary" native-type="submit" :icon="Search">搜索</el-button>
          <el-button :icon="Refresh" @click="handleReset">重置</el-button>
          <el-button
            v-if="hasAdvanced"
            text
            :icon="advancedVisible ? ArrowUp : ArrowDown"
            @click="toggleAdvanced"
          >
            {{ advancedVisible ? '收起' : '高级搜索' }}
          </el-button>
        </el-form-item>
      </div>
      <!-- 高级搜索区（可折叠） -->
      <el-collapse-transition>
        <div v-show="advancedVisible" class="ti-search-advanced">
          <slot name="advanced" />
        </div>
      </el-collapse-transition>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { Search, Refresh, ArrowUp, ArrowDown } from '@element-plus/icons-vue'

interface Props {
  /** 表单绑定对象 */
  model: Record<string, unknown>
  /** 是否行内布局 */
  inline?: boolean
  /** 是否有高级搜索 slot */
  hasAdvanced?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  inline: true,
  hasAdvanced: false,
})

const emit = defineEmits<{
  /** 触发搜索 */
  search: []
  /** 触发重置 */
  reset: []
}>()

// 高级搜索展开状态
const advancedVisible = ref(false)

const toggleAdvanced = () => {
  advancedVisible.value = !advancedVisible.value
}

const handleSearch = () => {
  emit('search')
}

const handleReset = () => {
  emit('reset')
}
</script>

<style scoped lang="scss">
.ti-search-advanced {
  border-top: 1px dashed $border-color;
  padding-top: 12px;
  margin-top: 4px;
}
</style>
