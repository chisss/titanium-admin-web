<template>
  <!-- TiCopyText：后台统一编码/编号展示（等宽字体 + 不换行 + 一键复制） -->
  <span class="ti-copy-text" :title="text || ''">
    <span class="ti-copy-text__val">{{ text || '-' }}</span>
    <el-icon v-if="text" class="ti-copy-text__btn" @click.stop="onCopy">
      <CopyDocument />
    </el-icon>
  </span>
</template>

<script setup lang="ts">
import { CopyDocument } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

/** TiCopyText 属性 */
interface Props {
  /** 编码文本 */
  text?: string
}

const props = defineProps<Props>()

// 复制到剪贴板，兼容非安全上下文（clipboard 不可用时降级 execCommand）
const onCopy = async () => {
  const value = props.text
  if (!value) return
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
    } else {
      const ta = document.createElement('textarea')
      ta.value = value
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    ElMessage.success('已复制')
  } catch {
    ElMessage.error('复制失败')
  }
}
</script>

<style scoped lang="scss">
.ti-copy-text {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  vertical-align: middle;

  &__val {
    // 后台通用编码样式：等宽字体、不换行、超长省略
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
    font-size: 13px;
    color: var(--el-text-color-regular);
    letter-spacing: 0.3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__btn {
    flex-shrink: 0;
    cursor: pointer;
    color: var(--el-color-primary);
    opacity: 0.35;
    transition: opacity 0.15s ease;

    &:hover {
      opacity: 1;
    }
  }

  // 悬停整块时提升复制图标可见度
  &:hover .ti-copy-text__btn {
    opacity: 1;
  }
}
</style>
