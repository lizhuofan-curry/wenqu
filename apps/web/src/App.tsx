import { useEffect, useMemo, useState } from "react";
import { ArchiveView } from "./components/ArchiveView";
import { Dashboard } from "./components/Dashboard";
import { Shell } from "./components/Shell";
import { StudyFlow } from "./components/StudyFlow";
import { api } from "./lib/api";
import type {
  ArchiveItem,
  Material,
  MaterialSummary,
  Persona,
  Session,
} from "./lib/types";

type View = "home" | "study" | "archive";

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

  const persona = useMemo(
    () => personas.find((item) => item.id === selectedPersona) || personas[0],
    [personas, selectedPersona],
  );

  useEffect(() => {
    Promise.all([api.materials(), api.personas()])
      .then(([materialList, personaList]) => {
        setMaterials(materialList);
        setPersonas(personaList);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "初始化失败。");
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
    </Shell>
  );
}

export default App;

