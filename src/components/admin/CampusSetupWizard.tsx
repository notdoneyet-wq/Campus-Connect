import React, { useState, useRef } from 'react';
import {
  Building2,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  Layers,
  MapPin,
  AlertTriangle,
  Wand2,
  Move,
  ShieldCheck,
  Info,
  Globe,
  Hash,
  X,
} from 'lucide-react';
import {
  CampusBuilding,
  CampusFloorMap,
  CampusOrganization,
  FloorGenerationInput,
  SchematicZone,
  UserProfile,
  ZoneKind,
} from '../../types';
import { generateDeterministicFloorMap } from '../../data/campus';
import { generateSchematicFloorMap, editFloorMapWithAi } from '../../services/gemini';
import { saveCampusDraft, publishCampusPortal } from '../../services/db';
import { InteractiveFloorBlueprint } from '../student/InteractiveFloorBlueprint';

interface CampusSetupWizardProps {
  currentUser: UserProfile;
  campus: CampusOrganization;
  onCampusUpdated: (updated: CampusOrganization) => void;
  onPortalPublished: (published: CampusOrganization) => void;
  onCloseStudio?: () => void;
}

const SHARED_FACILITY_OPTIONS = [
  'Washroom',
  'Water Cooler',
  'Wi-Fi Access Point',
  'Elevator / Lift',
  'Fire Exit',
  'Pantry / Mess',
];

export const CampusSetupWizard: React.FC<CampusSetupWizardProps> = ({
  campus,
  onCampusUpdated,
  onPortalPublished,
  onCloseStudio,
}) => {
  const isAlreadyPublished = campus.status === 'published';
  const [step, setStep] = useState<1 | 2 | 3 | 4>(
    isAlreadyPublished ? 3 : (campus.wizardStep || 1)
  );

  // Step 1: Institute Identity
  const [instituteName, setInstituteName] = useState(campus.name || '');
  const [campusCode, setCampusCode] = useState(campus.code || '');
  const [domainsInput, setDomainsInput] = useState((campus.domains || []).join(', '));
  const [city, setCity] = useState(campus.city || '');
  const [description, setDescription] = useState(campus.description || '');

  // Step 2 & 3: Buildings & Floors Draft State
  const [buildings, setBuildings] = useState<CampusBuilding[]>(() => {
    const initial =
      Array.isArray(campus.draftBuildings) && campus.draftBuildings.length > 0
        ? campus.draftBuildings
        : Array.isArray(campus.buildings) && campus.buildings.length > 0
        ? campus.buildings
        : [
            {
              id: 'bld_1',
              name: 'Hostel 1',
              code: 'H1',
              type: 'hostel' as const,
              totalFloors: 2,
              floors: [1, 2].map((fl) =>
                generateDeterministicFloorMap('Hostel 1', 'H1', fl, undefined, 'default')
              ),
            },
          ];
    return JSON.parse(JSON.stringify(initial));
  });

  // Active building & floor selection in Step 3 / Step 4
  const [activeBuildingIdx, setActiveBuildingIdx] = useState(0);
  const [activeFloorNum, setActiveFloorNum] = useState(1);

  // Selected zone for visual editing
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  // AI Generation & AI Co-Pilot states
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiCoPilotPrompt, setAiCoPilotPrompt] = useState('');
  const [isRunningCoPilot, setIsRunningCoPilot] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'info' | 'success' | 'warning';
    text: string;
  } | null>(null);

  // Draft Save & Publish Confirmation
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(campus.updatedAt || null);
  const [confirmCheckbox, setConfirmCheckbox] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // Preview pin state in Step 4
  const [previewPin, setPreviewPin] = useState<{ x: number; y: number } | null>(null);
  const [previewSelectedZone, setPreviewSelectedZone] = useState<SchematicZone | null>(null);

  // Dragging state on the interactive schematic SVG editor
  const editorSvgRef = useRef<SVGSVGElement>(null);
  const [draggingZoneId, setDraggingZoneId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  const currentBuilding = buildings[activeBuildingIdx] || buildings[0];
  const currentFloorMap: CampusFloorMap | undefined =
    currentBuilding?.floors.find((f) => f.floorNumber === activeFloorNum) ||
    currentBuilding?.floors[0];

  const selectedZone =
    currentFloorMap?.zones.find((z) => z.id === selectedZoneId) || null;

  const currentSpec: FloorGenerationInput = currentFloorMap?.inputSpec || {
    roomsInput: `Room ${activeFloorNum}01 - Room ${activeFloorNum}06`,
    commonAreasInput:
      activeFloorNum === 1 ? 'Main Entrance Lobby, Warden Office' : 'Common Study Lounge',
    corridorStyle: 'central-corridor',
    stairsInfo: 'Main Staircase (East Wing)',
    entrancesInfo: activeFloorNum === 1 ? 'Main Entrance Gate' : '',
    sharedFacilities: ['Washroom', 'Water Cooler', 'Wi-Fi Access Point'],
    notes: '',
  };

  const updateCurrentFloorMap = (updater: (fl: CampusFloorMap) => CampusFloorMap) => {
    setBuildings((prev) =>
      prev.map((b, bIdx) => {
        if (bIdx !== activeBuildingIdx) return b;
        return {
          ...b,
          floors: b.floors.map((fl) =>
            fl.floorNumber === (currentFloorMap?.floorNumber || activeFloorNum)
              ? updater(fl)
              : fl
          ),
        };
      })
    );
  };

  const updateCurrentSpec = (patch: Partial<FloorGenerationInput>) => {
    updateCurrentFloorMap((fl) => ({
      ...fl,
      inputSpec: {
        ...(fl.inputSpec || currentSpec),
        ...patch,
      },
    }));
  };

  // Building CRUD in Step 2
  const handleAddBuilding = () => {
    const nextNum = buildings.length + 1;
    const name = `Hostel ${nextNum}`;
    const code = `H${nextNum}`;
    const newBld: CampusBuilding = {
      id: `bld_${Date.now()}_${nextNum}`,
      name,
      code,
      type: 'hostel',
      totalFloors: 2,
      floors: [1, 2].map((fl) =>
        generateDeterministicFloorMap(name, code, fl, undefined, 'default')
      ),
    };
    setBuildings((prev) => [...prev, newBld]);
  };

  const handleRemoveBuilding = (idx: number) => {
    if (buildings.length <= 1) return;
    setBuildings((prev) => prev.filter((_, i) => i !== idx));
    if (activeBuildingIdx >= buildings.length - 1) {
      setActiveBuildingIdx(0);
    }
  };

  const handleBuildingChange = (
    idx: number,
    patch: Partial<Pick<CampusBuilding, 'name' | 'code' | 'type' | 'totalFloors'>>
  ) => {
    setBuildings((prev) =>
      prev.map((bld, i) => {
        if (i !== idx) return bld;
        const updatedName = patch.name !== undefined ? patch.name : bld.name;
        const updatedCode =
          patch.code !== undefined
            ? patch.code.toUpperCase()
            : patch.name
            ? patch.name
                .split(/\s+/)
                .map((w) => w[0] || '')
                .join('')
                .toUpperCase()
                .slice(0, 4)
            : bld.code;
        const targetFloors =
          patch.totalFloors !== undefined
            ? Math.max(1, Math.min(8, Number(patch.totalFloors)))
            : bld.totalFloors;

        const nextFloors: CampusFloorMap[] = [];
        for (let f = 1; f <= targetFloors; f++) {
          const existing = bld.floors.find((fl) => fl.floorNumber === f);
          if (existing) {
            nextFloors.push(existing);
          } else {
            nextFloors.push(
              generateDeterministicFloorMap(updatedName, updatedCode, f, undefined, 'default')
            );
          }
        }

        return {
          ...bld,
          ...patch,
          name: updatedName,
          code: updatedCode,
          totalFloors: targetFloors,
          floors: nextFloors,
        };
      })
    );
  };

  // Save Draft handler
  const handleSaveDraft = async (nextWizardStep?: 1 | 2 | 3 | 4) => {
    setIsSavingDraft(true);
    setStatusMessage(null);
    try {
      const domains = domainsInput
        .split(/[,;\s]+/)
        .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
        .filter(Boolean);

      const saved = await saveCampusDraft(campus.id, {
        name: instituteName.trim() || campus.name,
        code: campusCode.trim().toUpperCase() || campus.code,
        domains,
        city: city.trim(),
        description: description.trim(),
        wizardStep: nextWizardStep || step,
        buildings,
      });
      setLastSavedAt(Date.now());
      onCampusUpdated(saved);
      setStatusMessage({
        type: 'success',
        text: 'Draft saved securely. You can resume or adjust maps anytime before publishing.',
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'warning',
        text: err.message || 'Could not sync draft to server; saved locally.',
      });
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Generate Current Floor Map via Gemini AI
  const handleGenerateFloorWithAi = async () => {
    if (!currentBuilding || !currentFloorMap) return;
    setIsGeneratingAi(true);
    setStatusMessage(null);
    try {
      const { floorMap, usedFallback } = await generateSchematicFloorMap({
        campusId: campus.id,
        buildingName: currentBuilding.name,
        buildingCode: currentBuilding.code,
        floorNumber: currentFloorMap.floorNumber,
        spec: currentSpec,
      });
      updateCurrentFloorMap(() => floorMap);
      setSelectedZoneId(floorMap.zones[0]?.id || null);
      setStatusMessage({
        type: usedFallback ? 'info' : 'success',
        text: usedFallback
          ? `Generated schematic layout for ${currentBuilding.name} · Floor ${currentFloorMap.floorNumber} using deterministic layout engine.`
          : `AI generated schematic layout for ${currentBuilding.name} · Floor ${currentFloorMap.floorNumber}. Review assumed placements below.`,
      });
    } catch (err: any) {
      const fallback = generateDeterministicFloorMap(
        currentBuilding.name,
        currentBuilding.code,
        currentFloorMap.floorNumber,
        currentSpec,
        'manual'
      );
      updateCurrentFloorMap(() => fallback);
      setStatusMessage({
        type: 'warning',
        text: 'AI service unreachable — applied clean manual schematic grid fallback.',
      });
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Generate All Floors in Current Building
  const handleGenerateAllFloorsInBuilding = async () => {
    if (!currentBuilding) return;
    setIsGeneratingAi(true);
    setStatusMessage(null);
    try {
      const updatedFloors: CampusFloorMap[] = [];
      for (const fl of currentBuilding.floors) {
        const specForFloor: FloorGenerationInput = fl.inputSpec || {
          ...currentSpec,
          roomsInput: `Room ${fl.floorNumber}01 - Room ${fl.floorNumber}06`,
        };
        const { floorMap } = await generateSchematicFloorMap({
          campusId: campus.id,
          buildingName: currentBuilding.name,
          buildingCode: currentBuilding.code,
          floorNumber: fl.floorNumber,
          spec: specForFloor,
        });
        updatedFloors.push(floorMap);
      }
      setBuildings((prev) =>
        prev.map((b, idx) => (idx === activeBuildingIdx ? { ...b, floors: updatedFloors } : b))
      );
      setStatusMessage({
        type: 'success',
        text: `Generated schematic maps for all ${updatedFloors.length} floors in ${currentBuilding.name}.`,
      });
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Reset / Manual Deterministic Fallback for Current Floor
  const handleManualFallbackReset = () => {
    if (!currentBuilding || !currentFloorMap) return;
    const manualMap = generateDeterministicFloorMap(
      currentBuilding.name,
      currentBuilding.code,
      currentFloorMap.floorNumber,
      currentSpec,
      'manual'
    );
    updateCurrentFloorMap(() => manualMap);
    setSelectedZoneId(manualMap.zones[0]?.id || null);
    setStatusMessage({
      type: 'info',
      text: `Applied manual schematic grid template for ${currentBuilding.name} · Floor ${currentFloorMap.floorNumber}. Drag or edit any room below.`,
    });
  };

  // AI Co-Pilot Natural-Language Floor Map Adjustment
  const handleExecuteAiCoPilot = async (customInstruction?: string) => {
    const instructionToRun = (customInstruction ?? aiCoPilotPrompt).trim();
    if (!instructionToRun || !currentBuilding || !currentFloorMap) return;
    setIsRunningCoPilot(true);
    setStatusMessage(null);
    try {
      const { floorMap, changeSummary } = await editFloorMapWithAi({
        campusId: campus.id,
        buildingName: currentBuilding.name,
        buildingCode: currentBuilding.code,
        floorNumber: currentFloorMap.floorNumber,
        currentFloorMap,
        instruction: instructionToRun,
      });
      updateCurrentFloorMap(() => floorMap);
      setAiCoPilotPrompt('');
      setStatusMessage({
        type: 'success',
        text: `AI Co-Pilot: ${changeSummary}`,
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'warning',
        text: err.message || 'Could not apply AI edit. You can adjust rooms directly below.',
      });
    } finally {
      setIsRunningCoPilot(false);
    }
  };

  // Manual Zone Addition / Deletion / Update
  const handleAddManualZone = (kind: ZoneKind = 'room') => {
    if (!currentBuilding || !currentFloorMap) return;
    const roomCount = currentFloorMap.zones.filter((z) => z.type === 'room').length + 1;
    const label =
      kind === 'room'
        ? `Room ${currentFloorMap.floorNumber}${String(roomCount).padStart(2, '0')}`
        : kind === 'washroom'
        ? 'Washroom'
        : kind === 'stairs'
        ? 'Stairs'
        : kind === 'entrance'
        ? 'Entrance Gate'
        : kind === 'corridor'
        ? 'Wing Corridor'
        : 'Common Area';
    const newId = `Z_MAN_${Date.now().toString(36).slice(-4)}`;
    const newZone: SchematicZone = {
      id: newId,
      code: `${currentBuilding.code}-F${currentFloorMap.floorNumber}-R${roomCount}`,
      label,
      type: kind === 'room' ? 'room' : 'common',
      zoneKind: kind,
      isAssumed: false,
      bounds: { minX: 42, minY: 64, maxX: 58, maxY: 92 },
      center: { x: 50, y: 78 },
    };
    updateCurrentFloorMap((fl) => ({
      ...fl,
      zones: [...fl.zones, newZone],
      updatedAt: Date.now(),
    }));
    setSelectedZoneId(newId);
  };

  const handleUpdateSelectedZone = (patch: Partial<SchematicZone> & { minX?: number; minY?: number; width?: number; height?: number }) => {
    if (!selectedZone) return;
    updateCurrentFloorMap((fl) => ({
      ...fl,
      zones: fl.zones.map((z) => {
        if (z.id !== selectedZone.id) return z;
        const currentW = z.bounds.maxX - z.bounds.minX;
        const currentH = z.bounds.maxY - z.bounds.minY;
        const minX = patch.minX !== undefined ? Math.max(2, Math.min(90, patch.minX)) : z.bounds.minX;
        const minY = patch.minY !== undefined ? Math.max(4, Math.min(86, patch.minY)) : z.bounds.minY;
        const w = patch.width !== undefined ? Math.max(6, Math.min(96 - minX, patch.width)) : currentW;
        const h = patch.height !== undefined ? Math.max(10, Math.min(96 - minY, patch.height)) : currentH;
        const maxX = Math.round((minX + w) * 10) / 10;
        const maxY = Math.round((minY + h) * 10) / 10;
        return {
          ...z,
          ...patch,
          bounds: { minX: Math.round(minX * 10) / 10, minY: Math.round(minY * 10) / 10, maxX, maxY },
          center: {
            x: Math.round(((minX + maxX) / 2) * 10) / 10,
            y: Math.round(((minY + maxY) / 2) * 10) / 10,
          },
        };
      }),
      updatedAt: Date.now(),
    }));
  };

  const handleDeleteSelectedZone = () => {
    if (!selectedZone) return;
    updateCurrentFloorMap((fl) => ({
      ...fl,
      zones: fl.zones.filter((z) => z.id !== selectedZone.id),
      updatedAt: Date.now(),
    }));
    setSelectedZoneId(null);
  };

  // Interactive SVG Pointer Drag for Repositioning Rooms
  const handleSvgPointerDown = (e: React.PointerEvent<SVGGElement>, zone: SchematicZone) => {
    e.stopPropagation();
    setSelectedZoneId(zone.id);
    if (!editorSvgRef.current) return;
    const rect = editorSvgRef.current.getBoundingClientRect();
    const pointerX = ((e.clientX - rect.left) / rect.width) * 100;
    const pointerY = ((e.clientY - rect.top) / rect.height) * 100;
    setDraggingZoneId(zone.id);
    setDragOffset({
      dx: pointerX - zone.bounds.minX,
      dy: pointerY - zone.bounds.minY,
    });
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingZoneId || !editorSvgRef.current) return;
    const rect = editorSvgRef.current.getBoundingClientRect();
    const pointerX = ((e.clientX - rect.left) / rect.width) * 100;
    const pointerY = ((e.clientY - rect.top) / rect.height) * 100;

    updateCurrentFloorMap((fl) => ({
      ...fl,
      zones: fl.zones.map((z) => {
        if (z.id !== draggingZoneId) return z;
        const w = z.bounds.maxX - z.bounds.minX;
        const h = z.bounds.maxY - z.bounds.minY;
        const newMinX = Math.round(Math.max(2, Math.min(98 - w, pointerX - dragOffset.dx)) * 10) / 10;
        const newMinY = Math.round(Math.max(4, Math.min(96 - h, pointerY - dragOffset.dy)) * 10) / 10;
        const newMaxX = Math.round((newMinX + w) * 10) / 10;
        const newMaxY = Math.round((newMinY + h) * 10) / 10;
        return {
          ...z,
          isAssumed: false,
          bounds: { minX: newMinX, minY: newMinY, maxX: newMaxX, maxY: newMaxY },
          center: {
            x: Math.round(((newMinX + newMaxX) / 2) * 10) / 10,
            y: Math.round(((newMinY + newMaxY) / 2) * 10) / 10,
          },
        };
      }),
    }));
  };

  const handleSvgPointerUp = () => {
    if (draggingZoneId) {
      setDraggingZoneId(null);
    }
  };

  // Final Explicit Admin Publish Handler
  const handleConfirmPublish = async () => {
    if (!confirmCheckbox) {
      setStatusMessage({
        type: 'warning',
        text: 'Please check the confirmation box to approve and publish the campus portal.',
      });
      return;
    }
    setIsPublishing(true);
    setStatusMessage(null);
    try {
      const domains = domainsInput
        .split(/[,;\s]+/)
        .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
        .filter(Boolean);

      const published = await publishCampusPortal(campus.id, {
        name: instituteName.trim() || campus.name,
        code: campusCode.trim().toUpperCase() || campus.code,
        domains,
        city: city.trim(),
        description: description.trim(),
        buildings,
      });
      onPortalPublished(published);
    } catch (err: any) {
      setStatusMessage({
        type: 'warning',
        text: err.message || 'Failed to publish campus portal.',
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const totalFloorsCount = buildings.reduce((acc, b) => acc + b.floors.length, 0);
  const totalZonesCount = buildings.reduce(
    (acc, b) => acc + b.floors.reduce((fAcc, fl) => fAcc + fl.zones.length, 0),
    0
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 pb-24">
      {/* Top Wizard / Studio Header Bar */}
      <div className="tactile-card rounded-2xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="px-2.5 py-1 rounded-lg text-[11px] font-mono-tech font-bold uppercase relevo-well">
              {isAlreadyPublished
                ? `Published Portal · v${campus.version || 1}`
                : 'Draft Setup Mode'}
            </span>
            <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
              Schematic Representation · Not an Architectural Blueprint
            </span>
            {lastSavedAt && (
              <span className="text-[11px] font-mono-tech text-[#476778] dark:text-[#94B8CC]">
                Last saved {new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-[#0F293A] dark:text-[#F0F9FF]">
            {isAlreadyPublished
              ? `${instituteName || campus.name} — Campus Map Studio`
              : 'Campus Setup & AI-Assisted Floor Map Builder'}
          </h1>
          <p className="text-xs sm:text-sm text-[#476778] dark:text-[#94B8CC]">
            Configure your institute buildings, generate schematic 2D floor layouts with Gemini AI, refine rooms via natural-language AI Co-Pilot or drag-and-drop, and publish your dedicated campus portal.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          <button
            type="button"
            disabled={isSavingDraft}
            onClick={() => handleSaveDraft(step)}
            className="tactile-btn-beige px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 min-h-[42px]"
          >
            <Save className="w-4 h-4 text-[#0E7490] dark:text-cyan-300" />
            <span>{isSavingDraft ? 'Saving Draft...' : 'Save Progress as Draft'}</span>
          </button>

          {onCloseStudio && (
            <button
              type="button"
              onClick={onCloseStudio}
              className="tactile-btn-primary px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 min-h-[42px]"
            >
              <span>Return to Console</span>
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Stepper Navigation Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-1.5 rounded-2xl tactile-inset">
        {[
          { num: 1 as const, title: '1. Institute Identity', sub: 'Name, Code & Domains' },
          { num: 2 as const, title: '2. Buildings & Floors', sub: `${buildings.length} Buildings · ${totalFloorsCount} Floors` },
          { num: 3 as const, title: '3. AI Map Builder', sub: 'Schematic Rooms & Co-Pilot' },
          { num: 4 as const, title: '4. Preview & Publish', sub: 'Verify & Launch Portal' },
        ].map((item) => {
          const isCurrent = step === item.num;
          return (
            <button
              key={item.num}
              type="button"
              onClick={() => setStep(item.num)}
              className={`p-3 rounded-xl text-left transition-all ${
                isCurrent
                  ? 'tactile-btn-primary'
                  : 'hover:bg-white/60 dark:hover:bg-white/5 text-[#0F293A] dark:text-[#CBE4F2]'
              }`}
            >
              <div className="text-xs font-display font-bold">{item.title}</div>
              <div
                className={`text-[11px] font-mono-tech mt-0.5 ${
                  isCurrent ? 'text-cyan-100' : 'text-[#476778] dark:text-[#94B8CC]'
                }`}
              >
                {item.sub}
              </div>
            </button>
          );
        })}
      </div>

      {/* Status Toast Banner */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl border text-xs font-semibold flex items-center justify-between gap-3 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200'
              : statusMessage.type === 'warning'
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-900 dark:text-amber-200'
              : 'bg-sky-500/10 border-sky-500/30 text-sky-900 dark:text-sky-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>{statusMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="p-1 opacity-75 hover:opacity-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* =====================================================================
          STEP 1: INSTITUTE DETAILS & ISOLATION IDENTIFIERS
         ===================================================================== */}
      {step === 1 && (
        <div className="tactile-card rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-[#0E7490]/15 dark:border-sky-400/15">
            <div className="w-10 h-10 rounded-xl relevo-well flex items-center justify-center text-white">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg text-[#0F293A] dark:text-[#F0F9FF]">
                Step 1: Institute Identity & Portal Isolation
              </h2>
              <p className="text-xs text-[#476778] dark:text-[#94B8CC]">
                Set your institute name, campus invite code, and email domains so students and staff join this exact portal without creating duplicate campuses.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
            <div>
              <label className="block font-bold text-[#0F293A] dark:text-[#F0F9FF] mb-1.5">
                Institute / University Name *
              </label>
              <input
                type="text"
                value={instituteName}
                onChange={(e) => setInstituteName(e.target.value)}
                placeholder="e.g., National Institute of Technology — Surathkal"
                className="tactile-input w-full p-3 rounded-xl font-semibold text-sm"
              />
            </div>

            <div>
              <label className="block font-bold text-[#0F293A] dark:text-[#F0F9FF] mb-1.5">
                Campus Invite Code (for Student & Staff Join) *
              </label>
              <div className="relative">
                <Hash className="w-4 h-4 text-[#0E7490] absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  value={campusCode}
                  onChange={(e) => setCampusCode(e.target.value.toUpperCase())}
                  placeholder="e.g., NITK-2025"
                  className="tactile-input w-full pl-10 pr-3 py-3 rounded-xl font-mono-tech font-bold text-sm uppercase"
                />
              </div>
              <p className="text-[11px] text-[#476778] dark:text-[#94B8CC] mt-1">
                Students can enter this code or pick your institute from the published selector.
              </p>
            </div>

            <div>
              <label className="block font-bold text-[#0F293A] dark:text-[#F0F9FF] mb-1.5">
                Official Email Domains (comma-separated for auto-matching)
              </label>
              <div className="relative">
                <Globe className="w-4 h-4 text-[#0E7490] absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  value={domainsInput}
                  onChange={(e) => setDomainsInput(e.target.value)}
                  placeholder="e.g., nitk.edu.in, campus.ac.in"
                  className="tactile-input w-full pl-10 pr-3 py-3 rounded-xl font-mono-tech font-medium"
                />
              </div>
              <p className="text-[11px] text-[#476778] dark:text-[#94B8CC] mt-1">
                Users signing up with a matching email domain are automatically routed to your campus.
              </p>
            </div>

            <div>
              <label className="block font-bold text-[#0F293A] dark:text-[#F0F9FF] mb-1.5">
                City / Campus Location
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g., Bengaluru, Karnataka"
                className="tactile-input w-full p-3 rounded-xl font-medium"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block font-bold text-[#0F293A] dark:text-[#F0F9FF] mb-1.5">
                Campus Portal Overview / Notes
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Residential hostels, academic blocks, and central amenities managed by Campus Estates..."
                className="tactile-input w-full p-3 rounded-xl font-medium"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#0E7490]/15 dark:border-sky-400/15">
            <button
              type="button"
              onClick={async () => {
                await handleSaveDraft(2);
                setStep(2);
              }}
              disabled={!instituteName.trim()}
              className="tactile-btn-primary px-6 py-3 rounded-xl text-xs font-bold flex items-center gap-2 disabled:opacity-40 min-h-[44px]"
            >
              <span>Save & Continue to Buildings</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          STEP 2: BUILDINGS & FLOORS INVENTORY
         ===================================================================== */}
      {step === 2 && (
        <div className="tactile-card rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#0E7490]/15 dark:border-sky-400/15">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl relevo-well flex items-center justify-center text-white">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display font-bold text-lg text-[#0F293A] dark:text-[#F0F9FF]">
                  Step 2: Campus Buildings & Floors per Building
                </h2>
                <p className="text-xs text-[#476778] dark:text-[#94B8CC]">
                  Enter each residential hostel, academic block, or amenity building and how many floors it has.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleAddBuilding}
              className="tactile-btn-primary px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 min-h-[40px]"
            >
              <Plus className="w-4 h-4" />
              <span>Add Building</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {buildings.map((bld, idx) => (
              <div
                key={bld.id}
                className="p-5 rounded-2xl tactile-surface-elevated space-y-4 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 rounded-md font-mono-tech font-bold text-[11px] bg-[#E0F2F7] dark:bg-[#0E7490]/30 text-[#0E7490] dark:text-cyan-200">
                    Building #{idx + 1} · {bld.code}
                  </span>
                  {buildings.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveBuilding(idx)}
                      className="text-red-600 dark:text-red-400 hover:underline flex items-center gap-1 text-[11px] font-semibold"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-[#0F293A] dark:text-[#F0F9FF] mb-1">
                      Building Name
                    </label>
                    <input
                      type="text"
                      value={bld.name}
                      onChange={(e) => handleBuildingChange(idx, { name: e.target.value })}
                      placeholder="e.g., Hostel 1 (Aryabhatta)"
                      className="tactile-input w-full p-2.5 rounded-xl font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-[#0F293A] dark:text-[#F0F9FF] mb-1">
                      Short Code
                    </label>
                    <input
                      type="text"
                      value={bld.code}
                      onChange={(e) => handleBuildingChange(idx, { code: e.target.value })}
                      maxLength={6}
                      className="tactile-input w-full p-2.5 rounded-xl font-mono-tech font-bold uppercase"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-[#0F293A] dark:text-[#F0F9FF] mb-1">
                      Building Type
                    </label>
                    <select
                      value={bld.type}
                      onChange={(e) =>
                        handleBuildingChange(idx, {
                          type: e.target.value as CampusBuilding['type'],
                        })
                      }
                      className="tactile-input w-full p-2.5 rounded-xl font-semibold"
                    >
                      <option value="hostel">Residential Hostel</option>
                      <option value="academic">Academic Department</option>
                      <option value="facility">Mess / Amenity Center</option>
                      <option value="other">Other Campus Block</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-[#0F293A] dark:text-[#F0F9FF] mb-1">
                      Number of Floors (1–8)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={bld.totalFloors}
                      onChange={(e) =>
                        handleBuildingChange(idx, { totalFloors: Number(e.target.value) })
                      }
                      className="tactile-input w-full p-2.5 rounded-xl font-mono-tech font-bold"
                    />
                  </div>
                </div>

                <div className="pt-1 flex items-center justify-between text-[11px] text-[#476778] dark:text-[#94B8CC]">
                  <span>
                    Active Floors: {bld.floors.map((f) => `F${f.floorNumber}`).join(', ')}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveBuildingIdx(idx);
                      setActiveFloorNum(1);
                      setStep(3);
                    }}
                    className="font-bold text-[#0E7490] dark:text-cyan-300 hover:underline"
                  >
                    Configure Floor Maps →
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-[#0E7490]/15 dark:border-sky-400/15">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="tactile-btn-beige px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 min-h-[42px]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                await handleSaveDraft(3);
                setStep(3);
              }}
              className="tactile-btn-primary px-6 py-3 rounded-xl text-xs font-bold flex items-center gap-2 min-h-[44px]"
            >
              <span>Next: AI Floor Map Builder</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          STEP 3: AI-ASSISTED SCHEMATIC FLOOR MAP BUILDER & CO-PILOT
         ===================================================================== */}
      {step === 3 && currentBuilding && currentFloorMap && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Configuration & AI Generation Rail (5 cols) */}
          <div className="lg:col-span-5 space-y-5">
            {/* Building & Floor Selector Card */}
            <div className="tactile-card rounded-2xl p-5 space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-sm text-[#0F293A] dark:text-[#F0F9FF]">
                  Select Building & Floor
                </span>
                <span className="font-mono-tech text-[11px] font-bold text-[#0E7490] dark:text-cyan-300">
                  {currentFloorMap.zones.length} Zones Mapped
                </span>
              </div>

              {/* Building Selector Pills */}
              <div className="flex flex-wrap gap-2">
                {buildings.map((b, bIdx) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      setActiveBuildingIdx(bIdx);
                      setActiveFloorNum(b.floors[0]?.floorNumber || 1);
                      setSelectedZoneId(null);
                    }}
                    className={`px-3.5 py-2 rounded-xl font-bold transition-all ${
                      bIdx === activeBuildingIdx
                        ? 'tactile-btn-primary'
                        : 'tactile-btn-beige'
                    }`}
                  >
                    {b.name} ({b.code})
                  </button>
                ))}
              </div>

              {/* Floor Selector Pills */}
              <div className="flex flex-wrap gap-2 pt-1">
                {currentBuilding.floors.map((fl) => (
                  <button
                    key={fl.floorNumber}
                    type="button"
                    onClick={() => {
                      setActiveFloorNum(fl.floorNumber);
                      setSelectedZoneId(null);
                    }}
                    className={`px-3.5 py-2 rounded-xl font-mono-tech font-bold transition-all ${
                      fl.floorNumber === activeFloorNum
                        ? 'tactile-btn-primary'
                        : 'tactile-btn-beige'
                    }`}
                  >
                    Floor {fl.floorNumber}
                  </button>
                ))}
              </div>
            </div>

            {/* Floor Arrangement Specification & AI Generator Card */}
            <div className="tactile-card rounded-2xl p-5 space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display font-bold text-sm text-[#0F293A] dark:text-[#F0F9FF]">
                    Floor {currentFloorMap.floorNumber} Specification
                  </h3>
                  <p className="text-[11px] text-[#476778] dark:text-[#94B8CC]">
                    Specify rooms, corridors, stairs, entrances & shared facilities. Any omitted detail will be inferred and clearly labeled as Assumed.
                  </p>
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#0F293A] dark:text-[#F0F9FF] mb-1">
                  Rooms / Ranges on Floor {currentFloorMap.floorNumber}
                </label>
                <input
                  type="text"
                  value={currentSpec.roomsInput}
                  onChange={(e) => updateCurrentSpec({ roomsInput: e.target.value })}
                  placeholder={`e.g., Room ${currentFloorMap.floorNumber}01 - Room ${currentFloorMap.floorNumber}08`}
                  className="tactile-input w-full p-2.5 rounded-xl font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-[#0F293A] dark:text-[#F0F9FF] mb-1">
                  Common Areas / Offices on this Floor
                </label>
                <input
                  type="text"
                  value={currentSpec.commonAreasInput}
                  onChange={(e) => updateCurrentSpec({ commonAreasInput: e.target.value })}
                  placeholder="e.g., Common Study Room, Warden Office, TV Room"
                  className="tactile-input w-full p-2.5 rounded-xl font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#0F293A] dark:text-[#F0F9FF] mb-1">
                    Corridor Arrangement
                  </label>
                  <select
                    value={currentSpec.corridorStyle}
                    onChange={(e) =>
                      updateCurrentSpec({
                        corridorStyle: e.target.value as FloorGenerationInput['corridorStyle'],
                      })
                    }
                    className="tactile-input w-full p-2.5 rounded-xl font-semibold"
                  >
                    <option value="central-corridor">Central Spine Corridor</option>
                    <option value="courtyard">Central Open Courtyard</option>
                    <option value="l-shaped">L-Shaped Wing Corridor</option>
                    <option value="single-wing">Single-Side Access Corridor</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-[#0F293A] dark:text-[#F0F9FF] mb-1">
                    Stairs & Entrances
                  </label>
                  <input
                    type="text"
                    value={currentSpec.stairsInfo}
                    onChange={(e) => updateCurrentSpec({ stairsInfo: e.target.value })}
                    placeholder="e.g., East Main Stairs"
                    className="tactile-input w-full p-2.5 rounded-xl font-medium"
                  />
                </div>
              </div>

              {/* Shared Facilities Checkboxes */}
              <div>
                <label className="block font-bold text-[#0F293A] dark:text-[#F0F9FF] mb-1.5">
                  Shared Facilities on Floor {currentFloorMap.floorNumber}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {SHARED_FACILITY_OPTIONS.map((fac) => {
                    const active = (currentSpec.sharedFacilities || []).includes(fac);
                    return (
                      <button
                        key={fac}
                        type="button"
                        onClick={() => {
                          const list = currentSpec.sharedFacilities || [];
                          const next = active
                            ? list.filter((item) => item !== fac)
                            : [...list, fac];
                          updateCurrentSpec({ sharedFacilities: next });
                        }}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                          active
                            ? 'tactile-btn-primary'
                            : 'tactile-btn-beige opacity-80'
                        }`}
                      >
                        {active ? `✓ ${fac}` : `+ ${fac}`}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  disabled={isGeneratingAi}
                  onClick={handleGenerateFloorWithAi}
                  className="tactile-btn-primary w-full py-3 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 min-h-[44px]"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {isGeneratingAi
                      ? 'Generating Schematic Map with AI...'
                      : `Generate Floor ${currentFloorMap.floorNumber} Schematic with AI`}
                  </span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isGeneratingAi}
                    onClick={handleGenerateAllFloorsInBuilding}
                    className="tactile-btn-beige py-2.5 px-3 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5"
                  >
                    <Wand2 className="w-3.5 h-3.5 text-[#0E7490] dark:text-cyan-300" />
                    <span>Generate All Floors</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleManualFallbackReset}
                    className="tactile-btn-beige py-2.5 px-3 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-[#0E7490] dark:text-cyan-300" />
                    <span>Manual Grid Fallback</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Interactive Schematic Map Canvas, AI Co-Pilot & Room Inspector (7 cols) */}
          <div className="lg:col-span-7 space-y-5">
            {/* Natural-Language AI Co-Pilot Card ("Ask AI to do the work") */}
            <div className="tactile-card rounded-2xl p-5 space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg relevo-well flex items-center justify-center text-cyan-200">
                    <Wand2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-sm text-[#0F293A] dark:text-[#F0F9FF]">
                      AI Map Co-Pilot — Ask AI to Adjust This Floor
                    </h3>
                    <p className="text-[11px] text-[#476778] dark:text-[#94B8CC]">
                      Describe any change in plain English and let AI add, rename, or rearrange rooms and facilities for you.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={aiCoPilotPrompt}
                  onChange={(e) => setAiCoPilotPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleExecuteAiCoPilot();
                    }
                  }}
                  placeholder='e.g., "Add a Reading Lounge in the bottom wing and rename Room 101 to Warden Office"'
                  className="tactile-input flex-1 p-3 rounded-xl text-xs font-medium"
                />
                <button
                  type="button"
                  disabled={isRunningCoPilot || !aiCoPilotPrompt.trim()}
                  onClick={() => handleExecuteAiCoPilot()}
                  className="tactile-btn-primary px-5 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shrink-0 disabled:opacity-40 min-h-[42px]"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{isRunningCoPilot ? 'Applying...' : 'Ask AI to Edit'}</span>
                </button>
              </div>

              {/* Quick AI Co-Pilot Action Chips */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  'Add a Reading Room in the bottom wing',
                  'Rename Room ' + currentFloorMap.floorNumber + '01 to Warden Office',
                  'Convert central corridor to an open courtyard',
                  'Add a Pantry near the left wing',
                ].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    disabled={isRunningCoPilot}
                    onClick={() => handleExecuteAiCoPilot(chip)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#E0F2F7]/80 dark:bg-[#0E7490]/25 text-[#0E7490] dark:text-cyan-200 hover:bg-[#0E7490] hover:text-white transition-colors"
                  >
                    ✨ {chip}
                  </button>
                ))}
              </div>
            </div>

            {/* Interactive Editable SVG Schematic Canvas */}
            <div className="tactile-card rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display font-bold text-base text-[#0F293A] dark:text-[#F0F9FF] flex items-center gap-2">
                    <span>
                      {currentBuilding.name} · Floor {currentFloorMap.floorNumber} Schematic Canvas
                    </span>
                  </h3>
                  <p className="text-[11px] text-[#476778] dark:text-[#94B8CC]">
                    Click any room to inspect or rename it, or drag rooms directly on the canvas to reposition. Dashed borders indicate AI-assumed placements.
                  </p>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleAddManualZone('room')}
                    className="tactile-btn-beige px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Room</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddManualZone('common')}
                    className="tactile-btn-beige px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Common / Facility</span>
                  </button>
                </div>
              </div>

              {/* Editable Schematic SVG */}
              <div className="rounded-2xl overflow-hidden tactile-inset p-1.5 select-none">
                <div className="rounded-xl overflow-hidden bg-[#F5FAFC] dark:bg-[#0D1F2D] border border-[#0E7490]/20">
                  <svg
                    ref={editorSvgRef}
                    viewBox="0 0 1000 500"
                    className="w-full h-auto block cursor-default"
                    onPointerMove={handleSvgPointerMove}
                    onPointerUp={handleSvgPointerUp}
                    onPointerLeave={handleSvgPointerUp}
                    onClick={() => setSelectedZoneId(null)}
                  >
                    <defs>
                      <pattern id="editorGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                        <path
                          d="M 20 0 L 0 0 0 20"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="0.6"
                          className="text-[#0E7490]/15 dark:text-sky-400/10"
                        />
                      </pattern>
                    </defs>

                    <rect width="1000" height="500" fill="url(#editorGrid)" />
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

                    {[...currentFloorMap.zones]
                      .sort((a, b) => (a.zoneKind === 'corridor' ? -1 : b.zoneKind === 'corridor' ? 1 : 0))
                      .map((zone) => {
                        const isSelected = selectedZoneId === zone.id;
                        const x = (zone.bounds.minX / 100) * 1000;
                        const y = (zone.bounds.minY / 100) * 500;
                        const width = Math.max(36, ((zone.bounds.maxX - zone.bounds.minX) / 100) * 1000);
                        const height = Math.max(28, ((zone.bounds.maxY - zone.bounds.minY) / 100) * 500);
                        const cx = x + width / 2;
                        const cy = y + height / 2;

                        let fillClass =
                          'fill-white dark:fill-[#132C3E] stroke-[#0E7490]/40 dark:stroke-cyan-500/40';
                        if (isSelected) {
                          fillClass =
                            'fill-[#0E7490] dark:fill-[#0891B2] stroke-[#0F293A] dark:stroke-white';
                        } else if (zone.zoneKind === 'corridor') {
                          fillClass =
                            'fill-[#E6F4F8]/70 dark:fill-[#0B1C29]/85 stroke-[#0E7490]/25 dark:stroke-cyan-500/25';
                        } else if (zone.type === 'common') {
                          fillClass =
                            'fill-[#E0F2F7]/80 dark:fill-[#0F2435] stroke-[#0E7490]/35 dark:stroke-cyan-500/35';
                        }

                        return (
                          <g
                            key={zone.id}
                            className="cursor-move"
                            onPointerDown={(e) => handleSvgPointerDown(e, zone)}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <rect
                              x={x}
                              y={y}
                              width={width}
                              height={height}
                              rx="8"
                              strokeDasharray={zone.isAssumed ? '6 3' : undefined}
                              strokeWidth={isSelected ? 3 : 1.5}
                              className={fillClass}
                            />

                            <text
                              x={cx}
                              y={cy - (zone.isAssumed ? 4 : 0)}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fontSize={width < 95 ? 10.5 : 13}
                              className={`font-semibold select-none pointer-events-none ${
                                isSelected ? 'fill-white' : 'fill-[#0F293A] dark:fill-[#F0F9FF]'
                              }`}
                            >
                              {zone.label}
                            </text>

                            {zone.isAssumed && (
                              <text
                                x={cx}
                                y={cy + 12}
                                textAnchor="middle"
                                className={`text-[9px] font-mono-tech font-bold uppercase select-none pointer-events-none ${
                                  isSelected
                                    ? 'fill-amber-200'
                                    : 'fill-amber-700 dark:fill-amber-300'
                                }`}
                              >
                                [Assumed]
                              </text>
                            )}
                          </g>
                        );
                      })}
                  </svg>
                </div>
              </div>

              {/* Selected Zone Manual Inspector Bar */}
              {selectedZone ? (
                <div className="p-4 rounded-xl tactile-surface-elevated space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-[#0F293A] dark:text-[#F0F9FF]">
                      <Move className="w-4 h-4 text-[#0E7490]" />
                      <span>Editing Zone: {selectedZone.label}</span>
                      <span className="font-mono-tech text-[11px] text-[#476778] dark:text-[#94B8CC]">
                        ({selectedZone.code})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleDeleteSelectedZone}
                      className="text-red-600 dark:text-red-400 hover:underline flex items-center gap-1 font-bold"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Zone</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="col-span-2">
                      <label className="block font-semibold mb-1">Room / Area Label</label>
                      <input
                        type="text"
                        value={selectedZone.label}
                        onChange={(e) =>
                          handleUpdateSelectedZone({ label: e.target.value, isAssumed: false })
                        }
                        className="tactile-input w-full p-2 rounded-lg font-bold"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold mb-1">Zone Type</label>
                      <select
                        value={selectedZone.zoneKind || selectedZone.type}
                        onChange={(e) => {
                          const kind = e.target.value as ZoneKind;
                          handleUpdateSelectedZone({
                            zoneKind: kind,
                            type: kind === 'room' ? 'room' : 'common',
                          });
                        }}
                        className="tactile-input w-full p-2 rounded-lg font-semibold"
                      >
                        <option value="room">Student Room</option>
                        <option value="common">Common Area</option>
                        <option value="corridor">Corridor / Courtyard</option>
                        <option value="stairs">Stairs</option>
                        <option value="entrance">Entrance / Lobby</option>
                        <option value="washroom">Washroom</option>
                        <option value="utility">Water / Wi-Fi / Utility</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold mb-1">Location Code</label>
                      <input
                        type="text"
                        value={selectedZone.code}
                        onChange={(e) =>
                          handleUpdateSelectedZone({ code: e.target.value.toUpperCase() })
                        }
                        className="tactile-input w-full p-2 rounded-lg font-mono-tech font-bold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 pt-1">
                    <div>
                      <label className="block text-[10px] font-mono-tech uppercase">X Pos (%)</label>
                      <input
                        type="number"
                        min={2}
                        max={90}
                        value={Math.round(selectedZone.bounds.minX)}
                        onChange={(e) => handleUpdateSelectedZone({ minX: Number(e.target.value) })}
                        className="tactile-input w-full p-1.5 rounded-lg font-mono-tech"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-mono-tech uppercase">Y Pos (%)</label>
                      <input
                        type="number"
                        min={4}
                        max={86}
                        value={Math.round(selectedZone.bounds.minY)}
                        onChange={(e) => handleUpdateSelectedZone({ minY: Number(e.target.value) })}
                        className="tactile-input w-full p-1.5 rounded-lg font-mono-tech"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-mono-tech uppercase">Width (%)</label>
                      <input
                        type="number"
                        min={6}
                        max={90}
                        value={Math.round(selectedZone.bounds.maxX - selectedZone.bounds.minX)}
                        onChange={(e) => handleUpdateSelectedZone({ width: Number(e.target.value) })}
                        className="tactile-input w-full p-1.5 rounded-lg font-mono-tech"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-mono-tech uppercase">Height (%)</label>
                      <input
                        type="number"
                        min={10}
                        max={88}
                        value={Math.round(selectedZone.bounds.maxY - selectedZone.bounds.minY)}
                        onChange={(e) => handleUpdateSelectedZone({ height: Number(e.target.value) })}
                        className="tactile-input w-full p-1.5 rounded-lg font-mono-tech"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl tactile-inset text-xs text-[#476778] dark:text-[#94B8CC] flex items-center gap-2">
                  <Info className="w-4 h-4 text-[#0E7490] shrink-0" />
                  <span>
                    Tip: Click any room or facility box on the map above to rename, resize, or drag it, or use the AI Co-Pilot prompt bar above.
                  </span>
                </div>
              )}

              {/* Assumed Layout & Schematic Representation Notice */}
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2 text-xs">
                <div className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Assumed Layout & Schematic Representation Notice</span>
                </div>
                <p className="text-[11px] text-amber-900/90 dark:text-amber-200/90">
                  This generated map is a rough schematic representation for complaint pin-pointing, not a scale architectural blueprint. Zones with dashed borders are assumed placements:
                </p>
                <ul className="list-disc list-inside text-[11px] text-amber-900/85 dark:text-amber-200/85 space-y-1">
                  {(currentFloorMap.assumptions || []).map((assump, i) => (
                    <li key={i}>{assump}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="tactile-btn-beige px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 min-h-[42px]"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Buildings</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  await handleSaveDraft(4);
                  setStep(4);
                }}
                className="tactile-btn-primary px-6 py-3 rounded-xl text-xs font-bold flex items-center gap-2 min-h-[44px]"
              >
                <span>Preview & Publish Campus Portal</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          STEP 4: INTERACTIVE PORTAL PREVIEW & EXPLICIT ADMIN PUBLISH
         ===================================================================== */}
      {step === 4 && currentBuilding && currentFloorMap && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Readiness Summary & Publish Confirmation (5 cols) */}
            <div className="lg:col-span-5 space-y-5">
              <div className="tactile-card rounded-2xl p-6 space-y-4 text-xs">
                <div className="flex items-center gap-2.5 pb-3 border-b border-[#0E7490]/15 dark:border-sky-400/15">
                  <div className="w-9 h-9 rounded-xl relevo-well flex items-center justify-center text-white">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-display font-bold text-base text-[#0F293A] dark:text-[#F0F9FF]">
                      Campus Portal Readiness Summary
                    </h2>
                    <p className="text-[11px] text-[#476778] dark:text-[#94B8CC]">
                      Review your institute portal configuration before publishing.
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div className="flex justify-between py-1.5 border-b border-[#0E7490]/10">
                    <span className="text-[#476778] dark:text-[#94B8CC]">Institute Name</span>
                    <span className="font-bold text-[#0F293A] dark:text-[#F0F9FF] text-right">
                      {instituteName || campus.name}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-[#0E7490]/10">
                    <span className="text-[#476778] dark:text-[#94B8CC]">Campus Invite Code</span>
                    <span className="font-mono-tech font-bold text-[#0E7490] dark:text-cyan-300">
                      {campusCode || campus.code}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-[#0E7490]/10">
                    <span className="text-[#476778] dark:text-[#94B8CC]">Matched Domains</span>
                    <span className="font-mono-tech font-semibold text-[#0F293A] dark:text-[#F0F9FF]">
                      {domainsInput.trim() || 'Code / Selector Join'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-[#0E7490]/10">
                    <span className="text-[#476778] dark:text-[#94B8CC]">Buildings & Floors</span>
                    <span className="font-mono-tech font-bold text-[#0F293A] dark:text-[#F0F9FF]">
                      {buildings.length} Buildings · {totalFloorsCount} Floors
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-[#476778] dark:text-[#94B8CC]">Total Mapped Zones</span>
                    <span className="font-mono-tech font-bold text-[#0F293A] dark:text-[#F0F9FF]">
                      {totalZonesCount} Rooms & Common Areas
                    </span>
                  </div>
                </div>

                {isAlreadyPublished && (
                  <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/25 text-[11px] text-[#0F293A] dark:text-[#CBE4F2] space-y-1">
                    <div className="font-bold">Safe Map Update Guarantee</div>
                    <p>
                      Publishing an updated layout increments the campus map to{' '}
                      <span className="font-mono-tech font-bold">v{(campus.version || 1) + 1}</span>. All existing complaints preserve their original location snapshot and pin coordinates.
                    </p>
                  </div>
                )}

                {/* Explicit Admin Confirmation Checkbox */}
                <label className="flex items-start gap-3 p-3.5 rounded-xl tactile-inset cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmCheckbox}
                    onChange={(e) => setConfirmCheckbox(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[#0E7490] rounded"
                  />
                  <span className="text-xs font-semibold text-[#0F293A] dark:text-[#F0F9FF] leading-relaxed">
                    I have previewed the schematic floor maps and explicitly confirm publishing this dedicated campus portal for authorized students and staff.
                  </span>
                </label>

                <button
                  type="button"
                  disabled={!confirmCheckbox || isPublishing}
                  onClick={handleConfirmPublish}
                  className="tactile-btn-primary w-full py-3.5 px-5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 min-h-[48px]"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {isPublishing
                      ? 'Publishing Campus Portal...'
                      : isAlreadyPublished
                      ? `Confirm & Publish Map Update (v${(campus.version || 1) + 1})`
                      : 'Confirm & Publish Campus Portal'}
                  </span>
                </button>
              </div>
            </div>

            {/* Right Interactive Student Pin-Placement Preview (7 cols) */}
            <div className="lg:col-span-7 space-y-4">
              <div className="tactile-card rounded-2xl p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display font-bold text-base text-[#0F293A] dark:text-[#F0F9FF]">
                      Student Complaint Map Preview
                    </h3>
                    <p className="text-xs text-[#476778] dark:text-[#94B8CC]">
                      Test how students will select a building, floor, and tap a room or place a pin when reporting a complaint.
                    </p>
                  </div>
                </div>

                {/* Building & Floor Switcher */}
                <div className="flex flex-wrap items-center gap-2">
                  {buildings.map((b, bIdx) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        setActiveBuildingIdx(bIdx);
                        setActiveFloorNum(b.floors[0]?.floorNumber || 1);
                        setPreviewPin(null);
                        setPreviewSelectedZone(null);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold ${
                        bIdx === activeBuildingIdx ? 'tactile-btn-primary' : 'tactile-btn-beige'
                      }`}
                    >
                      {b.name}
                    </button>
                  ))}

                  <span className="text-[#476778] mx-1">·</span>

                  {currentBuilding.floors.map((fl) => (
                    <button
                      key={fl.floorNumber}
                      type="button"
                      onClick={() => {
                        setActiveFloorNum(fl.floorNumber);
                        setPreviewPin(null);
                        setPreviewSelectedZone(null);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-mono-tech font-bold ${
                        fl.floorNumber === activeFloorNum
                          ? 'tactile-btn-primary'
                          : 'tactile-btn-beige'
                      }`}
                    >
                      Floor {fl.floorNumber}
                    </button>
                  ))}
                </div>

                <InteractiveFloorBlueprint
                  hostel={currentBuilding.name}
                  floor={currentFloorMap.floorNumber}
                  zones={currentFloorMap.zones}
                  selectedZone={previewSelectedZone}
                  pin={previewPin}
                  showAssumedBadges={true}
                  onPinSelect={(zone, px, py) => {
                    setPreviewSelectedZone(zone);
                    setPreviewPin({ x: px, y: py });
                  }}
                />

                {previewSelectedZone && (
                  <div className="p-3.5 rounded-xl tactile-surface-elevated flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-[#0E7490]" />
                      <span className="font-bold text-[#0F293A] dark:text-[#F0F9FF]">
                        Test Pin Selected: {currentBuilding.name} · Floor {currentFloorMap.floorNumber} · {previewSelectedZone.label}
                      </span>
                    </div>
                    <span className="font-mono-tech text-[11px] font-bold text-[#0E7490] dark:text-cyan-300">
                      {previewSelectedZone.code} ({previewPin?.x}%, {previewPin?.y}%)
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
