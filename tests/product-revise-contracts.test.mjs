import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

// 产品修订流契约（round6 批次 1）
//
// 缺陷背景：产品列表「编辑」按钮（仅 DRAFT 显示）跳到 create 向导，向导标题写着「编辑产品」、
// 按钮写着「保存修改」，而 `handleSave` **恒调 `createProduct`** ⇒ 用户每点一次保存就凭空
// 产生一份**重复产品**。且后端根本没有「原地更新产品」端点，DRAFT 状态实际无任何可写入口。
//
// 形态说明：`api/product.ts` 运行时依赖 `./http`（axios + pinia），node 测试无法直接 import，
// 故本文件为**源码结构断言 + 跨仓后端能力断言**。后者是本组用例的重点：它把前端写法钉死在后端
// 实际提供的能力上，防止「UI 承诺了后端做不到的事」这类缺陷复发。
const productApiSource = await readFile(new URL('../src/api/product.ts', import.meta.url), 'utf8')
const productCreateSource = await readFile(
  new URL('../src/views/product/create/index.vue', import.meta.url),
  'utf8',
)
const productListSource = await readFile(new URL('../src/views/product/list/index.vue', import.meta.url), 'utf8')
const productProxyControllerSource = await readFile(
  new URL(
    '../../titanium-admin/titanium-admin-web/src/main/java/com/titanium/admin/web/controller/proxy/product/ProductProxyController.java',
    import.meta.url,
  ),
  'utf8',
)
const insuranceProductAggregateSource = await readFile(
  new URL(
    '../../titanium-product/titanium-product-domain/src/main/java/com/titanium/product/aggregate/InsuranceProduct.java',
    import.meta.url,
  ),
  'utf8',
)

/** 剥掉注释，只留可执行代码（说明性注释里刻意引用了历史缺陷代码，全文匹配会假阳性） */
const stripComments = (source) =>
  source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')

const productCreateCode = stripComments(productCreateSource)
const productListCode = stripComments(productListSource)

test('① 后端确实没有「原地更新产品」端点（本组用例的能力前提）', () => {
  // 🔴 这条是全部用例的地基：只有先确证后端无裸 PUT，才能判定「编辑既有产品」是不可能的，
  //    从而判定前端那个「编辑」入口必然是错的。
  assert.match(
    productProxyControllerSource,
    /原 \{@code PUT \/\{id\}\}「更新产品」端点已删除|不存在原地更新语义/,
    'BFF 必须明确声明不存在原地更新语义',
  )
  // 产品路径下不得存在无子路径的 PUT（即 PUT /{id}）
  const barePut = /@PutMapping\("\/\{id\}"\)/.test(productProxyControllerSource)
  assert.equal(barePut, false, 'BFF 不得提供 PUT /{id}（原地更新）端点')
  // 唯一能变更既有产品的写入口是版本化修订
  assert.match(productProxyControllerSource, /@PostMapping\("\/\{id\}\/revise"\)/)
  assert.match(productProxyControllerSource, /@PostMapping\b/)
})

test('② 后端修订要求原产品为 EFFECTIVE（决定前端入口只在 EFFECTIVE 出现）', () => {
  assert.match(
    insuranceProductAggregateSource,
    /handle\(ReviseProductCommand command\)[\s\S]{0,200}ProductStatus\.EFFECTIVE\.equals\(this\.status\)/,
    'ReviseProductCommand 必须校验 status == EFFECTIVE',
  )
  // 修订产出的是**新版本 DRAFT**，不改写当前生效版本
  assert.match(insuranceProductAggregateSource, /产品修订（EFFECTIVE → 创建新版本DRAFT）/)
})

test('③ 列表页修订入口只在 EFFECTIVE 出现，且 DRAFT 不再有写入口', () => {
  assert.match(productListCode, /v-if="row\.status === 'EFFECTIVE'"/, '修订按钮须以 EFFECTIVE 为门禁')
  assert.match(productListCode, /@click="goRevise\(row\)"/)
  // 🔴 原缺陷：DRAFT 上的「编辑」按钮 → create 页 → 无条件 createProduct ⇒ 重复产品
  assert.ok(!productListCode.includes('goEdit'), 'goEdit 必须已被 goRevise 取代')
  assert.ok(
    !/row\.status === 'DRAFT'[\s\S]{0,200}product\/create/.test(productListCode),
    'DRAFT 不得再出现指向 create 向导的写入口（后端无对应端点）',
  )
  // 修订的后果必须先在确认框里讲清，不能默默跳转（与「编辑」心智模型不同）
  assert.match(productListCode, /goRevise = async/)
  assert.match(productListCode, /新版本草稿/)
})

test('④ create 页不得再自称「编辑」，且 ?id= 时提交绝不走 createProduct', () => {
  // 文案层面：不再出现「编辑产品 / 保存修改」
  assert.ok(!productCreateCode.includes('编辑产品'), '页面不得再自称「编辑产品」')
  assert.ok(!productCreateCode.includes('保存修改'), '按钮不得再写「保存修改」')
  assert.match(productCreateCode, /修订产品/, '应改为「修订产品」')

  // 语义层面：`isEdit` 已由语义准确的 `reviseFromId` 取代
  assert.ok(!productCreateCode.includes('isEdit'), 'isEdit（`!!route.query.id`）语义失真，应已移除')
  assert.match(productCreateCode, /const reviseFromId = computed/)

  // 🔴 核心：提交必须按 reviseFromId 分支，且修订分支只调 reviseProduct
  assert.match(productCreateCode, /if \(reviseFromId\.value\) \{/)
  assert.match(productCreateCode, /await reviseProduct\(\s*reviseFromId\.value,/)
  // createProduct 只允许出现在 else 分支里
  const elseBranch = productCreateCode.match(/\} else \{[\s\S]*?await createProduct\(/)
  assert.ok(elseBranch, 'createProduct 必须只在非修订分支调用')
  // 不得存在无条件的 createProduct（那正是重复产品的成因）
  assert.ok(
    !/saving\.value = true\s*try \{\s*\/\/[^\n]*\n\s*await createProduct\(/.test(productCreateCode),
    '不得再无条件下调 createProduct',
  )
})

test('⑤ 修订必须加载原版本原始载荷，且未加载成功前禁止提交', () => {
  // 载荷来源：getProductDetailRaw（注释明写「修订页用」，经视图模型裁剪会丢字段）
  assert.match(productApiSource, /getProductDetailRaw\(id: string\)/)
  assert.match(productCreateCode, /getProductDetailRaw\(id\)/)
  assert.match(productCreateCode, /const reviseFromId = computed/)
  assert.match(productCreateCode, /rawDetail = ref<Record<string, unknown> \| null>\(null\)/)

  // 加载入口
  assert.match(productCreateCode, /const loadReviseSource = async/)
  assert.match(productCreateCode, /onMounted\(\(\) => \{\s*if \(reviseFromId\.value\) void loadReviseSource\(\)/)

  // 双保险：按钮禁用 + 提交内二次守卫（载荷为空时合并基准为空，新版本会清空未覆盖配置）
  assert.match(productCreateCode, /:disabled="!!reviseFromId && !rawDetail"/)
  assert.match(productCreateCode, /if \(!rawDetail\.value\) \{[\s\S]{0,120}无法提交修订/)
})

test('⑥ 修订载荷合并必须剔除 undefined 键（否则静默清空原版本配置）', () => {
  // 🔴 这是本次改动里最容易写错、且后果最隐蔽的一点：
  //    `toCreateProductPayload` 在「无文档材料」「无核保规则集」时会产出 `documentConfig: undefined`。
  //    直接 `{ ...rawDetail, ...payload }` 时该键**依然存在**（值为 undefined），覆盖掉 raw 的真实配置；
  //    再经 JSON.stringify 序列化时 undefined 键被丢弃 ⇒ 后端收到的载荷里该字段凭空消失
  //    ⇒ 表现为「修订一次，原版本的文档配置被静默清空」。
  assert.match(productApiSource, /export function toReviseProductPayload\(/)
  const fn = productApiSource.match(/export function toReviseProductPayload\([\s\S]*?\n\}/)
  assert.ok(fn, '应存在 toReviseProductPayload')
  assert.ok(fn[0].includes('!== undefined'), '必须先剔除值为 undefined 的键，再展开合并')
  // 顺序不可颠倒：rawDetail 在前（兜底），表单映射在后（覆盖）
  assert.match(fn[0], /\{ \.\.\.rawDetail, \.\.\.defined \}/)
  // create 页确实用的是这个函数，而不是就地手写展开
  assert.match(productCreateCode, /toReviseProductPayload\(form, rawDetail\.value\)/)
})

test('⑦ 回填表单时险种两字段不得写反（category 同名不同义）', () => {
  // 🔴 后端 `category` 是产品类别 MAIN/RIDER（对应表单 productCategory），
  //    表单 `category` 是险种大类 LIFE/HEALTH/…。二者同名不同义，写反会让
  //    险种大类静默错位、二级险种下拉全空 —— 而这是产品配置的主干字段。
  assert.match(
    productCreateCode,
    /form\.productCategory = \(text\('category'\) as CreateProductForm\['productCategory'\]\)/,
  )
  assert.match(productCreateCode, /form\.category = CATEGORY_BY_INSURANCE_TYPE\[form\.insuranceType \?\? ''\]/)
  assert.match(productCreateCode, /import \{[^}]*CATEGORY_BY_INSURANCE_TYPE[^}]*\} from '@\/constants\/insurance'/)
  // 反向映射表确实存在且由 INSURANCE_TYPE_BY_CATEGORY 派生（不是手抄的第二份真源）
  assert.ok(productCreateCode.includes('CATEGORY_BY_INSURANCE_TYPE'))
})

test('⑧ 条款绑定取自专用端点（详情原始载荷不含 clauseIds）', () => {
  assert.match(productCreateCode, /const rels = await getProductClauses\(id\)/)
  assert.match(productCreateCode, /form\.clauseIds = rels\.map\(\(r\) => r\.clauseId\)/)
  assert.match(productCreateCode, /rels\.find\(\(r\) => r\.mainClause\)/)
})
