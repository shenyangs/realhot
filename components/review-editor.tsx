"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  formatLocalTimestamp,
  getDraftStorageKey,
  type StoredDraftPayload,
  type StoredDraftSnapshot
} from "@/lib/client/persistence";
import {
  countVisibleChars,
  enforceBodyMinimumWithContext,
  resolveMinimumCharsForLabels
} from "@/lib/services/content-quality";

interface ReviewEditorProps {
  packId: string;
  variantId: string;
  platformKey: string;
  decisionAnchorId?: string;
  brandName: string;
  brandTone: string[];
  redLines: string[];
  platformLabel: string;
  trackLabel: string;
  angle: string;
  whyNow: string;
  whyUs: string;
  initialTitle: string;
  initialBody: string;
  initialHook: string;
}

interface ChangeLogItem {
  id: string;
  mode: "direct" | "suggest";
  request: string;
  summary: string;
  provider: string;
  createdAt: string;
  applied: boolean;
  appliedAt?: string;
}

interface SuggestionState {
  changeLogId: string;
  title: string;
  body: string;
  summary: string;
  provider: string;
}

function buildPromptPlaceholder(input: {
  platformLabel: string;
  trackLabel: string;
  angle: string;
}) {
  if (input.platformLabel.includes("视频号") || input.platformLabel.includes("抖音")) {
    return "例如：改成能直接发的视频口播稿，去掉内部说明腔，第一句就抛判断。";
  }

  if (input.platformLabel.includes("公众号")) {
    return "例如：改成真正可发的公众号成稿，去掉在教人做营销的口气，论证再完整一点。";
  }

  if (input.trackLabel.includes("观点")) {
    return "例如：把观点立得更鲜明一些，换一套结构，别再写成固定模板。";
  }

  if (/创始人|CEO|负责人/.test(input.angle)) {
    return "例如：把第一段写得更像创始人公开发言，减少内部培训感和新闻转述感。";
  }

  return "例如：把整篇改成可直接发布的成稿，别像内部说明，再换一种更有新鲜感的写法。";
}

interface PromptSuggestionState {
  prompts: string[];
  summary: string;
}

export function ReviewEditor({
  packId,
  variantId,
  platformKey,
  decisionAnchorId,
  brandName,
  brandTone,
  redLines,
  platformLabel,
  trackLabel,
  angle,
  whyNow,
  whyUs,
  initialTitle,
  initialBody,
  initialHook
}: ReviewEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [coverHook, setCoverHook] = useState(initialHook);
  const [mode, setMode] = useState<"direct" | "suggest">("direct");
  const [prompt, setPrompt] = useState("");
  const [message, setMessage] = useState("");
  const [suggestion, setSuggestion] = useState<SuggestionState | null>(null);
  const [promptSuggestions, setPromptSuggestions] = useState<PromptSuggestionState>({
    prompts: [],
    summary: ""
  });
  const [isPromptSuggestionsLoading, setIsPromptSuggestionsLoading] = useState(false);
  const [promptSuggestionsError, setPromptSuggestionsError] = useState("");
  const [changeLog, setChangeLog] = useState<ChangeLogItem[]>([]);
  const [saveState, setSaveState] = useState<"loading" | "saving" | "saved">("loading");
  const [lastSavedAt, setLastSavedAt] = useState<string>();
  const [previousSnapshot, setPreviousSnapshot] = useState<StoredDraftSnapshot>();
  const [isPending, startTransition] = useTransition();
  const initializedRef = useRef(false);
  const loadedFromStorageRef = useRef(false);
  const [autoExpandedOnLoad, setAutoExpandedOnLoad] = useState(false);
  const storageKey = useMemo(
    () =>
      getDraftStorageKey({
        packId,
        variantId,
        platform: platformKey
      }),
    [packId, platformKey, variantId]
  );
  const minimumBodyChars = useMemo(
    () =>
      resolveMinimumCharsForLabels({
        platformLabel,
        trackLabel
      }),
    [platformLabel, trackLabel]
  );
  const promptPlaceholder = useMemo(
    () =>
      buildPromptPlaceholder({
        platformLabel,
        trackLabel,
        angle
      }),
    [angle, platformLabel, trackLabel]
  );

  const bodyStats = useMemo(() => {
    const characters = countVisibleChars(body);
    const paragraphs = body
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean).length;

    return {
      characters,
      paragraphs
    };
  }, [body]);

  useEffect(() => {
    loadedFromStorageRef.current = false;
    setAutoExpandedOnLoad(false);
    setSaveState("loading");
    const stored = window.localStorage.getItem(storageKey);
    const trackHint = trackLabel.includes("观点") ? "point-of-view" : "rapid-response";

    if (stored) {
      try {
        const parsed = JSON.parse(stored) as StoredDraftPayload;
        const normalized = enforceBodyMinimumWithContext({
          body: parsed.body ?? initialBody,
          title: parsed.title ?? initialTitle,
          angle,
          whyNow,
          whyUs,
          minimumChars: minimumBodyChars,
          platformHint: platformLabel,
          trackHint
        });

        setTitle(parsed.title ?? initialTitle);
        setBody(normalized.body);
        setCoverHook(parsed.coverHook ?? initialHook);
        setChangeLog(parsed.changeLog ?? []);
        setLastSavedAt(parsed.updatedAt);
        setPreviousSnapshot(parsed.previousSnapshot);
        setAutoExpandedOnLoad(normalized.wasExpanded);
        loadedFromStorageRef.current = true;
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    } else {
      const normalized = enforceBodyMinimumWithContext({
        body: initialBody,
        title: initialTitle,
        angle,
        whyNow,
        whyUs,
        minimumChars: minimumBodyChars,
        platformHint: platformLabel,
        trackHint
      });

      setTitle(initialTitle);
      setBody(normalized.body);
      setCoverHook(initialHook);
      setChangeLog([]);
      setLastSavedAt(undefined);
      setPreviousSnapshot(undefined);
      setAutoExpandedOnLoad(normalized.wasExpanded);
    }

    initializedRef.current = true;
    setSaveState("saved");
  }, [angle, initialBody, initialHook, initialTitle, minimumBodyChars, platformLabel, storageKey, trackLabel, whyNow, whyUs]);

  useEffect(() => {
    if (!initializedRef.current) {
      return;
    }

    setSaveState("saving");

    const timeout = window.setTimeout(() => {
      const existingRaw = window.localStorage.getItem(storageKey);
      let priorSnapshot: StoredDraftSnapshot | undefined;

      if (existingRaw) {
        try {
          const existing = JSON.parse(existingRaw) as StoredDraftPayload;
          const hasMeaningfulChange =
            existing.title !== title ||
            existing.body !== body ||
            existing.coverHook !== coverHook ||
            JSON.stringify(existing.changeLog) !== JSON.stringify(changeLog);

          if (hasMeaningfulChange) {
            priorSnapshot = {
              title: existing.title,
              body: existing.body,
              coverHook: existing.coverHook,
              changeLog: existing.changeLog ?? [],
              savedAt: existing.updatedAt
            };
          } else {
            priorSnapshot = existing.previousSnapshot;
          }
        } catch {
          priorSnapshot = undefined;
        }
      }

      const payload: StoredDraftPayload = {
        title,
        body,
        coverHook,
        changeLog,
        savedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (priorSnapshot) {
        payload.previousSnapshot = priorSnapshot;
      }

      window.localStorage.setItem(storageKey, JSON.stringify(payload));
      setLastSavedAt(payload.updatedAt);
      setPreviousSnapshot(payload.previousSnapshot);
      setSaveState("saved");
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [body, changeLog, coverHook, storageKey, title]);

  useEffect(() => {
    if (saveState !== "saving") {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [saveState]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsPromptSuggestionsLoading(true);
      setPromptSuggestionsError("");

      try {
        const response = await fetch("/api/rewrite/prompt-suggestions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            title,
            body,
            coverHook,
            angle,
            platformLabel,
            trackLabel,
            whyNow,
            whyUs,
            brandName,
            brandTone,
            redLines
          }),
          signal: controller.signal
        });

        const payload = (await response.json().catch(() => null)) as
          | {
              ok?: boolean;
              prompts?: string[];
              summary?: string;
              error?: string;
            }
          | null;

        if (!response.ok || !payload?.ok || !Array.isArray(payload.prompts)) {
          setPromptSuggestionsError(payload?.error ?? "改稿提示生成失败");
          return;
        }

        setPromptSuggestions({
          prompts: payload.prompts,
          summary: payload.summary ?? ""
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        setPromptSuggestionsError(error instanceof Error ? error.message : "改稿提示生成失败");
      } finally {
        setIsPromptSuggestionsLoading(false);
      }
    }, 900);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [
    angle,
    body,
    brandName,
    brandTone,
    coverHook,
    platformLabel,
    redLines,
    title,
    trackLabel,
    whyNow,
    whyUs
  ]);

  async function refreshPromptSuggestions() {
    setPromptSuggestionsError("");
    setIsPromptSuggestionsLoading(true);

    try {
      const response = await fetch("/api/rewrite/prompt-suggestions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title,
          body,
          coverHook,
          angle,
          platformLabel,
          trackLabel,
          whyNow,
          whyUs,
          brandName,
          brandTone,
          redLines
        })
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            prompts?: string[];
            summary?: string;
            error?: string;
          }
        | null;

      if (!response.ok || !payload?.ok || !Array.isArray(payload.prompts)) {
        setPromptSuggestionsError(payload?.error ?? "改稿提示生成失败");
        return;
      }

      setPromptSuggestions({
        prompts: payload.prompts,
        summary: payload.summary ?? ""
      });
    } catch (error) {
      setPromptSuggestionsError(error instanceof Error ? error.message : "改稿提示生成失败");
    } finally {
      setIsPromptSuggestionsLoading(false);
    }
  }

  function requestRewrite(requestText: string) {
    if (!requestText.trim()) {
      setMessage("先写下这轮你想怎么改。");
      return;
    }

    startTransition(async () => {
      setMessage("");
      setSuggestion(null);

      const response = await fetch("/api/rewrite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title,
          body,
          angle,
          platformLabel,
          trackLabel,
          whyNow,
          whyUs,
          brandName,
          brandTone,
          redLines,
          userRequest: requestText,
          mode
        })
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            applied?: boolean;
            nextTitle?: string;
            nextBody?: string;
            changeSummary?: string;
            route?: {
              provider: string;
            };
            error?: string;
          }
        | null;

      if (!response.ok || !payload?.ok) {
        setMessage(payload?.error ?? "改稿请求失败");
        return;
      }

      const provider = "AI 助手";
      const summary = payload.changeSummary ?? "已生成一轮改稿结果。";
      const timestamp = new Date().toISOString();

      if (payload.applied) {
        setTitle(payload.nextTitle ?? title);
        setBody(payload.nextBody ?? body);
        setChangeLog((current) => [
          {
            id: crypto.randomUUID(),
            mode,
            request: requestText,
            summary,
            provider,
            createdAt: timestamp,
            applied: true,
            appliedAt: timestamp
          },
          ...current
        ]);
        setMessage(summary);
      } else {
        const changeLogId = crypto.randomUUID();
        setChangeLog((current) => [
          {
            id: changeLogId,
            mode,
            request: requestText,
            summary,
            provider,
            createdAt: timestamp,
            applied: false
          },
          ...current
        ]);
        setSuggestion({
          changeLogId,
          title: payload.nextTitle ?? title,
          body: payload.nextBody ?? body,
          summary,
          provider
        });
        setMessage(summary);
      }

      setPrompt("");
    });
  }

  function applySuggestion() {
    if (!suggestion) {
      return;
    }

    const appliedAt = new Date().toISOString();
    setTitle(suggestion.title);
    setBody(suggestion.body);
    setChangeLog((current) =>
      current.map((item) =>
        item.id === suggestion.changeLogId
          ? {
              ...item,
              applied: true,
              appliedAt
            }
          : item
      )
    );
    setMessage("已应用这轮建议。");
    setSuggestion(null);
  }

  function revertToPreviousSavedVersion() {
    if (!previousSnapshot) {
      setMessage("当前还没有可回退的上一版已保存草稿。");
      return;
    }

    setTitle(previousSnapshot.title);
    setBody(previousSnapshot.body);
    setCoverHook(previousSnapshot.coverHook);
    setChangeLog(previousSnapshot.changeLog);
    setMessage(`已回退到 ${formatLocalTimestamp(previousSnapshot.savedAt)} 的已保存版本。`);
  }

  return (
    <div className="editorWorkbench">
      <div className="editorWorkbenchHeader">
        <div>
          <p className="eyebrow">内容编辑区</p>
          <h3>当前版本</h3>
        </div>
        <div className="buttonRow editorWorkbenchActions">
          {decisionAnchorId ? (
            <a className="buttonLike subtleButton" href={`#${decisionAnchorId}`}>
              下一步：提交审核
            </a>
          ) : null}
          <button
            className="buttonLike subtleButton"
            disabled={!previousSnapshot}
            onClick={revertToPreviousSavedVersion}
            type="button"
          >
            回退上一个已保存版本
          </button>
        </div>
      </div>

      <div className="editorSimpleMeta editorMetaRow">
        <span className="reviewInlineMeta">当前平台：{platformLabel}</span>
        <span className="reviewInlineMeta">内容类型：{trackLabel}</span>
        <span className="reviewInlineMeta">建议角度：{angle}</span>
        <span className="reviewInlineMeta">
          保存状态：
          {saveState === "loading"
            ? " 正在读取本地草稿"
            : saveState === "saving"
              ? " 正在保存"
              : ` 已保存 · ${formatLocalTimestamp(lastSavedAt)}`}
        </span>
      </div>

      <div className="editorSimpleFields editorWorkbenchFields">
        <div className="field">
          <span>标题</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>

        <div className="field">
          <span>封面钩子</span>
          <input value={coverHook} onChange={(event) => setCoverHook(event.target.value)} />
        </div>

        <div className="editorBodyHeader">
          <span>正文</span>
          <small className="muted">
            {bodyStats.characters} 字 · {bodyStats.paragraphs} 段 · 目标至少 {minimumBodyChars} 字
          </small>
        </div>

        <textarea
          className="editorBody"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={18}
        />
      </div>

      <section className="editorAssistantSection editorToolSection">
        <div className="reviewSimpleHeader editorToolHeader">
          <div>
            <p className="eyebrow">AI 改稿</p>
            <h3>改稿助手</h3>
          </div>
        </div>

        <div className="modeSwitch">
          <button
            className={mode === "direct" ? "modeButton activeModeButton" : "modeButton"}
            onClick={() => setMode("direct")}
            type="button"
          >
            直接改正文
          </button>
          <button
            className={mode === "suggest" ? "modeButton activeModeButton" : "modeButton"}
            onClick={() => setMode("suggest")}
            type="button"
          >
            建议模式
          </button>
        </div>

        <div className="listItem">
          <div>
            <strong>AI 判断的改稿方向</strong>
            <p className="muted">
              {promptSuggestions.summary || "AI 会根据当前稿件自动判断本轮更值得优先修改什么。"}
            </p>
          </div>
          <button
            className="buttonLike subtleButton"
            disabled={isPromptSuggestionsLoading}
            onClick={() => {
              void refreshPromptSuggestions();
            }}
            type="button"
          >
            {isPromptSuggestionsLoading ? "判断中..." : "刷新提示"}
          </button>
        </div>

        <div className="promptChips">
          {promptSuggestions.prompts.map((item) => (
            <button
              className="promptChip"
              key={item}
              onClick={() => setPrompt(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
        {promptSuggestionsError ? <p className="muted">{promptSuggestionsError}</p> : null}

        <label className="field">
          <span>本轮改稿要求</span>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={promptPlaceholder}
            rows={4}
          />
        </label>

        <div className="buttonRow">
          <button disabled={isPending} onClick={() => requestRewrite(prompt)} type="button">
            {mode === "direct" ? "执行改稿" : "生成建议"}
          </button>
        </div>

        {message ? <p className="muted">{message}</p> : null}
        {autoExpandedOnLoad ? (
          <p className="muted">检测到历史草稿长度不足，已按当前平台标准自动补齐为可发布初稿。</p>
        ) : null}
        {saveState === "saving" ? (
          <p className="muted">当前有未完成保存的改动，刷新或关闭页面时浏览器会提醒。</p>
        ) : null}

        {suggestion ? (
          <section className="suggestionPanel">
            <div className="listItem">
              <strong>本轮建议</strong>
              <span className="pill pill-neutral">{suggestion.provider}</span>
            </div>
            <p className="muted">{suggestion.summary}</p>
            <div className="suggestionPreview">
              <strong>{suggestion.title}</strong>
              <p>{suggestion.body}</p>
            </div>
            <div className="buttonRow">
              <button onClick={applySuggestion} type="button">
                应用这轮建议
              </button>
              <button onClick={() => setSuggestion(null)} type="button">
                先保留原稿
              </button>
            </div>
          </section>
        ) : null}

        <section className="editorAssistNote editorAssistGrid">
          <div>
            <strong>配图 / 镜头建议</strong>
            <p className="muted">
              这一版更适合“问题抛出 + 观点拆解 + 方法收束”的结构，画面建议围绕真实办公场景和组织协同展开。
            </p>
          </div>
          <div>
            <strong>风险提醒</strong>
            <ul className="simpleList">
              {redLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="editorAssistNote editorAssistGrid">
          <div>
            <strong>立题理由</strong>
            <p className="muted">{whyNow}</p>
          </div>
          <div>
            <strong>品牌结合原因</strong>
            <p className="muted">{whyUs}</p>
          </div>
        </section>

        <section className="changeLogPanel">
          <div className="listItem">
            <strong>改稿记录</strong>
            <span className="pill pill-neutral">{changeLog.length} 次</span>
          </div>

          <div className="changeLogList">
            {changeLog.length > 0 ? (
              changeLog.map((item) => (
                <div className="changeLogItem" key={item.id}>
                  <div className="listItem">
                    <strong>{item.mode === "direct" ? "直接改正文" : "建议模式"}</strong>
                    <small className="muted">{item.provider}</small>
                  </div>
                  <p className="muted">
                    {formatLocalTimestamp(item.createdAt)} · {item.applied ? "已应用" : "待你确认"}
                  </p>
                  <p className="muted">{item.request}</p>
                  <p>{item.summary}</p>
                </div>
              ))
            ) : (
              <p className="emptyState">还没有本轮改稿记录。你可以直接在上面输入修改要求。</p>
            )}
          </div>
        </section>
      </section>
    </div>
  );
}
