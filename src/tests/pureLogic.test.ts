import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getDepartmentForCategory,
  isValidSubtype,
} from '../data/routingGuide';

import {
  findZoneByCoordinates,
  formatHumanLocation,
  getHostelCode,
  getLocationCode,
} from '../data/campus';

import {
  calculateSlaDueAt,
  enforceSafetyUrgency,
  getSlaStatus,
  isTicketOverdue,
  SLA_HOURS,
} from '../utils/sla';

import {
  maskEmail,
  maskPhoneNumber,
  maskSensitiveText,
  maskStudentId,
} from '../utils/privacyGuard';

import {
  INITIAL_TECHNICIANS,
  rankTechniciansForTicket,
} from '../utils/smartDispatch';

import { computeCampusAnalytics } from '../utils/analytics';
import {
  AtomicTicketSequence,
  canAccessTicket,
  canModifyTicket,
  filterAuthorizedDuplicates,
  filterAuthorizedEscalations,
  filterAuthorizedIncidents,
  filterAuthorizedTechnicians,
  filterAuthorizedTickets,
  sanitizeProfileMutation,
} from '../utils/authorization';
import {
  getTranslation,
  I18N,
  translateCategory,
  translateHostel,
  translateRoomLabel,
  translateStatus,
  translateUrgency,
} from '../data/i18n';
import { DuplicateCandidate, Escalation, Incident, Ticket, UserProfile } from '../types';

test('Routing guide deterministically maps categories to departments', () => {
  assert.equal(getDepartmentForCategory('plumbing'), 'plumbing');
  assert.equal(getDepartmentForCategory('electricity'), 'electricity');
  assert.equal(getDepartmentForCategory('cleanliness'), 'cleanliness');
  assert.equal(getDepartmentForCategory('internet'), 'internet');
  assert.equal(getDepartmentForCategory('unclear'), 'unclear');

  assert.equal(isValidSubtype('plumbing', 'Water Supply'), true);
  assert.equal(isValidSubtype('plumbing', 'Fans & Lights'), false);
  assert.equal(isValidSubtype('internet', 'Wi-Fi'), true);
});

test('Campus location model coordinates and zone mapping', () => {
  assert.equal(getHostelCode('Hostel 1'), 'H1');
  assert.equal(getHostelCode('Hostel 2'), 'H2');

  const roomZone = findZoneByCoordinates('Hostel 1', 2, 25, 20);
  assert.equal(roomZone.id, 'R201');
  assert.equal(roomZone.type, 'room');

  const wifiZone = findZoneByCoordinates('Hostel 2', 3, 50, 50);
  assert.equal(wifiZone.id, 'WIFI');

  const washZone = findZoneByCoordinates('Hostel 1', 1, 8, 25);
  assert.equal(washZone.id, 'WASH');

  assert.equal(
    formatHumanLocation('Hostel 1', 3, 'Room 305'),
    'Hostel 1 · Floor 3 · Room 305'
  );
  assert.equal(getLocationCode('Hostel 1', 3, 'R305'), 'H1-F3-R305');
  assert.equal(getLocationCode('Hostel 2', 2, 'WASH'), 'H2-F2-WASH');
});

test('SLA rules, CampusShield enforcement and countdowns', () => {
  assert.equal(SLA_HOURS.critical, 2);
  assert.equal(SLA_HOURS.high, 6);
  assert.equal(SLA_HOURS.medium, 24);
  assert.equal(SLA_HOURS.low, 72);

  const enforced1 = enforceSafetyUrgency('low', ['water_near_electric']);
  assert.equal(enforced1, 'high');

  const enforced2 = enforceSafetyUrgency('critical', ['sparks_or_burning']);
  assert.equal(enforced2, 'critical');

  const now = 1000000;
  const highDue = calculateSlaDueAt(now, 'high');
  assert.equal(highDue, now + 6 * 3600 * 1000);

  assert.equal(isTicketOverdue(highDue, now + 3600 * 1000), false);
  assert.equal(isTicketOverdue(highDue, now + 7 * 3600 * 1000), true);

  const status1 = getSlaStatus(highDue, now + 1000, false);
  assert.equal(status1.isOverdue, false);
  assert.equal(status1.badgeColor, 'green');

  const statusOverdue = getSlaStatus(highDue, now + 8 * 3600 * 1000, false);
  assert.equal(statusOverdue.isOverdue, true);
  assert.equal(statusOverdue.badgeColor, 'red');
});

test('PrivacyGuard masks personal details in complaint text', () => {
  assert.equal(maskPhoneNumber('9876543210'), '98******10');
  assert.equal(maskEmail('aarav.student@college.edu'), 'aa***t@college.edu');
  assert.equal(maskStudentId('2024CS0129'), '20******29');

  const text = 'Call me at 9876543210 or email priya@campus.in, student ID 2024CS0129';
  const masked = maskSensitiveText(text);
  assert.equal(masked.includes('9876543210'), false);
  assert.equal(masked.includes('priya@campus.in'), false);
  assert.equal(masked.includes('2024CS0129'), false);
  assert.equal(masked.includes('98******10'), true);
});

test('Smart Dispatch ranks technicians accurately', () => {
  const sampleTicket: Ticket = {
    id: 't-1',
    ticketId: 'CC-0001',
    reporterId: 'stu-1',
    reporters: ['stu-1'],
    rawText: 'Tap broken',
    language: 'en',
    issue: 'Tap broken',
    title: 'Tap Leak',
    summaryEn: 'Tap is leaking',
    category: 'plumbing',
    subtype: 'Taps & Fittings',
    departmentId: 'plumbing',
    urgency: 'medium',
    confidence: 0.9,
    safetyFlags: ['none'],
    hostel: 'Hostel 1',
    floor: 2,
    room: 'Room 204',
    locationCode: 'H1-F2-R204',
    pinX: 25,
    pinY: 20,
    status: 'Open',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    slaDueAt: Date.now() + 24 * 3600 * 1000,
  };

  const ranked = rankTechniciansForTicket(sampleTicket, INITIAL_TECHNICIANS, []);
  assert.ok(ranked.length >= 2);
  assert.ok(ranked[0].technician.skills.includes('Taps & Fittings'));
  assert.ok(ranked[0].score > 100);
});

test('Analytics calculates Verified-resolution rate and stats correctly', () => {
  const dummyTickets: Ticket[] = [
    {
      id: '1',
      ticketId: 'CC-0001',
      reporterId: 's1',
      reporters: ['s1'],
      rawText: 'text',
      language: 'en',
      issue: 'issue',
      title: 'Title',
      summaryEn: 'Summary',
      category: 'plumbing',
      subtype: 'Water Supply',
      departmentId: 'plumbing',
      urgency: 'medium',
      confidence: 1,
      safetyFlags: ['none'],
      hostel: 'Hostel 1',
      floor: 2,
      room: 'Room 204',
      locationCode: 'H1-F2-R204',
      pinX: 25,
      pinY: 20,
      status: 'Verified',
      createdAt: 1000,
      updatedAt: 5000,
      slaDueAt: 20000,
    },
    {
      id: '2',
      ticketId: 'CC-0002',
      reporterId: 's2',
      reporters: ['s2'],
      rawText: 'text 2',
      language: 'en',
      issue: 'issue',
      title: 'Title 2',
      summaryEn: 'Summary 2',
      category: 'plumbing',
      subtype: 'Water Supply',
      departmentId: 'plumbing',
      urgency: 'high',
      confidence: 1,
      safetyFlags: ['none'],
      hostel: 'Hostel 1',
      floor: 2,
      room: 'Room 204',
      locationCode: 'H1-F2-R204',
      pinX: 25,
      pinY: 20,
      status: 'Resolved',
      createdAt: 1000,
      updatedAt: 6000,
      slaDueAt: 20000,
    },
  ];

  const analytics = computeCampusAnalytics(dummyTickets);
  assert.equal(analytics.totalTickets, 2);
  assert.equal(analytics.verifiedCount, 1);
  assert.equal(analytics.resolvedCount, 1);
  assert.equal(analytics.verifiedResolutionRate, 50);
});

test('P0 RBAC & Department Isolation: Cleanliness staff strictly blocked from Plumbing/Electricity/Internet', () => {
  const cleanlinessStaff: UserProfile = {
    uid: 'staff-clean',
    name: 'Sunita Devi',
    email: 'cleanliness@campus.demo',
    role: 'staff',
    department: 'cleanliness',
    language: 'en',
    approved: true,
  };

  const plumbingSubteamStaff: UserProfile = {
    uid: 'staff-plumb-drain',
    name: 'Santosh Meena',
    email: 'drainage@campus.demo',
    role: 'staff',
    department: 'plumbing',
    subdepartment: 'Drainage',
    language: 'en',
    approved: true,
  };

  const studentA: UserProfile = {
    uid: 'stu-a',
    name: 'Aarav',
    email: 'student1@campus.demo',
    role: 'student',
    language: 'en',
  };

  const studentB: UserProfile = {
    uid: 'stu-b',
    name: 'Priya',
    email: 'student2@campus.demo',
    role: 'student',
    language: 'hi',
  };

  const adminUser: UserProfile = {
    uid: 'admin-1',
    name: 'Admin',
    email: 'admin@campus.demo',
    role: 'admin',
    language: 'en',
  };

  const tickets: Ticket[] = [
    {
      id: 't-clean',
      ticketId: 'CC-0001',
      reporterId: 'stu-a',
      reporters: ['stu-a'],
      rawText: 'Garbage bin overflowing',
      language: 'en',
      issue: 'Garbage bin overflowing',
      title: 'Garbage overflow',
      summaryEn: 'Garbage bin overflowing',
      category: 'cleanliness',
      subtype: 'Garbage Collection',
      departmentId: 'cleanliness',
      urgency: 'medium',
      confidence: 0.9,
      safetyFlags: ['none'],
      hostel: 'Hostel 1',
      floor: 1,
      room: 'Stairs',
      locationCode: 'H1-F1-STAIR',
      pinX: 50,
      pinY: 50,
      status: 'Open',
      createdAt: 1000,
      updatedAt: 1000,
      slaDueAt: 5000,
    },
    {
      id: 't-plumb-tap',
      ticketId: 'CC-0002',
      reporterId: 'stu-b',
      reporters: ['stu-b'],
      rawText: 'Tap leaking',
      language: 'en',
      issue: 'Tap leaking',
      title: 'Tap leak',
      summaryEn: 'Tap leaking',
      category: 'plumbing',
      subtype: 'Taps & Fittings',
      departmentId: 'plumbing',
      urgency: 'high',
      confidence: 0.9,
      safetyFlags: ['none'],
      hostel: 'Hostel 2',
      floor: 1,
      room: 'Washroom',
      locationCode: 'H2-F1-WASH',
      pinX: 10,
      pinY: 20,
      status: 'Open',
      createdAt: 2000,
      updatedAt: 2000,
      slaDueAt: 6000,
    },
    {
      id: 't-plumb-drain',
      ticketId: 'CC-0003',
      reporterId: 'stu-b',
      reporters: ['stu-b'],
      rawText: 'Drain blocked',
      language: 'en',
      issue: 'Drain blocked',
      title: 'Drain blocked',
      summaryEn: 'Drain blocked',
      category: 'plumbing',
      subtype: 'Drainage',
      departmentId: 'plumbing',
      urgency: 'critical',
      confidence: 0.95,
      safetyFlags: ['flooding'],
      hostel: 'Hostel 2',
      floor: 1,
      room: 'Washroom',
      locationCode: 'H2-F1-WASH',
      pinX: 10,
      pinY: 20,
      status: 'Open',
      createdAt: 3000,
      updatedAt: 3000,
      slaDueAt: 7000,
    },
    {
      id: 't-elec',
      ticketId: 'CC-0004',
      reporterId: 'stu-b',
      reporters: ['stu-b'],
      rawText: 'Fan sparking',
      language: 'en',
      issue: 'Fan sparking',
      title: 'Fan sparking',
      summaryEn: 'Fan sparking',
      category: 'electricity',
      subtype: 'Fans & Lights',
      departmentId: 'electricity',
      urgency: 'high',
      confidence: 0.98,
      safetyFlags: ['sparks_or_burning'],
      hostel: 'Hostel 1',
      floor: 2,
      room: 'Room 201',
      locationCode: 'H1-F2-R201',
      pinX: 25,
      pinY: 20,
      status: 'Open',
      createdAt: 4000,
      updatedAt: 4000,
      slaDueAt: 8000,
    },
  ];

  // 1. Cleanliness staff ONLY sees cleanliness ticket
  const cleanStaffVisible = filterAuthorizedTickets(cleanlinessStaff, tickets);
  assert.equal(cleanStaffVisible.length, 1);
  assert.equal(cleanStaffVisible[0].ticketId, 'CC-0001');
  assert.equal(canAccessTicket(cleanlinessStaff, tickets[1]), false);
  assert.equal(canModifyTicket(cleanlinessStaff, tickets[1]), false);
  assert.equal(canModifyTicket(cleanlinessStaff, tickets[3]), false);

  // 2. Plumbing subdepartment staff (Drainage) ONLY sees plumbing + Drainage ticket
  const drainStaffVisible = filterAuthorizedTickets(plumbingSubteamStaff, tickets);
  assert.equal(drainStaffVisible.length, 1);
  assert.equal(drainStaffVisible[0].ticketId, 'CC-0003');

  // 3. Student A ONLY sees their own ticket (CC-0001), never Student B's tickets
  const studentAVisible = filterAuthorizedTickets(studentA, tickets);
  assert.equal(studentAVisible.length, 1);
  assert.equal(studentAVisible[0].ticketId, 'CC-0001');
  assert.equal(canAccessTicket(studentA, tickets[1]), false);

  // 4. Admin sees all tickets
  const adminVisible = filterAuthorizedTickets(adminUser, tickets);
  assert.equal(adminVisible.length, 4);

  // 5. Technicians, Duplicates, Incidents, and Escalations are also strictly isolated by department
  const cleanTechs = filterAuthorizedTechnicians(cleanlinessStaff, INITIAL_TECHNICIANS);
  assert.ok(cleanTechs.length > 0);
  assert.ok(cleanTechs.every((t) => t.department === 'cleanliness'));

  const dups: DuplicateCandidate[] = [
    {
      id: 'd1',
      ticketId: 'CC-0002',
      candidateId: 'CC-0003',
      verdict: 'related',
      reason: 'Same washroom',
      reviewState: 'pending',
      createdAt: 1000,
      departmentId: 'plumbing',
    },
  ];
  assert.equal(filterAuthorizedDuplicates(cleanlinessStaff, dups, tickets).length, 0);

  const incs: Incident[] = [
    {
      id: 'inc1',
      incidentId: 'INC-001',
      title: 'Plumbing Outage',
      rootCauseSuggestion: 'Main valve closed',
      hostel: 'Hostel 2',
      floor: 1,
      category: 'plumbing',
      ticketIds: ['CC-0002', 'CC-0003'],
      status: 'investigating',
      createdAt: 1000,
      createdBy: 'Ramesh',
    },
  ];
  assert.equal(filterAuthorizedIncidents(cleanlinessStaff, incs).length, 0);

  const escs: Escalation[] = [
    {
      id: 'e1',
      ticketId: 'CC-0004',
      type: 'sla_overdue',
      triggeredAt: 5000,
      departmentId: 'electricity',
    },
  ];
  assert.equal(filterAuthorizedEscalations(cleanlinessStaff, escs, tickets).length, 0);

  // 6. Self-escalation prevention: student or staff cannot promote themselves to admin or change department
  const attemptedEscalation = sanitizeProfileMutation(studentA, studentA, {
    role: 'admin',
    department: 'plumbing',
    name: 'Aarav Updated',
  });
  assert.equal(attemptedEscalation.role, 'student');
  assert.equal(attemptedEscalation.department, undefined);
  assert.equal(attemptedEscalation.name, 'Aarav Updated');
});

test('P0 Atomic Ticket Sequence: Sequential CC-0001, CC-0002, idempotency, and 50 concurrent allocations without collision', () => {
  // 1. Fresh sequence starts at CC-0001
  const seq1 = new AtomicTicketSequence(1, []);
  const first = seq1.allocateNext('key-1');
  const second = seq1.allocateNext('key-2');
  assert.equal(first.ticketId, 'CC-0001');
  assert.equal(second.ticketId, 'CC-0002');

  // 2. Idempotency: retrying with the same idempotencyKey returns the exact same ticketId without advancing counter
  const retryFirst = seq1.allocateNext('key-1');
  assert.equal(retryFirst.ticketId, 'CC-0001');
  assert.equal(retryFirst.isDuplicateRequest, true);
  assert.equal(seq1.getNextNumber(), 3);

  // 3. Initializes past existing synthetic ticket IDs (e.g., CC-0010 .. CC-0021)
  const seqWithExisting = new AtomicTicketSequence(1, ['CC-0010', 'CC-0021', 'CC-0015']);
  const nextAfterSynthetic = seqWithExisting.allocateNext();
  assert.equal(nextAfterSynthetic.ticketId, 'CC-0022');

  // 4. 50 concurrent allocations produce 50 strictly unique sequential IDs
  const concurrentSeq = new AtomicTicketSequence(1, []);
  const allocated = Array.from({ length: 50 }, (_, idx) =>
    concurrentSeq.allocateNext(`concurrent_${idx}`).ticketId
  );
  const uniqueSet = new Set(allocated);
  assert.equal(uniqueSet.size, 50);
  assert.equal(allocated[0], 'CC-0001');
  assert.equal(allocated[49], 'CC-0050');
});

test('P1 Complete Hindi Localization: Key parity between en.json and hi.json + dynamic translators', () => {
  const enKeys = Object.keys(I18N.en).sort();
  const hiKeys = Object.keys(I18N.hi).sort();
  assert.deepEqual(enKeys, hiKeys, 'en.json and hi.json must have identical translation keys');

  // Interpolation test
  assert.equal(getTranslation('en', 'stepOf', { step: 2, total: 4 }), 'Step 2 of 4');
  assert.equal(getTranslation('hi', 'stepOf', { step: 2, total: 4 }), 'चरण 2 / 4');

  // Dynamic status/urgency/category/room translators in Hindi
  assert.equal(translateStatus('In Progress', 'hi'), 'कार्य प्रगति पर');
  assert.equal(translateUrgency('critical', 'hi'), 'अति-गंभीर');
  assert.equal(translateCategory('cleanliness', 'hi'), 'सफ़ाई विभाग');
  assert.equal(translateHostel('Hostel 1', 'hi'), 'हॉस्टल 1');
  assert.equal(translateRoomLabel('Room 204', 'hi'), 'कमरा 204');
  assert.equal(translateRoomLabel('Washroom', 'hi'), 'वॉशरूम');
});
