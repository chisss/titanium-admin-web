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

// 意向单独立入口的恒失败封装（🔴 D-501-01）
// 形态说明：与上方两条同族，但失败机理不同 —— 端点**存在**（BFF 有 POST /proposals 与
// PUT /proposals/{id}/submit），坏在链路承载能力：下游 CreateProposalRequest 仅 12 个标量字段，
// 既对不上本封装的字段名，也载不了参与方与标的，而提交前置恰是「≥1 申请人 + ≥1 标的」。
// 故运行期观测到的是业务码拒绝而非 404，靠返回值同样区分不出「参数没传对」与「永远传不对」，
// 只能锁定结构性事实：恒失败封装已删除，且删除**未误伤**读写侧的真实能力。
const insuranceApi = await read('src/api/insurance.ts')
const insuranceProxyController = await readFile(
  new URL(
    '../../titanium-admin/titanium-admin-web/src/main/java/com/titanium/admin/web/controller/proxy/insurance/InsuranceProxyController.java',
    import.meta.url,
  ),
  'utf8',
)

test('意向单新建/提交封装已删除（链路无参与方与标的承载能力，恒不可提交）', () => {
  assert.doesNotMatch(insuranceApi, /export async function createProposal/)
  assert.doesNotMatch(insuranceApi, /export async function submitProposal/)
  assert.doesNotMatch(insuranceApi, /export interface CreateProposalForm/)
  // 反向对照锚点：只删封装，不得连只读详情一起删
  assert.match(insuranceApi, /export async function getProposalDetail/)
  assert.match(insuranceApi, /export async function getProposalList/)
})

test('意向单只读查询链路仍在（删除恒失败封装不得误伤查询能力）', () => {
  assert.match(insuranceApi, /http\.get\(`\/web\/v1\/proxy\/proposals\/\$\{id\}`\)/)
  assert.match(insuranceProxyController, /@GetMapping\("\/proposals"\)/)
  assert.match(insuranceProxyController, /@GetMapping\("\/proposals\/\{id\}"\)/)
})
