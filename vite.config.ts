import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // 自动导入 Vue、Vue Router、Pinia API
    // 🔴 D-12：已去掉 'vue-i18n' —— 连同它自动生成的 useI18n 全局声明一起，
    // 否则 src/types/auto-imports.d.ts 会继续声明一个依赖已不存在的 API。
    // 🔴 importStyle: false 是**必需**的，不要当作默认值删掉：
    // main.ts 已 `import 'element-plus/dist/index.css'` 全量引入 EP 样式，若此处再按需
    // 引入组件 CSS，同一份 EP 样式会被打包**两份**——全量那份进 index-<hash>.css，
    // 按需那份按组件拆成独立 chunk（如 el-pagination 的 index-<hash>.css），
    // 并由入口 JS **在运行时后加载**。后果：项目样式在 index.scss 里靠「同特异性 +
    // 后加载」覆盖 EP 的焦点环规则，会被后加载的按需副本**再覆盖回去**——
    // 实测 .el-pager li:focus-visible 被 EP 的 `1px solid` 夺回，项目写的 `2px` 静默失效。
    // （此坑排查成本极高：产物 CSS 文本顺序看着是对的，只有 document.styleSheets 才暴露真相。）
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia'],
      resolvers: [ElementPlusResolver({ importStyle: false })],
      dts: 'src/types/auto-imports.d.ts',
    }),
    // 自动注册 Element Plus 组件（importStyle 理由同上）
    Components({
      resolvers: [ElementPlusResolver({ importStyle: false })],
      dts: 'src/types/components.d.ts',
    }),
  ],
  resolve: {
    alias: {
      // 路径别名：@ 指向 src/
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        // 全局注入 SCSS 变量
        additionalData: `@use "@/assets/styles/variables.scss" as *;`,
      },
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      // 开发代理：/api 转发到后端服务
      '/api': {
        target: 'http://localhost:8090',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // 代码分割策略
        manualChunks: {
          'element-plus': ['element-plus'],
          'echarts': ['echarts'],
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
        },
      },
    },
  },
})
