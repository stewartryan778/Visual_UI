let layers = [];
let selectedLayer = null;

class Layer {
  constructor() {
    this.enabled = true;
    this.opacity = 1.0;
    this.blend = "normal";
    this.source = null;
    this.type = "shader"; // shader | video | image
  }
}

document.getElementById("addLayerBtn").addEventListener("click", () => {
  let layer = new Layer();
  layers.push(layer);
  updateLayerUI();
});

function updateLayerUI() {
  const container = document.getElementById("layerContainer");
  container.innerHTML = "";

  layers.forEach((layer, index) => {
    let div = document.createElement("div");
    div.className = "layer";
    if (selectedLayer === index) div.classList.add("active");

    div.innerHTML = `
      <strong>Layer ${index + 1}</strong>
      <div class="layer-controls">
        <button onclick="toggleLayer(${index})">Mute</button>
        <button onclick="selectLayer(${index})">Select</button>
      </div>
    `;

    container.appendChild(div);
  });
}

function toggleLayer(i) {
  layers[i].enabled = !layers[i].enabled;
}

function selectLayer(i) {
  selectedLayer = i;
  updateLayerUI();
  updateInspector();
}

function render() {
  analyser.getByteFrequencyData(dataArray);

  gl.clear(gl.COLOR_BUFFER_BIT);

  layers.forEach(layer => {
    if (!layer.enabled) return;

    // for now, all layers run the same shader
    gl.uniform1f(uBass, bassValue());
    gl.uniform1f(uBright, brightnessControl.value);
    
    // opacity
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1f(uOpacity, layer.opacity);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  });

  requestAnimationFrame(render);
}
render();
