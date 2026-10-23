"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { jsPDF } from "jspdf";
import { CATEGORIES, PRESETS, type CategoryId, type PresetId } from "@/lib/catalog";
import { analysisFileStem, analysisWriteUp } from "@/lib/analysis-export";
import type { AnalysisResult } from "@/lib/types";
import { api } from "./api";

const ALL_SECTIONS = CATEGORIES.map((category) => category.id);

export function AnalyzerView() {
  const params = useParams<{ storeId: string }>();
  const [selected, setSelected] = useState<CategoryId[]>(ALL_SECTIONS);
  const [preset, setPreset] = useState<PresetId | "">("summarize");
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  function toggle(id: CategoryId) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function run() {
    setBusy(true);
    setError("");
    setResult(null);
    setCopyState("idle");
    try {
      const analysis = await api<AnalysisResult>("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: params.storeId,
          sections: selected,
          preset: preset || undefined,
          question,
        }),
      });
      setResult(analysis);
    } catch (err) {
      const extra = err as Error & { body?: { calculated?: AnalysisResult["calculated"]; reportsUsed?: AnalysisResult["reportsUsed"] } };
      setError(err instanceof Error ? err.message : "Analysis failed.");
      if (extra.body?.calculated) {
        setResult({
          summary: "",
          actionSteps: [],
          findings: [],
          gaps: [],
          calculated: extra.body.calculated,
          reportsUsed: extra.body.reportsUsed ?? [],
          model: null,
        });
      }
    } finally {
      setBusy(false);
    }
  }

  async function copyWriteUp() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(analysisWriteUp(result));
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("failed");
    }
  }

  function downloadPdf() {
    if (!result) return;
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const margin = 48;
    const width = doc.internal.pageSize.getWidth() - margin * 2;
    let y = margin;
    const text = analysisWriteUp(result);
    const lines = doc.splitTextToSize(text, width) as string[];
    const lineHeight = 14;
    for (const line of lines) {
      if (y > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin;
      }
      doc.setFont("helvetica", line && !line.startsWith(" ") && /^(Summary|Possible Action Steps|Calculated figures|Findings|Data gaps|Store Dashboard)/.test(line) ? "bold" : "normal");
      doc.setFontSize(/^(Summary|Possible Action Steps|Calculated figures|Findings|Data gaps)$/.test(line) ? 12 : 10);
      doc.text(line || " ", margin, y);
      y += lineHeight;
    }
    doc.save(`${analysisFileStem(result)}.pdf`);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue">AI Report Analyzer</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Ask about this store</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Totals, variances, and trends are calculated in the application. The model writes the narrative from those figures and the sections you select. This report uses a lot of data and may take a bit longer to generate. The API key stays on the server.
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-[320px_1fr]">
        <section className="rounded-xl border border-line bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Sections</h2>
            <button type="button" className="text-sm text-blue" onClick={() => setSelected(selected.length === ALL_SECTIONS.length ? [] : [...ALL_SECTIONS])}>
              {selected.length === ALL_SECTIONS.length ? "Clear" : "Select all"}
            </button>
          </div>
          <p className="mt-2 text-sm text-muted">The analysis includes only the sections you mark.</p>
          <ul className="mt-3 space-y-3">
            {CATEGORIES.map((category) => (
              <li key={category.id}>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={selected.includes(category.id)} onChange={() => toggle(category.id)} />
                  <span>
                    {category.name}
                    <span className="block text-xs text-muted">{category.blurb}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-4">
          <div className="rounded-xl border border-line bg-white p-4">
            <h2 className="font-semibold">Preset</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {PRESETS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPreset(preset === item.id ? "" : item.id)}
                  className={`rounded-full px-3 py-1 text-sm ${preset === item.id ? "bg-navy text-white" : "border border-line"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <label className="mt-4 block text-sm font-medium" htmlFor="question">
              Custom question
            </label>
            <textarea
              id="question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={4}
              placeholder="Which departments have declined, and is labor moving with revenue?"
              className="mt-1 w-full rounded-md border border-line px-3 py-2"
            />
            <button
              type="button"
              onClick={run}
              disabled={busy || selected.length === 0}
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? <span className="analyzer-spinner" aria-hidden /> : null}
              {busy ? "Analyzing…" : "Run analysis"}
            </button>
          </div>

          {busy ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-line bg-white px-6 py-16" role="status" aria-live="polite">
              <span className="analyzer-spinner analyzer-spinner-lg" aria-hidden />
              <p className="text-sm font-medium text-ink">Running analysis…</p>
              <p className="text-sm text-muted">Calculating figures and writing the store narrative.</p>
            </div>
          ) : null}

          {error && !busy ? <p className="rounded-md border border-bad/20 bg-white px-4 py-3 text-sm text-bad">{error}</p> : null}

          {result && !busy ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={copyWriteUp} className="rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold">
                  {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy write-up"}
                </button>
                <button type="button" onClick={downloadPdf} className="rounded-md bg-blue px-4 py-2 text-sm font-semibold text-white">
                  Download PDF
                </button>
              </div>

              {result.summary ? (
                <section className="rounded-xl border border-line bg-white p-5">
                  <h2 className="text-lg font-semibold">Summary</h2>
                  <p className="mt-2 leading-6">{result.summary}</p>
                  {result.model ? <p className="mt-3 text-xs text-muted">Model {result.model}. Narrative only; figures below were calculated here.</p> : null}
                </section>
              ) : null}

              {result.actionSteps?.length ? (
                <section className="rounded-xl border border-line bg-white p-5">
                  <h2 className="text-lg font-semibold">Possible Action Steps</h2>
                  <p className="mt-1 text-sm text-muted">
                    For store managers and floor staff. These are potential operational next steps, not confirmed causes or orders.
                  </p>
                  <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6">
                    {result.actionSteps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </section>
              ) : null}

              {result.calculated.length ? (
                <section className="rounded-xl border border-line bg-white p-5">
                  <h2 className="font-semibold">Calculated from the selected sections</h2>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {result.calculated.map((item) => (
                      <div key={item.label} className="rounded-md bg-ice px-3 py-2">
                        <p className="text-xs uppercase tracking-wider text-muted">{item.label}</p>
                        <p className="font-semibold tabular-nums">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
              {result.findings.length ? (
                <section className="space-y-3">
                  {result.findings.map((finding) => (
                    <article key={`${finding.title}-${finding.detail}`} className="rounded-xl border border-line bg-white p-4">
                      <p className={`text-xs font-semibold uppercase tracking-wider ${finding.basis === "fact" ? "text-blue" : "text-warn"}`}>
                        {finding.basis === "fact" ? "Fact" : "Possible explanation"}
                      </p>
                      <h3 className="mt-1 font-semibold">{finding.title}</h3>
                      <p className="mt-1 text-sm leading-6">{finding.detail}</p>
                      {finding.evidence ? <p className="mt-2 text-sm text-muted">{finding.evidence}</p> : null}
                    </article>
                  ))}
                </section>
              ) : null}
              {result.gaps.length ? (
                <section className="rounded-xl border border-line bg-white p-4">
                  <h2 className="font-semibold">Data gaps</h2>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
                    {result.gaps.map((gap) => (
                      <li key={gap}>{gap}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {result.reportsUsed.length ? (
                <p className="text-sm text-muted">
                  Sections included: {result.reportsUsed.map((report) => report.name).join(", ")}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
