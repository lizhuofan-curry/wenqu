import type { ArchiveItem, Session } from "./types";

const PROFILE_KEY = "wenqu-demo-profile-v1";
const LEGACY_USER_KEY = "wenqu-demo-user";
const ACTIVE_SESSION_KEY = "wenqu-demo-active-session-v1";
const RECORDS_KEY = "wenqu-demo-study-records-v1";

export type LocalProfile = {
  displayName: string;
  email: string;
  createdAt: string;
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
  localStorage.setItem(LEGACY_USER_KEY, profile.displayName);
}

export function loadActiveSession(): Session | undefined {
  return readJson<Session | undefined>(ACTIVE_SESSION_KEY, undefined);
}

export function saveActiveSession(session: Session) {
  localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
}

export function loadStudyRecords(): LocalStudyRecord[] {
  return readJson<LocalStudyRecord[]>(RECORDS_KEY, []);
}

export function loadLocalArchive(): ArchiveItem[] {
  return loadStudyRecords()
    .map((record) => record.archive)
    .sort((a, b) => b.completed_at.localeCompare(a.completed_at));
}

export function saveStudyRecord(record: LocalStudyRecord) {
  const records = loadStudyRecords().filter(
    (item) => item.session.id !== record.session.id,
  );
  records.unshift(record);
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  localStorage.removeItem(ACTIVE_SESSION_KEY);
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
