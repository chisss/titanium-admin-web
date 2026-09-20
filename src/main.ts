// 应用入口文件
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import App from './App.vue'
import router from './router'
import { setupPermissionDirective } from './directives/permission'
import { setupGlobalErrorHandling } from './utils/globalError'
import '@/assets/styles/index.scss'

const app = createApp(App)

// 全局错误兜底（D-10）：必须早于 mount，否则首屏渲染期的错误无人接管
setupGlobalErrorHandling(app)

// 注册 Element Plus 图标（全局）
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// 注册插件
app.use(createPinia())
app.use(router)
// 🔴 D-12：前端不再装 i18n 运行时（vue-i18n 已从依赖移除），界面语言由后端按租户下发。
// 这行 Element Plus 的 zh-cn 语言包是「后端下发语言之前的默认值」，也是将来接入的**唯一挂点**：
// 拿到租户语言后只需把 zhCn 换成对应语言包，其余业务代码不动。
// 刻意不引入 el-config-provider 做运行时热切换——那要先为每种语言静态引入 EP 语言包（YAGNI）。
app.use(ElementPlus, { locale: zhCn })

// 注册自定义指令
setupPermissionDirective(app)

app.mount('#app')
