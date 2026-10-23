import OpenAI from "openai";
import { isCategory, isPreset, type CategoryId } from "@/lib/catalog";
import { getStore } from "@/lib/db";
import { buildAnalysisContext, insufficientAnalysis, presetInstruction, systemPrompt } from "@/lib/facts";
import { fail, json, readJson } from "@/lib/http";
import type { AnalysisFinding, AnalysisResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const storeId = typeof record.storeId === "string" ? record.storeId : "";
    const sections = Array.isArray(record.sections) ? record.sections.filter((id): id is CategoryId => typeof id === "string" && isCategory(id)) : [];
    const preset = typeof record.preset === "string" && isPreset(record.preset) ? record.preset : null;
    const question = typeof record.question === "string" ? record.question.trim().slice(0, 2000) : "";
    const store = getStore(storeId);
    if (!store) return fail("Store not found.", 404);
    if (!sections.length) return fail("Select at least one section.");
    if (!preset && !question) return fail("Choose a preset or ask a question.");

    const context = buildAnalysisContext(store, sections);
    if (!context.hasNumbers) {
      return json({
        ...insufficientAnalysis(context.reportsUsed, context.calculated),
        storeName: store.name,
        storeCode: store.code,
        period: context.dashboard.rangeLabel,
      });
    }
    if (!process.env.OPENAI_API_KEY) {
      return fail(
        "Add OPENAI_API_KEY to .env.local and restart the server. The key is read only on the server and is never sent to the browser.",
        503,
        { calculated: context.calculated, reportsUsed: context.reportsUsed },
      );
    }

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const messages = [
      { role: "system" as const, content: systemPrompt() },
      {
        role: "user" as const,
        content: `${presetInstruction(preset, question, context.reportsUsed.map((section) => section.name))}\n\nCalculated data:\n${JSON.stringify(context.pack)}`,
      },
    ];
    let completion;
    try {
      completion = await client.chat.completions.create({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!/temperature/i.test(message)) throw error;
      completion = await client.chat.completions.create({
        model,
        response_format: { type: "json_object" },
        messages,
      });
    }

    const text = completion.choices[0]?.message?.content ?? "";
    const analysis = parseAnalysis(text);
    const result: AnalysisResult = {
      ...analysis,
      reportsUsed: context.reportsUsed,
      calculated: context.calculated,
      model,
      storeName: store.name,
      storeCode: store.code,
      period: context.dashboard.rangeLabel,
    };
    return json(result);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "The analysis could not be completed.";
    return fail(message.replace(/sk-[a-zA-Z0-9_-]+/g, "[key]"), 502);
  }
}

function parseAnalysis(text: string): Pick<AnalysisResult, "summary" | "actionSteps" | "findings" | "gaps"> {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as {
      summary?: unknown;
      actionSteps?: unknown;
      findings?: unknown;
      gaps?: unknown;
    };
    const findings = Array.isArray(parsed.findings)
      ? parsed.findings
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const row = item as Record<string, unknown>;
            const basis = row.basis === "interpretation" ? "interpretation" : "fact";
            return {
              title: clip(row.title, "Finding"),
              detail: clip(row.detail, ""),
              evidence: clip(row.evidence, ""),
              basis,
            } satisfies AnalysisFinding;
          })
          .filter((item): item is AnalysisFinding => Boolean(item && item.detail))
      : [];
    return {
      summary: clip(parsed.summary, "The model did not return a summary."),
      actionSteps: Array.isArray(parsed.actionSteps)
        ? parsed.actionSteps.map((step) => clip(step, "")).filter(Boolean).slice(0, 6)
        : [],
      findings,
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps.map((gap) => clip(gap, "")).filter(Boolean) : [],
    };
  } catch {
    return {
      summary: "The model response could not be read as structured analysis.",
      actionSteps: [],
      findings: text ? [{ title: "Unstructured response", detail: text.slice(0, 2000), evidence: "", basis: "interpretation" }] : [],
      gaps: ["Run the analysis again. If this continues, try a different model in OPENAI_MODEL."],
    };
  }
}

function clip(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
