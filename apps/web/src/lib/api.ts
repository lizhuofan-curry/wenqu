import type {
  Material,
  MaterialSummary,
  Persona,
  Session,
} from "./types";
import {
  createDemoSession,
  demoMaterial,
  demoPersonas,
} from "./demo";
import {
  loadActiveSession,
  loadLocalArchive,
  saveActiveSession,
  saveStudyRecord,
} from "./storage";
import { loadCloudArchive, saveRecordToCloud } from "./cloud";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
const REQUEST_TIMEOUT_MS = 12_000;
const UPLOAD_TIMEOUT_MS = 45_000;

async function request<T>(path: string, init?: RequestInit, timeoutMs?: number): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const controller = new AbortController();
  const signal = controller.signal;

  const pending = fetch(url, {
    ...init,
    signal,
  });

  const ms = timeoutMs ?? REQUEST_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), ms);

  let response: Response;
  try {
    response = await pending;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let detail = `请求失败（${response.status}）`;
    try {
      const payload = (await response.json()) as { detail?: string };
      detail = payload.detail || detail;
    } catch {
      // Keep the HTTP fallback message.
    }
    throw new ApiError(detail, response.status);
  }

  return (await response.json()) as T;
}

let useDemo =
  import.meta.env.VITE_DEMO_MODE === "true" ||
  window.location.protocol === "file:";
let latestDemoSession: Session | undefined = loadActiveSession();

let degraded = false;

export function isDemo(): boolean {
  return useDemo;
}

export function isDegraded(): boolean {
  return degraded;
}

// ── Local keyword-based scoring (same logic as evaluate_senet in backend) ──
function _has(text: string, ...terms: string[]) {
  return terms.some((t) => text.toLowerCase().includes(t.toLowerCase()));
}
function _verdict(score: number, max: number): "掌握" | "部分掌握" | "需要回看" {
  const r = score / max;
  return r >= 0.75 ? "掌握" : r >= 0.4 ? "部分掌握" : "需要回看";
}

function scoreLocal(
  answers: Array<{ question_id: string; response: string }>,
  retelling: string,
): Session {
  const base = latestDemoSession || createDemoSession("huangfeng");
  const qResults: Array<{
    question_id: string; verdict: "掌握" | "部分掌握" | "需要回看"; score: number; max_score: number;
    misconception_tags: string[]; feedback: string;
    source?: { label: string; detail?: string };
  }> = [];
  let total = 0;
  const maxQ = 11;

  for (const a of answers) {
    const t = a.response;
    if (a.question_id === "q1") {
      let s = 0; const tags: string[] = [];
      if (_has(t, "全局", "global", "整体", "摘要", "概括")) s++;
      if (_has(t, "空间", "位置", "分布", "丢失", "失去")) s++;
      if (_has(t, "通道", "channel", "C")) s++;
      if (t.length >= 30) s++;
      if (s < 3 && !_has(t, "空间")) tags.push("遗漏空间压缩影响");
      qResults.push({ question_id: "q1", verdict: _verdict(s, 4), score: s, max_score: 4,
        misconception_tags: tags, feedback: "已根据关键词评估。原文见 PDF 第 3 页公式（2）。",
        source: s < 3 ? { label: "PDF 第 3 页", detail: "公式（2）" } : undefined });
      total += s;
    } else if (a.question_id === "q2") {
      let s = 0; const tags: string[] = [];
      if (/1\s*[×xX*]\s*1\s*[×xX*]\s*256/.test(t.replace(/\s/g, ""))) s++;
      if (_has(t, "16", "C/r", "C/16")) s++;
      if (_has(t, "32", "H×W×C")) s++;
      if (_has(t, "sigmoid", "σ", "激活")) s++;
      if (!_has(t, "16") && !_has(t, "C/r")) tags.push("未写出瓶颈维度");
      qResults.push({ question_id: "q2", verdict: _verdict(s, 4), score: s, max_score: 4,
        misconception_tags: tags, feedback: "检查各阶段形状变化。",
        source: s < 3 ? { label: "PDF 第 3—4 页", detail: "公式（3）、（4）" } : undefined });
      total += s;
    } else if (a.question_id === "q3") {
      let s = 0; const tags: string[] = [];
      if (_has(t, "B", "SE(residual", "non-identity", "残差分支")) s += 2;
      else if (_has(t, "A")) { s++; tags.push("SE 应作用于 residual 分支"); }
      if (_has(t, "identity", "恒等", "shortcut", "相加", "之后", "before")) s++;
      if (s < 2) tags.push("未区分 identity 与 residual 分支");
      qResults.push({ question_id: "q3", verdict: _verdict(s, 3), score: s, max_score: 3,
        misconception_tags: tags, feedback: "正确答案 B。SE 在 non-identity branch，相加之前。",
        source: s < 2 ? { label: "PDF 第 4 页", detail: "Figure 3" } : undefined });
      total += s;
    }
  }

  // retelling
  let rs = 0; const rt: string[] = [];
  if (retelling.length >= 20) rs++; else rt.push("复述过短");
  if (_has(retelling, "squeeze", "压缩", "全局", "池化")) rs++;
  if (_has(retelling, "excitation", "门控", "sigmoid", "权重", "激励")) rs++;
  if (_has(retelling, "scale", "缩放", "重标定", "乘")) rs++;
  if (_has(retelling, "residual", "残差", "identity", "相加", "分支")) rs++;
  if (rs < 3) rt.push("遗漏关键步骤");

  const mastery = Math.round((total + rs) / (maxQ + 5) * 100);
  const headline = mastery >= 80 ? "回答准确，对 SE 理解扎实。" :
    mastery >= 60 ? "核心概念有印象，细节可以更准。" : "需要回看原文重点章节。";

  const completed: Session = {
    ...base,
    status: "completed",
    completed_at: new Date().toISOString(),
    result: {
      total_score: total,
      max_score: maxQ,
      mastery,
      headline,
      summary: "",
      question_results: qResults.map((q) => ({ ...q, source: q.source || { label: "SENet 论文" } })),
      retelling: { score: rs, max_score: 5, feedback: rs >= 3 ? "复述覆盖了关键步骤。" : "复述有遗漏，建议再看一遍原文结构。" },
      misconception_tags: [...new Set([...qResults.flatMap((q) => q.misconception_tags), ...rt])],
      review_sources: [],
      next_step: mastery < 60 ? "回看 Figure 3，从 residual 分支位置开始。" : "继续巩固。",
      evaluator: "rules",
    },
  };

  latestDemoSession = completed;
  return completed;
}

async function withDemo<T>(live: () => Promise<T>, fallback: () => T | Promise<T>) {
  if (useDemo) return fallback();
  try {
    return await live();
  } catch {
    return fallback();
  }
}

export const api = {
  personas: () =>
    withDemo(() => request<Persona[]>("/personas"), () => demoPersonas),
  materials: () =>
    withDemo(
      () => request<MaterialSummary[]>("/materials"),
      () => [demoMaterial],
    ),
  material: (id: string) =>
    withDemo(
      () => request<Material>(`/materials/${id}`),
      () =>
        id === "senet-cvpr-2018"
          ? { ...demoMaterial, id }
          : {
              ...demoMaterial,
              id,
              title: "材料需要后端支持",
              subtitle: "该材料需通过 AI 解析生成内容，当前为演示模式。请在后端已启动的环境中打开。",
              learning_goals: ["请在后端环境中重新上传此材料。"],
              map: [],
              sections: [],
            },
    ),
  archive: async () =>
    (await loadCloudArchive()) ?? loadLocalArchive(),
  createSession: (materialId: string, personaId: string, questions?: Array<{ id: string; prompt: string; answer_guide?: string; max_score?: number }>) =>
    withDemo(
      () =>
        request<Session>("/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            material_id: materialId,
            persona_id: personaId,
            questions: questions || null,
          }),
        }),
      () => {
        latestDemoSession = createDemoSession(personaId);
        saveActiveSession(latestDemoSession);
        return latestDemoSession;
      },
    ),
  evaluate: (
    sessionId: string,
    answers: Array<{ question_id: string; response: string }>,
    retelling: string,
  ) =>
    withDemo(
      () =>
        request<Session>(`/sessions/${sessionId}/evaluate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers, retelling }),
        }),
      async () => {
        const persona =
          demoPersonas.find((item) => item.id === latestDemoSession?.persona_id) ||
          demoPersonas[0];
        const completed = scoreLocal(answers, retelling);
        const record = {
          session: completed,
          archive: {
            session_id: completed.id,
            material_id: completed.material_id,
            material_title: demoMaterial.title,
            persona_name: persona.name,
            completed_at: completed.completed_at || new Date().toISOString(),
            mastery: completed.result?.mastery || 0,
            headline: completed.result?.headline || "本次学习已完成",
            misconception_tags: completed.result?.misconception_tags || [],
            retelling,
          },
          answers,
          retelling,
          savedAt: new Date().toISOString(),
        };
        saveStudyRecord(record);
        saveRecordToCloud(record).catch((reason: unknown) => {
          console.error("云端记录保存失败，本地已保存：", reason);
        });
        return completed;
      },
    ),
  upload: async (file: File) => {
    if (useDemo) {
      throw new Error("演示模式下无法上传新材料，请在后端已启动的环境中打开。");
    }
    const form = new FormData();
    form.append("file", file);
    return request<Material>("/materials/upload", {
      method: "POST",
      body: form,
    }, UPLOAD_TIMEOUT_MS);
  },
  deleteMaterial: (id: string) =>
    request<{ deleted: string }>(`/materials/${id}`, { method: "DELETE" }),
};
