import { decideModelRoute, runModelTask } from "@/lib/services/model-router";

export type SelectionRewriteField = "title" | "body";

export interface SelectionRewriteInput {
  targetField: SelectionRewriteField;
  selectedText: string;
  userRequest: string;
  selectionStart?: number;
  selectionEnd?: number;
  currentTitle?: string;
  currentBody?: string;
}

export interface SelectionRewriteResult {
  applied: boolean;
  rewrittenText: string;
  changeSummary: string;
  route: {
    provider: string;
    model: string;
    reason: string;
  };
}

function extractSection(content: string, label: string) {
  const pattern = new RegExp(`${label}:([\\s\\S]*?)(?:\\n[A-Z_]+:|$)`);
  const match = content.match(pattern);
  return match?.[1]?.trim() ?? "";
}

function sanitizeModelText(value: string) {
  return value.replace(/^```[\w-]*\n?/, "").replace(/\n?```$/, "").trim();
}

function getExcerpt(value: string, start: number, end: number, radius = 180) {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.max(safeStart, end);

  return {
    before: value.slice(Math.max(0, safeStart - radius), safeStart).trim(),
    after: value.slice(safeEnd, Math.min(value.length, safeEnd + radius)).trim()
  };
}

function buildPrompt(input: SelectionRewriteInput) {
  const fullText = input.targetField === "title" ? input.currentTitle ?? "" : input.currentBody ?? "";
  const selectionStart =
    typeof input.selectionStart === "number" ? Math.max(0, input.selectionStart) : fullText.indexOf(input.selectedText);
  const selectionEnd =
    typeof input.selectionEnd === "number"
      ? Math.max(selectionStart, input.selectionEnd)
      : selectionStart >= 0
        ? selectionStart + input.selectedText.length
        : selectionStart;
  const context = selectionStart >= 0 ? getExcerpt(fullText, selectionStart, selectionEnd) : { before: "", after: "" };

  return [
    "你是资深中文内容编辑。",
    "你的任务不是重写整篇，而是只改用户选中的那一小段文字。",
    `当前改写对象: ${input.targetField === "title" ? "标题片段" : "正文片段"}`,
    `用户要求: ${input.userRequest}`,
    "",
    "硬性要求：",
    "- 只输出改写后的选中文本，不要续写整篇。",
    "- 不要输出解释、标题、项目符号、Markdown、引号。",
    "- 除非用户明确要求改变意思，否则保持原意不变。",
    "- 事实、数字、结论不要乱改，不要虚构新信息。",
    "- 要和上下文语气保持一致，改完后能无缝放回原文。",
    "- 如果当前改的是标题，保持标题感，不要写成正文。",
    "- 如果当前改的是正文，尽量保留原有段落和换行习惯，除非用户要求重组。",
    "",
    "请严格按以下结构输出：",
    "CHANGE_SUMMARY: 用一句话概括这次局部改动重点",
    "REWRITTEN_TEXT: 这里只放改写后的选中文本",
    "",
    "当前标题全文：",
    input.currentTitle?.trim() || "未填写",
    "",
    "当前正文全文：",
    input.currentBody?.trim() || "未填写",
    "",
    "选中文字前文：",
    context.before || "无",
    "",
    "选中的原文：",
    input.selectedText,
    "",
    "选中文字后文：",
    context.after || "无"
  ].join("\n");
}

function buildFallbackSummary(input: SelectionRewriteInput) {
  return input.targetField === "title"
    ? "模型暂时不可用，这次没有自动替换标题选区。"
    : "模型暂时不可用，这次没有自动替换正文选区。";
}

export async function rewriteSelectedText(input: SelectionRewriteInput): Promise<SelectionRewriteResult> {
  const route = await decideModelRoute("copy-polish", { feature: "rewrite" });

  if (route.provider === "mock") {
    return {
      applied: false,
      rewrittenText: input.selectedText,
      changeSummary: "当前还没有可用模型密钥，暂时无法执行选区改稿。",
      route
    };
  }

  try {
    const output = await runModelTask("copy-polish", buildPrompt(input), {
      feature: "rewrite"
    });
    const rewrittenText =
      sanitizeModelText(extractSection(output, "REWRITTEN_TEXT")) || sanitizeModelText(output) || input.selectedText;
    const changeSummary = extractSection(output, "CHANGE_SUMMARY") || "已按要求完成这段选中文本的局部改写。";

    return {
      applied: rewrittenText !== input.selectedText,
      rewrittenText,
      changeSummary,
      route
    };
  } catch (error) {
    return {
      applied: false,
      rewrittenText: input.selectedText,
      changeSummary:
        error instanceof Error ? `${buildFallbackSummary(input)} 原因：${error.message}` : buildFallbackSummary(input),
      route
    };
  }
}
