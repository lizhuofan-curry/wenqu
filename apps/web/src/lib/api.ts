import type {
  ArchiveItem,
  Material,
  MaterialSummary,
  Persona,
  Session,
} from "./types";

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

export const api = {
  personas: () => request<Persona[]>("/api/personas"),
  materials: () => request<MaterialSummary[]>("/api/materials"),
  material: (id: string) => request<Material>(`/api/materials/${id}`),
  archive: () => request<ArchiveItem[]>("/api/archive"),
  createSession: (materialId: string, personaId: string) =>
    request<Session>("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ material_id: materialId, persona_id: personaId }),
    }),
  evaluate: (
    sessionId: string,
    answers: Array<{ question_id: string; response: string }>,
    retelling: string,
  ) =>
    request<Session>(`/api/sessions/${sessionId}/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers, retelling }),
    }),
  upload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Material>("/api/materials/upload", {
      method: "POST",
      body: form,
    });
  },
};

