import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Clock,
  MapPin,
  ShieldAlert,
  Wrench,
  Camera,
  CheckCircle,
  Lock,
  Unlock,
  ArrowRight,
  Send,
  AlertCircle,
} from 'lucide-react';
import {
  DepartmentId,
  Technician,
  Ticket,
  TicketEvent,
  TicketStatus,
  UserProfile,
} from '../../types';
import {
  fetchTicketEvents,
  updateTicket,
  getSimulatedNow,
  fetchTechnicians,
  updateTechnicianWorkload,
} from '../../services/db';
import { rankTechniciansForTicket } from '../../utils/smartDispatch';
import { maskSensitiveText } from '../../utils/privacyGuard';
import { getSlaStatus } from '../../utils/sla';
import { compressImage } from '../../utils/imageCompress';
import { canModifyTicket } from '../../utils/authorization';
import {
  translateCategory,
  translateHostel,
  translateRoomLabel,
  translateSafetyFlag,
  translateStatus,
  translateUrgency,
  useT,
} from '../../data/i18n';

interface TicketDetailDrawerProps {
  ticket: Ticket;
  currentUser: UserProfile;
  allTickets: Ticket[];
  onClose: () => void;
  onTicketUpdated: () => void;
}

export const TicketDetailDrawer: React.FC<TicketDetailDrawerProps> = ({
  ticket,
  currentUser,
  allTickets,
  onClose,
  onTicketUpdated,
}) => {
  const { t, language } = useT();

  if (!currentUser) return null;
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [status, setStatus] = useState<TicketStatus>(ticket.status);
  const [assignedTo, setAssignedTo] = useState<string>(ticket.assignedTo || '');
  const [internalNote, setInternalNote] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');
  const [resolutionPhotoBase64, setResolutionPhotoBase64] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [revealedPrivacy, setRevealedPrivacy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showRerouteModal, setShowRerouteModal] = useState(false);
  const [rerouteDepartment, setRerouteDepartment] = useState<DepartmentId>('plumbing');
  const [rerouteReason, setRerouteReason] = useState('');
  const afterPhotoInputRef = useRef<HTMLInputElement>(null);

  const isAuthorizedToModify = canModifyTicket(currentUser, ticket);

  useEffect(() => {
    const load = async () => {
      const evs = await fetchTicketEvents(ticket.id);
      setEvents(evs);
      const techs = await fetchTechnicians(currentUser);
      setTechnicians(techs);
    };
    load();
  }, [ticket.id, currentUser]);

  // Allowed transitions
  const allowedTransitions: Record<TicketStatus, TicketStatus[]> = {
    Open: ['Assigned', 'In Progress', 'Resolved'],
    Assigned: ['In Progress', 'Resolved'],
    'In Progress': ['Resolved'],
    Resolved: ['Verified', 'Reopened'],
    Verified: [],
    Reopened: ['In Progress', 'Resolved'],
  };

  const nextOptions = allowedTransitions[status] || [];

  // Smart suggestions scoped to ticket's department
  const deptTechs = technicians.filter((tech) => tech.department === ticket.departmentId);
  const rankedTechs = rankTechniciansForTicket(ticket, deptTechs, allTickets);
  const topSuggestedTech = rankedTechs[0]?.technician;

  const handleRevealPrivacy = async () => {
    if (currentUser.role !== 'supervisor' && currentUser.role !== 'admin') return;
    setRevealedPrivacy(true);
    await updateTicket(
      ticket.id,
      {},
      {
        actorId: currentUser?.uid || 'staff',
        actorRole: currentUser?.role || 'staff',
        actorName: currentUser?.name || 'Staff',
        type: 'privacy_reveal',
        note: 'Supervisor revealed masked personal details in complaint text for safety verification.',
      }
    );
    const evs = await fetchTicketEvents(ticket.id);
    setEvents(evs);
  };

  const handleAssignTechnician = async (techName: string) => {
    if (!isAuthorizedToModify) {
      setValidationError(t('accessDeniedTitle'));
      return;
    }
    setValidationError(null);
    setSaving(true);
    try {
      const oldAssignee = assignedTo;
      const nextStatus = status === 'Open' && techName ? 'Assigned' : status;
      await updateTicket(
        ticket.id,
        { assignedTo: techName, status: nextStatus },
        {
          actorId: currentUser?.uid || 'staff',
          actorRole: currentUser?.role || 'staff',
          actorName: currentUser?.name || 'Staff',
          type: 'assigned',
          oldValue: oldAssignee || 'Unassigned',
          newValue: techName,
          note: `Technician assigned: ${techName}`,
        }
      );
      if (techName) {
        await updateTechnicianWorkload(techName, 1);
      }
      setAssignedTo(techName);
      setStatus(nextStatus);
      onTicketUpdated();
      const evs = await fetchTicketEvents(ticket.id);
      setEvents(evs);
    } catch (err: any) {
      setValidationError(err.message || t('accessDeniedTitle'));
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus: TicketStatus) => {
    if (!isAuthorizedToModify) {
      setValidationError(t('accessDeniedTitle'));
      return;
    }
    setValidationError(null);

    if (newStatus === 'Resolved' && !resolutionNote.trim()) {
      setValidationError(t('resolvedRequiresNoteAlert'));
      return;
    }

    setSaving(true);
    try {
      const now = getSimulatedNow();

      const updates: Partial<Ticket> = { status: newStatus };
      if (newStatus === 'Resolved') {
        updates.resolution = {
          note: resolutionNote.trim(),
          photoBase64: resolutionPhotoBase64 || undefined,
          at: now,
        };
        if (assignedTo) {
          await updateTechnicianWorkload(assignedTo, -1);
        }
      }

      await updateTicket(ticket.id, updates, {
        actorId: currentUser?.uid || 'staff',
        actorRole: currentUser?.role || 'staff',
        actorName: currentUser?.name || 'Staff',
        type: 'status_change',
        oldValue: status,
        newValue: newStatus,
        note:
          newStatus === 'Resolved'
            ? `Resolution recorded: ${resolutionNote.trim()}`
            : `Status updated to ${newStatus}`,
      });

      onTicketUpdated();
      setStatus(newStatus);
      const evs = await fetchTicketEvents(ticket.id);
      setEvents(evs);
    } catch (err: any) {
      setValidationError(err.message || t('accessDeniedTitle'));
    } finally {
      setSaving(false);
    }
  };

  const handleAddInternalNote = async () => {
    if (!internalNote.trim() || !isAuthorizedToModify) return;
    setValidationError(null);
    setSaving(true);
    try {
      await updateTicket(
        ticket.id,
        {},
        {
          actorId: currentUser?.uid || 'staff',
          actorRole: currentUser?.role || 'staff',
          actorName: currentUser?.name || 'Staff',
          type: 'note',
          note: internalNote.trim(),
        }
      );
      setInternalNote('');
      const evs = await fetchTicketEvents(ticket.id);
      setEvents(evs);
    } catch (err: any) {
      setValidationError(err.message || t('accessDeniedTitle'));
    } finally {
      setSaving(false);
    }
  };

  const handleRerouteTicket = async () => {
    if (!rerouteReason.trim() || !isAuthorizedToModify) return;
    setSaving(true);
    setValidationError(null);
    try {
      const oldDept = ticket.departmentId;
      await updateTicket(
        ticket.id,
        {
          departmentId: rerouteDepartment,
          category: rerouteDepartment as any,
          assignedTo: undefined,
        },
        {
          actorId: currentUser?.uid || 'staff',
          actorRole: currentUser?.role || 'staff',
          actorName: currentUser?.name || 'Staff',
          type: 'status_change',
          oldValue: oldDept,
          newValue: rerouteDepartment,
          note: `Staff rerouted complaint from ${oldDept} to ${rerouteDepartment}. Reason: ${rerouteReason.trim()}`,
        }
      );
      setShowRerouteModal(false);
      setRerouteReason('');
      onTicketUpdated();
      const evs = await fetchTicketEvents(ticket.id);
      setEvents(evs);
    } catch (err: any) {
      setValidationError(err.message || t('accessDeniedTitle'));
    } finally {
      setSaving(false);
    }
  };

  const handleAfterPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { base64 } = await compressImage(file, 1280, 0.75);
      setResolutionPhotoBase64(base64);
    } catch (err: any) {
      setValidationError(`${t('photoCompressionError')}: ${err.message}`);
    }
  };

  const sla = getSlaStatus(
    ticket.slaDueAt,
    getSimulatedNow(),
    status === 'Verified' || status === 'Resolved'
  );

  const displayedComplaintText =
    revealedPrivacy && (currentUser.role === 'supervisor' || currentUser.role === 'admin')
      ? ticket.rawText
      : maskSensitiveText(ticket.rawText);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#132836]/75 backdrop-blur-xs flex justify-end">
      <div className="relative w-full max-w-xl bg-[#E4D7CF] dark:bg-[#1D3C50] h-full shadow-2xl flex flex-col border-l-2 border-[#1D3C50]/25 dark:border-[#D3C2B8]/20">
        {/* Drawer Header */}
        <div className="p-5 border-b border-[#1D3C50]/15 dark:border-[#D3C2B8]/15 flex items-center justify-between bg-[#D3C2B8] dark:bg-[#132836]">
          <div className="flex items-center gap-2.5">
            <span className="font-mono-tech text-sm font-extrabold text-[#1D3C50] dark:text-[#EFE7E1]">
              {ticket.ticketId}
            </span>
            <span className="px-2.5 py-0.5 rounded-md text-xs font-bold relevo-well">
              {translateStatus(status, language)}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label={t('closeDrawer')}
            className="tactile-btn-beige p-2 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {validationError && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-red-900/15 border border-red-700/40 text-red-900 dark:text-red-200 text-xs font-bold flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Title & Location */}
          <div>
            <h2 className="font-display text-xl font-extrabold deboss-heading">
              {ticket.title}
            </h2>
            <div className="flex items-center gap-2 text-xs font-bold text-[#254E68] dark:text-[#D3C2B8] mt-1 flex-wrap">
              <MapPin className="w-3.5 h-3.5" />
              <span>
                {translateHostel(ticket.hostel, language)} · {t('floorLabel', { floor: ticket.floor })} ·{' '}
                {translateRoomLabel(ticket.room, language)}
              </span>
              <span>•</span>
              <span className="font-mono-tech">
                {t('codeLabel')}: {ticket.locationCode}
              </span>
            </div>
          </div>

          {/* SLA Countdown Badge & Urgency */}
          <div className="flex items-center justify-between p-4 rounded-xl relevo-well">
            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-[#D3C2B8]" />
              <div>
                <span className="text-[10px] uppercase font-bold text-[#D3C2B8]/80 block">
                  {t('slaTargetPriority', {
                    urgency: translateUrgency(ticket.urgency, language),
                  })}
                </span>
                <span
                  className={`text-xs font-mono-tech font-extrabold ${
                    sla.isOverdue
                      ? 'text-red-300'
                      : 'text-[#EFE7E1]'
                  }`}
                >
                  {sla.timeLeftFormatted}
                </span>
              </div>
            </div>

            <span className="text-xs px-3 py-1 rounded-lg font-bold bg-[#254E68] text-[#EFE7E1] border border-white/15">
              {translateCategory(ticket.category, language)}
            </span>
          </div>

          {/* PrivacyGuard Protected Complaint Box */}
          <div className="p-4 rounded-xl tactile-surface-elevated space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#254E68] dark:text-[#D3C2B8] flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                <span>{t('complaintDescPrivacy')}</span>
              </span>

              {(currentUser.role === 'supervisor' || currentUser.role === 'admin') &&
                !revealedPrivacy && (
                  <button
                    type="button"
                    onClick={handleRevealPrivacy}
                    className="tactile-btn-beige px-2.5 py-1 rounded-lg flex items-center gap-1 text-[11px] font-bold"
                  >
                    <Unlock className="w-3 h-3" />
                    <span>{t('revealOriginal')}</span>
                  </button>
                )}
            </div>

            <p className="text-xs text-[#1D3C50] dark:text-[#EFE7E1] font-medium leading-relaxed">
              {displayedComplaintText}
            </p>

            {ticket.photoBase64 && (
              <div className="pt-2">
                <img
                  src={ticket.photoBase64}
                  alt="Student original attachment"
                  className="rounded-xl max-h-48 object-cover border border-[#1D3C50]/20"
                />
              </div>
            )}
          </div>

          {/* CampusShield Safety Alert */}
          {ticket.safetyFlags.some((f) => f !== 'none') && (
            <div className="p-3.5 rounded-xl bg-red-900/15 border border-red-700/40 text-red-900 dark:text-red-200 text-xs font-bold flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-700 shrink-0" />
              <span>
                <strong>{t('campusShieldFlagged')}:</strong>{' '}
                {ticket.safetyFlags
                  .filter((f) => f !== 'none')
                  .map((f) => translateSafetyFlag(f, language))
                  .join(', ')}
              </span>
            </div>
          )}

          {/* Assign Technician (Smart Dispatch) */}
          <div className="p-4 rounded-xl tactile-surface-elevated space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="text-xs font-extrabold uppercase tracking-wider text-[#1D3C50] dark:text-[#EFE7E1] flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5 text-[#254E68] dark:text-[#D3C2B8]" />
                <span>{t('smartDispatchAssignee')}</span>
              </label>

              {topSuggestedTech && isAuthorizedToModify && (
                <button
                  type="button"
                  onClick={() => handleAssignTechnician(topSuggestedTech.name)}
                  className="tactile-btn-steel px-3 py-1 rounded-lg text-[11px] font-bold"
                >
                  {t('smartSuggestBtn', { name: topSuggestedTech.name.split(' ')[0] })}
                </button>
              )}
            </div>

            <div className="space-y-2">
              <select
                value={assignedTo}
                disabled={!isAuthorizedToModify || saving}
                onChange={(e) => handleAssignTechnician(e.target.value)}
                className="tactile-input w-full p-2.5 text-xs rounded-xl font-bold"
              >
                <option value="">{t('unassigned')}</option>
                {deptTechs.map((tech) => (
                  <option key={tech.id} value={tech.name}>
                    {tech.name} ({tech.workload})
                  </option>
                ))}
              </select>

              {topSuggestedTech && (
                <div className="text-[11px] font-medium text-[#254E68] dark:text-[#D3C2B8] space-y-0.5">
                  <span className="font-bold text-[#1D3C50] dark:text-[#EFE7E1]">
                    {t('whySuggested')}:
                  </span>{' '}
                  {rankedTechs[0]?.matchReasons.join(' • ')}
                </div>
              )}
            </div>
          </div>

          {/* Change Status Along Allowed Transitions Only */}
          <div className="p-4 rounded-xl tactile-surface-elevated space-y-3">
            <span className="text-xs font-extrabold uppercase tracking-wider text-[#1D3C50] dark:text-[#EFE7E1] block">
              {t('workflowStatusTransition')}
            </span>

            {nextOptions.length === 0 ? (
              <p className="text-xs font-semibold text-[#254E68] dark:text-[#D3C2B8]">
                {t('noFurtherTransitions', { status: translateStatus(status, language) })}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {nextOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => handleStatusChange(opt)}
                    disabled={saving || !isAuthorizedToModify}
                    className="tactile-btn-primary flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold disabled:opacity-40 min-h-[38px]"
                  >
                    <span>
                      {t('markStatusBtn', { status: translateStatus(opt, language) })}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
            )}

            {/* Resolution Form */}
            {nextOptions.includes('Resolved') && (
              <div className="pt-3 border-t border-[#1D3C50]/15 dark:border-[#D3C2B8]/15 space-y-2.5">
                <label className="block text-xs font-bold text-[#1D3C50] dark:text-[#EFE7E1]">
                  {t('resolutionNoteRequired')}:
                </label>
                <textarea
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  placeholder={t('resolutionNotePlaceholder')}
                  rows={2}
                  className="tactile-input w-full p-2.5 text-xs rounded-xl font-medium"
                />

                <input
                  type="file"
                  ref={afterPhotoInputRef}
                  accept="image/*"
                  capture="environment"
                  onChange={handleAfterPhoto}
                  className="hidden"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => afterPhotoInputRef.current?.click()}
                    className="tactile-btn-beige flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>{t('attachAfterPhoto')}</span>
                  </button>
                  {resolutionPhotoBase64 && (
                    <span className="text-xs text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> {t('photoAttached')}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Add Internal Staff Note & Reroute Controls */}
          <div className="p-4 rounded-xl tactile-surface-elevated space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[#1D3C50] dark:text-[#EFE7E1] block">
                {t('addInternalStaffNote')}
              </span>
              {isAuthorizedToModify && (
                <button
                  type="button"
                  onClick={() => setShowRerouteModal(true)}
                  className="tactile-btn-beige px-3 py-1.5 rounded-lg text-xs font-extrabold"
                >
                  ⚡ Reroute Department
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                placeholder={t('internalMemoPlaceholder')}
                className="tactile-input flex-1 p-2.5 text-xs rounded-xl font-medium"
              />
              <button
                type="button"
                onClick={handleAddInternalNote}
                disabled={!internalNote.trim() || saving || !isAuthorizedToModify}
                className="tactile-btn-primary px-4 py-2.5 rounded-xl text-xs font-bold disabled:opacity-40"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Reroute Department Modal */}
          {showRerouteModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#132836]/75 backdrop-blur-xs">
              <div className="tactile-card rounded-2xl p-6 max-w-md w-full space-y-4">
                <div className="space-y-1">
                  <h3 className="font-display font-extrabold text-lg deboss-heading">
                    Reroute Complaint to Department
                  </h3>
                  <p className="text-xs font-medium text-[#254E68] dark:text-[#D3C2B8]">
                    Transfer ownership of ticket {ticket.ticketId} to another department with an audit note.
                  </p>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-[#1D3C50] dark:text-[#EFE7E1] font-bold mb-1">
                      Target Department:
                    </label>
                    <select
                      value={rerouteDepartment}
                      onChange={(e) => setRerouteDepartment(e.target.value as DepartmentId)}
                      className="tactile-input w-full p-2.5 rounded-xl font-bold"
                    >
                      <option value="plumbing">{translateCategory('plumbing', language)}</option>
                      <option value="electricity">{translateCategory('electricity', language)}</option>
                      <option value="cleanliness">{translateCategory('cleanliness', language)}</option>
                      <option value="internet">{translateCategory('internet', language)}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[#1D3C50] dark:text-[#EFE7E1] font-bold mb-1">
                      Rerouting Rationale / Note:
                    </label>
                    <textarea
                      value={rerouteReason}
                      onChange={(e) => setRerouteReason(e.target.value)}
                      placeholder="e.g. Complaint initially logged as cleanliness is a broken pipe causing ceiling leakage."
                      rows={3}
                      className="tactile-input w-full p-2.5 rounded-xl font-medium"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowRerouteModal(false)}
                    className="tactile-btn-beige px-4 py-2 rounded-xl text-xs font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!rerouteReason.trim() || saving}
                    onClick={handleRerouteTicket}
                    className="tactile-btn-primary px-5 py-2 rounded-xl text-xs font-bold disabled:opacity-40"
                  >
                    Confirm Reroute
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Audit Timeline */}
          <div className="space-y-3 pt-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-[#1D3C50] dark:text-[#EFE7E1] block">
              {t('auditEventLog')}
            </span>
            <div className="space-y-2.5 pl-3 border-l-2 border-[#466981]/50">
              {events.map((ev) => (
                <div key={ev.id} className="text-xs space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#1D3C50] dark:text-[#EFE7E1]">
                      {ev.actorName || ev.actorRole}
                    </span>
                    <span className="text-[10px] font-mono-tech text-[#254E68] dark:text-[#D3C2B8]">
                      {new Date(ev.timestamp).toLocaleTimeString(
                        language === 'hi' ? 'hi-IN' : 'en-IN',
                        {
                          hour: '2-digit',
                          minute: '2-digit',
                        }
                      )}
                    </span>
                  </div>
                  {ev.note && <p className="text-[#254E68] dark:text-[#D3C2B8] font-medium">{ev.note}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
