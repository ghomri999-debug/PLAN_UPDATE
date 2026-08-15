/**
 * Baladna Algeria - 2D Multi-Plan State Manager with RBAC & 9 Hangars/Plans Support
 * Manages independent progress data for:
 * - Production Building (MF1)
 * - 4 Breeding Barns (BA4-1, BA4-2, BA4-3, BA4-4)
 * - 4 Bred Barns (BA5-1, BA5-2, BA5-3, BA5-4)
 */

class MultiPlanStateManager {
    constructor() {
        this.STORAGE_PREFIX = 'BALADNA_2D_PLAN_PROGRESS_ENG_V2_';
        this.multiData = window.BALADNA_MULTI_PLAN_DATA || { categories: [], plans: [] };
        this.activePlanId = this.multiData.plans.length > 0 ? this.multiData.plans[0].id : null;
        this.activeCategory = this.multiData.plans.length > 0 ? this.multiData.plans[0].category : 'PRODUCTION';
        this.plansState = new Map();
        this.listeners = [];
        this.firestoreUnsubscribers = [];

        this.init();
    }

    init() {
        this.multiData.plans.forEach(plan => {
            const rawFootings = JSON.parse(JSON.stringify(plan.footings || []));
            const saved = localStorage.getItem(this.STORAGE_PREFIX + plan.id);
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    const map = new Map(parsed.map(f => [f.id, f]));
                    const merged = rawFootings.map(f => {
                        const s = map.get(f.id);
                        if (s) {
                            return {
                                ...f,
                                blinding: { ...f.blinding, ...s.blinding },
                                footing: { ...f.footing, ...s.footing },
                                notes: s.notes !== undefined ? s.notes : f.notes
                            };
                        }
                        return f;
                    });
                    this.plansState.set(plan.id, merged);
                } catch (e) {
                    console.error("Error reading storage for plan " + plan.id, e);
                    this.plansState.set(plan.id, rawFootings);
                }
            } else {
                this.plansState.set(plan.id, rawFootings);
                this.savePlanStorage(plan.id);
            }
        });

        // Initialize Firestore Realtime Sync
        this.initFirestoreSync();
    }

    initFirestoreSync() {
        if (window.isFirebaseConfigured() && window.firebaseDb) {
            try {
                this.multiData.plans.forEach(plan => {
                    const unsub = window.firebaseDb.collection('plans').doc(plan.id).collection('footings')
                        .onSnapshot((snapshot) => {
                            if (snapshot.empty) return;
                            const footings = this.plansState.get(plan.id) || [];
                            const map = new Map(footings.map(f => [f.id, f]));
                            let changed = false;

                            snapshot.docChanges().forEach(change => {
                                const data = change.doc.data();
                                const f = map.get(change.doc.id);
                                if (f) {
                                    if (data.blinding) f.blinding = { ...f.blinding, ...data.blinding };
                                    if (data.footing) f.footing = { ...f.footing, ...data.footing };
                                    if (data.notes !== undefined) f.notes = data.notes;
                                    changed = true;
                                }
                            });

                            if (changed) {
                                this.savePlanStorage(plan.id, false);
                                this.notify();
                            }
                        }, (err) => {
                            console.warn("Firestore sync warning for " + plan.id, err);
                        });
                    this.firestoreUnsubscribers.push(unsub);
                });
            } catch (e) {
                console.warn("Could not attach Firestore listeners:", e);
            }
        }
    }

    canUserEdit() {
        return window.authManager && window.authManager.canEdit();
    }

    savePlanStorage(planId, syncToFirestore = true) {
        const footings = this.plansState.get(planId) || [];
        const toSave = footings.map(f => ({
            id: f.id,
            blinding: f.blinding,
            footing: f.footing,
            notes: f.notes
        }));
        try {
            localStorage.setItem(this.STORAGE_PREFIX + planId, JSON.stringify(toSave));
            this.notify();
        } catch (e) {
            console.error("Error saving plan " + planId, e);
        }

        // Push to Firestore if admin and configured
        if (syncToFirestore && this.canUserEdit() && window.isFirebaseConfigured() && window.firebaseDb) {
            try {
                const batch = window.firebaseDb.batch();
                toSave.forEach(f => {
                    const docRef = window.firebaseDb.collection('plans').doc(planId).collection('footings').doc(f.id);
                    batch.set(docRef, {
                        blinding: f.blinding,
                        footing: f.footing,
                        notes: f.notes,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        updatedBy: window.authManager.currentUser.email
                    }, { merge: true });
                });
                batch.commit().catch(e => console.warn("Firestore batch commit warning:", e));
            } catch (e) {
                console.warn("Firestore sync write error:", e);
            }
        }
    }

    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    notify() {
        this.listeners.forEach(fn => fn(this));
    }

    getCategories() {
        return this.multiData.categories || [];
    }

    getPlansList(category = null) {
        if (category) {
            return this.multiData.plans.filter(p => p.category === category);
        }
        return this.multiData.plans;
    }

    getActivePlan() {
        return this.multiData.plans.find(p => p.id === this.activePlanId) || this.multiData.plans[0];
    }

    setCategory(categoryId) {
        this.activeCategory = categoryId;
        const plansInCategory = this.getPlansList(categoryId);
        if (plansInCategory.length > 0) {
            // Check if current activePlan is in this category
            const currentInCat = plansInCategory.find(p => p.id === this.activePlanId);
            if (!currentInCat) {
                this.setActivePlan(plansInCategory[0].id);
            } else {
                this.notify();
            }
        }
    }

    setActivePlan(planId) {
        const targetPlan = this.multiData.plans.find(p => p.id === planId);
        if (targetPlan) {
            this.activePlanId = planId;
            this.activeCategory = targetPlan.category;
            this.notify();
        }
    }

    getFootings(planId = null) {
        const targetId = planId || this.activePlanId;
        return this.plansState.get(targetId) || [];
    }

    getFootingById(id, planId = null) {
        const footings = this.getFootings(planId);
        return footings.find(f => f.id === id);
    }

    updateBlindingStatus(id, status, date = null, rfi = null, planId = null) {
        if (!this.canUserEdit()) {
            return false;
        }
        const targetId = planId || this.activePlanId;
        const footing = this.getFootingById(id, targetId);
        if (footing) {
            footing.blinding.status = status;
            if (date !== null) footing.blinding.date = date;
            if (rfi !== null) footing.blinding.rfi = rfi;
            this.savePlanStorage(targetId);
            return true;
        }
        return false;
    }

    updateFootingStatus(id, status, date = null, rfi = null, planId = null) {
        if (!this.canUserEdit()) {
            return false;
        }
        const targetId = planId || this.activePlanId;
        const footing = this.getFootingById(id, targetId);
        if (footing) {
            footing.footing.status = status;
            if (date !== null) footing.footing.date = date;
            if (rfi !== null) footing.footing.rfi = rfi;
            this.savePlanStorage(targetId);
            return true;
        }
        return false;
    }

    updateFootingNotes(id, notes, planId = null) {
        if (!this.canUserEdit()) {
            return false;
        }
        const targetId = planId || this.activePlanId;
        const footing = this.getFootingById(id, targetId);
        if (footing) {
            footing.notes = notes;
            this.savePlanStorage(targetId);
            return true;
        }
        return false;
    }

    batchUpdateByPart(partId, target, status, date = '', planId = null) {
        if (!this.canUserEdit()) {
            return 0;
        }
        const targetId = planId || this.activePlanId;
        const footings = this.getFootings(targetId);
        const today = date || new Date().toISOString().split('T')[0];
        let count = 0;

        footings.forEach(f => {
            if (f.part === partId || partId === 'all') {
                if (target === 'blinding' || target === 'both') {
                    f.blinding.status = status;
                    if (status !== 'en_attente' && !f.blinding.date) f.blinding.date = today;
                }
                if (target === 'footing' || target === 'both') {
                    f.footing.status = status;
                    if (status !== 'en_attente' && !f.footing.date) f.footing.date = today;
                }
                count++;
            }
        });
        this.savePlanStorage(targetId);
        return count;
    }

    batchUpdateByAxis(axisType, axisLabel, target, status, date = '', planId = null) {
        if (!this.canUserEdit()) {
            return 0;
        }
        const targetId = planId || this.activePlanId;
        const footings = this.getFootings(targetId);
        const today = date || new Date().toISOString().split('T')[0];
        let count = 0;

        footings.forEach(f => {
            const matches = (axisType === 'X' && f.axisX === axisLabel) || (axisType === 'Y' && f.axisY === axisLabel);
            if (matches) {
                if (target === 'blinding' || target === 'both') {
                    f.blinding.status = status;
                    if (status !== 'en_attente' && !f.blinding.date) f.blinding.date = today;
                }
                if (target === 'footing' || target === 'both') {
                    f.footing.status = status;
                    if (status !== 'en_attente' && !f.footing.date) f.footing.date = today;
                }
                count++;
            }
        });
        this.savePlanStorage(targetId);
        return count;
    }

    resetActivePlan() {
        if (!this.canUserEdit()) {
            return false;
        }
        const activePlan = this.getActivePlan();
        localStorage.removeItem(this.STORAGE_PREFIX + activePlan.id);
        const raw = JSON.parse(JSON.stringify(activePlan.footings || []));
        this.plansState.set(activePlan.id, raw);
        this.savePlanStorage(activePlan.id);
        return true;
    }

    getStatistics(planId = null) {
        const targetId = planId || this.activePlanId;
        const plan = this.multiData.plans.find(p => p.id === targetId) || this.getActivePlan();
        const footings = this.getFootings(targetId);
        const total = footings.length;
        if (total === 0) return null;

        let bPending = 0, bPoured = 0, bAccepted = 0;
        let bVolTotal = 0, bVolPoured = 0, bVolAccepted = 0;

        let fPending = 0, fPoured = 0, fAccepted = 0;
        let fVolTotal = 0, fVolPoured = 0, fVolAccepted = 0;

        const partStats = {};
        (plan.partZones || []).forEach(p => {
            partStats[p.id] = {
                id: p.id,
                name: p.name,
                color: p.color,
                total: 0,
                bAccepted: 0,
                bPoured: 0,
                bPending: 0,
                fAccepted: 0,
                fPoured: 0,
                fPending: 0,
                fVolPoured: 0,
                fVolTotal: 0
            };
        });

        footings.forEach(f => {
            const bVol = (f.blinding && f.blinding.volM3) || 0;
            const fVol = f.volM3 || 0;

            bVolTotal += bVol;
            fVolTotal += fVol;

            // Blinding
            if (f.blinding.status === 'receptionne') {
                bAccepted++;
                bPoured++;
                bVolAccepted += bVol;
                bVolPoured += bVol;
            } else if (f.blinding.status === 'coule') {
                bPoured++;
                bVolPoured += bVol;
            } else {
                bPending++;
            }

            // Footing
            if (f.footing.status === 'receptionne') {
                fAccepted++;
                fPoured++;
                fVolAccepted += fVol;
                fVolPoured += fVol;
            } else if (f.footing.status === 'coule') {
                fPoured++;
                fVolPoured += fVol;
            } else {
                fPending++;
            }

            // Part
            const pStat = partStats[f.part];
            if (pStat) {
                pStat.total++;
                pStat.fVolTotal += fVol;
                if (f.blinding.status === 'receptionne') pStat.bAccepted++;
                if (f.blinding.status === 'coule' || f.blinding.status === 'receptionne') pStat.bPoured++;
                if (f.blinding.status === 'en_attente') pStat.bPending++;

                if (f.footing.status === 'receptionne') {
                    pStat.fAccepted++;
                    pStat.fPoured++;
                    pStat.fVolPoured += fVol;
                } else if (f.footing.status === 'coule') {
                    pStat.fPoured++;
                    pStat.fVolPoured += fVol;
                } else {
                    pStat.fPending++;
                }
            }
        });

        return {
            planId: plan.id,
            planTitle: plan.title,
            drawingNo: plan.drawingNo,
            category: plan.category,
            hangar: plan.hangar,
            totalFootings: total,
            blinding: {
                total,
                pending: bPending,
                poured: bPoured,
                accepted: bAccepted,
                pctPoured: Math.round((bPoured / total) * 100),
                pctAccepted: Math.round((bAccepted / total) * 100),
                volTotal: Math.round(bVolTotal * 10) / 10,
                volPoured: Math.round(bVolPoured * 10) / 10,
                volAccepted: Math.round(bVolAccepted * 10) / 10
            },
            footing: {
                total,
                pending: fPending,
                poured: fPoured,
                accepted: fAccepted,
                pctPoured: Math.round((fPoured / total) * 100),
                pctAccepted: Math.round((fAccepted / total) * 100),
                volTotal: Math.round(fVolTotal * 10) / 10,
                volPoured: Math.round(fVolPoured * 10) / 10,
                volAccepted: Math.round(fVolAccepted * 10) / 10
            },
            parts: Object.values(partStats)
        };
    }

    exportActivePlanCSV() {
        const plan = this.getActivePlan();
        const footings = this.getFootings();
        const headers = [
            "Plan Name", "Drawing No", "Hangar", "Footing ID", "Grid Tag", "Grid Axis X", "Grid Axis Y", "PART Zone",
            "Type", "Dim X (m)", "Dim Y (m)", "Depth Z (m)", "Concrete Vol (m3)",
            "Blinding Status", "Blinding Pour Date", "Blinding RFI",
            "Footing Status", "Footing Pour Date", "Footing RFI", "Notes"
        ];

        const rows = footings.map(f => [
            `"${plan.shortName}"`,
            `"${plan.drawingNo}"`,
            plan.hangar,
            f.id,
            `"${f.tag}"`,
            f.axisX,
            f.axisY,
            f.part,
            `"${f.type || 'Standard Footing'}"`,
            f.dimX,
            f.dimY,
            f.dimZ,
            f.volM3,
            f.blinding.status === 'receptionne' ? 'Accepted' : (f.blinding.status === 'coule' ? 'Poured' : 'Pending'),
            f.blinding.date || '',
            f.blinding.rfi || '',
            f.footing.status === 'receptionne' ? 'Accepted' : (f.footing.status === 'coule' ? 'Poured' : 'Pending'),
            f.footing.date || '',
            f.footing.rfi || '',
            `"${(f.notes || '').replace(/"/g, '""')}"`
        ]);

        const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Baladna_${plan.id}_Foundation_Tracking_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
    }

    exportJSON() {
        const activePlan = this.getActivePlan();
        const exportData = {
            plan: activePlan,
            exportDate: new Date().toISOString(),
            statistics: this.getStatistics(),
            footings: this.getFootings()
        };
        const jsonStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", jsonStr);
        downloadAnchor.setAttribute("download", `Baladna_${activePlan.id}_Tracking_${new Date().toISOString().slice(0,10)}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    }

    importJSON(jsonString) {
        if (!this.canUserEdit()) {
            return { success: false, message: "Permission Denied: Viewer accounts cannot import or modify data." };
        }
        try {
            const data = JSON.parse(jsonString);
            if (data.footings && Array.isArray(data.footings)) {
                const targetId = (data.plan && data.plan.id) || this.activePlanId;
                const current = this.getFootings(targetId);
                const map = new Map(data.footings.map(f => [f.id, f]));
                current.forEach(f => {
                    const imported = map.get(f.id);
                    if (imported) {
                        f.blinding = { ...f.blinding, ...imported.blinding };
                        f.footing = { ...f.footing, ...imported.footing };
                        if (imported.notes !== undefined) f.notes = imported.notes;
                    }
                });
                this.savePlanStorage(targetId);
                return { success: true, count: data.footings.length };
            }
            return { success: false, message: "Invalid JSON format." };
        } catch (e) {
            return { success: false, message: e.message };
        }
    }
}

window.stateManager = new MultiPlanStateManager();
