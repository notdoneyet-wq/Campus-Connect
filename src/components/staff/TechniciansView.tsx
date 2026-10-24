import React, { useState, useEffect } from 'react';
import { Wrench, Activity } from 'lucide-react';
import { Technician, UserProfile } from '../../types';
import { fetchTechnicians } from '../../services/db';
import { filterAuthorizedTechnicians } from '../../utils/authorization';
import { translateCategory, translateSubtype, useT } from '../../data/i18n';

interface TechniciansViewProps {
  currentUser: UserProfile;
}

export const TechniciansView: React.FC<TechniciansViewProps> = ({ currentUser }) => {
  const { t, language } = useT();
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [, setLoading] = useState(true);

  if (!currentUser) return null;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const list = await fetchTechnicians(currentUser);
      setTechnicians(filterAuthorizedTechnicians(currentUser, list));
      setLoading(false);
    };
    load();
  }, [currentUser?.uid, currentUser?.department]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display text-xl font-extrabold deboss-heading flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg relevo-well flex items-center justify-center">
              <Wrench className="w-4 h-4 text-[#D3C2B8]" />
            </div>
            <span>{t('campusTechniciansTitle')}</span>
          </h2>
          <p className="text-xs font-medium text-[#254E68] dark:text-[#D3C2B8] mt-0.5">
            {t('campusTechniciansDesc')}
          </p>
        </div>
        <span className="text-xs font-bold px-3 py-1 rounded-lg relevo-well">
          {currentUser.role === 'staff' && currentUser.department
            ? translateCategory(currentUser.department, language)
            : t('allDepts')}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {technicians.map((tech) => (
          <div
            key={tech.id}
            className="tactile-card rounded-2xl p-5 space-y-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl relevo-well font-display font-extrabold text-lg emboss-text-light flex items-center justify-center">
                  {tech.name[0]}
                </div>
                <div>
                  <h4 className="font-display font-extrabold text-base text-[#1D3C50] dark:text-[#EFE7E1]">
                    {tech.name}
                  </h4>
                  <span className="text-xs font-bold text-[#254E68] dark:text-[#D3C2B8]">
                    {translateCategory(tech.department, language)}
                  </span>
                </div>
              </div>

              <span
                className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                  tech.available
                    ? 'bg-[#254E68] text-[#EFE7E1]'
                    : 'tactile-inset text-[#466981]'
                }`}
              >
                {tech.available ? t('availableBadge') : t('offDutyBadge')}
              </span>
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#254E68] dark:text-[#D3C2B8] block">
                {t('certifiedSubteamsSkills')}:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {tech.skills.map((skill) => (
                  <span
                    key={skill}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold tactile-surface-elevated"
                  >
                    {translateSubtype(skill, language)}
                  </span>
                ))}
              </div>
            </div>

            <div className="pt-2.5 flex items-center justify-between text-xs font-semibold text-[#254E68] dark:text-[#D3C2B8] border-t border-[#1D3C50]/15 dark:border-[#D3C2B8]/15">
              <span className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-[#1D3C50] dark:text-[#EFE7E1]" />
                <span>{t('activeWorkloadLabel')}:</span>
                <strong className="font-mono-tech text-[#1D3C50] dark:text-[#EFE7E1]">
                  {tech.workload} {tech.workload === 1 ? t('ticketCountSingular') : t('ticketCountPlural')}
                </strong>
              </span>

              <span className="text-[11px] font-mono-tech font-bold">ID: {tech.id}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
