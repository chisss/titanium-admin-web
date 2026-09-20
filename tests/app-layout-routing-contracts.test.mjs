import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appLayoutSource = await readFile(
  new URL('../src/layouts/AppLayout.vue', import.meta.url),
  'utf8',
)
const topbarSource = await readFile(
  new URL('../src/layouts/components/Topbar.vue', import.meta.url),
  'utf8',
)
const aiChatSource = await readFile(
  new URL('../src/layouts/components/AiChat.vue', import.meta.url),
  'utf8',
)

test('异步业务路由切换不使用 out-in 模式阻塞新视图挂载', () => {
  assert.match(appLayoutSource, /<router-view\s+v-slot="\{ Component, route \}">/)
  assert.match(appLayoutSource, /<transition\s+name="slide">/)
  assert.doesNotMatch(appLayoutSource, /<transition[^>]*\bmode="out-in"/)
})

test('窄屏使用抽屉导航且隐藏非核心实时数据侧栏', () => {
  // 🔴 原先断言字面量 `useMediaQuery('(max-width: 767px)')`。断点收敛到
  // src/constants/layout 后，钉住字面量等于**把双写冻结进测试**——它会让"改用共享常量"
  // 这件事本身变成测试失败。本用例要守的是「窄屏判定与 CSS 同源且用于切换导航」，
  // 不是 767 这个数字；数字是否两边一致由 layout-breakpoint-contracts.test.mjs ① 守护。
  assert.match(appLayoutSource, /import \{ MEDIA_MAX_MOBILE \} from '@\/constants\/layout'/)
  assert.match(appLayoutSource, /useMediaQuery\(MEDIA_MAX_MOBILE\)/)
  assert.match(appLayoutSource, /class="mobile-navigation-drawer"/)
  assert.match(appLayoutSource, /<DataPanel\s+v-if="!isMobile"/)
  assert.match(appLayoutSource, /mobileNavigationVisible\.value = false/)
})

test('窄屏隐藏按钮文字后仍保留可访问名称', () => {
  assert.match(topbarSource, /:aria-label="`切换语言，当前\$\{currentLocaleName\}`"/)
  assert.match(aiChatSource, /aria-label="发送消息"/)
})
