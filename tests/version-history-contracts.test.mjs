import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

// 版本历史 / 差异对比 / 回滚契约（A4：产品、规则、费率全部版本化，满足监管审计）
//
// 形态说明：分三类，各有各的防备对象。
//   ① 纯函数行为测试（nextVersion / compareVersions）—— 版本推进与新旧判定错了，回滚会**选错方向**；
//   ② 前端源码结构断言 —— 「版本线按什么归组」「行级对比用什么当键」「回滚分几步」这类判断，
//      写错了不会崩，只会安静地给出错误的审计结论；
//   ③ 跨仓契约断言 —— BFF 与下游两侧各写一份手写镜像/契约，**漏一个字段即静默丢数据**。
import './ts-resolve-hook.mjs'

const { nextVersion, compareVersions } = await import('../src/utils/version.ts')
const { PRODUCT_VERSION_NOISE } = await import('../src/utils/versionDiff.ts')

/** 剥掉注释，只留可执行代码（说明性注释里刻意引用了历史缺陷写法，全文匹配会假阳性） */
const stripComments = (source) =>
  source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')

/** 读本仓前端源码（`tests/` 的上一级即域内根） */
const read = (...segments) =>
  readFile(new URL(`../${segments.join('/')}`, import.meta.url), 'utf8').then(stripComments)

/** 读兄弟仓源码（`tests/` 的上两级才是工程根） */
const readRepo = (...segments) =>
  readFile(new URL(`../../${segments.join('/')}`, import.meta.url), 'utf8').then(stripComments)

const rateTableSource = await read('src/views/product/rate-tables/index.vue')
const productListSource = await read('src/views/product/list/index.vue')
const productCreateSource = await read('src/views/product/create/index.vue')
const productApiSource = await read('src/api/product.ts')
const productProxyControllerSource = await readRepo(
  'titanium-admin/titanium-admin-web/src/main/java/com/titanium/admin/web/controller/proxy/product/ProductProxyController.java',
)
const productServiceClientSource = await readRepo(
  'titanium-admin/titanium-admin-infrastructure/src/main/java/com/titanium/admin/infrastructure/client/ProductServiceClient.java',
)
const productVersionMirrorSource = await readRepo(
  'titanium-admin/titanium-admin-infrastructure/src/main/java/com/titanium/admin/infrastructure/client/mirror/product/ProductVersionMirror.java',
)
const rateTableMirrorSource = await readRepo(
  'titanium-admin/titanium-admin-infrastructure/src/main/java/com/titanium/admin/infrastructure/client/mirror/product/RateTableMirror.java',
)
const productControllerSource = await readRepo(
  'titanium-product/titanium-product-web/src/main/java/com/titanium/product/web/controller/product/ProductController.java',
)
const productVersionVOSource = await readRepo(
  'titanium-product/titanium-product-web/src/main/java/com/titanium/product/web/dto/product/ProductVersionVO.java',
)
const rateTableRowVOSource = await readRepo(
  'titanium-product/titanium-product-web/src/main/java/com/titanium/product/web/dto/pricing/ratetable/RateTableRowVO.java',
)

// ==================== ① 纯函数：版本号推进与新旧判定 ====================

test('① nextVersion：取最大主版本号 +1，次版本归零', () => {
  assert.equal(nextVersion([]), 'V1.0')
  assert.equal(nextVersion(['V1.0']), 'V2.0')
  assert.equal(nextVersion(['V1.0', 'V3.0', 'V2.0']), 'V4.0')
})

test('② nextVersion：兼容带前缀与不带前缀两种写法（含大小写变体）', () => {
  // 下游产品修订产出 `V{major}.0`，费率表新建对话框的默认值同为 `V1.0`；
  // 但「版本」在费率表是**自由文本输入**（`createForm.tableVersion`），用户手填 `1.0` / `v2.0` 都可能。
  // 两种写法在同一条版本线里共存是常态，推进时必须**统一产出 V 前缀**——
  // 否则同一产品线里会同时出现 V2.0 与 2.0，版本列排不出先后。
  assert.equal(nextVersion(['1.0', '2.0']), 'V3.0')
  assert.equal(nextVersion(['1.0', 'V5.0']), 'V6.0')
  // 🔴 大小写变体必须认：漏认会被静默忽略，回滚算出的「下一版」便与它撞号
  assert.equal(nextVersion(['v1.0']), 'V2.0')
  assert.equal(nextVersion(['v2.0', 'V1.0']), 'V3.0')
})

test('③ nextVersion：不可解析的版本号不参与推进，也不阻断推进', () => {
  // 用户手填过 `第1版` 之类的号：判为不可解析（宁可退回让用户自己填，也不静默生成错号），
  // 但不能因为它存在就整个函数失效
  assert.equal(nextVersion(['第1版']), 'V1.0')
  assert.equal(nextVersion(['V2.0', '第1版', '1.0-beta']), 'V3.0')
})

test('④ compareVersions：判定先后，相同或不辨先后返回 0', () => {
  assert.ok(compareVersions('V1.0', 'V2.0') < 0)
  assert.ok(compareVersions('V2.0', 'V1.0') > 0)
  assert.equal(compareVersions('V2.0', 'V2.0'), 0)
  assert.equal(compareVersions('1.0', 'V1.0'), 0, '两种写法指向同一版本，不得判出先后')
})

test('⑤ compareVersions：不可解析的版本号排在可解析的之前（当作「更早」）', () => {
  // 🔴 方向性取舍：当作「更早」时，回滚的源版本选早了只是白做一次；
  //    当作「更新」则会把错误的方向当成回滚目标。二者代价不对称，故取保守的一侧。
  assert.ok(compareVersions('第1版', 'V2.0') < 0)
  assert.ok(compareVersions('V2.0', '第1版') > 0)
  assert.equal(compareVersions('第1版', 'alpha'), 0, '两侧都不可解析时无法区分先后')
})

// ==================== ② 费率表版本历史与回滚 ====================

test('⑥ 费率表版本线按 tableCode 归组，且必须包含非生效版本', () => {
  // 同一产品下有多张不同编码的费率表，按产品归组会把不相干的另一张表混进版本线
  assert.match(rateTableSource, /\.filter\(\(table\) => table\.tableCode === historyTableCode\.value\)/)

  // 🔴 历史取数**不带 status 过滤**：回滚目标通常正是「已退役的上一版」，按状态过滤会把目标挡在门外，
  //    于是入口看起来有、实际永远没有可回滚的对象。
  //    注意只圈定历史取数函数 —— 主列表按状态下拉筛选是合法用法，不能一并禁掉。
  const historyLoader = rateTableSource.match(/async function loadHistoryVersions\(\)[\s\S]*?\n\}/)?.[0] ?? ''
  assert.ok(historyLoader, '未找到 loadHistoryVersions')
  assert.match(historyLoader, /const all = await listRateTables\(productId\.value\)\n/)
  assert.ok(!/status/.test(historyLoader), '版本历史取数不得按状态过滤')
})

test('⑦ 费率表对比：字段差异走共享噪声清单，行级差异按业务维度键配对', () => {
  assert.match(
    rateTableSource,
    /diffRecords\(headerSnapshot\(before\), headerSnapshot\(after\), \{ ignore: RATE_TABLE_VERSION_NOISE \}\)/,
  )
  assert.match(rateTableSource, /diffRowsByKey\(before\.rows \|\| \[\], after\.rows \|\| \[\], \(row\) => row\.dimensionHash \|\| '', \{/)
  // 🔴 绝不能用行号或行主键当配对键：那会把「改了一行费率」显示成「全删全增」
  assert.ok(
    !/diffRowsByKey\([\s\S]{0,200}?rowId/.test(rateTableSource),
    '行级对比的配对键必须是 dimensionHash，不得用 rowId',
  )
})

test('⑧ 费率表缺少维度键时不做行级对比，且如实说明没比', () => {
  assert.match(rateTableSource, /function rowsComparable\(tables: RateTable\[\]\)/)
  assert.match(rateTableSource, /const rowDiffSkipped = !rowsComparable\(\[before, after\]\)/)
  assert.match(rateTableSource, /rowDiffSkipped\s*\n?\s*\? null/)
  // 静默不比等于让用户以为「两版费率一致」，必须显式提示
  assert.match(rateTableSource, /未返回业务维度键（dimensionHash）/)
})

test('⑨ 费率表回滚是「建草稿 + 写费率行」两步，且中间态必须点名', () => {
  assert.match(rateTableSource, /await createRateTable\(productId\.value, \{/)
  assert.match(rateTableSource, /await replaceRateTableRows\(productId\.value, newTableId, rows\)/)
  // 🔴 两步写必然出现中间态：草稿建出来了、费率行没写进去。
  //    若只报一句通用错误，用户会以为整个动作失败并重来一次 —— 库里于是多出一个没人认领的空草稿。
  assert.match(rateTableSource, /草稿已创建，但费率行写入失败/)
})

test('⑩ 费率表回滚需 create 与 edit 两个权限码齐备（缺一即会留下空草稿）', () => {
  assert.match(
    rateTableSource,
    /const canRollback = computed\(\(\) => hasPermission\('product:rate-table:create'\) && hasPermission\('product:rate-table:edit'\)\)/,
  )
  assert.match(rateTableSource, /missingRollbackPerms/)
})

// ==================== ③ 产品版本历史与回滚 ====================

test('⑪ 产品版本线按 productCode 归组（修订继承编码、派生新 productId）', () => {
  assert.match(productApiSource, /export async function listProductVersions\(productCode: string\)/)
  assert.match(productApiSource, /params: \{ productCode \}/)
  assert.match(productListSource, /historyVersions\.value = await listProductVersions\(historyCode\.value\)/)
  assert.match(productListSource, /historyCode\.value = product\.code/)
})

test('⑫ 产品对比的快照必须取详情原始载荷，不能取版本条目或列表行', () => {
  // 版本条目刻意不带配置块；列表行经视图模型裁剪过字段。
  // 拿它们当快照，被裁掉的字段会以「一侧缺失」冒出来，看起来像「这一版删了它」。
  assert.match(
    productListSource,
    /await Promise\.all\(\[\s*getProductDetailRaw\(before\.productId\),\s*getProductDetailRaw\(after\.productId\),\s*\]\)/,
  )
  assert.match(productListSource, /diffRecords\(beforeRaw, afterRaw, \{ ignore: PRODUCT_VERSION_NOISE \}\)/)
  // 新旧按版本号判定，不按勾选顺序（勾选顺序是界面操作痕迹，版本先后是业务事实）
  assert.match(
    productListSource,
    /const \[before, after\] = compareVersions\(first\.version, second\.version\) <= 0 \? \[first, second\] : \[second, first\]/,
  )
})

test('⑬ 产品噪声清单必须覆盖下游真实字段名（逐版本不同的审计与生命周期字段）', () => {
  // 🔴 真实教训：清单原写作 `createTime`/`updateTime`，而下游 `ProductResponse` 用的是
  //    `createdAt`/`updatedAt` —— 忽略项写错名**不会报错**，只会让这些字段逐版本冒充「配置变更」，
  //    把真正的变更淹没。未命中的忽略项无害，漏掉真名才是事故。
  for (const field of ['createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'effectiveTime', 'invalidTime']) {
    assert.ok(PRODUCT_VERSION_NOISE.includes(field), `噪声清单必须覆盖 ${field}`)
  }
  // 反向：销售起止期是**业务配置**，不得被当成噪声过滤掉
  assert.ok(!PRODUCT_VERSION_NOISE.includes('saleStartTime'))
  assert.ok(!PRODUCT_VERSION_NOISE.includes('saleEndTime'))
})

test('⑭ 产品回滚 = 以生效版本为修订源 + 历史版本为底稿（两个参数缺一不可）', () => {
  // 🔴 产品回滚不能直接把历史版本当修订源：后端要求源版本 EFFECTIVE
  //    （`InsuranceProduct.handle(ReviseProductCommand)`），历史版本多为已失效，会被直接拒。
  assert.match(
    productListSource,
    /router\.push\(`\/product\/create\?id=\$\{target\.productId\}&from=\$\{source\.productId\}`\)/,
  )
  assert.match(productCreateSource, /const prefillFromId = computed\(\(\) => \(route\.query\.from as string\) \|\| reviseFromId\.value\)/)
  assert.match(productCreateSource, /const isRollback = computed/)
  // 底稿版本决定加载哪一份配置，提交目标恒为被修订的生效版本
  assert.match(productCreateSource, /const id = prefillFromId\.value/)
  assert.match(productCreateSource, /await reviseProduct\(\s*reviseFromId\.value,/)
})

test('⑮ 产品回滚门槛：本版本线存在生效版本 + 有修订权限', () => {
  assert.match(
    productListSource,
    /const currentEffective = computed\(\(\) => historyVersions\.value\.find\(\(item\) => item\.status === 'EFFECTIVE'\)\)/,
  )
  assert.match(productListSource, /const canRollback = computed\(\(\) => !!currentEffective\.value && hasPermission\('product:edit'\)\)/)
  // 不具备条件时必须说明是缺哪一条，不能让按钮徒然灰着
  assert.match(productListSource, /本版本线当前没有生效版本，无法回滚/)
  assert.match(productListSource, /回滚需要「product:edit」权限/)
})

// ==================== ④ 跨仓契约：下游端点与 BFF 代理 ====================

test('⑯ 下游 /versions 必须显式登记在兜底 /{productId} 之前', () => {
  const versionsIndex = productControllerSource.indexOf('@GetMapping("/versions")')
  const byIdIndex = productControllerSource.indexOf('@GetMapping("/{productId}")')
  assert.ok(versionsIndex > 0, '下游必须有 /versions 端点')
  assert.ok(byIdIndex > 0, '兜底 /{productId} 端点应在')
  // 🔴 顺序即语义：晚于兜底登记时，/versions 会被当作 productId="versions" 去按 ID 查产品
  assert.ok(versionsIndex < byIdIndex, '/versions 必须登记在 /{productId} 之前')
  assert.match(productControllerSource, /@RequestParam\("productCode"\) String productCode/)
})

test('⑰ BFF 两侧都已接通 /versions，且代理方法名不以 list 开头', () => {
  assert.match(productServiceClientSource, /@GetMapping\("\/web\/v1\/products\/versions"\)/)
  assert.match(productServiceClientSource, /ApiResponse<List<ProductVersionMirror>> listProductVersions/)
  assert.match(productProxyControllerSource, /@GetMapping\("\/versions"\)/)
  // 🔴 `ProxyResponseBodyAdvice` 会把「名字以 list 开头且无 @PathVariable」的根集合归一化为
  //    PageVO{list,total}；版本线是一次取全的有限集合（非分页），归一化会凭空造出分页语义
  assert.match(productProxyControllerSource, /public Object productVersions\(/)
  assert.ok(
    !/public Object listProductVersions\(/.test(productProxyControllerSource),
    '代理方法名不得以 list 开头（会被归一化为 PageVO）',
  )
  // 回滚是写动作，读权限不得被收紧成写权限码
  assert.match(
    productProxyControllerSource,
    /@PreAuthorize\("hasAnyAuthority\('" \+ AdminPermission\.PRODUCT_LIST \+ "', '" \+ AdminPermission\.PRODUCT_VIEW \+ "'\)"\)[\s\S]{0,200}@GetMapping\("\/versions"\)/,
  )
})

/** 解析 record 的组件名列表（本项目这些 record 的组件无注解、无泛型，按逗号切分即可） */
const recordComponents = (source, recordName) => {
  const matched = source.match(new RegExp(`record\\s+${recordName}\\s*\\(([\\s\\S]*?)\\)\\s*\\{`))
  assert.ok(matched, `未找到 record ${recordName}`)
  return matched[1]
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.split(/\s+/).pop())
}

test('⑱ 产品版本条目：BFF 镜像与下游 DTO 逐字段一致（防静默丢字段）', () => {
  // 🔴 手写 mirror 是 Feign 反序列化的落点，**漏声明的字段会被 Jackson 静默丢弃**：
  //    不报错、不告警，表现为前端「版本历史里少了某列」而无任何线索。
  assert.deepEqual(
    recordComponents(productVersionMirrorSource, 'ProductVersionMirror'),
    recordComponents(productVersionVOSource, 'ProductVersionVO'),
    'BFF ProductVersionMirror 的组件必须与下游 ProductVersionVO 逐名一致',
  )
})

test('⑲ 费率行镜像与下游费率行 DTO 逐字段一致（本轮已实测漏过 3 个维度字段）', () => {
  // 实测缺陷：`RateTableRowMirror` 曾漏掉 occupationClass/region/vehicleType，
  // 而下游 `RateTableRowVO`/`RateTableRowDO`/`RateTableRowDTO` 三个都有 ⇒
  // 「维护费率行」保存时**静默清空维度**，且版本对比/回滚会丢维度。
  assert.deepEqual(
    recordComponents(rateTableMirrorSource, 'RateTableRowMirror'),
    recordComponents(rateTableRowVOSource, 'RateTableRowVO'),
    'BFF RateTableRowMirror 的组件必须与下游 RateTableRowVO 逐名一致',
  )
  for (const field of ['occupationClass', 'region', 'vehicleType']) {
    assert.ok(rateTableMirrorSource.includes(field), `费率行镜像必须承接 ${field}`)
  }
})
