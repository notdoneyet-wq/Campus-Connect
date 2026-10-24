import React, { useState } from 'react';
import { PlusCircle, ListTodo, Bell, User, MailCheck, Globe } from 'lucide-react';
import { UserProfile } from '../../types';
import { Language, translateHostel, translateRoomLabel, useT } from '../../data/i18n';
import { verifyStudentEmail } from '../../services/auth';
import { MacOsDock, Tile, type DockApp, type DockCommand } from '@/components/ui/macos-dock';
import { ReportWizard } from './ReportWizard';
import { MyTickets } from './MyTickets';
import { GeneralFeed } from './GeneralFeed';
import { NoticesView } from './NoticesView';
import { StudentProfile } from './StudentProfile';

interface StudentHomeProps {
  currentUser: UserProfile;
  language: Language;
  onLanguageToggle: () => void;
  onSignOut: () => void;
  onUserUpdated?: (user: UserProfile) => void;
}

export const StudentHome: React.FC<StudentHomeProps> = ({
  currentUser,
  language,
  onLanguageToggle,
  onSignOut,
  onUserUpdated,
}) => {
  const { t } = useT();
  const [activeTab, setActiveTab] = useState<'report' | 'tickets' | 'general' | 'notices' | 'profile'>('report');
  const [trackedTicketId, setTrackedTicketId] = useState<string | null>(null);
  const [verifyingEmail, setVerifyingEmail] = useState(false);

  const tabs = [
    { id: 'report', label: t('tabReport'), icon: PlusCircle, color: [14, 116, 144] as [number, number, number] },
    { id: 'tickets', label: t('tabMyTickets'), icon: ListTodo, color: [13, 148, 136] as [number, number, number] },
    { id: 'general', label: t('tabGeneral'), icon: Globe, color: [2, 132, 199] as [number, number, number] },
    { id: 'notices', label: t('tabNotices'), icon: Bell, color: [245, 158, 11] as [number, number, number] },
    { id: 'profile', label: t('tabProfile'), icon: User, color: [59, 130, 246] as [number, number, number] },
  ] as const;

  const dockApps: DockApp[] = tabs.map((tab) => {
    const Icon = tab.icon;
    return {
      id: tab.id,
      label: tab.label,
      icon: (
        <Tile c={tab.color}>
          <Icon className="w-[52%] h-[52%] text-[#0F293A] dark:text-[#F0F9FF] stroke-[2.1]" />
        </Tile>
      ),
    };
  });

  const dockCommands: DockCommand[] = [
    { label: t('tabReport'), kbd: '⌘N' },
    { label: language === 'en' ? 'Switch Language (हिंदी)' : 'Switch Language (EN)', kbd: '⌘L' },
    { label: t('signOut'), kbd: '⌘Q' },
  ];

  const handleDockCommand = (cmd: DockCommand) => {
    if (cmd.kbd === '⌘N') {
      setActiveTab('report');
      setTrackedTicketId(null);
    } else if (cmd.kbd === '⌘L') {
      onLanguageToggle();
    } else if (cmd.kbd === '⌘Q') {
      onSignOut();
    }
  };

  const handleVerifyNow = async () => {
    setVerifyingEmail(true);
    try {
      const updated = await verifyStudentEmail(currentUser.email);
      if (onUserUpdated) onUserUpdated(updated);
    } catch {
      if (onUserUpdated) onUserUpdated({ ...currentUser, emailVerified: true });
    } finally {
      setVerifyingEmail(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between pb-28 sm:pb-8">
      {/* Main Tab Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 pt-6">
        {/* Email Verification Banner if unverified */}
        {currentUser.emailVerified === false && (
          <div className="mb-5 p-4 rounded-xl tactile-card flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 text-[#0F293A] dark:text-[#F0F9FF] font-semibold">
              <MailCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>{t('emailVerificationPending')}</span>
            </div>
            <button
              type="button"
              disabled={verifyingEmail}
              onClick={handleVerifyNow}
              className="tactile-btn-primary px-4 py-2 rounded-lg font-semibold shrink-0 min-h-[38px]"
            >
              {t('verifyEmailNow')}
            </button>
          </div>
        )}

        {/* Student Welcome & Frosted Navigation Strip */}
        <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-[#0E7490]/14 dark:border-sky-400/15">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-mono-tech font-semibold text-[#0E7490] dark:text-cyan-300">
              <span>{translateHostel(currentUser.hostel || 'Hostel 2', language)}</span>
              <span aria-hidden="true">·</span>
              <span>{translateRoomLabel(currentUser.room || 'Room 204', language)}</span>
            </div>
            <h1 className="font-display font-bold text-2xl sm:text-3xl tracking-tight text-[#0F293A] dark:text-[#F0F9FF]">
              {language === 'hi'
                ? `नमस्ते, ${currentUser.name.split(' ')[0]}`
                : `Welcome, ${currentUser.name.split(' ')[0]}`}
            </h1>
          </div>

          {/* Desktop Frosted Segmented Navigation Bar */}
          <div className="hidden sm:flex items-center gap-1 p-1 rounded-xl tactile-inset">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    if (tab.id !== 'tickets') setTrackedTicketId(null);
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all min-h-[40px] whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'tactile-btn-primary'
                      : 'text-[#0F293A] dark:text-[#94B8CC] hover:bg-white/60 dark:hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* View Switcher */}
        {activeTab === 'report' && (
          <ReportWizard
            currentUser={currentUser}
            language={language}
            onTicketSubmitted={(ticketId) => {
              setTrackedTicketId(ticketId);
              setActiveTab('tickets');
            }}
          />
        )}

        {activeTab === 'tickets' && (
          <MyTickets
            currentUser={currentUser}
            language={language}
            preselectedTicketId={trackedTicketId}
            onClearPreselection={() => setTrackedTicketId(null)}
          />
        )}

        {activeTab === 'general' && (
          <GeneralFeed currentUser={currentUser} language={language} />
        )}

        {activeTab === 'notices' && (
          <NoticesView currentUser={currentUser} language={language} />
        )}

        {activeTab === 'profile' && (
          <StudentProfile
            currentUser={currentUser}
            language={language}
            onLanguageToggle={onLanguageToggle}
            onSignOut={onSignOut}
          />
        )}
      </main>

      {/* Mobile-Only Floating Translucent macOS Command Dock */}
      <div className="sm:hidden fixed bottom-4 inset-x-0 z-40 flex justify-center pointer-events-none px-3">
        <div className="pointer-events-auto">
          <MacOsDock
            apps={dockApps}
            runningIds={[activeTab]}
            onAppClick={(id) => {
              const tabId = id as typeof activeTab;
              setActiveTab(tabId);
              if (tabId !== 'tickets') setTrackedTicketId(null);
            }}
            commands={dockCommands}
            onCommand={handleDockCommand}
          />
        </div>
      </div>
    </div>
  );
};
