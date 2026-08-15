/**
 * Authentication & Role-Based Access Control (RBAC) Module
 * Supports both Firebase Authentication & Local Fallback for:
 * - Admin: admin@gcb.dz / admin123 (Full edit, batch update, reset)
 * - Viewer: viewer@gcb.dz / 12345678 (Read-only, inspect, export, filter)
 */

class AuthManager {
    constructor() {
        this.STORAGE_KEY = 'BALADNA_AUTH_USER_V1';
        this.currentUser = null;
        this.listeners = [];

        // Predefined fallback credentials
        this.LOCAL_ACCOUNTS = {
            'admin@gcb.dz': {
                password: 'admin123',
                role: 'admin',
                name: 'GCB Administrator'
            },
            'viewer@gcb.dz': {
                password: '12345678',
                role: 'viewer',
                name: 'GCB Site Viewer'
            }
        };

        this.init();
    }

    init() {
        // Try initializing Firebase
        if (window.initFirebaseServices && window.initFirebaseServices()) {
            window.firebaseAuth.onAuthStateChanged(async (user) => {
                if (user) {
                    let role = 'viewer';
                    // Determine role from email or Firestore
                    if (user.email === 'admin@gcb.dz' || user.email.startsWith('admin')) {
                        role = 'admin';
                    }

                    if (window.firebaseDb) {
                        try {
                            const userDoc = await window.firebaseDb.collection('users').doc(user.uid).get();
                            if (userDoc.exists && userDoc.data().role) {
                                role = userDoc.data().role;
                            }
                        } catch (e) {
                            console.warn("Could not fetch user role from Firestore:", e);
                        }
                    }

                    this.setCurrentUser({
                        email: user.email,
                        uid: user.uid,
                        role: role,
                        name: user.displayName || (role === 'admin' ? 'GCB Administrator' : 'GCB Site Viewer'),
                        provider: 'firebase'
                    });
                } else {
                    this.setCurrentUser(null);
                }
            });
        } else {
            // Restore local session if any
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (saved) {
                try {
                    this.currentUser = JSON.parse(saved);
                } catch (e) {
                    this.currentUser = null;
                }
            }
        }
    }

    subscribe(listener) {
        this.listeners.push(listener);
        listener(this.currentUser);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    notify() {
        this.listeners.forEach(fn => fn(this.currentUser));
        window.dispatchEvent(new CustomEvent('auth-state-changed', { detail: this.currentUser }));
    }

    setCurrentUser(user) {
        this.currentUser = user;
        if (user) {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(user));
        } else {
            localStorage.removeItem(this.STORAGE_KEY);
        }
        this.notify();
    }

    async login(email, password) {
        const cleanEmail = (email || '').trim().toLowerCase();

        // 1. Try Firebase Auth if configured
        if (window.isFirebaseConfigured() && window.firebaseAuth) {
            try {
                const userCredential = await window.firebaseAuth.signInWithEmailAndPassword(cleanEmail, password);
                const user = userCredential.user;
                const role = cleanEmail === 'admin@gcb.dz' ? 'admin' : 'viewer';
                
                this.setCurrentUser({
                    email: user.email,
                    uid: user.uid,
                    role: role,
                    name: role === 'admin' ? 'GCB Administrator' : 'GCB Site Viewer',
                    provider: 'firebase'
                });

                return { success: true, user: this.currentUser };
            } catch (err) {
                // If Firebase auth fails with wrong password / user-not-found, check local fallback
                console.warn("Firebase sign-in failed, checking fallback:", err.message);
                if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                    return { success: false, message: "Invalid password for Firebase account." };
                }
            }
        }

        // 2. Local Fallback Verification
        const account = this.LOCAL_ACCOUNTS[cleanEmail];
        if (account && account.password === password) {
            this.setCurrentUser({
                email: cleanEmail,
                uid: 'local_' + cleanEmail.replace(/[^a-zA-Z0-9]/g, '_'),
                role: account.role,
                name: account.name,
                provider: 'local'
            });
            return { success: true, user: this.currentUser };
        }

        return { success: false, message: "Invalid email or password. Check credentials or Firebase settings." };
    }

    async logout() {
        if (window.firebaseAuth && this.currentUser && this.currentUser.provider === 'firebase') {
            try {
                await window.firebaseAuth.signOut();
            } catch (e) {
                console.error("Firebase logout error:", e);
            }
        }
        this.setCurrentUser(null);
    }

    isAuthenticated() {
        return this.currentUser !== null;
    }

    isAdmin() {
        return this.currentUser && this.currentUser.role === 'admin';
    }

    isViewer() {
        return this.currentUser && this.currentUser.role === 'viewer';
    }

    canEdit() {
        return this.isAdmin();
    }
}

window.authManager = new AuthManager();
