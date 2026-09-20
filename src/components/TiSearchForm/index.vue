<template>
  <!-- TiSearchForm：搜索表单容器，支持展开/收起高级搜索 -->
  <div class="ti-search-area">
    <el-form :model="model" :inline="inline" @submit.prevent="handleSearch">
      <!-- 基础搜索区 -->
      <div class="ti-search-basic">
        <!-- 声明式字段（给出 fields 时走这里） -->
        <el-form-item v-for="field in basicFields" :key="field.prop" :label="field.label">
          <el-input
            v-if="controlOf(field) === 'input'"
            :model-value="fieldValue(field)"
            :class="widthClass(field)"
            :placeholder="field.placeholder"
            :clearable="field.clearable !== false"
            @update:model-value="(v) => setField(field, v)"
          />
          <el-select
            v-else-if="controlOf(field) === 'select'"
            :model-value="fieldValue(field)"
            :class="widthClass(field)"
            :placeholder="field.placeholder"
            :clearable="field.clearable !== false"
            @update:model-value="(v) => setField(field, v)"
          >
            <el-option
              v-for="option in field.options ?? []"
              :key="String(option.value)"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <TiDictSelect
            v-else
            :model-value="dictValue(field)"
            :class="widthClass(field)"
            :dict-type="field.dictType ?? ''"
            :placeholder="field.placeholder"
            :clearable="field.clearable !== false"
            @update:model-value="(v) => setField(field, v)"
          />
        </el-form-item>
        <!-- 插槽字段（既有的 20 个调用点走这里） -->
        <slot />
        <el-form-item>
          <el-button type="primary" native-type="submit" :icon="Search">搜索</el-button>
          <el-button :icon="Refresh" @click="handleReset">重置</el-button>
          <el-button
            v-if="hasAdvancedSection"
            text
            :icon="advancedVisible ? ArrowUp : ArrowDown"
            @click="toggleAdvanced"
          >
            {{ advancedVisible ? '收起' : '高级搜索' }}
          </el-button>
        </el-form-item>
      </div>
      <!-- 高级搜索区（可折叠） -->
      <el-collapse-transition>
        <div v-show="advancedVisible" class="ti-search-advanced">
          <el-form-item v-for="field in advancedFields" :key="field.prop" :label="field.label">
            <el-input
              v-if="controlOf(field) === 'input'"
              :model-value="fieldValue(field)"
              :class="widthClass(field)"
              :placeholder="field.placeholder"
              :clearable="field.clearable !== false"
              @update:model-value="(v) => setField(field, v)"
            />
            <el-select
              v-else-if="controlOf(field) === 'select'"
              :model-value="fieldValue(field)"
              :class="widthClass(field)"
              :placeholder="field.placeholder"
              :clearable="field.clearable !== false"
              @update:model-value="(v) => setField(field, v)"
            >
              <el-option
                v-for="option in field.options ?? []"
                :key="String(option.value)"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
            <TiDictSelect
              v-else
              :model-value="dictValue(field)"
              :class="widthClass(field)"
              :dict-type="field.dictType ?? ''"
              :placeholder="field.placeholder"
              :clearable="field.clearable !== false"
              @update:model-value="(v) => setField(field, v)"
            />
          </el-form-item>
          <slot name="advanced" />
        </div>
      </el-collapse-transition>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { Search, Refresh, ArrowUp, ArrowDown } from '@element-plus/icons-vue'
import type { TiSearchField, TiSearchWidth } from './types'

// ui-011 对 TiSearchForm 的增强只做三件事，且**不改动任何既有调用点**：
//  ① 重置按钮自足（原先它只是 emit 一个事件，页面没绑 @reset 就点不动 —— 见 handleReset）
//  ② 搜索控件宽度走 $search-control-width-* 令牌（原先 20 个页面写了 14 种内联像素值）
//  ③ 声明式字段配置（原先每个字段的控件类型/宽度/占位都要手写一遍，也无从统一响应式）
// 默认行为与 DOM 结构与增强前**逐节点一致**：不传 fields 时只多渲染一个空插槽。

/** TiSearchForm 属性 */
interface Props {
  /** 表单绑定对象 */
  model: Record<string, unknown>
  /** 是否行内布局 */
  inline?: boolean
  /** 是否有高级搜索 slot（插槽模式下使用） */
  hasAdvanced?: boolean
  /**
   * 声明式字段配置。给出即由组件渲染这些字段；不给出则完全沿用 `#default` / `#advanced` 插槽，
   * 两种方式可同时使用（先渲染 fields，再渲染插槽）。
   */
  fields?: TiSearchField[]
}

const props = withDefaults(defineProps<Props>(), {
  inline: true,
  hasAdvanced: false,
  fields: () => [],
})

const emit = defineEmits<{
  /** 触发搜索 */
  search: []
  /** 触发重置 */
  reset: []
}>()

// 高级搜索展开状态
const advancedVisible = ref(false)

const toggleAdvanced = () => {
  advancedVisible.value = !advancedVisible.value
}

const handleSearch = () => {
  emit('search')
}

// ─────────────────────────── 重置（①） ───────────────────────────

/**
 * 挂载时的表单快照，供 {@link handleReset} 还原。
 *
 * <p>用普通变量而非 ref：它只在重置时被读，从不参与渲染，做成响应式只会平白多一层依赖。</p>
 */
let initialModel: Record<string, unknown> = {}

/**
 * 深拷贝一份表单值。
 *
 * <p>搜索条件里数组（多选）很常见，浅拷贝会让快照与表单**共享同一个数组实例** ——
 * 用户改动多选项后，快照里那份也跟着变了，重置等于没重置。故优先结构化深拷贝；
 * 遇到不可克隆的值（函数等）时退化为浅拷贝：基本类型仍能正确还原，总好过整个重置失效。</p>
 */
function snapshot(model: Record<string, unknown>): Record<string, unknown> {
  const raw = toRaw(model)
  try {
    return structuredClone(raw)
  } catch {
    return { ...raw }
  }
}

/**
 * 重置。
 *
 * <p>🔴 顺序是**先还原、再 emit**，这个顺序不能反：
 * 页面自己的 `@reset` 处理器在 emit 时才运行，因此页面若持有更具体的重置语义
 * （例如 payment-operations 还要同时清空不挂在 model 上的三个日期区间 ref），
 * 它写的那套照旧最后生效、完整覆盖本组件的还原。</p>
 *
 * <p>由此得到的关键性质：**页面绑不绑 `@reset`，重置按钮都能用**。
 * 本组件出现之前，重置按钮只是一个 emit，页面忘了绑就是一个点了没反应的按钮 ——
 * 有按钮、有图标、有 hover 效果，却什么都不会发生（同 D-12 那个改不动语言的语言按钮）。
 * 20 个既有调用点全都绑了 @reset，故本次增强对它们不产生任何行为变化。</p>
 */
const handleReset = () => {
  const target = props.model
  for (const key of Object.keys(target)) delete target[key]
  Object.assign(target, snapshot(initialModel))
  emit('reset')
}

// ─────────────────────── 声明式字段（③） ───────────────────────

const basicFields = computed(() => props.fields.filter((f) => !f.advanced))
const advancedFields = computed(() => props.fields.filter((f) => f.advanced))

/** 是否显示「高级搜索」开关：插槽模式看 prop，声明式模式看有没有 advanced 字段 */
const hasAdvancedSection = computed(
  () => props.hasAdvanced || advancedFields.value.length > 0,
)

/**
 * 字段对应的控件类型。
 *
 * <p>🔴 `type: 'dict'` 却漏写 `dictType` 时**降级为输入框**，而不是照常渲染字典下拉：
 * 没有字典类型的下拉永远是空的 —— 用户点开一片空白、什么也选不了，正是「有控件、没反应」的形态；
 * 而 `TiDictSelect` 仍会拿空串去 `getDict('')` 发一次注定失败的请求。
 * 降级为输入框后该字段至少仍可用于检索（搜索场景下直接填字典码是有意义的），
 * 配置错误则由 {@link checkFieldConfig} 的告警指出。</p>
 */
const controlOf = (field: TiSearchField) =>
  field.type === 'dict' && !field.dictType ? 'input' : (field.type ?? 'input')

const WIDTH_CLASS: Record<TiSearchWidth, string> = {
  sm: 'ti-search-control-sm',
  md: 'ti-search-control-md',
  lg: 'ti-search-control-lg',
}

/** 宽度档位 → 全局类。类名定义在 assets/styles/index.scss，与令牌一一对应 */
const widthClass = (field: TiSearchField) => WIDTH_CLASS[field.width ?? 'md']

// model 是 Record<string, unknown>，三种控件的 modelValue 类型各不相同，
// 在此集中收口断言，避免把 as 散落到模板的三处分支里
const fieldValue = (field: TiSearchField) => props.model[field.prop] as string | number | undefined
const dictValue = (field: TiSearchField) => props.model[field.prop] as string | string[] | undefined
const setField = (field: TiSearchField, value: unknown) => {
  props.model[field.prop] = value
}

/**
 * 开发期配置自检。
 *
 * <p>`type: 'dict'` 漏写 `dictType` 是最容易犯、也最难从界面看出来的配置错误：
 * 表现为「这个下拉怎么总是没有选项」，排查时会先怀疑后端字典没配。
 * 故在此主动点名，同时由 {@link controlOf} 把该字段降级为输入框兜底。</p>
 */
function checkFieldConfig() {
  const missingDictType = props.fields.filter((f) => f.type === 'dict' && !f.dictType)
  if (missingDictType.length) {
    console.warn(
      `[TiSearchForm] 字段 ${missingDictType.map((f) => f.prop).join('、')} 声明为 dict 但未提供 dictType，已降级为输入框`,
    )
  }
}

onMounted(() => {
  initialModel = snapshot(props.model)
  checkFieldConfig()
})
</script>

<style scoped lang="scss">
.ti-search-advanced {
  border-top: 1px dashed $border-color;
  padding-top: 12px;
  margin-top: 4px;
}
</style>
