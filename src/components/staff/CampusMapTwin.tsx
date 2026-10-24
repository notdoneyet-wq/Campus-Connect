import React, { useState, useEffect } from 'react';
import {
  Flame,
  Layers,
  X,
  Filter,
  Info,
} from 'lucide-react';
import {
  CampusZone,
  createDefaultDemoCampus,
  FloorNumber,
  getActiveCampusCache,
  HostelName,
} from '../../data/campus';
import { CampusOrganization, Ticket, UserProfile } from '../../types';
import { InteractiveFloorBlueprint } from '../student/InteractiveFloorBlueprint';
import { fetchMyCampus, getSimulatedNow } from '../../services/db';
import { filterAuthorizedTickets } from '../../utils/authorization';
import {
  translateCategory,
  translateHostel,
  translateRoomLabel,
  translateStatus,
  useT,
} from '../../data/i18n';

interface CampusMapTwinProps {
  tickets: Ticket[];
  currentUser: UserProfile;
}

export const CampusMapTwin: React.FC<CampusMapTwinProps> = ({ tickets, currentUser }) => {
  const { t, language } = useT();
  const [activeCampus, setActiveCampus] = useState<CampusOrganization>(
    () => getActiveCampusCache() || createDefaultDemoCampus()
  );
  const [selectedHostel, setSelectedHostel] = useState<HostelName>(
    activeCampus.buildings?.[0]?.name || 'Hostel 1'
  );
  const [selectedFloor, setSelectedFloor] = useState<FloorNumber>(
    activeCampus.buildings?.[0]?.floors?.[1]?.floorNumber ||
      activeCampus.buildings?.[0]?.floors?.[0]?.floorNumber ||
      1
  );
  const [activeLayer, setActiveLayer] = useState<'pins' | 'heatmap' | 'incidents'>('heatmap');

  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDays, setFilterDays] = useState<number>(30);
  const [inspectedZone, setInspectedZone] = useState<CampusZone | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchMyCampus(currentUser).then((c) => {
      if (!mounted || !c) return;
      setActiveCampus(c);
      const bNames = (c.buildings || []).map((b) => b.name);
      if (bNames.length > 0 && !bNames.includes(String(selectedHostel))) {
        setSelectedHostel(bNames[0]);
        setSelectedFloor(c.buildings[0]?.floors[0]?.floorNumber || 1);
      }
    });
    return () => {
      mounted = false;
    };
  }, [currentUser?.uid, currentUser?.campusId]);

  const campusBuildings =
    activeCampus.buildings && activeCampus.buildings.length > 0
      ? activeCampus.buildings
      : createDefaultDemoCampus().buildings;

  const now = getSimulatedNow();
  const timeThreshold = now - filterDays * 24 * 3600 * 1000;

  // Enforce Department & Campus RBAC on map data
  const authorizedTickets = filterAuthorizedTickets(currentUser, tickets);
  const canFilterAllCategories = currentUser.role === 'supervisor' || currentUser.role === 'admin';

  const filteredTickets = authorizedTickets.filter((tk) => {
    if (tk.createdAt < timeThreshold) return false;
    if (canFilterAllCategories && filterCategory !== 'all' && tk.category !== filterCategory) {
      return false;
    }
    if (filterStatus !== 'all' && tk.status !== filterStatus) return false;
    return true;
  });

  // Calculate recurring zones (3+ tickets of the same category in 30 days)
  const recurringZoneCodes = new Set<string>();
  const zoneCategoryMap = new Map<string, number>();

  authorizedTickets
    .filter((tk) => tk.createdAt >= now - 30 * 24 * 3600 * 1000)
    .forEach((tk) => {
      const key = `${tk.locationCode}_${tk.category}`;
      const count = (zoneCategoryMap.get(key) || 0) + 1;
      zoneCategoryMap.set(key, count);
      if (count >= 3) {
        recurringZoneCodes.add(tk.locationCode);
      }
    });

  // Dynamic Building x Floor overview mini grid
  const miniGridCounts: Record<string, number> = {};
  filteredTickets.forEach((tk) => {
    const bName = tk.locationSnapshot?.buildingName || tk.hostel;
    const flNum = tk.locationSnapshot?.floor ?? tk.floor;
    const key = `${bName}__${flNum}`;
    miniGridCounts[key] = (miniGridCounts[key] || 0) + 1;
  });

  const zoneTickets = inspectedZone
    ? filteredTickets.filter((tk) => {
        const bName = tk.locationSnapshot?.buildingName || tk.hostel;
        const flNum = tk.locationSnapshot?.floor ?? tk.floor;
        const rName = tk.locationSnapshot?.room || tk.room;
        return (
          String(bName).toLowerCase() === String(selectedHostel).toLowerCase() &&
          Number(flNum) === Number(selectedFloor) &&
          (tk.locationCode === inspectedZone.code ||
            String(rName).toLowerCase() === inspectedZone.label.toLowerCase())
        );
      })
    : [];

  return (
    <div className="space-y-6">
      {/* Top Controls: Dynamic Buildings x Floors Overview Mini Grid */}
      <div className="tactile-card rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg relevo-well flex items-center justify-center">
              <Flame className="w-4 h-4 text-amber-300" />
            </div>
            <div>
              <h3 className="font-display font-extrabold text-base deboss-heading">
                {t('campusHeatmapMiniGrid')}
              </h3>
              <p className="text-[11px] font-mono-tech text-[#476778] dark:text-[#94B8CC]">
                {activeCampus.name} · Map v{activeCampus.version || 1}
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-[#254E68] dark:text-[#D3C2B8]">
            {t('tapAnyFloorToFocus')}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {campusBuildings.map((bld) => {
            const h = bld.name;
            return (
              <div
                key={bld.id}
                className="p-3.5 rounded-xl tactile-inset space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-display font-extrabold text-[#1D3C50] dark:text-[#EFE7E1]">
                    {translateHostel(h, language)}
                  </span>
                  <span className="text-[10px] font-mono-tech font-bold text-[#476778] dark:text-[#94B8CC]">
                    {bld.code}
                  </span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                  {bld.floors.map((flObj) => {
                    const fl = flObj.floorNumber;
                    const count = miniGridCounts[`${h}__${fl}`] || 0;
                    const isSelected = selectedHostel === h && Number(selectedFloor) === Number(fl);
                    return (
                      <button
                        key={fl}
                        onClick={() => {
                          setSelectedHostel(h);
                          setSelectedFloor(fl);
                          setInspectedZone(null);
                        }}
                        className={`p-2.5 rounded-xl text-center transition-all ${
                          isSelected
                            ? 'tactile-btn-primary'
                            : 'tactile-btn-beige'
                        }`}
                      >
                        <div className="text-[10px] uppercase font-bold opacity-85">
                          {t('floorLabel', { floor: fl })}
                        </div>
                        <div className="text-base font-mono-tech font-extrabold">{count}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Blueprint Twin Stage */}
      <div className="tactile-card rounded-2xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-extrabold deboss-heading flex items-center gap-2 flex-wrap">
              <Layers className="w-5 h-5 text-[#254E68] dark:text-[#D3C2B8]" />
              <span>{t('campusTwinBlueprintTitle')}</span>
              <span className="text-xs font-mono-tech font-bold text-[#254E68] dark:text-[#D3C2B8]">
                ({translateHostel(String(selectedHostel), language)} · {t('floorLabel', { floor: selectedFloor })})
              </span>
            </h2>
            <p className="text-xs font-medium text-[#254E68] dark:text-[#D3C2B8] mt-0.5">
              {t('campusTwinBlueprintDesc')}
            </p>
          </div>

          {/* Segmented Layer Control */}
          <div className="flex items-center p-1.5 rounded-xl tactile-inset gap-1">
            <button
              onClick={() => setActiveLayer('pins')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeLayer === 'pins'
                  ? 'tactile-btn-primary'
                  : 'text-[#1D3C50] dark:text-[#D3C2B8]'
              }`}
            >
              {t('layerPins')}
            </button>
            <button
              onClick={() => setActiveLayer('heatmap')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeLayer === 'heatmap'
                  ? 'tactile-btn-primary'
                  : 'text-[#1D3C50] dark:text-[#D3C2B8]'
              }`}
            >
              {t('layerHeatmap')}
            </button>
            <button
              onClick={() => setActiveLayer('incidents')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeLayer === 'incidents'
                  ? 'tactile-btn-primary'
                  : 'text-[#1D3C50] dark:text-[#D3C2B8]'
              }`}
            >
              {t('layerIncidents')}
            </button>
          </div>
        </div>

        {/* Filters & Legends */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl tactile-surface-elevated text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-[#254E68] dark:text-[#D3C2B8]" />
            {canFilterAllCategories && (
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="tactile-input p-1.5 rounded-lg font-bold"
              >
                <option value="all">{t('allCategories')}</option>
                <option value="plumbing">{translateCategory('plumbing', language)}</option>
                <option value="electricity">{translateCategory('electricity', language)}</option>
                <option value="cleanliness">{translateCategory('cleanliness', language)}</option>
                <option value="internet">{translateCategory('internet', language)}</option>
              </select>
            )}

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="tactile-input p-1.5 rounded-lg font-bold"
            >
              <option value="all">{t('allStatuses')}</option>
              <option value="Open">{translateStatus('Open', language)}</option>
              <option value="Assigned">{translateStatus('Assigned', language)}</option>
              <option value="In Progress">{translateStatus('In Progress', language)}</option>
            </select>

            <select
              value={filterDays}
              onChange={(e) => setFilterDays(Number(e.target.value))}
              className="tactile-input p-1.5 rounded-lg font-bold"
            >
              <option value={7}>{t('last7Days')}</option>
              <option value={30}>{t('last30Days')}</option>
            </select>
          </div>

          {activeLayer === 'heatmap' && (
            <div className="flex items-center gap-2.5 text-[11px] text-[#1D3C50] dark:text-[#EFE7E1] font-bold">
              <span>{t('heatmapLegend')}:</span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#EFE7E1] border border-[#1D3C50]/30 inline-block"></span>
                0
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-amber-300 inline-block"></span>
                1-2
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-orange-400 inline-block"></span>
                3-4
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-red-500 inline-block"></span>
                5+
              </span>
            </div>
          )}

          {activeLayer === 'pins' && (
            <div className="flex items-center gap-3 text-[11px] text-[#1D3C50] dark:text-[#EFE7E1] font-bold flex-wrap">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-600 inline-block"></span>
                {translateCategory('plumbing', language)}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-600 inline-block"></span>
                {translateCategory('electricity', language)}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block"></span>
                {translateCategory('cleanliness', language)}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#254E68] inline-block"></span>
                {translateCategory('internet', language)}
              </span>
            </div>
          )}
        </div>

        {/* Blueprint Display */}
        <InteractiveFloorBlueprint
          hostel={selectedHostel}
          floor={selectedFloor}
          campus={activeCampus}
          mode={activeLayer}
          tickets={filteredTickets}
          selectedZone={inspectedZone}
          recurringZoneCodes={recurringZoneCodes}
          onZoneClick={(zone) => setInspectedZone(zone)}
        />

        <div className="flex items-center gap-2 text-[11px] font-semibold text-[#254E68] dark:text-[#D3C2B8] px-1">
          <Info className="w-3.5 h-3.5 shrink-0" />
          <span>{t('countsReflectReportedTickets')}</span>
        </div>
      </div>

      {/* Zone Inspection Panel */}
      {inspectedZone && (
        <div className="tactile-card rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#1D3C50]/15 dark:border-[#D3C2B8]/15">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono-tech text-xs font-extrabold text-[#254E68] dark:text-[#D3C2B8]">
                  {inspectedZone.code}
                </span>
                {recurringZoneCodes.has(inspectedZone.code) && (
                  <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-600 text-white">
                    {t('recurringSpotBadge')}
                  </span>
                )}
              </div>
              <h3 className="font-display font-extrabold text-lg deboss-heading mt-0.5">
                {translateHostel(String(selectedHostel), language)} · {t('floorLabel', { floor: selectedFloor })} ·{' '}
                {translateRoomLabel(inspectedZone.label, language)}
              </h3>
            </div>
            <button
              onClick={() => setInspectedZone(null)}
              className="tactile-btn-beige p-2 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2.5">
            <span className="text-xs font-extrabold text-[#254E68] dark:text-[#D3C2B8] uppercase tracking-wider block">
              {t('activeComplaintsInRoom', { count: zoneTickets.length })}
            </span>

            {zoneTickets.length === 0 ? (
              <p className="text-xs font-semibold text-[#254E68] dark:text-[#D3C2B8] py-3">
                {t('noActiveTicketsForLocation')}
              </p>
            ) : (
              <div className="space-y-2.5">
                {zoneTickets.map((tk) => (
                  <div
                    key={tk.id}
                    className="p-3.5 rounded-xl tactile-surface-elevated text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono-tech font-extrabold text-[#1D3C50] dark:text-[#EFE7E1]">
                        {tk.ticketId}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {tk.locationSnapshot && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono-tech bg-white/60 dark:bg-white/10 text-[#0E7490] dark:text-cyan-300">
                            Pin ({Math.round(tk.locationSnapshot.pinX)}%, {Math.round(tk.locationSnapshot.pinY)}%) · Map v{tk.locationSnapshot.mapVersion}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#254E68] text-[#EFE7E1]">
                          {translateStatus(tk.status, language)}
                        </span>
                      </div>
                    </div>
                    <div className="font-display font-bold text-[#1D3C50] dark:text-[#EFE7E1]">
                      {tk.title}
                    </div>
                    <p className="text-[#254E68] dark:text-[#D3C2B8] text-[11px] line-clamp-1 font-medium">
                      {tk.rawText}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
