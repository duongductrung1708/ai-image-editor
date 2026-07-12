import { useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

export interface UseTableControlsResult<T> {
  sortKey: keyof T | string;
  sortDir: SortDir;
  toggleSort: (key: keyof T | string) => void;
  page: number;
  setPage: (n: number) => void;
  pageSize: number;
  setPageSize: (n: number) => void;
  paged: T[];
  sorted: T[];
  total: number;
  pageCount: number;
}

export function useTableControls<T extends Record<string, unknown>>(
  data: T[],
  initialSortKey: keyof T | string,
  initialDir: SortDir = "desc",
  initialPageSize = 25,
): UseTableControlsResult<T> {
  const [sortKey, setSortKey] = useState<keyof T | string>(initialSortKey);
  const [sortDir, setSortDir] = useState<SortDir>(initialDir);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const toggleSort = (key: keyof T | string) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  };

  const sorted = useMemo(() => {
    const arr = [...data];
    const k = sortKey as string;
    arr.sort((a, b) => {
      const av = (a as Record<string, unknown>)[k];
      const bv = (b as Record<string, unknown>)[k];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return av - bv;
      const as = String(av);
      const bs = String(bv);
      // ISO dates sort correctly as strings
      return as < bs ? -1 : as > bs ? 1 : 0;
    });
    if (sortDir === "desc") arr.reverse();
    return arr;
  }, [data, sortKey, sortDir]);

  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const paged = useMemo(
    () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sorted, safePage, pageSize],
  );

  return {
    sortKey,
    sortDir,
    toggleSort,
    page: safePage,
    setPage,
    pageSize,
    setPageSize,
    paged,
    sorted,
    total,
    pageCount,
  };
}
