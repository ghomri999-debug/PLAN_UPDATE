# Baladna Algeria - Interactive 2D CAD Foundation Tracking Platform

An ultra-lightweight, high-performance web platform for monitoring, tracking, and inspecting foundation concrete pours (*Blinding Concrete & Footings*) across the **Algeria Dairy & Arable Farming Project (Baladna - GCB)**.

---

## 🏗️ Supported Facilities & Drawings

1. **🏭 Production Building (MF1)**:
   - Drawing: `04A-BA-SDW-ST-P1-MF1-PD-FN-1010-Y00`
   - Dimensions: $142.75\text{ m} \times 96.10\text{ m}$ (177 Footings, 349 Tie Beams)
2. **🐄 Breeding Heifers Barns (BA4)**:
   - 4 Adjacent Hangars: `BA4-01`, `BA4-02`, `BA4-03`, `BA4-04`
   - Dimensions: $450.00\text{ m} \times 36.00\text{ m}$ each (304 Footings, 528 Tie Beams each)
3. **🥛 Bred Heifers Barns (BA5)**:
   - 4 Adjacent Hangars: `BA5-01`, `BA5-02`, `BA5-03`, `BA5-04`
   - Dimensions: $450.00\text{ m} \times 36.00\text{ m}$ each (304 Footings, 528 Tie Beams each)

---

## 🚀 Key Features

- **Pure HTML5 2D Canvas CAD Engine**: Zero heavy WebGL dependencies, instant sub-50ms loading, 60 FPS buttery-smooth pan & cursor-centered zoom.
- **Interactive Multi-Hangar Carousel**: Scrollable reel for switching across all 9 drawings.
- **Real-Time Foundation Status Tracking**:
  - 🟢 **Inspected / QA-QC Accepted**
  - 🔵 **Poured**
  - ⚪ **Pending / In Progress**
- **Cloud Backend & RBAC**:
  - **Firebase Authentication** & **Cloud Firestore Realtime Sync**.
  - **Administrator Account** (`admin@gcb.dz`): Full editing, bulk batch updates by zone/axis, data reset, JSON import.
  - **Viewer Account** (`viewer@gcb.dz`): Read-only inspection, live status viewing, data export.
- **HD Snapshot Export**: Downloads $2400 \times 1600\text{ px}$ image with embedded official drawing title cartouche, scale, and color-coded status legend.
- **Spreadsheet Integration**: Export/Import CSV & JSON reports for each building.

---

## 🌐 Quick Start / Running Locally

1. Clone or download this repository.
2. Open `index.html` directly in any web browser, or run a local server:
   ```bash
   python -m http.server 8080
   ```
3. Open `http://localhost:8080` in your browser.
