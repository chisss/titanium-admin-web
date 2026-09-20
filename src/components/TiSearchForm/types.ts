// TiSearchForm 的声明式字段类型。
//
// 单独成文件而不是写在 index.vue 的 <script setup> 里：`<script setup>` 不允许 ES 模块导出，
// 而调用方必须能 import 这些类型来给字段数组做类型标注——否则「声明式字段」对使用方是黑盒，
// 写错字段名只能等运行期表现为「筛了没反应」。类型放这里，双方共用一份定义。

/** 搜索控件类型 */
export type TiSearchControl = 'input' | 'select' | 'dict'

/**
 * 搜索控件宽度档位。
 *
 * <p>对应全局类 `ti-search-control-{sm|md|lg}`，最终落到 `$search-control-width-*` 令牌
 * （120 / 160 / 220px）。页面写档位、不写像素值——此前 20 个页面写了 14 种像素值，
 * 同语义的「状态」下拉在不同页面有 6 种宽度，靠人记住是记不住的。</p>
 */
export type TiSearchWidth = 'sm' | 'md' | 'lg'

/** 声明式搜索字段 */
export interface TiSearchField {
  /** 绑定字段名，对应 `model` 上的键 */
  prop: string
  /** 表单项标签 */
  label: string
  /** 控件类型，默认 `input` */
  type?: TiSearchControl
  /** 宽度档位，默认 `md` */
  width?: TiSearchWidth
  /** 占位提示 */
  placeholder?: string
  /** 是否可清空，默认 `true` */
  clearable?: boolean
  /** 选项，`type === 'select'` 时使用 */
  options?: Array<{ label: string; value: string | number }>
  /** 字典类型编码，`type === 'dict'` 时使用（交给 TiDictSelect 加载） */
  dictType?: string
  /** 是否归入「高级搜索」折叠区，默认 `false` */
  advanced?: boolean
}
