import React, { useState } from 'react';
import {
  Moon,
  Sun,
  Clock,
  LogOut,
  Globe,
  Building2,
} from 'lucide-react';
import { CampusOrganization, UserProfile } from '../../types';
import {
  Language,
  translateCategory,
  translateHostel,
  translateRole,
  translateRoomLabel,
  useT,
} from '../../data/i18n';
import { getDemoClockOffsetHours } from '../../services/db';
import { DemoClockModal } from './DemoClockModal';
import { BrandLogo } from './BrandLogo';

interface HeaderProps {
  currentUser: UserProfile | null;
  activeCampus?: CampusOrganization | null;
  language: Language;
  onLanguageToggle: () => void;
  darkMode: boolean;
  onDarkModeToggle: () => void;
  onSignOut: () => void;
  onDataRefresh: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  activeCampus,
  language,
  onLanguageToggle,
  darkMode,
  onDarkModeToggle,
  onSignOut,
  onDataRefresh,
}) => {
  const { t } = useT();
  const [showDemoClockModal, setShowDemoClockModal] = useState(false);
  const clockOffset = getDemoClockOffsetHours();
  const campusLabel = activeCampus?.name || currentUser?.campusName;

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-white/75 dark:bg-[#0F2332]/80 backdrop-blur-xl border-b border-[#0E7490]/14 dark:border-sky-400/15 shadow-[0_4px_24px_-6px_rgba(14,116,144,0.08)] transition-colors">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 sm:h-[68px] flex items-center justify-between gap-2">
          {/* Brand Logo & Tagline */}
          <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0">
            <BrandLogo size="md" />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-display font-bold text-base sm:text-xl tracking-tight text-[#0F293A] dark:text-[#F0F9FF]">
                  {t('appTitle')}
                </span>
                {currentUser && (
                  <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold tracking-wide bg-[#E0F2F7] text-[#0E7490] dark:bg-[#0E7490]/30 dark:text-cyan-200 border border-[#0E7490]/20">
                    {translateRole(currentUser.role, currentUser.department, language)}
                  </span>
                )}
                {currentUser && campusLabel && (
                  <span className="hidden lg:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-mono-tech font-semibold bg-emerald-500/12 text-emerald-800 dark:text-emerald-300 border border-emerald-500/25">
                    <Building2 className="w-3 h-3 shrink-0" />
                    <span className="truncate max-w-[200px]">{campusLabel}</span>
                    {activeCampus?.code && (
                      <span className="opacity-75">({activeCampus.code})</span>
                    )}
                    {activeCampus?.status === 'draft' && (
                      <span className="ml-1 px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[9px] uppercase">
                        Draft Setup
                      </span>
                    )}
                  </span>
                )}
              </div>
              <p className="hidden md:block text-[11px] text-[#476778] dark:text-[#94B8CC] font-medium">
                {t('tagline')}
              </p>
            </div>
          </div>

          {/* Right Controls: Demo Clock, Language, Dark Mode, User Profile */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* Demo Clock */}
            <button
              onClick={() => setShowDemoClockModal(true)}
              aria-label={t('demoClockTitle')}
              title={t('demoClockSubtitle')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold min-h-[38px] whitespace-nowrap shrink-0 ${
                clockOffset > 0
                  ? 'tactile-btn-primary ring-2 ring-amber-400/70'
                  : 'tactile-btn-beige'
              }`}
            >
              <Clock className={`w-3.5 h-3.5 shrink-0 ${clockOffset > 0 ? 'text-amber-200' : 'text-[#0E7490] dark:text-cyan-300'}`} />
              <span className="hidden sm:inline">{t('demoClock')}</span>
              <span className="sm:hidden text-[11px]">{t('clockShort')}</span>
              {clockOffset > 0 && <span className="text-[11px] font-mono-tech font-bold text-amber-200">+{clockOffset}h</span>}
            </button>

            {/* Language Toggle */}
            <button
              onClick={onLanguageToggle}
              aria-label="Toggle language between English and Hindi"
              className="tactile-btn-beige flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold min-h-[38px] whitespace-nowrap shrink-0"
            >
              <Globe className="w-3.5 h-3.5 text-[#0E7490] dark:text-cyan-300 shrink-0" />
              <span>{language === 'en' ? 'हिन्दी' : 'EN'}</span>
            </button>

            {/* Dark Mode Toggle */}
            <button
              onClick={onDarkModeToggle}
              aria-label="Toggle dark mode"
              className="tactile-btn-beige p-2 rounded-lg min-h-[38px] min-w-[38px] flex items-center justify-center shrink-0"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-[#0E7490]" />}
            </button>

            {/* User Details & Sign Out */}
            {currentUser && (
              <div className="flex items-center pl-2.5 border-l border-[#0E7490]/15 dark:border-sky-400/15 gap-2">
                <div className="hidden sm:block text-right">
                  <div className="text-xs font-semibold text-[#0F293A] dark:text-[#F0F9FF] truncate max-w-[135px]">
                    {currentUser.name}
                  </div>
                  <div className="text-[11px] font-medium text-[#476778] dark:text-[#94B8CC] truncate max-w-[135px]">
                    {currentUser.role === 'student'
                      ? `${translateHostel(currentUser.hostel || 'Hostel 1', language)} · ${translateRoomLabel(currentUser.room || '', language)}`
                      : currentUser.department
                      ? translateCategory(currentUser.department, language)
                      : translateRole(currentUser.role, undefined, language)}
                  </div>
                </div>

                <button
                  onClick={onSignOut}
                  title={t('signOut')}
                  aria-label={t('signOut')}
                  className="tactile-btn-beige p-2 rounded-lg text-[#0F293A] dark:text-[#F0F9FF] hover:text-red-600 dark:hover:text-red-300 min-h-[38px] min-w-[38px] flex items-center justify-center shrink-0"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Demo Clock Modal */}
      <DemoClockModal
        isOpen={showDemoClockModal}
        onClose={() => setShowDemoClockModal(false)}
        onClockChanged={() => {
          onDataRefresh();
        }}
      />
    </>
  );
};
