import Anthropic from "@anthropic-ai/sdk";

export interface EnrichmentInput {
  plan: string;
  events_30d: number;
}

export interface Enrichment {
  segment: string;
}

// With ANTHROPIC_API_KEY set this calls the Anthropic API.
// Without it, a fixed stub is returned so the sample runs offline.
export async function classifySegment(input: EnrichmentInput): Promise<Enrichment> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { segment: "power-user" };
  }

  const client = new Anthropic();
  const message = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-5-5",
    max_tokens: 50,
    messages: [
      {
        role: "user",
        content:
          `Classify this user into one segment: new-user, casual, or power-user.\n` +
          `Plan: ${input.plan}. Events in last 30 days: ${input.events_30d}.\n` +
          `Reply with only the segment name.`,
      },
    ],
  });

  const block = message.content[0];
  const text = block?.type === "text" ? block.text.trim() : "";
  return { segment: text || "casual" };
}
