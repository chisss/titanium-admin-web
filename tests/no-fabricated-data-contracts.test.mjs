import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const srcDir = fileURLToPath(new URL('../src/', import.meta.url))
const read = (relativePath) => readFile(join(srcDir, relativePath), 'utf8')

/** 递归收集 src 下全部 .vue/.ts 源码 */
async function sourceFiles(dir = srcDir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await sourceFiles(full)))
    else if (/\.(vue|ts)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) files.push(full)
  }
  return files
}

test('全仓不得残留编造数据的常量或标记', async () => {
  // D-501-31 / D-501-32：实时数据面板与数据看板曾内置 MOCK_STATS/MOCK_TREND/MOCK_DIST
  // 与「模拟指标数据」注释，取数失败时静默回落到编造数值 —— 运营会把假数字当真实经营指标。
  const offenders = []
  for (const file of await sourceFiles()) {
    const source = await readFile(file, 'utf8')
    for (const marker of ['MOCK_', '模拟数据', '模拟指标', '假数据']) {
      if (source.includes(marker)) offenders.push(`${file.slice(srcDir.length)} → ${marker}`)
    }
  }
  assert.deepEqual(offenders, [], `以下文件仍含编造数据标记：\n${offenders.join('\n')}`)
})

test('实时数据面板取数失败时不得回落为编造数值', async () => {
  const source = await read('layouts/components/DataPanel.vue')

  // 指标与趋势均须来自真实聚合接口
  assert.match(source, /getDashboardStats/)
  assert.match(source, /getPremiumTrend/)
  assert.match(source, /from '@\/api\/dashboard'/)

  // 失败路径：置错误提示 + 占位符，不得写死任何数值
  assert.match(source, /errorMessage\.value = '指标数据加载失败'/)
  assert.match(source, /<\s*el-alert/)

  // 无数据趋势展示空态，而不是渲染虚构曲线
  assert.match(source, /暂无保费数据/)
  // 无数据来源的涨跌百分比已移除（后端不提供环比，涨跌箭头必属编造）
  assert.doesNotMatch(source, /metric-card__trend/)
})

test('数据看板的最新保单取自真实接口而非硬编码示例行', async () => {
  const source = await read('views/dashboard/index.vue')

  assert.match(source, /getPolicyList/)
  assert.match(source, /const recentPolicies = ref<PolicyVO\[\]>\(\[\]\)/)
  // 硬编码的示例保单号/人名不得回归
  assert.doesNotMatch(source, /POL2026\d+/)
  assert.doesNotMatch(source, /holderName: '[^']*'/)
})

test('看板三处取数失败一律显式空态，不得静默回落', async () => {
  const source = await read('views/dashboard/index.vue')

  // 指标失败：错误提示 + 保持占位符
  assert.match(source, /statsError\.value = true/)
  assert.match(source, /kpiCards\.value = kpiCards\.value\.map\(\(card\) => \(\{ \.\.\.card, value: '-' \}\)\)/)
  // 两个图表失败：各自空态标记
  assert.match(source, /premiumEmpty\.value = true/)
  assert.match(source, /categoryEmpty\.value = true/)
  assert.match(source, /暂无保费数据/)
  assert.match(source, /暂无险种分布数据/)
})
