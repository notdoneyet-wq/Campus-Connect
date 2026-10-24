import React, { useState, useEffect, useMemo } from 'react';
import {
  GraduationCap,
  Shield,
  ArrowRight,
  Mail,
  Lock,
  User,
  Hash,
  Eye,
  EyeOff,
  CheckCircle2,
  MapPin,
  Sparkles,
  Layers,
  Building2,
  Globe,
  KeyRound,
} from 'lucide-react';
import {
  loginWithEmail,
  loginWithSso,
  registerStudent,
  registerCampusAdmin,
  verifyStudentEmail,
} from '../../services/auth';
import { fetchPublicCampuses } from '../../services/db';
import { CampusOrganization, UserProfile } from '../../types';
import { DemoSetupModal } from './DemoSetupModal';
import { translateHostel, useT } from '../../data/i18n';
import { BrandLogo } from '../common/BrandLogo';

interface LoginScreenProps {
  onLoginSuccess: (user: UserProfile, initialCampus?: CampusOrganization) => void;
  language: 'en' | 'hi';
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const { t, language } = useT();
  const [tab, setTab] = useState<'student' | 'staff' | 'new-campus'>('student');
  const [isSignUp, setIsSignUp] = useState(false);

  // Published campuses for student/staff joining
  const [publicCampuses, setPublicCampuses] = useState<CampusOrganization[]>([]);
  const [selectedCampusId, setSelectedCampusId] = useState<string>('campus_demo_default');
  const [campusInviteCode, setCampusInviteCode] = useState<string>('');

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [preferredLang, setPreferredLang] = useState<'en' | 'hi'>(language);
  const [hostel, setHostel] = useState('Hostel 2');
  const [room, setRoom] = useState('Room 204');

  // New Campus Admin Setup states
  const [instituteName, setInstituteName] = useState('');
  const [newCampusCode, setNewCampusCode] = useState('');
  const [newCampusDomains, setNewCampusDomains] = useState('');
  const [newCampusCity, setNewCampusCity] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingVerificationUser, setPendingVerificationUser] = useState<UserProfile | null>(null);
  const [showDemoSetup, setShowDemoSetup] = useState(false);

  // SSO Popup Modals
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [showMicrosoftModal, setShowMicrosoftModal] = useState(false);
  const [ssoVerifyingEmail, setSsoVerifyingEmail] = useState<string | null>(null);
  const [customSsoEmail, setCustomSsoEmail] = useState('');
  const [customSsoCreateCampus, setCustomSsoCreateCampus] = useState(false);
  const [customSsoInstituteName, setCustomSsoInstituteName] = useState('');
  const [showCustomSsoInput, setShowCustomSsoInput] = useState(false);

  useEffect(() => {
    fetchPublicCampuses()
      .then((list) => {
        if (list.length > 0) {
          setPublicCampuses(list);
          if (!list.some((c) => c.id === selectedCampusId)) {
            setSelectedCampusId(list[0].id);
          }
        }
      })
      .catch(() => {});
  }, []);

  // Automatically match campus by invite code or email domain when student types email/code
  const resolvedStudentCampus = useMemo(() => {
    if (campusInviteCode.trim()) {
      const codeUpper = campusInviteCode.trim().toUpperCase();
      const byCode = publicCampuses.find((c) => c.code.toUpperCase() === codeUpper || c.id === campusInviteCode.trim());
      if (byCode) return byCode;
    }
    const emailDomain = email.trim().toLowerCase().split('@')[1];
    if (emailDomain) {
      const byDomain = publicCampuses.find((c) =>
        (c.domains || c.allowedDomains || []).some((d: string) => d.toLowerCase() === emailDomain)
      );
      if (byDomain) return byDomain;
    }
    return publicCampuses.find((c) => c.id === selectedCampusId) || publicCampuses[0] || null;
  }, [campusInviteCode, email, publicCampuses, selectedCampusId]);

  // Keep building dropdown synced with resolved campus buildings
  useEffect(() => {
    if (resolvedStudentCampus && resolvedStudentCampus.buildings?.length > 0) {
      const exists = resolvedStudentCampus.buildings.some((b) => b.name === hostel);
      if (!exists) {
        setHostel(resolvedStudentCampus.buildings[0].name);
      }
    }
  }, [resolvedStudentCampus]);

  const handleExecuteSsoLogin = async (
    ssoEmail: string,
    provider: 'google' | 'microsoft' = 'google',
    createNewCampus = false,
    ssoCampusName?: string
  ) => {
    setSsoVerifyingEmail(ssoEmail);
    setError(null);
    try {
      await new Promise((r) => setTimeout(r, 500));
      const user = await loginWithSso({
        email: ssoEmail,
        provider,
        campusId: !createNewCampus ? resolvedStudentCampus?.id : undefined,
        campusCode: !createNewCampus && campusInviteCode.trim() ? campusInviteCode.trim() : undefined,
        createNewCampus,
        campusName: ssoCampusName,
      });
      setShowGoogleModal(false);
      setShowMicrosoftModal(false);
      onLoginSuccess(user);
    } catch (err: any) {
      setError(err.message || 'SSO Authentication failed.');
    } finally {
      setSsoVerifyingEmail(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (tab === 'new-campus') {
        if (!name.trim() || !email.trim() || !password || !instituteName.trim()) {
          throw new Error('Please fill in your name, admin email, password, and institute name.');
        }
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters long.');
        }
        const domains = newCampusDomains
          .split(',')
          .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
          .filter(Boolean);

        const result = await registerCampusAdmin({
          name: name.trim(),
          email: email.trim(),
          password,
          campusName: instituteName.trim(),
          campusCode: newCampusCode.trim() || undefined,
          allowedDomains: domains.length > 0 ? domains : undefined,
          city: newCampusCity.trim() || undefined,
          language: preferredLang,
        });
        onLoginSuccess(result.user, result.campus);
        return;
      }

      if (tab === 'student' && isSignUp) {
        if (!name.trim() || !email.trim() || !studentId.trim() || !password) {
          throw new Error(t('fillRequiredSignUp'));
        }
        if (password.length < 6) {
          throw new Error(
            language === 'hi'
              ? 'पासवर्ड कम से कम 6 अक्षरों का होना चाहिए।'
              : 'Password must be at least 6 characters long.'
          );
        }
        const user = await registerStudent({
          name: name.trim(),
          email: email.trim(),
          studentId: studentId.trim(),
          password,
          language: preferredLang,
          hostel,
          room,
          campusId: resolvedStudentCampus?.id || selectedCampusId,
          campusCode: campusInviteCode.trim() || undefined,
        });
        setPendingVerificationUser(user);
      } else {
        if (!email.trim() || !password) {
          throw new Error(t('enterEmailPassword'));
        }
        const user = await loginWithEmail(email.trim(), password);
        onLoginSuccess(user);
      }
    } catch (err: any) {
      setError(err.message || t('authFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteEmailVerification = async () => {
    if (!pendingVerificationUser) return;
    setLoading(true);
    try {
      const verifiedUser = await verifyStudentEmail(pendingVerificationUser.email);
      setPendingVerificationUser(null);
      onLoginSuccess(verifiedUser);
    } catch {
      onLoginSuccess({ ...pendingVerificationUser, emailVerified: true });
    } finally {
      setLoading(false);
    }
  };

  const availableBuildings =
    resolvedStudentCampus?.buildings && resolvedStudentCampus.buildings.length > 0
      ? resolvedStudentCampus.buildings.map((b) => b.name)
      : ['Hostel 1', 'Hostel 2'];

  return (
    <div className="min-h-[calc(100vh-68px)] flex items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        {/* Left Coastal Glass Showcase */}
        <div className="lg:col-span-7 space-y-6">
          <div className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl tactile-card text-xs font-semibold tracking-wide text-[#0E7490] dark:text-cyan-300">
            <BrandLogo size="sm" />
            <span>{t('appTitle')} · Multi-Institute Operations & AI Map Studio</span>
          </div>

          {/* Smooth Coastal Headline Block */}
          <div className="space-y-2">
            <h1 className="font-display font-bold text-4xl sm:text-5xl xl:text-6xl tracking-tight leading-[1.08] text-[#0F293A] dark:text-[#F0F9FF] text-balance">
              {language === 'hi'
                ? 'शिकायत दर्ज करें, प्रमाणित समाधान ट्रैक करें।'
                : 'Report campus issues. Track verified fixes.'}
            </h1>
          </div>

          <p className="text-sm sm:text-base font-normal text-[#1E3A4C] dark:text-[#CBE4F2] max-w-xl leading-relaxed">
            {t('thesisQuote')} —{' '}
            {language === 'hi'
              ? 'इंटरेक्टिव हॉस्टल फ़्लोर मैप, AI मैप बिल्डर और स्टाफ़-नियंत्रित रूटिंग के साथ हर शिकायत को ट्रैक करें।'
              : 'Engineered with AI-assisted schematic floor maps, Gemini duplicate detection, and isolated institute portals.'}
          </p>

          {/* Frosted Glass Feature Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="tactile-card rounded-2xl p-4 space-y-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#0E7490]/10 dark:bg-cyan-500/15 border border-[#0E7490]/20 flex items-center justify-center text-[#0E7490] dark:text-cyan-300">
                <MapPin className="w-4 h-4" />
              </div>
              <div className="font-display font-bold text-sm text-[#0F293A] dark:text-[#F0F9FF]">
                {language === 'hi' ? 'AI फ़्लोर मैप स्टूडियो' : 'AI Floor Map Builder'}
              </div>
              <p className="text-xs text-[#476778] dark:text-[#94B8CC] leading-relaxed">
                {language === 'hi'
                  ? 'हॉस्टल और भवनों के नक्शे जनरेट करें और सटीक कमरे पिन करें।'
                  : 'Generate editable schematic maps per building & floor, or pin exact rooms.'}
              </p>
            </div>

            <div className="tactile-card rounded-2xl p-4 space-y-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#0D9488]/10 dark:bg-teal-500/15 border border-[#0D9488]/20 flex items-center justify-center text-[#0D9488] dark:text-teal-300">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="font-display font-bold text-sm text-[#0F293A] dark:text-[#F0F9FF]">
                {language === 'hi' ? 'AI डुप्लिकेट समीक्षा' : 'AI Duplicate Review'}
              </div>
              <p className="text-xs text-[#476778] dark:text-[#94B8CC] leading-relaxed">
                {language === 'hi'
                  ? 'समान शिकायतों की पहचान और स्टाफ़-नियंत्रित विलय।'
                  : 'Gemini suggests matching issues; staff verify and merge with full audit logs.'}
              </p>
            </div>

            <div className="tactile-card rounded-2xl p-4 space-y-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#0284C7]/10 dark:bg-sky-500/15 border border-[#0284C7]/20 flex items-center justify-center text-[#0284C7] dark:text-sky-300">
                <Layers className="w-4 h-4" />
              </div>
              <div className="font-display font-bold text-sm text-[#0F293A] dark:text-[#F0F9FF]">
                {language === 'hi' ? 'पृथक कैंपस पोर्टल' : 'Isolated Institute Portals'}
              </div>
              <p className="text-xs text-[#476778] dark:text-[#94B8CC] leading-relaxed">
                {language === 'hi'
                  ? 'प्रत्येक संस्थान के लिए सुरक्षित शिकायतें, नक्शे और एडमिन नियंत्रण।'
                  : 'Dedicated campus codes, domain matching, and strict tenant isolation.'}
              </p>
            </div>
          </div>

          {/* Minimalist Demo Sandbox Bar */}
          <div className="pt-1 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setShowDemoSetup(true)}
              className="tactile-btn-beige px-5 py-3 rounded-xl text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <span>{t('demoSetupLink')}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-medium text-[#1E3A4C] dark:text-[#CBE4F2]">
              {language === 'hi'
                ? '1-क्लिक में छात्र, स्टाफ़, पर्यवेक्षक या एडमिन के रूप में परीक्षण करें'
                : 'Instant 1-click sandbox access for Student, Staff, Supervisor & Admin roles'}
            </span>
          </div>
        </div>

        {/* Right Frosted Glass Login & Registration Console */}
        <div className="lg:col-span-5">
          <div className="tactile-card rounded-2xl p-6 sm:p-8 space-y-5 relative">
            {/* Header Bar */}
            <div className="flex items-center justify-between pb-3 border-b border-[#0E7490]/14 dark:border-sky-400/15">
              <div>
                <h2 className="font-display font-bold text-xl text-[#0F293A] dark:text-[#F0F9FF]">
                  {tab === 'new-campus'
                    ? 'New Campus Admin Setup'
                    : tab === 'student'
                    ? isSignUp
                      ? t('completeStudentSignUp')
                      : t('imAStudent')
                    : t('imStaff')}
                </h2>
                <p className="text-xs font-medium text-[#476778] dark:text-[#94B8CC]">
                  {tab === 'new-campus'
                    ? 'Launch the AI-assisted floor map builder for your institute'
                    : tab === 'student'
                    ? language === 'hi'
                      ? 'छात्र शिकायत और ट्रैकिंग पोर्टल'
                      : 'Student issue reporting & live SLA tracker'
                    : language === 'hi'
                    ? 'विभाग और पर्यवेक्षक संचालन कंसोल'
                    : 'Department dispatch & campus admin console'}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl relevo-well flex items-center justify-center shrink-0">
                {tab === 'new-campus' ? (
                  <Building2 className="w-5 h-5 text-white" />
                ) : tab === 'student' ? (
                  <GraduationCap className="w-5 h-5 text-white" />
                ) : (
                  <Shield className="w-5 h-5 text-white" />
                )}
              </div>
            </div>

            {pendingVerificationUser ? (
              <div className="space-y-4 text-center py-4">
                <div className="w-14 h-14 rounded-2xl relevo-well text-white flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-display font-bold text-[#0F293A] dark:text-[#F0F9FF]">
                    {t('emailVerifiedSuccess')}
                  </h3>
                  <p className="text-xs font-mono-tech font-semibold text-[#0E7490] dark:text-cyan-300">
                    {pendingVerificationUser.email}
                  </p>
                  {pendingVerificationUser.campusName && (
                    <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                      Joined Portal: {pendingVerificationUser.campusName}
                    </p>
                  )}
                  <p className="text-xs text-[#476778] dark:text-[#94B8CC] pt-1">
                    {t('emailVerificationPending')}
                  </p>
                </div>
                <div className="space-y-2.5 pt-2">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleCompleteEmailVerification}
                    className="tactile-btn-primary w-full py-3 px-4 rounded-xl text-xs font-semibold min-h-[44px]"
                  >
                    {t('verifyEmailNow')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onLoginSuccess(pendingVerificationUser)}
                    className="tactile-btn-beige w-full py-2.5 px-4 rounded-xl text-xs font-semibold min-h-[40px]"
                  >
                    {t('continueBtn')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Smooth Frosted 3-Way Role Selector Tabs */}
                <div className="grid grid-cols-3 p-1 rounded-xl tactile-inset gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setTab('student');
                      setError(null);
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg text-xs font-semibold transition-all min-h-[40px] ${
                      tab === 'student'
                        ? 'tactile-btn-primary'
                        : 'text-[#0F293A] dark:text-[#94B8CC] hover:bg-white/60 dark:hover:bg-white/5'
                    }`}
                  >
                    <GraduationCap className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{t('imAStudent')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTab('staff');
                      setIsSignUp(false);
                      setError(null);
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg text-xs font-semibold transition-all min-h-[40px] ${
                      tab === 'staff'
                        ? 'tactile-btn-primary'
                        : 'text-[#0F293A] dark:text-[#94B8CC] hover:bg-white/60 dark:hover:bg-white/5'
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{t('imStaff')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTab('new-campus');
                      setIsSignUp(false);
                      setError(null);
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg text-xs font-semibold transition-all min-h-[40px] ${
                      tab === 'new-campus'
                        ? 'tactile-btn-primary'
                        : 'text-[#0F293A] dark:text-[#94B8CC] hover:bg-white/60 dark:hover:bg-white/5'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">New Campus</span>
                  </button>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="p-3.5 rounded-xl bg-red-500/10 dark:bg-red-950/60 border border-red-500/30 text-red-700 dark:text-red-200 text-xs font-semibold"
                  >
                    {error}
                  </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
                  {/* New Campus Admin Setup Form */}
                  {tab === 'new-campus' && (
                    <>
                      <div className="p-3 rounded-xl bg-[#0E7490]/10 dark:bg-cyan-500/10 border border-[#0E7490]/20 text-[11px] text-[#0F293A] dark:text-[#CBE4F2] leading-relaxed">
                        <span className="font-bold text-[#0E7490] dark:text-cyan-300">First-time Campus Admin:</span>{' '}
                        Register your institute to launch the guided setup wizard & AI schematic floor map builder. Returning admins with an unfinished setup can also sign in here to resume their draft.
                      </div>

                      <div>
                        <label className="block text-[#0F293A] dark:text-[#F0F9FF] font-semibold mb-1">
                          Institute / University Name *
                        </label>
                        <div className="relative">
                          <Building2 className="w-4 h-4 text-[#0E7490] absolute left-3.5 top-3" />
                          <input
                            type="text"
                            value={instituteName}
                            onChange={(e) => setInstituteName(e.target.value)}
                            placeholder="e.g., Indian Institute of Technology Goa"
                            required
                            className="tactile-input w-full pl-10 pr-3 py-2.5 rounded-xl font-medium"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[#0F293A] dark:text-[#F0F9FF] font-semibold mb-1">
                            Campus Code (Optional)
                          </label>
                          <div className="relative">
                            <KeyRound className="w-3.5 h-3.5 text-[#0E7490] absolute left-3 top-3" />
                            <input
                              type="text"
                              value={newCampusCode}
                              onChange={(e) => setNewCampusCode(e.target.value.toUpperCase())}
                              placeholder="IITGOA26"
                              className="tactile-input w-full pl-9 pr-2.5 py-2.5 rounded-xl font-mono-tech font-semibold uppercase"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[#0F293A] dark:text-[#F0F9FF] font-semibold mb-1">
                            Email Domain (Optional)
                          </label>
                          <div className="relative">
                            <Globe className="w-3.5 h-3.5 text-[#0E7490] absolute left-3 top-3" />
                            <input
                              type="text"
                              value={newCampusDomains}
                              onChange={(e) => setNewCampusDomains(e.target.value)}
                              placeholder="iitgoa.ac.in"
                              className="tactile-input w-full pl-9 pr-2.5 py-2.5 rounded-xl font-mono-tech font-medium"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[#0F293A] dark:text-[#F0F9FF] font-semibold mb-1">
                            Admin Full Name *
                          </label>
                          <div className="relative">
                            <User className="w-4 h-4 text-[#0E7490] absolute left-3.5 top-3" />
                            <input
                              type="text"
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              placeholder="Dr. Kavita Rao"
                              required
                              className="tactile-input w-full pl-10 pr-3 py-2.5 rounded-xl font-medium"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[#0F293A] dark:text-[#F0F9FF] font-semibold mb-1">
                            City / Campus Location
                          </label>
                          <input
                            type="text"
                            value={newCampusCity}
                            onChange={(e) => setNewCampusCity(e.target.value)}
                            placeholder="Ponda, Goa"
                            className="tactile-input w-full p-2.5 rounded-xl font-medium"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* Student Sign Up Fields + Published Institute Selector */}
                  {tab === 'student' && isSignUp && (
                    <>
                      <div className="p-3 rounded-xl tactile-inset space-y-2.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[#0F293A] dark:text-[#F0F9FF] font-semibold flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-[#0E7490]" />
                            <span>Select Published Institute Portal</span>
                          </label>
                          {resolvedStudentCampus && (
                            <span className="text-[10px] font-mono-tech font-bold px-2 py-0.5 rounded bg-[#0E7490]/15 text-[#0E7490] dark:text-cyan-300">
                              Code: {resolvedStudentCampus.code}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <select
                            value={resolvedStudentCampus?.id || selectedCampusId}
                            onChange={(e) => {
                              setSelectedCampusId(e.target.value);
                              setCampusInviteCode('');
                            }}
                            className="tactile-input sm:col-span-2 p-2 rounded-xl font-medium text-xs"
                          >
                            {publicCampuses.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} ({c.code})
                              </option>
                            ))}
                          </select>

                          <input
                            type="text"
                            value={campusInviteCode}
                            onChange={(e) => setCampusInviteCode(e.target.value.toUpperCase())}
                            placeholder="Or Invite Code"
                            title="Enter your institute's invite code to join directly"
                            className="tactile-input p-2 rounded-xl font-mono-tech font-semibold uppercase text-xs"
                          />
                        </div>
                        <p className="text-[10px] text-[#476778] dark:text-[#94B8CC]">
                          Joining an existing institute links your account to its approved buildings & floor maps.
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[#0F293A] dark:text-[#F0F9FF] font-semibold mb-1">
                            {t('fullName')}
                          </label>
                          <div className="relative">
                            <User className="w-4 h-4 text-[#0E7490] absolute left-3.5 top-3" />
                            <input
                              type="text"
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              placeholder={t('placeholderName')}
                              required
                              className="tactile-input w-full pl-10 pr-3 py-2.5 rounded-xl font-medium"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[#0F293A] dark:text-[#F0F9FF] font-semibold mb-1">
                            {t('studentRollId')}
                          </label>
                          <div className="relative">
                            <Hash className="w-4 h-4 text-[#0E7490] absolute left-3.5 top-3" />
                            <input
                              type="text"
                              value={studentId}
                              onChange={(e) => setStudentId(e.target.value)}
                              placeholder={t('placeholderRoll')}
                              required
                              className="tactile-input w-full pl-10 pr-3 py-2.5 rounded-xl font-mono-tech font-medium"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[#0F293A] dark:text-[#F0F9FF] font-semibold mb-1">
                            {t('hostel')} / Building
                          </label>
                          <select
                            value={hostel}
                            onChange={(e) => setHostel(e.target.value)}
                            className="tactile-input w-full p-2.5 rounded-xl font-medium"
                          >
                            {availableBuildings.map((bName) => (
                              <option key={bName} value={bName}>
                                {translateHostel(bName, language)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[#0F293A] dark:text-[#F0F9FF] font-semibold mb-1">
                            {t('room')}
                          </label>
                          <input
                            type="text"
                            value={room}
                            onChange={(e) => setRoom(e.target.value)}
                            placeholder={t('placeholderRoom')}
                            className="tactile-input w-full p-2.5 rounded-xl font-medium"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[#0F293A] dark:text-[#F0F9FF] font-semibold mb-1">
                          {t('preferredLanguage')}
                        </label>
                        <select
                          value={preferredLang}
                          onChange={(e) => setPreferredLang(e.target.value as 'en' | 'hi')}
                          className="tactile-input w-full p-2.5 rounded-xl font-medium"
                        >
                          <option value="en">{t('englishLabel')}</option>
                          <option value="hi">{t('hindiLabel')}</option>
                        </select>
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-[#0F293A] dark:text-[#F0F9FF] font-semibold mb-1">
                      {tab === 'new-campus'
                        ? 'Campus Admin Email *'
                        : tab === 'student'
                        ? t('collegeEmail')
                        : t('staffSupervisorEmail')}
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-[#0E7490] absolute left-3.5 top-3" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={
                          tab === 'new-campus'
                            ? 'admin@yourinstitute.edu'
                            : tab === 'student'
                            ? t('placeholderStudentEmail')
                            : t('placeholderStaffEmail')
                        }
                        required
                        className="tactile-input w-full pl-10 pr-3 py-2.5 rounded-xl font-medium"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[#0F293A] dark:text-[#F0F9FF] font-semibold mb-1">
                      {t('password')}
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-[#0E7490] absolute left-3.5 top-3" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className="tactile-input w-full pl-10 pr-10 py-2.5 rounded-xl font-medium"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                        title={showPassword ? t('hidePassword') : t('showPassword')}
                        className="absolute right-2.5 top-2 p-1 rounded-md text-[#476778] hover:text-[#0E7490] dark:hover:text-cyan-300 transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="tactile-btn-primary w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm disabled:opacity-50 min-h-[48px]"
                  >
                    <span>
                      {loading
                        ? t('authenticating')
                        : tab === 'new-campus'
                        ? 'Launch Campus Setup & Map Wizard'
                        : isSignUp
                        ? t('completeStudentSignUp')
                        : t('signInToCampusConnect')}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  {/* Social Login / SSO Options */}
                  <div className="space-y-3 pt-1">
                    <div className="relative flex py-1 items-center">
                      <div className="flex-grow deboss-divider"></div>
                      <span className="flex-shrink mx-3 text-[#476778] dark:text-[#94B8CC] text-[11px] font-medium">
                        or continue with SSO
                      </span>
                      <div className="flex-grow deboss-divider"></div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setShowCustomSsoInput(tab === 'new-campus');
                          setCustomSsoCreateCampus(tab === 'new-campus');
                          setShowGoogleModal(true);
                        }}
                        className="tactile-btn-beige flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold min-h-[44px]"
                      >
                        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                        </svg>
                        <span>Google SSO</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowCustomSsoInput(tab === 'new-campus');
                          setCustomSsoCreateCampus(tab === 'new-campus');
                          setShowMicrosoftModal(true);
                        }}
                        className="tactile-btn-beige flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold min-h-[44px]"
                      >
                        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                          <path fill="#F25022" d="M1 1h10v10H1z"/>
                          <path fill="#7FBA00" d="M13 1h10v10H13z"/>
                          <path fill="#00A4EF" d="M1 13h10v10H1z"/>
                          <path fill="#FFB900" d="M13 13h10v10H13z"/>
                        </svg>
                        <span>Microsoft SSO</span>
                      </button>
                    </div>
                  </div>
                </form>

                {/* Toggle between Sign In & Sign Up for Student */}
                {tab === 'student' && (
                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsSignUp(!isSignUp);
                        setError(null);
                      }}
                      className="text-xs font-semibold text-[#0E7490] dark:text-cyan-300 hover:underline"
                    >
                      {isSignUp ? t('alreadyRegistered') : t('newStudentCreate')}
                    </button>
                  </div>
                )}

                {tab === 'staff' && (
                  <div className="p-3 rounded-xl tactile-inset text-center text-[11px] font-medium text-[#476778] dark:text-[#94B8CC] space-y-1">
                    <div>{t('staffProvisionedNote')}</div>
                    <button
                      type="button"
                      onClick={() => setTab('new-campus')}
                      className="text-[#0E7490] dark:text-cyan-300 font-semibold hover:underline inline-flex items-center gap-1"
                    >
                      <span>Setting up a new institute? Launch Campus Setup Wizard</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Demo Setup Modal */}
      <DemoSetupModal
        isOpen={showDemoSetup}
        onClose={() => setShowDemoSetup(false)}
        onLoginSuccess={onLoginSuccess}
      />

      {/* Google SSO OAuth Popup Modal */}
      {showGoogleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B1924]/60 backdrop-blur-sm">
          <div className="tactile-card rounded-2xl p-6 max-w-sm w-full space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-white dark:bg-[#132C3E] border border-[#0E7490]/15 flex items-center justify-center mx-auto shadow-xs">
                <svg className="w-6 h-6" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
              </div>
              <h3 className="font-display font-bold text-lg text-[#0F293A] dark:text-[#F0F9FF]">
                Sign in with Google
              </h3>
              <p className="text-xs font-medium text-[#476778] dark:text-[#94B8CC]">
                Choose a Google Workspace account for CampusConnect
              </p>
            </div>

            {ssoVerifyingEmail ? (
              <div className="py-8 text-center space-y-3">
                <div className="w-8 h-8 border-3 border-[#0E7490] dark:border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs font-semibold text-[#0F293A] dark:text-[#F0F9FF]">
                  Verifying OAuth 2.0 credentials for {ssoVerifyingEmail}...
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {[
                  { name: 'Aarav Sharma', email: 'student1@campus.demo', desc: 'Student · Hostel 2' },
                  { name: 'Priya Patel', email: 'student2@campus.demo', desc: 'Student · Hostel 2' },
                  { name: 'Rajeshwari Nair', email: 'admin@campus.demo', desc: 'System Admin' },
                ].map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => handleExecuteSsoLogin(acc.email)}
                    className="w-full flex items-center justify-between p-3 rounded-xl tactile-surface-elevated hover:border-[#0891B2] transition-all text-left"
                  >
                    <div>
                      <div className="text-xs font-semibold text-[#0F293A] dark:text-[#F0F9FF]">
                        {acc.name}
                      </div>
                      <div className="text-[11px] font-mono-tech text-[#476778] dark:text-[#94B8CC]">{acc.email}</div>
                    </div>
                    <span className="text-[10px] font-semibold text-[#0E7490] dark:text-cyan-200 bg-[#E0F2F7] dark:bg-[#0E7490]/30 px-2 py-0.5 rounded-md">
                      {acc.desc}
                    </span>
                  </button>
                ))}

                {showCustomSsoInput ? (
                  <div className="pt-2 space-y-2.5 border-t border-[#0E7490]/15">
                    <input
                      type="email"
                      value={customSsoEmail}
                      onChange={(e) => setCustomSsoEmail(e.target.value)}
                      placeholder="enter.your.email@institute.edu"
                      className="tactile-input w-full p-2.5 rounded-xl text-xs font-medium"
                    />
                    <label className="flex items-center gap-2 text-[11px] font-semibold text-[#0F293A] dark:text-[#F0F9FF] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={customSsoCreateCampus}
                        onChange={(e) => setCustomSsoCreateCampus(e.target.checked)}
                        className="rounded border-[#0E7490]"
                      />
                      <span>I am a new Campus Admin setting up an institute portal</span>
                    </label>
                    {customSsoCreateCampus && (
                      <input
                        type="text"
                        value={customSsoInstituteName}
                        onChange={(e) => setCustomSsoInstituteName(e.target.value)}
                        placeholder="Institute Name (e.g., NIT Surathkal)"
                        className="tactile-input w-full p-2.5 rounded-xl text-xs font-medium"
                      />
                    )}
                    <button
                      type="button"
                      disabled={!customSsoEmail.trim()}
                      onClick={() =>
                        handleExecuteSsoLogin(
                          customSsoEmail.trim(),
                          'google',
                          customSsoCreateCampus,
                          customSsoInstituteName.trim() || undefined
                        )
                      }
                      className="tactile-btn-primary w-full py-2.5 px-3 rounded-xl text-xs font-semibold disabled:opacity-40"
                    >
                      {customSsoCreateCampus ? 'Start New Campus Setup via Google' : 'Authenticate Google Account'}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCustomSsoInput(true)}
                    className="w-full py-2 text-center text-xs font-semibold text-[#0E7490] dark:text-cyan-300 hover:underline"
                  >
                    + Use another Google account or setup new campus
                  </button>
                )}
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGoogleModal(false)}
                className="tactile-btn-beige px-4 py-2 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Microsoft / Outlook SSO OAuth Popup Modal */}
      {showMicrosoftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B1924]/60 backdrop-blur-sm">
          <div className="tactile-card rounded-2xl p-6 max-w-sm w-full space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-white dark:bg-[#132C3E] border border-[#0E7490]/15 flex items-center justify-center mx-auto shadow-xs">
                <svg className="w-6 h-6" viewBox="0 0 24 24">
                  <path fill="#F25022" d="M1 1h10v10H1z"/>
                  <path fill="#7FBA00" d="M13 1h10v10H13z"/>
                  <path fill="#00A4EF" d="M1 13h10v10H1z"/>
                  <path fill="#FFB900" d="M13 13h10v10H13z"/>
                </svg>
              </div>
              <h3 className="font-display font-bold text-lg text-[#0F293A] dark:text-[#F0F9FF]">
                Sign in with Microsoft
              </h3>
              <p className="text-xs font-medium text-[#476778] dark:text-[#94B8CC]">
                Pick an account to sign in with Outlook / Office 365
              </p>
            </div>

            {ssoVerifyingEmail ? (
              <div className="py-8 text-center space-y-3">
                <div className="w-8 h-8 border-3 border-[#0E7490] dark:border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs font-semibold text-[#0F293A] dark:text-[#F0F9FF]">
                  Connecting to Microsoft Online SSO for {ssoVerifyingEmail}...
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {[
                  { name: 'Dr. Alok Verma', email: 'supervisor@campus.demo', desc: 'Campus Supervisor' },
                  { name: 'Ramesh Kumar', email: 'plumbing@campus.demo', desc: 'Plumbing Staff' },
                  { name: 'Vikram Singh', email: 'electricity@campus.demo', desc: 'Electrical Staff' },
                  { name: 'Sunita Devi', email: 'cleanliness@campus.demo', desc: 'Housekeeping Staff' },
                  { name: 'Deepak Sharma', email: 'internet@campus.demo', desc: 'IT Network Staff' },
                ].map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => handleExecuteSsoLogin(acc.email, 'microsoft')}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl tactile-surface-elevated hover:border-[#0891B2] transition-all text-left"
                  >
                    <div>
                      <div className="text-xs font-semibold text-[#0F293A] dark:text-[#F0F9FF]">
                        {acc.name}
                      </div>
                      <div className="text-[11px] font-mono-tech text-[#476778] dark:text-[#94B8CC]">{acc.email}</div>
                    </div>
                    <span className="text-[10px] font-semibold text-[#0E7490] dark:text-cyan-200 bg-[#E0F2F7] dark:bg-[#0E7490]/30 px-2 py-0.5 rounded-md">
                      {acc.desc}
                    </span>
                  </button>
                ))}

                {showCustomSsoInput ? (
                  <div className="pt-2 space-y-2.5 border-t border-[#0E7490]/15">
                    <input
                      type="email"
                      value={customSsoEmail}
                      onChange={(e) => setCustomSsoEmail(e.target.value)}
                      placeholder="user@outlook.com or admin@campus.edu"
                      className="tactile-input w-full p-2.5 rounded-xl text-xs font-medium"
                    />
                    <label className="flex items-center gap-2 text-[11px] font-semibold text-[#0F293A] dark:text-[#F0F9FF] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={customSsoCreateCampus}
                        onChange={(e) => setCustomSsoCreateCampus(e.target.checked)}
                        className="rounded border-[#0E7490]"
                      />
                      <span>I am a new Campus Admin setting up an institute portal</span>
                    </label>
                    {customSsoCreateCampus && (
                      <input
                        type="text"
                        value={customSsoInstituteName}
                        onChange={(e) => setCustomSsoInstituteName(e.target.value)}
                        placeholder="Institute Name (e.g., BITS Pilani)"
                        className="tactile-input w-full p-2.5 rounded-xl text-xs font-medium"
                      />
                    )}
                    <button
                      type="button"
                      disabled={!customSsoEmail.trim()}
                      onClick={() =>
                        handleExecuteSsoLogin(
                          customSsoEmail.trim(),
                          'microsoft',
                          customSsoCreateCampus,
                          customSsoInstituteName.trim() || undefined
                        )
                      }
                      className="tactile-btn-primary w-full py-2.5 px-3 rounded-xl text-xs font-semibold disabled:opacity-40"
                    >
                      {customSsoCreateCampus ? 'Start New Campus Setup via Microsoft' : 'Authenticate Microsoft Account'}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCustomSsoInput(true)}
                    className="w-full py-2 text-center text-xs font-semibold text-[#0E7490] dark:text-cyan-300 hover:underline"
                  >
                    + Use another Microsoft account or setup new campus
                  </button>
                )}
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowMicrosoftModal(false)}
                className="tactile-btn-beige px-4 py-2 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
