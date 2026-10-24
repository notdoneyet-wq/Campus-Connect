import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Bell,
  Layers,
  AlertCircle,
  PlusCircle,
  X,
  Megaphone,
} from 'lucide-react';
import { Incident, Ticket, UserProfile } from '../../types';
import {
  createIncident,
  createNotice,
  fetchIncidents,
  updateTicket,
  getSimulatedNow,
} from '../../services/db';
import { suggestIncidentRootCause } from '../../services/gemini';
import { filterAuthorizedIncidents, filterAuthorizedTickets } from '../../utils/authorization';
import { translateCategory, translateHostel, useT } from '../../data/i18n';

interface IncidentsViewProps {
  tickets: Ticket[];
  currentUser: UserProfile;
  onRefresh: () => void;
}

export const IncidentsView: React.FC<IncidentsViewProps> = ({
  tickets,
  currentUser,
  onRefresh,
}) => {
  const { t, language } = useT();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const [isSearching, setIsSearching] = useState(false);
  const [discoveredSuggestion, setDiscoveredSuggestion] = useState<{
    title: string;
    plausible_shared_cause: string;
    ticketIds: string[];
    confidence: number;
    hostel: string;
    floor: number;
    category: any;
  } | null>(null);

  // Manual Crisis Broadcast Modal State
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualCause, setManualCause] = useState('');
  const [manualHostel, setManualHostel] = useState<string>('Hostel 1');
  const [manualFloor, setManualFloor] = useState<number>(2);
  const [manualCategory, setManualCategory] = useState<any>('plumbing');
  const [manualNoticeEn, setManualNoticeEn] = useState('');
  const [manualNoticeHi, setManualNoticeHi] = useState('');
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  if (!currentUser) return null;

  const authorizedTickets = filterAuthorizedTickets(currentUser, tickets);

  const loadData = async () => {
    setLoading(true);
    const incs = await fetchIncidents(currentUser);
    setIncidents(filterAuthorizedIncidents(currentUser, incs));
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [currentUser?.uid, currentUser?.department]);

  const handleCreateManualIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle.trim() || !manualCause.trim()) return;
    setIsBroadcasting(true);

    try {
      const incCount = incidents.length + 1;
      const incNumber = `INC-${String(incCount).padStart(3, '0')}`;

      await createIncident({
        incidentId: incNumber,
        title: manualTitle.trim(),
        rootCauseSuggestion: manualCause.trim(),
        hostel: manualHostel,
        floor: manualFloor,
        category: manualCategory,
        ticketIds: [],
        status: 'investigating',
        createdBy: currentUser?.name || 'Staff / Supervisor',
      });

      const noticeEnMsg =
        manualNoticeEn.trim() ||
        `CRISIS NOTICE: ${manualTitle.trim()} on ${manualHostel} Floor ${manualFloor}. ${manualCause.trim()} — maintenance team dispatched.`;
      const noticeHiMsg =
        manualNoticeHi.trim() ||
        `संकट सूचना: ${manualHostel} मंज़िल ${manualFloor} पर ${manualTitle.trim()} — रखरखाव टीम तैनात है।`;

      await createNotice({
        hostel: manualHostel,
        floor: manualFloor,
        incidentId: incNumber,
        messageEn: noticeEnMsg,
        messageHi: noticeHiMsg,
        active: true,
      });

      setShowManualModal(false);
      setManualTitle('');
      setManualCause('');
      setManualNoticeEn('');
      setManualNoticeHi('');
      await loadData();
      onRefresh();
    } catch (err: any) {
      console.error('Failed to create manual incident:', err);
    } finally {
      setIsBroadcasting(false);
    }
  };

  const handleFindRelatedReports = async () => {
    setIsSearching(true);
    setDiscoveredSuggestion(null);
    setInfoMessage(null);

    const openTickets = authorizedTickets.filter(
      (tk) => tk.status === 'Open' || tk.status === 'Assigned' || tk.status === 'In Progress'
    );

    const clusterMap = new Map<string, Ticket[]>();
    openTickets.forEach((tk) => {
      const key = `${tk.hostel}_${tk.floor}_${tk.category}`;
      const list = clusterMap.get(key) || [];
      list.push(tk);
      clusterMap.set(key, list);
    });

    let bestCluster: Ticket[] = [];
    for (const list of clusterMap.values()) {
      if (list.length >= 2) {
        bestCluster = list;
        break;
      }
    }

    if (bestCluster.length < 2) {
      setInfoMessage(t('noClusteredReportsAlert'));
      setIsSearching(false);
      return;
    }

    try {
      const suggestion = await suggestIncidentRootCause(bestCluster, language);
      setDiscoveredSuggestion({
        ...suggestion,
        hostel: bestCluster[0].hostel,
        floor: bestCluster[0].floor,
        category: bestCluster[0].category,
      });
    } catch (err) {
      console.warn('AI cluster analysis note:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleConfirmIncident = async () => {
    if (!discoveredSuggestion) return;

    const incCount = incidents.length + 1;
    const incNumber = `INC-${String(incCount).padStart(3, '0')}`;

    await createIncident({
      incidentId: incNumber,
      title: discoveredSuggestion.title,
      rootCauseSuggestion: discoveredSuggestion.plausible_shared_cause,
      hostel: discoveredSuggestion.hostel,
      floor: discoveredSuggestion.floor,
      category: discoveredSuggestion.category,
      ticketIds: discoveredSuggestion.ticketIds,
      status: 'investigating',
      createdBy: currentUser?.name || 'Staff',
    });

    await createNotice({
      hostel: discoveredSuggestion.hostel,
      floor: discoveredSuggestion.floor,
      incidentId: incNumber,
      messageEn: `Known issue: ${discoveredSuggestion.title} on ${discoveredSuggestion.hostel} Floor ${discoveredSuggestion.floor} — team working on it (Incident #${incNumber}).`,
      messageHi: `ज्ञात समस्या: ${discoveredSuggestion.hostel} मंज़िल ${discoveredSuggestion.floor} पर समस्या दर्ज है — टीम कार्यरत है (समस्या #${incNumber})।`,
      active: true,
    });

    for (const tid of discoveredSuggestion.ticketIds) {
      const target = authorizedTickets.find((tk) => tk.ticketId === tid);
      if (target) {
        await updateTicket(target.id, { incidentId: incNumber });
      }
    }

    setDiscoveredSuggestion(null);
    await loadData();
    onRefresh();
  };

  const handleResolveIncident = async (incident: Incident) => {
    const now = getSimulatedNow();
    for (const tid of incident.ticketIds) {
      const target = authorizedTickets.find((tk) => tk.ticketId === tid);
      if (target && target.status !== 'Verified') {
        await updateTicket(
          target.id,
          {
            status: 'Resolved',
            resolution: {
              note: `Resolved via master Incident #${incident.incidentId}: ${incident.title}`,
              at: now,
            },
          },
          {
            actorId: currentUser?.uid || 'staff',
            actorRole: currentUser?.role || 'staff',
            actorName: currentUser?.name || 'Staff',
            type: 'resolved',
            oldValue: target.status,
            newValue: 'Resolved',
            note: `Master incident ${incident.incidentId} resolved by staff.`,
          }
        );
      }
    }

    await loadData();
    onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-extrabold deboss-heading flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg relevo-well flex items-center justify-center">
              <Layers className="w-4 h-4 text-[#D3C2B8]" />
            </div>
            <span>{t('incidentIntelligenceTitle')}</span>
          </h2>
          <p className="text-xs font-medium text-[#254E68] dark:text-[#D3C2B8] mt-0.5">
            {t('incidentIntelligenceDesc')}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => setShowManualModal(true)}
            className="tactile-btn-beige flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold min-h-[42px]"
          >
            <PlusCircle className="w-4 h-4 text-[#254E68] dark:text-[#D3C2B8]" />
            <span>+ Broadcast Crisis / Incident</span>
          </button>

          <button
            type="button"
            disabled={isSearching}
            onClick={handleFindRelatedReports}
            className="tactile-btn-primary flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold disabled:opacity-50 min-h-[42px]"
          >
            <Sparkles className="w-4 h-4 text-[#D3C2B8]" />
            <span>{isSearching ? t('analyzingClustersBtn') : t('findRelatedReportsBtn')}</span>
          </button>
        </div>
      </div>

      {infoMessage && (
        <div className="p-3.5 rounded-xl tactile-surface-elevated border-l-4 border-l-amber-600 text-xs font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
          <span>{infoMessage}</span>
        </div>
      )}

      {/* Discovered Cluster Suggestion Box */}
      {discoveredSuggestion && (
        <div className="tactile-card-navy rounded-2xl p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#D3C2B8]">
                {t('geminiRootCauseHypothesis')}
              </span>
              <h3 className="font-display font-extrabold text-lg text-[#EFE7E1]">
                {discoveredSuggestion.title}
              </h3>
            </div>
            <span className="px-2.5 py-1 rounded-lg text-xs font-mono-tech font-bold bg-[#D3C2B8] text-[#1D3C50]">
              {Math.round(discoveredSuggestion.confidence * 100)}% {t('confidenceLabel')}
            </span>
          </div>

          <p className="text-xs text-[#D3C2B8] leading-relaxed font-medium">
            {discoveredSuggestion.plausible_shared_cause}
          </p>

          <div className="flex flex-wrap items-center gap-2 text-xs text-[#D3C2B8]">
            <span className="font-bold">{t('linkedTicketCluster')}:</span>
            {discoveredSuggestion.ticketIds.map((tid) => (
              <span
                key={tid}
                className="font-mono-tech font-bold px-2.5 py-0.5 rounded-md bg-[#132836] border border-white/15 text-[#EFE7E1]"
              >
                {tid}
              </span>
            ))}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setDiscoveredSuggestion(null)}
              className="tactile-btn-steel px-4 py-2 rounded-xl text-xs font-bold"
            >
              {t('dismissBtn')}
            </button>
            <button
              type="button"
              onClick={handleConfirmIncident}
              className="tactile-btn-beige flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-extrabold"
            >
              <Bell className="w-4 h-4" />
              <span>{t('confirmBroadcastNoticeBtn')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Incidents List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-32 tactile-inset rounded-2xl animate-pulse"
            />
          ))}
        </div>
      ) : incidents.length === 0 ? (
        <div className="tactile-card rounded-2xl p-10 text-center space-y-2">
          <p className="text-sm font-bold text-[#254E68] dark:text-[#D3C2B8]">
            {t('noActiveIncidentsDeclared')}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {incidents.map((inc) => (
            <div
              key={inc.id}
              className="tactile-card rounded-2xl p-6 space-y-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono-tech text-xs font-extrabold text-[#254E68] dark:text-[#D3C2B8]">
                      {inc.incidentId}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase relevo-well">
                      {inc.status}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-[#254E68] text-[#EFE7E1]">
                      {translateCategory(inc.category, language)}
                    </span>
                  </div>
                  <h3 className="font-display font-bold text-lg text-[#1D3C50] dark:text-[#EFE7E1] mt-1">
                    {inc.title}
                  </h3>
                </div>

                <span className="text-xs font-bold text-[#254E68] dark:text-[#D3C2B8]">
                  {translateHostel(inc.hostel, language)} · {t('floorLabel', { floor: inc.floor })}
                </span>
              </div>

              <div className="p-3.5 rounded-xl tactile-surface-elevated">
                <p className="text-xs font-medium text-[#1D3C50] dark:text-[#EFE7E1] leading-relaxed">
                  {inc.rootCauseSuggestion}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#254E68] dark:text-[#D3C2B8]">{t('impactedTicketsLabel')}:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {inc.ticketIds.map((tid) => (
                      <span
                        key={tid}
                        className="font-mono-tech font-bold px-2.5 py-0.5 rounded-md tactile-inset text-[11px]"
                      >
                        {tid}
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleResolveIncident(inc)}
                  className="tactile-btn-primary px-4 py-2 rounded-xl text-xs font-bold"
                >
                  {t('resolveIncidentOfferFixesBtn')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Manual Crisis / Major Incident Broadcast Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#132836]/75 backdrop-blur-xs">
          <div className="tactile-card rounded-2xl p-6 max-w-lg w-full space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-[#1D3C50]/15 dark:border-[#D3C2B8]/15">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl relevo-well text-[#D3C2B8]">
                  <Megaphone className="w-4 h-4" />
                </div>
                <h3 className="font-display font-extrabold text-lg deboss-heading">
                  Broadcast Major Crisis Notice
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="tactile-btn-beige p-2 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateManualIncident} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-[#1D3C50] dark:text-[#EFE7E1] mb-1">
                  Crisis Title / Major Defect *
                </label>
                <input
                  type="text"
                  required
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="e.g. Main Water Pipeline Burst or Main Switchboard Outage"
                  className="tactile-input w-full p-2.5 rounded-xl font-medium"
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-bold text-[#1D3C50] dark:text-[#EFE7E1] mb-1">
                    Hostel *
                  </label>
                  <select
                    value={manualHostel}
                    onChange={(e) => setManualHostel(e.target.value as any)}
                    className="tactile-input w-full p-2.5 rounded-xl font-bold"
                  >
                    <option value="Hostel 1">Hostel 1</option>
                    <option value="Hostel 2">Hostel 2</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-[#1D3C50] dark:text-[#EFE7E1] mb-1">
                    Floor *
                  </label>
                  <select
                    value={manualFloor}
                    onChange={(e) => setManualFloor(Number(e.target.value))}
                    className="tactile-input w-full p-2.5 rounded-xl font-bold"
                  >
                    <option value={1}>Floor 1</option>
                    <option value={2}>Floor 2</option>
                    <option value={3}>Floor 3</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-[#1D3C50] dark:text-[#EFE7E1] mb-1">
                    Category *
                  </label>
                  <select
                    value={manualCategory}
                    onChange={(e) => setManualCategory(e.target.value as any)}
                    className="tactile-input w-full p-2.5 rounded-xl font-bold"
                  >
                    <option value="plumbing">Plumbing</option>
                    <option value="electricity">Electricity</option>
                    <option value="cleanliness">Cleanliness</option>
                    <option value="internet">Internet</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#1D3C50] dark:text-[#EFE7E1] mb-1">
                  Root Cause / Action Note *
                </label>
                <textarea
                  required
                  rows={2}
                  value={manualCause}
                  onChange={(e) => setManualCause(e.target.value)}
                  placeholder="e.g. Major valve ruptured near washroom section. Plumbers on site."
                  className="tactile-input w-full p-2.5 rounded-xl font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-[#1D3C50] dark:text-[#EFE7E1] mb-1">
                  Student Broadcast Message (English)
                </label>
                <input
                  type="text"
                  value={manualNoticeEn}
                  onChange={(e) => setManualNoticeEn(e.target.value)}
                  placeholder="Optional custom message for English student portal"
                  className="tactile-input w-full p-2.5 rounded-xl font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-[#1D3C50] dark:text-[#EFE7E1] mb-1">
                  छात्र सूचना संदेश (हिन्दी)
                </label>
                <input
                  type="text"
                  value={manualNoticeHi}
                  onChange={(e) => setManualNoticeHi(e.target.value)}
                  placeholder="हिंदी छात्र पोर्टल के लिए वैकल्पिक संदेश"
                  className="tactile-input w-full p-2.5 rounded-xl font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#1D3C50]/15 dark:border-[#D3C2B8]/15">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="tactile-btn-beige px-4 py-2.5 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isBroadcasting || !manualTitle.trim() || !manualCause.trim()}
                  className="tactile-btn-primary px-5 py-2.5 rounded-xl font-bold disabled:opacity-40"
                >
                  {isBroadcasting ? 'Broadcasting Notice...' : 'Broadcast Crisis to Students'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
