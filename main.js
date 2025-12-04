window.addEventListener("DOMContentLoaded", () => {
  console.log(">>> main.js loaded");

  // ================== LAYER SYSTEM =====================

  let layers = [];
  let selectedLayer = null;
  let dragSrcIndex = null; // for drag-and-drop reordering

  class Layer {
    constructor() {
      this.enabled = true;
      this.opacity = 1.0;
      this.blend = "normal"; // normal | add | screen | multiply
      this.source = null;    // future video/image
      this.type = "shader";
      this.kind = "shader";  // "shader" = background / fullscreen, "object" = overlay object

      // Visual + color
      this.visualMode = 0;   // which shader
      this.colorTheme = 0;
      this.brightness = 0.0;
      this.saturation = 0.0;
      this.hueShift = 0.0;

      // Position / transform
      this.offsetX = 0.0;
      this.offsetY = 0.0;
      this.scale = 1.0;
      this.rotation = 0.0;

      // Animation / audio-reactive
      this.wobbleAmount = 0.0;
      this.audioPositionReact = false;
      this.strobeIntensity = 0.0;
    }
  }

  // ================== AUDIO / WEBGL / UI HANDLES =====================

  const stageCanvas = document.getElementById("stage");
  const logoTextDisplay = document.getElementById("logoTextDisplay");

  const audioFileInput = document.getElementById("audioFileInput");
  const audioPlayer = document.getElementById("audioPlayer");

  const layerContainer = document.getElementById("layerContainer");
  const addLayerBtn = document.getElementById("addLayerBtn");

  const inspectorContent = document.getElementById("inspectorContent");

  const qeBrightness = document.getElementById("qeBrightness");
  const qeSaturation = document.getElementById("qeSaturation");
  const qeHue = document.getElementById("qeHue");
  const qeWobble = document.getElementById("qeWobble");

  const logoTextInput = document.getElementById("logoText");
  const tapTempoBtn = document.getElementById("tapTempoBtn");
  const bpmDisplay = document.getElementById("bpmDisplay");

  const presetNameInput = document.getElementById("presetName");
  const savePresetBtn = document.getElementById("savePresetBtn");
  const loadPresetBtn = document.getElementById("loadPresetBtn");
  const deletePresetBtn = document.getElementById("deletePresetBtn");

  const deckGrid = document.getElementById("deckGrid");

  // Safety check
  if (
    !stageCanvas ||
    !logoTextDisplay ||
    !audioFileInput ||
    !audioPlayer ||
    !layerContainer ||
    !addLayerBtn ||
    !inspectorContent ||
    !qeBrightness ||
    !qeSaturation ||
    !qeHue ||
    !qeWobble ||
    !logoTextInput ||
    !tapTempoBtn ||
    !bpmDisplay ||
    !presetNameInput ||
    !savePresetBtn ||
    !loadPresetBtn ||
    !deletePresetBtn ||
    !deckGrid
  ) {
    console.error("Missing key DOM elements. Check IDs in index.html.");
    return;
  }

  // ================== AUDIO SETUP =====================

  let audioCtx = null;
  let audioSource = null;
  let analyser = null;
  let freqData = null;
  let timeData = null;

  audioFileInput.addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    audioPlayer.src = url;
    audioPlayer.load();
    audioPlayer.play().catch(err => {
      console.warn("Autoplay prevented:", err);
    });

    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (audioSource) {
      audioSource.disconnect();
    }

    audioSource = audioCtx.createMediaElementSource(audioPlayer);

    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;

    const bufferLength = analyser.frequencyBinCount;
    freqData = new Uint8Array(bufferLength);
    timeData = new Uint8Array(bufferLength);

    audioSource.connect(analyser);
    analyser.connect(audioCtx.destination);
  });

  audioPlayer.addEventListener("play", () => {
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  });

  // ================== WEBGL SHADER SETUP =====================

  const gl = stageCanvas.getContext("webgl");
  if (!gl) {
    console.error("WebGL not supported");
    return;
  }

  function resizeCanvasToDisplaySize() {
    const displayWidth = stageCanvas.clientWidth || stageCanvas.parentElement.clientWidth;
    const displayHeight = stageCanvas.clientHeight || stageCanvas.parentElement.clientHeight;

    if (
      stageCanvas.width !== displayWidth ||
      stageCanvas.height !== displayHeight
    ) {
      stageCanvas.width = displayWidth;
      stageCanvas.height = displayHeight;
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    }
  }

  function createShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Shader compile error:", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function createProgram(vertexSrc, fragmentSrc) {
    const vs = createShader(gl.VERTEX_SHADER, vertexSrc);
    const fs = createShader(gl.FRAGMENT_SHADER, fragmentSrc);
    if (!vs || !fs) return null;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("Program link error:", gl.getProgramInfoLog(prog));
      gl.deleteProgram(prog);
      return null;
    }

    return prog;
  }

  const FULLSCREEN_VERT = `
    attribute vec2 a_position;
    varying vec2 v_uv;

    void main() {
      v_uv = (a_position + 1.0) * 0.5;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const FRAG_HEADER = `
    precision highp float;
    varying vec2 v_uv;

    uniform float u_time;
    uniform vec2 u_resolution;

    uniform float u_bass;
    uniform float u_mid;
    uniform float u_treble;

    uniform float u_opacity;
    uniform float u_brightness;
    uniform float u_saturation;
    uniform float u_hueShift;
    uniform float u_scale;
    uniform float u_rotation;
    uniform vec2  u_offset;
    uniform float u_wobble;
    uniform float u_strobe;

    vec3 hsl2rgb(vec3 hsl) {
      float h = hsl.x;
      float s = hsl.y;
      float l = hsl.z;

      float c = (1.0 - abs(2.0 * l - 1.0)) * s;
      float hp = h * 6.0;
      float x = c * (1.0 - abs(mod(hp, 2.0) - 1.0));

      vec3 rgb1;
      if (0.0 <= hp && hp < 1.0) rgb1 = vec3(c, x, 0.0);
      else if (1.0 <= hp && hp < 2.0) rgb1 = vec3(x, c, 0.0);
      else if (2.0 <= hp && hp < 3.0) rgb1 = vec3(0.0, c, x);
      else if (3.0 <= hp && hp < 4.0) rgb1 = vec3(0.0, x, c);
      else if (4.0 <= hp && hp < 5.0) rgb1 = vec3(x, 0.0, c);
      else rgb1 = vec3(c, 0.0, x);

      float m = l - 0.5 * c;
      return rgb1 + vec3(m);
    }

    vec2 rotate(vec2 p, float a) {
      float ca = cos(a);
      float sa = sin(a);
      return vec2(
        p.x * ca - p.y * sa,
        p.x * sa + p.y * ca
      );
    }
  `;

  const FRAG_FOOTER = `
    void main() {
      vec2 uv = v_uv * 2.0 - 1.0;
      uv *= u_scale;
      uv = rotate(uv, u_rotation);
      uv += u_offset;

      float wob = sin(uv.y * 10.0 + u_time * 3.0) * u_wobble * 0.2;
      uv.x += wob;

      vec3 color = vec3(0.0);
      float mask = 1.0;

      mainVisual(uv, color, mask);

      vec3 hsl = vec3(0.0, 0.0, 0.0);
      float maxC = max(max(color.r, color.g), color.b);
      float minC = min(min(color.r, color.g), color.b);
      float delta = maxC - minC;

      if (delta < 0.0001) {
        hsl.x = 0.0;
      } else if (maxC == color.r) {
        hsl.x = mod((color.g - color.b) / delta, 6.0) / 6.0;
      } else if (maxC == color.g) {
        hsl.x = ((color.b - color.r) / delta + 2.0) / 6.0;
      } else {
        hsl.x = ((color.r - color.g) / delta + 4.0) / 6.0;
      }

      hsl.z = 0.5 * (maxC + minC);
      hsl.y = delta / (1.0 - abs(2.0 * hsl.z - 1.0) + 1e-5);

      hsl.x = fract(hsl.x + u_hueShift);
      hsl.y = clamp(hsl.y + u_saturation, 0.0, 1.0);
      hsl.z = clamp(hsl.z + u_brightness, 0.0, 1.0);

      color = hsl2rgb(hsl);

      float strobe = step(0.5, fract(u_time * 20.0)) * u_strobe;
      color += strobe;

      color = clamp(color, 0.0, 1.0);

      gl_FragColor = vec4(color, u_opacity * mask);
    }
  `;

  const VISUAL_SHADERS = [
    `
    void mainVisual(vec2 uv, inout vec3 color, inout float mask) {
      float r = length(uv);
      float angle = atan(uv.y, uv.x);

      float wave = sin(10.0 * r - u_time * 3.0 + u_bass * 5.0);
      float band = smoothstep(0.02, 0.0, abs(wave));

      float hue = 0.5 + 0.3 * sin(u_time + r * 3.0 + u_mid * 5.0);
      vec3 base = hsl2rgb(vec3(hue, 0.8, 0.5));

      color = mix(color, base, band);
      mask = band;
    }
    `,
    `
    void mainVisual(vec2 uv, inout vec3 color, inout float mask) {
      vec2 g = floor((uv + 1.0) * 10.0);
      float idx = mod(g.x + g.y, 4.0);

      float phase = u_time * 2.0 + idx * 1.0 + u_mid * 6.0;
      float osc = 0.5 + 0.5 * sin(phase);

      float hue = fract(idx / 4.0 + osc * 0.2);
      vec3 base = hsl2rgb(vec3(hue, 0.9, 0.45 + 0.25 * u_treble));

      float d = length(fract((uv + 1.0) * 10.0) - 0.5);
      float ring = smoothstep(0.3 + u_bass * 0.2, 0.0, d);

      color = base * ring;
      mask = ring;
    }
    `,
    `
    void mainVisual(vec2 uv, inout vec3 color, inout float mask) {
      float angle = atan(uv.y, uv.x);
      float radius = length(uv);

      float orbit = sin(angle * 6.0 + u_time * 2.0 + u_mid * 5.0);
      float ring = smoothstep(0.02, 0.0, abs(radius - (0.4 + 0.1 * orbit)));

      float hue = fract((angle / 6.2831) + 0.5 + u_treble * 0.3);
      vec3 base = hsl2rgb(vec3(hue, 0.9, 0.5));

      color = base * ring;
      mask = ring;
    }
    `,
    `
    void mainVisual(vec2 uv, inout vec3 color, inout float mask) {
      float radial = length(uv);
      float lines = sin(30.0 * angle(uv) + u_time * 4.0 + u_mid * 10.0);
      float band = smoothstep(0.2, 0.0, abs(lines));

      float hue = fract(radial * 2.0 + u_bass * 0.5);
      vec3 base = hsl2rgb(vec3(hue, 0.9, 0.4 + 0.3 * u_treble));

      color = base * band;
      mask = band;
    }

    float angle(vec2 p) {
      return atan(p.y, p.x);
    }
    `,
    `
    void mainVisual(vec2 uv, inout vec3 color, inout float mask) {
      vec2 grid = floor((uv + 1.0) * 16.0);
      float idx = mod(grid.x + grid.y, 8.0);

      float phase = u_time * 3.0 + idx + u_bass * 10.0;
      float pix = step(0.5, fract(sin(phase) * 43758.5453123));

      float hue = fract(idx / 8.0 + u_mid * 0.3);
      vec3 base = hsl2rgb(vec3(hue, 0.9, 0.45 + pix * 0.2));

      color = base;
      mask = 1.0;
    }
    `,
    `
    void mainVisual(vec2 uv, inout vec3 color, inout float mask) {
      float angle = atan(uv.y, uv.x);
      float radius = length(uv);

      float orbit = sin(angle * 8.0 + u_time * 2.5 + u_mid * 8.0);
      float ring = smoothstep(0.03, 0.0, abs(radius - (0.3 + 0.1 * orbit)));

      float hue = fract((angle / 6.2831) + u_treble * 0.4);
      vec3 base = hsl2rgb(vec3(hue, 0.9, 0.5));

      float glow = smoothstep(0.4, 0.0, radius);
      color = base * ring * glow;
      mask = ring * glow;
    }
    `,
    `
    void mainVisual(vec2 uv, inout vec3 color, inout float mask) {
      float xIndex = floor((uv.x + 1.0) * 40.0);
      float amp = abs(sin(u_time * 3.0 + xIndex * 0.5)) * (0.3 + u_bass * 0.7);

      float wave = amp * (0.5 + 0.5 * sin(u_time * 6.0 + xIndex * 0.8));
      float barHeight = wave;

      float y = uv.y * 0.5 + 0.5;
      float bar = smoothstep(barHeight, barHeight - 0.05, y);

      float hue = fract(xIndex / 40.0 + u_mid * 0.3);
      vec3 base = hsl2rgb(vec3(hue, 0.9, 0.5));

      color = base * bar;
      mask = bar;
    }
    `,
    `
    void mainVisual(vec2 uv, inout vec3 color, inout float mask) {
      float t = u_time * 1.5;

      vec2 p = uv;
      for (int i = 0; i < 4; i++) {
        p = vec2(
          abs(p.x) - 0.5 + 0.3 * sin(t + float(i)),
          abs(p.y) - 0.5 + 0.3 * cos(t + float(i))
        );
      }

      float d = length(p);
      float ring = smoothstep(0.05 + 0.3 * u_bass, 0.0, d);

      float hue = fract(0.6 + u_mid * 0.4 + d * 0.5);
      vec3 base = hsl2rgb(vec3(hue, 0.9, 0.5));

      color = base * ring;
      mask = ring;
    }
    `
  ];

  const programs = VISUAL_SHADERS.map(fragmentSrc => {
    const fullFrag = FRAG_HEADER + fragmentSrc + FRAG_FOOTER;
    return createProgram(FULLSCREEN_VERT, fullFrag);
  });

  const quadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1
    ]),
    gl.STATIC_DRAW
  );

  function getProgramUniforms(program) {
    return {
      a_position: gl.getAttribLocation(program, "a_position"),
      u_time: gl.getUniformLocation(program, "u_time"),
      u_resolution: gl.getUniformLocation(program, "u_resolution"),
      u_bass: gl.getUniformLocation(program, "u_bass"),
      u_mid: gl.getUniformLocation(program, "u_mid"),
      u_treble: gl.getUniformLocation(program, "u_treble"),
      u_opacity: gl.getUniformLocation(program, "u_opacity"),
      u_brightness: gl.getUniformLocation(program, "u_brightness"),
      u_saturation: gl.getUniformLocation(program, "u_saturation"),
      u_hueShift: gl.getUniformLocation(program, "u_hueShift"),
      u_scale: gl.getUniformLocation(program, "u_scale"),
      u_rotation: gl.getUniformLocation(program, "u_rotation"),
      u_offset: gl.getUniformLocation(program, "u_offset"),
      u_wobble: gl.getUniformLocation(program, "u_wobble"),
      u_strobe: gl.getUniformLocation(program, "u_strobe")
    };
  }

  const programUniforms = programs.map(p => p && getProgramUniforms(p));

  // ================== LAYERS + UI =====================

  function addLayer(layer) {
    layers.push(layer);
    selectedLayer = layers.length - 1;
    updateLayerUI();
    updateInspector();
    updateQuickEffects();
  }

  addLayer(new Layer());

  addLayerBtn.addEventListener("click", () => {
    addLayer(new Layer());
  });

  const THEME_SWATCH_COLORS = [
    "#4fc3f7", // Cool
    "#ff8a65", // Warm
    "#ba68c8", // Psy
    "#81c784", // Nature
    "#fff176", // Neon
    "#f06292", // Sunset
    "#90caf9", // Deep blue
    "#ce93d8"  // Cosmic
  ];

  function getThemeSwatchColor(themeIndex) {
    const idx = Math.max(0, Math.min(THEME_SWATCH_COLORS.length - 1, themeIndex || 0));
    return THEME_SWATCH_COLORS[idx];
  }

  function updateLayerUI() {
    layerContainer.innerHTML = "";

    layers.forEach((layer, index) => {
      const isSelected = selectedLayer === index;
      const kindLabel = layer.kind === "object" ? "OBJ" : "BG";
      const kindClass = layer.kind === "object" ? "layer-kind--object" : "layer-kind--shader";
      const swatchColor = getThemeSwatchColor(layer.colorTheme || 0);

      const div = document.createElement("div");
      div.className = "layer";
      if (isSelected) div.classList.add("active");
      div.dataset.index = index.toString();
      div.draggable = true;

      div.innerHTML = `
        <div class="layer-header">
          <span class="layer-kind-badge ${kindClass}">${kindLabel}</span>
          <span class="layer-swatch" style="background:${swatchColor};"></span>
          <span class="layer-title">Layer ${index + 1}</span>
        </div>

        <div class="layer-controls">
          <button data-action="mute" data-index="${index}">
            ${layer.enabled ? "Mute" : "Unmute"}
          </button>
          <button data-action="select" data-index="${index}">
            Select
          </button>
        </div>

        <div class="layer-opacity-row">
          <label>Opacity</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value="${layer.opacity}"
            data-index="${index}"
            data-role="opacity"
          />
        </div>
      `;

      // Drag handlers for reordering
      div.addEventListener("dragstart", e => {
        dragSrcIndex = index;
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(index));
        }
        div.classList.add("dragging");
      });

      div.addEventListener("dragend", () => {
        div.classList.remove("dragging");
        dragSrcIndex = null;
      });

      div.addEventListener("dragover", e => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      });

      div.addEventListener("drop", e => {
        e.preventDefault();
        const src = dragSrcIndex;
        const targetIndex = parseInt(div.dataset.index, 10);
        if (src === null || Number.isNaN(targetIndex) || src === targetIndex) return;

        const moved = layers.splice(src, 1)[0];
        layers.splice(targetIndex, 0, moved);

        // Adjust selectedLayer index to follow the moved layer
        if (selectedLayer === src) {
          selectedLayer = targetIndex;
        } else if (src < selectedLayer && targetIndex >= selectedLayer) {
          selectedLayer -= 1;
        } else if (src > selectedLayer && targetIndex <= selectedLayer) {
          selectedLayer += 1;
        }

        updateLayerUI();
        updateInspector();
        updateQuickEffects();
      });

      layerContainer.appendChild(div);
    });

    // Buttons: mute / select
    layerContainer.querySelectorAll("button[data-action]").forEach(btn => {
      btn.addEventListener("click", e => {
        const action = e.currentTarget.dataset.action;
        const idx = parseInt(e.currentTarget.dataset.index, 10);
        if (Number.isNaN(idx)) return;

        if (action === "mute") {
          layers[idx].enabled = !layers[idx].enabled;
          updateLayerUI();
          if (selectedLayer === idx) {
            updateInspector();
            updateQuickEffects();
          }
        } else if (action === "select") {
          selectedLayer = idx;
          updateLayerUI();
          updateInspector();
          updateQuickEffects();
        }
      });
    });

    // Quick opacity sliders per-card
    layerContainer.querySelectorAll('input[data-role="opacity"]').forEach(slider => {
      slider.addEventListener("input", e => {
        const idx = parseInt(e.currentTarget.dataset.index, 10);
        if (Number.isNaN(idx)) return;
        const value = parseFloat(e.currentTarget.value);
        layers[idx].opacity = value;

        // Keep inspector slider in sync if this layer is selected
        if (selectedLayer === idx) {
          const inspectorOpacity = document.getElementById("layerOpacity");
          if (inspectorOpacity) {
            inspectorOpacity.value = value;
          }
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
          <label>Layer Type</label>
          <select id="layerKind">
            <option value="shader" ${layer.kind === "shader" ? "selected" : ""}>Background / Fullscreen</option>
            <option value="object" ${layer.kind === "object" ? "selected" : ""}>Object Overlay</option>
          </select>
        </div>

        <div class="control-row">
          <label>Opacity</label>
          <input type="range" id="layerOpacity" min="0" max="1" step="0.01" value="${layer.opacity}" />
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
      </div>

      <div class="inspector-group">
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
                <option value="5" ${layer.visualMode === 5 ? "selected" : ""}>Orbital Objects</option>
                <option value="6" ${layer.visualMode === 6 ? "selected" : ""}>Audio Bars</option>
                <option value="7" ${layer.visualMode === 7 ? "selected" : ""}>Recursive Cosmic</option>
              </select>
            </div>

            <div class="control-row">
              <label>Color Theme</label>
              <select id="layerColorTheme">
                <option value="0" ${layer.colorTheme === 0 ? "selected" : ""}>Cool Blues</option>
                <option value="1" ${layer.colorTheme === 1 ? "selected" : ""}>Warm Fire</option>
                <option value="2" ${layer.colorTheme === 2 ? "selected" : ""}>Psychedelic</option>
                <option value="3" ${layer.colorTheme === 3 ? "selected" : ""}>Nature Greens</option>
                <option value="4" ${layer.colorTheme === 4 ? "selected" : ""}>Neon Rave</option>
                <option value="5" ${layer.colorTheme === 5 ? "selected" : ""}>Sunset</option>
                <option value="6" ${layer.colorTheme === 6 ? "selected" : ""}>Deep Space</option>
                <option value="7" ${layer.colorTheme === 7 ? "selected" : ""}>Cosmic Pastel</option>
              </select>
            </div>

            <div class="control-row">
              <label>Brightness</label>
              <input type="range" id="layerBrightness" min="-0.5" max="0.5" step="0.01" value="${layer.brightness}" />
            </div>

            <div class="control-row">
              <label>Saturation</label>
              <input type="range" id="layerSaturation" min="-0.5" max="0.5" step="0.01" value="${layer.saturation}" />
            </div>

            <div class="control-row">
              <label>Hue Shift</label>
              <input type="range" id="layerHueShift" min="-1.0" max="1.0" step="0.01" value="${layer.hueShift}" />
            </div>

            <div class="control-row">
              <label>Scale</label>
              <input type="range" id="layerScale" min="0.5" max="2.0" step="0.01" value="${layer.scale}" />
            </div>

            <div class="control-row">
              <label>Rotation</label>
              <input type="range" id="layerRotation" min="-3.14" max="3.14" step="0.01" value="${layer.rotation}" />
            </div>

            <div class="control-row">
              <label>Position X</label>
              <input type="range" id="layerPosX" min="-1" max="1" step="0.01" value="${layer.offsetX}" />
            </div>

            <div class="control-row">
              <label>Position Y</label>
              <input type="range" id="layerPosY" min="-1" max="1" step="0.01" value="${layer.offsetY}" />
            </div>

            <div class="control-row">
              <label>Audio Position React</label>
              <input type="checkbox" id="layerAudioPosReact" ${layer.audioPositionReact ? "checked" : ""} />
            </div>

            <div class="control-row">
              <label>Strobe Intensity</label>
              <input type="range" id="layerStrobe" min="0" max="1" step="0.01" value="${layer.strobeIntensity}" />
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
    const brightnessSlider = document.getElementById("layerBrightness");
    const saturationSlider = document.getElementById("layerSaturation");
    const hueShiftSlider = document.getElementById("layerHueShift");
    const scaleSlider = document.getElementById("layerScale");
    const rotationSlider = document.getElementById("layerRotation");

    kindSelect.addEventListener("change", e => {
      layer.kind = e.target.value;
      updateQuickEffects();
    });

    opacitySlider.addEventListener("input", e => {
      const value = parseFloat(e.target.value);
      layer.opacity = value;

      // Keep the left-panel quick slider in sync
      const quickSlider = layerContainer.querySelector(
        `input[data-role="opacity"][data-index="${selectedLayer}"]`
      );
      if (quickSlider) {
        quickSlider.value = value;
      }
    });

    modeSelect.addEventListener("change", e => {
      layer.visualMode = parseInt(e.target.value, 10);
      updateQuickEffects();
    });

    themeSelect.addEventListener("change", e => {
      layer.colorTheme = parseInt(e.target.value, 10);
      updateQuickEffects();
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

    brightnessSlider.addEventListener("input", e => {
      layer.brightness = parseFloat(e.target.value);
      updateQuickEffects();
    });

    saturationSlider.addEventListener("input", e => {
      layer.saturation = parseFloat(e.target.value);
      updateQuickEffects();
    });

    hueShiftSlider.addEventListener("input", e => {
      layer.hueShift = parseFloat(e.target.value);
      updateQuickEffects();
    });

    scaleSlider.addEventListener("input", e => {
      layer.scale = parseFloat(e.target.value);
    });

    rotationSlider.addEventListener("input", e => {
      layer.rotation = parseFloat(e.target.value);
    });
  }

  function updateQuickEffects() {
    if (selectedLayer === null) return;
    const layer = layers[selectedLayer];

    qeBrightness.value = layer.brightness;
    qeSaturation.value = layer.saturation;
    qeHue.value = layer.hueShift;
    qeWobble.value = layer.wobbleAmount;
  }

  qeBrightness.addEventListener("input", e => {
    if (selectedLayer === null) return;
    const layer = layers[selectedLayer];
    layer.brightness = parseFloat(e.target.value);
  });

  qeSaturation.addEventListener("input", e => {
    if (selectedLayer === null) return;
    const layer = layers[selectedLayer];
    layer.saturation = parseFloat(e.target.value);
  });

  qeHue.addEventListener("input", e => {
    if (selectedLayer === null) return;
    const layer = layers[selectedLayer];
    layer.hueShift = parseFloat(e.target.value);
  });

  qeWobble.addEventListener("input", e => {
    if (selectedLayer === null) return;
    const layer = layers[selectedLayer];
    layer.wobbleAmount = parseFloat(e.target.value);
  });

  // ================== GLOBAL CONTROLS =====================

  logoTextInput.addEventListener("input", e => {
    logoTextDisplay.textContent = e.target.value || "Artist / Track";
  });

  let tapTimes = [];
  tapTempoBtn.addEventListener("click", () => {
    const now = performance.now();
    tapTimes.push(now);
    tapTimes = tapTimes.filter(t => now - t < 4000);

    if (tapTimes.length >= 2) {
      const intervals = [];
      for (let i = 1; i < tapTimes.length; i++) {
        intervals.push(tapTimes[i] - tapTimes[i - 1]);
      }
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const bpm = Math.round(60000 / avg);
      bpmDisplay.textContent = `BPM: ${bpm}`;
    }
  });

  // ================== PRESETS =====================

  const PRESET_KEY = "musicVisualizerPresets";

  function loadPresetsFromStorage() {
    try {
      const raw = localStorage.getItem(PRESET_KEY);
      if (!raw) return {};
      return JSON.parse(raw);
    } catch (err) {
      console.warn("Failed to parse presets:", err);
      return {};
    }
  }

  function savePresetsToStorage(presets) {
    try {
      localStorage.setItem(PRESET_KEY, JSON.stringify(presets));
    } catch (err) {
      console.warn("Failed to save presets:", err);
    }
  }

  function getCurrentPresetData() {
    return {
      layers: layers.map(l => ({
        enabled: l.enabled,
        opacity: l.opacity,
        blend: l.blend,
        type: l.type,
        kind: l.kind,
        visualMode: l.visualMode,
        colorTheme: l.colorTheme,
        brightness: l.brightness,
        saturation: l.saturation,
        hueShift: l.hueShift,
        offsetX: l.offsetX,
        offsetY: l.offsetY,
        scale: l.scale,
        rotation: l.rotation,
        wobbleAmount: l.wobbleAmount,
        audioPositionReact: l.audioPositionReact,
        strobeIntensity: l.strobeIntensity
      })),
      logoText: logoTextDisplay.textContent
    };
  }

  function applyPresetData(data) {
    if (!data || !data.layers) return;

    layers = data.layers.map(ld => {
      const l = new Layer();
      Object.assign(l, ld);
      return l;
    });

    if (data.logoText) {
      logoTextDisplay.textContent = data.logoText;
      logoTextInput.value = data.logoText;
    }

    selectedLayer = layers.length ? 0 : null;
    updateLayerUI();
    updateInspector();
    updateQuickEffects();
  }

  savePresetBtn.addEventListener("click", () => {
    const name = presetNameInput.value.trim();
    if (!name) {
      alert("Enter a preset name");
      return;
    }

    const presets = loadPresetsFromStorage();
    presets[name] = getCurrentPresetData();
    savePresetsToStorage(presets);
    alert(`Preset "${name}" saved.`);
  });

  loadPresetBtn.addEventListener("click", () => {
    const presets = loadPresetsFromStorage();
    const keys = Object.keys(presets);
    if (!keys.length) {
      alert("No presets saved.");
      return;
    }

    const name = prompt("Enter preset name to load:\n" + keys.join(", "));
    if (!name || !presets[name]) {
      alert("Preset not found.");
      return;
    }

    applyPresetData(presets[name]);
  });

  deletePresetBtn.addEventListener("click", () => {
    const presets = loadPresetsFromStorage();
    const keys = Object.keys(presets);
    if (!keys.length) {
      alert("No presets saved.");
      return;
    }

    const name = prompt("Enter preset name to delete:\n" + keys.join(", "));
    if (!name || !presets[name]) {
      alert("Preset not found.");
      return;
    }

    delete presets[name];
    savePresetsToStorage(presets);
    alert(`Preset "${name}" deleted.`);
  });

  // ================== DECK / CLIPS =====================

  const defaultDeck = [
    { name: "Chill Radials", visualMode: 0, colorTheme: 0 },
    { name: "Fire Kaleidoscope", visualMode: 1, colorTheme: 1 },
    { name: "Psy Swirl Orbit", visualMode: 2, colorTheme: 2 },
    { name: "Tunnel Lines", visualMode: 3, colorTheme: 4 },
    { name: "Pixel Mosaic Funk", visualMode: 4, colorTheme: 5 },
    { name: "Orbital Objects", visualMode: 5, colorTheme: 6 },
    { name: "Audio Bars Pop", visualMode: 6, colorTheme: 4 },
    { name: "Cosmic Recursive", visualMode: 7, colorTheme: 7 }
  ];

  function buildDeckUI() {
    deckGrid.innerHTML = "";
    defaultDeck.forEach((clip, index) => {
      const div = document.createElement("div");
      div.className = "deckItem";
      div.textContent = clip.name;
      div.dataset.index = String(index);
      deckGrid.appendChild(div);
    });

    deckGrid.querySelectorAll(".deckItem").forEach(item => {
      item.addEventListener("click", e => {
        const idx = parseInt(e.currentTarget.dataset.index, 10);
        const clip = defaultDeck[idx];
        if (selectedLayer === null) return;
        const layer = layers[selectedLayer];
        layer.visualMode = clip.visualMode;
        layer.colorTheme = clip.colorTheme;
        updateInspector();
        updateQuickEffects();
      });
    });
  }

  buildDeckUI();

  // ================== RENDER LOOP =====================

  let startTime = performance.now();

  function computeAudioBands() {
    if (!analyser || !freqData) {
      return { bass: 0.0, mid: 0.0, treble: 0.0 };
    }

    analyser.getByteFrequencyData(freqData);

    const n = freqData.length;
    const bassEnd = Math.floor(n * 0.1);
    const midEnd = Math.floor(n * 0.4);
    const trebleEnd = n;

    let bassSum = 0, midSum = 0, trebleSum = 0;
    for (let i = 0; i < bassEnd; i++) bassSum += freqData[i];
    for (let i = bassEnd; i < midEnd; i++) midSum += freqData[i];
    for (let i = midEnd; i < trebleEnd; i++) trebleSum += freqData[i];

    const bass = bassSum / (bassEnd * 255);
    const mid = midSum / ((midEnd - bassEnd) * 255);
    const treble = trebleSum / ((trebleEnd - midEnd) * 255);

    return { bass, mid, treble };
  }

  function render() {
    requestAnimationFrame(render);

    resizeCanvasToDisplaySize();

    const t = (performance.now() - startTime) / 1000;
    const { bass, mid, treble } = computeAudioBands();

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enableVertexAttribArray(0);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;

    layers.forEach(layer => {
      if (!layer.enabled || layer.opacity <= 0) return;

      const program = programs[layer.visualMode % programs.length];
      const uniforms = programUniforms[layer.visualMode % programUniforms.length];
      if (!program || !uniforms) return;

      gl.useProgram(program);

      gl.vertexAttribPointer(uniforms.a_position, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(uniforms.a_position);

      gl.uniform1f(uniforms.u_time, t);
      gl.uniform2f(uniforms.u_resolution, w, h);
      gl.uniform1f(uniforms.u_bass, bass);
      gl.uniform1f(uniforms.u_mid, mid);
      gl.uniform1f(uniforms.u_treble, treble);

      gl.uniform1f(uniforms.u_opacity, layer.opacity);
      gl.uniform1f(uniforms.u_brightness, layer.brightness);
      gl.uniform1f(uniforms.u_saturation, layer.saturation);
      gl.uniform1f(uniforms.u_hueShift, layer.hueShift);

      gl.uniform1f(uniforms.u_scale, layer.scale);
      gl.uniform1f(uniforms.u_rotation, layer.rotation);

      let offsetX = layer.offsetX;
      let offsetY = layer.offsetY;
      if (layer.audioPositionReact) {
        offsetX += (bass - 0.5) * 0.3;
        offsetY += (mid - 0.5) * 0.3;
      }
      gl.uniform2f(uniforms.u_offset, offsetX, offsetY);

      gl.uniform1f(uniforms.u_wobble, layer.wobbleAmount + bass * 0.3);
      gl.uniform1f(uniforms.u_strobe, layer.strobeIntensity * treble);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    });
  }

  render();
});
