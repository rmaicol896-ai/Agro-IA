import type { AppMode, ChatMessage } from "@agroia/shared";
import { setting } from "./db.js";
import { offlineAnswer } from "./domain.js";

export interface AIProvider {
  generate(messages: ChatMessage[], systemPrompt: string): Promise<string>;
}

export class OfflineAIProvider implements AIProvider {
  constructor(private readonly mode: AppMode, private readonly species: string[]) {}

  async generate(messages: ChatMessage[], _systemPrompt: string): Promise<string> {
    return offlineAnswer(messages.at(-1)?.content ?? "", this.mode, this.species[0]);
  }
}

export class OllamaAIProvider implements AIProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly fallback: OfflineAIProvider,
  ) {}

  async generate(messages: ChatMessage[], systemPrompt: string): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          messages: [{ role: "system", content: systemPrompt }, ...messages],
        }),
        signal: AbortSignal.timeout(120000),
      });
      if (!response.ok) throw new Error(`Ollama respondió ${response.status}; verifica que el servicio y modelo estén disponibles.`);
      const data = await response.json() as { message?: { content?: string } };
      if (!data.message?.content) throw new Error("Ollama devolvió una respuesta vacía.");
      return data.message.content;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Ollama no respondió.";
      console.warn(`Ollama no disponible; se activa la guía local: ${reason}`);
      const answer = await this.fallback.generate(messages, systemPrompt);
      return `${answer}\n\n_Nota: Ollama no respondió; esta orientación se generó con la guía sin conexión._`;
    }
  }
}

export class OpenAICompatibleProvider implements AIProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly apiKey: string,
  ) {}

  async generate(messages: ChatMessage[], systemPrompt: string): Promise<string> {
    if (!this.apiKey) throw new Error("Configura la clave de API compatible con OpenAI en Ajustes.");
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, messages: [{ role: "system", content: systemPrompt }, ...messages] }),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error(`Proveedor OpenAI compatible respondió ${response.status}.`);
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const answer = data.choices?.[0]?.message?.content;
    if (!answer) throw new Error("El proveedor devolvió una respuesta vacía.");
    return answer;
  }
}

export class AnthropicProvider implements AIProvider {
  constructor(private readonly model: string, private readonly apiKey: string) {}

  async generate(messages: ChatMessage[], systemPrompt: string): Promise<string> {
    if (!this.apiKey) throw new Error("Configura la clave de Anthropic en Ajustes.");
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1200,
        system: systemPrompt,
        messages: messages.map(({ role, content }) => ({ role, content })),
      }),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error(`Anthropic respondió ${response.status}.`);
    const data = await response.json() as { content?: Array<{ type: string; text?: string }> };
    const answer = data.content?.find((item) => item.type === "text")?.text;
    if (!answer) throw new Error("Anthropic devolvió una respuesta vacía.");
    return answer;
  }
}

export function createAIProvider(name: string, mode: AppMode, species: string[]): AIProvider {
  const offline = new OfflineAIProvider(mode, species);
  switch (name) {
    case "offline":
      return offline;
    case "ollama":
      return new OllamaAIProvider(setting("ollama_base_url"), setting("ollama_model"), offline);
    case "openai":
      return new OpenAICompatibleProvider(setting("openai_base_url"), setting("openai_model"), setting("openai_api_key"));
    case "anthropic":
      return new AnthropicProvider(setting("anthropic_model"), setting("anthropic_api_key"));
    default:
      throw new Error(`El proveedor configurado (“${name}”) no está soportado.`);
  }
}
