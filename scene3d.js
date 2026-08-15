/**
 * Moteur 3D Three.js - Plan de Fondation Baladna Algeria
 * Modélisation exacte des axes, semelles, béton de propreté, longrines,
 * fûts de poteaux, zones PART 01-09, raycasting et surbrillance des statuts.
 */

class Foundation3DViewer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.projectData = window.BALADNA_PROJECT_DATA || {};
        this.stateManager = window.stateManager;

        this.scene = null;
        this.renderer = null;
        this.camera = null;
        this.perspectiveCamera = null;
        this.orthographicCamera = null;
        this.controls = null;
        this.currentViewMode = '3d'; // '3d' or '2d'

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.hoveredObject = null;
        this.selectedObject = null;

        // Object collections
        this.footingMeshes = new Map();  // id -> mesh
        this.blindingMeshes = new Map(); // id -> mesh
        this.pedestalMeshes = new Map(); // id -> mesh
        this.tieBeamMeshes = [];
        this.axesGroup = new THREE.Group();
        this.zonesGroup = new THREE.Group();
        this.dimensionsGroup = new THREE.Group();
        this.structuralGroup = new THREE.Group();

        // Color palettes for status
        this.STATUS_COLORS = {
            en_attente: 0x64748b,   // Slate Grey / Pending
            coule: 0x0284c7,        // Vibrant Cyan-Blue / Poured
            receptionne: 0x10b981,  // Emerald Green / Accepted QA-QC
            selected: 0xf59e0b,     // Amber / Selected
            hover: 0x38bdf8,        // Sky Blue / Hover
            dimmed: 0x1e293b        // Darkened / Filtered out
        };

        this.init();
    }

    init() {
        if (!this.container) return;

        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        // 1. Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0b0f19);
        this.scene.fog = new THREE.FogExp2(0x0b0f19, 0.0035);

        // 2. Cameras setup
        const aspect = width / height;
        this.perspectiveCamera = new THREE.PerspectiveCamera(45, aspect, 1, 1000);
        
        // Fit 142.75m x 96.1m in view
        const centerX = (this.projectData.project.totalLength || 142.75) / 2;
        const centerY = (this.projectData.project.totalWidth || 96.1) / 2;
        
        this.perspectiveCamera.position.set(centerX + 80, 110, centerY + 90);
        this.perspectiveCamera.lookAt(centerX, 0, centerY);

        const frustumSize = 160;
        this.orthographicCamera = new THREE.OrthographicCamera(
            -frustumSize * aspect / 2, frustumSize * aspect / 2,
            frustumSize / 2, -frustumSize / 2,
            1, 1000
        );
        this.orthographicCamera.position.set(centerX, 150, centerY);
        this.orthographicCamera.lookAt(centerX, 0, centerY);

        this.camera = this.perspectiveCamera;

        // 3. Renderer setup
        this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // 4. Controls setup
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(centerX, 0, centerY);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // Don't go below ground
        this.controls.minDistance = 10;
        this.controls.maxDistance = 350;
        this.controls.update();

        // 5. Lighting
        this.setupLights(centerX, centerY);

        // 6. Ground & Grid Base
        this.buildGround(centerX, centerY);

        // 7. Axes System & Dimensions
        this.buildAxesSystem();

        // 8. PART Zones Visuals
        this.buildPartZones();

        // 9. Structural Elements (Blinding, Footings, Pedestals, Tie Beams)
        this.buildStructuralModel();

        // 10. Event Listeners
        this.setupEvents();

        // 11. State Manager subscription
        if (this.stateManager) {
            this.stateManager.subscribe(() => this.updateMaterialsFromState());
        }

        // 12. Animation Loop
        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }

    setupLights(centerX, centerY) {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
        this.scene.add(ambientLight);

        const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.85);
        dirLight1.position.set(centerX + 60, 120, centerY - 60);
        dirLight1.castShadow = true;
        dirLight1.shadow.mapSize.width = 2048;
        dirLight1.shadow.mapSize.height = 2048;
        dirLight1.shadow.camera.near = 10;
        dirLight1.shadow.camera.far = 300;
        const d = 100;
        dirLight1.shadow.camera.left = -d;
        dirLight1.shadow.camera.right = d;
        dirLight1.shadow.camera.top = d;
        dirLight1.shadow.camera.bottom = -d;
        dirLight1.shadow.bias = -0.0005;
        this.scene.add(dirLight1);

        const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.4);
        hemiLight.position.set(centerX, 50, centerY);
        this.scene.add(hemiLight);
    }

    buildGround(centerX, centerY) {
        const totalX = this.projectData.project.totalLength || 142.75;
        const totalY = this.projectData.project.totalWidth || 96.1;

        // Ground slab
        const groundGeo = new THREE.PlaneGeometry(totalX + 40, totalY + 40);
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x0f172a,
            roughness: 0.9,
            metalness: 0.1
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(centerX, -0.20, centerY);
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Building base footprint outline
        const fpGeo = new THREE.PlaneGeometry(totalX, totalY);
        const fpMat = new THREE.MeshStandardMaterial({
            color: 0x131e36,
            roughness: 0.8,
            metalness: 0.2
        });
        const footprint = new THREE.Mesh(fpGeo, fpMat);
        footprint.rotation.x = -Math.PI / 2;
        footprint.position.set(centerX, -0.18, centerY);
        footprint.receiveShadow = true;
        this.scene.add(footprint);

        // Subtle sub-grid
        const gridHelper = new THREE.GridHelper(Math.max(totalX, totalY) + 40, 60, 0x334155, 0x1e293b);
        gridHelper.position.set(centerX, -0.17, centerY);
        this.scene.add(gridHelper);
    }

    buildAxesSystem() {
        this.axesGroup = new THREE.Group();
        this.dimensionsGroup = new THREE.Group();

        const totalX = this.projectData.project.totalLength || 142.75;
        const totalY = this.projectData.project.totalWidth || 96.1;
        const extension = 8.0; // Bubble offset from building edge

        const lineMaterial = new THREE.LineDashedMaterial({
            color: 0x64748b,
            dashSize: 1.5,
            gapSize: 0.8,
            linewidth: 1,
            opacity: 0.75,
            transparent: true
        });

        const subLineMaterial = new THREE.LineDashedMaterial({
            color: 0x475569,
            dashSize: 0.8,
            gapSize: 0.8,
            linewidth: 1,
            opacity: 0.5,
            transparent: true
        });

        // 1. X Axes (Running vertically in 2D / along Z in Three.js coordinates: (x, 0, y))
        (this.projectData.axesX || []).forEach(ax => {
            const x = ax.x;
            const isSub = ax.label.includes("'");

            // Line from Y = -extension to Y = totalY + extension
            const points = [
                new THREE.Vector3(x, 0.05, -extension),
                new THREE.Vector3(x, 0.05, totalY + extension)
            ];
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, isSub ? subLineMaterial : lineMaterial);
            line.computeLineDistances();
            this.axesGroup.add(line);

            // Bubbles at South (Y = -extension) and North (Y = totalY + extension)
            const bubbleSouth = this.createAxisBubble(ax.label, x, -extension, isSub);
            const bubbleNorth = this.createAxisBubble(ax.label, x, totalY + extension, isSub);
            this.axesGroup.add(bubbleSouth);
            this.axesGroup.add(bubbleNorth);
        });

        // 2. Y Axes (Running horizontally in 2D / along X in Three.js coordinates)
        (this.projectData.axesY || []).forEach(ay => {
            const y = ay.y;
            const isSub = ay.label.includes("'");

            const points = [
                new THREE.Vector3(-extension, 0.05, y),
                new THREE.Vector3(totalX + extension, 0.05, y)
            ];
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, isSub ? subLineMaterial : lineMaterial);
            line.computeLineDistances();
            this.axesGroup.add(line);

            // Bubbles at West (X = -extension) and East (X = totalX + extension)
            const bubbleWest = this.createAxisBubble(ay.label, -extension, y, isSub);
            const bubbleEast = this.createAxisBubble(ay.label, totalX + extension, y, isSub);
            this.axesGroup.add(bubbleWest);
            this.axesGroup.add(bubbleEast);
        });

        this.scene.add(this.axesGroup);
        this.scene.add(this.dimensionsGroup);
    }

    createAxisBubble(label, x, z, isSub = false) {
        const group = new THREE.Group();
        group.position.set(x, 0.1, z);

        const radius = isSub ? 1.6 : 2.2;
        const circleGeo = new THREE.CircleGeometry(radius, 32);
        const circleMat = new THREE.MeshBasicMaterial({
            color: isSub ? 0x1e293b : 0x0f172a,
            side: THREE.DoubleSide
        });
        const circle = new THREE.Mesh(circleGeo, circleMat);
        circle.rotation.x = -Math.PI / 2;
        group.add(circle);

        // Ring border
        const ringGeo = new THREE.RingGeometry(radius - 0.15, radius, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color: isSub ? 0x94a3b8 : 0x38bdf8,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        group.add(ring);

        // Canvas Sprite Text
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = isSub ? '#cbd5e1' : '#ffffff';
        ctx.font = 'bold 54px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, 64, 64);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(radius * 1.8, radius * 1.8, 1);
        sprite.position.y = 0.1;
        group.add(sprite);

        return group;
    }

    buildPartZones() {
        this.zonesGroup = new THREE.Group();

        (this.projectData.partZones || []).forEach(zone => {
            const b = zone.bounds;
            const w = b.maxX - b.minX;
            const h = b.maxY - b.minY;
            const cx = b.minX + w / 2;
            const cy = b.minY + h / 2;

            // Zone Outline Box
            const points = [
                new THREE.Vector3(b.minX, 0.02, b.minY),
                new THREE.Vector3(b.maxX, 0.02, b.minY),
                new THREE.Vector3(b.maxX, 0.02, b.maxY),
                new THREE.Vector3(b.minX, 0.02, b.maxY),
                new THREE.Vector3(b.minX, 0.02, b.minY)
            ];
            const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
            const lineMat = new THREE.LineBasicMaterial({ color: zone.color, opacity: 0.6, transparent: true, linewidth: 2 });
            const line = new THREE.Line(lineGeo, lineMat);
            this.zonesGroup.add(line);

            // Zone Label Sprite
            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = zone.color;
            ctx.font = 'bold 36px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(zone.id, 128, 32);

            const texture = new THREE.CanvasTexture(canvas);
            const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.75 });
            const sprite = new THREE.Sprite(spriteMat);
            sprite.scale.set(12, 3, 1);
            sprite.position.set(cx, 0.1, cy);
            this.zonesGroup.add(sprite);
        });

        this.scene.add(this.zonesGroup);
    }

    buildStructuralModel() {
        this.structuralGroup = new THREE.Group();
        const footings = this.projectData.footings || [];

        // 1. Footings & Blinding & Pedestals
        footings.forEach(f => {
            const posX = f.x;
            const posZ = f.y; // In Three.js, horizontal ground is X and Z

            // A. Béton de propreté (Lean Concrete)
            const bX = f.blinding.dimX;
            const bZ = f.blinding.dimY;
            const bY = f.blinding.dimZ; // 0.10 m

            const bGeo = new THREE.BoxGeometry(bX, bY, bZ);
            const bMat = new THREE.MeshStandardMaterial({
                color: this.STATUS_COLORS[f.blinding.status] || this.STATUS_COLORS.en_attente,
                roughness: 0.85,
                metalness: 0.1
            });
            const bMesh = new THREE.Mesh(bGeo, bMat);
            bMesh.position.set(posX, bY / 2, posZ);
            bMesh.receiveShadow = true;
            bMesh.castShadow = true;
            bMesh.userData = {
                type: 'blinding',
                footingId: f.id,
                data: f
            };
            this.blindingMeshes.set(f.id, bMesh);
            this.structuralGroup.add(bMesh);

            // B. Semelle de fondation (Footing)
            const fX = f.dimX;
            const fZ = f.dimY;
            const fY = f.dimZ; // 0.60 to 0.80 m

            const fGeo = new THREE.BoxGeometry(fX, fY, fZ);
            const fMat = new THREE.MeshStandardMaterial({
                color: this.STATUS_COLORS[f.footing.status] || this.STATUS_COLORS.en_attente,
                roughness: 0.45,
                metalness: 0.25
            });
            const fMesh = new THREE.Mesh(fGeo, fMat);
            fMesh.position.set(posX, bY + fY / 2, posZ);
            fMesh.receiveShadow = true;
            fMesh.castShadow = true;
            fMesh.userData = {
                type: 'footing',
                footingId: f.id,
                data: f
            };

            // Edge lines on footing for crisp CAD look
            const edgesGeo = new THREE.EdgesGeometry(fGeo);
            const edgesMat = new THREE.LineBasicMaterial({ color: 0x000000, opacity: 0.4, transparent: true });
            const edgesMesh = new THREE.LineSegments(edgesGeo, edgesMat);
            fMesh.add(edgesMesh);

            this.footingMeshes.set(f.id, fMesh);
            this.structuralGroup.add(fMesh);

            // C. Amorce(s) de poteau (Pedestals)
            const pX = f.pedestal.dimX;
            const pZ = f.pedestal.dimY;
            const pY = f.pedestal.dimZ; // 0.90 m
            const pedCount = f.pedestalsCount || 1;

            const pGeo = new THREE.BoxGeometry(pX, pY, pZ);
            const pMat = new THREE.MeshStandardMaterial({
                color: 0x94a3b8,
                roughness: 0.6,
                metalness: 0.3
            });

            if (pedCount === 2) {
                // Twin pedestals
                const offset = fX * 0.22;
                const pMesh1 = new THREE.Mesh(pGeo, pMat);
                pMesh1.position.set(posX - offset, bY + fY + pY / 2, posZ);
                pMesh1.castShadow = true;
                pMesh1.userData = { type: 'pedestal', footingId: f.id, data: f };
                this.structuralGroup.add(pMesh1);

                const pMesh2 = new THREE.Mesh(pGeo, pMat);
                pMesh2.position.set(posX + offset, bY + fY + pY / 2, posZ);
                pMesh2.castShadow = true;
                pMesh2.userData = { type: 'pedestal', footingId: f.id, data: f };
                this.structuralGroup.add(pMesh2);

                this.pedestalMeshes.set(f.id, pMesh1);
            } else {
                const pMesh = new THREE.Mesh(pGeo, pMat);
                pMesh.position.set(posX, bY + fY + pY / 2, posZ);
                pMesh.receiveShadow = true;
                pMesh.castShadow = true;
                pMesh.userData = {
                    type: 'pedestal',
                    footingId: f.id,
                    data: f
                };
                this.pedestalMeshes.set(f.id, pMesh);
                this.structuralGroup.add(pMesh);
            }
        });

        // 2. Longrines de liaison (Tie Beams)
        (this.projectData.tieBeams || []).forEach(tb => {
            const x1 = tb.x1, z1 = tb.y1;
            const x2 = tb.x2, z2 = tb.y2;
            const dx = x2 - x1;
            const dz = z2 - z1;
            const length = Math.sqrt(dx * dx + dz * dz);
            const angle = Math.atan2(dz, dx);

            const tbGeo = new THREE.BoxGeometry(length, tb.height, tb.width);
            const tbMat = new THREE.MeshStandardMaterial({
                color: 0x475569,
                roughness: 0.7,
                metalness: 0.2
            });
            const tbMesh = new THREE.Mesh(tbGeo, tbMat);
            tbMesh.position.set((x1 + x2) / 2, 0.10 + tb.height / 2, (z1 + z2) / 2);
            tbMesh.rotation.y = -angle;
            tbMesh.receiveShadow = true;
            tbMesh.castShadow = true;
            tbMesh.userData = {
                type: 'tieBeam',
                data: tb
            };
            this.tieBeamMeshes.push(tbMesh);
            this.structuralGroup.add(tbMesh);
        });

        this.scene.add(this.structuralGroup);
    }

    updateMaterialsFromState() {
        if (!this.stateManager) return;
        const footings = this.stateManager.getFootings();

        footings.forEach(f => {
            // Update Blinding Material
            const bMesh = this.blindingMeshes.get(f.id);
            if (bMesh) {
                bMesh.material.color.setHex(this.STATUS_COLORS[f.blinding.status] || this.STATUS_COLORS.en_attente);
                bMesh.userData.data = f;
            }

            // Update Footing Material
            const fMesh = this.footingMeshes.get(f.id);
            if (fMesh) {
                fMesh.material.color.setHex(this.STATUS_COLORS[f.footing.status] || this.STATUS_COLORS.en_attente);
                fMesh.userData.data = f;
            }
        });
    }

    applyFilters(statusFilter = 'all', layerTarget = 'all', partFilter = 'all', searchQuery = '') {
        const query = searchQuery.trim().toUpperCase();

        this.footings.forEach(f => {
            const bMesh = this.blindingMeshes.get(f.id);
            const fMesh = this.footingMeshes.get(f.id);
            const pMesh = this.pedestalMeshes.get(f.id);

            let matchStatus = true;
            if (statusFilter !== 'all') {
                if (layerTarget === 'blinding') {
                    matchStatus = (f.blinding.status === statusFilter);
                } else if (layerTarget === 'footing') {
                    matchStatus = (f.footing.status === statusFilter);
                } else {
                    matchStatus = (f.blinding.status === statusFilter || f.footing.status === statusFilter);
                }
            }

            let matchPart = true;
            if (partFilter !== 'all') {
                matchPart = (f.part === partFilter);
            }

            let matchSearch = true;
            if (query) {
                matchSearch = f.id.toUpperCase().includes(query) ||
                              f.tag.toUpperCase().includes(query) ||
                              f.axisX.toUpperCase().includes(query) ||
                              f.axisY.toUpperCase().includes(query) ||
                              f.part.toUpperCase().includes(query);
            }

            const isMatch = matchStatus && matchPart && matchSearch;

            // Apply visual dimming / opacity
            if (bMesh) {
                bMesh.material.transparent = !isMatch;
                bMesh.material.opacity = isMatch ? 1.0 : 0.15;
            }
            if (fMesh) {
                fMesh.material.transparent = !isMatch;
                fMesh.material.opacity = isMatch ? 1.0 : 0.15;
            }
            if (pMesh) {
                pMesh.material.transparent = !isMatch;
                pMesh.material.opacity = isMatch ? 1.0 : 0.15;
            }
        });
    }

    get footings() {
        return this.stateManager ? this.stateManager.getFootings() : (this.projectData.footings || []);
    }

    setLayerVisibility(layerName, visible) {
        switch (layerName) {
            case 'axes':
                this.axesGroup.visible = visible;
                break;
            case 'blinding':
                this.blindingMeshes.forEach(m => m.visible = visible);
                break;
            case 'footings':
                this.footingMeshes.forEach(m => m.visible = visible);
                break;
            case 'pedestals':
                this.pedestalMeshes.forEach(m => m.visible = visible);
                break;
            case 'tieBeams':
                this.tieBeamMeshes.forEach(m => m.visible = visible);
                break;
            case 'zones':
                this.zonesGroup.visible = visible;
                break;
        }
    }

    setViewMode(mode) {
        this.currentViewMode = mode;
        const centerX = (this.projectData.project.totalLength || 142.75) / 2;
        const centerY = (this.projectData.project.totalWidth || 96.1) / 2;

        if (mode === '2d') {
            // Switch to top-down orthographic plan view
            this.camera = this.orthographicCamera;
            this.controls.object = this.camera;
            this.controls.enableRotate = false; // Pure 2D pan/zoom
            this.camera.position.set(centerX, 150, centerY);
            this.controls.target.set(centerX, 0, centerY);
        } else {
            // Switch to 3D perspective orbit
            this.camera = this.perspectiveCamera;
            this.controls.object = this.camera;
            this.controls.enableRotate = true;
            this.camera.position.set(centerX + 80, 110, centerY + 90);
            this.controls.target.set(centerX, 0, centerY);
        }
        this.controls.update();
    }

    focusOnFooting(footingId) {
        const footing = this.footings.find(f => f.id === footingId);
        if (!footing) return;

        const targetX = footing.x;
        const targetZ = footing.y;

        // Smooth camera transition
        const startTarget = this.controls.target.clone();
        const endTarget = new THREE.Vector3(targetX, 0, targetZ);
        const startTime = performance.now();
        const duration = 600;

        const animateFocus = (time) => {
            const elapsed = time - startTime;
            const progress = Math.min(elapsed / duration, 1.0);
            const ease = 0.5 - Math.cos(progress * Math.PI) / 2;

            this.controls.target.lerpVectors(startTarget, endTarget, ease);
            this.controls.update();

            if (progress < 1.0) {
                requestAnimationFrame(animateFocus);
            }
        };
        requestAnimationFrame(animateFocus);

        // Highlight selected
        this.selectFooting(footingId);
    }

    selectFooting(footingId) {
        // Reset previous selection
        if (this.selectedObject) {
            const prevId = this.selectedObject.userData.footingId;
            const prevFooting = this.footings.find(f => f.id === prevId);
            if (prevFooting) {
                const prevBMesh = this.blindingMeshes.get(prevId);
                const prevFMesh = this.footingMeshes.get(prevId);
                if (prevBMesh) prevBMesh.material.color.setHex(this.STATUS_COLORS[prevFooting.blinding.status]);
                if (prevFMesh) prevFMesh.material.color.setHex(this.STATUS_COLORS[prevFooting.footing.status]);
            }
            this.selectedObject = null;
        }

        if (footingId) {
            const fMesh = this.footingMeshes.get(footingId);
            if (fMesh) {
                fMesh.material.color.setHex(this.STATUS_COLORS.selected);
                this.selectedObject = fMesh;
            }
        }
    }

    setupEvents() {
        const dom = this.renderer.domElement;

        dom.addEventListener('pointermove', (e) => {
            const rect = dom.getBoundingClientRect();
            this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            this.checkHover(e.clientX, e.clientY);
        });

        dom.addEventListener('click', (e) => {
            const rect = dom.getBoundingClientRect();
            this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            this.checkClick();
        });

        window.addEventListener('resize', () => {
            if (!this.container) return;
            const w = this.container.clientWidth;
            const h = this.container.clientHeight;
            const aspect = w / h;

            this.perspectiveCamera.aspect = aspect;
            this.perspectiveCamera.updateProjectionMatrix();

            const frustumSize = 160;
            this.orthographicCamera.left = -frustumSize * aspect / 2;
            this.orthographicCamera.right = frustumSize * aspect / 2;
            this.orthographicCamera.top = frustumSize / 2;
            this.orthographicCamera.bottom = -frustumSize / 2;
            this.orthographicCamera.updateProjectionMatrix();

            this.renderer.setSize(w, h);
        });
    }

    checkHover(clientX, clientY) {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const interactables = [...this.footingMeshes.values(), ...this.blindingMeshes.values()];
        const intersects = this.raycaster.intersectObjects(interactables, false);

        const tooltip = document.getElementById('tooltip-3d');

        if (intersects.length > 0) {
            const hit = intersects[0].object;
            const data = hit.userData.data;

            if (this.hoveredObject !== hit) {
                this.hoveredObject = hit;
                document.body.style.cursor = 'pointer';
            }

            if (tooltip && data) {
                tooltip.style.display = 'block';
                tooltip.style.left = `${clientX + 16}px`;
                tooltip.style.top = `${clientY + 16}px`;
                tooltip.innerHTML = `
                    <div class="tooltip-header">${data.tag}</div>
                    <div class="tooltip-row"><span>Zone:</span> <b>${data.part}</b></div>
                    <div class="tooltip-row"><span>Propreté:</span> <b class="status-${data.blinding.status}">${data.blinding.status.toUpperCase()}</b></div>
                    <div class="tooltip-row"><span>Semelle:</span> <b class="status-${data.footing.status}">${data.footing.status.toUpperCase()}</b></div>
                    <div class="tooltip-row"><span>Dim:</span> ${data.dimX}m × ${data.dimY}m × ${data.dimZ}m (${data.volM3} m³)</div>
                `;
            }
        } else {
            if (this.hoveredObject) {
                this.hoveredObject = null;
                document.body.style.cursor = 'default';
            }
            if (tooltip) {
                tooltip.style.display = 'none';
            }
        }
    }

    checkClick() {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const interactables = [...this.footingMeshes.values(), ...this.blindingMeshes.values()];
        const intersects = this.raycaster.intersectObjects(interactables, false);

        if (intersects.length > 0) {
            const hit = intersects[0].object;
            const footingId = hit.userData.footingId;
            this.selectFooting(footingId);

            // Dispatch global event for UI inspector
            window.dispatchEvent(new CustomEvent('footing-selected', {
                detail: { footingId, data: hit.userData.data }
            }));
        }
    }

    captureSnapshot() {
        // 1. Render the 3D scene
        this.renderer.render(this.scene, this.camera);
        const webglCanvas = this.renderer.domElement;
        const w = webglCanvas.width;
        const h = webglCanvas.height;

        // 2. Create offscreen 2D canvas to compose legend and title
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = w;
        exportCanvas.height = h;
        const ctx = exportCanvas.getContext('2d');

        // Draw the 3D WebGL render
        ctx.drawImage(webglCanvas, 0, 0, w, h);

        // Get live statistics
        const stats = this.stateManager ? this.stateManager.getStatistics() : null;
        const dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

        const scale = Math.max(1.0, w / 1600); // Responsive scaling for high-res

        // 3. Draw Header Title Banner (Top Left)
        const headerW = 540 * scale;
        const headerH = 75 * scale;
        const margin = 24 * scale;

        ctx.save();
        ctx.fillStyle = 'rgba(11, 15, 25, 0.90)';
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
        ctx.lineWidth = 2 * scale;
        this.roundRect(ctx, margin, margin, headerW, headerH, 10 * scale);
        ctx.fill();
        ctx.stroke();

        // Header Text
        ctx.fillStyle = '#38bdf8';
        ctx.font = `bold ${16 * scale}px Inter, sans-serif`;
        ctx.fillText('PROJET BALADNA ALGÉRIE — USINE DE PRODUCTION', margin + 18 * scale, margin + 28 * scale);

        ctx.fillStyle = '#94a3b8';
        ctx.font = `${12 * scale}px Inter, sans-serif`;
        ctx.fillText('04A-BA-SDW-ST-P1-MF1-PD-FN-1010-Y00 • Plan de Fondation (142.75m × 96.10m)', margin + 18 * scale, margin + 48 * scale);

        ctx.fillStyle = '#64748b';
        ctx.font = `${11 * scale}px JetBrains Mono, monospace`;
        ctx.fillText(`Export du : ${dateStr} • Vue : ${this.currentViewMode === '2d' ? '2D Plan Orthographique' : '3D Isométrique'}`, margin + 18 * scale, margin + 65 * scale);
        ctx.restore();

        // 4. Draw Complete Legend & Stats Card (Bottom Center / Left)
        const legendW = 860 * scale;
        const legendH = 90 * scale;
        const legendX = margin;
        const legendY = h - legendH - margin;

        ctx.save();
        ctx.fillStyle = 'rgba(11, 15, 25, 0.92)';
        ctx.strokeStyle = 'rgba(71, 85, 105, 0.6)';
        ctx.lineWidth = 2 * scale;
        this.roundRect(ctx, legendX, legendY, legendW, legendH, 12 * scale);
        ctx.fill();
        ctx.stroke();

        // Legend Section Title
        ctx.fillStyle = '#f8fafc';
        ctx.font = `bold ${13 * scale}px Inter, sans-serif`;
        ctx.fillText('LÉGENDE D\'ÉTAT D\'AVANCEMENT DES FONDATIONS', legendX + 18 * scale, legendY + 24 * scale);

        if (stats) {
            ctx.fillStyle = '#38bdf8';
            ctx.font = `bold ${12 * scale}px Inter, sans-serif`;
            ctx.textAlign = 'right';
            ctx.fillText(`Avancement Global : ${stats.footing.pctAccepted}% Semelles (${stats.footing.volAccepted}m³) | ${stats.blinding.pctAccepted}% Propreté (${stats.blinding.volAccepted}m³)`, legendX + legendW - 18 * scale, legendY + 24 * scale);
            ctx.textAlign = 'left';
        }

        // Horizontal separator line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1 * scale;
        ctx.beginPath();
        ctx.moveTo(legendX + 18 * scale, legendY + 34 * scale);
        ctx.lineTo(legendX + legendW - 18 * scale, legendY + 34 * scale);
        ctx.stroke();

        // Legend Items (Réceptionné, Coulé, En attente / En cours)
        const items = [
            {
                color: '#10b981',
                title: 'RÉCEPTIONNÉ / VALIDÉ QA-QC',
                desc: stats ? `${stats.footing.accepted} semelles • ${stats.blinding.accepted} propreté` : 'Conforme & validé'
            },
            {
                color: '#0284c7',
                title: 'COULÉ',
                desc: stats ? `${stats.footing.poured - stats.footing.accepted} semelles • ${stats.blinding.poured - stats.blinding.accepted} propreté` : 'Bétonnage achevé'
            },
            {
                color: '#64748b',
                title: 'EN ATTENTE / EN COURS',
                desc: stats ? `${stats.footing.pending} semelles • ${stats.blinding.pending} propreté` : 'Non coulé / coffrage'
            }
        ];

        const colWidth = (legendW - 36 * scale) / 3;
        items.forEach((item, idx) => {
            const ix = legendX + 18 * scale + idx * colWidth;
            const iy = legendY + 56 * scale;

            // Color circle indicator with glow
            ctx.fillStyle = item.color;
            ctx.beginPath();
            ctx.arc(ix + 8 * scale, iy, 7 * scale, 0, Math.PI * 2);
            ctx.fill();

            // Item Title
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${12 * scale}px Inter, sans-serif`;
            ctx.fillText(item.title, ix + 22 * scale, iy - 2 * scale);

            // Item Subtitle / Count
            ctx.fillStyle = '#94a3b8';
            ctx.font = `${11 * scale}px Inter, sans-serif`;
            ctx.fillText(item.desc, ix + 22 * scale, iy + 14 * scale);
        });

        ctx.restore();

        // 5. Trigger download
        const dataURL = exportCanvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `Baladna_Plan_Fondation_${this.currentViewMode.toUpperCase()}_${new Date().toISOString().slice(0,10)}.png`;
        link.href = dataURL;
        link.click();
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

    animate() {
        requestAnimationFrame(this.animate);
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}

window.Foundation3DViewer = Foundation3DViewer;
