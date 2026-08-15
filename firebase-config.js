/**
 * Baladna Algeria - Firebase Configuration & Realtime Sync Module
 * Project: plan-baladna
 */

window.FIREBASE_CONFIG = {
    apiKey: "AIzaSyB3XLabKyenkIZyrnQb3eRJBOMddgMWQJE",
    authDomain: "plan-baladna.firebaseapp.com",
    projectId: "plan-baladna",
    storageBucket: "plan-baladna.firebasestorage.app",
    messagingSenderId: "338222402321",
    appId: "1:338222402321:web:904690ac05c4fd0b1f5ab0",
    measurementId: "G-K6G72CG5QV"
};

// Check if Firebase credentials are real
window.isFirebaseConfigured = function() {
    return window.FIREBASE_CONFIG && 
           window.FIREBASE_CONFIG.apiKey && 
           window.FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY" &&
           window.FIREBASE_CONFIG.projectId !== "YOUR_PROJECT_ID";
};

// Initialize Firebase if configured
window.initFirebaseServices = function() {
    if (window.isFirebaseConfigured() && typeof firebase !== 'undefined') {
        try {
            if (!firebase.apps.length) {
                firebase.initializeApp(window.FIREBASE_CONFIG);
            }
            window.firebaseAuth = firebase.auth();
            window.firebaseDb = firebase.firestore();
            console.log("🔥 Firebase connected successfully to project:", window.FIREBASE_CONFIG.projectId);
            return true;
        } catch (e) {
            console.warn("Firebase initialization error:", e);
            return false;
        }
    }
    return false;
};
