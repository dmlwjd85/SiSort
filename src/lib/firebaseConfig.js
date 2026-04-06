import { firebasePublicConfig as pub } from '../config/firebasePublic.js';

/** 환경변수 우선, 없으면 firebasePublic.js (다른 저장소·배포 시 VITE_* 로 덮어씀) */
export function readFirebaseConfig() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || pub.apiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || pub.authDomain,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || pub.projectId,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || pub.storageBucket,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || pub.messagingSenderId,
    appId: import.meta.env.VITE_FIREBASE_APP_ID || pub.appId,
  };
}
