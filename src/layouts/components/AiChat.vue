<template>
  <!-- 底部 AI 助手（可收起/展开） -->
  <div class="ai-chat" :class="{ 'ai-chat--expanded': expanded }">
    <!-- 收起状态：仅显示一行输入条 -->
    <div class="ai-chat__bar">
      <el-icon class="ai-chat__icon"><ChatDotRound /></el-icon>
      <span class="ai-chat__hint">有什么可以帮您？</span>
      <el-input
        v-model="inputText"
        class="ai-chat__input"
        placeholder="向 AI 助手提问..."
        @keydown.enter="sendMessage"
        @focus="expanded || $emit('expand')"
      />
      <el-button type="primary" :icon="Promotion" @click="sendMessage">发送</el-button>
      <el-button text :icon="expanded ? ArrowDown : ArrowUp" @click="$emit('toggle')" />
    </div>

    <!-- 展开状态：显示对话历史 -->
    <transition name="chat-expand">
      <div v-if="expanded" class="ai-chat__history">
        <el-scrollbar ref="scrollRef" height="100%">
          <div class="ai-chat__messages">
            <div
              v-for="msg in messages"
              :key="msg.id"
              class="ai-chat__message"
              :class="`ai-chat__message--${msg.role}`"
            >
              <div class="ai-chat__bubble">{{ msg.content }}</div>
              <div class="ai-chat__time">{{ msg.time }}</div>
            </div>
            <div v-if="responding" class="ai-chat__message ai-chat__message--assistant">
              <div class="ai-chat__bubble ai-chat__bubble--loading">
                <span class="dot" /><span class="dot" /><span class="dot" />
              </div>
            </div>
          </div>
        </el-scrollbar>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { ChatDotRound, Promotion, ArrowDown, ArrowUp } from '@element-plus/icons-vue'

interface Props {
  expanded: boolean
}

defineProps<Props>()
defineEmits<{ toggle: []; expand: [] }>()

interface Message {
  id: number
  role: 'user' | 'assistant'
  content: string
  time: string
}

const inputText = ref('')
const responding = ref(false)
const scrollRef = ref()
const messages = ref<Message[]>([
  {
    id: 0,
    role: 'assistant',
    content: '您好！我是 Titanium 智能助手，可以帮您查询保单信息、分析业务数据、解答系统操作问题。',
    time: new Date().toLocaleTimeString(),
  },
])

let msgIdCounter = 1

const sendMessage = async () => {
  const text = inputText.value.trim()
  if (!text || responding.value) return

  messages.value.push({
    id: msgIdCounter++,
    role: 'user',
    content: text,
    time: new Date().toLocaleTimeString(),
  })
  inputText.value = ''
  responding.value = true

  await nextTick()
  scrollRef.value?.scrollTo({ top: 99999 })

  // 模拟 AI 响应（实际项目中接入 LLM API）
  setTimeout(() => {
    messages.value.push({
      id: msgIdCounter++,
      role: 'assistant',
      content: `收到您的问题："${text}"。该功能在实际部署中将连接 AI 服务。`,
      time: new Date().toLocaleTimeString(),
    })
    responding.value = false
    nextTick(() => scrollRef.value?.scrollTo({ top: 99999 }))
  }, 1200)
}
</script>

<style scoped lang="scss">
.ai-chat {
  background: $card-bg;
  border-top: 1px solid $border-color;
  display: flex;
  flex-direction: column;
  height: $ai-chat-height;
  transition: height 0.3s ease;
  flex-shrink: 0;

  &--expanded {
    height: $ai-chat-expanded-height;
  }

  &__bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 16px;
    height: $ai-chat-height;
    flex-shrink: 0;
  }

  &__icon {
    color: $primary-color;
    font-size: 20px;
  }

  &__hint {
    font-size: 13px;
    color: #909399;
    white-space: nowrap;
  }

  &__input {
    flex: 1;
  }

  &__history {
    flex: 1;
    overflow: hidden;
    border-top: 1px solid $border-color;
  }

  &__messages {
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__message {
    display: flex;
    flex-direction: column;

    &--user {
      align-items: flex-end;

      .ai-chat__bubble {
        background: $primary-color;
        color: #ffffff;
      }
    }

    &--assistant {
      align-items: flex-start;

      .ai-chat__bubble {
        background: #f4f6f8;
        color: #303133;
      }
    }
  }

  &__bubble {
    max-width: 70%;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 13px;
    line-height: 1.5;

    &--loading {
      display: flex;
      gap: 4px;
      align-items: center;
      padding: 12px 16px;

      .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #909399;
        animation: dot-bounce 1.2s infinite;

        &:nth-child(2) { animation-delay: 0.2s; }
        &:nth-child(3) { animation-delay: 0.4s; }
      }
    }
  }

  &__time {
    font-size: 11px;
    color: #c0c4cc;
    margin-top: 2px;
    padding: 0 4px;
  }
}

@keyframes dot-bounce {
  0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
  40% { transform: scale(1.1); opacity: 1; }
}
</style>
