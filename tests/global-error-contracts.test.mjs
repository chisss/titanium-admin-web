import assert from 'node:assert/strict'
import test from 'node:test'

// 自注册无扩展名 TS 导入的解析钩子，必须在动态 import globalError 之前
import './ts-resolve-hook.mjs'

// 🔴 D-10 全局错误兜底 —— 行为测试，非源码文本断言。
//
// 为什么文本断言测不了本缺陷：断言源码里存在 `addEventListener('unhandledrejection'`，
// 只能证明写了这一行，证明不了两件真正重要的事——
//   ① 它**认得出** MessageBox 的 'cancel'/'close'（认不出 → 控制台照旧报红）；
//   ② 它**没有**把真错误一起吞掉（吞掉一切同样能让控制台干净，那是把缺陷藏起来）。
// 故此处真正注册监听、派发事件、断言 defaultPrevented 与 console.error 的调用。

// Node 无 window；模块只用到 addEventListener/dispatchEvent，EventTarget 足够。
// 不用 jsdom —— 为一个接口引入整个 DOM 实现，与「零新增依赖」的项目取向相悖。
globalThis.window = new EventTarget()

const { isMessageBoxDismiss, setupGlobalErrorHandling } = await import('../src/utils/globalError.ts')

/** app 桩：模块只写 app.config.errorHandler，不需要真的 App 实例 */
const appStub = { config: {} }
setupGlobalErrorHandling(appStub)
const onError = appStub.config.errorHandler

/**
 * 派发一次 unhandledrejection，返回是否被 preventDefault（= 浏览器是否还会打印）。
 * 🔴 `cancelable: true` 必须显式给：Event 默认不可取消，preventDefault() 会静默失效、
 * defaultPrevented 恒为 false，用例就变成假绿。真实的 PromiseRejectionEvent 也是可取消的。
 */
const dispatchRejection = (reason) => {
  const event = new Event('unhandledrejection', { cancelable: true })
  event.reason = reason
  window.dispatchEvent(event)
  return event.defaultPrevented
}

/** 捕获 console.error 调用，返回调用参数数组 */
const captureConsoleError = (fn) => {
  const original = console.error
  const calls = []
  console.error = (...args) => calls.push(args)
  try {
    fn()
  } finally {
    console.error = original
  }
  return calls
}

test('① 只把「用户关闭确认框」判为预期行为：裸字符串 cancel/close', () => {
  assert.equal(isMessageBoxDismiss('cancel'), true)
  assert.equal(isMessageBoxDismiss('close'), true)
  // 🔴 携带堆栈的 Error 一律走正常路径：`new Error('cancel')` 是**代码抛的错**，
  // 不是 MessageBox 的 action，混为一谈会把真错误吃掉
  assert.equal(isMessageBoxDismiss(new Error('cancel')), false)
  assert.equal(isMessageBoxDismiss(new Error('boom')), false)
  assert.equal(isMessageBoxDismiss('Cancel'), false, '大小写不匹配——EP 只发小写')
  assert.equal(isMessageBoxDismiss(undefined), false)
  assert.equal(isMessageBoxDismiss(null), false)
})

test('② 点「取消」不再产生控制台未捕获异常（事件被取消默认行为）', () => {
  assert.equal(dispatchRejection('cancel'), true, 'cancel 必须被 preventDefault，否则浏览器仍打印')
  assert.equal(dispatchRejection('close'), true, 'close（✕ / ESC）同理')
})

test('③ 真错误不被一起吞掉：非关闭原因的 rejection 保留默认打印', () => {
  assert.equal(dispatchRejection(new Error('接口炸了')), false, '真错误必须保持可见，不得 preventDefault')
  assert.equal(dispatchRejection('some-unexpected-string'), false)
})

test('④ 组件错误处理器：关闭确认框静默，其余照常打印', () => {
  const silent = captureConsoleError(() => onError('cancel', null, 'event handler'))
  assert.deepEqual(silent.filter((args) => String(args[0]).includes('[ti]')), [], 'cancel 不应产生任何打印')

  const loud = captureConsoleError(() => onError(new Error('渲染失败'), null, 'render function'))
  assert.equal(loud.length, 1, '🔴 真错误必须打印——注册 errorHandler 会替换 Vue 的默认实现，不接管打印等于静默吞错')
  assert.ok(String(loud[0][0]).includes('[ti]'), '打印需带 [ti] 前缀便于在控制台过滤')
})
