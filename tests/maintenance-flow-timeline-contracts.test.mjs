import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

// 保全工作台「流程任务」时间轴守卫（🔴 R10-06 / 用户点名 R9-F04）
//
// 现场：用户点名「流程任务可以考虑引入 timeLine 装饰」。改造把 `el-steps` 换成 `el-timeline`
// —— 节点色取任务状态色、未达终态的节点空心、当前推进到的那一步节点放大。
//
// 守卫要钉住的**不是**「用的是 el-timeline」这个形式（那是可以再改的取舍），而是这次改造里
// 真正会漂移、且漂移后**没人会发现**的四处：
//   ① 覆盖不全、靠兜底色静默变灰。初稿只写了 5 码（后端 `MaintenanceWorkflowTaskStatus` 有 10 码），
//      余下走 `?? 'info'` ⇒ PENDING / WAITING_CONDITION / WAITING_EXTERNAL / QUOTED 在时间轴上是灰的、
//      在同一屏的表格里是橙的（REJECTED 灰 vs 红）。这正是本次任务要消灭的那种不一致，绝不接受。
//   ② 节点色与表格的 `TiStatusTag` 不同色。全仓状态色的唯一真源是它的 `COLOR_MAP`，本页只是投影；
//      投影与自己对齐毫无意义，必须**跨文件比真值**。
//   ③ 空刻度占位行。EP 的 `el-timeline-item` 在 `placement="top"` 下**无条件**渲染 timestamp 那个
//      div（`!hideTimestamp && placement === 'top'`，见 element-plus 的 timeline-item 渲染函数），
//      而实测 6 个任务里有 3 个 `lastOperation` 恒空 ⇒ 不写 `:hide-timestamp` 就有 3 行空白。
//   ④ 节点数与任务数脱钩。概览带一旦 `filter/slice`，它说的就比下方明细表少，等于藏了步骤。
//
// 🔴 判据全部取**独立真源互比**（后端枚举 / TiStatusTag / 本页模板与脚本结构），不内联期望清单：
//    内联一份「正确的 10 码清单」，就变成三份清单互相比对，坏的那份一旦参与比对就再也对不上真源。

const WORKBENCH = new URL('../src/views/maintenance/workbench/index.vue', import.meta.url)
/** 跨仓读取：本仓是 <root>/titanium-admin-web，保全域是同级目录 <root>/titanium-maintenance */
const TASK_STATUS_ENUM = new URL(
  '../../titanium-maintenance/titanium-maintenance-common/src/main/java/com/titanium/maintenance/common/enums/workflow/MaintenanceWorkflowTaskStatus.java',
  import.meta.url,
)
const TI_STATUS_TAG = new URL('../src/components/TiStatusTag/index.vue', import.meta.url)

/**
 * 剥注释后再扫描。🔴 必须连 HTML 注释 `<!-- -->` 一起剥（用户级 lessons：模板注释是独立的一种，
 * 只剥 `//` 与 `/* *​/` 仍会命中注释里的文本 ⇒ 断言恒绿）。本文件与源文件的注释里都写满了
 * `el-steps`、`el-timeline-item` 字样（改造说明、维护约定），不剥注释这几条断言必然恒绿。
 */
const stripComments = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')

/** 花括号配平地取 `NAME … = { … }` 的对象体（不按 `}` 直接切：对象可嵌套） */
function objectLiteral(source, name) {
  const at = source.indexOf(name)
  assert.notEqual(at, -1, `未找到 ${name}`)
  const open = source.indexOf('{', at)
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open, i + 1)
    }
  }
  return assert.fail(`${name} 对象体未闭合`)
}

/** 解析 `CODE: 'value',` 形态的字符串映射（剔注释 ⇒ 被注释掉的那一行不算数） */
function stringMap(source, name) {
  const map = new Map()
  for (const m of stripComments(objectLiteral(source, name)).matchAll(
    /(?:^|\n)\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*'([a-z]+)'\s*,?/g,
  )) {
    map.set(m[1], m[2])
  }
  return map
}

/** 后端枚举的码值集合：`PENDING(1, "PENDING", "等待前置步骤"),` 取**第二个**字符串（落库/序列化用那个） */
function backendTaskStatuses(source) {
  const codes = new Set()
  for (const m of stripComments(source).matchAll(
    /([A-Z][A-Z0-9_]*)\(\s*\d+\s*,\s*"([A-Za-z0-9_-]+)"\s*,/g,
  )) {
    assert.equal(m[1], m[2], `枚举常量名 ${m[1]} 与其码值 ${m[2]} 不一致，解析器需同步`)
    codes.add(m[2])
  }
  // 覆盖量下限：解析口径若失效（枚举改写成 builder 形态等），下面「键集合相等」会退化成空比空
  assert.ok(codes.size >= 10, `后端任务状态只解析到 ${codes.size} 个码，解析器需同步`)
  return codes
}

/** 引号感知地取 `<tag …>` 开标签（属性值里可能有 `=>` 与 `>`） */
function openTag(source, needle) {
  const start = source.indexOf(needle)
  assert.notEqual(start, -1, `模板里找不到 ${needle}`)
  let quote = null
  for (let i = start; i < source.length; i += 1) {
    const c = source[i]
    if (quote) {
      if (c === quote) quote = null
    } else if (c === '"' || c === "'") quote = c
    else if (c === '>') return source.slice(start, i + 1)
  }
  return assert.fail(`${needle} 开标签未闭合`)
}

/** 取 `const NAME = computed(` 到下一个顶层声明之间的源码（函数体边界不依赖缩进或空行） */
function computedBody(source, name) {
  const at = source.indexOf(`const ${name} = computed(`)
  assert.notEqual(at, -1, `未找到 ${name} 的 computed 声明`)
  const next = source.indexOf('\nconst ', at + 1)
  assert.notEqual(next, -1, `${name} 之后没有下一个顶层声明，无法界定函数体`)
  return source.slice(at, next)
}

const [workbenchRaw, enumRaw, tagRaw] = await Promise.all([
  readFile(WORKBENCH, 'utf8'),
  readFile(TASK_STATUS_ENUM, 'utf8'),
  readFile(TI_STATUS_TAG, 'utf8'),
])
const workbench = stripComments(workbenchRaw)
const nodeType = stringMap(workbenchRaw, 'const TASK_NODE_TYPE')
const colorMap = stringMap(tagRaw, 'const COLOR_MAP')

test('① 节点色映射覆盖后端任务状态全量 10 码，且逐码与 TiStatusTag 的 COLOR_MAP 同色', () => {
  const codes = backendTaskStatuses(enumRaw)
  assert.ok(colorMap.size >= 30, `COLOR_MAP 只解析到 ${colorMap.size} 个键，解析器需同步`)

  // 键集合相等（不是「计数相等」——计数相等恰好掩盖「一侧多一个、另一侧少一个」）：
  // 少一个 ⇒ 该码走 `?? 'info'` 静默变灰；多一个 ⇒ 后端已不存在的死条目
  assert.deepEqual(
    [...nodeType.keys()].sort(),
    [...codes].sort(),
    '流程任务节点色映射的键集合与后端 MaintenanceWorkflowTaskStatus 不一致：'
      + '缺的码会在时间轴上静默变灰，多的码是死条目',
  )

  // 值逐条与唯一真源互比。同一状态在时间轴与表格里颜色不同，用户会读成两回事
  for (const code of codes) {
    assert.equal(
      nodeType.get(code),
      colorMap.get(code),
      `${code}：节点色 '${nodeType.get(code)}' ≠ TiStatusTag COLOR_MAP 的 '${colorMap.get(code)}'`
        + ' —— 同一状态在时间轴与表格里是两种颜色',
    )
  }
})

test('② 空心/实心由色族推出，不另立一份状态清单', () => {
  // 两处清单必然漂移（用户级 lessons）。判据是可推导的：`warning` 一族在 COLOR_MAP 里的分组含义
  // 就是「流转中：还需有人或有外部系统推它」，正好等于「这一步还没走到」。
  assert.match(
    workbench,
    /const isPendingStep = \(status: string\) => TASK_NODE_TYPE\[status\] === 'warning'/,
    'isPendingStep 须由 TASK_NODE_TYPE 的色族推出；另写一份状态清单会与映射表漂移'
      + '（某码改了色，节点的实心/空心不会跟着走）',
  )
})

test('③ 概览带一个任务一个节点：v-for 直接迭代任务全集，不 filter / slice', () => {
  const item = openTag(workbench, '<el-timeline-item')
  assert.match(item, /v-for="step in flowSteps"/, 'el-timeline-item 必须按 flowSteps 逐条渲染')

  const body = computedBody(workbench, 'flowSteps')
  assert.match(body, /\(detail\.value\?\.workflowTasks \|\| \[\]\)\.map\(/,
    'flowSteps 必须由 workflowTasks 全量映射而来')
  assert.ok(!/\.(filter|slice)\(/.test(body),
    'flowSteps 里不得 filter/slice：概览带说的比明细表少，等于藏了步骤')

  // 节点色绑定走映射表，不在模板里就地罗列状态码（就地罗列就又是第二份清单）
  assert.match(item, /:type="step\.type"/, '节点色须绑定 step.type（映射表的结果）')
  assert.match(body, /type: TASK_NODE_TYPE\[task\.status\]/,
    'flowSteps 须经 TASK_NODE_TYPE 取色')
})

test('④ 空时间刻度必须关掉：placement="top" 与 hide-timestamp 成对出现', () => {
  const item = openTag(workbench, '<el-timeline-item')
  assert.match(item, /placement="top"/, '本次采用 placement="top"（刻度在节点上方）')
  // 🔴 EP 在 placement="top" 下无条件渲染 timestamp div（只受 hideTimestamp 控制），
  //    而实测 6 个任务里 seq 1 CREATE、4 FEE_SETTLEMENT(SKIPPED)、6 COMPLETE 的 lastOperation 恒空
  assert.match(
    item,
    /:hide-timestamp="!step\.timestamp"/,
    'placement="top" 必须配 :hide-timestamp="!step.timestamp"——否则 3 个无时间任务会留下空行',
  )

  const body = computedBody(workbench, 'flowSteps')
  // 时间「有则显示」：空就留空，不用占位符编造一个不存在的时间
  assert.match(body, /timestamp: task\.lastOperation\?\.operatedAt \? formatDateTime\(task\.lastOperation\.operatedAt\) : ''/,
    'timestamp 只能取自该任务自身的 lastOperation，且为空时必须留空')
})

test('⑤ el-steps 已清干净（模板与样式零残留）', () => {
  assert.equal((workbench.match(/<el-steps\b/g) ?? []).length, 0, '模板里仍有 <el-steps>')
  assert.equal((workbench.match(/<el-step\b/g) ?? []).length, 0, '模板里仍有 <el-step>')
  // 样式残留：`.el-step__description` 这类规则会静默失效（选择器再也匹配不到东西），
  // 却会让后来的人以为「这里还在用 el-steps」
  assert.equal((workbench.match(/\.el-step\b|\.el-steps\b/g) ?? []).length, 0, '样式里仍有 el-step(s) 选择器')

  const timeline = openTag(workbench, '<el-timeline ')
  assert.match(timeline, /class="flow-steps"/, '容器类名 flow-steps 须保留（概览带的视觉归属）')
})
