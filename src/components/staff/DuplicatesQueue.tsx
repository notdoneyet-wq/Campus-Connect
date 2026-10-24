import React, { useState, useEffect } from 'react';
import {
  GitMerge,
  CheckCircle2,
  XCircle,
  Link2,
  Sparkles,
  MapPin,
} from 'lucide-react';
import { DuplicateCandidate, Ticket, UserProfile } from '../../types';
import {
  fetchDuplicateCandidates,
  updateDuplicateCandidate,
  updateTicket,
  createNotice,
  getSimulatedNow,
} from '../../services/db';
import { filterAuthorizedDuplicates, filterAuthorizedTickets } from '../../utils/authorization';
import { translateHostel, translateRoomLabel, useT } from '../../data/i18n';

interface DuplicatesQueueProps {
  tickets: Ticket[];
  currentUser: UserProfile;
  onRefresh: () => void;
}

export const DuplicatesQueue: React.FC<DuplicatesQueueProps> = ({
  tickets,
  currentUser,
  onRefresh,
}) => {
  const { t, language } = useT();
  const [candidates, setCandidates] = useState<DuplicateCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!currentUser) return null;

  const authorizedTickets = filterAuthorizedTickets(currentUser, tickets);

  const loadData = async () => {
    setLoading(true);
    const dups = await fetchDuplicateCandidates(currentUser);
    const authorizedDups = filterAuthorizedDuplicates(currentUser, dups, authorizedTickets);
    setCandidates(authorizedDups);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [currentUser?.uid, currentUser?.department, tickets.length]);

  const handleMerge = async (dup: DuplicateCandidate) => {
    setProcessingId(dup.id);
    setErrorMsg(null);
    const sourceTicket = authorizedTickets.find((tk) => tk.ticketId === dup.ticketId);
    const targetTicket = authorizedTickets.find((tk) => tk.ticketId === dup.candidateId);

    if (!sourceTicket || !targetTicket) {
      setErrorMsg(t('couldNotLocateMergeTickets'));
      setProcessingId(null);
      return;
    }

    const now = getSimulatedNow();

    const combinedReporters = Array.from(
      new Set([...targetTicket.reporters, ...sourceTicket.reporters, sourceTicket.reporterId])
    );

    await updateTicket(
      targetTicket.id,
      { reporters: combinedReporters },
      {
        actorId: currentUser?.uid || 'staff',
        actorRole: currentUser?.role || 'staff',
        actorName: currentUser?.name || 'Staff',
        type: 'note',
        note: `Merged duplicate report ${sourceTicket.ticketId} into this ticket. Student reporter added.`,
      }
    );

    await updateTicket(
      sourceTicket.id,
      {
        status: 'Resolved',
        duplicateOf: targetTicket.ticketId,
        resolution: {
          note: `Merged into parent ticket ${targetTicket.ticketId}. Track progress via ${targetTicket.ticketId}.`,
          at: now,
        },
      },
      {
        actorId: currentUser?.uid || 'staff',
        actorRole: currentUser?.role || 'staff',
        actorName: currentUser?.name || 'Staff',
        type: 'resolved',
        oldValue: sourceTicket.status,
        newValue: 'Resolved',
        note: `Closed as duplicate: Merged into ${targetTicket.ticketId}`,
      }
    );

    await updateDuplicateCandidate(dup.id, 'merged', currentUser?.name || 'Staff');

    await loadData();
    onRefresh();
    setProcessingId(null);
  };

  const handleReject = async (dup: DuplicateCandidate) => {
    setProcessingId(dup.id);
    await updateDuplicateCandidate(dup.id, 'rejected', currentUser?.name || 'Staff');
    await loadData();
    setProcessingId(null);
  };

  const handleLinkIncident = async (dup: DuplicateCandidate) => {
    setProcessingId(dup.id);
    const sourceTicket = authorizedTickets.find((tk) => tk.ticketId === dup.ticketId);
    if (sourceTicket) {
      await createNotice({
        hostel: sourceTicket.hostel,
        floor: sourceTicket.floor,
        incidentId: `INC-${sourceTicket.ticketId.replace('CC-', '')}`,
        messageEn: `Linked cluster notice: ${sourceTicket.title} reported across multiple rooms on ${sourceTicket.hostel} Floor ${sourceTicket.floor}.`,
        messageHi: `लिंक की गई सूचना: ${sourceTicket.hostel} मंज़िल ${sourceTicket.floor} पर एक से अधिक कमरों में समस्या दर्ज है।`,
        active: true,
      });
    }

    await updateDuplicateCandidate(dup.id, 'linked', currentUser?.name || 'Staff');
    await loadData();
    onRefresh();
    setProcessingId(null);
  };

  const pending = candidates.filter((c) => c.reviewState === 'pending');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display text-xl font-extrabold deboss-heading flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg relevo-well flex items-center justify-center">
              <GitMerge className="w-4 h-4 text-[#D3C2B8]" />
            </div>
            <span>{t('duplicateReviewQueueTitle')}</span>
          </h2>
          <p className="text-xs font-medium text-[#254E68] dark:text-[#D3C2B8] mt-0.5">
            {t('duplicateReviewQueueDesc')}
          </p>
        </div>
        <span className="text-xs font-mono-tech font-bold px-3 py-1 rounded-lg relevo-well">
          {t('pendingReviewCount', { count: pending.length })}
        </span>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-red-900/15 border border-red-700/40 text-red-900 dark:text-red-200 text-xs font-bold">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-44 tactile-inset rounded-2xl animate-pulse"
            />
          ))}
        </div>
      ) : pending.length === 0 ? (
        <div className="tactile-card rounded-2xl p-12 text-center space-y-2.5">
          <div className="w-12 h-12 rounded-2xl relevo-well flex items-center justify-center mx-auto text-[#D3C2B8]">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h4 className="font-display font-extrabold text-base text-[#1D3C50] dark:text-[#EFE7E1]">
            {t('reviewQueueClearTitle')}
          </h4>
          <p className="text-xs font-medium text-[#254E68] dark:text-[#D3C2B8] max-w-sm mx-auto">
            {t('reviewQueueClearDesc')}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {pending.map((dup) => {
            const ticketA = authorizedTickets.find((tk) => tk.ticketId === dup.ticketId);
            const ticketB = authorizedTickets.find((tk) => tk.ticketId === dup.candidateId);

            if (!ticketA || !ticketB) return null;

            return (
              <div
                key={dup.id}
                className="tactile-card rounded-2xl p-6 space-y-5"
              >
                {/* Gemini Verdict Header */}
                <div className="p-4 rounded-xl relevo-well flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-[#D3C2B8] shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#EFE7E1]">
                        {t('geminiVerdictLabel')}:
                      </span>
                      <span
                        className={`uppercase font-extrabold text-[10px] px-2.5 py-0.5 rounded-md ${
                          dup.verdict === 'identical'
                            ? 'bg-red-700 text-white'
                            : 'bg-amber-600 text-white'
                        }`}
                      >
                        {dup.verdict}
                      </span>
                    </div>
                    <p className="text-[#D3C2B8] font-medium leading-relaxed">
                      {dup.reason}
                    </p>
                  </div>
                </div>

                {/* Side-by-Side Comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left: New Report */}
                  <div className="p-4 rounded-xl tactile-surface-elevated space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-mono-tech font-extrabold text-[#254E68] dark:text-[#D3C2B8]">
                        {t('newTicketLabel', { id: ticketA.ticketId })}
                      </span>
                      <span className="text-[10px] font-mono-tech font-bold text-[#466981]">
                        {new Date(ticketA.createdAt).toLocaleTimeString(
                          language === 'hi' ? 'hi-IN' : 'en-IN',
                          {
                            hour: '2-digit',
                            minute: '2-digit',
                          }
                        )}
                      </span>
                    </div>

                    <h4 className="font-display font-bold text-sm text-[#1D3C50] dark:text-[#EFE7E1]">
                      {ticketA.title}
                    </h4>

                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#254E68] dark:text-[#D3C2B8]">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>
                        {translateHostel(ticketA.hostel, language)} ·{' '}
                        {t('floorLabel', { floor: ticketA.floor })} ·{' '}
                        {translateRoomLabel(ticketA.room, language)}
                      </span>
                    </div>

                    <p className="text-xs font-medium text-[#1D3C50] dark:text-[#EFE7E1] leading-relaxed">
                      "{ticketA.rawText}"
                    </p>

                    {ticketA.photoBase64 && (
                      <img
                        src={ticketA.photoBase64}
                        alt="New ticket photo"
                        className="rounded-xl max-h-36 object-cover border border-[#1D3C50]/20"
                      />
                    )}
                  </div>

                  {/* Right: Existing Candidate */}
                  <div className="p-4 rounded-xl tactile-surface-elevated space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-mono-tech font-extrabold text-[#466981] dark:text-[#7A9BB2]">
                        {t('candidateTicketLabel', { id: ticketB.ticketId })}
                      </span>
                      <span className="text-[10px] font-mono-tech font-bold text-[#466981]">
                        {new Date(ticketB.createdAt).toLocaleTimeString(
                          language === 'hi' ? 'hi-IN' : 'en-IN',
                          {
                            hour: '2-digit',
                            minute: '2-digit',
                          }
                        )}
                      </span>
                    </div>

                    <h4 className="font-display font-bold text-sm text-[#1D3C50] dark:text-[#EFE7E1]">
                      {ticketB.title}
                    </h4>

                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#254E68] dark:text-[#D3C2B8]">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>
                        {translateHostel(ticketB.hostel, language)} ·{' '}
                        {t('floorLabel', { floor: ticketB.floor })} ·{' '}
                        {translateRoomLabel(ticketB.room, language)}
                      </span>
                    </div>

                    <p className="text-xs font-medium text-[#1D3C50] dark:text-[#EFE7E1] leading-relaxed">
                      "{ticketB.rawText}"
                    </p>

                    {ticketB.photoBase64 && (
                      <img
                        src={ticketB.photoBase64}
                        alt="Candidate ticket photo"
                        className="rounded-xl max-h-36 object-cover border border-[#1D3C50]/20"
                      />
                    )}
                  </div>
                </div>

                {/* Decision Actions */}
                <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-[#1D3C50]/15 dark:border-[#D3C2B8]/15">
                  <button
                    type="button"
                    disabled={processingId === dup.id}
                    onClick={() => handleReject(dup)}
                    className="tactile-btn-beige flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold"
                  >
                    <XCircle className="w-4 h-4 text-[#466981]" />
                    <span>{t('rejectKeepSeparateBtn')}</span>
                  </button>

                  <button
                    type="button"
                    disabled={processingId === dup.id}
                    onClick={() => handleLinkIncident(dup)}
                    className="tactile-btn-steel flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold"
                  >
                    <Link2 className="w-4 h-4" />
                    <span>{t('linkToIncidentBtn')}</span>
                  </button>

                  <button
                    type="button"
                    disabled={processingId === dup.id}
                    onClick={() => handleMerge(dup)}
                    className="tactile-btn-primary flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold"
                  >
                    <GitMerge className="w-4 h-4" />
                    <span>{t('mergeIntoBtn', { id: ticketB.ticketId })}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
