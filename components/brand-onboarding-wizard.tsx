"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { BrandAutofillPanel, type BrandAutofillPayload } from "@/components/brand-autofill-panel";
import type { BrandAutofillFocus } from "@/lib/domain/brand-autofill";
import {
  formatLocalTimestamp,
  getOnboardingStorageKey,
  type StoredOnboardingPayload
} from "@/lib/client/persistence";

interface OnboardingWizardProps {
  brandName: string;
  sector: string;
  slogan: string;
  audiences: string[];
  topics: string[];
  tone: string[];
  redLines: string[];
  recentMoves: string[];
  sourceLabels: string[];
}

type StepKey = "basic" | "goals" | "rules" | "materials" | "recent" | "done";

interface StepConfig {
  key: StepKey;
  step: string;
  title: string;
  description: string;
}

const steps: StepConfig[] = [
  {
    key: "basic",
    step: "01",
    title: "品牌基础",
    description: "先让系统知道你是谁、卖什么、面向谁。"
  },
  {
    key: "goals",
    step: "02",
    title: "传播目标",
    description: "讲清楚今年重点方向和优先平台。"
  },
  {
    key: "rules",
    step: "03",
    title: "表达规则",
    description: "把语气、禁区和竞品边界提前说清楚。"
  },
  {
    key: "materials",
    step: "04",
    title: "素材与资料",
    description: "先补最能直接提升内容质量的资料。"
  },
  {
    key: "recent",
    step: "05",
    title: "近期动态",
    description: "最近一个月发生了什么，会影响热点判断。"
  },
  {
    key: "done",
    step: "完成",
    title: "接入完成",
    description: "确认系统已经理解了品牌，再进入日常工作台。"
  }
];

const materialOptions = [
  "品牌介绍 / 手册",
  "产品资料",
  "客户案例",
  "历史爆文 / 创始人观点",
  "最近一个月活动资料",
  "最近一个月媒体新闻稿"
];

const stepAutofillConfig: Record<
  StepKey,
  {
    focus: BrandAutofillFocus;
    title: string;
    description: string;
    buttonLabel: string;
  }
> = {
  basic: {
    focus: "basic",
    title: "AI 帮填品牌基础",
    description: "联网补品牌名称、行业、一句话介绍和核心受众，先把品牌画像搭起来。",
    buttonLabel: "AI 填品牌基础"
  },
  goals: {
    focus: "goals",
    title: "AI 帮填传播目标",
    description: "结合公开资料整理今年重点传播方向、优先平台和主打主题词。",
    buttonLabel: "AI 填传播目标"
  },
  rules: {
    focus: "rules",
    title: "AI 帮填表达规则",
    description: "补品牌语气、禁区和竞品边界，先给内容生产设好护栏。",
    buttonLabel: "AI 填表达规则"
  },
  materials: {
    focus: "materials",
    title: "AI 帮填素材建议",
    description: "判断最值得补的资料项，并从公开来源里找出最有用的资料类型。",
    buttonLabel: "AI 填素材建议"
  },
  recent: {
    focus: "recent",
    title: "AI 帮填近期动态",
    description: "聚焦最近一个月的活动、发布、合作和传播动作，提升热点判断准确度。",
    buttonLabel: "AI 填近期动态"
  },
  done: {
    focus: "full",
    title: "AI 复核整份档案",
    description: "重新拉一版完整品牌草稿，帮你检查前 5 步还有没有明显缺口。",
    buttonLabel: "AI 复核品牌档案"
  }
};

export function BrandOnboardingWizard({
  brandName,
  sector,
  slogan,
  audiences,
  topics,
  tone,
  redLines,
  recentMoves,
  sourceLabels
}: OnboardingWizardProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [basic, setBasic] = useState({
    brandName,
    sector,
    slogan,
    audiences: audiences.join(" / ")
  });
  const [goals, setGoals] = useState({
    topics: topics.join(" / "),
    primaryPlatforms: "小红书 / 公众号 / 视频号 / 抖音",
    objective: "行业观点 + 品牌认知 + 热点快反"
  });
  const [rules, setRules] = useState({
    tone: tone.join(" / "),
    redLines: redLines.join("\n"),
    competitors: "避免碰瓷式比较，强调方法差异"
  });
  const [materials, setMaterials] = useState<string[]>(sourceLabels);
  const [recent, setRecent] = useState(recentMoves.join("\n"));
  const [saveState, setSaveState] = useState<"loading" | "saving" | "saved">("loading");
  const [lastSavedAt, setLastSavedAt] = useState<string>();
  const [storageBrandName, setStorageBrandName] = useState(brandName);
  const initializedRef = useRef(false);

  const currentStep = steps[stepIndex];
  const progress = Math.round(((stepIndex + 1) / steps.length) * 100);
  const missingMaterials = useMemo(
    () => materialOptions.filter((item) => !materials.includes(item)),
    [materials]
  );
  const storageKey = useMemo(() => getOnboardingStorageKey(storageBrandName), [storageBrandName]);
  const completedSteps = useMemo(() => {
    let count = 0;

    if (basic.brandName && basic.sector && basic.slogan && basic.audiences) {
      count += 1;
    }

    if (goals.objective && goals.primaryPlatforms && goals.topics) {
      count += 1;
    }

    if (rules.tone && rules.redLines && rules.competitors) {
      count += 1;
    }

    if (materials.length > 0) {
      count += 1;
    }

    if (recent.trim()) {
      count += 1;
    }

    return count;
  }, [basic, goals, materials.length, recent, rules]);

  useEffect(() => {
    const initialStorageKey = getOnboardingStorageKey(brandName);
    const stored = window.localStorage.getItem(initialStorageKey);

    if (stored) {
      try {
        const parsed = JSON.parse(stored) as StoredOnboardingPayload;
        setStepIndex(parsed.stepIndex ?? 0);
        setBasic(parsed.basic);
        setGoals(parsed.goals);
        setRules(parsed.rules);
        setMaterials(parsed.materials ?? []);
        setRecent(parsed.recent ?? "");
        setLastSavedAt(parsed.updatedAt);
        setStorageBrandName(parsed.basic?.brandName || brandName);
      } catch {
        window.localStorage.removeItem(initialStorageKey);
      }
    }

    initializedRef.current = true;
    setSaveState("saved");
  }, [brandName]);

  useEffect(() => {
    if (!initializedRef.current) {
      return;
    }

    setSaveState("saving");

    const timeout = window.setTimeout(() => {
      const payload: StoredOnboardingPayload = {
        stepIndex,
        completed: completedSteps >= 5,
        completedSteps,
        updatedAt: new Date().toISOString(),
        basic,
        goals,
        rules,
        materials,
        recent
      };

      window.localStorage.setItem(storageKey, JSON.stringify(payload));
      setLastSavedAt(payload.updatedAt);
      setSaveState("saved");
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [basic, completedSteps, goals, materials, recent, rules, stepIndex, storageKey]);

  function nextStep() {
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  }

  function prevStep() {
    setStepIndex((current) => Math.max(current - 1, 0));
  }

  function toggleMaterial(item: string) {
    setMaterials((current) =>
      current.includes(item)
        ? current.filter((value) => value !== item)
        : [...current, item]
    );
  }

  function applyAutofill(payload: BrandAutofillPayload) {
    setBasic(payload.draft.basic);
    setGoals(payload.draft.goals);
    setRules(payload.draft.rules);
    setMaterials(payload.draft.materials);
    setRecent(payload.draft.recent);
    setStorageBrandName(payload.strategy.name);
    setSaveState("saved");
    setLastSavedAt(payload.updatedAt);
  }

  function applyStepAutofill(step: StepKey, payload: BrandAutofillPayload) {
    if (step === "basic") {
      setBasic(payload.draft.basic);
      setStorageBrandName(payload.strategy.name);
    } else if (step === "goals") {
      setGoals(payload.draft.goals);
    } else if (step === "rules") {
      setRules(payload.draft.rules);
    } else if (step === "materials") {
      setMaterials(payload.draft.materials);
    } else if (step === "recent") {
      setRecent(payload.draft.recent);
    } else {
      applyAutofill(payload);
      return;
    }

    setSaveState("saved");
    setLastSavedAt(payload.updatedAt);
  }

  return (
    <div className="onboardingLayout">
      <aside className="onboardingSidebar panel">
        <div>
          <p className="eyebrow">品牌接入</p>
          <h2>品牌设置</h2>
          <p className="muted">
            用于补齐品牌基础、目标与表达边界。
          </p>
        </div>

        <div className="progressPanel">
          <div className="listItem">
            <strong>当前进度</strong>
            <span>{progress}%</span>
          </div>
          <div className="progressTrack">
            <span style={{ width: `${progress}%` }} />
          </div>
          <small className="muted">
            {saveState === "loading"
              ? "正在读取本地接入草稿"
              : saveState === "saving"
                ? "正在保存接入草稿"
                : `已保存 · ${formatLocalTimestamp(lastSavedAt)}`}
          </small>
        </div>

        <div className="onboardingStepList">
          {steps.map((step, index) => (
            <button
              className={`onboardingStepItem ${index === stepIndex ? "onboardingStepItemActive" : ""}`}
              key={step.key}
              onClick={() => setStepIndex(index)}
              type="button"
            >
              <span className="stepBadge">{step.step}</span>
              <div>
                <strong>{step.title}</strong>
                <p className="muted">{step.description}</p>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className="onboardingMain">
        <section className="panel onboardingPanel">
          <div className="panelHeader sectionTitle">
            <div>
              <p className="eyebrow">{currentStep.step}</p>
              <h3>{currentStep.title}</h3>
              <p className="muted">{currentStep.description}</p>
            </div>
          </div>

          <BrandAutofillPanel
            buttonLabel={stepAutofillConfig[currentStep.key].buttonLabel}
            compact
            description={stepAutofillConfig[currentStep.key].description}
            focus={stepAutofillConfig[currentStep.key].focus}
            initialBrandName={basic.brandName || brandName}
            onApplied={(payload) => applyStepAutofill(currentStep.key, payload)}
            persistDraftToStorage={false}
            refreshAfterApply={false}
            title={stepAutofillConfig[currentStep.key].title}
          />

          {currentStep.key === "basic" ? (
            <div className="stack">
              <label className="field">
                <span>品牌名称</span>
                <input
                  value={basic.brandName}
                  onChange={(event) =>
                    setBasic((current) => ({ ...current, brandName: event.target.value }))
                  }
                />
              </label>
              <div className="grid grid-2">
                <label className="field">
                  <span>所属行业</span>
                  <input
                    value={basic.sector}
                    onChange={(event) =>
                      setBasic((current) => ({ ...current, sector: event.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  <span>目标客群</span>
                  <input
                    value={basic.audiences}
                    onChange={(event) =>
                      setBasic((current) => ({ ...current, audiences: event.target.value }))
                    }
                  />
                </label>
              </div>
              <label className="field">
                <span>一句话介绍</span>
                <textarea
                  rows={4}
                  value={basic.slogan}
                  onChange={(event) =>
                    setBasic((current) => ({ ...current, slogan: event.target.value }))
                  }
                />
              </label>
            </div>
          ) : null}

          {currentStep.key === "goals" ? (
            <div className="stack">
              <label className="field">
                <span>今年重点传播方向</span>
                <textarea
                  rows={4}
                  value={goals.objective}
                  onChange={(event) =>
                    setGoals((current) => ({ ...current, objective: event.target.value }))
                  }
                />
              </label>
              <div className="grid grid-2">
                <label className="field">
                  <span>优先平台</span>
                  <input
                    value={goals.primaryPlatforms}
                    onChange={(event) =>
                      setGoals((current) => ({
                        ...current,
                        primaryPlatforms: event.target.value
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>核心主题词</span>
                  <input
                    value={goals.topics}
                    onChange={(event) =>
                      setGoals((current) => ({ ...current, topics: event.target.value }))
                    }
                  />
                </label>
              </div>
            </div>
          ) : null}

          {currentStep.key === "rules" ? (
            <div className="stack">
              <label className="field">
                <span>品牌语气</span>
                <input
                  value={rules.tone}
                  onChange={(event) =>
                    setRules((current) => ({ ...current, tone: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>禁区与敏感边界</span>
                <textarea
                  rows={6}
                  value={rules.redLines}
                  onChange={(event) =>
                    setRules((current) => ({ ...current, redLines: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>竞品边界说明</span>
                <textarea
                  rows={4}
                  value={rules.competitors}
                  onChange={(event) =>
                    setRules((current) => ({ ...current, competitors: event.target.value }))
                  }
                />
              </label>
            </div>
          ) : null}

          {currentStep.key === "materials" ? (
            <div className="stack">
              <div className="materialToggleGrid">
                {materialOptions.map((item) => {
                  const active = materials.includes(item);
                  return (
                    <button
                      className={`materialToggle ${active ? "materialToggleActive" : ""}`}
                      key={item}
                      onClick={() => toggleMaterial(item)}
                      type="button"
                    >
                      <strong>{item}</strong>
                      <span>{active ? "已具备" : "待补充"}</span>
                    </button>
                  );
                })}
              </div>
              <div className="subPanel">
                <strong>系统提示</strong>
                <p className="muted">
                  {missingMaterials.length === 0
                    ? "基础资料已经比较完整，后面的热点判断和改稿会更稳定。"
                    : `建议优先补：${missingMaterials.join("、")}。这些资料最能直接提升生成质量。`}
                </p>
              </div>
            </div>
          ) : null}

          {currentStep.key === "recent" ? (
            <div className="stack">
              <label className="field">
                <span>最近一个月活动 / 新闻稿 / 节点</span>
                <textarea
                  rows={8}
                  value={recent}
                  onChange={(event) => setRecent(event.target.value)}
                />
              </label>
              <div className="subPanel">
                <strong>为什么这一步重要</strong>
                <p className="muted">
                  热点能不能借得自然，往往取决于最近这一个月品牌到底做了什么、说了什么、准备发什么。
                </p>
              </div>
            </div>
          ) : null}

          {currentStep.key === "done" ? (
            <div className="stack">
              <div className="completionGrid">
                <article className="subPanel">
                  <strong>系统已理解的品牌画像</strong>
                  <p className="muted">
                    {basic.brandName} 属于 {basic.sector}，当前重点面向 {basic.audiences}，准备在{" "}
                    {goals.primaryPlatforms} 上持续做 {goals.objective}。
                  </p>
                </article>
                <article className="subPanel">
                  <strong>当前资料状态</strong>
                  <p className="muted">
                    已具备 {materials.length} 类核心资料。
                    {missingMaterials.length === 0
                      ? "现在可以比较完整地开始热点判断和内容生产。"
                      : `仍建议补充：${missingMaterials.join("、")}。`}
                  </p>
                </article>
              </div>
              <div className="definitionList">
                <div>
                  <span>接入完成度</span>
                  <strong>{completedSteps}/5 项</strong>
                </div>
                <div>
                  <span>品牌语气</span>
                  <strong>{rules.tone}</strong>
                </div>
                <div>
                  <span>重点主题</span>
                  <strong>{goals.topics}</strong>
                </div>
                <div>
                  <span>近期动态</span>
                  <strong>{recent.split("\n").filter(Boolean)[0] ?? "已补充近期动态"}</strong>
                </div>
              </div>
              <div className="buttonRow">
                <Link className="buttonLike primaryButton" href="/">
                  进入今日选题台
                </Link>
                <Link className="buttonLike subtleButton" href="/brands">
                  进入品牌与规则
                </Link>
              </div>
            </div>
          ) : null}

          <div className="onboardingActions">
            <button
              disabled={stepIndex === 0}
              onClick={prevStep}
              type="button"
            >
              上一步
            </button>
            <button
              onClick={nextStep}
              type="button"
            >
              {stepIndex === steps.length - 1 ? "重新查看" : "下一步"}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
