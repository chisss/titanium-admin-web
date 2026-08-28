import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const viewsRoot = fileURLToPath(new URL('../src/views/', import.meta.url))

async function vueFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return vueFiles(path)
    return extname(entry.name) === '.vue' ? [path] : []
  }))
  return nested.flat()
}

test('业务页面的字符串枚举下拉统一由字典驱动', async () => {
  const violations = []
  for (const path of await vueFiles(viewsRoot)) {
    const source = await readFile(path, 'utf8')
    const literalOptions = source.match(/<el-option\s+label="[^"]+"\s+(?:v-bind:)?value="[^"]+"/g) || []
    if (literalOptions.length) violations.push({ path, literalOptions })
  }
  assert.deepEqual(violations, [])
})

test('保全配置和核心业务页面引用正式字典编码', async () => {
  const requiredReferences = new Map([
    ['maintenance/configuration/MaintenanceConfigurationEditor.vue', ['MAINTENANCE_FIELD_VALIDATION_TYPE', 'MAINTENANCE_EFFECTIVE_TIME_TYPE']],
    ['maintenance/workbench/index.vue', ['MAINTENANCE_CASE_STATUS', 'MAINTENANCE_CHANNEL']],
    ['policy/list/index.vue', ['POLICY_STATUS']],
    ['rule-engine/list/index.vue', ['RULE_SET_TYPE', 'RULE_SET_STATUS', 'RULE_ACTION']],
    ['product/actuarial-workbench/index.vue', ['PRICE_COMPONENT_CATEGORY', 'FACTOR_MISSING_POLICY']],
    ['system/dict/index.vue', ['SUPPORTED_LOCALE']],
  ])

  for (const [relativePath, dictTypes] of requiredReferences) {
    const source = await readFile(join(viewsRoot, relativePath), 'utf8')
    for (const dictType of dictTypes) assert.match(source, new RegExp(dictType))
  }
})

test('字典管理在移动端使用上下分区而非压缩双栏', async () => {
  const source = await readFile(join(viewsRoot, 'system/dict/index.vue'), 'utf8')

  assert.match(source, /<el-col :xs="24" :sm="8">/)
  assert.match(source, /<el-col :xs="24" :sm="16">/)
  assert.match(source, /@media \(max-width: 767px\)/)
  assert.match(source, /\.dict-type-panel \{\s+height: 300px;/)
})
