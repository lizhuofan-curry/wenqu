import { useEffect, useMemo, useRef, useState } from "react";
import { ArchiveView } from "./components/ArchiveView";
import { AuthModal } from "./components/AuthModal";
import { Dashboard } from "./components/Dashboard";
import { DiagnosticFlow } from "./components/DiagnosticFlow";
import { EvidenceNoteDialog, type EvidenceNoteDraftContext } from "./components/EvidenceNoteDialog";
import { InsightsView } from "./components/InsightsView";
import { MaterialsView } from "./components/MaterialsView";
import { MisconceptionsView } from "./components/MisconceptionsView";
import { Shell } from "./components/Shell";
import type { View } from "./components/Shell";
import { StudyFlow, type DiagnosticStudyPlan } from "./components/StudyFlow";
import { TransferFlow } from "./components/TransferFlow";
import { ApiError, api, isDemo, isDegraded } from "./lib/api";
import {
  createEvidenceNote,
  deleteEvidenceNote,
  loadEvidenceNotes,
  updateEvidenceNote,
  type EvidenceNoteCard,
  type EvidenceMaterialSnapshot,
  type EvidenceNoteContentKind,
} from "./lib/evidenceNotes";
import {
  MAX_TOPICS_PER_OWNER,
  addMaterialToTopic,
  createTopic,
  deleteTopic,
  loadTopics,
  removeMaterialFromTopic,
  updateTopic,
  type Topic,
  type TopicInput,
} from "./lib/topics";
import {
  clearProfileAndActiveSession,
  loadLocalArchive,
  loadLocalOnlySyncRecords,
  loadPendingSyncRecords,
  loadProfile,
  saveProfile,
  markStudyRecordSynced,
  markStudyRecordSyncFailed,
  type LocalStudyRecord,
  saveStudyRecord,
} from "./lib/storage";
import {
  buildReviewTasks,
  buildTransferCandidates,
  countTransferDiagnoses,
  countTransferSources,
  isReviewDue,
} from "./lib/reviews";
import {
  cloudEnabled,
  getCloudProfile,
  logoutCloudAccount,
  watchCloudAuth,
} from "./lib/cloud";
import {
  readDiagnosticAttemptId,
  resolveDiagnosticSection,
  writeDiagnosticAttemptId,
} from "./lib/diagnostic";
import type {
  ArchiveItem,
  DiagnosticAttempt,
  DiagnosticAnswer,
  Material,
  MaterialSummary,
  Persona,
  Session,
  ReviewTask,
  TransferAttemptResult,
  TransferLink,
  TransferTask,
  TransferTaskCandidate,
} from "./lib/types";
function mergeArchiveWithLocalRecovery(
  cloudItems: ArchiveItem[],
  ownerUserId: string,
) {
  const recoveryItems = [
    ...loadPendingSyncRecords(ownerUserId),
    ...loadLocalOnlySyncRecords(ownerUserId),
  ].map((record) => ({
    ...record.archive,
    answers: record.answers,
    review: record.session.review,
  }));
  const recoveryIds = new Set(recoveryItems.map((item) => item.session_id));
  return [
    ...recoveryItems,
    ...cloudItems.filter((item) => !recoveryIds.has(item.session_id)),
  ].sort((a, b) => b.completed_at.localeCompare(a.completed_at));
}

function App() {
  const [view, setView] = useState<View>("home");
  const [materials, setMaterials] = useState<MaterialSummary[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedPersona, setSelectedPersona] = useState("huangfeng");
  const [material, setMaterial] = useState<Material | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [diagnosticAttempt, setDiagnosticAttempt] = useState<DiagnosticAttempt | null>(null);
  const [diagnosticPlan, setDiagnosticPlan] = useState<DiagnosticStudyPlan | null>(null);
  const [diagnosticError, setDiagnosticError] = useState("");
  const [archive, setArchive] = useState<ArchiveItem[]>([]);
  const [activeReviewTask, setActiveReviewTask] = useState<ReviewTask | null>(null);
  const [activeTransferTask, setActiveTransferTask] = useState<TransferTask | null>(null);
  const [transferResult, setTransferResult] = useState<TransferAttemptResult>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [syncStatus, setSyncStatus] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [pendingSyncRecords, setPendingSyncRecords] = useState<LocalStudyRecord[]>([]);
  const [localOnlySyncRecords, setLocalOnlySyncRecords] = useState<LocalStudyRecord[]>([]);
  const [syncingRecordId, setSyncingRecordId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [userName, setUserName] = useState(
    () => (cloudEnabled ? "" : loadProfile()?.displayName || ""),
  );
  const [evidenceOwner, setEvidenceOwner] = useState<string | null>(null);
  const [evidenceNotes, setEvidenceNotes] = useState<EvidenceNoteCard[]>(
    () => loadEvidenceNotes(window.localStorage, null),
  );
  const [evidenceDialog, setEvidenceDialog] = useState<{
    context: EvidenceNoteDraftContext;
    note?: EvidenceNoteCard;
    returnFocus: HTMLElement | null;
  } | null>(null);
  const [evidenceError, setEvidenceError] = useState("");
  const [evidenceMaterialId, setEvidenceMaterialId] = useState<string | null>(null);
  const [topicOwner, setTopicOwner] = useState<string | null>(null);
  const [topics, setTopics] = useState<Topic[]>(
    () => loadTopics(window.localStorage, null),
  );
  const [topicsError, setTopicsError] = useState("");
  const activeCloudUserId = useRef<string | null>(null);
  const authEpoch = useRef(0);
  const transferRequestInFlight = useRef(false);
  const evidenceNoteCounts = useMemo(() => evidenceNotes.reduce<Record<string, number>>((counts, note) => {
    counts[note.material_id] = (counts[note.material_id] || 0) + 1;
    return counts;
  }, {}), [evidenceNotes]);

  const evidenceMaterialSnapshots = useMemo<EvidenceMaterialSnapshot[]>(() =>
    materials.map((item) => ({
      id: item.id,
      sectionIds: material?.id === item.id ? [
        ...material.sections.map((section) => section.id),
        ...material.map.map((mapItem) => `map:${mapItem.key}`),
        ...material.questions.map((question) => `result:${question.id}`),
      ] : undefined,
    })), [material, materials]);

  function switchEvidenceOwner(ownerId: string | null) {
    setEvidenceOwner(ownerId);
    setEvidenceNotes(loadEvidenceNotes(window.localStorage, ownerId));
    setEvidenceDialog(null);
    setEvidenceError("");
    setEvidenceMaterialId(null);
  }

  function switchTopicsOwner(ownerId: string | null) {
    setTopicOwner(ownerId);
    setTopics(loadTopics(window.localStorage, ownerId));
    setTopicsError("");
  }

  function topicsErrorMessage(reason: unknown): string {
    if (reason instanceof Error && reason.message === "topic limit reached") {
      return `专题数量已达上限（${MAX_TOPICS_PER_OWNER} 个），请先删除不再需要的专题。`;
    }
    return "浏览器无法保存这次专题修改，请释放空间后重试。";
  }

  function reloadTopics() {
    setTopics(loadTopics(window.localStorage, topicOwner));
  }

  function createTopicEntry(input: TopicInput) {
    try {
      createTopic(window.localStorage, topicOwner, input);
      reloadTopics();
      setTopicsError("");
    } catch (reason) {
      setTopicsError(topicsErrorMessage(reason));
    }
  }

  function renameTopicEntry(topicId: string, name: string) {
    try {
      updateTopic(window.localStorage, topicOwner, topicId, { name });
      reloadTopics();
      setTopicsError("");
    } catch (reason) {
      setTopicsError(topicsErrorMessage(reason));
    }
  }

  function deleteTopicEntry(topicId: string) {
    deleteTopic(window.localStorage, topicOwner, topicId);
    reloadTopics();
    setTopicsError("");
  }

  function addMaterialToTopicEntry(topicId: string, materialId: string) {
    try {
      addMaterialToTopic(window.localStorage, topicOwner, topicId, materialId);
      reloadTopics();
      setTopicsError("");
    } catch (reason) {
      setTopicsError(topicsErrorMessage(reason));
    }
  }

  function removeMaterialFromTopicEntry(topicId: string, materialId: string) {
    removeMaterialFromTopic(window.localStorage, topicOwner, topicId, materialId);
    reloadTopics();
    setTopicsError("");
  }

  function openNewEvidenceNote(context: EvidenceNoteDraftContext, trigger: HTMLElement) {
    setEvidenceError("");
    setEvidenceDialog({ context, returnFocus: trigger });
  }

  function openExistingEvidenceNote(note: EvidenceNoteCard, trigger: HTMLElement) {
    setEvidenceError("");
    setEvidenceDialog({
      note,
      returnFocus: trigger,
      context: {
        material_id: note.material_id,
        material_title: note.material_title,
        material_revision: note.material_revision,
        section_id: note.section_id,
        section_title: note.section_title,
        source: note.source,
      },
    });
  }

  function saveEvidenceNote(content: string, contentKind: EvidenceNoteContentKind) {
    if (!evidenceDialog) return;
    try {
      if (evidenceDialog.note) {
        updateEvidenceNote(window.localStorage, evidenceOwner, evidenceDialog.note.id, {
          content,
          content_kind: contentKind,
        });
      } else {
        createEvidenceNote(window.localStorage, evidenceOwner, {
          ...evidenceDialog.context,
          content,
          content_kind: contentKind,
        });
      }
      setEvidenceNotes(loadEvidenceNotes(window.localStorage, evidenceOwner));
      setEvidenceDialog(null);
      setEvidenceError("");
    } catch (reason) {
      setEvidenceError(reason instanceof Error ? reason.message : "浏览器无法保存这张笔记，请先导出备份并释放空间。");
    }
  }

  function removeEvidenceNote(note: EvidenceNoteCard, nextFocus: HTMLElement | null) {
    deleteEvidenceNote(window.localStorage, evidenceOwner, note.id);
    setEvidenceNotes(loadEvidenceNotes(window.localStorage, evidenceOwner));
    requestAnimationFrame(() => nextFocus?.focus());
  }

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
  const transferCandidates = useMemo(
    () => buildTransferCandidates(archive).filter((task) =>
      materials.some((candidate) => candidate.id === task.material_id),
    ),
    [archive, materials],
  );
  const transferArchiveCount = useMemo(
    () => countTransferDiagnoses(archive),
    [archive],
  );
  const transferSourceCount = useMemo(
    () => countTransferSources(archive),
    [archive],
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
        switchEvidenceOwner(nextUserId);
        switchTopicsOwner(nextUserId);
        ++authEpoch.current;
        setMaterial(null);
        setSession(null);
        setDiagnosticAttempt(null);
        setDiagnosticPlan(null);
        setDiagnosticError("");
        setMaterials([]);
        setActiveReviewTask(null);
        setActiveTransferTask(null);
        setTransferResult(undefined);
        transferRequestInFlight.current = false;
        setArchive([]);
        setBusy(false);
        setDeletingId(null);
        setUploadStatus("");
        setSyncStatus("");
        setPendingSyncRecords([]);
        setLocalOnlySyncRecords([]);
        setSyncingRecordId(null);
        setError("");
        setView((current) =>
          current === "study" || current === "diagnostic" ? "home" : current,
        );
      }
      const epoch = authEpoch.current;
      if (profile) {
        saveProfile(profile);
        setPendingSyncRecords(profile.userId ? loadPendingSyncRecords(profile.userId) : []);
        setLocalOnlySyncRecords(profile.userId ? loadLocalOnlySyncRecords(profile.userId) : []);
        if (profile.userId) {
          setArchive(mergeArchiveWithLocalRecovery([], profile.userId));
        }
      } else {
        clearProfileAndActiveSession();
        setPendingSyncRecords([]);
        setLocalOnlySyncRecords([]);
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
            setArchive(mergeArchiveWithLocalRecovery(archiveItems, profile.userId!));
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
        switchEvidenceOwner(null);
        switchTopicsOwner(null);
        setMaterials([]);
        setMaterial(null);
        setSession(null);
        setDiagnosticAttempt(null);
        setDiagnosticPlan(null);
        setDiagnosticError("");
        setView("home");
        setActiveReviewTask(null);
        setActiveTransferTask(null);
        setTransferResult(undefined);
        transferRequestInFlight.current = false;
        setArchive([]);
        setBusy(false);
        setDeletingId(null);
        setUploadStatus("");
        setSyncStatus("");
        setPendingSyncRecords([]);
        setLocalOnlySyncRecords([]);
        setSyncingRecordId(null);
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
      switchEvidenceOwner(nextUserId);
      switchTopicsOwner(nextUserId);
      ++authEpoch.current;
      setMaterial(null);
      setSession(null);
      setDiagnosticAttempt(null);
      setDiagnosticPlan(null);
      setDiagnosticError("");
      setMaterials([]);
      setActiveReviewTask(null);
      setActiveTransferTask(null);
      setTransferResult(undefined);
      transferRequestInFlight.current = false;
      setArchive([]);
      setBusy(false);
      setDeletingId(null);
      setUploadStatus("");
      setSyncStatus("");
      setPendingSyncRecords([]);
      setLocalOnlySyncRecords([]);
      setSyncingRecordId(null);
      setError("");
      setView((current) =>
        current === "study" || current === "diagnostic" ? "home" : current,
      );
    }
    const epoch = authEpoch.current;
    saveProfile(profile);
    setUserName(profile.displayName);
    setPendingSyncRecords(profile.userId ? loadPendingSyncRecords(profile.userId) : []);
    setLocalOnlySyncRecords(profile.userId ? loadLocalOnlySyncRecords(profile.userId) : []);
    if (profile.userId) {
      setArchive(mergeArchiveWithLocalRecovery([], profile.userId));
    }
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
        setArchive(mergeArchiveWithLocalRecovery(archiveItems, profile.userId!));
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
    studyPlan?: DiagnosticStudyPlan,
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
      setDiagnosticPlan(studyPlan || null);
      setDiagnosticAttempt(null);
      setDiagnosticError("");
      setActiveReviewTask(reviewTask || null);
      setActiveTransferTask(null);
      setTransferResult(undefined);
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
  function showDiagnosticAttempt(
    attempt: DiagnosticAttempt,
    fallbackTitle: string,
  ) {
    setDiagnosticAttempt({
      ...attempt,
      material_title: attempt.material_title || fallbackTitle,
    });
    setMaterial(null);
    setSession(null);
    setDiagnosticPlan(null);
    setActiveReviewTask(null);
    setActiveTransferTask(null);
    setTransferResult(undefined);
    setView("diagnostic");
  }

  async function startDiagnostic(materialId: string) {
    const ownerUserId = activeCloudUserId.current;
    if (materialId !== "senet-cvpr-2018") return;
    if (!ownerUserId) {
      setAuthMode("login");
      setAuthOpen(true);
      return;
    }
    const epoch = authEpoch.current;
    const fallbackTitle =
      materials.find((item) => item.id === materialId)?.title ||
      "SENet 课前诊断";
    setBusy(true);
    setError("");
    setDiagnosticError("");
    try {
      let attempt: DiagnosticAttempt | null = null;
      const storedAttemptId = readDiagnosticAttemptId(
        localStorage,
        ownerUserId,
        materialId,
      );
      if (storedAttemptId) {
        try {
          attempt = await api.diagnostic(storedAttemptId);
        } catch (reason) {
          if (!(reason instanceof ApiError) || reason.status !== 404) throw reason;
        }
      }
      if (!attempt) {
        attempt = await api.prepareDiagnostic(
          materialId,
          ownerUserId,
          globalThis.crypto.randomUUID(),
        );
      }
      if (
        authEpoch.current !== epoch ||
        activeCloudUserId.current !== ownerUserId
      ) return;
      writeDiagnosticAttemptId(localStorage, ownerUserId, materialId, attempt.id);
      showDiagnosticAttempt(attempt, fallbackTitle);
    } catch (reason) {
      if (
        authEpoch.current === epoch &&
        activeCloudUserId.current === ownerUserId
      ) {
        setError(reason instanceof Error ? reason.message : "课前诊断准备失败。");
      }
    } finally {
      if (authEpoch.current === epoch) setBusy(false);
    }
  }

  async function refreshDiagnostic() {
    const attempt = diagnosticAttempt;
    const ownerUserId = activeCloudUserId.current;
    if (!attempt || !ownerUserId) return;
    const epoch = authEpoch.current;
    setBusy(true);
    setDiagnosticError("");
    try {
      const recovered = await api.diagnostic(attempt.id);
      if (
        authEpoch.current !== epoch ||
        activeCloudUserId.current !== ownerUserId
      ) return;
      writeDiagnosticAttemptId(
        localStorage,
        ownerUserId,
        attempt.material_id,
        recovered.id,
      );
      showDiagnosticAttempt(
        recovered,
        attempt.material_title || "SENet 课前诊断",
      );
      if (recovered.status === "evaluating") {
        setDiagnosticError("评分仍在确认中；系统没有重复提交，请稍后再次读取状态。");
      } else if (recovered.status !== "completed") {
        setDiagnosticError("任务尚未完成，可以保留当前答案后重新提交。");
      }
    } catch (reason) {
      if (
        authEpoch.current === epoch &&
        activeCloudUserId.current === ownerUserId
      ) {
        setDiagnosticError(
          reason instanceof Error ? reason.message : "诊断状态读取失败。",
        );
      }
    } finally {
      if (authEpoch.current === epoch) setBusy(false);
    }
  }

  async function evaluateDiagnostic(answers: DiagnosticAnswer[]) {
    const attempt = diagnosticAttempt;
    const ownerUserId = activeCloudUserId.current;
    if (!attempt || !ownerUserId) return;
    if (attempt.status === "evaluating") {
      await refreshDiagnostic();
      return;
    }
    const epoch = authEpoch.current;
    setBusy(true);
    setDiagnosticError("");
    try {
      const completed = await api.evaluateDiagnostic(
        attempt.id,
        ownerUserId,
        answers,
      );
      if (
        authEpoch.current !== epoch ||
        activeCloudUserId.current !== ownerUserId
      ) return;
      if (completed.status !== "completed" || !completed.result) {
        throw new Error("诊断结果尚未完整返回，请读取当前任务状态。");
      }
      writeDiagnosticAttemptId(
        localStorage,
        ownerUserId,
        attempt.material_id,
        completed.id,
      );
      showDiagnosticAttempt(
        completed,
        attempt.material_title || "SENet 课前诊断",
      );
    } catch (reason) {
      if (
        authEpoch.current !== epoch ||
        activeCloudUserId.current !== ownerUserId
      ) return;
      const originalMessage =
        reason instanceof Error ? reason.message : "课前诊断评分失败。";
      try {
        const recovered = await api.diagnostic(attempt.id);
        if (
          authEpoch.current !== epoch ||
          activeCloudUserId.current !== ownerUserId
        ) return;
        writeDiagnosticAttemptId(
          localStorage,
          ownerUserId,
          attempt.material_id,
          recovered.id,
        );
        showDiagnosticAttempt(
          recovered,
          attempt.material_title || "SENet 课前诊断",
        );
        if (recovered.status === "completed" && recovered.result) {
          setDiagnosticError("");
        } else if (recovered.status === "evaluating") {
          setDiagnosticError("评分请求已接收，结果仍在确认；请使用“读取状态”，不要重复提交。");
        } else {
          setDiagnosticError(originalMessage);
        }
      } catch {
        setDiagnosticError(originalMessage);
      }
    } finally {
      if (authEpoch.current === epoch) setBusy(false);
    }
  }

  async function startStudyFromDiagnostic(
    mode: DiagnosticStudyPlan["mode"],
  ) {
    const attempt = diagnosticAttempt;
    const result = attempt?.result;
    if (!attempt || !result) return;
    const recommendedPath = result.recommended_path ?? [];
    await startStudy(attempt.material_id, undefined, undefined, {
      sectionId: mode === "recommended" ? resolveDiagnosticSection(result) : undefined,
      recommendedPath,
      mode,
    });
  }

  function startReview(task: ReviewTask) {
    if (!isReviewDue(task)) return;
    void startStudy(task.material_id, undefined, task);
  }

  async function startTransfer(candidate: TransferTaskCandidate) {
    const ownerUserId = activeCloudUserId.current;
    const epoch = authEpoch.current;
    if (!ownerUserId || transferRequestInFlight.current) return;

    transferRequestInFlight.current = true;
    setBusy(true);
    setError("");
    setSyncStatus("");
    try {
      const task = await api.prepareTransfer(
        candidate.source_session_id,
        ownerUserId,
      );
      if (
        authEpoch.current !== epoch ||
        activeCloudUserId.current !== ownerUserId
      ) {
        return;
      }
      setActiveReviewTask(null);
      setActiveTransferTask(task);
      setTransferResult(undefined);
      setView("study");
    } catch (reason) {
      if (
        authEpoch.current === epoch &&
        activeCloudUserId.current === ownerUserId
      ) {
        setError(reason instanceof Error ? reason.message : "迁移题准备失败。");
      }
    } finally {
      if (
        authEpoch.current === epoch &&
        activeCloudUserId.current === ownerUserId
      ) {
        transferRequestInFlight.current = false;
        setBusy(false);
      }
    }
  }

  async function evaluateTransfer(answer: string) {
    const task = activeTransferTask;
    const ownerUserId = activeCloudUserId.current;
    const epoch = authEpoch.current;
    if (!task || !ownerUserId || transferRequestInFlight.current) return;

    const startedAt = new Date().toISOString();
    transferRequestInFlight.current = true;
    setBusy(true);
    setError("");
    setSyncStatus("");
    try {
      const result = await api.evaluateTransfer(
        task.id,
        task.source_session_id,
        answer,
        ownerUserId,
      );
      if (
        authEpoch.current !== epoch ||
        activeCloudUserId.current !== ownerUserId
      ) {
        return;
      }

      const transfer: TransferLink = {
        task_id: task.id,
        source_session_id: task.source_session_id,
        source_question_id: task.source_question_id,
        misconception_code: task.target.code,
        misconception_label: task.target.label,
        verdict: result.verdict,
      };
      const mastery = result.max_score > 0
        ? Math.round((result.score / result.max_score) * 100)
        : 0;
      const headline = `迁移检验：${
        result.verdict === "transferred"
          ? "已迁移"
          : result.verdict === "partial"
            ? "部分迁移"
            : "尚未迁移"
      }`;
      const archiveItem: ArchiveItem = {
        session_id: result.session_id,
        material_id: task.material_id,
        material_title: task.material_title,
        persona_name: "迁移检验",
        completed_at: result.completed_at,
        mastery,
        headline,
        misconception_tags:
          result.verdict === "transferred" ? [] : [task.target.label],
        retelling: "",
        answers: [{ question_id: "transfer", response: answer }],
        transfer,
      };
      const transferSession: Session = {
        id: result.session_id,
        material_id: task.material_id,
        persona_id: "transfer",
        status: "completed",
        started_at: startedAt,
        completed_at: result.completed_at,
        result: null,
        transfer,
        cloud_saved: result.cloud_saved,
      };
      const record: LocalStudyRecord = {
        session: transferSession,
        archive: archiveItem,
        answers: archiveItem.answers || [],
        retelling: "",
        savedAt: new Date().toISOString(),
        sync: !result.cloud_saved
          ? result.cloud_retry_token
            ? {
                status: "pending",
                ownerUserId,
                retryToken: result.cloud_retry_token,
                attempts: 0,
              }
            : {
                status: "local-only",
                ownerUserId,
                attempts: 0,
              }
          : undefined,
      };

      saveStudyRecord(record, ownerUserId);
      setTransferResult(result);
      setPendingSyncRecords(loadPendingSyncRecords(ownerUserId));
      setLocalOnlySyncRecords(loadLocalOnlySyncRecords(ownerUserId));
      const localArchive = loadLocalArchive(ownerUserId);

      if (result.cloud_saved) {
        setSyncStatus("迁移结果已同步到云端。");
        try {
          const archiveItems = await api.archive();
          if (
            authEpoch.current === epoch &&
            activeCloudUserId.current === ownerUserId
          ) {
            setArchive(mergeArchiveWithLocalRecovery(archiveItems, ownerUserId));
          }
        } catch {
          if (
            authEpoch.current === epoch &&
            activeCloudUserId.current === ownerUserId
          ) {
            setArchive(localArchive);
            setSyncStatus("迁移结果已同步，但云端档案暂时无法刷新；当前显示本机副本。");
          }
        }
      } else {
        setArchive(localArchive);
        setSyncStatus(
          result.cloud_retry_token
            ? "迁移结果已保存在本机可信副本，可稍后重新同步。"
            : "迁移结果仅保存在当前浏览器；服务端未签发恢复凭据。",
        );
      }
    } catch (reason) {
      if (
        authEpoch.current === epoch &&
        activeCloudUserId.current === ownerUserId
      ) {
        setError(reason instanceof Error ? reason.message : "迁移检验失败。");
      }
    } finally {
      if (
        authEpoch.current === epoch &&
        activeCloudUserId.current === ownerUserId
      ) {
        transferRequestInFlight.current = false;
        setBusy(false);
      }
    }
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
            review: completed.review ?? {
              source_session_id: activeReviewTask.source_session_id,
              interval_days: activeReviewTask.interval_days,
            },
          }
        : completed;

      setSession(completedWithReview);
      // Keep a local recovery copy; authenticated cloud persistence is completed
      // by the evaluation endpoint from its server-owned scoring result.
      const record: LocalStudyRecord = {
        session: {
          ...completedWithReview,
          cloud_retry_token: undefined,
        },
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
          server_verified: completed.cloud_saved === true,
          transfer_eligible: completed.cloud_saved === true,
          rubric_fingerprint: completedWithReview.rubric_fingerprint,
          result: completedWithReview.result,
        },
        answers,
        retelling,
        savedAt: new Date().toISOString(),
        sync:
          ownerUserId && !completed.cloud_saved
            ? completed.cloud_retry_token
              ? {
                  status: "pending",
                  ownerUserId,
                  retryToken: completed.cloud_retry_token,
                  attempts: 0,
                }
              : {
                  status: "local-only",
                  ownerUserId,
                  attempts: 0,
                }
            : undefined,
      };
      saveStudyRecord(record, ownerUserId || undefined);
      const localArchive = loadLocalArchive(ownerUserId || undefined);
      if (ownerUserId) {
        setPendingSyncRecords(loadPendingSyncRecords(ownerUserId));
        setLocalOnlySyncRecords(loadLocalOnlySyncRecords(ownerUserId));
      }

      if (!cloudEnabled) {
        setArchive(localArchive);
        setSyncStatus("本次记录已保存在当前浏览器。");
      } else if (completed.cloud_saved && ownerUserId) {
        setSyncStatus("本次记录已同步到云端。");
        try {
          const archiveItems = await api.archive();
          if (authEpoch.current !== epoch) return;
          setArchive(mergeArchiveWithLocalRecovery(archiveItems, ownerUserId));
        } catch {
          if (authEpoch.current === epoch) {
            setArchive(localArchive);
            setSyncStatus("记录已同步，但云端档案暂时无法刷新；当前显示本机副本。");
          }
        }
      } else {
        setArchive(localArchive);
        if (ownerUserId && completed.cloud_retry_token) {
          setSyncStatus("云端暂时不可用，本机已保留可信恢复副本，可稍后重新同步。");
        } else if (ownerUserId) {
          setSyncStatus(
            "本次结果仅保存在当前浏览器；服务端未签发恢复凭据，不能自动上传为可信成绩。",
          );
        } else {
          setSyncStatus("本次记录仅保存在当前浏览器；登录后也不会自动迁移匿名记录。");
        }
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

  async function retryPendingSync(sessionId: string) {
    const ownerUserId = activeCloudUserId.current;
    const epoch = authEpoch.current;
    if (!ownerUserId || syncingRecordId !== null) return;
    const record = loadPendingSyncRecords(ownerUserId).find(
      (candidate) => candidate.session.id === sessionId,
    );
    const retryToken = record?.sync?.retryToken;
    if (!record || !retryToken) return;

    setSyncingRecordId(sessionId);
    setSyncStatus("");
    try {
      await api.retryArchive(retryToken, ownerUserId);
      if (
        authEpoch.current !== epoch ||
        activeCloudUserId.current !== ownerUserId
      ) {
        return;
      }
      markStudyRecordSynced(ownerUserId, sessionId);
      setPendingSyncRecords(loadPendingSyncRecords(ownerUserId));
      setLocalOnlySyncRecords(loadLocalOnlySyncRecords(ownerUserId));
      setSyncStatus(`“${record.archive.material_title}”已重新同步到云端。`);
      try {
        const archiveItems = await api.archive();
        if (
          authEpoch.current === epoch &&
          activeCloudUserId.current === ownerUserId
        ) {
          setArchive(mergeArchiveWithLocalRecovery(archiveItems, ownerUserId));
        }
      } catch {
        if (
          authEpoch.current === epoch &&
          activeCloudUserId.current === ownerUserId
        ) {
          setArchive(loadLocalArchive(ownerUserId));
          setSyncStatus("记录已同步，但云端档案暂时无法刷新；当前显示本机副本。");
        }
      }
    } catch (reason) {
      if (
        authEpoch.current === epoch &&
        activeCloudUserId.current === ownerUserId
      ) {
        const message =
          reason instanceof Error ? reason.message : "重新同步失败，请稍后再试。";
        markStudyRecordSyncFailed(ownerUserId, sessionId, message);
        setPendingSyncRecords(loadPendingSyncRecords(ownerUserId));
        setSyncStatus(message);
      }
    } finally {
      if (
        authEpoch.current === epoch &&
        activeCloudUserId.current === ownerUserId
      ) {
        setSyncingRecordId(null);
      }
    }
  }

  async function retryAllPendingSync() {
    const ownerUserId = activeCloudUserId.current;
    const epoch = authEpoch.current;
    if (!ownerUserId || syncingRecordId !== null) return;
    const records = loadPendingSyncRecords(ownerUserId);
    if (!records.length) return;

    setSyncingRecordId("all");
    setSyncStatus("");
    let succeeded = 0;
    for (const record of records) {
      const retryToken = record.sync?.retryToken;
      if (!retryToken) continue;
      if (
        authEpoch.current !== epoch ||
        activeCloudUserId.current !== ownerUserId
      ) {
        return;
      }
      try {
        await api.retryArchive(retryToken, ownerUserId);
        if (
          authEpoch.current !== epoch ||
          activeCloudUserId.current !== ownerUserId
        ) {
          return;
        }
        markStudyRecordSynced(ownerUserId, record.session.id);
        succeeded += 1;
      } catch (reason) {
        if (
          authEpoch.current !== epoch ||
          activeCloudUserId.current !== ownerUserId
        ) {
          return;
        }
        markStudyRecordSyncFailed(
          ownerUserId,
          record.session.id,
          reason instanceof Error ? reason.message : "重新同步失败，请稍后再试。",
        );
      }
    }

    if (
      authEpoch.current !== epoch ||
      activeCloudUserId.current !== ownerUserId
    ) {
      return;
    }
    const remaining = loadPendingSyncRecords(ownerUserId);
    setPendingSyncRecords(remaining);
    setLocalOnlySyncRecords(loadLocalOnlySyncRecords(ownerUserId));
    setSyncStatus(
      remaining.length
        ? `已同步 ${succeeded} 条，仍有 ${remaining.length} 条保留在本机等待重试。`
        : `已将 ${succeeded} 条记录全部同步到云端。`,
    );
    try {
      const archiveItems = await api.archive();
      if (
        authEpoch.current === epoch &&
        activeCloudUserId.current === ownerUserId
      ) {
        setArchive(mergeArchiveWithLocalRecovery(archiveItems, ownerUserId));
      }
    } catch {
      if (
        authEpoch.current === epoch &&
        activeCloudUserId.current === ownerUserId
      ) {
        setArchive(loadLocalArchive(ownerUserId));
      }
    } finally {
      if (
        authEpoch.current === epoch &&
        activeCloudUserId.current === ownerUserId
      ) {
        setSyncingRecordId(null);
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
        setArchive(
          activeCloudUserId.current
            ? mergeArchiveWithLocalRecovery(archiveItems, activeCloudUserId.current)
            : archiveItems,
        );
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
      studyEnabled={Boolean((material && session) || activeTransferTask)}
      userName={userName}
      onAuth={(mode) => {
        setAuthMode(mode);
        setAuthOpen(true);
      }}
      cloudEnabled={cloudEnabled}
      demoMode={isDemo()}
      degraded={isDegraded()}
      pendingSyncCount={pendingSyncRecords.length}
      localOnlySyncCount={localOnlySyncRecords.length}
      onSignOut={() => {
        const signOutEpoch = ++authEpoch.current;
        void logoutCloudAccount()
          .then(() => {
            if (authEpoch.current !== signOutEpoch) return;
            const publicEpoch = ++authEpoch.current;
            activeCloudUserId.current = null;
            switchEvidenceOwner(null);
            switchTopicsOwner(null);
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
            setDiagnosticAttempt(null);
            setDiagnosticPlan(null);
            setDiagnosticError("");
            setActiveTransferTask(null);
            setTransferResult(undefined);
            transferRequestInFlight.current = false;
            setSyncStatus("");
            setPendingSyncRecords([]);
            setLocalOnlySyncRecords([]);
            setSyncingRecordId(null);
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
          onDiagnose={(id) => void startDiagnostic(id)}
          canDiagnose={Boolean(activeCloudUserId.current)}
          onUpload={(file) => void upload(file)}
          onDelete={(id) => void deleteMaterial(id)}
          busy={busy}
          deletingId={deletingId}
          uploadStatus={uploadStatus}
          onNavigate={(next) => void navigate(next)}
          archive={archive}
          reviewTasks={reviewTasks}
          onStartReview={startReview}
          showTransferQueue={Boolean(activeCloudUserId.current)}
          transferCandidates={transferCandidates}
          transferArchiveCount={transferArchiveCount}
          transferSourceCount={transferSourceCount}
          onStartTransfer={(candidate) => void startTransfer(candidate)}
          pendingSyncRecords={pendingSyncRecords}
          localOnlySyncRecords={localOnlySyncRecords}
          syncingRecordId={syncingRecordId}
          onRetrySync={(sessionId) => void retryPendingSync(sessionId)}
          onRetryAllSync={() => void retryAllPendingSync()}
        />
      )}
      {view === "materials" && (
        <MaterialsView
          materials={materials}
          busy={busy}
          deletingId={deletingId}
          onStart={(id) => void startStudy(id)}
          onUpload={(file) => void upload(file)}
          onDiagnose={(id) => void startDiagnostic(id)}
          canDiagnose={Boolean(activeCloudUserId.current)}
          onDelete={(id) => void deleteMaterial(id)}
          noteCounts={evidenceNoteCounts}
          onViewNotes={(id) => {
            setEvidenceMaterialId(id);
            setView("insights");
          }}
          topics={topics}
          topicsError={topicsError}
          onCreateTopic={createTopicEntry}
          onRenameTopic={renameTopicEntry}
          onDeleteTopic={deleteTopicEntry}
          onAddMaterialToTopic={addMaterialToTopicEntry}
          onRemoveMaterialFromTopic={removeMaterialFromTopicEntry}
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
          evidenceNotes={evidenceNotes}
          materials={materials}
          evidenceMaterialSnapshots={evidenceMaterialSnapshots}
          evidenceMaterialId={evidenceMaterialId}
          onEditEvidenceNote={openExistingEvidenceNote}
          onDeleteEvidenceNote={removeEvidenceNote}
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
      {view === "diagnostic" && diagnosticAttempt && (
        <DiagnosticFlow
          key={diagnosticAttempt.id}
          attempt={diagnosticAttempt}
          busy={busy}
          error={diagnosticError}
          onEvaluate={(answers) => void evaluateDiagnostic(answers)}
          onRefresh={() => void refreshDiagnostic()}
          onAcceptRecommendation={() => void startStudyFromDiagnostic("recommended")}
          onStartFromBeginning={() => void startStudyFromDiagnostic("beginning")}
          onExit={() => {
            setDiagnosticAttempt(null);
            setDiagnosticPlan(null);
            setDiagnosticError("");
            void navigate("home");
          }}
        />
      )}
      {view === "study" && activeTransferTask && (
        <TransferFlow
          key={activeTransferTask.id}
          task={activeTransferTask}
          result={transferResult}
          busy={busy}
          onSubmit={(answer) => void evaluateTransfer(answer)}
          onExit={() => {
            const completed = Boolean(transferResult);
            setActiveTransferTask(null);
            setTransferResult(undefined);
            void navigate(completed ? "archive" : "home");
          }}
        />
      )}
      {view === "study" && !activeTransferTask && material && session && persona && (
        <StudyFlow
          key={session.id}
          material={material}
          session={session}
          persona={persona}
          busy={busy}
          reviewTask={activeReviewTask || undefined}
          diagnosticPlan={diagnosticPlan || undefined}
          onCreateEvidenceNote={openNewEvidenceNote}
          onEvaluate={(answers, retelling) => void evaluate(answers, retelling)}
          onExit={() => {
            setActiveReviewTask(null);
            void navigate(session.result ? "archive" : "home");
          }}
        />
      )}
      {view === "archive" && (
        <ArchiveView
          items={archive}
          pendingSyncRecords={pendingSyncRecords}
          localOnlySyncRecords={localOnlySyncRecords}
          syncingRecordId={syncingRecordId}
          onRetrySync={(sessionId) => void retryPendingSync(sessionId)}
          onRetryAllSync={() => void retryAllPendingSync()}
        />
      )}
      {syncStatus && (
        <div className="degraded-bar" role="status">
          {syncStatus}
        </div>
      )}
      {evidenceDialog && (
        <EvidenceNoteDialog
          context={evidenceDialog.context}
          note={evidenceDialog.note}
          returnFocus={evidenceDialog.returnFocus}
          error={evidenceError}
          onClose={() => {
            setEvidenceDialog(null);
            setEvidenceError("");
          }}
          onSave={saveEvidenceNote}
        />
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
