interface VercelBillingChargeRecord {
  [key: string]: unknown;
}

type VercelUsageState =
  | "ok"
  | "not_configured"
  | "unauthorized"
  | "unsupported"
  | "upstream_error";

export interface VercelUsageTopService {
  name: string;
  costUsd: number | null;
  quantity: number | null;
  unit: string | null;
}

export interface VercelUsageByUnit {
  unit: string;
  quantity: number;
}

export interface VercelUsageSummary {
  state: VercelUsageState;
  message: string;
  from: string;
  to: string;
  pulledAt: string;
  recordCount: number;
  totalCostUsd: number | null;
  topServices: VercelUsageTopService[];
  usageByUnit: VercelUsageByUnit[];
  sampleFields: string[];
}

const DEFAULT_LOOKBACK_DAYS = 30;
const MAX_LOOKBACK_DAYS = 365;

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(normalized) ? normalized : null;
  }

  return null;
}

function pickString(record: VercelBillingChargeRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function pickNumber(record: VercelBillingChargeRecord, keys: string[]): number | null {
  for (const key of keys) {
    const value = normalizeNumber(record[key]);

    if (value !== null) {
      return value;
    }
  }

  return null;
}

function parseJsonLines(input: string): VercelBillingChargeRecord[] {
  return input
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        const parsed = JSON.parse(line) as unknown;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as VercelBillingChargeRecord)
          : null;
      } catch {
        return null;
      }
    })
    .filter((item): item is VercelBillingChargeRecord => item !== null);
}

function parseErrorMessage(raw: string): string | null {
  const trimmed = raw.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      error?: {
        message?: string;
        code?: string;
      };
      message?: string;
    };

    return parsed.error?.message ?? parsed.message ?? null;
  } catch {
    return trimmed.slice(0, 300);
  }
}

function resolveLookbackDays(days?: number): number {
  const value = Number.isFinite(days) ? Math.floor(days ?? DEFAULT_LOOKBACK_DAYS) : DEFAULT_LOOKBACK_DAYS;

  if (value < 1) {
    return 1;
  }

  if (value > MAX_LOOKBACK_DAYS) {
    return MAX_LOOKBACK_DAYS;
  }

  return value;
}

function toRounded(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function getVercelUsageSummary(input?: {
  days?: number;
}): Promise<VercelUsageSummary> {
  const lookbackDays = resolveLookbackDays(input?.days);
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const from = fromDate.toISOString();
  const to = toDate.toISOString();
  const pulledAt = new Date().toISOString();

  const token = process.env.VERCEL_API_TOKEN?.trim();
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const teamSlug = process.env.VERCEL_TEAM_SLUG?.trim();

  if (!token) {
    return {
      state: "not_configured",
      message: "未配置 VERCEL_API_TOKEN，无法拉取 Vercel Usage。",
      from,
      to,
      pulledAt,
      recordCount: 0,
      totalCostUsd: null,
      topServices: [],
      usageByUnit: [],
      sampleFields: []
    };
  }

  const url = new URL("https://api.vercel.com/v1/billing/charges");
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);

  if (teamId) {
    url.searchParams.set("teamId", teamId);
  }

  if (teamSlug) {
    url.searchParams.set("slug", teamSlug);
  }

  let response: Response;
  let raw = "";

  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Accept-Encoding": "gzip"
      },
      cache: "no-store"
    });
    raw = await response.text();
  } catch (error) {
    return {
      state: "upstream_error",
      message: error instanceof Error ? error.message : "连接 Vercel API 失败",
      from,
      to,
      pulledAt,
      recordCount: 0,
      totalCostUsd: null,
      topServices: [],
      usageByUnit: [],
      sampleFields: []
    };
  }

  if (!response.ok) {
    const detail = parseErrorMessage(raw) ?? "Unknown upstream error";

    if (response.status === 401 || response.status === 403) {
      return {
        state: "unauthorized",
        message: `Vercel API 无权限读取 billing/usage：${detail}`,
        from,
        to,
        pulledAt,
        recordCount: 0,
        totalCostUsd: null,
        topServices: [],
        usageByUnit: [],
        sampleFields: []
      };
    }

    if (response.status === 404) {
      return {
        state: "unsupported",
        message: `当前账号/套餐可能不支持 billing API：${detail}`,
        from,
        to,
        pulledAt,
        recordCount: 0,
        totalCostUsd: null,
        topServices: [],
        usageByUnit: [],
        sampleFields: []
      };
    }

    return {
      state: "upstream_error",
      message: `Vercel API 调用失败（${response.status}）：${detail}`,
      from,
      to,
      pulledAt,
      recordCount: 0,
      totalCostUsd: null,
      topServices: [],
      usageByUnit: [],
      sampleFields: []
    };
  }

  const records = parseJsonLines(raw);
  const serviceBuckets = new Map<
    string,
    {
      cost: number;
      hasCost: boolean;
      quantity: number;
      hasQuantity: boolean;
      unit: string | null;
    }
  >();
  const unitBuckets = new Map<string, number>();
  let totalCost = 0;
  let hasTotalCost = false;

  for (const record of records) {
    const serviceName =
      pickString(record, [
        "serviceName",
        "ServiceName",
        "productName",
        "ProductName",
        "meterName",
        "MeterName",
        "chargeCategory",
        "ChargeCategory",
        "resourceName",
        "ResourceName"
      ]) ?? "Unknown";
    const cost = pickNumber(record, [
      "billedCost",
      "BilledCost",
      "cost",
      "Cost",
      "effectiveCost",
      "EffectiveCost",
      "listCost",
      "ListCost"
    ]);
    const quantity = pickNumber(record, [
      "usageQuantity",
      "UsageQuantity",
      "consumedQuantity",
      "ConsumedQuantity",
      "quantity",
      "Quantity"
    ]);
    const unit =
      pickString(record, [
        "usageUnit",
        "UsageUnit",
        "consumedUnit",
        "ConsumedUnit",
        "unit",
        "Unit"
      ]) ?? null;

    const current = serviceBuckets.get(serviceName) ?? {
      cost: 0,
      hasCost: false,
      quantity: 0,
      hasQuantity: false,
      unit
    };

    if (cost !== null) {
      current.cost += cost;
      current.hasCost = true;
      totalCost += cost;
      hasTotalCost = true;
    }

    if (quantity !== null) {
      current.quantity += quantity;
      current.hasQuantity = true;

      if (unit) {
        unitBuckets.set(unit, (unitBuckets.get(unit) ?? 0) + quantity);
      }
    }

    if (!current.unit && unit) {
      current.unit = unit;
    }

    serviceBuckets.set(serviceName, current);
  }

  const topServices = Array.from(serviceBuckets.entries())
    .map(([name, bucket]) => ({
      name,
      costUsd: bucket.hasCost ? toRounded(bucket.cost) : null,
      quantity: bucket.hasQuantity ? toRounded(bucket.quantity) : null,
      unit: bucket.unit
    }))
    .sort((left, right) => {
      const costDiff = (right.costUsd ?? -1) - (left.costUsd ?? -1);

      if (costDiff !== 0) {
        return costDiff;
      }

      return (right.quantity ?? -1) - (left.quantity ?? -1);
    })
    .slice(0, 12);

  const usageByUnit = Array.from(unitBuckets.entries())
    .map(([unit, quantity]) => ({
      unit,
      quantity: toRounded(quantity)
    }))
    .sort((left, right) => right.quantity - left.quantity);

  return {
    state: "ok",
    message:
      records.length > 0
        ? `已拉取最近 ${lookbackDays} 天 Vercel usage 数据。`
        : `最近 ${lookbackDays} 天未返回 usage 记录。`,
    from,
    to,
    pulledAt,
    recordCount: records.length,
    totalCostUsd: hasTotalCost ? toRounded(totalCost) : null,
    topServices,
    usageByUnit,
    sampleFields: records[0] ? Object.keys(records[0]).slice(0, 20) : []
  };
}
