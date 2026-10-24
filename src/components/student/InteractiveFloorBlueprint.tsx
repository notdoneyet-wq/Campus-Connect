import React, { useRef } from 'react';
import {
  CampusZone,
  FloorNumber,
  getFloorZones,
  findZoneByCoordinates,
  HostelName,
} from '../../data/campus';
import { CampusOrganization, Category, Ticket } from '../../types';
import { translateHostel, translateRoomLabel, useT } from '../../data/i18n';

interface InteractiveFloorBlueprintProps {
  hostel: HostelName;
  floor: FloorNumber;
  zones?: CampusZone[];
  campus?: CampusOrganization | null;
  selectedZone?: CampusZone | null;
  pin?: { x: number; y: number } | null;
  onPinSelect?: (zone: CampusZone, pinX: number, pinY: number) => void;
  // Staff & Admin preview props
  mode?: 'select' | 'pins' | 'heatmap' | 'incidents';
  tickets?: Ticket[];
  onZoneClick?: (zone: CampusZone) => void;
  highlightedIncidentId?: string | null;
  recurringZoneCodes?: Set<string>;
  showAssumedBadges?: boolean;
}

export const InteractiveFloorBlueprint: React.FC<InteractiveFloorBlueprintProps> = ({
  hostel,
  floor,
  zones: explicitZones,
  campus,
  selectedZone,
  pin,
  onPinSelect,
  mode = 'select',
  tickets = [],
  onZoneClick,
  recurringZoneCodes = new Set(),
  showAssumedBadges = false,
}) => {
  const { t, language } = useT();
  const svgRef = useRef<SVGSVGElement>(null);
  const zones =
    explicitZones && explicitZones.length > 0
      ? explicitZones
      : getFloorZones(hostel, floor, campus);

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const pinX = Math.round(Math.max(0, Math.min(100, (clickX / rect.width) * 100)) * 10) / 10;
    const pinY = Math.round(Math.max(0, Math.min(100, (clickY / rect.height) * 100)) * 10) / 10;

    const matchedZone = findZoneByCoordinates(hostel, floor, pinX, pinY, campus, zones);

    if (onPinSelect && matchedZone) {
      onPinSelect(matchedZone, pinX, pinY);
    }
    if (onZoneClick && matchedZone) {
      onZoneClick(matchedZone);
    }
  };

  // Count tickets and upvoted rooms per zone for heatmap (matching either current zone code/label or preserved locationSnapshot)
  const zoneTicketCounts = new Map<string, number>();
  tickets.forEach((tk) => {
    const tkBuilding = tk.locationSnapshot?.buildingName || tk.hostel;
    const tkFloor = tk.locationSnapshot?.floor ?? tk.floor;
    if (String(tkBuilding).toLowerCase() === String(hostel).toLowerCase() && Number(tkFloor) === Number(floor)) {
      const codeKey = tk.locationCode;
      const current = zoneTicketCounts.get(codeKey) || 0;
      zoneTicketCounts.set(codeKey, current + 1);

      // Also match by room label if map was updated and code changed
      const byLabel = zones.find(
        (z) => z.code !== codeKey && z.label.toLowerCase() === (tk.locationSnapshot?.room || tk.room).toLowerCase()
      );
      if (byLabel) {
        zoneTicketCounts.set(byLabel.code, (zoneTicketCounts.get(byLabel.code) || 0) + 1);
      }
    }
    if (Array.isArray(tk.upvotedRooms)) {
      tk.upvotedRooms.forEach((rLabel) => {
        const matchedZone = zones.find(
          (z) =>
            z.label.toLowerCase() === rLabel.toLowerCase() ||
            z.id.toLowerCase() === rLabel.toLowerCase()
        );
        if (matchedZone) {
          const cur = zoneTicketCounts.get(matchedZone.code) || 0;
          zoneTicketCounts.set(matchedZone.code, cur + 1);
        }
      });
    }
  });

  const getHeatmapColor = (count: number) => {
    if (count === 0) return 'fill-white/90 dark:fill-[#132C3E] stroke-[#0E7490]/30 dark:stroke-cyan-500/30';
    if (count <= 2) return 'fill-amber-200/90 dark:fill-amber-900/60 stroke-amber-600 dark:stroke-amber-500';
    if (count <= 4) return 'fill-orange-300/90 dark:fill-orange-900/70 stroke-orange-700 dark:stroke-orange-500';
    return 'fill-red-300 dark:fill-red-900/80 stroke-red-700 dark:stroke-red-500';
  };

  const getCategoryPinColor = (cat: Category) => {
    switch (cat) {
      case 'plumbing':
        return '#0284c7';
      case 'electricity':
        return '#d97706';
      case 'cleanliness':
        return '#0d9488';
      case 'internet':
        return '#0e7490';
      default:
        return '#0891b2';
    }
  };

  // Render corridors first so rooms/utilities sit cleanly on top if adjacent
  const orderedZones = [...zones].sort((a, b) => {
    const aIsCorr = a.zoneKind === 'corridor' ? 0 : 1;
    const bIsCorr = b.zoneKind === 'corridor' ? 0 : 1;
    return aIsCorr - bIsCorr;
  });

  return (
    <div className="w-full relative select-none">
      <div className="relative rounded-2xl overflow-hidden tactile-inset p-1.5">
        <div className="rounded-xl overflow-hidden bg-[#F5FAFC] dark:bg-[#0D1F2D] border border-[#0E7490]/20 dark:border-sky-400/20">
          <svg
            ref={svgRef}
            viewBox="0 0 1000 500"
            role="img"
            aria-label={t('blueprintTitle', {
              hostel: translateHostel(String(hostel), language),
              floor,
            })}
            className="w-full h-auto cursor-crosshair block transition-colors"
            onClick={handleSvgClick}
          >
            <defs>
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path
                  d="M 20 0 L 0 0 0 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="0.6"
                  className="text-[#0E7490]/15 dark:text-sky-400/10"
                />
              </pattern>
              <pattern id="stairsHatch" width="8" height="8" patternUnits="userSpaceOnUse">
                <path
                  d="M 0 4 L 8 4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  className="text-[#0E7490]/25 dark:text-cyan-400/20"
                />
              </pattern>
              <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodOpacity="0.25" />
              </filter>
            </defs>

            <rect width="1000" height="500" fill="url(#grid)" />

            {/* Outer Building Schematic Perimeter */}
            <rect
              x="20"
              y="20"
              width="960"
              height="460"
              rx="12"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="text-[#0E7490]/35 dark:text-cyan-400/30"
            />

            {orderedZones.map((zone) => {
              const isSelected = selectedZone?.id === zone.id || selectedZone?.code === zone.code;
              const count = zoneTicketCounts.get(zone.code) || 0;
              const isRecurring = recurringZoneCodes.has(zone.code);

              const x = (zone.bounds.minX / 100) * 1000;
              const y = (zone.bounds.minY / 100) * 500;
              const width = Math.max(36, ((zone.bounds.maxX - zone.bounds.minX) / 100) * 1000);
              const height = Math.max(28, ((zone.bounds.maxY - zone.bounds.minY) / 100) * 500);
              const cx = x + width / 2;
              const cy = y + height / 2;

              let fillClass =
                'fill-white dark:fill-[#132C3E] stroke-[#0E7490]/35 dark:stroke-cyan-500/35';

              if (mode === 'heatmap') {
                fillClass = getHeatmapColor(count);
              } else if (isSelected) {
                fillClass =
                  'fill-[#0E7490] dark:fill-[#0891B2] stroke-[#0F293A] dark:stroke-white stroke-2';
              } else if (zone.zoneKind === 'corridor') {
                fillClass =
                  'fill-[#E6F4F8]/65 dark:fill-[#0B1C29]/85 stroke-[#0E7490]/25 dark:stroke-cyan-500/25';
              } else if (zone.zoneKind === 'stairs') {
                fillClass =
                  'fill-[#DDF0F6]/85 dark:fill-[#112A3D] stroke-[#0E7490]/40 dark:stroke-cyan-400/40';
              } else if (zone.zoneKind === 'entrance') {
                fillClass =
                  'fill-[#CCFBF1]/70 dark:fill-[#0F2E36] stroke-[#0D9488]/45 dark:stroke-teal-400/45';
              } else if (zone.type === 'common') {
                fillClass =
                  'fill-[#E0F2F7]/75 dark:fill-[#0F2435] stroke-[#0E7490]/30 dark:stroke-cyan-500/30';
              }

              return (
                <g
                  key={zone.id}
                  tabIndex={0}
                  role="button"
                  aria-label={`${translateRoomLabel(zone.label, language)}${count > 0 ? ` (${count} active tickets)` : ''}`}
                  className="transition-all duration-150 hover:opacity-90 focus:outline-none"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onZoneClick) onZoneClick(zone);
                    if (onPinSelect) onPinSelect(zone, zone.center.x, zone.center.y);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (onZoneClick) onZoneClick(zone);
                      if (onPinSelect) onPinSelect(zone, zone.center.x, zone.center.y);
                    }
                  }}
                >
                  <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    rx="8"
                    strokeDasharray={zone.isAssumed ? '5 3' : undefined}
                    className={`${fillClass} transition-colors`}
                    strokeWidth={isSelected ? 2.5 : 1.35}
                  />

                  {/* Subtle Stair Hatch Pattern */}
                  {zone.zoneKind === 'stairs' && !isSelected && (
                    <rect
                      x={x + 4}
                      y={y + 4}
                      width={Math.max(0, width - 8)}
                      height={Math.max(0, height - 8)}
                      rx="6"
                      fill="url(#stairsHatch)"
                      className="pointer-events-none"
                    />
                  )}

                  {/* Zone Label */}
                  <text
                    x={cx}
                    y={cy + (zone.type === 'room' ? 0 : 2)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className={`text-xs select-none pointer-events-none font-semibold ${
                      isSelected
                        ? 'fill-white'
                        : 'fill-[#0F293A] dark:fill-[#F0F9FF]'
                    }`}
                    fontSize={width < 95 ? 10.5 : zone.type === 'room' ? 13 : 11.5}
                  >
                    {translateRoomLabel(zone.label, language)}
                  </text>

                  {/* Assumed Layout Badge (shown in setup preview or when zone.isAssumed is flagged) */}
                  {(showAssumedBadges || zone.isAssumed) && zone.isAssumed && width >= 70 && (
                    <g className="pointer-events-none">
                      <rect
                        x={cx - 28}
                        y={y + height - 18}
                        width="56"
                        height="13"
                        rx="3.5"
                        className={
                          isSelected
                            ? 'fill-white/25'
                            : 'fill-amber-500/20 dark:fill-amber-400/20'
                        }
                      />
                      <text
                        x={cx}
                        y={y + height - 9.5}
                        textAnchor="middle"
                        className={`text-[8.5px] font-mono-tech font-bold uppercase ${
                          isSelected
                            ? 'fill-white'
                            : 'fill-amber-800 dark:fill-amber-300'
                        }`}
                      >
                        Assumed
                      </text>
                    </g>
                  )}

                  {/* Heatmap count badge */}
                  {mode === 'heatmap' && count > 0 && (
                    <g>
                      <circle cx={x + width - 18} cy={y + 18} r="12" className="fill-[#0E7490]" />
                      <text
                        x={x + width - 18}
                        y={y + 22}
                        textAnchor="middle"
                        className="fill-white font-bold text-[10px] select-none pointer-events-none"
                      >
                        {count}
                      </text>
                    </g>
                  )}

                  {/* Recurring Warning Indicator */}
                  {isRecurring && (
                    <g>
                      <title>{t('recurringZoneFlag')}</title>
                      <rect
                        x={x + 6}
                        y={y + 6}
                        width="62"
                        height="17"
                        rx="4"
                        className="fill-amber-600 text-white"
                      />
                      <text
                        x={x + 37}
                        y={y + 17}
                        textAnchor="middle"
                        className="fill-white font-bold text-[9px] select-none pointer-events-none"
                      >
                        {t('recurringBadge')}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Mode: Pins - Display open ticket pins (supports preserved locationSnapshot coordinates) */}
            {mode === 'pins' &&
              tickets
                .filter((tk) => {
                  const tkBuilding = tk.locationSnapshot?.buildingName || tk.hostel;
                  const tkFloor = tk.locationSnapshot?.floor ?? tk.floor;
                  return (
                    String(tkBuilding).toLowerCase() === String(hostel).toLowerCase() &&
                    Number(tkFloor) === Number(floor) &&
                    tk.status !== 'Resolved' &&
                    tk.status !== 'Verified'
                  );
                })
                .map((ticket) => {
                  const rawPinX = ticket.locationSnapshot?.pinX ?? ticket.pinX;
                  const rawPinY = ticket.locationSnapshot?.pinY ?? ticket.pinY;
                  const px = (rawPinX / 100) * 1000;
                  const py = (rawPinY / 100) * 500;
                  const color = getCategoryPinColor(ticket.category);
                  const roomLabel = ticket.locationSnapshot?.room || ticket.room;

                  return (
                    <g key={ticket.id} filter="url(#shadow)">
                      <title>{`${ticket.ticketId}: ${ticket.title} (${roomLabel})`}</title>
                      <circle cx={px} cy={py} r="11" fill={color} stroke="#FFFFFF" strokeWidth="2.5" />
                      <circle cx={px} cy={py} r="4" fill="#FFFFFF" />
                    </g>
                  );
                })}

            {/* Interactive User Pin */}
            {pin && (
              <g
                transform={`translate(${(pin.x / 100) * 1000}, ${(pin.y / 100) * 500})`}
                filter="url(#shadow)"
                className="pointer-events-none transition-all duration-150"
              >
                <circle r="12" fill="#0E7490" stroke="#FFFFFF" strokeWidth="2.5" />
                <circle r="4.5" fill="#E0F2FE" />
              </g>
            )}
          </svg>

          {/* Blueprint Helper Bar with Schematic Representation Notice */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-white/85 dark:bg-[#102536] border-t border-[#0E7490]/15 dark:border-sky-400/15 text-xs font-medium text-[#0F293A] dark:text-[#F0F9FF]">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">
                {t('blueprintTitle', {
                  hostel: translateHostel(String(hostel), language),
                  floor,
                })}
              </span>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#E0F2F7] dark:bg-[#0E7490]/30 text-[#0E7490] dark:text-cyan-200 border border-[#0E7490]/20">
                {language === 'hi'
                  ? 'अनुमानित योजनाबद्ध नक्शा (वास्तु ब्लूप्रिंट नहीं)'
                  : 'Schematic Map · Not an Architectural Blueprint'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[#0E7490] dark:text-cyan-300">
              {pin && (
                <span className="font-mono-tech text-[11px] font-bold">
                  Pin ({Math.round(pin.x)}%, {Math.round(pin.y)}%)
                </span>
              )}
              <span>{t('tapAnywhereToPin')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
