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
      this.visualMode = 0;   // 0,1,2
      this.colorTheme = 0;   // 0=cool,1=warm,2=neon
    }
  }

  const layerContainer = document.getElementById("layerContainer");
  const addLayerBtn = document.getElementById("addLayerBtn");
  const inspectorContent = document.getElementById("inspectorContent");
  const brightnessControl = document.getElementById("brightness");

  const cameraZoomSlider = document.getElementById("cameraZoom");
  const cameraRotateSlider = document.getElementById("cameraRotate");

  const logoTextInput = document.getElementById("logoTextInput");
  const logoVisibleCheckbox = document.getElementById("logoVisible");
  const logoTextDisplay = document.getElementById("logoTextDisplay");
  const overlayHud = document.getElementById("overlayHud");

  const presetNameInput = document.getElementById("presetName");
  const presetSelect = document.getElementById("presetSelect");
  const savePresetBtn = document.getElementById("savePresetBtn");
  const loadPresetBtn = document.getElementById("loadPresetBtn");
  const deletePresetBtn = document.getElementById("deletePresetBtn");

  if (
    !layerContainer ||
    !addLayerBtn ||
    !inspectorContent ||
    !brightnessControl
  ) {
    console.error("Missing key DOM elements. Check IDs in index.html.");
    return;
  }

  // Global camera state
  let cameraZoom = parseFloat(cameraZoomSlider.value || "1");
  let cameraRotateDeg = parseFloat(cameraRotateSlider.value || "0");

  cameraZoomSlider.addEventListener("input", () => {
    cameraZoom = parseFloat(cameraZoomSlider.value || "1");
  });

  cameraRotateSlider.addEventListener("input", () => {
    cameraRotateDeg = parseFloat(cameraRotateSlider.value || "0");
  });

  // Logo controls
  function updateLogoDisplay() {
    logoTextDisplay.textContent = logoTextInput.value || "";
    overlayHud.style.display = logoVisibleCheckbox.checked ? "block" : "none";
  }
  logoTextInput.addEventListener("input", updateLogoDisplay);
  logoVisibleCheckbox.addEventListener("change", updateLogoDisplay);
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
      logoText: logoTextInput.value || "",
      logoVisible: !!logoVisibleCheckbox.checked,
      layers: layers.map(l => ({
        enabled: l.enabled,
        opacity: l.opacity,
        blend: l.blend,
        visualMode: l.visualMode,
        colorTheme: l.colorTheme
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

    logoTextInput.value = preset.logoText ?? "";
    logoVisibleCheckbox.checked = !!preset.logoVisible;
    updateLogoDisplay();

    layers = [];
    (preset.layers || []).forEach(pl => {
      const l = new Layer();
      l.enabled = pl.enabled ?? true;
      l.opacity = pl.opacity ?? 1;
      l.blend = pl.blend ?? "normal";
      l.visualMode = pl.visualMode ?? 0;
      l.colorTheme = pl.colorTheme ?? 0;
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
      <h3>Layer ${selectedLayer + 1}</h3>

      <label>Opacity</label>
      <input
        type="range"
        id="layerOpacity"
        min="0"
        max="1"
        step="0.01"
        value="${layer.opacity}"
      />

      <label style="margin-top:10px;">Visual Mode</label>
      <select id="layerVisualMode">
        <option value="0" ${layer.visualMode === 0 ? "selected" : ""}>Radial Waves</option>
        <option value="1" ${layer.visualMode === 1 ? "selected" : ""}>Kaleidoscope</option>
        <option value="2" ${layer.visualMode === 2 ? "selected" : ""}>Swirl Orbit</option>
      </select>

      <label style="margin-top:10px;">Color Theme</label>
      <select id="layerColorTheme">
        <option value="0" ${layer.colorTheme === 0 ? "selected" : ""}>Cool</option>
        <option value="1" ${layer.colorTheme === 1 ? "selected" : ""}>Warm</option>
        <option value="2" ${layer.colorTheme === 2 ? "selected" : ""}>Neon</option>
      </select>

      <label style="margin-top:10px;">Blend Mode</label>
      <select id="layerBlendMode">
        <option value="normal" ${layer.blend === "normal" ? "selected" : ""}>Normal</option>
        <option value="add" ${layer.blend === "add" ? "selected" : ""}>Add</option>
        <option value="screen" ${layer.blend === "screen" ? "selected" : ""}>Screen</option>
        <option value="multiply" ${layer.blend === "multiply" ? "selected" : ""}>Multiply</option>
      </select>
    `;

    const opacitySlider = document.getElementById("layerOpacity");
    const modeSelect = document.getElementById("layerVisualMode");
    const themeSelect = document.getElementById("layerColorTheme");
    const blendSelect = document.getElementById("layerBlendMode");

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

      float r = length(p);
      float ang = atan(p.y, p.x);
      float t = u_time;

      vec3 A;
      vec3 B;
      vec3 C;
      vec3 D;
      if (u_theme < 0.5) {
        A = vec3(0.15, 0.18, 0.25);
        B = vec3(0.5, 0.6, 0.9);
        C = vec3(0.3, 0.4, 0.7);
        D = vec3(0.0, 0.3, 0.7);
      } else if (u_theme < 1.5) {
        A = vec3(0.20, 0.14, 0.10);
        B = vec3(0.9, 0.6, 0.3);
        C = vec3(0.5, 0.3, 0.2);
        D = vec3(0.1, 0.2, 0.3);
      } else {
        A = vec3(0.05, 0.05, 0.10);
        B = vec3(1.0, 0.8, 1.2);
        C = vec3(0.7, 0.4, 0.9);
        D = vec3(0.1, 0.4, 0.9);
      }

      vec3 color = vec3(0.0);

      if (u_mode < 0.5) {
        float w = sin(10.0 * r - t * (2.0 + u_bass * 6.0));
        float v = 0.5 + 0.5 * w;
        float pattern = v + 0.25 * sin(ang * 6.0 + t * (1.0 + u_mid * 3.0));
        color = palette(pattern + u_bass * 0.5, A, B, C, D);
      } else if (u_mode < 1.5) {
        vec2 g = p;
        g = abs(g);
        g = fract(g * 4.0);
        float lines = smoothstep(0.48, 0.5, max(abs(g.x - 0.5), abs(g.y - 0.5)));
        float pulse = 0.5 + 0.5 * sin(t * (2.0 + u_bass * 8.0) + r * 10.0);
        float baseT = t * 0.25 + u_mid;
        vec3 baseCol = palette(baseT, A, B, C, D);
        color = baseCol + lines * pulse * 1.5;
      } else {
        float swirl = sin(ang * 4.0 + r * 8.0 - t * (1.0 + u_bass * 4.0));
        float ring = exp(-r * 4.0) * (0.5 + 0.5 * swirl);
        float spark = 0.5 + 0.5 * sin((p.x + p.y) * 30.0 + t * (4.0 + u_high * 10.0));
        float baseT = u_bass * 0.8 + t * 0.1;
        vec3 baseCol = palette(baseT, A, B, C, D);
        color = baseCol * (0.4 + ring * 1.2) * (0.8 + 0.4 * spark);
      }

      float vignette = smoothstep(0.9, 0.3, r);
      color *= vignette;

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

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  let startTime = performance.now();

  function setBlendMode(blend) {
    switch (blend) {
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
  }

  function render() {
    resizeCanvas();

    const now = performance.now();
    const t = (now - startTime) * 0.001;

    const { bass, mid, high } = getBands();
    const brightness = parseFloat(brightnessControl.value || "0.5");

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const zoom = cameraZoom;
    const rotateRad = (cameraRotateDeg * Math.PI) / 180.0;

    layers.forEach(layer => {
      if (!layer.enabled || layer.opacity <= 0) return;

      setBlendMode(layer.blend);

      gl.uniform1f(uTimeLoc, t);
      gl.uniform2f(uResLoc, canvas.width, canvas.height);
      gl.uniform1f(uBassLoc, bass);
      gl.uniform1f(uMidLoc, mid);
      gl.uniform1f(uHighLoc, high);
      gl.uniform1f(uBrightLoc, brightness);
      gl.uniform1f(uOpacityLoc, layer.opacity);
      gl.uniform1f(uModeLoc, layer.visualMode);
      gl.uniform1f(uThemeLoc, layer.colorTheme);
      gl.uniform1f(uZoomLoc, zoom);
      gl.uniform1f(uRotateLoc, rotateRad);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    });

    requestAnimationFrame(render);
  }

  render();
});
