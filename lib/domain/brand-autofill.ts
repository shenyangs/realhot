import { BrandSource, BrandStrategyPack } from "@/lib/domain/types";

export interface BrandAutofillDraft {
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

export interface BrandAutofillReference {
  title: string;
  url: string;
  label: string;
  type: BrandSource["type"];
  freshness: BrandSource["freshness"];
  value: string;
}

export interface BrandAutofillRoute {
  provider: string;
  model: string;
  reason: string;
}

export interface BrandAutofillResult {
  route: BrandAutofillRoute;
  strategy: BrandStrategyPack;
  draft: BrandAutofillDraft;
  researchSummary: string;
  confidenceNote: string;
  references: BrandAutofillReference[];
  updatedAt: string;
}
