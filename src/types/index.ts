export type UserRole = 'student' | 'staff' | 'supervisor' | 'admin';

export type DepartmentId = 'plumbing' | 'electricity' | 'cleanliness' | 'internet';

export type Category = DepartmentId | 'unclear';

export type Urgency = 'low' | 'medium' | 'high' | 'critical';

export type TicketStatus =
  | 'Open'
  | 'Assigned'
  | 'In Progress'
  | 'Resolved'
  | 'Verified'
  | 'Reopened';

export type SafetyFlag =
  | 'water_near_electric'
  | 'sparks_or_burning'
  | 'exposed_wire'
  | 'flooding'
  | 'structural'
  | 'none';

export type ZoneKind =
  | 'room'
  | 'common'
  | 'corridor'
  | 'stairs'
  | 'entrance'
  | 'washroom'
  | 'utility';

export interface SchematicZone {
  id: string;
  code: string;
  label: string;
  type: 'room' | 'common';
  zoneKind?: ZoneKind;
  isAssumed?: boolean;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  center: { x: number; y: number };
}

export interface FloorGenerationInput {
  roomsInput: string;
  commonAreasInput: string;
  corridorStyle: 'central-corridor' | 'l-shaped' | 'courtyard' | 'single-wing';
  stairsInfo: string;
  entrancesInfo: string;
  sharedFacilities: string[];
  notes?: string;
}

export interface CampusFloorMap {
  floorNumber: number;
  floorLabel: string;
  zones: SchematicZone[];
  assumptions: string[];
  layoutSummary?: string;
  inputSpec?: FloorGenerationInput;
  generatedBy?: 'ai' | 'manual' | 'default';
  updatedAt: number;
}

export interface CampusBuilding {
  id: string;
  name: string;
  code: string;
  type: 'hostel' | 'academic' | 'facility' | 'other';
  totalFloors: number;
  floors: CampusFloorMap[];
}

export interface CampusOrganization {
  id: string;
  name: string;
  code: string;
  domains: string[];
  allowedDomains?: string[];
  city?: string;
  description?: string;
  status: 'draft' | 'published';
  wizardStep: 1 | 2 | 3 | 4;
  version: number;
  adminUids: string[];
  buildings: CampusBuilding[];
  draftBuildings?: CampusBuilding[];
  createdAt: number;
  updatedAt: number;
  publishedAt?: number;
}

export interface TicketLocationSnapshot {
  campusId: string;
  buildingId?: string;
  buildingName: string;
  floor: number;
  floorLabel?: string;
  room: string;
  locationCode: string;
  pinX: number;
  pinY: number;
  mapVersion: number;
  capturedAt: number;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  campusId?: string;
  campusName?: string;
  isCampusCreator?: boolean;
  department?: DepartmentId;
  subdepartment?: string;
  studentId?: string;
  hostel?: string;
  room?: string;
  language: 'en' | 'hi';
  emailVerified?: boolean;
  approved?: boolean;
}

export interface TicketResolution {
  note: string;
  proofPhotoBase64?: string;
  photoBase64?: string;
  resolvedBy?: string;
  resolvedAt?: number;
  at?: number;
}

export interface Ticket {
  id: string; // Firestore document ID
  ticketId: string; // Human-readable atomic ID: CC-0001
  idempotencyKey?: string; // Prevents duplicate creation on network retry
  campusId?: string;
  buildingId?: string;
  mapVersion?: number;
  locationSnapshot?: TicketLocationSnapshot;
  reporterId: string;
  reporters: string[];
  rawText: string;
  language: 'en' | 'hi' | 'hinglish';
  issue: string;
  title: string;
  summaryEn: string;
  category: Category;
  subtype: string | null;
  departmentId: DepartmentId | 'unclear';
  urgency: Urgency;
  confidence: number;
  photoBase64?: string;
  photoObservation?: string | null;
  photoMatchesText?: 'yes' | 'no' | 'uncertain' | 'no_photo';
  safetyFlags: SafetyFlag[];
  hostel: string;
  floor: number;
  room: string;
  locationCode: string;
  pinX: number;
  pinY: number;
  status: TicketStatus;
  assignedTo?: string;
  mergedInto?: string;
  duplicateOf?: string;
  incidentId?: string;
  upvotes?: number;
  downvotes?: number;
  netVotes?: number;
  upvotedUsers?: string[];
  downvotedUsers?: string[];
  upvotedRooms?: string[];
  resolution?: TicketResolution;
  acknowledgedAt?: number;
  createdAt: number;
  updatedAt: number;
  slaDueAt: number;
  isSynthetic?: boolean;
}

export interface TicketEvent {
  id: string;
  actorId: string;
  actorRole: UserRole;
  actorName?: string;
  type:
    | 'created'
    | 'routed'
    | 'assigned'
    | 'status_changed'
    | 'status_change'
    | 'merged'
    | 'reopened'
    | 'verified'
    | 'escalated'
    | 'note'
    | 'privacy_reveal'
    | 'resolved';
  note: string;
  oldValue?: string;
  newValue?: string;
  timestamp: number;
}

export interface DuplicateCandidate {
  id: string;
  campusId?: string;
  ticketId: string;
  candidateId: string;
  departmentId?: DepartmentId;
  verdict: 'identical' | 'related' | 'different';
  reason: string;
  reviewState: 'pending' | 'merged' | 'dismissed' | 'rejected' | 'linked';
  reviewedBy?: string;
  createdAt: number;
}

export interface Incident {
  id: string;
  incidentId?: string;
  campusId?: string;
  title: string;
  category: DepartmentId;
  hostel: string;
  floor: number;
  locationCode?: string;
  rootCauseSuggestion: string;
  ticketIds: string[];
  status: 'investigating' | 'fixing' | 'resolved';
  broadcastNoticeId?: string;
  createdBy?: string;
  createdAt: number;
}

export interface Notice {
  id: string;
  campusId?: string;
  incidentId?: string;
  hostel: string;
  floor: number;
  messageEn: string;
  messageHi: string;
  active: boolean;
  meTooCount?: number;
  createdAt: number;
}

export interface Escalation {
  id: string;
  campusId?: string;
  ticketId: string;
  departmentId?: DepartmentId;
  type: 'sla_overdue' | 'repeated_reopen';
  triggeredAt: number;
}

export interface Technician {
  id: string;
  campusId?: string;
  name: string;
  department: DepartmentId;
  subteam?: string;
  skills: string[];
  available: boolean;
  workload: number;
}

export interface GeminiIntakeResult {
  issue: string;
  title: string;
  summary_en: string;
  detected_language: 'en' | 'hi' | 'hinglish';
  category: Category;
  subtype: string | null;
  urgency_suggestion: Urgency;
  confidence: number;
  photo_observation: string | null;
  photo_matches_text: 'yes' | 'no' | 'uncertain' | 'no_photo';
  missing_fields: Array<'issue' | 'hostel' | 'floor' | 'room' | 'category'>;
  follow_up_questions: string[];
  safety_flags: SafetyFlag[];
  suggested_location: string | null;
}
