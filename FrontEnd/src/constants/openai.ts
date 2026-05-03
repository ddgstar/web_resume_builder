import type { AppSettings } from "../types/domain";

export const openAIModelOptions = [
  { value: "gpt-5-nano", label: "GPT-5 Nano", hint: "Lowest cost" },
  { value: "gpt-5.4-nano", label: "GPT-5.4 Nano", hint: "Lowest cost, newer" },
  { value: "gpt-5-mini", label: "GPT-5 Mini", hint: "Low cost" },
  { value: "gpt-5.4-mini", label: "GPT-5.4 Mini", hint: "Recommended default" },
  { value: "gpt-5", label: "GPT-5", hint: "Balanced quality" },
  { value: "gpt-5.3-chat-latest", label: "GPT-5.3 Chat Latest", hint: "Chat optimized" },
  { value: "gpt-5.4", label: "GPT-5.4", hint: "High quality" },
  { value: "gpt-5.5", label: "GPT-5.5", hint: "Higher quality" },
  { value: "gpt-5-pro", label: "GPT-5 Pro", hint: "Premium" },
  { value: "gpt-5.5-pro", label: "GPT-5.5 Pro", hint: "Highest cost" }
] as const;

export const modelQualityLabels: Map<string, { label: string; hint: string; rank: number; total: number }> = new Map(openAIModelOptions.map((model, index) => [
  model.value,
  {
    label: model.label,
    hint: model.hint,
    rank: index + 1,
    total: openAIModelOptions.length
  }
]));

export const reasoningOptions: Array<{ value: AppSettings["reasoningEffort"]; label: string; hint: string }> = [
  { value: "low", label: "Low", hint: "Fastest / cheapest" },
  { value: "medium", label: "Medium", hint: "Recommended" },
  { value: "high", label: "High", hint: "More thorough" },
  { value: "xhigh", label: "XHigh", hint: "Maps to high if unsupported" }
];
