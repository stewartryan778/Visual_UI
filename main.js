// ============= LAYER SYSTEM ===================
let layers = [];
let selectedLayer = null;

class Layer {
  constructor() {
    this.enabled = true;
    this.opacity = 1.0;
    this.blend = "normal";
    this.source = null;
    this.type = "shader"; // shader | video | image later
  }
}

const layerContainer = document.getElementById("layerContainer");
const addLayerBtn = document.getElementById("addLayerBtn");
const inspectorContent = document.getElementById("inspectorContent");
const brightnessControl = document.getElementById("brightness");

// Create first layer by default
addLayer(new Layer());

addLayerBtn.addEventListener("click", () => {
  addLayer(new Layer());
});

function addLayer(layer) {
  layers.push(layer);
  if (selectedLayer === null) {
    selectedLayer = 0;
  }
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
  if (selectedLayer == null) {
    inspectorContent.innerHTML = "<p>No layer selected</p>";
    return;
  }

  const layer = layers[selectedLayer];

  inspectorContent.innerHTML = `
    <h3>Layer ${selectedLayer + 1}</h3>
    <label>Opacity</label>
    <input type="range" id="layerOpacity" min="0" max="1" step="0.01" value="${layer.opacity}">
  `;

  const opacitySlider = document.getElementById("layerOpacity");
  opacitySlider.addEventListener("input", e => {
    layer.opacity = parseFloat(e.target.value);
  });
}

// ============= AUDIO SETUP ===================

const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const analyser = audioContext.createAnalyser();
analyser.fftSize = 1024;
const freqData = new Uint8Array(analyser.frequencyBinCount);

// ask for microphone access
navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  .then(stream => {
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
  })
  .catch(err => {
    console.error("Mic error:", err);
  });

function getBands() {
  analyser.getByteFrequencyData(freqData);

  // Very rough bands: bass (0–40), mids (40–200), highs (200–512)
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

// ============= WEBGL VISUALS ===================

const canvas = document.getElementById("stage");
const gl = canvas.getContext("webgl");

// Resize canvas to fit wrapper
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

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

// Fragment shader
// u_bass, u_mid, u_high, u_brightness, u_time, u_resolution
const fragSrc = `
  precision mediump float;
  uniform float u_time;
  uniform vec2 u_resolution;
  uniform float u_bass;
  uniform float u_mid;
  uniform float u_high;
  uniform float u_brightness;
  uniform float u_opacity;

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 p = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);

    float radius = length(p);
    float angle = atan(p.y, p.x);

    // circular waves driven by bass
    float bassWave = 0.5 + 0.5 * sin(10.0 * radius - u_time * (2.0 + u_bass * 5.0));

    // radial stripes driven by mids
    float midPattern = 0.5 + 0.5 * sin(6.0 * angle + u_time * (1.0 + u_mid * 3.0));

    // sparkle driven by highs
    float highSpark = 0.5 + 0.5 * sin(60.0 * uv.x + 40.0 * uv.y + u_time * (4.0 + u_high * 8.0));

    vec3 color = vec3(0.0);

    color.r = bassWave * (0.4 + u_bass * 0.6);
    color.g = midPattern * (0.3 + u_mid * 0.7);
    color.b = highSpark * (0.2 + u_high * 0.8);

    // add a subtle vignette
    float vignette = smoothstep(0.9, 0.3, radius);
    color *= vignette;

    // apply brightness and opacity
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

// Enable blending (for future multi-layer)
gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

let startTime = performance.now();

// ============= MAIN RENDER LOOP ===================

function render() {
  resizeCanvas();

  const now = performance.now();
  const t = (now - startTime) * 0.001; // seconds

  const { bass, mid, high } = getBands();
  const brightness = parseFloat(brightnessControl.value);

  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  // For now, we just render one shader layer (Layer 0) if it exists & enabled
  let opacity = 1.0;
  if (layers.length > 0 && layers[0].enabled) {
    opacity = layers[0].opacity;
  } else {
    opacity = 0.0;
  }

  gl.uniform1f(uTimeLoc, t);
  gl.uniform2f(uResLoc, canvas.width, canvas.height);
  gl.uniform1f(uBassLoc, bass);
  gl.uniform1f(uMidLoc, mid);
  gl.uniform1f(uHighLoc, high);
  gl.uniform1f(uBrightLoc, brightness);
  gl.uniform1f(uOpacityLoc, opacity);

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  requestAnimationFrame(render);
}

render();
