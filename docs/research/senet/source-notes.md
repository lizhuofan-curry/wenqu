# SENet 原始材料说明

## 论文

- 标题：*Squeeze-and-Excitation Networks*
- 作者：Jie Hu、Li Shen、Gang Sun
- 会议：CVPR 2018
- 论文页码：7132—7141
- 本地文件：`resources/papers/senet/SENet-CVPR-2018.pdf`（仅本地保存，不提交 Git）
- 官方页面：https://openaccess.thecvf.com/content_cvpr_2018/html/Hu_Squeeze-and-Excitation_Networks_CVPR_2018_paper
- 官方 PDF：https://openaccess.thecvf.com/content_cvpr_2018/papers/Hu_Squeeze-and-Excitation_Networks_CVPR_2018_paper.pdf

## 本轮重点页

| PDF 页码 | 论文页码 | 内容 |
|---|---:|---|
| 2 | 7133 | Figure 1、SE block 总览、第 3 节开头 |
| 3 | 7134 | Squeeze、Excitation、Scale 的公式与解释 |
| 4 | 7135 | SE-Inception、SE-ResNet 接入位置与复杂度 |
| 5 | 7136 | 网络结构表和 ImageNet 主要结果 |
| 6 | 7137 | 训练曲线、不同基础架构和轻量网络结果 |
| 7 | 7138 | Places365、COCO、reduction ratio 分析 |
| 8 | 7139 | 不同深度的通道激活分析与结论 |

## 证据边界

- 学习包中的论文事实必须能回到上述页码。
- “论文局限”需区分作者明确陈述和根据实验覆盖范围作出的推断。
- 不把 ImageNet 验证集结果写成测试集结果。
- ILSVRC 2017 竞赛测试集结果与论文中 ImageNet 验证集结果分开描述。
