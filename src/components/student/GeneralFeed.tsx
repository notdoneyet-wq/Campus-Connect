import React, { useState, useEffect, useMemo } from 'react';
import {
  ThumbsUp,
  ThumbsDown,
  Search,
  Filter,
  Flame,
  ArrowUpDown,
  MapPin,
  Clock,
  ChevronRight,
  Sparkles,
  Building2,
  X,
  MessageSquare,
  TrendingUp,
} from 'lucide-react';
import { Ticket, TicketEvent, UserProfile } from '../../types';
import { fetchGeneralTickets, fetchTicketEvents, voteTicket } from '../../services/db';
import {
  Language,
  translateCategory,
  translateHostel,
  translateRoomLabel,
  translateStatus,
  translateSubtype,
} from '../../data/i18n';

interface GeneralFeedProps {
  currentUser: UserProfile;
  language: Language;
}

type SortOption = 'highest_voted' | 'most_recent' | 'most_upvoted' | 'unresolved_first';

export const GeneralFeed: React.FC<GeneralFeedProps> = ({ currentUser, language }) => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('highest_voted');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [selectedTicketEvents, setSelectedTicketEvents] = useState<TicketEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [votingMap, setVotingMap] = useState<Record<string, boolean>>({});

  const loadGeneralTickets = async () => {
    setLoading(true);
    try {
      const all = await fetchGeneralTickets();
      setTickets(all);
    } catch {
      setTickets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGeneralTickets();
  }, [currentUser?.uid]);

  const handleVote = async (ticketId: string, dir: 'up' | 'down', e: React.MouseEvent) => {
    e.stopPropagation();
    if (votingMap[ticketId]) return;

    setVotingMap((prev) => ({ ...prev, [ticketId]: true }));

    // Optimistic UI update
    setTickets((prevTickets) =>
      prevTickets.map((tk) => {
        if (tk.id !== ticketId && tk.ticketId !== ticketId) return tk;

        const uid = currentUser.uid;
        const room = currentUser.room || 'Room 204';
        let upvotedUsers = Array.isArray(tk.upvotedUsers) ? [...tk.upvotedUsers] : [];
        let downvotedUsers = Array.isArray(tk.downvotedUsers) ? [...tk.downvotedUsers] : [];
        let upvotedRooms = Array.isArray(tk.upvotedRooms) ? [...tk.upvotedRooms] : [];

        const hasUpvoted = upvotedUsers.includes(uid);
        const hasDownvoted = downvotedUsers.includes(uid);

        if (dir === 'up') {
          if (hasUpvoted) {
            upvotedUsers = upvotedUsers.filter((u) => u !== uid);
          } else {
            downvotedUsers = downvotedUsers.filter((u) => u !== uid);
            upvotedUsers.push(uid);
            if (!upvotedRooms.includes(room)) upvotedRooms.push(room);
          }
        } else {
          if (hasDownvoted) {
            downvotedUsers = downvotedUsers.filter((u) => u !== uid);
          } else {
            upvotedUsers = upvotedUsers.filter((u) => u !== uid);
            downvotedUsers.push(uid);
          }
        }

        const upvotes = upvotedUsers.length;
        const downvotes = downvotedUsers.length;
        const netVotes = upvotes - downvotes;

        return {
          ...tk,
          upvotes,
          downvotes,
          netVotes,
          upvotedUsers,
          downvotedUsers,
          upvotedRooms,
        };
      })
    );

    try {
      const updated = await voteTicket(ticketId, dir);
      if (updated) {
        setTickets((prev) =>
          prev.map((tk) => (tk.id === updated.id || tk.ticketId === updated.ticketId ? updated : tk))
        );
        if (selectedTicket && (selectedTicket.id === updated.id || selectedTicket.ticketId === updated.ticketId)) {
          setSelectedTicket(updated);
        }
      }
    } catch (err) {
      console.warn('Voting error:', err);
    } finally {
      setVotingMap((prev) => ({ ...prev, [ticketId]: false }));
    }
  };

  const handleOpenTicketDetails = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setLoadingEvents(true);
    try {
      const evs = await fetchTicketEvents(ticket.id);
      setSelectedTicketEvents(evs);
    } catch {
      setSelectedTicketEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  };

  // Filter & Sort Logic
  const processedTickets = useMemo(() => {
    return tickets
      .filter((tk) => {
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchesTitle = tk.title?.toLowerCase().includes(q);
          const matchesIssue = tk.issue?.toLowerCase().includes(q);
          const matchesText = tk.rawText?.toLowerCase().includes(q);
          const matchesId = tk.ticketId?.toLowerCase().includes(q);
          const matchesRoom = tk.room?.toLowerCase().includes(q);
          const matchesHostel = tk.hostel?.toLowerCase().includes(q);
          if (!matchesTitle && !matchesIssue && !matchesText && !matchesId && !matchesRoom && !matchesHostel) {
            return false;
          }
        }

        if (departmentFilter !== 'all') {
          if (tk.departmentId !== departmentFilter && tk.category !== departmentFilter) {
            return false;
          }
        }

        if (statusFilter !== 'all') {
          if (statusFilter === 'open' && tk.status !== 'Open' && tk.status !== 'Assigned' && tk.status !== 'In Progress' && tk.status !== 'Reopened') {
            return false;
          }
          if (statusFilter === 'resolved' && tk.status !== 'Resolved' && tk.status !== 'Verified') {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        const aNet = a.netVotes ?? ((a.upvotes || 0) - (a.downvotes || 0));
        const bNet = b.netVotes ?? ((b.upvotes || 0) - (b.downvotes || 0));

        if (sortBy === 'highest_voted') {
          if (bNet !== aNet) return bNet - aNet;
          return b.createdAt - a.createdAt;
        }

        if (sortBy === 'most_upvoted') {
          const aUp = a.upvotes || 0;
          const bUp = b.upvotes || 0;
          if (bUp !== aUp) return bUp - aUp;
          return b.createdAt - a.createdAt;
        }

        if (sortBy === 'unresolved_first') {
          const aResolved = a.status === 'Verified' || a.status === 'Resolved';
          const bResolved = b.status === 'Verified' || b.status === 'Resolved';
          if (aResolved !== bResolved) return aResolved ? 1 : -1;
          return bNet - aNet;
        }

        return b.createdAt - a.createdAt;
      });
  }, [tickets, searchQuery, departmentFilter, statusFilter, sortBy]);

  const totalVotesCount = useMemo(() => {
    return tickets.reduce((acc, tk) => acc + (tk.upvotes || 0) + (tk.downvotes || 0), 0);
  }, [tickets]);

  const topVotedTicket = useMemo(() => {
    if (tickets.length === 0) return null;
    return [...tickets].sort((a, b) => {
      const aNet = a.netVotes ?? ((a.upvotes || 0) - (a.downvotes || 0));
      const bNet = b.netVotes ?? ((b.upvotes || 0) - (b.downvotes || 0));
      return bNet - aNet;
    })[0];
  }, [tickets]);

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-24">
      {/* Expressive Deep Navy Embossed Banner */}
      <div className="tactile-card-navy rounded-2xl p-6 sm:p-7 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#D3C2B8]/15 border border-[#D3C2B8]/25 text-xs font-bold text-[#EFE7E1] mb-2">
              <Sparkles className="w-3.5 h-3.5 text-[#D3C2B8]" />
              <span>Campus-wide Collective Priority Board</span>
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight emboss-text-light">
              {language === 'hi' ? 'सामूहिक छात्र शिकायतें' : 'General Student Queries & Issues'}
            </h2>
            <p className="text-xs sm:text-sm text-[#D3C2B8] max-w-xl mt-1 leading-relaxed font-medium">
              {language === 'hi'
                ? 'सभी छात्रों की साझा समस्याएं देखें। अपनी प्रभावित समस्याओं पर वोट दें ताकि प्रशासन प्राथमिकताओं को तुरंत हल कर सके।'
                : 'Browse issues reported by students across all hostels. Upvote or downvote to dynamically rank community priorities.'}
            </p>
          </div>

          <div className="relevo-well p-4 flex items-center gap-4 shrink-0">
            <div className="text-center px-2">
              <span className="text-2xl font-mono-tech font-extrabold tracking-tight emboss-text-light block">
                {tickets.length}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-[#D3C2B8] font-bold">
                {language === 'hi' ? 'कुल शिकायतें' : 'Total Queries'}
              </span>
            </div>
            <div className="h-8 w-px bg-[#D3C2B8]/25" />
            <div className="text-center px-2">
              <span className="text-2xl font-mono-tech font-extrabold tracking-tight emboss-text-light block">
                {totalVotesCount}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-[#D3C2B8] font-bold">
                {language === 'hi' ? 'कुल वोट' : 'Total Votes'}
              </span>
            </div>
          </div>
        </div>

        {topVotedTicket && (
          <div className="pt-3 border-t border-white/15 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 truncate">
              <Flame className="w-4 h-4 text-amber-300 shrink-0" />
              <span className="font-bold text-[#D3C2B8] shrink-0">
                {language === 'hi' ? 'शीर्ष प्राथमिकता:' : 'Top Priority:'}
              </span>
              <span className="truncate text-[#EFE7E1] font-bold">{topVotedTicket.title}</span>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-[#D3C2B8] text-[#1D3C50] font-mono-tech font-extrabold text-[11px] shrink-0">
              +{topVotedTicket.netVotes ?? ((topVotedTicket.upvotes || 0) - (topVotedTicket.downvotes || 0))} votes
            </span>
          </div>
        )}
      </div>

      {/* Control Bar: Search, Department Filters, Sorting */}
      <div className="tactile-card rounded-2xl p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Search Bar */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#466981] absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                language === 'hi'
                  ? 'शिकायत खोजें (उदा. लीक, कमरे संख्या, CC-0012)...'
                  : 'Search by issue title, room, hostel, CC-number...'
              }
              className="tactile-input w-full pl-10 pr-8 py-2.5 text-xs rounded-xl font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 p-0.5 text-[#466981] hover:text-[#1D3C50]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2 shrink-0">
            <ArrowUpDown className="w-3.5 h-3.5 text-[#254E68] dark:text-[#D3C2B8] shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="tactile-input py-2.5 px-3 rounded-xl text-xs font-bold"
            >
              <option value="highest_voted">
                {language === 'hi' ? 'उच्चतम वोट (रैंकिंग)' : '🔥 Highest Net Votes'}
              </option>
              <option value="most_upvoted">
                {language === 'hi' ? 'सर्वाधिक अपवोट' : '👍 Most Upvoted'}
              </option>
              <option value="unresolved_first">
                {language === 'hi' ? 'अनलझा हल पहले' : '⏳ Unresolved First'}
              </option>
              <option value="most_recent">
                {language === 'hi' ? 'नवीनतम पहले' : '🕒 Most Recent'}
              </option>
            </select>
          </div>
        </div>

        {/* Filter Badges Bar */}
        <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-[#1D3C50]/15 dark:border-[#D3C2B8]/15 text-xs">
          <span className="text-[#254E68] dark:text-[#D3C2B8] font-bold flex items-center gap-1 text-[11px]">
            <Filter className="w-3 h-3" />
            {language === 'hi' ? 'विभाग:' : 'Department:'}
          </span>

          {[
            { id: 'all', label: language === 'hi' ? 'सभी विभाग' : 'All Departments' },
            { id: 'plumbing', label: translateCategory('plumbing', language) },
            { id: 'electricity', label: translateCategory('electricity', language) },
            { id: 'cleanliness', label: translateCategory('cleanliness', language) },
            { id: 'internet', label: translateCategory('internet', language) },
          ].map((dept) => (
            <button
              key={dept.id}
              type="button"
              onClick={() => setDepartmentFilter(dept.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all min-h-[34px] ${
                departmentFilter === dept.id
                  ? 'tactile-btn-primary'
                  : 'tactile-btn-beige'
              }`}
            >
              {dept.label}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-2">
            <span className="text-[#254E68] dark:text-[#D3C2B8] font-bold text-[11px]">
              {language === 'hi' ? 'स्थिति:' : 'Status:'}
            </span>
            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'open' ? 'all' : 'open')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all min-h-[34px] ${
                statusFilter === 'open'
                  ? 'tactile-btn-steel'
                  : 'tactile-btn-beige'
              }`}
            >
              {language === 'hi' ? 'सक्रिय समस्याएँ' : 'Active Only'}
            </button>
          </div>
        </div>
      </div>

      {/* Ticket List Section */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-28 tactile-inset rounded-2xl animate-pulse"
            />
          ))}
        </div>
      ) : processedTickets.length === 0 ? (
        <div className="tactile-card rounded-2xl p-12 text-center space-y-3">
          <MessageSquare className="w-10 h-10 text-[#466981] mx-auto" />
          <h3 className="text-sm font-display font-bold text-[#1D3C50] dark:text-[#EFE7E1]">
            {language === 'hi' ? 'कोई शिकायत नहीं मिली' : 'No matching tickets found'}
          </h3>
          <p className="text-xs font-medium text-[#254E68] dark:text-[#D3C2B8] max-w-sm mx-auto">
            {language === 'hi'
              ? 'प्रयास करें कि अपनी खोज या फ़िल्टर बदलें।'
              : 'Try clearing your search query or department filters to see more community issues.'}
          </p>
          {(searchQuery || departmentFilter !== 'all' || statusFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setDepartmentFilter('all');
                setStatusFilter('all');
              }}
              className="tactile-btn-primary px-4 py-2 rounded-xl text-xs font-bold"
            >
              {language === 'hi' ? 'फ़िल्टर रीसेट करें' : 'Reset All Filters'}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3.5">
          {processedTickets.map((tk, index) => {
            const rank = index + 1;
            const netVotes = tk.netVotes ?? ((tk.upvotes || 0) - (tk.downvotes || 0));

            const hasUpvoted = Array.isArray(tk.upvotedUsers) && tk.upvotedUsers.includes(currentUser.uid);
            const hasDownvoted = Array.isArray(tk.downvotedUsers) && tk.downvotedUsers.includes(currentUser.uid);

            let rankBadgeStyle = 'bg-[#D3C2B8] text-[#1D3C50] border border-[#1D3C50]/20';
            if (sortBy === 'highest_voted' || sortBy === 'most_upvoted') {
              if (rank === 1) rankBadgeStyle = 'relevo-well font-extrabold';
              else if (rank === 2) rankBadgeStyle = 'bg-[#254E68] text-[#EFE7E1] font-bold';
              else if (rank === 3) rankBadgeStyle = 'bg-[#466981] text-[#EFE7E1] font-bold';
            }

            return (
              <div
                key={tk.id}
                onClick={() => handleOpenTicketDetails(tk)}
                className="group relative tactile-card hover:-translate-y-0.5 rounded-2xl p-4 sm:p-5 transition-all duration-200 cursor-pointer flex flex-col sm:flex-row items-start gap-4"
              >
                {/* Recessed Voting Column Control */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="flex sm:flex-col items-center justify-between sm:justify-center gap-1.5 p-2 rounded-xl tactile-inset shrink-0 w-full sm:w-16"
                >
                  {/* Upvote Button */}
                  <button
                    type="button"
                    title={hasUpvoted ? 'Remove upvote' : 'Upvote this query'}
                    disabled={Boolean(votingMap[tk.id])}
                    onClick={(e) => handleVote(tk.id, 'up', e)}
                    className={`flex items-center justify-center p-2 rounded-lg transition-all min-h-[38px] w-full ${
                      hasUpvoted
                        ? 'tactile-btn-primary'
                        : 'tactile-btn-beige'
                    }`}
                  >
                    <ThumbsUp className={`w-4 h-4 ${hasUpvoted ? 'fill-current' : ''}`} />
                  </button>

                  {/* Net Score Display */}
                  <div className="text-center px-1 py-0.5">
                    <span
                      className={`font-mono-tech text-sm font-extrabold block leading-none ${
                        netVotes > 0
                          ? 'text-[#1D3C50] dark:text-[#EFE7E1]'
                          : netVotes < 0
                          ? 'text-red-700 dark:text-red-300'
                          : 'text-[#466981]'
                      }`}
                    >
                      {netVotes > 0 ? `+${netVotes}` : netVotes}
                    </span>
                    <span className="text-[9px] text-[#254E68] dark:text-[#D3C2B8] uppercase font-bold block mt-0.5">
                      votes
                    </span>
                  </div>

                  {/* Downvote Button */}
                  <button
                    type="button"
                    title={hasDownvoted ? 'Remove downvote' : 'Downvote this query'}
                    disabled={Boolean(votingMap[tk.id])}
                    onClick={(e) => handleVote(tk.id, 'down', e)}
                    className={`flex items-center justify-center p-2 rounded-lg transition-all min-h-[38px] w-full ${
                      hasDownvoted
                        ? 'bg-red-800 text-white shadow-xs'
                        : 'tactile-btn-beige'
                    }`}
                  >
                    <ThumbsDown className={`w-4 h-4 ${hasDownvoted ? 'fill-current' : ''}`} />
                  </button>
                </div>

                {/* Main Ticket Card Content */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-mono-tech font-bold ${rankBadgeStyle}`}>
                        #{rank}
                      </span>
                      <span className="font-mono-tech text-xs font-extrabold text-[#254E68] dark:text-[#D3C2B8]">
                        {tk.ticketId}
                      </span>
                      <span className="text-[#466981]">•</span>
                      <span className="text-xs font-bold text-[#1D3C50] dark:text-[#EFE7E1]">
                        {translateCategory(tk.category, language)}
                      </span>
                      {tk.subtype && (
                        <span className="text-xs font-medium text-[#254E68] dark:text-[#D3C2B8]">({translateSubtype(tk.subtype, language)})</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Status Badge */}
                      <span
                        className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${
                          tk.status === 'Open'
                            ? 'bg-[#254E68] text-[#EFE7E1] border-[#1D3C50]'
                            : tk.status === 'In Progress' || tk.status === 'Assigned'
                            ? 'bg-[#466981] text-[#EFE7E1] border-[#254E68]'
                            : 'bg-emerald-700 text-white border-emerald-800'
                        }`}
                      >
                        {translateStatus(tk.status, language)}
                      </span>
                    </div>
                  </div>

                  {/* Title & Issue */}
                  <div>
                    <h3 className="font-display font-bold text-base text-[#1D3C50] dark:text-[#EFE7E1] leading-snug">
                      {tk.title}
                    </h3>
                    <p className="text-xs font-medium text-[#254E68] dark:text-[#D3C2B8]/90 line-clamp-2 mt-1 leading-relaxed">
                      {tk.issue || tk.rawText}
                    </p>
                  </div>

                  {/* Location & Upvoted Rooms Context */}
                  <div className="flex flex-wrap items-center gap-y-1.5 gap-x-3 text-[11px] font-semibold text-[#254E68] dark:text-[#D3C2B8] pt-1">
                    <span className="flex items-center gap-1 font-bold text-[#1D3C50] dark:text-[#EFE7E1]">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      {translateHostel(tk.hostel, language)} · {translateRoomLabel(tk.room, language)}
                    </span>

                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      {new Date(tk.createdAt).toLocaleString(language === 'hi' ? 'hi-IN' : 'en-IN', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>

                    {/* Upvoted Rooms Indicator */}
                    {Array.isArray(tk.upvotedRooms) && tk.upvotedRooms.length > 0 && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md tactile-surface-elevated text-[#1D3C50] dark:text-[#EFE7E1] text-[10px] font-bold">
                        <Building2 className="w-3 h-3 text-[#254E68] dark:text-[#D3C2B8]" />
                        <span>
                          Upvoted by {tk.upvotedRooms.length} room{tk.upvotedRooms.length > 1 ? 's' : ''} ({tk.upvotedRooms.slice(0, 3).join(', ')}{tk.upvotedRooms.length > 3 ? '...' : ''})
                        </span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="self-center hidden sm:block pl-2 text-[#1D3C50] dark:text-[#EFE7E1]">
                  <ChevronRight className="w-5 h-5" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Ticket Detail Modal */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#132836]/75 backdrop-blur-xs">
          <div className="tactile-card rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-[#1D3C50]/15 dark:border-[#D3C2B8]/15">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono-tech text-xs font-extrabold text-[#254E68] dark:text-[#D3C2B8] uppercase">
                    {selectedTicket.ticketId}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-[#254E68] text-[#EFE7E1]">
                    {translateStatus(selectedTicket.status, language)}
                  </span>
                </div>
                <h2 className="font-display text-lg sm:text-xl font-extrabold deboss-heading mt-1">
                  {selectedTicket.title}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                className="tactile-btn-beige p-2 rounded-xl"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Voting Bar inside Modal */}
            <div className="p-4 rounded-xl relevo-well flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#D3C2B8]" />
                <span className="text-xs font-bold text-[#D3C2B8]">
                  Community Vote Status:
                </span>
                <span className="text-xs font-mono-tech font-extrabold text-[#EFE7E1]">
                  +{selectedTicket.netVotes ?? ((selectedTicket.upvotes || 0) - (selectedTicket.downvotes || 0))} Net Votes
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={Boolean(votingMap[selectedTicket.id])}
                  onClick={(e) => handleVote(selectedTicket.id, 'up', e)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold ${
                    Array.isArray(selectedTicket.upvotedUsers) && selectedTicket.upvotedUsers.includes(currentUser.uid)
                      ? 'tactile-btn-primary'
                      : 'tactile-btn-beige'
                  }`}
                >
                  <ThumbsUp className="w-3.5 h-3.5" />
                  <span>Upvote ({selectedTicket.upvotes || 0})</span>
                </button>

                <button
                  type="button"
                  disabled={Boolean(votingMap[selectedTicket.id])}
                  onClick={(e) => handleVote(selectedTicket.id, 'down', e)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold ${
                    Array.isArray(selectedTicket.downvotedUsers) && selectedTicket.downvotedUsers.includes(currentUser.uid)
                      ? 'bg-red-800 text-white'
                      : 'tactile-btn-beige'
                  }`}
                >
                  <ThumbsDown className="w-3.5 h-3.5" />
                  <span>Downvote ({selectedTicket.downvotes || 0})</span>
                </button>
              </div>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl tactile-surface-elevated">
                <span className="text-[#254E68] dark:text-[#D3C2B8] font-bold block mb-0.5">Location</span>
                <span className="font-extrabold text-[#1D3C50] dark:text-[#EFE7E1]">
                  {translateHostel(selectedTicket.hostel, language)} · {translateRoomLabel(selectedTicket.room, language)}
                </span>
              </div>

              <div className="p-3.5 rounded-xl tactile-surface-elevated">
                <span className="text-[#254E68] dark:text-[#D3C2B8] font-bold block mb-0.5">Category</span>
                <span className="font-extrabold text-[#1D3C50] dark:text-[#EFE7E1]">
                  {translateCategory(selectedTicket.category, language)} ({translateSubtype(selectedTicket.subtype, language)})
                </span>
              </div>
            </div>

            {/* Complaint Text */}
            <div className="p-4 rounded-xl tactile-surface-elevated text-xs space-y-1">
              <span className="font-extrabold text-[#254E68] dark:text-[#D3C2B8] uppercase tracking-wider text-[10px] block">
                Full Complaint Text
              </span>
              <p className="text-[#1D3C50] dark:text-[#EFE7E1] font-medium leading-relaxed">
                {selectedTicket.rawText || selectedTicket.issue}
              </p>
              {selectedTicket.photoBase64 && (
                <div className="pt-2">
                  <img
                    src={selectedTicket.photoBase64}
                    alt="Complaint photo"
                    className="rounded-xl max-h-48 object-cover border border-[#1D3C50]/20"
                  />
                </div>
              )}
            </div>

            {/* Timeline Events */}
            <div className="space-y-3 pt-2">
              <h3 className="font-display font-bold text-sm text-[#1D3C50] dark:text-[#EFE7E1]">
                Resolution Timeline
              </h3>

              {loadingEvents ? (
                <div className="py-4 text-center text-xs font-bold text-[#254E68] dark:text-[#D3C2B8]">Loading timeline...</div>
              ) : selectedTicketEvents.length === 0 ? (
                <div className="p-3.5 rounded-xl tactile-inset text-xs font-semibold text-[#1D3C50] dark:text-[#EFE7E1] text-center">
                  Ticket logged. Pending department assignment and progress update.
                </div>
              ) : (
                <div className="relative pl-5 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#466981]/40">
                  {selectedTicketEvents.map((ev) => (
                    <div key={ev.id} className="relative">
                      <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-[#1D3C50] dark:bg-[#D3C2B8]" />
                      <div className="text-xs space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#1D3C50] dark:text-[#EFE7E1] capitalize">
                            {ev.type.replace(/_/g, ' ')}
                          </span>
                          <span className="text-[10px] font-mono-tech text-[#254E68] dark:text-[#D3C2B8]">
                            {new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        {ev.note && <p className="text-[#254E68] dark:text-[#D3C2B8] font-medium">{ev.note}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                className="tactile-btn-primary px-5 py-2.5 rounded-xl text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
