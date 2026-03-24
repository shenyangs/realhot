export interface DisplaySection {
  title: string;
  items: string[];
}

export interface ReviewNoteDisplay {
  sections: DisplaySection[];
  hiddenCount: number;
}

export interface AuditPayloadDisplay {
  sections: DisplaySection[];
  hiddenCount: number;
}

const hiddenTechnicalKeys = new Set([
  "requestcontext",
  "ip",
  "forwardedfor",
  "useragent",
  "origin",
  "referer",
  "acceptlanguage",
  "locale",
  "devicetype",
  "networktype",
  "effectivetype",
  "downlinkmbps",
  "rttms",
  "savedata",
  "timezone",
  "macaddress",
  "macaddressnote"
]);

const reviewKeyLabels: Record<string, string> = {
  decision: "建议动作",
  confidence: "判断把握",
  recommendation: "建议",
  whynow: "为什么现在做",
  whyus: "为什么适合这个品牌",
  planningscore: "策划评分",
  selectedslots: "推荐形式",
  sourcetitle: "原文标题",
  sourceexcerpt: "原文摘要",
  sourceurl: "原文链接"
};

const auditKeyLabels: Record<string, string> = {
  actoruserid: "操作人 ID",
  workspaceid: "工作组 ID",
  workspacename: "工作组",
  entityid: "对象 ID",
  entitytype: "对象类型",
  provider: "模型提供方",
  model: "模型",
  routekey: "路由键",
  feature: "功能",
  platform: "平台",
  title: "标题",
  status: "状态",
  result: "结果",
  reason: "原因",
  summary: "摘要",
  message: "说明",
  note: "备注",
  reviewer: "审核人",
  reviewstatus: "审核状态",
  packid: "选题包 ID",
  variantid: "版本 ID",
  publishjobids: "发布任务 ID",
  publishwindow: "发布时间窗口",
  count: "数量",
  role: "角色",
  email: "邮箱",
  url: "链接",
  sourceurl: "来源链接",
  requestid: "请求 ID"
};

function normalizeKey(input: string) {
  return input.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, "").toLowerCase();
}

function prettifyKey(input: string) {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
}

function cleanInlineText(input: string) {
  return input
    .replace(/```+/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/�+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
}

function isHiddenTechnicalKey(input: string) {
  return hiddenTechnicalKeys.has(normalizeKey(input));
}

function looksLikeStructureNoise(input: string) {
  const value = input.trim();

  if (!value) {
    return true;
  }

  if (/^[\[\]{}'",:]+$/.test(value)) {
    return true;
  }

  if ((value.startsWith("{") && value.endsWith("}")) || (value.startsWith("[") && value.endsWith("]"))) {
    return true;
  }

  return false;
}

function parsePossibleJson(input: string): unknown {
  const value = input.trim();

  if (!value || (!value.startsWith("{") && !value.startsWith("["))) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function formatValue(value: unknown, labelMap: Record<string, string>): string {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "string") {
    const parsed = parsePossibleJson(value);

    if (parsed !== null) {
      return formatValue(parsed, labelMap);
    }

    return cleanInlineText(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    const items = value
      .map((item) => formatValue(item, labelMap))
      .filter(Boolean);

    return items.join("、");
  }

  if (typeof value === "object") {
    const parts = Object.entries(value)
      .map(([key, nested]) => {
        if (isHiddenTechnicalKey(key)) {
          return "";
        }

        const formatted = formatValue(nested, labelMap);

        if (!formatted) {
          return "";
        }

        return `${labelMap[normalizeKey(key)] ?? prettifyKey(key)}：${formatted}`;
      })
      .filter(Boolean);

    return parts.join("；");
  }

  return cleanInlineText(String(value));
}

function splitPipeSegments(line: string) {
  if (line.includes(" | ") && /[:：]/.test(line)) {
    return line.split("|").map((segment) => segment.trim()).filter(Boolean);
  }

  return [line];
}

function pushUnique(target: string[], value: string) {
  if (!value || target.includes(value)) {
    return;
  }

  target.push(value);
}

function labelForReviewKey(input: string) {
  return reviewKeyLabels[normalizeKey(input)] ?? prettifyKey(input);
}

function labelForAuditKey(input: string) {
  return auditKeyLabels[normalizeKey(input)] ?? prettifyKey(input);
}

export function formatReviewNoteForDisplay(input?: string): ReviewNoteDisplay {
  if (!input?.trim()) {
    return { sections: [], hiddenCount: 0 };
  }

  const summary: string[] = [];
  const evidence: string[] = [];
  const details: string[] = [];
  let hiddenCount = 0;
  let currentSection: "summary" | "evidence" | "details" = "summary";

  const lines = input
    .replace(/\r\n/g, "\n")
    .split("\n")
    .flatMap((line) => splitPipeSegments(line));

  for (const rawLine of lines) {
    const line = cleanInlineText(rawLine);

    if (!line) {
      continue;
    }

    if (/^ai\s*源头判断[:：]?$/i.test(line) || /^源头判断[:：]?$/i.test(line)) {
      currentSection = "summary";
      continue;
    }

    if (/^证据[:：]?$/i.test(line) || /^依据[:：]?$/i.test(line)) {
      currentSection = "evidence";
      continue;
    }

    if (/^补充信息[:：]?$/i.test(line) || /^说明[:：]?$/i.test(line)) {
      currentSection = "details";
      continue;
    }

    if (looksLikeStructureNoise(line)) {
      hiddenCount += 1;
      continue;
    }

    const keyValueMatch = line.match(/^([^:：]{1,40})[:：]\s*(.+)$/);

    if (keyValueMatch) {
      const rawKey = keyValueMatch[1].trim();
      const rawValue = keyValueMatch[2].trim();

      if (isHiddenTechnicalKey(rawKey)) {
        hiddenCount += 1;
        continue;
      }

      const normalizedKey = normalizeKey(rawKey);
      const formattedValue = formatValue(rawValue, reviewKeyLabels);

      if (!formattedValue) {
        continue;
      }

      if (normalizedKey === "evidence" || normalizedKey === "证据" || normalizedKey === "依据") {
        currentSection = "evidence";
        pushUnique(evidence, formattedValue);
        continue;
      }

      const formattedLine = `${labelForReviewKey(rawKey)}：${formattedValue}`;

      if (
        normalizedKey === "recommendation" ||
        normalizedKey === "decision" ||
        normalizedKey === "confidence" ||
        normalizedKey === "planningscore" ||
        normalizedKey === "whynow" ||
        normalizedKey === "whyus" ||
        normalizedKey === "selectedslots"
      ) {
        pushUnique(summary, formattedLine);
        continue;
      }

      pushUnique(details, formattedLine);
      continue;
    }

    if (/(requestcontext|useragent|origin|referer|macaddress|timezone|locale)/i.test(line)) {
      hiddenCount += 1;
      continue;
    }

    const cleanedLine = cleanInlineText(line.replace(/^[-*•]\s*/, "").replace(/^\d+\.\s*/, ""));

    if (!cleanedLine || looksLikeStructureNoise(cleanedLine)) {
      hiddenCount += 1;
      continue;
    }

    if (currentSection === "evidence") {
      pushUnique(evidence, cleanedLine);
    } else if (currentSection === "details") {
      pushUnique(details, cleanedLine);
    } else {
      pushUnique(summary, cleanedLine);
    }
  }

  const sections: DisplaySection[] = [];

  if (summary.length > 0) {
    sections.push({ title: "判断摘要", items: summary });
  }

  if (evidence.length > 0) {
    sections.push({ title: "证据线索", items: evidence });
  }

  if (details.length > 0) {
    sections.push({ title: "补充信息", items: details });
  }

  return {
    sections,
    hiddenCount
  };
}

export function formatAuditPayloadForDisplay(payload: Record<string, unknown>): AuditPayloadDisplay {
  const primary: string[] = [];
  const related: string[] = [];
  const extra: string[] = [];
  let hiddenCount = 0;

  function pushItem(key: string, value: unknown) {
    if (isHiddenTechnicalKey(key)) {
      hiddenCount += 1;
      return;
    }

    const normalizedKey = normalizeKey(key);

    if (normalizedKey === "reviewnote" && typeof value === "string") {
      const reviewDisplay = formatReviewNoteForDisplay(value);

      hiddenCount += reviewDisplay.hiddenCount;

      for (const section of reviewDisplay.sections) {
        if (section.items.length === 0) {
          continue;
        }

        pushUnique(primary, `${section.title}：${section.items.join("；")}`);
      }

      return;
    }

    const formattedValue = formatValue(value, auditKeyLabels);

    if (!formattedValue) {
      return;
    }

    const item = `${labelForAuditKey(key)}：${formattedValue}`;

    if (/(status|result|reason|message|note|reviewstatus|provider|model|feature|platform|role|title|summary|count|decision|confidence)/.test(normalizedKey)) {
      pushUnique(primary, item);
      return;
    }

    if (/(id|name|email|url|link)/.test(normalizedKey)) {
      pushUnique(related, item);
      return;
    }

    pushUnique(extra, item);
  }

  function walkRecord(record: Record<string, unknown>) {
    for (const [key, value] of Object.entries(record)) {
      if (value === undefined || value === null || value === "") {
        continue;
      }

      if (isHiddenTechnicalKey(key)) {
        hiddenCount += 1;
        continue;
      }

      if (Array.isArray(value)) {
        if (value.every((item) => item === null || ["string", "number", "boolean"].includes(typeof item))) {
          pushItem(key, value);
          continue;
        }

        value.forEach((item) => {
          if (item && typeof item === "object" && !Array.isArray(item)) {
            walkRecord(item as Record<string, unknown>);
          }
        });
        continue;
      }

      if (typeof value === "object") {
        walkRecord(value as Record<string, unknown>);
        continue;
      }

      pushItem(key, value);
    }
  }

  walkRecord(payload);

  const sections: DisplaySection[] = [];

  if (primary.length > 0) {
    sections.push({ title: "关键信息", items: primary });
  }

  if (related.length > 0) {
    sections.push({ title: "关联对象", items: related });
  }

  if (extra.length > 0) {
    sections.push({ title: "补充字段", items: extra });
  }

  return {
    sections,
    hiddenCount
  };
}
