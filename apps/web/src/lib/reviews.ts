import type { ArchiveItem, ReviewTask } from "./types";

export const REVIEW_INTERVAL_DAYS = [1, 3, 7] as const;

function addUtcDays(isoDate: string, days: number) {
  const value = new Date(isoDate);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString();
}

export function buildReviewTasks(
  items: ArchiveItem[],
  now = new Date(),
): ReviewTask[] {
  const completedKeys = new Set(
    items.flatMap((item) =>
      item.review
        ? [`${item.review.source_session_id}:${item.review.interval_days}`]
        : [],
    ),
  );

  return items
    .filter((item) => !item.review)
    .flatMap((item) =>
      REVIEW_INTERVAL_DAYS.map((intervalDays) => {
        const dueAt = addUtcDays(item.completed_at, intervalDays);
        const key = `${item.session_id}:${intervalDays}`;
        return {
          id: key,
          source_session_id: item.session_id,
          material_id: item.material_id,
          material_title: item.material_title,
          persona_name: item.persona_name,
          interval_days: intervalDays,
          due_at: dueAt,
          status: completedKeys.has(key) ? "completed" : "pending",
          source_mastery: item.mastery,
          source_headline: item.headline,
          source_misconception_tags: item.misconception_tags,
          source_answers: item.answers || [],
          source_retelling: item.retelling,
        } satisfies ReviewTask;
      }),
    )
    .filter((task) => task.status === "pending")
    .sort((a, b) => {
      const aDue = new Date(a.due_at).getTime() <= now.getTime();
      const bDue = new Date(b.due_at).getTime() <= now.getTime();
      if (aDue !== bDue) return aDue ? -1 : 1;
      return a.due_at.localeCompare(b.due_at);
    });
}

export function isReviewDue(task: ReviewTask, now = new Date()) {
  return new Date(task.due_at).getTime() <= now.getTime();
}

export function reviewTimingLabel(task: ReviewTask, now = new Date()) {
  const due = new Date(task.due_at);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const dayOffset = Math.round((dueDay.getTime() - today.getTime()) / 86_400_000);
  if (dayOffset < 0) return `已到期 ${Math.abs(dayOffset)} 天`;
  if (dayOffset === 0) return "今天到期";
  if (dayOffset === 1) return "明天复习";
  return `${dayOffset} 天后复习`;
}
