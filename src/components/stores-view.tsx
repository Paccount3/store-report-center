"use client";

import { useState } from "react";
import type { Store } from "@/lib/types";
import { api } from "./api";
import { AddStoreForm } from "./overview";
import { useShell } from "./shell";

export function StoresView() {
  const { stores, refreshStores } = useShell();
  const [editing, setEditing] = useState<Store | null>(null);
  const [error, setError] = useState("");

  async function remove(store: Store) {
    if (!window.confirm(`Delete ${store.name} and its imported reports?`)) return;
    setError("");
    try {
      await api(`/api/stores/${store.id}`, { method: "DELETE" });
      await refreshStores();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the store.");
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-8">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue">Directory</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Stores</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Each store keeps its own reports and dashboard. The store code is used to pull the matching rows out of files that contain more than one store.
      </p>
      <div className="mt-6 overflow-hidden rounded-xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-ice text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Store</th>
              <th className="px-4 py-3 font-semibold">Code</th>
              <th className="px-4 py-3 font-semibold">Location</th>
              <th className="px-4 py-3 font-semibold">Sq ft</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {stores.map((store) => (
              <tr key={store.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-medium">{store.name}</td>
                <td className="px-4 py-3 tabular-nums">{store.code}</td>
                <td className="px-4 py-3 text-muted">{[store.city, store.region].filter(Boolean).join(", ") || "—"}</td>
                <td className="px-4 py-3 tabular-nums">{store.squareFeet ? store.squareFeet.toLocaleString() : "—"}</td>
                <td className="px-4 py-3 text-right">
                  <button type="button" className="mr-3 text-blue" onClick={() => setEditing(store)}>
                    Edit
                  </button>
                  <button type="button" className="text-bad" onClick={() => remove(store)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error ? <p className="mt-3 text-sm text-bad">{error}</p> : null}
      {editing ? (
        <EditStore
          store={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refreshStores();
          }}
        />
      ) : null}
      <div className="mt-8 rounded-xl border border-line bg-white p-5">
        <h2 className="text-lg font-semibold">Add a store</h2>
        <AddStoreForm onCreated={refreshStores} />
      </div>
    </div>
  );
}

function EditStore({ store, onClose, onSaved }: { store: Store; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({
    name: store.name,
    code: store.code,
    city: store.city,
    region: store.region,
    squareFeet: store.squareFeet ? String(store.squareFeet) : "",
  });
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api(`/api/stores/${store.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, squareFeet: form.squareFeet || null }),
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the store.");
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 rounded-xl border border-line bg-white p-5">
      <h2 className="text-lg font-semibold">Edit {store.name}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {(["name", "code", "city", "region", "squareFeet"] as const).map((field) => (
          <label key={field} className="text-sm">
            <span className="mb-1 block text-muted">{label(field)}</span>
            <input
              value={form[field]}
              onChange={(event) => setForm({ ...form, [field]: event.target.value })}
              className="w-full rounded-md border border-line px-3 py-2"
            />
          </label>
        ))}
      </div>
      {error ? <p className="mt-3 text-sm text-bad">{error}</p> : null}
      <div className="mt-4 flex gap-2">
        <button type="submit" className="rounded-md bg-blue px-4 py-2 text-sm font-semibold text-white">
          Save
        </button>
        <button type="button" onClick={onClose} className="rounded-md border border-line px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}

function label(field: string) {
  if (field === "squareFeet") return "Selling square feet";
  return field.charAt(0).toUpperCase() + field.slice(1);
}
