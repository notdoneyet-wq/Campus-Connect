import React, { useState, useEffect } from 'react';
import {
  Clock,
  MapPin,
  CheckCircle,
  ChevronRight,
  ArrowLeft,
  Calendar,
  Check,
  RotateCcw,
} from 'lucide-react';
import { Ticket, TicketEvent, UserProfile } from '../../types';
import {
  fetchTickets,
  fetchTicketEvents,
  updateTicket,
  upvoteTicket,
  getSimulatedNow,
} from '../../services/db';
import {
  Language,
  translateCategory,
  translateHostel,
  translateRoomLabel,
  translateStatus,
  translateSubtype,
  useT,
} from '../../data/i18n';
import { getSlaStatus } from '../../utils/sla';

interface MyTicketsProps {
  currentUser: UserProfile;
  language: Language;
  preselectedTicketId?: string | null;
  onClearPreselection?: () => void;
}

export const MyTickets: React.FC<MyTicketsProps> = ({
  currentUser,
  language,
  preselectedTicketId,
  onClearPreselection,
}) => {
  const { t } = useT();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const [showReopenModal, setShowReopenModal] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  if (!currentUser) return null;

  const loadData = async () => {
    setLoading(true);
    const authorized = await fetchTickets(currentUser);
    const my = authorized.filter(
      (tk) => tk.reporterId === currentUser?.uid || (Array.isArray(tk.reporters) && tk.reporters.includes(currentUser?.uid || ''))
    );
    setTickets(my);

    if (preselectedTicketId) {
      const target = my.find(
        (tk) => tk.ticketId === preselectedTicketId || tk.id === preselectedTicketId
      );
      if (target) {
        setSelectedTicket(target);
        const evs = await fetchTicketEvents(target.id);
        setEvents(evs);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [currentUser?.uid, preselectedTicketId]);

  const handleSelectTicket = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    const evs = await fetchTicketEvents(ticket.id);
    setEvents(evs);
  };

  const handleUpvote = async (e: React.MouseEvent, tk: Ticket) => {
    e.stopPropagation();
    const updated = await upvoteTicket(tk.id);
    if (updated) {
      setTickets((prev) => prev.map((t) => (t.id === tk.id ? updated : t)));
    }
  };

  const handleVerifyFixed = async () => {
    if (!selectedTicket) return;
    setIsVerifying(true);

    await updateTicket(
      selectedTicket.id,
      { status: 'Verified' },
      {
        actorId: currentUser?.uid || 'anon',
        actorRole: 'student',
        actorName: currentUser?.name || 'Student',
        type: 'verified',
        oldValue: 'Resolved',
        newValue: 'Verified',
        note: 'Student verified that the repair works successfully.',
      }
    );

    await loadData();
    setSelectedTicket((prev) => (prev ? { ...prev, status: 'Verified' } : null));
    setIsVerifying(false);
  };

  const handleReopenTicket = async () => {
    if (!selectedTicket || !reopenReason.trim()) return;
    setIsVerifying(true);

    await updateTicket(
      selectedTicket.id,
      { status: 'Reopened' },
      {
        actorId: currentUser?.uid || 'anon',
        actorRole: 'student',
        actorName: currentUser?.name || 'Student',
        type: 'reopened',
        oldValue: 'Resolved',
        newValue: 'Reopened',
        note: `Student reported repair incomplete: ${reopenReason.trim()}`,
      }
    );

    setShowReopenModal(false);
    setReopenReason('');
    await loadData();
    setSelectedTicket((prev) => (prev ? { ...prev, status: 'Reopened' } : null));
    setIsVerifying(false);
  };

  const getStatusBadge = (status: Ticket['status']) => {
    switch (status) {
      case 'Open':
        return 'bg-[#254E68] text-[#EFE7E1] border-[#1D3C50]';
      case 'Assigned':
        return 'bg-[#466981] text-[#EFE7E1] border-[#254E68]';
      case 'In Progress':
        return 'bg-amber-700 text-white border-amber-800';
      case 'Resolved':
        return 'bg-teal-700 text-white border-teal-800';
      case 'Verified':
        return 'bg-emerald-700 text-white border-emerald-800';
      case 'Reopened':
        return 'bg-red-700 text-white border-red-800';
      default:
        return 'bg-[#1D3C50] text-[#D3C2B8]';
    }
  };

  const simulatedNow = getSimulatedNow();

  if (selectedTicket) {
    const sla = getSlaStatus(
      selectedTicket.slaDueAt,
      simulatedNow,
      selectedTicket.status === 'Verified' || selectedTicket.status === 'Resolved'
    );

    return (
      <div className="w-full max-w-3xl mx-auto space-y-5 pb-24">
        <button
          onClick={() => {
            setSelectedTicket(null);
            if (onClearPreselection) onClearPreselection();
          }}
          className="tactile-btn-beige inline-flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-xl"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('backToAllTickets')}</span>
        </button>

        {/* Ticket Header Card */}
        <div className="tactile-card rounded-2xl p-6 sm:p-7 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono-tech text-xs font-extrabold text-[#254E68] dark:text-[#D3C2B8] uppercase">
                  {selectedTicket.ticketId}
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-md text-xs font-bold border ${getStatusBadge(
                    selectedTicket.status
                  )}`}
                >
                  {translateStatus(selectedTicket.status, language)}
                </span>
              </div>
              <h2 className="font-display text-xl sm:text-2xl font-extrabold deboss-heading mt-1">
                {selectedTicket.title}
              </h2>
            </div>

            {/* SLA Badge */}
            <div
              className={`px-3.5 py-2 rounded-xl text-xs font-mono-tech font-bold flex items-center gap-1.5 shrink-0 ${
                sla.isOverdue
                  ? 'bg-red-800 text-white'
                  : 'relevo-well'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{sla.timeLeftFormatted}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-y-2 gap-x-4 text-xs font-semibold text-[#254E68] dark:text-[#D3C2B8] pt-2 border-t border-[#1D3C50]/15 dark:border-[#D3C2B8]/15">
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-[#1D3C50] dark:text-[#EFE7E1]" />
              {translateHostel(selectedTicket.hostel, language)} · {t('floorLabel', { floor: selectedTicket.floor })} · {translateRoomLabel(selectedTicket.room, language)}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {new Date(selectedTicket.createdAt).toLocaleString(language === 'hi' ? 'hi-IN' : 'en-IN', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <span>
              {t('categoryLabel')}: {translateCategory(selectedTicket.category, language)} (
              {translateSubtype(selectedTicket.subtype, language)})
            </span>
          </div>

          {/* Original Complaint Text & Photo */}
          <div className="p-4 rounded-xl tactile-surface-elevated text-xs space-y-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#254E68] dark:text-[#D3C2B8] block">
              {t('originalComplaint')}
            </span>
            <p className="leading-relaxed font-medium text-[#1D3C50] dark:text-[#EFE7E1]">{selectedTicket.rawText}</p>

            {selectedTicket.photoBase64 && (
              <div className="pt-2">
                <img
                  src={selectedTicket.photoBase64}
                  alt="Student initial photo"
                  className="rounded-xl max-h-52 object-cover border border-[#1D3C50]/20"
                />
              </div>
            )}
          </div>
        </div>

        {/* VERIFICATION PANEL (Active when status === 'Resolved') */}
        {selectedTicket.status === 'Resolved' && (
          <div className="tactile-card-navy rounded-2xl p-6 space-y-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[#EFE7E1] font-display font-extrabold text-lg">
                <CheckCircle className="w-5 h-5 text-[#D3C2B8]" />
                <span>{t('verifyFixTitle')}</span>
              </div>
              <p className="text-xs text-[#D3C2B8]">
                {t('verifyPrompt')}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#132836] border border-white/15 text-xs space-y-3">
              <div>
                <span className="font-bold text-[#D3C2B8]/80 uppercase tracking-wider text-[10px] block">
                  {t('staffRepairNote')}:
                </span>
                <p className="font-semibold text-[#EFE7E1] mt-0.5">
                  {selectedTicket.resolution?.note || t('repairCompleteDefault')}
                </p>
              </div>

              {selectedTicket.resolution?.photoBase64 && (
                <div>
                  <span className="font-bold text-[#D3C2B8]/80 uppercase tracking-wider text-[10px] block mb-1">
                    {t('staffAfterPhoto')}:
                  </span>
                  <img
                    src={selectedTicket.resolution.photoBase64}
                    alt="Staff after repair photo"
                    className="rounded-xl max-h-48 object-cover border border-white/20"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                disabled={isVerifying}
                onClick={handleVerifyFixed}
                className="tactile-btn-beige flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-sm font-extrabold min-h-[48px]"
              >
                <Check className="w-5 h-5 text-emerald-700" />
                <span>{t('yesFixed')}</span>
              </button>

              <button
                type="button"
                disabled={isVerifying}
                onClick={() => setShowReopenModal(true)}
                className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-sm font-bold bg-red-800 hover:bg-red-700 text-white border border-red-950 transition-colors min-h-[48px]"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{t('stillNotFixed')}</span>
              </button>
            </div>
          </div>
        )}

        {/* Reopen Dispute Modal */}
        {showReopenModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#132836]/75 backdrop-blur-xs">
            <div className="tactile-card rounded-2xl p-6 max-w-md w-full space-y-4">
              <h3 className="font-display font-extrabold text-lg deboss-heading">
                {t('stillNotFixed')}
              </h3>
              <p className="text-xs font-medium text-[#254E68] dark:text-[#D3C2B8]">
                {t('reopenReasonPrompt')}
              </p>
              <textarea
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder={t('reopenPlaceholder')}
                rows={4}
                className="tactile-input w-full p-3 text-xs rounded-xl font-medium"
              />
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReopenModal(false)}
                  className="tactile-btn-beige px-4 py-2 rounded-xl text-xs font-bold"
                >
                  {t('cancel')}
                </button>
                <button
                  type="button"
                  disabled={!reopenReason.trim() || isVerifying}
                  onClick={handleReopenTicket}
                  className="tactile-btn-primary px-5 py-2 rounded-xl text-xs font-bold disabled:opacity-40"
                >
                  {t('reopenButton')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Vertical Progress Timeline */}
        <div className="tactile-card rounded-2xl p-6 space-y-4">
          <h3 className="font-display font-extrabold text-lg deboss-heading">
            {t('timelineTitle')}
          </h3>

          <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#466981]/40">
            {events.length === 0 ? (
              <p className="text-xs font-medium text-[#254E68] dark:text-[#D3C2B8]">{t('initialTicketCreated')}</p>
            ) : (
              events.map((ev) => (
                <div key={ev.id} className="relative group">
                  <div className="absolute -left-[27px] top-1 w-3.5 h-3.5 rounded-full bg-[#1D3C50] dark:bg-[#D3C2B8] border-2 border-[#EFE7E1] dark:border-[#132836]" />
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-[#1D3C50] dark:text-[#EFE7E1] capitalize">
                        {ev.type.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[10px] font-mono-tech font-semibold text-[#254E68] dark:text-[#D3C2B8]">
                        {new Date(ev.timestamp).toLocaleTimeString(language === 'hi' ? 'hi-IN' : 'en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    {ev.note && (
                      <p className="text-xs font-medium text-[#254E68] dark:text-[#D3C2B8]/90 leading-relaxed">
                        {ev.note}
                      </p>
                    )}
                    <span className="text-[10px] font-bold text-[#466981] dark:text-[#7A9BB2] block">
                      {t('actorLabel')}: {ev.actorName || ev.actorRole} ({ev.actorRole})
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto space-y-4 pb-24">
      <div className="flex items-center justify-between pb-2">
        <h2 className="font-display text-xl font-extrabold deboss-heading">
          {t('tabMyTickets')}
        </h2>
        <span className="px-3 py-1 rounded-lg relevo-well text-xs font-mono-tech font-bold">
          {tickets.length} {tickets.length === 1 ? t('ticketCountSingular') : t('ticketCountPlural')}
        </span>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 tactile-inset rounded-2xl animate-pulse"
            />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <div className="tactile-card rounded-2xl p-10 text-center space-y-2">
          <p className="text-sm font-bold text-[#254E68] dark:text-[#D3C2B8]">{t('noTickets')}</p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {tickets.map((tk) => {
            const sla = getSlaStatus(
              tk.slaDueAt,
              simulatedNow,
              tk.status === 'Verified' || tk.status === 'Resolved'
            );

            return (
              <div
                key={tk.id}
                onClick={() => handleSelectTicket(tk)}
                className="tactile-card hover:-translate-y-0.5 rounded-2xl p-5 cursor-pointer transition-all space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono-tech text-[11px] font-extrabold text-[#254E68] dark:text-[#D3C2B8] uppercase">
                      {tk.ticketId}
                    </span>
                    <h3 className="font-display font-bold text-base text-[#1D3C50] dark:text-[#EFE7E1] leading-snug mt-0.5">
                      {tk.title}
                    </h3>
                  </div>

                  <span
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border shrink-0 ${getStatusBadge(
                      tk.status
                    )}`}
                  >
                    {translateStatus(tk.status, language)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs font-semibold text-[#254E68] dark:text-[#D3C2B8] pt-2 border-t border-[#1D3C50]/15 dark:border-[#D3C2B8]/15">
                  <span className="flex items-center gap-1.5 truncate max-w-[240px]">
                    <MapPin className="w-3.5 h-3.5 text-[#1D3C50] dark:text-[#EFE7E1] shrink-0" />
                    <span>
                      {translateHostel(tk.hostel, language)} · F{tk.floor} · {translateRoomLabel(tk.room, language)}
                    </span>
                  </span>

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={(e) => handleUpvote(e, tk)}
                      className="tactile-btn-beige flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold"
                    >
                      <span>👍 Same Issue ({tk.upvotes || 0})</span>
                    </button>
                    <span className={sla.isOverdue ? 'text-red-700 dark:text-red-300 font-mono-tech font-bold text-xs' : 'text-xs font-mono-tech font-bold'}>
                      {sla.timeLeftFormatted}
                    </span>
                    <ChevronRight className="w-4 h-4 text-[#1D3C50] dark:text-[#EFE7E1]" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
