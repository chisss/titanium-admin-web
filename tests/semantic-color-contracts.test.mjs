import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

// el-tag 语义色守卫（🔴 R9-F03）
//
// 现场：`product/detail` 与 `product/revise` 用 `<el-tag type="danger">主条款</el-tag>` 标「主条款」。
// 但 `danger` 在本仓是**动作保留色**——`docs/ui-audit/COLOR-CONTRACT.md` §二 把「停用/下架/退役/
// 删除/移除/撤销/驳回」这一整桶破坏性动作映射到 danger，语义是「动作使既有权益或数据失效或倒退」。
// 拿它标一个**静态分类**（主条款 vs 附加条款）会让用户读作「这里有问题/这是危险项」。
// 同页下表还有第二处同族误用：「附加」用 `warning`（该色全站唯一允许「可逆但需注意」的
// 纠正性动作，仅佣金发起回拨 1 例），而 11 行之外的「附加条款」用的是 info —— 同一概念两种颜色。
//
// 🔴 为什么写成**登记制**而不是「禁止 el-tag 出现 danger/warning」：
//   本仓确有合法用例（`pricing-plans` 试算「失败」、`actuarial-workbench` 重放「禁止」、
//   `403` 所需权限码、`rate-tables` 试算告警），一刀切会立刻产生 4 处豁免，规则随即空转
//   —— 那正是 R8-01 的教训（**守卫的可信度取决于我能否核实它的覆盖面**）。
//   登记制把「这一处为什么可以用语义色」从沉默变成必须写下的判断，且新用例漏登记即失败。
//
// 判据来源：R9 走查的对照结论「全站其余 danger 用法**全部**是破坏性动作」。

/** 递归收集 src 下全部 .vue（含 components，标签可能出现在任意处） */
async function collectVue(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dir)
    if (entry.isDirectory()) files.push(...(await collectVue(full)))
    else if (entry.name.endsWith('.vue')) files.push(full)
  }
  return files
}

/**
 * 剥注释后再扫描。🔴 必须连 HTML 注释 `<!-- -->` 一起剥（用户级 lessons：模板注释是独立的一种，
 * 只剥 `//` 与 `/* *​/` 仍会命中注释里的文本 ⇒ 断言恒绿）。本文件自己的注释里就写满了
 * `type="danger"` 字样（上方说明、下方登记理由），不剥注释即**必然恒绿**。
 */
const stripComments = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')

/** 取出所有 el-tag 开标签（引号感知地找 `>`，属性值里可能有 `=>`） */
function elTagAttrs(source) {
  const tags = []
  let cursor = 0
  for (;;) {
    const start = source.indexOf('<el-tag', cursor)
    if (start === -1) break
    let quote = null
    let end = -1
    for (let i = start; i < source.length; i++) {
      const c = source[i]
      if (quote) {
        if (c === quote) quote = null
        continue
      }
      if (c === '"' || c === "'") quote = c
      else if (c === '>') { end = i; break }
    }
    assert.notEqual(end, -1, `<el-tag> 开标签未闭合（偏移 ${start}）`)
    tags.push(source.slice(start, end))
    cursor = end
  }
  return tags
}

/**
 * 取出每个 el-tag 的**完整元素**（含开标签、文本、闭标签）⇒ `{ attrs, text }`。
 * 🔴 按元素取而不是「用 indexOf 找文本」：后者在同一文件出现多次时必须猜是哪一处，
 * 猜错就会把「A 处的属性」配上「B 处的文本」——断言随即失去意义（本轮初稿即踩到）。
 */
function elTagElements(source) {
  return (source.match(/<el-tag\b[\s\S]*?<\/el-tag>/g) ?? []).map((el) => ({
    attrs: el.slice(0, el.indexOf('>') + 1),
    text: el.replace(/^<el-tag\b[^>]*>/, '').replace(/<\/el-tag>$/, '').trim(),
    raw: el,
  }))
}

/** 该标签是否用到语义色 danger / warning（静态 type= 与三元 :type= 两种形态都算） */
const usesReservedColor = (tag) => /danger/.test(tag) || /warning/.test(tag)

/**
 * 允许使用 danger/warning 的 el-tag，**逐条给出依据**（键=仓库相对路径，值={理由, 期望处数}）。
 * 🔴 处数必须写死：只登记文件不登记处数的话，同一文件里新增第二处误用不会被发现
 *   （R10-03 的 product/list 豁免就是这种「文件级豁免」的形态，那里靠用例②逐处断言补上了）。
 */
const ALLOWED = new Map([
  [
    'src/components/TiVersionCompare/index.vue',
    { count: 2, reason: '差异类型三档（新增 success／删除 danger／变更 warning）：删除本就使既有内容失效，'
      + '是 danger 的本义；三档需三种可区分色，组件内已就地注释该约定' },
  ],
  [
    'src/views/403.vue',
    { count: 1, reason: '无权限页展示「所需权限码」，其语境本身就是被拒绝，danger 表达的是拒绝语义' },
  ],
  [
    'src/views/customer/detail/index.vue',
    { count: 1, reason: '「加载失败」失败态标签：表达的就是出错，danger 是本义' },
  ],
  [
    'src/views/product/actuarial-workbench/index.vue',
    { count: 3, reason: '① 金额通道 INTERNAL_COST→warning（内部成本需注意，另一档 primary）；'
      + '② 重放列「支持/禁止」：禁止是限制性状态（success 的负端），非分类标记' },
  ],
  [
    'src/views/product/pricing-plans/index.vue',
    { count: 1, reason: '试算结果列「通过/失败」：失败是结果状态（success 的负端）' },
  ],
  [
    'src/views/product/rate-tables/index.vue',
    { count: 1, reason: '试算保费旁的告警标签，带 tooltip 说明，是真正的「需注意」语义' },
  ],
  [
    'src/views/product/revise/index.vue',
    { count: 1, reason: '页头在途上下文横幅（正在生成新版本 DRAFT）——提醒当前处于修订态，属「需注意」' },
  ],
  [
    'src/views/system/log/index.vue',
    { count: 2, reason: '操作结果列/筛选项「成功/失败」：是状态而非分类' },
  ],
  [
    'src/views/system/menu/index.vue',
    { count: 1, reason: '❓取舍而非定论：菜单类型三档（目录 info／菜单 primary／按钮 warning）需要三种可区分色，'
      + 'EP 语义色板里除 info/primary 外没有中性第三档，故按钮借用 warning。'
      + '它在此不表达「注意」，只表达「第三类」——若将来引入中性分类色（如 ti-tag--category），应改用它' },
  ],
])

test('① el-tag 的 danger/warning 逐处登记，未登记即失败（语义色不得当分类标记用）', async () => {
  const files = await collectVue(new URL('../src/', import.meta.url))
  const found = new Map()
  let total = 0

  for (const file of files) {
    const rel = file.pathname.replace(/^.*\/src\//, 'src/')
    const source = stripComments(await readFile(file, 'utf8'))
    const hits = elTagAttrs(source).filter(usesReservedColor)
    if (!hits.length) continue
    found.set(rel, hits.length)
    total += hits.length
  }

  // 覆盖量下限：命中数若因重构骤降（例如扫描口径失效变成空集），说明守卫已失去射程
  assert.ok(total >= 4, `仅扫到 ${total} 处语义色 el-tag，口径疑似失效`)

  const unregistered = [...found.keys()].filter((k) => !ALLOWED.has(k))
  assert.deepEqual(
    unregistered,
    [],
    `以下文件里的 el-tag 使用了 danger/warning 但未登记：\n  ${unregistered.join('\n  ')}\n`
      + 'danger 是破坏性动作保留色、warning 是「可逆但需注意」的纠正性动作保留色'
      + '（见 docs/ui-audit/COLOR-CONTRACT.md §二）。分类标记请用 primary（主）/ info（次）；'
      + '若确为状态/限制语义，在 ALLOWED 登记并写明依据。',
  )

  // 处数逐处核对：只登记文件不登记处数 ⇒ 同文件新增一处误用不会被发现
  const mismatch = [...found.entries()]
    .filter(([k, n]) => ALLOWED.get(k) && ALLOWED.get(k).count !== n)
    .map(([k, n]) => `${k}：实为 ${n} 处，登记 ${ALLOWED.get(k).count} 处`)
  assert.deepEqual(mismatch, [], `登记处数与实际不符：\n  ${mismatch.join('\n  ')}`)

  // 登记表不得留死条目（文件删除/改名后必须同步，否则登记表会静默失效）
  const stale = [...ALLOWED.keys()].filter((k) => !found.has(k))
  assert.deepEqual(stale, [], `以下登记项已不存在对应 el-tag，请清理：${stale.join(', ')}`)
})

test('② 「主条款/附加条款」这类分类标记不得使用语义色（F-03 的正题）', async () => {
  // 直接钉住本次修复的两处标记：分类标记的取值只允许 primary（主）/ info（次）
  const targets = [
    ['src/views/product/detail/index.vue', 'product/detail 条款折叠头'],
    ['src/views/product/revise/index.vue', 'product/revise 条款表'],
  ]
  for (const [rel, where] of targets) {
    const source = stripComments(await readFile(new URL(`../${rel}`, import.meta.url), 'utf8'))
    const tags = elTagElements(source)
    const mainClause = tags.filter((t) => t.text === '主条款')
    assert.equal(mainClause.length, 1, `${where}：应恰好有 1 个「主条款」标签，实为 ${mainClause.length} 个`)
    assert.match(
      mainClause[0].attrs,
      /type="primary"/,
      `${where}：「主条款」是分类标记，须用品牌色 primary——danger 是破坏性动作保留色（R9-F03）`,
    )
  }

  // 同一页里「附加条款」与「附加」必须是同一档颜色（原先一个 info 一个 warning）
  const detail = stripComments(
    await readFile(new URL('../src/views/product/detail/index.vue', import.meta.url), 'utf8'),
  )
  const additional = elTagElements(detail).filter((t) => t.text.startsWith('附加'))
  assert.ok(additional.length >= 2, `应同时存在「附加条款」与「附加」，实为 ${additional.length} 个`)
  for (const tag of additional) {
    assert.ok(
      !usesReservedColor(tag.attrs),
      `「附加」类标记不得用 danger/warning（动作保留色），实为：${tag.raw}`,
    )
  }
})
