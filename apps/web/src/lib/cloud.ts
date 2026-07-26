import { createClient, type Session as AuthSession } from "@supabase/supabase-js";
import type { ArchiveItem } from "./types";
import {
  loadStudyRecords,
  type LocalProfile,
  type LocalStudyRecord,
} from "./storage";

const supabaseUrl = (
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL
)?.trim();
const supabaseKey = (
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)?.trim();

export const cloudEnabled = Boolean(supabaseUrl && supabaseKey);

const supabase =
  cloudEnabled && supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

type CloudStudyRow = {
  session_id: string;
  material_id: string;
  material_title: string;
  persona_name: string;
  completed_at: string;
  mastery: number;
  headline: string;
  misconception_tags: string[];
  retelling: string;
};

function friendlyAuthError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) {
    return "邮箱或密码不正确，请检查后重试。";
  }
  if (normalized.includes("email not confirmed")) {
    return "请先打开注册邮件完成邮箱确认。";
  }
  if (normalized.includes("user already registered")) {
    return "这个邮箱已经注册，可以直接登录。";
  }
  if (normalized.includes("password")) {
    return "密码不符合安全要求，请至少使用 6 位字符。";
  }
  if (normalized.includes("rate limit")) {
    return "操作过于频繁，请稍后再试。";
  }
  return message;
}

function profileFromSession(session: AuthSession): LocalProfile {
  const metadataName = session.user.user_metadata.display_name;
  const email = session.user.email || "";
  return {
    displayName:
      typeof metadataName === "string" && metadataName.trim()
        ? metadataName.trim()
        : email.split("@")[0] || "问渠学友",
    email,
    createdAt: session.user.created_at,
  };
}

function requireClient() {
  if (!supabase) {
    throw new Error("云端账号尚未配置，请先完成 Supabase 环境配置。");
  }
  return supabase;
}

async function currentUserId() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

export async function getCloudProfile(): Promise<LocalProfile | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session ? profileFromSession(data.session) : null;
}

export function watchCloudAuth(
  callback: (profile: LocalProfile | null) => void,
) {
  if (!supabase) return () => undefined;
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session ? profileFromSession(session) : null);
  });
  return () => subscription.unsubscribe();
}

export async function registerCloudAccount(
  displayName: string,
  email: string,
  password: string,
) {
  const client = requireClient();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: window.location.origin + window.location.pathname,
    },
  });
  if (error) throw new Error(friendlyAuthError(error.message));
  if (!data.session) {
    return {
      profile: null,
      message: "注册邮件已发送，请打开邮箱完成确认后再登录。",
    };
  }
  return {
    profile: profileFromSession(data.session),
    message: "云端账户已创建，学习记录会自动跨设备同步。",
  };
}

export async function loginCloudAccount(email: string, password: string) {
  const client = requireClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw new Error(friendlyAuthError(error.message));
  await syncLocalRecordsToCloud();
  return profileFromSession(data.session);
}

export async function logoutCloudAccount() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

function toCloudRecord(record: LocalStudyRecord, userId: string) {
  return {
    session_id: record.session.id,
    user_id: userId,
    material_id: record.archive.material_id,
    material_title: record.archive.material_title,
    persona_name: record.archive.persona_name,
    completed_at: record.archive.completed_at,
    mastery: record.archive.mastery,
    headline: record.archive.headline,
    misconception_tags: record.archive.misconception_tags,
    retelling: record.retelling,
    answers: record.answers,
    session_data: record.session,
    saved_at: record.savedAt,
  };
}

export async function saveRecordToCloud(record: LocalStudyRecord) {
  if (!supabase) return false;
  const userId = await currentUserId();
  if (!userId) return false;
  const { error } = await supabase
    .from("study_records")
    .upsert(toCloudRecord(record, userId), { onConflict: "session_id,user_id" });
  if (error) throw new Error(`云端记录保存失败：${error.message}`);
  return true;
}

export async function syncLocalRecordsToCloud() {
  if (!supabase) return 0;
  const userId = await currentUserId();
  if (!userId) return 0;
  const records = loadStudyRecords();
  if (!records.length) return 0;
  const { error } = await supabase
    .from("study_records")
    .upsert(records.map((record) => toCloudRecord(record, userId)), {
      onConflict: "session_id,user_id",
    });
  if (error) throw new Error(`本地记录同步失败：${error.message}`);
  return records.length;
}

export async function loadCloudArchive(): Promise<ArchiveItem[] | null> {
  if (!supabase) return null;
  const userId = await currentUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("study_records")
    .select(
      "session_id, material_id, material_title, persona_name, completed_at, mastery, headline, misconception_tags, retelling",
    )
    .order("completed_at", { ascending: false });
  if (error) throw new Error(`云端档案加载失败：${error.message}`);
  return ((data || []) as CloudStudyRow[]).map((row) => ({
    ...row,
    misconception_tags: row.misconception_tags || [],
  }));
}
