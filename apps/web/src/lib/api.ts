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
  evaluateDemoSession,
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
const REQUEST_TIMEOUT_MS = 15_000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const controller = new AbortController();
  const signal = controller.signal;

  const pending = fetch(url, {
    ...init,
    signal,
  });

  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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

async function withDemo<T>(live: () => Promise<T>, fallback: () => T | Promise<T>) {
  if (useDemo) return fallback();
  try {
    return await live();
  } catch (error) {
    degraded = true;
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
      () => ({ ...demoMaterial, id }),
    ),
  archive: async () =>
    (await loadCloudArchive()) ?? loadLocalArchive(),
  createSession: (materialId: string, personaId: string) =>
    withDemo(
      () =>
        request<Session>("/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ material_id: materialId, persona_id: personaId }),
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
        const base = latestDemoSession || createDemoSession("huangfeng");
        latestDemoSession = evaluateDemoSession(base);
        const persona =
          demoPersonas.find((item) => item.id === latestDemoSession?.persona_id) ||
          demoPersonas[0];
        const record = {
          session: latestDemoSession,
          archive: {
            session_id: latestDemoSession.id,
            material_id: latestDemoSession.material_id,
            material_title: demoMaterial.title,
            persona_name: persona.name,
            completed_at: latestDemoSession.completed_at || new Date().toISOString(),
            mastery: latestDemoSession.result?.mastery || 0,
            headline: latestDemoSession.result?.headline || "本次学习已完成",
            misconception_tags: latestDemoSession.result?.misconception_tags || [],
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
        return latestDemoSession;
      },
    ),
  upload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return withDemo(
      () =>
        request<Material>("/materials/upload", {
          method: "POST",
          body: form,
        }),
      () => ({
        ...demoMaterial,
        id: `upload-${Date.now()}`,
        title: file.name.replace(/\.(pdf|md|markdown)$/i, ""),
        subtitle: "演示模式已建立材料地图；接入后端后将解析真实内容",
        source_type: "upload",
        created_at: new Date().toISOString(),
      }),
    );
  },
};
