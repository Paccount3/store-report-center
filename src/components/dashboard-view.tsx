"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { categoryName } from "@/lib/catalog";
import { monthBounds } from "@/lib/dates";
import { formatCurrency, formatMetric, formatPercent, formatSignedPercent, formatWhen } from "@/lib/format";
import type { DashboardData, Kpi } from "@/lib/types";
import { api } from "./api";
import { DepartmentChart, EcommerceChart, HourChart, LaborChart, ProductionChart, RevenueChart } from "./charts";

export function DashboardView() {
  const params = useParams<{ storeId: string }>();
  const storeId = params.storeId;
  const [filter, setFilter] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem("gw-dashboard-sections");
      if (raw) setSections(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      setSections({});
    }
  }, []);

  function persist(next: Record<string, boolean>) {
    setSections(next);
    localStorage.setItem("gw-dashboard-sections", JSON.stringify(next));
  }

  function opened(id: string, fallback: boolean) {
    return id in sections ? sections[id] : fallback;
  }

  function toggle(id: string, fallback: boolean) {
    persist({ ...sections, [id]: !opened(id, fallback) });
  }

  function setAll(value: boolean) {
    persist(Object.fromEntries(SECTION_IDS.map((id) => [id, value])));
  }

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    const query = new URLSearchParams();
    if (filter.from) query.set("from", filter.from);
    if (filter.to) query.set("to", filter.to);
    api<DashboardData>(`/api/stores/${storeId}/dashboard?${query.toString()}`)
      .then((dashboard) => {
        if (!cancel) {
          setData(dashboard);
          setError("");
        }
      })
      .catch((err: unknown) => {
        if (!cancel) setError(err instanceof Error ? err.message : "Could not load the dashboard.");
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [storeId, filter.from, filter.to]);

  if (loading && !data) return <p className="p-8 text-muted">Loading performance…</p>;
  if (error && !data) return <p className="p-8 text-bad">{error}</p>;
  if (!data) return null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue">Store {data.store.code}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{data.store.name}</h1>
          <p className="mt-2 text-sm text-muted">
            {data.freshness.hasData
              ? `${data.rangeLabel} · Updated ${formatWhen(data.freshness.lastImportedAt)}`
              : "No reports have been imported for this store."}
            {data.comparisonNote ? <span className="mt-1 block">{data.comparisonNote}</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/stores/${storeId}/reports`} className="rounded-md bg-blue px-4 py-2 text-sm font-semibold text-white">
            Upload reports
          </Link>
          <Link href={`/stores/${storeId}/analyzer`} className="rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold">
            Analyze
          </Link>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <FilterChip active={!filter.from} onClick={() => setFilter({ from: "", to: "" })} label="All imported" />
        {yearsOf(data).map((year) => {
          const bounds = { from: `${year}-01-01`, to: `${year}-12-31` };
          const active = filter.from === bounds.from && filter.to === bounds.to;
          return <FilterChip key={year} active={active} label={`${year} year`} onClick={() => setFilter(bounds)} />;
        })}
        {data.months.map((month) => {
          const bounds = monthBounds(month.id);
          const active = filter.from === bounds.from && filter.to === bounds.to;
          return <FilterChip key={month.id} active={active} label={month.label} onClick={() => setFilter(bounds)} />;
        })}
        <button type="button" onClick={() => setAll(true)} className="rounded-full border border-line bg-white px-3 py-1 text-sm">
          Show all
        </button>
        <button type="button" onClick={() => setAll(false)} className="rounded-full border border-line bg-white px-3 py-1 text-sm">
          Hide all
        </button>
      </div>

      <Panel
        className="mt-6"
        title="Scorecard"
        kicker="Selected period"
        detail="Each figure is calculated from its own source."
        open={opened("scorecard", true)}
        onToggle={() => toggle("scorecard", true)}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.scorecard.map((item) => (
            <article key={item.id} className={`rounded-lg border border-line px-3 py-3 ${item.value == null ? "bg-ice" : "bg-white"}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{item.source}</p>
              <h3 className={`mt-1 font-semibold ${item.value == null ? "text-muted" : ""}`}>{item.label}</h3>
              <p className={`mt-2 text-2xl font-semibold tabular-nums ${item.value == null ? "text-muted" : ""}`}>
                {item.value == null ? "No data" : formatMetric(item.value, item.format)}
              </p>
              <p className="mt-1 text-xs text-muted">{item.detail}</p>
            </article>
          ))}
        </div>
      </Panel>

      <div className="mt-6 space-y-6">
        <SourceBlock
          id="celerant"
          storeId={storeId}
          coverage={coverageFor(data, "celerant")}
          open={opened("celerant", true)}
          onToggle={() => toggle("celerant", true)}
        >
          <KpiGrid kpis={kpisFor(data, CELERANT_KPIS)} />
          <AttentionList items={data.attention.filter((item) => /budget|last year|second half|revenue/i.test(item.title) && !/labor|ecommerce|round-up/i.test(item.title))} />
          <div className="mt-4 space-y-3">
            <Panel
              title="Revenue"
              detail={data.revenueGrain === "month" ? "Monthly totals" : "Daily totals"}
              nested
              open={opened("celerant-revenue", true)}
              onToggle={() => toggle("celerant-revenue", true)}
            >
              {data.revenueSeries.length ? <RevenueChart data={data.revenueSeries} /> : <Empty>No dated revenue rows in this period.</Empty>}
            </Panel>
            <Panel
              title="Departments"
              detail="Revenue by department — expand a row for the Description1 item breakdown"
              nested
              open={opened("celerant-departments", true)}
              onToggle={() => toggle("celerant-departments", true)}
            >
              {data.departments.length ? <DepartmentChart data={data.departments} /> : <Empty>No department column in this period.</Empty>}
            </Panel>
            <Panel
              title="Hour of day"
              detail="Revenue, units, and transactions by receipt hour"
              nested
              open={opened("celerant-hour", true)}
              onToggle={() => toggle("celerant-hour", true)}
            >
              {data.hours.length ? <HourChart data={data.hours} /> : <Empty>No hourly rows in this period.</Empty>}
            </Panel>
            <Panel
              title="By month"
              detail="Revenue per square foot uses that month only."
              nested
              open={opened("celerant-months", true)}
              onToggle={() => toggle("celerant-months", true)}
            >
              {data.monthsTable.some((month) => month.revenue != null) ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-wider text-muted">
                      <tr>
                        {["Month", "Revenue", "Rev / sq ft", "Units"].map((heading) => (
                          <th key={heading} className="py-2 pr-4 font-semibold">{heading}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.monthsTable.map((month) => (
                        <tr key={month.month} className="border-t border-line">
                          <td className="py-2 pr-4 font-medium">{month.label}</td>
                          <td className="py-2 pr-4 tabular-nums">{money(month.revenue)}</td>
                          <td className="py-2 pr-4 tabular-nums">{month.revenuePerSqFt == null ? "—" : formatCurrency(month.revenuePerSqFt, 2)}</td>
                          <td className="py-2 pr-4 tabular-nums">{month.units == null ? "—" : formatMetric(month.units, "number")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty>No monthly revenue in this period.</Empty>
              )}
            </Panel>
            <Panel
              title="Round-up"
              kicker="Celerant"
              detail="Employee round-up report. Kept separate from department sales."
              nested
              open={opened("celerant-roundup", true)}
              onToggle={() => toggle("celerant-roundup", true)}
            >
              <RoundupReport data={data} />
            </Panel>
          </div>
        </SourceBlock>

        <SourceBlock
          id="adp"
          storeId={storeId}
          coverage={coverageFor(data, "adp")}
          open={opened("adp", coverageFor(data, "adp").imported > 0)}
          onToggle={() => toggle("adp", coverageFor(data, "adp").imported > 0)}
        >
          <KpiGrid kpis={kpisFor(data, ADP_KPIS)} />
          <AttentionList items={data.attention.filter((item) => /labor/i.test(item.title))} />
          {data.labor.length ? (
            <div className="mt-4">
              <Panel
                title="Labor"
                detail="Payroll compared with store revenue"
                nested
                open={opened("adp-labor", true)}
                onToggle={() => toggle("adp-labor", true)}
              >
              <LaborChart data={data.labor} />
              {data.laborDepartments.length > 1 ? (
                <ul className="mt-3 grid gap-2 sm:grid-cols-3">
                  {data.laborDepartments.map((item) => (
                    <li key={item.name} className="rounded-md bg-ice px-3 py-2 text-sm">
                      <span className="font-medium">{item.name}</span>
                      <span className="mt-1 block tabular-nums text-muted">{formatCurrency(item.payroll)} · {formatMetric(item.hours, "number")} hrs</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              </Panel>
            </div>
          ) : null}
        </SourceBlock>

        <SourceBlock
          id="upright"
          storeId={storeId}
          coverage={coverageFor(data, "upright")}
          open={opened("upright", coverageFor(data, "upright").imported > 0)}
          onToggle={() => toggle("upright", coverageFor(data, "upright").imported > 0)}
        >
          <KpiGrid kpis={kpisFor(data, UPRIGHT_KPIS)} />
          <AttentionList items={data.attention.filter((item) => /ecommerce/i.test(item.title))} />
          {data.ecommerce.length ? (
            <div className="mt-4">
              <Panel
                title="Ecommerce"
                detail="Kept separate from store revenue"
                nested
                open={opened("upright-chart", true)}
                onToggle={() => toggle("upright-chart", true)}
              >
                <EcommerceChart data={data.ecommerce} />
              </Panel>
            </div>
          ) : null}
        </SourceBlock>

        <SourceBlock
          id="workplace"
          storeId={storeId}
          coverage={coverageFor(data, "workplace")}
          open={opened("workplace", coverageFor(data, "workplace").imported > 0)}
          onToggle={() => toggle("workplace", coverageFor(data, "workplace").imported > 0)}
        >
          {data.production.length ? (
            <Panel
              title="Production"
              detail="Racks and totes"
              nested
              open={opened("workplace-chart", true)}
              onToggle={() => toggle("workplace-chart", true)}
            >
              <ProductionChart data={data.production} />
            </Panel>
          ) : (
            <Empty>The workplace file did not include racks, totes, or production counts for this period.</Empty>
          )}
        </SourceBlock>

        <SourceBlock
          id="financial"
          storeId={storeId}
          coverage={coverageFor(data, "financial")}
          open={opened("financial", coverageFor(data, "financial").imported > 0)}
          onToggle={() => toggle("financial", coverageFor(data, "financial").imported > 0)}
        >
          <KpiGrid kpis={kpisFor(data, FINANCIAL_KPIS)} />
          <AttentionList items={data.attention.filter((item) => /net income/i.test(item.title))} />
          {data.financial.length ? (
            <div className="mt-4 overflow-x-auto">
              <SectionTitle title="P&L by month" detail="Financial file only. Not added on top of Celerant revenue." />
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-muted">
                  <tr>
                    {["Month", "Revenue", "Expenses", "Net"].map((heading) => (
                      <th key={heading} className="py-2 pr-4 font-semibold">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.financial.map((month) => (
                    <tr key={month.period} className="border-t border-line">
                      <td className="py-2 pr-4 font-medium">{month.period}</td>
                      <td className="py-2 pr-4 tabular-nums">{money(month.revenue)}</td>
                      <td className="py-2 pr-4 tabular-nums">{money(month.expense)}</td>
                      <td className="py-2 pr-4 tabular-nums">{money(month.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </SourceBlock>

        <SourceBlock
          id="other"
          storeId={storeId}
          coverage={coverageFor(data, "other")}
          open={opened("other", coverageFor(data, "other").imported > 0)}
          onToggle={() => toggle("other", coverageFor(data, "other").imported > 0)}
        >
          {data.otherMetrics.length ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {data.otherMetrics.map((item) => (
                <div key={item.metric} className="rounded-md bg-ice px-3 py-2">
                  <p className="text-xs uppercase tracking-wider text-muted">{item.label}</p>
                  <p className="text-lg font-semibold tabular-nums">{formatMetric(item.value, /score|percent|rate/.test(item.metric) ? "score" : "number")}</p>
                </div>
              ))}
            </div>
          ) : (
            <Empty>The manual file did not include numeric metrics for this period.</Empty>
          )}
        </SourceBlock>
      </div>

      {data.notices.length ? (
        <ul className="mt-4 space-y-2 text-sm text-muted">
          {data.notices.map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const SECTION_IDS = [
  "scorecard",
  "celerant",
  "celerant-revenue",
  "celerant-departments",
  "celerant-hour",
  "celerant-months",
  "celerant-roundup",
  "adp",
  "adp-labor",
  "upright",
  "upright-chart",
  "workplace",
  "workplace-chart",
  "financial",
  "other",
];

const CELERANT_KPIS = ["revenue", "sqft", "asp", "to-budget", "to-ly", "budget", "last-year", "transactions", "rpt", "donors", "rpd", "units"];
const ROUNDUP_KPIS = ["roundup", "roundup-pct", "roundup-count"];
const ADP_KPIS = ["payroll", "labor", "overtime"];
const UPRIGHT_KPIS = ["ecommerce"];
const FINANCIAL_KPIS = ["expense", "net"];

function coverageFor(data: DashboardData, category: DashboardData["coverage"][number]["category"]) {
  return data.coverage.find((item) => item.category === category)!;
}

function kpisFor(data: DashboardData, ids: string[]) {
  return ids.flatMap((id) => {
    const kpi = data.kpis.find((item) => item.id === id && item.value != null);
    return kpi ? [kpi] : [];
  });
}

function hasLastYearRoundup(data: DashboardData) {
  return data.monthsTable.some((month) => month.roundupLastYear != null || month.roundupPercentLastYear != null);
}

function yearsOf(data: DashboardData) {
  return [...new Set(data.months.map((month) => month.id.slice(0, 4)))].sort();
}

function SourceBlock({
  id,
  storeId,
  coverage,
  open,
  onToggle,
  children,
}: {
  id: string;
  storeId: string;
  coverage: DashboardData["coverage"][number];
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const ready = coverage.imported > 0;
  return (
    <Panel
      title={categoryName(coverage.category)}
      kicker="Report source"
      detail={ready ? `${coverage.imported} file${coverage.imported === 1 ? "" : "s"} · Updated ${formatWhen(coverage.lastImportedAt)}` : "No data"}
      muted={!ready}
      open={open}
      onToggle={onToggle}
      controls={id}
    >
      {ready ? (
        children
      ) : (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-muted">No data to show</p>
          <Link href={`/stores/${storeId}/reports?source=${coverage.category}`} className="mt-2 inline-block text-sm text-muted underline decoration-line underline-offset-2">
            Upload {categoryName(coverage.category)}
          </Link>
        </div>
      )}
    </Panel>
  );
}

function Panel({
  title,
  kicker,
  detail,
  open,
  onToggle,
  muted = false,
  nested = false,
  controls,
  className = "",
  children,
}: {
  title: string;
  kicker?: string;
  detail?: string;
  open: boolean;
  onToggle: () => void;
  muted?: boolean;
  nested?: boolean;
  controls?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`overflow-hidden rounded-xl border border-line ${nested || muted ? "bg-ice" : "bg-white"} ${className}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={controls}
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left md:px-5"
      >
        <span>
          {kicker ? <span className={`block text-[11px] font-semibold uppercase tracking-[0.14em] ${muted ? "text-muted" : "text-blue"}`}>{kicker}</span> : null}
          <span className={`block font-semibold ${nested ? "text-lg" : "text-xl"} ${muted ? "text-muted" : "text-ink"}`}>{title}</span>
          {detail ? <span className="mt-0.5 block text-sm text-muted">{detail}</span> : null}
        </span>
        <span className="shrink-0 text-sm font-semibold text-blue">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? <div id={controls} className={`border-t border-line px-4 py-4 md:px-5 ${nested ? "bg-white" : ""}`}>{children}</div> : null}
    </section>
  );
}

function RoundupReport({ data }: { data: DashboardData }) {
  const kpis = kpisFor(data, ROUNDUP_KPIS);
  const months = data.monthsTable.filter((month) => month.roundup != null || month.roundupLastYear != null);
  return (
    <div className="space-y-4">
      {kpis.length ? <KpiGrid kpis={kpis} /> : <Empty>No round-up rows in this period.</Empty>}
      {data.employees.length ? (
        <div className="overflow-x-auto">
          <SectionTitle title="By employee" detail="Names stay as labels. Amounts and counts are added for the selected period." />
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted">
              <tr>
                {["Employee", "Receipts", "Round-up donations", "Round-up amount", ...(data.employees.some((employee) => employee.roundupLastYear != null) ? ["Last year $"] : [])].map((heading) => (
                  <th key={heading} className="py-2 pr-4 font-semibold">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.employees.map((employee) => (
                <tr key={employee.name} className="border-t border-line">
                  <td className="py-2 pr-4 font-medium">{employee.name}</td>
                  <td className="py-2 pr-4 tabular-nums">{formatMetric(employee.receipts, "number")}</td>
                  <td className="py-2 pr-4 tabular-nums">{formatMetric(employee.roundupCount, "number")}</td>
                  <td className="py-2 pr-4 tabular-nums">{formatCurrency(employee.roundup)}</td>
                  {data.employees.some((item) => item.roundupLastYear != null) ? (
                    <td className="py-2 pr-4 tabular-nums">{employee.roundupLastYear == null ? "—" : formatCurrency(employee.roundupLastYear)}</td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {months.length ? (
        <div className="overflow-x-auto">
          <SectionTitle title="By month" detail="Compared with the same month last year when that file is imported." />
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted">
              <tr>
                {["Month", "Round-up $", ...(hasLastYearRoundup(data) ? ["Last year $"] : []), "Round-up %", ...(hasLastYearRoundup(data) ? ["Last year %"] : [])].map((heading) => (
                  <th key={heading} className="py-2 pr-4 font-semibold">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map((month) => (
                <tr key={month.month} className="border-t border-line">
                  <td className="py-2 pr-4 font-medium">{month.label}</td>
                  <td className="py-2 pr-4 tabular-nums">{money(month.roundup)}</td>
                  {hasLastYearRoundup(data) ? <td className="py-2 pr-4 tabular-nums">{money(month.roundupLastYear)}</td> : null}
                  <td className="py-2 pr-4 tabular-nums">{month.roundupPercent == null ? "—" : formatPercent(month.roundupPercent)}</td>
                  {hasLastYearRoundup(data) ? (
                    <td className="py-2 pr-4 tabular-nums">{month.roundupPercentLastYear == null ? "—" : formatPercent(month.roundupPercentLastYear)}</td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function KpiGrid({ kpis }: { kpis: Kpi[] }) {
  if (!kpis.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi) => (
        <KpiCard key={kpi.id} kpi={kpi} />
      ))}
    </div>
  );
}

function AttentionList({ items }: { items: DashboardData["attention"] }) {
  if (!items.length) return null;
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      {items.map((item) => (
        <article key={item.title} className="rounded-lg border border-line bg-ice px-4 py-3">
          <p className={`text-xs font-semibold uppercase tracking-wider ${item.tone === "warn" ? "text-bad" : item.tone === "good" ? "text-good" : "text-blue"}`}>
            {item.tone === "warn" ? "Needs a look" : item.tone === "good" ? "Positive" : "Note"}
          </p>
          <h3 className="mt-1 font-semibold">{item.title}</h3>
          <p className="mt-1 text-sm text-muted">{item.detail}</p>
        </article>
      ))}
    </div>
  );
}

function KpiCard({ kpi }: { kpi: Kpi }) {
  const digits = kpi.id === "asp" || kpi.id === "sqft" ? 2 : 0;
  const text = kpi.value == null ? "—" : kpi.format === "currency" ? formatCurrency(kpi.value, digits) : formatMetric(kpi.value, kpi.format);
  const up = (kpi.delta?.pct ?? 0) >= 0;
  const favorable = kpi.delta ? (kpi.delta.sentiment === "up-good" ? up : !up) : true;
  const variance = kpi.id === "budget" || kpi.id === "last-year";
  const netTone = kpi.id === "net" && kpi.value != null ? (kpi.value < 0 ? "text-bad" : "text-good") : "";
  return (
    <article className="rounded-xl border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">{kpi.label}</p>
      </div>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${variance ? (favorable ? "text-good" : "text-bad") : netTone}`}>{text}</p>
      {kpi.delta?.pct != null ? (
        <p className={`text-sm font-medium ${favorable ? "text-good" : "text-bad"}`}>
          {formatSignedPercent(kpi.delta.pct)} {kpi.delta.label}
        </p>
      ) : null}
      {kpi.detail ? <p className="mt-1 text-sm text-muted">{kpi.detail}</p> : null}
      {kpi.caution ? <p className="mt-2 text-xs text-warn">{kpi.caution}</p> : null}
    </article>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-full px-3 py-1 text-sm ${active ? "bg-navy text-white" : "border border-line bg-white"}`}>
      {label}
    </button>
  );
}

function SectionTitle({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted">{detail}</p>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-sm text-muted">{children}</p>;
}

function money(value: number | null) {
  return value == null ? "—" : formatCurrency(value);
}
