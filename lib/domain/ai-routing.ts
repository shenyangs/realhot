export const AI_PROVIDERS = ["gemini", "minimax"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const AI_FEATURES = [
  "rewrite",
  "rewrite-prompts",
  "hotspot-insight",
  "content-generation",
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
  defaultProvider: "gemini",
  featureProviderOverrides: {},
  featureModelOverrides: {}
};

export const aiFeatureLabels: Record<AiFeature, string> = {
  rewrite: "改稿助手",
  "rewrite-prompts": "改稿提示生成",
  "hotspot-insight": "热点深挖",
  "content-generation": "热点内容生成",
  "pack-preview": "内容预览生成",
  "brand-autofill": "品牌自动填充"
};
