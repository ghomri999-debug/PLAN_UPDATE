/**
 * 2D Multi-Plan Application Controller with 4-Hangar Scrolling & RBAC (English)
 * Site Plan Carousel with BA4-1..4 and BA5-1..4 scrollable hangars reel.
 */

document.addEventListener('DOMContentLoaded', () => {
    const stateManager = window.stateManager;
    const authManager = window.authManager;
    const viewer = new window.InteractiveCAD2DViewer('cad-canvas');

    let currentSelectedFootingId = null;

    initApp();

    function initApp() {
        renderCategorySelector();
        renderHangarCarousel();
        updateHeaderInfo();
        updateKPIDashboard();
        populatePartSelects();
        populateAxisSelects();
        setupEventListeners();
        setupAuthListeners();

        // Subscribe to state updates
        stateManager.subscribe(() => {
            renderCategorySelector();
            renderHangarCarousel();
            updateHeaderInfo();
            updateKPIDashboard();
            populatePartSelects();
            populateAxisSelects();
            if (currentSelectedFootingId) {
                renderInspector(currentSelectedFootingId);
            }
        });

        // Subscribe to auth state
        authManager.subscribe((user) => {
            updateAuthUI(user);
        });
    }

    // 1. Category & 4-Hangar Scrollable Selector
    function renderCategorySelector() {
        const catContainer = document.getElementById('category-tabs-container');
        if (!catContainer) return;

        const categories = stateManager.getCategories();
        const activeCat = stateManager.activeCategory;

        catContainer.innerHTML = categories.map(cat => {
            const isActive = cat.id === activeCat;
            return `
                <button class="category-pill ${isActive ? 'active' : ''}" onclick="window.switchCategory('${cat.id}')">
                    <span class="cat-icon">${cat.icon}</span>
                    <span class="cat-title">${cat.title}</span>
                    <span class="cat-count">${cat.count} ${cat.count > 1 ? 'Hangars' : 'Plan'}</span>
                </button>
            `;
        }).join('');
    }

    function renderHangarCarousel() {
        const carousel = document.getElementById('plan-carousel');
        if (!carousel) return;

        const plans = stateManager.getPlansList(stateManager.activeCategory);
        carousel.innerHTML = plans.map(p => {
            const isActive = p.id === stateManager.activePlanId;
            const stats = stateManager.getStatistics(p.id);
            const pct = stats ? stats.footing.pctAccepted : 0;
            return `
                <div class="plan-card hangar-card ${isActive ? 'active' : ''}" data-plan-id="${p.id}" onclick="window.switchPlan('${p.id}')">
                    <div class="plan-thumb">
                        <img src="${p.thumbnail}" alt="${p.shortName}" onerror="this.style.display='none'">
                        <span class="plan-badge-scale">${p.scale}</span>
                    </div>
                    <div class="plan-info">
                        <div class="plan-title">${p.shortName}</div>
                        <div class="plan-dwg">${p.drawingNo}</div>
                        <div class="plan-meta">
                            <span class="plan-dim">${p.totalLength}m × ${p.totalWidth}m</span>
                            <span class="plan-progress-pill">${pct}% Accepted</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    window.switchCategory = (categoryId) => {
        stateManager.setCategory(categoryId);
        currentSelectedFootingId = null;
        viewer.selectedFooting = null;
        viewer.hoveredFooting = null;
        viewer.fitToScreen();
    };

    window.switchPlan = (planId) => {
        if (stateManager.activePlanId !== planId) {
            stateManager.setActivePlan(planId);
            currentSelectedFootingId = null;
            viewer.selectedFooting = null;
            viewer.hoveredFooting = null;
            viewer.fitToScreen();
            showToast(`Loaded: ${stateManager.getActivePlan().title}`);
        }
    };

    // 2. Auth & RBAC Handling
    function setupAuthListeners() {
        const loginModal = document.getElementById('login-modal');
        const loginForm = document.getElementById('login-form');
        const loginError = document.getElementById('login-error');
        const btnLogout = document.getElementById('btn-logout');
        const btnQuickViewer = document.getElementById('btn-quick-viewer');

        if (btnQuickViewer) {
            btnQuickViewer.addEventListener('click', () => {
                document.getElementById('login-email').value = 'viewer@gcb.dz';
                document.getElementById('login-password').value = '12345678';
                loginForm.dispatchEvent(new Event('submit'));
            });
        }

        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                loginError.style.display = 'none';
                const email = document.getElementById('login-email').value;
                const password = document.getElementById('login-password').value;

                const submitBtn = document.getElementById('btn-login-submit');
                submitBtn.textContent = 'Signing in...';
                submitBtn.disabled = true;

                const res = await authManager.login(email, password);
                submitBtn.textContent = 'Sign In to Platform';
                submitBtn.disabled = false;

                if (res.success) {
                    showToast(`Welcome ${res.user.name} (${res.user.role.toUpperCase()})`);
                } else {
                    loginError.textContent = res.message;
                    loginError.style.display = 'block';
                }
            });
        }

        if (btnLogout) {
            btnLogout.addEventListener('click', async () => {
                await authManager.logout();
                showToast('Signed out successfully');
            });
        }
    }

    function updateAuthUI(user) {
        const modal = document.getElementById('login-modal');
        const userBadge = document.getElementById('user-profile-badge');
        const userEmail = document.getElementById('user-email-text');
        const userRoleTag = document.getElementById('user-role-tag');

        if (user) {
            modal.style.display = 'none';
            userBadge.style.display = 'flex';
            userEmail.textContent = user.email;
            userRoleTag.textContent = user.role.toUpperCase();
            userRoleTag.className = `role-tag role-${user.role}`;

            const isAdmin = user.role === 'admin';
            const importBtn = document.getElementById('btn-import-json');
            if (importBtn) {
                importBtn.style.opacity = isAdmin ? '1' : '0.5';
                importBtn.title = isAdmin ? 'Import JSON tracking file' : 'Import restricted to Admin';
            }

            if (currentSelectedFootingId) {
                renderInspector(currentSelectedFootingId);
            }
        } else {
            modal.style.display = 'flex';
            userBadge.style.display = 'none';
        }
    }

    // 3. Setup General Events
    function setupEventListeners() {
        // Zoom & Fit Controls
        document.getElementById('btn-zoom-fit').addEventListener('click', () => viewer.fitToScreen());
        document.getElementById('btn-zoom-in').addEventListener('click', () => {
            viewer.scale = Math.min(100, viewer.scale * 1.25);
            viewer.render();
        });
        document.getElementById('btn-zoom-out').addEventListener('click', () => {
            viewer.scale = Math.max(1, viewer.scale * 0.8);
            viewer.render();
        });

        // Layer Toggles
        document.querySelectorAll('.layer-toggle').forEach(chk => {
            chk.addEventListener('change', (e) => {
                viewer.setLayerVisibility(e.target.dataset.layer, e.target.checked);
            });
        });

        // Status Filter Chips
        document.querySelectorAll('.filter-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                applyFilters();
            });
        });

        document.getElementById('filter-layer-target').addEventListener('change', applyFilters);
        document.getElementById('filter-part-select').addEventListener('change', applyFilters);
        document.getElementById('search-input').addEventListener('input', applyFilters);

        // Sidebar Tabs
        document.querySelectorAll('.sidebar-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => openSidebarTab(btn.dataset.tab));
        });

        // Footing selection event
        window.addEventListener('footing-selected', (e) => {
            currentSelectedFootingId = e.detail.footingId;
            renderInspector(e.detail.footingId);
            openSidebarTab('inspector');
        });

        // Snapshot Button
        document.getElementById('btn-snapshot').addEventListener('click', () => {
            viewer.captureSnapshot();
            showToast('HD Snapshot downloaded with embedded title and legend');
        });

        // Export CSV & JSON
        document.getElementById('btn-export-csv').addEventListener('click', () => {
            stateManager.exportActivePlanCSV();
            showToast('Excel/CSV spreadsheet downloaded');
        });

        document.getElementById('btn-export-json').addEventListener('click', () => {
            stateManager.exportJSON();
            showToast('JSON backup downloaded');
        });

        // Import JSON
        const importInput = document.getElementById('import-file-input');
        const importBtn = document.getElementById('btn-import-json');
        if (importBtn && importInput) {
            importBtn.addEventListener('click', () => {
                if (!authManager.canEdit()) {
                    showToast('Action restricted: Only Administrator can import data', 'error');
                    return;
                }
                importInput.click();
            });
            importInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (evt) => {
                    const res = stateManager.importJSON(evt.target.result);
                    if (res.success) {
                        showToast(`Import successful: ${res.count} footings updated`);
                    } else {
                        showToast(`Error: ${res.message}`, 'error');
                    }
                };
                reader.readAsText(file);
            });
        }

        // Reset Plan Button
        document.getElementById('btn-reset-data').addEventListener('click', () => {
            if (!authManager.canEdit()) {
                showToast('Action restricted: Only Administrator can reset data', 'error');
                return;
            }
            const plan = stateManager.getActivePlan();
            if (confirm(`Reset progress data for: ${plan.shortName} to original plan default?`)) {
                stateManager.resetActivePlan();
                showToast('Plan data restored to default');
            }
        });

        // Batch Form Submit
        const batchForm = document.getElementById('batch-update-form');
        if (batchForm) {
            batchForm.addEventListener('submit', (e) => {
                e.preventDefault();
                if (!authManager.canEdit()) {
                    showToast('Action restricted: Viewer account is Read-Only', 'error');
                    return;
                }

                const scope = document.getElementById('batch-scope-type').value;
                const target = document.getElementById('batch-target').value;
                const status = document.getElementById('batch-status').value;
                const date = document.getElementById('batch-date').value;

                let count = 0;
                if (scope === 'part') {
                    const partVal = document.getElementById('batch-part-select').value;
                    count = stateManager.batchUpdateByPart(partVal, target, status, date);
                } else if (scope === 'axisX') {
                    const axVal = document.getElementById('batch-axis-x-select').value;
                    count = stateManager.batchUpdateByAxis('X', axVal, target, status, date);
                } else if (scope === 'axisY') {
                    const ayVal = document.getElementById('batch-axis-y-select').value;
                    count = stateManager.batchUpdateByAxis('Y', ayVal, target, status, date);
                }
                showToast(`Batch update applied: ${count} footings updated`);
            });

            // Batch Scope Toggle
            const scopeSelect = document.getElementById('batch-scope-type');
            scopeSelect.addEventListener('change', () => {
                document.getElementById('batch-part-group').style.display = scopeSelect.value === 'part' ? 'block' : 'none';
                document.getElementById('batch-axis-x-group').style.display = scopeSelect.value === 'axisX' ? 'block' : 'none';
                document.getElementById('batch-axis-y-group').style.display = scopeSelect.value === 'axisY' ? 'block' : 'none';
            });
        }

        // Keyboard Left/Right to scroll hangars
        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            const plans = stateManager.getPlansList(stateManager.activeCategory);
            const curIdx = plans.findIndex(p => p.id === stateManager.activePlanId);
            if (e.key === 'ArrowRight' && curIdx < plans.length - 1) {
                window.switchPlan(plans[curIdx + 1].id);
            } else if (e.key === 'ArrowLeft' && curIdx > 0) {
                window.switchPlan(plans[curIdx - 1].id);
            }
        });
    }

    function applyFilters() {
        const activeChip = document.querySelector('.filter-chip.active');
        const statusFilter = activeChip ? activeChip.dataset.status : 'all';
        const layerTarget = document.getElementById('filter-layer-target').value;
        const partFilter = document.getElementById('filter-part-select').value;
        const searchQuery = document.getElementById('search-input').value;

        viewer.applyFilters(statusFilter, layerTarget, partFilter, searchQuery);
    }

    function updateHeaderInfo() {
        const plan = stateManager.getActivePlan();
        if (!plan) return;
        document.getElementById('project-title').textContent = plan.title;
        document.getElementById('project-subtitle').textContent = `${plan.drawingNo} • Scale ${plan.scale} • Footprint: ${plan.totalLength}m × ${plan.totalWidth}m (${Math.round(plan.totalArea)} m²)`;
    }

    function populatePartSelects() {
        const plan = stateManager.getActivePlan();
        const parts = plan.partZones || [];

        const filterSelect = document.getElementById('filter-part-select');
        const batchSelect = document.getElementById('batch-part-select');

        filterSelect.innerHTML = '<option value="all">All Zones / Sections</option>';
        batchSelect.innerHTML = '<option value="all">All Zones (Whole Plan)</option>';

        parts.forEach(p => {
            const opt1 = document.createElement('option');
            opt1.value = p.id;
            opt1.textContent = `${p.id} - ${p.name.slice(0, 32)}...`;
            filterSelect.appendChild(opt1);

            const opt2 = document.createElement('option');
            opt2.value = p.id;
            opt2.textContent = `${p.id} - ${p.name}`;
            batchSelect.appendChild(opt2);
        });
    }

    function populateAxisSelects() {
        const plan = stateManager.getActivePlan();
        const batchX = document.getElementById('batch-axis-x-select');
        const batchY = document.getElementById('batch-axis-y-select');

        batchX.innerHTML = '';
        batchY.innerHTML = '';

        (plan.axesX || []).forEach(ax => {
            const opt = document.createElement('option');
            opt.value = ax.label;
            opt.textContent = `Axis ${ax.label} (${ax.x}m)`;
            batchX.appendChild(opt);
        });

        (plan.axesY || []).forEach(ay => {
            const opt = document.createElement('option');
            opt.value = ay.label;
            opt.textContent = `Axis ${ay.label} (${ay.y}m)`;
            batchY.appendChild(opt);
        });
    }

    function updateKPIDashboard() {
        const stats = stateManager.getStatistics();
        if (!stats) return;

        // Global Card
        const totalVol = stats.footing.volTotal + stats.blinding.volTotal;
        const doneVol = stats.footing.volAccepted + stats.blinding.volAccepted;
        const globalPct = Math.round((doneVol / totalVol) * 100);

        document.getElementById('kpi-global-pct').textContent = `${globalPct}%`;
        document.getElementById('kpi-global-vol').textContent = `${Math.round(doneVol)} m³ accepted out of ${Math.round(totalVol)} m³ total`;

        // Blinding Card
        document.getElementById('kpi-blinding-pct').textContent = `${stats.blinding.pctAccepted}%`;
        document.getElementById('kpi-blinding-poured-bar').style.width = `${stats.blinding.pctPoured}%`;
        document.getElementById('kpi-blinding-progress-bar').style.width = `${stats.blinding.pctAccepted}%`;
        document.getElementById('kpi-blinding-counts').innerHTML = `
            <span class="count-item receptionne">✅ Accepted: <b>${stats.blinding.accepted}</b></span>
            <span class="count-item coule">💧 Poured: <b>${stats.blinding.poured - stats.blinding.accepted}</b></span>
            <span class="count-item en_attente">⏳ Pending: <b>${stats.blinding.pending}</b></span>
        `;
        document.getElementById('kpi-blinding-vol').textContent = `${stats.blinding.volAccepted} m³ / ${stats.blinding.volTotal} m³`;

        // Footing Card
        document.getElementById('kpi-footing-pct').textContent = `${stats.footing.pctAccepted}%`;
        document.getElementById('kpi-footing-poured-bar').style.width = `${stats.footing.pctPoured}%`;
        document.getElementById('kpi-footing-progress-bar').style.width = `${stats.footing.pctAccepted}%`;
        document.getElementById('kpi-footing-counts').innerHTML = `
            <span class="count-item receptionne">✅ Accepted: <b>${stats.footing.accepted}</b></span>
            <span class="count-item coule">💧 Poured: <b>${stats.footing.poured - stats.footing.accepted}</b></span>
            <span class="count-item en_attente">⏳ Pending: <b>${stats.footing.pending}</b></span>
        `;
        document.getElementById('kpi-footing-vol').textContent = `${stats.footing.volAccepted} m³ / ${stats.footing.volTotal} m³`;

        // Part Breakdown
        const partsContainer = document.getElementById('part-breakdown-container');
        if (partsContainer) {
            partsContainer.innerHTML = stats.parts.map(p => {
                const pct = p.total > 0 ? Math.round((p.fAccepted / p.total) * 100) : 0;
                return `
                    <div class="part-card" onclick="window.filterByPart('${p.id}')">
                        <div class="part-card-header">
                            <span class="part-badge" style="background: ${p.color}22; color: ${p.color}; border: 1px solid ${p.color}55;">${p.id}</span>
                            <span class="part-pct">${pct}%</span>
                        </div>
                        <div class="part-name">${p.name}</div>
                        <div class="part-progress-track">
                            <div class="part-progress-fill" style="width: ${pct}%; background: ${p.color};"></div>
                        </div>
                        <div class="part-details">
                            <span>Footings: <b>${p.fAccepted}/${p.total}</b></span>
                            <span>Blinding: <b>${p.bAccepted}/${p.total}</b></span>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    window.filterByPart = (partId) => {
        document.getElementById('filter-part-select').value = partId;
        applyFilters();
        showToast(`Zone ${partId} isolated`);
    };

    function renderInspector(footingId) {
        const footing = stateManager.getFootingById(footingId);
        const container = document.getElementById('inspector-content');
        if (!container || !footing) return;

        const canEdit = authManager.canEdit();
        const getStatusLabel = (st) => st === 'receptionne' ? 'ACCEPTED' : (st === 'coule' ? 'POURED' : 'PENDING');

        container.innerHTML = `
            <div class="inspector-card">
                ${!canEdit ? `
                    <div class="viewer-notice-badge">
                        🔒 <b>VIEW-ONLY MODE</b> (Log in as Admin to edit status)
                    </div>
                ` : ''}

                <div class="inspector-badge-row">
                    <span class="badge-id">${footing.id}</span>
                    <span class="badge-part">${footing.part}</span>
                </div>
                <h3 class="inspector-title">${footing.tag}</h3>
                <div class="inspector-grid-info">
                    <div class="info-cell"><span>Grid Intersection:</span> <b>Axis ${footing.axisX} / ${footing.axisY}</b></div>
                    <div class="info-cell"><span>Dimensions:</span> <b>${footing.dimX}m × ${footing.dimY}m × ${footing.dimZ}m</b></div>
                    <div class="info-cell"><span>Concrete Vol:</span> <b>${footing.volM3} m³</b></div>
                    <div class="info-cell"><span>Coordinates:</span> <b>X: ${footing.x}m, Y: ${footing.y}m</b></div>
                </div>

                <!-- Blinding Concrete -->
                <div class="inspector-section">
                    <div class="section-title">
                        <span>🧪 BLINDING CONCRETE (10 cm)</span>
                        <span class="status-indicator status-${footing.blinding.status}">${getStatusLabel(footing.blinding.status)}</span>
                    </div>
                    <div class="form-group">
                        <label>Status:</label>
                        <select id="insp-blinding-status" class="form-select" ${!canEdit ? 'disabled' : ''}>
                            <option value="en_attente" ${footing.blinding.status === 'en_attente' ? 'selected' : ''}>⏳ Pending / Not poured</option>
                            <option value="coule" ${footing.blinding.status === 'coule' ? 'selected' : ''}>💧 Poured</option>
                            <option value="receptionne" ${footing.blinding.status === 'receptionne' ? 'selected' : ''}>✅ Inspected / QA-QC Accepted</option>
                        </select>
                    </div>
                    <div class="form-row">
                        <div class="form-group flex-1">
                            <label>Date:</label>
                            <input type="date" id="insp-blinding-date" class="form-input" value="${footing.blinding.date || ''}" ${!canEdit ? 'disabled' : ''}>
                        </div>
                        <div class="form-group flex-1">
                            <label>RFI / ITP No:</label>
                            <input type="text" id="insp-blinding-rfi" class="form-input" value="${footing.blinding.rfi || ''}" placeholder="e.g. RFI-BP-102" ${!canEdit ? 'disabled' : ''}>
                        </div>
                    </div>
                </div>

                <!-- Footing Foundation -->
                <div class="inspector-section">
                    <div class="section-title">
                        <span>🏗️ FOOTING FOUNDATION</span>
                        <span class="status-indicator status-${footing.footing.status}">${getStatusLabel(footing.footing.status)}</span>
                    </div>
                    <div class="form-group">
                        <label>Status:</label>
                        <select id="insp-footing-status" class="form-select" ${!canEdit ? 'disabled' : ''}>
                            <option value="en_attente" ${footing.footing.status === 'en_attente' ? 'selected' : ''}>⏳ Pending / Not poured</option>
                            <option value="coule" ${footing.footing.status === 'coule' ? 'selected' : ''}>💧 Poured</option>
                            <option value="receptionne" ${footing.footing.status === 'receptionne' ? 'selected' : ''}>✅ Inspected / QA-QC Accepted</option>
                        </select>
                    </div>
                    <div class="form-row">
                        <div class="form-group flex-1">
                            <label>Date:</label>
                            <input type="date" id="insp-footing-date" class="form-input" value="${footing.footing.date || ''}" ${!canEdit ? 'disabled' : ''}>
                        </div>
                        <div class="form-group flex-1">
                            <label>RFI / ITP No:</label>
                            <input type="text" id="insp-footing-rfi" class="form-input" value="${footing.footing.rfi || ''}" placeholder="e.g. RFI-SEM-102" ${!canEdit ? 'disabled' : ''}>
                        </div>
                    </div>
                </div>

                <!-- Notes -->
                <div class="form-group">
                    <label>Remarks / Site Logs:</label>
                    <textarea id="insp-notes" class="form-textarea" rows="2" ${!canEdit ? 'disabled' : ''}>${footing.notes || ''}</textarea>
                </div>

                <div class="inspector-actions">
                    ${canEdit ? `
                        <button id="btn-save-inspector" class="btn btn-primary btn-block">💾 Save Changes</button>
                    ` : ''}
                    <button id="btn-focus-footing" class="btn btn-secondary btn-block">🎯 Center on Footing</button>
                </div>
            </div>
        `;

        if (canEdit) {
            document.getElementById('btn-save-inspector').addEventListener('click', () => {
                const bStatus = document.getElementById('insp-blinding-status').value;
                const bDate = document.getElementById('insp-blinding-date').value;
                const bRfi = document.getElementById('insp-blinding-rfi').value;

                const fStatus = document.getElementById('insp-footing-status').value;
                const fDate = document.getElementById('insp-footing-date').value;
                const fRfi = document.getElementById('insp-footing-rfi').value;

                const notes = document.getElementById('insp-notes').value;

                stateManager.updateBlindingStatus(footingId, bStatus, bDate, bRfi);
                stateManager.updateFootingStatus(footingId, fStatus, fDate, fRfi);
                stateManager.updateFootingNotes(footingId, notes);

                showToast(`Status saved for ${footing.tag}`);
            });
        }

        document.getElementById('btn-focus-footing').addEventListener('click', () => {
            viewer.focusFooting(footingId);
        });
    }

    function openSidebarTab(tab) {
        document.querySelectorAll('.sidebar-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tab}`));
    }

    function showToast(msg, type = 'success') {
        const t = document.getElementById('toast');
        if (!t) return;
        t.textContent = msg;
        t.className = `toast show ${type}`;
        setTimeout(() => { t.className = 'toast'; }, 3000);
    }
});
