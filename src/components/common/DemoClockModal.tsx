import React from 'react';
import { Clock, RotateCcw, AlertTriangle, X } from 'lucide-react';
import { advanceDemoClock, getDemoClockOffsetHours, resetDemoClock } from '../../services/db';
import { useT } from '../../data/i18n';

interface DemoClockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClockChanged: () => void;
}

export const DemoClockModal: React.FC<DemoClockModalProps> = ({
  isOpen,
  onClose,
  onClockChanged,
}) => {
  const { t, language } = useT();
  if (!isOpen) return null;

  const currentOffset = getDemoClockOffsetHours();

  const handleAdvance = (hours: number) => {
    advanceDemoClock(hours);
    onClockChanged();
  };

  const handleReset = () => {
    resetDemoClock();
    onClockChanged();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#132836]/70 backdrop-blur-xs">
      <div className="relative w-full max-w-md tactile-card rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-[#1D3C50]/15 dark:border-[#D3C2B8]/15">
          <div className="flex items-center gap-3">
            <div className="p-2.5 relevo-well rounded-xl text-[#D3C2B8]">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg deboss-heading">
                {t('demoClockTitle')}
              </h3>
              <p className="text-xs text-[#254E68] dark:text-[#D3C2B8]/80 font-medium">{t('demoClockSubtitle')}</p>
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

        {/* Warning banner visibly marking simulation */}
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl tactile-inset text-[#1D3C50] dark:text-[#EFE7E1] text-xs font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-400" />
          <p>{t('demoClockWarning')}</p>
        </div>

        <div className="relevo-well p-5 rounded-xl text-center space-y-1">
          <div className="text-[11px] uppercase tracking-widest text-[#D3C2B8]/80 font-bold">
            {t('currentSimulatedOffset')}
          </div>
          <div className="text-3xl font-extrabold emboss-text-light font-mono-tech">
            {currentOffset > 0
              ? `+${currentOffset} ${language === 'hi' ? 'घंटे' : 'hours'}`
              : t('realtimeZero')}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => handleAdvance(1)}
            className="tactile-btn-beige py-3 px-3 rounded-xl font-bold text-sm min-h-[44px]"
          >
            {t('plus1Hour')}
          </button>
          <button
            onClick={() => handleAdvance(6)}
            className="tactile-btn-steel py-3 px-3 rounded-xl font-bold text-sm min-h-[44px]"
          >
            {t('plus6Hours')}
          </button>
          <button
            onClick={() => handleAdvance(24)}
            className="tactile-btn-beige py-3 px-3 rounded-xl font-bold text-sm min-h-[44px]"
          >
            {t('plus24Hours')}
          </button>
        </div>

        <div className="pt-3 flex items-center justify-between border-t border-[#1D3C50]/15 dark:border-[#D3C2B8]/15">
          <button
            onClick={handleReset}
            className="tactile-btn-beige flex items-center gap-1.5 text-xs font-bold py-2.5 px-3.5 rounded-xl min-h-[40px]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {t('resetToRealtime')}
          </button>
          <button
            onClick={onClose}
            className="tactile-btn-primary px-6 py-2.5 rounded-xl text-sm font-bold min-h-[40px]"
          >
            {t('done')}
          </button>
        </div>
      </div>
    </div>
  );
};
