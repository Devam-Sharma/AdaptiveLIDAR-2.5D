export default function MetricCard({ label, value, tone = "cyan", subtext }) {
  const toneClass = {
    cyan: "text-cyan-200",
    green: "text-emerald-200",
    amber: "text-amber-200",
    red: "text-red-200",
    slate: "text-slate-100",
  }[tone];

  return (
    <div className="rounded-md border border-line bg-slate-950/60 p-3">
      <p className="metric-label">{label}</p>
      <strong className={`mt-1 block text-2xl font-black ${toneClass}`}>{value}</strong>
      {subtext && <span className="mt-1 block text-xs text-slate-500">{subtext}</span>}
    </div>
  );
}
