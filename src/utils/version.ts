// 版本号推进规则（A4：版本化配置的「回滚」入口要用它算出目标版本号）
//
// 为什么单独成文件：产品修订由后端推进版本号（`InsuranceProduct.generateNewVersion`），
// 而**费率表的版本号是用户填的**（`POST /{id}/rate-tables` 的 tableVersion 由请求体携带），
// 于是「以历史版本为源新建草稿」这个动作在前端必须有自己的一份推进规则 —— 且必须与下游同口径，
// 否则同一产品线里会同时出现 `V2.0`（后端修订产出）与 `2.0`（前端回滚产出）两种写法，
// 版本列无法排序、审计时也无法判断先后。

/** 解析出的版本号：主版本号 + 原始文本（解析不出来时为 null） */
interface ParsedVersion {
  major: number
  raw: string
}

/**
 * 解析版本号。只认**两种写法**，其余一律判为不可解析（返回 null）：
 * - `V{major}.{minor}`（下游产品修订产出的写法，如 `V1.0`；费率表新建对话框的默认值同）；
 * - `{major}.{minor}`（用户在自由文本框里手填的写法，如 `1.0`）。
 *
 * <p>`V` 前缀**大小写不敏感**：版本号在费率表是自由文本输入（`createForm.tableVersion`），
 * 用户写 `v2.0` 完全可能。若只认大写，该版本会被静默忽略，回滚算出的「下一版」便会与它撞号，
 * 版本线里出现两行语义相同的版本 —— 审计时无法分辨先后。</p>
 *
 * <p>刻意不支持 `1.0.0`、`1.0-beta` 这类形态：与其猜一个可能错的主版本号，
 * 不如判为不可解析 —— 调用方据此退回「让用户自己填版本号」，这比静默生成一个错号安全。</p>
 */
function parseVersion(version: string): ParsedVersion | null {
  const match = /^V?(\d+)\.(\d+)$/i.exec(version.trim())
  if (!match) return null
  return { major: Number(match[1]), raw: version.trim() }
}

/**
 * 下一个版本号：取已存在版本里的**最大主版本号 + 1**，次版本号归零。
 *
 * <p>口径照抄下游 `InsuranceProduct.generateNewVersion`（`V{major+1}.0`）：新建费率表对话框的
 * 默认值也是 `V1.0`，故本函数统一产出 `V` 前缀 —— 一条产品线里只有一种写法，
 * 版本列才排得出先后、审计时才判得清哪一版在前。</p>
 *
 * @param versions 该产品线（同 tableCode / 同 productCode）下已有的全部版本号
 * @returns 建议版本号；`versions` 为空或全部不可解析时返回 `V1.0`
 */
export function nextVersion(versions: readonly string[]): string {
  const majors = versions
    .map((version) => parseVersion(version))
    .filter((parsed): parsed is ParsedVersion => parsed !== null)
    .map((parsed) => parsed.major)
  const next = majors.length ? Math.max(...majors) + 1 : 1
  return `V${next}.0`
}

/**
 * 比较两个版本号的先后（版本对比要靠它决定「哪一版是旧版本」）。
 *
 * <p>版本先后是业务事实，不能交给勾选顺序或列表返回顺序去决定：同一对版本换个点法就会得到
 * 一份前后颠倒的差异报告，那比没有报告更坏。</p>
 *
 * <p>不可解析的版本号（用户手填的非 `V{n}.{m}` 形式）排在可解析的版本之前 ——
 * 它们是历史遗留写法，当作「更早」比当作「更新」安全：回滚的源版本选早了只是白做一次，
 * 选晚了会把错误的方向当成回滚目标。</p>
 *
 * @returns 负数表示 a 早于 b，正数表示 a 晚于 b，0 表示无法区分或相同
 */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a)
  const right = parseVersion(b)
  if (!left || !right) {
    if (!left && !right) return 0
    return left ? 1 : -1
  }
  return left.major - right.major
}
