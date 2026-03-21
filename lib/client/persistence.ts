export interface StoredDraftSnapshot {
  title: string;
  body: string;
  coverHook: string;
  changeLog: Array<{
    id: string;
    mode: "direct" | "suggest";
    request: string;
    summary: string;
    provider: string;
    createdAt: string;
    applied: boolean;
    appliedAt?: string;
  }>;
  savedAt: string;
}

export interface StoredDraftPayload extends StoredDraftSnapshot {
  updatedAt: string;
  previousSnapshot?: StoredDraftSnapshot;
}

export interface StoredOnboardingPayload {
  stepIndex: number;
  completed: boolean;
  completedSteps: number;
  updatedAt: string;
  basic: {
    brandName: string;
    sector: string;
    slogan: string;
    audiences: string;
  };
  goals: {
    topics: string;
    primaryPlatforms: string;
    objective: string;
  };
  rules: {
    tone: string;
    redLines: string;
    competitors: string;
  };
  materials: string[];
  recent: string;
}

export function getDraftStorageKey(input: {
  packId: string;
  variantId: string;
  platform: string;
}) {
  return `signalstack:draft:${input.packId}:${input.variantId}:${input.platform}`;
}

export function getOnboardingStorageKey(brandName: string) {
  return `signalstack:onboarding:${brandName}`;
}

export function formatLocalTimestamp(value?: string) {
  if (!value) {
    return "未记录";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "未记录";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
