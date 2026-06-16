import { motion } from "framer-motion";

const WIDTHS = ["66%", "100%", "92%", "84%", "75%", "100%", "88%", "70%"];

/** Skeleton có gradient shimmer chạy ngang + stagger fade-in (framer-motion). */
const ShimmerLines = ({ rows = WIDTHS }: { rows?: string[] }) => (
  <div className="h-full w-full space-y-3 p-4">
    {rows.map((w, i) => (
      <motion.div
        key={i}
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: i * 0.06, duration: 0.35, ease: "easeOut" }}
        className="relative h-4 overflow-hidden rounded-md bg-muted"
        style={{ width: w }}
      >
        <div className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 animate-ocr-shimmer bg-gradient-to-r from-transparent via-white/55 to-transparent dark:via-white/15" />
      </motion.div>
    ))}
  </div>
);

export default ShimmerLines;
