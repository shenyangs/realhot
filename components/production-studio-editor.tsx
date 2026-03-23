"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { StagedTaskStatusBlock } from "@/components/staged-task-status-block";
import type { AiProvider } from "@/lib/domain/ai-routing";
import type { ProductionJobRecord } from "@/lib/services/production-studio";

type ProductionJobType = "article" | "video" | "one_click";
type RewriteSelectionField = "title" | "body";

interface RewriteSelectionState {
  field: RewriteSelectionField;
  start: number;
  end: number;
  text: string;
}

interface SelectionRewriteDiffPart {
  value: string;
  kind: "same" | "removed" | "added";
}

interface SelectionRewriteHistoryEntry {
  field: RewriteSelectionField;
  beforeText: string;
  afterText: string;
  request: string;
  summary: string;
}

interface SelectionRewriteUndoState {
  field: RewriteSelectionField;
  beforeFullValue: string;
  afterFullValue: string;
  beforeSelectionStart: number;
  beforeSelectionEnd: number;
}

interface SelectionRewriteRecord extends SelectionRewriteHistoryEntry, SelectionRewriteUndoState {}

const providerLabels: Record<AiProvider, string> = {
  gemini: "Gemini",
  minimax: "MiniMax M2.7"
};

const jobTypeLabels: Record<ProductionJobType, string> = {
  article: "图文",
  video: "视频",
  one_click: "图文+视频"
};

const selectionFieldLabels: Record<RewriteSelectionField, string> = {
  title: "标题",
  body: "正文"
};

const selectionPromptOptions = ["更口语一点", "更精炼有力", "改成更像公众号成稿", "保留原意但更有观点"];

function tokenizeForDiff(value: string) {
  return value.match(/[\u4e00-\u9fff]|[A-Za-z0-9]+|\s+|./g) ?? [];
}

function buildSelectionRewriteDiff(before: string, after: string): SelectionRewriteDiffPart[] {
  const beforeTokens = tokenizeForDiff(before);
  const afterTokens = tokenizeForDiff(after);
  const dp = Array.from({ length: beforeTokens.length + 1 }, () => Array(afterTokens.length + 1).fill(0));

  for (let i = beforeTokens.length - 1; i >= 0; i -= 1) {
    for (let j = afterTokens.length - 1; j >= 0; j -= 1) {
      if (beforeTokens[i] === afterTokens[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const parts: SelectionRewriteDiffPart[] = [];

  function pushPart(kind: SelectionRewriteDiffPart["kind"], value: string) {
    if (!value) {
      return;
    }

    const previous = parts[parts.length - 1];

    if (previous?.kind === kind) {
      previous.value += value;
      return;
    }

    parts.push({ kind, value });
  }

  let beforeIndex = 0;
  let afterIndex = 0;

  while (beforeIndex < beforeTokens.length && afterIndex < afterTokens.length) {
    if (beforeTokens[beforeIndex] === afterTokens[afterIndex]) {
      pushPart("same", beforeTokens[beforeIndex]);
      beforeIndex += 1;
      afterIndex += 1;
      continue;
    }

    if (dp[beforeIndex + 1][afterIndex] >= dp[beforeIndex][afterIndex + 1]) {
      pushPart("removed", beforeTokens[beforeIndex]);
      beforeIndex += 1;
    } else {
      pushPart("added", afterTokens[afterIndex]);
      afterIndex += 1;
    }
  }

  while (beforeIndex < beforeTokens.length) {
    pushPart("removed", beforeTokens[beforeIndex]);
    beforeIndex += 1;
  }

  while (afterIndex < afterTokens.length) {
    pushPart("added", afterTokens[afterIndex]);
    afterIndex += 1;
  }

  return parts;
}

function parseProductionApiErrorMessage(raw: string, jobType: ProductionJobType) {
  const fallback = `${jobTypeLabels[jobType]}生成失败`;

  if (!raw) {
    return fallback;
  }

  try {
    const payload = JSON.parse(raw) as {
      ok?: boolean;
      error?: string;
    };

    return payload?.error?.trim() || fallback;
  } catch {
    const normalized = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    if (!normalized) {
      return fallback;
    }

    if (normalized.toLowerCase().includes("<!doctype") || normalized.toLowerCase().includes("<html")) {
      return `${fallback}，服务端返回了非接口格式内容，请检查 Vercel 部署日志。`;
    }

    return normalized.slice(0, 180);
  }
}

function isAiProvider(value: string | null | undefined): value is AiProvider {
  return value === "gemini" || value === "minimax";
}

function resolveSelectedProvider(job: ProductionJobRecord | null, fallback: AiProvider) {
  if (isAiProvider(job?.route.requestedProvider)) {
    return job.route.requestedProvider;
  }

  if (isAiProvider(job?.route.effectiveProvider)) {
    return job.route.effectiveProvider;
  }

  return fallback;
}

function stageStatusLabel(status: "pending" | "processing" | "done" | "failed") {
  if (status === "done") {
    return "完成";
  }

  if (status === "processing") {
    return "进行中";
  }

  if (status === "failed") {
    return "失败";
  }

  return "待执行";
}

function stageTone(status: "pending" | "processing" | "done" | "failed") {
  if (status === "done") {
    return "positive";
  }

  if (status === "failed") {
    return "warning";
  }

  return "neutral";
}

function parseProductionJobPayload(raw: string) {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as {
      ok?: boolean;
      error?: string;
      job?: ProductionJobRecord;
    };
  } catch {
    return null;
  }
}

export function ProductionStudioEditor({
  packId,
  initialJob,
  canRun,
  defaultProvider = "minimax",
  defaultModel: _defaultModel
}: {
  packId: string;
  initialJob: ProductionJobRecord | null;
  canRun: boolean;
  defaultProvider?: AiProvider;
  defaultModel?: string;
}) {
  const router = useRouter();
  const autoContinueSectionRef = useRef<HTMLElement | null>(null);
  const selectionCompareSectionRef = useRef<HTMLElement | null>(null);
  const pendingCompareScrollRef = useRef(false);
  const articleTitleInputRef = useRef<HTMLInputElement | null>(null);
  const articleBodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const articleTitleDirtyRef = useRef(false);
  const articleBodyDirtyRef = useRef(false);
  const [currentJob, setCurrentJob] = useState(initialJob);
  const [articleTitle, setArticleTitle] = useState(initialJob?.outputs.articleTitle ?? "");
  const [articleBody, setArticleBody] = useState(initialJob?.outputs.articleBody ?? "");
  const [videoScript, setVideoScript] = useState(initialJob?.outputs.videoScript ?? "");
  const [voiceoverText, setVoiceoverText] = useState(initialJob?.outputs.voiceoverText ?? "");
  const [subtitleSrt, setSubtitleSrt] = useState(initialJob?.outputs.subtitleSrt ?? "");
  const [provider, setProvider] = useState<AiProvider>(resolveSelectedProvider(initialJob, defaultProvider));
  const [imageProvider, setImageProvider] = useState<AiProvider>("minimax");
  const [videoProvider] = useState<AiProvider>("minimax");
  const [message, setMessage] = useState("");
  const [continuationMessage, setContinuationMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isSelectionRewritePending, startSelectionRewriteTransition] = useTransition();
  const [pendingJobType, setPendingJobType] = useState<ProductionJobType | null>(null);
  const [isAutoContinuing, setIsAutoContinuing] = useState(false);
  const [rewriteSelection, setRewriteSelection] = useState<RewriteSelectionState | null>(null);
  const [selectionPrompt, setSelectionPrompt] = useState("");
  const [selectionRewriteMessage, setSelectionRewriteMessage] = useState("");
  const [lastSelectionRewrite, setLastSelectionRewrite] = useState<SelectionRewriteHistoryEntry | null>(null);
  const [selectionUndoStack, setSelectionUndoStack] = useState<SelectionRewriteRecord[]>([]);
  const [hasAutoTriggered, setHasAutoTriggered] = useState(
    initialJob?.outputs.draftProgress.articlePhase === "expanded"
  );

  function syncDraftFromJob(job: ProductionJobRecord | null, options?: { preserveDirty?: boolean; resetDirty?: boolean }) {
    setCurrentJob(job);
    setRewriteSelection(null);
    setSelectionRewriteMessage("");
    setLastSelectionRewrite(null);
    setSelectionUndoStack([]);

    if (!job) {
      if (!options?.preserveDirty || !articleTitleDirtyRef.current) {
        setArticleTitle("");
      }
      if (!options?.preserveDirty || !articleBodyDirtyRef.current) {
        setArticleBody("");
      }
      setVideoScript("");
      setVoiceoverText("");
      setSubtitleSrt("");
      return;
    }

    if (options?.resetDirty) {
      articleTitleDirtyRef.current = false;
      articleBodyDirtyRef.current = false;
    }

    if (!options?.preserveDirty || !articleTitleDirtyRef.current) {
      setArticleTitle(job.outputs.articleTitle ?? "");
    }

    if (!options?.preserveDirty || !articleBodyDirtyRef.current) {
      setArticleBody(job.outputs.articleBody ?? "");
    }

    setVideoScript(job.outputs.videoScript ?? "");
    setVoiceoverText(job.outputs.voiceoverText ?? "");
    setSubtitleSrt(job.outputs.subtitleSrt ?? "");
  }

  useEffect(() => {
    syncDraftFromJob(initialJob, { resetDirty: true });
    setProvider(resolveSelectedProvider(initialJob, defaultProvider));
    setImageProvider("minimax");
    setHasAutoTriggered(initialJob?.outputs.draftProgress.articlePhase === "expanded");
    setContinuationMessage("");
  }, [defaultProvider, initialJob]);

  const shouldAutoContinue =
    currentJob?.jobType === "article" &&
    currentJob.outputs.draftProgress.articlePhase === "initial" &&
    currentJob.outputs.draftProgress.shouldAutoExpandOnScroll;

  async function continueArticleGeneration(trigger: "auto" | "manual") {
    if (!currentJob || !shouldAutoContinue || isAutoContinuing) {
      return;
    }

    try {
      setIsAutoContinuing(true);
      setContinuationMessage(
        trigger === "auto"
          ? "你已经滑到下半段，系统正在自动补全文案后半段和封面提示词。"
          : "正在继续补全后半段，请稍等。"
      );

      const response = await fetch(`/api/production/packs/${packId}/continue`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          provider,
          imageProvider
        })
      });

      const raw = await response.text().catch(() => "");
      const payload = parseProductionJobPayload(raw);

      if (!response.ok || !payload?.ok || !payload.job) {
        setContinuationMessage(payload?.error?.trim() || "补全后半段失败，请稍后重试。");
        return;
      }

      syncDraftFromJob(payload.job, { preserveDirty: true });
      setHasAutoTriggered(true);
      setContinuationMessage("完整正文已经补全，现在看到的是可继续编辑的完整版。");
      router.refresh();
    } catch (error) {
      setContinuationMessage(error instanceof Error ? error.message : "补全后半段失败，请稍后重试。");
    } finally {
      setIsAutoContinuing(false);
    }
  }

  useEffect(() => {
    if (!shouldAutoContinue || hasAutoTriggered || isAutoContinuing || !autoContinueSectionRef.current) {
      return;
    }

    const target = autoContinueSectionRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }

        setHasAutoTriggered(true);
        void continueArticleGeneration("auto");
        observer.disconnect();
      },
      {
        rootMargin: "0px 0px 360px 0px",
        threshold: 0.1
      }
    );

    observer.observe(target);

    return () => observer.disconnect();
  }, [hasAutoTriggered, isAutoContinuing, shouldAutoContinue, currentJob?.id, provider, imageProvider]);

  useEffect(() => {
    if (!lastSelectionRewrite || !pendingCompareScrollRef.current || !selectionCompareSectionRef.current) {
      return;
    }

    pendingCompareScrollRef.current = false;

    window.requestAnimationFrame(() => {
      selectionCompareSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
      });
    });
  }, [lastSelectionRewrite]);

  function updateRewriteSelection(
    field: RewriteSelectionField,
    target: HTMLInputElement | HTMLTextAreaElement
  ) {
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? start;
    const nextText = target.value.slice(start, end);

    if (start === end || !nextText.trim()) {
      setRewriteSelection((current) => (current?.field === field ? null : current));
      return;
    }

    setRewriteSelection({
      field,
      start,
      end,
      text: nextText
    });
  }

  function focusSelection(field: RewriteSelectionField, start: number, end: number) {
    window.requestAnimationFrame(() => {
      const target = field === "title" ? articleTitleInputRef.current : articleBodyTextareaRef.current;

      if (!target) {
        return;
      }

      target.focus();
      target.setSelectionRange(start, end);
    });
  }

  function clearRewriteSelection() {
    if (!rewriteSelection) {
      setSelectionRewriteMessage("");
      return;
    }

    const target = rewriteSelection.field === "title" ? articleTitleInputRef.current : articleBodyTextareaRef.current;

    if (target) {
      target.focus();
      target.setSelectionRange(rewriteSelection.end, rewriteSelection.end);
    }

    setRewriteSelection(null);
    setSelectionRewriteMessage("");
  }

  function fillSelectionPrompt(nextPrompt: string) {
    setSelectionPrompt((current) => (current.trim() ? `${current.trim()}；${nextPrompt}` : nextPrompt));
  }

  function runSelectionRewrite() {
    if (!rewriteSelection) {
      setSelectionRewriteMessage("先在左侧标题或正文里选中你想改的那段文字。");
      return;
    }

    if (!selectionPrompt.trim()) {
      setSelectionRewriteMessage("先在右侧写下这轮改稿要求。");
      return;
    }

    startSelectionRewriteTransition(async () => {
      const activeValue = rewriteSelection.field === "title" ? articleTitle : articleBody;
      const latestSelectedText = activeValue.slice(rewriteSelection.start, rewriteSelection.end);

      if (!latestSelectedText.trim()) {
        setSelectionRewriteMessage("当前选区已经变化，请重新选中后再试。");
        setRewriteSelection(null);
        return;
      }

      setSelectionRewriteMessage("");

      try {
        const response = await fetch("/api/rewrite/selection", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            targetField: rewriteSelection.field,
            selectedText: latestSelectedText,
            selectionStart: rewriteSelection.start,
            selectionEnd: rewriteSelection.end,
            currentTitle: articleTitle,
            currentBody: articleBody,
            userRequest: selectionPrompt
          })
        });

        const payload = (await response.json().catch(() => null)) as
          | {
              ok?: boolean;
              rewrittenText?: string;
              changeSummary?: string;
              error?: string;
            }
          | null;

        if (!response.ok || !payload?.ok) {
          setSelectionRewriteMessage(payload?.error ?? "选区改稿失败");
          return;
        }

        const rewrittenText = payload.rewrittenText?.trim() || latestSelectedText;

        if (rewrittenText === latestSelectedText) {
          pendingCompareScrollRef.current = true;
          setLastSelectionRewrite({
            field: rewriteSelection.field,
            beforeText: latestSelectedText,
            afterText: rewrittenText,
            request: selectionPrompt,
            summary: payload.changeSummary ?? "这轮返回与原文一致，没有发生替换。"
          });
          setSelectionPrompt("");
          setSelectionRewriteMessage(payload.changeSummary ?? "这轮返回与原文一致，没有发生替换。");
          focusSelection(rewriteSelection.field, rewriteSelection.start, rewriteSelection.end);
          return;
        }

        const nextValue =
          activeValue.slice(0, rewriteSelection.start) + rewrittenText + activeValue.slice(rewriteSelection.end);
        const nextSelection = {
          field: rewriteSelection.field,
          start: rewriteSelection.start,
          end: rewriteSelection.start + rewrittenText.length,
          text: rewrittenText
        } satisfies RewriteSelectionState;

        if (rewriteSelection.field === "title") {
          articleTitleDirtyRef.current = true;
          setArticleTitle(nextValue);
        } else {
          articleBodyDirtyRef.current = true;
          setArticleBody(nextValue);
        }

        const nextRecord = {
          field: rewriteSelection.field,
          beforeText: latestSelectedText,
          afterText: rewrittenText,
          request: selectionPrompt,
          summary: payload.changeSummary ?? "已只替换你选中的那段文字。",
          beforeFullValue: activeValue,
          afterFullValue: nextValue,
          beforeSelectionStart: rewriteSelection.start,
          beforeSelectionEnd: rewriteSelection.end
        } satisfies SelectionRewriteRecord;

        pendingCompareScrollRef.current = true;
        setLastSelectionRewrite(nextRecord);
        setSelectionUndoStack((current) => [...current, nextRecord]);
        setRewriteSelection(nextSelection);
        setSelectionPrompt("");
        setSelectionRewriteMessage(payload?.changeSummary ?? "已只替换你选中的那段文字。");
        focusSelection(nextSelection.field, nextSelection.start, nextSelection.end);
      } catch (error) {
        setSelectionRewriteMessage(error instanceof Error ? error.message : "选区改稿失败");
      }
    });
  }

  function undoLastSelectionRewrite() {
    const latestUndoRecord = selectionUndoStack[selectionUndoStack.length - 1];

    if (!latestUndoRecord) {
      setSelectionRewriteMessage("当前没有可撤销的局部改稿。");
      return;
    }

    const currentValue = latestUndoRecord.field === "title" ? articleTitle : articleBody;

    if (currentValue !== latestUndoRecord.afterFullValue) {
      setSelectionRewriteMessage("这次局部改稿后你又继续改了内容，无法安全一键撤销。");
      return;
    }

    if (latestUndoRecord.field === "title") {
      articleTitleDirtyRef.current = true;
      setArticleTitle(latestUndoRecord.beforeFullValue);
    } else {
      articleBodyDirtyRef.current = true;
      setArticleBody(latestUndoRecord.beforeFullValue);
    }

    setRewriteSelection({
      field: latestUndoRecord.field,
      start: latestUndoRecord.beforeSelectionStart,
      end: latestUndoRecord.beforeSelectionEnd,
      text: latestUndoRecord.beforeFullValue.slice(
        latestUndoRecord.beforeSelectionStart,
        latestUndoRecord.beforeSelectionEnd
      )
    });
    const remainingStack = selectionUndoStack.slice(0, -1);
    setSelectionUndoStack(remainingStack);
    setLastSelectionRewrite(remainingStack.length > 0 ? remainingStack[remainingStack.length - 1] : null);
    setSelectionRewriteMessage(remainingStack.length > 0 ? "已撤销一步，你还可以继续撤销更早的局部改稿。" : "已撤销刚才这次局部改稿。");
    focusSelection(
      latestUndoRecord.field,
      latestUndoRecord.beforeSelectionStart,
      latestUndoRecord.beforeSelectionEnd
    );
  }

  function renderSelectionRewriteDiff(target: "before" | "after") {
    if (!lastSelectionRewrite) {
      return null;
    }

    const parts = buildSelectionRewriteDiff(lastSelectionRewrite.beforeText, lastSelectionRewrite.afterText);

    return parts
      .filter((part) => {
        if (target === "before") {
          return part.kind !== "added";
        }

        return part.kind !== "removed";
      })
      .map((part, index) => (
        <span
          className={
            part.kind === "removed"
              ? "productionDiffToken productionDiffTokenRemoved"
              : part.kind === "added"
                ? "productionDiffToken productionDiffTokenAdded"
                : "productionDiffToken"
          }
          key={`${target}-${index}-${part.kind}`}
        >
          {part.value}
        </span>
      ));
  }

  function runProduction(jobType: ProductionJobType) {
    if (!canRun) {
      setMessage("当前选题还未审核通过，不能执行一键制作。");
      return;
    }

    startTransition(async () => {
      try {
        setMessage("");
        setContinuationMessage("");
        setPendingJobType(jobType);

        const response = await fetch("/api/production/one-click", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            packId,
            jobType,
            provider,
            imageProvider,
            videoProvider
          })
        });

        const raw = await response.text().catch(() => "");
        const payload = parseProductionJobPayload(raw);

        if (!response.ok || !payload?.ok || !payload.job) {
          setMessage(payload?.error?.trim() || parseProductionApiErrorMessage(raw, jobType));
          return;
        }

        syncDraftFromJob(payload.job, { resetDirty: true });
        setHasAutoTriggered(payload.job.outputs.draftProgress.articlePhase === "expanded");

        const effectiveProvider = payload.job.route.effectiveProvider;
        const providerLabel = isAiProvider(effectiveProvider) ? providerLabels[effectiveProvider] : providerLabels[provider];

        if (payload.job.outputs.draftProgress.articlePhase === "initial") {
          setMessage(`已先生成首屏图文，脚本使用${providerLabel}。继续往下看时，系统会自动补全文案后半段。`);
        } else {
          setMessage(`已完成${jobTypeLabels[jobType]}制作，脚本使用${providerLabel}，当前已经是完整版。`);
        }

        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "一键制作请求失败，请稍后重试。");
      } finally {
        setPendingJobType(null);
      }
    });
  }

  function saveDraft() {
    if (!currentJob) {
      setMessage("请先执行一键制作，再保存编辑内容。");
      return;
    }

    startTransition(async () => {
      try {
        setMessage("");

        const response = await fetch(`/api/production/packs/${packId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            articleTitle,
            articleBody,
            videoScript,
            voiceoverText,
            subtitleSrt
          })
        });

        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          job?: ProductionJobRecord;
        } | null;

        if (!response.ok || !payload?.ok) {
          setMessage(payload?.error ?? "保存失败");
          return;
        }

        if (payload?.job) {
          syncDraftFromJob(payload.job, { resetDirty: true });
        }

        setMessage("已保存到最终热点运营平台。\n你可以继续微调后再推入发布队列。");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "保存请求失败，请稍后重试。");
      }
    });
  }

  function pushToPublishQueue() {
    if (!currentJob) {
      setMessage("请先执行一键制作，再推入发布队列。");
      return;
    }

    startTransition(async () => {
      try {
        setMessage("");

        const response = await fetch(`/api/production/packs/${packId}/publish-bundle`, {
          method: "POST"
        });

        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          queuedCount?: number;
          error?: string;
        } | null;

        if (!response.ok || !payload?.ok) {
          setMessage(payload?.error ?? "推入发布队列失败");
          return;
        }

        setMessage(`已推入发布队列，共 ${payload.queuedCount ?? 0} 条任务。`);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "推入发布队列请求失败，请稍后重试。");
      }
    });
  }

  return (
    <div className="productionStudioStack">
      <section className="panel">
        <div className="panelHeader sectionTitle">
          <div>
            <p className="eyebrow">图文制作</p>
            <h3>先把图文成稿做出来</h3>
          </div>
        </div>

        {currentJob ? (
          <>
            <div className="productionStageGrid">
              {currentJob.stages.map((stage) => (
                <article className="productionStageCard" key={stage.key}>
                  <div className="listItem">
                    <strong>{stage.label}</strong>
                    <span className={`pill pill-${stageTone(stage.status)}`}>{stageStatusLabel(stage.status)}</span>
                  </div>
                  <p className="muted">智能执行阶段</p>
                  <p className="muted">{stage.note}</p>
                </article>
              ))}
            </div>

            <p className="muted">
              第 {currentJob.runCount} 次制作 · 任务 {jobTypeLabels[currentJob.jobType]} · 模式 {currentJob.mode} · 更新时间{" "}
              {new Date(currentJob.updatedAt).toLocaleString("zh-CN")}
            </p>
          </>
        ) : (
          <p className="muted">当前还没有图文结果。点击下方按钮，先生成一版可编辑的图文成稿。</p>
        )}

        <label className="field fieldCompact">
          <span>本次制作引擎</span>
          <select
            disabled={isPending || isAutoContinuing || !canRun}
            onChange={(event) => setProvider(event.target.value as AiProvider)}
            value={provider}
          >
            <option value="minimax">引擎 A（默认）</option>
            <option value="gemini">引擎 B</option>
          </select>
          <span className="muted">将使用 {providerLabels[provider]}，系统会自动选择具体模型。</span>
        </label>

        <label className="field fieldCompact">
          <span>图片策划模型</span>
          <select
            disabled={isPending || isAutoContinuing || !canRun}
            onChange={(event) => setImageProvider(event.target.value as AiProvider)}
            value={imageProvider}
          >
            <option value="minimax">MiniMax M2.7（默认）</option>
            <option value="gemini">Gemini</option>
          </select>
          <span className="muted">只影响图片提示词规划，实际生图引擎保持不变。</span>
        </label>

        <p className="muted productionDeferredHint">视频生成、字幕和口播先后放。当前制作台先聚焦图文内容生成、预览和编辑。</p>

        <div className="buttonRow">
          <button disabled={isPending || isAutoContinuing || !canRun} onClick={() => runProduction("article")} type="button">
            {isPending && pendingJobType === "article" ? "执行中..." : currentJob ? "重新生成图文" : "生成图文"}
          </button>
          <button disabled={isPending || isAutoContinuing || !currentJob} onClick={saveDraft} type="button">
            保存当前修改
          </button>
          <button disabled={isPending || isAutoContinuing || !currentJob} onClick={pushToPublishQueue} type="button">
            推入发布队列
          </button>
        </div>

        {message ? <p className="muted">{message}</p> : null}
      </section>

      {currentJob ? (
        <>
          <section className="panel productionArticlePreviewPanel">
            <div className="panelHeader sectionTitle">
              <div>
                <p className="eyebrow">图文预览</p>
                <h3>当前首版成稿</h3>
              </div>
            </div>

            <article className="productionArticleCard">
              <p className="eyebrow">标题</p>
              <h3>{articleTitle || "标题待生成"}</h3>
              <div className="productionArticleBody">
                {articleBody
                  .split(/\n+/)
                  .map((paragraph) => paragraph.trim())
                  .filter(Boolean)
                  .map((paragraph, index) => (
                    <p key={`${index}-${paragraph.slice(0, 12)}`}>{paragraph}</p>
                  ))}
              </div>
            </article>

            <article className="productionPreviewCard">
              <p className="eyebrow">封面预览（占位）</p>
              <img alt="封面预览" src={currentJob.outputs.imagePreviewUrl} />
            </article>
          </section>

          <section className="panel" ref={autoContinueSectionRef}>
            <StagedTaskStatusBlock
              actionBusyLabel="补全中..."
              actionDisabled={isPending || isAutoContinuing}
              actionLabel="立即补全后半段"
              eyebrow="下半段补全"
              isBusy={isAutoContinuing}
              message={continuationMessage}
              onAction={shouldAutoContinue ? () => void continueArticleGeneration("manual") : undefined}
              progressDescription={
                shouldAutoContinue
                  ? "现在先展示最先该看到的部分。你滑到这里时，系统会自动补全后半段正文和封面提示词。"
                  : "后半段正文已经补完，现在这里展示的是完整可编辑版本。"
              }
              progressLabel="当前阶段"
              progressValue={shouldAutoContinue ? "首屏版" : "完整版"}
              strategyDescription={
                shouldAutoContinue
                  ? "首屏阶段先不等待图片策划，避免你点一次就卡很久。"
                  : "完整正文补全后，系统会同步更新封面提示词，后续可继续接生图。"
              }
              strategyTitle={shouldAutoContinue ? "封面提示词待补全" : "封面提示词已准备"}
              title={shouldAutoContinue ? "往下看时自动继续跑" : "当前已经是完整正文"}
            />
          </section>

          <section className="panel productionFormGrid">
            <label className="field">
              <span>图文标题</span>
              <input
                ref={articleTitleInputRef}
                onChange={(event) => {
                  articleTitleDirtyRef.current = true;
                  setArticleTitle(event.target.value);
                  updateRewriteSelection("title", event.currentTarget);
                }}
                onKeyUp={(event) => updateRewriteSelection("title", event.currentTarget)}
                onMouseUp={(event) => updateRewriteSelection("title", event.currentTarget)}
                onSelect={(event) => updateRewriteSelection("title", event.currentTarget)}
                value={articleTitle}
              />
            </label>

            <div className="productionEditorBodyGrid">
              <label className="field productionEditorMainField">
                <span>图文正文</span>
                <textarea
                  ref={articleBodyTextareaRef}
                  onChange={(event) => {
                    articleBodyDirtyRef.current = true;
                    setArticleBody(event.target.value);
                    updateRewriteSelection("body", event.currentTarget);
                  }}
                  onKeyUp={(event) => updateRewriteSelection("body", event.currentTarget)}
                  onMouseUp={(event) => updateRewriteSelection("body", event.currentTarget)}
                  onSelect={(event) => updateRewriteSelection("body", event.currentTarget)}
                  rows={16}
                  value={articleBody}
                />
                <span className="muted">先在标题或正文里选中文字，再到右侧输入改稿要求，系统只会替换你选中的那一段。</span>
              </label>

              <aside className="summaryCard productionSelectionAssistant">
                <div className="listItem">
                  <div>
                    <p className="eyebrow">选区改稿</p>
                    <h3>只改你选中的文字</h3>
                  </div>
                  <span className={`pill pill-${rewriteSelection ? "positive" : "neutral"}`}>
                    {rewriteSelection ? `当前选中${selectionFieldLabels[rewriteSelection.field]}` : "等待选区"}
                  </span>
                </div>

                <p className="muted">
                  在左侧框选一段内容后，再在这里输入要求，比如“更口语一点”或“压缩成更有力的表达”。
                </p>

                <div className="productionSelectionMeta">
                  <span className="pill pill-neutral">
                    {rewriteSelection ? `位置：${selectionFieldLabels[rewriteSelection.field]}` : "位置：未选择"}
                  </span>
                  <span className="pill pill-neutral">
                    {rewriteSelection ? `长度：${rewriteSelection.text.replace(/\s+/g, "").length} 字` : "长度：0 字"}
                  </span>
                </div>

                <div className="productionSelectionPreview">
                  {rewriteSelection?.text || "先在左侧选中你要改的标题片段或正文片段，这里会显示选中的原文。"}
                </div>

                <div className="promptChips">
                  {selectionPromptOptions.map((item) => (
                    <button className="promptChip" key={item} onClick={() => fillSelectionPrompt(item)} type="button">
                      {item}
                    </button>
                  ))}
                </div>

                <label className="field">
                  <span>改稿要求</span>
                  <textarea
                    className="productionSelectionPrompt"
                    onChange={(event) => setSelectionPrompt(event.target.value)}
                    placeholder="例如：保留原意，但语气更像成熟公众号成稿。"
                    rows={5}
                    value={selectionPrompt}
                  />
                </label>

                <div className="buttonRow productionSelectionActions">
                  <button
                    disabled={isSelectionRewritePending || !rewriteSelection}
                    onClick={runSelectionRewrite}
                    type="button"
                  >
                    {isSelectionRewritePending ? "改稿中..." : "只改选中内容"}
                  </button>
                  <button
                    className="buttonLike subtleButton"
                    disabled={isSelectionRewritePending || !rewriteSelection}
                    onClick={clearRewriteSelection}
                    type="button"
                  >
                    清空选区
                  </button>
                </div>

                <p className="muted">
                  {selectionRewriteMessage || "改完后只会替换你当前选中的那段文字，其他正文不会被重写。"}
                </p>

                {lastSelectionRewrite ? (
                  <section className="productionSelectionCompare" ref={selectionCompareSectionRef}>
                    <div className="listItem">
                      <div>
                        <strong>本次改稿前后对比</strong>
                        <p className="muted">
                          {selectionFieldLabels[lastSelectionRewrite.field]} · {lastSelectionRewrite.summary}
                        </p>
                      </div>
                      <button
                        className="buttonLike subtleButton"
                        disabled={isSelectionRewritePending || selectionUndoStack.length === 0}
                        onClick={undoLastSelectionRewrite}
                        type="button"
                      >
                        {selectionUndoStack.length > 1 ? `撤销上一步（剩 ${selectionUndoStack.length} 步）` : "撤销这次改稿"}
                      </button>
                    </div>

                    <p className="muted">本轮要求：{lastSelectionRewrite.request}</p>

                    <div className="productionSelectionCompareGrid">
                      <div className="productionSelectionCompareCard">
                        <span className="eyebrow">改稿前</span>
                        <div className="productionSelectionDiffText">{renderSelectionRewriteDiff("before")}</div>
                      </div>
                      <div className="productionSelectionCompareCard">
                        <span className="eyebrow">改稿后</span>
                        <div className="productionSelectionDiffText">{renderSelectionRewriteDiff("after")}</div>
                      </div>
                    </div>

                    <p className="muted">绿色是新增内容，红色是被替换掉的内容。若你之后又继续手改同一段，为避免误伤，就不会再允许一键撤销。</p>
                  </section>
                ) : null}
              </aside>
            </div>

            <div className="summaryCard productionDeferredCard">
              <p className="eyebrow">后续能力</p>
              <h3>视频生成先不作为当前交付重点</h3>
              <p className="muted">视频脚本、TTS 和字幕字段先保留在系统内部，等图文能力稳定后再开放到界面里。</p>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
