import {
  CampusOrganization,
  DuplicateCandidate,
  Escalation,
  Incident,
  Notice,
  Technician,
  Ticket,
  UserProfile,
} from '../types';
import { DEFAULT_CAMPUS_ID } from '../data/campus';

export function getEffectiveCampusId(entity?: { campusId?: string } | null): string {
  return entity?.campusId && entity.campusId.trim() ? entity.campusId.trim() : DEFAULT_CAMPUS_ID;
}

export function isSameCampus(
  a?: { campusId?: string } | null,
  b?: { campusId?: string } | null
): boolean {
  return getEffectiveCampusId(a) === getEffectiveCampusId(b);
}

/**
 * Only authorized campus admins belonging to the specific campus can edit or publish its layout.
 */
export function canManageCampus(
  user: UserProfile | null | undefined,
  campus: CampusOrganization | null | undefined
): boolean {
  if (!user || !campus) return false;
  if (user.role !== 'admin') return false;
  if (Array.isArray(campus.adminUids) && campus.adminUids.includes(user.uid)) {
    return true;
  }
  return getEffectiveCampusId(user) === campus.id;
}

/**
 * Pure RBAC, Multi-Campus Isolation & Department Isolation Policy Engine
 * Enforced identically on Backend API (/server.ts) and Client Service Layer (src/services/db.ts).
 *
 * Rules:
 * 0. Multi-Campus Isolation: Every user (including admins, supervisors, staff, and students) can ONLY access
 *    records belonging to their own campusId.
 * 1. Admin: May view and manage all tickets, technicians, duplicates, incidents, and escalations within their campus.
 * 2. Supervisor: May view all escalations and department tickets within their campus if unscoped, or scoped to their assigned department if set.
 * 3. Staff (plumbing, electricity, cleanliness, internet): Strictly restricted to their authorized department
 *    within their campus.
 * 4. Student: Strictly restricted to their own tickets within their campus.
 */
export function canAccessTicket(
  user: UserProfile | null | undefined,
  ticket: Ticket | null | undefined
): boolean {
  if (!user || !ticket) return false;

  // Enforce strict campus isolation
  if (!isSameCampus(user, ticket)) {
    return false;
  }

  if (user.role === 'admin') {
    return true;
  }

  if (user.role === 'supervisor') {
    if (user.department) {
      return ticket.departmentId === user.department || ticket.category === user.department;
    }
    return true;
  }

  if (user.role === 'staff') {
    if (!user.department) return false;
    const deptMatch = ticket.departmentId === user.department || ticket.category === user.department;
    if (!deptMatch) return false;
    if (user.subdepartment && ticket.subtype) {
      return ticket.subtype.toLowerCase() === user.subdepartment.toLowerCase();
    }
    return true;
  }

  if (user.role === 'student') {
    return (
      ticket.reporterId === user?.uid ||
      (Array.isArray(ticket.reporters) && ticket.reporters.includes(user?.uid || ''))
    );
  }

  return false;
}

export function canModifyTicket(
  user: UserProfile | null | undefined,
  ticket: Ticket | null | undefined,
  updates?: Partial<Ticket>
): boolean {
  if (!canAccessTicket(user, ticket) || !user || !ticket) return false;

  // Prevent ticketId, reporterId, or campusId tampering
  if (updates?.ticketId && updates.ticketId !== ticket.ticketId) return false;
  if (updates?.reporterId && updates.reporterId !== ticket.reporterId) return false;
  if (updates?.campusId && updates.campusId !== getEffectiveCampusId(ticket)) return false;

  if (user.role === 'student') {
    if (updates?.status && !['Verified', 'Reopened'].includes(updates.status)) {
      return false;
    }
    if (updates?.assignedTo || updates?.departmentId || updates?.urgency) {
      return false;
    }
    return true;
  }

  if (user.role === 'staff') {
    if (updates?.departmentId && updates.departmentId !== user.department) {
      return false;
    }
    return true;
  }

  return user.role === 'supervisor' || user.role === 'admin';
}

export function filterAuthorizedTickets(
  user: UserProfile | null | undefined,
  tickets: Ticket[]
): Ticket[] {
  if (!user) return [];
  return tickets.filter((t) => canAccessTicket(user, t));
}

export function filterAuthorizedTechnicians(
  user: UserProfile | null | undefined,
  technicians: Technician[]
): Technician[] {
  if (!user || user.role === 'student') return [];
  const campusTechs = technicians.filter((t) => isSameCampus(user, t));
  if (user.role === 'admin') return campusTechs;
  if (user.role === 'supervisor') {
    return user.department
      ? campusTechs.filter((t) => t.department === user.department)
      : campusTechs;
  }
  if (user.role === 'staff') {
    if (!user.department) return [];
    return campusTechs.filter((t) => t.department === user.department);
  }
  return [];
}

export function filterAuthorizedDuplicates(
  user: UserProfile | null | undefined,
  duplicates: DuplicateCandidate[],
  allTickets: Ticket[]
): DuplicateCandidate[] {
  if (!user || user.role === 'student') return [];
  const ticketMap = new Map<string, Ticket>();
  for (const t of allTickets) {
    if (isSameCampus(user, t)) {
      ticketMap.set(t.ticketId, t);
      ticketMap.set(t.id, t);
    }
  }

  return duplicates.filter((dup) => {
    if (!isSameCampus(user, dup)) return false;
    if (user.role === 'admin') return true;
    const source = ticketMap.get(dup.ticketId);
    const target = ticketMap.get(dup.candidateId);
    if (dup.departmentId && user.role === 'staff') {
      return dup.departmentId === user.department;
    }
    if (source && !canAccessTicket(user, source)) return false;
    if (target && !canAccessTicket(user, target)) return false;
    return Boolean(source || target);
  });
}

export function filterAuthorizedIncidents(
  user: UserProfile | null | undefined,
  incidents: Incident[]
): Incident[] {
  if (!user || user.role === 'student') return [];
  const campusIncidents = incidents.filter((inc) => isSameCampus(user, inc));
  if (user.role === 'admin') return campusIncidents;
  if (user.role === 'supervisor') {
    return user.department
      ? campusIncidents.filter((inc) => inc.category === user.department)
      : campusIncidents;
  }
  if (user.role === 'staff') {
    if (!user.department) return [];
    return campusIncidents.filter((inc) => inc.category === user.department);
  }
  return [];
}

export function filterAuthorizedNotices(
  user: UserProfile | null | undefined,
  notices: Notice[]
): Notice[] {
  if (!user) return notices.filter((n) => getEffectiveCampusId(n) === DEFAULT_CAMPUS_ID);
  return notices.filter((n) => isSameCampus(user, n));
}

export function filterAuthorizedEscalations(
  user: UserProfile | null | undefined,
  escalations: Escalation[],
  allTickets: Ticket[]
): Escalation[] {
  if (!user || user.role === 'student') return [];
  const ticketMap = new Map<string, Ticket>();
  for (const t of allTickets) {
    if (isSameCampus(user, t)) {
      ticketMap.set(t.ticketId, t);
      ticketMap.set(t.id, t);
    }
  }

  return escalations.filter((esc) => {
    if (!isSameCampus(user, esc)) return false;
    if (user.role === 'admin') return true;
    if (esc.departmentId && user.role === 'staff') {
      return esc.departmentId === user.department;
    }
    const ticket = ticketMap.get(esc.ticketId);
    if (!ticket) return user.role === 'supervisor';
    return canAccessTicket(user, ticket);
  });
}

/**
 * Prevent role or department self-escalation during registration or profile update.
 */
export function sanitizeProfileMutation(
  actor: UserProfile | null | undefined,
  existingProfile: UserProfile | null | undefined,
  requestedProfile: Partial<UserProfile>
): UserProfile {
  const isAdmin = actor?.role === 'admin';

  if (!existingProfile) {
    return {
      uid: String(requestedProfile.uid || `stu_${Date.now()}`),
      name: String(requestedProfile.name || 'Student').trim(),
      email: String(requestedProfile.email || '').trim().toLowerCase(),
      role: isAdmin && requestedProfile.role ? requestedProfile.role : 'student',
      campusId: getEffectiveCampusId(requestedProfile),
      campusName: requestedProfile.campusName,
      isCampusCreator: Boolean(isAdmin && requestedProfile.isCampusCreator),
      department: isAdmin ? requestedProfile.department : undefined,
      subdepartment: isAdmin ? requestedProfile.subdepartment : undefined,
      studentId: requestedProfile.studentId ? String(requestedProfile.studentId).trim() : undefined,
      hostel: requestedProfile.hostel || 'Hostel 1',
      room: requestedProfile.room || 'Room 101',
      language: requestedProfile.language === 'hi' ? 'hi' : 'en',
      emailVerified: Boolean(requestedProfile.emailVerified),
      approved: isAdmin ? Boolean(requestedProfile.approved) : true,
    };
  }

  return {
    ...existingProfile,
    name: requestedProfile.name ? String(requestedProfile.name).trim() : existingProfile.name,
    hostel: requestedProfile.hostel ?? existingProfile.hostel,
    room: requestedProfile.room ?? existingProfile.room,
    language:
      requestedProfile.language === 'hi'
        ? 'hi'
        : requestedProfile.language === 'en'
        ? 'en'
        : existingProfile.language,
    campusId: existingProfile.campusId || getEffectiveCampusId(requestedProfile),
    campusName: requestedProfile.campusName ?? existingProfile.campusName,
    role: isAdmin && requestedProfile.role ? requestedProfile.role : existingProfile.role,
    department:
      isAdmin && 'department' in requestedProfile
        ? requestedProfile.department
        : existingProfile.department,
    subdepartment:
      isAdmin && 'subdepartment' in requestedProfile
        ? requestedProfile.subdepartment
        : existingProfile.subdepartment,
  };
}

/**
 * Atomic, collision-free Ticket ID Sequence Allocator
 * Ensures unique CC-0001, CC-0002, ... across concurrent calls, retries (idempotencyKey), and existing tickets.
 */
export class AtomicTicketSequence {
  private currentSeq: number;
  private allocatedIds: Set<string>;
  private idempotencyMap: Map<string, string>;

  constructor(initialNextNumber = 1, existingTicketIds: string[] = []) {
    this.allocatedIds = new Set<string>();
    this.idempotencyMap = new Map<string, string>();
    let maxFound = Math.max(0, initialNextNumber - 1);

    for (const id of existingTicketIds) {
      if (id) {
        this.allocatedIds.add(id.toUpperCase());
        const m = id.match(/^CC-(\d+)$/i);
        if (m) {
          const num = parseInt(m[1], 10);
          if (!Number.isNaN(num) && num > maxFound) {
            maxFound = num;
          }
        }
      }
    }
    this.currentSeq = maxFound;
  }

  public syncExisting(existingTicketIds: string[], minCounter = 0): void {
    if (minCounter > this.currentSeq) {
      this.currentSeq = minCounter;
    }
    for (const id of existingTicketIds) {
      if (!id) continue;
      const normalized = id.toUpperCase();
      this.allocatedIds.add(normalized);
      const m = normalized.match(/^CC-(\d+)$/);
      if (m) {
        const num = parseInt(m[1], 10);
        if (!Number.isNaN(num) && num > this.currentSeq) {
          this.currentSeq = num;
        }
      }
    }
  }

  public nextTicketId(idempotencyKey?: string): string {
    return this.allocateNext(idempotencyKey).ticketId;
  }

  public allocateNext(idempotencyKey?: string): {
    ticketId: string;
    sequenceNumber: number;
    isDuplicateRequest: boolean;
  } {
    if (idempotencyKey && this.idempotencyMap.has(idempotencyKey)) {
      const existingId = this.idempotencyMap.get(idempotencyKey)!;
      const m = existingId.match(/^CC-(\d+)$/);
      const seqNum = m ? parseInt(m[1], 10) : this.currentSeq;
      return {
        ticketId: existingId,
        sequenceNumber: seqNum,
        isDuplicateRequest: true,
      };
    }

    let candidate = '';
    do {
      this.currentSeq += 1;
      candidate = `CC-${String(this.currentSeq).padStart(4, '0')}`;
    } while (this.allocatedIds.has(candidate));

    this.allocatedIds.add(candidate);
    if (idempotencyKey) {
      this.idempotencyMap.set(idempotencyKey, candidate);
    }
    return {
      ticketId: candidate,
      sequenceNumber: this.currentSeq,
      isDuplicateRequest: false,
    };
  }

  public getCurrentSequence(): number {
    return this.currentSeq;
  }

  public getNextNumber(): number {
    return this.currentSeq + 1;
  }
}
