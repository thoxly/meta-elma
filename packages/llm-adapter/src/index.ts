import type { LLMProvider, ModelResponse, PromptTrace } from "@meta-elma/domain";

export class StaticPromptPolicy {
  buildSystemPrompt(mode: PromptTrace["promptMode"]): string {
    const sharedRules = [
      "Use only provided context.",
      "Do not invent ELMA features not present in context.",
      "Never expose secrets or tokens.",
      "State limitations when context is missing."
    ].join(" ");
    if (mode === "ask_system") {
      return `${sharedRules} Focus on explaining current ELMA configuration and metadata access.`;
    }
    if (mode === "solution_assistant") {
      return `${sharedRules} Focus on implementation recommendations grounded in provided metadata context.`;
    }
    return `${sharedRules} Focus on context quality, gaps, and what data is missing.`;
  }
}

export class OpenAIResponsesProvider implements LLMProvider {
  private readonly promptPolicy = new StaticPromptPolicy();

  async createResponse(input: {
    mode: PromptTrace["promptMode"];
    question: string;
    compactContext: { summary: string };
  }): Promise<ModelResponse> {
    const systemPrompt = this.promptPolicy.buildSystemPrompt(input.mode);
    return {
      answer: `System: ${systemPrompt}\nUser: ${input.question}\nContext: ${input.compactContext.summary}`,
      usedModel: "stub-model"
    };
  }
}
