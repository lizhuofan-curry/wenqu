# 问渠 v.1｜蓝白产品前端与公开演示

版本日期：2026-07-27

## 本版目标

将 v.0 的可运行学习闭环升级为可以公开展示和邀请体验的产品前端，同时保持 SENet 证据学习流程不被视觉改造破坏。

## 已完成

- 更新中文文化品牌为“问渠 Wenqu”；
- 建立蓝白主视觉、白天 / 夜间模式和移动端导航；
- 补齐今日阅读、资料库、学习洞察、错因图谱、阅读档案；
- 增加注册 / 登录演示交互；
- 增加无后端演示数据和公开部署模式；
- 保留 SENet 五步学习闭环；
- 保存 8 张真实运行产品原型图；
- 发布推荐公开演示站点 <https://lizhuofan-curry.github.io/wenqu/>；
- 发布 Vercel 备用站点 <https://wenqu-reading-room.vercel.app>；
- 更新 README 与实时进度文档。

## 主要文件

- `apps/web/src/components/Shell.tsx`
- `apps/web/src/components/Dashboard.tsx`
- `apps/web/src/components/MaterialsView.tsx`
- `apps/web/src/components/InsightsView.tsx`
- `apps/web/src/components/MisconceptionsView.tsx`
- `apps/web/src/components/AuthModal.tsx`
- `apps/web/src/lib/demo.ts`
- `apps/web/src/lib/api.ts`
- `apps/web/src/styles.css`
- `docs/product/prototypes/wenqu-v1/`

## 验证

- TypeScript 严格检查通过；
- Vite 生产构建通过；
- Chrome 实际点击导航、主题、注册弹窗和 SENet 前两阶段通过；
- 原型图均由正式 React 前端生成。
- Sites 生产版本 4 部署成功，访问模式为公开。
- GitHub Pages 返回 `200 OK`，真实 Chrome 导航和 SENet 入口验收通过，控制台无错误。

## 下一步

最高优先级：邀请第一位真实学习者打开公网链接并完成 SENet 流程，记录完成时间、退出点和反馈。
