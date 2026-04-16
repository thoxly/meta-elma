import type { LlmGenerateInput, LlmGenerateOutput, LlmProvider, LlmSemanticInput, SemanticMappingDraft } from "@meta-elma/domain";

export interface OpenAiProviderConfig {
  model?: string;
  baseUrl?: string;
}

export class OpenAIResponsesProvider implements LlmProvider {
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(config: OpenAiProviderConfig = {}) {
    this.model = config.model ?? "gpt-4o-mini";
    this.baseUrl = config.baseUrl ?? "https://api.openai.com/v1";
  }

  private async callOpenAi(llmToken: string, input: string): Promise<string> {
    if (!llmToken) {
      return "LLM token is missing. Attach your LLM credential to run generation.";
    }

    const res = await fetch(`${this.baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${llmToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        input
      })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI request failed: ${res.status} ${text}`);
    }

    const payload = (await res.json()) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    };

    if (payload.output_text) {
      return payload.output_text;
    }

    const firstText = payload.output?.flatMap((item) => item.content ?? []).find((part) => part.type === "output_text")
      ?.text;
    return firstText ?? "No response text returned by model.";
  }

  async generateAnswer(input: LlmGenerateInput, llmToken: string): Promise<LlmGenerateOutput> {
    const prompt = [
      "You are a read-only ELMA365 assistant.",
      `Question: ${input.question}`,
      `Context summary: ${input.compactContext.summary}`,
      `Facts: ${JSON.stringify(input.liveFacts)}`
    ].join("\n");

    const answer = await this.callOpenAi(llmToken, prompt);
    return { answer, usedModel: this.model };
  }

  async generateSemanticDraft(input: LlmSemanticInput, llmToken: string): Promise<SemanticMappingDraft> {
    const prompt = [
      "Build semantic mapping draft for ELMA structural snapshot.",
      "Return concise business naming and description ideas.",
      JSON.stringify(input.snapshot)
    ].join("\n");

    const raw = await this.callOpenAi(llmToken, prompt);
    return {
      entities: input.snapshot.apps.slice(0, 20).map((app) => ({
        entityKey: `${app.namespace}.${app.code}`,
        businessName: app.title,
        description: raw.slice(0, 240),
        confidence: 0.6
      })),
      relationNotes: input.snapshot.relationHints.map((hint) => ({
        from: hint.from,
        to: hint.to,
        meaning: hint.reason
      }))
    };
  }
}
