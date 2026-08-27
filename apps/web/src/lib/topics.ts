export const TOPICS_SCHEMA_VERSION = 1 as const;
export const TOPICS_PREFIX = "wenqu-topics-v1";
export const ANONYMOUS_TOPIC_OWNER = "anonymous";
export const MAX_TOPICS_PER_OWNER = 50;
export const MAX_TOPIC_NAME_LENGTH = 60;
export const MAX_TOPIC_DESCRIPTION_LENGTH = 300;
export const MAX_TOPIC_MATERIALS = 200;
export const MAX_MATERIAL_ID_LENGTH = 200;

export type Topic = {
  schema_version: typeof TOPICS_SCHEMA_VERSION;
  id: string;
  owner_id: string;
  name: string;
  description?: string;
  color?: string;
  material_ids: string[];
  created_at: string;
  updated_at: string;
};

export type TopicMaterialSnapshot = {
  id: string;
};

export type TopicInput = Pick<Topic, "name" | "description" | "color">;

export type TopicUpdate = {
  name?: string;
  description?: string | null;
  color?: string | null;
};

export type StorageAdapter = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

type TopicEnvelope = {
  schema_version: typeof TOPICS_SCHEMA_VERSION;
  owner_id: string;
  topics: Topic[];
};

type MutationOptions = { now?: () => string; createId?: () => string };

function ownerNamespace(ownerId?: string | null): string {
  const value = ownerId?.trim();
  return value || ANONYMOUS_TOPIC_OWNER;
}

export function topicsKey(ownerId?: string | null): string {
  return `${TOPICS_PREFIX}:${encodeURIComponent(ownerNamespace(ownerId))}`;
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

function safeColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : undefined;
}

function safeMaterialIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.trim().length === 0) continue;
    if (item.length > MAX_MATERIAL_ID_LENGTH || seen.has(item)) continue;
    seen.add(item);
    ids.push(item);
    if (ids.length >= MAX_TOPIC_MATERIALS) break;
  }
  return ids;
}

function isStoredTopic(value: unknown, ownerId: string): value is Topic {
  if (!value || typeof value !== "object") return false;
  const topic = value as Record<string, unknown>;
  return topic.schema_version === TOPICS_SCHEMA_VERSION &&
    topic.owner_id === ownerId && typeof topic.id === "string" &&
    typeof topic.name === "string" && topic.name.trim().length > 0 &&
    topic.name.length <= MAX_TOPIC_NAME_LENGTH &&
    (topic.description === undefined || typeof topic.description === "string") &&
    (topic.color === undefined || safeColor(topic.color) !== undefined) &&
    Array.isArray(topic.material_ids) &&
    typeof topic.created_at === "string" && typeof topic.updated_at === "string";
}

function whitelistStoredTopic(topic: Topic): Topic {
  return {
    schema_version: TOPICS_SCHEMA_VERSION,
    id: topic.id,
    owner_id: topic.owner_id,
    name: topic.name,
    description: optionalText(topic.description, MAX_TOPIC_DESCRIPTION_LENGTH),
    color: safeColor(topic.color),
    material_ids: safeMaterialIds(topic.material_ids),
    created_at: topic.created_at,
    updated_at: topic.updated_at,
  };
}

export function loadTopics(storage: StorageAdapter, ownerId?: string | null): Topic[] {
  const owner = ownerNamespace(ownerId);
  try {
    const raw = storage.getItem(topicsKey(owner));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<TopicEnvelope>;
    if (parsed.schema_version !== TOPICS_SCHEMA_VERSION ||
        parsed.owner_id !== owner || !Array.isArray(parsed.topics)) return [];
    return parsed.topics.filter((topic) => isStoredTopic(topic, owner))
      .map((topic) => whitelistStoredTopic(topic));
  } catch {
    return [];
  }
}

function saveTopics(storage: StorageAdapter, ownerId: string, topics: Topic[]): void {
  const payload: TopicEnvelope = {
    schema_version: TOPICS_SCHEMA_VERSION,
    owner_id: ownerId,
    topics,
  };
  storage.setItem(topicsKey(ownerId), JSON.stringify(payload));
}

function defaultId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `topic-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createTopic(
  storage: StorageAdapter,
  ownerId: string | null | undefined,
  input: TopicInput,
  options: MutationOptions = {},
): Topic {
  const owner = ownerNamespace(ownerId);
  const topics = loadTopics(storage, owner);
  if (topics.length >= MAX_TOPICS_PER_OWNER) throw new Error("topic limit reached");
  const timestamp = (options.now ?? (() => new Date().toISOString()))();
  const topic: Topic = {
    schema_version: TOPICS_SCHEMA_VERSION,
    id: (options.createId ?? defaultId)(),
    owner_id: owner,
    name: requiredText(input.name, "name", MAX_TOPIC_NAME_LENGTH),
    description: optionalText(input.description, MAX_TOPIC_DESCRIPTION_LENGTH),
    color: safeColor(input.color),
    material_ids: [],
    created_at: timestamp,
    updated_at: timestamp,
  };
  if (topics.some((item) => item.id === topic.id)) throw new Error("duplicate topic id");
  saveTopics(storage, owner, [topic, ...topics]);
  return topic;
}

export function updateTopic(
  storage: StorageAdapter,
  ownerId: string | null | undefined,
  topicId: string,
  update: TopicUpdate,
  options: MutationOptions = {},
): Topic | null {
  const owner = ownerNamespace(ownerId);
  const topics = loadTopics(storage, owner);
  const current = topics.find((topic) => topic.id === topicId);
  if (!current) return null;
  const next: Topic = {
    ...current,
    name: update.name === undefined ? current.name : requiredText(update.name, "name", MAX_TOPIC_NAME_LENGTH),
    description: update.description === undefined ? current.description : optionalText(update.description, MAX_TOPIC_DESCRIPTION_LENGTH),
    color: update.color === undefined ? current.color : safeColor(update.color),
    updated_at: (options.now ?? (() => new Date().toISOString()))(),
  };
  saveTopics(storage, owner, topics.map((item) => item.id === topicId ? next : item));
  return next;
}

export function deleteTopic(
  storage: StorageAdapter,
  ownerId: string | null | undefined,
  topicId: string,
): boolean {
  const owner = ownerNamespace(ownerId);
  const topics = loadTopics(storage, owner);
  const remaining = topics.filter((topic) => topic.id !== topicId);
  if (remaining.length === topics.length) return false;
  saveTopics(storage, owner, remaining);
  return true;
}

export function addMaterialToTopic(
  storage: StorageAdapter,
  ownerId: string | null | undefined,
  topicId: string,
  materialId: string,
  options: MutationOptions = {},
): Topic | null {
  const owner = ownerNamespace(ownerId);
  const topics = loadTopics(storage, owner);
  const current = topics.find((topic) => topic.id === topicId);
  if (!current) return null;
  const nextMaterialId = requiredText(materialId, "material_id", MAX_MATERIAL_ID_LENGTH);
  if (current.material_ids.includes(nextMaterialId)) return current;
  if (current.material_ids.length >= MAX_TOPIC_MATERIALS) throw new Error("topic material limit reached");
  const next: Topic = {
    ...current,
    material_ids: [...current.material_ids, nextMaterialId],
    updated_at: (options.now ?? (() => new Date().toISOString()))(),
  };
  saveTopics(storage, owner, topics.map((item) => item.id === topicId ? next : item));
  return next;
}

export function removeMaterialFromTopic(
  storage: StorageAdapter,
  ownerId: string | null | undefined,
  topicId: string,
  materialId: string,
  options: MutationOptions = {},
): Topic | null {
  const owner = ownerNamespace(ownerId);
  const topics = loadTopics(storage, owner);
  const current = topics.find((topic) => topic.id === topicId);
  if (!current) return null;
  if (!current.material_ids.includes(materialId)) return current;
  const next: Topic = {
    ...current,
    material_ids: current.material_ids.filter((item) => item !== materialId),
    updated_at: (options.now ?? (() => new Date().toISOString()))(),
  };
  saveTopics(storage, owner, topics.map((item) => item.id === topicId ? next : item));
  return next;
}

export type TopicMaterialStatus = "available" | "missing_material";

export function topicMaterialStatus(
  materialId: string,
  materials: readonly TopicMaterialSnapshot[],
): TopicMaterialStatus {
  return materials.some((item) => item.id === materialId) ? "available" : "missing_material";
}
