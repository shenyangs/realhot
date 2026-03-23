export const WORKSPACE_PLAN_VALUES = ["trial", "pro", "enterprise", "unlimited"] as const;

export type WorkspacePlanType = (typeof WORKSPACE_PLAN_VALUES)[number];

export const WORKSPACE_PLAN_OPTIONS: Array<{ value: WorkspacePlanType; label: string }> = [
  { value: "trial", label: "试用版 Trial" },
  { value: "pro", label: "专业版 Pro" },
  { value: "enterprise", label: "企业版 Enterprise" },
  { value: "unlimited", label: "不限量 Unlimited" }
];

export function isWorkspacePlanType(value: string): value is WorkspacePlanType {
  return WORKSPACE_PLAN_VALUES.includes(value as WorkspacePlanType);
}

export function normalizeWorkspacePlanType(value?: string | null): WorkspacePlanType {
  const normalized = value?.trim().toLowerCase() ?? "";

  if (!normalized) {
    return "trial";
  }

  return isWorkspacePlanType(normalized) ? normalized : "trial";
}

export function requireWorkspacePlanType(value?: string | null): WorkspacePlanType {
  const normalized = value?.trim().toLowerCase() ?? "";

  if (!normalized) {
    throw new Error("workspace_plan_type_invalid");
  }

  if (!isWorkspacePlanType(normalized)) {
    throw new Error("workspace_plan_type_invalid");
  }

  return normalized;
}

export function getWorkspacePlanLabel(value?: string | null): string {
  const normalized = normalizeWorkspacePlanType(value);
  return WORKSPACE_PLAN_OPTIONS.find((option) => option.value === normalized)?.label ?? "试用版 Trial";
}
