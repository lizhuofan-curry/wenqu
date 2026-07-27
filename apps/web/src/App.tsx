import { useEffect, useMemo, useState } from "react";
import { ArchiveView } from "./components/ArchiveView";
import { AuthModal } from "./components/AuthModal";
import { Dashboard } from "./components/Dashboard";
import { InsightsView } from "./components/InsightsView";
import { MaterialsView } from "./components/MaterialsView";
import { MisconceptionsView } from "./components/MisconceptionsView";
import { Shell } from "./components/Shell";
import type { View } from "./components/Shell";
import { StudyFlow } from "./components/StudyFlow";
import { api, isDemo, isDegraded } from "./lib/api";
import { loadProfile, saveStudyRecord } from "./lib/storage";
import {
  cloudEnabled,
  getCloudProfile,
  logoutCloudAccount,
  saveRecordToCloud,
  watchCloudAuth,
} from "./lib/cloud";
import type {
  ArchiveItem,
  Material,
  MaterialSummary,
  Persona,
  Session,
} from "./lib/types";

function App() {
  const [view, setView] = useState<View>("home");
  const [materials, setMaterials] = useState<MaterialSummary[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedPersona, setSelectedPersona] = useState("huangfeng");
  const [material, setMaterial] = useState<Material | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [archive, setArchive] = useState<ArchiveItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [userName, setUserName] = useState(
    () => loadProfile()?.displayName || "",
  );

  const persona = useMemo(
    () => personas.find((item) => item.id === selectedPersona) || personas[0],
    [personas, selectedPersona],
  );

  useEffect(() => {
    Promise.all([api.materials(), api.personas(), api.archive()])
      .then(([materialList, personaList, archiveItems]) => {
        setMaterials(materialList);
        setPersonas(personaList);
        setArchive(archiveItems);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "初始化失败。");
      });
  }, []);

  useEffect(() => {
    if (!cloudEnabled) return;
    void getCloudProfile().then((profile) => {
      setUserName(profile?.displayName || "");
      if (profile) {
        void api.archive().then(setArchive).catch((reason: unknown) => {
          setError(reason instanceof Error ? reason.message : "云端档案加载失败。");
        });
      } else {
        setArchive([]);
      }
    });
    let unsub: (() => void) | undefined;
    watchCloudAuth((profile) => {
      setUserName(profile?.displayName || "");
      void api.archive().then(setArchive).catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "云端档案加载失败。");
      });
    }).then((fn) => { unsub = fn; });
    return () => { unsub?.(); };
  }, []);

  async function startStudy(materialId: string, preloaded?: Material) {
    setBusy(true);
    setError("");
    try {
      const nextMaterial = preloaded || (await api.material(materialId));
      // Pass questions to session so evaluation survives cold starts
      const rawQuestions = (nextMaterial as Record<string, unknown>).questions as
        Array<{ id: string; prompt: string; answer_guide?: string; max_score?: number }> | undefined;
      const nextSession = await api.createSession(
        materialId,
        selectedPersona,
        rawQuestions?.map((q) => ({
          id: q.id,
          prompt: q.prompt,
          answer_guide: q.answer_guide || "",
          max_score: q.max_score ?? 4,
        })),
      );
      setMaterial(nextMaterial);
      setSession(nextSession);
      setView("study");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法开始学习。");
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    setBusy(true);
    setError("");
    setUploadStatus(`正在解析 ${file.name}，并生成材料地图与题目…`);
    try {
      const uploaded = await api.upload(file);
      setMaterials((current) => [uploaded, ...current.filter((item) => item.id !== uploaded.id)]);
      setUploadStatus("材料已经准备好，正在进入陪读。");
      await startStudy(uploaded.id, uploaded);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "上传失败。";
      setError(message);
      setUploadStatus(message);
    } finally {
      setBusy(false);
    }
  }

  async function evaluate(
    answers: Array<{ question_id: string; response: string }>,
    retelling: string,
  ) {
    if (!session || !material || !persona) return;
    setBusy(true);
    setError("");
    try {
      const completed = await api.evaluate(session.id, answers, retelling);
      setSession(completed);
      // Save to local storage + try cloud (separate from API archive endpoint)
      const record = {
        session: completed,
        archive: {
          session_id: completed.id,
          material_id: material.id,
          material_title: material.title,
          persona_name: persona.name,
          completed_at: completed.completed_at || new Date().toISOString(),
          mastery: completed.result?.mastery ?? 0,
          headline: completed.result?.headline || "本次学习已完成",
          misconception_tags: completed.result?.misconception_tags || [],
          retelling,
        },
        answers,
        retelling,
        savedAt: new Date().toISOString(),
      };
      saveStudyRecord(record);
      saveRecordToCloud(record).catch(() => {});
      setArchive(await api.archive());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "诊断失败。");
    } finally {
      setBusy(false);
    }
  }

  async function navigate(next: View) {
    if (next === "archive") {
      try {
        setArchive(await api.archive());
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "档案加载失败。");
      }
    }
    setView(next);
  }

  return (
    <Shell
      view={view}
      onNavigate={(next) => void navigate(next)}
      studyEnabled={Boolean(material && session)}
      userName={userName}
      onAuth={(mode) => {
        setAuthMode(mode);
        setAuthOpen(true);
      }}
      cloudEnabled={cloudEnabled}
      demoMode={isDemo()}
      degraded={isDegraded()}
      onSignOut={() => {
        void logoutCloudAccount()
          .then(() => {
            setUserName("");
            setArchive([]);
          })
          .catch((reason: unknown) => {
            setError(reason instanceof Error ? reason.message : "退出失败。");
          });
      }}
    >
      {error && (
        <div className="global-error" role="alert">
          {error}
          <button onClick={() => setError("")}>关闭</button>
        </div>
      )}
      {view === "home" && (
        <Dashboard
          materials={materials}
          personas={personas}
          selectedPersona={selectedPersona}
          onSelectPersona={setSelectedPersona}
          onStart={(id) => void startStudy(id)}
          onUpload={(file) => void upload(file)}
          busy={busy}
          uploadStatus={uploadStatus}
          onNavigate={(next) => void navigate(next)}
          archive={archive}
        />
      )}
      {view === "materials" && (
        <MaterialsView
          materials={materials}
          busy={busy}
          onStart={(id) => void startStudy(id)}
          onUpload={(file) => void upload(file)}
          onDelete={(id) => {
            void api.deleteMaterial(id).then(() => {
              setMaterials((prev) => prev.filter((m) => m.id !== id));
            }).catch((reason: unknown) => {
              setError(reason instanceof Error ? reason.message : "删除失败。");
            });
          }}
        />
      )}
      {view === "insights" && (
        <InsightsView
          items={archive}
          onReview={() => {
            const recent = archive[0]?.material_id;
            const target = materials.find((m) => m.id === recent) || materials[0];
            if (target) void startStudy(target.id);
          }}
        />
      )}
      {view === "misconceptions" && (
        <MisconceptionsView
          items={archive}
          onReview={() => {
            const recent = archive[0]?.material_id;
            const target = materials.find((m) => m.id === recent) || materials[0];
            if (target) void startStudy(target.id);
          }}
        />
      )}
      {view === "study" && material && session && persona && (
        <StudyFlow
          material={material}
          session={session}
          persona={persona}
          busy={busy}
          onEvaluate={(answers, retelling) => void evaluate(answers, retelling)}
          onExit={() => void navigate(session.result ? "archive" : "home")}
        />
      )}
      {view === "archive" && <ArchiveView items={archive} />}
      <AuthModal
        key={authMode}
        open={authOpen}
        initialMode={authMode}
        onClose={() => setAuthOpen(false)}
        onSuccess={(profile) => setUserName(profile.displayName)}
      />
    </Shell>
  );
}

export default App;
