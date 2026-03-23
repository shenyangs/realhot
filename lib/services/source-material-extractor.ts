const sourceMaterialCache = new Map<string, SourceMaterialExtractionResult>();

export interface SourceMaterialExtractionResult {
  title?: string;
  excerpt?: string;
  fetchedAt?: string;
  note: string;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(value: string): string {
  return decodeEntities(
    value
      .replace(/<!\[CDATA\[|\]\]>/g, "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();

  if (!normalized) {
    return true;
  }

  if (
    normalized === "localhost" ||
    normalized === "0.0.0.0" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "169.254.169.254"
  ) {
    return true;
  }

  if (/^(10|127)\./.test(normalized)) {
    return true;
  }

  if (/^192\.168\./.test(normalized)) {
    return true;
  }

  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)) {
    return true;
  }

  return false;
}

export function validateSourceUrl(rawUrl: string): {
  ok: boolean;
  url?: URL;
  reason?: string;
} {
  try {
    const parsed = new URL(rawUrl);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        ok: false,
        reason: "只允许抓取 http/https 链接"
      };
    }

    if (parsed.username || parsed.password) {
      return {
        ok: false,
        reason: "不允许抓取带账号信息的链接"
      };
    }

    if (isPrivateHostname(parsed.hostname)) {
      return {
        ok: false,
        reason: "不允许抓取本地或私有网络地址"
      };
    }

    return {
      ok: true,
      url: parsed
    };
  } catch {
    return {
      ok: false,
      reason: "链接格式非法"
    };
  }
}

function extractMetaContent(html: string, matcher: RegExp): string {
  const match = html.match(matcher)?.[1] ?? "";
  return stripHtml(match);
}

function extractTitle(html: string): string | undefined {
  const ogTitle = extractMetaContent(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (ogTitle) {
    return ogTitle.slice(0, 160);
  }

  const title = stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  return title ? title.slice(0, 160) : undefined;
}

function extractParagraphCandidates(html: string): string[] {
  const articleBlock = html.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i)?.[1] ?? html;
  const paragraphMatches = [...articleBlock.matchAll(/<(p|h2|h3|li)[^>]*>([\s\S]*?)<\/(p|h2|h3|li)>/gi)];
  const lines = paragraphMatches
    .map((match) => stripHtml(match[2] ?? ""))
    .filter((line) => line.length >= 28)
    .map((line) => line.slice(0, 220));

  return Array.from(new Set(lines));
}

function buildExcerpt(html: string): string | undefined {
  const metaDescription =
    extractMetaContent(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
    extractMetaContent(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  const candidates = extractParagraphCandidates(html);
  const blocks = [metaDescription, ...candidates].filter(Boolean);

  if (blocks.length === 0) {
    const fallback = stripHtml(html).slice(0, 900);
    return fallback || undefined;
  }

  return blocks.join("\n").slice(0, 1200).trim() || undefined;
}

function seemsBlocked(html: string): boolean {
  return /安全验证|访问受限|访问验证|visitor system|captcha|cloudflare/i.test(html);
}

export async function fetchSourceMaterial(rawUrl: string): Promise<SourceMaterialExtractionResult> {
  const validation = validateSourceUrl(rawUrl);

  if (!validation.ok || !validation.url) {
    return {
      note: validation.reason ?? "链接校验失败"
    };
  }

  const cacheKey = validation.url.toString();
  const cached = sourceMaterialCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(validation.url, {
      headers: {
        "User-Agent": "BrandHotspotStudio/0.2"
      },
      signal: controller.signal
    });
    const html = await response.text();

    if (!response.ok) {
      const result = {
        note: `原文抓取失败，网页返回 ${response.status}`
      };
      sourceMaterialCache.set(cacheKey, result);
      return result;
    }

    if (seemsBlocked(html)) {
      const result = {
        note: "原文网页可达，但被门禁或验证页拦截"
      };
      sourceMaterialCache.set(cacheKey, result);
      return result;
    }

    const result: SourceMaterialExtractionResult = {
      title: extractTitle(html),
      excerpt: buildExcerpt(html),
      fetchedAt: new Date().toISOString(),
      note: "已抓取原始链接正文片段"
    };
    sourceMaterialCache.set(cacheKey, result);
    return result;
  } catch (error) {
    const result = {
      note: error instanceof Error ? `原文抓取失败：${error.message}` : "原文抓取失败"
    };
    sourceMaterialCache.set(cacheKey, result);
    return result;
  } finally {
    clearTimeout(timeout);
  }
}
