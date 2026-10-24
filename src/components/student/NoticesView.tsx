import React, { useState, useEffect } from 'react';
import { Bell, ThumbsUp, CheckCircle } from 'lucide-react';
import { Notice, UserProfile } from '../../types';
import { fetchNotices, incrementNoticeMeToo } from '../../services/db';
import { Language, translateHostel, useT } from '../../data/i18n';

interface NoticesViewProps {
  currentUser: UserProfile;
  language: Language;
}

export const NoticesView: React.FC<NoticesViewProps> = ({ currentUser, language }) => {
  const { t } = useT();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [linkedNoticeIds, setLinkedNoticeIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const all = await fetchNotices();
      const filtered = all.filter((n) => n.active);
      setNotices(filtered);
      setLoading(false);
    };
    load();
  }, []);

  const handleMeToo = async (noticeId: string) => {
    if (linkedNoticeIds.has(noticeId)) return;
    const newCount = await incrementNoticeMeToo(noticeId);
    setLinkedNoticeIds((prev) => new Set(prev).add(noticeId));
    setNotices((prev) =>
      prev.map((n) => (n.id === noticeId ? { ...n, meTooCount: newCount } : n))
    );
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-4 pb-24">
      <div className="flex items-center justify-between pb-2">
        <h2 className="font-display text-xl font-extrabold deboss-heading flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg relevo-well flex items-center justify-center">
            <Bell className="w-4 h-4 text-[#D3C2B8]" />
          </div>
          <span>{t('activeIncidents')}</span>
        </h2>
        <span className="text-xs font-bold text-[#254E68] dark:text-[#D3C2B8]">
          {t('broadcastsFor', {
            hostel: translateHostel(currentUser.hostel || 'Hostel 1', language),
          })}
        </span>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-28 tactile-inset rounded-2xl animate-pulse"
            />
          ))}
        </div>
      ) : notices.length === 0 ? (
        <div className="tactile-card rounded-2xl p-10 text-center space-y-2">
          <p className="text-sm font-bold text-[#254E68] dark:text-[#D3C2B8]">{t('noActiveOutageBroadcasts')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {notices.map((n) => {
            const isLinked = linkedNoticeIds.has(n.id);
            const msg = language === 'hi' ? n.messageHi : n.messageEn;

            return (
              <div
                key={n.id}
                className="tactile-card rounded-2xl p-6 space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="px-3 py-1 rounded-lg text-[11px] font-bold relevo-well">
                      {t('activeBroadcastBadge')}
                    </span>
                    <span className="text-xs font-bold text-[#254E68] dark:text-[#D3C2B8]">
                      {translateHostel(n.hostel, language)} · {t('floorLabel', { floor: n.floor })}
                    </span>
                  </div>

                  {n.incidentId && (
                    <span className="font-mono-tech text-xs font-extrabold text-[#466981] dark:text-[#7A9BB2]">
                      #{n.incidentId}
                    </span>
                  )}
                </div>

                <div className="p-4 rounded-xl tactile-surface-elevated">
                  <p className="text-sm font-semibold text-[#1D3C50] dark:text-[#EFE7E1] leading-relaxed">
                    {msg}
                  </p>
                </div>

                <div className="pt-1 flex items-center justify-between">
                  <span className="text-xs font-bold text-[#254E68] dark:text-[#D3C2B8]">
                    {t('studentsAffectedCount', { count: n.meTooCount || 0 })}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleMeToo(n.id)}
                    disabled={isLinked}
                    className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold min-h-[42px] ${
                      isLinked
                        ? 'tactile-btn-beige opacity-90'
                        : 'tactile-btn-primary'
                    }`}
                  >
                    {isLinked ? (
                      <>
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-700" />
                        <span>{t('meTooLinked')}</span>
                      </>
                    ) : (
                      <>
                        <ThumbsUp className="w-3.5 h-3.5" />
                        <span>{t('meTooButton')}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
