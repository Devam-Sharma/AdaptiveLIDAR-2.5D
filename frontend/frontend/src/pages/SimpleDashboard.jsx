import DashboardHeader from "../components/DashboardHeader.jsx";
import LeftControlPanel from "../components/LeftControlPanel.jsx";
import RadarView from "../components/RadarView.jsx";
import RightInsightPanel from "../components/RightInsightPanel.jsx";

// The "narrate the demo out loud" page: one glance at the header tells you
// mode/frame/budget, the left column is playback + how resolution is
// currently split, the center is the sensor view, and the right column is
// "why" (ranked utility + whatever region you click). The denser pages
// (Live System, Budget Analytics, Comparison) stay one nav click away.
export default function SimpleDashboard({
  budgetTotal,
  budgetUsed,
  controls,
  dataSource,
  frameNumber,
  liveStatus,
  regions,
  selectedRegion,
  selectedRegionId,
  setControls,
  setDataSource,
  setSelectedRegionId,
  resetSimulation,
}) {
  const budgetPercent = Math.min(100, Math.round(((budgetUsed ?? 0) / Math.max(budgetTotal ?? 1, 1e-6)) * 100));

  return (
    <div className="flex flex-col">
      <DashboardHeader
        budgetPercent={budgetPercent}
        dataSource={dataSource}
        frameNumber={frameNumber}
        liveStatus={liveStatus}
        setDataSource={setDataSource}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <LeftControlPanel
          controls={controls}
          dataSource={dataSource}
          regions={regions}
          resetSimulation={resetSimulation}
          setControls={setControls}
        />

        <div className="flex flex-col lg:col-span-6">
          <RadarView onSelectRegion={setSelectedRegionId} regions={regions} selectedRegionId={selectedRegionId} />
        </div>

        <RightInsightPanel
          budgetTotal={budgetTotal}
          budgetUsed={budgetUsed}
          onSelectRegion={setSelectedRegionId}
          regions={regions}
          selectedRegion={selectedRegion}
          selectedRegionId={selectedRegionId}
        />
      </div>
    </div>
  );
}