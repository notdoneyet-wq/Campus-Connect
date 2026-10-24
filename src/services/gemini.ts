import {
  CampusFloorMap,
  FloorGenerationInput,
  GeminiIntakeResult,
  Ticket,
} from '../types';
import {
  applyNaturalLanguageMapEditFallback,
  generateDeterministicFloorMap,
} from '../data/campus';
import { getAuthHeaders } from './auth';

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = 45000
): Promise<Response> {
  const signal =
    typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
      ? AbortSignal.timeout(timeoutMs)
      : undefined;

  return fetch(url, {
    ...options,
    signal,
  });
}

/**
 * 7.1 Intake analysis — calls server-side Gemini API endpoint
 */
export async function analyzeIntakeComplaint(params: {
  rawText: string;
  userLanguage: 'en' | 'hi';
  selectedLocation?: { hostel: string; floor: number; room: string } | null;
  imageBase64?: string | null;
}): Promise<GeminiIntakeResult> {
  const { rawText, userLanguage, selectedLocation, imageBase64 } = params;

  try {
    const response = await fetchWithTimeout('/api/gemini/analyze-intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawText,
        userLanguage,
        selectedLocation,
        imageBase64,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }

    const data = await response.json();
    if (data.result) {
      return data.result as GeminiIntakeResult;
    }
    throw new Error(data.error || 'No result returned from AI server');
  } catch (err: any) {
    console.warn('API call to /api/gemini/analyze-intake failed or timed out:', err);
    throw err;
  }
}

/**
 * 7.2 Duplicate comparison
 */
export async function compareDuplicateTickets(
  newTicket: Ticket,
  shortlist: Ticket[],
  language: 'en' | 'hi' = 'en'
): Promise<
  Array<{ candidateId: string; verdict: 'identical' | 'related' | 'different'; reason: string }>
> {
  if (shortlist.length === 0) return [];

  try {
    const response = await fetchWithTimeout('/api/gemini/compare-duplicates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newTicket, shortlist, language }),
    });

    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data.comparisons) ? data.comparisons : [];
  } catch (err) {
    console.warn('Duplicate comparison API error:', err);
    return [];
  }
}

/**
 * 7.3 Incident root-cause suggestion
 */
export async function suggestIncidentRootCause(
  tickets: Ticket[],
  language: 'en' | 'hi' = 'en'
): Promise<{
  title: string;
  plausible_shared_cause: string;
  ticketIds: string[];
  confidence: number;
}> {
  if (tickets.length === 0) {
    return {
      title: language === 'hi' ? 'संभावित सामूहिक व्यवधान' : 'Possible Grouped Outage',
      plausible_shared_cause:
        language === 'hi'
          ? 'आस-पास के कई कमरों को प्रभावित करने वाली संभावित साझा लाइन खराबी'
          : 'Possible shared infrastructure defect across multiple adjacent rooms',
      ticketIds: [],
      confidence: 0.75,
    };
  }

  try {
    const response = await fetchWithTimeout('/api/gemini/suggest-root-cause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickets, language }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.rootCause) return data.rootCause;
    throw new Error('No root cause in response');
  } catch (err) {
    return {
      title:
        language === 'hi'
          ? 'संभावित साझा बुनियादी ढाँचा व्यवधान'
          : 'Possible Clustered Infrastructure Disruption',
      plausible_shared_cause:
        language === 'hi'
          ? 'इस मंज़िल के आस-पास के कमरों को प्रभावित करने वाली साझा सेवा लाइन में संभावित रुकावट'
          : 'Possible shared service line disruption affecting adjacent rooms on this floor',
      ticketIds: tickets.map((t) => t.ticketId),
      confidence: 0.7,
    };
  }
}

/**
 * 7.4 Campus Pulse
 */
export async function generateCampusPulse(
  stats: any,
  language: 'en' | 'hi' = 'en'
): Promise<string> {
  try {
    const response = await fetchWithTimeout('/api/gemini/campus-pulse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stats, language }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.summary || 'Summary unavailable.';
  } catch (err) {
    if (language === 'hi') {
      return `कैंपस दैनिक पल्स: कुल ${stats.totalTickets || 0} टिकट ट्रैक किए गए। ${stats.openCount || 0} टिकट अभी प्रगति पर हैं। सत्यापित समाधान दर ${stats.verifiedResolutionRate || 0}% है।`;
    }
    return `Campus Daily Pulse: ${stats.totalTickets || 0} total tickets tracked. ${stats.openCount || 0} currently in progress. Verified resolution rate is ${stats.verifiedResolutionRate || 0}%.`;
  }
}

/**
 * 7.5 AI-Assisted Schematic Floor Map Generator (with deterministic manual fallback)
 */
export async function generateSchematicFloorMap(params: {
  campusId?: string;
  buildingName: string;
  buildingCode: string;
  floorNumber: number;
  spec: Partial<FloorGenerationInput>;
}): Promise<{ floorMap: CampusFloorMap; usedFallback: boolean; note?: string }> {
  try {
    const response = await fetchWithTimeout('/api/gemini/generate-floor-map', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.floorMap) {
        return {
          floorMap: data.floorMap as CampusFloorMap,
          usedFallback: Boolean(data.usedFallback),
          note: data.note,
        };
      }
    }
  } catch (err) {
    console.warn('AI floor map generation fallback triggered:', err);
  }

  const fallbackMap = generateDeterministicFloorMap(
    params.buildingName,
    params.buildingCode,
    params.floorNumber,
    params.spec,
    'manual'
  );
  return {
    floorMap: fallbackMap,
    usedFallback: true,
    note: 'Generated schematic layout using deterministic fallback engine.',
  };
}

/**
 * 7.6 AI Co-Pilot Natural-Language Floor Map Editor
 */
export async function editFloorMapWithAi(params: {
  campusId?: string;
  buildingName: string;
  buildingCode: string;
  floorNumber: number;
  currentFloorMap: CampusFloorMap;
  instruction: string;
}): Promise<{ floorMap: CampusFloorMap; changeSummary: string; usedFallback: boolean }> {
  try {
    const response = await fetchWithTimeout('/api/gemini/edit-floor-map', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.floorMap) {
        return {
          floorMap: data.floorMap as CampusFloorMap,
          changeSummary: String(data.changeSummary || 'Updated floor layout.'),
          usedFallback: Boolean(data.usedFallback),
        };
      }
    }
  } catch (err) {
    console.warn('AI map co-pilot fallback triggered:', err);
  }

  const fallback = applyNaturalLanguageMapEditFallback(
    params.currentFloorMap,
    params.instruction,
    params.buildingCode
  );
  return {
    floorMap: fallback.floorMap,
    changeSummary: fallback.changeSummary,
    usedFallback: true,
  };
}
