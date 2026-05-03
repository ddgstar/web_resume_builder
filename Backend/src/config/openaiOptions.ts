export const openAIModelIDs = [
  "gpt-5-nano",
  "gpt-5.4-nano",
  "gpt-5-mini",
  "gpt-5.4-mini",
  "gpt-5",
  "gpt-5.3-chat-latest",
  "gpt-5.4",
  "gpt-5.5",
  "gpt-5-pro",
  "gpt-5.5-pro"
] as const;

export const reasoningEfforts = ["low", "medium", "high", "xhigh"] as const;

export type OpenAIModelID = (typeof openAIModelIDs)[number];
export type ReasoningEffort = (typeof reasoningEfforts)[number];
