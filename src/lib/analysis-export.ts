import type { AnalysisResult } from "./types";

export function analysisWriteUp(result: AnalysisResult) {
  const store =
    result.storeName && result.storeCode
      ? `${result.storeName} (Store ${result.storeCode})`
      : result.storeName || result.storeCode || "Store";
  const lines = [
    `Store Dashboard · AI Analysis`,
    store,
    result.period ? `Period: ${result.period}` : null,
    "",
    "Summary",
    result.summary || "No summary.",
  ];

  if (result.actionSteps?.length) {
    lines.push("", "Possible Action Steps");
    result.actionSteps.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
  }

  if (result.calculated.length) {
    lines.push("", "Calculated figures");
    for (const item of result.calculated) lines.push(`${item.label}: ${item.value}`);
  }

  if (result.findings.length) {
    lines.push("", "Findings");
    for (const finding of result.findings) {
      lines.push("", `${finding.title} (${finding.basis === "fact" ? "Fact" : "Possible explanation"})`);
      lines.push(finding.detail);
      if (finding.evidence) lines.push(`Evidence: ${finding.evidence}`);
    }
  }

  if (result.gaps.length) {
    lines.push("", "Data gaps");
    for (const gap of result.gaps) lines.push(`- ${gap}`);
  }

  if (result.reportsUsed.length) {
    lines.push("", `Sections included: ${result.reportsUsed.map((report) => report.name).join(", ")}`);
  }

  if (result.model) lines.push("", `Model: ${result.model}`);

  return lines.filter((line) => line != null).join("\n");
}

export function analysisFileStem(result: AnalysisResult) {
  const store = (result.storeName || result.storeCode || "store").replace(/[^\w\-]+/g, "-").toLowerCase();
  const day = new Date().toISOString().slice(0, 10);
  return `store-analysis-${store}-${day}`;
}
