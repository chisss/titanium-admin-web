import assert from 'node:assert/strict'
import test from 'node:test'

// 自注册无扩展名 TS 导入的解析钩子，必须在动态 import http 之前
import './ts-resolve-hook.mjs'

// 🔴 D-501-58 请求级静默失败 —— **行为测试**，非源码文本断言。
//
// 为什么文本断言测不了本缺陷：断言源码里出现 `silentError` 只能证明写了这个字段，
// 证明不了两件真正重要的事 ——
//   ① 它**真的**拦住了提示。失败提示有三条分支（业务码失败 / HTTP 失败 / 403），
//      漏守任意一处就是「改了但没修好」，而文本断言照样全绿；
//   ② 它**没有**关不住。不传 silentError 时必须照旧弹提示，否则等于全站静默吞错 ——
//      这是比原缺陷严重得多的回归，且同样能让「①」断言通过。
// 故此处替换 axios 适配器注入受控失败，真正断言 ElMessage.error 的调用次数与 reject 的形态。

// Node 无 localStorage；请求拦截器无条件读取，不补桩则每次请求都 ReferenceError
const store = new Map()
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
}

// 会话失效分支会整页跳登录；Node 无 window
globalThis.window = { location: { href: '' } }

const { ElMessage } = await import('element-plus')
const { default: http, showErrorIfUnhandled } = await import('../src/api/http.ts')

/** 捕获 ElMessage.error 调用；返回调用参数数组与恢复函数 */
const captureToast = () => {
  const original = ElMessage.error
  const calls = []
  ElMessage.error = (...args) => calls.push(args)
  return { calls, restore: () => { ElMessage.error = original } }
}

/**
 * 注入受控适配器。
 * <p>`status` 落 2xx 走响应拦截器成功分支（业务码失败），落 4xx 走错误分支（HTTP 失败）——
 * 两条分支各有一处提示出口，都必须被覆盖。</p>
 */
const respondWith = (data, status = 200) => (config) => {
  if (status >= 200 && status < 300) {
    return Promise.resolve({ data, status, statusText: 'OK', headers: {}, config })
  }
  const response = { data, status, statusText: '', headers: {}, config }
  return Promise.reject(
    Object.assign(new Error(`Request failed with status code ${status}`), {
      isAxiosError: true,
      code: 'ERR_BAD_REQUEST',
      config,
      response,
    }),
  )
}

/** 发一次注定失败的请求，返回 reject 值（成功则抛，避免用例静默通过） */
const failWith = (config) => {
  http.defaults.adapter = respondWith(config.data, config.status ?? 200)
  return http.get('/probe', config.request).then(
    () => assert.fail('该请求必须失败，用例前提不成立'),
    (error) => error,
  )
}

test('① 静默请求：不弹提示，但消息照给、且未打「已提示」标记', async () => {
  const { calls, restore } = captureToast()
  try {
    const error = await failWith({
      data: { code: '74007000', message: '资源不存在' },
      request: { silentError: true },
    })

    assert.ok(error instanceof Error, '静默不等于吞错——仍须 reject 让调用方兜底')
    assert.equal(error.message, '资源不存在', '后端业务消息必须原样带给调用方')
    assert.deepEqual(calls, [], '静默请求不得弹全局提示')

    // 用公开 API 判定「是否已打标记」，避免在断言里复制内部的标记字符串
    showErrorIfUnhandled(error)
    assert.equal(calls.length, 1, '静默失败未打标记 ⇒ 调用方 showErrorIfUnhandled 仍能补上提示')
  } finally {
    restore()
  }
})

test('② 默认（不传 silentError）：提示照旧弹出，且调用方不再重复弹（D-501-51 不回归）', async () => {
  const { calls, restore } = captureToast()
  try {
    const error = await failWith({ data: { code: '74007000', message: '资源不存在' } })

    assert.equal(calls.length, 1, '🔴 静默是 opt-in——默认必须仍然弹，否则是全站吞错')
    assert.deepEqual(calls[0], ['资源不存在'])

    showErrorIfUnhandled(error)
    assert.equal(calls.length, 1, '拦截器已提示 ⇒ 调用方不得再弹一次（双重提示）')
  } finally {
    restore()
  }
})

test('③ 静默走 HTTP 失败分支（4xx）时同样不弹，且仍还原后端业务文案', async () => {
  const { calls, restore } = captureToast()
  try {
    const error = await failWith({
      data: { code: '40000000', message: '条款不存在' },
      status: 404,
      request: { silentError: true },
    })

    assert.equal(error.message, '条款不存在', '产品详情条款面板正是靠这条文案判定「条款信息缺失」')
    assert.deepEqual(calls, [], '错误分支的提示出口同样必须受静默守卫')
  } finally {
    restore()
  }
})

test('④ 静默对 403 同样生效（第三条提示出口）', async () => {
  const { calls, restore } = captureToast()
  try {
    await failWith({ data: { code: 403, message: 'forbidden' }, request: { silentError: true } })
    assert.deepEqual(calls, [], '403 分支的提示出口也必须受静默守卫')
  } finally {
    restore()
  }
})

test('⑤ 静默不吞会话处置：401 仍走登出（静默只关提示，不关安全链路）', async () => {
  const { calls, restore } = captureToast()
  try {
    store.set('ti_token', 'stale-token')
    store.set('ti_tenant_id', '1')
    globalThis.window.location.href = ''

    const error = await failWith({
      data: { code: '00000000', message: 'ok' },
      status: 401,
      request: { silentError: true },
    })

    assert.equal(globalThis.window.location.href, '/login', '401 且无可用刷新令牌 ⇒ 必须登出')
    assert.equal(store.has('ti_token'), false, '过期令牌必须被清除')
    assert.equal(error.message, '登录已过期')
    assert.deepEqual(calls, [], '登出不应额外弹一条提示（原有语义）')
  } finally {
    restore()
  }
})
