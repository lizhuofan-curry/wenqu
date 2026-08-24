import type { ArchiveItem, Session } from "./types";

const PROFILE_KEY = "wenqu-demo-profile-v1";
const LEGACY_USER_KEY = "wenqu-demo-user";
const LEGACY_ACTIVE_SESSION_KEY = "wenqu-demo-active-session-v1";
const LEGACY_RECORDS_KEY = "wenqu-demo-study-records-v1";
const ACTIVE_SESSION_PREFIX = "wenqu-active-session-v2";
const RECORDS_PREFIX = "wenqu-study-records-v2";
const LEGACY_MIGRATION_KEY = "wenqu-storage-v2-legacy-migrated";
const ANONYMOUS_NAMESPACE = "anonymous";

export type LocalProfile = {
  displayName: string;
  email: string;
  createdAt: string;
  userId?: string;
};

export type LocalStudyRecord = {
  session: Session;
  archive: ArchiveItem;
  answers: Array<{ question_id: string; response: string }>;
  retelling: string;
  savedAt: string;
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function currentNamespace() {
  return readJson<LocalProfile | null>(PROFILE_KEY, null)?.userId || ANONYMOUS_NAMESPACE;
}

function namespacedKey(prefix: string, namespace = currentNamespace()) {
  return `${prefix}:${encodeURIComponent(namespace)}`;
}

function migrateLegacyAnonymousData() {
  if (localStorage.getItem(LEGACY_MIGRATION_KEY)) return;

  const anonymousRecordsKey = namespacedKey(RECORDS_PREFIX, ANONYMOUS_NAMESPACE);
  const anonymousSessionKey = namespacedKey(ACTIVE_SESSION_PREFIX, ANONYMOUS_NAMESPACE);
  const legacyRecords = localStorage.getItem(LEGACY_RECORDS_KEY);
  const legacySession = localStorage.getItem(LEGACY_ACTIVE_SESSION_KEY);

  if (legacyRecords && !localStorage.getItem(anonymousRecordsKey)) {
    localStorage.setItem(anonymousRecordsKey, legacyRecords);
  }
  if (legacySession && !localStorage.getItem(anonymousSessionKey)) {
    localStorage.setItem(anonymousSessionKey, legacySession);
  }

  localStorage.removeItem(LEGACY_RECORDS_KEY);
  localStorage.removeItem(LEGACY_ACTIVE_SESSION_KEY);
  localStorage.setItem(LEGACY_MIGRATION_KEY, new Date().toISOString());
}

export function loadProfile(): LocalProfile | null {
  const profile = readJson<LocalProfile | null>(PROFILE_KEY, null);
  if (profile) return profile;

  const legacyName = localStorage.getItem(LEGACY_USER_KEY);
  return legacyName
    ? { displayName: legacyName, email: "", createdAt: new Date().toISOString() }
    : null;
}

export function saveProfile(profile: LocalProfile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  localStorage.removeItem(LEGACY_USER_KEY);
}

export function clearProfileAndActiveSession() {
  const namespace = currentNamespace();
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem(LEGACY_USER_KEY);
  localStorage.removeItem(namespacedKey(ACTIVE_SESSION_PREFIX, namespace));
}

export function loadActiveSession(): Session | undefined {
  migrateLegacyAnonymousData();
  return readJson<Session | undefined>(
    namespacedKey(ACTIVE_SESSION_PREFIX),
    undefined,
  );
}

export function saveActiveSession(session: Session) {
  migrateLegacyAnonymousData();
  localStorage.setItem(
    namespacedKey(ACTIVE_SESSION_PREFIX),
    JSON.stringify(session),
  );
}

export function loadStudyRecords(): LocalStudyRecord[] {
  migrateLegacyAnonymousData();
  return readJson<LocalStudyRecord[]>(namespacedKey(RECORDS_PREFIX), []);
}

export function loadLocalArchive(): ArchiveItem[] {
  return loadStudyRecords()
    .map((record) => ({
      ...record.archive,
      answers: record.answers,
      review: record.session.review,
    }))
    .sort((a, b) => b.completed_at.localeCompare(a.completed_at));
}

export function saveStudyRecord(record: LocalStudyRecord) {
  const records = loadStudyRecords().filter(
    (item) => item.session.id !== record.session.id,
  );
  records.unshift(record);
  localStorage.setItem(namespacedKey(RECORDS_PREFIX), JSON.stringify(records));
  localStorage.removeItem(namespacedKey(ACTIVE_SESSION_PREFIX));
}

export function exportLocalData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    storage: "browser-localStorage",
    profile: loadProfile(),
    records: loadStudyRecords(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `wenqu-study-data-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
