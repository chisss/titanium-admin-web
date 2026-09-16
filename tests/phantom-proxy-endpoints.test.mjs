import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

// BFF 假契约的前端半边（🔴 D-501-07 / D-501-08）
// 形态说明：源码文本断言。两条缺陷的现场都是「前端函数指向一个下游不存在的端点」，
// 运行期只能观测到 404，无法从返回值区分「端点不存在」与「数据不存在」；
// 故锁定「死函数已删除 / 真契约已对齐」这一结构性事实。
const read = (rel) => readFile(new URL(`../${rel}`, import.meta.url), 'utf8')

const channelApi = await read('src/api/channel.ts')
const productApi = await read('src/api/product.ts')

test('渠道关联产品查询函数已删除（下游无该查询端点）', () => {
  // 下游 ChannelRelationPort 只有增删、无查询 ⇒ 保留即假契约，调用必 404
  assert.doesNotMatch(channelApi, /export function getChannelProducts/)
  assert.doesNotMatch(channelApi, /proxy\/channels\/\$\{id\}\/products'\)/)
})

test('添加渠道产品关联对齐下游契约：productId 走请求体，路径无 {productId} 段', () => {
  assert.match(channelApi, /export function addChannelProduct\(id: string, data: Record<string, unknown>\)/)
  assert.match(channelApi, /http\.post\(`\/web\/v1\/proxy\/channels\/\$\{id\}\/products`, data\)/)
})

test('产品裸更新函数已删除（产品是版本化实体，变更走修订）', () => {
  // 下游 ProductController 无裸 PUT /{productId}，只有 revise 与四个带后缀动作
  assert.doesNotMatch(productApi, /export function updateProduct/)
  assert.doesNotMatch(productApi, /http\.put\(`\/web\/v1\/proxy\/products\/\$\{id\}`, data\)/)
})

test('产品修订契约仍在（删除假契约不得误伤真实能力）', () => {
  assert.match(productApi, /export function reviseProduct/)
  assert.match(productApi, /\/web\/v1\/proxy\/products\/\$\{id\}\/revise/)
})
