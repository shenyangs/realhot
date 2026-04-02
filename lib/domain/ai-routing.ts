export const AI_PROVIDERS = ["minimax"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const AI_FEATURES = [
  "rewrite",
  "rewrite-prompts",
  "hotspot-insight",
  "content-generation",
  "production-generation",
  "pack-preview",
  "brand-autofill"
] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

export interface AiRoutingConfig {
  defaultProvider: AiProvider;
  featureProviderOverrides: Partial<Record<AiFeature, AiProvider>>;
  featureModelOverrides: Partial<Record<AiFeature, string>>;
}

export const DEFAULT_AI_ROUTING_CONFIG: AiRoutingConfig = {
  defaultProvider: "minimax",
  featureProviderOverrides: {},
  featureModelOverrides: {
    "production-generation": "MiniMax-M2.7"
  }
};

export const aiFeatureLabels: Record<AiFeature, string> = {
  rewrite: "改稿助手",
  "rewrite-prompts": "改稿提示生成",
  "hotspot-insight": "热点深挖",
  "content-generation": "热点内容生成",
  "production-generation": "一键制作图文/视频",
  "pack-preview": "内容预览生成",
  "brand-autofill": "品牌自动填充"
};
