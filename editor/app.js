import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

const viewport = document.getElementById('viewport');
const statusText = document.getElementById('statusText');
const objectCount = document.getElementById('objectCount');
const selectedLabel = document.getElementById('selectedLabel');
const sceneTree = document.getElementById('sceneTree');
const inspector = document.getElementById('inspector');
const emptyInspector = document.getElementById('emptyInspector');
const materialPanel = document.getElementById('materialPanel');
const toastEl = document.getElementById('toast');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);

const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 2000);
camera.position.set(8, 6, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.tabIndex = 0;
viewport.appendChild(renderer.domElement);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = 0.07;
orbit.target.set(0, 1.2, 0);
orbit.maxDistance = 100;
orbit.minDistance = 0.3;

const editorRoot = new THREE.Group();
editorRoot.name = 'FORGE3D_SCENE';
scene.add(editorRoot);

const grid = new THREE.GridHelper(60, 60, 0x42506a, 0x232d3b);
grid.material.transparent = true;
grid.material.opacity = 0.55;
scene.add(grid);

const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x262018, 2.2);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 3.0);
sun.position.set(6, 10, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -20;
sun.shadow.camera.right = 20;
sun.shadow.camera.top = 20;
sun.shadow.camera.bottom = -20;
scene.add(sun);

const fill = new THREE.DirectionalLight(0x829cff, 0.9);
fill.position.set(-7, 4, -4);
scene.add(fill);

const transform = new TransformControls(camera, renderer.domElement);
scene.add(transform.getHelper());
transform.setSize(0.85);

const selectionBox = new THREE.BoxHelper(undefined, 0x8b73ff);
selectionBox.visible = false;
scene.add(selectionBox);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

let selected = null;
let idCounter = 1;
let undoStack = [];
let redoStack = [];
let aiType = 'object';
let aiFiles = [];
let transformSnapshot = null;
let toastTimer = null;

const STORAGE_KEY = 'forge3d-project-v01';

function toast(message) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.classList.add('show');
  toastTimer = setTimeout(function () {
    toastEl.classList.remove('show');
  }, 2500);
}

function setStatus(message) {
  statusText.textContent = message;
}

function updateRendererSize() {
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', updateRendererSize);
new ResizeObserver(updateRendererSize).observe(viewport);
updateRendererSize();

function defaultMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color: color || 0xa9b7c8,
    roughness: 0.65,
    metalness: 0.05
  });
}

function prepareMesh(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (!mesh.userData.editorId) mesh.userData.editorId = 'obj-' + idCounter++;
}

function prepareObject(object) {
  if (!object.userData.editorId) object.userData.editorId = 'obj-' + idCounter++;
  object.traverse(function (child) {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

function uniqueName(base) {
  const names = new Set(editorRoot.children.map(function (o) { return o.name; }));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(base + ' ' + i)) i++;
  return base + ' ' + i;
}

function addObject(object, name, skipCheckpoint) {
  if (!skipCheckpoint) checkpoint();
  object.name = uniqueName(name || object.name || 'Oggetto');
  prepareObject(object);
  editorRoot.add(object);
  selectObject(object);
  renderTree();
  updateCounts();
  setStatus('Aggiunto: ' + object.name);
  return object;
}

function createPrimitive(type) {
  let geometry;
  let material = defaultMaterial();
  let mesh;
  let name;

  if (type === 'box') {
    geometry = new THREE.BoxGeometry(1, 1, 1);
    name = 'Cubo';
  } else if (type === 'sphere') {
    geometry = new THREE.SphereGeometry(0.65, 48, 32);
    name = 'Sfera';
  } else if (type === 'cylinder') {
    geometry = new THREE.CylinderGeometry(0.55, 0.55, 1.3, 40);
    name = 'Cilindro';
  } else if (type === 'cone') {
    geometry = new THREE.ConeGeometry(0.65, 1.4, 40);
    name = 'Cono';
  } else if (type === 'plane') {
    geometry = new THREE.PlaneGeometry(2, 2);
    material = new THREE.MeshStandardMaterial({ color: 0xb4becb, roughness: 0.8, side: THREE.DoubleSide });
    name = 'Piano';
  } else if (type === 'torus') {
    geometry = new THREE.TorusGeometry(0.7, 0.24, 24, 64);
    name = 'Toride';
  }

  mesh = new THREE.Mesh(geometry, material);
  prepareMesh(mesh);

  if (type === 'plane') {
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.01;
  } else {
    const box = new THREE.Box3().setFromObject(mesh);
    mesh.position.y = -box.min.y;
  }
  addObject(mesh, name);
}

function createArchitecture(type) {
  let mesh;
  if (type === 'wall') {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 2.8, 0.18), defaultMaterial(0xd9dde3));
    mesh.position.y = 1.4;
    addObject(mesh, 'Parete');
  }
  if (type === 'floor') {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(5, 0.12, 5), defaultMaterial(0x7c6955));
    mesh.position.y = 0.06;
    addObject(mesh, 'Pavimento');
  }
  if (type === 'door') {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.1, 0.10), defaultMaterial(0x7a5238));
    mesh.position.y = 1.05;
    addObject(mesh, 'Porta');
  }
  if (type === 'window') {
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xaedcff,
      roughness: 0.12,
      metalness: 0,
      transparent: true,
      opacity: 0.42,
      transmission: 0.25,
      side: THREE.DoubleSide
    });
    mesh = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 0.07), mat);
    mesh.position.y = 1.45;
    addObject(mesh, 'Finestra');
  }
}

function createMannequin() {
  checkpoint();
  const person = new THREE.Group();
  person.name = uniqueName('Personaggio');
  person.userData.editorId = 'obj-' + idCounter++;

  const skin = new THREE.MeshStandardMaterial({ color: 0xd5a07a, roughness: 0.75 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0x4e69a6, roughness: 0.7 });
  const trousers = new THREE.MeshStandardMaterial({ color: 0x273343, roughness: 0.75 });
  const shoes = new THREE.MeshStandardMaterial({ color: 0x171b22, roughness: 0.8 });

  function part(geometry, material, name, x, y, z, rx, rz) {
    const m = new THREE.Mesh(geometry, material.clone());
    m.name = name;
    m.position.set(x || 0, y || 0, z || 0);
    m.rotation.x = rx || 0;
    m.rotation.z = rz || 0;
    m.castShadow = true;
    m.receiveShadow = true;
    person.add(m);
    return m;
  }

  part(new THREE.SphereGeometry(0.23, 32, 24), skin, 'Testa', 0, 1.74, 0);
  part(new THREE.CapsuleGeometry(0.28, 0.55, 8, 20), shirt, 'Torso', 0, 1.18, 0);
  part(new THREE.CapsuleGeometry(0.09, 0.48, 6, 16), shirt, 'Braccio SX', -0.38, 1.22, 0, 0, -0.08);
  part(new THREE.CapsuleGeometry(0.09, 0.48, 6, 16), shirt, 'Braccio DX', 0.38, 1.22, 0, 0, 0.08);
  part(new THREE.CapsuleGeometry(0.105, 0.60, 6, 16), trousers, 'Gamba SX', -0.15, 0.52, 0);
  part(new THREE.CapsuleGeometry(0.105, 0.60, 6, 16), trousers, 'Gamba DX', 0.15, 0.52, 0);
  part(new THREE.BoxGeometry(0.20, 0.10, 0.36), shoes, 'Scarpa SX', -0.15, 0.10, 0.07);
  part(new THREE.BoxGeometry(0.20, 0.10, 0.36), shoes, 'Scarpa DX', 0.15, 0.10, 0.07);

  prepareObject(person);
  editorRoot.add(person);
  selectObject(person);
  renderTree();
  updateCounts();
  setStatus('Personaggio base creato');
}

function rootEditorObject(object) {
  let current = object;
  while (current && current.parent && current.parent !== editorRoot) current = current.parent;
  return current && current.parent === editorRoot ? current : null;
}

function selectObject(object) {
  selected = object || null;
  if (selected) {
    transform.attach(selected);
    selectionBox.setFromObject(selected);
    selectionBox.visible = true;
    selectedLabel.textContent = selected.name || 'Oggetto';
  } else {
    transform.detach();
    selectionBox.visible = false;
    selectedLabel.textContent = 'Nessuna selezione';
  }
  renderTree();
  refreshInspector();
}

function renderTree() {
  sceneTree.innerHTML = '';
  if (!editorRoot.children.length) {
    sceneTree.innerHTML = '<div class="empty-state">La scena è vuota</div>';
    return;
  }

  editorRoot.children.forEach(function (object) {
    const item = document.createElement('div');
    item.className = 'tree-item' + (selected === object ? ' selected' : '');
    const icon = object.isGroup ? '◇' : '◆';
    item.innerHTML = '<span class="tree-icon">' + icon + '</span><span></span>';
    item.querySelector('span:last-child').textContent = object.name || object.type;
    item.addEventListener('click', function () { selectObject(object); });
    sceneTree.appendChild(item);
  });
}

function updateCounts() {
  const n = editorRoot.children.length;
  objectCount.textContent = n + (n === 1 ? ' oggetto' : ' oggetti');
}

function firstMaterial(object) {
  let found = null;
  object.traverse(function (child) {
    if (!found && child.isMesh && child.material) {
      found = Array.isArray(child.material) ? child.material[0] : child.material;
    }
  });
  return found;
}

function everyMaterial(object, callback) {
  object.traverse(function (child) {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach(callback);
  });
}

function setNum(id, value) {
  const el = document.getElementById(id);
  if (document.activeElement !== el) el.value = Number(value).toFixed(3);
}

function refreshInspector() {
  if (!selected) {
    inspector.classList.add('hidden');
    emptyInspector.classList.remove('hidden');
    return;
  }

  inspector.classList.remove('hidden');
  emptyInspector.classList.add('hidden');

  const propName = document.getElementById('propName');
  if (document.activeElement !== propName) propName.value = selected.name || '';

  setNum('posX', selected.position.x);
  setNum('posY', selected.position.y);
  setNum('posZ', selected.position.z);
  setNum('rotX', THREE.MathUtils.radToDeg(selected.rotation.x));
  setNum('rotY', THREE.MathUtils.radToDeg(selected.rotation.y));
  setNum('rotZ', THREE.MathUtils.radToDeg(selected.rotation.z));
  setNum('scaleX', selected.scale.x);
  setNum('scaleY', selected.scale.y);
  setNum('scaleZ', selected.scale.z);

  const material = firstMaterial(selected);
  materialPanel.classList.toggle('hidden', !material);
  if (material) {
    if (material.color) document.getElementById('matColor').value = '#' + material.color.getHexString();
    document.getElementById('roughness').value = material.roughness == null ? 0.5 : material.roughness;
    document.getElementById('metalness').value = material.metalness == null ? 0 : material.metalness;
    document.getElementById('wireframe').checked = !!material.wireframe;
  }
}

function snapshot() {
  return editorRoot.toJSON();
}

function checkpoint() {
  undoStack.push(snapshot());
  if (undoStack.length > 50) undoStack.shift();
  redoStack = [];
}

function disposeObject(object) {
  object.traverse(function (child) {
    if (child.geometry && child.geometry.dispose) child.geometry.dispose();
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(function (mat) {
        if (mat.map && mat.map.dispose) mat.map.dispose();
        if (mat.dispose) mat.dispose();
      });
    }
  });
}

function clearEditor(dispose) {
  selectObject(null);
  const children = editorRoot.children.slice();
  children.forEach(function (child) {
    editorRoot.remove(child);
    if (dispose) disposeObject(child);
  });
}

function restore(data) {
  clearEditor(true);
  const loader = new THREE.ObjectLoader();
  const parsed = loader.parse(data);
  parsed.children.slice().forEach(function (child) {
    parsed.remove(child);
    editorRoot.add(child);
    prepareObject(child);
  });
  selectObject(null);
  renderTree();
  updateCounts();
}

function undo() {
  if (!undoStack.length) {
    toast('Niente da annullare');
    return;
  }
  redoStack.push(snapshot());
  restore(undoStack.pop());
  toast('Annullato');
}

function redo() {
  if (!redoStack.length) {
    toast('Niente da ripetere');
    return;
  }
  undoStack.push(snapshot());
  restore(redoStack.pop());
  toast('Ripristinato');
}

function duplicateSelected() {
  if (!selected) return toast('Seleziona prima un oggetto');
  checkpoint();
  const clone = selected.clone(true);
  clone.traverse(function (child) {
    if (child.isMesh) {
      if (child.geometry) child.geometry = child.geometry.clone();
      if (child.material) {
        child.material = Array.isArray(child.material)
          ? child.material.map(function (m) { return m.clone(); })
          : child.material.clone();
      }
    }
  });
  clone.position.x += 0.6;
  clone.position.z += 0.6;
  clone.name = uniqueName(selected.name + ' copia');
  clone.userData.editorId = 'obj-' + idCounter++;
  prepareObject(clone);
  editorRoot.add(clone);
  selectObject(clone);
  renderTree();
  updateCounts();
}

function deleteSelected() {
  if (!selected) return;
  checkpoint();
  const old = selected;
  selectObject(null);
  editorRoot.remove(old);
  disposeObject(old);
  renderTree();
  updateCounts();
  setStatus('Oggetto eliminato');
}

function setMode(mode) {
  transform.setMode(mode);
  document.querySelectorAll('[data-mode]').forEach(function (button) {
    button.classList.toggle('active', button.dataset.mode === mode);
  });
  setStatus(mode === 'translate' ? 'Modalità Sposta' : mode === 'rotate' ? 'Modalità Ruota' : 'Modalità Scala');
}

function focusSelected() {
  if (!selected) return toast('Seleziona prima un oggetto');
  const box = new THREE.Box3().setFromObject(selected);
  if (box.isEmpty()) return;
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const dir = camera.position.clone().sub(orbit.target).normalize();
  const distance = Math.max(sphere.radius * 3.2, 1.5);
  orbit.target.copy(sphere.center);
  camera.position.copy(sphere.center).add(dir.multiplyScalar(distance));
  orbit.update();
}

function cameraHome() {
  camera.position.set(8, 6, 10);
  orbit.target.set(0, 1.2, 0);
  camera.up.set(0, 1, 0);
  orbit.update();
}

function cameraTop() {
  const target = selected ? new THREE.Box3().setFromObject(selected).getCenter(new THREE.Vector3()) : new THREE.Vector3(0, 0, 0);
  camera.position.set(target.x, target.y + 15, target.z + 0.001);
  camera.up.set(0, 0, -1);
  orbit.target.copy(target);
  orbit.update();
}

function newProject() {
  if (editorRoot.children.length) checkpoint();
  clearEditor(true);
  undoStack = [];
  redoStack = [];
  renderTree();
  updateCounts();
  cameraHome();
  setStatus('Nuovo progetto');
  toast('Nuovo progetto creato');
}

function saveProject() {
  try {
    const data = {
      version: 1,
      savedAt: new Date().toISOString(),
      scene: snapshot()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setStatus('Progetto salvato nel browser');
    toast('Progetto salvato');
  } catch (error) {
    console.error(error);
    toast('Salvataggio non riuscito');
  }
}

function loadProject() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return toast('Nessun salvataggio trovato');
  try {
    checkpoint();
    const data = JSON.parse(raw);
    restore(data.scene);
    setStatus('Progetto caricato');
    toast('Progetto caricato');
  } catch (error) {
    console.error(error);
    toast('File di salvataggio non valido');
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 500);
}

async function exportGLB() {
  if (!editorRoot.children.length) return toast('La scena è vuota');
  setStatus('Esportazione GLB...');
  try {
    const exporter = new GLTFExporter();
    const data = await exporter.parseAsync(editorRoot, {
      binary: true,
      trs: false,
      onlyVisible: true,
      maxTextureSize: 2048
    });
    downloadBlob(new Blob([data], { type: 'model/gltf-binary' }), 'forge3d-scene.glb');
    setStatus('GLB esportato');
    toast('GLB esportato');
  } catch (error) {
    console.error(error);
    setStatus('Errore esportazione');
    toast('Errore durante esportazione GLB');
  }
}

function normalizeImported(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  object.position.x -= center.x;
  object.position.z -= center.z;
  object.position.y -= box.min.y;
}

async function importModel(file) {
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  setStatus('Importazione ' + file.name + '...');
  try {
    let object;
    if (ext === 'glb') {
      const data = await file.arrayBuffer();
      const gltf = await new GLTFLoader().parseAsync(data, '');
      object = gltf.scene;
    } else if (ext === 'gltf') {
      const data = await file.text();
      const gltf = await new GLTFLoader().parseAsync(data, '');
      object = gltf.scene;
    } else if (ext === 'obj') {
      const text = await file.text();
      object = new OBJLoader().parse(text);
    } else {
      return toast('Formato non supportato');
    }

    normalizeImported(object);
    addObject(object, file.name.replace(/\.[^.]+$/, ''));
    setStatus('Importato: ' + file.name);
  } catch (error) {
    console.error(error);
    toast('Importazione non riuscita');
    setStatus('Errore importazione');
  }
}

function applyTextureFile(file) {
  if (!selected || !file) return;
  const reader = new FileReader();
  reader.onload = function () {
    checkpoint();
    new THREE.TextureLoader().load(reader.result, function (texture) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      everyMaterial(selected, function (material) {
        if ('map' in material) {
          material.map = texture.clone();
          material.map.needsUpdate = true;
          material.needsUpdate = true;
        }
      });
      toast('Texture applicata');
    });
  };
  reader.readAsDataURL(file);
}

function addReferenceFromFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function () {
    const img = new Image();
    img.onload = function () {
      checkpoint();
      const texture = new THREE.Texture(img);
      texture.needsUpdate = true;
      texture.colorSpace = THREE.SRGBColorSpace;
      const w = 4;
      const h = 4 * (img.height / img.width);
      const mat = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.88,
        toneMapped: false
      });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      plane.position.set(0, h / 2, -2.5);
      plane.userData.referenceImage = true;
      addObject(plane, 'Foto riferimento', true);
      toast('Foto inserita nella scena');
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function onViewportPointerDown(event) {
  if (transform.dragging) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const meshes = [];
  editorRoot.traverse(function (child) {
    if (child.isMesh) meshes.push(child);
  });
  const hits = raycaster.intersectObjects(meshes, false);
  if (hits.length) {
    const root = rootEditorObject(hits[0].object);
    if (root) selectObject(root);
  } else {
    selectObject(null);
  }
}
renderer.domElement.addEventListener('pointerdown', onViewportPointerDown);

transform.addEventListener('dragging-changed', function (event) {
  orbit.enabled = !event.value;
});

transform.addEventListener('mouseDown', function () {
  transformSnapshot = snapshot();
});

transform.addEventListener('mouseUp', function () {
  if (transformSnapshot) {
    undoStack.push(transformSnapshot);
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
    transformSnapshot = null;
  }
  refreshInspector();
  renderTree();
});

transform.addEventListener('objectChange', function () {
  if (selected) {
    selectionBox.setFromObject(selected);
    refreshInspector();
  }
});

function bindTransformField(id, property, axis, rotation) {
  const el = document.getElementById(id);
  el.addEventListener('change', function () {
    if (!selected) return;
    checkpoint();
    let value = parseFloat(el.value);
    if (!Number.isFinite(value)) return refreshInspector();
    if (rotation) value = THREE.MathUtils.degToRad(value);
    if (property === 'scale') value = Math.max(0.001, value);
    selected[property][axis] = value;
    selected.updateMatrixWorld(true);
    selectionBox.setFromObject(selected);
    refreshInspector();
  });
}

bindTransformField('posX', 'position', 'x', false);
bindTransformField('posY', 'position', 'y', false);
bindTransformField('posZ', 'position', 'z', false);
bindTransformField('rotX', 'rotation', 'x', true);
bindTransformField('rotY', 'rotation', 'y', true);
bindTransformField('rotZ', 'rotation', 'z', true);
bindTransformField('scaleX', 'scale', 'x', false);
bindTransformField('scaleY', 'scale', 'y', false);
bindTransformField('scaleZ', 'scale', 'z', false);

document.getElementById('propName').addEventListener('change', function (event) {
  if (!selected) return;
  checkpoint();
  selected.name = event.target.value.trim() || 'Oggetto';
  renderTree();
  refreshInspector();
  selectedLabel.textContent = selected.name;
});

document.getElementById('matColor').addEventListener('change', function (event) {
  if (!selected) return;
  checkpoint();
  everyMaterial(selected, function (material) {
    if (material.color) material.color.set(event.target.value);
  });
});

document.getElementById('roughness').addEventListener('change', function (event) {
  if (!selected) return;
  checkpoint();
  const value = parseFloat(event.target.value);
  everyMaterial(selected, function (material) {
    if ('roughness' in material) material.roughness = value;
  });
});

document.getElementById('metalness').addEventListener('change', function (event) {
  if (!selected) return;
  checkpoint();
  const value = parseFloat(event.target.value);
  everyMaterial(selected, function (material) {
    if ('metalness' in material) material.metalness = value;
  });
});

document.getElementById('wireframe').addEventListener('change', function (event) {
  if (!selected) return;
  checkpoint();
  everyMaterial(selected, function (material) {
    if ('wireframe' in material) material.wireframe = event.target.checked;
  });
});

document.querySelectorAll('[data-add]').forEach(function (button) {
  button.addEventListener('click', function () {
    const type = button.dataset.add;
    if (['box', 'sphere', 'cylinder', 'cone', 'plane', 'torus'].includes(type)) createPrimitive(type);
    else if (['wall', 'floor', 'door', 'window'].includes(type)) createArchitecture(type);
    else if (type === 'mannequin') createMannequin();
  });
});

document.querySelectorAll('[data-mode]').forEach(function (button) {
  button.addEventListener('click', function () { setMode(button.dataset.mode); });
});

const importFile = document.getElementById('importFile');
const textureFile = document.getElementById('textureFile');
const referenceFile = document.getElementById('referenceFile');

importFile.addEventListener('change', function () {
  importModel(importFile.files[0]);
  importFile.value = '';
});
textureFile.addEventListener('change', function () {
  applyTextureFile(textureFile.files[0]);
  textureFile.value = '';
});
referenceFile.addEventListener('change', function () {
  addReferenceFromFile(referenceFile.files[0]);
  referenceFile.value = '';
});

function handleAction(action) {
  if (action === 'new') newProject();
  if (action === 'save') saveProject();
  if (action === 'load') loadProject();
  if (action === 'import') importFile.click();
  if (action === 'export') exportGLB();
  if (action === 'undo') undo();
  if (action === 'redo') redo();
  if (action === 'delete') deleteSelected();
  if (action === 'duplicate') duplicateSelected();
  if (action === 'deselect') selectObject(null);
  if (action === 'focus') focusSelected();
  if (action === 'camera-home') cameraHome();
  if (action === 'camera-top') cameraTop();
  if (action === 'toggle-grid') grid.visible = !grid.visible;
  if (action === 'texture') {
    if (!selected) toast('Seleziona prima un oggetto');
    else textureFile.click();
  }
  if (action === 'reference-photo') referenceFile.click();
  if (action === 'ai-photo') openAiModal();
  if (action === 'close-ai') closeAiModal();
  if (action === 'ai-reference') {
    if (!aiFiles.length) return toast('Carica almeno una foto');
    addReferenceFromFile(aiFiles[0]);
    closeAiModal();
  }
  if (action === 'ai-generate') {
    if (!aiFiles.length) return toast('Carica almeno una foto');
    toast('Backend Foto → 3D non ancora collegato');
    document.querySelector('.ai-info span').textContent =
      'Le foto sono pronte. Il prossimo modulo collegherà il generatore 3D attraverso un backend sicuro; nessuna chiave API verrà esposta in GitHub Pages.';
  }
}

document.querySelectorAll('[data-action]').forEach(function (button) {
  button.addEventListener('click', function () { handleAction(button.dataset.action); });
});

function openAiModal() {
  document.getElementById('aiModal').classList.remove('hidden');
}

function closeAiModal() {
  document.getElementById('aiModal').classList.add('hidden');
}

document.querySelectorAll('[data-ai-type]').forEach(function (button) {
  button.addEventListener('click', function () {
    aiType = button.dataset.aiType;
    document.querySelectorAll('[data-ai-type]').forEach(function (b) {
      b.classList.toggle('active', b === button);
    });
  });
});

const aiImagesInput = document.getElementById('aiImages');
if (aiImagesInput) {
  aiImagesInput.addEventListener('change', function (event) {
    aiFiles = Array.from(event.target.files).slice(0, 4);
    const preview = document.getElementById('aiPreview');
    if (preview) preview.innerHTML = '';
    aiFiles.forEach(function (file) {
      if (!preview) return;
      const img = document.createElement('img');
      img.alt = file.name;
      img.src = URL.createObjectURL(file);
      img.onload = function () { URL.revokeObjectURL(img.src); };
      preview.appendChild(img);
    });
    const label = aiType === 'person' ? 'persona' : aiType === 'room' ? 'stanza' : 'oggetto';
    setStatus(aiFiles.length + ' foto caricate per ' + label);
  });
}

document.addEventListener('keydown', function (event) {
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;

  const key = event.key.toLowerCase();

  if ((event.ctrlKey || event.metaKey) && key === 'z') {
    event.preventDefault();
    if (event.shiftKey) redo(); else undo();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && key === 'y') {
    event.preventDefault();
    redo();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && key === 'd') {
    event.preventDefault();
    duplicateSelected();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && key === 's') {
    event.preventDefault();
    saveProject();
    return;
  }
  if (key === 'w') setMode('translate');
  if (key === 'e') setMode('rotate');
  if (key === 'r') setMode('scale');
  if (event.key === 'Delete' || event.key === 'Backspace') deleteSelected();
  if (key === 'f') focusSelected();
  if (event.key === 'Escape') {
    selectObject(null);
    closeAiModal();
  }
});

window.addEventListener('beforeunload', function () {
  if (editorRoot.children.length) {
    try {
      localStorage.setItem(STORAGE_KEY + '-autosave', JSON.stringify({ scene: snapshot(), at: Date.now() }));
    } catch (error) {}
  }
});

function animate() {
  orbit.update();
  if (selected && selectionBox.visible) selectionBox.setFromObject(selected);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

renderTree();
updateCounts();
refreshInspector();
setMode('translate');
setStatus('Pronto · aggiungi un oggetto o importa un GLB');