import { useEffect, useState } from "react";

/**
 * Theo dõi matchMedia(min-width). Trả về false trước khi mount (SSR-safe).
 */
export function useMediaQueryMinWidth(minWidthPx: number): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia(`(min-width: ${minWidthPx}px)`);
    const update = () => setMatches(mq.matches);
    update();

    if (mq.addEventListener) {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, [minWidthPx]);

  return matches;
}

/** Breakpoint lg của Tailwind (1024px). */
export function useIsLgScreen(): boolean {
  return useMediaQueryMinWidth(1024);
}
