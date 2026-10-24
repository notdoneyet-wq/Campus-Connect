import {
  CampusBuilding,
  CampusFloorMap,
  CampusOrganization,
  FloorGenerationInput,
  SchematicZone,
  ZoneKind,
} from '../types';

export type HostelName = 'Hostel 1' | 'Hostel 2' | (string & {});
export type FloorNumber = 1 | 2 | 3 | number;

export type CampusZone = SchematicZone;

export const DEFAULT_CAMPUS_ID = 'campus_demo_default';

export const HOSTELS: { id: HostelName; code: string; name: string; floors: FloorNumber[] }[] = [
  { id: 'Hostel 1', code: 'H1', name: 'Hostel 1 (Aryabhatta Wing)', floors: [1, 2, 3] },
  { id: 'Hostel 2', code: 'H2', name: 'Hostel 2 (Bhaskara Wing)', floors: [1, 2, 3] },
];

// Active campus in-memory cache so synchronous blueprint lookups automatically reflect the logged-in user's campus
let activeCampusCache: CampusOrganization | null = null;

export function setActiveCampusCache(campus: CampusOrganization | null): void {
  activeCampusCache = campus;
}

export function getActiveCampusCache(): CampusOrganization | null {
  return activeCampusCache;
}

export function getHostelCode(hostel: string, campus?: CampusOrganization | null): string {
  const effectiveCampus = campus || activeCampusCache;
  if (effectiveCampus?.buildings) {
    const match = effectiveCampus.buildings.find(
      (b) => b.name.toLowerCase() === hostel.toLowerCase() || b.id === hostel
    );
    if (match?.code) return match.code;
  }
  if (hostel === 'Hostel 1') return 'H1';
  if (hostel === 'Hostel 2') return 'H2';
  return (
    hostel
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 3)
      .toUpperCase() || 'BLD'
  );
}

export function getLocationCode(hostel: string, floor: number, roomOrZoneId: string): string {
  const hCode = getHostelCode(hostel);
  const cleanRoom = roomOrZoneId.replace(/^Room\s+/i, 'R').replace(/\s+/g, '').toUpperCase();
  return `${hCode}-F${floor}-${cleanRoom}`;
}

export function formatHumanLocation(hostel: string, floor: number, room: string): string {
  return `${hostel} · Floor ${floor} · ${room}`;
}

export function getBuiltInFloorZones(hostel: string, floor: number): CampusZone[] {
  const hCode = hostel === 'Hostel 1' ? 'H1' : hostel === 'Hostel 2' ? 'H2' : hostel.slice(0, 3).toUpperCase();
  const fPrefix = `${floor}`;

  // 8 Rooms per floor: 4 top row, 4 bottom row
  const topRooms = [1, 2, 3, 4].map((num, idx) => {
    const rNum = `${fPrefix}0${num}`;
    const minX = 18 + idx * 16;
    const maxX = minX + 15;
    return {
      id: `R${rNum}`,
      code: `${hCode}-F${floor}-R${rNum}`,
      label: `Room ${rNum}`,
      type: 'room' as const,
      zoneKind: 'room' as ZoneKind,
      isAssumed: false,
      bounds: { minX, minY: 8, maxX, maxY: 36 },
      center: { x: minX + 7.5, y: 22 },
    };
  });

  const bottomRooms = [5, 6, 7, 8].map((num, idx) => {
    const rNum = `${fPrefix}0${num}`;
    const minX = 18 + idx * 16;
    const maxX = minX + 15;
    return {
      id: `R${rNum}`,
      code: `${hCode}-F${floor}-R${rNum}`,
      label: `Room ${rNum}`,
      type: 'room' as const,
      zoneKind: 'room' as ZoneKind,
      isAssumed: false,
      bounds: { minX, minY: 64, maxX, maxY: 92 },
      center: { x: minX + 7.5, y: 78 },
    };
  });

  const commonAreas: CampusZone[] = [
    {
      id: 'WASH',
      code: `${hCode}-F${floor}-WASH`,
      label: 'Washroom',
      type: 'common',
      zoneKind: 'washroom',
      isAssumed: false,
      bounds: { minX: 3, minY: 8, maxX: 16, maxY: 46 },
      center: { x: 9.5, y: 27 },
    },
    {
      id: 'COOL',
      code: `${hCode}-F${floor}-COOL`,
      label: 'Water Cooler',
      type: 'common',
      zoneKind: 'utility',
      isAssumed: false,
      bounds: { minX: 3, minY: 54, maxX: 16, maxY: 92 },
      center: { x: 9.5, y: 73 },
    },
    {
      id: 'CORR',
      code: `${hCode}-F${floor}-CORR`,
      label: 'Central Corridor',
      type: 'common',
      zoneKind: 'corridor',
      isAssumed: false,
      bounds: { minX: 18, minY: 39, maxX: 82, maxY: 61 },
      center: { x: 50, y: 50 },
    },
    {
      id: 'WIFI',
      code: `${hCode}-F${floor}-WIFI`,
      label: 'Wi-Fi Access Point',
      type: 'common',
      zoneKind: 'utility',
      isAssumed: false,
      bounds: { minX: 43, minY: 43, maxX: 57, maxY: 57 },
      center: { x: 50, y: 50 },
    },
    {
      id: 'STAIR',
      code: `${hCode}-F${floor}-STAIR`,
      label: 'Stairs',
      type: 'common',
      zoneKind: 'stairs',
      isAssumed: false,
      bounds: { minX: 84, minY: 8, maxX: 97, maxY: 46 },
      center: { x: 90.5, y: 27 },
    },
    {
      id: 'COMMON',
      code: `${hCode}-F${floor}-COMMON`,
      label: floor === 1 ? 'Main Entrance & Common Room' : 'Common Study Area',
      type: 'common',
      zoneKind: floor === 1 ? 'entrance' : 'common',
      isAssumed: false,
      bounds: { minX: 84, minY: 54, maxX: 97, maxY: 92 },
      center: { x: 90.5, y: 73 },
    },
  ];

  return [...topRooms, ...bottomRooms, ...commonAreas];
}

export function getFloorZones(
  hostel: HostelName,
  floor: FloorNumber,
  campusOverride?: CampusOrganization | null
): CampusZone[] {
  const campus = campusOverride || activeCampusCache;
  if (campus) {
    const buildings = campus.buildings || [];
    const matchedBuilding = buildings.find(
      (b) =>
        b.name.toLowerCase() === String(hostel).toLowerCase() ||
        b.id.toLowerCase() === String(hostel).toLowerCase() ||
        b.code.toLowerCase() === String(hostel).toLowerCase()
    );
    if (matchedBuilding) {
      const matchedFloor = matchedBuilding.floors.find(
        (fl) => Number(fl.floorNumber) === Number(floor)
      );
      if (matchedFloor && Array.isArray(matchedFloor.zones) && matchedFloor.zones.length > 0) {
        return matchedFloor.zones;
      }
    }
  }
  return getBuiltInFloorZones(String(hostel), Number(floor));
}

export function findZoneByCoordinates(
  hostel: HostelName,
  floor: FloorNumber,
  pinX: number,
  pinY: number,
  campusOverride?: CampusOrganization | null,
  explicitZones?: CampusZone[]
): CampusZone {
  const zones = explicitZones && explicitZones.length > 0
    ? explicitZones
    : getFloorZones(hostel, floor, campusOverride);

  // Check smaller/specific zones first (like WIFI inside CORR, or rooms before corridor)
  const sortedZones = [...zones].sort((a, b) => {
    const areaA = (a.bounds.maxX - a.bounds.minX) * (a.bounds.maxY - a.bounds.minY);
    const areaB = (b.bounds.maxX - b.bounds.minX) * (b.bounds.maxY - b.bounds.minY);
    return areaA - areaB;
  });

  for (const z of sortedZones) {
    if (
      pinX >= z.bounds.minX &&
      pinX <= z.bounds.maxX &&
      pinY >= z.bounds.minY &&
      pinY <= z.bounds.maxY
    ) {
      return z;
    }
  }

  // Fallback to closest zone center
  let closest = zones[0];
  let minDistance = Infinity;
  for (const z of zones) {
    const dx = pinX - z.center.x;
    const dy = pinY - z.center.y;
    const dist = Math.hypot(dx, dy);
    if (dist < minDistance) {
      minDistance = dist;
      closest = z;
    }
  }
  return closest;
}

/**
 * Parses room specifications like "Rooms 101-108", "101 to 106, Warden Office", or comma-separated lists.
 */
export function parseRoomTokens(roomsInput: string, floorNumber: number): string[] {
  const raw = (roomsInput || '').trim();
  if (!raw) {
    return Array.from({ length: 8 }, (_, i) => `Room ${floorNumber}0${i + 1}`);
  }

  const results: string[] = [];
  const segments = raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const seg of segments) {
    const rangeMatch = seg.match(/(?:rooms?\s*)?([A-Za-z]*)\s*(\d{1,4})\s*(?:-|to|–)\s*(?:rooms?\s*)?[A-Za-z]*\s*(\d{1,4})/i);
    if (rangeMatch) {
      const prefix = rangeMatch[1] ? `${rangeMatch[1].toUpperCase()}-` : 'Room ';
      const start = parseInt(rangeMatch[2], 10);
      const end = parseInt(rangeMatch[3], 10);
      if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start && end - start <= 24) {
        for (let n = start; n <= end; n++) {
          results.push(`${prefix}${n}`);
        }
        continue;
      }
    }
    if (/^\d{2,4}$/.test(seg)) {
      results.push(`Room ${seg}`);
    } else {
      results.push(seg);
    }
  }

  return results.length > 0
    ? results.slice(0, 20)
    : Array.from({ length: 6 }, (_, i) => `Room ${floorNumber}0${i + 1}`);
}

/**
 * Deterministic schematic floor layout generator.
 * Used as an instant fallback if AI generation fails or when the admin clicks "Manual / Deterministic Layout".
 * Clearly tags assumed placements so admins see what was inferred.
 */
export function generateDeterministicFloorMap(
  buildingName: string,
  buildingCode: string,
  floorNumber: number,
  spec?: Partial<FloorGenerationInput>,
  generatedBy: 'ai' | 'manual' | 'default' = 'manual'
): CampusFloorMap {
  const bCode = (buildingCode || buildingName.slice(0, 3)).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const corridorStyle = spec?.corridorStyle || 'central-corridor';
  const roomLabels = parseRoomTokens(spec?.roomsInput || '', floorNumber);

  const commonTokens = (spec?.commonAreasInput || '')
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const sharedFacilities = Array.isArray(spec?.sharedFacilities) && spec!.sharedFacilities.length > 0
    ? spec!.sharedFacilities
    : ['Washroom', 'Water Cooler', 'Wi-Fi Access Point'];

  const assumptions: string[] = [];
  const zones: SchematicZone[] = [];

  if (!spec?.roomsInput || !spec.roomsInput.trim()) {
    assumptions.push(
      `Assumed standard room numbering (${roomLabels[0]} to ${roomLabels[roomLabels.length - 1]}) for Floor ${floorNumber}.`
    );
  }

  // Left Wing Shared Facilities (Washroom & Utility/Water Cooler)
  const hasWashroom = sharedFacilities.some((f) => /washroom|restroom|toilet|bath/i.test(f));
  const hasCooler = sharedFacilities.some((f) => /water|cooler|drinking|ro/i.test(f));

  if (hasWashroom || sharedFacilities.length === 0) {
    zones.push({
      id: `WASH_F${floorNumber}`,
      code: `${bCode}-F${floorNumber}-WASH`,
      label: 'Washroom',
      type: 'common',
      zoneKind: 'washroom',
      isAssumed: !spec?.sharedFacilities,
      bounds: { minX: 3, minY: 8, maxX: 16, maxY: 46 },
      center: { x: 9.5, y: 27 },
    });
  }

  if (hasCooler || sharedFacilities.length === 0) {
    zones.push({
      id: `COOL_F${floorNumber}`,
      code: `${bCode}-F${floorNumber}-COOL`,
      label: 'Water Cooler',
      type: 'common',
      zoneKind: 'utility',
      isAssumed: !spec?.sharedFacilities,
      bounds: { minX: 3, minY: 54, maxX: 16, maxY: 92 },
      center: { x: 9.5, y: 73 },
    });
  }

  // Right Wing Stairs & Entrance / Common Area
  const stairsLabel = spec?.stairsInfo?.trim() || 'Main Stairs';
  const stairsAssumed = !spec?.stairsInfo?.trim();
  if (stairsAssumed) {
    assumptions.push('Assumed Main Staircase in the east wing for vertical circulation.');
  }
  zones.push({
    id: `STAIR_F${floorNumber}`,
    code: `${bCode}-F${floorNumber}-STAIR`,
    label: stairsLabel,
    type: 'common',
    zoneKind: 'stairs',
    isAssumed: stairsAssumed,
    bounds: { minX: 84, minY: 8, maxX: 97, maxY: 46 },
    center: { x: 90.5, y: 27 },
  });

  const entranceOrCommonLabel =
    floorNumber === 1
      ? spec?.entrancesInfo?.trim() || commonTokens[0] || 'Main Entrance Lobby'
      : commonTokens[0] || 'Common Study Lounge';
  const entranceAssumed = floorNumber === 1 ? !spec?.entrancesInfo?.trim() : commonTokens.length === 0;
  if (entranceAssumed) {
    assumptions.push(
      floorNumber === 1
        ? 'Assumed Main Entrance Lobby in the south-east wing on Floor 1.'
        : `Assumed Common Study Lounge in the south-east wing on Floor ${floorNumber}.`
    );
  }
  zones.push({
    id: `ENTR_F${floorNumber}`,
    code: `${bCode}-F${floorNumber}-COMMON`,
    label: entranceOrCommonLabel,
    type: 'common',
    zoneKind: floorNumber === 1 ? 'entrance' : 'common',
    isAssumed: entranceAssumed,
    bounds: { minX: 84, minY: 54, maxX: 97, maxY: 92 },
    center: { x: 90.5, y: 73 },
  });

  // Corridor & Room Arrangement based on corridorStyle
  const allAssignableUnits = [
    ...roomLabels.map((r) => ({ label: r, kind: 'room' as ZoneKind, type: 'room' as const })),
    ...commonTokens.slice(floorNumber === 1 && !spec?.entrancesInfo?.trim() ? 1 : 1).map((c) => ({
      label: c,
      kind: 'common' as ZoneKind,
      type: 'common' as const,
    })),
  ];

  if (corridorStyle === 'courtyard') {
    assumptions.push('Arranged rooms around a central open courtyard and ring walkway.');
    zones.push({
      id: `CORR_F${floorNumber}`,
      code: `${bCode}-F${floorNumber}-COURT`,
      label: 'Central Courtyard & Walkway',
      type: 'common',
      zoneKind: 'corridor',
      isAssumed: true,
      bounds: { minX: 28, minY: 36, maxX: 72, maxY: 64 },
      center: { x: 50, y: 50 },
    });
  } else if (corridorStyle === 'l-shaped') {
    assumptions.push('Laid out an L-shaped connecting corridor across north and east wings.');
    zones.push({
      id: `CORR_F${floorNumber}`,
      code: `${bCode}-F${floorNumber}-CORR`,
      label: 'L-Wing Corridor',
      type: 'common',
      zoneKind: 'corridor',
      isAssumed: false,
      bounds: { minX: 18, minY: 40, maxX: 82, maxY: 60 },
      center: { x: 50, y: 50 },
    });
  } else {
    zones.push({
      id: `CORR_F${floorNumber}`,
      code: `${bCode}-F${floorNumber}-CORR`,
      label: corridorStyle === 'single-wing' ? 'South Access Corridor' : 'Central Spine Corridor',
      type: 'common',
      zoneKind: 'corridor',
      isAssumed: false,
      bounds: { minX: 18, minY: 39, maxX: 82, maxY: 61 },
      center: { x: 50, y: 50 },
    });
  }

  // Wi-Fi AP or Lift in corridor center if selected
  if (sharedFacilities.some((f) => /wi-?fi|router|ap|internet/i.test(f))) {
    zones.push({
      id: `WIFI_F${floorNumber}`,
      code: `${bCode}-F${floorNumber}-WIFI`,
      label: 'Wi-Fi Access Point',
      type: 'common',
      zoneKind: 'utility',
      isAssumed: true,
      bounds: { minX: 43, minY: 43, maxX: 57, maxY: 57 },
      center: { x: 50, y: 50 },
    });
  }

  // Distribute rooms cleanly across Top Wing (y: 8..36) and Bottom Wing (y: 64..92) inside x: 18..82
  const topCount = Math.ceil(allAssignableUnits.length / 2);
  const bottomCount = allAssignableUnits.length - topCount;
  const usableWidth = 64; // 82 - 18

  allAssignableUnits.slice(0, topCount).forEach((unit, idx) => {
    const slotW = usableWidth / Math.max(1, topCount);
    const minX = Math.round((18 + idx * slotW + 0.5) * 10) / 10;
    const maxX = Math.round((18 + (idx + 1) * slotW - 0.5) * 10) / 10;
    const shortId = unit.label.replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase() || `T${idx + 1}`;
    zones.push({
      id: `Z_${floorNumber}_T${idx + 1}`,
      code: `${bCode}-F${floorNumber}-${shortId}`,
      label: unit.label,
      type: unit.type,
      zoneKind: unit.kind,
      isAssumed: false,
      bounds: { minX, minY: 8, maxX, maxY: 36 },
      center: {
        x: Math.round(((minX + maxX) / 2) * 10) / 10,
        y: 22,
      },
    });
  });

  allAssignableUnits.slice(topCount).forEach((unit, idx) => {
    const slotW = usableWidth / Math.max(1, bottomCount);
    const minX = Math.round((18 + idx * slotW + 0.5) * 10) / 10;
    const maxX = Math.round((18 + (idx + 1) * slotW - 0.5) * 10) / 10;
    const shortId = unit.label.replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase() || `B${idx + 1}`;
    zones.push({
      id: `Z_${floorNumber}_B${idx + 1}`,
      code: `${bCode}-F${floorNumber}-${shortId}`,
      label: unit.label,
      type: unit.type,
      zoneKind: unit.kind,
      isAssumed: false,
      bounds: { minX, minY: 64, maxX, maxY: 92 },
      center: {
        x: Math.round(((minX + maxX) / 2) * 10) / 10,
        y: 78,
      },
    });
  });

  if (assumptions.length === 0) {
    assumptions.push(
      'Schematic proportions and room widths are evenly distributed along the main corridor (not to architectural scale).'
    );
  }

  return {
    floorNumber,
    floorLabel: `Floor ${floorNumber}`,
    zones,
    assumptions,
    layoutSummary: `${buildingName} · Floor ${floorNumber} (${roomLabels.length} rooms, ${corridorStyle.replace('-', ' ')})`,
    inputSpec: {
      roomsInput: spec?.roomsInput || roomLabels.join(', '),
      commonAreasInput: spec?.commonAreasInput || commonTokens.join(', '),
      corridorStyle,
      stairsInfo: stairsLabel,
      entrancesInfo: spec?.entrancesInfo || (floorNumber === 1 ? 'Main Entrance Lobby' : ''),
      sharedFacilities,
      notes: spec?.notes || '',
    },
    generatedBy,
    updatedAt: Date.now(),
  };
}

/**
 * Rule-based natural-language floor map editor fallback when AI is offline or for instant local edits.
 */
export function applyNaturalLanguageMapEditFallback(
  floorMap: CampusFloorMap,
  instruction: string,
  buildingCode = 'BLD'
): { floorMap: CampusFloorMap; changeSummary: string } {
  const bCode = buildingCode.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'BLD';
  const text = instruction.trim();
  const lower = text.toLowerCase();
  const nextZones = floorMap.zones.map((z) => ({
    ...z,
    bounds: { ...z.bounds },
    center: { ...z.center },
  }));
  const nextAssumptions = [...(floorMap.assumptions || [])];
  const changes: string[] = [];

  // 1. Check for "rename X to Y"
  const renameMatch = text.match(/rename\s+["']?([^"']+?)["']?\s+to\s+["']?([^"'.]+)["']?/i);
  if (renameMatch) {
    const targetName = renameMatch[1].trim().toLowerCase();
    const newName = renameMatch[2].trim();
    const found = nextZones.find(
      (z) => z.label.toLowerCase() === targetName || z.label.toLowerCase().includes(targetName)
    );
    if (found) {
      const oldLabel = found.label;
      found.label = newName;
      found.isAssumed = false;
      changes.push(`Renamed "${oldLabel}" to "${newName}"`);
    }
  }

  // 2. Check for "remove / delete X"
  const removeMatch = text.match(/(?:remove|delete|drop)\s+["']?([^"'.]+)["']?/i);
  if (removeMatch) {
    const targetName = removeMatch[1].trim().toLowerCase();
    const idx = nextZones.findIndex(
      (z) => z.label.toLowerCase() === targetName || z.label.toLowerCase().includes(targetName)
    );
    if (idx !== -1) {
      const removed = nextZones.splice(idx, 1)[0];
      changes.push(`Removed "${removed.label}" from Floor ${floorMap.floorNumber}`);
    }
  }

  // 3. Check for "move X to top/bottom/left/right/center"
  const moveMatch = text.match(/move\s+["']?([^"']+?)["']?\s+(?:to|near|in)\s+(?:the\s+)?(top|north|bottom|south|left|west|right|east|center|middle)/i);
  if (moveMatch) {
    const targetName = moveMatch[1].trim().toLowerCase();
    const dir = moveMatch[2].toLowerCase();
    const found = nextZones.find(
      (z) => z.label.toLowerCase().includes(targetName) || z.id.toLowerCase() === targetName
    );
    if (found) {
      const w = Math.max(10, found.bounds.maxX - found.bounds.minX);
      const h = Math.max(16, found.bounds.maxY - found.bounds.minY);
      if (dir === 'top' || dir === 'north') {
        found.bounds.minY = 8;
        found.bounds.maxY = 8 + h;
      } else if (dir === 'bottom' || dir === 'south') {
        found.bounds.maxY = 92;
        found.bounds.minY = 92 - h;
      } else if (dir === 'left' || dir === 'west') {
        found.bounds.minX = 3;
        found.bounds.maxX = 3 + w;
      } else if (dir === 'right' || dir === 'east') {
        found.bounds.maxX = 97;
        found.bounds.minX = 97 - w;
      } else if (dir === 'center' || dir === 'middle') {
        found.bounds.minX = Math.round(50 - w / 2);
        found.bounds.maxX = Math.round(50 + w / 2);
        found.bounds.minY = Math.round(50 - h / 2);
        found.bounds.maxY = Math.round(50 + h / 2);
      }
      found.center = {
        x: Math.round(((found.bounds.minX + found.bounds.maxX) / 2) * 10) / 10,
        y: Math.round(((found.bounds.minY + found.bounds.maxY) / 2) * 10) / 10,
      };
      found.isAssumed = false;
      changes.push(`Moved "${found.label}" to the ${dir} section`);
    }
  }

  // 4. Check for "add X"
  const addMatch = text.match(/add\s+(?:a\s+|an\s+)?["']?([^"'.]+?)["']?(?:\s+(?:in|at|to|near)\s+(?:the\s+)?(top|north|bottom|south|left|west|right|east|center))?$/i);
  if (addMatch && !renameMatch) {
    const rawLabel = addMatch[1]
      .replace(/\s+(?:in|at|to|near)\s+(?:the\s+)?(?:top|north|bottom|south|left|west|right|east|center).*/i, '')
      .trim();
    const posHint = (addMatch[2] || '').toLowerCase();
    const kind: ZoneKind = /washroom|toilet|restroom/i.test(rawLabel)
      ? 'washroom'
      : /stair|step/i.test(rawLabel)
      ? 'stairs'
      : /entrance|gate|lobby/i.test(rawLabel)
      ? 'entrance'
      : /corridor|hallway|walkway/i.test(rawLabel)
      ? 'corridor'
      : /cooler|wifi|lift|elevator|pantry|utility/i.test(rawLabel)
      ? 'utility'
      : /lounge|common|study|gym|tv|reading|office/i.test(rawLabel)
      ? 'common'
      : 'room';

    let minX = 68;
    let maxX = 82;
    let minY = 64;
    let maxY = 92;

    if (posHint === 'top' || posHint === 'north') {
      minY = 8;
      maxY = 36;
    } else if (posHint === 'left' || posHint === 'west') {
      minX = 3;
      maxX = 16;
      minY = 54;
      maxY = 92;
    } else if (posHint === 'right' || posHint === 'east') {
      minX = 84;
      maxX = 97;
      minY = 54;
      maxY = 92;
    } else if (posHint === 'center') {
      minX = 42;
      maxX = 58;
      minY = 42;
      maxY = 58;
    }

    const shortCode = rawLabel.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() || 'NEW';
    nextZones.push({
      id: `AI_${Date.now().toString(36).slice(-4)}`,
      code: `${bCode}-F${floorMap.floorNumber}-${shortCode}`,
      label: rawLabel,
      type: kind === 'room' ? 'room' : 'common',
      zoneKind: kind,
      isAssumed: false,
      bounds: { minX, minY, maxX, maxY },
      center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    });
    changes.push(`Added "${rawLabel}" (${kind}) to the floor map`);
  }

  // 5. Check for layout style changes (courtyard / L-shaped / central corridor)
  if (lower.includes('courtyard') && changes.length === 0) {
    const corr = nextZones.find((z) => z.zoneKind === 'corridor' || z.id.includes('CORR'));
    if (corr) {
      corr.label = 'Central Open Courtyard';
      corr.bounds = { minX: 28, minY: 36, maxX: 72, maxY: 64 };
      corr.center = { x: 50, y: 50 };
      changes.push('Converted central corridor into an open courtyard layout');
    }
  }

  // If no pattern matched, add the requested item as a room/common zone so the user always sees immediate action
  if (changes.length === 0 && text.length > 2) {
    const cleanLabel = text.length > 28 ? text.slice(0, 28) : text;
    nextZones.push({
      id: `CUSTOM_${Date.now().toString(36).slice(-4)}`,
      code: `${bCode}-F${floorMap.floorNumber}-CUST`,
      label: cleanLabel,
      type: 'common',
      zoneKind: 'common',
      isAssumed: false,
      bounds: { minX: 66, minY: 64, maxX: 82, maxY: 92 },
      center: { x: 74, y: 78 },
    });
    changes.push(`Added custom zone "${cleanLabel}" based on your instruction`);
  }

  nextAssumptions.push(`AI Co-Pilot update: ${changes.join('; ')}`);

  return {
    floorMap: {
      ...floorMap,
      zones: nextZones,
      assumptions: Array.from(new Set(nextAssumptions)).slice(-6),
      updatedAt: Date.now(),
    },
    changeSummary: changes.join('. '),
  };
}

export function createDefaultDemoCampus(): CampusOrganization {
  const now = Date.now();
  const buildings: CampusBuilding[] = HOSTELS.map((h) => ({
    id: h.id,
    name: h.id,
    code: h.code,
    type: 'hostel',
    totalFloors: 3,
    floors: [1, 2, 3].map((fl) => ({
      floorNumber: fl,
      floorLabel: `Floor ${fl}`,
      zones: getBuiltInFloorZones(h.id, fl),
      assumptions: [
        'Standard 2-wing hostel floor layout with 8 student rooms and central spine corridor.',
        'Shared washroom and drinking water cooler located on the west wing; stairs and common room on the east wing.',
      ],
      layoutSummary: `${h.name} · Floor ${fl} (8 Rooms + Shared Facilities)`,
      generatedBy: 'default',
      updatedAt: now,
    })),
  }));

  return {
    id: DEFAULT_CAMPUS_ID,
    name: 'Indian Institute of Technology — Demo Campus',
    code: 'IIT-DEMO',
    domains: ['campus.demo'],
    city: 'New Delhi',
    description: 'Reference residential campus portal with Aryabhatta (Hostel 1) and Bhaskara (Hostel 2) wings.',
    status: 'published',
    wizardStep: 4,
    version: 1,
    adminUids: ['staff_admin'],
    buildings,
    createdAt: now - 30 * 86400 * 1000,
    updatedAt: now,
    publishedAt: now - 30 * 86400 * 1000,
  };
}
