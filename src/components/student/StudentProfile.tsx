import React from 'react';
import { Mail, Hash, Building, Globe, LogOut, CheckCircle2, AlertCircle } from 'lucide-react';
import { UserProfile } from '../../types';
import { Language, translateHostel, translateRoomLabel, useT } from '../../data/i18n';

interface StudentProfileProps {
  currentUser: UserProfile;
  language: Language;
  onLanguageToggle: () => void;
  onSignOut: () => void;
}

export const StudentProfile: React.FC<StudentProfileProps> = ({
  currentUser,
  language,
  onLanguageToggle,
  onSignOut,
}) => {
  const { t } = useT();
  const isVerified = currentUser.emailVerified !== false;

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 pb-24">
      <div className="tactile-card rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl relevo-well flex items-center justify-center font-display font-extrabold text-2xl emboss-text-light">
            {currentUser.name.slice(0, 1)}
          </div>
          <div>
            <h2 className="font-display text-2xl font-extrabold deboss-heading">
              {currentUser.name}
            </h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs text-[#254E68] dark:text-[#D3C2B8] font-bold">
                {t('campusStudentAccount')}
              </span>
              {isVerified ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-[#254E68] text-[#EFE7E1]">
                  <CheckCircle2 className="w-3 h-3" />
                  {language === 'hi' ? 'सत्यापित ईमेल' : 'Verified Email'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-700 text-white">
                  <AlertCircle className="w-3 h-3" />
                  {language === 'hi' ? 'ईमेल सत्यापन लंबित' : 'Verification Pending'}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="tactile-surface-elevated rounded-xl p-4 divide-y divide-[#1D3C50]/15 dark:divide-[#D3C2B8]/15 text-sm">
          <div className="py-3 flex items-center justify-between">
            <span className="text-xs font-bold text-[#254E68] dark:text-[#D3C2B8] flex items-center gap-2">
              <Mail className="w-4 h-4" />
              {t('emailLabel')}
            </span>
            <span className="font-mono-tech font-bold text-xs sm:text-sm text-[#1D3C50] dark:text-[#EFE7E1]">
              {currentUser.email}
            </span>
          </div>

          <div className="py-3 flex items-center justify-between">
            <span className="text-xs font-bold text-[#254E68] dark:text-[#D3C2B8] flex items-center gap-2">
              <Hash className="w-4 h-4" />
              {t('studentIdLabel')}
            </span>
            <span className="font-mono-tech font-bold text-[#1D3C50] dark:text-[#EFE7E1]">
              {currentUser.studentId || '2024CS1092'}
            </span>
          </div>

          <div className="py-3 flex items-center justify-between">
            <span className="text-xs font-bold text-[#254E68] dark:text-[#D3C2B8] flex items-center gap-2">
              <Building className="w-4 h-4" />
              {t('assignedRoomLabel')}
            </span>
            <span className="font-bold text-[#1D3C50] dark:text-[#EFE7E1]">
              {translateHostel(currentUser.hostel || 'Hostel 2', language)} ·{' '}
              {translateRoomLabel(currentUser.room || 'Room 204', language)}
            </span>
          </div>

          <div className="py-3 flex items-center justify-between">
            <span className="text-xs font-bold text-[#254E68] dark:text-[#D3C2B8] flex items-center gap-2">
              <Globe className="w-4 h-4" />
              {t('languagePrefLabel')}
            </span>
            <button
              onClick={onLanguageToggle}
              className="tactile-btn-beige text-xs font-bold px-3.5 py-1.5 rounded-lg"
            >
              {language === 'en' ? t('switchToHindi') : t('switchToEnglish')}
            </button>
          </div>
        </div>

        <button
          onClick={onSignOut}
          className="tactile-btn-primary w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-sm font-bold min-h-[46px]"
        >
          <LogOut className="w-4 h-4" />
          <span>{t('logout')}</span>
        </button>
      </div>
    </div>
  );
};
