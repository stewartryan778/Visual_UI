// ================== LAYER SYSTEM =====================

let layers = [];
let selectedLayer = null;

class Layer {
  constructor() {
    this.enabled = true;
    this.opacity = 1.0;
    this.blend = "normal"; // for future use
    this.source = null;    // for future (video/image)
    this.type = "shader";  // shader | video | image
  }
}

const layerContainer = document.getElementById("layerContainer");
const addLayerBtn = document.getElementById("addLayerBtn");
const inspectorContent = document.getElementById("inspectorContent");
const brightnessControl = document.getElementById("brightness");
const visualModeSelect = document.getElementById("visualMode");

let visualMode = 0;
visualModeSelect.addEventListener("change", e => {
  visualMode = parseInt(e.target.value, 10);
});

// Add initial layer
addLayer(new Layer());

addLayerBtn.addEventListener("click", () => {
  addLayer(new Layer());
});

function addLayer(layer) {
  layers.push(layer);
  if (selectedLayer === null) selectedLayer = 0;
  updateLayerUI();
  updateInspector();
}

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

  // Delegate button events
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
  `;

  const opacitySlider = document.getElementById("layerOpacity");
  opacitySlider.addEventListener("input", e => {
    layer.opacity = parseFloat(e.target.value);
  });
}

// ================== AUDIO FROM FILE =====================

const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const analyser = audioContext.createAnalyser();
analyser.fftSize = 1024;
const freqData = new Uint8Array(analyser.frequencyBinCount);

const audioInput = document.getElementById("audioInput");
const audioPlayer = document.getElementById("audioPlayer");

let audioSource = null;

// Some browsers require a user gesture to start/resume AudioContext
window.addEventListener("click", () => {
  if (audioContext.state !== "running") {
    audioContext.resume();
  }
});

audioInput.addEventListener("change", function () {
  const file = this.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);

  audioPlayer.src = url;
  audioPlayer.load();
  audioPlayer.play();

  // Disconnect previous audio source if needed
  if (audioSource) audioSource.disconnect();

  // Connect <audio> element into Web Audio graph
  audioSource = audioContext.createMediaElementSource(audioPlayer);
  audioSource.connect(analyser);
  analyser.connect(audioContext.destination); // so we can hear it
});

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

  const bass = avgRange(0, 40) / 255;      // 0–1
  const mid = avgRange(40, 200) / 255;     // 0–1
  const high = avgRange(200, 512) / 255;   // 0–1

  return { bass, mid, high };
}

// ================== WEBGL VISUALS =====================

const canvas = document.getElementById("stage");
const gl = canvas.getContext("webgl");

// Resize canvas to the stageWrapper
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

// Vertex shader
const vertSrc = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

// Fragment shader with 3 visual modes
const fragSrc = `
  precision mediump float;
  uniform float u_time;
  uniform vec2 u_resolution;
  uniform float u_bass;
  uniform float u_mid;
  uniform float u_high;
  uniform float u_brightness;
  uniform float u_opacity;
  uniform float u_mode;   // 0 = radial, 1 = kaleido, 2 = orbitals

  // smooth color palette helper
  vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(6.28318 * (c * t + d));
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 p = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
    float radius = length(p);
    float angle = atan(p.y, p.x);

    float t = u_time;
    vec3 color = vec3(0.0);

    // --- Mode 0: Radial Waves ---
    if (u_mode < 0.5) {
      float wave = sin(12.0 * radius - t * (2.0 + u_bass * 6.0));
      float rings = smoothstep(0.0, 1.0, wave * 0.5 + 0.5);

      float spin = sin(8.0 * angle + t * (1.0 + u_mid * 4.0));
      float clouds = sin(4.0 * p.x + 3.0 * p.y + t * 0.7);

      float mixVal = 0.4 + 0.3 * u_high;
      float base = rings * 0.7 + spin * 0.2 + clouds * 0.1;

      color = palette(
        base + u_bass * 0.5,
        vec3(0.2, 0.2, 0.25),
        vec3(0.6, 0.5, 0.7),
        vec3(0.3, 0.2, 0.4),
        vec3(0.0, 0.35, 0.7)
      );

      color *= 0.6 + 0.4 * mixVal;
    }
    // --- Mode 1: Kaleidoscope Grid ---
    else if (u_mode < 1.5) {
      vec2 k = p;
      k = abs(k);
      k = mod(k * 4.0, 1.0); // tiled mirrored grid

      float lineX = smoothstep(0.48, 0.5, abs(k.x - 0.5));
      float lineY = smoothstep(0.48, 0.5, abs(k.y - 0.5));
      float grid = max(lineX, lineY);

      float pulse = 0.5 + 0.5 * sin(t * (2.0 + u_bass * 8.0) + radius * 10.0);
      float flicker = 0.5 + 0.5 * sin(t * (5.0 + u_high * 10.0) + angle * 20.0);

      vec3 baseCol = palette(
        t * 0.2 + u_mid,
        vec3(0.12, 0.12, 0.14),
        vec3(0.8, 0.5, 0.3),
        vec3(0.25, 0.2, 0.4),
        vec3(0.0, 0.33, 0.7)
      );

      color = baseCol;
      color += grid * pulse * 1.5;
      color *= 0.7 + 0.3 * flicker;
    }
    // --- Mode 2: Bass Orbitals ---
    else {
      float bassBoost = 0.2 + u_bass * 1.5;
      float orbCount = 3.0 + floor(u_mid * 5.0);

      float accum = 0.0;
      for (int i = 0; i < 8; i++) {
        if (float(i) >= orbCount) break;
        float fi = float(i);
        float a = t * (0.4 + u_bass * 1.5) + fi * 2.094; // spaced around circle
        vec2 center = vec2(cos(a), sin(a)) * (0.15 + u_mid * 0.2);
        float d = length(p - center);
        float orb = exp(-d * 18.0 * (1.2 - u_high * 0.6));
        accum += orb;
      }

      float halo = exp(-radius * 4.0);
      float sparkle = 0.5 + 0.5 * sin((p.x + p.y) * 40.0 + t * (6.0 + u_high * 12.0));

      vec3 baseCol = palette(
        u_bass * 0.8 + t * 0.1,
        vec3(0.05, 0.08, 0.12),
        vec3(0.7, 0.9, 0.8),
        vec3(0.3, 0.4, 0.5),
        vec3(0.0, 0.3, 0.6)
      );

      color = baseCol;
      color += accum * bassBoost * vec3(0.9, 0.6, 0.2);
      color += halo * 0.4;
      color *= 0.6 + 0.4 * sparkle;
    }

    // vignette
    float vignette = smoothstep(0.9, 0.3, radius);
    color *= vignette;

    color *= u_brightness;
    gl_FragColor = vec4(color, u_opacity);
  }
`;

// Shader helpers
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

// Fullscreen quad
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

// Uniform locations
const uTimeLoc = gl.getUniformLocation(program, "u_time");
const uResLoc = gl.getUniformLocation(program, "u_resolution");
const uBassLoc = gl.getUniformLocation(program, "u_bass");
const uMidLoc = gl.getUniformLocation(program, "u_mid");
const uHighLoc = gl.getUniformLocation(program, "u_high");
const uBrightLoc = gl.getUniformLocation(program, "u_brightness");
const uOpacityLoc = gl.getUniformLocation(program, "u_opacity");
const uModeLoc = gl.getUniformLocation(program, "u_mode");

// Enable blending (future multi-layer)
gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

let startTime = performance.now();

// ================== RENDER LOOP =====================

function render() {
  resizeCanvas();

  const now = performance.now();
  const t = (now - startTime) * 0.001;

  const { bass, mid, high } = getBands();
  const brightness = parseFloat(brightnessControl.value);

  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  // Currently we just use Layer 0 as the main shader layer
  let opacity = 0.0;
  if (layers.length > 0 && layers[0].enabled) {
    opacity = layers[0].opacity;
  }

  gl.uniform1f(uTimeLoc, t);
  gl.uniform2f(uResLoc, canvas.width, canvas.height);
  gl.uniform1f(uBassLoc, bass);
  gl.uniform1f(uMidLoc, mid);
  gl.uniform1f(uHighLoc, high);
  gl.uniform1f(uBrightLoc, brightness);
  gl.uniform1f(uOpacityLoc, opacity);
  gl.uniform1f(uModeLoc, visualMode);

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  requestAnimationFrame(render);
}

render();
