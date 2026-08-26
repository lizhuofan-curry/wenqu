import type {
  DiagnosticAttempt,
  DiagnosticAnswer,
  Material,
  MaterialSummary,
  Persona,
  Session,
  TransferAttemptResult,
  TransferTask,
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
} from "./storage";
import { getCloudAccessToken, loadCloudArchive } from "./cloud";

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
  const headers = new Headers(init?.headers);
  const accessToken = await getCloudAccessToken().catch(() => null);
  if (accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const pending = fetch(url, {
    ...init,
    headers,
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
    const value = await live();
    degraded = false;
    return value;
  } catch (error) {
    degraded = true;
    if (error instanceof ApiError) throw error;
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
  prepareDiagnostic: (
    materialId: string,
    expectedUserId: string,
    clientRequestId: string,
  ) =>
    request<DiagnosticAttempt>("/diagnostics/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        material_id: materialId,
        expected_user_id: expectedUserId,
        client_request_id: clientRequestId,
      }),
    }),
  diagnostic: (id: string) =>
    request<DiagnosticAttempt>(`/diagnostics/${encodeURIComponent(id)}`),
  evaluateDiagnostic: (
    id: string,
    expectedUserId: string,
    answers: DiagnosticAnswer[],
  ) =>
    request<DiagnosticAttempt>(`/diagnostics/${encodeURIComponent(id)}/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expected_user_id: expectedUserId, answers }),
    }),
  archive: async () =>
    (await loadCloudArchive()) ?? loadLocalArchive(),
  retryArchive: (retryToken: string, expectedUserId: string) =>
    request<{ cloud_saved: true; session_id: string }>("/archive/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        retry_token: retryToken,
        expected_user_id: expectedUserId,
      }),
    }),
  prepareTransfer: (sourceSessionId: string, expectedUserId: string) =>
    request<TransferTask>("/transfer-tasks/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_session_id: sourceSessionId,
        expected_user_id: expectedUserId,
      }),
    }),
  evaluateTransfer: (
    taskId: string,
    sourceSessionId: string,
    answer: string,
    expectedUserId: string,
  ) =>
    request<TransferAttemptResult>(
      `/transfer-tasks/${encodeURIComponent(taskId)}/evaluate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_session_id: sourceSessionId,
          answer,
          expected_user_id: expectedUserId,
        }),
      },
      UPLOAD_TIMEOUT_MS,
    ),
  createSession: async (materialId: string, personaId: string, questions?: Array<{ id: string; prompt: string }>) => {
    const fallback = () => {
      latestDemoSession = createDemoSession(personaId);
      saveActiveSession(latestDemoSession);
      return latestDemoSession;
    };
    if (useDemo) return fallback();
    try {
      const session = await request<Session>("/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ material_id: materialId, persona_id: personaId, questions: questions || null }),
      });
      degraded = false;
      return session;
    } catch (error) {
      degraded = true;
      if (error instanceof ApiError && error.status < 500) throw error;
      // A local SENet copy is still evidence-backed.  An uploaded material is
      // user data, so it must fail visibly rather than borrow SENet's session.
      if (materialId !== "senet-cvpr-2018") throw error;
      return fallback();
    }
  },
  evaluate: async (
    sessionId: string,
    answers: Array<{ question_id: string; response: string }>,
    retelling: string,
    materialId: string,
    personaId: string,
    questions: Array<{ id: string; prompt: string }>,
    expectedUserId: string | null,
    review?: { source_session_id: string; interval_days: 1 | 3 | 7 } | null,
  ) => {
    const fallback = async () => {
      const completed = scoreLocal(answers, retelling);
      return completed;
    };
    if (useDemo) return fallback();
    try {
      const completed = await request<Session>(`/sessions/${sessionId}/evaluate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answers,
            retelling,
            material_id: materialId,
            persona_id: personaId,
            questions,
            expected_user_id: expectedUserId,
            review_source_session_id: review?.source_session_id,
            review_interval_days: review?.interval_days,
          }),
      });
      degraded = false;
      return completed;
    } catch (error) {
      degraded = true;
      if (error instanceof ApiError && error.status < 500) throw error;
      if (materialId !== "senet-cvpr-2018") throw error;
      return fallback();
    }
  },
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
  regenerateMaterial: (id: string) =>
    request<Material>(`/materials/${id}/regenerate`, { method: "POST" }, 40_000),
};
