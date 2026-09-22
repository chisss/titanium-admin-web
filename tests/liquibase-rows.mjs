// Liquibase 种子 DML 的**行级**解析（契约测试共用）
//
// 为什么要有行级解析：菜单/权限种子的判据多是**同一行内的列配对**
// （`component ↔ perm_code`、`id ↔ perm_code`、`role_id ↔ permission_id`）。
// 只按 INSERT 块做文本包含判断，无法建立配对关系——「两个码都在文件里」就断言通过，
// 于是「菜单写 A、端点要 B」这类**张冠李戴**恰好落在盲区里。
//
// 🔴 解析失败必须**抛错**，绝不能 `continue` 跳过那一行：被静默丢掉的恰好是格式变过的那行，
//    而丢行会让「两侧对账」的差集为空 —— 同一个坏解析器把两侧同步缩小，看着全绿实则漏判。
//    本文件曾在 admin 域的探针里以静默跳过形态出现过一次，故在此固化为硬约束。
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** admin 域 DML 种子目录（唯一物理位置，见根 CLAUDE.md 6.1） */
export const SEED_DIR = fileURLToPath(
  new URL(
    '../../titanium-admin/titanium-admin-bootstrap/src/main/resources/liquibase/dml/',
    import.meta.url,
  ),
)

/** 按引号与括号配对切出 `(...)` 元组体（跳过列名列表与字符串内的逗号/括号） */
function tuples(body) {
  const out = []
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] !== '(') continue
    let depth = 1
    let buf = ''
    let inQuote = false
    let j = i + 1
    for (; j < body.length && depth > 0; j += 1) {
      const ch = body[j]
      if (ch === "'") inQuote = !inQuote
      if (!inQuote && ch === '(') depth += 1
      if (!inQuote && ch === ')') depth -= 1
      if (depth > 0) buf += ch
    }
    if (buf.trim().startsWith("'")) out.push(buf)
    i = j - 1
  }
  return out
}

/** 按逗号切字段（忽略引号内的逗号），去掉首尾引号 */
function fields(tuple) {
  const out = []
  let cur = ''
  let inQuote = false
  for (const ch of tuple) {
    if (ch === "'") inQuote = !inQuote
    if (ch === ',' && !inQuote) {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur.trim())
  return out.map((f) => (f.startsWith("'") && f.endsWith("'") ? f.slice(1, -1) : f))
}

/**
 * 抽出 `INSERT INTO \`table\` (...) VALUES ...;` 的全部行，返回 [{列名: 值}]。
 *
 * @param {string} source 单个 SQL 文件内容
 * @param {string} table  表名（不带反引号）
 * @param {string} origin 出错时用于定位的文件名
 */
export function sqlRows(source, table, origin = table) {
  const re = new RegExp('INSERT INTO `' + table + '`\\s*\\(([^)]*)\\)\\s*VALUES', 'g')
  const rows = []
  for (const match of source.matchAll(re)) {
    const cols = match[1].split(',').map((c) => c.trim().replace(/`/g, ''))
    const rest = source.slice(match.index + match[0].length)
    const end = rest.search(/;\s*(?:\n|$)/)
    for (const tuple of tuples(end === -1 ? rest : rest.slice(0, end))) {
      const values = fields(tuple)
      if (values.length !== cols.length) {
        throw new Error(
          `${origin}: INSERT INTO ${table} 的元组字段数(${values.length})与列数(${cols.length})不符，` +
            `解析器需同步（拒绝静默跳过）：${tuple.slice(0, 200)}`,
        )
      }
      rows.push(Object.fromEntries(cols.map((c, i) => [c, values[i]])))
    }
  }
  return rows
}

/** 跨全部种子文件汇总某表的行 */
export async function seedRows(table) {
  const files = (await readdir(SEED_DIR)).filter((name) => name.endsWith('.sql'))
  const rows = []
  for (const name of files) {
    rows.push(...sqlRows(await readFile(join(SEED_DIR, name), 'utf8'), table, name))
  }
  return rows
}
