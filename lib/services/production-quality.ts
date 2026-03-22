import { ProductionQualityIssue, ProductionQualityReport } from "@/lib/domain/types";

const riskKeywords = [
  "保证",
  "稳赚",
  "绝对",
  "百分百",
  "内幕",
  "唯一",
  "永久有效"
];

function pushIssue(
  target: ProductionQualityIssue[],
  input: {
    code: string;
    message: string;
    severity: "low" | "medium" | "high";
  }
) {
  target.push({
    code: input.code,
    message: input.message,
    severity: input.severity
  });
}

export function assessProductionBundleQuality(input: {
  title: string;
  body: string;
  subtitles: string;
  hasCover: boolean;
  hasVideo: boolean;
  hasVoiceScript: boolean;
}): ProductionQualityReport {
  const issues: ProductionQualityIssue[] = [];
  const normalizedTitle = input.title.trim();
  const normalizedBody = input.body.trim();
  const normalizedSubtitles = input.subtitles.trim();
  const bodyCharCount = normalizedBody.replace(/\s+/g, "").length;

  if (normalizedTitle.length < 8) {
    pushIssue(issues, {
      code: "title_too_short",
      message: "标题过短，建议至少 8 个字。",
      severity: "medium"
    });
  }

  if (bodyCharCount < 180) {
    pushIssue(issues, {
      code: "body_too_short",
      message: "正文长度偏短，建议补充关键信息与行动建议。",
      severity: "high"
    });
  }

  if (!input.hasCover) {
    pushIssue(issues, {
      code: "cover_missing",
      message: "缺少封面素材。",
      severity: "high"
    });
  }

  if (!input.hasVideo) {
    pushIssue(issues, {
      code: "video_missing",
      message: "缺少视频素材。",
      severity: "medium"
    });
  }

  if (!input.hasVoiceScript) {
    pushIssue(issues, {
      code: "voice_missing",
      message: "缺少口播文稿或音轨资产。",
      severity: "medium"
    });
  }

  if (!normalizedSubtitles) {
    pushIssue(issues, {
      code: "subtitle_missing",
      message: "字幕为空，建议至少生成一版 SRT 草稿。",
      severity: "medium"
    });
  }

  const hitWords = riskKeywords.filter((word) => normalizedTitle.includes(word) || normalizedBody.includes(word));

  if (hitWords.length > 0) {
    pushIssue(issues, {
      code: "risk_keyword_hit",
      message: `命中风险词：${hitWords.join("、")}`,
      severity: "high"
    });
  }

  const penalty = issues.reduce((sum, issue) => {
    if (issue.severity === "high") {
      return sum + 24;
    }

    if (issue.severity === "medium") {
      return sum + 12;
    }

    return sum + 4;
  }, 0);
  const score = Math.max(0, 100 - penalty);

  return {
    score,
    passed: issues.every((issue) => issue.severity !== "high"),
    issues,
    generatedAt: new Date().toISOString()
  };
}
