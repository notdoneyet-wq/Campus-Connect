import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Camera,
  Image as ImageIcon,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  X,
  HelpCircle,
  Shield,
  MapPin,
} from 'lucide-react';
import {
  CampusOrganization,
  Category,
  GeminiIntakeResult,
  SafetyFlag,
  Ticket,
  Urgency,
  UserProfile,
} from '../../types';
import {
  CampusZone,
  createDefaultDemoCampus,
  FloorNumber,
  getActiveCampusCache,
  getFloorZones,
  HostelName,
} from '../../data/campus';
import {
  getDepartmentForCategory,
  getSubteamsForCategory,
  ROUTING_GUIDE,
} from '../../data/routingGuide';
import {
  Language,
  translateCategory,
  translateHostel,
  translateRoomLabel,
  translateSafetyFlag,
  translateSubtype,
  useT,
} from '../../data/i18n';
import { compressImage } from '../../utils/imageCompress';
import { analyzeIntakeComplaint, compareDuplicateTickets } from '../../services/gemini';
import {
  createTicket,
  getNextTicketId,
  fetchTickets,
  fetchMyCampus,
  saveDuplicateCandidate,
} from '../../services/db';
import { calculateSlaDueAt, enforceSafetyUrgency } from '../../utils/sla';
import { InteractiveFloorBlueprint } from './InteractiveFloorBlueprint';

interface ReportWizardProps {
  currentUser: UserProfile;
  language: Language;
  onTicketSubmitted: (ticketId: string) => void;
  onCancel?: () => void;
}

export const ReportWizard: React.FC<ReportWizardProps> = ({
  currentUser,
  language,
  onTicketSubmitted,
  onCancel,
}) => {
  const { t } = useT();
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Unique idempotency key per complaint draft to prevent duplicate ticket IDs on retries
  const [draftIdempotencyKey, setDraftIdempotencyKey] = useState<string>(
    () => `idem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );

  // Step 1: Description & Voice
  const [description, setDescription] = useState('');
  const [isListening, setIsListening] = useState(false);
  const speechRecognitionRef = useRef<any>(null);

  // Step 2: Location (Dynamic Campus Buildings & Floors)
  const [activeCampus, setActiveCampus] = useState<CampusOrganization>(
    () => getActiveCampusCache() || createDefaultDemoCampus()
  );
  const [selectedHostel, setSelectedHostel] = useState<HostelName>(
    currentUser.hostel || activeCampus.buildings?.[0]?.name || 'Hostel 1'
  );
  const [selectedFloor, setSelectedFloor] = useState<FloorNumber>(1);
  const [selectedZone, setSelectedZone] = useState<CampusZone | null>(null);
  const [pin, setPin] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchMyCampus(currentUser).then((c) => {
      if (!mounted || !c) return;
      setActiveCampus(c);
      const bNames = (c.buildings || []).map((b) => b.name);
      if (bNames.length > 0 && !bNames.includes(String(selectedHostel))) {
        setSelectedHostel(bNames[0]);
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
  const activeBuildingObj =
    campusBuildings.find((b) => b.name === selectedHostel) || campusBuildings[0];
  const availableFloors: number[] =
    activeBuildingObj && activeBuildingObj.floors.length > 0
      ? activeBuildingObj.floors.map((f) => f.floorNumber)
      : [1, 2, 3];

  // Step 3: Photo
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const fileCameraInputRef = useRef<HTMLInputElement>(null);
  const fileGalleryInputRef = useRef<HTMLInputElement>(null);

  // Step 4: AI Review & Validation
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<GeminiIntakeResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isManualFallback, setIsManualFallback] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Editable fields in preview
  const [title, setTitle] = useState('');
  const [summaryEn, setSummaryEn] = useState('');
  const [category, setCategory] = useState<Category>('plumbing');
  const [subtype, setSubtype] = useState<string>('Water Supply');
  const [urgency, setUrgency] = useState<Urgency>('medium');
  const [safetyFlags, setSafetyFlags] = useState<SafetyFlag[]>(['none']);

  // Missing-info loop answer input
  const [missingAnswer, setMissingAnswer] = useState('');

  // Step 5: Success state
  const [createdTicketNumber, setCreatedTicketNumber] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const suggestionChips = [
    t('suggestionChip1'),
    t('suggestionChip2'),
    t('suggestionChip3'),
    t('suggestionChip4'),
  ];

  // Setup Web Speech API
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = language === 'hi' ? 'hi-IN' : 'en-IN';

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setDescription((prev) => (prev ? `${prev} ${transcript}` : transcript));
        setIsListening(false);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      speechRecognitionRef.current = recognition;
    }
  }, [language]);

  const toggleVoiceRecording = () => {
    if (!speechRecognitionRef.current) {
      setSubmitError(t('speechNotSupported'));
      return;
    }

    if (isListening) {
      speechRecognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        speechRecognitionRef.current.lang = language === 'hi' ? 'hi-IN' : 'en-IN';
        speechRecognitionRef.current.start();
        setIsListening(true);
      } catch {
        setIsListening(false);
      }
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setSubmitError(t('selectValidPhoto'));
      return;
    }

    try {
      setIsCompressing(true);
      const { base64 } = await compressImage(file, 1280, 0.75);
      setPhotoBase64(base64);
    } catch (err: any) {
      setSubmitError(`${t('photoCompressionError')}: ${err.message || ''}`);
    } finally {
      setIsCompressing(false);
      e.target.value = '';
    }
  };

  const handleAnalyze = async () => {
    if (!description.trim()) {
      setStep(1);
      return;
    }

    setIsAnalyzing(true);
    setAiError(null);
    setSubmitError(null);

    const locationContext = selectedZone
      ? {
          hostel: selectedHostel,
          floor: selectedFloor,
          room: selectedZone.label,
        }
      : null;

    try {
      const result = await analyzeIntakeComplaint({
        rawText: description,
        userLanguage: language,
        selectedLocation: locationContext,
        imageBase64: photoBase64,
      });

      setAiResult(result);
      setTitle(result.title);
      setSummaryEn(result.summary_en);

      const cat = result.category !== 'unclear' ? result.category : 'plumbing';
      setCategory(cat);

      const subteams = getSubteamsForCategory(cat);
      setSubtype(
        result.subtype && subteams.includes(result.subtype)
          ? result.subtype
          : subteams[0] || 'General'
      );

      const enforced = enforceSafetyUrgency(result.urgency_suggestion, result.safety_flags);
      setUrgency(enforced);
      setSafetyFlags(result.safety_flags);

      if (result.suggested_location && !selectedZone) {
        const floorMatch = result.suggested_location.match(/floor\s*([123])/i);
        if (floorMatch) {
          setSelectedFloor(parseInt(floorMatch[1], 10) as FloorNumber);
        }
      }

      setIsManualFallback(false);
    } catch (err: any) {
      console.warn('Gemini intake analysis failed:', err);
      setAiError(t('manualEntryTitle'));
      setIsManualFallback(true);

      setTitle(description.slice(0, 50));
      setSummaryEn(description);
      setCategory('plumbing');
      setSubtype('Water Supply');
      setUrgency('medium');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Answer follow-up question and re-run Gemini analysis
  const handleAnswerFollowUp = async () => {
    if (!missingAnswer.trim()) return;
    const combined = `${description}. ${missingAnswer.trim()}`;
    setDescription(combined);
    setMissingAnswer('');

    setIsAnalyzing(true);
    try {
      const locationContext = selectedZone
        ? {
            hostel: selectedHostel,
            floor: selectedFloor,
            room: selectedZone.label,
          }
        : null;

      const result = await analyzeIntakeComplaint({
        rawText: combined,
        userLanguage: language,
        selectedLocation: locationContext,
        imageBase64: photoBase64,
      });

      setAiResult(result);
      setTitle(result.title);
      setSummaryEn(result.summary_en);
      if (result.category !== 'unclear') {
        setCategory(result.category);
        const subteams = getSubteamsForCategory(result.category);
        setSubtype(
          result.subtype && subteams.includes(result.subtype)
            ? result.subtype
            : subteams[0] || 'General'
        );
      }
      setUrgency(enforceSafetyUrgency(result.urgency_suggestion, result.safety_flags));
      setSafetyFlags(result.safety_flags);
    } catch (err) {
      console.warn('Re-analyze failed, continuing with manual edit:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFinalSubmit = async () => {
    setSubmitError(null);

    if (!description.trim() || !selectedZone || category === 'unclear') {
      setSubmitError(t('ensureFieldsCompleted'));
      return;
    }

    if (aiResult && aiResult.missing_fields && aiResult.missing_fields.length > 0) {
      const stillMissing = aiResult.missing_fields.filter((field) => {
        if (field === 'issue') return !description.trim();
        if (field === 'hostel') return !selectedHostel;
        if (field === 'floor') return !selectedFloor;
        if (field === 'room') return !selectedZone;
        if (field === 'category') return false;
        return false;
      });

      if (stillMissing.length > 0) {
        setSubmitError(`${t('provideMissingFields')}: ${stillMissing.join(', ')}`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const ticketId = await getNextTicketId(draftIdempotencyKey);
      const departmentId = getDepartmentForCategory(category);
      const effectiveUrgency = enforceSafetyUrgency(urgency, safetyFlags);
      const now = Date.now();
      const slaDueAt = calculateSlaDueAt(now, effectiveUrgency);

      const finalPinX = pin?.x ?? selectedZone.center.x;
      const finalPinY = pin?.y ?? selectedZone.center.y;
      const campusId = currentUser.campusId || activeCampus.id;
      const mapVersion = activeCampus.version || 1;

      const newTicket: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt'> = {
        ticketId,
        idempotencyKey: draftIdempotencyKey,
        campusId,
        buildingId: activeBuildingObj?.id || String(selectedHostel),
        mapVersion,
        locationSnapshot: {
          campusId,
          buildingId: activeBuildingObj?.id || String(selectedHostel),
          buildingName: String(selectedHostel),
          floor: Number(selectedFloor),
          floorLabel: `Floor ${selectedFloor}`,
          room: selectedZone.label,
          locationCode: selectedZone.code,
          pinX: finalPinX,
          pinY: finalPinY,
          mapVersion,
          capturedAt: now,
        },
        reporterId: currentUser?.uid || 'anon',
        reporters: [currentUser?.uid || 'anon'],
        rawText: description,
        language: language === 'hi' ? 'hi' : 'en',
        issue: description.slice(0, 300),
        title: title || `${category} issue in ${selectedZone.label}`,
        summaryEn: summaryEn || description,
        category,
        subtype,
        departmentId,
        urgency: effectiveUrgency,
        confidence: aiResult?.confidence || 0.85,
        photoBase64: photoBase64 || undefined,
        photoObservation: aiResult?.photo_observation || undefined,
        photoMatchesText: aiResult?.photo_matches_text || 'no_photo',
        safetyFlags,
        hostel: String(selectedHostel),
        floor: Number(selectedFloor),
        room: selectedZone.label,
        locationCode: selectedZone.code,
        pinX: finalPinX,
        pinY: finalPinY,
        status: 'Open',
        slaDueAt,
      };

      const created = await createTicket(newTicket);
      setCreatedTicketNumber(created.ticketId || ticketId);

      // Async background check for duplicate candidates
      setTimeout(async () => {
        try {
          const all = await fetchTickets();
          const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
          const candidates = all
            .filter(
              (tk) =>
                tk.id !== created.id &&
                tk.status !== 'Verified' &&
                tk.hostel === created.hostel &&
                tk.category === created.category &&
                tk.createdAt >= sevenDaysAgo &&
                Math.abs(tk.floor - created.floor) <= 1
            )
            .slice(0, 5);

          if (candidates.length > 0) {
            const comparisons = await compareDuplicateTickets(created, candidates, language);
            for (const comp of comparisons) {
              if (comp.verdict === 'identical' || comp.verdict === 'related') {
                await saveDuplicateCandidate({
                  ticketId: created.ticketId,
                  candidateId: comp.candidateId,
                  verdict: comp.verdict,
                  reason: comp.reason,
                  reviewState: 'pending',
                  departmentId: created.category !== 'unclear' ? created.category : undefined,
                });
              }
            }
          }
        } catch (e) {
          console.warn('Background duplicate search note:', e);
        }
      }, 500);

      setStep(5);
    } catch (err: any) {
      setSubmitError(`${t('submissionError')}: ${err.message || ''}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentDeptInfo = category !== 'unclear' ? ROUTING_GUIDE[category] : null;

  return (
    <div className="w-full max-w-3xl mx-auto pb-24">
      {/* Wizard Header & Recessed Progress Bar */}
      {step < 5 && (
        <div className="mb-6 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-extrabold text-[#1D3C50] dark:text-[#EFE7E1] uppercase tracking-widest">
            <span>
              {t('stepOf', { step, total: 4 })}: {t(`step${step}Title` as any)}
            </span>
            <span className="font-mono-tech">{step * 25}%</span>
          </div>
          <div className="w-full h-3 tactile-inset rounded-full overflow-hidden p-0.5">
            <div
              className="h-full bg-[#254E68] dark:bg-[#7A9BB2] rounded-full transition-all duration-300"
              style={{ width: `${step * 25}%` }}
            />
          </div>
        </div>
      )}

      {submitError && (
        <div
          role="alert"
          className="mb-4 p-4 rounded-xl bg-red-900/15 border-2 border-red-700/40 text-red-900 dark:text-red-200 text-xs font-bold flex items-center justify-between gap-2"
        >
          <span>{submitError}</span>
          <button
            type="button"
            onClick={() => setSubmitError(null)}
            className="text-red-800 dark:text-red-200 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* STEP 1: DESCRIBE */}
      {step === 1 && (
        <div className="space-y-5">
          <div className="tactile-card rounded-2xl p-6 sm:p-7 space-y-5">
            <div>
              <label className="block font-display text-lg font-extrabold deboss-heading">
                {t('step1Title')}
              </label>
              <p className="text-xs font-medium text-[#254E68] dark:text-[#D3C2B8]/85 mt-0.5">
                {t('speakOrTypeInstruction')}
              </p>
            </div>

            <div className="relative">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('describePlaceholder')}
                rows={4}
                className="tactile-input w-full p-4 rounded-xl text-sm font-medium resize-none"
              />
            </div>

            {/* Quick Suggestion Chips */}
            <div className="space-y-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#254E68] dark:text-[#D3C2B8] block">
                {t('quickSuggestionsLabel')}:
              </span>
              <div className="flex flex-wrap gap-2">
                {suggestionChips.map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setDescription(chip)}
                    className="tactile-btn-beige px-3.5 py-2 rounded-xl text-xs font-bold text-left"
                  >
                    + {chip}
                  </button>
                ))}
              </div>
            </div>

            {/* Voice Input Button */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-[#1D3C50]/15 dark:border-[#D3C2B8]/15">
              <button
                type="button"
                onClick={toggleVoiceRecording}
                className={`w-full sm:w-auto flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl text-sm font-bold min-h-[46px] ${
                  isListening
                    ? 'bg-red-700 text-white shadow-md'
                    : 'tactile-btn-steel'
                }`}
              >
                {isListening ? (
                  <>
                    <MicOff className="w-4 h-4" />
                    <span>{t('micStop')}</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" />
                    <span>{t('micStart')}</span>
                  </>
                )}
              </button>

              <span className="text-xs font-semibold text-[#254E68] dark:text-[#D3C2B8]/80">
                {isListening ? t('micListening') : t('webSpeechSupported')}
              </span>
            </div>
          </div>

          {/* Sticky Bottom Actions */}
          <div className="flex items-center justify-between pt-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="tactile-btn-beige px-5 py-2.5 rounded-xl text-sm font-bold min-h-[44px]"
              >
                {t('cancel')}
              </button>
            )}
            <button
              type="button"
              disabled={!description.trim()}
              onClick={() => setStep(2)}
              className="tactile-btn-primary ml-auto flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed min-h-[46px]"
            >
              <span>{t('next')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: LOCATION */}
      {step === 2 && (
        <div className="space-y-5">
          <div className="tactile-card rounded-2xl p-6 sm:p-7 space-y-5">
            <div>
              <h2 className="font-display text-lg font-extrabold deboss-heading">
                {t('step2Title')}
              </h2>
              <p className="text-xs font-medium text-[#254E68] dark:text-[#D3C2B8]/85 mt-1">
                {t('tapBlueprintInstructions')}
              </p>
            </div>

            {/* Building / Hostel Selection */}
            <div>
              <label className="block text-xs font-extrabold text-[#254E68] dark:text-[#D3C2B8] uppercase tracking-wider mb-2">
                {t('chooseHostel')}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {campusBuildings.map((b) => {
                  const h = b.name;
                  const isSelected = selectedHostel === h;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        setSelectedHostel(h);
                        setSelectedFloor(b.floors[0]?.floorNumber || 1);
                        setSelectedZone(null);
                        setPin(null);
                      }}
                      className={`p-4 rounded-xl text-left transition-all min-h-[60px] ${
                        isSelected
                          ? 'tactile-btn-primary'
                          : 'tactile-btn-beige'
                      }`}
                    >
                      <div className="flex items-center justify-between font-display font-bold text-sm">
                        <span>{translateHostel(h, language)}</span>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-[#D3C2B8] shrink-0" />}
                      </div>
                      <span className={`text-[11px] font-mono-tech ${isSelected ? 'text-[#D3C2B8]' : 'text-[#254E68] dark:text-[#D3C2B8]/80'}`}>
                        Code: {b.code} · {b.floors.length} {b.floors.length === 1 ? 'Floor' : 'Floors'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Floor Selection */}
            <div>
              <label className="block text-xs font-extrabold text-[#254E68] dark:text-[#D3C2B8] uppercase tracking-wider mb-2">
                {t('chooseFloor')}
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {availableFloors.map((fl) => {
                  const isSelected = Number(selectedFloor) === Number(fl);
                  return (
                    <button
                      key={fl}
                      type="button"
                      onClick={() => {
                        setSelectedFloor(fl);
                        setSelectedZone(null);
                        setPin(null);
                      }}
                      className={`py-2.5 px-3 rounded-xl text-sm font-bold min-h-[44px] ${
                        isSelected
                          ? 'tactile-btn-primary'
                          : 'tactile-btn-beige'
                      }`}
                    >
                      {t('floorLabel', { floor: fl })}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Interactive SVG Blueprint */}
            <div className="pt-2 space-y-3">
              <InteractiveFloorBlueprint
                hostel={selectedHostel}
                floor={selectedFloor}
                campus={activeCampus}
                selectedZone={selectedZone}
                pin={pin}
                onPinSelect={(zone, px, py) => {
                  setSelectedZone(zone);
                  setPin({ x: px, y: py });
                }}
              />

              {/* Selected Zone Confirmation and Dropdown Correction */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl tactile-surface-elevated">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#254E68] dark:text-[#D3C2B8]" />
                  <span className="text-xs font-bold text-[#254E68] dark:text-[#D3C2B8]">
                    {t('selectedZone')}:
                  </span>
                  <span className="text-sm font-extrabold text-[#1D3C50] dark:text-[#EFE7E1]">
                    {selectedZone
                      ? `${translateHostel(String(selectedHostel), language)} · ${t('floorLabel', { floor: selectedFloor })} · ${translateRoomLabel(selectedZone.label, language)}`
                      : t('noneTapMapAbove')}
                  </span>
                </div>

                {/* Dropdown to correct room */}
                <div className="flex items-center gap-2">
                  <label htmlFor="room-override" className="text-xs font-bold text-[#254E68] dark:text-[#D3C2B8] whitespace-nowrap">
                    {t('correctRoom')}:
                  </label>
                  <select
                    id="room-override"
                    value={selectedZone?.id || ''}
                    onChange={(e) => {
                      const zones = getFloorZones(selectedHostel, selectedFloor, activeCampus);
                      const target = zones.find((z) => z.id === e.target.value);
                      if (target) {
                        setSelectedZone(target);
                        setPin({ x: target.center.x, y: target.center.y });
                      }
                    }}
                    className="tactile-input text-xs p-2 rounded-lg font-bold"
                  >
                    <option value="" disabled>
                      {t('selectRoomArea')}
                    </option>
                    {getFloorZones(selectedHostel, selectedFloor, activeCampus).map((z) => (
                      <option key={z.id} value={z.id}>
                        {translateRoomLabel(z.label, language)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Sticky Bottom Actions */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="tactile-btn-beige flex items-center gap-1.5 px-5 py-3 rounded-xl text-sm font-bold min-h-[44px]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t('back')}</span>
            </button>
            <button
              type="button"
              disabled={!selectedZone}
              onClick={() => setStep(3)}
              className="tactile-btn-primary flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed min-h-[46px]"
            >
              <span>{t('next')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: PHOTO */}
      {step === 3 && (
        <div className="space-y-5">
          <div className="tactile-card rounded-2xl p-6 sm:p-7 space-y-5">
            <div>
              <h2 className="font-display text-lg font-extrabold deboss-heading">
                {t('step3Title')}
              </h2>
              <p className="text-xs font-medium text-[#254E68] dark:text-[#D3C2B8]/85 mt-1">
                {t('photoHelpsDesc')}
              </p>
            </div>

            <input
              type="file"
              ref={fileCameraInputRef}
              accept="image/*"
              capture="environment"
              onChange={handlePhotoUpload}
              className="hidden"
            />
            <input
              type="file"
              ref={fileGalleryInputRef}
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
            />

            {!photoBase64 ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => fileCameraInputRef.current?.click()}
                    disabled={isCompressing}
                    className="tactile-surface-elevated hover:border-[#254E68] flex flex-col items-center justify-center p-7 rounded-2xl border-2 border-dashed border-[#466981]/50 transition-all gap-2.5 min-h-[140px]"
                  >
                    <div className="p-3.5 relevo-well rounded-2xl text-[#D3C2B8]">
                      <Camera className="w-6 h-6" />
                    </div>
                    <span className="text-sm font-display font-bold text-[#1D3C50] dark:text-[#EFE7E1]">{t('takePhoto')}</span>
                    <span className="text-[11px] font-medium text-[#254E68] dark:text-[#D3C2B8]/80">{t('directPhoneCamera')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileGalleryInputRef.current?.click()}
                    disabled={isCompressing}
                    className="tactile-surface-elevated hover:border-[#254E68] flex flex-col items-center justify-center p-7 rounded-2xl border-2 border-dashed border-[#466981]/50 transition-all gap-2.5 min-h-[140px]"
                  >
                    <div className="p-3.5 relevo-well rounded-2xl text-[#D3C2B8]">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                    <span className="text-sm font-display font-bold text-[#1D3C50] dark:text-[#EFE7E1]">{t('chooseGallery')}</span>
                    <span className="text-[11px] font-medium text-[#254E68] dark:text-[#D3C2B8]/80">{t('fromPhotosFiles')}</span>
                  </button>
                </div>
                {isCompressing && (
                  <div className="text-center text-xs text-[#254E68] dark:text-[#D3C2B8] font-bold">
                    {t('compressing')}
                  </div>
                )}
              </div>
            ) : (
              <div className="relative rounded-2xl overflow-hidden tactile-inset p-2 max-h-80 flex items-center justify-center">
                <img
                  src={photoBase64}
                  alt="Captured complaint preview"
                  className="w-full h-auto max-h-72 object-contain rounded-xl"
                />
                <button
                  type="button"
                  onClick={() => setPhotoBase64(null)}
                  className="tactile-btn-primary absolute top-4 right-4 p-2 rounded-full"
                  title={t('removePhoto')}
                  aria-label={t('removePhoto')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Sticky Bottom Actions */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="tactile-btn-beige flex items-center gap-1.5 px-5 py-3 rounded-xl text-sm font-bold min-h-[44px]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t('back')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setStep(4);
                handleAnalyze();
              }}
              className="tactile-btn-primary flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-bold min-h-[46px]"
            >
              <Sparkles className="w-4 h-4 text-[#D3C2B8]" />
              <span>{t('next')}</span>
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: AI REVIEW & SUBMIT */}
      {step === 4 && (
        <div className="space-y-5">
          {isAnalyzing && (
            <div className="tactile-card rounded-2xl p-10 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl relevo-well text-[#D3C2B8] mx-auto flex items-center justify-center animate-spin">
                <Sparkles className="w-7 h-7" />
              </div>
              <h3 className="font-display font-extrabold text-lg deboss-heading">
                {t('analyzingAI')}
              </h3>
              <p className="text-xs font-medium text-[#254E68] dark:text-[#D3C2B8]/85 max-w-sm mx-auto">
                {t('analyzingDesc')}
              </p>
            </div>
          )}

          {!isAnalyzing && (
            <div className="space-y-5">
              {isManualFallback && (
                <div className="p-4 rounded-xl tactile-surface-elevated border-l-4 border-l-amber-600 text-xs flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 shrink-0 text-amber-700" />
                  <div>
                    <div className="font-bold">{aiError || t('manualEntryTitle')}</div>
                    <p>{t('typedDescriptionSafe')}</p>
                  </div>
                </div>
              )}

              {/* CampusShield Safety Flag Banner */}
              {safetyFlags.some((f) => f !== 'none') && (
                <div className="p-4 rounded-xl bg-red-900/15 border-2 border-red-700/40 text-red-950 dark:text-red-200 space-y-1">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <Shield className="w-4 h-4 text-red-700 dark:text-red-400" />
                    <span>{t('safetyBannerTitle')}</span>
                  </div>
                  <p className="text-xs font-medium">
                    {t('highSafetyPriorityFlagged')} (
                    {safetyFlags
                      .filter((f) => f !== 'none')
                      .map((f) => translateSafetyFlag(f, language))
                      .join(', ')}
                    )
                  </p>
                </div>
              )}

              {/* Photo Conflict Warning */}
              {aiResult?.photo_matches_text === 'no' && (
                <div className="p-3.5 rounded-xl tactile-surface-elevated border-l-4 border-l-amber-600 text-xs font-bold flex items-center gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>{t('photoMismatchNotice')}</span>
                </div>
              )}

              {/* Missing Information Loop Panel */}
              {aiResult?.missing_fields && aiResult.missing_fields.length > 0 && (
                <div className="p-5 rounded-2xl tactile-card-navy space-y-3">
                  <div className="flex items-center gap-2 font-bold text-xs text-[#EFE7E1]">
                    <HelpCircle className="w-4 h-4 text-[#D3C2B8]" />
                    <span>{t('missingInfoTitle')}</span>
                  </div>
                  <p className="text-xs text-[#D3C2B8]">
                    {t('missingInfoDesc')}
                  </p>

                  <div className="space-y-2">
                    {aiResult.follow_up_questions.map((q, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-[#132836] rounded-xl border border-white/15 text-xs text-[#EFE7E1] font-semibold"
                      >
                        💬 {q}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      value={missingAnswer}
                      onChange={(e) => setMissingAnswer(e.target.value)}
                      placeholder={t('typeAnswerHere')}
                      className="tactile-input flex-1 p-2.5 text-xs rounded-xl font-medium"
                    />
                    <button
                      type="button"
                      onClick={handleAnswerFollowUp}
                      disabled={!missingAnswer.trim()}
                      className="tactile-btn-beige px-4 py-2.5 rounded-xl text-xs font-bold disabled:opacity-40"
                    >
                      {t('answeredReanalyze')}
                    </button>
                  </div>
                </div>
              )}

              {/* Editable Ticket Preview Card */}
              <div className="tactile-card rounded-2xl p-6 sm:p-7 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#1D3C50]/15 dark:border-[#D3C2B8]/15 flex-wrap gap-2">
                  <h3 className="font-display font-extrabold text-lg deboss-heading">
                    {t('ticketPreview')}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-[#254E68] dark:text-[#D3C2B8]/80">
                      {t('aiDisclaimer')}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono-tech font-bold uppercase relevo-well">
                      {t('confidenceLabel')}: {aiResult ? `${Math.round(aiResult.confidence * 100)}%` : '85%'}
                    </span>
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label className="block text-xs font-bold text-[#1D3C50] dark:text-[#EFE7E1] mb-1.5">
                    {t('ticketTitleLabel')}
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={60}
                    className="tactile-input w-full p-2.5 text-sm font-bold rounded-xl"
                  />
                </div>

                {/* Summary */}
                <div>
                  <label className="block text-xs font-bold text-[#1D3C50] dark:text-[#EFE7E1] mb-1.5">
                    {t('englishSummaryDispatch')}
                  </label>
                  <textarea
                    value={summaryEn}
                    onChange={(e) => setSummaryEn(e.target.value)}
                    rows={2}
                    maxLength={300}
                    className="tactile-input w-full p-2.5 text-xs font-medium rounded-xl"
                  />
                </div>

                {/* Category & Subtype */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-[#1D3C50] dark:text-[#EFE7E1] mb-1.5">
                      {t('categoryLabel')}
                    </label>
                    <select
                      value={category}
                      onChange={(e) => {
                        const newCat = e.target.value as Category;
                        setCategory(newCat);
                        const subs = getSubteamsForCategory(newCat);
                        setSubtype(subs[0] || 'General');
                      }}
                      className="tactile-input w-full p-2.5 text-xs font-bold rounded-xl"
                    >
                      <option value="plumbing">{translateCategory('plumbing', language)}</option>
                      <option value="electricity">{translateCategory('electricity', language)}</option>
                      <option value="cleanliness">{translateCategory('cleanliness', language)}</option>
                      <option value="internet">{translateCategory('internet', language)}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#1D3C50] dark:text-[#EFE7E1] mb-1.5">
                      {t('subteamSubtypeLabel')}
                    </label>
                    <select
                      value={subtype}
                      onChange={(e) => setSubtype(e.target.value)}
                      className="tactile-input w-full p-2.5 text-xs font-bold rounded-xl"
                    >
                      {getSubteamsForCategory(category).map((st) => (
                        <option key={st} value={st}>
                          {translateSubtype(st, language)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Department (Read-only) */}
                <div className="p-3.5 tactile-inset rounded-xl flex items-center justify-between">
                  <span className="text-xs font-bold text-[#254E68] dark:text-[#D3C2B8]">
                    {t('assignedDeptLabel')}:
                  </span>
                  <span className="text-xs font-extrabold text-[#1D3C50] dark:text-[#EFE7E1]">
                    {translateCategory(category, language)} ({currentDeptInfo?.name || t('unassigned')})
                  </span>
                </div>

                {/* Urgency */}
                <div>
                  <label className="block text-xs font-bold text-[#1D3C50] dark:text-[#EFE7E1] mb-1.5">
                    {t('urgencyLevelLabel')}
                  </label>
                  <select
                    value={urgency}
                    onChange={(e) => setUrgency(e.target.value as Urgency)}
                    className="tactile-input w-full p-2.5 text-xs font-bold rounded-xl"
                  >
                    <option value="low">{t('urgencyLowSla')}</option>
                    <option value="medium">{t('urgencyMediumSla')}</option>
                    <option value="high">{t('urgencyHighSla')}</option>
                    <option value="critical">{t('urgencyCriticalSla')}</option>
                  </select>
                </div>

                {/* What Gemini saw in photo */}
                {aiResult?.photo_observation && (
                  <div className="p-3.5 tactile-surface-elevated rounded-xl text-xs space-y-1">
                    <span className="font-bold text-[#1D3C50] dark:text-[#EFE7E1]">
                      {t('photoObsLabel')}:
                    </span>
                    <p className="text-[#254E68] dark:text-[#D3C2B8] font-medium">
                      {aiResult.photo_observation}
                    </p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="tactile-btn-beige flex items-center gap-1.5 px-5 py-3 rounded-xl text-sm font-bold min-h-[44px]"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>{t('back')}</span>
                </button>

                <button
                  type="button"
                  disabled={
                    isSubmitting ||
                    !description.trim() ||
                    !selectedZone ||
                    (aiResult?.missing_fields?.length ?? 0) > 0
                  }
                  onClick={handleFinalSubmit}
                  className="tactile-btn-primary flex items-center gap-2 px-7 py-3.5 rounded-xl text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed min-h-[46px]"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {isSubmitting ? t('submittingTicket') : t('submitTicket')}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 5: SUCCESS CONFIRMATION */}
      {step === 5 && (
        <div className="tactile-card rounded-2xl p-6 sm:p-9 text-center space-y-6 w-full">
          <div className="w-16 h-16 rounded-2xl relevo-well text-[#D3C2B8] mx-auto flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div className="space-y-1">
            <h2 className="font-display text-2xl font-extrabold deboss-heading">
              {t('ticketCreatedSuccess')}
            </h2>
            <p className="text-sm font-medium text-[#254E68] dark:text-[#D3C2B8]">
              {t('routedToDept', {
                dept: translateCategory(category, language),
              })}
            </p>
          </div>

          {/* Big Recessed Ticket Number Well */}
          <div className="p-6 rounded-2xl relevo-well max-w-sm mx-auto space-y-2">
            <div className="text-[11px] uppercase tracking-widest text-[#D3C2B8]/80 font-bold">
              {t('ticketIdLabel')}
            </div>
            <div className="text-3xl sm:text-4xl font-extrabold emboss-text-light font-mono-tech">
              {createdTicketNumber}
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-[#254E68] text-[#EFE7E1] border border-white/15">
              <span>{t('expectedSla')}</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => onTicketSubmitted(createdTicketNumber)}
              className="tactile-btn-primary w-full sm:w-auto px-7 py-3 rounded-xl font-bold text-sm min-h-[46px]"
            >
              {t('trackTicket')}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep(1);
                setDescription('');
                setSelectedZone(null);
                setPin(null);
                setPhotoBase64(null);
                setAiResult(null);
                setDraftIdempotencyKey(
                  `idem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
                );
              }}
              className="tactile-btn-beige w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-sm min-h-[46px]"
            >
              {t('reportAnother')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
