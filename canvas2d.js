/**
 * High-Performance 2D CAD Engine - Baladna Algeria (English)
 * Pure 2D Canvas vector rendering, smooth infinite zoom/pan, zero latency.
 * Supports multi-category site plans & 4 adjacent hangars per breeding barn.
 */

class InteractiveCAD2DViewer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.stateManager = window.stateManager;

        // Viewport transform
        this.scale = 8.0; // pixels per meter
        this.offsetX = 60.0;
        this.offsetY = 60.0;

        // Interaction state
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.mouseCanvasX = 0;
        this.mouseCanvasY = 0;

        this.hoveredFooting = null;
        this.selectedFooting = null;

        // Filter & visibility
        this.statusFilter = 'all'; // 'all', 'receptionne', 'coule', 'en_attente'
        this.layerTarget = 'all';   // 'all', 'blinding', 'footing'
        this.partFilter = 'all';
        this.searchQuery = '';

        this.layers = {
            axes: true,
            blinding: true,
            footings: true,
            tieBeams: true,
            pedestals: true,
            zones: true,
            grid: true
        };

        // Colors
        this.COLORS = {
            bg: '#0b0f19',
            grid: 'rgba(30, 41, 59, 0.4)',
            axisLine: 'rgba(100, 116, 139, 0.45)',
            axisBubbleBg: '#0f172a',
            axisBubbleBorder: '#38bdf8',
            axisText: '#ffffff',
            tieBeam: 'rgba(71, 85, 105, 0.65)',
            pedestal: '#94a3b8',

            receptionne: '#10b981',
            receptionne_dim: 'rgba(16, 185, 129, 0.15)',
            coule: '#0284c7',
            coule_dim: 'rgba(2, 132, 199, 0.15)',
            en_attente: '#64748b',
            en_attente_dim: 'rgba(100, 116, 139, 0.15)',

            selectedBorder: '#f59e0b',
            hoverGlow: '#38bdf8'
        };

        this.init();
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => {
            this.resize();
            this.render();
        });

        this.setupEvents();

        if (this.stateManager) {
            this.stateManager.subscribe(() => {
                this.render();
            });
        }

        this.fitToScreen();
    }

    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width * window.devicePixelRatio;
        this.canvas.height = rect.height * window.devicePixelRatio;
        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `${rect.height}px`;
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }

    fitToScreen() {
        const plan = this.stateManager.getActivePlan();
        if (!plan) return;

        const w = this.canvas.width / window.devicePixelRatio;
        const h = this.canvas.height / window.devicePixelRatio;

        const planW = plan.totalLength || 150;
        const planH = plan.totalWidth || 100;

        const margin = 100; // px
        const scaleX = (w - margin * 2) / planW;
        const scaleY = (h - margin * 2) / planH;

        this.scale = Math.min(scaleX, scaleY);
        this.offsetX = (w - planW * this.scale) / 2;
        this.offsetY = (h - planH * this.scale) / 2;

        this.render();
    }

    // World to Screen coords
    worldToScreen(wx, wy) {
        return {
            x: this.offsetX + wx * this.scale,
            y: this.offsetY + wy * this.scale
        };
    }

    // Screen to World coords
    screenToWorld(sx, sy) {
        return {
            x: (sx - this.offsetX) / this.scale,
            y: (sy - this.offsetY) / this.scale
        };
    }

    setupEvents() {
        const c = this.canvas;

        // Pointer Down (Pan Start)
        c.addEventListener('pointerdown', (e) => {
            this.isDragging = true;
            this.dragStartX = e.clientX - this.offsetX;
            this.dragStartY = e.clientY - this.offsetY;
            c.setPointerCapture(e.pointerId);
        });

        // Pointer Move (Pan / Hover)
        c.addEventListener('pointermove', (e) => {
            const rect = c.getBoundingClientRect();
            this.mouseCanvasX = e.clientX - rect.left;
            this.mouseCanvasY = e.clientY - rect.top;

            if (this.isDragging) {
                this.offsetX = e.clientX - this.dragStartX;
                this.offsetY = e.clientY - this.dragStartY;
                this.render();
            } else {
                this.checkHover(e.clientX, e.clientY);
            }
        });

        // Pointer Up (Pan End)
        c.addEventListener('pointerup', (e) => {
            if (this.isDragging) {
                this.isDragging = false;
                try { c.releasePointerCapture(e.pointerId); } catch(err){}
            }
        });

        // Click (Select Element)
        c.addEventListener('click', (e) => {
            this.checkClick();
        });

        // Wheel (Zoom centered at cursor)
        c.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = c.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
            const newScale = Math.max(1.0, Math.min(100.0, this.scale * zoomFactor));

            this.offsetX = mouseX - (mouseX - this.offsetX) * (newScale / this.scale);
            this.offsetY = mouseY - (mouseY - this.offsetY) * (newScale / this.scale);
            this.scale = newScale;

            this.render();
            this.checkHover(e.clientX, e.clientY);
        }, { passive: false });
    }

    checkHover(clientX, clientY) {
        const world = this.screenToWorld(this.mouseCanvasX, this.mouseCanvasY);
        const footings = this.stateManager.getFootings();
        const tooltip = document.getElementById('tooltip-3d');

        let found = null;
        for (let i = footings.length - 1; i >= 0; i--) {
            const f = footings[i];
            const halfX = (f.dimX || 2.4) / 2 + 0.2;
            const halfY = (f.dimY || 2.4) / 2 + 0.2;
            if (Math.abs(world.x - f.x) <= halfX && Math.abs(world.y - f.y) <= halfY) {
                found = f;
                break;
            }
        }

        if (found !== this.hoveredFooting) {
            this.hoveredFooting = found;
            this.canvas.style.cursor = found ? 'pointer' : 'default';
            this.render();
        }

        if (tooltip && found) {
            const getStatusLabel = (st) => st === 'receptionne' ? 'ACCEPTED' : (st === 'coule' ? 'POURED' : 'PENDING');
            tooltip.style.display = 'block';
            tooltip.style.left = `${clientX + 16}px`;
            tooltip.style.top = `${clientY + 16}px`;
            tooltip.innerHTML = `
                <div class="tooltip-header">${found.tag}</div>
                <div class="tooltip-row"><span>Zone:</span> <b>${found.part}</b></div>
                <div class="tooltip-row"><span>Blinding:</span> <b class="status-${found.blinding.status}">${getStatusLabel(found.blinding.status)}</b></div>
                <div class="tooltip-row"><span>Footing:</span> <b class="status-${found.footing.status}">${getStatusLabel(found.footing.status)}</b></div>
                <div class="tooltip-row"><span>Dimensions:</span> ${found.dimX}m × ${found.dimY}m × ${found.dimZ}m (${found.volM3} m³)</div>
            `;
        } else if (tooltip && !found) {
            tooltip.style.display = 'none';
        }
    }

    checkClick() {
        if (this.hoveredFooting) {
            this.selectedFooting = this.hoveredFooting;
            this.render();

            window.dispatchEvent(new CustomEvent('footing-selected', {
                detail: { footingId: this.hoveredFooting.id, data: this.hoveredFooting }
            }));
        }
    }

    focusFooting(id) {
        const footing = this.stateManager.getFootingById(id);
        if (!footing) return;

        this.selectedFooting = footing;
        const w = this.canvas.width / window.devicePixelRatio;
        const h = this.canvas.height / window.devicePixelRatio;

        this.scale = 16.0; // Zoom in
        this.offsetX = w / 2 - footing.x * this.scale;
        this.offsetY = h / 2 - footing.y * this.scale;

        this.render();
    }

    applyFilters(statusFilter, layerTarget, partFilter, searchQuery) {
        this.statusFilter = statusFilter;
        this.layerTarget = layerTarget;
        this.partFilter = partFilter;
        this.searchQuery = (searchQuery || '').trim().toUpperCase();
        this.render();
    }

    setLayerVisibility(layer, visible) {
        this.layers[layer] = visible;
        this.render();
    }

    // Main 2D Render Cycle
    render() {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const w = this.canvas.width / window.devicePixelRatio;
        const h = this.canvas.height / window.devicePixelRatio;

        ctx.save();
        ctx.clearRect(0, 0, w, h);

        // 1. Background
        ctx.fillStyle = this.COLORS.bg;
        ctx.fillRect(0, 0, w, h);

        const plan = this.stateManager.getActivePlan();
        if (!plan) {
            ctx.restore();
            return;
        }

        const planW = plan.totalLength || 150;
        const planH = plan.totalWidth || 100;

        // 2. PART Zones Background
        if (this.layers.zones && plan.partZones) {
            plan.partZones.forEach(zone => {
                const b = zone.bounds;
                const sp1 = this.worldToScreen(b.minX, b.minY);
                const sp2 = this.worldToScreen(b.maxX, b.maxY);
                const zw = sp2.x - sp1.x;
                const zh = sp2.y - sp1.y;

                ctx.fillStyle = zone.color + '0a';
                ctx.fillRect(sp1.x, sp1.y, zw, zh);

                ctx.strokeStyle = zone.color + '44';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([4, 4]);
                ctx.strokeRect(sp1.x, sp1.y, zw, zh);
                ctx.setLineDash([]);

                // Zone Label Watermark
                if (this.scale > 2.5) {
                    ctx.fillStyle = zone.color + '66';
                    ctx.font = `bold ${Math.max(12, 14 * (this.scale / 10))}px Inter, sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.fillText(zone.id, sp1.x + zw / 2, sp1.y + zh / 2);
                }
            });
        }

        // 3. Grid Axes Lines & Bubbles
        if (this.layers.axes) {
            const ext = 8.0;
            ctx.lineWidth = 1;
            ctx.setLineDash([6, 4]);
            ctx.strokeStyle = this.COLORS.axisLine;

            // X Axes (vertical grid lines)
            (plan.axesX || []).forEach(ax => {
                const p1 = this.worldToScreen(ax.x, -ext);
                const p2 = this.worldToScreen(ax.x, planH + ext);

                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();

                this.drawAxisBubble(ctx, ax.label, p1.x, p1.y);
                this.drawAxisBubble(ctx, ax.label, p2.x, p2.y);
            });

            // Y Axes (horizontal grid lines)
            (plan.axesY || []).forEach(ay => {
                const p1 = this.worldToScreen(-ext, ay.y);
                const p2 = this.worldToScreen(planW + ext, ay.y);

                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();

                this.drawAxisBubble(ctx, ay.label, p1.x, p1.y);
                this.drawAxisBubble(ctx, ay.label, p2.x, p2.y);
            });

            ctx.setLineDash([]);
        }

        // 4. Tie Beams
        if (this.layers.tieBeams && plan.tieBeams) {
            ctx.strokeStyle = this.COLORS.tieBeam;
            ctx.lineWidth = Math.max(1.5, 0.40 * this.scale);
            ctx.lineCap = 'square';

            plan.tieBeams.forEach(tb => {
                const p1 = this.worldToScreen(tb.x1, tb.y1);
                const p2 = this.worldToScreen(tb.x2, tb.y2);
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            });
        }

        // 5. Footings (Footing solid & Blinding Concrete)
        const footings = this.stateManager.getFootings();

        footings.forEach(f => {
            const isMatch = this.checkFilterMatch(f);
            const isHovered = (this.hoveredFooting && this.hoveredFooting.id === f.id);
            const isSelected = (this.selectedFooting && this.selectedFooting.id === f.id);

            const center = this.worldToScreen(f.x, f.y);

            // A. Blinding Concrete
            if (this.layers.blinding) {
                const bDimX = (f.blinding.dimX || f.dimX + 0.2) * this.scale;
                const bDimY = (f.blinding.dimY || f.dimY + 0.2) * this.scale;
                const bx = center.x - bDimX / 2;
                const by = center.y - bDimY / 2;

                const bColor = this.getStatusColor(f.blinding.status, isMatch);
                ctx.fillStyle = bColor;
                ctx.fillRect(bx, by, bDimX, bDimY);

                ctx.strokeStyle = isMatch ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)';
                ctx.lineWidth = 1;
                ctx.strokeRect(bx, by, bDimX, bDimY);
            }

            // B. Foundation Footing
            if (this.layers.footings) {
                const fDimX = (f.dimX || 2.4) * this.scale;
                const fDimY = (f.dimY || 2.4) * this.scale;
                const fx = center.x - fDimX / 2;
                const fy = center.y - fDimY / 2;

                const fColor = this.getStatusColor(f.footing.status, isMatch);
                ctx.fillStyle = fColor;
                ctx.fillRect(fx, fy, fDimX, fDimY);

                ctx.strokeStyle = isSelected ? this.COLORS.selectedBorder : (isHovered ? this.COLORS.hoverGlow : (isMatch ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.2)'));
                ctx.lineWidth = isSelected ? 3 : (isHovered ? 2 : 1);
                ctx.strokeRect(fx, fy, fDimX, fDimY);

                // C. Column Pedestals
                if (this.layers.pedestals && isMatch) {
                    const pCount = f.pedestalsCount || 1;
                    const pSize = 0.70 * this.scale;

                    ctx.fillStyle = this.COLORS.pedestal;
                    ctx.strokeStyle = '#0f172a';
                    ctx.lineWidth = 1;

                    if (pCount === 2) {
                        const offset = fDimX * 0.22;
                        ctx.fillRect(center.x - offset - pSize / 2, center.y - pSize / 2, pSize, pSize);
                        ctx.strokeRect(center.x - offset - pSize / 2, center.y - pSize / 2, pSize, pSize);

                        ctx.fillRect(center.x + offset - pSize / 2, center.y - pSize / 2, pSize, pSize);
                        ctx.strokeRect(center.x + offset - pSize / 2, center.y - pSize / 2, pSize, pSize);
                    } else {
                        ctx.fillRect(center.x - pSize / 2, center.y - pSize / 2, pSize, pSize);
                        ctx.strokeRect(center.x - pSize / 2, center.y - pSize / 2, pSize, pSize);
                    }
                }
            }
        });

        ctx.restore();
    }

    drawAxisBubble(ctx, label, sx, sy) {
        const radius = Math.max(10, Math.min(18, 1.8 * this.scale));
        ctx.save();

        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.fillStyle = this.COLORS.axisBubbleBg;
        ctx.fill();

        ctx.strokeStyle = this.COLORS.axisBubbleBorder;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = this.COLORS.axisText;
        ctx.font = `bold ${Math.max(9, radius * 0.8)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, sx, sy + 1);

        ctx.restore();
    }

    getStatusColor(status, isMatch = true) {
        if (!isMatch) {
            if (status === 'receptionne') return this.COLORS.receptionne_dim;
            if (status === 'coule') return this.COLORS.coule_dim;
            return this.COLORS.en_attente_dim;
        }
        if (status === 'receptionne') return this.COLORS.receptionne;
        if (status === 'coule') return this.COLORS.coule;
        return this.COLORS.en_attente;
    }

    checkFilterMatch(footing) {
        let matchStatus = true;
        if (this.statusFilter !== 'all') {
            if (this.layerTarget === 'blinding') {
                matchStatus = (footing.blinding.status === this.statusFilter);
            } else if (this.layerTarget === 'footing') {
                matchStatus = (footing.footing.status === this.statusFilter);
            } else {
                matchStatus = (footing.blinding.status === this.statusFilter || footing.footing.status === this.statusFilter);
            }
        }

        let matchPart = true;
        if (this.partFilter !== 'all') {
            matchPart = (footing.part === this.partFilter);
        }

        let matchSearch = true;
        if (this.searchQuery) {
            matchSearch = footing.id.toUpperCase().includes(this.searchQuery) ||
                          footing.tag.toUpperCase().includes(this.searchQuery) ||
                          footing.axisX.toUpperCase().includes(this.searchQuery) ||
                          footing.axisY.toUpperCase().includes(this.searchQuery);
        }

        return matchStatus && matchPart && matchSearch;
    }

    // Capture HD 2D with Embedded Banner & Full Legend (English)
    captureSnapshot() {
        const plan = this.stateManager.getActivePlan();
        const stats = this.stateManager.getStatistics();
        const dateStr = new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

        const expCanvas = document.createElement('canvas');
        const expW = 2400;
        const expH = 1600;
        expCanvas.width = expW;
        expCanvas.height = expH;
        const ctx = expCanvas.getContext('2d');

        // Draw background
        ctx.fillStyle = '#0b0f19';
        ctx.fillRect(0, 0, expW, expH);

        // Fit plan into high-res canvas
        const planW = plan.totalLength || 150;
        const planH = plan.totalWidth || 100;
        const marginX = 220;
        const marginY = 180;

        const expScale = Math.min((expW - marginX * 2) / planW, (expH - marginY * 2) / planH);
        const expOffsetX = (expW - planW * expScale) / 2;
        const expOffsetY = (expH - planH * expScale) / 2;

        const worldToExp = (wx, wy) => ({ x: expOffsetX + wx * expScale, y: expOffsetY + wy * expScale });

        // Draw PART zones
        if (plan.partZones) {
            plan.partZones.forEach(zone => {
                const b = zone.bounds;
                const p1 = worldToExp(b.minX, b.minY);
                const p2 = worldToExp(b.maxX, b.maxY);
                ctx.fillStyle = zone.color + '0f';
                ctx.fillRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
                ctx.strokeStyle = zone.color + '44';
                ctx.lineWidth = 2;
                ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
            });
        }

        // Draw Axes Grid
        const ext = 8.0;
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([8, 6]);

        (plan.axesX || []).forEach(ax => {
            const p1 = worldToExp(ax.x, -ext);
            const p2 = worldToExp(ax.x, planH + ext);
            ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
            this.drawExpBubble(ctx, ax.label, p1.x, p1.y, expScale);
            this.drawExpBubble(ctx, ax.label, p2.x, p2.y, expScale);
        });

        (plan.axesY || []).forEach(ay => {
            const p1 = worldToExp(-ext, ay.y);
            const p2 = worldToExp(planW + ext, ay.y);
            ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
            this.drawExpBubble(ctx, ay.label, p1.x, p1.y, expScale);
            this.drawExpBubble(ctx, ay.label, p2.x, p2.y, expScale);
        });
        ctx.setLineDash([]);

        // Draw Tie Beams
        if (plan.tieBeams) {
            ctx.strokeStyle = 'rgba(71, 85, 105, 0.7)';
            ctx.lineWidth = Math.max(2, 0.40 * expScale);
            plan.tieBeams.forEach(tb => {
                const p1 = worldToExp(tb.x1, tb.y1);
                const p2 = worldToExp(tb.x2, tb.y2);
                ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
            });
        }

        // Draw Footings
        const footings = this.stateManager.getFootings();
        footings.forEach(f => {
            const center = worldToExp(f.x, f.y);
            const bW = (f.blinding.dimX || f.dimX + 0.2) * expScale;
            const bH = (f.blinding.dimY || f.dimY + 0.2) * expScale;
            ctx.fillStyle = f.blinding.status === 'receptionne' ? '#10b981' : (f.blinding.status === 'coule' ? '#0284c7' : '#64748b');
            ctx.fillRect(center.x - bW / 2, center.y - bH / 2, bW, bH);

            const fW = (f.dimX || 2.4) * expScale;
            const fH = (f.dimY || 2.4) * expScale;
            ctx.fillStyle = f.footing.status === 'receptionne' ? '#10b981' : (f.footing.status === 'coule' ? '#0284c7' : '#475569');
            ctx.fillRect(center.x - fW / 2, center.y - fH / 2, fW, fH);
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(center.x - fW / 2, center.y - fH / 2, fW, fH);
        });

        // 1. Title Banner (Top Left)
        ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        this.roundRect(ctx, 40, 40, 820, 110, 12);
        ctx.fill(); ctx.stroke();

        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 24px Inter, sans-serif';
        ctx.fillText('BALADNA ALGERIA PROJECT — ' + plan.shortName.toUpperCase(), 65, 78);

        ctx.fillStyle = '#f8fafc';
        ctx.font = '16px Inter, sans-serif';
        ctx.fillText(`${plan.drawingNo} • ${plan.title} (${plan.totalLength}m × ${plan.totalWidth}m)`, 65, 108);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px JetBrains Mono, monospace';
        ctx.fillText(`Export: ${dateStr} • Scale: ${plan.scale}`, 65, 132);

        // 2. Bottom Status Legend Card (English)
        ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 2;
        this.roundRect(ctx, 40, expH - 150, 1240, 110, 14);
        ctx.fill(); ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px Inter, sans-serif';
        ctx.fillText('FOUNDATION PROGRESS STATUS LEGEND', 65, expH - 118);

        if (stats) {
            ctx.fillStyle = '#38bdf8';
            ctx.font = 'bold 16px Inter, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(`Overall Progress: ${stats.footing.pctAccepted}% Footings (${stats.footing.volAccepted} m³) | ${stats.blinding.pctAccepted}% Blinding (${stats.blinding.volAccepted} m³)`, 1250, expH - 118);
            ctx.textAlign = 'left';
        }

        // Legend Items
        const items = [
            { color: '#10b981', title: 'INSPECTED / QA-QC ACCEPTED', desc: stats ? `${stats.footing.accepted} footings • ${stats.blinding.accepted} blinding accepted` : '' },
            { color: '#0284c7', title: 'POURED', desc: stats ? `${stats.footing.poured - stats.footing.accepted} footings • ${stats.blinding.poured - stats.blinding.accepted} blinding poured` : '' },
            { color: '#64748b', title: 'PENDING / IN PROGRESS', desc: stats ? `${stats.footing.pending} footings • ${stats.blinding.pending} blinding remaining` : '' }
        ];

        items.forEach((item, idx) => {
            const ix = 65 + idx * 395;
            const iy = expH - 72;

            ctx.fillStyle = item.color;
            ctx.beginPath();
            ctx.arc(ix + 12, iy + 6, 10, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 15px Inter, sans-serif';
            ctx.fillText(item.title, ix + 32, iy + 2);

            ctx.fillStyle = '#94a3b8';
            ctx.font = '13px Inter, sans-serif';
            ctx.fillText(item.desc, ix + 32, iy + 22);
        });

        // Trigger download
        const link = document.createElement('a');
        link.download = `Baladna_${plan.id}_${new Date().toISOString().slice(0,10)}.png`;
        link.href = expCanvas.toDataURL('image/png');
        link.click();
    }

    drawExpBubble(ctx, label, sx, sy, expScale) {
        const radius = Math.max(14, Math.min(24, 2.0 * expScale));
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#0f172a';
        ctx.fill();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.max(11, radius * 0.85)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, sx, sy + 1);
    }

    roundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }
}

window.InteractiveCAD2DViewer = InteractiveCAD2DViewer;
