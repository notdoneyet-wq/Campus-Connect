import React, { useState, useEffect } from 'react';
import {
  ListTodo,
  Layers,
  GitMerge,
  AlertTriangle,
  AlertOctagon,
  BarChart3,
  Wrench,
  Database,
  Trash2,
  ShieldCheck,
  Building2,
} from 'lucide-react';
import { CampusOrganization, Ticket, UserProfile } from '../../types';
import {
  fetchTickets,
  fetchMyCampus,
  seedDemoDataset,
  clearDemoDataset,
  checkAndTriggerOverdueEscalations,
} from '../../services/db';
import { createDefaultDemoCampus, getActiveCampusCache } from '../../data/campus';
import { filterAuthorizedTickets } from '../../utils/authorization';
import { translateCategory, translateRole, useT } from '../../data/i18n';
import { MacOsDock, Tile, type DockApp, type DockCommand } from '@/components/ui/macos-dock';
import { TicketsTable } from './TicketsTable';
import { CampusMapTwin } from './CampusMapTwin';
import { DuplicatesQueue } from './DuplicatesQueue';
import { IncidentsView } from './IncidentsView';
import { EscalationsView } from './EscalationsView';
import { AnalyticsView } from './AnalyticsView';
import { TechniciansView } from './TechniciansView';
import { TicketDetailDrawer } from './TicketDetailDrawer';
import { CampusSetupWizard } from '../admin/CampusSetupWizard';

interface StaffConsoleProps {
  currentUser: UserProfile;
  activeCampus?: CampusOrganization | null;
  onCampusUpdated?: (campus: CampusOrganization) => void;
}

export const StaffConsole: React.FC<StaffConsoleProps> = ({
  currentUser,
  activeCampus: propCampus,
  onCampusUpdated,
}) => {
  const { t, language } = useT();
  const [activeSection, setActiveSection] = useState<
    | 'tickets'
    | 'map'
    | 'duplicates'
    | 'incidents'
    | 'escalations'
    | 'analytics'
    | 'technicians'
    | 'map_studio'
  >('tickets');

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [campus, setCampus] = useState<CampusOrganization>(
    () => propCampus || getActiveCampusCache() || createDefaultDemoCampus()
  );
  const [loading, setLoading] = useState(true);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [selectedTicketForDrawer, setSelectedTicketForDrawer] = useState<Ticket | null>(null);

  if (!currentUser) return null;

  const loadAll = async () => {
    setLoading(true);
    await checkAndTriggerOverdueEscalations();
    const [list, loadedCampus] = await Promise.all([
      fetchTickets(currentUser),
      fetchMyCampus(currentUser),
    ]);
    if (loadedCampus) {
      setCampus(loadedCampus);
      if (onCampusUpdated) onCampusUpdated(loadedCampus);
    }
    const authorized = filterAuthorizedTickets(currentUser, list);
    setTickets(authorized);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, [currentUser?.uid, currentUser?.role, currentUser?.department, currentUser?.campusId]);

  const handleLoadDemoData = async () => {
    await seedDemoDataset();
    await loadAll();
    setStatusBanner(t('loadedDemoDataToast'));
    setTimeout(() => setStatusBanner(null), 4000);
  };

  const handleClearDemoData = async () => {
    await clearDemoDataset();
    await loadAll();
    setStatusBanner(t('clearedDemoDataToast'));
    setTimeout(() => setStatusBanner(null), 4000);
  };

  const baseNavItems = [
    { id: 'tickets' as const, label: t('navTickets'), icon: ListTodo, color: [14, 116, 144] as [number, number, number] },
    { id: 'map' as const, label: t('navCampusMap'), icon: Layers, color: [13, 148, 136] as [number, number, number] },
    { id: 'duplicates' as const, label: t('navDuplicates'), icon: GitMerge, color: [139, 92, 246] as [number, number, number] },
    { id: 'incidents' as const, label: t('navIncidents'), icon: AlertTriangle, color: [245, 158, 11] as [number, number, number] },
    { id: 'escalations' as const, label: t('navEscalations'), icon: AlertOctagon, color: [239, 68, 84] as [number, number, number] },
    { id: 'analytics' as const, label: t('navAnalytics'), icon: BarChart3, color: [2, 132, 199] as [number, number, number] },
    { id: 'technicians' as const, label: t('navTechnicians'), icon: Wrench, color: [59, 130, 246] as [number, number, number] },
  ];

  const navItems =
    currentUser.role === 'admin'
      ? [
          ...baseNavItems,
          {
            id: 'map_studio' as const,
            label: language === 'hi' ? 'कैंपस मैप स्टूडियो' : 'Campus Map Studio',
            icon: Building2,
            color: [16, 185, 129] as [number, number, number],
          },
        ]
      : baseNavItems;

  const dockApps: DockApp[] = navItems.map((item) => {
    const Icon = item.icon;
    return {
      id: item.id,
      label: item.label,
      icon: (
        <Tile c={item.color}>
          <Icon className="w-[52%] h-[52%] text-[#0F293A] dark:text-[#F0F9FF] stroke-[2.1]" />
        </Tile>
      ),
    };
  });

  const dockCommands: DockCommand[] = [
    { label: t('loadDemoDataBtn'), kbd: '⌘D' },
    { label: t('clearDemoDataBtn'), kbd: '⌘X' },
    { label: t('navDuplicates'), kbd: '⌘M' },
  ];

  const handleDockCommand = (cmd: DockCommand) => {
    if (cmd.kbd === '⌘D') {
      handleLoadDemoData();
    } else if (cmd.kbd === '⌘X') {
      handleClearDemoData();
    } else if (cmd.kbd === '⌘M') {
      setActiveSection('duplicates');
    }
  };

  const isSupervisorOrAdmin = currentUser.role === 'supervisor' || currentUser.role === 'admin';

  return (
    <div className="min-h-[calc(100vh-68px)] flex flex-col md:flex-row pb-28 md:pb-0">
      {/* Desktop Frosted Glass Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-[#0E7490]/14 dark:border-sky-400/15 bg-white/70 dark:bg-[#0F2332]/75 backdrop-blur-xl p-4 space-y-6 shrink-0">
        {/* Authorized Scope & Campus Isolation Panel */}
        <div className="p-3.5 rounded-xl relevo-well space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-cyan-100">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>{t('authorizedDeptScope')}</span>
          </div>
          <div className="font-display text-sm font-bold text-white">
            {currentUser.role === 'staff' && currentUser.department
              ? `${translateCategory(currentUser.department, language)}`
              : translateRole(currentUser.role, currentUser.department, language)}
          </div>
          <div className="text-[11px] font-mono-tech text-cyan-100/90 truncate">
            {campus.name} ({campus.code})
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-[11px] font-semibold text-[#476778] dark:text-[#94B8CC] px-2 block">
            {t('navigationLabel')}
          </span>
          <nav className="space-y-1 p-1.5 rounded-2xl tactile-inset">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all min-h-[40px] ${
                    isActive
                      ? 'tactile-btn-primary'
                      : 'text-[#0F293A] dark:text-[#94B8CC] hover:bg-white/60 dark:hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Demo Data Controls */}
        {(isSupervisorOrAdmin || currentUser.role === 'staff') && (
          <div className="pt-4 border-t border-[#0E7490]/14 dark:border-sky-400/15 space-y-2.5">
            <span className="text-[11px] font-semibold text-[#476778] dark:text-[#94B8CC] px-2 block">
              {t('supervisorDemoControls')}
            </span>
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleLoadDemoData}
                className="tactile-btn-beige w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold min-h-[40px]"
              >
                <Database className="w-3.5 h-3.5 text-[#0E7490] dark:text-cyan-300" />
                <span>{t('loadDemoDataBtn')}</span>
              </button>

              <button
                type="button"
                onClick={handleClearDemoData}
                className="tactile-btn-beige w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-red-700 dark:text-red-300 min-h-[40px]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('clearDemoDataBtn')}</span>
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content View */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-5">
        {statusBanner && (
          <div className="p-3.5 rounded-xl relevo-well text-xs font-semibold flex items-center gap-2">
            <span>{statusBanner}</span>
          </div>
        )}

        {activeSection === 'map_studio' && currentUser.role === 'admin' ? (
          <CampusSetupWizard
            currentUser={currentUser}
            campus={campus}
            onCampusUpdated={(updated) => {
              setCampus(updated);
              if (onCampusUpdated) onCampusUpdated(updated);
            }}
            onPortalPublished={(published) => {
              setCampus(published);
              if (onCampusUpdated) onCampusUpdated(published);
              setStatusBanner(
                `Published ${published.name} Portal (Map v${published.version}). Existing complaint locations remain preserved.`
              );
              setActiveSection('map');
            }}
            onCloseStudio={() => setActiveSection('map')}
          />
        ) : loading ? (
          <div className="space-y-4">
            <div className="h-9 w-52 tactile-inset rounded-xl animate-pulse" />
            <div className="h-64 tactile-inset rounded-2xl animate-pulse" />
          </div>
        ) : (
          <>
            {activeSection === 'tickets' && (
              <TicketsTable
                tickets={tickets}
                currentUser={currentUser}
                onRefresh={loadAll}
              />
            )}

            {activeSection === 'map' && (
              <CampusMapTwin tickets={tickets} currentUser={currentUser} />
            )}

            {activeSection === 'duplicates' && (
              <DuplicatesQueue
                tickets={tickets}
                currentUser={currentUser}
                onRefresh={loadAll}
              />
            )}

            {activeSection === 'incidents' && (
              <IncidentsView
                tickets={tickets}
                currentUser={currentUser}
                onRefresh={loadAll}
              />
            )}

            {activeSection === 'escalations' && (
              <EscalationsView
                tickets={tickets}
                currentUser={currentUser}
                onSelectTicket={(tk) => setSelectedTicketForDrawer(tk)}
                onRefresh={loadAll}
              />
            )}

            {activeSection === 'analytics' && (
              <AnalyticsView tickets={tickets} currentUser={currentUser} />
            )}

            {activeSection === 'technicians' && (
              <TechniciansView currentUser={currentUser} />
            )}
          </>
        )}
      </main>

      {/* Mobile-Only Floating Translucent macOS Command Dock */}
      <div className="md:hidden fixed bottom-4 inset-x-0 z-40 flex justify-center pointer-events-none px-2">
        <div className="pointer-events-auto max-w-full">
          <MacOsDock
            apps={dockApps}
            runningIds={[activeSection]}
            onAppClick={(id) => {
              setActiveSection(id as typeof activeSection);
            }}
            commands={dockCommands}
            onCommand={handleDockCommand}
          />
        </div>
      </div>

      {/* Secondary Drawer if opened from Escalations */}
      {selectedTicketForDrawer && (
        <TicketDetailDrawer
          ticket={selectedTicketForDrawer}
          currentUser={currentUser}
          allTickets={tickets}
          onClose={() => setSelectedTicketForDrawer(null)}
          onTicketUpdated={() => {
            loadAll();
          }}
        />
      )}
    </div>
  );
};
