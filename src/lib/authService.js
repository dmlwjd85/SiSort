import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth';
import { getApps, initializeApp } from 'firebase/app';
import { readFirebaseConfig } from './firebaseConfig.js';

function getFirebaseApp() {
  const cfg = readFirebaseConfig();
  if (!cfg.apiKey || !cfg.projectId) return null;
  return getApps().length ? getApps()[0] : initializeApp(cfg);
}

export function getFirebaseAuth() {
  const app = getFirebaseApp();
  if (!app) return null;
  return getAuth(app);
}

/**
 * @param {string} email
 * @param {string} password
 * @param {string} displayName 본명
 */
export async function registerWithEmail(email, password, displayName) {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase 미구성');
  const trimmed = displayName.trim();
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  if (trimmed) {
    await updateProfile(cred.user, { displayName: trimmed });
  }
  return cred.user;
}

export async function loginWithEmail(email, password) {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase 미구성');
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

export async function logoutFirebase() {
  const auth = getFirebaseAuth();
  if (!auth) return;
  await signOut(auth);
}

export function subscribeAuth(callback) {
  const auth = getFirebaseAuth();
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}
