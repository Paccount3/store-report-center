import OpenAI from "openai";
import { getStore } from "@/lib/db";
import { buildDiscussPack, discussSystemPrompt } from "@/lib/discuss";
import { fail, json, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Turn = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const storeId = typeof record.storeId === "string" ? record.storeId : "";
    const scope = typeof record.scope === "string" ? record.scope : "";
    const from = typeof record.from === "string" && record.from ? record.from : null;
    const to = typeof record.to === "string" && record.to ? record.to : null;
    const opener = record.opener === true;
    const messages = sanitizeMessages(record.messages);
    const store = getStore(storeId);
    if (!store) return fail("Store not found.", 404);

    const pack = buildDiscussPack(store, scope, from, to);
    if (!pack) return fail("Unknown discussion scope.");
    if (!process.env.OPENAI_API_KEY) {
      return fail("Add OPENAI_API_KEY on the server to use Discuss with AI.", 503);
    }

    const history = messages.length
      ? messages
      : [{ role: "user" as const, content: openerText(pack.kind, pack.label) }];
    if (!opener && !messages.some((message) => message.role === "user")) {
      return fail("Ask a question to continue the discussion.");
    }

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const chat = [
      { role: "system" as const, content: discussSystemPrompt(pack.instruction) },
      {
        role: "system" as const,
        content: `Calculated data for ${pack.label} at ${pack.store.name} (store ${pack.store.code}), period ${pack.period}:\n${JSON.stringify(pack)}`,
      },
      ...history.map((message) => ({ role: message.role, content: message.content })),
    ];

    let completion;
    try {
      completion = await client.chat.completions.create({
        model,
        temperature: 0.3,
        messages: chat,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!/temperature/i.test(message)) throw error;
      completion = await client.chat.completions.create({ model, messages: chat });
    }

    const reply = (completion.choices[0]?.message?.content ?? "").trim();
    if (!reply) return fail("The model returned an empty reply.", 502);
    return json({
      reply,
      label: pack.label,
      kind: pack.kind,
      period: pack.period,
      model,
    });
  } catch (error) {
    console.error("POST /api/discuss", error);
    return fail(error instanceof Error ? error.message : "Could not continue the discussion.", 500);
  }
}

function openerText(kind: "section" | "chart", label: string) {
  return kind === "chart"
    ? `I want to discuss the ${label} chart. Give me a short, data-driven read.`
    : `I want to discuss the ${label} section. Give me a short, data-driven read.`;
}

function sanitizeMessages(value: unknown): Turn[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Turn => {
      if (!item || typeof item !== "object") return false;
      const record = item as Record<string, unknown>;
      return (record.role === "user" || record.role === "assistant") && typeof record.content === "string";
    })
    .map((item) => ({ role: item.role, content: item.content.trim().slice(0, 2000) }))
    .filter((item) => item.content)
    .slice(-12);
}
