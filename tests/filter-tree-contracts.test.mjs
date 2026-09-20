import assert from 'node:assert/strict'
import test from 'node:test'

import './ts-resolve-hook.mjs'

// filterTree 契约（ui-101 / S-02 的一部分）
//
// ui-101 要给「菜单管理」补搜索区，而它是**树形表格**：靠 children 逐层展开。
// 本文件守的是这类页面最容易做错的一件事：
//
//   把「过滤树」写成「过滤节点数组」→ 父级被丢掉 → 命中的子节点失去挂载点，
//   在界面上直接消失。用户搜一个明明存在的子菜单，得到「暂无数据」，
//   而且**没有任何报错** —— 又是「有控件、没反应」的形态。
//
// 因此这里最该守的是「连通性」：过滤结果里的每个节点，都必须是结果中某个根节点
// 的子孙，或者本身就是根 —— 不允许出现悬空节点，也不允许祖先被丢掉。
const { filterTree } = await import('../src/utils/filterTree.ts')

/** 造一棵测试用的树：A/B 两个目录，各自带子节点 */
const tree = () => [
  {
    id: 'A',
    title: '产品管理',
    children: [
      { id: 'A1', title: '产品列表' },
      { id: 'A2', title: '费率表' },
    ],
  },
  {
    id: 'B',
    title: '理赔管理',
    children: [{ id: 'B1', title: '理赔列表' }],
  },
]

const byTitle = (kw) => (n) => {
  const t = n.title
  return typeof t === 'string' && t.includes(kw)
}

/** 收集过滤结果里所有节点的 id（深度优先） */
const idsOf = (nodes) =>
  nodes.reduce((acc, n) => [...acc, n.id, ...idsOf(n.children ?? [])], [])

test('① 命中子节点时保留整条祖先路径（否则子节点会失去挂载点而消失）', () => {
  const out = filterTree(tree(), byTitle('费率表'))

  assert.deepEqual(idsOf(out), ['A', 'A2'], '须留下 A → A2 这条链，而不是只有 A2')
  assert.equal(out.length, 1, '未命中的顶层目录 B 整枝移除')
  assert.equal(out[0].children.length, 1)
  assert.equal(out[0].children[0].id, 'A2')
})

test('② 命中父节点时保留其全部子树（父级命中说明用户要看这一整块）', () => {
  const out = filterTree(tree(), byTitle('产品管理'))

  assert.deepEqual(idsOf(out), ['A', 'A1', 'A2'], '父级自身命中，子孙不应被裁掉')
})

test('③ 谓词恒真时一个节点都不丢（结构完整，不因"全部命中"而漏掉谁）', () => {
  // 🔴 这条**不是**在测「空关键字原样返回」—— filterTree 做不到那件事：
  // match 是不透明的谓词，「空关键字」构造出的谓词与「恒真」在它眼里完全一样。
  // 曾把注释写成"关键字为空时原样返回入参"，被本用例当场证伪（返回的是新数组）。
  // 现在这条守的是它真能保证的事：谓词恒真 ⇒ 整棵树结构完整地留下来。
  const input = tree()
  const out = filterTree(input, () => true)

  assert.deepEqual(idsOf(out), ['A', 'A1', 'A2', 'B', 'B1'], '恒真谓词下不应丢掉任何节点')
  assert.notEqual(out, input, '总是返回新树：调用方若想省掉克隆，须自己短路（keyword ? filterTree(...) : nodes）')
})

test('④ 全部不命中时得到空数组，而不是把原树留下', () => {
  const out = filterTree(tree(), byTitle('不存在的名字'))

  assert.deepEqual(out, [], '无命中须为空，否则用户看到的是"搜了但列表没变"')
})

test('⑤ 不改动入参：过滤结果是新树，原树的 children 不被裁掉', () => {
  // 🔴 这条防的是「就地剪枝」的写法。原树若被改动，点击重置后**回不去了** ——
  // 因为被剪掉的节点已经不在内存里，除非重新请求接口。
  const input = tree()
  const out = filterTree(input, byTitle('费率表'))

  assert.notEqual(out, input, '须返回新数组')
  assert.deepEqual(idsOf(input), ['A', 'A1', 'A2', 'B', 'B1'], '原树必须完好无损')
})

test('⑥ 多层嵌套：命中第三层的节点时，一、二层祖先都要在', () => {
  const deep = [
    {
      id: 'L1',
      title: '一级',
      children: [
        {
          id: 'L2',
          title: '二级',
          children: [{ id: 'L3', title: '三级目标' }],
        },
      ],
    },
  ]
  const out = filterTree(deep, byTitle('三级目标'))

  assert.deepEqual(idsOf(out), ['L1', 'L2', 'L3'], '每一层祖先都要留下，缺一层节点就挂不上')
})

test('⑦ children 缺失或为空数组的节点不会抛错', () => {
  // 叶子节点在 MenuNode 上 children 是可选的；后端不经 toMenuNode 补空数组时就是 undefined
  assert.doesNotThrow(() => filterTree([{ id: 'X', title: '叶子' }], byTitle('叶子')))
  assert.doesNotThrow(() => filterTree([{ id: 'X', title: '叶子', children: [] }], byTitle('叶子')))
  assert.deepEqual(filterTree([{ id: 'X', title: '叶子' }], byTitle('叶子')).map((n) => n.id), ['X'])
})
