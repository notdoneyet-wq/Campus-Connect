import React, { useState, useEffect } from 'react';
import {
  AlertOctagon,
  Clock,
  ShieldAlert,
  RotateCcw,
} from 'lucide-react';
import { Escalation, Ticket, UserProfile } from '../../types';
import {
  checkAndTriggerOverdueEscalations,
  fetchEscalations,
  getDemoClockOffsetHours,
  getSimulatedNow,
} from '../../services/db';
import { filterAuthorizedTickets } from '../../utils/authorization';
import {
  translateCategory,
  translateHostel,
  translateRoomLabel,
  translateSafetyFlag,
  translateUrgency,
  useT,
} from '../../data/i18n';

interface EscalationsViewProps {
  tickets: Ticket[];
  currentUser: UserProfile;
  onSelectTicket: (ticket: Ticket) => void;
  onRefresh: () => void;
}

export const EscalationsView: React.FC<EscalationsViewProps> = ({
  tickets,
  currentUser,
  onSelectTicket,
}) => {
  const { t, language } = useT();
  const [, setEscalations] = useState<Escalation[]>([]);
  const [, setLoading] = useState(true);

  const clockOffset = getDemoClockOffsetHours();
  const simulatedNow = getSimulatedNow();

  if (!currentUser) return null;

  const authorizedTickets = filterAuthorizedTickets(currentUser, tickets);

  const loadData = async () => {
    setLoading(true);
    await checkAndTriggerOverdueEscalations();
    const escs = await fetchEscalations(currentUser);
    setEscalations(escs);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(() => {
      loadData();
    }, 60000);
    return () => clearInterval(timer);
  }, [currentUser?.uid, currentUser?.department]);

  const overdueTickets = authorizedTickets.filter(
    (tk) =>
      (tk.status === 'Open' || tk.status === 'Assigned' || tk.status === 'In Progress') &&
      simulatedNow > tk.slaDueAt
  );

  const safetyFlaggedTickets = authorizedTickets.filter((tk) =>
    tk.safetyFlags.some((f) => f !== 'none')
  );

  const disputedTickets = authorizedTickets.filter((tk) => tk.status === 'Reopened');

  const slaRules = [
    {
      urgency: 'critical' as const,
      hours: 2,
      description: t('slaRuleCriticalDesc'),
    },
    {
      urgency: 'high' as const,
      hours: 6,
      description: t('slaRuleHighDesc'),
    },
    {
      urgency: 'medium' as const,
      hours: 24,
      description: t('slaRuleMediumDesc'),
    },
    {
      urgency: 'low' as const,
      hours: 72,
      description: t('slaRuleLowDesc'),
    },
  ];

  return (
    <div className="space-y-6">
      {/* SLA Rules Transparency Card */}
      <div className="tactile-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg relevo-well flex items-center justify-center">
              <Clock className="w-4 h-4 text-[#D3C2B8]" />
            </div>
            <h3 className="font-display font-extrabold text-lg deboss-heading">
              {t('campusSlaAccountabilityTitle')}
            </h3>
          </div>
          <span className="text-xs font-bold text-[#254E68] dark:text-[#D3C2B8]">
            {t('autoEscalationSystem')}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {slaRules.map((rule) => (
            <div
              key={rule.urgency}
              className="p-4 rounded-xl tactile-surface-elevated space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-xs uppercase text-[#1D3C50] dark:text-[#EFE7E1]">
                  {translateUrgency(rule.urgency, language)}
                </span>
                <span className="font-mono-tech text-xs font-extrabold px-2 py-0.5 rounded-md relevo-well">
                  {rule.hours}h SLA
                </span>
              </div>
              <p className="text-[11px] font-medium text-[#254E68] dark:text-[#D3C2B8] leading-snug">{rule.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Overdue SLA Escalations Queue */}
      <div className="tactile-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-800 rounded-xl text-white">
              <AlertOctagon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-extrabold text-lg deboss-heading flex items-center gap-2">
                <span>{t('overdueSlaBreachesTitle')}</span>
                <span className="px-2.5 py-0.5 rounded-md text-xs font-mono-tech font-bold bg-red-800 text-white">
                  {overdueTickets.length}
                </span>
              </h3>
              <p className="text-xs font-medium text-[#254E68] dark:text-[#D3C2B8]">
                {t('overdueSlaBreachesDesc')}
              </p>
            </div>
          </div>

          {clockOffset > 0 && (
            <span className="text-xs font-mono-tech font-bold px-3 py-1 rounded-lg relevo-well">
              {t('simulatedTimeOffset', { offset: clockOffset })}
            </span>
          )}
        </div>

        {overdueTickets.length === 0 ? (
          <div className="py-8 text-center text-xs font-bold text-[#254E68] dark:text-[#D3C2B8]">
            {t('noTicketsBreachedSla')}
          </div>
        ) : (
          <div className="space-y-3">
            {overdueTickets.map((tk) => {
              const overdueMs = simulatedNow - tk.slaDueAt;
              const overdueHrs = Math.floor(overdueMs / (3600 * 1000));
              const overdueMins = Math.floor((overdueMs % (3600 * 1000)) / (60 * 1000));

              return (
                <div
                  key={tk.id}
                  onClick={() => onSelectTicket(tk)}
                  className="p-4 rounded-xl tactile-surface-elevated border-l-4 border-l-red-700 hover:border-[#254E68] cursor-pointer transition-all space-y-2"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono-tech text-xs font-extrabold text-red-800 dark:text-red-300">
                          {tk.ticketId}
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-red-800 text-white">
                          {t('overdueByBadge', { hours: overdueHrs, mins: overdueMins })}
                        </span>
                      </div>
                      <h4 className="font-display font-bold text-sm text-[#1D3C50] dark:text-[#EFE7E1] mt-1">
                        {tk.title}
                      </h4>
                    </div>

                    <span className="text-xs font-bold text-[#254E68] dark:text-[#D3C2B8]">
                      {translateCategory(tk.category, language)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs font-semibold text-[#254E68] dark:text-[#D3C2B8] pt-1">
                    <span>
                      {translateHostel(tk.hostel, language)} ·{' '}
                      {t('floorLabel', { floor: tk.floor })} ·{' '}
                      {translateRoomLabel(tk.room, language)}
                    </span>
                    <span className="font-bold text-[#1D3C50] dark:text-[#EFE7E1] hover:underline">
                      {t('openDrawerArrow')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Safety-Flagged & Student-Disputed Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Safety Flags */}
        <div className="tactile-card rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-amber-700 dark:text-amber-400" />
            <h3 className="font-display font-extrabold text-base deboss-heading">
              {t('campusShieldAlertsCount', { count: safetyFlaggedTickets.length })}
            </h3>
          </div>

          <div className="space-y-2.5">
            {safetyFlaggedTickets.slice(0, 5).map((tk) => (
              <div
                key={tk.id}
                onClick={() => onSelectTicket(tk)}
                className="p-3.5 rounded-xl tactile-surface-elevated hover:border-[#254E68] cursor-pointer text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono-tech font-extrabold text-[#1D3C50] dark:text-[#EFE7E1]">
                    {tk.ticketId}
                  </span>
                  <span className="text-[10px] uppercase font-bold text-amber-800 dark:text-amber-300">
                    {tk.safetyFlags
                      .filter((f) => f !== 'none')
                      .map((f) => translateSafetyFlag(f, language))
                      .join(', ')}
                  </span>
                </div>
                <div className="font-display font-bold text-[#1D3C50] dark:text-[#EFE7E1]">
                  {tk.title}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Student-Disputed Repairs */}
        <div className="tactile-card rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <RotateCcw className="w-5 h-5 text-red-700 dark:text-red-400" />
            <h3 className="font-display font-extrabold text-base deboss-heading">
              {t('studentDisputedRepairsCount', { count: disputedTickets.length })}
            </h3>
          </div>

          <div className="space-y-2.5">
            {disputedTickets.length === 0 ? (
              <p className="text-xs font-bold text-[#254E68] dark:text-[#D3C2B8] py-4">{t('noStudentDisputesActive')}</p>
            ) : (
              disputedTickets.map((tk) => (
                <div
                  key={tk.id}
                  onClick={() => onSelectTicket(tk)}
                  className="p-3.5 rounded-xl tactile-surface-elevated hover:border-red-700 cursor-pointer text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono-tech font-extrabold text-red-800 dark:text-red-300">{tk.ticketId}</span>
                    <span className="text-[10px] font-bold uppercase bg-red-800 text-white px-2 py-0.5 rounded-md">
                      {t('reopenedByStudentBadge')}
                    </span>
                  </div>
                  <div className="font-display font-bold text-[#1D3C50] dark:text-[#EFE7E1]">
                    {tk.title}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
