import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import {
  CampusBuilding,
  CampusOrganization,
  DuplicateCandidate,
  Escalation,
  Incident,
  Notice,
  Technician,
  Ticket,
  TicketEvent,
  TicketLocationSnapshot,
  UserProfile,
} from '../types';
import {
  DEFAULT_CAMPUS_ID,
  createDefaultDemoCampus,
  getActiveCampusCache,
  setActiveCampusCache,
} from '../data/campus';
import { INITIAL_TECHNICIANS } from '../utils/smartDispatch';
import { calculateSlaDueAt } from '../utils/sla';
import { getAuthHeaders, getCachedUser } from './auth';
import {
  AtomicTicketSequence,
  canAccessTicket,
  canManageCampus,
  canModifyTicket,
  filterAuthorizedDuplicates,
  filterAuthorizedEscalations,
  filterAuthorizedIncidents,
  filterAuthorizedNotices,
  filterAuthorizedTechnicians,
  filterAuthorizedTickets,
  getEffectiveCampusId,
  isSameCampus,
  sanitizeProfileMutation,
} from '../utils/authorization';

const LOCAL_STORAGE_PREFIX = 'campusconnect_';

function getLocalStore<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(LOCAL_STORAGE_PREFIX + key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setLocalStore<T>(key: string, value: T): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {}
}

/**
 * Demo clock simulation offset (milliseconds added to Date.now())
 */
let demoClockOffsetMs = getLocalStore<number>('demo_clock_offset', 0);

export function getSimulatedNow(): number {
  return Date.now() + demoClockOffsetMs;
}

export function setDemoClockOffset(offsetMs: number): void {
  demoClockOffsetMs = offsetMs;
  setLocalStore('demo_clock_offset', offsetMs);
}

export function advanceDemoClock(hours: number): number {
  demoClockOffsetMs += hours * 3600 * 1000;
  setLocalStore('demo_clock_offset', offsetMsFromHours(demoClockOffsetMs));
  return getSimulatedNow();
}

function offsetMsFromHours(ms: number): number {
  return ms;
}

export function resetDemoClock(): number {
  demoClockOffsetMs = 0;
  setLocalStore('demo_clock_offset', 0);
  return Date.now();
}

export function getDemoClockOffsetHours(): number {
  return Math.round((demoClockOffsetMs / (3600 * 1000)) * 10) / 10;
}

// ----------------------------------------------------------------------
// User Profiles
// ----------------------------------------------------------------------
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const res = await fetch(`/api/data/users/${encodeURIComponent(uid)}`, {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.profile) return data.profile as UserProfile;
    }
  } catch {}

  try {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }
  } catch {}

  const localUsers = getLocalStore<Record<string, UserProfile>>('users', {});
  return localUsers[uid] || null;
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  if (!profile || !profile.uid) return;
  const actor = getCachedUser() || profile;
  const localUsers = getLocalStore<Record<string, UserProfile>>('users', {});
  const existing = localUsers[profile.uid] || profile;
  const safeProfile = sanitizeProfileMutation(actor, existing, profile);

  try {
    await fetch(`/api/data/users/${encodeURIComponent(profile.uid)}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(safeProfile),
    });
  } catch {}

  try {
    const userRef = doc(db, 'users', profile.uid);
    await setDoc(userRef, safeProfile, { merge: true });
  } catch {}

  localUsers[profile.uid] = safeProfile;
  setLocalStore('users', localUsers);
}

// ----------------------------------------------------------------------
// Multi-Campus Organizations (Setup Wizard, Drafts & Published Portals)
// ----------------------------------------------------------------------
export async function fetchPublicCampuses(): Promise<CampusOrganization[]> {
  try {
    const res = await fetch('/api/campuses/public');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.campuses) && data.campuses.length > 0) {
        return data.campuses as CampusOrganization[];
      }
    }
  } catch {}

  const localCampuses = getLocalStore<Record<string, CampusOrganization>>('campuses', {
    [DEFAULT_CAMPUS_ID]: createDefaultDemoCampus(),
  });
  return Object.values(localCampuses).filter((c) => c.status === 'published');
}

export async function fetchMyCampus(forUser?: UserProfile | null): Promise<CampusOrganization> {
  const activeUser = forUser !== undefined ? forUser : getCachedUser();
  const targetCampusId = getEffectiveCampusId(activeUser);

  try {
    const res = await fetch('/api/campuses/my', {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.campus) {
        const campus = data.campus as CampusOrganization;
        setActiveCampusCache(campus);
        const map = getLocalStore<Record<string, CampusOrganization>>('campuses', {});
        map[campus.id] = campus;
        setLocalStore('campuses', map);
        return campus;
      }
    }
  } catch {}

  try {
    const snap = await getDoc(doc(db, 'campuses', targetCampusId));
    if (snap.exists()) {
      const campus = snap.data() as CampusOrganization;
      setActiveCampusCache(campus);
      return campus;
    }
  } catch {}

  const localCampuses = getLocalStore<Record<string, CampusOrganization>>('campuses', {});
  const fallback = localCampuses[targetCampusId] || createDefaultDemoCampus();
  setActiveCampusCache(fallback);
  return fallback;
}

export async function saveCampusDraft(
  campusId: string,
  draftUpdate: Partial<CampusOrganization> & { buildings?: CampusBuilding[] }
): Promise<CampusOrganization> {
  const activeUser = getCachedUser();
  try {
    const res = await fetch(`/api/campuses/${encodeURIComponent(campusId)}/draft`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(draftUpdate),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to save campus draft.');
    }
    if (data.campus) {
      const updated = data.campus as CampusOrganization;
      setActiveCampusCache(updated);
      const localMap = getLocalStore<Record<string, CampusOrganization>>('campuses', {});
      localMap[updated.id] = updated;
      setLocalStore('campuses', localMap);
      try {
        await setDoc(doc(db, 'campuses', updated.id), updated, { merge: true });
      } catch {}
      return updated;
    }
  } catch (err: any) {
    if (err.message && err.message.includes('Access denied')) throw err;
  }

  const localMap = getLocalStore<Record<string, CampusOrganization>>('campuses', {});
  const current = localMap[campusId] || getActiveCampusCache() || createDefaultDemoCampus();
  if (activeUser && !canManageCampus(activeUser, current)) {
    throw new Error('Access denied: only authorized campus admins can save drafts.');
  }

  const updated: CampusOrganization = {
    ...current,
    ...draftUpdate,
    draftBuildings: draftUpdate.buildings || current.draftBuildings || current.buildings,
    buildings:
      current.status === 'draft' && draftUpdate.buildings
        ? draftUpdate.buildings
        : current.buildings,
    updatedAt: getSimulatedNow(),
  };

  localMap[campusId] = updated;
  setLocalStore('campuses', localMap);
  setActiveCampusCache(updated);
  try {
    await setDoc(doc(db, 'campuses', campusId), updated, { merge: true });
  } catch {}
  return updated;
}

export async function publishCampusPortal(
  campusId: string,
  payload: {
    buildings: CampusBuilding[];
    name?: string;
    code?: string;
    domains?: string[];
    city?: string;
    description?: string;
  }
): Promise<CampusOrganization> {
  const activeUser = getCachedUser();
  try {
    const res = await fetch(`/api/campuses/${encodeURIComponent(campusId)}/publish`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        ...payload,
        confirmPublish: true,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to publish campus portal.');
    }
    if (data.campus) {
      const published = data.campus as CampusOrganization;
      setActiveCampusCache(published);
      const localMap = getLocalStore<Record<string, CampusOrganization>>('campuses', {});
      localMap[published.id] = published;
      setLocalStore('campuses', localMap);
      try {
        await setDoc(doc(db, 'campuses', published.id), published, { merge: true });
      } catch {}
      return published;
    }
  } catch (err: any) {
    if (err.message && err.message.includes('Access denied')) throw err;
  }

  const localMap = getLocalStore<Record<string, CampusOrganization>>('campuses', {});
  const current = localMap[campusId] || getActiveCampusCache() || createDefaultDemoCampus();
  if (activeUser && !canManageCampus(activeUser, current)) {
    throw new Error('Access denied: only authorized campus admins can publish campus layouts.');
  }

  const now = getSimulatedNow();
  const published: CampusOrganization = {
    ...current,
    name: payload.name || current.name,
    code: payload.code || current.code,
    domains: payload.domains || current.domains,
    city: payload.city ?? current.city,
    description: payload.description ?? current.description,
    buildings: payload.buildings,
    draftBuildings: payload.buildings,
    status: 'published',
    wizardStep: 4,
    version: current.status === 'published' ? (current.version || 1) + 1 : 1,
    updatedAt: now,
    publishedAt: now,
  };

  localMap[campusId] = published;
  setLocalStore('campuses', localMap);
  setActiveCampusCache(published);
  try {
    await setDoc(doc(db, 'campuses', campusId), published, { merge: true });
  } catch {}
  return published;
}

// ----------------------------------------------------------------------
// Next Ticket Counter (CC-0001, CC-0002...) — Atomic Server Sequence
// ----------------------------------------------------------------------
export async function getNextTicketId(idempotencyKey?: string): Promise<string> {
  try {
    const res = await fetch('/api/data/next-ticket-id', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ idempotencyKey }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.ticketId) {
        return data.ticketId as string;
      }
    }
  } catch (err) {
    console.warn('Server atomic counter unreachable, using sequence guard:', err);
  }

  // Fallback sequence initialized from all known local ticket IDs (never resets to 1 if tickets exist)
  const localTickets = getLocalStore<Ticket[]>('tickets', []);
  const currentCounter = getLocalStore<number>('ticket_counter', 1);
  const seq = new AtomicTicketSequence(
    currentCounter,
    localTickets.map((t) => t.ticketId)
  );
  const { ticketId } = seq.allocateNext(idempotencyKey);
  setLocalStore('ticket_counter', seq.getNextNumber());
  return ticketId;
}

// ----------------------------------------------------------------------
// Tickets (with strict RBAC & Department Isolation)
// ----------------------------------------------------------------------
export async function fetchTickets(forUser?: UserProfile | null): Promise<Ticket[]> {
  const activeUser = forUser !== undefined ? forUser : getCachedUser();

  try {
    const res = await fetch('/api/data/tickets', {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.tickets)) {
        const serverTickets = data.tickets as Ticket[];
        const authorized = activeUser
          ? filterAuthorizedTickets(activeUser, serverTickets)
          : serverTickets;
        return authorized.sort((a, b) => b.createdAt - a.createdAt);
      }
    }
  } catch (err) {
    console.warn('Backend fetchTickets fallback:', err);
  }

  let tickets: Ticket[] = [];
  try {
    const ticketsCol = collection(db, 'tickets');
    const snap = await getDocs(ticketsCol);
    tickets = snap.docs.map((d) => ({ ...d.data(), id: d.id } as Ticket));
  } catch {}

  const localTickets = getLocalStore<Ticket[]>('tickets', []);
  if (tickets.length === 0 && localTickets.length > 0) {
    tickets = localTickets;
  }

  const authorized = activeUser ? filterAuthorizedTickets(activeUser, tickets) : tickets;
  return authorized.sort((a, b) => b.createdAt - a.createdAt);
}

export async function createTicket(
  ticketData: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Ticket> {
  const now = getSimulatedNow();

  // Primary: Atomic server creation with idempotency key and unique ticketId enforcement
  try {
    const res = await fetch('/api/data/tickets', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        ...ticketData,
        createdAt: now,
        updatedAt: now,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.ticket) {
        const created = data.ticket as Ticket;
        const current = getLocalStore<Ticket[]>('tickets', []);
        const filtered = current.filter(
          (t) => t.id !== created.id && t.ticketId !== created.ticketId
        );
        setLocalStore('tickets', [created, ...filtered]);
        return created;
      }
    } else {
      const errData = await res.json().catch(() => ({}));
      if (res.status === 403) {
        throw new Error(errData.error || 'Not authorized to create ticket.');
      }
    }
  } catch (err: any) {
    if (err.message && err.message.includes('verify your email')) {
      throw err;
    }
    console.warn('Server createTicket fallback:', err);
  }

  const docId = `ticket_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const current = getLocalStore<Ticket[]>('tickets', []);

  // Ensure unique ticketId even in fallback mode
  let finalTicketId = ticketData.ticketId;
  if (!finalTicketId || current.some((t) => t.ticketId === finalTicketId)) {
    finalTicketId = await getNextTicketId(ticketData.idempotencyKey);
  }

  const activeUser = getCachedUser();
  const campusId = ticketData.campusId || getEffectiveCampusId(activeUser);
  const mapVersion = ticketData.mapVersion || getActiveCampusCache()?.version || 1;
  const locationSnapshot: TicketLocationSnapshot = ticketData.locationSnapshot || {
    campusId,
    buildingId: ticketData.buildingId || ticketData.hostel,
    buildingName: ticketData.hostel,
    floor: ticketData.floor,
    floorLabel: `Floor ${ticketData.floor}`,
    room: ticketData.room,
    locationCode: ticketData.locationCode,
    pinX: ticketData.pinX,
    pinY: ticketData.pinY,
    mapVersion,
    capturedAt: now,
  };

  const newTicket: Ticket = {
    ...ticketData,
    campusId,
    mapVersion,
    locationSnapshot,
    ticketId: finalTicketId,
    id: docId,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const docRef = doc(db, 'tickets', docId);
    await setDoc(docRef, newTicket);
  } catch {}

  await addTicketEvent(docId, {
    actorId: newTicket.reporterId,
    actorRole: 'student',
    type: 'created',
    note: `Ticket ${newTicket.ticketId} created with urgency ${newTicket.urgency}`,
    timestamp: now,
  });

  setLocalStore('tickets', [newTicket, ...current]);
  return newTicket;
}

export async function updateTicket(
  id: string,
  updates: Partial<Ticket>,
  event?: Omit<TicketEvent, 'id' | 'timestamp'>
): Promise<void> {
  const now = getSimulatedNow();
  const activeUser = getCachedUser();

  try {
    const res = await fetch(`/api/data/tickets/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        updates: { ...updates, updatedAt: now },
        event: event ? { ...event, timestamp: now } : undefined,
      }),
    });
    if (!res.ok && res.status === 403) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Access denied: cannot modify ticket outside your department.');
    }
  } catch (err: any) {
    if (err.message && err.message.includes('Access denied')) {
      throw err;
    }
  }

  const fullUpdates = { ...updates, updatedAt: now };

  const localTickets = getLocalStore<Ticket[]>('tickets', []);
  const idx = localTickets.findIndex((t) => t.id === id || t.ticketId === id);
  if (idx !== -1) {
    if (activeUser && !canModifyTicket(activeUser, localTickets[idx])) {
      throw new Error('Access denied: cannot modify ticket outside your authorized department.');
    }
    localTickets[idx] = { ...localTickets[idx], ...fullUpdates };
    setLocalStore('tickets', localTickets);
  }

  try {
    const docRef = doc(db, 'tickets', id);
    await updateDoc(docRef, fullUpdates);
  } catch {}

  if (event) {
    await addTicketEvent(id, { ...event, timestamp: now });
  }
}

export async function fetchGeneralTickets(): Promise<Ticket[]> {
  const activeUser = getCachedUser();
  try {
    const res = await fetch('/api/data/tickets/public', {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.tickets)) {
        return (data.tickets as Ticket[]).filter((t) =>
          activeUser ? isSameCampus(activeUser, t) : true
        );
      }
    }
  } catch {}

  const localTickets = getLocalStore<Ticket[]>('tickets', []);
  return localTickets.filter((t) => (activeUser ? isSameCampus(activeUser, t) : true));
}

export async function voteTicket(id: string, dir: 'up' | 'down'): Promise<Ticket | null> {
  const activeUser = getCachedUser();
  try {
    const res = await fetch(`/api/data/tickets/${encodeURIComponent(id)}/vote`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ dir }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.ticket) {
        const localTickets = getLocalStore<Ticket[]>('tickets', []);
        const idx = localTickets.findIndex((t) => t.id === id || t.ticketId === id);
        if (idx !== -1) {
          localTickets[idx] = data.ticket;
          setLocalStore('tickets', localTickets);
        }
        return data.ticket as Ticket;
      }
    }
  } catch {}

  const localTickets = getLocalStore<Ticket[]>('tickets', []);
  const idx = localTickets.findIndex((t) => t.id === id || t.ticketId === id);
  if (idx !== -1) {
    const room = activeUser?.room || 'Room 204';
    const tk = { ...localTickets[idx] };
    let upvotedUsers = Array.isArray(tk.upvotedUsers) ? [...tk.upvotedUsers] : [];
    let downvotedUsers = Array.isArray(tk.downvotedUsers) ? [...tk.downvotedUsers] : [];
    let upvotedRooms = Array.isArray(tk.upvotedRooms) ? [...tk.upvotedRooms] : [];

    const uid = activeUser?.uid || 'guest';
    const hasUpvoted = upvotedUsers.includes(uid);
    const hasDownvoted = downvotedUsers.includes(uid);

    if (dir === 'up') {
      if (hasUpvoted) {
        upvotedUsers = upvotedUsers.filter((u) => u !== uid);
      } else {
        downvotedUsers = downvotedUsers.filter((u) => u !== uid);
        upvotedUsers.push(uid);
        if (!upvotedRooms.includes(room)) upvotedRooms.push(room);
      }
    } else {
      if (hasDownvoted) {
        downvotedUsers = downvotedUsers.filter((u) => u !== uid);
      } else {
        upvotedUsers = upvotedUsers.filter((u) => u !== uid);
        downvotedUsers.push(uid);
      }
    }

    tk.upvotes = upvotedUsers.length;
    tk.downvotes = downvotedUsers.length;
    tk.netVotes = tk.upvotes - tk.downvotes;
    tk.upvotedUsers = upvotedUsers;
    tk.downvotedUsers = downvotedUsers;
    tk.upvotedRooms = upvotedRooms;

    localTickets[idx] = tk;
    setLocalStore('tickets', localTickets);
    return tk;
  }
  return null;
}

export async function upvoteTicket(id: string): Promise<Ticket | null> {
  return voteTicket(id, 'up');
}

// ----------------------------------------------------------------------
// Ticket Events (Audit Timeline)
// ----------------------------------------------------------------------
export async function addTicketEvent(
  ticketDocId: string,
  event: Omit<TicketEvent, 'id'>
): Promise<void> {
  const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const fullEvent: TicketEvent = { ...event, id: eventId };

  try {
    await fetch(`/api/data/tickets/${encodeURIComponent(ticketDocId)}/events`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(fullEvent),
    });
  } catch {}

  try {
    const evRef = doc(db, 'tickets', ticketDocId, 'events', eventId);
    await setDoc(evRef, fullEvent);
  } catch {}

  const key = `events_${ticketDocId}`;
  const events = getLocalStore<TicketEvent[]>(key, []);
  if (!events.some((e) => e.id === fullEvent.id)) {
    events.push(fullEvent);
    setLocalStore(key, events);
  }
}

export async function fetchTicketEvents(ticketDocId: string): Promise<TicketEvent[]> {
  try {
    const res = await fetch(`/api/data/tickets/${encodeURIComponent(ticketDocId)}/events`, {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.events)) {
        return (data.events as TicketEvent[]).sort((a, b) => a.timestamp - b.timestamp);
      }
    } else if (res.status === 403) {
      return [];
    }
  } catch {}

  try {
    const evCol = collection(db, 'tickets', ticketDocId, 'events');
    const snap = await getDocs(evCol);
    if (!snap.empty) {
      const events = snap.docs.map((d) => ({ ...d.data(), id: d.id } as TicketEvent));
      return events.sort((a, b) => a.timestamp - b.timestamp);
    }
  } catch {}

  const key = `events_${ticketDocId}`;
  const events = getLocalStore<TicketEvent[]>(key, []);
  return events.sort((a, b) => a.timestamp - b.timestamp);
}

// ----------------------------------------------------------------------
// Duplicate Candidates (Scoped to Authorized Department)
// ----------------------------------------------------------------------
export async function fetchDuplicateCandidates(
  forUser?: UserProfile | null
): Promise<DuplicateCandidate[]> {
  const activeUser = forUser !== undefined ? forUser : getCachedUser();

  try {
    const res = await fetch('/api/data/duplicates', {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.duplicates)) {
        return data.duplicates as DuplicateCandidate[];
      }
    }
  } catch {}

  let candidates: DuplicateCandidate[] = [];
  try {
    const col = collection(db, 'duplicateCandidates');
    const snap = await getDocs(col);
    if (!snap.empty) {
      candidates = snap.docs.map((d) => ({ ...d.data(), id: d.id } as DuplicateCandidate));
    }
  } catch {}

  if (candidates.length === 0) {
    candidates = getLocalStore<DuplicateCandidate[]>('duplicates', []);
  }

  if (activeUser) {
    const tickets = await fetchTickets(activeUser);
    return filterAuthorizedDuplicates(activeUser, candidates, tickets);
  }
  return candidates;
}

export async function saveDuplicateCandidate(
  candidate: Omit<DuplicateCandidate, 'id' | 'createdAt'>
): Promise<void> {
  try {
    const res = await fetch('/api/data/duplicates', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(candidate),
    });
    if (res.ok) return;
  } catch {}

  const id = `dup_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const full: DuplicateCandidate = {
    ...candidate,
    id,
    createdAt: getSimulatedNow(),
  };

  try {
    await setDoc(doc(db, 'duplicateCandidates', id), full);
  } catch {}

  const current = getLocalStore<DuplicateCandidate[]>('duplicates', []);
  setLocalStore('duplicates', [full, ...current]);
}

export async function updateDuplicateCandidate(
  id: string,
  reviewState: DuplicateCandidate['reviewState'],
  reviewedBy: string
): Promise<void> {
  try {
    const res = await fetch(`/api/data/duplicates/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ reviewState, reviewedBy }),
    });
    if (!res.ok && res.status === 403) {
      throw new Error('Access denied: cannot review duplicate outside your department.');
    }
  } catch (err: any) {
    if (err.message && err.message.includes('Access denied')) throw err;
  }

  try {
    await updateDoc(doc(db, 'duplicateCandidates', id), { reviewState, reviewedBy });
  } catch {}

  const current = getLocalStore<DuplicateCandidate[]>('duplicates', []);
  const idx = current.findIndex((d) => d.id === id);
  if (idx !== -1) {
    current[idx].reviewState = reviewState;
    current[idx].reviewedBy = reviewedBy;
    setLocalStore('duplicates', current);
  }
}

// ----------------------------------------------------------------------
// Incidents & Notices
// ----------------------------------------------------------------------
export async function fetchIncidents(forUser?: UserProfile | null): Promise<Incident[]> {
  const activeUser = forUser !== undefined ? forUser : getCachedUser();

  try {
    const res = await fetch('/api/data/incidents', {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.incidents)) {
        const list = data.incidents as Incident[];
        return activeUser ? filterAuthorizedIncidents(activeUser, list) : list;
      }
    }
  } catch {}

  let incidents: Incident[] = [];
  try {
    const col = collection(db, 'incidents');
    const snap = await getDocs(col);
    if (!snap.empty) {
      incidents = snap.docs.map((d) => ({ ...d.data(), id: d.id } as Incident));
    }
  } catch {}

  if (incidents.length === 0) {
    incidents = getLocalStore<Incident[]>('incidents', []);
  }
  return activeUser ? filterAuthorizedIncidents(activeUser, incidents) : incidents;
}

export async function createIncident(
  incidentData: Omit<Incident, 'id' | 'createdAt'>
): Promise<Incident> {
  try {
    const res = await fetch('/api/data/incidents', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(incidentData),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.incident) return data.incident as Incident;
    } else if (res.status === 403) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Access denied: cannot create incident for another department.');
    }
  } catch (err: any) {
    if (err.message && err.message.includes('Access denied')) throw err;
  }

  const id = `inc_${Date.now()}`;
  const full: Incident = { ...incidentData, id, createdAt: getSimulatedNow() };

  try {
    await setDoc(doc(db, 'incidents', id), full);
  } catch {}

  const current = getLocalStore<Incident[]>('incidents', []);
  setLocalStore('incidents', [full, ...current]);
  return full;
}

export async function fetchNotices(): Promise<Notice[]> {
  const activeUser = getCachedUser();
  try {
    const res = await fetch('/api/data/notices', {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.notices)) {
        return filterAuthorizedNotices(activeUser, data.notices as Notice[]);
      }
    }
  } catch {}

  try {
    const col = collection(db, 'notices');
    const snap = await getDocs(col);
    if (!snap.empty) {
      const all = snap.docs.map((d) => ({ ...d.data(), id: d.id } as Notice));
      return filterAuthorizedNotices(activeUser, all);
    }
  } catch {}
  return filterAuthorizedNotices(activeUser, getLocalStore<Notice[]>('notices', []));
}

export async function createNotice(
  noticeData: Omit<Notice, 'id' | 'createdAt'>
): Promise<Notice> {
  const activeUser = getCachedUser();
  const campusId = noticeData.campusId || getEffectiveCampusId(activeUser);
  try {
    const res = await fetch('/api/data/notices', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ ...noticeData, campusId }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.notice) return data.notice as Notice;
    }
  } catch {}

  const id = `not_${Date.now()}`;
  const full: Notice = {
    ...noticeData,
    campusId,
    id,
    createdAt: getSimulatedNow(),
    meTooCount: 0,
  };

  try {
    await setDoc(doc(db, 'notices', id), full);
  } catch {}

  const current = getLocalStore<Notice[]>('notices', []);
  setLocalStore('notices', [full, ...current]);
  return full;
}

export async function incrementNoticeMeToo(noticeId: string): Promise<number> {
  try {
    const res = await fetch(`/api/data/notices/${encodeURIComponent(noticeId)}/me-too`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      if (typeof data.meTooCount === 'number') return data.meTooCount;
    }
  } catch {}

  const current = getLocalStore<Notice[]>('notices', []);
  const target = current.find((n) => n.id === noticeId);
  const count = (target?.meTooCount || 0) + 1;
  if (target) {
    target.meTooCount = count;
    setLocalStore('notices', current);
  }
  try {
    await updateDoc(doc(db, 'notices', noticeId), { meTooCount: count });
  } catch {}
  return count;
}

// ----------------------------------------------------------------------
// Escalations (Scoped to Authorized Department)
// ----------------------------------------------------------------------
export async function fetchEscalations(forUser?: UserProfile | null): Promise<Escalation[]> {
  const activeUser = forUser !== undefined ? forUser : getCachedUser();

  try {
    const res = await fetch('/api/data/escalations', {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.escalations)) {
        return data.escalations as Escalation[];
      }
    }
  } catch {}

  let escalations: Escalation[] = [];
  try {
    const col = collection(db, 'escalations');
    const snap = await getDocs(col);
    if (!snap.empty) {
      escalations = snap.docs.map((d) => ({ ...d.data(), id: d.id } as Escalation));
    }
  } catch {}

  if (escalations.length === 0) {
    escalations = getLocalStore<Escalation[]>('escalations', []);
  }

  if (activeUser) {
    const tickets = await fetchTickets(activeUser);
    return filterAuthorizedEscalations(activeUser, escalations, tickets);
  }
  return escalations;
}

export async function createEscalation(
  ticketId: string,
  type: Escalation['type'],
  departmentId?: Escalation['departmentId']
): Promise<Escalation | null> {
  try {
    const res = await fetch('/api/data/escalations', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ ticketId, type, departmentId }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.escalation || null;
    }
  } catch {}

  const current = getLocalStore<Escalation[]>('escalations', []);
  if (current.some((e) => e.ticketId === ticketId && e.type === type)) {
    return null;
  }

  const id = `esc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const esc: Escalation = {
    id,
    ticketId,
    type,
    triggeredAt: getSimulatedNow(),
    departmentId,
  };

  try {
    await setDoc(doc(db, 'escalations', id), esc);
  } catch {}

  setLocalStore('escalations', [esc, ...current]);
  return esc;
}

// ----------------------------------------------------------------------
// Technicians (Scoped to Authorized Department)
// ----------------------------------------------------------------------
export async function fetchTechnicians(forUser?: UserProfile | null): Promise<Technician[]> {
  const activeUser = forUser !== undefined ? forUser : getCachedUser();

  try {
    const res = await fetch('/api/data/technicians', {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.technicians)) {
        const techs = data.technicians as Technician[];
        return activeUser ? filterAuthorizedTechnicians(activeUser, techs) : techs;
      }
    }
  } catch {}

  let techs: Technician[] = [];
  try {
    const col = collection(db, 'technicians');
    const snap = await getDocs(col);
    if (!snap.empty) {
      techs = snap.docs.map((d) => ({ ...d.data(), id: d.id } as Technician));
    }
  } catch {}

  if (techs.length === 0) {
    const local = getLocalStore<Technician[]>('technicians', []);
    techs = local.length > 0 ? local : INITIAL_TECHNICIANS;
  }

  return activeUser ? filterAuthorizedTechnicians(activeUser, techs) : techs;
}

export async function updateTechnicianWorkload(
  technicianId: string,
  delta: number
): Promise<void> {
  try {
    await fetch(`/api/data/technicians/${encodeURIComponent(technicianId)}/workload`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ delta }),
    });
  } catch {}

  const techs = getLocalStore<Technician[]>('technicians', INITIAL_TECHNICIANS);
  const t = techs.find((item) => item.id === technicianId || item.name === technicianId);
  if (t) {
    t.workload = Math.max(0, t.workload + delta);
    setLocalStore('technicians', techs);
    try {
      await updateDoc(doc(db, 'technicians', t.id), { workload: t.workload });
    } catch {}
  }
}

// ----------------------------------------------------------------------
// Periodic Overdue Escalation Checker
// ----------------------------------------------------------------------
export async function checkAndTriggerOverdueEscalations(): Promise<number> {
  if (!getCachedUser()) return 0;
  const tickets = await fetchTickets();
  const now = getSimulatedNow();
  let createdCount = 0;

  for (const t of tickets) {
    if (t.status === 'Open' || t.status === 'Assigned' || t.status === 'In Progress') {
      if (now > t.slaDueAt) {
        const dept = t.category !== 'unclear' ? t.category : undefined;
        const created = await createEscalation(t.ticketId, 'sla_overdue', dept);
        if (created) {
          createdCount++;
          await addTicketEvent(t.id, {
            actorId: 'system_sla',
            actorRole: 'supervisor',
            type: 'escalated',
            note: `Ticket breached SLA of ${t.urgency} priority. Escalated to supervisor queue.`,
            timestamp: now,
          });
        }
      }
    }
  }
  return createdCount;
}

// ----------------------------------------------------------------------
// Synthetic Demo Dataset Loader (Section 9)
// ----------------------------------------------------------------------
export async function seedDemoDataset(): Promise<void> {
  const now = getSimulatedNow();

  const demoTickets: Ticket[] = [
    {
      id: 'demo_wifi_1',
      ticketId: 'CC-0010',
      reporterId: 'stu-demo-1',
      reporters: ['stu-demo-1'],
      rawText: 'Wi-Fi has been dropping every 5 minutes in Room 201.',
      language: 'en',
      issue: 'Frequent Wi-Fi disconnects',
      title: 'Wi-Fi dropping in Room 201',
      summaryEn: 'Frequent Wi-Fi signal loss and high packet drop in room.',
      category: 'internet',
      subtype: 'Wi-Fi',
      departmentId: 'internet',
      urgency: 'high',
      confidence: 0.95,
      safetyFlags: ['none'],
      hostel: 'Hostel 1',
      floor: 2,
      room: 'Room 201',
      locationCode: 'H1-F2-R201',
      pinX: 25.5,
      pinY: 22,
      status: 'In Progress',
      assignedTo: 'Deepak Sharma (Network Engineer)',
      createdAt: now - 3 * 3600 * 1000,
      updatedAt: now - 1 * 3600 * 1000,
      slaDueAt: calculateSlaDueAt(now - 3 * 3600 * 1000, 'high'),
      isSynthetic: true,
    },
    {
      id: 'demo_wifi_2',
      ticketId: 'CC-0011',
      reporterId: 'stu-demo-2',
      reporters: ['stu-demo-2'],
      rawText: 'Cannot connect to campus hostel Wi-Fi from Room 202.',
      language: 'en',
      issue: 'Hostel Wi-Fi authentication fails',
      title: 'Hostel Wi-Fi down in Room 202',
      summaryEn: 'Authentication timeout when connecting to hostel access point.',
      category: 'internet',
      subtype: 'Wi-Fi',
      departmentId: 'internet',
      urgency: 'high',
      confidence: 0.94,
      safetyFlags: ['none'],
      hostel: 'Hostel 1',
      floor: 2,
      room: 'Room 202',
      locationCode: 'H1-F2-R202',
      pinX: 41.5,
      pinY: 22,
      status: 'Open',
      createdAt: now - 2 * 3600 * 1000,
      updatedAt: now - 2 * 3600 * 1000,
      slaDueAt: calculateSlaDueAt(now - 2 * 3600 * 1000, 'high'),
      isSynthetic: true,
    },
    {
      id: 'demo_wifi_3',
      ticketId: 'CC-0012',
      reporterId: 'stu-demo-3',
      reporters: ['stu-demo-3'],
      rawText: 'Room 203 internet speed is under 100kbps, completely unusable.',
      language: 'en',
      issue: 'Extreme latency and throttling',
      title: 'Unusable Wi-Fi in Room 203',
      summaryEn: 'Hostel 1 2nd floor corridor AP bandwidth severely choked.',
      category: 'internet',
      subtype: 'Wi-Fi',
      departmentId: 'internet',
      urgency: 'medium',
      confidence: 0.91,
      safetyFlags: ['none'],
      hostel: 'Hostel 1',
      floor: 2,
      room: 'Room 203',
      locationCode: 'H1-F2-R203',
      pinX: 58.5,
      pinY: 22,
      status: 'Open',
      createdAt: now - 4 * 3600 * 1000,
      updatedAt: now - 4 * 3600 * 1000,
      slaDueAt: calculateSlaDueAt(now - 4 * 3600 * 1000, 'medium'),
      isSynthetic: true,
    },
    {
      id: 'demo_wifi_4',
      ticketId: 'CC-0013',
      reporterId: 'stu-demo-4',
      reporters: ['stu-demo-4'],
      rawText: 'Wi-Fi LED on corridor ceiling router is flashing red constantly.',
      language: 'en',
      issue: 'Corridor Access Point hardware fault',
      title: 'Corridor AP blinking red H1-F2',
      summaryEn: 'Central ceiling router for 2nd floor showing hardware failure light.',
      category: 'internet',
      subtype: 'Wi-Fi',
      departmentId: 'internet',
      urgency: 'high',
      confidence: 0.98,
      safetyFlags: ['none'],
      hostel: 'Hostel 1',
      floor: 2,
      room: 'Wi-Fi Access Point',
      locationCode: 'H1-F2-WIFI',
      pinX: 50,
      pinY: 50,
      status: 'Open',
      createdAt: now - 1 * 3600 * 1000,
      updatedAt: now - 1 * 3600 * 1000,
      slaDueAt: calculateSlaDueAt(now - 1 * 3600 * 1000, 'high'),
      isSynthetic: true,
    },
    {
      id: 'demo_plumb_1',
      ticketId: 'CC-0014',
      reporterId: 'stu-demo-5',
      reporters: ['stu-demo-5'],
      rawText: 'Main tap in washroom is leaking heavily at the joint.',
      language: 'en',
      issue: 'Joint pipe leak',
      title: 'Washroom tap pipe leak H2-F1',
      summaryEn: 'Continuous leaking from washbasin union joint.',
      category: 'plumbing',
      subtype: 'Taps & Fittings',
      departmentId: 'plumbing',
      urgency: 'high',
      confidence: 0.95,
      safetyFlags: ['flooding'],
      hostel: 'Hostel 2',
      floor: 1,
      room: 'Washroom',
      locationCode: 'H2-F1-WASH',
      pinX: 9.5,
      pinY: 27,
      status: 'Resolved',
      assignedTo: 'Ramesh Kumar (Senior Plumber)',
      resolution: {
        note: 'Replaced rubber washer and tightened joint valve.',
        at: now - 12 * 3600 * 1000,
      },
      createdAt: now - 20 * 3600 * 1000,
      updatedAt: now - 12 * 3600 * 1000,
      slaDueAt: calculateSlaDueAt(now - 20 * 3600 * 1000, 'high'),
      isSynthetic: true,
    },
    {
      id: 'demo_plumb_2',
      ticketId: 'CC-0015',
      reporterId: 'stu-demo-6',
      reporters: ['stu-demo-6'],
      rawText: 'Floor drain is choked and water is backing up in H2-F1 washroom.',
      language: 'en',
      issue: 'Floor drain choked',
      title: 'Washroom drain blockage H2-F1',
      summaryEn: 'Drain water overflowing across washroom threshold.',
      category: 'plumbing',
      subtype: 'Drainage',
      departmentId: 'plumbing',
      urgency: 'critical',
      confidence: 0.96,
      safetyFlags: ['flooding'],
      hostel: 'Hostel 2',
      floor: 1,
      room: 'Washroom',
      locationCode: 'H2-F1-WASH',
      pinX: 9.5,
      pinY: 27,
      status: 'Verified',
      assignedTo: 'Santosh Meena (Plumbing Asst)',
      resolution: {
        note: 'Cleared deep drain trap blockage and sanitized.',
        at: now - 48 * 3600 * 1000,
      },
      createdAt: now - 52 * 3600 * 1000,
      updatedAt: now - 40 * 3600 * 1000,
      slaDueAt: calculateSlaDueAt(now - 52 * 3600 * 1000, 'critical'),
      isSynthetic: true,
    },
    {
      id: 'demo_plumb_3',
      ticketId: 'CC-0016',
      reporterId: 'stu-demo-7',
      reporters: ['stu-demo-7'],
      rawText: 'Water pressure in taps is zero, no water coming in H2-F1 washroom.',
      language: 'en',
      issue: 'No water supply in washroom',
      title: 'No water supply in H2-F1 washroom',
      summaryEn: 'Taps completely dry on ground floor wing.',
      category: 'plumbing',
      subtype: 'Water Supply',
      departmentId: 'plumbing',
      urgency: 'high',
      confidence: 0.92,
      safetyFlags: ['none'],
      hostel: 'Hostel 2',
      floor: 1,
      room: 'Washroom',
      locationCode: 'H2-F1-WASH',
      pinX: 9.5,
      pinY: 27,
      status: 'In Progress',
      assignedTo: 'Ramesh Kumar (Senior Plumber)',
      createdAt: now - 5 * 3600 * 1000,
      updatedAt: now - 2 * 3600 * 1000,
      slaDueAt: calculateSlaDueAt(now - 5 * 3600 * 1000, 'high'),
      isSynthetic: true,
    },
    {
      id: 'demo_overdue_1',
      ticketId: 'CC-0017',
      reporterId: 'stu-demo-8',
      reporters: ['stu-demo-8'],
      rawText: 'Ceiling fan makes grinding noise and regulator sparks in Room 104.',
      language: 'en',
      issue: 'Fan grinding and sparks from regulator',
      title: 'Fan grinding and switch sparking R104',
      summaryEn: 'Electrical switch regulator sparking when turned on.',
      category: 'electricity',
      subtype: 'Switches & Sockets',
      departmentId: 'electricity',
      urgency: 'high',
      confidence: 0.98,
      safetyFlags: ['sparks_or_burning'],
      hostel: 'Hostel 1',
      floor: 1,
      room: 'Room 104',
      locationCode: 'H1-F1-R104',
      pinX: 74.5,
      pinY: 22,
      status: 'Open',
      createdAt: now - 10 * 3600 * 1000,
      updatedAt: now - 10 * 3600 * 1000,
      slaDueAt: now - 4 * 3600 * 1000,
      isSynthetic: true,
    },
    {
      id: 'demo_elec_1',
      ticketId: 'CC-0018',
      reporterId: 'stu-demo-9',
      reporters: ['stu-demo-9'],
      rawText: 'Tube light flickering continuously in Room 305.',
      language: 'en',
      issue: 'Tube light starter fault',
      title: 'Flickering light in Room 305',
      summaryEn: 'Tube light starter needs replacement.',
      category: 'electricity',
      subtype: 'Fans & Lights',
      departmentId: 'electricity',
      urgency: 'low',
      confidence: 0.92,
      safetyFlags: ['none'],
      hostel: 'Hostel 1',
      floor: 3,
      room: 'Room 305',
      locationCode: 'H1-F3-R305',
      pinX: 25.5,
      pinY: 78,
      status: 'Assigned',
      assignedTo: 'Anil Verma (Electrician)',
      createdAt: now - 8 * 3600 * 1000,
      updatedAt: now - 4 * 3600 * 1000,
      slaDueAt: calculateSlaDueAt(now - 8 * 3600 * 1000, 'low'),
      isSynthetic: true,
    },
    {
      id: 'demo_clean_1',
      ticketId: 'CC-0019',
      reporterId: 'stu-demo-10',
      reporters: ['stu-demo-10'],
      rawText: 'Garbage bin near stairs overflowing since yesterday.',
      language: 'en',
      issue: 'Overflowing corridor trash bin',
      title: 'Garbage accumulation near stairs',
      summaryEn: 'Trash can in right wing corridor needs emptying.',
      category: 'cleanliness',
      subtype: 'Garbage Collection',
      departmentId: 'cleanliness',
      urgency: 'medium',
      confidence: 0.89,
      safetyFlags: ['none'],
      hostel: 'Hostel 2',
      floor: 2,
      room: 'Stairs',
      locationCode: 'H2-F2-STAIR',
      pinX: 90.5,
      pinY: 27,
      status: 'Open',
      createdAt: now - 6 * 3600 * 1000,
      updatedAt: now - 6 * 3600 * 1000,
      slaDueAt: calculateSlaDueAt(now - 6 * 3600 * 1000, 'medium'),
      isSynthetic: true,
    },
    {
      id: 'demo_clean_2',
      ticketId: 'CC-0020',
      reporterId: 'stu-demo-11',
      reporters: ['stu-demo-11'],
      rawText: 'Spilled soft drink in front of Room 207 corridor floor.',
      language: 'en',
      issue: 'Sticky floor spill',
      title: 'Corridor sticky floor spill H2-F2',
      summaryEn: 'Liquid spill requires mopping in corridor.',
      category: 'cleanliness',
      subtype: 'Corridors',
      departmentId: 'cleanliness',
      urgency: 'low',
      confidence: 0.88,
      safetyFlags: ['none'],
      hostel: 'Hostel 2',
      floor: 2,
      room: 'Room 207',
      locationCode: 'H2-F2-R207',
      pinX: 58.5,
      pinY: 78,
      status: 'Verified',
      assignedTo: 'Sunita Devi (Housekeeping Lead)',
      createdAt: now - 14 * 3600 * 1000,
      updatedAt: now - 10 * 3600 * 1000,
      slaDueAt: calculateSlaDueAt(now - 14 * 3600 * 1000, 'low'),
      isSynthetic: true,
    },
    {
      id: 'demo_water_cooler',
      ticketId: 'CC-0021',
      reporterId: 'stu-demo-12',
      reporters: ['stu-demo-12'],
      rawText: 'Water cooler dispensing warm water instead of cold water.',
      language: 'en',
      issue: 'Water cooler compressor fault',
      title: 'Water cooler not chilling H1-F1',
      summaryEn: 'Drinking water dispenser unit cooling system off.',
      category: 'plumbing',
      subtype: 'Drinking Water',
      departmentId: 'plumbing',
      urgency: 'medium',
      confidence: 0.93,
      safetyFlags: ['none'],
      hostel: 'Hostel 1',
      floor: 1,
      room: 'Water Cooler',
      locationCode: 'H1-F1-COOL',
      pinX: 9.5,
      pinY: 73,
      status: 'Open',
      createdAt: now - 7 * 3600 * 1000,
      updatedAt: now - 7 * 3600 * 1000,
      slaDueAt: calculateSlaDueAt(now - 7 * 3600 * 1000, 'medium'),
      isSynthetic: true,
    },
  ];

  const sampleNotices: Notice[] = [
    {
      id: 'demo_not_1',
      hostel: 'Hostel 1',
      floor: 2,
      messageEn:
        'Known issue: Wi-Fi outage on Hostel 1 Floor 2 — IT team working on it (Incident #INC-001)',
      messageHi:
        'ज्ञात समस्या: हॉस्टल 1 मंज़िल 2 पर वाई-फ़ाई बाधित — आईटी टीम कार्यरत है (समस्या #INC-001)',
      active: true,
      meTooCount: 4,
      createdAt: now - 2 * 3600 * 1000,
    },
  ];

  const activeUser = getCachedUser();
  const campusId = getEffectiveCampusId(activeUser);
  const taggedTickets = demoTickets.map((t) => ({ ...t, campusId }));
  const taggedNotices = sampleNotices.map((n) => ({ ...n, campusId }));

  try {
    await fetch('/api/data/demo-seed', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ demoTickets: taggedTickets, sampleNotices: taggedNotices }),
    });
  } catch {}

  const existing = getLocalStore<Ticket[]>('tickets', []);
  const nonSynthetic = existing.filter((t) => !(t.isSynthetic && getEffectiveCampusId(t) === campusId));
  setLocalStore('tickets', [...taggedTickets, ...nonSynthetic]);
  setLocalStore('notices', taggedNotices);

  await checkAndTriggerOverdueEscalations();
}

export async function clearDemoDataset(): Promise<void> {
  const activeUser = getCachedUser();
  const campusId = getEffectiveCampusId(activeUser);
  try {
    await fetch('/api/data/demo-clear', {
      method: 'POST',
      headers: getAuthHeaders(),
    });
  } catch {}

  const existing = getLocalStore<Ticket[]>('tickets', []);
  const retained = existing.filter((t) => !(t.isSynthetic && getEffectiveCampusId(t) === campusId));
  setLocalStore('tickets', retained);
  setLocalStore('escalations', []);
  setLocalStore('duplicates', []);
  setLocalStore('incidents', []);
  setLocalStore('notices', []);
}
