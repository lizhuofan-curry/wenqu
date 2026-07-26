import type {
  ArchiveItem,
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

type ApiErrorPayload = {
  detail?: string;
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    let detail = `请求失败（${response.status}）`;
    try {
      const payload = (await response.json()) as ApiErrorPayload;
      detail = payload.detail || detail;
    } catch {
      // Keep the HTTP fallback message.
    }
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

let useDemo =
  import.meta.env.VITE_DEMO_MODE === "true" ||
  (import.meta.env.PROD && import.meta.env.VITE_DEMO_MODE !== "false") ||
  window.location.protocol === "file:";
let latestDemoSession: Session | undefined = loadActiveSession();

async function withDemo<T>(live: () => Promise<T>, fallback: () => T | Promise<T>) {
  if (useDemo) return fallback();
  try {
    return await live();
  } catch (error) {
    if (error instanceof TypeError) {
      useDemo = true;
      return fallback();
    }
    throw error;
  }
}

export const api = {
  personas: () =>
    withDemo(() => request<Persona[]>("/api/personas"), () => demoPersonas),
  materials: () =>
    withDemo(
      () => request<MaterialSummary[]>("/api/materials"),
      () => [demoMaterial],
    ),
  material: (id: string) =>
    withDemo(
      () => request<Material>(`/api/materials/${id}`),
      () => ({ ...demoMaterial, id }),
    ),
  archive: () =>
    withDemo(
      () => request<ArchiveItem[]>("/api/archive"),
      () => loadLocalArchive(),
    ),
  createSession: (materialId: string, personaId: string) =>
    withDemo(
      () =>
        request<Session>("/api/sessions", {
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
        request<Session>(`/api/sessions/${sessionId}/evaluate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers, retelling }),
        }),
      () => {
        const base = latestDemoSession || createDemoSession("huangfeng");
        latestDemoSession = evaluateDemoSession(base);
        const persona =
          demoPersonas.find((item) => item.id === latestDemoSession?.persona_id) ||
          demoPersonas[0];
        saveStudyRecord({
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
        });
        return latestDemoSession;
      },
    ),
  upload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return withDemo(
      () =>
        request<Material>("/api/materials/upload", {
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
