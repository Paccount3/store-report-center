"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { categoryName } from "@/lib/catalog";
import { formatCurrency, formatWhen } from "@/lib/format";
import type { OverviewCard } from "@/lib/types";
import { api } from "./api";
import { useShell } from "./shell";

export function Overview() {
  const { refreshStores } = useShell();
  const [cards, setCards] = useState<OverviewCard[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await api<{ stores: OverviewCard[] }>("/api/overview");
      setCards(data.stores);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load stores.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue">Retail operations</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Store Dashboard</h1>
          <p className="mt-2 max-w-2xl text-muted">
            {cards.length} store{cards.length === 1 ? "" : "s"} configured. Choose a store to review performance, upload reports, or ask the analyzer a question.
          </p>
        </div>
        <Link href="/stores" className="rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold">
          Manage stores
        </Link>
      </div>
      {error ? <p className="mt-4 rounded-md border border-bad/30 bg-white px-4 py-3 text-sm text-bad">{error}</p> : null}
      {loading ? <p className="mt-8 text-muted">Loading stores…</p> : null}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {cards.map((card) => (
          <Link key={card.store.id} href={`/stores/${card.store.id}`} className="rounded-xl border border-line bg-white p-5 shadow-sm transition hover:border-blue">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Store {card.store.code}</p>
              <h2 className="text-xl font-semibold">{card.store.name}</h2>
              <p className="text-sm text-muted">{[card.store.city, card.store.region].filter(Boolean).join(" · ") || "Location not set"}</p>
              {card.coverage.some((item) => item.category === "adp" && !item.ready) ? (
                <p className="mt-2 text-sm text-muted">ADP · no data to show</p>
              ) : null}
            </div>
            <div className="mt-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted">Revenue</p>
                <p className="text-2xl font-semibold tabular-nums">{card.revenue == null ? "—" : formatCurrency(card.revenue)}</p>
                <p className="text-sm text-muted">{card.hasData ? card.rangeLabel : "No reports imported"}</p>
              </div>
              <Spark values={card.spark} />
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {card.coverage.map((item) => (
                <span key={item.category} className={`rounded-full px-2 py-0.5 text-xs ${item.ready ? "bg-sky text-blue" : "bg-ice text-muted"}`}>
                  {categoryName(item.category).replace(" Reporting", "")}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">Updated {formatWhen(card.lastImportedAt)}</p>
          </Link>
        ))}
      </div>
      {!loading && cards.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-white p-8">
          <h2 className="text-lg font-semibold">Add the first store</h2>
          <p className="mt-1 text-sm text-muted">Stores are saved in the application database and can be added or renamed at any time.</p>
          <AddStoreForm
            onCreated={async () => {
              await refreshStores();
              await load();
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

export function AddStoreForm({ onCreated }: { onCreated: () => Promise<void> | void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code, city }),
      });
      setName("");
      setCode("");
      setCity("");
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the store.");
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-4">
      <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Store name" className="rounded-md border border-line px-3 py-2" />
      <input required value={code} onChange={(event) => setCode(event.target.value)} placeholder="Store code" className="rounded-md border border-line px-3 py-2" />
      <input value={city} onChange={(event) => setCity(event.target.value)} placeholder="City" className="rounded-md border border-line px-3 py-2" />
      <button className="rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white" type="submit">
        Add store
      </button>
      {error ? <p className="text-sm text-bad sm:col-span-4">{error}</p> : null}
    </form>
  );
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="h-9 w-28" />;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const width = 112;
  const height = 36;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = max === min ? height / 2 : height - ((value - min) / (max - min)) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-9 w-28" aria-hidden>
      <polyline fill="none" stroke="#0c5eae" strokeWidth="2" points={points} />
    </svg>
  );
}
