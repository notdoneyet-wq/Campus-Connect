import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebaseConfig';
import { CampusOrganization, UserProfile } from './types';
import { getCachedUser, logoutUser, refreshSessionProfile } from './services/auth';
import {
  getUserProfile,
  checkAndTriggerOverdueEscalations,
  fetchMyCampus,
} from './services/db';
import { setActiveCampusCache } from './data/campus';
import { Header } from './components/common/Header';
import { LoginScreen } from './components/auth/LoginScreen';
import { StudentHome } from './components/student/StudentHome';
import { StaffConsole } from './components/staff/StaffConsole';
import { CampusSetupWizard } from './components/admin/CampusSetupWizard';
import { Language, LanguageProvider } from './data/i18n';
import { LiquidMetal } from '@/components/ui/liquid-metal';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => getCachedUser());
  const [activeCampus, setActiveCampus] = useState<CampusOrganization | null>(null);
  const [language, setLanguage] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('campusconnect_lang');
      if (saved === 'hi' || saved === 'en') return saved;
      return 'en';
    } catch {
      return 'en';
    }
  });

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('campusconnect_dark');
      if (saved !== null) return saved === 'true';
      return false;
    } catch {
      return false;
    }
  });

  const [dataRefreshTrigger, setDataRefreshTrigger] = useState(0);

  // Sync dark mode class on <html>
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try {
      localStorage.setItem('campusconnect_dark', String(darkMode));
    } catch {}
  }, [darkMode]);

  const handleSetLanguage = (nextLang: Language) => {
    setLanguage(nextLang);
    try {
      localStorage.setItem('campusconnect_lang', nextLang);
    } catch {}
  };

  // Sync language toggle
  const handleLanguageToggle = () => {
    const nextLang = language === 'en' ? 'hi' : 'en';
    handleSetLanguage(nextLang);
  };

  // Restore session from backend and listen to Firebase Auth state
  useEffect(() => {
    refreshSessionProfile().then((serverProfile) => {
      if (serverProfile) {
        setCurrentUser(serverProfile);
      }
    });

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        const profile = await getUserProfile(fbUser.uid);
        if (profile) {
          setCurrentUser(profile);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // Load the current user's isolated campus organization & floor maps whenever user changes
  useEffect(() => {
    if (!currentUser) {
      setActiveCampus(null);
      setActiveCampusCache(null);
      return;
    }
    fetchMyCampus(currentUser)
      .then((campus) => {
        if (campus) {
          setActiveCampus(campus);
          setActiveCampusCache(campus);
        }
      })
      .catch(() => {});
  }, [currentUser?.uid, currentUser?.campusId, dataRefreshTrigger]);

  // Periodic SLA check every 60s when signed in
  useEffect(() => {
    if (!currentUser) return;
    checkAndTriggerOverdueEscalations();
    const interval = setInterval(() => {
      checkAndTriggerOverdueEscalations();
    }, 60000);
    return () => clearInterval(interval);
  }, [currentUser]);

  const handleSignOut = async () => {
    await logoutUser();
    setCurrentUser(null);
    setActiveCampus(null);
  };

  const handleRefreshData = () => {
    setDataRefreshTrigger((prev) => prev + 1);
  };

  // Determine if a first-time or returning Campus Admin has an unfinished draft setup
  const isDraftAdminSetup =
    currentUser?.role === 'admin' && activeCampus?.status === 'draft';

  return (
    <LanguageProvider language={language} setLanguage={handleSetLanguage}>
      <div className="relative min-h-screen text-[#0F293A] dark:text-[#F0F9FF] flex flex-col font-sans transition-colors duration-200 isolate">
        {/* Full-Website Coastal Blue LiquidMetal Background */}
        <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
          <LiquidMetal
            variant={darkMode ? 'chrome' : 'oil'}
            speed={0.55}
            distortion={0.85}
            pointerInfluence
            className="w-full h-full"
          />
          {/* Subtle translucent coastal mist glaze to preserve crisp readability across all views */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[#EDF6F9]/52 dark:bg-[#081824]/64 backdrop-blur-[2px] transition-colors duration-300"
          />
        </div>

        {/* Top Universal App Header */}
        <Header
          currentUser={currentUser}
          activeCampus={activeCampus}
          language={language}
          onLanguageToggle={handleLanguageToggle}
          darkMode={darkMode}
          onDarkModeToggle={() => setDarkMode(!darkMode)}
          onSignOut={handleSignOut}
          onDataRefresh={handleRefreshData}
        />

        {/* Main View Router */}
        <div className="relative z-10 flex-1 w-full flex flex-col">
          {!currentUser ? (
            <LoginScreen
              language={language}
              onLoginSuccess={(user, initialCampus) => {
                setCurrentUser(user);
                if (initialCampus) {
                  setActiveCampus(initialCampus);
                  setActiveCampusCache(initialCampus);
                }
                if (user.language) handleSetLanguage(user.language);
              }}
            />
          ) : isDraftAdminSetup && activeCampus ? (
            <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
              <CampusSetupWizard
                currentUser={currentUser}
                campus={activeCampus}
                onCampusUpdated={(updated) => {
                  setActiveCampus(updated);
                  setActiveCampusCache(updated);
                }}
                onPortalPublished={(published) => {
                  setActiveCampus(published);
                  setActiveCampusCache(published);
                  setCurrentUser((prev) =>
                    prev
                      ? {
                          ...prev,
                          campusId: published.id,
                          campusName: published.name,
                          hostel: published.buildings[0]?.name || prev.hostel,
                        }
                      : prev
                  );
                }}
              />
            </main>
          ) : currentUser.role === 'student' ? (
            <StudentHome
              key={dataRefreshTrigger}
              currentUser={currentUser}
              language={language}
              onLanguageToggle={handleLanguageToggle}
              onSignOut={handleSignOut}
              onUserUpdated={(updated) => setCurrentUser(updated)}
            />
          ) : (
            <StaffConsole key={dataRefreshTrigger} currentUser={currentUser} />
          )}
        </div>
      </div>
    </LanguageProvider>
  );
}

