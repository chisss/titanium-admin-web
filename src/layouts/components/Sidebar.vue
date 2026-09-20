<template>
  <!-- 左侧菜单栏 -->
  <div class="sidebar" :class="{ 'sidebar--collapsed': collapsed }">
    <!-- Logo 区域 -->
    <div class="sidebar__logo">
      <img src="/logo.svg" alt="Logo" class="sidebar__logo-img" />
      <transition name="fade">
        <span v-if="!collapsed" class="sidebar__logo-text">Titanium</span>
      </transition>
    </div>

    <!-- 菜单主体 -->
    <el-scrollbar class="sidebar__scroll">
      <!-- 🔴 不传 background-color / text-color / active-text-color 三个属性：
           它们是**字面值拷贝**（与 $sidebar-* 同值但各存一份），换品牌色会掉队。而 EP 会拿
           background-color 做颜色运算（use-menu-color.mjs 的 `new TinyColor(bg).shade(20)`
           求 hover 底色），传 `var(...)` 会解析失败——故改由下方 .sidebar__menu 直接声明
           `--el-menu-*` 变量（EP 在属性为空时**不产生内联声明**，类规则得以生效）。 -->
      <!-- 🔴 tabindex="0" 与 @keydown 是**必需**的键盘可达性补丁，不要当作冗余属性删掉：
           EP 的 el-menu 在垂直模式下**不提供任何键盘支持**——其 menu.mjs / menu-item2.mjs
           中既无 keydown 监听也无 tabindex（唯一的 ArrowDown 是子菜单展开箭头的图标导入）。
           实测后果：31 个菜单项 + 14 个子菜单标题 tabindex 全为 -1，真实 Tab 前 12 格
           无一进入侧栏，**主导航键盘完全不可达**，违反 WCAG 2.1.1（Level A）。
           el-menu-item / el-sub-menu 的根都是 <li>，非 prop 的 attrs 由 Vue 透传到根元素。 -->
      <el-menu
        :default-active="activeMenu"
        :collapse="collapsed"
        :collapse-transition="false"
        router
        class="sidebar__menu"
        @keydown="handleMenuKeydown"
      >
        <template v-for="menu in menuTree" :key="menu.id">
          <!-- 有子菜单：渲染 SubMenu -->
          <el-sub-menu
            v-if="menu.children && menu.children.length"
            :index="menu.path || menu.id"
            tabindex="0"
          >
            <template #title>
              <el-icon v-if="menu.icon">
                <component :is="menu.icon" />
              </el-icon>
              <span>{{ menu.title }}</span>
            </template>
            <el-menu-item
              v-for="child in menu.children"
              :key="child.id"
              :index="child.path || child.id"
              tabindex="0"
            >
              <el-icon v-if="child.icon">
                <component :is="child.icon" />
              </el-icon>
              <span>{{ child.title }}</span>
            </el-menu-item>
          </el-sub-menu>
          <!-- 无子菜单：直接 MenuItem -->
          <el-menu-item v-else :index="menu.path || menu.id" tabindex="0">
            <el-icon v-if="menu.icon">
              <component :is="menu.icon" />
            </el-icon>
            <template #title>{{ menu.title }}</template>
          </el-menu-item>
        </template>
      </el-menu>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { useMenuStore } from '@/stores/menu'
import { useRoute } from 'vue-router'

interface Props {
  /** 是否折叠 */
  collapsed: boolean
}

defineProps<Props>()

const menuStore = useMenuStore()
const route = useRoute()

const menuTree = computed(() => menuStore.menuTree)
const activeMenu = computed(() => route.path)

/**
 * 菜单键盘激活：把 Enter / Space 等同于点击。
 *
 * 为什么需要：EP 的 el-menu 在垂直模式下零键盘支持（见模板注释），菜单项本身不会响应按键。
 * 这里用事件委托挂在 <el-menu> 上统一处理，避免给 31 个菜单项各绑一个监听。
 * 激活动作一律复用 EP 自身的 click 处理——菜单项走 router 跳转、子菜单走展开/收起，
 * 不重复实现分支逻辑。
 */
const handleMenuKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Enter' && event.key !== ' ') return
  const target = event.target as HTMLElement
  const item = target.closest<HTMLElement>('.el-menu-item, .el-sub-menu')
  if (!item) return
  // 阻止 Space 的默认滚动行为，否则按空格会先滚页面再激活
  event.preventDefault()
  if (item.classList.contains('el-sub-menu')) {
    // 子菜单的 tabindex 落在根 <li> 上，但 EP 的展开逻辑绑在内层 title 上
    item.querySelector<HTMLElement>('.el-sub-menu__title')?.click()
  } else {
    item.click()
  }
}
</script>

<style scoped lang="scss">
.sidebar {
  width: $sidebar-width;
  height: 100%;
  background-color: $sidebar-bg;
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;
  overflow: hidden;
  flex-shrink: 0;

  &--collapsed {
    width: $sidebar-collapsed-width;
  }

  &__logo {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 20px;
    height: $topbar-height;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    overflow: hidden;
    white-space: nowrap;
  }

  &__logo-img {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
  }

  &__logo-text {
    font-size: 18px;
    font-weight: 700;
    color: #ffffff;
    letter-spacing: 1px;
  }

  &__scroll {
    flex: 1;
    overflow: hidden;
  }

  &__menu {
    border-right: none !important;
    width: 100% !important;

    // 菜单配色：取代此前写在 <el-menu> 上的三个色值属性（见模板注释）。
    // 变量名是 EP 自己消费的（use-menu-css-var.mjs 逐项对应属性），此处以类规则声明，
    // 特异性 (0,2,0) 高于 EP 的 .el-menu (0,1,0)，且属性为空时 EP 不写内联样式，故无冲突。
    --el-menu-bg-color: #{$sidebar-bg};
    --el-menu-text-color: #{$sidebar-text};
    --el-menu-hover-text-color: #{$sidebar-text};
    --el-menu-active-color: #{$sidebar-active-text};
    // hover 底色：EP 原本由 TinyColor(bg).shade(20) 算出，即「混黑 20%」。
    // 此处直接用令牌 $sidebar-hover-bg，与下方 !important 的 item hover 保持同源。
    --el-menu-hover-bg-color: #{$sidebar-hover-bg};

    :deep(.el-menu-item) {
      &:hover {
        background-color: $sidebar-hover-bg !important;
      }

      &.is-active {
        background-color: $sidebar-active !important;
        color: $sidebar-active-text !important;
      }
    }

    :deep(.el-sub-menu__title:hover) {
      background-color: $sidebar-hover-bg !important;
    }

    // ── 焦点环：深底上必须换浅色，这是**上下文依赖**，不能沿用全局的品牌色 ──
    // 全局规则给的是 $primary-color(#1a3a6b)，在侧栏上两处失效：
    //   ① 非激活项背景 rgb(15,30,61) → 品牌色压上去仅 1.46:1；
    //   ② **激活项背景恰好也是 #1a3a6b**，加上 outline-offset 为负（描边画在元素内部），
    //      描边＝背景，实测 **1:1，焦点环完全不可见**——而当前页那一项正是键盘用户最常聚焦的。
    // 改用 $sidebar-active-text(#ffffff) 后：压 rgb(15,30,61) 约 16.5:1、压 #1a3a6b 约 11.3:1，
    // 两种背景均远超 3:1 要求。**取值必须跟着 $sidebar-* 走**：若将来把激活底色改浅，
    // 白色描边会重演「描边=背景」的 1:1，此处需一并复算。
    :deep(.el-menu-item:focus-visible) {
      outline: 2px solid $sidebar-active-text;
      outline-offset: -2px;
    }

    // 子菜单的 tabindex 落在根 <li> 上，但视觉焦点应落在标题行，故把描边画到内层 title。
    //
    // 🔴 这条 `outline: none` 是**显式契约**：「LI 自身不画环，环只出现在标题行」。
    //    它不是抑制某个已知冲突的补丁，而是对下面这条事实的声明——我们给一个**语义上
    //    不是交互控件**的 `<li>` 补了 `tabindex="0"`（EP 的 el-menu 垂直模式不提供键盘支持，
    //    只能由我们补），所以「它现在可聚焦了」这件事必须由我们自己负责收尾。
    //
    //    历史：本条原先是在抑制 index.scss 的全局兜底 `:where(…, [tabindex]):focus-visible`
    //    ——那个兜底的特异性恒为 0，却会在这个 LI 上生效（EP 对 .el-sub-menu 无焦点规则），
    //    品牌色压在侧栏深底上实测仅 **1.46:1**，且子菜单展开时该环会圈住整个展开组。
    //    该兜底已改为不含 `[tabindex]` 的显式选择器列表（见 index.scss），故此处的冲突源已消失；
    //    保留本条是因为它与上方的 `tabindex="0"` 是一对**不可分的契约**——
    //    只要 LI 上还有 tabindex，就仍然需要明确「谁负责画环」。
    :deep(.el-sub-menu:focus-visible) {
      outline: none;
    }

    :deep(.el-sub-menu:focus-visible > .el-sub-menu__title) {
      outline: 2px solid $sidebar-active-text;
      outline-offset: -2px;
    }
  }
}
</style>
