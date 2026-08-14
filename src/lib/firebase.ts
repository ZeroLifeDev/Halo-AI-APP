import { initializeApp } from "firebase/app";
import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  enableIndexedDbPersistence,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDCHOxv-RarKJF3zVA52yOhq3Lv4aIg5vI",
  authDomain: "halo-ai-bcfb3.firebaseapp.com",
  projectId: "halo-ai-bcfb3",
  storageBucket: "halo-ai-bcfb3.firebasestorage.app",
  messagingSenderId: "608363030554",
  appId: "1:608363030554:web:986e8dffbcb30ca13989a3",
  measurementId: "G-D090XG93P5",
};

export const app = initializeApp(firebaseConfig);

/**
 * Inside the Android WebView we pin persistence to IndexedDB so the session
 * survives app restarts. `initializeAuth` throws if auth was already created,
 * so fall back to the existing instance during hot reloads.
 */
export const auth = (() => {
  try {
    return initializeAuth(app, { persistence: indexedDBLocalPersistence });
  } catch {
    return getAuth(app);
  }
})();

export const db = getFirestore(app);

// Offline profile reads when the phone has no signal.
enableIndexedDbPersistence(db).catch(() => {
  /* multi-tab or unsupported — online-only is fine */
});

export type Profile = {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  dob?: string;
  createdAt?: unknown;
};

export async function signUp(email: string, password: string, name: string, extra: { phone?: string; dob?: string }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  await setDoc(doc(db, "users", cred.user.uid), {
    uid: cred.user.uid,
    name,
    email,
    phone: extra.phone ?? "",
    dob: extra.dob ?? "",
    createdAt: serverTimestamp(),
  });
  return cred.user;
}

export async function signIn(email: string, password: string) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export const signOut = () => fbSignOut(auth);
export const resetPassword = (email: string) => sendPasswordResetEmail(auth, email);
export const watchAuth = (cb: (u: User | null) => void) => onAuthStateChanged(auth, cb);

export async function loadProfile(uid: string): Promise<Profile | null> {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? (snap.data() as Profile) : null;
  } catch {
    return null;
  }
}

/** Mirrors user settings to Firestore so they follow the account across devices. */
export async function saveSettings(uid: string, settings: Record<string, unknown>) {
  try {
    await setDoc(doc(db, "users", uid), { settings }, { merge: true });
  } catch {
    /* offline — local Preferences remain the source of truth */
  }
}

/** Turns Firebase's error codes into something a person can actually read. */
export function authErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/invalid-email":
      return "That email address doesn't look right.";
    case "auth/missing-password":
      return "Please enter your password.";
    case "auth/weak-password":
      return "Please use a password of at least 6 characters.";
    case "auth/email-already-in-use":
      return "That email already has an account. Try signing in instead.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email or password is incorrect.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/network-request-failed":
      return "No internet connection. Check your signal and try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}

/* ---------------- Google sign-in ---------------- */

/**
 * Resolved at runtime rather than imported, deliberately.
 *
 * @capacitor-firebase/authentication builds a FirebaseAuth instance inside its
 * plugin `load()`, which runs at app startup — and FirebaseAuth.getInstance()
 * throws "Default FirebaseApp is not initialized" when google-services.json is
 * absent, killing the process before the first screen. Going through
 * registerPlugin means the app carries no dependency on the native plugin: if
 * it isn't installed the call simply rejects, and once it is, this works
 * unchanged. See README for turning Google sign-in on.
 */
type GoogleAuthPlugin = {
  signInWithGoogle(): Promise<{ credential?: { idToken?: string; accessToken?: string } }>;
};

const googleAuthPlugin = () => registerPlugin<GoogleAuthPlugin>("FirebaseAuthentication");

/**
 * Google sign-in: the native account picker on Android, a popup on the web,
 * with the resulting credential handed to the JS SDK so the rest of the app
 * sees one consistent `auth.currentUser`.
 *
 * Android additionally needs `android/app/google-services.json` and the signing
 * certificate's SHA-1 registered in the Firebase console.
 */
export async function signInWithGoogle(): Promise<User> {
  const { GoogleAuthProvider, signInWithCredential, signInWithPopup } = await import("firebase/auth");

  if (!Capacitor.isNativePlatform()) {
    const cred = await signInWithPopup(auth, new GoogleAuthProvider());
    await ensureProfile(cred.user);
    return cred.user;
  }

  const result = await googleAuthPlugin().signInWithGoogle();
  const idToken = result.credential?.idToken;
  if (!idToken) throw new Error("google-no-token");

  const credential = GoogleAuthProvider.credential(idToken, result.credential?.accessToken);
  const cred = await signInWithCredential(auth, credential);
  await ensureProfile(cred.user);
  return cred.user;
}

/** Creates the Firestore profile the first time someone signs in with Google. */
async function ensureProfile(user: User) {
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) return;
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      name: user.displayName ?? "",
      email: user.email ?? "",
      photo: user.photoURL ?? "",
      createdAt: serverTimestamp(),
    });
  } catch {
    /* offline — the profile is created on the next successful write */
  }
}

/**
 * True when Google sign-in can actually complete on this device. On Android
 * that means the Firebase Android config was bundled at build time.
 */
export async function googleSignInAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  return GOOGLE_CONFIGURED;
}

/**
 * Set by the build: Vite replaces this with true only when
 * android/app/google-services.json was present when the bundle was built.
 */
const GOOGLE_CONFIGURED: boolean =
  (import.meta as unknown as { env: Record<string, string> }).env?.VITE_GOOGLE_SIGNIN === "true";

export function googleErrorMessage(e: unknown): string {
  const msg = (e as Error)?.message ?? "";
  if (/no-token/.test(msg)) return "Google didn't return a sign-in token. Please try again.";
  if (/12501|canceled|cancelled|closed/i.test(msg)) return "";  // user backed out; say nothing
  if (/10:|DEVELOPER_ERROR/i.test(msg))
    return "Google sign-in isn't set up for this build yet. Use email and password for now.";
  if (/network/i.test(msg)) return "No internet connection. Check your signal and try again.";
  return "Google sign-in didn't work. You can use email and password instead.";
}
