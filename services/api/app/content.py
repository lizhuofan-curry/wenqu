from __future__ import annotations

from datetime import UTC, datetime

from .models import (
    LearningSection,
    MapItem,
    MaterialInternal,
    Persona,
    QuestionInternal,
    SourceRef,
)

PERSONAS = [
    Persona(
        id="huangfeng",
        name="黄风教练",
        tagline="先把结论抓住，再一个公式一个公式拆。",
        tone="直接、短句、适度调侃",
        accent="别急着硬啃，先把这一步看明白。",
    ),
    Persona(
        id="senior",
        name="安静师姐",
        tagline="不催你，陪你把卡住的地方慢慢理顺。",
        tone="温和、循序渐进、少调侃",
        accent="你已经抓住一部分了，我们再补上缺的条件。",
    ),
    Persona(
        id="researcher",
        name="严格研究员",
        tagline="术语、公式、证据和边界，一个都不能混。",
        tone="严谨、直接、证据优先",
        accent="这句话需要证据。请区分论文结论与推断。",
    ),
]


def source(label: str, detail: str | None = None) -> SourceRef:
    return SourceRef(label=label, detail=detail)


SENET = MaterialInternal(
    id="senet-cvpr-2018",
    title="Squeeze-and-Excitation Networks",
    subtitle="从通道重标定读懂 SENet 的核心机制",
    source_type="builtin",
    estimated_minutes=32,
    difficulty="进阶 · CNN",
    progress=0,
    map=[
        MapItem(
            key="problem",
            title="问题",
            summary="普通卷积把通道关系隐式地埋在卷积核里，网络缺少根据当前输入显式调整通道响应的机制。",
            source=source("PDF 第 2—3 页", "第 3 节开头"),
        ),
        MapItem(
            key="method",
            title="方法",
            summary=(
                "先用全局平均池化压缩空间信息，再用两层门控生成 C 个通道权重，"
                "最后逐通道缩放原特征。"
            ),
            source=source("PDF 第 2—3 页", "Figure 1；公式（2）—（4）"),
        ),
        MapItem(
            key="evidence",
            title="证据",
            summary=(
                "SE block 接入 ResNet、ResNeXt、VGG 和 Inception 等架构后，"
                "ImageNet 验证集错误率普遍下降。"
            ),
            source=source("PDF 第 5—7 页", "Table 2、Table 3、Table 5、Table 6"),
        ),
        MapItem(
            key="conclusion",
            title="结论",
            summary="输入相关的通道重标定可以用较小计算开销增强多种 CNN 主干的表示能力。",
            source=source("PDF 第 8 页", "第 7 节 Conclusion"),
        ),
        MapItem(
            key="limitations",
            title="边界",
            summary="全局平均会压缩空间分布；论文主要提供经验结果，没有给出完整理论证明，也未覆盖现代分布外鲁棒性评估。",
            source=source("PDF 第 3、8 页", "3.1 Discussion；实验覆盖范围推断"),
        ),
    ],
    learning_goals=[
        "说明 SE 为什么是输入相关的通道重标定，而不是固定剪枝。",
        "推导 Squeeze、Excitation、Scale 各阶段的张量形状。",
        "指出 SE 在 ResNet residual 分支中的正确插入位置。",
    ],
    sections=[
        LearningSection(
            id="squeeze",
            title="Squeeze",
            eyebrow="全局信息嵌入",
            strict_track=(
                "输入 U∈R^(H×W×C)。对第 c 个通道执行全局平均池化："
                "z_c=1/(H×W)·Σ_iΣ_j u_c(i,j)。张量从 H×W×C 变为 1×1×C。"
                "每个通道保留一个全局统计值，但具体空间位置被压缩。"
            ),
            companion_track=(
                "先别被名字吓到。Squeeze 不是把通道删掉，而是给每个通道写一句摘要。"
                "原来一个通道有 H×W 个数，现在先平均成一个数，所以 C 个通道仍然都在。"
            ),
            source=source("PDF 第 3 页", "3.1 节与公式（2）"),
        ),
        LearningSection(
            id="excitation",
            title="Excitation",
            eyebrow="自适应通道门控",
            strict_track=(
                "s=σ(W₂·ReLU(W₁·z))。若 reduction ratio 为 r，维度依次为 C→C/r→C。"
                "sigmoid 为每个通道生成独立的 0—1 门控值；通道不是互斥关系，因此不是 softmax。"
            ),
            companion_track=(
                "把 C 句通道摘要放在一起判断：谁该大声一点，谁先小点声。"
                "两层全连接先压缩再恢复，最后得到 C 个音量旋钮。多个通道可以同时重要。"
            ),
            source=source("PDF 第 3 页", "3.2 节与公式（3）"),
        ),
        LearningSection(
            id="scale",
            title="Scale",
            eyebrow="逐通道重标定",
            strict_track=(
                "第 c 个输出通道为 X̃_c=s_c·u_c。标量 s_c 广播到该通道所有空间位置，"
                "因此输出形状仍为 H×W×C。权重由当前输入计算，不是训练后固定常数。"
            ),
            companion_track=(
                "现在把每个通道乘上自己的音量旋钮。形状完全不变，只是响应强弱变了。"
                "同一通道遇到不同图片时权重也会变；把它说成固定剪枝，就绕偏了。"
            ),
            source=source("PDF 第 3 页", "公式（4）"),
        ),
        LearningSection(
            id="resnet",
            title="接入 ResNet",
            eyebrow="残差分支位置",
            strict_track=(
                "SE 作用于 non-identity residual branch。先计算 residual transform，"
                "再执行 SE scale，最后与 identity branch 相加。对应表达为 "
                "output=SE(residual(x))+identity(x)。"
            ),
            companion_track=(
                "两条路别搅一锅：SE 只调 residual 那条路，调完才和 identity 会合。"
                "看 Figure 3 的箭头，位置比背公式更重要。"
            ),
            source=source("PDF 第 4 页", "Figure 3 与 3.3 节"),
        ),
    ],
    questions=[
        QuestionInternal(
            id="q1",
            kind="concept",
            prompt="为什么 Squeeze 要把每个 H×W 通道压缩成一个数？这样获得了什么，又丢失了什么？",
            hint="分别考虑全局上下文和空间位置。",
            source=source("PDF 第 3 页", "3.1 节与公式（2）"),
            answer_guide=(
                "全局平均池化为每个通道生成利用整张特征图的全局描述；保留 C 个通道，"
                "但压缩了具体空间位置与分布信息。"
            ),
            max_score=4,
        ),
        QuestionInternal(
            id="q2",
            kind="tensor",
            prompt=(
                "输入 U 的形状是 32×32×256，reduction ratio r=16。"
                "依次写出 Squeeze、第一层 FC、第二层 FC+sigmoid、Scale 后的形状。"
            ),
            hint="r 只控制中间瓶颈维度。",
            source=source("PDF 第 3—4 页", "公式（3）、（4）与 Figure 3"),
            answer_guide="1×1×256 → 16 → 256 → 32×32×256。",
            max_score=4,
        ),
        QuestionInternal(
            id="q3",
            kind="structure",
            prompt=(
                "哪种写法符合论文 Figure 3？A. SE(residual(x)+identity(x))；"
                "B. SE(residual(x))+identity(x)。请说明理由。"
            ),
            hint="观察 SE 位于哪一条分支、在相加节点之前还是之后。",
            source=source("PDF 第 4 页", "Figure 3"),
            answer_guide="选择 B。SE 缩放 residual/non-identity branch，之后才与 identity 相加。",
            max_score=3,
        ),
    ],
    created_at=datetime.now(UTC).isoformat(),
)
