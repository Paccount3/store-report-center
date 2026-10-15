import type { Store } from "./types";

/** URL segment for a store, e.g. "Waterbury" → "waterbury". */
export function storeSlug(store: Pick<Store, "name"> | string) {
  const name = typeof store === "string" ? store : store.name;
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "store";
}

export function storePath(store: Pick<Store, "name">, suffix = "") {
  const base = `/stores/${storeSlug(store)}`;
  return suffix ? `${base}${suffix.startsWith("/") ? suffix : `/${suffix}`}` : base;
}

export function matchesStoreRef(store: Store, ref: string) {
  return store.id === ref || storeSlug(store) === ref.toLowerCase();
}
