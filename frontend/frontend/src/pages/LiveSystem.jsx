import AdaptiveMap from "../components/AdaptiveMap.jsx";
import BudgetPanel from "../components/BudgetPanel.jsx";
import LiveLidarScene from "../components/LiveLidarScene.jsx";
import RegionInspector from "../components/RegionInspector.jsx";
import UtilityEngine from "../components/UtilityEngine.jsx";

export default function LiveSystem({
  budgetTotal,
  budgetUsed,
  controls,
  isLive,
  regions,
  resolutionLevels,
  selectedRegion,
  selectedRegionId,
  resetSimulation,
  setControls,
  setSelectedRegionId,
  time,
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-[1.05fr_1.15fr_390px]">
      <LiveLidarScene
        controls={controls}
        resetSimulation={resetSimulation}
        regions={regions}
        setControls={setControls}
        setSelectedRegionId={setSelectedRegionId}
        time={time}
      />
      <div className="space-y-4">
        <AdaptiveMap
          onSelectRegion={setSelectedRegionId}
          predictionEnabled={controls.showPrediction}
          regions={regions}
          resolutionLevels={resolutionLevels}
          selectedRegionId={selectedRegionId}
        />
        <RegionInspector region={selectedRegion} />
      </div>
      <aside className="space-y-4">
        <BudgetPanel
          budgetTotal={budgetTotal}
          budgetUsed={budgetUsed}
          isLive={isLive}
          onSelectRegion={setSelectedRegionId}
          regions={regions}
          selectedRegionId={selectedRegionId}
        />
        <UtilityEngine region={selectedRegion} />
      </aside>
    </section>
  );
}