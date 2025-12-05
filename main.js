window.addEventListener("DOMContentLoaded", () => {
  console.log(">>> main.js loaded");

  // ================== LAYER SYSTEM =====================

  let layers = [];
  let selectedLayer = null;

  class Layer {
    constructor() {
      this.enabled = true;
      this.opacity = 1.0;
      this.blend = "normal"; // normal | add | screen | multiply
      this.source = null;
      this.type = "shader";
      this.kind = "shader";  // "shader" = background/fullscreen, "object" = overlay object
      this.visualMode = 0;   // 0..14
      this.colorTheme = 0;   // 0..7
      this.offsetX = 0.0;
      this.offsetY = 0.0;
      this.audioPositionReact = false;
      this.strobeIntensity = 0.0; // 0..1
    }
  }

  // DOM references
  const layerContainer = document.getElementById("layerContainer");
  const addLayerBtn = document.getElementById("addLayerBtn");
  const inspectorContent = document.getElementById("inspectorContent");
  const brightnessControl = document.getElementById("brightness");
  const quickEffects = document.getElementById("quickEffects");

  const audioReactSlider = document.getElementById("audioReact");

  const tapTempoBtn = document.getElementById("tapTempoBtn");
  const bpmDisplay = document.getElementById("bpmDisplay");

  const cameraZoomSlider = document.getElementById("cameraZoom");
  const cameraRotateSlider = document.getElementById("cameraRotate");

  const moodSelect = document.getElementById("moodSelect");

  const logoTextInput = document.getElementById("logoTextInput");
  const logoVisibleCheckbox = document.getElementById("logoVisible");
  const logoSizeSlider = document.getElementById("logoSize");
  const logoTextDisplay = document.getElementById("logoTextDisplay");
  const overlayHud = document.getElementById("overlayHud");

  const presetNameInput = document.getElementById("presetName");
  const presetSelect = document.getElementById("presetSelect");
  const savePresetBtn = document.getElementById("savePresetBtn");
  const loadPresetBtn = document.getElementById("loadPresetBtn");
  const deletePresetBtn = document.getElementById("deletePresetBtn");

  const autoSwitchEnabledCheckbox = document.getElementById("autoSwitchEnabled");
  const autoSwitchIntervalSlider = document.getElementById("autoSwitchInterval");

  // Right panel performance controls
  const macroEnergySlider = document.getElementById("macroEnergy");
  const macroMotionSlider = document.getElementById("macroMotion");
  const macroDetailSlider = document.getElementById("macroDetail");
  const layerMuteRow = document.getElementById("layerMuteRow");

  if (!layerContainer || !addLayerBtn || !inspectorContent || !brightnessControl) {
    console.error("Missing key DOM elements. Check IDs in index.html.");
    return;
  }

  // High-level mood / genre looks
  const moodPresets = {
    chill: {
      name: "Chill / Ambient",
      brightness: 0.45,
      audioReact: 0.7,
      cameraZoom: 1.1,
      cameraRotateDeg: 0,
      // Soft clouds + rings + pixel for BG, orbit as optional object
      layerVisualModes: [8, 11, 4, 5],
      layerColorThemes: [4, 0, 7],
      layerBlends: ["normal", "screen", "screen", "add"]
    },
    edm: {
      name: "Peak EDM / Festival",
      brightness: 0.9,
      audioReact: 1.7,
      cameraZoom: 0.85,
      cameraRotateDeg: 8,
      // Bars + laser web + orbit + rings
      layerVisualModes: [6, 10, 5, 11],
      layerColorThemes: [2, 3, 6],
      layerBlends: ["add", "screen", "add", "screen"]
    },
    dubstep: {
      name: "Dubstep / Heavy Bass",
      brightness: 0.8,
      audioReact: 1.9,
      cameraZoom: 0.9,
      cameraRotateDeg: -10,
      // Swirl + bars + stars + laser web
      layerVisualModes: [2, 6, 7, 10],
      layerColorThemes: [5, 2, 6],
      layerBlends: ["add", "add", "screen", "add"]
    },
    techno: {
      name: "Techno / Minimal",
      brightness: 0.55,
      audioReact: 1.0,
      cameraZoom: 1.0,
      cameraRotateDeg: 0,
      // Tunnel + horizon + kaleido grid
      layerVisualModes: [3, 9, 1],
      layerColorThemes: [3, 6, 0],
      layerBlends: ["normal", "screen", "multiply"]
    },
    lofi: {
      name: "Lofi / Soft Pastel",
      brightness: 0.4,
      audioReact: 0.6,
      cameraZoom: 1.2,
      cameraRotateDeg: 0,
      // Pixel + clouds + rings, pastel themes
      layerVisualModes: [4, 8, 11],
      layerColorThemes: [7, 4, 0],
      layerBlends: ["normal", "screen", "screen"]
    },
    psy: {
      name: "Psytrance / Hypno",
      brightness: 0.85,
      audioReact: 1.5,
      cameraZoom: 0.95,
      cameraRotateDeg: 20,
      // Kaleido + swirl + laser web + starfield
      layerVisualModes: [1, 2, 10, 7],
      layerColorThemes: [2, 7, 3, 6],
      layerBlends: ["add", "screen", "add", "screen"]
    }
  };

  // Global camera state
  let cameraZoom = parseFloat(cameraZoomSlider.value || "1");
  let cameraRotateDeg = parseFloat(cameraRotateSlider.value || "0");

  cameraZoomSlider.addEventListener("input", () => {
    cameraZoom = parseFloat(cameraZoomSlider.value || "1");
  });

  cameraRotateSlider.addEventListener("input", () => {
    cameraRotateDeg = parseFloat(cameraRotateSlider.value || "0");
  });

  // Logo state (text + size)
  let logoSize = parseFloat(logoSizeSlider.value || "18");

  function updateLogoDisplay() {
    logoTextDisplay.textContent = logoTextInput.value || "";
    overlayHud.style.display = logoVisibleCheckbox.checked ? "block" : "none";
    overlayHud.style.fontSize = logoSize + "px";
  }

  logoTextInput.addEventListener("input", updateLogoDisplay);
  logoVisibleCheckbox.addEventListener("change", updateLogoDisplay);
  logoSizeSlider.addEventListener("input", () => {
    logoSize = parseFloat(logoSizeSlider.value || "18");
    updateLogoDisplay();
  });

  updateLogoDisplay();

  // Presets storage
  let presets = [];

  function loadPresetsFromStorage() {
    try {
      const raw = localStorage.getItem("vj_presets_v1");
      if (!raw) return;
      presets = JSON.parse(raw) || [];
      refreshPresetSelect();
    } catch (e) {
      console.error("Failed to load presets", e);
    }
  }

  function savePresetsToStorage() {
    try {
      localStorage.setItem("vj_presets_v1", JSON.stringify(presets));
    } catch (e) {
      console.error("Failed to save presets", e);
    }
  }

  function refreshPresetSelect() {
    presetSelect.innerHTML = '<option value="">-- Select preset --</option>';
    presets.forEach((p, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = p.name;
      presetSelect.appendChild(opt);
    });
  }

  function captureCurrentPreset(name) {
    return {
      name,
      brightness: parseFloat(brightnessControl.value || "0.5"),
      cameraZoom,
      cameraRotateDeg,
      audioReact: parseFloat(audioReactSlider.value || "1"),
      logoText: logoTextInput.value || "",
      logoVisible: !!logoVisibleCheckbox.checked,
      logoSize: logoSize,
      layers: layers.map(l => ({
        enabled: l.enabled,
        opacity: l.opacity,
        blend: l.blend,
        kind: l.kind,
        visualMode: l.visualMode,
        colorTheme: l.colorTheme,
        offsetX: l.offsetX,
        offsetY: l.offsetY,
        audioPositionReact: l.audioPositionReact,
        strobeIntensity: l.strobeIntensity
      }))
    };
  }

  function applyPreset(preset) {
    if (!preset) return;

    brightnessControl.value = String(preset.brightness ?? 0.5);
    cameraZoom = preset.cameraZoom ?? 1;
    cameraRotateDeg = preset.cameraRotateDeg ?? 0;
    cameraZoomSlider.value = String(cameraZoom);
    cameraRotateSlider.value = String(cameraRotateDeg);

    audioReactSlider.value = String(preset.audioReact ?? 1);

    logoTextInput.value = preset.logoText ?? "";
    logoVisibleCheckbox.checked = !!preset.logoVisible;
    logoSize = preset.logoSize ?? 18;
    logoSizeSlider.value = String(logoSize);
    updateLogoDisplay();

    layers = [];
    (preset.layers || []).forEach(pl => {
      const l = new Layer();
      l.enabled = pl.enabled ?? true;
      l.opacity = pl.opacity ?? 1;
      l.blend = pl.blend ?? "normal";
      l.kind = pl.kind ?? "shader";
      l.visualMode = pl.visualMode ?? 0;
      l.colorTheme = pl.colorTheme ?? 0;
      l.offsetX = pl.offsetX ?? 0;
      l.offsetY = pl.offsetY ?? 0;
      l.audioPositionReact = !!pl.audioPositionReact;
      l.strobeIntensity = pl.strobeIntensity ?? 0;
      layers.push(l);
    });

    if (layers.length === 0) {
      layers.push(new Layer());
    }
    selectedLayer = 0;
    updateLayerUI();
    updateInspector();
    updateQuickEffects();
  }

  savePresetBtn.addEventListener("click", () => {
    const name = (presetNameInput.value || "").trim();
    if (!name) {
      alert("Enter a preset name.");
      return;
    }
    const existingIndex = presets.findIndex(p => p.name === name);
    const presetData = captureCurrentPreset(name);
    if (existingIndex >= 0) {
      presets[existingIndex] = presetData;
    } else {
      presets.push(presetData);
    }
    savePresetsToStorage();
    refreshPresetSelect();
    presetNameInput.value = "";
  });

  loadPresetBtn.addEventListener("click", () => {
    const idx = parseInt(presetSelect.value, 10);
    if (isNaN(idx) || !presets[idx]) {
      alert("Select a preset to load.");
      return;
    }
    applyPreset(presets[idx]);
  });

  deletePresetBtn.addEventListener("click", () => {
    const idx = parseInt(presetSelect.value, 10);
    if (isNaN(idx) || !presets[idx]) {
      alert("Select a preset to delete.");
      return;
    }
    presets.splice(idx, 1);
    savePresetsToStorage();
    refreshPresetSelect();
  });

  loadPresetsFromStorage();

  // Auto scene switching
  let autoSwitchEnabled = false;
  let autoSwitchInterval = parseFloat(autoSwitchIntervalSlider.value || "20");
  let autoSwitchIndex = 0;
  let lastSwitchTime = performance.now();

  autoSwitchEnabledCheckbox.addEventListener("change", () => {
    autoSwitchEnabled = autoSwitchEnabledCheckbox.checked;
    lastSwitchTime = performance.now();
    autoSwitchIndex = 0;
  });

  autoSwitchIntervalSlider.addEventListener("input", () => {
    autoSwitchInterval = parseFloat(autoSwitchIntervalSlider.value || "20");
  });

  // Tap tempo / BPM
  let bpm = 120;
  let tapTimes = [];
  let beatPhaseStart = performance.now();

  function updateBpmDisplay() {
    bpmDisplay.textContent = `${Math.round(bpm)} BPM`;
  }
  updateBpmDisplay();

  tapTempoBtn.addEventListener("click", () => {
    const now = performance.now();
    if (tapTimes.length > 0 && now - tapTimes[tapTimes.length - 1] > 2000) {
      tapTimes = [];
    }
    tapTimes.push(now);
    if (tapTimes.length > 6) {
      tapTimes.shift();
    }
    if (tapTimes.length >= 2) {
      let intervals = [];
      for (let i = 1; i < tapTimes.length; i++) {
        intervals.push(tapTimes[i] - tapTimes[i - 1]);
      }
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const newBpm = 60000 / avg;
      if (!isNaN(newBpm) && newBpm > 40 && newBpm < 240) {
        bpm = newBpm;
        beatPhaseStart = now;
        updateBpmDisplay();
      }
    }
  });

  // Mood selector
  if (moodSelect) {
    moodSelect.addEventListener("change", () => {
      const id = moodSelect.value;
      if (!id || !moodPresets[id]) return;

      const cfg = moodPresets[id];

      brightnessControl.value = String(cfg.brightness);
      audioReactSlider.value = String(cfg.audioReact);

      cameraZoom = cfg.cameraZoom;
      cameraRotateDeg = cfg.cameraRotateDeg;
      cameraZoomSlider.value = String(cameraZoom);
      cameraRotateSlider.value = String(cameraRotateDeg);

      if (layers.length === 0) {
        layers.push(new Layer());
        selectedLayer = 0;
      }

      layers.forEach((layer, i) => {
        const vm = cfg.layerVisualModes;
        const ct = cfg.layerColorThemes;
        const bl = cfg.layerBlends;

        layer.visualMode = vm[i % vm.length];
        layer.colorTheme = ct[i % ct.length];
        layer.blend = bl[i % bl.length];
        layer.kind = "shader";
      });

      updateLayerUI();
      updateInspector();
      updateQuickEffects();
    });
  }

  // ----- Macro sliders -----
  let macroEnergy = parseFloat(macroEnergySlider.value || "0.5");
  let macroMotion = parseFloat(macroMotionSlider.value || "0.5");
  let macroDetail = parseFloat(macroDetailSlider.value || "0.5");

  macroEnergySlider.addEventListener("input", () => {
    macroEnergy = parseFloat(macroEnergySlider.value || "0.5");
  });
  macroMotionSlider.addEventListener("input", () => {
    macroMotion = parseFloat(macroMotionSlider.value || "0.5");
  });
  macroDetailSlider.addEventListener("input", () => {
    macroDetail = parseFloat(macroDetailSlider.value || "0.5");
  });

  // ----- Layer UI helpers -----

  function visualModeName(mode) {
    switch (mode | 0) {
      case 0: return "Radial";
      case 1: return "Kaleido";
      case 2: return "Swirl";
      case 3: return "Tunnel";
      case 4: return "Pixel";
      case 5: return "Orbit";
      case 6: return "Bars";
      case 7: return "Stars";
      case 8: return "Clouds";
      case 9: return "Horizon";
      case 10: return "Laser Web";
      case 11: return "Rings";
      case 12: return "Orb";
      case 13: return "Corners";
      case 14: return "Halo";
      default: return "FX";
    }
  }

  function addLayer(layer) {
    if (layers.length >= 4) {
      alert("Limiting to 4 layers for now.");
      return;
    }
    layers.push(layer);
    if (selectedLayer === null) selectedLayer = 0;
    updateLayerUI();
    updateInspector();
    updateQuickEffects();
  }

  addLayer(new Layer());

  addLayerBtn.addEventListener("click", () => {
    addLayer(new Layer());
  });

  function updateLayerMuteRow() {
    if (!layerMuteRow) return;
    layerMuteRow.innerHTML = "";

    layers.forEach((layer, index) => {
      if (index >= 4) return;
      const btn = document.createElement("button");
      btn.className = "layerMuteBtn";
      if (!layer.enabled) btn.classList.add("muted");
      if (selectedLayer === index) btn.classList.add("selected");
      btn.textContent = `L${index + 1}`;
      btn.title = layer.enabled ? "Click to mute" : "Click to unmute";
      btn.addEventListener("click", () => {
        layer.enabled = !layer.enabled;
        updateLayerUI();
      });
      layerMuteRow.appendChild(btn);
    });
  }

  function updateLayerUI() {
    layerContainer.innerHTML = "";

    layers.forEach((layer, index) => {
      const div = document.createElement("div");
      div.className = "layer";
      if (selectedLayer === index) div.classList.add("active");

      const modeLabel = visualModeName(layer.visualMode);

      div.innerHTML = `
        <div class="layer-header">
          <span class="layer-title">Layer ${index + 1}</span>
          <span class="layer-kind-pill ${layer.kind === "object" ? "kind-object" : "kind-shader"}">
            ${layer.kind === "object" ? "OBJ" : "BG"}
          </span>
        </div>
        <div class="layer-meta">
          <span class="layer-color-dot theme-${layer.colorTheme}"></span>
          <span class="layer-meta-text">${modeLabel}</span>
        </div>
        <div class="layer-controls">
          <button data-action="mute" data-index="${index}">
            ${layer.enabled ? "Mute" : "Unmute"}
          </button>
          <button data-action="select" data-index="${index}">
            Select
          </button>
        </div>
      `;

      layerContainer.appendChild(div);
    });

    layerContainer.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", e => {
        const idx = parseInt(e.target.dataset.index, 10);
        const action = e.target.dataset.action;
        if (action === "mute") {
          layers[idx].enabled = !layers[idx].enabled;
          updateLayerUI();
        } else if (action === "select") {
          selectedLayer = idx;
          updateLayerUI();
          updateInspector();
          updateQuickEffects();
        }
      });
    });

    updateLayerMuteRow();
  }

  function updateInspector() {
    if (selectedLayer === null) {
      inspectorContent.innerHTML = "<p>No layer selected</p>";
      return;
    }

    const layer = layers[selectedLayer];

    inspectorContent.innerHTML = `
      <div class="inspector-group">
        <div class="control-row">
          <label><strong>Layer ${selectedLayer + 1}</strong></label>
        </div>

        <div class="control-row">
          <label>Layer Type</label>
          <select id="layerKind">
            <option value="shader" ${layer.kind === "shader" ? "selected" : ""}>Background / Fullscreen</option>
            <option value="object" ${layer.kind === "object" ? "selected" : ""}>Object Overlay</option>
          </select>
        </div>

        <div class="control-row">
          <label>Opacity</label>
          <input
            type="range"
            id="layerOpacity"
            min="0"
            max="1"
            step="0.01"
            value="${layer.opacity}"
          />
        </div>

        <details id="effectsPanel" open>
          <summary>Effects</summary>
          <div class="effects-body">

            <div class="control-row">
              <label>Visual Mode</label>
              <select id="layerVisualMode">
                <option value="0" ${layer.visualMode === 0 ? "selected" : ""}>Radial Waves</option>
                <option value="1" ${layer.visualMode === 1 ? "selected" : ""}>Kaleido Grid</option>
                <option value="2" ${layer.visualMode === 2 ? "selected" : ""}>Swirl Orbit</option>
                <option value="3" ${layer.visualMode === 3 ? "selected" : ""}>Tunnel Lines</option>
                <option value="4" ${layer.visualMode === 4 ? "selected" : ""}>Pixel Mosaic</option>
                <option value="5" ${layer.visualMode === 5 ? "selected" : ""}>Orbital Objects</option>
                <option value="6" ${layer.visualMode === 6 ? "selected" : ""}>Audio Bars</option>
                <option value="7" ${layer.visualMode === 7 ? "selected" : ""}>Starfield</option>
                <option value="8" ${layer.visualMode === 8 ? "selected" : ""}>Soft Clouds</option>
                <option value="9" ${layer.visualMode === 9 ? "selected" : ""}>Horizon Lines</option>
                <option value="10" ${layer.visualMode === 10 ? "selected" : ""}>Laser Web</option>
                <option value="11" ${layer.visualMode === 11 ? "selected" : ""}>Rings + Bloom</option>
                <option value="12" ${layer.visualMode === 12 ? "selected" : ""}>Orb Pulse (Object)</option>
                <option value="13" ${layer.visualMode === 13 ? "selected" : ""}>Corner Flares (Object)</option>
                <option value="14" ${layer.visualMode === 14 ? "selected" : ""}>Halo Ring (Object)</option>
              </select>
            </div>

            <div class="control-row">
              <label>Color Theme</label>
              <select id="layerColorTheme">
                <option value="0" ${layer.colorTheme === 0 ? "selected" : ""}>Cool</option>
                <option value="1" ${layer.colorTheme === 1 ? "selected" : ""}>Warm</option>
                <option value="2" ${layer.colorTheme === 2 ? "selected" : ""}>Neon</option>
                <option value="3" ${layer.colorTheme === 3 ? "selected" : ""}>Cyber Grid</option>
                <option value="4" ${layer.colorTheme === 4 ? "selected" : ""}>Sunset</option>
                <option value="5" ${layer.colorTheme === 5 ? "selected" : ""}>Toxic Green</option>
                <option value="6" ${layer.colorTheme === 6 ? "selected" : ""}>Ice Laser</option>
                <option value="7" ${layer.colorTheme === 7 ? "selected" : ""}>Vaporwave</option>
              </select>
            </div>

            <div class="control-row">
              <label>Blend Mode</label>
              <select id="layerBlendMode">
                <option value="normal" ${layer.blend === "normal" ? "selected" : ""}>Normal</option>
                <option value="add" ${layer.blend === "add" ? "selected" : ""}>Add</option>
                <option value="screen" ${layer.blend === "screen" ? "selected" : ""}>Screen</option>
                <option value="multiply" ${layer.blend === "multiply" ? "selected" : ""}>Multiply</option>
              </select>
            </div>

            <div class="control-row">
              <label>Position X</label>
              <input
                type="range"
                id="layerPosX"
                min="-1"
                max="1"
                step="0.01"
                value="${layer.offsetX}"
              />
            </div>

            <div class="control-row">
              <label>Position Y</label>
              <input
                type="range"
                id="layerPosY"
                min="-1"
                max="1"
                step="0.01"
                value="${layer.offsetY}"
              />
            </div>

            <div class="control-row">
              <label style="display:flex; align-items:center; gap:4px;">
                <input type="checkbox" id="layerAudioPosReact" ${layer.audioPositionReact ? "checked" : ""} />
                Audio-reactive position (bass wobble)
              </label>
            </div>

            <div class="control-row">
              <label>Strobe / Flash</label>
              <input
                type="range"
                id="layerStrobe"
                min="0"
                max="1"
                step="0.01"
                value="${layer.strobeIntensity}"
              />
            </div>

          </div>
        </details>
      </div>
    `;

    const kindSelect = document.getElementById("layerKind");
    const opacitySlider = document.getElementById("layerOpacity");
    const modeSelect = document.getElementById("layerVisualMode");
    const themeSelect = document.getElementById("layerColorTheme");
    const blendSelect = document.getElementById("layerBlendMode");
    const posXSlider = document.getElementById("layerPosX");
    const posYSlider = document.getElementById("layerPosY");
    const audioPosReactCheckbox = document.getElementById("layerAudioPosReact");
    const strobeSlider = document.getElementById("layerStrobe");

    kindSelect.addEventListener("change", e => {
      layer.kind = e.target.value;
      updateQuickEffects();
      updateLayerUI();
    });

    opacitySlider.addEventListener("input", e => {
      layer.opacity = parseFloat(e.target.value);
    });

    modeSelect.addEventListener("change", e => {
      layer.visualMode = parseInt(e.target.value, 10);
      updateQuickEffects();
      updateLayerUI();
    });

    themeSelect.addEventListener("change", e => {
      layer.colorTheme = parseInt(e.target.value, 10);
      updateQuickEffects();
      updateLayerUI();
    });

    blendSelect.addEventListener("change", e => {
      layer.blend = e.target.value;
    });

    posXSlider.addEventListener("input", e => {
      layer.offsetX = parseFloat(e.target.value);
    });

    posYSlider.addEventListener("input", e => {
      layer.offsetY = parseFloat(e.target.value);
    });

    audioPosReactCheckbox.addEventListener("change", e => {
      layer.audioPositionReact = e.target.checked;
    });

    strobeSlider.addEventListener("input", e => {
      layer.strobeIntensity = parseFloat(e.target.value);
      updateQuickEffects();
    });
  }

  // Quick Effects panel on the right
  function updateQuickEffects() {
    if (!quickEffects) return;

    if (selectedLayer === null) {
      quickEffects.innerHTML = `<p style="font-size:11px; color:#aaa;">No layer selected</p>`;
      return;
    }

    const layer = layers[selectedLayer];

    quickEffects.innerHTML = `
      <h4>Layer ${selectedLayer + 1} (${layer.kind === "object" ? "Object" : "BG"})</h4>
      <div class="qe-row">
        <label>Visual Mode</label>
        <select id="qeVisualMode">
          <option value="0" ${layer.visualMode === 0 ? "selected" : ""}>Radial</option>
          <option value="1" ${layer.visualMode === 1 ? "selected" : ""}>Kaleido</option>
          <option value="2" ${layer.visualMode === 2 ? "selected" : ""}>Swirl</option>
          <option value="3" ${layer.visualMode === 3 ? "selected" : ""}>Tunnel</option>
          <option value="4" ${layer.visualMode === 4 ? "selected" : ""}>Pixel</option>
          <option value="5" ${layer.visualMode === 5 ? "selected" : ""}>Orbit</option>
          <option value="6" ${layer.visualMode === 6 ? "selected" : ""}>Bars</option>
          <option value="7" ${layer.visualMode === 7 ? "selected" : ""}>Stars</option>
          <option value="8" ${layer.visualMode === 8 ? "selected" : ""}>Clouds</option>
          <option value="9" ${layer.visualMode === 9 ? "selected" : ""}>Horizon</option>
          <option value="10" ${layer.visualMode === 10 ? "selected" : ""}>Laser Web</option>
          <option value="11" ${layer.visualMode === 11 ? "selected" : ""}>Rings</option>
          <option value="12" ${layer.visualMode === 12 ? "selected" : ""}>Orb</option>
          <option value="13" ${layer.visualMode === 13 ? "selected" : ""}>Corners</option>
          <option value="14" ${layer.visualMode === 14 ? "selected" : ""}>Halo</option>
        </select>
      </div>
      <div class="qe-row">
        <label>Color Theme</label>
        <select id="qeColorTheme">
          <option value="0" ${layer.colorTheme === 0 ? "selected" : ""}>Cool</option>
          <option value="1" ${layer.colorTheme === 1 ? "selected" : ""}>Warm</option>
          <option value="2" ${layer.colorTheme === 2 ? "selected" : ""}>Neon</option>
          <option value="3" ${layer.colorTheme === 3 ? "selected" : ""}>Cyber</option>
          <option value="4" ${layer.colorTheme === 4 ? "selected" : ""}>Sunset</option>
          <option value="5" ${layer.colorTheme === 5 ? "selected" : ""}>Toxic</option>
          <option value="6" ${layer.colorTheme === 6 ? "selected" : ""}>Ice</option>
          <option value="7" ${layer.colorTheme === 7 ? "selected" : ""}>Vaporwave</option>
        </select>
      </div>
      <div class="qe-row">
        <label>Strobe / Flash</label>
        <input
          type="range"
          id="qeStrobe"
          min="0"
          max="1"
          step="0.01"
          value="${layer.strobeIntensity}"
        />
      </div>
    `;

    const qeMode = document.getElementById("qeVisualMode");
    const qeTheme = document.getElementById("qeColorTheme");
    const qeStrobe = document.getElementById("qeStrobe");

    qeMode.addEventListener("change", e => {
      layer.visualMode = parseInt(e.target.value, 10);
      updateInspector();
      updateLayerUI();
    });

    qeTheme.addEventListener("change", e => {
      layer.colorTheme = parseInt(e.target.value, 10);
      updateInspector();
      updateLayerUI();
    });

    qeStrobe.addEventListener("input", e => {
      layer.strobeIntensity = parseFloat(e.target.value);
      updateInspector();
    });
  }

  // ================== AUDIO: FILE + PLAYLIST =====================

  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  const freqData = new Uint8Array(analyser.frequencyBinCount);

  const audioInput = document.getElementById("audioInput");
  const audioPlayer = document.getElementById("audioPlayer");
  const deckGrid = document.getElementById("deckGrid");

  let audioSource = null;
  let tracks = [];
  let currentTrackIndex = -1;

  if (!audioInput || !audioPlayer || !deckGrid) {
    console.error("Audio elements missing.");
    return;
  }

  window.addEventListener("click", () => {
    if (audioContext.state !== "running") {
      audioContext.resume();
    }
  });

  audioInput.addEventListener("change", function () {
    const files = Array.from(this.files || []);
    tracks = files.map(file => ({
      file,
      name: file.name,
      url: URL.createObjectURL(file),
    }));

    renderPlaylist();

    if (tracks.length > 0) {
      playTrack(0);
    }
  });

  function renderPlaylist() {
    deckGrid.innerHTML = "";
    tracks.forEach((track, index) => {
      const div = document.createElement("div");
      div.className = "deckItem";
      if (index === currentTrackIndex) div.classList.add("active");
      div.textContent = track.name;
      div.addEventListener("click", () => playTrack(index));
      deckGrid.appendChild(div);
    });
  }

  function playTrack(index) {
    if (!tracks[index]) return;
    currentTrackIndex = index;

    renderPlaylist();

    const track = tracks[index];
    audioPlayer.src = track.url;
    audioPlayer.load();
    audioPlayer.play();

    if (audioSource) audioSource.disconnect();

    audioSource = audioContext.createMediaElementSource(audioPlayer);
    audioSource.connect(analyser);
    analyser.connect(audioContext.destination);
  }

  function getBands() {
    analyser.getByteFrequencyData(freqData);

    function avgRange(start, end) {
      let sum = 0;
      let count = 0;
      for (let i = start; i < end && i < freqData.length; i++) {
        sum += freqData[i];
        count++;
      }
      return count ? sum / count : 0;
    }

    const bass = avgRange(0, 40) / 255;
    const mid = avgRange(40, 200) / 255;
    const high = avgRange(200, 512) / 255;

    return { bass, mid, high };
  }

  // ================== WEBGL VISUALS =====================

  const canvas = document.getElementById("stage");
  const gl = canvas.getContext("webgl");

  if (!gl) {
    console.error("WebGL not supported");
    return;
  }

  function resizeCanvas() {
    const wrapper = document.getElementById("stageWrapper");
    const width = wrapper.clientWidth;
    const height = wrapper.clientHeight;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  }

  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  const vertSrc = `
    attribute vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const fragSrc = `
    precision mediump float;
    uniform float u_time;
    uniform vec2  u_resolution;
    uniform float u_bass;
    uniform float u_mid;
    uniform float u_high;
    uniform float u_brightness;
    uniform float u_opacity;
    uniform float u_mode;
    uniform float u_theme;
    uniform float u_zoom;
    uniform float u_rotate;
    uniform float u_offsetX;
    uniform float u_offsetY;
    uniform float u_strobe;
    uniform float u_beatPhase;
    uniform float u_kind;   // 0 = shader BG, 1 = object overlay

    vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
      return a + b * cos(6.28318 * (c * t + d));
    }

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 345.45));
      p += dot(p, p + 34.345);
      return fract(p.x * p.y);
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution.xy;
      vec2 p  = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);

      p *= u_zoom;
      float ca = cos(u_rotate);
      float sa = sin(u_rotate);
      p = mat2(ca, -sa, sa, ca) * p;

      p += vec2(u_offsetX, u_offsetY);

      float r   = length(p);
      float ang = atan(p.y, p.x);
      float t   = u_time;

      vec3 A;
      vec3 B;
      vec3 C;
      vec3 D;

      if (u_theme < 0.5) {
        A = vec3(0.13, 0.18, 0.25);
        B = vec3(0.3, 0.6, 1.0);
        C = vec3(0.35, 0.45, 0.75);
        D = vec3(0.2, 0.4, 0.9);
      } else if (u_theme < 1.5) {
        A = vec3(0.22, 0.14, 0.10);
        B = vec3(1.0, 0.5, 0.1);
        C = vec3(0.5, 0.25, 0.1);
        D = vec3(0.15, 0.05, 0.0);
      } else if (u_theme < 2.5) {
        A = vec3(0.05, 0.05, 0.10);
        B = vec3(1.0, 0.2, 1.4);
        C = vec3(0.7, 0.4, 0.9);
        D = vec3(0.2, 0.4, 1.0);
      } else if (u_theme < 3.5) {
        A = vec3(0.05, 0.20, 0.08);
        B = vec3(0.1, 1.0, 0.5);
        C = vec3(0.3, 0.8, 0.5);
        D = vec3(0.0, 0.4, 0.1);
      } else if (u_theme < 4.5) {
        A = vec3(0.4, 0.1, 0.2);
        B = vec3(1.0, 0.6, 0.3);
        C = vec3(0.9, 0.3, 0.5);
        D = vec3(0.3, 0.1, 0.5);
      } else if (u_theme < 5.5) {
        A = vec3(0.0, 0.2, 0.05);
        B = vec3(0.7, 1.0, 0.1);
        C = vec3(0.3, 0.9, 0.1);
        D = vec3(0.1, 0.4, 0.0);
      } else if (u_theme < 6.5) {
        A = vec3(0.05, 0.08, 0.15);
        B = vec3(0.3, 0.8, 1.5);
        C = vec3(0.2, 0.6, 1.0);
        D = vec3(0.0, 0.3, 0.9);
      } else {
        A = vec3(0.15, 0.07, 0.20);
        B = vec3(0.9, 0.4, 1.2);
        C = vec3(0.4, 0.3, 0.9);
        D = vec3(0.1, 0.8, 0.9);
      }

      float bgT = uv.y + uv.x * 0.3 + t * 0.03;
      vec3 bg   = palette(bgT, A, B, C, D) * 0.25;

      vec3 fx = vec3(0.0);

      if (u_mode < 0.5) {
        // 0: Radial Waves
        float w = sin(10.0 * r - t * (2.0 + u_bass * 6.0));
        float v = 0.5 + 0.5 * w;
        float pattern = v + 0.25 * sin(ang * 6.0 + t * (1.0 + u_mid * 3.0));
        fx = palette(pattern + u_bass * 0.5, A, B, C, D);

      } else if (u_mode < 1.5) {
        // 1: Kaleido Grid
        vec2 g = p;
        g = abs(g);
        g = fract(g * 4.0);
        float lines = smoothstep(0.48, 0.5, max(abs(g.x - 0.5), abs(g.y - 0.5)));
        float pulse = 0.5 + 0.5 * sin(t * (2.0 + u_bass * 8.0) + r * 10.0);
        float baseT = t * 0.25 + u_mid;
        vec3 baseCol = palette(baseT, A, B, C, D);
        fx = baseCol + lines * pulse * 1.5;

      } else if (u_mode < 2.5) {
        // 2: Swirl Orbit
        float swirl = sin(ang * 4.0 + r * 8.0 - t * (1.0 + u_bass * 4.0));
        float ring  = exp(-r * 4.0) * (0.5 + 0.5 * swirl);
        float spark = 0.5 + 0.5 * sin((p.x + p.y) * 30.0 + t * (4.0 + u_high * 10.0));
        float baseT = u_bass * 0.8 + t * 0.1;
        vec3 baseCol = palette(baseT, A, B, C, D);
        fx = baseCol * (0.4 + ring * 1.2) * (0.8 + 0.4 * spark);

      } else if (u_mode < 3.5) {
        // 3: Tunnel Lines
        vec2 q = p;
        float depth = 1.0 / (0.3 + length(q));
        float stripes = 0.5 + 0.5 * sin((q.y + t * (2.0 + u_bass * 6.0)) * 10.0);
        float rings   = 0.5 + 0.5 * sin((length(q) - t * (1.0 + u_mid * 4.0)) * 8.0);
        float m = mix(stripes, rings, 0.5 + 0.5 * u_high);
        float tt = depth + m + u_bass * 0.6;
        fx = palette(tt, A, B, C, D) * depth * 1.8;

      } else if (u_mode < 4.5) {
        // 4: Pixel Mosaic
        float scale = 30.0 + u_high * 40.0;
        vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
        vec2 pix = floor((uv * aspect) * scale) / scale;
        float cell = sin((pix.x + pix.y) * 20.0 + t * (3.0 + u_mid * 5.0));
        float pulse = 0.5 + 0.5 * sin(t * (2.0 + u_bass * 8.0));
        float tt = cell + pulse * 0.3 + u_bass * 0.5;
        fx = palette(tt, A, B, C, D);

      } else if (u_mode < 5.5) {
        // 5: Orbital Objects
        vec2 q = p;
        float accum = 0.0;
        for (float i = 0.0; i < 5.0; i += 1.0) {
          float angle = t * (0.3 + u_mid * 2.0) + i * 6.28318 / 5.0;
          float radius = 0.6 + 0.3 * sin(t + i * 1.7);
          vec2 center = vec2(cos(angle), sin(angle)) * radius;
          float d = length(q - center);
          float circle = smoothstep(0.25, 0.0, d);
          accum += circle;
        }
        float baseT = t * 0.2 + u_high * 0.8;
        vec3 baseCol = palette(baseT, A, B, C, D);
        fx = baseCol * accum * (0.6 + u_bass * 1.6);

      } else if (u_mode < 6.5) {
        // 6: Audio Bars
        vec2 uv2 = uv;
        float bands = 32.0;
        float bandIndex = floor(uv2.x * bands);
        float xNorm = bandIndex / (bands - 1.0);
        float amp = mix(u_bass, u_mid, xNorm) * 0.9 + 0.05;
        float barMask = step(uv2.y, amp);
        float border = smoothstep(amp, amp - 0.03, uv2.y);
        float glow = barMask * (0.35 + 0.65 * border);
        float tt = xNorm + t * 0.2 + u_high * 0.3;
        vec3 barColor = palette(tt, A, B, C, D);
        fx = barColor * glow * 1.8;

      } else if (u_mode < 7.5) {
        // 7: Starfield (overlay-friendly)
        vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
        vec2 grid = (uv * aspect) * 40.0;
        vec2 cell = floor(grid);
        vec2 f = fract(grid) - 0.5;

        float n = hash21(cell);
        float star = smoothstep(0.25, 0.0, length(f * (1.2 + n * 1.5)));
        float twinkle = 0.5 + 0.5 * sin(t * (2.0 + n * 6.0) + n * 10.0);
        float energy = star * twinkle * (0.3 + u_high * 1.7);
        float gate = step(0.82, n);

        vec3 starCol = palette(n + u_high + t * 0.05, A, B, C, D);
        fx = starCol * energy * gate;

      } else if (u_mode < 8.5) {
        // 8: Soft Clouds (ambient background)
        vec2 q = p * 1.2;
        float n1 = sin(q.x * 3.0 + t * 0.4) * sin(q.y * 2.7 - t * 0.3);
        float n2 = sin(q.x * 5.3 - t * 0.2) * cos(q.y * 4.1 + t * 0.35);
        float n = (n1 + n2) * 0.25;
        float tt = n + u_bass * 0.3 + u_mid * 0.2;
        fx = palette(tt, A, B, C, D) * 0.7;

      } else if (u_mode < 9.5) {
        // 9: Horizon Lines (rolling techno-ish)
        float horizon = uv.y;
        float base = smoothstep(0.0, 0.3, horizon);
        float scan = sin((horizon * 40.0 - t * (3.0 + u_mid * 6.0)));
        float strip = 0.5 + 0.5 * scan;
        float tt = horizon + t * 0.1 + u_bass * 0.4;
        vec3 baseCol = palette(tt, A, B, C, D);
        fx = baseCol * (base + strip * 0.6);

      } else if (u_mode < 10.5) {
        // 10: Laser Web (high-energy overlay)
        vec2 q = p * 1.4;
        float l1 = abs(sin(q.x * 12.0 + t * (4.0 + u_high * 8.0)));
        float l2 = abs(sin((q.y + q.x) * 10.0 - t * (3.0 + u_mid * 6.0)));
        float l3 = abs(sin((q.y - q.x) * 14.0 + t * (2.0 + u_bass * 4.0)));
        float web = pow(1.0 - min(min(l1, l2), l3), 2.0);
        float tt = t * 0.3 + u_high * 0.8;
        vec3 baseCol = palette(tt, A, B, C, D);
        fx = baseCol * web * (0.6 + u_high * 1.4);

      } else if (u_mode < 11.5) {
        // 11: Rings + Bloom (big pulses, background-friendly)
        float wave = sin(r * 16.0 - t * (3.0 + u_bass * 5.0));
        float ring = 0.5 + 0.5 * wave;
        float falloff = exp(-r * 3.0);
        float bloom = ring * falloff;
        float tt = r + t * 0.15 + u_mid * 0.4;
        vec3 baseCol = palette(tt, A, B, C, D);
        fx = baseCol * (0.4 + bloom * 2.0);

      } else if (u_mode < 12.5) {
        // 12: Orb Pulse (center object)
        float d = length(p);
        float orbMask = smoothstep(0.45, 0.0, d);
        float wave = 0.5 + 0.5 * sin(t * (2.0 + u_bass * 5.0) + d * 8.0);
        float tt = t * 0.4 + u_mid * 0.6;
        vec3 col = palette(tt, A, B, C, D);
        fx = col * orbMask * wave * (0.8 + u_high * 0.6);

      } else if (u_mode < 13.5) {
        // 13: Corner Flares (four small objects in corners)
        vec2 q = p * 1.4;
        float c1 = smoothstep(0.6, 0.0, length(q - vec2( 0.9,  0.6)));
        float c2 = smoothstep(0.6, 0.0, length(q - vec2(-0.9,  0.6)));
        float c3 = smoothstep(0.6, 0.0, length(q - vec2( 0.9, -0.6)));
        float c4 = smoothstep(0.6, 0.0, length(q - vec2(-0.9, -0.6)));
        float mask = clamp(c1 + c2 + c3 + c4, 0.0, 1.0);
        float tw = 0.5 + 0.5 * sin(t * (3.0 + u_high * 8.0));
        float tt = t * 0.3 + u_bass * 0.5 + u_high * 0.5;
        vec3 col = palette(tt, A, B, C, D);
        fx = col * mask * tw * (0.9 + u_high * 0.8);

      } else {
        // 14: Halo Ring (object halo)
        float innerR = 0.35;
        float outerR = 0.52;
        float band = smoothstep(innerR, innerR + 0.05, r) *
                     (1.0 - smoothstep(outerR - 0.05, outerR, r));
        float wob = 0.5 + 0.5 * sin(t * (2.5 + u_bass * 6.0) + ang * 6.0);
        float tt = t * 0.25 + u_mid * 0.4 + u_bass * 0.3;
        vec3 col = palette(tt, A, B, C, D);
        fx = col * band * wob * (0.8 + u_high * 0.7);
      }

      float vignette = smoothstep(0.9, 0.3, r);
      fx *= vignette;

      float beatPulse = 0.5 + 0.5 * sin(6.28318 * u_beatPhase);
      float flash = mix(1.0, 0.3 + beatPulse * 1.7, u_strobe);
      fx *= flash;

      vec3 color;
      float alpha;

      if (u_kind < 0.5) {
        color = mix(bg, fx, 0.9);
        alpha = u_opacity;
      } else {
        color = fx;
        float intensity = clamp((fx.r + fx.g + fx.b) / 3.0, 0.0, 1.0);
        alpha = u_opacity * intensity;
      }

      color *= u_brightness;
      gl_FragColor = vec4(color, alpha);
    }
  `;

  function createShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Shader compile error:", gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  const vertShader = createShader(gl.VERTEX_SHADER, vertSrc);
  const fragShader = createShader(gl.FRAGMENT_SHADER, fragSrc);

  const program = gl.createProgram();
  gl.attachShader(program, vertShader);
  gl.attachShader(program, fragShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Program link error:", gl.getProgramInfoLog(program));
  }
  gl.useProgram(program);

  const quadVerts = new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
    -1,  1,
     1, -1,
     1,  1
  ]);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);

  const posLoc = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  const uTimeLoc      = gl.getUniformLocation(program, "u_time");
  const uResLoc       = gl.getUniformLocation(program, "u_resolution");
  const uBassLoc      = gl.getUniformLocation(program, "u_bass");
  const uMidLoc       = gl.getUniformLocation(program, "u_mid");
  const uHighLoc      = gl.getUniformLocation(program, "u_high");
  const uBrightLoc    = gl.getUniformLocation(program, "u_brightness");
  const uOpacityLoc   = gl.getUniformLocation(program, "u_opacity");
  const uModeLoc      = gl.getUniformLocation(program, "u_mode");
  const uThemeLoc     = gl.getUniformLocation(program, "u_theme");
  const uZoomLoc      = gl.getUniformLocation(program, "u_zoom");
  const uRotateLoc    = gl.getUniformLocation(program, "u_rotate");
  const uOffsetXLoc   = gl.getUniformLocation(program, "u_offsetX");
  const uOffsetYLoc   = gl.getUniformLocation(program, "u_offsetY");
  const uStrobeLoc    = gl.getUniformLocation(program, "u_strobe");
  const uBeatPhaseLoc = gl.getUniformLocation(program, "u_beatPhase");
  const uKindLoc      = gl.getUniformLocation(program, "u_kind");

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  let startTime = performance.now();

  function render() {
    resizeCanvas();

    const now = performance.now();
    const t = (now - startTime) * 0.001;

    let { bass, mid, high } = getBands();

    // --- Audio reactivity mapping with soft compression ---
    let ar = parseFloat(audioReactSlider.value || "1");      // 0–2
    let baseReact = 0.3 + ar * 0.85;                         // ~0.3–2.0
    let energyFactor = 0.7 + macroEnergy * 0.7;              // 0.7–1.4
    let reactRaw = baseReact * energyFactor;
    let react = reactRaw / (1.0 + 0.7 * reactRaw);           // stays ~0–1

    let bassR = bass * react;
    let midR  = mid  * react;
    let highR = high * react;

    let detailBoost = 0.8 + macroDetail * 1.4;
    highR *= detailBoost;

    bassR = Math.min(1, bassR);
    midR  = Math.min(1, midR);
    highR = Math.min(1, highR);

    const baseBrightness = parseFloat(brightnessControl.value || "0.5");
    const brightness = baseBrightness * (0.7 + macroEnergy * 0.8);

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const motionAmt = macroMotion * 0.25;
    const wobble = (bassR - 0.5) * motionAmt;
    const zoom = cameraZoom * (1.0 - wobble);
    const rotateRad = (cameraRotateDeg * Math.PI) / 180.0 +
      motionAmt * (midR - highR) * 1.5;

    const logoGlow = 0.25 + bassR * 0.6;
    const logoScale = 1 + bassR * 0.25;
    overlayHud.style.backgroundColor = `rgba(0,0,0,${logoGlow})`;
    overlayHud.style.transform = `translateX(-50%) scale(${logoScale})`;

    if (autoSwitchEnabled && presets.length > 0) {
      const elapsedSec = (now - lastSwitchTime) / 1000;
      if (elapsedSec >= autoSwitchInterval) {
        autoSwitchIndex = (autoSwitchIndex + 1) % presets.length;
        applyPreset(presets[autoSwitchIndex]);
        lastSwitchTime = now;
      }
    }

    const beatSeconds = (now - beatPhaseStart) / 1000;
    const beatPhase = beatSeconds * (bpm / 60.0);

    layers.forEach(layer => {
      if (!layer.enabled || layer.opacity <= 0) return;

      switch (layer.blend) {
        case "add":
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
          break;
        case "screen":
          gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
          break;
        case "multiply":
          gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
          break;
        default:
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
          break;
      }

      let offX = layer.offsetX || 0;
      let offY = layer.offsetY || 0;
      if (layer.audioPositionReact) {
        const posScale = 0.5 + macroMotion;
        offX += (bassR - 0.5) * 0.5 * posScale;
        offY += (highR - 0.5) * 0.5 * posScale;
      }

      gl.uniform1f(uTimeLoc, t);
      gl.uniform2f(uResLoc, canvas.width, canvas.height);
      gl.uniform1f(uBassLoc, bassR);
      gl.uniform1f(uMidLoc, midR);
      gl.uniform1f(uHighLoc, highR);
      gl.uniform1f(uBrightLoc, brightness);
      gl.uniform1f(uOpacityLoc, layer.opacity);
      gl.uniform1f(uModeLoc, layer.visualMode);
      gl.uniform1f(uThemeLoc, layer.colorTheme);
      gl.uniform1f(uZoomLoc, zoom);
      gl.uniform1f(uRotateLoc, rotateRad);
      gl.uniform1f(uOffsetXLoc, offX);
      gl.uniform1f(uOffsetYLoc, offY);

      const strobeEffective = layer.strobeIntensity * (0.5 + macroEnergy * 0.8);
      gl.uniform1f(uStrobeLoc, strobeEffective);
      gl.uniform1f(uBeatPhaseLoc, beatPhase);
      gl.uniform1f(uKindLoc, layer.kind === "object" ? 1.0 : 0.0);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    });

    requestAnimationFrame(render);
  }

  render();
});
