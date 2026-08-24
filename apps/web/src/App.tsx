import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  clearProfileAndActiveSession,
  loadLocalArchive,
  loadProfile,
  saveProfile,
  saveStudyRecord,
} from "./lib/storage";
import { buildReviewTasks, isReviewDue } from "./lib/reviews";
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
  ReviewTask,
} from "./lib/types";

function App() {
  const [view, setView] = useState<View>("home");
  const [materials, setMaterials] = useState<MaterialSummary[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedPersona, setSelectedPersona] = useState("huangfeng");
  const [material, setMaterial] = useState<Material | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [archive, setArchive] = useState<ArchiveItem[]>([]);
  const [activeReviewTask, setActiveReviewTask] = useState<ReviewTask | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [syncStatus, setSyncStatus] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [userName, setUserName] = useState(
    () => (cloudEnabled ? "" : loadProfile()?.displayName || ""),
  );
  const activeCloudUserId = useRef<string | null>(null);
  const authEpoch = useRef(0);

  const persona = useMemo(
    () => personas.find((item) => item.id === selectedPersona) || personas[0],
    [personas, selectedPersona],
  );
  const reviewTasks = useMemo(
    () => buildReviewTasks(archive).filter((task) =>
      materials.some((candidate) => candidate.id === task.material_id),
    ),
    [archive, materials],
  );

  useEffect(() => {
    if (cloudEnabled) {
      void api.personas()
        .then(setPersonas)
        .catch((reason: unknown) => {
          setError(reason instanceof Error ? reason.message : "初始化失败。");
        });
      return;
    }

    Promise.all([api.materials(), api.personas()])
      .then(([materialList, personaList]) => {
        setMaterials(materialList);
        setPersonas(personaList);
        setArchive(loadLocalArchive());
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "初始化失败。");
      });
  }, []);

  useEffect(() => {
    if (!cloudEnabled) return;

    let disposed = false;

    const applyProfile = (profile: Awaited<ReturnType<typeof getCloudProfile>>) => {
      if (disposed) return;
      const nextUserId = profile?.userId || null;
      const identityChanged = activeCloudUserId.current !== nextUserId;
      if (identityChanged) {
        activeCloudUserId.current = nextUserId;
        ++authEpoch.current;
        setMaterial(null);
        setSession(null);
        setMaterials([]);
        setActiveReviewTask(null);
        setArchive([]);
        setBusy(false);
        setDeletingId(null);
        setUploadStatus("");
        setSyncStatus("");
        setError("");
        setView((current) => current === "study" ? "home" : current);
      }
      const epoch = authEpoch.current;
      if (profile) {
        saveProfile(profile);
      } else {
        clearProfileAndActiveSession();
      }
      setUserName(profile?.displayName || "");
      void api.materials().then((materialList) => {
        if (!disposed && authEpoch.current === epoch) {
          setMaterials(materialList);
        }
      }).catch((reason: unknown) => {
        if (!disposed && authEpoch.current === epoch) {
          setError(
            reason instanceof Error
              ? reason.message
              : "账户切换后材料列表刷新失败。",
          );
        }
      });
      if (profile) {
        void api.archive().then((archiveItems) => {
          if (!disposed && authEpoch.current === epoch) {
            setArchive(archiveItems);
          }
        }).catch((reason: unknown) => {
          if (!disposed && authEpoch.current === epoch) {
            setError(reason instanceof Error ? reason.message : "云端档案加载失败。");
          }
        });
      } else {
        setArchive([]);
      }
    };

    let unsub: (() => void) | undefined;
    void (async () => {
      try {
        const profile = await getCloudProfile();
        if (disposed) return;
        applyProfile(profile);
        const stopWatching = await watchCloudAuth(applyProfile);
        if (disposed) {
          stopWatching();
          return;
        }
        unsub = stopWatching;
      } catch (reason: unknown) {
        if (disposed) return;
        ++authEpoch.current;
        clearProfileAndActiveSession();
        activeCloudUserId.current = null;
        setMaterials([]);
        setMaterial(null);
        setSession(null);
        setView("home");
        setActiveReviewTask(null);
        setArchive([]);
        setBusy(false);
        setDeletingId(null);
        setUploadStatus("");
        setSyncStatus("");
        setError(reason instanceof Error ? reason.message : "账户状态加载失败。");
      }
    })();
    return () => {
      disposed = true;
      ++authEpoch.current;
      unsub?.();
    };
  }, []);

  function handleCloudAuthSuccess(
    profile: NonNullable<Awaited<ReturnType<typeof getCloudProfile>>>,
  ) {
    const nextUserId = profile.userId || null;
    const identityChanged = activeCloudUserId.current !== nextUserId;
    if (identityChanged) {
      activeCloudUserId.current = nextUserId;
      ++authEpoch.current;
      setMaterial(null);
      setSession(null);
      setMaterials([]);
      setActiveReviewTask(null);
      setArchive([]);
      setBusy(false);
      setDeletingId(null);
      setUploadStatus("");
      setSyncStatus("");
      setError("");
      setView((current) => current === "study" ? "home" : current);
    }
    const epoch = authEpoch.current;
    saveProfile(profile);
    setUserName(profile.displayName);
    void api.materials().then((materialList) => {
      if (authEpoch.current === epoch) {
        setMaterials(materialList);
      }
    }).catch((reason: unknown) => {
      if (authEpoch.current === epoch) {
        setError(
          reason instanceof Error
            ? reason.message
            : "登录后材料列表刷新失败。",
        );
      }
    });
    void api.archive().then((archiveItems) => {
      if (authEpoch.current === epoch) {
        setArchive(archiveItems);
      }
    }).catch((reason: unknown) => {
      if (authEpoch.current === epoch) {
        setError(reason instanceof Error ? reason.message : "云端档案加载失败。");
      }
    });
  }

  async function startStudy(
    materialId: string,
    preloaded?: Material,
    reviewTask?: ReviewTask,
  ) {
    const epoch = authEpoch.current;
    setBusy(true);
    setError("");
    try {
      const nextMaterial = preloaded || (await api.material(materialId));
      if (authEpoch.current !== epoch) return;
      if (!nextMaterial.sections.length || !nextMaterial.questions.length) {
        throw new Error(
          "这份材料尚未生成可验证的讲解与题目，请联网后重新生成再开始学习。",
        );
      }
      const nextSession = await api.createSession(
        materialId,
        selectedPersona,
        nextMaterial.questions.map((question) => ({
          id: question.id,
          prompt: question.prompt,
        })),
      );
      if (authEpoch.current !== epoch) return;
      setMaterial(nextMaterial);
      setSession(nextSession);
      setActiveReviewTask(reviewTask || null);
      setView("study");
    } catch (reason) {
      if (authEpoch.current === epoch) {
        setError(reason instanceof Error ? reason.message : "无法开始学习。");
      }
    } finally {
      if (authEpoch.current === epoch) {
        setBusy(false);
      }
    }
  }
  function startReview(task: ReviewTask) {
    if (!isReviewDue(task)) return;
    void startStudy(task.material_id, undefined, task);
  }

  async function upload(file: File) {
    const epoch = authEpoch.current;
    setBusy(true);
    setError("");
    setUploadStatus(`正在解析 ${file.name}，并生成材料地图与题目…`);
    try {
      const uploaded = await api.upload(file);
      if (authEpoch.current !== epoch) return;
      setMaterials((current) => [uploaded, ...current.filter((item) => item.id !== uploaded.id)]);
      setUploadStatus("材料已经准备好，正在进入陪读。");
      await startStudy(uploaded.id, uploaded);
      if (authEpoch.current !== epoch) return;
    } catch (reason) {
      if (authEpoch.current === epoch) {
        const message = reason instanceof Error ? reason.message : "上传失败。";
        setError(message);
        setUploadStatus(message);
      }
    } finally {
      if (authEpoch.current === epoch) {
        setBusy(false);
      }
    }
  }

  async function evaluate(
    answers: Array<{ question_id: string; response: string }>,
    retelling: string,
  ) {
    const epoch = authEpoch.current;
    const ownerUserId = activeCloudUserId.current;
    if (!session || !material || !persona) return;
    setBusy(true);
    setError("");
    setSyncStatus("");
    try {
      const completed = await api.evaluate(
        session.id,
        answers,
        retelling,
        material.id,
        persona.id,
        material.questions.map((question) => ({
          id: question.id,
          prompt: question.prompt,
        })),
        ownerUserId,
        activeReviewTask
          ? {
              source_session_id: activeReviewTask.source_session_id,
              interval_days: activeReviewTask.interval_days,
            }
          : null,
      );
      if (authEpoch.current !== epoch) return;
      const completedWithReview: Session = activeReviewTask
        ? {
            ...completed,
            review: {
              source_session_id: activeReviewTask.source_session_id,
              interval_days: activeReviewTask.interval_days,
            },
          }
        : completed;

      setSession(completedWithReview);
      // Keep a local recovery copy; authenticated cloud persistence is completed
      // by the evaluation endpoint from its server-owned scoring result.
      const record = {
        session: completedWithReview,
        archive: {
          session_id: completedWithReview.id,
          material_id: material.id,
          material_title: material.title,
          persona_name: persona.name,
          completed_at: completedWithReview.completed_at || new Date().toISOString(),
          mastery: completedWithReview.result?.mastery ?? 0,
          headline: completedWithReview.result?.headline || "本次学习已完成",
          misconception_tags: completedWithReview.result?.misconception_tags || [],
          retelling,
          answers,
          review: completedWithReview.review,
        },
        answers,
        retelling,
        savedAt: new Date().toISOString(),
      };
      saveStudyRecord(record);
      const localArchive = loadLocalArchive();

      if (!cloudEnabled) {
        setArchive(localArchive);
        setSyncStatus("本次记录已保存在当前浏览器。");
      } else if (completed.cloud_saved && ownerUserId) {
        setSyncStatus("本次记录已同步到云端。");
        try {
          const archiveItems = await api.archive();
          if (authEpoch.current !== epoch) return;
          setArchive(archiveItems);
        } catch {
          if (authEpoch.current === epoch) {
            setArchive(localArchive);
            setSyncStatus("记录已同步，但云端档案暂时无法刷新；当前显示本机副本。");
          }
        }
      } else {
        setArchive(localArchive);
        setSyncStatus(
          "本次记录仅保存在当前浏览器；登录后也不会自动迁移匿名记录。",
        );
      }
    } catch (reason) {
      if (authEpoch.current === epoch) {
        setError(reason instanceof Error ? reason.message : "诊断失败。");
      }
    } finally {
      if (authEpoch.current === epoch) {
        setBusy(false);
      }
    }
  }

  async function deleteMaterial(materialId: string) {
    const target = materials.find((item) => item.id === materialId);
    if (!target || target.source_type === "builtin") return;
    const epoch = authEpoch.current;
    if (!window.confirm(`确定永久删除“${target.title}”吗？此操作无法恢复。`)) return;

    setDeletingId(materialId);
    setError("");
    try {
      await api.deleteMaterial(materialId);
      if (authEpoch.current !== epoch) return;
      setMaterials((current) => current.filter((item) => item.id !== materialId));
    } catch (reason) {
      if (authEpoch.current === epoch) {
        setError(reason instanceof Error ? reason.message : "删除失败。请稍后重试。");
      }
    } finally {
      if (authEpoch.current === epoch) {
        setDeletingId(null);
      }
    }
  }

  async function navigate(next: View) {
    const epoch = authEpoch.current;
    if (next === "archive") {
      try {
        const archiveItems = await api.archive();
        if (authEpoch.current !== epoch) return;
        setArchive(archiveItems);
      } catch (reason) {
        if (authEpoch.current === epoch) {
          setError(reason instanceof Error ? reason.message : "档案加载失败。");
        }
      }
    }
    if (authEpoch.current === epoch) {
      setView(next);
    }
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
        const signOutEpoch = ++authEpoch.current;
        void logoutCloudAccount()
          .then(() => {
            if (authEpoch.current !== signOutEpoch) return;
            const publicEpoch = ++authEpoch.current;
            activeCloudUserId.current = null;
            clearProfileAndActiveSession();
            setUserName("");
            setArchive([]);
            setMaterials([]);
            setView("home");
            setBusy(false);
            setDeletingId(null);
            setUploadStatus("");
            setError("");
            void api.materials().then((materialList) => {
              if (authEpoch.current === publicEpoch) {
                setMaterials(materialList);
              }
            }).catch((reason: unknown) => {
              if (authEpoch.current === publicEpoch) {
                setError(
                  reason instanceof Error ? reason.message : "退出后材料列表刷新失败。",
                );
              }
            });
            setMaterial(null);
            setSession(null);
            setActiveReviewTask(null);
            setSyncStatus("");
          })
          .catch((reason: unknown) => {
            if (authEpoch.current === signOutEpoch) {
              setError(reason instanceof Error ? reason.message : "退出失败。");
            }
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
          onDelete={(id) => void deleteMaterial(id)}
          busy={busy}
          deletingId={deletingId}
          uploadStatus={uploadStatus}
          onNavigate={(next) => void navigate(next)}
          archive={archive}
          reviewTasks={reviewTasks}
          onStartReview={startReview}
        />
      )}
      {view === "materials" && (
        <MaterialsView
          materials={materials}
          busy={busy}
          deletingId={deletingId}
          onStart={(id) => void startStudy(id)}
          onUpload={(file) => void upload(file)}
          onDelete={(id) => void deleteMaterial(id)}
          onRegenerate={(id) => {
            const epoch = authEpoch.current;
            void api.regenerateMaterial(id).then((updated) => {
              if (authEpoch.current !== epoch) return;
              setMaterials((prev) => prev.map((m) => m.id === id ? updated : m));
            }).catch((reason: unknown) => {
              if (authEpoch.current === epoch) {
                setError(reason instanceof Error ? reason.message : "重新生成失败。");
              }
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
          key={session.id}
          material={material}
          session={session}
          persona={persona}
          busy={busy}
          reviewTask={activeReviewTask || undefined}
          onEvaluate={(answers, retelling) => void evaluate(answers, retelling)}
          onExit={() => {
            setActiveReviewTask(null);
            void navigate(session.result ? "archive" : "home");
          }}
        />
      )}
      {view === "archive" && <ArchiveView items={archive} />}
      {syncStatus && (
        <div className="degraded-bar" role="status">
          {syncStatus}
        </div>
      )}
      <AuthModal
        key={authMode}
        open={authOpen}
        initialMode={authMode}
        onClose={() => setAuthOpen(false)}
        onSuccess={handleCloudAuthSuccess}
      />
    </Shell>
  );
}

export default App;
