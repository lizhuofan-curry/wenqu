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
import { api } from "./lib/api";
import { loadProfile } from "./lib/storage";
import {
  cloudEnabled,
  getCloudProfile,
  logoutCloudAccount,
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
    return watchCloudAuth((profile) => {
      setUserName(profile?.displayName || "");
      void api.archive().then(setArchive).catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "云端档案加载失败。");
      });
    });
  }, []);

  async function startStudy(materialId: string) {
    setBusy(true);
    setError("");
    try {
      const [nextMaterial, nextSession] = await Promise.all([
        api.material(materialId),
        api.createSession(materialId, selectedPersona),
      ]);
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
      await startStudy(uploaded.id);
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
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const completed = await api.evaluate(session.id, answers, retelling);
      setSession(completed);
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
        />
      )}
      {view === "insights" && (
        <InsightsView
          items={archive}
          onReview={() => materials[0] && void startStudy(materials[0].id)}
        />
      )}
      {view === "misconceptions" && (
        <MisconceptionsView
          items={archive}
          onReview={() => materials[0] && void startStudy(materials[0].id)}
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
