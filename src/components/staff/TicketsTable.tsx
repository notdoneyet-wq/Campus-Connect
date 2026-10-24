import React, { useState } from 'react';
import {
  Search,
  Clock,
  Lock,
  Droplet,
  Zap,
  Sparkles,
  Wifi,
  ChevronDown,
  ChevronRight,
  LayoutList,
  Building2,
} from 'lucide-react';
import { Category, Ticket, TicketStatus, UserProfile } from '../../types';
import { getSlaStatus } from '../../utils/sla';
import { getSimulatedNow } from '../../services/db';
import { TicketDetailDrawer } from './TicketDetailDrawer';
import { maskSensitiveText } from '../../utils/privacyGuard';
import { filterAuthorizedTickets } from '../../utils/authorization';
import {
  translateCategory,
  translateHostel,
  translateStatus,
  translateUrgency,
  useT,
} from '../../data/i18n';

interface TicketsTableProps {
  tickets: Ticket[];
  currentUser: UserProfile;
  onRefresh: () => void;
}

export const TicketsTable: React.FC<TicketsTableProps> = ({
  tickets,
  currentUser,
  onRefresh,
}) => {
  const { t, language } = useT();
  const [search, setSearch] = useState('');
  const [filterHostel, setFilterHostel] = useState<string>('all');
  const [filterFloor, setFilterFloor] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterUrgency, setFilterUrgency] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'list' | 'accordion'>('list');
  const [openFloorGroups, setOpenFloorGroups] = useState<Record<string, boolean>>({
    'Hostel 1-1': true,
    'Hostel 1-2': true,
    'Hostel 1-3': true,
    'Hostel 2-1': true,
    'Hostel 2-2': true,
    'Hostel 2-3': true,
  });

  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  // Strict Department RBAC
  const deptScopedTickets = filterAuthorizedTickets(currentUser, tickets);
  const canFilterAllCategories = currentUser.role === 'supervisor' || currentUser.role === 'admin';

  // Filter application
  const filtered = deptScopedTickets.filter((tk) => {
    if (filterHostel !== 'all' && tk.hostel !== filterHostel) return false;
    if (filterFloor !== 'all' && String(tk.floor) !== filterFloor) return false;
    if (canFilterAllCategories && filterCategory !== 'all' && tk.category !== filterCategory) {
      return false;
    }
    if (filterStatus !== 'all' && tk.status !== filterStatus) return false;
    if (filterUrgency !== 'all' && tk.urgency !== filterUrgency) return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      const matchId = tk.ticketId.toLowerCase().includes(q);
      const matchTitle = tk.title.toLowerCase().includes(q);
      const matchLoc = tk.locationCode.toLowerCase().includes(q);
      const matchText = tk.rawText.toLowerCase().includes(q);
      if (!matchId && !matchTitle && !matchLoc && !matchText) return false;
    }

    return true;
  });

  const getCategoryIcon = (cat: Category) => {
    switch (cat) {
      case 'plumbing':
        return <Droplet className="w-4 h-4 text-sky-600 shrink-0" />;
      case 'electricity':
        return <Zap className="w-4 h-4 text-amber-600 shrink-0" />;
      case 'cleanliness':
        return <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />;
      case 'internet':
        return <Wifi className="w-4 h-4 text-[#254E68] dark:text-[#D3C2B8] shrink-0" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: TicketStatus) => {
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

  // Group tickets by Hostel + Floor for Floor Accordion view
  const floorGroups = [
    { hostel: 'Hostel 1' as const, floor: 1 },
    { hostel: 'Hostel 1' as const, floor: 2 },
    { hostel: 'Hostel 1' as const, floor: 3 },
    { hostel: 'Hostel 2' as const, floor: 1 },
    { hostel: 'Hostel 2' as const, floor: 2 },
    { hostel: 'Hostel 2' as const, floor: 3 },
  ].map((g) => {
    const groupKey = `${g.hostel}-${g.floor}`;
    const items = filtered.filter((tk) => tk.hostel === g.hostel && tk.floor === g.floor);
    return { ...g, groupKey, items };
  });

  return (
    <div className="space-y-4">
      {/* PrivacyGuard Lock Status Banner */}
      <div className="flex items-center justify-between px-4 py-3 rounded-xl relevo-well text-xs">
        <div className="flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-[#D3C2B8] shrink-0" />
          <span className="font-extrabold text-[#EFE7E1]">{t('privacyGuardActive')}</span>
          <span className="hidden sm:inline text-[#D3C2B8]/85 font-medium">
            {t('privacyGuardDesc')}
          </span>
        </div>
        {(currentUser.role === 'supervisor' || currentUser.role === 'admin') && (
          <span className="text-[11px] font-extrabold text-[#EFE7E1] bg-[#254E68] px-2.5 py-0.5 rounded-md border border-white/15">
            {t('supervisorRevealEnabled')}
          </span>
        )}
      </div>

      {/* Filter, Search, and View Toggle Bar */}
      <div className="tactile-card rounded-2xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#466981] absolute left-3.5 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchTicketsPlaceholder')}
              className="tactile-input w-full pl-9 pr-4 py-2 text-xs rounded-xl font-medium"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Hostel */}
            <select
              value={filterHostel}
              onChange={(e) => setFilterHostel(e.target.value)}
              className="tactile-input p-2 text-xs rounded-xl font-bold"
            >
              <option value="all">{t('allHostels')}</option>
              <option value="Hostel 1">{translateHostel('Hostel 1', language)}</option>
              <option value="Hostel 2">{translateHostel('Hostel 2', language)}</option>
            </select>

            {/* Floor */}
            <select
              value={filterFloor}
              onChange={(e) => setFilterFloor(e.target.value)}
              className="tactile-input p-2 text-xs rounded-xl font-bold"
            >
              <option value="all">{t('allFloors')}</option>
              <option value="1">{t('floorLabel', { floor: 1 })}</option>
              <option value="2">{t('floorLabel', { floor: 2 })}</option>
              <option value="3">{t('floorLabel', { floor: 3 })}</option>
            </select>

            {/* Category (only for supervisors/admins) */}
            {canFilterAllCategories && (
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="tactile-input p-2 text-xs rounded-xl font-bold"
              >
                <option value="all">{t('allDepts')}</option>
                <option value="plumbing">{translateCategory('plumbing', language)}</option>
                <option value="electricity">{translateCategory('electricity', language)}</option>
                <option value="cleanliness">{translateCategory('cleanliness', language)}</option>
                <option value="internet">{translateCategory('internet', language)}</option>
              </select>
            )}

            {/* Status */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="tactile-input p-2 text-xs rounded-xl font-bold"
            >
              <option value="all">{t('allStatuses')}</option>
              <option value="Open">{translateStatus('Open', language)}</option>
              <option value="Assigned">{translateStatus('Assigned', language)}</option>
              <option value="In Progress">{translateStatus('In Progress', language)}</option>
              <option value="Resolved">{translateStatus('Resolved', language)}</option>
              <option value="Verified">{translateStatus('Verified', language)}</option>
              <option value="Reopened">{translateStatus('Reopened', language)}</option>
            </select>

            {/* Urgency */}
            <select
              value={filterUrgency}
              onChange={(e) => setFilterUrgency(e.target.value)}
              className="tactile-input p-2 text-xs rounded-xl font-bold"
            >
              <option value="all">{t('allUrgency')}</option>
              <option value="critical">{translateUrgency('critical', language)}</option>
              <option value="high">{translateUrgency('high', language)}</option>
              <option value="medium">{translateUrgency('medium', language)}</option>
              <option value="low">{translateUrgency('low', language)}</option>
            </select>

            {/* View Toggle: List vs Floor Accordion */}
            <div className="flex items-center p-1 rounded-xl tactile-inset gap-1">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'list'
                    ? 'tactile-btn-primary'
                    : 'text-[#1D3C50] dark:text-[#D3C2B8]'
                }`}
              >
                <LayoutList className="w-3.5 h-3.5" />
                <span>{t('viewList')}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('accordion')}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'accordion'
                    ? 'tactile-btn-primary'
                    : 'text-[#1D3C50] dark:text-[#D3C2B8]'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>{t('viewFloorAccordion')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Floor Accordion View */}
      {viewMode === 'accordion' ? (
        <div className="space-y-3">
          {floorGroups.map((group) => {
            const isOpen = !!openFloorGroups[group.groupKey];
            return (
              <div
                key={group.groupKey}
                className="tactile-card rounded-2xl overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() =>
                    setOpenFloorGroups((prev) => ({
                      ...prev,
                      [group.groupKey]: !prev[group.groupKey],
                    }))
                  }
                  className="w-full flex items-center justify-between px-5 py-3.5 bg-[#D3C2B8]/60 dark:bg-[#132836]/60 hover:bg-[#D3C2B8] dark:hover:bg-[#132836] transition-colors text-left"
                >
                  <div className="flex items-center gap-2.5">
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 text-[#1D3C50] dark:text-[#EFE7E1]" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-[#1D3C50] dark:text-[#EFE7E1]" />
                    )}
                    <span className="font-display font-extrabold text-sm text-[#1D3C50] dark:text-[#EFE7E1]">
                      {translateHostel(group.hostel, language)} ·{' '}
                      {t('floorLabel', { floor: group.floor })}
                    </span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-md text-xs font-mono-tech font-bold relevo-well">
                    {group.items.length}{' '}
                    {group.items.length === 1 ? t('ticketCountSingular') : t('ticketCountPlural')}
                  </span>
                </button>

                {isOpen && (
                  <div className="divide-y divide-[#1D3C50]/15 dark:divide-[#D3C2B8]/15">
                    {group.items.length === 0 ? (
                      <div className="py-5 px-4 text-xs font-semibold text-[#254E68] dark:text-[#D3C2B8] text-center">
                        {t('noTicketsMatchFilters')}
                      </div>
                    ) : (
                      group.items.map((tk) => {
                        const sla = getSlaStatus(
                          tk.slaDueAt,
                          simulatedNow,
                          tk.status === 'Verified' || tk.status === 'Resolved'
                        );
                        return (
                          <div
                            key={tk.id}
                            onClick={() => setSelectedTicket(tk)}
                            className="p-4 hover:bg-[#EFE7E1] dark:hover:bg-[#254E68]/40 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-colors"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono-tech text-xs font-extrabold text-[#254E68] dark:text-[#D3C2B8]">
                                  {tk.ticketId}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${getStatusBadge(
                                    tk.status
                                  )}`}
                                >
                                  {translateStatus(tk.status, language)}
                                </span>
                                <span className="text-xs text-[#254E68] dark:text-[#D3C2B8] font-mono-tech font-bold">
                                  {tk.locationCode}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 font-display font-bold text-sm text-[#1D3C50] dark:text-[#EFE7E1]">
                                {getCategoryIcon(tk.category)}
                                <span>{tk.title}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 text-xs">
                              <span
                                className={`font-mono-tech font-bold flex items-center gap-1 ${
                                  sla.isOverdue ? 'text-red-700 dark:text-red-300' : 'text-[#1D3C50] dark:text-[#EFE7E1]'
                                }`}
                              >
                                <Clock className="w-3.5 h-3.5" />
                                {sla.timeLeftFormatted}
                              </span>
                              <span className="tactile-btn-primary px-3 py-1.5 rounded-lg font-bold">
                                {t('manageBtn')} →
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden lg:block tactile-card rounded-2xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#1D3C50] text-[#D3C2B8] uppercase tracking-wider font-extrabold">
                <tr>
                  <th className="py-3.5 px-4">{t('colTicketId')}</th>
                  <th className="py-3.5 px-4">{t('colTitleIssue')}</th>
                  <th className="py-3.5 px-3">{t('colLocation')}</th>
                  <th className="py-3.5 px-3">{t('colUrgency')}</th>
                  <th className="py-3.5 px-3">{t('colStatus')}</th>
                  <th className="py-3.5 px-3">{t('colAssignee')}</th>
                  <th className="py-3.5 px-3">{t('colSlaCountdown')}</th>
                  <th className="py-3.5 px-3">{t('colReporters')}</th>
                  <th className="py-3.5 px-4 text-right">{t('colAction')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1D3C50]/15 dark:divide-[#D3C2B8]/15">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center font-bold text-[#254E68] dark:text-[#D3C2B8]">
                      {t('noTicketsMatchFilters')}
                    </td>
                  </tr>
                ) : (
                  filtered.map((tk) => {
                    const sla = getSlaStatus(
                      tk.slaDueAt,
                      simulatedNow,
                      tk.status === 'Verified' || tk.status === 'Resolved'
                    );
                    return (
                      <tr
                        key={tk.id}
                        onClick={() => setSelectedTicket(tk)}
                        className="hover:bg-[#EFE7E1] dark:hover:bg-[#254E68]/45 cursor-pointer transition-colors"
                      >
                        <td className="py-3.5 px-4 font-mono-tech font-extrabold text-[#1D3C50] dark:text-[#EFE7E1]">
                          {tk.ticketId}
                        </td>
                        <td className="py-3.5 px-4 max-w-xs">
                          <div className="flex items-center gap-1.5 font-display font-bold text-[#1D3C50] dark:text-[#EFE7E1] truncate">
                            {getCategoryIcon(tk.category)}
                            <span className="truncate">{tk.title}</span>
                          </div>
                          <p className="text-[11px] text-[#254E68] dark:text-[#D3C2B8]/85 truncate mt-0.5 font-medium">
                            {maskSensitiveText(tk.rawText)}
                          </p>
                        </td>
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <span className="font-mono-tech font-bold text-[#254E68] dark:text-[#D3C2B8]">
                            {tk.locationCode}
                          </span>
                        </td>
                        <td className="py-3.5 px-3">
                          <span
                            className={`font-extrabold text-[11px] uppercase ${
                              tk.urgency === 'critical'
                                ? 'text-red-700 dark:text-red-300'
                                : tk.urgency === 'high'
                                ? 'text-amber-700 dark:text-amber-300'
                                : 'text-[#254E68] dark:text-[#D3C2B8]'
                            }`}
                          >
                            {translateUrgency(tk.urgency, language)}
                          </span>
                        </td>
                        <td className="py-3.5 px-3">
                          <span
                            className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${getStatusBadge(
                              tk.status
                            )}`}
                          >
                            {translateStatus(tk.status, language)}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 whitespace-nowrap font-bold text-[#1D3C50] dark:text-[#EFE7E1]">
                          {tk.assignedTo ? (
                            tk.assignedTo.split(' ')[0]
                          ) : (
                            <span className="text-[#466981] font-medium">{t('unassigned')}</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <span
                            className={`font-mono-tech font-bold flex items-center gap-1 text-[11px] ${
                              sla.isOverdue
                                ? 'text-red-700 dark:text-red-300'
                                : sla.badgeColor === 'amber'
                                ? 'text-amber-700 dark:text-amber-300'
                                : 'text-[#1D3C50] dark:text-[#EFE7E1]'
                            }`}
                          >
                            <Clock className="w-3 h-3 shrink-0" />
                            {sla.timeLeftFormatted}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 font-mono-tech font-bold text-[#254E68] dark:text-[#D3C2B8]">{tk.reporters.length}</td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTicket(tk);
                            }}
                            className="tactile-btn-primary px-3 py-1.5 rounded-lg text-xs font-bold"
                          >
                            {t('manageBtn')}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View */}
          <div className="lg:hidden space-y-3">
            {filtered.length === 0 ? (
              <div className="tactile-card rounded-2xl p-8 text-center text-xs font-bold text-[#254E68] dark:text-[#D3C2B8]">
                {t('noTicketsMatchFilters')}
              </div>
            ) : (
              filtered.map((tk) => {
                const sla = getSlaStatus(
                  tk.slaDueAt,
                  simulatedNow,
                  tk.status === 'Verified' || tk.status === 'Resolved'
                );
                return (
                  <div
                    key={tk.id}
                    onClick={() => setSelectedTicket(tk)}
                    className="tactile-card rounded-2xl p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono-tech text-xs font-extrabold text-[#254E68] dark:text-[#D3C2B8]">
                            {tk.ticketId}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getStatusBadge(
                              tk.status
                            )}`}
                          >
                            {translateStatus(tk.status, language)}
                          </span>
                        </div>
                        <h4 className="font-display font-bold text-sm text-[#1D3C50] dark:text-[#EFE7E1] mt-1">
                          {tk.title}
                        </h4>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] font-bold text-[#254E68] dark:text-[#D3C2B8] shrink-0">
                        {getCategoryIcon(tk.category)}
                        <span>{translateCategory(tk.category, language)}</span>
                      </div>
                    </div>

                    <p className="text-xs text-[#254E68] dark:text-[#D3C2B8] line-clamp-2 font-medium">
                      {maskSensitiveText(tk.rawText)}
                    </p>

                    <div className="flex items-center justify-between text-xs pt-2 border-t border-[#1D3C50]/15 dark:border-[#D3C2B8]/15">
                      <span className="font-mono-tech font-bold text-[11px]">{tk.locationCode}</span>
                      <span
                        className={`flex items-center gap-1 font-mono-tech font-bold ${
                          sla.isOverdue ? 'text-red-700' : 'text-[#1D3C50] dark:text-[#EFE7E1]'
                        }`}
                      >
                        <Clock className="w-3.5 h-3.5" />
                        {sla.timeLeftFormatted}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* Detail Drawer */}
      {selectedTicket && (
        <TicketDetailDrawer
          ticket={selectedTicket}
          currentUser={currentUser}
          allTickets={deptScopedTickets}
          onClose={() => setSelectedTicket(null)}
          onTicketUpdated={() => {
            onRefresh();
          }}
        />
      )}
    </div>
  );
};
