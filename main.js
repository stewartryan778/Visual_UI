window.addEventListener("DOMContentLoaded", () => {

  /**********************************
   * STATE
   **********************************/
  let layers = [];
  let selectedLayer = 0;
  let dragSrcIndex = null;

  let gl = null;
  let program = null;
  let positionBuffer = null;

  let audioCtx = null;
  let audioSource = null;
  let analyser = null;
  let freqData = null;

  /**********************************
   * UI ELEMENTS
   **********************************/
  const stageCanvas = document.getElementById("stage");
  const layerContainer = document.getElementById("layerContainer");
  const addLayerBtn = document.getElementById("addLayerBtn");
  const audioPlayer = document.getElementById("audioPlayer");
  const audioFileInput = document.getElementById("audioFileInput");
  const inspectorContent = document.getElementById("inspectorContent");
  const deckGrid = document.getElementById("deckGrid");

  /**********************************
   * LAYER CLASS
   **********************************/
  class Layer {
    constructor() {
      this.name = "Layer";
      this.enabled = true;
      this.opacity = 1.0;
      this.visualMode = 0;
      this.colorTheme = 0;
      this.brightness = 0.0;
      this.saturation = 0.0;
      this.hueShift = 0.0;
      this.scale = 1.0;
      this.rotation = 0.0;
      this.offsetX = 0.0;
      this.offsetY = 0.0;
      this.wobbleAmount = 0.0;
    }
  }

  /**********************************
   * AUDIO ENGINE
   **********************************/
  audioFileInput.addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;

    audioPlayer.src = URL.createObjectURL(file);
    await audioPlayer.play().catch(()=>{});

    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === "suspended") await audioCtx.resume();

    if (audioSource) audioSource.disconnect();
    audioSource = audioCtx.createMediaElementSource(audioPlayer);

    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    freqData = new Uint8Array(analyser.frequencyBinCount);

    audioSource.connect(analyser);
    analyser.connect(audioCtx.destination);
  });

  audioPlayer.addEventListener("play", () => {
    if (audioCtx?.state === "suspended") audioCtx.resume();
  });

  /**********************************
   * LAYER MANAGEMENT
   **********************************/
  function addLayer() {
    layers.push(new Layer());
    selectedLayer = layers.length - 1;
    updateLayerUI();
    updateInspector();
  }
  addLayerBtn.addEventListener("click", addLayer);

  /**********************************
   * UI LAYER LIST
   **********************************/
  const SWATCHES = [
    "#4fc3f7","#ff8a65","#ba68c8","#81c784",
    "#fff176","#f06292","#90caf9","#ce93d8"
  ];

  function updateLayerUI() {
    layerContainer.innerHTML = "";
    layers.forEach((layer, index) => {
      const swatch = SWATCHES[layer.colorTheme % SWATCHES.length];
      const isSelected = selectedLayer === index;

      const div = document.createElement("div");
      div.className = "layer";
      if (isSelected) div.classList.add("active");
      div.dataset.index = index;
      div.draggable = true;

      div.innerHTML = `
        <div class="layer-header">
          <span class="layer-eye">${layer.enabled ? "👁" : "🚫"}</span>
          <span class="layer-swatch" style="background:${swatch};"></span>
          <span class="layer-title">${layer.name}</span>
        </div>
        <div class="layer-controls">
          <button data-action="select" data-index="${index}">
            Select
          </button>
        </div>
        <div class="layer-opacity-row">
          <label>Opacity</label>
          <input type="range"
                 min="0" max="1" step="0.01"
                 value="${layer.opacity}"
                 data-role="opacity"
                 data-index="${index}">
        </div>
      `;

      layerContainer.appendChild(div);
    });

    attachLayerUIHandlers();
  }

  function attachLayerUIHandlers() {
    layerContainer.querySelectorAll(".layer-eye").forEach(el => {
      el.onclick = () => {
        const idx = +el.closest(".layer").dataset.index;
        layers[idx].enabled = !layers[idx].enabled;
        updateLayerUI();
      };
    });

    layerContainer.querySelectorAll(".layer-title").forEach(el => {
      el.ondblclick = () => {
        const idx = +el.closest(".layer").dataset.index;
        const newName = prompt("Rename Layer:", layers[idx].name);
        if (newName) layers[idx].name = newName;
        updateLayerUI();
        updateInspector();
      };
    });

    layerContainer.querySelectorAll("button[data-action='select']").forEach(el => {
      el.onclick = () => {
        selectedLayer = +el.dataset.index;
        updateLayerUI();
        updateInspector();
      };
    });

    layerContainer.querySelectorAll("input[data-role='opacity']").forEach(slider => {
      slider.oninput = () => {
        const idx = +slider.dataset.index;
        layers[idx].opacity = +slider.value;
        if (idx === selectedLayer) {
          const insp = document.getElementById("layerOpacity");
          if (insp) insp.value = slider.value;
        }
      };
    });

    addDragHandlers();
  }

  /**********************************
   * DRAG SORT
   **********************************/
  function addDragHandlers() {
    layerContainer.querySelectorAll(".layer").forEach(layerEl => {
      layerEl.addEventListener("dragstart", e => {
        dragSrcIndex = +layerEl.dataset.index;
        layerEl.classList.add("dragging");
      });
      layerEl.addEventListener("dragend", e => {
        layerEl.classList.remove("dragging");
        dragSrcIndex = null;
      });
      layerEl.addEventListener("dragover", e => e.preventDefault());
      layerEl.addEventListener("drop", e => {
        const targetIndex = +layerEl.dataset.index;
        if (dragSrcIndex === null || dragSrcIndex === targetIndex) return;

        const moved = layers.splice(dragSrcIndex, 1)[0];
        layers.splice(targetIndex, 0, moved);

        selectedLayer = targetIndex;
        updateLayerUI();
        updateInspector();
      });
    });
  }

  /**********************************
   * INSPECTOR (simplified)
   **********************************/
  function updateInspector() {
    if (selectedLayer == null || !layers[selectedLayer]) {
      inspectorContent.textContent = "No layer selected.";
      return;
    }
    const L = layers[selectedLayer];

    inspectorContent.innerHTML = `
      <h3>${L.name}</h3>
      <div class="insp-row">
        <label>Opacity</label>
        <input type="range" id="layerOpacity"
          min="0" max="1" step="0.01" value="${L.opacity}">
      </div>
    `;

    document.getElementById("layerOpacity").oninput = e => {
      L.opacity = +e.target.value;
      const slider = layerContainer.querySelector(
        `input[data-role='opacity'][data-index="${selectedLayer}"]`
      );
      if (slider) slider.value = L.opacity;
    };
  }

  /**********************************
   * RENDER LOOP WILL BE ADDED IN PART 2
   **********************************/
  function render() {
    requestAnimationFrame(render);
  }
  render();

  /**********************************
   * INITIAL
   **********************************/
  addLayer();
  updateLayerUI();
  updateInspector();
});

  /**********************************
   * WEBGL INITIALIZATION
   **********************************/
  function initGL() {
    gl = stageCanvas.getContext("webgl", {
      alpha: false,
      premultipliedAlpha: false
    });
    if (!gl) return alert("WebGL not supported");

    // Full-screen quad
    positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1, 1, -1, -1, 1,
        -1, 1, 1, -1,  1, 1
      ]),
      gl.STATIC_DRAW
    );

    compileShaders();
  }

  /**********************************
   * SHADERS (SWAPPABLE MODES)
   **********************************/
  const vertexShaderSource = `
    attribute vec2 a_position;
    varying vec2 vUv;
    void main() {
      vUv = (a_position + 1.0) * 0.5;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const fragmentShaderSource = `
    precision highp float;

    varying vec2 vUv;
    uniform float u_time;
    uniform float u_fft[128];
    uniform float u_opacity;
    uniform int u_mode;
    uniform int u_theme;

    // Per-theme accent colors
    vec3 palette(int theme) {
      if(theme==0) return vec3(0.2,0.7,1.0);
      if(theme==1) return vec3(1.0,0.4,0.2);
      if(theme==2) return vec3(0.8,0.5,1.0);
      if(theme==3) return vec3(0.4,0.8,0.4);
      if(theme==4) return vec3(1.0,1.0,0.4);
      if(theme==5) return vec3(1.0,0.5,0.7);
      if(theme==6) return vec3(0.5,0.7,1.0);
      return vec3(0.8,0.6,1.0);
    }

    float bass() { return u_fft[4] / 255.0; }

    vec3 modeShader(int m) {
      vec3 col = vec3(0.0);
      vec3 theme = palette(u_theme);

      if (m == 0) {
        // Soft pulse
        float a = bass();
        float r = length(vUv - 0.5);
        col = theme * smoothstep(0.3, 0.05 + a*0.3, r);
      }
      else if (m == 1) {
        // Bass radial rays
        float t = u_time * 0.5;
        float angle = atan(vUv.y - 0.5, vUv.x - 0.5);
        float rays = abs(sin(angle*20.0 + t));
        col = theme * rays * bass();
      }
      else if (m == 2) {
        // Frequency bars
        float bar = floor(vUv.x * 64.0);
        float f = u_fft[int(bar)] / 255.0;
        col = theme * f * smoothstep(0.6,0.2,abs(vUv.y-0.5));
      }
      else {
        col = theme * (0.1 + 0.9*bass());
      }

      return col;
    }

    void main() {
      vec3 c = modeShader(u_mode);
      c *= u_opacity;
      gl_FragColor = vec4(c, 1.0);
    }
  `;

  function cShader(src, type) {
    let s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      console.error(gl.getShaderInfoLog(s));
    return s;
  }

  function compileShaders() {
    const vs = cShader(vertexShaderSource, gl.VERTEX_SHADER);
    const fs = cShader(fragmentShaderSource, gl.FRAGMENT_SHADER);

    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      console.error(gl.getProgramInfoLog(program));
  }

  /**********************************
   * DRAW
   **********************************/
  let lastTime = 0;

  function drawLayer(layer) {
    if (!layer.enabled || layer.opacity <= 0) return;

    gl.useProgram(program);

    const timeLoc = gl.getUniformLocation(program, "u_time");
    gl.uniform1f(timeLoc, lastTime);

    const opLoc = gl.getUniformLocation(program, "u_opacity");
    gl.uniform1f(opLoc, layer.opacity);

    const modeLoc = gl.getUniformLocation(program, "u_mode");
    gl.uniform1i(modeLoc, layer.visualMode);

    const themeLoc = gl.getUniformLocation(program, "u_theme");
    gl.uniform1i(themeLoc, layer.colorTheme);

    // FFT uniform
    if (analyser && freqData) {
      analyser.getByteFrequencyData(freqData);
    }
    const fftLoc = gl.getUniformLocation(program, "u_fft");
    gl.uniform1fv(fftLoc, freqData.slice(0,128));

    const posLoc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /**********************************
   * MASTER COMPOSITOR (Additive Glow!)
   **********************************/
  function render() {
    requestAnimationFrame(render);
    if (!gl) return;

    lastTime = performance.now() * 0.001;
    gl.viewport(0,0,gl.canvas.width,gl.canvas.height);

    gl.clearColor(0,0,0,1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE);  // 🔥 ADDITIVE MODE

    for (let layer of layers) {
      drawLayer(layer);
    }
  }

  /**********************************
   * FINAL INIT
   **********************************/
  function resize() {
    stageCanvas.width = stageCanvas.clientWidth;
    stageCanvas.height = stageCanvas.clientHeight;
    gl?.viewport(0,0,gl.canvas.width,gl.canvas.height);
  }

  window.addEventListener("resize", resize);

  initGL();
  resize();
  render();
});
