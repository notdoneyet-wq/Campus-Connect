import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  Users,
  AlertCircle,
} from 'lucide-react';
import { DEMO_ACCOUNTS, loginAsDemo, setupDemoAccounts } from '../../services/auth';
import { seedDemoDataset } from '../../services/db';
import { UserProfile } from '../../types';
import { translateRole, useT } from '../../data/i18n';

interface DemoSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: UserProfile) => void;
}

export const DemoSetupModal: React.FC<DemoSetupModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const { t, language } = useT();
  const [loading, setLoading] = useState(false);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRunSetup = async () => {
    setLoading(true);
    setErrorMessage(null);
    setSetupMessage(t('provisioningDemoAccounts'));
    try {
      await setupDemoAccounts();
      await seedDemoDataset();
      setSetupMessage(t('demoSetupSuccess'));
    } catch {
      setSetupMessage(t('demoSetupFallback'));
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (email: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const user = await loginAsDemo(email);
      onLoginSuccess(user);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || t('authFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#132836]/75 backdrop-blur-xs">
      <div className="tactile-card rounded-2xl p-6 sm:p-7 max-w-xl w-full space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-[#1D3C50]/15 dark:border-[#D3C2B8]/15">
          <div className="flex items-center gap-3">
            <div className="p-2.5 relevo-well rounded-xl text-[#D3C2B8]">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-extrabold text-lg deboss-heading">
                {t('demoSetupTitle')}
              </h3>
              <p className="text-xs font-medium text-[#254E68] dark:text-[#D3C2B8]/80">
                {t('demoSetupSubtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('close')}
            className="tactile-btn-beige p-2 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Setup Banner */}
        <div className="p-4 rounded-xl relevo-well flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="space-y-1">
            <span className="font-display font-bold text-sm text-[#EFE7E1] block">
              {t('oneClickDemoInit')}
            </span>
            <p className="text-[#D3C2B8]/90">
              {t('oneClickDemoDesc')}
            </p>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={handleRunSetup}
            className="tactile-btn-beige px-4 py-2.5 rounded-xl font-extrabold disabled:opacity-50 whitespace-nowrap min-h-[42px]"
          >
            {loading ? t('initializing') : t('runSetupAll')}
          </button>
        </div>

        {setupMessage && (
          <div className="p-3.5 rounded-xl tactile-surface-elevated border-l-4 border-l-emerald-600 text-[#1D3C50] dark:text-[#EFE7E1] text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
            <span>{setupMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-red-900/15 border border-red-700/40 text-red-900 dark:text-red-200 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-700 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* 1-Click Fast Login List */}
        <div className="space-y-2.5">
          <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#254E68] dark:text-[#D3C2B8] block">
            {t('clickAccountInstantLogin')}
          </span>

          <div className="space-y-2">
            {DEMO_ACCOUNTS.map((acc) => (
              <div
                key={acc.email}
                className="flex items-center justify-between p-3 rounded-xl tactile-surface-elevated text-xs"
              >
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-[#1D3C50] dark:text-[#EFE7E1]">
                      {acc.name}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                        acc.role === 'admin'
                          ? 'bg-[#1D3C50] text-[#D3C2B8]'
                          : acc.role === 'supervisor'
                          ? 'bg-[#254E68] text-[#EFE7E1]'
                          : acc.role === 'staff'
                          ? 'bg-[#466981] text-[#EFE7E1]'
                          : 'bg-[#D3C2B8] text-[#1D3C50] border border-[#1D3C50]/20'
                      }`}
                    >
                      {translateRole(acc.role, (acc as any).department, language)}
                    </span>
                  </div>
                  <span className="text-[#254E68] dark:text-[#D3C2B8]/80 font-mono-tech text-[11px]">{acc.email}</span>
                </div>

                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleQuickLogin(acc.email)}
                  className="tactile-btn-primary px-3.5 py-2 rounded-lg font-bold text-xs min-h-[38px]"
                >
                  {t('logInArrow')}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
