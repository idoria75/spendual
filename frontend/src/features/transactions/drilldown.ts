import type { Scope } from "@spendual/shared";

/** URL contract between Início (links) and Lançamentos (filters). Values come from the user's URL. */
const LIST = /^(\d+|none)(,(\d+|none))*$/;
const MAX_LIST = 50;
const NONE = "none";

export interface Drilldown {
  scope: "all" | Scope;
  status: "all" | "confirmed" | "voided";
  categoryId: string;
  /** Comma list for the `categories` query, or null. */
  categories: string | null;
}

/** Link from a spending row of Início: household, confirmed, those categories (null = none). */
export function spendingLink(categoryIds: (number | null)[]): string {
  const list = categoryIds.map((id) => (id === null ? NONE : String(id))).join(",");
  return `/lancamentos?categorias=${list}&escopo=household&status=confirmed`;
}

export function readDrilldown(params: URLSearchParams): Drilldown {
  const scope = params.get("escopo");
  const status = params.get("status");
  const list = params.get("categorias");
  const one = params.get("categoria");
  return {
    scope: scope === "household" || scope === "personal" ? scope : "all",
    status: status === "confirmed" || status === "voided" ? status : "all",
    categoryId: one !== null && /^\d+$/.test(one) ? one : "",
    categories:
      list !== null && LIST.test(list) && list.split(",").length <= MAX_LIST ? list : null,
  };
}

/** Ids of a `categories` list; null stands for "no category". */
export function categoryIdsOf(list: string): (number | null)[] {
  return list.split(",").map((p) => (p === NONE ? null : Number(p)));
}
