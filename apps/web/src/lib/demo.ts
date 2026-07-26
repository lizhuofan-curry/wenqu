import type {
  EvaluationResult,
  Material,
  Persona,
  Session,
} from "./types";

export const demoPersonas: Persona[] = [
  {
    id: "huangfeng",
    name: "黄风教练",
    tagline: "先抓结论，再一个公式一个公式拆。",
    tone: "直接、短句、适度调侃",
    accent: "别急着硬啃，先把这一步看明白。",
  },
  {
    id: "senior",
    name: "安静师姐",
    tagline: "不催你，陪你把卡住的地方慢慢理顺。",
    tone: "温和、循序渐进",
    accent: "你已经抓住一部分了，我们再补上缺的条件。",
  },
  {
    id: "researcher",
    name: "严格研究员",
    tagline: "术语、公式、证据和边界，一个都不能混。",
    tone: "严谨、直接、证据优先",
    accent: "这句话需要证据。请区分论文结论与推断。",
  },
];

export const demoMaterial: Material = {
  id: "senet-cvpr-2018",
  title: "Squeeze-and-Excitation Networks",
  subtitle: "从通道重标定读懂 SENet 的核心机制",
  source_type: "builtin",
  estimated_minutes: 32,
  difficulty: "进阶 · CNN",
  progress: 36,
  created_at: "2026-07-27T00:00:00.000Z",
  map: [
    {
      key: "problem",
      title: "问题",
      summary: "普通卷积缺少根据当前输入显式调整通道响应的机制。",
      source: { label: "PDF 第 2—3 页", detail: "第 3 节开头" },
    },
    {
      key: "method",
      title: "方法",
      summary: "全局平均池化压缩空间信息，两层门控生成通道权重，最后逐通道缩放。",
      source: { label: "PDF 第 2—3 页", detail: "Figure 1；公式（2）—（4）" },
    },
    {
      key: "evidence",
      title: "证据",
      summary: "接入多种 CNN 主干后，ImageNet 验证集错误率普遍下降。",
      source: { label: "PDF 第 5—7 页", detail: "Table 2、3、5、6" },
    },
    {
      key: "conclusion",
      title: "结论",
      summary: "输入相关的通道重标定能以较小开销增强 CNN 表示能力。",
      source: { label: "PDF 第 8 页", detail: "Conclusion" },
    },
    {
      key: "limitations",
      title: "边界",
      summary: "全局平均压缩空间分布，论文也没有覆盖现代分布外鲁棒性评估。",
      source: { label: "PDF 第 3、8 页", detail: "Discussion 与实验边界" },
    },
  ],
  learning_goals: [
    "说明 SE 为什么是输入相关的通道重标定，而不是固定剪枝。",
    "推导 Squeeze、Excitation、Scale 各阶段的张量形状。",
    "指出 SE 在 ResNet residual 分支中的正确插入位置。",
  ],
  sections: [
    {
      id: "squeeze",
      title: "Squeeze",
      eyebrow: "全局信息嵌入",
      strict_track:
        "输入 U∈R^(H×W×C)。对每个通道执行全局平均池化，张量从 H×W×C 变为 1×1×C。每个通道保留一个全局统计值，但具体空间位置被压缩。",
      companion_track:
        "Squeeze 不是删掉通道，而是给每个通道写一句摘要。原来一个通道有 H×W 个数，现在先平均成一个数，C 个通道仍然都在。",
      source: { label: "PDF 第 3 页", detail: "3.1 节与公式（2）" },
    },
    {
      id: "excitation",
      title: "Excitation",
      eyebrow: "自适应通道门控",
      strict_track:
        "s=σ(W₂·ReLU(W₁·z))。若 reduction ratio 为 r，维度依次为 C→C/r→C。sigmoid 为每个通道生成独立门控值。",
      companion_track:
        "把 C 句通道摘要放在一起判断：谁该大声一点，谁先小点声。最后得到 C 个音量旋钮，多个通道可以同时重要。",
      source: { label: "PDF 第 3 页", detail: "3.2 节与公式（3）" },
    },
    {
      id: "scale",
      title: "Scale",
      eyebrow: "逐通道重标定",
      strict_track:
        "第 c 个输出通道为 X̃_c=s_c·u_c。标量广播到该通道所有空间位置，因此输出形状仍为 H×W×C。",
      companion_track:
        "把每个通道乘上自己的音量旋钮。形状不变，只是响应强弱变了；不同图片的权重也会变化。",
      source: { label: "PDF 第 3 页", detail: "公式（4）" },
    },
    {
      id: "resnet",
      title: "接入 ResNet",
      eyebrow: "残差分支位置",
      strict_track:
        "SE 作用于 non-identity residual branch。先计算 residual transform，再执行 SE scale，最后与 identity branch 相加。",
      companion_track:
        "两条路别搅在一起：SE 只调 residual 那条路，调完才和 identity 会合。",
      source: { label: "PDF 第 4 页", detail: "Figure 3 与 3.3 节" },
    },
  ],
  questions: [
    {
      id: "q1",
      kind: "concept",
      prompt: "为什么 Squeeze 要把每个 H×W 通道压缩成一个数？获得了什么，又丢失了什么？",
      hint: "分别考虑全局上下文和空间位置。",
      source: { label: "PDF 第 3 页", detail: "3.1 节与公式（2）" },
    },
    {
      id: "q2",
      kind: "tensor",
      prompt:
        "输入 U 是 32×32×256，r=16。依次写出 Squeeze、第一层 FC、第二层 FC+sigmoid、Scale 后的形状。",
      hint: "r 只控制中间瓶颈维度。",
      source: { label: "PDF 第 3—4 页", detail: "公式（3）、（4）" },
    },
    {
      id: "q3",
      kind: "structure",
      prompt:
        "哪种写法符合论文 Figure 3？A. SE(residual(x)+identity(x))；B. SE(residual(x))+identity(x)。请说明理由。",
      hint: "观察 SE 在相加节点之前还是之后。",
      source: { label: "PDF 第 4 页", detail: "Figure 3" },
    },
  ],
};

export function createDemoSession(personaId: string): Session {
  return {
    id: `demo-${Date.now()}`,
    material_id: demoMaterial.id,
    persona_id: personaId,
    status: "active",
    started_at: new Date().toISOString(),
  };
}

export function evaluateDemoSession(session: Session): Session {
  const result: EvaluationResult = {
    total_score: 12,
    max_score: 15,
    mastery: 80,
    headline: "主线已经抓住，再校准一个结构位置",
    summary: "你能解释通道重标定和张量变化；请再确认 SE 位于 residual 分支、相加之前。",
    question_results: demoMaterial.questions.map((question, index) => ({
      question_id: question.id,
      score: index === 2 ? 3 : 4,
      max_score: index === 2 ? 3 : 4,
      verdict: index === 2 ? "部分掌握" : "掌握",
      feedback:
        index === 2
          ? "方向正确。请明确写出 SE(residual(x)) + identity(x)。"
          : "回答覆盖了核心概念，并能回到原文证据。",
      misconception_tags: index === 2 ? ["残差分支位置"] : [],
      source: question.source,
    })),
    retelling: {
      score: 4,
      max_score: 4,
      feedback: "复述覆盖了 Squeeze、Excitation 与 Scale 的因果关系。",
    },
    misconception_tags: ["残差分支位置"],
    review_sources: [{ label: "PDF 第 4 页", detail: "Figure 3" }],
    next_step: "回看 Figure 3，用一行公式画出 residual 与 identity 两条路径。",
    evaluator: "rules",
  };
  return {
    ...session,
    status: "completed",
    completed_at: new Date().toISOString(),
    result,
  };
}
