export const EVIDENCE_NOTES_SCHEMA_VERSION = 1 as const;
export const EVIDENCE_NOTES_PREFIX = "wenqu-evidence-note-cards-v1";
export const ANONYMOUS_EVIDENCE_OWNER = "anonymous";
export const MAX_EVIDENCE_NOTES_PER_OWNER = 200;
export const MAX_EVIDENCE_NOTE_LENGTH = 2_000;
export const MAX_EVIDENCE_SOURCE_EXCERPT_LENGTH = 1_000;

export type EvidenceNoteContentKind = "learner_statement" | "question_or_hypothesis";
export type EvidenceNoteStatus = "not_applicable" | "pending";

export type EvidenceSourceSnapshot = {
  label: string;
  detail?: string;
  excerpt?: string;
  locator?: string;
  material_revision?: string;
};

export type EvidenceNoteCard = {
  schema_version: typeof EVIDENCE_NOTES_SCHEMA_VERSION;
  id: string;
  owner_id: string;
  material_id: string;
  material_title: string;
  material_revision?: string;
  section_id: string;
  section_title: string;
  content_kind: EvidenceNoteContentKind;
  status: EvidenceNoteStatus;
  content: string;
  source?: EvidenceSourceSnapshot;
  created_at: string;
  updated_at: string;
};

export type EvidenceMaterialSnapshot = {
  id: string;
  revision?: string;
  sectionIds?: readonly string[];
};

export type EvidenceNoteInput = Pick<EvidenceNoteCard,
  "material_id" | "material_title" | "material_revision" | "section_id" |
  "section_title" | "content_kind" | "content" | "source"
>;

export type EvidenceNoteUpdate = {
  content?: string;
  content_kind?: EvidenceNoteContentKind;
  source?: EvidenceSourceSnapshot | null;
};

export type StorageAdapter = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

type EvidenceNoteEnvelope = {
  schema_version: typeof EVIDENCE_NOTES_SCHEMA_VERSION;
  owner_id: string;
  notes: EvidenceNoteCard[];
};

type MutationOptions = { now?: () => string; createId?: () => string };

function ownerNamespace(ownerId?: string | null): string {
  const value = ownerId?.trim();
  return value || ANONYMOUS_EVIDENCE_OWNER;
}

export function evidenceNotesKey(ownerId?: string | null): string {
  return `${EVIDENCE_NOTES_PREFIX}:${encodeURIComponent(ownerNamespace(ownerId))}`;
}

function isContentKind(value: unknown): value is EvidenceNoteContentKind {
  return value === "learner_statement" || value === "question_or_hypothesis";
}

function statusFor(kind: EvidenceNoteContentKind): EvidenceNoteStatus {
  return kind === "question_or_hypothesis" ? "pending" : "not_applicable";
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} is required`);
  if (value.length > maxLength) throw new Error(`${field} is too long`);
  return value;
}

function optionalText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  return value.slice(0, maxLength);
}

function safeSource(value: unknown): EvidenceSourceSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const label = optionalText(source.label, 200);
  if (!label) return undefined;
  return {
    label,
    detail: optionalText(source.detail, 500),
    excerpt: optionalText(source.excerpt, MAX_EVIDENCE_SOURCE_EXCERPT_LENGTH),
    locator: optionalText(source.locator, 500),
    material_revision: optionalText(source.material_revision, 200),
  };
}

function isStoredNote(value: unknown, ownerId: string): value is EvidenceNoteCard {
  if (!value || typeof value !== "object") return false;
  const note = value as Record<string, unknown>;
  return note.schema_version === EVIDENCE_NOTES_SCHEMA_VERSION &&
    note.owner_id === ownerId && typeof note.id === "string" &&
    typeof note.material_id === "string" && typeof note.material_title === "string" &&
    typeof note.section_id === "string" && typeof note.section_title === "string" &&
    isContentKind(note.content_kind) && note.status === statusFor(note.content_kind) &&
    typeof note.content === "string" && note.content.trim().length > 0 &&
    note.content.length <= MAX_EVIDENCE_NOTE_LENGTH &&
    typeof note.created_at === "string" && typeof note.updated_at === "string" &&
    (note.source === undefined || safeSource(note.source) !== undefined);
}

function whitelistStoredNote(note: EvidenceNoteCard): EvidenceNoteCard {
  return {
    schema_version: EVIDENCE_NOTES_SCHEMA_VERSION,
    id: note.id,
    owner_id: note.owner_id,
    material_id: note.material_id,
    material_title: note.material_title,
    material_revision: optionalText(note.material_revision, 200),
    section_id: note.section_id,
    section_title: note.section_title,
    content_kind: note.content_kind,
    status: statusFor(note.content_kind),
    content: note.content,
    source: safeSource(note.source),
    created_at: note.created_at,
    updated_at: note.updated_at,
  };
}

export function loadEvidenceNotes(storage: StorageAdapter, ownerId?: string | null): EvidenceNoteCard[] {
  const owner = ownerNamespace(ownerId);
  try {
    const raw = storage.getItem(evidenceNotesKey(owner));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<EvidenceNoteEnvelope>;
    if (parsed.schema_version !== EVIDENCE_NOTES_SCHEMA_VERSION ||
        parsed.owner_id !== owner || !Array.isArray(parsed.notes)) return [];
    return parsed.notes.filter((note) => isStoredNote(note, owner))
      .map((note) => whitelistStoredNote(note));
  } catch {
    return [];
  }
}

function saveEvidenceNotes(storage: StorageAdapter, ownerId: string, notes: EvidenceNoteCard[]): void {
  const payload: EvidenceNoteEnvelope = {
    schema_version: EVIDENCE_NOTES_SCHEMA_VERSION,
    owner_id: ownerId,
    notes,
  };
  storage.setItem(evidenceNotesKey(ownerId), JSON.stringify(payload));
}

function defaultId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `note-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createEvidenceNote(
  storage: StorageAdapter,
  ownerId: string | null | undefined,
  input: EvidenceNoteInput,
  options: MutationOptions = {},
): EvidenceNoteCard {
  const owner = ownerNamespace(ownerId);
  const notes = loadEvidenceNotes(storage, owner);
  if (notes.length >= MAX_EVIDENCE_NOTES_PER_OWNER) throw new Error("evidence note limit reached");
  if (!isContentKind(input.content_kind)) throw new Error("invalid content kind");
  const timestamp = (options.now ?? (() => new Date().toISOString()))();
  const note: EvidenceNoteCard = {
    schema_version: EVIDENCE_NOTES_SCHEMA_VERSION,
    id: (options.createId ?? defaultId)(),
    owner_id: owner,
    material_id: requiredText(input.material_id, "material_id", 200),
    material_title: requiredText(input.material_title, "material_title", 300),
    material_revision: optionalText(input.material_revision, 200),
    section_id: requiredText(input.section_id, "section_id", 200),
    section_title: requiredText(input.section_title, "section_title", 300),
    content_kind: input.content_kind,
    status: statusFor(input.content_kind),
    content: requiredText(input.content, "content", MAX_EVIDENCE_NOTE_LENGTH),
    source: safeSource(input.source),
    created_at: timestamp,
    updated_at: timestamp,
  };
  if (notes.some((item) => item.id === note.id)) throw new Error("duplicate evidence note id");
  saveEvidenceNotes(storage, owner, [note, ...notes]);
  return note;
}

export function updateEvidenceNote(
  storage: StorageAdapter,
  ownerId: string | null | undefined,
  noteId: string,
  update: EvidenceNoteUpdate,
  options: MutationOptions = {},
): EvidenceNoteCard | null {
  const owner = ownerNamespace(ownerId);
  const notes = loadEvidenceNotes(storage, owner);
  const current = notes.find((note) => note.id === noteId);
  if (!current) return null;
  const kind = update.content_kind ?? current.content_kind;
  if (!isContentKind(kind)) throw new Error("invalid content kind");
  const next: EvidenceNoteCard = {
    ...current,
    content_kind: kind,
    status: statusFor(kind),
    content: update.content === undefined ? current.content : requiredText(update.content, "content", MAX_EVIDENCE_NOTE_LENGTH),
    source: update.source === undefined ? current.source : update.source === null ? undefined : safeSource(update.source),
    updated_at: (options.now ?? (() => new Date().toISOString()))(),
  };
  saveEvidenceNotes(storage, owner, notes.map((item) => item.id === noteId ? next : item));
  return next;
}

export function deleteEvidenceNote(
  storage: StorageAdapter,
  ownerId: string | null | undefined,
  noteId: string,
): boolean {
  const owner = ownerNamespace(ownerId);
  const notes = loadEvidenceNotes(storage, owner);
  const remaining = notes.filter((note) => note.id !== noteId);
  if (remaining.length === notes.length) return false;
  saveEvidenceNotes(storage, owner, remaining);
  return true;
}

export type EvidenceNoteLocationStatus = "available" | "missing_material" | "stale_location";

export function evidenceNoteLocationStatus(
  note: EvidenceNoteCard,
  materials: readonly EvidenceMaterialSnapshot[],
): EvidenceNoteLocationStatus {
  const material = materials.find((item) => item.id === note.material_id);
  if (!material) return "missing_material";
  if (material.sectionIds && !material.sectionIds.includes(note.section_id)) return "stale_location";
  if (note.material_revision && material.revision && note.material_revision !== material.revision) {
    return "stale_location";
  }
  return "available";
}

type ExportNote = Omit<EvidenceNoteCard, "owner_id">;

function exportNote(note: EvidenceNoteCard): ExportNote {
  const { owner_id: _ownerId, ...safe } = whitelistStoredNote(note);
  return safe;
}

export function sanitizeEvidenceFilename(value: string): string {
  const cleaned = value.normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ").replace(/[. ]+$/g, "").trim().slice(0, 80);
  return /[\p{L}\p{N}]/u.test(cleaned) ? cleaned : "evidence-notes";
}

export function exportEvidenceNotesJson(
  notes: readonly EvidenceNoteCard[],
  title = "evidence-notes",
  exportedAt = new Date().toISOString(),
): { filename: string; content: string; mimeType: string } {
  return {
    filename: `${sanitizeEvidenceFilename(title)}.json`,
    content: JSON.stringify({
      schema_version: EVIDENCE_NOTES_SCHEMA_VERSION,
      exported_at: exportedAt,
      notes: notes.map(exportNote),
    }, null, 2),
    mimeType: "application/json;charset=utf-8",
  };
}

function markdownText(value: string): string {
  return value.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function exportEvidenceNotesMarkdown(
  notes: readonly EvidenceNoteCard[],
  title = "证据笔记卡",
  exportedAt = new Date().toISOString(),
): { filename: string; content: string; mimeType: string } {
  const lines = [`# ${markdownText(title)}`, "", `导出时间：${exportedAt}`, ""];
  for (const note of notes) {
    lines.push(`## ${markdownText(note.section_title)}`, "", markdownText(note.content), "");
    lines.push(`- 类型：${note.content_kind}`, `- 材料：${markdownText(note.material_title)}`);
    if (note.source) {
      lines.push(`- 来源快照（未认证）：${markdownText(note.source.label)}`);
      if (note.source.detail) lines.push(`- 定位：${markdownText(note.source.detail)}`);
      if (note.source.excerpt) lines.push("", `> ${markdownText(note.source.excerpt).replace(/\n/g, "\n> ")}`);
    }
    lines.push("");
  }
  return {
    filename: `${sanitizeEvidenceFilename(title)}.md`,
    content: lines.join("\n"),
    mimeType: "text/markdown;charset=utf-8",
  };
}
