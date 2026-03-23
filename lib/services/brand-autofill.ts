import { getBrandStrategyPack } from "@/lib/data";
import {
  BrandAutofillDraft,
  BrandAutofillReference,
  BrandAutofillResult
} from "@/lib/domain/brand-autofill";
import { BrandSource, BrandStrategyPack } from "@/lib/domain/types";
import { createUserTextContent, extractGeminiText, requestGeminiContent } from "@/lib/services/gemini-client";
import { extractMiniMaxText, requestMiniMaxChatCompletion } from "@/lib/services/minimax-client";
import { decideModelRoute } from "@/lib/services/model-router";

interface BrandAutofillModelPayload {
  brandName: string;
  sector: string;
  slogan: string;
  audiences: string[];
  positioning: string[];
  topics: string[];
  tone: string[];
  redLines: string[];
  competitors: string[];
  recentMoves: string[];
  objective: string;
  primaryPlatforms: string[];
  materials: string[];
  researchSummary: string;
  confidenceNote: string;
  references: BrandAutofillReference[];
}

const MATERIAL_OPTIONS = [
  "品牌介绍 / 手册",
  "产品资料",
  "客户案例",
  "历史爆文 / 创始人观点",
  "最近一个月活动资料",
  "最近一个月媒体新闻稿"
] as const;

function splitList(value: string): string[] {
  return value
    .split(/[\n/|,，、；;]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => toString(item))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return splitList(value);
  }

  return [];
}

function uniqueList(values: string[], fallback: string[]): string[] {
  const cleaned = values
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, array) => array.indexOf(item) === index);

  return cleaned.length > 0 ? cleaned : fallback;
}

function normalizeString(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function normalizeReferences(references: unknown, brandName: string): BrandAutofillReference[] {
  const seen = new Set<string>();
  const candidates = Array.isArray(references) ? references : [];

  return candidates
    .map((item) => {
      const record = item as Partial<BrandAutofillReference>;
      const type =
        record.type === "website" ||
        record.type === "knowledge-base" ||
        record.type === "wechat-history" ||
        record.type === "event" ||
        record.type === "press"
          ? record.type
          : "press";
      const freshness = record.freshness === "stable" || record.freshness === "timely" ? record.freshness : "timely";

      return {
        title: record.title?.trim() ?? "",
        url: record.url?.trim() ?? "",
        label: record.label?.trim() ?? "",
        type,
        freshness,
        value: record.value?.trim() ?? ""
      };
    })
    .filter((item) => item.title && item.url)
    .filter((item) => {
      const key = `${item.title}:${item.url}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, 6)
    .map((item, index) => ({
      ...item,
      label: item.label || `${brandName} 公开资料 ${index + 1}`,
      value: item.value || item.title
    }));
}

function normalizeMaterials(materials: unknown): string[] {
  const normalized = new Set<string>();

  for (const item of toStringArray(materials)) {
    const value = item.trim();

    if (!value) {
      continue;
    }

    if (/品牌|手册|about|简介/i.test(value)) {
      normalized.add("品牌介绍 / 手册");
    }

    if (/产品|功能|方案|官网|product/i.test(value)) {
      normalized.add("产品资料");
    }

    if (/案例|客户|合作|落地/i.test(value)) {
      normalized.add("客户案例");
    }

    if (/爆文|创始人|观点|公众号|访谈/i.test(value)) {
      normalized.add("历史爆文 / 创始人观点");
    }

    if (/活动|发布会|峰会|论坛|展会/i.test(value)) {
      normalized.add("最近一个月活动资料");
    }

    if (/新闻|媒体|稿|报道|press/i.test(value)) {
      normalized.add("最近一个月媒体新闻稿");
    }
  }

  return Array.from(normalized);
}

function coerceModelPayload(raw: unknown, requestedBrandName: string): BrandAutofillModelPayload {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  return {
    brandName: toString(input.brandName) || requestedBrandName,
    sector: toString(input.sector),
    slogan: toString(input.slogan),
    audiences: toStringArray(input.audiences),
    positioning: toStringArray(input.positioning),
    topics: toStringArray(input.topics),
    tone: toStringArray(input.tone),
    redLines: toStringArray(input.redLines),
    competitors: toStringArray(input.competitors),
    recentMoves: toStringArray(input.recentMoves),
    objective: toString(input.objective),
    primaryPlatforms: toStringArray(input.primaryPlatforms),
    materials: toStringArray(input.materials),
    researchSummary: toString(input.researchSummary),
    confidenceNote: toString(input.confidenceNote),
    references: normalizeReferences(input.references, toString(input.brandName) || requestedBrandName)
  };
}

function buildSourceList(brandName: string, references: BrandAutofillReference[]): BrandSource[] {
  const mapped = references.map((item) => ({
    label: item.label,
    type: item.type,
    freshness: item.freshness,
    value: item.value
  }));

  const baseline: BrandSource[] = [
    {
      label: "官网产品页",
      type: "website",
      freshness: "stable",
      value: `${brandName} 的官网、产品介绍和 About 页面`
    },
    {
      label: "公开新闻与媒体稿",
      type: "press",
      freshness: "timely",
      value: `${brandName} 最近的媒体报道、融资或产品更新信息`
    },
    {
      label: "公众号历史内容",
      type: "wechat-history",
      freshness: "stable",
      value: `${brandName} 公众号近 6-12 个月的历史文章`
    },
    {
      label: "近期活动资料",
      type: "event",
      freshness: "timely",
      value: `${brandName} 最近一个月活动、发布会或行业峰会信息`
    }
  ];

  const existingTypes = new Set(mapped.map((item) => item.type));
  const missingBaseline = baseline.filter((item) => !existingTypes.has(item.type));

  return [...mapped, ...missingBaseline];
}

function toDraft(payload: BrandAutofillModelPayload): BrandAutofillDraft {
  return {
    basic: {
      brandName: payload.brandName,
      sector: payload.sector,
      slogan: payload.slogan,
      audiences: payload.audiences.join(" / ")
    },
    goals: {
      topics: payload.topics.join(" / "),
      primaryPlatforms: payload.primaryPlatforms.join(" / "),
      objective: payload.objective
    },
    rules: {
      tone: payload.tone.join(" / "),
      redLines: payload.redLines.join("\n"),
      competitors: payload.competitors.join(" / ")
    },
    materials: payload.materials,
    recent: payload.recentMoves.join("\n")
  };
}

function normalizeModelPayload(
  input: BrandAutofillModelPayload,
  current: BrandStrategyPack
): {
  strategy: BrandStrategyPack;
  draft: BrandAutofillDraft;
  researchSummary: string;
  confidenceNote: string;
  references: BrandAutofillReference[];
} {
  const brandName = normalizeString(input.brandName, current.name);
  const references = normalizeReferences(input.references, brandName);
  const sources = buildSourceList(brandName, references);
  const materials = uniqueList(
    normalizeMaterials(input.materials),
    MATERIAL_OPTIONS.filter((item) =>
      item === "品牌介绍 / 手册" ||
      item === "产品资料" ||
      item === "最近一个月媒体新闻稿"
    )
  );

  const strategy: BrandStrategyPack = {
    id: current.id,
    name: brandName,
    sector: normalizeString(input.sector, current.sector),
    slogan: normalizeString(input.slogan, current.slogan),
    audiences: uniqueList(input.audiences, current.audiences),
    positioning: uniqueList(input.positioning, current.positioning),
    topics: uniqueList(input.topics, current.topics),
    tone: uniqueList(input.tone, current.tone),
    redLines: uniqueList(input.redLines, current.redLines),
    competitors: uniqueList(input.competitors, current.competitors),
    recentMoves: uniqueList(input.recentMoves, current.recentMoves),
    sources
  };

  return {
    strategy,
    draft: {
      ...toDraft({
        ...input,
        brandName: strategy.name,
        sector: strategy.sector,
        slogan: strategy.slogan,
        audiences: strategy.audiences,
        topics: strategy.topics,
        tone: strategy.tone,
        redLines: strategy.redLines,
        competitors: strategy.competitors,
        recentMoves: strategy.recentMoves,
        materials
      }),
      materials
    },
    researchSummary: normalizeString(
      input.researchSummary,
      `已基于公开网络资料整理 ${strategy.name} 的基础策略。`
    ),
    confidenceNote: normalizeString(
      input.confidenceNote,
      "优先参考官网与公开报道；涉及内部口径、敏感边界和近期计划，仍建议人工再校对一次。"
    ),
    references
  };
}

function buildPrompt(brandName: string) {
  const today = new Date().toISOString().slice(0, 10);

  return [
    `今天是 ${today}。`,
    "你是品牌策略研究员，任务是只基于公开互联网资料，为品牌系统生成一版可直接回填的品牌策略草稿。",
    `目标品牌：${brandName}`,
    "请务必先进行多轮联网搜索，再输出结果。",
    "搜索优先级：",
    "1. 官方官网 / About / 产品页 / 新闻页",
    "2. 公开社媒主页、公众号历史内容、创始人访谈",
    "3. 近 12 个月媒体报道、活动资料、发布会信息",
    "4. 竞品与行业对照资料",
    "输出要求：",
    "- 用中文输出",
    "- 不要编造无法确认的信息；不确定就保守归纳",
    "- slogan 可以是官网常用主张的概括，不要求逐字照抄",
    "- tone、redLines、competitors 可以根据公开表达风格合理推断，但要克制",
    "- recentMoves 只写近期公开可见动作、产品更新、活动、合作、传播主题",
    "- objective 要写成系统后续做内容时最适合追的传播方向",
    "- primaryPlatforms 写最合理的平台组合",
    "- materials 只填适合回填当前品牌系统的资料项名称",
    "- references 只保留真正用到的公开来源，最多 6 条",
    "- 最终只输出 1 个 JSON 对象，不要输出 Markdown、解释文字或代码块",
    "- JSON 顶层字段必须包含：brandName, sector, slogan, audiences, positioning, topics, tone, redLines, competitors, recentMoves, objective, primaryPlatforms, materials, researchSummary, confidenceNote, references",
    "如果品牌信息稀少，也要给出一版可用的谨慎草稿，并在 confidenceNote 里说明不确定性。"
  ].join("\n");
}

function getJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      brandName: { type: "string" },
      sector: { type: "string" },
      slogan: { type: "string" },
      audiences: {
        type: "array",
        items: { type: "string" }
      },
      positioning: {
        type: "array",
        items: { type: "string" }
      },
      topics: {
        type: "array",
        items: { type: "string" }
      },
      tone: {
        type: "array",
        items: { type: "string" }
      },
      redLines: {
        type: "array",
        items: { type: "string" }
      },
      competitors: {
        type: "array",
        items: { type: "string" }
      },
      recentMoves: {
        type: "array",
        items: { type: "string" }
      },
      objective: { type: "string" },
      primaryPlatforms: {
        type: "array",
        items: { type: "string" }
      },
      materials: {
        type: "array",
        items: { type: "string" }
      },
      researchSummary: { type: "string" },
      confidenceNote: { type: "string" },
      references: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            url: { type: "string" },
            label: { type: "string" },
            type: {
              type: "string",
              enum: ["website", "knowledge-base", "wechat-history", "event", "press"]
            },
            freshness: {
              type: "string",
              enum: ["stable", "timely"]
            },
            value: { type: "string" }
          },
          required: ["title", "url", "label", "type", "freshness", "value"]
        }
      }
    },
    required: [
      "brandName",
      "sector",
      "slogan",
      "audiences",
      "positioning",
      "topics",
      "tone",
      "redLines",
      "competitors",
      "recentMoves",
      "objective",
      "primaryPlatforms",
      "materials",
      "researchSummary",
      "confidenceNote",
      "references"
    ]
  };
}

function getGeminiModelCandidates(preferredModel?: string) {
  return Array.from(
    new Set(
      [
        preferredModel?.trim(),
        process.env.GEMINI_SEARCH_MODEL?.trim(),
        process.env.GEMINI_MODEL?.trim(),
        "gemini-3.1-pro-preview",
        "gemini-2.5-pro"
      ].filter((item): item is string => Boolean(item))
    )
  );
}

function extractJsonObject(text: string): string {
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

function shouldUseStructuredSearch(model: string) {
  return /^gemini-3(\.|-)/.test(model);
}

async function requestGeminiAutofill(
  brandName: string,
  preferredModel?: string
): Promise<{
  payload: BrandAutofillModelPayload;
  model: string;
}> {
  const modelCandidates = getGeminiModelCandidates(preferredModel);
  let lastError: Error | null = null;

  for (const model of modelCandidates) {
    const attempts = [
      {
        tools: [
          {
            googleSearch: {}
          }
        ],
        generationConfig: shouldUseStructuredSearch(model)
          ? {
              responseMimeType: "application/json",
              responseJsonSchema: getJsonSchema()
            }
          : {
              responseMimeType: "text/plain"
            }
      },
      {
        tools: [
          {
            googleSearch: {}
          }
        ],
        generationConfig: {
          responseMimeType: "text/plain"
        }
      },
      {
        tools: undefined,
        generationConfig: {
          responseMimeType: "text/plain"
        }
      }
    ];

    for (const attempt of attempts) {
      try {
        const response = await requestGeminiContent({
          model,
          contents: [createUserTextContent(buildPrompt(brandName))],
          tools: attempt.tools,
          timeoutMs: 60000,
          generationConfig: attempt.generationConfig
        });
        const text = extractGeminiText(response);

        if (!text) {
          throw new Error("Gemini 未返回可解析的 JSON 文本");
        }

        const parsed = JSON.parse(extractJsonObject(text)) as unknown;

        return {
          payload: coerceModelPayload(parsed, brandName),
          model
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Gemini 深搜失败");
      }
    }
  }

  throw lastError ?? new Error("Gemini 深搜失败");
}

async function requestMiniMaxAutofill(
  brandName: string,
  model: string
): Promise<BrandAutofillModelPayload> {
  const response = await requestMiniMaxChatCompletion({
    model,
    messages: [
      {
        role: "system",
        content:
          "你是资深中国品牌策略分析师。你只能返回 JSON 对象，不要输出 Markdown、不要输出解释、不要输出代码块。"
      },
      {
        role: "user",
        content: `${buildPrompt(brandName)}\n\n请严格按照 JSON 结构输出。`
      }
    ],
    timeoutMs: 60000
  });
  const text = extractMiniMaxText(response);

  if (!text) {
    throw new Error("MiniMax 未返回可解析的 JSON 文本");
  }

  const parsed = JSON.parse(extractJsonObject(text)) as unknown;
  return coerceModelPayload(parsed, brandName);
}

function buildFallbackPayload(brandName: string, current: BrandStrategyPack): BrandAutofillModelPayload {
  const cleaned = brandName.trim() || current.name;
  const keywordHints = splitList(cleaned);
  const hasAiHint = /ai|智能|大模型|agent/i.test(cleaned);
  const hasRetailHint = /咖啡|茶|餐饮|零售|消费|服饰|美妆/i.test(cleaned);
  const sector = hasRetailHint
    ? "消费品牌 / 零售 / 内容营销"
    : hasAiHint
      ? "AI 产品 / 软件服务 / 企业效率"
      : current.sector;

  const slogan = hasRetailHint
    ? `${cleaned} 的品牌体验、产品亮点与用户场景表达`
    : hasAiHint
      ? `${cleaned} 的核心 AI 能力与实际使用价值表达`
      : `${cleaned} 的品牌定位与核心价值表达`;

  return {
    brandName: cleaned,
    sector,
    slogan,
    audiences: uniqueList(
      hasRetailHint
        ? ["核心消费者", "渠道与门店伙伴", "品牌关注者"]
        : ["潜在客户", "行业决策者", "合作伙伴"],
      current.audiences
    ),
    positioning: uniqueList(
      [
        `${cleaned} 需要先讲清楚自己的产品价值、使用场景与差异点`,
        `策略表达应围绕用户问题、解决方式和品牌可信度展开`
      ],
      current.positioning
    ),
    topics: uniqueList(
      hasRetailHint
        ? ["品牌故事", "产品卖点", "消费场景", "门店活动"]
        : ["品牌定位", "产品能力", "用户场景", "行业观察"],
      current.topics
    ),
    tone: uniqueList(["克制", "清晰", "专业", "可信"], current.tone),
    redLines: uniqueList(
      [
        "不要虚构数据、案例或合作关系",
        "不要夸大产品效果或市场地位",
        "涉及竞品时避免攻击式表达"
      ],
      current.redLines
    ),
    competitors: uniqueList(
      keywordHints.length > 0 ? keywordHints.map((item) => `${item} 同类品牌`) : current.competitors,
      current.competitors
    ),
    recentMoves: uniqueList(
      [
        `${cleaned} 近期产品能力升级与版本更新进展`,
        `${cleaned} 近期活动、发布会或行业峰会相关动作`,
        `${cleaned} 近期生态合作、客户案例或渠道联动信息`,
        `${cleaned} 近期媒体报道与品牌观点输出`
      ],
      current.recentMoves
    ),
    objective: "先建立品牌认知，再围绕核心产品价值持续做内容表达。",
    primaryPlatforms: ["公众号", "小红书", "视频号"],
    materials: [...MATERIAL_OPTIONS],
    researchSummary: `当前未能完成实时联网深搜，已先为 ${cleaned} 生成一版谨慎的基础草稿。`,
    confidenceNote: "这版内容偏保守，请补充官网、产品资料和近期动态后再继续细化。",
    references: [
      {
        title: `${cleaned} 官网`,
        url: `https://www.google.com/search?q=${encodeURIComponent(`${cleaned} 官网`)}`,
        label: "官网/产品页检索",
        type: "website",
        freshness: "stable",
        value: `${cleaned} 官网、产品页与 About 页面`
      },
      {
        title: `${cleaned} 公众号历史文章`,
        url: `https://weixin.sogou.com/weixin?type=2&query=${encodeURIComponent(cleaned)}`,
        label: "公众号历史内容检索",
        type: "wechat-history",
        freshness: "stable",
        value: `${cleaned} 公众号近 6-12 个月历史内容`
      },
      {
        title: `${cleaned} 近期活动`,
        url: `https://www.google.com/search?q=${encodeURIComponent(`${cleaned} 发布会 活动`)}`,
        label: "近期活动检索",
        type: "event",
        freshness: "timely",
        value: `${cleaned} 最近一个月活动与发布会动态`
      },
      {
        title: `${cleaned} 媒体报道`,
        url: `https://www.google.com/search?q=${encodeURIComponent(`${cleaned} 媒体 报道`)}`,
        label: "媒体新闻检索",
        type: "press",
        freshness: "timely",
        value: `${cleaned} 最近一个月媒体报道与新闻稿`
      }
    ]
  };
}

export async function autofillBrandStrategy(brandName: string): Promise<BrandAutofillResult> {
  const current = await getBrandStrategyPack();
  const normalizedBrandName = brandName.trim() || current.name;
  const updatedAt = new Date().toISOString();
  const route = await decideModelRoute("strategy-planning", { feature: "brand-autofill" });

  try {
    if (route.provider === "mock") {
      throw new Error(route.reason);
    }

    let model = route.model;
    let payload: BrandAutofillModelPayload;

    if (route.provider === "gemini") {
      const geminiResult = await requestGeminiAutofill(normalizedBrandName, model);
      payload = geminiResult.payload;
      model = geminiResult.model;
    } else {
      payload = await requestMiniMaxAutofill(normalizedBrandName, model);
    }
    const normalized = normalizeModelPayload(payload, current);
    const reason =
      route.provider === "gemini"
        ? `${route.reason} 已启用 Gemini + Google Search 尝试联网补充公开资料。`
        : `${route.reason} 使用 MiniMax 生成结构化品牌草稿。`;

    return {
      route: {
        provider: route.provider,
        model,
        reason
      },
      ...normalized,
      updatedAt
    };
  } catch (error) {
    const fallbackPayload = buildFallbackPayload(normalizedBrandName, current);
    const normalized = normalizeModelPayload(fallbackPayload, current);

    return {
      route: {
        provider: "fallback",
        model: "local-template",
        reason:
          error instanceof Error
            ? `品牌自动填充暂不可用，已回退为本地草稿：${error.message}`
            : "品牌自动填充暂不可用，已回退为本地草稿。"
      },
      ...normalized,
      updatedAt
    };
  }
}
