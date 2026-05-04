export default function Panel({ title, index, children }) {
  return (
    <div
      className="h-full rounded-xl overflow-hidden border border-white/[0.07]"
      style={{ background: "#111113" }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07]"
        style={{ background: "#18181C" }}
      >
        <span className="font-mono text-[11px] text-[#7A7870] tracking-[0.1em] uppercase">
          {title}
        </span>
        {index && (
          <span className="font-mono text-[10px] text-[#D4AF37] opacity-60">
            {index}
          </span>
        )}
      </div>

      <div className="p-4">
        {children}
      </div>
    </div>
  );
}