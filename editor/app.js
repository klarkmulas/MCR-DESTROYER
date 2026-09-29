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
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const groundPoint = new THREE.Vector3();
const groundDragOffset = new THREE.Vector3();

let currentMode = 'translate';
let groundDragging = false;
let groundDragSnapshot = null;
let groundBottomOffset = 0;
let groundPointerId = null;

let rigEditMode = false;
let rigEditRoot = null;
let selectedBone = null;

let gameMode = false;
let gamePlayer = null;
let gameVelocityY = 0;
let gameGrounded = false;
let gameStartTransform = null;
let gameViewState = null;
let gameRigVisibility = [];
const gameKeys = Object.create(null);
const gameClock = new THREE.Clock(false);
const gameMove = new THREE.Vector3();
const gameForward = new THREE.Vector3();
const gameRight = new THREE.Vector3();
const gameUp = new THREE.Vector3(0, 1, 0);
const gameRaycaster = new THREE.Raycaster();

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
  if (object.userData.gameCollider === undefined) {
    object.userData.gameCollider = object.userData.referenceImage ? false : true;
  }
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

function getRigContainer(root) {
  if (!root) return null;
  return root.children.find(function (child) {
    return child.userData && child.userData.forgeRigContainer;
  }) || root.getObjectByName('__FORGE3D_RIG__') || null;
}

function getRigVisualGroup(root) {
  const rig = getRigContainer(root);
  if (!rig) return null;
  return rig.children.find(function (child) {
    return child.userData && child.userData.forgeRigVisualGroup;
  }) || rig.getObjectByName('__FORGE3D_RIG_VISUALS__') || null;
}

function getRigBones(root) {
  const rig = getRigContainer(root);
  const bones = [];
  if (!rig) return bones;
  rig.traverse(function (object) {
    if (object.isBone && object.userData && object.userData.forgeRigBone) bones.push(object);
  });
  return bones;
}

function findRigBone(root, name) {
  return getRigBones(root).find(function (bone) { return bone.name === name; }) || null;
}

function isInsideForgeRig(object, root) {
  let current = object;
  while (current && current !== root) {
    if (current.userData && current.userData.forgeRigContainer) return true;
    current = current.parent;
  }
  return false;
}

function getModelLocalBounds(root) {
  root.updateMatrixWorld(true);
  const inverseRoot = root.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  box.makeEmpty();

  root.traverse(function (child) {
    if (!child.isMesh || !child.geometry || isInsideForgeRig(child, root)) return;
    if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
    if (!child.geometry.boundingBox) return;

    const childBox = child.geometry.boundingBox.clone();
    const toRoot = new THREE.Matrix4().multiplyMatrices(inverseRoot, child.matrixWorld);
    childBox.applyMatrix4(toRoot);
    box.union(childBox);
  });

  return box;
}

function updateRigStatus() {
  const el = document.getElementById('rigStatus');
  if (!el) return;

  if (!selected) {
    el.textContent = 'Seleziona un modello 3D per aggiungere un rig.';
    el.dataset.state = 'idle';
    return;
  }

  const rig = getRigContainer(selected);
  if (!rig) {
    el.textContent = 'Modello selezionato: ' + (selected.name || 'Oggetto') + ' · nessuno scheletro.';
    el.dataset.state = 'idle';
    return;
  }

  if (rigEditMode && rigEditRoot === selected) {
    el.textContent = selectedBone
      ? 'Modifica ossa attiva · ' + selectedBone.name
      : 'Modifica ossa attiva · clicca un punto dello scheletro.';
    el.dataset.state = 'edit';
    return;
  }

  if (selected.userData && selected.userData.rigBound) {
    el.textContent = 'Scheletro collegato alla mesh ✓ · pronto per pose e animazioni.';
    el.dataset.state = 'bound';
  } else {
    el.textContent = 'Scheletro inserito ✓ · regola le ossa, poi usa Bind automatico.';
    el.dataset.state = 'ready';
  }
}

function createRigVisuals(root, rig, bones, radius) {
  const old = getRigVisualGroup(root);
  if (old) rig.remove(old);

  const visuals = new THREE.Group();
  visuals.name = '__FORGE3D_RIG_VISUALS__';
  visuals.userData.forgeRigVisualGroup = true;

  bones.forEach(function (bone) {
    const handle = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 12, 8),
      new THREE.MeshBasicMaterial({
        color: 0xffc857,
        transparent: true,
        opacity: 0.92,
        depthTest: false
      })
    );
    handle.name = '__RIG_HANDLE__' + bone.name;
    handle.userData.forgeRigVisual = true;
    handle.userData.forgeRigHandle = bone.name;
    handle.renderOrder = 1000;
    visuals.add(handle);
  });

  const segmentCount = Math.max(0, bones.filter(function (bone) { return bone.parent && bone.parent.isBone; }).length);
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segmentCount * 2 * 3), 3));
  const lines = new THREE.LineSegments(
    lineGeometry,
    new THREE.LineBasicMaterial({
      color: 0x70e1ff,
      transparent: true,
      opacity: 0.95,
      depthTest: false
    })
  );
  lines.name = '__FORGE3D_RIG_LINES__';
  lines.userData.forgeRigVisual = true;
  lines.userData.forgeRigLines = true;
  lines.renderOrder = 999;
  visuals.add(lines);

  rig.add(visuals);
  updateRigVisuals(root);
}

function updateRigVisuals(root) {
  const rig = getRigContainer(root);
  const visuals = getRigVisualGroup(root);
  if (!rig || !visuals) return;

  const bones = getRigBones(root);
  if (!bones.length) return;

  root.updateMatrixWorld(true);
  const inverseRoot = root.matrixWorld.clone().invert();
  const world = new THREE.Vector3();
  const local = new THREE.Vector3();
  const boneLocalPositions = new Map();

  bones.forEach(function (bone) {
    bone.getWorldPosition(world);
    local.copy(world).applyMatrix4(inverseRoot);
    boneLocalPositions.set(bone.name, local.clone());
  });

  visuals.children.forEach(function (child) {
    if (!child.userData || !child.userData.forgeRigHandle) return;
    const p = boneLocalPositions.get(child.userData.forgeRigHandle);
    if (p) child.position.copy(p);
    if (child.material && child.material.color) {
      child.material.color.set(selectedBone && selectedBone.name === child.userData.forgeRigHandle ? 0xff4f87 : 0xffc857);
    }
  });

  const lines = visuals.children.find(function (child) {
    return child.userData && child.userData.forgeRigLines;
  });
  if (!lines) return;

  const segments = bones.filter(function (bone) { return bone.parent && bone.parent.isBone; });
  let attr = lines.geometry.getAttribute('position');
  const expectedLength = segments.length * 2 * 3;
  if (!attr || attr.array.length !== expectedLength) {
    attr = new THREE.BufferAttribute(new Float32Array(expectedLength), 3);
    lines.geometry.setAttribute('position', attr);
  }

  let offset = 0;
  segments.forEach(function (bone) {
    const a = boneLocalPositions.get(bone.parent.name);
    const b = boneLocalPositions.get(bone.name);
    if (!a || !b) return;
    attr.array[offset++] = a.x; attr.array[offset++] = a.y; attr.array[offset++] = a.z;
    attr.array[offset++] = b.x; attr.array[offset++] = b.y; attr.array[offset++] = b.z;
  });
  attr.needsUpdate = true;
  lines.geometry.computeBoundingSphere();
}

function updateAllRigVisuals() {
  editorRoot.children.forEach(function (root) {
    if (getRigContainer(root)) updateRigVisuals(root);
  });
}

function createHumanoidRig(root) {
  if (!root) return toast('Seleziona prima un modello 3D.');
  if (isFloorObject(root) || root.userData.referenceImage) return toast('Seleziona un modello NPC, non il pavimento o una foto.');

  if (getRigContainer(root)) {
    toast('Questo modello ha già uno scheletro FORGE3D.');
    updateRigStatus();
    return;
  }

  let hasExistingBone = false;
  root.traverse(function (object) { if (object.isBone) hasExistingBone = true; });
  if (hasExistingBone) {
    toast('Il modello contiene già uno scheletro importato.');
    return;
  }

  const box = getModelLocalBounds(root);
  if (box.isEmpty()) return toast('Non trovo una mesh 3D valida nel modello selezionato.');

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  if (size.y < 0.001) return toast('Il modello è troppo piccolo per creare un rig.');

  checkpoint();

  const min = box.min;
  const h = size.y;
  const w = Math.max(size.x, h * 0.12);
  const d = Math.max(size.z, h * 0.08);

  function p(xFraction, yFraction, zFraction) {
    return new THREE.Vector3(
      center.x + w * xFraction,
      min.y + h * yFraction,
      center.z + d * (zFraction || 0)
    );
  }

  const positions = {
    Hips: p(0, 0.52, 0),
    Spine: p(0, 0.63, 0),
    Chest: p(0, 0.75, 0),
    Neck: p(0, 0.86, 0),
    Head: p(0, 0.94, 0),

    LeftShoulder: p(-0.18, 0.78, 0),
    LeftUpperArm: p(-0.28, 0.76, 0),
    LeftLowerArm: p(-0.38, 0.68, 0),
    LeftHand: p(-0.45, 0.59, 0),

    RightShoulder: p(0.18, 0.78, 0),
    RightUpperArm: p(0.28, 0.76, 0),
    RightLowerArm: p(0.38, 0.68, 0),
    RightHand: p(0.45, 0.59, 0),

    LeftUpperLeg: p(-0.105, 0.49, 0),
    LeftLowerLeg: p(-0.105, 0.27, 0),
    LeftFoot: p(-0.105, 0.055, 0.08),

    RightUpperLeg: p(0.105, 0.49, 0),
    RightLowerLeg: p(0.105, 0.27, 0),
    RightFoot: p(0.105, 0.055, 0.08)
  };

  const hierarchy = [
    ['Hips', null],
    ['Spine', 'Hips'],
    ['Chest', 'Spine'],
    ['Neck', 'Chest'],
    ['Head', 'Neck'],

    ['LeftShoulder', 'Chest'],
    ['LeftUpperArm', 'LeftShoulder'],
    ['LeftLowerArm', 'LeftUpperArm'],
    ['LeftHand', 'LeftLowerArm'],

    ['RightShoulder', 'Chest'],
    ['RightUpperArm', 'RightShoulder'],
    ['RightLowerArm', 'RightUpperArm'],
    ['RightHand', 'RightLowerArm'],

    ['LeftUpperLeg', 'Hips'],
    ['LeftLowerLeg', 'LeftUpperLeg'],
    ['LeftFoot', 'LeftLowerLeg'],

    ['RightUpperLeg', 'Hips'],
    ['RightLowerLeg', 'RightUpperLeg'],
    ['RightFoot', 'RightLowerLeg']
  ];

  const rig = new THREE.Group();
  rig.name = '__FORGE3D_RIG__';
  rig.userData.forgeRigContainer = true;
  rig.userData.rigVersion = 1;

  const boneMap = new Map();
  const bones = [];

  hierarchy.forEach(function (entry) {
    const name = entry[0];
    const parentName = entry[1];
    const bone = new THREE.Bone();
    bone.name = name;
    bone.userData.forgeRigBone = true;

    if (parentName) {
      const parent = boneMap.get(parentName);
      bone.position.copy(positions[name]).sub(positions[parentName]);
      parent.add(bone);
    } else {
      bone.position.copy(positions[name]);
      rig.add(bone);
    }

    boneMap.set(name, bone);
    bones.push(bone);
  });

  root.add(rig);
  root.userData.forgeRig = true;
  root.userData.rigBound = false;

  createRigVisuals(root, rig, bones, Math.max(h * 0.012, 0.008));
  root.updateMatrixWorld(true);

  startRigEdit(root);
  toast('Scheletro umanoide inserito nel modello.');
  setStatus('Rig NPC creato · regola le articolazioni prima del Bind');
}

function stopRigEdit(reattach) {
  rigEditMode = false;
  rigEditRoot = null;
  selectedBone = null;

  const button = document.querySelector('[data-action="rig-edit"]');
  if (button) button.classList.remove('active');

  if (reattach !== false && selected && currentMode !== 'ground') {
    transform.attach(selected);
    selectionBox.setFromObject(selected);
    selectionBox.visible = true;
  } else if (!selected) {
    transform.detach();
    selectionBox.visible = false;
  }

  updateRigStatus();
}

function startRigEdit(root) {
  root = root || selected;
  if (!root || !getRigContainer(root)) return toast('Prima aggiungi uno scheletro al modello.');

  if (selected !== root) selectObject(root);

  rigEditMode = true;
  rigEditRoot = root;
  selectedBone = null;
  selectionBox.visible = false;
  transform.detach();

  const visuals = getRigVisualGroup(root);
  if (visuals) visuals.visible = true;

  const button = document.querySelector('[data-action="rig-edit"]');
  if (button) button.classList.add('active');

  currentMode = 'translate';
  transform.setMode('translate');
  transform.setSpace('world');
  document.querySelectorAll('[data-mode]').forEach(function (modeButton) {
    modeButton.classList.toggle('active', modeButton.dataset.mode === 'translate');
  });

  updateRigVisuals(root);
  updateRigStatus();
  setStatus('Modifica scheletro · clicca un giunto giallo');
}

function toggleRigEdit() {
  if (rigEditMode) {
    stopRigEdit(true);
    setStatus('Modifica scheletro terminata');
    return;
  }
  startRigEdit(selected);
}

function toggleRigVisibility() {
  if (!selected) return toast('Seleziona prima un modello NPC.');
  const visuals = getRigVisualGroup(selected);
  if (!visuals) return toast('Il modello selezionato non ha uno scheletro FORGE3D.');
  visuals.visible = !visuals.visible;
  if (!visuals.visible && rigEditMode) stopRigEdit(true);
  updateRigStatus();
  toast(visuals.visible ? 'Scheletro visibile' : 'Scheletro nascosto');
}

function selectRigBone(root, boneName) {
  if (!root) return;
  if (!rigEditMode || rigEditRoot !== root) startRigEdit(root);

  const bone = findRigBone(root, boneName);
  if (!bone) return;

  selectedBone = bone;
  transform.setMode(currentMode === 'rotate' ? 'rotate' : 'translate');
  transform.setSpace(currentMode === 'rotate' ? 'local' : 'world');
  transform.attach(bone);
  selectionBox.visible = false;

  updateRigVisuals(root);
  updateRigStatus();
  setStatus('Osso selezionato: ' + bone.name + ' · W sposta · E ruota');
}

function onRigPointerDown(event) {
  if (gameMode || !rigEditMode || !rigEditRoot || currentMode === 'ground' || transform.dragging || transform.axis) return;

  setPointerFromEvent(event);
  const visuals = getRigVisualGroup(rigEditRoot);
  if (!visuals || !visuals.visible) return;

  const handles = [];
  visuals.traverse(function (object) {
    if (object.isMesh && object.userData && object.userData.forgeRigHandle) handles.push(object);
  });

  const hits = raycaster.intersectObjects(handles, false);
  if (!hits.length) return;

  const handle = hits[0].object;
  selectRigBone(rigEditRoot, handle.userData.forgeRigHandle);
  event.preventDefault();
  event.stopPropagation();
}

function pointSegmentDistanceSq(px, py, pz, ax, ay, az, bx, by, bz) {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  const denom = abx * abx + aby * aby + abz * abz;
  let t = denom > 1e-12 ? (apx * abx + apy * aby + apz * abz) / denom : 0;
  t = Math.max(0, Math.min(1, t));
  const dx = px - (ax + abx * t);
  const dy = py - (ay + aby * t);
  const dz = pz - (az + abz * t);
  return dx * dx + dy * dy + dz * dz;
}

async function bindSelectedToRig() {
  const root = selected;
  if (!root) return toast('Seleziona prima il modello NPC.');
  if (!getRigContainer(root)) return toast('Prima aggiungi lo scheletro NPC.');
  if (root.userData && root.userData.rigBound) return toast('La mesh è già collegata allo scheletro.');

  const bones = getRigBones(root);
  if (!bones.length) return toast('Scheletro non valido.');

  const meshes = [];
  root.traverse(function (object) {
    if (!object.isMesh || object.isSkinnedMesh || isInsideForgeRig(object, root)) return;
    if (!object.geometry || !object.geometry.getAttribute('position')) return;
    meshes.push(object);
  });

  if (!meshes.length) return toast('Non trovo mesh da collegare.');

  checkpoint();
  stopRigEdit(false);
  transform.detach();
  selectionBox.visible = false;
  setStatus('Bind automatico · calcolo pesi della mesh...');
  toast('Calcolo pesi automatici in corso…');

  await new Promise(function (resolve) { requestAnimationFrame(resolve); });

  root.updateMatrixWorld(true);
  const inverseRoot = root.matrixWorld.clone().invert();
  const bonePositions = [];
  const boneIndex = new Map();
  const temp = new THREE.Vector3();

  bones.forEach(function (bone, index) {
    boneIndex.set(bone, index);
    bone.getWorldPosition(temp);
    bonePositions.push(temp.clone().applyMatrix4(inverseRoot));
  });

  const segments = bones.map(function (bone, index) {
    const b = bonePositions[index];
    const parentIndex = bone.parent && bone.parent.isBone ? boneIndex.get(bone.parent) : undefined;
    const a = parentIndex === undefined ? b : bonePositions[parentIndex];
    return {
      index: index,
      ax: a.x, ay: a.y, az: a.z,
      bx: b.x, by: b.y, bz: b.z
    };
  });

  const bounds = getModelLocalBounds(root);
  const height = Math.max(bounds.getSize(new THREE.Vector3()).y, 0.01);
  const epsilon = Math.pow(height * 0.025, 2);

  const skeleton = new THREE.Skeleton(bones);
  skeleton.calculateInverses();

  for (const mesh of meshes) {
    mesh.updateMatrixWorld(true);
    const geometry = mesh.geometry.clone();
    const position = geometry.getAttribute('position');
    const vertexCount = position.count;
    const skinIndices = new Uint16Array(vertexCount * 4);
    const skinWeights = new Float32Array(vertexCount * 4);
    const toRoot = new THREE.Matrix4().multiplyMatrices(inverseRoot, mesh.matrixWorld);
    const vertex = new THREE.Vector3();

    for (let i = 0; i < vertexCount; i++) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(toRoot);

      let d0 = Infinity, d1 = Infinity, d2 = Infinity, d3 = Infinity;
      let i0 = 0, i1 = 0, i2 = 0, i3 = 0;

      for (let s = 0; s < segments.length; s++) {
        const seg = segments[s];
        const d = pointSegmentDistanceSq(
          vertex.x, vertex.y, vertex.z,
          seg.ax, seg.ay, seg.az,
          seg.bx, seg.by, seg.bz
        );

        if (d < d0) {
          d3 = d2; i3 = i2; d2 = d1; i2 = i1; d1 = d0; i1 = i0; d0 = d; i0 = seg.index;
        } else if (d < d1) {
          d3 = d2; i3 = i2; d2 = d1; i2 = i1; d1 = d; i1 = seg.index;
        } else if (d < d2) {
          d3 = d2; i3 = i2; d2 = d; i2 = seg.index;
        } else if (d < d3) {
          d3 = d; i3 = seg.index;
        }
      }

      const w0 = 1 / (d0 + epsilon);
      const w1 = 1 / (d1 + epsilon);
      const w2 = 1 / (d2 + epsilon);
      const w3 = 1 / (d3 + epsilon);
      const total = w0 + w1 + w2 + w3 || 1;
      const o = i * 4;

      skinIndices[o] = i0;
      skinIndices[o + 1] = i1;
      skinIndices[o + 2] = i2;
      skinIndices[o + 3] = i3;

      skinWeights[o] = w0 / total;
      skinWeights[o + 1] = w1 / total;
      skinWeights[o + 2] = w2 / total;
      skinWeights[o + 3] = w3 / total;
    }

    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

    const skinned = new THREE.SkinnedMesh(geometry, mesh.material);
    skinned.name = mesh.name;
    skinned.position.copy(mesh.position);
    skinned.quaternion.copy(mesh.quaternion);
    skinned.scale.copy(mesh.scale);
    skinned.matrix.copy(mesh.matrix);
    skinned.matrixAutoUpdate = mesh.matrixAutoUpdate;
    skinned.visible = mesh.visible;
    skinned.castShadow = mesh.castShadow;
    skinned.receiveShadow = mesh.receiveShadow;
    skinned.renderOrder = mesh.renderOrder;
    skinned.frustumCulled = false;
    skinned.userData = JSON.parse(JSON.stringify(mesh.userData || {}));

    if (mesh.morphTargetInfluences) skinned.morphTargetInfluences = mesh.morphTargetInfluences.slice();
    if (mesh.morphTargetDictionary) skinned.morphTargetDictionary = Object.assign({}, mesh.morphTargetDictionary);

    const parent = mesh.parent;
    const childIndex = parent.children.indexOf(mesh);
    const oldChildren = mesh.children.slice();
    oldChildren.forEach(function (child) { skinned.add(child); });

    parent.remove(mesh);
    parent.add(skinned);

    const currentIndex = parent.children.indexOf(skinned);
    if (currentIndex !== childIndex && childIndex >= 0) {
      parent.children.splice(currentIndex, 1);
      parent.children.splice(childIndex, 0, skinned);
    }

    root.updateMatrixWorld(true);
    skinned.updateMatrixWorld(true);
    skinned.bind(skeleton, skinned.matrixWorld.clone());
    skinned.normalizeSkinWeights();
  }

  root.userData.rigBound = true;
  root.updateMatrixWorld(true);
  selectObject(root);
  startRigEdit(root);

  const hips = findRigBone(root, 'Hips');
  if (hips) selectRigBone(root, 'Hips');

  updateRigStatus();
  setStatus('Bind completato · muovi o ruota le ossa per posare l’NPC');
  toast('Bind automatico completato ✓');
}


function getGamePlayer() {
  return editorRoot.children.find(function (object) {
    return object.userData && object.userData.gameRole === 'player';
  }) || null;
}

function updateGameStatus() {
  const el = document.getElementById('gameStatus');
  if (!el) return;

  const player = getGamePlayer();
  if (!player) {
    el.textContent = 'Nessun giocatore impostato.';
    el.dataset.state = 'idle';
    return;
  }

  const selectedInfo = selected
    ? ' · selezione: ' + (selected.name || 'Oggetto') + ' · collisione ' + (selected.userData.gameCollider === false ? 'OFF' : 'ON')
    : '';

  el.textContent = 'Giocatore: ' + (player.name || 'Player') + selectedInfo;
  el.dataset.state = gameMode ? 'play' : 'ready';
}

function setSelectedAsPlayer() {
  if (gameMode) return;
  if (!selected) return toast('Seleziona prima il personaggio da controllare.');
  if (isFloorObject(selected) || selected.userData.referenceImage) {
    return toast('Seleziona un personaggio o un modello 3D.');
  }

  checkpoint();

  editorRoot.children.forEach(function (object) {
    if (object.userData && object.userData.gameRole === 'player') {
      delete object.userData.gameRole;
    }
  });

  selected.userData.gameRole = 'player';
  selected.userData.gameCollider = false;
  renderTree();
  updateGameStatus();
  toast((selected.name || 'Modello') + ' impostato come giocatore');
  setStatus('Giocatore impostato · premi ▶ GIOCA');
}

function toggleSelectedCollider() {
  if (gameMode) return;
  if (!selected) return toast('Seleziona prima un oggetto.');
  if (selected.userData && selected.userData.gameRole === 'player') {
    return toast('Il giocatore usa un collider dedicato durante il Game Mode.');
  }

  checkpoint();
  selected.userData.gameCollider = selected.userData.gameCollider === false;
  updateGameStatus();
  toast('Collisione ' + (selected.userData.gameCollider ? 'ON' : 'OFF') + ' · ' + (selected.name || 'Oggetto'));
}

function getGameplayBounds(root) {
  const box = new THREE.Box3();
  box.makeEmpty();
  if (!root) return box;

  root.updateMatrixWorld(true);

  root.traverse(function (child) {
    if (!child.isMesh || !child.geometry) return;
    if (child.userData && child.userData.forgeRigVisual) return;
    if (child.userData && child.userData.referenceImage) return;
    if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
    if (!child.geometry.boundingBox) return;

    const childBox = child.geometry.boundingBox.clone();
    childBox.applyMatrix4(child.matrixWorld);
    box.union(childBox);
  });

  return box;
}

function getPlayerCollisionBox(player) {
  const box = getGameplayBounds(player);
  if (box.isEmpty()) return box;

  const size = box.getSize(new THREE.Vector3());
  const shrinkX = Math.min(0.14, Math.max(0, size.x * 0.16));
  const shrinkZ = Math.min(0.14, Math.max(0, size.z * 0.16));

  if (size.x > shrinkX * 2 + 0.03) {
    box.min.x += shrinkX;
    box.max.x -= shrinkX;
  }
  if (size.z > shrinkZ * 2 + 0.03) {
    box.min.z += shrinkZ;
    box.max.z -= shrinkZ;
  }

  box.min.y += Math.min(0.04, size.y * 0.02);
  return box;
}

function getHorizontalColliderRoots(player) {
  return editorRoot.children.filter(function (root) {
    if (root === player) return false;
    if (root.userData && root.userData.referenceImage) return false;
    if (root.userData && root.userData.gameCollider === false) return false;
    if (isFloorObject(root)) return false;
    return true;
  });
}

function playerHitsCollider(player) {
  const playerBox = getPlayerCollisionBox(player);
  if (playerBox.isEmpty()) return false;

  const roots = getHorizontalColliderRoots(player);
  for (const root of roots) {
    const box = getGameplayBounds(root);
    if (box.isEmpty()) continue;
    if (playerBox.intersectsBox(box)) return true;
  }
  return false;
}

function getGroundMeshes(player) {
  const meshes = [];
  editorRoot.children.forEach(function (root) {
    if (root === player) return;
    if (root.userData && root.userData.referenceImage) return;
    if (root.userData && root.userData.gameCollider === false) return;

    root.traverse(function (child) {
      if (!child.isMesh) return;
      if (child.userData && child.userData.forgeRigVisual) return;
      meshes.push(child);
    });
  });
  return meshes;
}

function findGroundHeight(player, playerBox) {
  if (!playerBox || playerBox.isEmpty()) return 0;

  const center = playerBox.getCenter(new THREE.Vector3());
  const origin = new THREE.Vector3(
    center.x,
    playerBox.min.y + Math.min(0.45, Math.max(0.18, (playerBox.max.y - playerBox.min.y) * 0.22)),
    center.z
  );

  gameRaycaster.set(origin, new THREE.Vector3(0, -1, 0));
  gameRaycaster.near = 0;
  gameRaycaster.far = 1.2;

  const hits = gameRaycaster.intersectObjects(getGroundMeshes(player), false);
  if (hits.length) return hits[0].point.y;

  return 0;
}

function getPlayerTarget(player) {
  const box = getGameplayBounds(player);
  if (box.isEmpty()) return player.getWorldPosition(new THREE.Vector3());

  const center = box.getCenter(new THREE.Vector3());
  const height = box.max.y - box.min.y;
  center.y = box.min.y + height * 0.66;
  return center;
}

function syncGameCamera(player, force) {
  const target = getPlayerTarget(player);
  const delta = target.clone().sub(orbit.target);

  if (force) {
    orbit.target.copy(target);
    camera.position.copy(target).add(new THREE.Vector3(0, 2.0, 4.4));
  } else {
    orbit.target.copy(target);
    camera.position.add(delta);
  }

  orbit.update();
}

function updatePlayButtons() {
  document.querySelectorAll('[data-action="game-play"]').forEach(function (button) {
    button.textContent = gameMode ? '■ STOP' : (button.id === 'gamePlayTop' ? '▶ GIOCA' : '▶ Gioca');
    button.classList.toggle('playing', gameMode);
  });
}

function startGame() {
  if (gameMode) return;

  const player = getGamePlayer();
  if (!player) return toast('Prima seleziona un personaggio e premi “Imposta come giocatore”.');

  if (rigEditMode) stopRigEdit(true);
  closeAiModal();

  gamePlayer = player;
  gameStartTransform = {
    position: player.position.clone(),
    quaternion: player.quaternion.clone(),
    scale: player.scale.clone()
  };

  gameViewState = {
    cameraPosition: camera.position.clone(),
    cameraQuaternion: camera.quaternion.clone(),
    orbitTarget: orbit.target.clone(),
    enablePan: orbit.enablePan,
    minDistance: orbit.minDistance,
    maxDistance: orbit.maxDistance,
    gridVisible: grid.visible
  };

  gameRigVisibility = [];
  editorRoot.traverse(function (object) {
    if (object.userData && object.userData.forgeRigVisualGroup) {
      gameRigVisibility.push({ object: object, visible: object.visible });
      object.visible = false;
    }
  });

  gameMode = true;
  gameVelocityY = 0;
  gameGrounded = false;
  Object.keys(gameKeys).forEach(function (key) { delete gameKeys[key]; });

  transform.detach();
  selectionBox.visible = false;
  grid.visible = false;
  orbit.enabled = true;
  orbit.enablePan = false;
  orbit.minDistance = 1.4;
  orbit.maxDistance = 8;

  syncGameCamera(player, true);

  document.body.classList.add('game-mode');
  document.getElementById('gameHud')?.classList.remove('hidden');
  updatePlayButtons();
  updateGameStatus();

  gameClock.start();
  gameClock.getDelta();
  renderer.domElement.focus();

  setStatus('GAME MODE · WASD muovi · Shift corri · Spazio salta · ESC esci');
}

function stopGame() {
  if (!gameMode) return;

  const player = gamePlayer;

  gameMode = false;
  gameClock.stop();
  gameVelocityY = 0;
  gameGrounded = false;
  Object.keys(gameKeys).forEach(function (key) { delete gameKeys[key]; });

  if (player && gameStartTransform) {
    player.position.copy(gameStartTransform.position);
    player.quaternion.copy(gameStartTransform.quaternion);
    player.scale.copy(gameStartTransform.scale);
    player.updateMatrixWorld(true);
  }

  gameRigVisibility.forEach(function (entry) {
    if (entry.object) entry.object.visible = entry.visible;
  });
  gameRigVisibility = [];

  if (gameViewState) {
    camera.position.copy(gameViewState.cameraPosition);
    camera.quaternion.copy(gameViewState.cameraQuaternion);
    orbit.target.copy(gameViewState.orbitTarget);
    orbit.enablePan = gameViewState.enablePan;
    orbit.minDistance = gameViewState.minDistance;
    orbit.maxDistance = gameViewState.maxDistance;
    grid.visible = gameViewState.gridVisible;
  }

  orbit.enabled = true;
  orbit.update();

  document.body.classList.remove('game-mode');
  document.getElementById('gameHud')?.classList.add('hidden');

  gamePlayer = null;
  gameStartTransform = null;
  gameViewState = null;

  updatePlayButtons();
  if (player) selectObject(player);
  updateGameStatus();
  setStatus('Editor · Game Mode terminato');
}

function toggleGameMode() {
  if (gameMode) stopGame();
  else startGame();
}

function updateGame(dt) {
  if (!gameMode || !gamePlayer) return;

  dt = Math.min(Math.max(dt || 0, 0), 0.05);

  const forwardPressed = gameKeys.KeyW || gameKeys.ArrowUp;
  const backPressed = gameKeys.KeyS || gameKeys.ArrowDown;
  const leftPressed = gameKeys.KeyA || gameKeys.ArrowLeft;
  const rightPressed = gameKeys.KeyD || gameKeys.ArrowRight;

  const inputForward = (forwardPressed ? 1 : 0) - (backPressed ? 1 : 0);
  const inputRight = (rightPressed ? 1 : 0) - (leftPressed ? 1 : 0);

  gameForward.copy(orbit.target).sub(camera.position);
  gameForward.y = 0;
  if (gameForward.lengthSq() < 1e-8) gameForward.set(0, 0, -1);
  gameForward.normalize();

  gameRight.crossVectors(gameForward, gameUp).normalize();

  gameMove.set(0, 0, 0);
  gameMove.addScaledVector(gameForward, inputForward);
  gameMove.addScaledVector(gameRight, inputRight);

  if (gameMove.lengthSq() > 0.001) {
    gameMove.normalize();
    const speed = (gameKeys.ShiftLeft || gameKeys.ShiftRight) ? 6.5 : 3.6;
    const distance = speed * dt;

    const oldX = gamePlayer.position.x;
    gamePlayer.position.x += gameMove.x * distance;
    gamePlayer.updateMatrixWorld(true);
    if (playerHitsCollider(gamePlayer)) {
      gamePlayer.position.x = oldX;
      gamePlayer.updateMatrixWorld(true);
    }

    const oldZ = gamePlayer.position.z;
    gamePlayer.position.z += gameMove.z * distance;
    gamePlayer.updateMatrixWorld(true);
    if (playerHitsCollider(gamePlayer)) {
      gamePlayer.position.z = oldZ;
      gamePlayer.updateMatrixWorld(true);
    }

    const desiredYaw = Math.atan2(gameMove.x, gameMove.z);
    let deltaYaw = desiredYaw - gamePlayer.rotation.y;
    while (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
    while (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
    gamePlayer.rotation.y += deltaYaw * Math.min(1, dt * 12);
  }

  gameVelocityY -= 18 * dt;
  gamePlayer.position.y += gameVelocityY * dt;
  gamePlayer.updateMatrixWorld(true);

  let playerBox = getPlayerCollisionBox(gamePlayer);
  const groundY = findGroundHeight(gamePlayer, playerBox);

  if (!playerBox.isEmpty() && gameVelocityY <= 0) {
    const bottom = playerBox.min.y;
    if (bottom <= groundY + 0.08 && bottom >= groundY - 0.75) {
      gamePlayer.position.y += groundY - bottom;
      gamePlayer.updateMatrixWorld(true);
      gameVelocityY = 0;
      gameGrounded = true;
    } else {
      gameGrounded = false;
    }
  }

  if (gamePlayer.position.y < -30) {
    gamePlayer.position.copy(gameStartTransform.position);
    gamePlayer.quaternion.copy(gameStartTransform.quaternion);
    gameVelocityY = 0;
    gamePlayer.updateMatrixWorld(true);
  }

  syncGameCamera(gamePlayer, false);
  setStatus(
    'GAME MODE · ' +
    ((gameKeys.ShiftLeft || gameKeys.ShiftRight) ? 'Corsa' : 'Movimento') +
    (gameGrounded ? ' · a terra' : ' · in aria')
  );
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
    mesh.userData.isFloor = true;
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
  if (rigEditMode && object !== rigEditRoot) stopRigEdit(false);

  selected = object || null;
  selectedBone = null;

  if (selected) {
    if (currentMode === 'ground' || rigEditMode) transform.detach();
    else transform.attach(selected);
    selectionBox.setFromObject(selected);
    selectionBox.visible = !rigEditMode;
    selectedLabel.textContent = selected.name || 'Oggetto';
  } else {
    transform.detach();
    selectionBox.visible = false;
    selectedLabel.textContent = 'Nessuna selezione';
  }
  renderTree();
  refreshInspector();
  updateRigStatus();
  updateGameStatus();
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
    const icon = object.userData && object.userData.gameRole === 'player' ? '🎮' : (object.isGroup ? '◇' : '◆');
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
  if (mode === 'ground' && rigEditMode) stopRigEdit(true);

  currentMode = mode;

  if (mode === 'ground') {
    transform.detach();
    orbit.enabled = true;
    setStatus('Modalità Pavimento · trascina un oggetto sul piano');
  } else {
    transform.setMode(mode);
    transform.setSpace(rigEditMode && selectedBone && mode === 'rotate' ? 'local' : 'world');

    if (rigEditMode && selectedBone) transform.attach(selectedBone);
    else if (rigEditMode) transform.detach();
    else if (selected) transform.attach(selected);

    if (rigEditMode && selectedBone) {
      setStatus((mode === 'rotate' ? 'Ruota osso' : mode === 'translate' ? 'Sposta osso' : 'Scala osso') + ' · ' + selectedBone.name);
    } else {
      setStatus(mode === 'translate' ? 'Modalità Sposta' : mode === 'rotate' ? 'Modalità Ruota' : 'Modalità Scala');
    }
  }

  document.querySelectorAll('[data-mode]').forEach(function (button) {
    button.classList.toggle('active', button.dataset.mode === mode);
  });
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

  const hiddenRigVisuals = [];
  editorRoot.traverse(function (object) {
    if (object.userData && object.userData.forgeRigVisualGroup) {
      hiddenRigVisuals.push({ object: object, visible: object.visible });
      object.visible = false;
    }
  });

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
  } finally {
    hiddenRigVisuals.forEach(function (entry) { entry.object.visible = entry.visible; });
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

function setPointerFromEvent(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}

function isFloorObject(object) {
  if (!object) return false;
  return object.userData?.isFloor === true || /^Pavimento(?:\s|$)/i.test(object.name || '');
}

function getFloorMeshes(excludeRoot) {
  const floorMeshes = [];
  editorRoot.children.forEach(function (root) {
    if (root === excludeRoot || !isFloorObject(root)) return;
    root.traverse(function (child) {
      if (child.isMesh) floorMeshes.push(child);
    });
  });
  return floorMeshes;
}

function getGroundPointFromEvent(event, excludeRoot) {
  setPointerFromEvent(event);

  const floorMeshes = getFloorMeshes(excludeRoot);
  if (floorMeshes.length) {
    const floorHits = raycaster.intersectObjects(floorMeshes, false);
    if (floorHits.length) return floorHits[0].point.clone();
  }

  groundPlane.constant = 0;
  const hit = raycaster.ray.intersectPlane(groundPlane, groundPoint);
  return hit ? groundPoint.clone() : null;
}

function getDraggableHit(event) {
  setPointerFromEvent(event);
  const meshes = [];
  editorRoot.children.forEach(function (root) {
    if (isFloorObject(root)) return;
    root.traverse(function (child) {
      if (child.isMesh) meshes.push(child);
    });
  });
  const hits = raycaster.intersectObjects(meshes, false);
  if (!hits.length) return null;
  return rootEditorObject(hits[0].object);
}

function beginGroundDrag(event) {
  if (gameMode || currentMode !== 'ground' || event.button !== 0) return;

  const object = getDraggableHit(event);
  if (!object) return;

  const point = getGroundPointFromEvent(event, object);
  if (!point) return;

  selectObject(object);

  const box = new THREE.Box3().setFromObject(object);
  groundBottomOffset = box.min.y - object.position.y;
  groundDragOffset.set(object.position.x - point.x, 0, object.position.z - point.z);
  groundDragSnapshot = snapshot();
  groundDragging = true;
  groundPointerId = event.pointerId;
  orbit.enabled = false;

  object.position.y = point.y - groundBottomOffset;
  object.updateMatrixWorld(true);
  selectionBox.setFromObject(object);
  refreshInspector();

  if (renderer.domElement.setPointerCapture) {
    try { renderer.domElement.setPointerCapture(event.pointerId); } catch (error) {}
  }

  event.preventDefault();
  event.stopPropagation();
}

function moveGroundDrag(event) {
  if (!groundDragging || currentMode !== 'ground' || !selected) return;

  const point = getGroundPointFromEvent(event, selected);
  if (!point) return;

  selected.position.x = point.x + groundDragOffset.x;
  selected.position.z = point.z + groundDragOffset.z;
  selected.position.y = point.y - groundBottomOffset;
  selected.updateMatrixWorld(true);

  selectionBox.setFromObject(selected);
  refreshInspector();
  setStatus('Spostamento sul pavimento · X ' + selected.position.x.toFixed(2) + ' · Z ' + selected.position.z.toFixed(2));

  event.preventDefault();
  event.stopPropagation();
}

function endGroundDrag(event) {
  if (!groundDragging) return;
  if (groundPointerId !== null && event.pointerId !== undefined && event.pointerId !== groundPointerId) return;

  groundDragging = false;
  orbit.enabled = true;

  if (groundDragSnapshot) {
    undoStack.push(groundDragSnapshot);
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
    groundDragSnapshot = null;
  }

  if (renderer.domElement.releasePointerCapture && groundPointerId !== null) {
    try { renderer.domElement.releasePointerCapture(groundPointerId); } catch (error) {}
  }
  groundPointerId = null;

  if (selected) {
    selected.updateMatrixWorld(true);
    selectionBox.setFromObject(selected);
    refreshInspector();
    renderTree();
  }

  setStatus('Oggetto appoggiato al pavimento');
}

renderer.domElement.addEventListener('pointerdown', onRigPointerDown, true);
renderer.domElement.addEventListener('pointerdown', beginGroundDrag, true);
renderer.domElement.addEventListener('pointermove', moveGroundDrag, true);
renderer.domElement.addEventListener('pointerup', endGroundDrag, true);
renderer.domElement.addEventListener('pointercancel', endGroundDrag, true);

function onViewportPointerDown(event) {
  if (gameMode || rigEditMode || currentMode === 'ground' || transform.dragging) return;
  setPointerFromEvent(event);

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
  if (rigEditMode && rigEditRoot) {
    rigEditRoot.updateMatrixWorld(true);
    updateRigVisuals(rigEditRoot);
    updateRigStatus();
  }

  if (selected && !rigEditMode) {
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
    if (gameMode) return;
    const type = button.dataset.add;
    if (['box', 'sphere', 'cylinder', 'cone', 'plane', 'torus'].includes(type)) createPrimitive(type);
    else if (['wall', 'floor', 'door', 'window'].includes(type)) createArchitecture(type);
    else if (type === 'mannequin') createMannequin();
  });
});

document.querySelectorAll('[data-mode]').forEach(function (button) {
  button.addEventListener('click', function () {
    if (gameMode) return;
    setMode(button.dataset.mode);
  });
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
  if (action === 'game-play') return toggleGameMode();
  if (action === 'game-stop') return stopGame();
  if (gameMode) return;

  if (action === 'new') newProject();
  if (action === 'save') saveProject();
  if (action === 'load') loadProject();
  if (action === 'import') importFile.click();
  if (action === 'export') exportGLB();
  if (action === 'undo') undo();
  if (action === 'redo') redo();
  if (action === 'delete') {
    if (rigEditMode) toast('Esci da Modifica ossa prima di eliminare il modello.');
    else deleteSelected();
  }
  if (action === 'duplicate') {
    if (rigEditMode) toast('Esci da Modifica ossa prima di duplicare il modello.');
    else duplicateSelected();
  }
  if (action === 'deselect') selectObject(null);
  if (action === 'focus') focusSelected();
  if (action === 'camera-home') cameraHome();
  if (action === 'camera-top') cameraTop();
  if (action === 'toggle-grid') grid.visible = !grid.visible;
  if (action === 'game-set-player') setSelectedAsPlayer();
  if (action === 'game-toggle-collider') toggleSelectedCollider();
  if (action === 'rig-add') createHumanoidRig(selected);
  if (action === 'rig-edit') toggleRigEdit();
  if (action === 'rig-bind') bindSelectedToRig();
  if (action === 'rig-toggle') toggleRigVisibility();
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

  if (gameMode) {
    gameKeys[event.code] = true;

    if (
      ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight'].includes(event.code)
    ) {
      event.preventDefault();
    }

    if (event.code === 'Space' && gameGrounded) {
      gameVelocityY = 6.4;
      gameGrounded = false;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      stopGame();
    }
    return;
  }

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
  if (key === 'g') setMode('ground');
  if (key === 'e') setMode('rotate');
  if (key === 'r') setMode('scale');
  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (rigEditMode) toast('Esci da Modifica ossa prima di eliminare il modello.');
    else deleteSelected();
  }
  if (key === 'f') focusSelected();
  if (event.key === 'Escape') {
    if (rigEditMode) stopRigEdit(true);
    else selectObject(null);
    closeAiModal();
  }
});

document.addEventListener('keyup', function (event) {
  if (!gameMode) return;
  gameKeys[event.code] = false;
});

window.addEventListener('beforeunload', function () {
  if (editorRoot.children.length) {
    try {
      localStorage.setItem(STORAGE_KEY + '-autosave', JSON.stringify({ scene: snapshot(), at: Date.now() }));
    } catch (error) {}
  }
});

function animate() {
  if (gameMode) {
    updateGame(gameClock.getDelta());
  } else {
    orbit.update();
  }

  updateAllRigVisuals();
  if (selected && selectionBox.visible) selectionBox.setFromObject(selected);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

renderTree();
updateCounts();
refreshInspector();
setMode('translate');
updateRigStatus();
updateGameStatus();
updatePlayButtons();
setStatus('Pronto · aggiungi un oggetto o importa un GLB');