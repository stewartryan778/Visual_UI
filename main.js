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
      this.source = null;    // future video/image
      this.type = "shader";
      this.visualMode = 0;   // 0..4
      this.colorTheme = 0;   // 0..7
      this.offsetX = 0.0;
      this.offsetY = 0.0;
      this.audioPositionReact = false;
      this.strobeIntensity = 0.0; // 0..1
    }
  }

  const layerContainer = document.getElementById("layerContainer");
  const addLayerBtn = document.getElementById("addLayerBtn");
  const inspectorContent = document.getElementById("inspectorContent");
  const brightnessControl = document.getElementById("brightness");

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

  if (
    !layerContainer ||
    !addLayerBtn ||
    !inspectorContent ||
    !brightnessControl
  ) {
    console.error("Missing key DOM elements. Check IDs in index.html.");
    return;
  }

  // High-level mood / genre looks (using 0..4 visual modes)
  const moodPresets = {
    chill: {
      name: "Chill / Ambient",
      brightness: 0.4,
      audioReact: 0.6,
      cameraZoom: 1.15,
      cameraRotateDeg: 0,
      layerVisualModes: [0, 3, 1],          // Radial, Tunnel, Kaleido
      layerColorThemes: [0, 4],
      layerBlends: ["normal", "screen"]
    },
    edm: {
      name: "Peak EDM / Festival",
      brightness: 0.9,
      audioReact: 1.6,
      cameraZoom: 0.85,
      cameraRotateDeg: 10,
      layerVisualModes: [2, 4, 3],          // Swirl, Pixel, Tunnel
      layerColorThemes: [2, 3, 7],
      layerBlends: ["add", "screen", "add"]
    },
    dubstep: {
      name: "Dubstep / Heavy Bass",
      brightness: 0.8,
      audioReact: 1.8,
      cameraZoom: 0.9,
      cameraRotateDeg: -8,
      layerVisualModes: [2, 3, 4],          // Swirl, Tunnel, Pixel
      layerColorThemes: [5, 2],
      layerBlends: ["add", "multiply"]
    },
    techno: {
      name: "Techno / Minimal",
      brightness: 0.5,
      audioReact: 1.1,
      cameraZoom: 1.0,
      cameraRotateDeg: 0,
      layerVisualModes: [1, 3, 4],          // Kaleido, Tunnel, Pixel
      layerColorThemes: [3, 0],
      layerBlends: ["screen", "normal"]
    },
    lofi: {
      name: "Lofi / Soft Pastel",
      brightness: 0.45,
      audioReact: 0.5,
      cameraZoom: 1.2,
      cameraRotateDeg: 0,
      layerVisualModes: [0, 4],             // Radial, Pixel
      layerColorThemes: [4, 7],
      layerBlends: ["normal", "screen"]
    },
    psy: {
      name: "Psytrance / Hypno",
      brightness: 0.85,
      audioReact: 1.4,
      cameraZoom: 0.95,
      cameraRotateDeg: 20,
      layerVisualModes: [2, 3, 1],          // Swirl, Tunnel, Kaleido
      layerColorThemes: [2, 7, 3],
      layerBlends: ["add", "screen", "add"]
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
      // too long since last tap -> reset
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
      const newBpm = 60000 / avg; // ms -> BPM
      if (!isNaN(newBpm) && newBpm > 40 && newBpm < 240) {
        bpm = newBpm;
        beatPhaseStart = now;
        updateBpmDisplay();
      }
    }
  });

  // Apply mood / genre look
  if (moodSelect) {
    moodSelect.addEventListener("change", () => {
      const id = moodSelect.value;
      if (!id || !moodPresets[id]) return;

      const cfg = moodPresets[id];

      // Global settings
      brightnessControl.value = String(cfg.brightness);
      audioReactSlider.value = String(cfg.audioReact);

      cameraZoom = cfg.cameraZoom;
      cameraRotateDeg = cfg.cameraRotateDeg;
      cameraZoomSlider.value = String(cameraZoom);
      cameraRotateSlider.value = String(cameraRotateDeg);

      // Ensure we have some layers
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
      });

      updateLayerUI();
      updateInspector();
    });
  }

  // ----- Layer UI -----

  function addLayer(layer) {
    layers.push(layer);
    if (selectedLayer === null) selectedLayer = 0;
    updateLayerUI();
    updateInspector();
  }

  addLayer(new Layer());

  addLayerBtn.addEventListener("click", () => {
    addLayer(new Layer());
  });

  function updateLayerUI() {
    layerContainer.innerHTML = "";

    layers.forEach((layer, index) => {
      const div = document.createElement("div");
      div.className = "layer";
      if (selectedLayer === index) div.classList.add("active");

      div.innerHTML = `
        <strong>Layer ${index + 1}</strong>
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
        }
      });
    });
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
                <option value="1" ${layer.visualMode === 1 ? "selected" : ""}>Kaleidoscope Grid</option>
                <option value="2" ${layer.visualMode === 2 ? "selected" : ""}>Swirl Orbit</option>
                <option value="3" ${layer.visualMode === 3 ? "selected" : ""}>Tunnel Lines</option>
                <option value="4" ${layer.visualMode === 4 ? "selected" : ""}>Pixel Mosaic</option>
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

    const opacitySlider = document.getElementById("layerOpacity");
    const modeSelect = document.getElementById("layerVisualMode");
    const themeSelect = document.getElementById("layerColorTheme");
    const blendSelect = document.getElementById("layerBlendMode");
    const posXSlider = document.getElementById("layerPosX");
    const posYSlider = document.getElementById("layerPosY");
    const audioPosReactCheckbox = document.getElementById("layerAudioPosReact");
    const strobeSlider = document.getElementById("layerStrobe");

    opacitySlider.addEventListener("input", e => {
      layer.opacity = parseFloat(e.target.value);
    });

    modeSelect.addEventListener("change", e => {
      layer.visualMode = parseInt(e.target.value, 10);
    });

    themeSelect.addEventListener("change", e => {
      layer.colorTheme = parseInt(e.target.value, 10);
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
    uniform vec2 u_resolution;
    uniform float u_bass;
    uniform float u_mid;
    uniform float u_high;
    uniform float u_brightness;
    uniform float u_opacity;
    uniform float u_mode;
    uniform float u_theme;
    uniform float u_zoom;
    uniform float u_rotate; // radians
    uniform float u_offsetX;
    uniform float u_offsetY;
    uniform float u_strobe;
    uniform float u_beatPhase;

    vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
      return a + b * cos(6.28318 * (c * t + d));
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution.xy;
      vec2 p = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);

      p *= u_zoom;
      float ca = cos(u_rotate);
      float sa = sin(u_rotate);
      p = mat2(ca, -sa, sa, ca) * p;

      p += vec2(u_offsetX, u_offsetY);

      float r = length(p);
      float ang = atan(p.y, p.x);
      float t = u_time;

      vec3 A;
      vec3 B;
      vec3 C;
      vec3 D;

      // 8 color themes
      if (u_theme < 0.5) {
        // 0: COOL
        A = vec3(0.13, 0.18, 0.25);
        B = vec3(0.3, 0.6, 1.0);
        C = vec3(0.35, 0.45, 0.75);
        D = vec3(0.2, 0.4, 0.9);
      } else if (u_theme < 1.5) {
        // 1: WARM
        A = vec3(0.22, 0.14, 0.10);
        B = vec3(1.0, 0.5, 0.1);
        C = vec3(0.5, 0.25, 0.1);
        D = vec3(0.15, 0.05, 0.0);
      } else if (u_theme < 2.5) {
        // 2: NEON
        A = vec3(0.05, 0.05, 0.10);
        B = vec3(1.0, 0.2, 1.4);
        C = vec3(0.7, 0.4, 0.9);
        D = vec3(0.2, 0.4, 1.0);
      } else if (u_theme < 3.5) {
        // 3: CYBER GRID
        A = vec3(0.05, 0.20, 0.08);
        B = vec3(0.1, 1.0, 0.5);
        C = vec3(0.3, 0.8, 0.5);
        D = vec3(0.0, 0.4, 0.1);
      } else if (u_theme < 4.5) {
        // 4: SUNSET
        A = vec3(0.4, 0.1, 0.2);
        B = vec3(1.0, 0.6, 0.3);
        C = vec3(0.9, 0.3, 0.5);
        D = vec3(0.3, 0.1, 0.5);
      } else if (u_theme < 5.5) {
        // 5: TOXIC GREEN
        A = vec3(0.0, 0.2, 0.05);
        B = vec3(0.7, 1.0, 0.1);
        C = vec3(0.3, 0.9, 0.1);
        D = vec3(0.1, 0.4, 0.0);
      } else if (u_theme < 6.5) {
        // 6: ICE LASER
        A = vec3(0.05, 0.08, 0.15);
        B = vec3(0.3, 0.8, 1.5);
        C = vec3(0.2, 0.6, 1.0);
        D = vec3(0.0, 0.3, 0.9);
      } else {
        // 7: VAPORWAVE
        A = vec3(0.15, 0.07, 0.20);
        B = vec3(0.9, 0.4, 1.2);
        C = vec3(0.4, 0.3, 0.9);
        D = vec3(0.1, 0.8, 0.9);
      }

      vec3 color = vec3(0.0);

      // MODE 0: Radial Waves
      if (u_mode < 0.5) {
        float w = sin(10.0 * r - t * (2.0 + u_bass * 6.0));
        float v = 0.5 + 0.5 * w;
        float pattern = v + 0.25 * sin(ang * 6.0 + t * (1.0 + u_mid * 3.0));
        color = palette(pattern + u_bass * 0.5, A, B, C, D);

      // MODE 1: Kaleidoscope Grid
      } else if (u_mode < 1.5) {
        vec2 g = p;
        g = abs(g);
        g = fract(g * 4.0);
        float lines = smoothstep(0.48, 0.5, max(abs(g.x - 0.5), abs(g.y - 0.5)));
        float pulse = 0.5 + 0.5 * sin(t * (2.0 + u_bass * 8.0) + r * 10.0);
        float baseT = t * 0.25 + u_mid;
        vec3 baseCol = palette(baseT, A, B, C, D);
        color = baseCol + lines * pulse * 1.5;

      // MODE 2: Swirl Orbit
      } else if (u_mode < 2.5) {
        float swirl = sin(ang * 4.0 + r * 8.0 - t * (1.0 + u_bass * 4.0));
        float ring = exp(-r * 4.0) * (0.5 + 0.5 * swirl);
        float spark = 0.5 + 0.5 * sin((p.x + p.y) * 30.0 + t * (4.0 + u_high * 10.0));
        float baseT = u_bass * 0.8 + t * 0.1;
        vec3 baseCol = palette(baseT, A, B, C, D);
        color = baseCol * (0.4 + ring * 1.2) * (0.8 + 0.4 * spark);

      // MODE 3: Tunnel Lines (audio-reactive tunnel)
      } else if (u_mode < 3.5) {
        vec2 q = p;
        float depth = 1.0 / (0.3 + length(q));
        float stripes = 0.5 + 0.5 * sin((q.y + t * (2.0 + u_bass * 6.0)) * 10.0);
        float rings   = 0.5 + 0.5 * sin((length(q) - t * (1.0 + u_mid * 4.0)) * 8.0);
        float m = mix(stripes, rings, 0.5 + 0.5 * u_high);
        float tt = depth + m + u_bass * 0.6;
        color = palette(tt, A, B, C, D) * depth * 1.8;

      // MODE 4: Pixel Mosaic (chunky audio-reactive tiles)
      } else {
        float scale = 30.0 + u_high * 40.0;
        vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
        vec2 pix = floor((uv * aspect) * scale) / scale;
        float cell = sin((pix.x + pix.y) * 20.0 + t * (3.0 + u_mid * 5.0));
        float pulse = 0.5 + 0.5 * sin(t * (2.0 + u_bass * 8.0));
        float tt = cell + pulse * 0.3 + u_bass * 0.5;
        color = palette(tt, A, B, C, D);
      }

      // Vignette
      float vignette = smoothstep(0.9, 0.3, r);
      color *= vignette;

      // Beat-based strobe: sin on beatPhase, controlled by u_strobe
      float beatPulse = 0.5 + 0.5 * sin(6.28318 * u_beatPhase);
      float flash = mix(1.0, 0.3 + beatPulse * 1.7, u_strobe);
      color *= flash;

      color *= u_brightness;
      gl_FragColor = vec4(color, u_opacity);
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

  const uTimeLoc = gl.getUniformLocation(program, "u_time");
  const uResLoc = gl.getUniformLocation(program, "u_resolution");
  const uBassLoc = gl.getUniformLocation(program, "u_bass");
  const uMidLoc = gl.getUniformLocation(program, "u_mid");
  const uHighLoc = gl.getUniformLocation(program, "u_high");
  const uBrightLoc = gl.getUniformLocation(program, "u_brightness");
  const uOpacityLoc = gl.getUniformLocation(program, "u_opacity");
  const uModeLoc = gl.getUniformLocation(program, "u_mode");
  const uThemeLoc = gl.getUniformLocation(program, "u_theme");
  const uZoomLoc = gl.getUniformLocation(program, "u_zoom");
  const uRotateLoc = gl.getUniformLocation(program, "u_rotate");
  const uOffsetXLoc = gl.getUniformLocation(program, "u_offsetX");
  const uOffsetYLoc = gl.getUniformLocation(program, "u_offsetY");
  const uStrobeLoc = gl.getUniformLocation(program, "u_strobe");
  const uBeatPhaseLoc = gl.getUniformLocation(program, "u_beatPhase");

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  let startTime = performance.now();

  function render() {
    resizeCanvas();

    const now = performance.now();
    const t = (now - startTime) * 0.001;

    let { bass, mid, high } = getBands();
    const react = parseFloat(audioReactSlider.value || "1");

    // scale audio by react knob
    let bassR = Math.min(1, bass * react);
    let midR  = Math.min(1, mid  * react);
    let highR = Math.min(1, high * react);

    const brightness = parseFloat(brightnessControl.value || "0.5");

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const zoom = cameraZoom;
    const rotateRad = (cameraRotateDeg * Math.PI) / 180.0;

    // Audio-reactive logo glow & scale
    const logoGlow = 0.25 + bassR * 0.6;
    const logoScale = 1 + bassR * 0.25;
    overlayHud.style.backgroundColor = `rgba(0,0,0,${logoGlow})`;
    overlayHud.style.transform = `translateX(-50%) scale(${logoScale})`;

    // Auto scene switching
    if (autoSwitchEnabled && presets.length > 0) {
      const elapsedSec = (now - lastSwitchTime) / 1000;
      if (elapsedSec >= autoSwitchInterval) {
        autoSwitchIndex = (autoSwitchIndex + 1) % presets.length;
        applyPreset(presets[autoSwitchIndex]);
        lastSwitchTime = now;
      }
    }

    // Beat phase from tapped BPM
    const beatSeconds = (now - beatPhaseStart) / 1000;
    const beatPhase = beatSeconds * (bpm / 60.0); // cycles

    layers.forEach(layer => {
      if (!layer.enabled || layer.opacity <= 0) return;

      // Blend mode per layer
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

      // Position, with optional audio wobble
      let offX = layer.offsetX || 0;
      let offY = layer.offsetY || 0;
      if (layer.audioPositionReact) {
        offX += (bassR - 0.5) * 0.5;
        offY += (highR - 0.5) * 0.5;
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
      gl.uniform1f(uStrobeLoc, layer.strobeIntensity);
      gl.uniform1f(uBeatPhaseLoc, beatPhase);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    });

    requestAnimationFrame(render);
  }

  render();
});
