// ============================================================================
// BeeHaven Office — PixiJS v8 Renderer + WebSocket + Audio
// ============================================================================

import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';

// --- Constants ---
const CANVAS_W = 1480;
const CANVAS_H = 1040;
const COORD_SCALE = 2; // Backend rooms are half-scale

// WeWork palette
const P = {
  floor:      0xf5f0eb,
  floorLine:  0xede7df,
  wall:       0xd4d0cc,
  wallDark:   0xa8a8a8,
  wood:       0xc4a882,
  woodDark:   0x8b7355,
  glass:      0xe8f4f8,
  glassBrd:   0xb8d4e3,
  cushion:    0x4a6741,
  cushionAlt: 0xc17f3a,
  plant:      0x4ade80,
  plantDark:  0x22c55e,
  planter:    0xd4c5a9,
  honey:      0xf5c542,
  white:      0xffffff,
  offWhite:   0xf5f0eb,
  dark:       0x2D2926,
  leather:    0x6b5b4e,
  monitor:    0x1e293b,
  monGlow:    0x3b82f6,
  led:        0x22c55e,
  ledRed:     0xEF4444,
};

// Room definitions (backend coords * COORD_SCALE)
const ROOMS = [
  { id: 'lobby',        label: 'Reception',    x: 40,   y: 400, w: 200, h: 60,  color: 0xFEF3C7, accent: 0xD4A017 },
  { id: 'desk',         label: 'Team Office',   x: 250,  y: 40,  w: 600, h: 340, color: 0xDBEAFE, accent: 0x60A5FA },
  { id: 'phone-a',      label: 'Phone',         x: 40,   y: 40,  w: 80,  h: 100, color: 0xE0F2FE, accent: 0x38BDF8 },
  { id: 'phone-b',      label: 'Phone',         x: 1060, y: 40,  w: 80,  h: 100, color: 0xE0F2FE, accent: 0x38BDF8 },
  { id: 'server-room',  label: 'Server Room',   x: 1000, y: 470, w: 120, h: 160, color: 0xFEE2E2, accent: 0xEF4444 },
  { id: 'meeting-room', label: 'Conference',     x: 40,   y: 470, w: 200, h: 200, color: 0xD1FAE5, accent: 0x22C55E },
  { id: 'water-cooler', label: 'Lounge',         x: 640,  y: 470, w: 250, h: 200, color: 0xE0F2FE, accent: 0x38BDF8 },
  { id: 'coffee',       label: 'Kitchen',        x: 340,  y: 470, w: 200, h: 200, color: 0xFED7AA, accent: 0xF59E0B },
];

// Local ambient bees (rendered client-side alongside backend bees)
const AMBIENT_BEES = [
  { id: 'omni-artist',  name: 'OmniArtist',   homeRoom: 'desk',         color: 0x8B5CF6, accessory: 'beret' },
  { id: 'omni-manager', name: 'OmniManager',  homeRoom: 'meeting-room', color: 0x3B82F6, accessory: 'glasses' },
  { id: 'coder-1',      name: 'DevBee',       homeRoom: 'desk',         color: 0x22C55E, accessory: 'coder' },
  { id: 'coder-2',      name: 'StackBee',     homeRoom: 'desk',         color: 0x06B6D4, accessory: 'coder' },
  { id: 'coder-3',      name: 'ByteBee',      homeRoom: 'desk',         color: 0xF97316, accessory: 'coder' },
];

// --- State ---
let app = null;
let layers = {};
let ws = null;
let officeState = null;
let localBees = {};     // id -> { ...bee, drawX, drawY, gfx, label, bubble, bubbleText, bubbleTimer, wingPhase }
let ambientBees = {};   // id -> same structure for client-only bees
let frame = 0;
let voiceEnabled = false;
let audioQueue = [];
let isPlaying = false;
let currentAudioSource = null; // Reference to playing AudioBufferSourceNode for stop
let recording = false;
let mediaRecorder = null;
let projectFilter = null;  // null = show all, string = filter to that project
let lastEventLogKey = '';  // fingerprint to avoid re-rendering unchanged event log
let lastShopKey = '';      // fingerprint for shop panel
let lastHoney = 0;         // track honey for earning animation
let lastQueenZone = 'upper'; // track queen zone for elevator

// --- Multi-Office Building View State ---
let viewMode = 'single'; // 'single' | 'building'
let buildingTransition = 0; // 0 = single, 1 = building (animated)
let buildingTransitionTarget = 0;
let buildingProjects = []; // project names for building view
let buildingClickAreas = []; // { project, x, y, w, h } for click detection

// --- Floating Terminal Window State ---
const TERM_DEFAULTS = { x: 16, y: null, width: 560, height: 380, minimized: false, visible: true };
let termWindow = { ...TERM_DEFAULTS };
let termDragging = false, termResizing = false, termResizeDir = '';
let termDragOffset = { x: 0, y: 0 };
let termPreMaximize = null;
let shopOpen = false;
let accountOpen = false;
let accountState = { linked: false, profile: null, tier: 'local', connected: false };

// --- Camera (Zoom / Pan) ---
let camera = { x: 0, y: 0, zoom: 1 };
let cameraTarget = { x: 0, y: 0, zoom: 1 };
let isPanning = false;
let panLast = { x: 0, y: 0 };
let pointers = new Map();   // pointerId → {x, y} for touch
let lastPinchDist = 0;
const ZOOM_MIN = 0.5, ZOOM_MAX = 3.0;
const CAM_LERP = 0.15;

// --- Player Bee ---
let playerBee = null;
let keysDown = new Set();
const PLAYER_SPEED = 3.5;

// --- Elevator Constants ---
const ELEV = {
  shaftX: 920, shaftY: 80, shaftW: 60, shaftH: 580,
  cabW: 56, cabH: 84,
  upperStopY: 100,
  lowerStopY: 500,
  doorW: 26, doorH: 84,
  upperDoorY: 98,
  lowerDoorY: 498,
  doorSpeed: 0.04,
  moveSpeed: 0.025,
  holdFrames: 90,
};

const UPPER_ROOMS = new Set(['desk', 'phone-a', 'phone-b', 'lobby']);
const LOWER_ROOMS = new Set(['meeting-room', 'coffee', 'water-cooler', 'server-room']);

let elevator = {
  state: 'idle',
  currentFloor: 1,
  targetFloor: 1,
  cabY: ELEV.upperStopY,
  doorProgress: 0,
  holdTimer: 0,
  dingTimer: 0,
  cabGfx: null,
  upperDoorL: null, upperDoorR: null,
  lowerDoorL: null, lowerDoorR: null,
  upperMask: null, lowerMask: null,
  indicatorText: null, indicatorBg: null,
};

// --- A* Waypoint Pathfinding ---
const WAYPOINTS = [
  { id: 'phone-a',      x: 80,   y: 90,   room: 'phone-a' },
  { id: 'desk',         x: 500,  y: 200,  room: 'desk' },
  { id: 'phone-b',      x: 1100, y: 90,   room: 'phone-b' },
  { id: 'lobby',        x: 140,  y: 425,  room: 'lobby' },
  { id: 'meeting-room', x: 140,  y: 570,  room: 'meeting-room' },
  { id: 'coffee',       x: 440,  y: 570,  room: 'coffee' },
  { id: 'water-cooler', x: 765,  y: 570,  room: 'water-cooler' },
  { id: 'server-room',  x: 1060, y: 550,  room: 'server-room' },
  { id: 'hall-L',       x: 200,  y: 420,  room: null },
  { id: 'hall-C',       x: 500,  y: 420,  room: null },
  { id: 'hall-R',       x: 880,  y: 420,  room: null },
];

const EDGES = [
  ['phone-a', 'desk'],      ['desk', 'phone-b'],
  ['phone-a', 'hall-L'],    ['desk', 'hall-C'],
  ['desk', 'hall-R'],       ['phone-b', 'hall-R'],
  ['hall-L', 'hall-C'],     ['hall-C', 'hall-R'],
  ['hall-L', 'lobby'],      ['lobby', 'meeting-room'],
  ['hall-L', 'meeting-room'], ['hall-C', 'coffee'],
  ['hall-R', 'water-cooler'], ['hall-R', 'server-room'],
];

// Build adjacency map once
const ADJ = {};
for (const wp of WAYPOINTS) ADJ[wp.id] = [];
for (const [a, b] of EDGES) { ADJ[a].push(b); ADJ[b].push(a); }

// Waypoint lookup by id
const WP_MAP = {};
for (const wp of WAYPOINTS) WP_MAP[wp.id] = wp;

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function clientToCanvas(e) {
  const rect = app.canvas.getBoundingClientRect();
  const aspect = CANVAS_W / CANVAS_H;
  const containerAspect = rect.width / rect.height;
  let cw, ch, ox, oy;
  // object-fit: cover — one dimension overflows (clipped)
  if (containerAspect > aspect) {
    cw = rect.width; ch = cw / aspect;
    ox = 0; oy = (rect.height - ch) / 2;
  } else {
    ch = rect.height; cw = ch * aspect;
    ox = (rect.width - cw) / 2; oy = 0;
  }
  return {
    x: ((e.clientX - rect.left - ox) / cw) * CANVAS_W,
    y: ((e.clientY - rect.top - oy) / ch) * CANVAS_H,
  };
}

function wpDist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function aStarPath(startId, goalId) {
  if (startId === goalId) return [WP_MAP[goalId]];
  const goal = WP_MAP[goalId];
  if (!goal) return null;

  const openSet = new Set([startId]);
  const cameFrom = {};
  const gScore = {};
  const fScore = {};

  for (const wp of WAYPOINTS) {
    gScore[wp.id] = Infinity;
    fScore[wp.id] = Infinity;
  }
  gScore[startId] = 0;
  fScore[startId] = wpDist(WP_MAP[startId], goal);

  while (openSet.size > 0) {
    let current = null, minF = Infinity;
    for (const id of openSet) {
      if (fScore[id] < minF) { minF = fScore[id]; current = id; }
    }

    if (current === goalId) {
      const path = [goalId];
      let c = goalId;
      while (cameFrom[c]) { c = cameFrom[c]; path.unshift(c); }
      return path.map(id => WP_MAP[id]);
    }

    openSet.delete(current);
    for (const neighbor of ADJ[current]) {
      const tentG = gScore[current] + wpDist(WP_MAP[current], WP_MAP[neighbor]);
      if (tentG < gScore[neighbor]) {
        cameFrom[neighbor] = current;
        gScore[neighbor] = tentG;
        fScore[neighbor] = tentG + wpDist(WP_MAP[neighbor], goal);
        openSet.add(neighbor);
      }
    }
  }
  return null;
}

function findNearestWaypoint(x, y, roomId) {
  // Prefer waypoint in the same room
  let best = null, bestDist = Infinity;
  if (roomId) {
    for (const wp of WAYPOINTS) {
      if (wp.room === roomId) {
        const d = Math.hypot(x - wp.x, y - wp.y);
        if (d < bestDist) { bestDist = d; best = wp; }
      }
    }
  }
  // Fallback: nearest waypoint overall
  if (!best) {
    for (const wp of WAYPOINTS) {
      const d = Math.hypot(x - wp.x, y - wp.y);
      if (d < bestDist) { bestDist = d; best = wp; }
    }
  }
  return best;
}

function computePath(fromX, fromY, fromRoom, toX, toY, toRoom) {
  const startWP = findNearestWaypoint(fromX, fromY, fromRoom);
  const endWP = findNearestWaypoint(toX, toY, toRoom);
  if (!startWP || !endWP) return null;
  if (startWP.id === endWP.id) return [{ x: toX, y: toY }];

  const wpPath = aStarPath(startWP.id, endWP.id);
  if (!wpPath || wpPath.length === 0) return null;

  // Skip first waypoint (we're already near it), add final target position
  const coords = wpPath.slice(1).map(wp => ({ x: wp.x, y: wp.y }));
  coords.push({ x: toX, y: toY });
  return coords;
}

/** Determine which room contains a given canvas coordinate */
function findRoomAtPosition(x, y) {
  for (const room of ROOMS) {
    if (x >= room.x && x <= room.x + room.w && y >= room.y && y <= room.y + room.h) {
      return room.id;
    }
  }
  return null;
}

// --- Login / PIN ---
const PIN_STORAGE_KEY = 'beehaven-pin-hash';
let pinDigits = [];
let pinMode = 'verify'; // 'create' | 'confirm' | 'verify'
let pinFirstEntry = '';

async function hashPin(pin) {
  const data = new TextEncoder().encode('beehaven-salt-' + pin);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function updatePinDots() {
  const dots = document.querySelectorAll('.pin-dot');
  dots.forEach((dot, i) => {
    dot.classList.toggle('filled', i < pinDigits.length);
  });
}

async function handlePinComplete() {
  const pin = pinDigits.join('');
  const hash = await hashPin(pin);

  if (pinMode === 'create') {
    pinFirstEntry = hash;
    pinMode = 'confirm';
    pinDigits = [];
    updatePinDots();
    const label = document.getElementById('login-mode-label');
    label.textContent = 'Confirm PIN';
    label.classList.remove('pulse');
    void label.offsetWidth; // force reflow to restart animation
    label.classList.add('pulse');
    return;
  }

  if (pinMode === 'confirm') {
    if (hash === pinFirstEntry) {
      localStorage.setItem(PIN_STORAGE_KEY, hash);
      loginSuccess();
    } else {
      showPinError("PINs don't match — try again");
      pinMode = 'create';
      const label = document.getElementById('login-mode-label');
      label.textContent = 'Create PIN';
      label.classList.remove('pulse');
    }
    return;
  }

  // Verify mode
  const stored = localStorage.getItem(PIN_STORAGE_KEY);
  if (hash === stored) {
    loginSuccess();
  } else {
    showPinError('Wrong PIN — try again');
  }
}

function showPinError(msg) {
  const el = document.getElementById('pin-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  pinDigits = [];
  updatePinDots();
  // Re-trigger shake animation
  el.style.animation = 'none';
  requestAnimationFrame(() => { el.style.animation = ''; });
  setTimeout(() => el.classList.add('hidden'), 2500);
}

function loginSuccess() {
  sessionStorage.setItem('beehaven-session', '1');
  const loginScreen = document.getElementById('login-screen');
  const main = document.getElementById('main');

  // Animate out login
  loginScreen.classList.add('hidden');

  // Animate in office
  setTimeout(() => {
    loginScreen.style.display = 'none';
    main.classList.remove('main-hidden');
    main.classList.add('main-visible');
  }, 400);
}

function initLogin() {
  const loginScreen = document.getElementById('login-screen');
  if (!loginScreen) { return; }

  // Skip login if already authenticated this tab session
  if (sessionStorage.getItem('beehaven-session')) {
    loginScreen.style.display = 'none';
    document.getElementById('main').classList.remove('main-hidden');
    document.getElementById('main').classList.add('main-visible');
    return;
  }

  // Determine mode
  const storedHash = localStorage.getItem(PIN_STORAGE_KEY);
  if (storedHash) {
    pinMode = 'verify';
    document.getElementById('login-mode-label').textContent = 'Enter PIN';
  } else {
    pinMode = 'create';
    document.getElementById('login-mode-label').textContent = 'Create PIN';
  }

  // Bind numpad
  document.querySelectorAll('.pin-key').forEach(key => {
    key.addEventListener('click', () => {
      const k = key.dataset.key;
      document.getElementById('pin-error')?.classList.add('hidden');

      if (k === 'back') {
        pinDigits.pop();
        updatePinDots();
      } else if (k === 'enter') {
        if (pinDigits.length === 4) handlePinComplete();
      } else {
        if (pinDigits.length < 4) {
          pinDigits.push(k);
          updatePinDots();
          if (pinDigits.length === 4) {
            setTimeout(() => handlePinComplete(), 150);
          }
        }
      }
    });
  });

  // Skip login button
  document.getElementById('login-skip')?.addEventListener('click', () => {
    loginSuccess();
  });

  // Keyboard input
  document.addEventListener('keydown', (e) => {
    if (loginScreen.style.display === 'none') return;
    if (e.key >= '0' && e.key <= '9') {
      if (pinDigits.length < 4) {
        pinDigits.push(e.key);
        updatePinDots();
        if (pinDigits.length === 4) {
          setTimeout(() => handlePinComplete(), 150);
        }
      }
    } else if (e.key === 'Backspace') {
      pinDigits.pop();
      updatePinDots();
    } else if (e.key === 'Enter') {
      if (pinDigits.length === 4) handlePinComplete();
    }
  });
}

// --- Init ---
async function init() {
  // Initialize login screen first
  initLogin();

  app = new Application();
  await app.init({
    width: CANVAS_W,
    height: CANVAS_H,
    backgroundColor: P.floor,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    antialias: true,
  });

  document.getElementById('office-viewport').appendChild(app.canvas);

  // Create layers
  layers.floor = new Container();
  layers.rooms = new Container();
  layers.furniture = new Container();
  layers.bees = new Container();
  layers.ui = new Container();
  layers.buildingOverlay = new Container();
  layers.buildingOverlay.visible = false;

  // Camera container (zoom/pan) wraps officeRoot
  layers.camera = new Container();
  layers.officeRoot = new Container();
  layers.officeRoot.addChild(layers.floor, layers.rooms, layers.furniture, layers.bees, layers.ui);
  layers.camera.addChild(layers.officeRoot);
  app.stage.addChild(layers.camera, layers.buildingOverlay);

  // Effects layer (between furniture and bees)
  layers.effects = new Container();
  layers.officeRoot.addChildAt(layers.effects, layers.officeRoot.children.indexOf(layers.bees));

  drawFloor();
  drawRooms();
  drawFurniture();
  createElevator();
  initAmbientBees();
  initPlayerBee();
  initVisualEffects();
  initDoors();

  // Animation loop
  app.ticker.add(() => {
    frame++;
    updateCamera();
    updatePlayerBee();
    updateAllBees();
    updateElevator();
    updateVisualEffects();
    updateDoors();
    updateBuildingTransition();
  });

  // --- Camera input handlers ---
  app.canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (viewMode === 'building') return;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = clamp(cameraTarget.zoom * factor, ZOOM_MIN, ZOOM_MAX);
    const mouse = clientToCanvas(e);
    const wx = (mouse.x - camera.x) / camera.zoom;
    const wy = (mouse.y - camera.y) / camera.zoom;
    cameraTarget.zoom = newZoom;
    cameraTarget.x = mouse.x - wx * newZoom;
    cameraTarget.y = mouse.y - wy * newZoom;
  }, { passive: false });

  app.canvas.addEventListener('pointerdown', (e) => {
    if (viewMode === 'building') return;
    pointers.set(e.pointerId, clientToCanvas(e));
    if (pointers.size === 1 && camera.zoom > 1.01) {
      isPanning = true;
      panLast = clientToCanvas(e);
      app.canvas.setPointerCapture(e.pointerId);
      app.canvas.style.cursor = 'grabbing';
    }
    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      lastPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    }
  });

  app.canvas.addEventListener('pointermove', (e) => {
    if (viewMode === 'building') return;
    const pos = clientToCanvas(e);
    pointers.set(e.pointerId, pos);
    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      if (lastPinchDist > 0) {
        const factor = dist / lastPinchDist;
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        const newZoom = clamp(cameraTarget.zoom * factor, ZOOM_MIN, ZOOM_MAX);
        const wx = (mid.x - camera.x) / camera.zoom;
        const wy = (mid.y - camera.y) / camera.zoom;
        cameraTarget.zoom = newZoom;
        cameraTarget.x = mid.x - wx * newZoom;
        cameraTarget.y = mid.y - wy * newZoom;
      }
      lastPinchDist = dist;
      isPanning = false;
      return;
    }
    if (isPanning) {
      cameraTarget.x += pos.x - panLast.x;
      cameraTarget.y += pos.y - panLast.y;
      panLast = pos;
    }
  });

  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) lastPinchDist = 0;
    if (pointers.size === 0) {
      isPanning = false;
      app.canvas.style.cursor = camera.zoom > 1.01 ? 'grab' : '';
    }
  };
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);

  app.canvas.addEventListener('dblclick', () => {
    if (viewMode === 'building') return;
    cameraTarget = { x: 0, y: 0, zoom: 1 };
  });

  // Canvas click for building view
  app.canvas.addEventListener('click', (e) => {
    if (viewMode !== 'building' || buildingTransition < 0.8) return;
    const rect = app.canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;
    for (const area of buildingClickAreas) {
      if (cx >= area.x && cx <= area.x + area.w && cy >= area.y && cy <= area.y + area.h) {
        exitBuildingView(area.project);
        break;
      }
    }
  });

  // --- Player WASD / Arrow key handlers ---
  window.addEventListener('keydown', (e) => {
    if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
    if (['w','a','s','d','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
      keysDown.add(e.key);
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => keysDown.delete(e.key));

  // Connect WebSocket
  connectWS();

  // Bind UI
  bindUI();
}

// --- Room Doors ---
// Each door: { room, edge: 'top'|'bottom'|'left'|'right', pos: fraction (0-1) along that wall, gap: px }
const DOORS = [
  // Upper rooms connect down to hallway
  { room: 'phone-a',     edge: 'bottom', pos: 0.5, gap: 30 },
  { room: 'desk',        edge: 'bottom', pos: 0.25, gap: 36 },  // left corridor
  { room: 'desk',        edge: 'bottom', pos: 0.65, gap: 36 },  // right corridor
  { room: 'phone-b',     edge: 'bottom', pos: 0.5, gap: 30 },
  // Lower rooms connect up to hallway
  { room: 'lobby',       edge: 'top', pos: 0.7, gap: 30 },
  { room: 'lobby',       edge: 'bottom', pos: 0.5, gap: 30 },   // connects to meeting-room
  { room: 'meeting-room', edge: 'top', pos: 0.5, gap: 36 },
  { room: 'coffee',      edge: 'top', pos: 0.5, gap: 36 },
  { room: 'water-cooler', edge: 'top', pos: 0.4, gap: 36 },
  { room: 'server-room', edge: 'top', pos: 0.5, gap: 36 },
];

// Pre-index doors by room ID
const DOORS_BY_ROOM = {};
for (const d of DOORS) {
  if (!DOORS_BY_ROOM[d.room]) DOORS_BY_ROOM[d.room] = [];
  DOORS_BY_ROOM[d.room].push(d);
}

// --- Furniture Interaction Points ---
// Specific coordinates where bees sit/stand at furniture
const INTERACTION_POINTS = {
  'desk': [
    // 6 desks: 2 rows of 3 — chairs are at y+70 from desk top
    { x: 355, y: 160, type: 'chair', facing: 'up' },   // row 0, col 0
    { x: 525, y: 160, type: 'chair', facing: 'up' },   // row 0, col 1
    { x: 695, y: 160, type: 'chair', facing: 'up' },   // row 0, col 2
    { x: 355, y: 290, type: 'chair', facing: 'up' },   // row 1, col 0
    { x: 525, y: 290, type: 'chair', facing: 'up' },   // row 1, col 1
    { x: 695, y: 290, type: 'chair', facing: 'up' },   // row 1, col 2
    { x: 860, y: 140, type: 'stand', facing: 'up' },   // standing desk
  ],
  'meeting-room': [
    // Conference table chairs (5 each side)
    { x: 80,  y: 524, type: 'chair', facing: 'down' },
    { x: 110, y: 524, type: 'chair', facing: 'down' },
    { x: 140, y: 524, type: 'chair', facing: 'down' },
    { x: 170, y: 524, type: 'chair', facing: 'down' },
    { x: 200, y: 524, type: 'chair', facing: 'down' },
    { x: 80,  y: 598, type: 'chair', facing: 'up' },
    { x: 110, y: 598, type: 'chair', facing: 'up' },
    { x: 140, y: 598, type: 'chair', facing: 'up' },
    { x: 170, y: 598, type: 'chair', facing: 'up' },
    { x: 200, y: 598, type: 'chair', facing: 'up' },
  ],
  'coffee': [
    // Bar stools
    { x: 360, y: 568, type: 'stool', facing: 'up' },
    { x: 410, y: 568, type: 'stool', facing: 'up' },
    { x: 460, y: 568, type: 'stool', facing: 'up' },
    { x: 510, y: 568, type: 'stool', facing: 'up' },
    // Near espresso machine
    { x: 385, y: 500, type: 'stand', facing: 'down' },
  ],
  'water-cooler': [
    // L-shaped sofa spots
    { x: 700, y: 545, type: 'sofa', facing: 'down' },
    { x: 750, y: 545, type: 'sofa', facing: 'down' },
    { x: 800, y: 545, type: 'sofa', facing: 'down' },
    { x: 675, y: 570, type: 'sofa', facing: 'right' },
    { x: 675, y: 610, type: 'sofa', facing: 'right' },
    // Standing near coffee table
    { x: 760, y: 600, type: 'stand', facing: 'down' },
  ],
  'server-room': [
    // Near server racks
    { x: 1030, y: 540, type: 'stand', facing: 'right' },
    { x: 1075, y: 540, type: 'stand', facing: 'right' },
    { x: 1050, y: 600, type: 'stand', facing: 'up' },
  ],
  'phone-a': [
    { x: 77, y: 85, type: 'chair', facing: 'down' },
  ],
  'phone-b': [
    { x: 1097, y: 85, type: 'chair', facing: 'down' },
  ],
  'lobby': [
    { x: 100, y: 425, type: 'stand', facing: 'right' },
    { x: 160, y: 435, type: 'stand', facing: 'left' },
  ],
};

// Track which interaction points are occupied { 'room:index' -> beeId }
const occupiedPoints = {};

/** Find a free interaction point for a bee in a room. Queen gets priority (index 0). */
function findInteractionPoint(roomId, beeId, isQueen) {
  const points = INTERACTION_POINTS[roomId];
  if (!points || points.length === 0) return null;

  // Release any previous point held by this bee
  for (const key of Object.keys(occupiedPoints)) {
    if (occupiedPoints[key] === beeId) delete occupiedPoints[key];
  }

  // Queen gets first point
  if (isQueen) {
    const key = `${roomId}:0`;
    occupiedPoints[key] = beeId;
    return points[0];
  }

  // Workers take next available
  for (let i = 0; i < points.length; i++) {
    const key = `${roomId}:${i}`;
    if (!occupiedPoints[key]) {
      occupiedPoints[key] = beeId;
      return points[i];
    }
  }

  // All taken — return a random offset near a point
  const pt = points[Math.floor(Math.random() * points.length)];
  return { x: pt.x + (Math.random() - 0.5) * 20, y: pt.y + (Math.random() - 0.5) * 20, type: 'stand', facing: pt.facing };
}

// --- Bee Expressions ---
/** Map activity to expression */
function activityToExpression(activity) {
  switch (activity) {
    case 'coding': case 'reading': case 'searching': case 'running-command': case 'thinking':
      return 'focused';
    case 'presenting': case 'celebrating': case 'arriving':
      return 'happy';
    case 'drinking-coffee': case 'chatting':
      return 'sleepy';
    default:
      return 'neutral';
  }
}

/** Map facing direction to eye pupil offset */
function facingToEyeOffset(facing) {
  switch (facing) {
    case 'left':  return { x: -2, y: 0 };
    case 'right': return { x: 2, y: 0 };
    case 'up':    return { x: 0, y: -1 };
    case 'down':  return { x: 0, y: 1 };
    default:      return { x: 0, y: 0 };
  }
}

/** Draw bee face (eyes, mouth, blush) — redrawn on expression/facing changes */
function drawBeeFace(g, s, expression, eyeOffX = 0, eyeOffY = 0) {
  g.clear();
  const ox = eyeOffX * s;
  const oy = eyeOffY * s;

  switch (expression) {
    case 'focused':
      // Narrowed determined eyes
      g.ellipse(-7*s, -26*s, 6*s, 5*s).fill(0xffffff);
      g.ellipse(-7*s+ox, -25*s+oy, 4*s, 3.5*s).fill(0x1a1a1a);
      g.circle(-5*s+ox, -27*s+oy, 2*s).fill(0xffffff);
      g.ellipse(7*s, -26*s, 6*s, 5*s).fill(0xffffff);
      g.ellipse(7*s+ox, -25*s+oy, 4*s, 3.5*s).fill(0x1a1a1a);
      g.circle(9*s+ox, -27*s+oy, 2*s).fill(0xffffff);
      // Flat mouth
      g.moveTo(-3*s, -17*s).lineTo(3*s, -17*s).stroke({ color: 0x78716c, width: 1.5*s });
      g.ellipse(-14*s, -21*s, 4*s, 2*s).fill({ color: 0xfca5a5, alpha: 0.25 });
      g.ellipse(14*s, -21*s, 4*s, 2*s).fill({ color: 0xfca5a5, alpha: 0.25 });
      break;

    case 'happy':
      // Wide sparkly eyes, big smile
      g.ellipse(-7*s, -26*s, 7*s, 7.5*s).fill(0xffffff);
      g.ellipse(-7*s+ox, -25*s+oy, 5*s, 5.5*s).fill(0x1a1a1a);
      g.circle(-5*s+ox, -28*s+oy, 2.5*s).fill(0xffffff);
      g.circle(-9*s+ox, -24*s+oy, 1.5*s).fill(0xffffff);
      g.ellipse(7*s, -26*s, 7*s, 7.5*s).fill(0xffffff);
      g.ellipse(7*s+ox, -25*s+oy, 5*s, 5.5*s).fill(0x1a1a1a);
      g.circle(9*s+ox, -28*s+oy, 2.5*s).fill(0xffffff);
      g.circle(5*s+ox, -24*s+oy, 1.5*s).fill(0xffffff);
      g.arc(0, -18*s, 5*s, 0.1, Math.PI - 0.1).stroke({ color: 0x78716c, width: 1.8*s });
      g.ellipse(-14*s, -21*s, 5*s, 3*s).fill({ color: 0xfca5a5, alpha: 0.55 });
      g.ellipse(14*s, -21*s, 5*s, 3*s).fill({ color: 0xfca5a5, alpha: 0.55 });
      break;

    case 'sleepy':
      // Half-closed eyes
      g.ellipse(-7*s, -26*s, 6*s, 3*s).fill(0xffffff);
      g.moveTo(-12*s, -26*s).lineTo(-2*s, -26*s).stroke({ color: 0x1a1a1a, width: 2*s });
      g.ellipse(7*s, -26*s, 6*s, 3*s).fill(0xffffff);
      g.moveTo(2*s, -26*s).lineTo(12*s, -26*s).stroke({ color: 0x1a1a1a, width: 2*s });
      g.arc(0, -18*s, 3*s, 0.2, Math.PI - 0.2).stroke({ color: 0x78716c, width: 1.2*s });
      g.ellipse(-14*s, -21*s, 4.5*s, 2.5*s).fill({ color: 0xfca5a5, alpha: 0.4 });
      g.ellipse(14*s, -21*s, 4.5*s, 2.5*s).fill({ color: 0xfca5a5, alpha: 0.4 });
      // Zzz
      g.moveTo(16*s, -37*s).lineTo(22*s, -37*s).lineTo(16*s, -32*s).lineTo(22*s, -32*s)
       .stroke({ color: 0x78716c, width: 1*s, alpha: 0.5 });
      break;

    case 'surprised':
      // Wide O eyes, O mouth
      g.ellipse(-7*s, -26*s, 7*s, 8*s).fill(0xffffff);
      g.ellipse(-7*s+ox, -25*s+oy, 3.5*s, 4*s).fill(0x1a1a1a);
      g.circle(-5*s+ox, -28*s+oy, 2*s).fill(0xffffff);
      g.ellipse(7*s, -26*s, 7*s, 8*s).fill(0xffffff);
      g.ellipse(7*s+ox, -25*s+oy, 3.5*s, 4*s).fill(0x1a1a1a);
      g.circle(9*s+ox, -28*s+oy, 2*s).fill(0xffffff);
      g.ellipse(0, -16*s, 3*s, 3.5*s).fill(0x78716c);
      g.ellipse(0, -16*s, 2*s, 2.5*s).fill(0x4a4540);
      g.ellipse(-14*s, -21*s, 4.5*s, 2.5*s).fill({ color: 0xfca5a5, alpha: 0.5 });
      g.ellipse(14*s, -21*s, 4.5*s, 2.5*s).fill({ color: 0xfca5a5, alpha: 0.5 });
      break;

    default: // neutral
      g.ellipse(-7*s, -26*s, 6.5*s, 7*s).fill(0xffffff);
      g.ellipse(-7*s+ox, -25*s+oy, 4.5*s, 5*s).fill(0x1a1a1a);
      g.circle(-5*s+ox, -28*s+oy, 2.5*s).fill(0xffffff);
      g.circle(-9*s+ox, -24*s+oy, 1.2*s).fill(0xffffff);
      g.ellipse(7*s, -26*s, 6.5*s, 7*s).fill(0xffffff);
      g.ellipse(7*s+ox, -25*s+oy, 4.5*s, 5*s).fill(0x1a1a1a);
      g.circle(9*s+ox, -28*s+oy, 2.5*s).fill(0xffffff);
      g.circle(5*s+ox, -24*s+oy, 1.2*s).fill(0xffffff);
      g.arc(0, -18*s, 4*s, 0.15, Math.PI - 0.15).stroke({ color: 0x78716c, width: 1.5*s });
      g.ellipse(-14*s, -21*s, 4.5*s, 2.5*s).fill({ color: 0xfca5a5, alpha: 0.45 });
      g.ellipse(14*s, -21*s, 4.5*s, 2.5*s).fill({ color: 0xfca5a5, alpha: 0.45 });
      break;
  }
}

/** Update a bee's expression and eye direction */
function updateBeeExpression(beeObj, expression, facing) {
  const gfx = beeObj.gfx;
  if (!gfx || !gfx._face) return;
  const newExpr = expression || 'neutral';
  const newFacing = facing || null;
  if (beeObj._expression === newExpr && beeObj._facing === newFacing) return;
  beeObj._expression = newExpr;
  beeObj._facing = newFacing;
  const offset = facingToEyeOffset(newFacing);
  drawBeeFace(gfx._face, gfx._beeScale, newExpr, offset.x, offset.y);
}

// --- Door Animation State ---
const doorStates = DOORS.map(() => ({ openAmount: 0, panelGfx: null, cx: 0, cy: 0, halfGap: 0, isHorizontal: true }));

// --- Floor ---
function drawFloor() {
  const g = new Graphics();
  // Herringbone wood pattern
  g.rect(0, 0, CANVAS_W, CANVAS_H).fill(P.floor);
  for (let y = 0; y < CANVAS_H; y += 20) {
    g.moveTo(0, y).lineTo(CANVAS_W, y).stroke({ color: P.floorLine, width: 0.5, alpha: 0.3 });
  }
  for (let x = 0; x < CANVAS_W; x += 40) {
    g.moveTo(x, 0).lineTo(x, CANVAS_H).stroke({ color: P.floorLine, width: 0.5, alpha: 0.15 });
  }
  layers.floor.addChild(g);
}

// --- Rooms ---
function drawRooms() {
  for (const room of ROOMS) {
    const c = new Container();
    const { x, y, w, h } = room;
    const r = 6; // corner radius

    // Floor fill
    const bg = new Graphics();
    bg.roundRect(x, y, w, h, r).fill({ color: room.color, alpha: 0.5 });
    c.addChild(bg);

    // Glass partition walls with door gaps
    const walls = new Graphics();
    const roomDoors = DOORS_BY_ROOM[room.id] || [];

    // Collect door gaps per edge
    const gapsByEdge = { top: [], bottom: [], left: [], right: [] };
    for (const d of roomDoors) {
      gapsByEdge[d.edge].push(d);
    }

    // Draw each wall edge as segments with gaps
    const wallStyle = { color: P.glassBrd, width: 2, alpha: 0.6 };

    // Top wall: left to right
    drawWallWithGaps(walls, x + r, y, x + w - r, y, gapsByEdge.top, w - 2 * r, wallStyle);
    // Bottom wall: left to right
    drawWallWithGaps(walls, x + r, y + h, x + w - r, y + h, gapsByEdge.bottom, w - 2 * r, wallStyle);
    // Left wall: top to bottom
    drawWallWithGaps(walls, x, y + r, x, y + h - r, gapsByEdge.left, h - 2 * r, wallStyle, true);
    // Right wall: top to bottom
    drawWallWithGaps(walls, x + w, y + r, x + w, y + h - r, gapsByEdge.right, h - 2 * r, wallStyle, true);

    // Corners (always drawn)
    walls.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5).stroke(wallStyle);
    walls.arc(x + w - r, y + r, r, Math.PI * 1.5, 0).stroke(wallStyle);
    walls.arc(x + r, y + h - r, r, Math.PI * 0.5, Math.PI).stroke(wallStyle);
    walls.arc(x + w - r, y + h - r, r, 0, Math.PI * 0.5).stroke(wallStyle);
    c.addChild(walls);

    // Door indicators (subtle amber glow at openings)
    const doorGfx = new Graphics();
    for (const d of roomDoors) {
      const halfGap = d.gap / 2;
      let cx, cy;
      if (d.edge === 'top') {
        cx = x + r + (w - 2 * r) * d.pos; cy = y;
      } else if (d.edge === 'bottom') {
        cx = x + r + (w - 2 * r) * d.pos; cy = y + h;
      } else if (d.edge === 'left') {
        cx = x; cy = y + r + (h - 2 * r) * d.pos;
      } else {
        cx = x + w; cy = y + r + (h - 2 * r) * d.pos;
      }
      // Soft amber glow at door
      doorGfx.circle(cx, cy, halfGap * 0.6).fill({ color: P.honey, alpha: 0.08 });
      // Small door frame marks
      if (d.edge === 'top' || d.edge === 'bottom') {
        doorGfx.rect(cx - halfGap, cy - 1.5, 3, 3).fill({ color: P.honey, alpha: 0.3 });
        doorGfx.rect(cx + halfGap - 3, cy - 1.5, 3, 3).fill({ color: P.honey, alpha: 0.3 });
      } else {
        doorGfx.rect(cx - 1.5, cy - halfGap, 3, 3).fill({ color: P.honey, alpha: 0.3 });
        doorGfx.rect(cx - 1.5, cy + halfGap - 3, 3, 3).fill({ color: P.honey, alpha: 0.3 });
      }
    }
    c.addChild(doorGfx);

    // Accent strip (top edge)
    const strip = new Graphics();
    strip.roundRect(x, y, w, 4, 2).fill(room.accent);
    c.addChild(strip);

    // Room label
    const label = new Text({
      text: room.label,
      style: new TextStyle({
        fontFamily: 'Inter, sans-serif',
        fontSize: 11,
        fontWeight: '600',
        fill: 0x7A746D,
        letterSpacing: 0.5,
      }),
    });
    label.x = x + 8;
    label.y = y + 10;
    c.addChild(label);

    layers.rooms.addChild(c);
  }
}

/** Draw a wall edge as line segments, skipping gaps at door positions */
function drawWallWithGaps(g, x1, y1, x2, y2, doors, wallLen, style, vertical = false) {
  if (doors.length === 0) {
    g.moveTo(x1, y1).lineTo(x2, y2).stroke(style);
    return;
  }

  // Sort doors by position
  const sorted = [...doors].sort((a, b) => a.pos - b.pos);

  // Build list of segments to draw
  let cursor = 0; // 0-1 progress along the wall
  for (const d of sorted) {
    const halfGap = (d.gap / 2) / wallLen;
    const gapStart = Math.max(0, d.pos - halfGap);
    const gapEnd = Math.min(1, d.pos + halfGap);

    if (cursor < gapStart) {
      // Draw segment from cursor to gapStart
      const ax = x1 + (x2 - x1) * cursor, ay = y1 + (y2 - y1) * cursor;
      const bx = x1 + (x2 - x1) * gapStart, by = y1 + (y2 - y1) * gapStart;
      g.moveTo(ax, ay).lineTo(bx, by).stroke(style);
    }
    cursor = gapEnd;
  }

  // Draw remaining segment after last gap
  if (cursor < 1) {
    const ax = x1 + (x2 - x1) * cursor, ay = y1 + (y2 - y1) * cursor;
    g.moveTo(ax, ay).lineTo(x2, y2).stroke(style);
  }
}

// --- Furniture ---
function drawFurniture() {
  const g = new Graphics();

  // ═══════════════════════════════════════════════════════════════════════════
  // TEAM OFFICE — 6 desks in 2 rows of 3 + standing desk
  // ═══════════════════════════════════════════════════════════════════════════
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const dx = 290 + col * 170;
      const dy = 90 + row * 130;
      drawDesk(g, dx, dy);
    }
  }

  // Standing desk (tall desk at end of row)
  const sdx = 830, sdy = 110;
  g.roundRect(sdx, sdy, 60, 50, 4).fill(0xddd5c8);
  g.roundRect(sdx, sdy, 60, 50, 4).stroke({ width: 1, color: P.woodDark });
  g.roundRect(sdx + 8, sdy + 6, 44, 28, 2).fill(P.monitor);
  g.roundRect(sdx + 10, sdy + 8, 40, 24, 1).fill(0x60a5fa);
  g.roundRect(sdx + 8, sdy + 38, 44, 8, 2).fill(P.wood);

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFERENCE ROOM
  // ═══════════════════════════════════════════════════════════════════════════
  g.roundRect(70, 530, 140, 60, 6).fill(P.wood);
  g.roundRect(72, 532, 136, 56, 5).fill({ color: P.woodDark, alpha: 0.3 });
  for (let i = 0; i < 5; i++) {
    g.circle(80 + i * 30, 524, 7).fill(P.wallDark);
    g.circle(80 + i * 30, 598, 7).fill(P.wallDark);
  }
  g.roundRect(46, 480, 6, 60, 2).fill(P.white);
  g.roundRect(46, 480, 6, 60, 2).stroke({ color: P.wallDark, width: 1 });

  // ═══════════════════════════════════════════════════════════════════════════
  // LIBRARY — bookshelves + reading nook + phone booth
  // ═══════════════════════════════════════════════════════════════════════════
  const bookColors = [0xef4444, 0x3b82f6, 0x22c55e, 0xf59e0b, 0x8b5cf6, 0xec4899, 0x06b6d4, 0xf97316];
  for (let i = 0; i < 3; i++) {
    const bx = 1030 + i * 130;
    g.roundRect(bx, 100, 100, 140, 4).fill(P.woodDark);
    g.roundRect(bx, 100, 100, 140, 4).stroke({ width: 1, color: 0x6b5545 });
    g.rect(bx + 4, 104, 92, 132).fill(0xf5f0eb);
    for (let shelf = 0; shelf < 3; shelf++) {
      g.rect(bx + 2, 104 + shelf * 44 + 40, 96, 3).fill(P.woodDark);
      for (let b = 0; b < 7; b++) {
        const bh = 28 + ((b * 7 + shelf * 3 + i * 5) % 8);
        g.roundRect(bx + 8 + b * 13, 104 + shelf * 44 + (40 - bh), 10, bh, 1)
          .fill(bookColors[(b + shelf + i) % bookColors.length]);
      }
    }
  }

  // Reading nook (cozy armchair)
  g.roundRect(1040, 260, 60, 50, 12).fill(P.cushion);
  g.roundRect(1044, 264, 52, 42, 8).fill(0x5a7a50);
  g.circle(1120, 280, 16).fill(P.wood);
  g.circle(1120, 280, 16).stroke({ width: 1, color: P.woodDark });
  g.rect(1118, 264, 4, 12).fill(P.wallDark);
  g.ellipse(1120, 260, 10, 6).fill(0xfef3c7);

  // Phone booth (glass pod)
  g.roundRect(1320, 100, 80, 100, 8).fill({ color: P.glass, alpha: 0.7 });
  g.roundRect(1320, 100, 80, 100, 8).stroke({ width: 2, color: P.glassBrd });
  g.roundRect(1330, 130, 60, 20, 3).fill(P.wood);
  g.roundRect(1346, 110, 28, 18, 2).fill(P.monitor);
  g.roundRect(1348, 112, 24, 14, 1).fill(P.monGlow);
  g.circle(1360, 168, 10).fill(0x555555);

  // ═══════════════════════════════════════════════════════════════════════════
  // KITCHEN — espresso bar + fruit water dispensers + bar stools
  // ═══════════════════════════════════════════════════════════════════════════

  // Countertop (long L-shape)
  g.roundRect(350, 500, 180, 30, 4).fill(0xe8ddd0);
  g.roundRect(350, 500, 180, 30, 4).stroke({ width: 1, color: P.woodDark });
  g.roundRect(350, 530, 180, 20, 4).fill(0x555555);

  // Espresso machine (commercial style)
  g.roundRect(360, 480, 50, 40, 6).fill(0x444444);
  g.roundRect(360, 480, 50, 40, 6).stroke({ width: 1, color: 0x333333 });
  g.roundRect(364, 484, 42, 20, 3).fill(0x555555);
  g.roundRect(372, 504, 26, 6, 2).fill(P.wallDark);
  g.rect(400, 500, 3, 16).fill(P.wallDark);
  g.roundRect(376, 512, 18, 12, 3).fill(0xffffff);

  // ★ FRUIT WATER DISPENSER — the WeWork signature! ★
  const fwx = 430, fwy = 468;
  g.roundRect(fwx, fwy, 40, 52, 6).fill({ color: 0xdbeafe, alpha: 0.5 });
  g.roundRect(fwx, fwy, 40, 52, 6).stroke({ width: 1.5, color: 0x93c5fd });
  g.roundRect(fwx + 3, fwy + 8, 34, 40, 4).fill({ color: 0xbfdbfe, alpha: 0.4 });
  // Lemon slices
  g.circle(fwx + 14, fwy + 18, 5).fill({ color: 0xfde047, alpha: 0.8 });
  g.circle(fwx + 14, fwy + 18, 2.5).fill({ color: 0xfef9c3, alpha: 0.6 });
  g.circle(fwx + 28, fwy + 28, 4.5).fill({ color: 0xfde047, alpha: 0.8 });
  g.circle(fwx + 28, fwy + 28, 2).fill({ color: 0xfef9c3, alpha: 0.6 });
  // Lime slices
  g.circle(fwx + 20, fwy + 38, 4).fill({ color: 0x86efac, alpha: 0.7 });
  g.circle(fwx + 20, fwy + 38, 2).fill({ color: 0xbbf7d0, alpha: 0.5 });
  // Cucumber
  g.ellipse(fwx + 10, fwy + 32, 3, 5).fill({ color: 0x86efac, alpha: 0.6 });
  // Mint leaves
  g.ellipse(fwx + 32, fwy + 16, 4, 2.5).fill({ color: 0x4ade80, alpha: 0.7 });
  g.ellipse(fwx + 30, fwy + 14, 3, 2).fill({ color: 0x22c55e, alpha: 0.6 });
  // Spigot
  g.rect(fwx + 16, fwy + 48, 8, 6).fill(P.wallDark);
  g.circle(fwx + 20, fwy + 56, 3).fill(P.wallDark);
  // Lid
  g.roundRect(fwx - 1, fwy - 2, 42, 6, 3).fill(P.wallDark);

  // Stacked cups
  for (let i = 0; i < 3; i++) {
    g.roundRect(fwx + 48 + i * 3, fwy + 38 - i * 12, 12, 14, 2).fill({ color: 0xffffff, alpha: 0.8 });
    g.roundRect(fwx + 48 + i * 3, fwy + 38 - i * 12, 12, 14, 2).stroke({ width: 0.5, color: P.wall });
  }

  // Second fruit water (cucumber mint)
  const fw2x = 490, fw2y = 468;
  g.roundRect(fw2x, fw2y, 36, 48, 6).fill({ color: 0xd1fae5, alpha: 0.4 });
  g.roundRect(fw2x, fw2y, 36, 48, 6).stroke({ width: 1.5, color: 0x86efac });
  g.roundRect(fw2x + 3, fw2y + 6, 30, 38, 4).fill({ color: 0xd1fae5, alpha: 0.3 });
  g.circle(fw2x + 12, fw2y + 16, 5).fill({ color: 0x86efac, alpha: 0.6 });
  g.circle(fw2x + 12, fw2y + 16, 3).fill({ color: 0xbbf7d0, alpha: 0.4 });
  g.circle(fw2x + 24, fw2y + 30, 4).fill({ color: 0x86efac, alpha: 0.6 });
  g.ellipse(fw2x + 18, fw2y + 24, 4, 2).fill({ color: 0x4ade80, alpha: 0.8 });
  g.roundRect(fw2x - 1, fw2y - 2, 38, 5, 2).fill(P.wallDark);

  // Bar stools (modern swivel)
  for (let i = 0; i < 4; i++) {
    const sx = 360 + i * 50;
    g.circle(sx, 568, 14).fill(0x444444);
    g.circle(sx, 568, 10).fill(P.leather);
    g.rect(sx - 2, 574, 4, 14).fill(P.wallDark);
    g.ellipse(sx, 590, 10, 4).fill(P.wallDark);
  }

  // Fruit bowl on counter
  g.ellipse(540, 510, 18, 8).fill(P.wood);
  g.circle(534, 504, 6).fill(0xef4444);
  g.circle(546, 504, 5).fill(0xfde047);
  g.circle(540, 500, 5).fill(0xf97316);

  // Fruit water label
  const fwLabel = new Text({
    text: '🍋 Fruit Water',
    style: new TextStyle({ fontFamily: 'Inter, sans-serif', fontSize: 10, fill: 0x999999 }),
  });
  fwLabel.anchor.set(0.5, 0);
  fwLabel.x = fwx + 20;
  fwLabel.y = fwy + 58;
  layers.furniture.addChild(fwLabel);

  // ═══════════════════════════════════════════════════════════════════════════
  // LOUNGE
  // ═══════════════════════════════════════════════════════════════════════════
  g.roundRect(660, 530, 200, 20, 4).fill(P.cushion);
  g.roundRect(660, 530, 20, 100, 4).fill(P.cushion);
  g.roundRect(700, 570, 60, 35, 4).fill(P.wood);
  drawPlant(g, 840, 510);
  g.roundRect(710, 576, 15, 10, 1).fill(0xFCA5A5);
  g.roundRect(728, 578, 15, 8, 1).fill(0x93C5FD);

  // ═══════════════════════════════════════════════════════════════════════════
  // SERVER ROOM
  // ═══════════════════════════════════════════════════════════════════════════
  for (let i = 0; i < 2; i++) {
    const sx = 1015 + i * 45;
    g.roundRect(sx, 490, 30, 120, 3).fill(0x374151);
    for (let j = 0; j < 6; j++) {
      g.circle(sx + 8, 500 + j * 18, 2).fill(P.led);
      g.circle(sx + 22, 500 + j * 18, 2).fill(j % 3 === 0 ? P.ledRed : P.led);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHONE BOOTHS + LOBBY
  // ═══════════════════════════════════════════════════════════════════════════
  drawPhoneBooth(g, 55, 65);
  drawPhoneBooth(g, 1075, 65);
  g.roundRect(80, 415, 120, 20, 4).fill(P.wood);
  g.roundRect(82, 417, 30, 16, 3).fill(P.monitor);

  // ═══════════════════════════════════════════════════════════════════════════
  // SCATTERED PLANTS
  // ═══════════════════════════════════════════════════════════════════════════
  drawPlant(g, 246, 365);
  drawPlant(g, 852, 365);
  drawPlant(g, 330, 460);
  drawPlant(g, 895, 460);
  drawPlant(g, 1160, 280);
  drawPlant(g, 1300, 220);

  layers.furniture.addChild(g);
}

function drawDesk(g, x, y) {
  // Desk surface
  g.roundRect(x, y, 130, 55, 4).fill(P.wood);
  g.roundRect(x + 2, y + 2, 126, 51, 3).fill({ color: P.woodDark, alpha: 0.15 });
  // Monitor
  g.roundRect(x + 35, y + 5, 60, 35, 3).fill(P.monitor);
  g.roundRect(x + 38, y + 8, 54, 26, 2).fill({ color: P.monGlow, alpha: 0.15 });
  // Monitor stand
  g.roundRect(x + 60, y + 40, 10, 8, 1).fill(P.wallDark);
  // Keyboard
  g.roundRect(x + 30, y + 42, 50, 8, 2).fill(0xD1D5DB);
  // Chair
  g.circle(x + 65, y + 70, 12).fill(P.wallDark);
}

function drawPhoneBooth(g, x, y) {
  g.roundRect(x, y, 45, 25, 3).fill(P.wood);
  g.roundRect(x + 10, y + 3, 25, 15, 2).fill(P.monitor);
}

function drawPlant(g, x, y, size = 1, potColor) {
  const s = size;
  // Pot (tapered trapezoid)
  g.moveTo(x - 8 * s, y);
  g.lineTo(x - 6 * s, y + 14 * s);
  g.lineTo(x + 6 * s, y + 14 * s);
  g.lineTo(x + 8 * s, y);
  g.closePath();
  g.fill(potColor || P.planter);
  // Soil
  g.ellipse(x, y + 1, 7 * s, 2 * s).fill(0x78716c);
  // Trunk
  g.rect(x - 1.5, y - 12 * s, 3, 14 * s).fill(0x92400e);
  // Leaves (fiddle leaf fig style)
  const leafPositions = [
    [-6, -18], [6, -20], [0, -24], [-8, -14], [8, -16],
    [-4, -28], [4, -26], [0, -32],
  ];
  for (const [lx, ly] of leafPositions) {
    const leafColor = ((lx + ly) & 1) ? P.plant : P.plantDark;
    g.ellipse(x + lx * s * 0.8, y + ly * s * 0.7, 7 * s, 5 * s).fill(leafColor);
  }
}

// --- Elevator ---
function createElevator() {
  const { shaftX: sx, shaftY: sy, shaftW: sw, shaftH: sh,
          cabW, cabH, upperStopY, lowerStopY,
          doorW, doorH, upperDoorY, lowerDoorY } = ELEV;

  // ── Static shaft ──
  const shaft = new Graphics();

  // Shaft background
  shaft.roundRect(sx, sy, sw, sh, 4).fill({ color: P.wall, alpha: 0.35 });
  shaft.roundRect(sx, sy, sw, sh, 4).stroke({ color: P.wallDark, width: 1.5 });

  // Guide rails
  shaft.moveTo(sx + 4, sy + 4).lineTo(sx + 4, sy + sh - 4).stroke({ color: P.wallDark, width: 1, alpha: 0.25 });
  shaft.moveTo(sx + sw - 4, sy + 4).lineTo(sx + sw - 4, sy + sh - 4).stroke({ color: P.wallDark, width: 1, alpha: 0.25 });

  // Upper door frame
  shaft.roundRect(sx + 1, upperDoorY - 2, sw - 2, doorH + 4, 2).stroke({ color: P.glassBrd, width: 2 });

  // Lower door frame
  shaft.roundRect(sx + 1, lowerDoorY - 2, sw - 2, doorH + 4, 2).stroke({ color: P.glassBrd, width: 2 });

  // Cable from top to cab anchor
  shaft.moveTo(sx + sw / 2, sy + 4).lineTo(sx + sw / 2, sy + 20).stroke({ color: P.wallDark, width: 1.5 });

  layers.furniture.addChild(shaft);

  // ── Cab ──
  const cab = new Graphics();
  // Body (glass + metal)
  cab.roundRect(0, 0, cabW, cabH, 4).fill({ color: P.glass, alpha: 0.6 });
  cab.roundRect(0, 0, cabW, cabH, 4).stroke({ color: P.glassBrd, width: 2 });
  // Brass accent strip (top)
  cab.roundRect(2, 0, cabW - 4, 3, 1.5).fill(P.honey);
  // Ceiling LED light
  cab.roundRect(10, 5, 36, 3, 1).fill({ color: 0xfef3c7, alpha: 0.9 });
  // Handrails
  cab.roundRect(4, 30, 2, 24, 1).fill(P.wallDark);
  cab.roundRect(cabW - 6, 30, 2, 24, 1).fill(P.wallDark);
  // Wood floor
  cab.roundRect(3, cabH - 10, cabW - 6, 7, 2).fill(P.wood);

  cab.x = sx + 2;
  cab.y = upperStopY;
  layers.furniture.addChild(cab);
  elevator.cabGfx = cab;

  // ── Doors (4 panels, 2 per stop) ──
  function makeDoor() {
    const d = new Graphics();
    d.rect(0, 0, doorW, doorH).fill({ color: P.wall, alpha: 0.85 });
    d.rect(0, 0, doorW, doorH).stroke({ color: P.glassBrd, width: 1 });
    // Brushed metal detail
    d.roundRect(doorW / 2 - 4, doorH / 2 - 6, 8, 12, 1).fill({ color: P.wallDark, alpha: 0.15 });
    return d;
  }

  // Upper doors
  elevator.upperDoorL = makeDoor();
  elevator.upperDoorL.x = sx + 2;
  elevator.upperDoorL.y = upperDoorY;
  elevator.upperDoorR = makeDoor();
  elevator.upperDoorR.x = sx + 2 + doorW;
  elevator.upperDoorR.y = upperDoorY;

  // Lower doors
  elevator.lowerDoorL = makeDoor();
  elevator.lowerDoorL.x = sx + 2;
  elevator.lowerDoorL.y = lowerDoorY;
  elevator.lowerDoorR = makeDoor();
  elevator.lowerDoorR.x = sx + 2 + doorW;
  elevator.lowerDoorR.y = lowerDoorY;

  // Masks so doors clip behind shaft walls
  const upperMask = new Graphics();
  upperMask.rect(sx + 1, upperDoorY - 1, sw - 2, doorH + 2).fill(0xffffff);
  elevator.upperMask = upperMask;

  const lowerMask = new Graphics();
  lowerMask.rect(sx + 1, lowerDoorY - 1, sw - 2, doorH + 2).fill(0xffffff);
  elevator.lowerMask = lowerMask;

  // Group upper doors into a container with mask
  const upperDoorGroup = new Container();
  upperDoorGroup.addChild(elevator.upperDoorL, elevator.upperDoorR);
  upperDoorGroup.mask = upperMask;
  layers.furniture.addChild(upperMask, upperDoorGroup);

  // Group lower doors into a container with mask
  const lowerDoorGroup = new Container();
  lowerDoorGroup.addChild(elevator.lowerDoorL, elevator.lowerDoorR);
  lowerDoorGroup.mask = lowerMask;
  layers.furniture.addChild(lowerMask, lowerDoorGroup);

  // ── Floor indicator ──
  const indBg = new Graphics();
  indBg.roundRect(0, 0, 24, 16, 3).fill(P.monitor);
  indBg.x = sx + 18;
  indBg.y = sy + 2;
  layers.furniture.addChild(indBg);
  elevator.indicatorBg = indBg;

  const indText = new Text({
    text: '1',
    style: new TextStyle({
      fontFamily: 'SF Mono, Fira Code, monospace',
      fontSize: 10,
      fontWeight: '700',
      fill: P.led,
    }),
  });
  indText.anchor.set(0.5, 0.5);
  indText.x = sx + 30;
  indText.y = sy + 10;
  layers.furniture.addChild(indText);
  elevator.indicatorText = indText;

  // "Elevator" label below shaft
  const label = new Text({
    text: 'Elevator',
    style: new TextStyle({
      fontFamily: 'Inter, sans-serif',
      fontSize: 10,
      fontWeight: '600',
      fill: 0x7A746D,
    }),
  });
  label.anchor.set(0.5, 0);
  label.x = sx + sw / 2;
  label.y = sy + sh + 4;
  layers.furniture.addChild(label);
}

function getQueenZone() {
  const queen = localBees['queen'];
  if (!queen) return null;
  if (UPPER_ROOMS.has(queen.room)) return 'upper';
  if (LOWER_ROOMS.has(queen.room)) return 'lower';
  return null;
}

function updateElevator() {
  if (!elevator.cabGfx) return;

  const { shaftX: sx, doorW, upperStopY, lowerStopY, upperDoorY, lowerDoorY,
          doorSpeed, moveSpeed, holdFrames } = ELEV;

  // ── Detect queen zone change ──
  const zone = getQueenZone();
  if (zone && zone !== lastQueenZone) {
    lastQueenZone = zone;
    const destFloor = zone === 'upper' ? 1 : 2;
    if (destFloor !== elevator.currentFloor) {
      elevator.targetFloor = destFloor;
      if (elevator.state === 'idle') {
        elevator.state = 'doors-closing';
      } else if (elevator.state === 'doors-open') {
        elevator.holdTimer = 0; // cut short the hold
      }
    }
  }

  // ── State machine ──
  switch (elevator.state) {
    case 'idle':
      break;

    case 'doors-closing':
      elevator.doorProgress = Math.max(0, elevator.doorProgress - doorSpeed);
      if (elevator.doorProgress <= 0) {
        elevator.doorProgress = 0;
        elevator.state = 'moving';
      }
      break;

    case 'moving': {
      const targetY = elevator.targetFloor === 1 ? upperStopY : lowerStopY;
      elevator.cabY += (targetY - elevator.cabY) * moveSpeed;
      if (Math.abs(elevator.cabY - targetY) < 1) {
        elevator.cabY = targetY;
        elevator.currentFloor = elevator.targetFloor;
        elevator.state = 'doors-opening';
      }
      break;
    }

    case 'doors-opening':
      elevator.doorProgress = Math.min(1, elevator.doorProgress + doorSpeed);
      if (elevator.doorProgress >= 1) {
        elevator.doorProgress = 1;
        elevator.state = 'doors-open';
        elevator.holdTimer = holdFrames;
        elevator.dingTimer = 15; // ding flash
      }
      break;

    case 'doors-open':
      elevator.holdTimer--;
      if (elevator.dingTimer > 0) elevator.dingTimer--;
      if (elevator.holdTimer <= 0) {
        elevator.state = 'doors-closing-final';
      }
      break;

    case 'doors-closing-final':
      elevator.doorProgress = Math.max(0, elevator.doorProgress - doorSpeed);
      if (elevator.doorProgress <= 0) {
        elevator.doorProgress = 0;
        elevator.state = 'idle';
      }
      break;
  }

  // ── Apply cab position ──
  elevator.cabGfx.y = elevator.cabY;

  // ── Apply door positions ──
  // Only the doors at the current floor open; other floor's doors stay closed
  const atUpper = elevator.currentFloor === 1;
  const upperOffset = atUpper ? elevator.doorProgress * doorW : 0;
  const lowerOffset = !atUpper ? elevator.doorProgress * doorW : 0;

  elevator.upperDoorL.x = sx + 2 - upperOffset;
  elevator.upperDoorR.x = sx + 2 + doorW + upperOffset;
  elevator.lowerDoorL.x = sx + 2 - lowerOffset;
  elevator.lowerDoorR.x = sx + 2 + doorW + lowerOffset;

  // ── Floor indicator ──
  if (elevator.state === 'moving') {
    elevator.indicatorText.text = elevator.targetFloor === 1 ? '\u25B2' : '\u25BC';
  } else {
    elevator.indicatorText.text = String(elevator.currentFloor);
  }

  // Ding flash: indicator briefly turns gold when doors open
  if (elevator.dingTimer > 0) {
    elevator.indicatorText.style.fill = P.honey;
  } else {
    elevator.indicatorText.style.fill = P.led;
  }

  // Subtle ceiling light flicker while moving
  if (elevator.state === 'moving') {
    elevator.cabGfx.alpha = 0.85 + Math.sin(frame * 0.3) * 0.15;
  } else {
    elevator.cabGfx.alpha = 1;
  }
}

// --- Bee Rendering ---
function hexToNum(c) {
  if (typeof c === 'number') return c;
  if (typeof c === 'string') return parseInt(c.replace('#', ''), 16);
  return 0xF59E0B;
}

function createBeeGraphics(bee) {
  const c = new Container();
  const scale = bee.role === 'queen' ? 1.0 : bee.role === 'recruiter' ? 0.85 : 0.65;
  const s = scale;
  const beeColor = hexToNum(bee.color) || 0xF59E0B;

  // Ground shadow
  const shadow = new Graphics();
  shadow.ellipse(0, 30, 20 * s, 7 * s).fill({ color: 0x000000, alpha: 0.08 });
  c.addChild(shadow);

  // Wings — iridescent, translucent
  const wingL = new Graphics();
  wingL.ellipse(-8, -6, 20 * s, 13 * s).fill({ color: 0xdbeafe, alpha: 0.4 });
  wingL.ellipse(-8, -6, 20 * s, 13 * s).stroke({ width: 1, color: 0x93c5fd, alpha: 0.3 });
  wingL.ellipse(-6, -8, 12 * s, 8 * s).fill({ color: 0xffffff, alpha: 0.15 });
  wingL.x = -6 * s;
  wingL.y = -8 * s;
  c.addChild(wingL);
  c._wingL = wingL;

  const wingR = new Graphics();
  wingR.ellipse(8, -6, 20 * s, 13 * s).fill({ color: 0xdbeafe, alpha: 0.4 });
  wingR.ellipse(8, -6, 20 * s, 13 * s).stroke({ width: 1, color: 0x93c5fd, alpha: 0.3 });
  wingR.ellipse(6, -8, 12 * s, 8 * s).fill({ color: 0xffffff, alpha: 0.15 });
  wingR.x = 6 * s;
  wingR.y = -8 * s;
  c.addChild(wingR);
  c._wingR = wingR;

  // Body
  const body = new Graphics();

  // Plump round body
  body.ellipse(0, 2 * s, 22 * s, 22 * s).fill(beeColor);
  // Soft dark stripes
  for (let i = -1; i <= 1; i++) {
    body.roundRect(-20 * s, i * 11 * s - 3 * s, 40 * s, 6 * s, 3 * s).fill(0x3f3a33);
  }
  // Body sheen
  body.ellipse(-7 * s, -8 * s, 10 * s, 12 * s).fill({ color: 0xffffff, alpha: 0.12 });
  // Stinger
  body.moveTo(0, 22 * s).lineTo(-3 * s, 28 * s).lineTo(3 * s, 28 * s).closePath().fill(0x78716c);
  // Tiny feet
  body.circle(-8 * s, 24 * s, 3 * s).fill(0x78716c);
  body.circle(8 * s, 24 * s, 3 * s).fill(0x78716c);

  // Big round head
  body.circle(0, -24 * s, 17 * s).fill(0xfef9c3);
  body.ellipse(-5 * s, -32 * s, 7 * s, 5 * s).fill({ color: 0xffffff, alpha: 0.2 });

  // Antennae
  body.moveTo(-6 * s, -40 * s).quadraticCurveTo(-15 * s, -54 * s, -10 * s, -56 * s).stroke({ color: 0x78716c, width: 2 });
  body.moveTo(6 * s, -40 * s).quadraticCurveTo(15 * s, -54 * s, 10 * s, -56 * s).stroke({ color: 0x78716c, width: 2 });
  // Heart-shaped antenna tips
  body.circle(-12 * s, -57 * s, 3 * s).fill(beeColor);
  body.circle(-8 * s, -57 * s, 3 * s).fill(beeColor);
  body.circle(12 * s, -57 * s, 3 * s).fill(beeColor);
  body.circle(8 * s, -57 * s, 3 * s).fill(beeColor);

  c.addChild(body);

  // Face (separate Graphics for dynamic expressions)
  const face = new Graphics();
  drawBeeFace(face, s, 'neutral', 0, 0);
  c.addChild(face);
  c._face = face;
  c._beeScale = s;

  // Role-specific accessories
  drawAccessory(c, bee, s, beeColor);

  // Name label
  const label = new Text({
    text: bee.name || bee.id,
    style: new TextStyle({
      fontFamily: 'Inter, sans-serif',
      fontSize: 9,
      fontWeight: '600',
      fill: 0x7A746D,
      align: 'center',
    }),
  });
  label.anchor.set(0.5, 0);
  label.y = 34 * s;
  c.addChild(label);
  c._label = label;

  // Speech bubble (hidden by default)
  const bubble = new Container();
  bubble.visible = false;

  const bubbleBg = new Graphics();
  bubble.addChild(bubbleBg);
  bubble._bg = bubbleBg;

  const bubbleText = new Text({
    text: '',
    style: new TextStyle({
      fontFamily: 'Inter, sans-serif',
      fontSize: 9,
      fill: 0x2D2926,
      wordWrap: true,
      wordWrapWidth: 200,
      lineHeight: 13,
    }),
  });
  bubbleText.x = 8;
  bubbleText.y = 6;
  bubble.addChild(bubbleText);
  bubble._text = bubbleText;
  bubble.y = -70 * s;

  c.addChild(bubble);
  c._bubble = bubble;

  return c;
}

function drawAccessory(container, bee, s, beeColor) {
  const g = new Graphics();
  const role = bee.role || '';
  const accessory = bee.accessory || '';
  const id = bee.id || '';

  if (role === 'queen' || id === 'queen') {
    // Arms holding tiny laptop
    g.moveTo(-16 * s, -4 * s).lineTo(-24 * s, 4 * s).stroke({ color: 0xfef3c7, width: 2 * s });
    g.moveTo(16 * s, -4 * s).lineTo(24 * s, 4 * s).stroke({ color: 0xfef3c7, width: 2 * s });
    g.roundRect(-28 * s, 2 * s, 14 * s, 10 * s, 1.5 * s).fill(P.wallDark);
    g.roundRect(-27 * s, 3 * s, 12 * s, 7 * s, 1 * s).fill(0x60a5fa);

    // Check for shop-equipped accessory (replaces default crown)
    const shopAcc = officeState?.shop?.equippedAccessory;
    if (shopAcc) {
      drawShopAccessory(g, s, shopAcc);
    } else {
      // Default crown
      g.moveTo(-10 * s, -40 * s).lineTo(-7 * s, -48 * s).lineTo(-2 * s, -42 * s)
       .lineTo(2 * s, -48 * s).lineTo(7 * s, -42 * s).lineTo(10 * s, -48 * s)
       .lineTo(10 * s, -40 * s).closePath();
      g.fill(0xfbbf24);
      g.stroke({ width: 1.5, color: 0xd97706 });
      g.circle(-4.5 * s, -45 * s, 1.5 * s).fill(0xef4444);
      g.circle(4.5 * s, -45 * s, 1.5 * s).fill(0x3b82f6);
      g.circle(0, -46 * s, 2 * s).fill(0xa855f7);
    }

  } else if (role === 'recruiter' || id === 'recruiter') {
    // Headset band
    g.arc(0, -30 * s, 16 * s, -Math.PI * 0.85, -Math.PI * 0.15).stroke({ color: 0x555555, width: 2.5 * s });
    // Left ear cup
    g.roundRect(-19 * s, -28 * s, 8 * s, 10 * s, 3 * s).fill(0x555555);
    g.roundRect(-18 * s, -27 * s, 6 * s, 8 * s, 2 * s).fill(0x333333);
    // Right ear cup
    g.roundRect(11 * s, -28 * s, 8 * s, 10 * s, 3 * s).fill(0x555555);
    g.roundRect(12 * s, -27 * s, 6 * s, 8 * s, 2 * s).fill(0x333333);
    // Mic boom
    g.moveTo(-15 * s, -22 * s).quadraticCurveTo(-18 * s, -14 * s, -10 * s, -14 * s).stroke({ color: 0x555555, width: 1.5 * s });
    g.circle(-10 * s, -14 * s, 2.5 * s).fill(0xef4444);
    // Arms holding clipboard
    g.moveTo(-16 * s, -4 * s).lineTo(-22 * s, 6 * s).stroke({ color: 0xfef3c7, width: 2 * s });
    g.moveTo(16 * s, -4 * s).lineTo(22 * s, 6 * s).stroke({ color: 0xfef3c7, width: 2 * s });
    g.roundRect(18 * s, 2 * s, 14 * s, 18 * s, 2 * s).fill(P.planter);
    g.roundRect(18 * s, 2 * s, 14 * s, 18 * s, 2 * s).stroke({ width: 1, color: 0xb8a88a });
    g.roundRect(22 * s, 0, 6 * s, 4 * s, 1 * s).fill(P.wallDark);
    // Lines on clipboard
    g.moveTo(21 * s, 8 * s).lineTo(29 * s, 8 * s).stroke({ color: 0xa0a0a0, width: 1 * s });
    g.moveTo(21 * s, 12 * s).lineTo(28 * s, 12 * s).stroke({ color: 0xa0a0a0, width: 1 * s });
    g.moveTo(21 * s, 16 * s).lineTo(27 * s, 16 * s).stroke({ color: 0xa0a0a0, width: 1 * s });

  } else if (accessory === 'beret' || id === 'omni-artist') {
    // Beret
    g.ellipse(2, -38 * s, 12 * s, 5 * s).fill(0x7C3AED);
    g.circle(2, -43 * s, 3 * s).fill(0x7C3AED);
    // Paintbrush in hand
    g.moveTo(16 * s, -4 * s).lineTo(24 * s, 4 * s).stroke({ color: 0xfef3c7, width: 2 * s });
    g.moveTo(24 * s, 4 * s).lineTo(32 * s, -6 * s).stroke({ color: 0x8B7355, width: 2 });
    g.circle(32 * s, -6 * s, 2.5 * s).fill(0xEF4444);

  } else if (accessory === 'glasses' || id === 'omni-manager') {
    // Glasses
    g.roundRect(-10 * s, -28 * s, 8 * s, 6 * s, 2 * s).stroke({ color: 0x1E3A5F, width: 1.2 });
    g.roundRect(2 * s, -28 * s, 8 * s, 6 * s, 2 * s).stroke({ color: 0x1E3A5F, width: 1.2 });
    g.moveTo(-2 * s, -25 * s).lineTo(2 * s, -25 * s).stroke({ color: 0x1E3A5F, width: 1 });
    // Tablet in hand
    g.moveTo(16 * s, -4 * s).lineTo(22 * s, 6 * s).stroke({ color: 0xfef3c7, width: 2 * s });
    g.roundRect(18 * s, 2 * s, 12 * s, 16 * s, 2 * s).fill(0x374151);
    g.roundRect(19 * s, 4 * s, 10 * s, 12 * s, 1 * s).fill({ color: P.monGlow, alpha: 0.3 });

  } else if (accessory === 'coder') {
    // Headphones (over-ear)
    g.arc(0, -30 * s, 14 * s, -Math.PI * 0.82, -Math.PI * 0.18).stroke({ color: 0x374151, width: 2.5 * s });
    g.roundRect(-17 * s, -27 * s, 7 * s, 9 * s, 3 * s).fill(0x374151);
    g.roundRect(-16 * s, -26 * s, 5 * s, 7 * s, 2 * s).fill(0x1f2937);
    g.roundRect(10 * s, -27 * s, 7 * s, 9 * s, 3 * s).fill(0x374151);
    g.roundRect(11 * s, -26 * s, 5 * s, 7 * s, 2 * s).fill(0x1f2937);
    // Arms holding laptop
    g.moveTo(-16 * s, -4 * s).lineTo(-22 * s, 6 * s).stroke({ color: 0xfef3c7, width: 2 * s });
    g.moveTo(16 * s, -4 * s).lineTo(22 * s, 6 * s).stroke({ color: 0xfef3c7, width: 2 * s });
    // Laptop (open, angled)
    g.roundRect(-26 * s, 4 * s, 16 * s, 10 * s, 1.5 * s).fill(P.wallDark);
    g.roundRect(-25 * s, 5 * s, 14 * s, 7 * s, 1 * s).fill({ color: P.monGlow, alpha: 0.3 });
    // Code lines on screen
    g.moveTo(-23 * s, 7 * s).lineTo(-15 * s, 7 * s).stroke({ color: 0x4ade80, width: 0.8 * s });
    g.moveTo(-23 * s, 9 * s).lineTo(-18 * s, 9 * s).stroke({ color: 0x60a5fa, width: 0.8 * s });
    g.moveTo(-23 * s, 11 * s).lineTo(-16 * s, 11 * s).stroke({ color: 0xfbbf24, width: 0.8 * s });

  } else if (role === 'worker') {
    // Wrench in hand
    g.moveTo(16 * s, -4 * s).lineTo(22 * s, 4 * s).stroke({ color: 0xfef3c7, width: 2 * s });
    g.moveTo(22 * s, 4 * s).lineTo(28 * s, -2 * s).stroke({ color: 0x6B7280, width: 1.5 });
    g.circle(28 * s, -2 * s, 3 * s).stroke({ color: 0x6B7280, width: 1.5 });
  }

  container.addChild(g);
}

/** Draw a shop-purchased accessory on the bee */
function drawShopAccessory(g, s, accessoryId) {
  switch (accessoryId) {
    case 'party-hat':
      // Cone party hat
      g.moveTo(0, -54 * s).lineTo(-10 * s, -38 * s).lineTo(10 * s, -38 * s).closePath();
      g.fill(0xEF4444);
      g.stroke({ width: 1, color: 0xB91C1C });
      g.circle(0, -55 * s, 2.5 * s).fill(0xFBBF24);
      // Brim
      g.ellipse(0, -38 * s, 12 * s, 3 * s).fill(0xEF4444);
      break;

    case 'bow-tie':
      // Bow tie at neck
      g.moveTo(0, -10 * s).lineTo(-8 * s, -14 * s).lineTo(-8 * s, -6 * s).closePath().fill(0xEF4444);
      g.moveTo(0, -10 * s).lineTo(8 * s, -14 * s).lineTo(8 * s, -6 * s).closePath().fill(0xEF4444);
      g.circle(0, -10 * s, 2 * s).fill(0xB91C1C);
      break;

    case 'sunglasses':
      // Cool shades over eyes
      g.roundRect(-13 * s, -30 * s, 10 * s, 7 * s, 2 * s).fill(0x1a1a1a);
      g.roundRect(3 * s, -30 * s, 10 * s, 7 * s, 2 * s).fill(0x1a1a1a);
      g.moveTo(-3 * s, -26 * s).lineTo(3 * s, -26 * s).stroke({ color: 0x1a1a1a, width: 1.5 * s });
      // Lens shine
      g.roundRect(-11 * s, -29 * s, 4 * s, 2 * s, 1 * s).fill({ color: 0xffffff, alpha: 0.25 });
      g.roundRect(5 * s, -29 * s, 4 * s, 2 * s, 1 * s).fill({ color: 0xffffff, alpha: 0.25 });
      break;

    case 'top-hat':
      // Tall top hat
      g.roundRect(-8 * s, -56 * s, 16 * s, 18 * s, 2 * s).fill(0x1f2937);
      g.roundRect(-8 * s, -56 * s, 16 * s, 18 * s, 2 * s).stroke({ width: 1, color: 0x374151 });
      g.ellipse(0, -38 * s, 14 * s, 4 * s).fill(0x1f2937);
      // Hat band
      g.rect(-8 * s, -46 * s, 16 * s, 3 * s).fill(0xFBBF24);
      break;

    case 'headphones':
      // Over-ear headphones
      g.arc(0, -30 * s, 17 * s, -Math.PI * 0.85, -Math.PI * 0.15).stroke({ color: 0xEF4444, width: 3 * s });
      g.roundRect(-20 * s, -28 * s, 8 * s, 10 * s, 3 * s).fill(0xEF4444);
      g.roundRect(-19 * s, -27 * s, 6 * s, 8 * s, 2 * s).fill(0xB91C1C);
      g.roundRect(12 * s, -28 * s, 8 * s, 10 * s, 3 * s).fill(0xEF4444);
      g.roundRect(13 * s, -27 * s, 6 * s, 8 * s, 2 * s).fill(0xB91C1C);
      break;

    case 'wizard-hat':
      // Pointy wizard hat with stars
      g.moveTo(0, -62 * s).lineTo(-12 * s, -38 * s).lineTo(12 * s, -38 * s).closePath();
      g.fill(0x7C3AED);
      g.ellipse(0, -38 * s, 14 * s, 4 * s).fill(0x7C3AED);
      // Stars
      g.circle(-3 * s, -50 * s, 2 * s).fill(0xFBBF24);
      g.circle(4 * s, -44 * s, 1.5 * s).fill(0xFBBF24);
      break;

    case 'halo':
      // Golden halo floating above head
      g.ellipse(0, -48 * s, 14 * s, 5 * s).stroke({ color: 0xFBBF24, width: 2.5 * s });
      g.ellipse(0, -48 * s, 14 * s, 5 * s).stroke({ color: 0xFDE68A, width: 1 * s, alpha: 0.5 });
      break;

    case 'devil-horns':
      // Red devil horns
      g.moveTo(-10 * s, -38 * s).quadraticCurveTo(-16 * s, -54 * s, -8 * s, -50 * s)
       .stroke({ color: 0xEF4444, width: 3 * s });
      g.moveTo(10 * s, -38 * s).quadraticCurveTo(16 * s, -54 * s, 8 * s, -50 * s)
       .stroke({ color: 0xEF4444, width: 3 * s });
      g.circle(-8 * s, -50 * s, 2 * s).fill(0xEF4444);
      g.circle(8 * s, -50 * s, 2 * s).fill(0xEF4444);
      break;

    default:
      // Default crown for unknown accessories
      g.moveTo(-10 * s, -40 * s).lineTo(-7 * s, -48 * s).lineTo(-2 * s, -42 * s)
       .lineTo(2 * s, -48 * s).lineTo(7 * s, -42 * s).lineTo(10 * s, -48 * s)
       .lineTo(10 * s, -40 * s).closePath();
      g.fill(0xfbbf24);
      g.stroke({ width: 1.5, color: 0xd97706 });
      break;
  }
}

function updateSpeechBubble(beeObj, message) {
  const gfx = beeObj.gfx;
  if (!gfx || !gfx._bubble) return;

  const bubble = gfx._bubble;

  if (!message) {
    bubble.visible = false;
    return;
  }

  const maxChars = 120;
  const truncated = message.length > maxChars ? message.slice(0, maxChars) + '...' : message;
  bubble._text.text = truncated;
  bubble._text.style.wordWrapWidth = 200;
  bubble.visible = true;

  // Redraw background to fit text
  const tw = Math.min(bubble._text.width + 16, 220);
  const th = bubble._text.height + 12;
  bubble._bg.clear();
  bubble._bg.roundRect(0, 0, tw, th, 6).fill({ color: P.white, alpha: 0.95 });
  bubble._bg.roundRect(0, 0, tw, th, 6).stroke({ color: P.glassBrd, width: 1 });
  // Pointer
  bubble._bg.moveTo(tw / 2 - 5, th).lineTo(tw / 2, th + 6).lineTo(tw / 2 + 5, th).fill({ color: P.white, alpha: 0.95 });
  bubble.x = -tw / 2;
  bubble.y = -th - 30;

  // Auto-hide: longer messages stay visible longer
  const duration = Math.min(3000 + truncated.length * 60, 10000);
  if (beeObj.bubbleTimer) clearTimeout(beeObj.bubbleTimer);
  beeObj.bubbleTimer = setTimeout(() => {
    bubble.visible = false;
  }, duration);
}

// --- Ambient Bees ---
function initAmbientBees() {
  for (const def of AMBIENT_BEES) {
    const room = ROOMS.find(r => r.id === def.homeRoom);
    if (!room) continue;
    // Use interaction point for starting position
    const ipt = findInteractionPoint(def.homeRoom, def.id, false);
    const x = ipt ? ipt.x : room.x + room.w * (0.3 + Math.random() * 0.4);
    const y = ipt ? ipt.y : room.y + room.h * (0.3 + Math.random() * 0.4);

    const gfx = createBeeGraphics(def);
    gfx.x = x;
    gfx.y = y;
    layers.bees.addChild(gfx);

    ambientBees[def.id] = {
      ...def,
      drawX: x,
      drawY: y,
      targetX: x,
      targetY: y,
      room: def.homeRoom,
      activity: 'idle',
      gfx,
      wingPhase: Math.random() * Math.PI * 2,
      idleTimer: 0,
      path: null,
      pathIndex: 0,
    };
  }
}

function initPlayerBee() {
  const def = { id: 'player', name: 'You', role: 'worker', color: 0xF59E0B, accessory: null };
  const room = ROOMS.find(r => r.id === 'lobby');
  const x = room.x + room.w / 2;
  const y = room.y + room.h / 2;
  const gfx = createBeeGraphics({ ...def, role: 'queen' }); // queen scale for visibility
  gfx.x = x;
  gfx.y = y;
  gfx.scale.set(0.85);
  layers.bees.addChild(gfx);
  playerBee = {
    ...def,
    drawX: x, drawY: y,
    targetX: x, targetY: y,
    room: 'lobby',
    activity: 'idle',
    gfx,
    wingPhase: Math.random() * Math.PI * 2,
    _facing: 'right',
  };
}

function updatePlayerBee() {
  if (!playerBee) return;
  let dx = 0, dy = 0;
  if (keysDown.has('w') || keysDown.has('ArrowUp')) dy = -1;
  if (keysDown.has('s') || keysDown.has('ArrowDown')) dy = 1;
  if (keysDown.has('a') || keysDown.has('ArrowLeft')) dx = -1;
  if (keysDown.has('d') || keysDown.has('ArrowRight')) dx = 1;
  if (dx || dy) {
    const len = Math.sqrt(dx * dx + dy * dy);
    playerBee.drawX += (dx / len) * PLAYER_SPEED;
    playerBee.drawY += (dy / len) * PLAYER_SPEED;
    playerBee.drawX = clamp(playerBee.drawX, 20, CANVAS_W - 20);
    playerBee.drawY = clamp(playerBee.drawY, 20, CANVAS_H - 20);
    playerBee.gfx.x = playerBee.drawX;
    playerBee.gfx.y = playerBee.drawY;
    if (Math.abs(dx) > Math.abs(dy)) {
      playerBee._facing = dx > 0 ? 'right' : 'left';
    } else {
      playerBee._facing = dy > 0 ? 'down' : 'up';
    }
  }
  // Wing animation
  playerBee.wingPhase += 0.2;
  if (playerBee.gfx._wingL) {
    playerBee.gfx._wingL.rotation = Math.sin(playerBee.wingPhase) * 0.35;
    playerBee.gfx._wingR.rotation = -Math.sin(playerBee.wingPhase) * 0.35;
  }
  // Idle bob
  playerBee.gfx.y += Math.sin(frame * 0.05 + playerBee.wingPhase) * 1.5;
  // Update room
  playerBee.room = findRoomAtPosition(playerBee.drawX, playerBee.drawY) || playerBee.room;
}

function updateAmbientBee(bee) {
  // Idle wandering within current room (no pathfinding for intra-room moves)
  bee.idleTimer = (bee.idleTimer || 0) + 1;
  if (!bee.path && bee.idleTimer > 300 + Math.random() * 200) {
    bee.idleTimer = 0;
    const room = ROOMS.find(r => r.id === bee.room);
    if (room) {
      bee.targetX = room.x + room.w * (0.2 + Math.random() * 0.6);
      bee.targetY = room.y + room.h * (0.25 + Math.random() * 0.5);
    }
  }

  // Path following (inter-room) or direct lerp (intra-room)
  if (bee.path && bee.pathIndex < bee.path.length) {
    const wp = bee.path[bee.pathIndex];
    bee.drawX += (wp.x - bee.drawX) * 0.04;
    bee.drawY += (wp.y - bee.drawY) * 0.04;
    const dx = wp.x - bee.drawX, dy = wp.y - bee.drawY;
    if (dx * dx + dy * dy < 100) {
      bee.pathIndex++;
      if (bee.pathIndex >= bee.path.length) {
        bee.path = null;
        bee.pathIndex = 0;
      }
    }
  } else {
    bee.drawX += (bee.targetX - bee.drawX) * 0.03;
    bee.drawY += (bee.targetY - bee.drawY) * 0.03;
  }
  bee.gfx.x = bee.drawX;
  bee.gfx.y = bee.drawY;

  // Wing animation
  bee.wingPhase += 0.15;
  if (bee.gfx._wingL) {
    bee.gfx._wingL.rotation = Math.sin(bee.wingPhase) * 0.3;
    bee.gfx._wingR.rotation = -Math.sin(bee.wingPhase) * 0.3;
  }

  // Idle bob
  bee.gfx.y += Math.sin(frame * 0.04 + bee.wingPhase) * 1.5;
}

// --- Sync backend bees ---
function syncBees(serverBees) {
  if (!serverBees) return;

  const seen = new Set();

  for (const bee of serverBees) {
    // Skip if this ID matches an ambient bee — backend doesn't know about them
    if (ambientBees[bee.id]) continue;

    seen.add(bee.id);
    let sx = bee.targetX * COORD_SCALE;
    let sy = bee.targetY * COORD_SCALE;

    // Snap to interaction point if available
    const isQueen = bee.role === 'queen' || bee.id === 'queen';
    const ipt = findInteractionPoint(bee.room, bee.id, isQueen);
    let beeFacing = null;
    if (ipt) { sx = ipt.x; sy = ipt.y; beeFacing = ipt.facing || null; }

    // Determine visibility based on project filter
    const visible = !projectFilter || !bee.project || bee.project === projectFilter;

    if (localBees[bee.id]) {
      // Update existing
      const lb = localBees[bee.id];
      const oldRoom = lb.room;
      lb.targetX = sx;
      lb.targetY = sy;
      lb.room = bee.room;
      lb.activity = bee.activity;
      lb.gfx.visible = visible;

      // Compute A* path on room change (only if not already walking to correct destination)
      if (oldRoom && oldRoom !== bee.room) {
        // Don't clobber if we're mid-path to the same target room
        if (!lb.path || lb._pathTargetRoom !== bee.room) {
          const path = computePath(lb.drawX, lb.drawY, oldRoom, sx, sy, bee.room);
          if (path) { lb.path = path; lb.pathIndex = 0; lb._pathTargetRoom = bee.room; }
        }
      }
      // Also compute path if bee has no path but is far from target (missed room change)
      if (!lb.path && Math.hypot(sx - lb.drawX, sy - lb.drawY) > 120) {
        const currentRoom = findRoomAtPosition(lb.drawX, lb.drawY) || oldRoom || 'lobby';
        const path = computePath(lb.drawX, lb.drawY, currentRoom, sx, sy, bee.room);
        if (path) { lb.path = path; lb.pathIndex = 0; lb._pathTargetRoom = bee.room; }
      }

      // Recreate graphics if skin color or shop accessory changed
      const currentShopAcc = officeState?.shop?.equippedAccessory || null;
      if ((bee.color && bee.color !== lb.color) || lb._shopAccessory !== currentShopAcc) {
        lb._shopAccessory = currentShopAcc;
        lb.color = bee.color;
        const oldX = lb.gfx.x;
        const oldY = lb.gfx.y;
        layers.bees.removeChild(lb.gfx);
        lb.gfx.destroy();
        const newGfx = createBeeGraphics(bee);
        newGfx.x = oldX;
        newGfx.y = oldY;
        newGfx.visible = visible;
        layers.bees.addChild(newGfx);
        lb.gfx = newGfx;
        lb.wingPhase = lb.wingPhase || 0;
      }

      // Update expression and facing direction
      const expr = activityToExpression(bee.activity);
      updateBeeExpression(lb, expr, beeFacing);

      if (bee.message !== lb.lastMessage) {
        lb.lastMessage = bee.message;
        updateSpeechBubble(lb, bee.message);
      }
    } else {
      // Create new bee — start at lobby so they walk to their target room
      const gfx = createBeeGraphics(bee);
      const lobbyRoom = ROOMS.find(r => r.id === 'lobby');
      const spawnX = lobbyRoom ? lobbyRoom.x + lobbyRoom.w / 2 : 140;
      const spawnY = lobbyRoom ? lobbyRoom.y + lobbyRoom.h / 2 : 430;
      gfx.x = spawnX;
      gfx.y = spawnY;
      layers.bees.addChild(gfx);

      gfx.visible = visible;
      const lb = {
        ...bee,
        color: bee.color,
        drawX: spawnX,
        drawY: spawnY,
        targetX: sx,
        targetY: sy,
        gfx,
        wingPhase: Math.random() * Math.PI * 2,
        lastMessage: bee.message,
        path: null,
        pathIndex: 0,
      };
      localBees[bee.id] = lb;

      // Compute initial A* path from lobby to target room (using interaction point coords)
      const dist = Math.hypot(lb.targetX - spawnX, lb.targetY - spawnY);
      if (dist > 80) {
        const spawnRoom = findRoomAtPosition(spawnX, spawnY) || 'lobby';
        const path = computePath(spawnX, spawnY, spawnRoom, lb.targetX, lb.targetY, bee.room);
        if (path) { lb.path = path; lb.pathIndex = 0; lb._pathTargetRoom = bee.room; }
      }

      // Set initial expression
      const expr = activityToExpression(bee.activity);
      updateBeeExpression(lb, expr, beeFacing);

      updateSpeechBubble(lb, bee.message);
    }
  }

  // Remove departed bees
  for (const id of Object.keys(localBees)) {
    if (!seen.has(id)) {
      layers.bees.removeChild(localBees[id].gfx);
      localBees[id].gfx.destroy();
      delete localBees[id];
    }
  }

  // Move ambient bees based on state context
  moveAmbientBeesForContext(serverBees);
}

function moveAmbientBeesForContext(serverBees) {
  const queen = serverBees.find(b => b.id === 'queen');
  if (!queen) return;

  const artist = ambientBees['omni-artist'];
  const manager = ambientBees['omni-manager'];

  // OmniArtist follows creative work
  if (artist) {
    if (queen.activity === 'coding') {
      moveAmbientTo(artist, 'desk');
    } else if (queen.activity === 'presenting') {
      moveAmbientTo(artist, 'meeting-room');
    } else if (queen.activity === 'idle' || queen.activity === 'drinking-coffee') {
      moveAmbientTo(artist, 'coffee');
    }
  }

  // OmniManager monitors and reviews
  if (manager) {
    if (queen.activity === 'thinking') {
      moveAmbientTo(manager, 'meeting-room');
    } else if (queen.activity === 'running-command') {
      moveAmbientTo(manager, 'server-room');
    } else if (queen.activity === 'reading' || queen.activity === 'searching') {
      moveAmbientTo(manager, 'desk');
    } else if (queen.activity === 'idle') {
      moveAmbientTo(manager, 'water-cooler');
    }
  }

  // Coder bees — stay at desk when work is happening, wander to kitchen/lounge on idle
  const coderIds = ['coder-1', 'coder-2', 'coder-3'];
  for (const cid of coderIds) {
    const coder = ambientBees[cid];
    if (!coder) continue;
    if (queen.activity === 'coding' || queen.activity === 'reading' || queen.activity === 'searching') {
      moveAmbientTo(coder, 'desk');
    } else if (queen.activity === 'idle' || queen.activity === 'drinking-coffee') {
      // Each coder wanders to a different idle spot
      const idleSpots = ['coffee', 'water-cooler', 'desk'];
      moveAmbientTo(coder, idleSpots[coderIds.indexOf(cid)]);
    } else if (queen.activity === 'running-command') {
      // One coder checks the server room, others stay at desk
      moveAmbientTo(coder, cid === 'coder-1' ? 'server-room' : 'desk');
    }
  }
}

function moveAmbientTo(bee, roomId) {
  if (bee.room === roomId) return;
  const oldRoom = bee.room;
  const room = ROOMS.find(r => r.id === roomId);
  if (room) {
    // Use interaction point if available
    const ipt = findInteractionPoint(roomId, bee.id, false);
    const tx = ipt ? ipt.x : room.x + room.w * (0.25 + Math.random() * 0.5);
    const ty = ipt ? ipt.y : room.y + room.h * (0.3 + Math.random() * 0.4);
    bee.targetX = tx;
    bee.targetY = ty;
    // Compute A* path for inter-room transition
    const path = computePath(bee.drawX, bee.drawY, oldRoom, tx, ty, roomId);
    if (path) { bee.path = path; bee.pathIndex = 0; }
  }
  bee.room = roomId;
}

// --- Animation ---
function updateAllBees() {
  // Backend bees
  for (const bee of Object.values(localBees)) {
    const speed = bee.activity === 'arriving' ? 0.12 : 0.06;

    // Path following (inter-room) or direct lerp (intra-room)
    if (bee.path && bee.pathIndex < bee.path.length) {
      const wp = bee.path[bee.pathIndex];
      bee.drawX += (wp.x - bee.drawX) * speed;
      bee.drawY += (wp.y - bee.drawY) * speed;
      const dx = wp.x - bee.drawX, dy = wp.y - bee.drawY;
      if (dx * dx + dy * dy < 100) {
        bee.pathIndex++;
        if (bee.pathIndex >= bee.path.length) {
          bee.path = null;
          bee.pathIndex = 0;
        }
      }
    } else {
      bee.drawX += (bee.targetX - bee.drawX) * speed;
      bee.drawY += (bee.targetY - bee.drawY) * speed;
    }
    bee.gfx.x = bee.drawX;
    bee.gfx.y = bee.drawY;

    // Wings
    bee.wingPhase = (bee.wingPhase || 0) + 0.2;
    if (bee.gfx._wingL) {
      bee.gfx._wingL.rotation = Math.sin(bee.wingPhase) * 0.35;
      bee.gfx._wingR.rotation = -Math.sin(bee.wingPhase) * 0.35;
    }

    // Idle bob
    bee.gfx.y += Math.sin(frame * 0.05 + (bee.wingPhase || 0)) * 1.5;
  }

  // Ambient bees
  for (const bee of Object.values(ambientBees)) {
    updateAmbientBee(bee);
  }

  // Z-sort bees by Y position (lower Y = further back)
  layers.bees.children.sort((a, b) => a.y - b.y);
}

// --- Visual Effects ---
let particles = [];
let steamLines = [];
let monitorGlows = [];
let roomGlows = {};

function initVisualEffects() {
  // Pollen particles — tiny amber dots that float in rooms with active bees
  for (let i = 0; i < 30; i++) {
    const p = new Graphics();
    const size = 1.5 + Math.random() * 2;
    p.circle(0, 0, size).fill({ color: P.honey, alpha: 0.15 + Math.random() * 0.2 });
    p.x = Math.random() * CANVAS_W;
    p.y = Math.random() * CANVAS_H;
    layers.effects.addChild(p);
    particles.push({
      gfx: p,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -0.1 - Math.random() * 0.2,
      baseAlpha: 0.15 + Math.random() * 0.2,
      phase: Math.random() * Math.PI * 2,
    });
  }

  // Coffee steam — wavy lines rising from espresso machine (x:385, y:480)
  for (let i = 0; i < 3; i++) {
    const s = new Graphics();
    layers.effects.addChild(s);
    steamLines.push({
      gfx: s,
      x: 375 + i * 10,
      baseY: 475,
      phase: i * 2,
      amp: 4 + i * 2,
    });
  }

  // Monitor glow — subtle blue light behind desk monitors
  const deskMonitors = [
    { x: 360, y: 95 }, { x: 530, y: 95 }, { x: 700, y: 95 },
    { x: 360, y: 225 }, { x: 530, y: 225 }, { x: 700, y: 225 },
  ];
  for (const m of deskMonitors) {
    const glow = new Graphics();
    glow.circle(m.x, m.y, 24).fill({ color: P.monGlow, alpha: 0.04 });
    glow.circle(m.x, m.y, 12).fill({ color: P.monGlow, alpha: 0.06 });
    layers.effects.addChild(glow);
    monitorGlows.push({ gfx: glow, x: m.x, y: m.y, active: false });
  }

  // Room ambient glow overlay (brightens active rooms)
  for (const room of ROOMS) {
    const glow = new Graphics();
    glow.roundRect(room.x, room.y, room.w, room.h, 6).fill({ color: 0xFFFBEB, alpha: 0 });
    layers.effects.addChild(glow);
    roomGlows[room.id] = { gfx: glow, targetAlpha: 0, currentAlpha: 0 };
  }
}

function updateVisualEffects() {
  // Determine active rooms (rooms with bees)
  const activeRooms = new Set();
  for (const bee of Object.values(localBees)) {
    if (bee.room && bee.activity !== 'idle') activeRooms.add(bee.room);
  }

  // Pollen particles — drift upward, respawn at bottom
  for (const p of particles) {
    p.gfx.x += p.vx + Math.sin(frame * 0.02 + p.phase) * 0.15;
    p.gfx.y += p.vy;
    p.gfx.alpha = p.baseAlpha * (0.6 + Math.sin(frame * 0.03 + p.phase) * 0.4);

    // Only show in active rooms
    let inActive = false;
    for (const room of ROOMS) {
      if (activeRooms.has(room.id) &&
          p.gfx.x >= room.x && p.gfx.x <= room.x + room.w &&
          p.gfx.y >= room.y && p.gfx.y <= room.y + room.h) {
        inActive = true;
        break;
      }
    }
    p.gfx.visible = inActive;

    // Respawn
    if (p.gfx.y < -10 || p.gfx.x < -10 || p.gfx.x > CANVAS_W + 10) {
      p.gfx.x = Math.random() * CANVAS_W;
      p.gfx.y = CANVAS_H + Math.random() * 20;
    }
  }

  // Coffee steam
  for (const s of steamLines) {
    s.gfx.clear();
    const t = frame * 0.04 + s.phase;
    for (let i = 0; i < 20; i++) {
      const y = s.baseY - i * 2.5;
      const x = s.x + Math.sin(t + i * 0.3) * s.amp;
      const alpha = 0.12 * (1 - i / 20);
      s.gfx.circle(x, y, 1.5).fill({ color: 0xffffff, alpha });
    }
  }

  // Monitor glow pulse
  for (const m of monitorGlows) {
    const room = ROOMS.find(r => r.id === 'desk');
    m.active = room && activeRooms.has('desk');
    m.gfx.alpha = m.active ? 0.6 + Math.sin(frame * 0.03) * 0.2 : 0.2;
  }

  // Room ambient lighting
  for (const room of ROOMS) {
    const rg = roomGlows[room.id];
    if (!rg) continue;
    rg.targetAlpha = activeRooms.has(room.id) ? 0.06 : 0;
    rg.currentAlpha += (rg.targetAlpha - rg.currentAlpha) * 0.05;
    rg.gfx.alpha = rg.currentAlpha;
  }
}

// --- Door Initialization & Update ---
function initDoors() {
  for (let i = 0; i < DOORS.length; i++) {
    const d = DOORS[i];
    const room = ROOMS.find(r => r.id === d.room);
    if (!room) continue;

    const r = 6; // corner radius
    const halfGap = d.gap / 2;
    let cx, cy;
    const isHorizontal = (d.edge === 'top' || d.edge === 'bottom');

    if (d.edge === 'top') {
      cx = room.x + r + (room.w - 2 * r) * d.pos; cy = room.y;
    } else if (d.edge === 'bottom') {
      cx = room.x + r + (room.w - 2 * r) * d.pos; cy = room.y + room.h;
    } else if (d.edge === 'left') {
      cx = room.x; cy = room.y + r + (room.h - 2 * r) * d.pos;
    } else {
      cx = room.x + room.w; cy = room.y + r + (room.h - 2 * r) * d.pos;
    }

    const panelGfx = new Graphics();
    layers.effects.addChild(panelGfx);

    doorStates[i].panelGfx = panelGfx;
    doorStates[i].cx = cx;
    doorStates[i].cy = cy;
    doorStates[i].halfGap = halfGap;
    doorStates[i].isHorizontal = isHorizontal;
  }
}

function updateDoors() {
  // Collect all bee positions
  const beePositions = [];
  for (const b of Object.values(localBees)) beePositions.push({ x: b.drawX, y: b.drawY });
  for (const b of Object.values(ambientBees)) beePositions.push({ x: b.drawX, y: b.drawY });

  for (let i = 0; i < doorStates.length; i++) {
    const ds = doorStates[i];
    if (!ds.panelGfx) continue;

    // Check if any bee is near this door
    let nearBee = false;
    for (const bp of beePositions) {
      if (Math.hypot(bp.x - ds.cx, bp.y - ds.cy) < 50) {
        nearBee = true;
        break;
      }
    }

    // Lerp open amount
    const target = nearBee ? 1 : 0;
    ds.openAmount += (target - ds.openAmount) * 0.08;

    // Render sliding door panels
    ds.panelGfx.clear();
    const hg = ds.halfGap;
    const panelLen = hg * 0.7 * (1 - ds.openAmount);

    if (panelLen < 0.5) continue; // fully open

    if (ds.isHorizontal) {
      ds.panelGfx.rect(ds.cx - hg, ds.cy - 1.5, panelLen, 3).fill({ color: P.wood, alpha: 0.7 });
      ds.panelGfx.rect(ds.cx + hg - panelLen, ds.cy - 1.5, panelLen, 3).fill({ color: P.wood, alpha: 0.7 });
    } else {
      ds.panelGfx.rect(ds.cx - 1.5, ds.cy - hg, 3, panelLen).fill({ color: P.wood, alpha: 0.7 });
      ds.panelGfx.rect(ds.cx - 1.5, ds.cy + hg - panelLen, 3, panelLen).fill({ color: P.wood, alpha: 0.7 });
    }
  }
}

// --- Camera ---
function updateCamera() {
  camera.zoom += (cameraTarget.zoom - camera.zoom) * CAM_LERP;
  camera.x += (cameraTarget.x - camera.x) * CAM_LERP;
  camera.y += (cameraTarget.y - camera.y) * CAM_LERP;
  if (Math.abs(camera.zoom - 1) < 0.005 && Math.abs(camera.x) < 0.5 && Math.abs(camera.y) < 0.5) {
    camera.zoom = 1; camera.x = 0; camera.y = 0;
  }
  layers.camera.scale.set(camera.zoom);
  layers.camera.position.set(camera.x, camera.y);
  if (!isPanning) {
    app.canvas.style.cursor = camera.zoom > 1.01 ? 'grab' : '';
  }
}

// --- Building View ---
function updateBuildingTransition() {
  // Smooth lerp toward target
  buildingTransition += (buildingTransitionTarget - buildingTransition) * 0.08;
  if (Math.abs(buildingTransition - buildingTransitionTarget) < 0.01) {
    buildingTransition = buildingTransitionTarget;
  }

  // Apply scale to office root
  if (buildingTransition > 0.01) {
    // In building mode: shrink the main office and show overlay
    const scale = 1 - buildingTransition * 0.55; // 1.0 → 0.45
    layers.officeRoot.scale.set(scale);
    layers.officeRoot.alpha = 1 - buildingTransition * 0.7;
    layers.buildingOverlay.visible = true;
    renderBuildingOverlay();
  } else {
    layers.officeRoot.scale.set(1);
    layers.officeRoot.alpha = 1;
    layers.buildingOverlay.visible = false;
  }
}

function renderBuildingOverlay() {
  layers.buildingOverlay.removeChildren();

  if (buildingProjects.length === 0) return;

  const cols = buildingProjects.length <= 2 ? 2 : buildingProjects.length <= 4 ? 2 : 3;
  const rows = Math.ceil(buildingProjects.length / cols);
  const padding = 24;
  const officeW = (CANVAS_W - padding * (cols + 1)) / cols;
  const officeH = (CANVAS_H - padding * (rows + 1) - 40) / rows; // 40 for header space
  const scaleX = officeW / CANVAS_W;
  const scaleY = officeH / CANVAS_H;
  const officeScale = Math.min(scaleX, scaleY);

  buildingClickAreas = [];

  // Title
  const title = new Text({
    text: 'BeeHaven Building',
    style: new TextStyle({
      fontFamily: 'Inter, sans-serif',
      fontSize: 20,
      fontWeight: '700',
      fill: 0x2D2926,
    }),
  });
  title.x = CANVAS_W / 2;
  title.y = 12;
  title.anchor.set(0.5, 0);
  layers.buildingOverlay.addChild(title);

  for (let i = 0; i < buildingProjects.length; i++) {
    const proj = buildingProjects[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const ox = padding + col * (officeW + padding);
    const oy = 48 + row * (officeH + padding);

    // Mini office background
    const bg = new Graphics();
    bg.roundRect(ox, oy, officeW, officeH, 8).fill({ color: 0xFAF5EF, alpha: 0.95 });
    bg.roundRect(ox, oy, officeW, officeH, 8).stroke({ color: 0xD4D0CC, width: 1.5 });
    layers.buildingOverlay.addChild(bg);

    // Project name label
    const label = new Text({
      text: proj,
      style: new TextStyle({
        fontFamily: 'Inter, sans-serif',
        fontSize: 13,
        fontWeight: '600',
        fill: 0x2D2926,
      }),
    });
    label.x = ox + officeW / 2;
    label.y = oy + 6;
    label.anchor.set(0.5, 0);
    layers.buildingOverlay.addChild(label);

    // Mini room outlines
    for (const room of ROOMS) {
      const rx = ox + room.x * officeScale + 4;
      const ry = oy + room.y * officeScale + 22;
      const rw = room.w * officeScale;
      const rh = room.h * officeScale;
      const miniRoom = new Graphics();
      miniRoom.roundRect(rx, ry, rw, rh, 3).fill({ color: room.color, alpha: 0.4 });
      miniRoom.roundRect(rx, ry, rw, rh, 3).stroke({ color: P.glassBrd, width: 0.8, alpha: 0.4 });
      layers.buildingOverlay.addChild(miniRoom);
    }

    // Count bees in this project
    const beeCount = Object.values(localBees).filter(b => b.project === proj).length;
    const ambientCount = Object.values(ambientBees).length; // ambient are always visible

    // Bee count badge
    if (beeCount > 0) {
      const badge = new Graphics();
      badge.circle(ox + officeW - 16, oy + 14, 10).fill(P.honey);
      layers.buildingOverlay.addChild(badge);

      const countText = new Text({
        text: String(beeCount),
        style: new TextStyle({
          fontFamily: 'Inter, sans-serif',
          fontSize: 10,
          fontWeight: '700',
          fill: 0x2D2926,
        }),
      });
      countText.anchor.set(0.5, 0.5);
      countText.x = ox + officeW - 16;
      countText.y = oy + 14;
      layers.buildingOverlay.addChild(countText);
    }

    // Mini bee dots for active bees
    const projBees = Object.values(localBees).filter(b => b.project === proj);
    for (const bee of projBees) {
      const bx = ox + (bee.drawX / CANVAS_W) * officeW + 4;
      const by = oy + (bee.drawY / CANVAS_H) * officeH + 22;
      const dot = new Graphics();
      dot.circle(bx, by, 4).fill(hexToNum(bee.color));
      dot.circle(bx, by, 4).stroke({ color: 0xffffff, width: 1 });
      layers.buildingOverlay.addChild(dot);
    }

    // Store click area for interaction
    buildingClickAreas.push({ project: proj, x: ox, y: oy, w: officeW, h: officeH });
  }
}

function enterBuildingView(projects) {
  if (projects.length <= 1) return;
  buildingProjects = projects;
  viewMode = 'building';
  buildingTransitionTarget = 1;
  cameraTarget = { x: 0, y: 0, zoom: 1 };
}

function exitBuildingView(selectedProject) {
  viewMode = 'single';
  buildingTransitionTarget = 0;
  if (selectedProject) {
    projectFilter = selectedProject;
    // Update project tab active states
    document.querySelectorAll('.project-tab').forEach(t => {
      t.classList.toggle('active', (t.dataset.project || null) === (projectFilter || null));
    });
    lastTerminalKey = '';
    lastEventLogKey = '';
  }
}

// --- WebSocket ---
function connectWS() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onopen = () => {
    setConnectionStatus('online', 'Connected');
  };

  ws.onclose = () => {
    setConnectionStatus('offline', 'Disconnected');
    setTimeout(connectWS, 2000);
  };

  ws.onerror = () => {
    setConnectionStatus('offline', 'Error');
  };

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      switch (msg.type) {
        case 'state':    handleState(msg.payload);    break;
        case 'event':    handleEvent(msg.payload);    break;
        case 'speech':   handleSpeech(msg.payload);   break;
        case 'response': handleResponse(msg.payload); break;
        case 'shop-result': handleShopResult(msg.payload); break;
      }
    } catch (err) {
      console.warn('[ws] Parse error:', err);
    }
  };
}

function handleState(state) {
  officeState = state;

  // Update stats
  if (state.stats) {
    setText('stat-tools', state.stats.toolCalls);
    setText('stat-reads', state.stats.filesRead);
    setText('stat-writes', state.stats.filesWritten);
    setText('stat-cmds', state.stats.commandsRun);
    setText('stat-errors', state.stats.errors);
  }

  // Honey counter
  if (state.shop) {
    setText('stat-honey', state.shop.honey);
    setText('shop-honey-badge', state.shop.honey);
    // Floating "+N" animation when honey increases
    if (state.shop.honey > lastHoney && lastHoney > 0) {
      showHoneyEarned(state.shop.honey - lastHoney);
    }
    lastHoney = state.shop.honey;
    renderShopPanel(state.shop);
  }

  // Session status
  if (state.sessionActive) {
    setConnectionStatus('active', state.currentTool ? `Using ${state.currentTool}` : 'Working...');
  }

  // Update project tabs
  if (state.projects) {
    updateProjectTabs(state.projects);
  }

  // Sync ALL bees (visibility is toggled inside syncBees based on projectFilter)
  syncBees(state.bees);

  // Event log (filtered by project) — uses session history browser wrapper
  const filteredLog = projectFilter
    ? state.eventLog.filter(e => !e.project || e.project === projectFilter)
    : state.eventLog;
  if (state.eventLog) {
    renderActivityPanel(filteredLog);
  }

  // Terminal log from state (persists across reconnects)
  if (state.terminalLog) {
    const filteredTerminal = projectFilter
      ? state.terminalLog.filter(e => !e.project || e.project === projectFilter)
      : state.terminalLog;
    renderTerminalFromState(filteredTerminal);
  }

  // Welcome overlay
  const overlay = document.getElementById('office-viewport');
  if (overlay) {
    // No separate welcome overlay needed - bees are always visible
  }
}

function handleEvent(payload) {
  // Brief flash on status dot
  const dot = document.querySelector('.status-dot');
  if (dot) {
    dot.classList.add('active');
    setTimeout(() => {
      if (!officeState?.sessionActive) dot.classList.remove('active');
    }, 1000);
  }
}

function handleSpeech(payload) {
  showSubtitle(payload.text);

  if (!voiceEnabled || !payload.audio) return;

  // Decode base64 MP3 to ArrayBuffer for AudioContext playback
  const binary = atob(payload.audio);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  // Cap queue to prevent unbounded memory growth in long sessions
  if (audioQueue.length >= 10) {
    console.log('[speech] Queue full, dropping oldest audio');
    audioQueue.shift();
  }

  console.log(`[speech] Queued audio (${bytes.length} bytes), queue length: ${audioQueue.length + 1}`);
  audioQueue.push({ buffer: bytes.buffer, text: payload.text });
  if (!isPlaying) playNextAudio();
}

// --- Audio ---
// Unlock AudioContext on first user gesture so WebSocket-driven playback works
let audioCtx = null;
function ensureAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

async function playNextAudio() {
  if (audioQueue.length === 0) { isPlaying = false; currentAudioSource = null; return; }
  isPlaying = true;
  ensureAudioContext();

  const { buffer } = audioQueue.shift();

  try {
    const audioBuffer = await audioCtx.decodeAudioData(buffer);
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);
    source.onended = () => { currentAudioSource = null; playNextAudio(); };
    currentAudioSource = source;
    source.start(0);
    console.log('[speech] Playing audio via AudioContext');
  } catch (err) {
    console.error('[speech] Decode/play error:', err);
    currentAudioSource = null;
    playNextAudio();
  }
}

/** Stop all audio playback and flush the queue */
function stopAllAudio() {
  audioQueue.length = 0;
  isPlaying = false;
  if (currentAudioSource) {
    try { currentAudioSource.stop(); } catch { /* already stopped */ }
    currentAudioSource = null;
  }
}

function showSubtitle(text) {
  const bar = document.getElementById('speech-bar');
  const el = document.getElementById('speech-text');
  if (!bar || !el) return;
  el.textContent = text;
  bar.classList.remove('hidden');
  clearTimeout(window._subtitleTimer);
  window._subtitleTimer = setTimeout(() => bar.classList.add('hidden'), 6000);
}

// --- Session History Browser ---
let sessionListCache = null;
let sessionListFetched = false;
let activeSessionId = null; // null = live view

async function fetchSessionList() {
  try {
    const res = await fetch('/api/sessions');
    if (!res.ok) return [];
    const data = await res.json();
    return data || [];
  } catch { return []; }
}

async function fetchSession(id) {
  try {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function renderActivityPanel(liveEntries) {
  const panel = document.getElementById('activity-panel');
  if (!panel) return;

  // Build session header if not already present
  let header = panel.querySelector('.session-browser-header');
  if (!header) {
    header = document.createElement('div');
    header.className = 'session-browser-header';
    panel.insertBefore(header, panel.firstChild);

    // Fetch sessions on first render
    if (!sessionListFetched) {
      sessionListFetched = true;
      fetchSessionList().then(sessions => {
        sessionListCache = sessions;
        renderSessionCards(header, sessions);
      });
    }
  }

  // If viewing a past session, don't overwrite with live data
  if (activeSessionId) return;

  // Otherwise render live event log
  renderEventLog(liveEntries);
}

function renderSessionCards(container, sessions) {
  container.innerHTML = '';

  // Live session card (always first)
  const liveCard = document.createElement('button');
  liveCard.className = 'session-card' + (!activeSessionId ? ' active' : '');
  liveCard.innerHTML = '<span class="session-card-dot live"></span><span class="session-card-label">Live</span>';
  liveCard.addEventListener('click', () => {
    activeSessionId = null;
    container.querySelectorAll('.session-card').forEach(c => c.classList.remove('active'));
    liveCard.classList.add('active');
    lastEventLogKey = ''; // force re-render
  });
  container.appendChild(liveCard);

  // Past session cards
  for (const s of sessions) {
    const card = document.createElement('button');
    card.className = 'session-card';
    const date = new Date(s.startTime);
    const timeStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
                    date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    card.innerHTML = `
      <span class="session-card-project">${escapeHtml(s.project || 'unknown')}</span>
      <span class="session-card-time">${timeStr}</span>
      <span class="session-card-count">${s.entryCount}</span>
    `;
    card.addEventListener('click', async () => {
      activeSessionId = s.id;
      container.querySelectorAll('.session-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');

      // Fetch and display past session
      const log = document.getElementById('event-log');
      if (log) log.innerHTML = '<div class="session-loading">Loading session...</div>';

      const session = await fetchSession(s.id);
      if (session && activeSessionId === s.id) {
        renderPastSession(session);
      }
    });
    container.appendChild(card);
  }
}

function renderPastSession(session) {
  const log = document.getElementById('event-log');
  if (!log) return;
  log.innerHTML = '';

  // Session info header
  const info = document.createElement('div');
  info.className = 'session-info';
  const start = new Date(session.startTime);
  const end = new Date(session.endTime);
  const duration = Math.round((end - start) / 60000);
  info.innerHTML = `
    <div class="session-info-title">${escapeHtml(session.project || 'Session')}</div>
    <div class="session-info-meta">${start.toLocaleString()} &middot; ${duration}m &middot; ${(session.eventLog?.length || 0)} events</div>
  `;
  log.appendChild(info);

  // Render event entries
  const entries = session.eventLog || [];
  for (const entry of entries.slice(0, 50)) {
    const el = document.createElement('div');
    el.className = 'log-entry';
    const time = new Date(entry.timestamp);
    const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    el.innerHTML = `
      <span class="log-icon">${entry.icon || '\uD83D\uDCCB'}</span>
      <div>
        <span class="log-detail">${escapeHtml(entry.detail || entry.event || '')}</span>
        <span class="log-time">${timeStr}</span>
      </div>
    `;
    log.appendChild(el);
  }
}

// --- Event Log ---
function renderEventLog(entries) {
  const log = document.getElementById('event-log');
  if (!log) return;

  // Only render first 30
  const toRender = entries.slice(0, 30);

  // Fingerprint: count + first entry timestamp to avoid DOM thrashing every 500ms
  const key = toRender.length + ':' + (toRender[0]?.timestamp || '');
  if (key === lastEventLogKey) return;
  lastEventLogKey = key;

  log.innerHTML = '';

  for (const entry of toRender) {
    const el = document.createElement('div');
    el.className = 'log-entry';

    const time = new Date(entry.timestamp);
    const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    el.innerHTML = `
      <span class="log-icon">${entry.icon}</span>
      <div>
        <span class="log-detail">${escapeHtml(entry.detail)}</span>
        <span class="log-time">${timeStr}</span>
      </div>
    `;
    log.appendChild(el);
  }
}

// --- Terminal / Response Feed ---
const MAX_TERMINAL_ENTRIES = 100;
let lastTerminalKey = '';

/** Format relative time (e.g., "just now", "2m ago", "1h ago") */
function relativeTime(timestamp) {
  const diff = Date.now() - new Date(timestamp).getTime();
  if (diff < 10000) return 'just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

/** Determine role from terminal entry event */
function entryRole(entry) {
  if (entry.event === 'UserPromptSubmit') return 'user';
  if (entry.event === 'Stop') return 'claude';
  if (entry.event === 'Error' || entry.event === 'PostToolUseFailure') return 'error';
  return 'tool';
}

/** Render terminal from state.terminalLog (persists across reconnects) */
function renderTerminalFromState(entries) {
  if (!entries) return;
  // Fingerprint: count + last entry timestamp to detect real changes
  const key = entries.length + ':' + (entries[entries.length - 1]?.timestamp || '');
  if (key === lastTerminalKey) return;
  lastTerminalKey = key;

  const terminal = document.getElementById('terminal-output');
  if (!terminal) return;

  terminal.innerHTML = '';

  let lastDateStr = '';

  for (const entry of entries) {
    // Date separator
    const dateStr = new Date(entry.timestamp).toLocaleDateString();
    if (dateStr !== lastDateStr) {
      lastDateStr = dateStr;
      const sep = document.createElement('div');
      sep.className = 'term-session-sep';
      sep.textContent = dateStr;
      terminal.appendChild(sep);
    }

    const role = entryRole(entry);
    const el = document.createElement('div');
    el.className = `term-entry role-${role}`;

    const roleConfig = {
      user:   { icon: '>', badge: 'user', label: 'YOU' },
      claude: { icon: '\uD83D\uDC1D', badge: 'stop', label: 'BEE' },
      tool:   { icon: '\u2699', badge: 'tool', label: 'TOOL' },
      error:  { icon: '\u26A0', badge: 'error', label: 'ERR' },
    };
    const rc = roleConfig[role] || roleConfig.tool;

    const relTime = relativeTime(entry.timestamp);
    const content = entry.content || '';

    const projectTag = entry.project
      ? `<span class="term-project-tag">${escapeHtml(shortProjectName(entry.project))}</span>`
      : '';

    el.innerHTML = `
      <div class="term-prompt">
        <span class="term-role-icon">${rc.icon}</span>
        <span class="term-badge ${rc.badge}">${escapeHtml(rc.label)}</span>
        ${projectTag}
        <span class="term-relative-time">${relTime}</span>
      </div>
      <div class="term-content">${escapeHtml(content)}</div>
    `;

    terminal.appendChild(el);
  }

  terminal.scrollTop = terminal.scrollHeight;
}

// Update relative timestamps every 30s
setInterval(() => {
  const times = document.querySelectorAll('.term-relative-time');
  // Re-render would be heavy; we just rely on the next state broadcast to update fingerprint
}, 30000);

/** Handle real-time response messages (also flashes terminal tab) */
function handleResponse(payload) {
  if (payload.event !== 'UserPromptSubmit' && payload.event !== 'Stop') return;

  // Flash the terminal tab if not active
  const termTab = document.querySelector('.term-window-tab[data-tab="terminal"]');
  if (termTab && !termTab.classList.contains('active')) {
    termTab.style.color = '#FCD34D';
    setTimeout(() => { if (!termTab.classList.contains('active')) termTab.style.color = ''; }, 2000);
  }

  // Show Claude's actual response text above the queen bee
  if (payload.event === 'Stop' && payload.content && localBees['queen']) {
    const text = payload.content.replace(/\s+/g, ' ').trim();
    if (text.length > 0) {
      updateSpeechBubble(localBees['queen'], text);
    }
  }

  // Show user prompt above queen too
  if (payload.event === 'UserPromptSubmit' && payload.content && localBees['queen']) {
    updateSpeechBubble(localBees['queen'], payload.content);
  }

  // Force re-render on next state (the state broadcast will follow shortly)
  lastTerminalKey = '';
}

// --- Floating Terminal Window ---
const TERM_STORAGE_KEY = 'beehaven-term-window';

function loadTermWindowState() {
  try {
    const saved = JSON.parse(localStorage.getItem(TERM_STORAGE_KEY));
    if (saved) Object.assign(termWindow, saved);
  } catch {}
}

function saveTermWindowState() {
  localStorage.setItem(TERM_STORAGE_KEY, JSON.stringify({
    x: termWindow.x, y: termWindow.y,
    width: termWindow.width, height: termWindow.height,
    minimized: termWindow.minimized, visible: termWindow.visible,
  }));
}

function applyTermWindowPosition() {
  const win = document.getElementById('terminal-window');
  if (!win) return;
  win.style.left = termWindow.x + 'px';
  win.style.top = termWindow.y + 'px';
  win.style.width = termWindow.width + 'px';
  win.style.height = termWindow.height + 'px';
}

function toggleMaximize() {
  if (termWindow.maximized) {
    if (termPreMaximize) Object.assign(termWindow, termPreMaximize);
    termWindow.maximized = false;
  } else {
    termPreMaximize = { x: termWindow.x, y: termWindow.y, width: termWindow.width, height: termWindow.height };
    termWindow.x = 0;
    termWindow.y = 0;
    termWindow.width = window.innerWidth;
    termWindow.height = window.innerHeight;
    termWindow.maximized = true;
  }
  applyTermWindowPosition();
  saveTermWindowState();
}

function onTermDragStart(e) {
  if (e.target.closest('.term-window-btn')) return;
  termDragging = true;
  const win = document.getElementById('terminal-window');
  termDragOffset.x = e.clientX - win.offsetLeft;
  termDragOffset.y = e.clientY - win.offsetTop;
  e.preventDefault();
}

function onTermResizeStart(e, dir) {
  termResizing = true;
  termResizeDir = dir;
  termDragOffset.x = e.clientX;
  termDragOffset.y = e.clientY;
  e.preventDefault();
  e.stopPropagation();
}

function onTermDragResizeMove(e) {
  const win = document.getElementById('terminal-window');
  if (!win) return;

  if (termDragging) {
    let nx = e.clientX - termDragOffset.x;
    let ny = e.clientY - termDragOffset.y;
    const snap = 12;
    const maxX = window.innerWidth - win.offsetWidth;
    const minY = 0;
    if (nx < snap) nx = 0;
    if (ny < minY + snap) ny = minY;
    if (nx > maxX - snap) nx = Math.max(0, maxX);
    if (ny > window.innerHeight - 36) ny = window.innerHeight - 36;
    termWindow.x = nx;
    termWindow.y = ny;
    win.style.left = nx + 'px';
    win.style.top = ny + 'px';
    if (termWindow.maximized) { termWindow.maximized = false; }
    return;
  }

  if (termResizing) {
    const dx = e.clientX - termDragOffset.x;
    const dy = e.clientY - termDragOffset.y;
    termDragOffset.x = e.clientX;
    termDragOffset.y = e.clientY;
    const minW = 320, minH = 200;

    if (termResizeDir.includes('e')) termWindow.width = Math.max(minW, termWindow.width + dx);
    if (termResizeDir.includes('w')) {
      const nw = Math.max(minW, termWindow.width - dx);
      if (nw !== termWindow.width) { termWindow.x += termWindow.width - nw; termWindow.width = nw; }
    }
    if (termResizeDir.includes('s')) termWindow.height = Math.max(minH, termWindow.height + dy);
    if (termResizeDir.includes('n')) {
      const nh = Math.max(minH, termWindow.height - dy);
      if (nh !== termWindow.height) { termWindow.y += termWindow.height - nh; termWindow.height = nh; }
    }
    applyTermWindowPosition();
    if (termWindow.maximized) { termWindow.maximized = false; }
  }
}

function onTermDragResizeEnd() {
  if (termDragging || termResizing) {
    termDragging = false;
    termResizing = false;
    saveTermWindowState();
  }
}

function initTerminalWindow() {
  loadTermWindowState();
  const win = document.getElementById('terminal-window');
  if (!win) return;

  // Default Y: bottom of viewport
  if (termWindow.y === null) {
    termWindow.y = window.innerHeight - termWindow.height - 16;
  }
  applyTermWindowPosition();

  // Tabs
  const tabs = win.querySelectorAll('.term-window-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      tab.style.color = '';
      win.querySelectorAll('.term-window-panel').forEach(p => p.classList.remove('active'));
      const panel = document.getElementById(`${tab.getAttribute('data-tab')}-panel`);
      if (panel) panel.classList.add('active');
    });
  });

  // Title bar drag
  const titlebar = win.querySelector('.term-window-titlebar');
  titlebar.addEventListener('mousedown', onTermDragStart);
  titlebar.addEventListener('dblclick', toggleMaximize);

  // Touch drag
  titlebar.addEventListener('touchstart', (e) => {
    if (e.target.closest('.term-window-btn')) return;
    termDragging = true;
    termDragOffset.x = e.touches[0].clientX - win.offsetLeft;
    termDragOffset.y = e.touches[0].clientY - win.offsetTop;
  }, { passive: true });

  // Window controls
  win.querySelector('.term-window-close').addEventListener('click', () => {
    termWindow.visible = false;
    win.classList.add('hidden');
    saveTermWindowState();
  });
  win.querySelector('.term-window-minimize').addEventListener('click', () => {
    termWindow.minimized = !termWindow.minimized;
    win.classList.toggle('minimized', termWindow.minimized);
    saveTermWindowState();
  });
  win.querySelector('.term-window-maximize').addEventListener('click', toggleMaximize);

  // Resize handles
  win.querySelectorAll('.term-resize').forEach(handle => {
    const cls = Array.from(handle.classList);
    const dir = cls.find(c => c.startsWith('term-resize-') && c !== 'term-resize')?.replace('term-resize-', '');
    if (dir) {
      handle.addEventListener('mousedown', (e) => onTermResizeStart(e, dir));
      handle.addEventListener('touchstart', (e) => {
        termResizing = true;
        termResizeDir = dir;
        termDragOffset.x = e.touches[0].clientX;
        termDragOffset.y = e.touches[0].clientY;
        e.stopPropagation();
      }, { passive: true });
    }
  });

  // Global move/end
  document.addEventListener('mousemove', onTermDragResizeMove);
  document.addEventListener('mouseup', onTermDragResizeEnd);
  document.addEventListener('touchmove', (e) => {
    if (!termDragging && !termResizing) return;
    onTermDragResizeMove({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY, preventDefault() {} });
  }, { passive: true });
  document.addEventListener('touchend', onTermDragResizeEnd);

  // Window resize clamp
  window.addEventListener('resize', () => {
    const maxX = window.innerWidth - termWindow.width;
    const maxY = window.innerHeight - 36;
    if (termWindow.x > maxX) termWindow.x = Math.max(0, maxX);
    if (termWindow.y > maxY) termWindow.y = Math.max(0, maxY);
    applyTermWindowPosition();
  });

  // Apply initial state
  if (!termWindow.visible) win.classList.add('hidden');
  if (termWindow.minimized) win.classList.add('minimized');
}

// --- Shop Popover ---
function toggleShop() {
  shopOpen = !shopOpen;
  document.getElementById('shop-popover')?.classList.toggle('hidden', !shopOpen);
  document.getElementById('btn-shop')?.classList.toggle('active', shopOpen);
}

// --- Account Linking ---
function toggleAccount() {
  accountOpen = !accountOpen;
  document.getElementById('account-popover')?.classList.toggle('hidden', !accountOpen);
  document.getElementById('btn-account')?.classList.toggle('active', accountOpen);
  if (accountOpen) fetchAccountState();
}

async function fetchAccountState() {
  try {
    const resp = await fetch('/api/account');
    if (resp.ok) {
      accountState = await resp.json();
      renderAccountPopover();
    }
  } catch (err) {
    console.error('[account] Failed to fetch state:', err);
  }
}

function renderAccountPopover() {
  const body = document.getElementById('account-popover-body');
  if (!body) return;

  const badge = document.getElementById('account-badge');

  if (accountState.linked && accountState.profile) {
    const p = accountState.profile;
    const plan = p.subscriptionPlan || 'free';
    const safePhotoURL = p.photoURL ? encodeURI(p.photoURL) : null;
    const avatarContent = safePhotoURL
      ? `<img src="${escapeHtml(safePhotoURL)}" alt="" referrerpolicy="no-referrer">`
      : p.displayName?.charAt(0)?.toUpperCase() || '?';

    body.innerHTML = `
      <div class="account-profile">
        <div class="account-avatar">${avatarContent}</div>
        <div class="account-info">
          <div class="account-name">${escapeHtml(p.displayName || 'Clearly User')}</div>
          ${p.email ? `<div class="account-email">${escapeHtml(p.email)}</div>` : ''}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;justify-content:space-between">
        <span class="account-tier-badge tier-${plan}">${plan}</span>
        <div class="account-status">
          <span class="account-status-dot ${accountState.connected ? '' : 'offline'}"></span>
          ${accountState.connected ? 'Syncing to Clearly' : 'Offline'}
        </div>
      </div>
      <button class="account-unlink-btn" id="account-unlink-btn">Unlink Account</button>
    `;

    // Bind unlink button (onclick="" doesn't work in ES modules)
    const unlinkBtn = body.querySelector('#account-unlink-btn');
    if (unlinkBtn) unlinkBtn.addEventListener('click', unlinkAccount);

    // Show green badge on account button
    if (badge) { badge.classList.remove('hidden'); }
  } else {
    body.innerHTML = `
      <div class="account-unlinked-desc">
        Link your Clearly account to sync your bee office to the cloud,
        unlock building view, and access premium features.
      </div>
      <input type="text" id="account-token" class="account-token-input"
             placeholder="Paste your relay token here..." autocomplete="off" spellcheck="false">
      <div id="account-link-error" class="account-link-error"></div>
      <button id="account-link-submit" class="account-link-btn">
        Link Account
      </button>
      <div class="account-how-to">
        Get your token from Clearly.sh &rarr; Settings &rarr; BeeHaven
      </div>
    `;

    // Bind link button and input listeners
    const linkBtn = body.querySelector('#account-link-submit');
    const input = body.querySelector('#account-token');
    if (linkBtn) {
      linkBtn.disabled = true;
      linkBtn.addEventListener('click', linkAccount);
    }
    if (input) {
      input.addEventListener('input', () => {
        if (linkBtn) linkBtn.disabled = input.value.trim().length < 32;
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && linkBtn && !linkBtn.disabled) linkAccount();
      });
    }

    // Hide green badge
    if (badge) { badge.classList.add('hidden'); }
  }
}

async function linkAccount() {
  const input = document.getElementById('account-token');
  const btn = document.getElementById('account-link-submit');
  const errorEl = document.getElementById('account-link-error');
  if (!input || !btn) return;

  const token = input.value.trim();
  if (token.length < 32) return;

  btn.disabled = true;
  btn.textContent = 'Linking...';
  if (errorEl) { errorEl.classList.remove('visible'); errorEl.textContent = ''; }

  try {
    const resp = await fetch('/api/account/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    const result = await resp.json();

    if (resp.ok && result.ok) {
      accountState = { linked: true, profile: result.profile, tier: result.profile?.subscriptionPlan || 'free', connected: true };
      renderAccountPopover();
    } else {
      if (errorEl) {
        errorEl.textContent = result.error || 'Failed to link account';
        errorEl.classList.add('visible');
      }
      btn.disabled = false;
      btn.textContent = 'Link Account';
    }
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = 'Network error — check your connection';
      errorEl.classList.add('visible');
    }
    btn.disabled = false;
    btn.textContent = 'Link Account';
  }
}

async function unlinkAccount() {
  try {
    await fetch('/api/account/unlink', { method: 'POST' });
    accountState = { linked: false, profile: null, tier: 'local', connected: false };
    renderAccountPopover();
  } catch (err) {
    console.error('[account] Unlink failed:', err);
  }
}

// --- Voice Input ---
async function toggleMic() {
  const btn = document.getElementById('btn-mic');
  if (recording) {
    stopRecording();
    btn.classList.remove('recording');
    return;
  }

  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Pick a supported mimeType with fallbacks
    const mimeType = ['audio/webm', 'audio/mp4', 'audio/ogg']
      .find(t => MediaRecorder.isTypeSupported(t)) || '';
    const options = mimeType ? { mimeType } : {};
    const contentType = mimeType || 'audio/webm';

    mediaRecorder = new MediaRecorder(stream, options);
    const chunks = [];

    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: contentType });

      try {
        const resp = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': contentType },
          body: blob,
        });
        const data = await resp.json();
        if (data.transcript) {
          showSubtitle(`You: ${data.transcript}`);
        } else {
          showSubtitle('Voice input failed \u2014 try again');
        }
      } catch (err) {
        console.error('[mic] Upload error:', err);
        showSubtitle('Voice input failed \u2014 connection error');
      }
    };

    mediaRecorder.onerror = () => {
      console.error('[mic] MediaRecorder error');
      stream.getTracks().forEach(t => t.stop());
      recording = false;
      btn.classList.remove('recording');
    };

    mediaRecorder.start();
    recording = true;
    btn.classList.add('recording');
  } catch (err) {
    console.error('[mic] Access denied:', err);
    // Clean up stream if getUserMedia succeeded but MediaRecorder failed
    if (stream) stream.getTracks().forEach(t => t.stop());
    showSubtitle('Microphone access denied');
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
  recording = false;
}

// --- UI Binding ---
function bindUI() {
  // Floating terminal window
  initTerminalWindow();

  // Account popover
  document.getElementById('btn-account').addEventListener('click', toggleAccount);
  document.getElementById('btn-account-close').addEventListener('click', toggleAccount);
  document.addEventListener('click', (e) => {
    if (!accountOpen) return;
    const popover = document.getElementById('account-popover');
    const btn = document.getElementById('btn-account');
    if (!popover.contains(e.target) && !btn.contains(e.target)) {
      accountOpen = false;
      popover.classList.add('hidden');
      btn.classList.remove('active');
    }
  });
  // Fetch account state on load
  fetchAccountState();

  // Shop popover
  document.getElementById('btn-shop').addEventListener('click', toggleShop);
  document.getElementById('btn-shop-close').addEventListener('click', toggleShop);
  document.addEventListener('click', (e) => {
    if (!shopOpen) return;
    const popover = document.getElementById('shop-popover');
    const btn = document.getElementById('btn-shop');
    if (!popover.contains(e.target) && !btn.contains(e.target)) {
      shopOpen = false;
      popover.classList.add('hidden');
      btn.classList.remove('active');
    }
  });

  // Voice
  document.getElementById('btn-voice').addEventListener('click', () => {
    voiceEnabled = !voiceEnabled;
    document.getElementById('btn-voice').classList.toggle('active', voiceEnabled);
    if (voiceEnabled) {
      ensureAudioContext();
    } else {
      stopAllAudio();
    }
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'voice-toggle', enabled: voiceEnabled }));
    }
  });

  document.getElementById('btn-mic').addEventListener('click', toggleMic);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === '`') {
      e.preventDefault();
      const win = document.getElementById('terminal-window');
      termWindow.visible = !termWindow.visible;
      win.classList.toggle('hidden', !termWindow.visible);
      if (termWindow.visible && termWindow.minimized) {
        termWindow.minimized = false;
        win.classList.remove('minimized');
      }
      saveTermWindowState();
    }
    if (e.key === 'Escape' && shopOpen) toggleShop();
  });
}

// --- Helpers ---
function setConnectionStatus(state, label) {
  const dot = document.querySelector('.status-dot');
  const lbl = document.querySelector('.status-label');
  if (dot) {
    dot.classList.remove('online', 'active', 'offline');
    dot.classList.add(state);
  }
  if (lbl) lbl.textContent = label;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value ?? 0);
}

function shortProjectName(fullPath) {
  return fullPath.split('/').filter(Boolean).pop() || fullPath;
}

function updateProjectTabs(projects) {
  const container = document.getElementById('project-tabs');
  if (!container) return;
  container.innerHTML = '';

  // "All" tab
  const allTab = document.createElement('button');
  allTab.className = 'project-tab' + (!projectFilter ? ' active' : '');
  allTab.dataset.project = '';
  allTab.textContent = 'All';
  allTab.addEventListener('click', () => { setProjectFilter(null); });
  container.appendChild(allTab);

  for (const p of projects) {
    const tab = document.createElement('button');
    tab.className = 'project-tab' + (projectFilter === p ? ' active' : '');
    tab.dataset.project = p;
    tab.textContent = shortProjectName(p);
    tab.title = p;
    tab.addEventListener('click', () => { setProjectFilter(p); });
    container.appendChild(tab);
  }
}

function setProjectFilter(project) {
  projectFilter = project;
  lastTerminalKey = '';
  lastEventLogKey = '';
  // Update tab active states
  document.querySelectorAll('.project-tab').forEach(t => {
    t.classList.toggle('active', (t.dataset.project || null) === (projectFilter || null));
  });
  if (!projectFilter && officeState?.projects?.length > 1) {
    enterBuildingView(officeState.projects);
  } else {
    exitBuildingView(null);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- Shop ---
function renderShopPanel(shop) {
  // Fingerprint: honey + equipped skin + equipped accessory + owned count
  const key = `${shop.honey}:${shop.equippedSkin}:${shop.equippedAccessory}:${shop.ownedSkins?.length}:${shop.ownedAccessories?.length}`;
  if (key === lastShopKey) return;
  lastShopKey = key;

  setText('shop-honey', shop.honey);

  const skinsGrid = document.getElementById('shop-skins');
  const accGrid = document.getElementById('shop-accessories');
  if (!skinsGrid || !accGrid || !shop.items) return;

  skinsGrid.innerHTML = '';
  accGrid.innerHTML = '';

  for (const item of shop.items) {
    const owned = item.type === 'skin'
      ? shop.ownedSkins?.includes(item.id)
      : shop.ownedAccessories?.includes(item.id);
    const equipped = item.type === 'skin'
      ? shop.equippedSkin === item.id
      : shop.equippedAccessory === item.id;

    const card = document.createElement('div');
    card.className = 'shop-card' + (equipped ? ' equipped' : '');

    // Preview (color swatch for skins, emoji icon for accessories)
    let previewHtml;
    if (item.type === 'skin' && item.color) {
      previewHtml = `<div class="shop-card-preview" style="background:${item.color}"></div>`;
    } else {
      const icons = {
        'party-hat': '\uD83C\uDF89', 'bow-tie': '\uD83C\uDFA9', 'sunglasses': '\uD83D\uDE0E',
        'top-hat': '\uD83C\uDFA9', 'headphones': '\uD83C\uDFA7', 'wizard-hat': '\uD83E\uDDD9',
        'halo': '\uD83D\uDE07', 'devil-horns': '\uD83D\uDE08',
      };
      const icon = icons[item.id] || '\u2728';
      previewHtml = `<div class="shop-card-preview" style="background:rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;font-size:18px">${icon}</div>`;
    }

    // Button
    let btnHtml;
    if (!owned) {
      const canAfford = shop.honey >= item.price;
      btnHtml = `<button class="shop-card-btn buy" ${canAfford ? '' : 'disabled'} data-action="purchase" data-id="${item.id}">${item.price === 0 ? 'Free' : item.price + ' \uD83C\uDF6F'}</button>`;
    } else if (equipped) {
      btnHtml = `<button class="shop-card-btn equipped" data-action="equip" data-id="${item.id}">Equipped</button>`;
    } else {
      btnHtml = `<button class="shop-card-btn equip" data-action="equip" data-id="${item.id}">Equip</button>`;
    }

    card.innerHTML = `
      ${previewHtml}
      <div class="shop-card-name">${escapeHtml(item.name)}</div>
      <div class="shop-card-desc">${escapeHtml(item.description || '')}</div>
      ${btnHtml}
    `;

    // Bind button click
    const btn = card.querySelector('.shop-card-btn');
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: action === 'purchase' ? 'shop-purchase' : 'shop-equip', itemId: id }));
      }
    });

    (item.type === 'skin' ? skinsGrid : accGrid).appendChild(card);
  }
}

function handleShopResult(payload) {
  if (payload.error) {
    showSubtitle(`Shop: ${payload.error}`);
  }
}

function showHoneyEarned(amount) {
  const el = document.createElement('div');
  el.className = 'honey-float';
  el.textContent = `+${amount} \uD83C\uDF6F`;
  // Position near the honey stat
  const stat = document.getElementById('stat-honey');
  if (stat) {
    const rect = stat.getBoundingClientRect();
    el.style.left = rect.left + 'px';
  } else {
    el.style.right = '120px';
  }
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

// --- Start ---
init().catch(console.error);
