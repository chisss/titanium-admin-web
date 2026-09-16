import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

// 令牌续期链路契约（🔴 D-501-29）
// 形态说明：源码文本断言。该缺陷的现场是「功能不存在」——刷新链路**两端都是死代码**：
// 前端 refreshToken() 零调用点且契约与服务端不符，登录返回的 refreshToken 被直接丢弃，
// 服务端 /auth/refresh 因此永远收不到请求。运行期无法用「接口返回什么」断言覆盖，
// 故锁定「令牌被持久化 + 401 走刷新 → 重放 → 失败才登出」这条结构性事实。
const read = (rel) => readFile(new URL(`../${rel}`, import.meta.url), 'utf8')

const http = await read('src/api/http.ts')
const userStore = await read('src/stores/user.ts')
const authApi = await read('src/api/auth.ts')

test('登录持久化刷新令牌，登出时一并清除', () => {
  assert.match(userStore, /localStorage\.setItem\('ti_refresh_token', result\.refreshToken\)/)
  assert.match(userStore, /localStorage\.removeItem\('ti_refresh_token'\)/)
})

test('刷新契约与服务端一致：刷新令牌走 Authorization 头，响应为新 AccessToken', () => {
  assert.match(http, /const REFRESH_URL = '\/web\/v1\/auth\/refresh'/)
  assert.match(http, /http\.post<unknown, string>\(REFRESH_URL, null, \{/)
  assert.match(http, /Authorization: `Bearer \$\{refreshToken\}`/)
})

test('请求拦截器不覆盖显式声明的 Authorization', () => {
  // 否则刷新请求会被塞回过期 AccessToken，永远换不到新令牌
  assert.match(http, /if \(token && !config\.headers\['Authorization'\]\)/)
})

test('401 不再直接登出，而是先刷新并重放原请求', () => {
  // 两个 401 入口（HTTP 401 与旧数字信封的 code 401）都必须走统一处置
  const calls = http.match(/return handleUnauthorized\(/g) ?? []
  assert.equal(calls.length, 2)
  // 续期成功即重放，且只重放一次（防「刷新 ↔ 401」死循环）
  assert.match(http, /config\.tiRetried = true/)
  assert.match(http, /return http\.request\(config\)/)
  assert.match(http, /!config \|\| !refreshToken \|\| isRefreshCall \|\| config\.tiRetried/)
})

test('并发 401 只发起一次刷新（单飞）', () => {
  assert.match(http, /let refreshInFlight: Promise<string> \| null = null/)
  assert.match(http, /if \(!refreshInFlight\) \{/)
})

test('刷新请求自身 401 时直接登出，不递归刷新', () => {
  assert.match(http, /const isRefreshCall = !!config\?\.url\?\.includes\(REFRESH_URL\)/)
})

test('刷新契约只有一份定义：api/auth 不再保留同名的死代码', () => {
  assert.doesNotMatch(authApi, /export function refreshToken/)
  assert.doesNotMatch(authApi, /'\/web\/v1\/auth\/refresh'/)
})
