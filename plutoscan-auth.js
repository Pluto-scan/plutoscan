// ============================================================
//  PlutoScan — shared auth + paywall helper
//  Loaded on both index.html and plutoscan-modules.html
// ============================================================
(function () {
  'use strict';

  // ---- Fill these in with your real values ----
  const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyAUbjf2Pn96-fGU9NP_aLOd03EsDfKfYPg',
    authDomain: 'plutoscan.firebaseapp.com',
    databaseURL: 'https://plutoscan-default-rtdb.firebaseio.com',
    projectId: 'plutoscan',
    storageBucket: 'plutoscan.firebasestorage.app',
    messagingSenderId: '692198234321',
    appId: '1:692198234321:web:239fcd304a4d54d7648df0',
  };

  const STRIPE_PUBLISHABLE_KEY = 'pk_test_51U876I2NLt1490L4WUgP66ePlQLB8ViNnvMG5wySqlBnqJzWEKMDJgBs5dNV7E5FsfAOwik4L7K2WKJTszshsxRE00Ax6t295c';

  // Update REGION if your functions deploy somewhere other than us-central1.
  const REGION = 'us-central1';
  const PROJECT_ID = 'plutoscan';
  const FUNCTIONS_BASE = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net`;

  // Security log (auditPlutoReport, in the usage repo's plutoscan-audit/): failed sign-ins,
  // the course turning someone away, checkout steps and page visits. Firebase runs no server
  // code for these, so the page reports them. Never throws and never holds up the page.
  const AUDIT_URL = FUNCTIONS_BASE + '/auditPlutoReport';

  firebase.initializeApp(FIREBASE_CONFIG);
  const auth = firebase.auth();
  const db = firebase.database();

  let currentUser = null;
  let readyCallbacks = [];
  let authResolved = false;

  auth.onAuthStateChanged(function (user) {
    currentUser = user;
    authResolved = true;
    readyCallbacks.forEach(function (cb) { cb(user); });
    readyCallbacks = [];
  });

  function onReady(callback) {
    if (authResolved) {
      callback(currentUser);
    } else {
      readyCallbacks.push(callback);
    }
  }

  async function signUp(email, password) {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    return cred.user;
  }

  async function logIn(email, password) {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    return cred.user;
  }

  // Opens Google's account picker via popup and signs the user in.
  // Works for both first-time users (creates the account) and
  // returning users (logs them in) - Firebase handles that distinction.
  async function signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    const cred = await auth.signInWithPopup(provider);
    return cred.user;
  }

  async function logOut() {
    await auth.signOut();
  }

  // Emails the user a Firebase-hosted link to choose a new password.
  async function sendPasswordReset(email) {
    await auth.sendPasswordResetEmail(email);
  }

  // Reads this user's own paid flag directly from the database.
  // Convenient for UI decisions (e.g. "Go to course" vs "Buy now"),
  // but NOT the real security boundary - the Cloud Functions re-check
  // this server-side before ever handing out real content.
  async function isPaid() {
    if (!currentUser) return false;
    const snap = await db.ref('users/' + currentUser.uid + '/paid').once('value');
    return snap.exists() && snap.val() === true;
  }

  // Saves this user's module/quiz progress to the database, keyed by uid,
  // so it follows them across devices and logins instead of living only
  // in localStorage. `data` should be the same shape as state.modules on
  // the modules page (an object keyed by module id).
  async function saveProgress(data) {
    if (!currentUser) return;
    await db.ref('users/' + currentUser.uid + '/progress').set(data);
  }

  // Reads this user's saved progress back. Returns null if nothing has
  // been saved yet, or if no one is logged in.
  async function loadProgress() {
    if (!currentUser) return null;
    const snap = await db.ref('users/' + currentUser.uid + '/progress').once('value');
    return snap.exists() ? snap.val() : null;
  }

  // Saves the end-of-course rating/review under this user's record so real
  // reviews can be collected (requires the users/$uid/review write rule).
  async function saveReview(review) {
    if (!currentUser) return;
    await db.ref('users/' + currentUser.uid + '/review').set(review);
  }

  // Starts a Stripe Checkout session and redirects the browser there.
  async function startCheckout() {
    if (!currentUser) throw new Error('Must be logged in first');
    const token = await currentUser.getIdToken();
    const res = await fetch(FUNCTIONS_BASE + '/createCheckoutSession', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
      },
    });
    if (!res.ok) throw new Error('Could not start checkout');
    const data = await res.json();
    window.location.href = data.url;
  }

  // Fetches protected module content. Returns:
  //   - the content object { modules, moduleParts } if allowed
  //   - 'unauthorized' if not logged in / token invalid
  //   - 'payment_required' if logged in but not paid
  //   - null on unexpected error
  async function fetchModuleContent() {
    if (!currentUser) return 'unauthorized';
    try {
      const token = await currentUser.getIdToken();
      const res = await fetch(FUNCTIONS_BASE + '/getModuleContent', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + token },
      });
      if (res.status === 401) return 'unauthorized';
      if (res.status === 403) return 'payment_required';
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.error('fetchModuleContent error', err);
      return null;
    }
  }

  // kind: 'failed' | 'denied' | 'checkout' | 'visit'. details: { email, code, action, method,
  // reason, step, referrer }. Signed-in reports carry the ID token so the server knows who it was.
  async function report(kind, details) {
    try {
      const body = Object.assign({ kind: kind, at: Date.now(), page: window.location.pathname }, details || {});
      if (currentUser) {
        try { body.idToken = await currentUser.getIdToken(); } catch (e) { /* sent without it */ }
      }
      const text = JSON.stringify(body);
      // sendBeacon survives the page navigating away (to Stripe, or a redirect).
      if (navigator.sendBeacon && navigator.sendBeacon(AUDIT_URL, new Blob([text], { type: 'text/plain' }))) return;
      fetch(AUDIT_URL, { method: 'POST', body: text, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(function () {});
    } catch (e) {
      // Reporting must never break the page.
    }
  }

  window.plutoscanAuth = {
    onReady,
    signUp,
    logIn,
    signInWithGoogle,
    logOut,
    sendPasswordReset,
    isPaid,
    saveProgress,
    loadProgress,
    saveReview,
    startCheckout,
    fetchModuleContent,
    report,
    getCurrentUser: function () { return currentUser; },
    STRIPE_PUBLISHABLE_KEY,
  };
})();
