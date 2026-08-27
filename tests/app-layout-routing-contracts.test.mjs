import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appLayoutSource = await readFile(
  new URL('../src/layouts/AppLayout.vue', import.meta.url),
  'utf8',
)

test('异步业务路由切换不使用 out-in 模式阻塞新视图挂载', () => {
  assert.match(appLayoutSource, /<router-view\s+v-slot="\{ Component, route \}">/)
  assert.match(appLayoutSource, /<transition\s+name="slide">/)
  assert.doesNotMatch(appLayoutSource, /<transition[^>]*\bmode="out-in"/)
})

test('窄屏使用抽屉导航且隐藏非核心实时数据侧栏', () => {
  assert.match(appLayoutSource, /useMediaQuery\('\(max-width: 767px\)'\)/)
  assert.match(appLayoutSource, /class="mobile-navigation-drawer"/)
  assert.match(appLayoutSource, /<DataPanel\s+v-if="!isMobile"/)
  assert.match(appLayoutSource, /mobileNavigationVisible\.value = false/)
})
