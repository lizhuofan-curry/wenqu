import { ArrowRight, FolderPlus, Pencil, Play, Trash2, X } from "lucide-react";
import { useState } from "react";
import {
  MAX_TOPIC_DESCRIPTION_LENGTH,
  MAX_TOPIC_NAME_LENGTH,
  topicMaterialStatus,
  type Topic,
  type TopicInput,
} from "../lib/topics";
import type { MaterialSummary } from "../lib/types";

type Props = {
  topics: Topic[];
  materials: MaterialSummary[];
  error: string;
  busy: boolean;
  canDiagnose: boolean;
  onCreate: (input: TopicInput) => void;
  onRename: (topicId: string, name: string) => void;
  onDelete: (topicId: string) => void;
  onAddMaterial: (topicId: string, materialId: string) => void;
  onRemoveMaterial: (topicId: string, materialId: string) => void;
  onStartMaterial: (id: string) => void;
  onDiagnoseMaterial: (id: string) => void;
};

export function TopicsSection({
  topics,
  materials,
  error,
  busy,
  canDiagnose,
  onCreate,
  onRename,
  onDelete,
  onAddMaterial,
  onRemoveMaterial,
  onStartMaterial,
  onDiagnoseMaterial,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  function submitCreate() {
    if (!draftName.trim()) return;
    onCreate({ name: draftName, description: draftDescription || undefined });
    setDraftName("");
    setDraftDescription("");
    setCreating(false);
  }

  function submitRename(topicId: string) {
    if (!renameValue.trim()) return;
    onRename(topicId, renameValue);
    setRenamingId(null);
  }

  return (
    <section className="panel topics-section" aria-labelledby="topics-title">
      <header className="topics-header">
        <div>
          <p className="eyebrow">材料分组</p>
          <h2 id="topics-title">我的专题</h2>
          <p>共 {topics.length} 个专题，专题分组仅保存在此浏览器。跨材料 AI 知识地图将在云端版本提供。</p>
        </div>
        <button
          type="button"
          className="topics-create-button"
          onClick={() => setCreating((value) => !value)}
          aria-expanded={creating}
        >
          <FolderPlus size={16} aria-hidden="true" />
          新建专题
        </button>
      </header>
      {error && <p className="topics-status" role="alert">{error}</p>}
      {creating && (
        <form
          className="topic-create-form"
          onSubmit={(event) => {
            event.preventDefault();
            submitCreate();
          }}
        >
          <input
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            placeholder="专题名称（必填）"
            aria-label="专题名称"
            maxLength={MAX_TOPIC_NAME_LENGTH}
            required
          />
          <input
            value={draftDescription}
            onChange={(event) => setDraftDescription(event.target.value)}
            placeholder="一句话说明（可选）"
            aria-label="专题说明"
            maxLength={MAX_TOPIC_DESCRIPTION_LENGTH}
          />
          <div className="topic-create-actions">
            <button type="submit" disabled={!draftName.trim()}>创建</button>
            <button type="button" onClick={() => setCreating(false)}>取消</button>
          </div>
        </form>
      )}
      {topics.length ? (
        <ol className="topic-list">
          {topics.map((topic) => {
            const members = topic.material_ids.map((materialId) => ({
              id: materialId,
              status: topicMaterialStatus(materialId, materials),
              material: materials.find((item) => item.id === materialId),
            }));
            const availableCount = members.filter((member) => member.status === "available").length;
            const addable = materials.filter((item) => !topic.material_ids.includes(item.id));
            return (
              <li className="topic-card" key={topic.id}>
                <div className="topic-card-heading">
                  {topic.color && (
                    <span className="topic-color-dot" style={{ background: topic.color }} aria-hidden="true" />
                  )}
                  <div>
                    {renamingId === topic.id ? (
                      <form
                        className="topic-rename-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          submitRename(topic.id);
                        }}
                      >
                        <input
                          value={renameValue}
                          onChange={(event) => setRenameValue(event.target.value)}
                          aria-label="新的专题名称"
                          maxLength={MAX_TOPIC_NAME_LENGTH}
                          required
                        />
                        <button type="submit" disabled={!renameValue.trim()}>保存</button>
                        <button type="button" onClick={() => setRenamingId(null)}>取消</button>
                      </form>
                    ) : (
                      <h3>{topic.name}</h3>
                    )}
                    <small>
                      {topic.material_ids.length} 份材料
                      {availableCount !== topic.material_ids.length && `（${topic.material_ids.length - availableCount} 份已删除）`}
                    </small>
                  </div>
                  <div className="topic-card-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingId(topic.id);
                        setRenameValue(topic.name);
                      }}
                      aria-label={`重命名专题：${topic.name}`}
                    >
                      <Pencil size={14} aria-hidden="true" />
                      重命名
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => {
                        if (!window.confirm(`永久删除专题“${topic.name}”吗？材料本身不会被删除，此操作无法恢复。`)) return;
                        onDelete(topic.id);
                      }}
                      aria-label={`删除专题：${topic.name}`}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      删除
                    </button>
                  </div>
                </div>
                {topic.description && <p className="topic-description">{topic.description}</p>}
                {members.length ? (
                  <ul className="topic-member-list">
                    {members.map((member) => (
                      <li key={member.id} className={member.status === "missing_material" ? "missing" : undefined}>
                        {member.status === "available" && member.material ? (
                          <>
                            <span className="topic-member-title">{member.material.title}</span>
                            <span className="topic-member-actions">
                              <button type="button" onClick={() => onStartMaterial(member.id)} disabled={busy}>
                                <Play size={13} aria-hidden="true" />
                                开始陪读
                              </button>
                              {canDiagnose && member.id === "senet-cvpr-2018" && (
                                <button type="button" onClick={() => onDiagnoseMaterial(member.id)} disabled={busy}>
                                  <ArrowRight size={13} aria-hidden="true" />
                                  先做诊断
                                </button>
                              )}
                              <button
                                type="button"
                                className="danger"
                                onClick={() => onRemoveMaterial(topic.id, member.id)}
                                aria-label={`把 ${member.material.title} 移出专题`}
                              >
                                <X size={13} aria-hidden="true" />
                                移出
                              </button>
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="topic-member-title">材料已删除，仍保留在分组中</span>
                            <span className="topic-member-actions">
                              <button
                                type="button"
                                className="danger"
                                onClick={() => onRemoveMaterial(topic.id, member.id)}
                                aria-label="从专题中移除已删除的材料"
                              >
                                <X size={13} aria-hidden="true" />
                                移除
                              </button>
                            </span>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="topic-empty-members">还没有材料，从下方选择加入。</p>
                )}
                <label className="topic-add-material">
                  <span className="sr-only">把材料加入专题：{topic.name}</span>
                  <select
                    value=""
                    disabled={!addable.length}
                    onChange={(event) => {
                      if (event.target.value) onAddMaterial(topic.id, event.target.value);
                      event.target.value = "";
                    }}
                  >
                    <option value="">{addable.length ? "把材料加入专题…" : "所有材料都已加入"}</option>
                    {addable.map((item) => (
                      <option value={item.id} key={item.id}>{item.title}</option>
                    ))}
                  </select>
                </label>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="topics-empty">
          <h3>还没有专题</h3>
          <p>把同一主题的论文和笔记归为一组，便于集中复习与对比。</p>
        </div>
      )}
    </section>
  );
}
