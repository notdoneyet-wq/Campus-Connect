import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { CampusOrganization, DepartmentId, UserProfile, UserRole } from '../types';
import { DEFAULT_CAMPUS_ID, setActiveCampusCache } from '../data/campus';
import { sanitizeProfileMutation } from '../utils/authorization';

export interface DemoAccountSpec {
  id: string;
  name: string;
  label: string;
  email: string;
  password: string;
  role: UserRole;
  department?: DepartmentId;
  hostel?: string;
  room?: string;
  language: 'en' | 'hi';
}

export const DEMO_ACCOUNTS: DemoAccountSpec[] = [
  {
    id: 'stu1',
    name: 'Aarav Sharma',
    label: 'Student 1 (Hostel 2, Room 204)',
    email: 'student1@campus.demo',
    password: 'Demo@123',
    role: 'student',
    hostel: 'Hostel 2',
    room: 'Room 204',
    language: 'en',
  },
  {
    id: 'stu2',
    name: 'Priya Patel',
    label: 'Student 2 (Hostel 2, Room 206 - Hindi)',
    email: 'student2@campus.demo',
    password: 'Demo@123',
    role: 'student',
    hostel: 'Hostel 2',
    room: 'Room 206',
    language: 'hi',
  },
  {
    id: 'staff_plumb',
    name: 'Ramesh Kumar',
    label: 'Plumbing Staff',
    email: 'plumbing@campus.demo',
    password: 'Demo@123',
    role: 'staff',
    department: 'plumbing',
    language: 'en',
  },
  {
    id: 'staff_elec',
    name: 'Vikram Singh',
    label: 'Electrical Staff',
    email: 'electricity@campus.demo',
    password: 'Demo@123',
    role: 'staff',
    department: 'electricity',
    language: 'en',
  },
  {
    id: 'staff_clean',
    name: 'Sunita Devi',
    label: 'Housekeeping Staff',
    email: 'cleanliness@campus.demo',
    password: 'Demo@123',
    role: 'staff',
    department: 'cleanliness',
    language: 'en',
  },
  {
    id: 'staff_net',
    name: 'Deepak Sharma',
    label: 'IT / Network Staff',
    email: 'internet@campus.demo',
    password: 'Demo@123',
    role: 'staff',
    department: 'internet',
    language: 'en',
  },
  {
    id: 'staff_sup',
    name: 'Dr. Alok Verma',
    label: 'Campus Supervisor (Warden)',
    email: 'supervisor@campus.demo',
    password: 'Demo@123',
    role: 'supervisor',
    language: 'en',
  },
  {
    id: 'staff_admin',
    name: 'Rajeshwari Nair',
    label: 'System Admin',
    email: 'admin@campus.demo',
    password: 'Demo@123',
    role: 'admin',
    language: 'en',
  },
];

const LOCAL_SESSION_KEY = 'campusconnect_active_user';
const LOCAL_TOKEN_KEY = 'campusconnect_auth_token';
const LOCAL_USERS_DB_KEY = 'campusconnect_users_db';

function getLocalUsersDb(): Record<string, { profile: UserProfile; password?: string }> {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveLocalUserRecord(email: string, profile: UserProfile, password?: string) {
  try {
    const dbMap = getLocalUsersDb();
    dbMap[email.toLowerCase()] = {
      profile,
      password: password || dbMap[email.toLowerCase()]?.password || 'Demo@123',
    };
    localStorage.setItem(LOCAL_USERS_DB_KEY, JSON.stringify(dbMap));
  } catch {}
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(LOCAL_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(LOCAL_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(LOCAL_TOKEN_KEY);
    }
  } catch {}
}

export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const user = getCachedUser();
  if (user) {
    headers['x-campus-uid'] = user.uid;
    headers['x-campus-email'] = user.email;
  }
  return headers;
}

export function getCachedUser(): UserProfile | null {
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    if (raw) return JSON.parse(raw) as UserProfile;
  } catch {}
  return null;
}

export function setCachedUser(user: UserProfile | null) {
  try {
    if (user) {
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(LOCAL_SESSION_KEY);
    }
  } catch {}
}

export async function provisionAndSignInDemoAccount(spec: DemoAccountSpec): Promise<UserProfile> {
  try {
    const res = await fetch('/api/auth/demo-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: spec.email }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.token) setAuthToken(data.token);
      if (data.campus) setActiveCampusCache(data.campus);
      if (data.profile) {
        setCachedUser(data.profile);
        saveLocalUserRecord(spec.email, data.profile, spec.password);
        return data.profile as UserProfile;
      }
    }
  } catch {}

  const fallbackProfile: UserProfile = {
    uid: `demo_${spec.id}`,
    name: spec.name,
    email: spec.email,
    role: spec.role,
    campusId: DEFAULT_CAMPUS_ID,
    campusName: 'Indian Institute of Technology — Demo Campus',
    department: spec.department,
    studentId: spec.role === 'student' ? `2024CS10${spec.id.slice(-1)}` : undefined,
    hostel: spec.hostel,
    room: spec.room,
    language: spec.language,
    emailVerified: true,
    approved: true,
  };

  try {
    let userCredential;
    try {
      userCredential = await signInWithEmailAndPassword(auth, spec.email, spec.password);
    } catch {
      userCredential = await createUserWithEmailAndPassword(auth, spec.email, spec.password);
    }
    const uid = userCredential.user.uid;
    const profile: UserProfile = { ...fallbackProfile, uid };
    await setDoc(doc(db, 'users', uid), profile, { merge: true });
    saveLocalUserRecord(spec.email, profile, spec.password);
    setCachedUser(profile);
    return profile;
  } catch {
    saveLocalUserRecord(spec.email, fallbackProfile, spec.password);
    setCachedUser(fallbackProfile);
    return fallbackProfile;
  }
}

export async function setupDemoAccounts(): Promise<void> {
  for (const spec of DEMO_ACCOUNTS) {
    const fallbackProfile: UserProfile = {
      uid: `demo_${spec.id}`,
      name: spec.name,
      email: spec.email,
      role: spec.role,
      campusId: DEFAULT_CAMPUS_ID,
      campusName: 'Indian Institute of Technology — Demo Campus',
      department: spec.department,
      studentId: spec.role === 'student' ? `2024CS10${spec.id.slice(-1)}` : undefined,
      hostel: spec.hostel,
      room: spec.room,
      language: spec.language,
      emailVerified: true,
      approved: true,
    };
    saveLocalUserRecord(spec.email, fallbackProfile, spec.password);
  }
}

export async function loginAsDemo(email: string): Promise<UserProfile> {
  const spec = DEMO_ACCOUNTS.find((a) => a.email.toLowerCase() === email.trim().toLowerCase());
  if (!spec) {
    throw new Error('Demo account not found.');
  }
  return provisionAndSignInDemoAccount(spec);
}

export async function refreshSessionProfile(): Promise<UserProfile | null> {
  const token = getAuthToken();
  const cached = getCachedUser();
  if (!token && !cached) return null;

  try {
    const res = await fetch('/api/auth/me', {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.campus) setActiveCampusCache(data.campus);
      if (data.profile) {
        setCachedUser(data.profile);
        return data.profile as UserProfile;
      }
    }
  } catch {}
  return cached;
}

export async function loginWithEmail(email: string, password: string): Promise<UserProfile> {
  const normalizedEmail = email.trim().toLowerCase();

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail, password }),
    });
    const data = await res.json();
    if (res.ok && data.profile) {
      if (data.token) setAuthToken(data.token);
      if (data.campus) setActiveCampusCache(data.campus);
      setCachedUser(data.profile);
      saveLocalUserRecord(normalizedEmail, data.profile, password);
      return data.profile as UserProfile;
    } else if (res.status === 401 || res.status === 403) {
      throw new Error(data.error || 'Invalid email or password.');
    }
  } catch (err: any) {
    if (err.message && (err.message.includes('Invalid') || err.message.includes('verify') || err.message.includes('Student accounts'))) {
      throw err;
    }
  }

  const matchingDemo = DEMO_ACCOUNTS.find((d) => d.email.toLowerCase() === normalizedEmail);
  if (matchingDemo && password === matchingDemo.password) {
    return provisionAndSignInDemoAccount(matchingDemo);
  }

  try {
    const cred = await signInWithEmailAndPassword(auth, normalizedEmail, password);
    const snap = await getDoc(doc(db, 'users', cred.user.uid));
    if (snap.exists()) {
      const profile = snap.data() as UserProfile;
      setCachedUser(profile);
      saveLocalUserRecord(normalizedEmail, profile, password);
      return profile;
    }
  } catch {}

  const localUsers = getLocalUsersDb();
  const record = localUsers[normalizedEmail];
  if (record && (!record.password || record.password === password)) {
    setCachedUser(record.profile);
    return record.profile;
  }

  throw new Error('Invalid email or password. Use Demo Setup for 1-click sandbox access.');
}

export async function registerCampusAdmin(params: {
  name: string;
  email: string;
  password: string;
  campusName?: string;
  instituteName?: string;
  campusCode?: string;
  allowedDomains?: string[];
  domain?: string;
  city?: string;
  language: 'en' | 'hi';
}): Promise<{ user: UserProfile; campus?: CampusOrganization }> {
  const normalizedEmail = params.email.trim().toLowerCase();
  const resolvedInstituteName = params.campusName || params.instituteName || 'New Campus Institute';

  const res = await fetch('/api/auth/register-campus-admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...params,
      campusName: resolvedInstituteName,
      instituteName: resolvedInstituteName,
      email: normalizedEmail,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.profile) {
    throw new Error(data.error || 'Failed to register campus administrator.');
  }

  if (data.token) setAuthToken(data.token);
  if (data.campus) {
    setActiveCampusCache(data.campus);
    try {
      await setDoc(doc(db, 'campuses', data.campus.id), data.campus, { merge: true });
    } catch {}
  }
  try {
    await setDoc(doc(db, 'users', data.profile.uid), data.profile, { merge: true });
  } catch {}

  saveLocalUserRecord(normalizedEmail, data.profile, params.password);
  setCachedUser(data.profile);
  return { user: data.profile as UserProfile, campus: data.campus };
}

export async function registerStudent(params: {
  name: string;
  email: string;
  studentId: string;
  password: string;
  language: 'en' | 'hi';
  hostel?: string;
  room?: string;
  campusId?: string;
  campusCode?: string;
}): Promise<UserProfile> {
  const { name, email, studentId, password, language, hostel, room, campusId, campusCode } = params;
  const normalizedEmail = email.trim().toLowerCase();

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        email: normalizedEmail,
        studentId,
        password,
        language,
        hostel,
        room,
        campusId,
        campusCode,
        autoVerify: false,
      }),
    });
    const data = await res.json();
    if (res.ok && data.profile) {
      if (data.token) setAuthToken(data.token);
      if (data.campus) setActiveCampusCache(data.campus);
      saveLocalUserRecord(normalizedEmail, data.profile, password);
      return data.profile as UserProfile;
    } else if (res.status === 409 || res.status === 400 || res.status === 404) {
      throw new Error(data.error || 'Registration failed.');
    }
  } catch (err: any) {
    if (err.message && (err.message.includes('already registered') || err.message.includes('Password') || err.message.includes('No published campus'))) {
      throw err;
    }
  }

  const sanitizedProfile = sanitizeProfileMutation(null, null, {
    uid: `stu_${Date.now()}`,
    name,
    email: normalizedEmail,
    campusId: campusId || DEFAULT_CAMPUS_ID,
    studentId,
    hostel: hostel || 'Hostel 2',
    room: room || 'Room 204',
    language,
    emailVerified: false,
    approved: true,
  });

  try {
    const cred = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
    const profile: UserProfile = { ...sanitizedProfile, uid: cred.user.uid };
    await setDoc(doc(db, 'users', cred.user.uid), profile);
    saveLocalUserRecord(normalizedEmail, profile, password);
    return profile;
  } catch {
    saveLocalUserRecord(normalizedEmail, sanitizedProfile, password);
    return sanitizedProfile;
  }
}

export async function loginWithSso(params: {
  email: string;
  name?: string;
  provider: 'google' | 'microsoft';
  campusId?: string;
  campusCode?: string;
  createNewCampus?: boolean;
  campusName?: string;
  instituteName?: string;
}): Promise<UserProfile> {
  const normalizedEmail = params.email.trim().toLowerCase();
  const resolvedCampusName = params.campusName || params.instituteName;

  try {
    const res = await fetch('/api/auth/sso-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: normalizedEmail,
        name: params.name,
        provider: params.provider,
        campusId: params.campusId,
        campusCode: params.campusCode,
        createNewCampus: params.createNewCampus,
        campusName: resolvedCampusName,
        instituteName: resolvedCampusName,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.token) setAuthToken(data.token);
      if (data.campus) setActiveCampusCache(data.campus);
      if (data.profile) {
        setCachedUser(data.profile);
        saveLocalUserRecord(normalizedEmail, data.profile);
        return data.profile as UserProfile;
      }
    }
  } catch {}

  const matchingDemo = DEMO_ACCOUNTS.find((d) => d.email.toLowerCase() === normalizedEmail);
  if (matchingDemo) {
    return provisionAndSignInDemoAccount(matchingDemo);
  }

  const displayName =
    params.name ||
    normalizedEmail
      .split('@')[0]
      .replace(/[._]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());

  const fallbackProfile: UserProfile = {
    uid: `sso_${Date.now()}`,
    name: displayName,
    email: normalizedEmail,
    role: params.createNewCampus ? 'admin' : 'student',
    campusId: DEFAULT_CAMPUS_ID,
    studentId: `2024CS${Math.floor(1000 + Math.random() * 9000)}`,
    hostel: 'Hostel 2',
    room: 'Room 204',
    language: 'en',
    emailVerified: true,
    approved: true,
  };
  setCachedUser(fallbackProfile);
  saveLocalUserRecord(normalizedEmail, fallbackProfile);
  return fallbackProfile;
}

export async function verifyStudentEmail(email: string): Promise<UserProfile> {
  const normalizedEmail = email.trim().toLowerCase();

  try {
    const res = await fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.token) setAuthToken(data.token);
      if (data.profile) {
        setCachedUser(data.profile);
        saveLocalUserRecord(normalizedEmail, data.profile);
        return data.profile as UserProfile;
      }
    }
  } catch {}

  const localUsers = getLocalUsersDb();
  const record = localUsers[normalizedEmail];
  if (record) {
    record.profile.emailVerified = true;
    saveLocalUserRecord(normalizedEmail, record.profile, record.password);
    setCachedUser(record.profile);
    return record.profile;
  }
  throw new Error('User record not found.');
}

export async function signOutUser(): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: getAuthHeaders(),
    });
  } catch {}
  setAuthToken(null);
  setCachedUser(null);
  setActiveCampusCache(null);
  try {
    await firebaseSignOut(auth);
  } catch {}
}

export const logoutUser = signOutUser;
