"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  formatLocalTimestamp,
  getDraftStorageKey,
  type StoredDraftPayload,
  type StoredDraftSnapshot
} from "@/lib/client/persistence";

interface ReviewEditorProps {
  packId: string;
  variantId: string;
  platformKey: string;
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

const quickPrompts = [
  "开头更抓人一点",
  "更像创始人口吻",
  "增加行业判断，不要像新闻摘要",
  "压缩成更适合短视频口播的表达"
];

export function ReviewEditor({
  packId,
  variantId,
  platformKey,
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
  const [changeLog, setChangeLog] = useState<ChangeLogItem[]>([]);
  const [saveState, setSaveState] = useState<"loading" | "saving" | "saved">("loading");
  const [lastSavedAt, setLastSavedAt] = useState<string>();
  const [previousSnapshot, setPreviousSnapshot] = useState<StoredDraftSnapshot>();
  const [isPending, startTransition] = useTransition();
  const initializedRef = useRef(false);
  const loadedFromStorageRef = useRef(false);
  const storageKey = useMemo(
    () =>
      getDraftStorageKey({
        packId,
        variantId,
        platform: platformKey
      }),
    [packId, platformKey, variantId]
  );

  const bodyStats = useMemo(() => {
    const characters = body.replace(/\s/g, "").length;
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
    setSaveState("loading");
    const stored = window.localStorage.getItem(storageKey);

    if (stored) {
      try {
        const parsed = JSON.parse(stored) as StoredDraftPayload;
        setTitle(parsed.title ?? initialTitle);
        setBody(parsed.body ?? initialBody);
        setCoverHook(parsed.coverHook ?? initialHook);
        setChangeLog(parsed.changeLog ?? []);
        setLastSavedAt(parsed.updatedAt);
        setPreviousSnapshot(parsed.previousSnapshot);
        loadedFromStorageRef.current = true;
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    } else {
      setLastSavedAt(undefined);
      setPreviousSnapshot(undefined);
    }

    initializedRef.current = true;
    setSaveState("saved");
  }, [initialBody, initialHook, initialTitle, storageKey]);

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

      const provider = payload.route?.provider ?? "unknown";
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
      <section className="editorMain">
        <div className="editorBrief panel">
          <div className="editorBriefGrid">
            <div>
              <span>平台</span>
              <strong>{platformLabel}</strong>
            </div>
            <div>
              <span>内容类型</span>
              <strong>{trackLabel}</strong>
            </div>
            <div>
              <span>建议角度</span>
              <strong>{angle}</strong>
            </div>
            <div>
              <span>当前目标</span>
              <strong>先把稿子改到可审，再推进发布</strong>
            </div>
            <div>
              <span>保存状态</span>
              <strong>
                {saveState === "loading"
                  ? "正在读取本地草稿"
                  : saveState === "saving"
                    ? "正在保存到本地草稿"
                    : `已保存 · ${formatLocalTimestamp(lastSavedAt)}`}
              </strong>
            </div>
          </div>
        </div>

        <div className="panel editorPanel">
          <div className="editorStatusBar">
            <div className="editorStatusMeta">
              <span className="pill pill-neutral">当前改动只作用于 {platformLabel}</span>
              <small className="muted">
                {loadedFromStorageRef.current
                  ? "已恢复这一个平台版本的本地草稿。"
                  : "当前版本会自动保存在这个浏览器里。"}
              </small>
            </div>
            <div className="buttonRow">
              <button
                disabled={!previousSnapshot}
                onClick={revertToPreviousSavedVersion}
                type="button"
              >
                回退到上一个已保存版本
              </button>
            </div>
          </div>

          <div className="field">
            <span>标题</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>

          <div className="field">
            <span>封面钩子</span>
            <input value={coverHook} onChange={(event) => setCoverHook(event.target.value)} />
          </div>

          <div className="editorBodyHeader">
            <span>正文编辑区</span>
            <small className="muted">
              {bodyStats.characters} 字 · {bodyStats.paragraphs} 段
            </small>
          </div>

          <textarea
            className="editorBody"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={18}
          />
        </div>

        <div className="grid grid-2">
          <div className="subPanel helperPanel">
            <strong>配图 / 镜头建议</strong>
            <p className="muted">
              这一版更适合“问题抛出 + 观点拆解 + 方法收束”的结构，画面或配图建议围绕行业变化和品牌方法论展开。
            </p>
          </div>
          <div className="subPanel helperPanel">
            <strong>风险提醒</strong>
            <ul className="simpleList">
              {redLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <aside className="editorAside">
        <section className="panel assistantPanel">
          <div className="assistantHeader">
            <div>
              <p className="eyebrow">AI 改稿助手</p>
              <h3>直接说你想怎么改</h3>
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
          </div>

          <div className="promptChips">
            {quickPrompts.map((item) => (
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

          <label className="field">
            <span>本轮改稿要求</span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="例如：把第一段写得更像创始人对行业趋势的判断，减少新闻转述感。"
              rows={5}
            />
          </label>

          <div className="buttonRow">
            <button disabled={isPending} onClick={() => requestRewrite(prompt)} type="button">
              {mode === "direct" ? "执行改稿" : "生成建议"}
            </button>
          </div>

          {message ? <p className="muted">{message}</p> : null}
          {saveState === "saving" ? (
            <p className="muted">当前有未完成保存的改动，此时刷新或关闭页面会触发浏览器提醒。</p>
          ) : null}
        </section>

        {suggestion ? (
          <section className="panel suggestionPanel">
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

        <section className="panel helperPanel">
          <strong>为什么现在做</strong>
          <p className="muted">{whyNow}</p>
          <strong>为什么和品牌相关</strong>
          <p className="muted">{whyUs}</p>
        </section>

        <section className="panel changeLogPanel">
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
              <p className="emptyState">还没有本轮改稿记录。你可以先用右上角的改稿框说清楚需求。</p>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}
