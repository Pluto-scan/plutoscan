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

  async function logOut() {
    await auth.signOut();
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

  window.plutoscanAuth = {
    onReady,
    signUp,
    logIn,
    logOut,
    isPaid,
    startCheckout,
    getCurrentUser: function () { return currentUser; },
    STRIPE_PUBLISHABLE_KEY,
  };
})();
