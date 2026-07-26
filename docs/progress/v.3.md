# 问渠｜v.3「纸上书房」前端改版

日期：2026-07-27

## 已完成

- 采用方案 A「纸上书房」：东方人文色谱与现代学习工作台结合；
- 建立宣纸暖白与墨色夜读两套独立主题；
- 使用黛蓝、朱砂、暖金、竹青构成全站语义色；
- 重做侧栏、全局顶栏、品牌印章与取义卡；
- 首页换成 SENet 材料封面、今日进度环和“今日三件事”；
- 重做资料库、洞察、错因图谱、阅读档案与注册弹窗；
- 学习流程改为隐藏侧栏的沉浸式五步阅读；
- 严格轨使用期刊纸张语言，陪读轨使用暖色便签语言；
- 复述页改为稿纸，诊断页改为朱砂批注与细环掌握度；
- 样式从单一大文件拆为六个职责明确的模块；
- 增加自动点击、截图和浏览器错误检查脚本；
- 保存桌面浅色、桌面深色、资料库、注册、学习地图和手机学习页 6 张原型图。

## 生成或修改的文件

- `apps/web/src/components/Shell.tsx`
- `apps/web/src/components/Dashboard.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/styles/tokens.css`
- `apps/web/src/styles/base.css`
- `apps/web/src/styles/shell.css`
- `apps/web/src/styles/pages.css`
- `apps/web/src/styles/study.css`
- `apps/web/src/styles/auth.css`
- `scripts/capture-prototype.mjs`
- `docs/product/prototypes/wenqu-v2/01-home-light.png`
- `docs/product/prototypes/wenqu-v2/02-home-dark.png`
- `docs/product/prototypes/wenqu-v2/03-materials-dark.png`
- `docs/product/prototypes/wenqu-v2/04-register-dark.png`
- `docs/product/prototypes/wenqu-v2/05-study-map-dark.png`
- `docs/product/prototypes/wenqu-v2/06-study-mobile-dark.png`

## 验证结果

- TypeScript：通过；
- Vite 生产构建：通过；
- Ruff：通过；
- Pytest：`4 passed`；
- 浏览器自动点击：首页、主题切换、资料库、注册弹窗、SENet 学习地图全部通过；
- 390 × 844 手机布局：通过；
- 浏览器错误层：未发现；
- 浏览器运行时错误：未发现；
- 生产构建产物：CSS 约 40.89 kB，gzip 约 8.83 kB；JS 约 249.30 kB，gzip 约 79.86 kB。

## 接下来自动进行

1. 提交 v.3 改版并更新现有 GitHub PR；
2. 等待 CI 自动审查全部通过；
3. 将合并后的版本部署到 Vercel；
4. 在真实公网完成桌面与手机复验；
5. 完成同一账号跨设备学习记录同步测试；
6. 安全配置 DeepSeek API，并把生产默认 AI 切换为 DeepSeek。
