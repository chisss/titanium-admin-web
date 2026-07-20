// 应用入口文件
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import App from './App.vue'
import router from './router'
import i18n from './i18n'
import { setupPermissionDirective } from './directives/permission'
import '@/assets/styles/index.scss'

const app = createApp(App)

// 注册 Element Plus 图标（全局）
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// 注册插件
app.use(createPinia())
app.use(router)
app.use(ElementPlus)
app.use(i18n)

// 注册自定义指令
setupPermissionDirective(app)

app.mount('#app')
