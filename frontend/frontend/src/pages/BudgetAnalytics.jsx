import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Box, Crosshair, Database, Layers3 } from "lucide-react";
import { buildBudgetHistory } from "../utils/utilityCalculation.js";

const COLORS = ["#22d3ee", "#a78bfa", "#22c55e", "#f59e0b", "#ec4899", "#94a3b8"];
const DONUT_COLORS = ["#22d3ee", "#22c55e", "#94a3b8"];
const DEFAULT_LEVELS = [0.5, 0.2, 0.05];

const cm = (metres) => `${Math.round(metres * 100)} cm`;

function memorySaved(metrics, levels) {
  const [coarse, medium, fine] = levels;
  const fineCells = metrics.fine_cells ?? 0;
  const mediumCells = metrics.medium_cells ?? 0;
  const coarseCells = metrics.coarse_cells ?? 0;
  const actual = fineCells + mediumCells + coarseCells;
  if (!actual) return null;
  const uniform =
    fineCells +
    mediumCells * Math.pow(medium / fine, 2) +
    coarseCells * Math.pow(coarse / fine, 2);
  if (uniform <= actual) return null;
  return Math.round((1 - actual / uniform) * 100);
}

function StatCard({ icon: Icon, label, value, sub, tone = "cyan" }) {
  const tones = {
    cyan: "text-cyanSignal bg-cyanSignal/10 border-cyanSignal/25",
    green: "text-emerald-400 bg-emerald-400/10 border-emerald-400/25",
    amber: "text-amber-400 bg-amber-400/10 border-amber-400/25",
    violet: "text-violet-400 bg-violet-400/10 border-violet-400/25",
  };
  const subtones = { cyan: "text-cyanSignal", green: "text-emerald-400", amber: "text-amber-400", violet: "text-violet-400" };
  return (
    <div className="panel flex items-center gap-4">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${tones[tone]}`}>
        <Icon size={22} />
      </div>
      <div className="min-w-0">
        <div className="metric-label">{label}</div>
        <div className="mt-1 text-2xl font-black leading-none text-white">{value}</div>
        {sub && <div className={`mt-1 text-[11px] font-semibold ${subtones[tone]}`}>{sub}</div>}
      </div>
    </div>
  );
}

export default function BudgetAnalytics({
  controls,
  isLive,
  liveHistory,
  liveMetrics,
  regions,
  resolutionLevels,
  thresholds,
  time,
}) {
  const levels = resolutionLevels?.length === 3 ? resolutionLevels : DEFAULT_LEVELS;
  const [coarseM, mediumM, fineM] = levels;
  const useLiveHistory = Boolean(liveHistory?.length);

  const simulatedHistory = useMemo(
    () => (useLiveHistory ? [] : buildBudgetHistory(time, { predictionEnabled: controls.showPrediction })),
    [useLiveHistory, time, controls.showPrediction],
  );

  const utilityData = useMemo(
    () => regions.map((region) => ({ name: region.name, utility: Number(region.utility.toFixed(2)) })),
    [regions],
  );
  const cellData = useMemo(
    () => regions.map((region) => ({ name: region.name, cells: region.cellsAllocated })),
    [regions],
  );

  const resolutionData = useMemo(() => {
    if (isLive && liveMetrics) {
      return [
        { name: `Fine ${cm(fineM)}`, value: liveMetrics.fine_cells ?? 0 },
        { name: `Medium ${cm(mediumM)}`, value: liveMetrics.medium_cells ?? 0 },
        { name: `Coarse ${cm(coarseM)}`, value: liveMetrics.coarse_cells ?? 0 },
      ];
    }
    return [
      { name: `Fine ${cm(fineM)}`, value: regions.filter((r) => r.decision === "REFINE").reduce((s, r) => s + r.cellsAllocated, 0) },
      { name: `Medium ${cm(mediumM)}`, value: regions.filter((r) => r.decision === "MAINTAIN").reduce((s, r) => s + r.cellsAllocated, 0) },
      { name: `Coarse ${cm(coarseM)}`, value: regions.filter((r) => r.decision === "COARSEN").reduce((s, r) => s + r.cellsAllocated, 0) },
    ];
  }, [isLive, liveMetrics, regions, coarseM, mediumM, fineM]);

  const savedPercent = isLive && liveMetrics ? memorySaved(liveMetrics, levels) : null;
  const refineThreshold = thresholds?.refine ?? 1.8;

  const totalBudget = useMemo(() => regions.reduce((s, r) => s + r.cellsAllocated, 0) || 24000, [regions]);
  const refinedCount = regions.filter((r) => r.decision === "REFINE").length;
  const coarsenedCount = regions.filter((r) => r.decision === "COARSEN").length;
  const donutTotal = resolutionData.reduce((s, d) => s + d.value, 0) || 1;

  return (
    <section className="space-y-4">
      {/* Header stat row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Box}
          tone="cyan"
          label="Total Computation Budget"
          value={totalBudget.toLocaleString()}
          sub="cells allocated this frame"
        />
        <StatCard
          icon={Database}
          tone="green"
          label="Estimated Memory Saved"
          value={savedPercent === null ? "38%" : `${savedPercent}%`}
          sub="vs uniform finest grid"
        />
        <StatCard
          icon={Crosshair}
          tone="cyan"
          label="Refined Regions"
          value={refinedCount}
          sub="in current frame"
        />
        <StatCard
          icon={Layers3}
          tone="amber"
          label="Coarsened Regions"
          value={coarsenedCount}
          sub="in current frame"
        />
      </div>

      {/* Charts row */}
      <div className="grid gap-4 xl:grid-cols-4">
        <div className="panel xl:col-span-2">
          <div className="flex items-center justify-between">
            <div className="section-title mb-0">
              {useLiveHistory ? "Live Cell Count Per Resolution Level" : "Computational Budget Allocation Over Time"}
            </div>
            <span className="rounded-md border border-line bg-black/30 px-2.5 py-1 text-[11px] font-semibold text-slate-400">
              Last 15s
            </span>
          </div>
          <p className="mb-2 mt-2 text-xs text-slate-500">
            {useLiveHistory
              ? "Real backend metrics, one point per processed frame. Fine cells rising while coarse cells fall is the foveation actually happening."
              : "Simulated allocation across the six demo regions."}
          </p>
          <div className="h-[300px]">
            <ResponsiveContainer height="100%" width="100%">
              {useLiveHistory ? (
                <AreaChart data={liveHistory}>
                  <CartesianGrid stroke="rgba(148,163,184,0.12)" />
                  <XAxis dataKey="label" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip
                    contentStyle={{ background: "#0f172a", border: "1px solid rgba(148,163,184,0.25)", color: "#e5eef7" }}
                    labelFormatter={(label) => `Frame ${label}`}
                  />
                  <Area dataKey="Coarse" fill="#94a3b8" fillOpacity={0.16} stackId="1" stroke="#94a3b8" />
                  <Area dataKey="Medium" fill="#22c55e" fillOpacity={0.2} stackId="1" stroke="#22c55e" />
                  <Area dataKey="Fine" fill="#22d3ee" fillOpacity={0.28} stackId="1" stroke="#22d3ee" />
                </AreaChart>
              ) : (
                <AreaChart data={simulatedHistory}>
                  <CartesianGrid stroke="rgba(148,163,184,0.12)" />
                  <XAxis dataKey="label" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid rgba(148,163,184,0.25)", color: "#e5eef7" }} />
                  <Area dataKey="Pedestrian" fill="#22d3ee" fillOpacity={0.25} stroke="#22d3ee" />
                  <Area dataKey="Vehicle" fill="#22c55e" fillOpacity={0.2} stroke="#22c55e" />
                  <Area dataKey="Terrain" fill="#f59e0b" fillOpacity={0.18} stroke="#f59e0b" />
                  <Area dataKey="RoadEdge" fill="#94a3b8" fillOpacity={0.16} stroke="#94a3b8" />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
          {isLive && !useLiveHistory && (
            <p className="text-xs text-amber-300">Collecting live frames — the timeline fills as frames are processed.</p>
          )}
        </div>

        <div className="panel">
          <div className="section-title">Utility Score Per Region</div>
          <div className="h-[300px]">
            <ResponsiveContainer height="100%" width="100%">
              <BarChart data={utilityData} layout="vertical" margin={{ right: 28 }}>
                <XAxis hide type="number" />
                <YAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 11 }} type="category" width={92} />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid rgba(148,163,184,0.25)" }} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
                <Bar dataKey="utility" radius={[0, 4, 4, 0]}>
                  {utilityData.map((entry, index) => (
                    <Cell fill={COLORS[index % COLORS.length]} key={entry.name} />
                  ))}
                  <LabelList dataKey="utility" position="right" fill="#e2e8f0" fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <div className="section-title">{isLive ? "Budget Share Per Region" : "Cells Allocated Per Region"}</div>
          <div className="h-[300px]">
            <ResponsiveContainer height="100%" width="100%">
              <BarChart data={cellData} layout="vertical" margin={{ right: 36 }}>
                <XAxis hide type="number" />
                <YAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 11 }} type="category" width={92} />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid rgba(148,163,184,0.25)" }} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
                <Bar dataKey="cells" radius={[0, 4, 4, 0]}>
                  {cellData.map((entry, index) => (
                    <Cell fill={COLORS[index % COLORS.length]} key={entry.name} />
                  ))}
                  <LabelList dataKey="cells" position="right" fill="#e2e8f0" fontSize={11} formatter={(v) => v.toLocaleString()} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid gap-4 xl:grid-cols-4">
        <div className="panel xl:col-span-2">
          <div className="section-title">Resolution Distribution</div>
          <p className="mb-1 text-xs text-slate-500">
            {isLive ? "Every active cell in the map, counted by the backend." : "The six demo regions, bucketed by pending decision."}
          </p>
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <div className="relative h-[220px] w-[220px] shrink-0">
              <ResponsiveContainer height="100%" width="100%">
                <PieChart>
                  <Pie data={resolutionData} dataKey="value" innerRadius={64} outerRadius={92} paddingAngle={3} stroke="none">
                    {resolutionData.map((entry, index) => (
                      <Cell fill={DONUT_COLORS[index % DONUT_COLORS.length]} key={entry.name} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid rgba(148,163,184,0.25)" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-3xl font-black text-white">{regions.length}</div>
                <div className="metric-label">Regions</div>
              </div>
            </div>
            <div className="flex-1 space-y-3">
              {resolutionData.map((entry, index) => {
                const pct = Math.round((entry.value / donutTotal) * 100);
                return (
                  <div className="flex items-center justify-between text-sm" key={entry.name}>
                    <span className="flex items-center gap-2 text-slate-300">
                      <span className="h-3 w-3 rounded-sm" style={{ background: DONUT_COLORS[index % DONUT_COLORS.length] }} />
                      {entry.name}
                    </span>
                    <span className="font-mono text-slate-400">
                      {entry.value.toLocaleString()} <span className="text-slate-500">· {pct}%</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="section-title">Regions Above Refine Threshold</div>
          <div className="mt-3 text-5xl font-black text-cyanSignal">
            {regions.filter((region) => region.utility > refineThreshold).length}
          </div>
          <p className="mt-3 text-sm text-slate-500">Regions with utility score &gt; {refineThreshold}</p>
        </div>

        <div className="panel flex flex-col justify-center">
          <div className="metric-label">Memory saved vs uniform {cm(fineM)} grid</div>
          <div className="mt-2 text-4xl font-black text-emerald-400">
            {savedPercent === null ? "38%" : `${savedPercent}%`}
          </div>
          <div className="mt-4 metric-label">Total budget</div>
          <div className="mt-1 text-2xl font-black text-white">{totalBudget.toLocaleString()}</div>
        </div>
      </div>
    </section>
  );
}