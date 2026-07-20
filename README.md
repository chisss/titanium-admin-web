# titanium-admin-web

Titanium 保险核心系统 B 端管理后台 — 前端项目

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Vue | 3.5+ | 前端框架 |
| TypeScript | 5.5 | 类型系统（0 ts错误） |
| Vite | 6.0 | 构建工具 |
| Element Plus | 2.8 | UI 组件库 |
| Pinia | 2.x | 状态管理 |
| Vue I18n | 10.x | 国际化（zh-CN / en-US） |
| ECharts | 5.x | 数据可视化 |

## 项目结构

```
src/
├── api/            # 接口封装（Axios + 自动注入 Token & TenantID）
├── composables/    # 复用逻辑（useDict / useTable / usePermission）
├── directives/     # v-permission 权限指令
├── i18n/           # 国际化文件（zh-CN / en-US）
├── layouts/        # 整体布局（Sidebar / Topbar / DataPanel / AiChat）
├── router/         # 路由 + 权限守卫（动态路由）
├── stores/         # Pinia（user / menu / app / dict）
├── types/          # TypeScript 类型定义
└── views/          # 业务页面
    ├── login/          # 登录页
    ├── dashboard/      # 数据看板（ECharts）
    ├── product/        # 产品管理（列表 / 创建向导 / 详情）
    ├── policy/         # 保单查询（高级搜索 / 详情 5 Tab）
    ├── clause/         # 条款管理（富文本编辑）
    ├── maintenance/    # 保全工单
    ├── claim/          # 理赔案件
    ├── underwriting/   # 核保管理
    ├── customer/       # 客户管理
    └── system/         # 系统管理（租户/用户/角色/菜单/字典/日志）
```

## 快速启动

```bash
# 需要 Node.js 18+
npm install
npm run dev   # 开发服务器：http://localhost:3000
npm run build # 生产构建
```

开发代理：`/api` → `http://localhost:8090`（titanium-admin-service）

## 功能亮点

### 字典国际化
字典管理页支持为每个字典值配置多语言标签（zh-CN/en-US/zh-TW），
`useDict` composable 根据当前 `i18n.locale` 自动返回对应语言的标签。

```typescript
const { dictOptions, getLabel } = useDict('POLICY_STATUS')
getLabel('ACTIVE')  // 中文下返回"生效中"，英文下返回"Active"
```

### 权限控制
- **路由级**：登录后动态加载用户权限菜单，无权限路由不注册
- **按钮级**：`v-permission="'policy:maintenance:apply'"` 指令控制按钮显隐
- **接口级**：401 自动跳登录，403 提示无权限

### 布局设计
- 左侧折叠菜单（200px ↔ 64px）
- 右侧数据看板（可收起，含 ECharts 趋势图）
- 底部 AI 助手（可展开对话历史）

## 后端接口

所有接口通过 `/api` 代理转发到 `titanium-admin-service`（端口 8090）。
接口格式：`POST /web/v1/{resource}` with `X-Tenant-ID` 请求头。
