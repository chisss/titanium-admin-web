/**
 * 按关键字过滤树结构，保留**通往命中节点的路径**与**命中节点自身的子树**。
 *
 * <p>为什么不能简单地对节点数组做 `filter`：树形表格（如菜单管理）靠 `children` 逐层展开，
 * 一个只保留命中节点的过滤器会把父级一并丢掉，于是命中的子节点失去挂载点、
 * 在界面上直接消失 —— 用户搜一个明明存在的子菜单却得到「暂无数据」。
 * 故自身未命中、但子孙里有命中时，**自己也要留下**，充当通往命中节点的路径。</p>
 *
 * <p>反过来，**自身命中的节点，其子树整体保留**。目录型节点的含义就是它的子树：
 * 只留一个"命中了、但没有孩子"的目录行，在树形表格里连展开箭头都不剩 ——
 * 用户搜「产品管理」得到一个空壳，比不过滤更令人困惑。</p>
 *
 * <p>⚠️ 两条边界，写清楚免得被误当成缺陷：</p>
 * <ul>
 *   <li>返回的**数组**总是新的，但自身命中的节点是**原对象引用**（其子树不克隆）。
 *       这安全，因为本函数从不修改任何节点；调用方若打算就地改动结果，请自行深拷贝。</li>
 *   <li>本函数**无从判断"当前有没有筛选"**——`match` 是不透明的谓词，空关键字构造出的谓词
 *       与"恒真"在它眼里毫无区别。故"未筛选时直接用原树"这条短路属于**调用方**的职责
 *       （`keyword ? filterTree(nodes, …) : nodes`），放在这里只会得到一句兑现不了的承诺。</li>
 * </ul>
 *
 * @param nodes 待过滤的树（不会被修改）
 * @param match 命中判定；只对节点自身判定，不下探
 * @returns 过滤后的新树
 */
export function filterTree<T extends { children?: T[] }>(
  nodes: T[],
  match: (node: T) => boolean,
): T[] {
  return nodes.reduce<T[]>((kept, node) => {
    if (match(node)) {
      kept.push(node)
      return kept
    }
    const children = filterTree(node.children ?? [], match)
    if (children.length) {
      // 🔴 这里的断言不是"绕过类型检查"：`T & { children: T[] }` 是 T 的**更窄**形态
      // （children 在 T 上本就是可选），任何具体实例化下都可赋回 T。
      // TS 之所以要断言，只是因为 T 尚未解析、无法验证这一恒等关系。
      kept.push({ ...node, children } as T)
    }
    return kept
  }, [])
}
