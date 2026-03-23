import { cache } from "react";
import { extractMiniMaxText, requestMiniMaxChatCompletion } from "@/lib/services/minimax-client";

interface DailyQuotePayload {
  quote: string;
  source: string;
}

export interface HomepageMoment {
  dateLabel: string;
  weekdayLabel: string;
  timeLabel: string;
  dayPeriodLabel: string;
  quote: string;
  source: string;
}

const HOME_TIME_ZONE = "Asia/Shanghai";

const fallbackQuotes = [
  { quote: "先把眼前这件事做好。", source: "今日箴言" },
  { quote: "节奏稳一点，判断会更准。", source: "今日箴言" },
  { quote: "清楚比着急更重要。", source: "今日箴言" },
  { quote: "先完成关键一步，再看远处。", source: "今日箴言" },
  { quote: "把复杂事讲清楚，就是推进。", source: "今日箴言" },
  { quote: "少一点噪音，多一点判断。", source: "今日箴言" }
] as const;

function getDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: HOME_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function getDayPeriodLabel(hour: number) {
  if (hour < 6) {
    return "凌晨";
  }

  if (hour < 9) {
    return "早上";
  }

  if (hour < 12) {
    return "上午";
  }

  if (hour < 14) {
    return "中午";
  }

  if (hour < 18) {
    return "下午";
  }

  return "晚上";
}

function getShanghaiParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: HOME_TIME_ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const lookup = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = Number(lookup("hour")) || 0;

  return {
    dateLabel: `${lookup("year")}年${lookup("month")}${lookup("day")}日`,
    weekdayLabel: lookup("weekday"),
    timeLabel: `${lookup("hour")}:${lookup("minute")}`,
    dayPeriodLabel: getDayPeriodLabel(hour)
  };
}

function pickFallbackQuote(dateKey: string): DailyQuotePayload {
  const seed = Array.from(dateKey).reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 1), 0);
  return fallbackQuotes[seed % fallbackQuotes.length];
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1).trim();
  }

  return trimmed;
}

function normalizeInlineText(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== "string") {
    return fallback;
  }

  const cleaned = value
    .replace(/["“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return fallback;
  }

  const chars = Array.from(cleaned);

  if (chars.length <= maxLength) {
    return cleaned;
  }

  return `${chars.slice(0, maxLength).join("").trim()}…`;
}

const requestDailyQuote = cache(async (dateKey: string): Promise<DailyQuotePayload> => {
  const fallback = pickFallbackQuote(dateKey);

  try {
    const response = await requestMiniMaxChatCompletion({
      model: process.env.MINIMAX_MODEL?.trim() || "MiniMax-M2.7",
      messages: [
        {
          role: "system",
          content:
            "你是中文产品文案编辑。你必须先调用 web_search 工具联网搜索，再整理结果。只返回 JSON 对象，不要输出 Markdown、解释或代码块。"
        },
        {
          role: "user",
          content: [
            `今天是 ${dateKey}，时区是 Asia/Shanghai。`,
            "请联网搜索适合工作台首页展示的一句中文短箴言或格言，并整理成一句更适合产品界面的短句。",
            "要求：",
            "1. 句子克制、清醒，适合开始工作时阅读。",
            "2. 最好 10 到 18 个汉字，最多 22 个汉字。",
            "3. 不要鸡汤、不要夸张、不要宗教化表达。",
            "4. 可以在忠实保留原意的前提下压缩措辞，但不要编造事实。",
            "5. source 字段只写作者或来源，不超过 8 个汉字；没有就写“今日箴言”。",
            '6. 只输出 JSON：{"quote":"...","source":"..."}'
          ].join("\n")
        }
      ],
      temperature: 0.4,
      maxTokens: 200,
      tools: [{ type: "web_search" }],
      toolChoice: "auto",
      timeoutMs: 25000
    });
    const text = extractMiniMaxText(response);

    if (!text) {
      throw new Error("MiniMax 未返回箴言文本");
    }

    const parsed = JSON.parse(extractJsonObject(text)) as Partial<DailyQuotePayload>;

    return {
      quote: normalizeInlineText(parsed.quote, fallback.quote, 22),
      source: normalizeInlineText(parsed.source, fallback.source, 8)
    };
  } catch {
    return fallback;
  }
});

export async function getHomepageMoment(now: Date = new Date()): Promise<HomepageMoment> {
  const dateKey = getDateKey(now);
  const timeParts = getShanghaiParts(now);
  const quote = await requestDailyQuote(dateKey);

  return {
    ...timeParts,
    quote: quote.quote,
    source: quote.source
  };
}
