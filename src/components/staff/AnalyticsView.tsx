import React, { useState } from 'react';
import {
  CheckCircle2,
  TrendingUp,
  Clock,
  Sparkles,
  RotateCcw,
  RefreshCw,
} from 'lucide-react';
import { Ticket, UserProfile } from '../../types';
import { computeCampusAnalytics } from '../../utils/analytics';
import { generateCampusPulse } from '../../services/gemini';
import { filterAuthorizedTickets } from '../../utils/authorization';
import { translateCategory, translateHostel, useT } from '../../data/i18n';

interface AnalyticsViewProps {
  tickets: Ticket[];
  currentUser: UserProfile;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ tickets, currentUser }) => {
  const { t, language } = useT();
  const [campusPulse, setCampusPulse] = useState<string | null>(null);
  const [isGeneratingPulse, setIsGeneratingPulse] = useState(false);

  // Enforce Department RBAC on analytics metrics
  const authorizedTickets = filterAuthorizedTickets(currentUser, tickets);
  const stats = computeCampusAnalytics(authorizedTickets);

  const handleGeneratePulse = async () => {
    setIsGeneratingPulse(true);
    try {
      const summary = await generateCampusPulse(stats, language);
      setCampusPulse(summary);
    } catch (err) {
      console.warn('Campus Pulse error:', err);
    } finally {
      setIsGeneratingPulse(false);
    }
  };

  const visibleCategories = Object.entries(stats.categoryCounts).filter(([cat]) => {
    if (cat === 'unclear') return false;
    if (currentUser.role === 'staff' && currentUser.department) {
      return cat === currentUser.department;
    }
    return true;
  });

  const maxCategoryCount = Math.max(1, ...visibleCategories.map(([, c]) => c));
  const maxFloorCount = Math.max(1, ...Object.values(stats.hostelFloorCounts));

  return (
    <div className="space-y-6">
      {/* Top Headline Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Headline: Verified-Resolution Rate */}
        <div className="relevo-well p-6 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase font-bold tracking-wider text-[#D3C2B8]">
              {t('verifiedResolutionRateTitle')}
            </span>
            <CheckCircle2 className="w-5 h-5 text-[#D3C2B8]" />
          </div>
          <div className="text-4xl font-mono-tech font-extrabold emboss-text-light">{stats.verifiedResolutionRate}%</div>
          <p className="text-xs text-[#D3C2B8]/90 font-medium">
            {t('verifiedCompletedRatio', {
              verified: stats.verifiedCount,
              completed: stats.verifiedCount + stats.resolvedCount,
            })}
          </p>
        </div>

        {/* Reopen Rate */}
        <div className="tactile-card rounded-2xl p-6 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase font-bold tracking-wider text-[#254E68] dark:text-[#D3C2B8]">
              {t('reopenRateTitle')}
            </span>
            <RotateCcw className="w-5 h-5 text-red-700" />
          </div>
          <div className="text-3xl font-mono-tech font-extrabold deboss-heading">
            {stats.reopenRate}%
          </div>
          <p className="text-xs font-medium text-[#254E68] dark:text-[#D3C2B8]">
            {t('disputedOutOfTotal', {
              reopened: stats.reopenedCount,
              total: stats.totalTickets,
            })}
          </p>
        </div>

        {/* Avg Time to Acknowledge */}
        <div className="tactile-card rounded-2xl p-6 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase font-bold tracking-wider text-[#254E68] dark:text-[#D3C2B8]">
              {t('avgAcknowledgeTimeTitle')}
            </span>
            <Clock className="w-5 h-5 text-[#254E68] dark:text-[#D3C2B8]" />
          </div>
          <div className="text-3xl font-mono-tech font-extrabold deboss-heading">
            {stats.avgTimeToAcknowledgeHours}h
          </div>
          <p className="text-xs font-medium text-[#254E68] dark:text-[#D3C2B8]">{t('fromSubmissionToDispatch')}</p>
        </div>

        {/* Avg Time to Verified */}
        <div className="tactile-card rounded-2xl p-6 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase font-bold tracking-wider text-[#254E68] dark:text-[#D3C2B8]">
              {t('avgVerifiedResolutionTitle')}
            </span>
            <TrendingUp className="w-5 h-5 text-emerald-700" />
          </div>
          <div className="text-3xl font-mono-tech font-extrabold deboss-heading">
            {stats.avgTimeToVerifiedHours}h
          </div>
          <p className="text-xs font-medium text-[#254E68] dark:text-[#D3C2B8]">{t('endToEndVerifiedFix')}</p>
        </div>
      </div>

      {/* Campus Pulse Daily Briefing */}
      <div className="tactile-card rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-display font-extrabold text-lg deboss-heading flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#254E68] dark:text-[#D3C2B8]" />
              <span>{t('campusPulseTitle')}</span>
            </h3>
            <p className="text-xs font-medium text-[#254E68] dark:text-[#D3C2B8]">
              {t('campusPulseDesc')}
            </p>
          </div>

          <button
            type="button"
            disabled={isGeneratingPulse}
            onClick={handleGeneratePulse}
            className="tactile-btn-primary flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold disabled:opacity-50 min-h-[42px]"
          >
            {isGeneratingPulse ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            <span>
              {isGeneratingPulse ? t('synthesizingPulseBtn') : t('generateCampusPulseBtn')}
            </span>
          </button>
        </div>

        {campusPulse && (
          <div className="p-4 rounded-xl relevo-well text-xs leading-relaxed whitespace-pre-line">
            <div className="text-[10px] uppercase font-bold tracking-widest text-[#D3C2B8] mb-1">
              {t('aiSummaryOfTodayData')}:
            </div>
            <div className="text-[#EFE7E1] font-medium">{campusPulse}</div>
          </div>
        )}
      </div>

      {/* Bar Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Open Tickets by Category */}
        <div className="tactile-card rounded-2xl p-6 space-y-4">
          <h4 className="font-display font-extrabold text-base deboss-heading">
            {t('openTicketsByDeptTitle')}
          </h4>

          <div className="space-y-3.5 pt-1">
            {visibleCategories.map(([cat, count]) => {
              const pct = Math.round((count / maxCategoryCount) * 100);
              return (
                <div key={cat} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-[#1D3C50] dark:text-[#EFE7E1]">
                      {translateCategory(cat, language)}
                    </span>
                    <span className="font-mono-tech text-[#254E68] dark:text-[#D3C2B8]">
                      {count} {count === 1 ? t('ticketCountSingular') : t('ticketCountPlural')}
                    </span>
                  </div>
                  <div className="w-full h-3.5 rounded-full tactile-inset p-0.5 overflow-hidden">
                    <div
                      className="h-full bg-[#1D3C50] dark:bg-[#7A9BB2] rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(5, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tickets by Hostel / Floor */}
        <div className="tactile-card rounded-2xl p-6 space-y-4">
          <h4 className="font-display font-extrabold text-base deboss-heading">
            {t('volumeByHostelFloorTitle')}
          </h4>

          <div className="space-y-3.5 pt-1">
            {Object.entries(stats.hostelFloorCounts).map(([key, count]) => {
              const pct = Math.round((count / maxFloorCount) * 100);
              const hostelPart = key.startsWith('H1') ? 'Hostel 1' : 'Hostel 2';
              const floorPart = key.slice(-1);
              const label = `${translateHostel(hostelPart, language)} · ${t('floorLabel', { floor: floorPart })}`;
              return (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-[#1D3C50] dark:text-[#EFE7E1]">{label}</span>
                    <span className="font-mono-tech text-[#254E68] dark:text-[#D3C2B8]">
                      {count} {count === 1 ? t('ticketCountSingular') : t('ticketCountPlural')}
                    </span>
                  </div>
                  <div className="w-full h-3.5 rounded-full tactile-inset p-0.5 overflow-hidden">
                    <div
                      className="h-full bg-[#254E68] dark:bg-[#D3C2B8] rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(5, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top 5 Recurring Locations */}
      <div className="tactile-card rounded-2xl p-6 space-y-4">
        <h4 className="font-display font-extrabold text-base deboss-heading">
          {t('topRecurringSpotsTitle')}
        </h4>

        {stats.topRecurringLocations.length === 0 ? (
          <p className="text-xs font-semibold text-[#254E68] dark:text-[#D3C2B8]">{t('noRecurringSpotsFlagged')}</p>
        ) : (
          <div className="divide-y divide-[#1D3C50]/15 dark:divide-[#D3C2B8]/15 text-xs">
            {stats.topRecurringLocations.map((loc, idx) => (
              <div key={idx} className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-lg relevo-well font-mono-tech font-extrabold flex items-center justify-center text-xs">
                    #{idx + 1}
                  </span>
                  <div>
                    <span className="font-display font-bold text-sm text-[#1D3C50] dark:text-[#EFE7E1] block">
                      {loc.label}
                    </span>
                    <span className="text-[11px] text-[#254E68] dark:text-[#D3C2B8] font-mono-tech font-semibold">
                      {t('codeLabel')}: {loc.locationCode} • {t('categoryLabel')}:{' '}
                      {translateCategory(loc.category, language)}
                    </span>
                  </div>
                </div>

                <span className="px-3 py-1 rounded-lg text-xs font-mono-tech font-bold tactile-surface-elevated">
                  {t('complaintsCount', { count: loc.count })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
