// ============================================================================
// BeeHaven Office — PixiJS v8 Renderer + WebSocket + Audio
// ============================================================================

import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';

// --- Constants ---
const CANVAS_W = 1480;
const CANVAS_H = 1040;
const COORD_SCALE = 2; // Backend rooms are half-scale

// WeWork palette — warm charcoal, natural oak, sage green, honey gold
const P = {
  floor:      0x201C18,
  floorLine:  0x2A2620,
  wall:       0x2D2925,
  wallDark:   0x1A1714,
  wood:       0x9C8868,
  woodDark:   0x6B573D,
  glass:      0x2A3530,
  glassBrd:   0x4A6050,
  cushion:    0x3D5A45,
  cushionAlt: 0x8B6340,
  plant:      0x4A7A52,
  plantDark:  0x2D5A35,
  planter:    0x5C4A38,
  honey:      0xD4A545,
  white:      0xE8DED0,
  offWhite:   0x3A352E,
  dark:       0x141210,
  leather:    0x6B4830,
  monitor:    0x1A1A1A,
  monGlow:    0xE8DED0,
  led:        0x4ADE80,
  ledRed:     0xEF4444,
};

// --- Bee Color Helpers ---
function darkenColor(color, factor) {
  const r = ((color >> 16) & 0xFF) * factor;
  const g = ((color >> 8) & 0xFF) * factor;
  const b = (color & 0xFF) * factor;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

// Room definitions (backend coords * COORD_SCALE)
const ROOMS = [
  { id: 'lobby',        label: 'Reception',    x: 40,   y: 400, w: 200, h: 60,  color: 0x302820, accent: 0xD4A545 },
  { id: 'library',      label: 'Library',      x: 250,  y: 40,  w: 280, h: 340, color: 0x253028, accent: 0x3D8A55 },
  { id: 'studio',       label: 'Studio',       x: 550,  y: 40,  w: 300, h: 340, color: 0x252834, accent: 0x5B9BD5 },
  { id: 'web-booth',    label: 'Web',          x: 40,   y: 40,  w: 80,  h: 100, color: 0x282634, accent: 0x7B68EE },
  { id: 'phone-b',      label: 'Focus',        x: 1060, y: 40,  w: 80,  h: 100, color: 0x253032, accent: 0x6BA3BE },
  { id: 'server-room',  label: 'Server Room',  x: 1000, y: 470, w: 120, h: 160, color: 0x302220, accent: 0xEF6B4A },
  { id: 'meeting-room', label: 'Conference',   x: 40,   y: 470, w: 200, h: 200, color: 0x223028, accent: 0x4ADE80 },
  { id: 'water-cooler', label: 'Lounge',       x: 640,  y: 470, w: 250, h: 200, color: 0x2A2832, accent: 0xC490D0 },
  { id: 'coffee',       label: 'Kitchen',      x: 340,  y: 470, w: 200, h: 200, color: 0x30281C, accent: 0xD4A545 },
];

// ── Player Collision System ──
// Room interiors are ROOMS inset by WALL px so walls exist between rooms and corridors.
// Doors bridge the wall gaps. Furniture blocks movement inside rooms.
const WALL = 6;

const CORRIDORS = [
  { x: 20,  y: 140, w: 230, h: 260 },   // Left corridor (web-booth ↔ lobby)
  { x: 850, y: 140, w: 290, h: 330 },   // Right corridor (phone-b ↔ hallway)
  { x: 240, y: 380, w: 880, h: 90 },    // Main hallway
  { x: 530, y: 40,  w: 20,  h: 340 },   // Library ↔ studio glass gap
];

const DOOR_OPENINGS = [
  // Horizontal walls (top/bottom of rooms) — bridge from interior through wall to corridor
  { x: 55,   y: 132, w: 50, h: 12 },    // web-booth bottom
  { x: 1075, y: 132, w: 50, h: 12 },    // phone-b bottom
  { x: 375,  y: 372, w: 40, h: 12 },    // library south
  { x: 685,  y: 372, w: 40, h: 12 },    // studio south
  { x: 160,  y: 398, w: 40, h: 12 },    // lobby north
  { x: 120,  y: 452, w: 40, h: 26 },    // lobby↔meeting (10px floor gap + walls)
  { x: 420,  y: 468, w: 40, h: 12 },    // coffee north
  { x: 725,  y: 468, w: 42, h: 12 },    // lounge north
  { x: 1045, y: 468, w: 40, h: 12 },    // server-room north
  // Vertical walls (left/right of rooms)
  { x: 248,  y: 185, w: 12, h: 40 },    // library west
  { x: 522,  y: 185, w: 36, h: 40 },    // library↔studio glass divider
  { x: 842,  y: 185, w: 12, h: 40 },    // studio east
  { x: 232,  y: 418, w: 12, h: 30 },    // lobby right
];

const FURNITURE_COLLIDERS = [
  // Library
  { x: 260, y: 55,  w: 90,  h: 120 },   // bookshelf 1
  { x: 370, y: 55,  w: 90,  h: 120 },   // bookshelf 2
  { x: 280, y: 200, w: 120, h: 50 },    // reading desk 1
  { x: 280, y: 300, w: 120, h: 50 },    // reading desk 2
  { x: 462, y: 286, w: 56,  h: 44 },    // armchair
  // Studio
  { x: 580, y: 70,  w: 130, h: 55 },    // workstation desk 1
  { x: 700, y: 70,  w: 130, h: 55 },    // workstation desk 2
  { x: 580, y: 200, w: 130, h: 55 },    // workstation desk 3
  { x: 700, y: 200, w: 130, h: 55 },    // workstation desk 4
  { x: 790, y: 100, w: 55,  h: 45 },    // standing desk
  // Conference room
  { x: 70,  y: 530, w: 140, h: 60 },    // conference table
  // Kitchen — counter + equipment zone
  { x: 350, y: 468, w: 190, h: 82 },    // countertop + espresso + dispensers
  // Lounge
  { x: 660, y: 530, w: 200, h: 20 },    // sofa back
  { x: 660, y: 550, w: 20,  h: 80 },    // sofa arm (left side)
  { x: 700, y: 570, w: 60,  h: 35 },    // coffee table
  // Server room
  { x: 1015, y: 490, w: 75, h: 120 },   // server racks
  // Booths
  { x: 52,   y: 58, w: 50,  h: 30 },    // web booth desk
  { x: 1075, y: 65, w: 45,  h: 25 },    // focus booth desk
  // Lobby
  { x: 80,  y: 415, w: 120, h: 20 },    // reception desk
];

// Ambient bees removed — hired bees come from backend state now
const AMBIENT_BEES = [];

// --- Recruiter Menu Config ---
const HIRE_OPTIONS = [
  { type: 'developer',  label: 'Developer',  icon: '\uD83D\uDC69\u200D\uD83D\uDCBB', cost: 50 },
  { type: 'designer',   label: 'Designer',   icon: '\uD83C\uDFA8', cost: 75 },
  { type: 'researcher', label: 'Researcher', icon: '\uD83D\uDD2C', cost: 60 },
  { type: 'devops',     label: 'DevOps',     icon: '\u26A1',       cost: 80 },
  { type: 'manager',    label: 'Manager',    icon: '\uD83D\uDCCA', cost: 100 },
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
let officeLevel = 1;
let unlockedRooms = ['lobby', 'studio', 'meeting-room', 'library', 'coffee', 'server-room', 'water-cooler', 'web-booth', 'phone-b'];
let recruiterMenuOpen = false;

// --- Multi-Office Building View State ---
let viewMode = 'single'; // 'single' | 'building'
let buildingTransition = 0; // 0 = single, 1 = building (animated)
let buildingTransitionTarget = 0;
let buildingProjects = []; // project names for building view
let buildingClickAreas = []; // { project, x, y, w, h } for click detection

// --- Floating Terminal Window State ---
const TERM_POSITIONS = ['pos-bl', 'pos-br', 'pos-tl', 'pos-tr'];
const TERM_POSITION_KEY = 'beehaven-term-position';
let termPosition = localStorage.getItem(TERM_POSITION_KEY) || 'pos-bl';
let shopOpen = false;
let accountOpen = false;
let accountState = { linked: false, profile: null, tier: 'local', connected: false, syncStatus: null };

// --- Camera (Zoom / Pan) ---
let camera = { x: 0, y: 0, zoom: 1 };
let cameraTarget = { x: 0, y: 0, zoom: 1 };
let isPanning = false;
let panLast = { x: 0, y: 0 };
let pointers = new Map();   // pointerId → {x, y} for touch
let lastPinchDist = 0;
const ZOOM_MIN = 0.5, ZOOM_MAX = 3.0;
const CAM_LERP = 0.15;
let cameraFollow = null;       // bee object to follow, or null for free camera
let followIndicator = null;    // pulsing ring Graphics around followed bee

// --- Edge Pan (LoL-style) ---
const EDGE_PAN_ZONE = 50;     // px from viewport edge triggers pan
const EDGE_PAN_SPEED = 6;     // px per frame at full intensity
let mouseViewX = -1, mouseViewY = -1, mouseInCanvas = false;

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

const UPPER_ROOMS = new Set(['library', 'studio', 'web-booth', 'phone-b', 'lobby']);
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
  // ── Room interiors ──
  { id: 'web-booth',     x: 80,   y: 90,   room: 'web-booth' },
  { id: 'library',       x: 390,  y: 200,  room: 'library' },
  { id: 'studio',        x: 700,  y: 200,  room: 'studio' },
  { id: 'phone-b',       x: 1100, y: 90,   room: 'phone-b' },
  { id: 'lobby',         x: 140,  y: 430,  room: 'lobby' },
  { id: 'meeting-room',  x: 140,  y: 570,  room: 'meeting-room' },
  { id: 'coffee',        x: 440,  y: 570,  room: 'coffee' },
  { id: 'water-cooler',  x: 765,  y: 570,  room: 'water-cooler' },
  { id: 'server-room',   x: 1060, y: 550,  room: 'server-room' },

  // ── Door thresholds (just outside each door) ──
  { id: 'door-web',      x: 80,   y: 152,  room: null },  // web-booth bottom
  { id: 'door-pb',       x: 1100, y: 152,  room: null },  // phone-b bottom
  { id: 'door-lib-W',    x: 242,  y: 200,  room: null },  // library left side
  { id: 'door-lib-S',    x: 390,  y: 390,  room: null },  // library bottom
  { id: 'door-lib-E',    x: 538,  y: 200,  room: null },  // library→studio glass divider
  { id: 'door-studio-W', x: 558,  y: 200,  room: null },  // studio←library glass divider
  { id: 'door-studio-S', x: 700,  y: 390,  room: null },  // studio bottom
  { id: 'door-studio-E', x: 858,  y: 200,  room: null },  // studio right side
  { id: 'door-lobby-N',  x: 178,  y: 395,  room: null },  // lobby top
  { id: 'door-lobby-R',  x: 250,  y: 430,  room: null },  // lobby right
  { id: 'door-lobby-S',  x: 140,  y: 465,  room: null },  // lobby bottom / meeting top
  { id: 'door-coffee',   x: 440,  y: 465,  room: null },  // coffee top
  { id: 'door-lounge',   x: 741,  y: 465,  room: null },  // water-cooler top
  { id: 'door-server',   x: 1060, y: 465,  room: null },  // server-room top

  // ── Corridors (open space flanking rooms) ──
  { id: 'corr-L',        x: 80,   y: 270,  room: null },  // left of library
  { id: 'corr-R',        x: 1100, y: 270,  room: null },  // right of studio

  // ── Main hallway (y≈420, right of lobby) ──
  { id: 'hall-1',        x: 280,  y: 420,  room: null },
  { id: 'hall-2',        x: 440,  y: 420,  room: null },
  { id: 'hall-3',        x: 640,  y: 420,  room: null },
  { id: 'hall-4',        x: 880,  y: 420,  room: null },
  { id: 'hall-5',        x: 1060, y: 420,  room: null },
];

const EDGES = [
  // ── Web booth / phone-b → corridors ──
  ['web-booth', 'door-web'],   ['door-web', 'corr-L'],
  ['phone-b', 'door-pb'],     ['door-pb', 'corr-R'],

  // ── Library doors ──
  ['library', 'door-lib-W'],   ['library', 'door-lib-S'],
  ['library', 'door-lib-E'],

  // ── Studio doors ──
  ['studio', 'door-studio-W'], ['studio', 'door-studio-S'],
  ['studio', 'door-studio-E'],

  // ── Glass divider (library ↔ studio) ──
  ['door-lib-E', 'door-studio-W'],

  // ── Side corridors ↔ room side doors ──
  ['corr-L', 'door-lib-W'],   ['corr-R', 'door-studio-E'],

  // ── Corridors → lobby / hallway ──
  ['corr-L', 'door-lobby-N'], ['door-lobby-N', 'lobby'],
  ['corr-R', 'hall-4'],

  // ── Lobby hub ──
  ['lobby', 'door-lobby-R'],  ['door-lobby-R', 'hall-1'],
  ['lobby', 'door-lobby-S'],  ['door-lobby-S', 'meeting-room'],

  // ── Room bottom doors → hallway ──
  ['door-lib-S', 'hall-2'],   ['door-studio-S', 'hall-3'],

  // ── Hallway spine (horizontal) ──
  ['hall-1', 'hall-2'],  ['hall-2', 'hall-3'],
  ['hall-3', 'hall-4'],  ['hall-4', 'hall-5'],

  // ── Lower rooms (hallway → door → interior) ──
  ['hall-2', 'door-coffee'],   ['door-coffee', 'coffee'],
  ['hall-3', 'door-lounge'],   ['hall-4', 'door-lounge'],
  ['door-lounge', 'water-cooler'],
  ['hall-5', 'door-server'],   ['door-server', 'server-room'],
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

/** Convert canvas coords to world coords (accounting for camera transform) */
function canvasToWorld(cx, cy) {
  return { x: (cx - camera.x) / camera.zoom, y: (cy - camera.y) / camera.zoom };
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

/** Check if a position is walkable (room interior, corridor, or door — but not furniture) */
function isWalkable(x, y) {
  // 1. Check room interiors (rooms inset by WALL thickness)
  let inZone = false;
  for (const r of ROOMS) {
    if (x >= r.x + WALL && x <= r.x + r.w - WALL &&
        y >= r.y + WALL && y <= r.y + r.h - WALL) {
      inZone = true; break;
    }
  }
  // 2. Check corridors
  if (!inZone) {
    for (const c of CORRIDORS) {
      if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) {
        inZone = true; break;
      }
    }
  }
  // 3. Check door openings
  if (!inZone) {
    for (const d of DOOR_OPENINGS) {
      if (x >= d.x && x <= d.x + d.w && y >= d.y && y <= d.y + d.h) {
        inZone = true; break;
      }
    }
  }
  if (!inZone) return false;
  // 4. Block if inside furniture
  for (const f of FURNITURE_COLLIDERS) {
    if (x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h) return false;
  }
  return true;
}

// --- Login / PIN ---
// PIN hash is persisted server-side in ~/.beehaven/config.json
let serverPinHash = null; // fetched from server on init
let pinDigits = [];
let pinMode = 'verify'; // 'create' | 'confirm' | 'verify'
let pinFirstEntry = '';

async function hashPin(pin) {
  const data = new TextEncoder().encode('beehaven-salt-' + pin);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function fetchPinHash() {
  try {
    const res = await fetch('/api/pin');
    const data = await res.json();
    return data.pinHash || null;
  } catch { return null; }
}

async function savePinHash(hash) {
  serverPinHash = hash;
  try {
    await fetch('/api/pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinHash: hash }),
    });
  } catch (err) {
    console.warn('[pin] Failed to save PIN to server:', err);
  }
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
      await savePinHash(hash);
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
  if (hash === serverPinHash) {
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

async function initLogin() {
  const loginScreen = document.getElementById('login-screen');
  if (!loginScreen) { return; }

  // Skip login if already authenticated this tab session
  if (sessionStorage.getItem('beehaven-session')) {
    loginScreen.style.display = 'none';
    document.getElementById('main').classList.remove('main-hidden');
    document.getElementById('main').classList.add('main-visible');
    return;
  }

  // Fetch PIN hash from server (persisted in ~/.beehaven/config.json)
  serverPinHash = await fetchPinHash();

  // Migrate from localStorage if server has no PIN yet
  const legacyHash = localStorage.getItem('beehaven-pin-hash');
  if (!serverPinHash && legacyHash) {
    await savePinHash(legacyHash);
    localStorage.removeItem('beehaven-pin-hash');
    serverPinHash = legacyHash;
  }

  // Determine mode
  if (serverPinHash) {
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
    backgroundColor: 0x121215,
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
  // Ambient bees removed — hired bees come from backend state via syncBees()
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
    if (frame % 10 === 0) updateTeamIcons(); // Update role icons every 10 frames
  });

  // --- Camera input handlers ---
  app.canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (viewMode === 'building') return;
    if (e.metaKey || e.ctrlKey) {
      // Cmd/Ctrl + scroll = zoom
      const delta = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 50);
      const factor = 1 - delta * 0.0003;
      const newZoom = clamp(cameraTarget.zoom * factor, ZOOM_MIN, ZOOM_MAX);
      const mouse = clientToCanvas(e);
      const wx = (mouse.x - camera.x) / camera.zoom;
      const wy = (mouse.y - camera.y) / camera.zoom;
      cameraTarget.zoom = newZoom;
      cameraTarget.x = mouse.x - wx * newZoom;
      cameraTarget.y = mouse.y - wy * newZoom;
    } else {
      // Two-finger trackpad scroll = pan
      cameraTarget.x -= e.deltaX * 0.3;
      cameraTarget.y -= e.deltaY * 0.3;
      cameraFollow = null;
    }
  }, { passive: false });

  app.canvas.addEventListener('dblclick', () => {
    if (viewMode === 'building') return;
    cameraTarget = { x: 0, y: 0, zoom: 1 };
    cameraFollow = null;
  });

  // Canvas click for building view + bee follow
  app.canvas.addEventListener('click', (e) => {
    if (viewMode === 'building') {
      if (buildingTransition < 0.8) return;
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
      return;
    }

    // Click-to-follow bee (or open recruiter menu)
    const canvasPos = clientToCanvas(e);
    const worldPos = canvasToWorld(canvasPos.x, canvasPos.y);
    let closest = null, closestDist = 40;

    // Check all bees
    const allBees = [
      ...(playerBee ? [playerBee] : []),
      ...Object.values(localBees),
    ];
    for (const bee of allBees) {
      if (!bee.gfx) continue;
      const d = Math.hypot(bee.drawX - worldPos.x, bee.drawY - worldPos.y);
      if (d < closestDist) { closestDist = d; closest = bee; }
    }

    // If clicked recruiter, open hire menu
    if (closest && (closest.role === 'recruiter' || closest.id === 'recruiter')) {
      openRecruiterMenu(closest);
      cameraFollow = closest;
      return;
    }

    cameraFollow = closest; // null if no bee nearby = free cam
  });

  // --- Mouse tracking for edge-of-map panning ---
  app.canvas.addEventListener('mousemove', (e) => {
    const rect = app.canvas.getBoundingClientRect();
    mouseViewX = e.clientX - rect.left;
    mouseViewY = e.clientY - rect.top;
    mouseInCanvas = true;
  });
  app.canvas.addEventListener('mouseleave', () => { mouseInCanvas = false; });

  // --- Follow indicator ring ---
  followIndicator = new Graphics();
  followIndicator.visible = false;
  layers.ui.addChild(followIndicator);

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
  // Upper rooms
  { room: 'web-booth',    edge: 'bottom', pos: 0.5, gap: 30 },
  { room: 'library',      edge: 'bottom', pos: 0.5, gap: 36 },   // library south
  { room: 'library',      edge: 'left',   pos: 0.5, gap: 36 },   // library west (from left corridor)
  { room: 'library',      edge: 'right',  pos: 0.5, gap: 36 },   // library→studio glass divider
  { room: 'studio',       edge: 'left',   pos: 0.5, gap: 36 },   // studio←library glass divider
  { room: 'studio',       edge: 'bottom', pos: 0.5, gap: 36 },   // studio south
  { room: 'studio',       edge: 'right',  pos: 0.5, gap: 36 },   // studio east (to right corridor)
  { room: 'phone-b',      edge: 'bottom', pos: 0.5, gap: 30 },
  // Lower rooms
  { room: 'lobby',        edge: 'top', pos: 0.7, gap: 30 },
  { room: 'lobby',        edge: 'right', pos: 0.5, gap: 24 },
  { room: 'lobby',        edge: 'bottom', pos: 0.5, gap: 30 },
  { room: 'meeting-room', edge: 'top', pos: 0.5, gap: 36 },
  { room: 'coffee',       edge: 'top', pos: 0.5, gap: 36 },
  { room: 'water-cooler', edge: 'top', pos: 0.4, gap: 36 },
  { room: 'server-room',  edge: 'top', pos: 0.5, gap: 36 },
];

// Pre-index doors by room ID
const DOORS_BY_ROOM = {};
for (const d of DOORS) {
  if (!DOORS_BY_ROOM[d.room]) DOORS_BY_ROOM[d.room] = [];
  DOORS_BY_ROOM[d.room].push(d);
}

// --- Furniture Interaction Points ---
// Specific coordinates where bees sit/stand at furniture
// Interaction points tagged with `act` — what activity a bee does here.
// Multiple points per room lets different bees (or the same bee on different tools) use different spots.
const INTERACTION_POINTS = {
  'library': [
    // Reading desks — sit at desk with lamp, read files on monitor
    { x: 340, y: 272, type: 'chair', facing: 'up', act: 'reading' },   // desk 1 chair
    { x: 340, y: 372, type: 'chair', facing: 'up', act: 'reading' },   // desk 2 chair
    // Bookshelves — stand and search/grep through code
    { x: 295, y: 182, type: 'stand', facing: 'up', act: 'searching' }, // browsing bookshelf 1
    { x: 405, y: 182, type: 'stand', facing: 'up', act: 'searching' }, // browsing bookshelf 2
    // Armchair — casual reading / reviewing
    { x: 490, y: 314, type: 'chair', facing: 'left', act: 'reading' }, // armchair
    // Standing between shelves — deep searching
    { x: 350, y: 130, type: 'stand', facing: 'up', act: 'searching' }, // between shelves
    // Near side table — reading with reference books
    { x: 470, y: 260, type: 'stand', facing: 'left', act: 'reading' },
  ],
  'studio': [
    // Workstation desks — coding at monitors
    { x: 645, y: 145, type: 'chair', facing: 'up', act: 'coding' },    // desk 1
    { x: 765, y: 145, type: 'chair', facing: 'up', act: 'coding' },    // desk 2
    { x: 645, y: 275, type: 'chair', facing: 'up', act: 'coding' },    // desk 3
    { x: 765, y: 275, type: 'chair', facing: 'up', act: 'coding' },    // desk 4
    // Standing desk — also coding
    { x: 817, y: 155, type: 'stand', facing: 'up', act: 'coding' },    // standing desk
    // Whiteboard — sketching/planning
    { x: 835, y: 130, type: 'stand', facing: 'right', act: 'thinking' }, // at whiteboard
    // Open floor — reviewing work
    { x: 700, y: 340, type: 'stand', facing: 'up', act: 'reading' },   // standing review
  ],
  'meeting-room': [
    // Conference table — presenting, thinking, planning
    { x: 80,  y: 520, type: 'chair', facing: 'down', act: 'presenting' },
    { x: 110, y: 520, type: 'chair', facing: 'down', act: 'thinking' },
    { x: 140, y: 520, type: 'chair', facing: 'down', act: 'presenting' },
    { x: 170, y: 520, type: 'chair', facing: 'down', act: 'thinking' },
    { x: 200, y: 520, type: 'chair', facing: 'down', act: 'presenting' },
    { x: 80,  y: 602, type: 'chair', facing: 'up', act: 'thinking' },
    { x: 110, y: 602, type: 'chair', facing: 'up', act: 'presenting' },
    { x: 140, y: 602, type: 'chair', facing: 'up', act: 'thinking' },
    { x: 170, y: 602, type: 'chair', facing: 'up', act: 'presenting' },
    { x: 200, y: 602, type: 'chair', facing: 'up', act: 'thinking' },
    // Whiteboard — diagramming
    { x: 60,  y: 510, type: 'stand', facing: 'left', act: 'presenting' },
    // Recruiter spot — standing near projector screen, away from table
    { x: 140, y: 648, type: 'stand', facing: 'up', act: 'idle' },
  ],
  'coffee': [
    // Bar stools — coffee break
    { x: 360, y: 568, type: 'stool', facing: 'up', act: 'drinking-coffee' },
    { x: 410, y: 568, type: 'stool', facing: 'up', act: 'drinking-coffee' },
    { x: 460, y: 568, type: 'stool', facing: 'up', act: 'drinking-coffee' },
    { x: 510, y: 568, type: 'stool', facing: 'up', act: 'drinking-coffee' },
    // Espresso machine — making coffee
    { x: 385, y: 500, type: 'stand', facing: 'down', act: 'drinking-coffee' },
    // Fruit water — chatting by the dispenser
    { x: 450, y: 530, type: 'stand', facing: 'up', act: 'chatting' },
    { x: 508, y: 530, type: 'stand', facing: 'up', act: 'chatting' },
  ],
  'water-cooler': [
    // Sofa — relaxing, chatting
    { x: 700, y: 545, type: 'sofa', facing: 'down', act: 'chatting' },
    { x: 750, y: 545, type: 'sofa', facing: 'down', act: 'chatting' },
    { x: 800, y: 545, type: 'sofa', facing: 'down', act: 'reading' },
    { x: 675, y: 570, type: 'sofa', facing: 'right', act: 'chatting' },
    { x: 675, y: 610, type: 'sofa', facing: 'right', act: 'idle' },
    // Standing — casual conversation
    { x: 760, y: 600, type: 'stand', facing: 'down', act: 'chatting' },
    // Coffee table — reviewing on laptop
    { x: 730, y: 580, type: 'stand', facing: 'down', act: 'reading' },
  ],
  'server-room': [
    // Server rack positions — monitoring, running commands
    { x: 1030, y: 540, type: 'stand', facing: 'right', act: 'running-command' },
    { x: 1075, y: 540, type: 'stand', facing: 'right', act: 'running-command' },
    { x: 1050, y: 600, type: 'stand', facing: 'up', act: 'running-command' },
    // Open area — checking terminal on laptop
    { x: 1050, y: 490, type: 'stand', facing: 'right', act: 'searching' },
  ],
  'web-booth': [
    // Desk — browsing
    { x: 77, y: 100, type: 'chair', facing: 'up', act: 'browsing' },
    // Standing near globe — researching
    { x: 95, y: 115, type: 'stand', facing: 'right', act: 'searching' },
  ],
  'phone-b': [
    // Desk — focused work
    { x: 1097, y: 100, type: 'chair', facing: 'up', act: 'coding' },
  ],
  'lobby': [
    // Reception desk — arriving, greeting
    { x: 100, y: 425, type: 'stand', facing: 'right', act: 'arriving' },
    { x: 160, y: 435, type: 'stand', facing: 'left', act: 'idle' },
    // Near entrance
    { x: 130, y: 445, type: 'stand', facing: 'down', act: 'arriving' },
  ],
};

// Desk-to-monitor mapping — links chair positions to monitor screen rects
const DESK_MONITORS = [
  // Studio workstation desks (drawDesk at 580/700, 70/200 → screen at x+38,y+8,54,26)
  { chairX: 645, chairY: 145, mx: 618, my: 78,  mw: 54, mh: 26 },
  { chairX: 765, chairY: 145, mx: 738, my: 78,  mw: 54, mh: 26 },
  { chairX: 645, chairY: 275, mx: 618, my: 208, mw: 54, mh: 26 },
  { chairX: 765, chairY: 275, mx: 738, my: 208, mw: 54, mh: 26 },
  // Standing desk (790,100 → screen at 798,108,39,22)
  { chairX: 817, chairY: 155, mx: 798, my: 108, mw: 39, mh: 22 },
  // Web booth (52,58 → screen at 60,64,34,16)
  { chairX: 77,  chairY: 100, mx: 60,  my: 64,  mw: 34, mh: 16 },
  // Focus booth (1075,65 → screen at 1086,68,23,12)
  { chairX: 1097, chairY: 100, mx: 1086, my: 68, mw: 23, mh: 12 },
];
let monitorScreenOverlays = []; // Graphics objects for active monitor screens

// Track which interaction points are occupied { 'room:index' -> beeId }
const occupiedPoints = {};

/**
 * Find a free interaction point for a bee in a room.
 * Prefers points whose `act` tag matches the bee's current activity.
 * Queen gets priority for activity-matched points.
 */
function findInteractionPoint(roomId, beeId, isQueen, beeActivity) {
  const points = INTERACTION_POINTS[roomId];
  if (!points || points.length === 0) return null;

  // Release any previous point held by this bee
  for (const key of Object.keys(occupiedPoints)) {
    if (occupiedPoints[key] === beeId) delete occupiedPoints[key];
  }

  // Partition into activity-matched and other points
  const matched = [];
  const other = [];
  for (let i = 0; i < points.length; i++) {
    const key = `${roomId}:${i}`;
    const free = !occupiedPoints[key];
    if (beeActivity && points[i].act === beeActivity) {
      matched.push({ i, pt: points[i], free });
    } else {
      other.push({ i, pt: points[i], free });
    }
  }

  // Queen: pick first free activity-matched point, else first free any point, else index 0
  if (isQueen) {
    const pick = matched.find(p => p.free) || other.find(p => p.free) || matched[0] || { i: 0, pt: points[0] };
    const key = `${roomId}:${pick.i}`;
    occupiedPoints[key] = beeId;
    return pick.pt;
  }

  // Non-queen: prefer free activity-matched, then free any
  const pick = matched.find(p => p.free) || other.find(p => p.free);
  if (pick) {
    const key = `${roomId}:${pick.i}`;
    occupiedPoints[key] = beeId;
    return pick.pt;
  }

  // All taken — return a random offset near a matched or random point
  const base = matched.length > 0 ? matched[0].pt : points[Math.floor(Math.random() * points.length)];
  return { x: base.x + (Math.random() - 0.5) * 20, y: base.y + (Math.random() - 0.5) * 20, type: 'stand', facing: base.facing, act: base.act };
}

/** Find nearest interaction point type within radius. Returns {type, room} or null. */
function findNearestInteractionInfo(x, y, roomId) {
  const points = INTERACTION_POINTS[roomId];
  if (!points) return null;
  let best = null, bestDist = 35; // 35px radius
  for (const pt of points) {
    const d = Math.hypot(pt.x - x, pt.y - y);
    if (d < bestDist) { bestDist = d; best = pt; }
  }
  return best;
}

/** Map interaction point + room context to a bee activity */
function interactionToActivity(point, roomId) {
  if (!point) return 'idle';
  // Use the point's activity tag if available
  if (point.act) return point.act;
  // Fallback for untagged points
  const t = point.type;
  switch (roomId) {
    case 'studio':
      return (t === 'chair' || t === 'stand') ? 'coding' : 'idle';
    case 'library':
      return (t === 'chair' || t === 'stand') ? 'reading' : 'idle';
    case 'coffee':
      return 'drinking-coffee';
    case 'water-cooler':
      return t === 'sofa' ? 'chatting' : 'idle';
    case 'server-room':
      return 'running-command';
    case 'meeting-room':
      return 'presenting';
    default:
      return 'idle';
  }
}

// --- Bee Expressions ---
/** Map activity to expression */
function activityToExpression(activity) {
  switch (activity) {
    case 'coding': case 'reading': case 'searching': case 'browsing': case 'thinking':
      return 'focused';
    case 'running-command':
      return 'surprised'; // anticipation while commands run
    case 'presenting':
      return 'happy';
    case 'celebrating': case 'arriving':
      return 'excited';
    case 'drinking-coffee': case 'chatting':
      return 'sleepy';
    case 'walking':
      return 'neutral';
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

/** Flip bee horizontally to face left or right. Counter-flips label and bubble so text stays readable. */
function flipBee(bee, facingLeft) {
  const gfx = bee.gfx;
  if (!gfx) return;
  const absX = Math.abs(gfx.scale.x) || 1;
  gfx.scale.x = facingLeft ? -absX : absX;
  if (gfx._label) gfx._label.scale.x = facingLeft ? -1 : 1;
  if (gfx._bubble) gfx._bubble.scale.x = facingLeft ? -1 : 1;
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
      g.ellipse(-12*s, -21*s, 4*s, 2*s).fill({ color: 0xfca5a5, alpha: 0.25 });
      g.ellipse(12*s, -21*s, 4*s, 2*s).fill({ color: 0xfca5a5, alpha: 0.25 });
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
      g.ellipse(-12*s, -21*s, 5*s, 3*s).fill({ color: 0xfca5a5, alpha: 0.55 });
      g.ellipse(12*s, -21*s, 5*s, 3*s).fill({ color: 0xfca5a5, alpha: 0.55 });
      break;

    case 'sleepy':
      // Half-closed eyes
      g.ellipse(-7*s, -26*s, 6*s, 3*s).fill(0xffffff);
      g.moveTo(-12*s, -26*s).lineTo(-2*s, -26*s).stroke({ color: 0x1a1a1a, width: 2*s });
      g.ellipse(7*s, -26*s, 6*s, 3*s).fill(0xffffff);
      g.moveTo(2*s, -26*s).lineTo(12*s, -26*s).stroke({ color: 0x1a1a1a, width: 2*s });
      g.arc(0, -18*s, 3*s, 0.2, Math.PI - 0.2).stroke({ color: 0x78716c, width: 1.2*s });
      g.ellipse(-12*s, -21*s, 4.5*s, 2.5*s).fill({ color: 0xfca5a5, alpha: 0.4 });
      g.ellipse(12*s, -21*s, 4.5*s, 2.5*s).fill({ color: 0xfca5a5, alpha: 0.4 });
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
      g.ellipse(-12*s, -21*s, 4.5*s, 2.5*s).fill({ color: 0xfca5a5, alpha: 0.5 });
      g.ellipse(12*s, -21*s, 4.5*s, 2.5*s).fill({ color: 0xfca5a5, alpha: 0.5 });
      break;

    case 'excited':
      // Sparkling upturned eyes, big grin, bouncy
      g.ellipse(-7*s, -27*s, 7*s, 6*s).fill(0xffffff);
      g.ellipse(-7*s+ox, -26*s+oy, 5*s, 4.5*s).fill(0x1a1a1a);
      g.circle(-5*s+ox, -29*s+oy, 2.5*s).fill(0xffffff);
      g.circle(-9*s+ox, -25*s+oy, 1.5*s).fill(0xffffff);
      // Sparkle near left eye (cross shape)
      g.moveTo(-15*s, -36*s).lineTo(-15*s, -30*s).stroke({ color: 0xfbbf24, width: 1.5*s, alpha: 0.7 });
      g.moveTo(-18*s, -33*s).lineTo(-12*s, -33*s).stroke({ color: 0xfbbf24, width: 1.5*s, alpha: 0.7 });
      g.ellipse(7*s, -27*s, 7*s, 6*s).fill(0xffffff);
      g.ellipse(7*s+ox, -26*s+oy, 5*s, 4.5*s).fill(0x1a1a1a);
      g.circle(9*s+ox, -29*s+oy, 2.5*s).fill(0xffffff);
      g.circle(5*s+ox, -25*s+oy, 1.5*s).fill(0xffffff);
      // Sparkle near right eye (cross shape)
      g.moveTo(15*s, -36*s).lineTo(15*s, -30*s).stroke({ color: 0xfbbf24, width: 1.5*s, alpha: 0.7 });
      g.moveTo(12*s, -33*s).lineTo(18*s, -33*s).stroke({ color: 0xfbbf24, width: 1.5*s, alpha: 0.7 });
      // Big open smile
      g.arc(0, -17*s, 6*s, 0.1, Math.PI - 0.1).stroke({ color: 0x78716c, width: 2*s });
      g.arc(0, -17*s, 4*s, 0.3, Math.PI - 0.3).fill({ color: 0xfca5a5, alpha: 0.3 });
      // Deep blush
      g.ellipse(-13*s, -21*s, 5*s, 3*s).fill({ color: 0xfca5a5, alpha: 0.6 });
      g.ellipse(13*s, -21*s, 5*s, 3*s).fill({ color: 0xfca5a5, alpha: 0.6 });
      break;

    case 'confused':
      // Asymmetric eyes (one bigger), squiggly mouth, sweat drop
      g.ellipse(-7*s, -26*s, 6*s, 7*s).fill(0xffffff);
      g.ellipse(-7*s+ox, -26*s+oy, 4*s, 5*s).fill(0x1a1a1a);
      g.circle(-5*s+ox, -28*s+oy, 2*s).fill(0xffffff);
      g.ellipse(7*s, -25*s, 7*s, 5*s).fill(0xffffff); // smaller right eye
      g.ellipse(7*s+ox, -24*s+oy, 4.5*s, 3.5*s).fill(0x1a1a1a);
      g.circle(9*s+ox, -26*s+oy, 1.5*s).fill(0xffffff);
      // Squiggly mouth
      g.moveTo(-5*s, -17*s).quadraticCurveTo(-2*s, -15*s, 0, -18*s)
       .quadraticCurveTo(2*s, -20*s, 5*s, -17*s)
       .stroke({ color: 0x78716c, width: 1.5*s });
      // Sweat drop
      g.ellipse(16*s, -32*s, 2.5*s, 3.5*s).fill({ color: 0x93c5fd, alpha: 0.6 });
      g.ellipse(16*s, -33*s, 1.5*s, 1.5*s).fill({ color: 0xffffff, alpha: 0.4 });
      // Light blush
      g.ellipse(-12*s, -21*s, 4*s, 2*s).fill({ color: 0xfca5a5, alpha: 0.3 });
      g.ellipse(12*s, -21*s, 4*s, 2*s).fill({ color: 0xfca5a5, alpha: 0.3 });
      break;

    case 'blink':
      // Closed eyes for blink animation — flat lines
      g.moveTo(-12*s, -26*s).lineTo(-2*s, -26*s).stroke({ color: 0x1a1a1a, width: 2.5*s, cap: 'round' });
      g.moveTo(2*s, -26*s).lineTo(12*s, -26*s).stroke({ color: 0x1a1a1a, width: 2.5*s, cap: 'round' });
      // Mild smile
      g.arc(0, -18*s, 4*s, 0.15, Math.PI - 0.15).stroke({ color: 0x78716c, width: 1.5*s });
      g.ellipse(-12*s, -21*s, 4.5*s, 2.5*s).fill({ color: 0xfca5a5, alpha: 0.45 });
      g.ellipse(12*s, -21*s, 4.5*s, 2.5*s).fill({ color: 0xfca5a5, alpha: 0.45 });
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
      g.ellipse(-12*s, -21*s, 4.5*s, 2.5*s).fill({ color: 0xfca5a5, alpha: 0.45 });
      g.ellipse(12*s, -21*s, 4.5*s, 2.5*s).fill({ color: 0xfca5a5, alpha: 0.45 });
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
  // Dark floor base
  g.rect(0, 0, CANVAS_W, CANVAS_H).fill(P.floor);

  // Pokemon-style perspective grid — lines converge toward vanishing point above canvas
  const VP_X = CANVAS_W / 2;
  const PERSP = 0.15; // strong perspective convergence

  // Horizontal grid lines — spacing compresses toward top (far away)
  for (let row = 0; row < 40; row++) {
    const t = row / 40;
    // Exponential compression: lines bunch up at the top
    const y = CANVAS_H * (1 - Math.pow(1 - t, 1.4));
    const lineAlpha = 0.15 + t * 0.45; // much brighter near bottom
    const lineWidth = 0.3 + t * 0.6;   // thicker near bottom
    g.moveTo(0, y).lineTo(CANVAS_W, y)
      .stroke({ color: P.floorLine, width: lineWidth, alpha: lineAlpha });
  }

  // Vertical grid lines — converge toward vanishing point
  for (let col = 0; col <= 30; col++) {
    const baseX = col * (CANVAS_W / 30);
    const topX = baseX + (VP_X - baseX) * PERSP;
    // Line gets thinner/fainter toward top
    g.moveTo(topX, 0).lineTo(baseX, CANVAS_H)
      .stroke({ color: P.floorLine, width: 0.5, alpha: 0.3 });
  }

  // Strong depth gradient — top significantly darker, bottom lighter
  const DEPTH_BANDS = 16;
  for (let i = 0; i < DEPTH_BANDS; i++) {
    const t = i / DEPTH_BANDS;
    const bandH = CANVAS_H / DEPTH_BANDS;
    // Top is noticeably darker
    g.rect(0, t * CANVAS_H, CANVAS_W, bandH)
      .fill({ color: 0x000000, alpha: 0.18 * Math.pow(1 - t, 1.5) });
  }

  // Warm-to-cool depth haze — visible color temperature shift
  for (let i = 0; i < 8; i++) {
    const t = i / 8;
    const bandH = CANVAS_H / 8;
    // Warm amber glow at bottom (near)
    g.rect(0, CANVAS_H - (t + 1) * bandH, CANVAS_W, bandH)
      .fill({ color: 0xD4A545, alpha: 0.035 * (1 - t) });
    // Cool blue fog at top (far)
    g.rect(0, t * bandH, CANVAS_W, bandH)
      .fill({ color: 0x4A7A9B, alpha: 0.04 * (1 - t) });
  }

  // Vignette — stronger at top (depth fog), lighter at bottom
  const VIG = 140;
  g.rect(0, 0, CANVAS_W, VIG).fill({ color: 0x0A1520, alpha: 0.15 });
  g.rect(0, CANVAS_H - VIG, CANVAS_W, VIG).fill({ color: 0x000000, alpha: 0.03 });
  g.rect(0, 0, VIG, CANVAS_H).fill({ color: 0x000000, alpha: 0.08 });
  g.rect(CANVAS_W - VIG, 0, VIG, CANVAS_H).fill({ color: 0x000000, alpha: 0.08 });

  layers.floor.addChild(g);
}

// --- Rooms ---
const SHADOW_OFF = 6; // Drop shadow offset

function drawRooms() {
  for (const room of ROOMS) {
    const c = new Container();
    const { x, y, w, h } = room;
    const r = 6; // corner radius

    // Depth factor — 0 at top of map (far), 1 at bottom (near)
    const depthT = Math.max(0, Math.min(1, (y + h / 2) / CANVAS_H));
    const WALL_H = 4 + depthT * 14; // 4px (far) → 18px (near) — very noticeable
    const shadowAlpha = 0.15 + depthT * 0.20;

    // ── Drop shadow (offset down, stronger for closer rooms) ──
    const shadow = new Graphics();
    shadow.roundRect(x + 4, y + WALL_H + 4, w, h, r).fill({ color: 0x000000, alpha: shadowAlpha });
    shadow.roundRect(x + 2, y + WALL_H + 2, w, h, r).fill({ color: 0x000000, alpha: shadowAlpha * 0.4 });
    c.addChild(shadow);

    // ── Pokemon ¾-view walls — lighter than floor so they're visible ──
    const wallGfx = new Graphics();
    // Lighten room color for walls (add white) instead of darkening
    const lighten = (color, amt) => {
      const cr = Math.min(255, ((color >> 16) & 0xFF) + amt);
      const cg = Math.min(255, ((color >> 8) & 0xFF) + amt);
      const cb = Math.min(255, (color & 0xFF) + amt);
      return (cr << 16) | (cg << 8) | cb;
    };
    const wallFront = lighten(room.color, 45);   // Bright front face
    const wallSide = lighten(room.color, 20);     // Medium side face
    const wallTop = lighten(room.color, 60);      // Brightest top edge

    // TOP WALL FACE — the main visible face (north wall, looking down)
    wallGfx.rect(x, y - WALL_H, w, WALL_H).fill(wallFront);
    // Bright highlight at top edge
    wallGfx.rect(x, y - WALL_H, w, 3).fill(wallTop);
    wallGfx.rect(x, y - WALL_H, w, 1.5).fill({ color: 0xffffff, alpha: 0.25 });
    // Dark line where wall meets floor
    wallGfx.rect(x, y - 1, w, 2).fill({ color: 0x000000, alpha: 0.35 });
    // Horizontal panel/brick lines on wall face
    const panelCount = Math.max(1, Math.round(WALL_H / 5));
    for (let i = 1; i < panelCount; i++) {
      const ly = y - WALL_H + (WALL_H / panelCount) * i;
      wallGfx.moveTo(x + 3, ly).lineTo(x + w - 3, ly)
        .stroke({ color: 0x000000, width: 0.7, alpha: 0.1 });
    }
    // Vertical panel divisions on larger walls
    if (w > 120) {
      const vPanels = Math.floor(w / 60);
      for (let i = 1; i < vPanels; i++) {
        const lx = x + (w / vPanels) * i;
        wallGfx.moveTo(lx, y - WALL_H + 2).lineTo(lx, y - 1)
          .stroke({ color: 0x000000, width: 0.5, alpha: 0.08 });
      }
    }

    // LEFT WALL FACE — side face, slightly darker
    const sideW = Math.min(WALL_H * 0.5, 10);
    wallGfx.rect(x - sideW, y - WALL_H, sideW, h + WALL_H).fill(wallSide);
    // Left edge highlight
    wallGfx.rect(x - sideW, y - WALL_H, 1.5, h + WALL_H).fill({ color: 0xffffff, alpha: 0.12 });
    // Inner edge shadow (where side meets front)
    wallGfx.rect(x - 1, y - WALL_H, 2, h + WALL_H).fill({ color: 0x000000, alpha: 0.15 });

    // RIGHT WALL FACE — darker side (shadow side)
    const rightSide = lighten(room.color, 10);
    wallGfx.rect(x + w, y - WALL_H, sideW, h + WALL_H).fill(rightSide);
    wallGfx.rect(x + w, y - WALL_H, 2, h + WALL_H).fill({ color: 0x000000, alpha: 0.12 });
    wallGfx.rect(x + w + sideW - 1.5, y - WALL_H, 1.5, h + WALL_H)
      .fill({ color: 0x000000, alpha: 0.1 });

    // BOTTOM WALL FACE — south wall, visible below floor
    const bottomH = WALL_H * 0.5;
    wallGfx.rect(x - sideW, y + h, w + sideW * 2, bottomH).fill(wallFront);
    wallGfx.rect(x - sideW, y + h, w + sideW * 2, 1.5).fill({ color: 0x000000, alpha: 0.25 });
    // Cast shadow below south wall
    wallGfx.rect(x - sideW + 2, y + h + bottomH, w + sideW * 2 - 4, 4)
      .fill({ color: 0x000000, alpha: 0.2 });

    c.addChild(wallGfx);

    // ── Floor fill — depth-aware brightness (near rooms brighter) ──
    const bg = new Graphics();
    bg.roundRect(x, y, w, h, r).fill({ color: room.color, alpha: 0.85 });
    // Interior warmth — near rooms noticeably brighter
    const warmth = 0.03 + depthT * 0.10;
    bg.roundRect(x + 4, y + 4, w - 8, h - 8, r).fill({ color: 0xffffff, alpha: warmth });
    // Far rooms get a blue-ish tint (depth fog)
    if (depthT < 0.4) {
      bg.roundRect(x + 2, y + 2, w - 4, h - 4, r)
        .fill({ color: 0x4A7A9B, alpha: 0.06 * (1 - depthT / 0.4) });
    }
    // Top-left highlight (simulated overhead light)
    bg.roundRect(x + 2, y + 2, w * 0.55, h * 0.45, r).fill({ color: 0xffffff, alpha: 0.08 });
    // Bottom-right darkening
    bg.roundRect(x + w * 0.35, y + h * 0.45, w * 0.63, h * 0.53, r).fill({ color: 0x000000, alpha: 0.10 });
    c.addChild(bg);

    // ── Per-room floor pattern ──
    const fp = new Graphics();
    const pad = 6; // inset from walls
    if (room.id === 'library') {
      // Herringbone parquet
      for (let row = 0; row < Math.ceil(h / 16); row++) {
        for (let col = 0; col < Math.ceil(w / 12); col++) {
          const px = x + pad + col * 12;
          const py = y + pad + row * 16;
          if (px + 10 > x + w - pad || py + 10 > y + h - pad) continue;
          const even = (row + col) % 2 === 0;
          fp.rect(px, py, even ? 10 : 5, even ? 5 : 10)
            .fill({ color: even ? 0x5A4D3A : 0x4A3F30, alpha: 0.12 });
        }
      }
    } else if (room.id === 'studio') {
      // Concrete grid tiles
      const ts = 40;
      for (let ty = y + pad; ty < y + h - pad; ty += ts) {
        for (let tx = x + pad; tx < x + w - pad; tx += ts) {
          const tw = Math.min(ts - 2, x + w - pad - tx);
          const th = Math.min(ts - 2, y + h - pad - ty);
          if (tw > 4 && th > 4) {
            fp.roundRect(tx, ty, tw, th, 1)
              .stroke({ color: 0xffffff, width: 0.5, alpha: 0.04 });
          }
        }
      }
    } else if (room.id === 'coffee') {
      // Black & white checker
      const cs = 20;
      for (let ty = y + pad; ty < y + h - pad; ty += cs) {
        for (let tx = x + pad; tx < x + w - pad; tx += cs) {
          const dark = ((Math.floor((tx - x) / cs) + Math.floor((ty - y) / cs)) % 2 === 0);
          const cw = Math.min(cs, x + w - pad - tx);
          const ch = Math.min(cs, y + h - pad - ty);
          if (cw > 2 && ch > 2) {
            fp.rect(tx, ty, cw, ch).fill({ color: dark ? 0x000000 : 0xffffff, alpha: dark ? 0.08 : 0.04 });
          }
        }
      }
    } else if (room.id === 'meeting-room') {
      // Carpet lines
      for (let ty = y + pad; ty < y + h - pad; ty += 8) {
        fp.moveTo(x + pad, ty).lineTo(x + w - pad, ty)
          .stroke({ color: room.accent, width: 0.5, alpha: 0.06 });
      }
    } else if (room.id === 'water-cooler') {
      // Diagonal wood planks
      for (let i = -h; i < w + h; i += 14) {
        fp.moveTo(x + Math.max(pad, i), y + pad + Math.max(0, -i))
          .lineTo(x + Math.min(w - pad, i + h), y + h - pad)
          .stroke({ color: 0xffffff, width: 0.6, alpha: 0.04 });
      }
    } else if (room.id === 'server-room') {
      // Raised floor grid with vent dots
      const ts = 24;
      for (let ty = y + pad; ty < y + h - pad; ty += ts) {
        for (let tx = x + pad; tx < x + w - pad; tx += ts) {
          const tw = Math.min(ts - 2, x + w - pad - tx);
          const th = Math.min(ts - 2, y + h - pad - ty);
          if (tw > 4 && th > 4) {
            fp.roundRect(tx, ty, tw, th, 1)
              .stroke({ color: room.accent, width: 0.5, alpha: 0.08 });
            fp.circle(tx + tw / 2, ty + th / 2, 1.5)
              .fill({ color: room.accent, alpha: 0.06 });
          }
        }
      }
    } else if (room.id === 'lobby') {
      // Marble veining
      for (let i = 0; i < 5; i++) {
        const sx = x + pad + (i * 41 % (w - 2 * pad));
        fp.moveTo(sx, y + pad)
          .quadraticCurveTo(sx + 30, y + h / 2, sx + 10, y + h - pad)
          .stroke({ color: 0xffffff, width: 0.5, alpha: 0.03 });
      }
    }
    c.addChild(fp);

    // ── Ambient occlusion — inner shadow along walls ──
    const ao = new Graphics();
    ao.rect(x + r, y, w - 2 * r, 8).fill({ color: 0x000000, alpha: 0.18 });
    ao.rect(x, y + r, 6, h - 2 * r).fill({ color: 0x000000, alpha: 0.14 });
    ao.rect(x + r, y + h - 10, w - 2 * r, 10).fill({ color: 0x000000, alpha: 0.22 });
    ao.rect(x + w - 7, y + r, 7, h - 2 * r).fill({ color: 0x000000, alpha: 0.18 });
    c.addChild(ao);

    // ── Glass partition walls with door gaps ──
    const walls = new Graphics();
    const roomDoors = DOORS_BY_ROOM[room.id] || [];

    // Collect door gaps per edge
    const gapsByEdge = { top: [], bottom: [], left: [], right: [] };
    for (const d of roomDoors) {
      gapsByEdge[d.edge].push(d);
    }

    // Main wall stroke — visible glass partitions
    const wallStyle = { color: P.glassBrd, width: 3, alpha: 0.8 };

    // Top wall
    drawWallWithGaps(walls, x + r, y, x + w - r, y, gapsByEdge.top, w - 2 * r, wallStyle);
    // Bottom wall
    drawWallWithGaps(walls, x + r, y + h, x + w - r, y + h, gapsByEdge.bottom, w - 2 * r, wallStyle);
    // Left wall
    drawWallWithGaps(walls, x, y + r, x, y + h - r, gapsByEdge.left, h - 2 * r, wallStyle, true);
    // Right wall
    drawWallWithGaps(walls, x + w, y + r, x + w, y + h - r, gapsByEdge.right, h - 2 * r, wallStyle, true);

    // Glass reflection highlight (thin bright line inside wall)
    const reflStyle = { color: 0xffffff, width: 1, alpha: 0.15 };
    drawWallWithGaps(walls, x + r, y + 1, x + w - r, y + 1, gapsByEdge.top, w - 2 * r, reflStyle);
    drawWallWithGaps(walls, x + 1, y + r, x + 1, y + h - r, gapsByEdge.left, h - 2 * r, reflStyle, true);

    // Corners
    walls.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5).stroke(wallStyle);
    walls.arc(x + w - r, y + r, r, Math.PI * 1.5, 0).stroke(wallStyle);
    walls.arc(x + r, y + h - r, r, Math.PI * 0.5, Math.PI).stroke(wallStyle);
    walls.arc(x + w - r, y + h - r, r, 0, Math.PI * 0.5).stroke(wallStyle);
    c.addChild(walls);

    // ── Door indicators (subtle amber glow at openings) ──
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
      doorGfx.circle(cx, cy, halfGap * 0.7).fill({ color: P.honey, alpha: 0.12 });
      if (d.edge === 'top' || d.edge === 'bottom') {
        doorGfx.rect(cx - halfGap, cy - 1.5, 3, 3).fill({ color: P.honey, alpha: 0.45 });
        doorGfx.rect(cx + halfGap - 3, cy - 1.5, 3, 3).fill({ color: P.honey, alpha: 0.45 });
      } else {
        doorGfx.rect(cx - 1.5, cy - halfGap, 3, 3).fill({ color: P.honey, alpha: 0.45 });
        doorGfx.rect(cx - 1.5, cy + halfGap - 3, 3, 3).fill({ color: P.honey, alpha: 0.45 });
      }
    }
    c.addChild(doorGfx);

    // ── Accent strip (on top of wall — colored cap) ──
    const strip = new Graphics();
    strip.roundRect(x - 1, y - WALL_H - 3, w + 2, 5, 2).fill(room.accent);
    strip.roundRect(x - 1, y - WALL_H - 3, w + 2, 2, 1).fill({ color: 0xffffff, alpha: 0.3 });
    // Accent glow on floor edge
    strip.roundRect(x + 2, y + 1, w - 4, 4, 2).fill({ color: room.accent, alpha: 0.08 });
    c.addChild(strip);

    // ── Room name label (depth-scaled font) ──
    const labelSize = 8 + depthT * 6; // 8px (far) → 14px (near)
    const roomLabel = new Text({
      text: room.label.toUpperCase(),
      style: new TextStyle({
        fontFamily: 'Inter, sans-serif',
        fontSize: labelSize,
        fontWeight: '700',
        fill: room.accent,
        letterSpacing: 1 + depthT * 2,
      }),
    });
    roomLabel.anchor.set(0.5, 0);
    roomLabel.x = x + w / 2;
    roomLabel.y = y + h - labelSize - 8;
    roomLabel.alpha = 0.3 + depthT * 0.25;
    c.addChild(roomLabel);

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
/** Draw a soft drop shadow under a rectangle */
function drawShadow(g, x, y, w, h, r = 4, alpha = 0.25) {
  // Depth-aware shadow — much longer for closer objects
  const depthT = Math.max(0, Math.min(1, y / CANVAS_H));
  const off = 3 + depthT * 8; // 3px (top) → 11px (bottom)
  const a = alpha * (0.6 + depthT * 0.4); // stronger near bottom
  g.roundRect(x + off, y + off, w, h, r).fill({ color: 0x000000, alpha: a * 0.25 });
  g.roundRect(x + off * 0.6, y + off * 0.6, w, h, r).fill({ color: 0x000000, alpha: a * 0.55 });
  g.roundRect(x + off * 0.3, y + off * 0.3, w, h, r).fill({ color: 0x000000, alpha: a * 0.35 });
}

function drawFurniture() {
  const g = new Graphics();
  // All rooms always drawn (no progressive unlock)

  // ═══════════════════════════════════════════════════════════════════════════
  // LIBRARY (250,40,280,340) — bookshelves, reading desks, armchair, lamps
  // ═══════════════════════════════════════════════════════════════════════════
  { // library

  // Bookshelves along left wall (inside library)
  const bookColors = [0xef4444, 0x3b82f6, 0x22c55e, 0xf59e0b, 0x8b5cf6, 0xec4899, 0x06b6d4, 0xf97316];
  for (let i = 0; i < 2; i++) {
    const bx = 260 + i * 110;
    drawShadow(g, bx, 55, 90, 120, 4, 0.3);
    // 3D side panel
    g.moveTo(bx + 90, 55).lineTo(bx + 96, 51).lineTo(bx + 96, 174).lineTo(bx + 90, 178).closePath();
    g.fill({ color: P.woodDark, alpha: 0.7 });
    // 3D top face
    g.moveTo(bx, 55).lineTo(bx + 6, 51).lineTo(bx + 96, 51).lineTo(bx + 90, 55).closePath();
    g.fill({ color: P.wood, alpha: 0.5 });
    g.roundRect(bx, 55, 90, 120, 4).fill(P.woodDark);
    g.roundRect(bx, 55, 90, 120, 4).stroke({ width: 2, color: P.wood });
    g.rect(bx + 4, 59, 82, 112).fill({ color: 0x3A352E, alpha: 0.6 });
    for (let shelf = 0; shelf < 3; shelf++) {
      g.rect(bx + 2, 59 + shelf * 38 + 34, 86, 3).fill(P.woodDark);
      g.rect(bx + 4, 59 + shelf * 38 + 37, 80, 2).fill({ color: 0x000000, alpha: 0.08 });
      for (let b = 0; b < 6; b++) {
        const bh = 22 + ((b * 7 + shelf * 3 + i * 5) % 8);
        g.roundRect(bx + 8 + b * 14, 59 + shelf * 38 + (34 - bh), 10, bh, 1)
          .fill(bookColors[(b + shelf + i) % bookColors.length]);
      }
    }
  }

  // Reading desks with desk lamps
  for (let row = 0; row < 2; row++) {
    const dx = 280;
    const dy = 200 + row * 100;
    drawShadow(g, dx, dy, 120, 50, 4, 0.25);
    g.roundRect(dx, dy, 120, 50, 4).fill(P.wood);
    g.roundRect(dx, dy, 120, 50, 4).stroke({ width: 1.5, color: P.woodDark });
    g.roundRect(dx, dy, 120, 3, 2).fill({ color: 0xffffff, alpha: 0.12 });
    // Desk lamp
    g.rect(dx + 95, dy + 5, 3, 20).fill(P.wallDark);
    g.ellipse(dx + 96, dy + 3, 12, 6).fill({ color: 0xD4A545, alpha: 0.9 });
    g.ellipse(dx + 96, dy + 20, 20, 10).fill({ color: 0xD4A545, alpha: 0.06 }); // lamp glow
    // Open book
    g.roundRect(dx + 30, dy + 15, 40, 25, 2).fill({ color: 0xE8DED0, alpha: 0.8 });
    g.roundRect(dx + 30, dy + 15, 40, 25, 2).stroke({ width: 0.5, color: P.wallDark });
    g.rect(dx + 49, dy + 15, 1, 25).fill({ color: P.wallDark, alpha: 0.4 }); // spine
    // Chair
    g.ellipse(dx + 60, dy + 72, 16, 7).fill({ color: 0x000000, alpha: 0.18 });
    g.circle(dx + 60, dy + 70, 13).fill(P.leather);
    g.circle(dx + 60, dy + 70, 13).stroke({ width: 1, color: 0x5A3D22 });
    g.circle(dx + 60, dy + 68, 11).fill({ color: 0xffffff, alpha: 0.04 });
  }

  // Cozy armchair in corner
  g.ellipse(490, 332, 30, 8).fill({ color: 0x000000, alpha: 0.18 });
  g.roundRect(462, 286, 56, 44, 12).fill(P.cushion);
  g.roundRect(462, 286, 56, 44, 12).stroke({ width: 1.5, color: 0x2D4A35 });
  g.roundRect(462, 286, 56, 4, 6).fill({ color: 0xffffff, alpha: 0.08 });
  g.roundRect(466, 290, 48, 36, 8).fill({ color: 0x4A7A52, alpha: 0.85 });
  // Side table
  drawShadow(g, 486, 246, 28, 28, 14, 0.15);
  g.circle(500, 260, 14).fill(P.wood);
  g.circle(500, 260, 14).stroke({ width: 1.5, color: P.woodDark });
  g.rect(498, 246, 4, 10).fill(P.wallDark);
  g.ellipse(500, 242, 9, 5).fill({ color: 0xD4A545, alpha: 0.7 }); // lamp shade
  g.ellipse(500, 260, 16, 8).fill({ color: 0xD4A545, alpha: 0.03 }); // glow

  // Ceiling warm lights in library
  for (let i = 0; i < 2; i++) {
    const lx = 340 + i * 100;
    g.ellipse(lx, 180, 40, 20).fill({ color: 0xD4A545, alpha: 0.015 });
    g.roundRect(lx - 16, 170, 32, 4, 2).fill({ color: 0xD4A545, alpha: 0.04 });
  }

  } // end library

  // ═══════════════════════════════════════════════════════════════════════════
  // STUDIO (550,40,300,340) — workstation desks with monitors, standing desk
  // ═══════════════════════════════════════════════════════════════════════════
  { // studio

  // Ceiling track lights (brighter than library)
  for (let col = 0; col < 2; col++) {
    const lx = 660 + col * 120;
    g.ellipse(lx, 150, 45, 22).fill({ color: 0xffffff, alpha: 0.018 });
    g.roundRect(lx - 18, 140, 36, 4, 2).fill({ color: 0xffffff, alpha: 0.04 });
  }

  // Workstation desks: 2 rows of 2
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      const dx = 580 + col * 120;
      const dy = 70 + row * 130;
      drawDesk(g, dx, dy);
    }
  }

  // Standing desk at end
  const sdx = 790, sdy = 100;
  drawShadow(g, sdx, sdy, 55, 45, 4, 0.3);
  g.roundRect(sdx, sdy, 55, 45, 4).fill(P.wood);
  g.roundRect(sdx, sdy, 55, 45, 4).stroke({ width: 1.5, color: P.woodDark });
  g.roundRect(sdx, sdy, 55, 3, 2).fill({ color: 0xffffff, alpha: 0.1 });
  g.roundRect(sdx + 6, sdy + 6, 43, 26, 2).fill(P.monitor);
  g.roundRect(sdx + 8, sdy + 8, 39, 22, 1).fill({ color: P.led, alpha: 0.15 }); // code on screen
  // Code lines on monitor
  for (let i = 0; i < 4; i++) {
    const lw = 12 + ((i * 7) % 18);
    g.rect(sdx + 10, sdy + 11 + i * 5, lw, 2).fill({ color: P.led, alpha: 0.3 });
  }
  g.roundRect(sdx + 6, sdy + 34, 43, 7, 2).fill(P.wood);

  // Whiteboard on studio right wall
  drawShadow(g, 842, 80, 8, 80, 2, 0.15);
  g.roundRect(842, 80, 8, 80, 2).fill(P.white);
  g.roundRect(842, 80, 8, 80, 2).stroke({ color: P.wallDark, width: 1.5 });

  } // end studio

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFERENCE ROOM
  // ═══════════════════════════════════════════════════════════════════════════
  { // meeting-room
  drawShadow(g, 70, 530, 140, 60, 6, 0.3);
  g.roundRect(70, 530, 140, 60, 6).fill(P.wood);
  g.roundRect(70, 530, 140, 60, 6).stroke({ width: 1.5, color: P.woodDark });
  g.roundRect(70, 530, 140, 3, 3).fill({ color: 0xffffff, alpha: 0.1 });
  g.roundRect(72, 532, 136, 56, 5).fill({ color: P.woodDark, alpha: 0.2 });
  g.rect(74, 590, 132, 4).fill({ color: 0x000000, alpha: 0.2 });
  for (let i = 0; i < 5; i++) {
    g.ellipse(80 + i * 30, 526, 8, 3).fill({ color: 0x000000, alpha: 0.1 });
    g.ellipse(80 + i * 30, 600, 8, 3).fill({ color: 0x000000, alpha: 0.1 });
    g.circle(80 + i * 30, 524, 7).fill(P.wallDark);
    g.circle(80 + i * 30, 598, 7).fill(P.wallDark);
  }
  // Whiteboard
  drawShadow(g, 46, 480, 8, 60, 2, 0.15);
  g.roundRect(46, 480, 8, 60, 2).fill(P.white);
  g.roundRect(46, 480, 8, 60, 2).stroke({ color: P.wallDark, width: 1.5 });
  // Projector screen area
  g.roundRect(60, 650, 160, 6, 2).fill({ color: P.white, alpha: 0.3 });
  g.roundRect(135, 640, 10, 10, 2).fill(P.wallDark); // projector mount

  } // end conference

  // ═══════════════════════════════════════════════════════════════════════════
  // KITCHEN — espresso bar + fruit water dispensers + bar stools
  // ═══════════════════════════════════════════════════════════════════════════
  { // kitchen

  // Countertop (long L-shape)
  drawShadow(g, 350, 500, 180, 50, 4, 0.3);
  g.roundRect(350, 500, 180, 30, 4).fill(0xF0E6D6);
  g.roundRect(350, 500, 180, 30, 4).stroke({ width: 1.5, color: P.woodDark });
  g.roundRect(350, 500, 180, 3, 2).fill({ color: 0xffffff, alpha: 0.12 });
  g.roundRect(350, 530, 180, 20, 4).fill(0x555555);
  g.roundRect(350, 530, 180, 20, 4).stroke({ width: 1, color: 0x444444 });

  // Espresso machine (commercial style)
  drawShadow(g, 360, 480, 50, 40, 6, 0.25);
  g.roundRect(360, 480, 50, 40, 6).fill(0x555555);
  g.roundRect(360, 480, 50, 40, 6).stroke({ width: 1.5, color: 0x333333 });
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

  } // end kitchen

  // ═══════════════════════════════════════════════════════════════════════════
  // LOUNGE
  // ═══════════════════════════════════════════════════════════════════════════
  { // lounge
  drawShadow(g, 660, 530, 200, 100, 4, 0.25);
  // L-shaped sofa with cushion depth
  g.roundRect(660, 530, 200, 20, 4).fill(P.cushion);
  g.roundRect(660, 530, 200, 20, 4).stroke({ width: 1, color: 0x2D4A35 });
  g.roundRect(660, 530, 200, 4, 2).fill({ color: 0xffffff, alpha: 0.08 }); // backrest highlight
  g.roundRect(660, 530, 20, 100, 4).fill(P.cushion);
  g.roundRect(660, 530, 20, 100, 4).stroke({ width: 1, color: 0x2D4A35 });
  g.roundRect(660, 530, 4, 100, 2).fill({ color: 0xffffff, alpha: 0.08 }); // side highlight
  // Coffee table with shadow
  drawShadow(g, 700, 570, 60, 35, 4, 0.25);
  g.roundRect(700, 570, 60, 35, 4).fill(P.wood);
  g.roundRect(700, 570, 60, 35, 4).stroke({ width: 1.5, color: P.woodDark });
  g.roundRect(700, 570, 60, 3, 2).fill({ color: 0xffffff, alpha: 0.1 }); // table highlight
  drawPlant(g, 840, 510);
  // Magazines with subtle shadows
  g.roundRect(710, 576, 15, 10, 1).fill(0xFCA5A5);
  g.roundRect(728, 578, 15, 8, 1).fill(0x93C5FD);

  } // end lounge

  // ═══════════════════════════════════════════════════════════════════════════
  // SERVER ROOM
  // ═══════════════════════════════════════════════════════════════════════════
  { // server-room
  for (let i = 0; i < 2; i++) {
    const sx = 1015 + i * 45;
    drawShadow(g, sx, 490, 30, 120, 3, 0.3);
    // 3D side panel (right face of rack)
    g.moveTo(sx + 30, 490).lineTo(sx + 36, 486).lineTo(sx + 36, 606).lineTo(sx + 30, 610).closePath();
    g.fill({ color: 0x1f2937, alpha: 0.8 });
    // Top face
    g.moveTo(sx, 490).lineTo(sx + 6, 486).lineTo(sx + 36, 486).lineTo(sx + 30, 490).closePath();
    g.fill({ color: 0x4b5563, alpha: 0.6 });
    g.roundRect(sx, 490, 30, 120, 3).fill(0x4B5563);
    g.roundRect(sx, 490, 30, 120, 3).stroke({ width: 1.5, color: 0x374151 });
    // Rack front highlight
    g.roundRect(sx, 490, 30, 2, 1).fill({ color: 0xffffff, alpha: 0.08 });
    for (let j = 0; j < 6; j++) {
      // LED glow halos
      g.circle(sx + 8, 500 + j * 18, 4).fill({ color: P.led, alpha: 0.08 });
      g.circle(sx + 8, 500 + j * 18, 2).fill(P.led);
      g.circle(sx + 22, 500 + j * 18, 4).fill({ color: j % 3 === 0 ? P.ledRed : P.led, alpha: 0.08 });
      g.circle(sx + 22, 500 + j * 18, 2).fill(j % 3 === 0 ? P.ledRed : P.led);
    }
  }

  } // end server room

  // ═══════════════════════════════════════════════════════════════════════════
  // WEB BOOTH + FOCUS BOOTH + LOBBY
  // ═══════════════════════════════════════════════════════════════════════════

  // Web Booth — larger monitor with browser glow
  { // web-booth
  drawShadow(g, 52, 58, 50, 30, 3, 0.25);
  g.roundRect(52, 58, 50, 30, 3).fill(P.wood);
  g.roundRect(52, 58, 50, 30, 3).stroke({ width: 1.5, color: P.woodDark });
  g.roundRect(52, 58, 50, 2, 1).fill({ color: 0xffffff, alpha: 0.1 });
  g.roundRect(58, 62, 38, 20, 2).fill(P.monitor);
  g.roundRect(60, 64, 34, 16, 1).fill({ color: 0x7B68EE, alpha: 0.12 }); // indigo browser glow
  // URL bar
  g.roundRect(62, 66, 30, 3, 1).fill({ color: 0xffffff, alpha: 0.1 });
  // Web booth chair
  g.ellipse(77, 104, 14, 6).fill({ color: 0x000000, alpha: 0.15 });
  g.circle(77, 102, 11).fill(P.wallDark);
  g.circle(77, 102, 11).stroke({ width: 1, color: 0x444444 });
  g.circle(77, 100, 9).fill({ color: 0xffffff, alpha: 0.04 });
  // Globe decoration
  g.circle(100, 110, 8).stroke({ width: 1.5, color: 0x7B68EE, alpha: 0.3 });
  g.ellipse(100, 110, 8, 4).stroke({ width: 1, color: 0x7B68EE, alpha: 0.2 });
  g.rect(100, 102, 0.5, 16).fill({ color: 0x7B68EE, alpha: 0.2 });

  } // end web-booth

  // Focus Booth
  { // focus-booth
  drawPhoneBooth(g, 1075, 65);
  } // end focus booth

  // Lobby reception desk
  drawShadow(g, 80, 415, 120, 20, 4, 0.25);
  g.roundRect(80, 415, 120, 20, 4).fill(P.wood);
  g.roundRect(80, 415, 120, 20, 4).stroke({ width: 1.5, color: P.woodDark });
  g.roundRect(80, 415, 120, 2, 1).fill({ color: 0xffffff, alpha: 0.1 });
  g.roundRect(82, 417, 30, 16, 3).fill(P.monitor);

  // ═══════════════════════════════════════════════════════════════════════════
  // SCATTERED PLANTS
  // ═══════════════════════════════════════════════════════════════════════════
  drawPlant(g, 246, 365);  // left corridor
  drawPlant(g, 540, 365);  // between library and studio
  drawPlant(g, 855, 365);  // right corridor
  drawPlant(g, 330, 460);  // near hallway
  drawPlant(g, 895, 460);  // near hallway right
  drawPlant(g, 1150, 280); // right corridor

  layers.furniture.addChild(g);
}

function drawDesk(g, x, y) {
  // Drop shadow
  drawShadow(g, x, y, 130, 55, 4, 0.3);
  // Desk surface with bevel and outline
  g.roundRect(x, y, 130, 55, 4).fill(P.wood);
  g.roundRect(x, y, 130, 55, 4).stroke({ width: 1.5, color: P.woodDark });
  g.roundRect(x, y, 130, 3, 2).fill({ color: 0xffffff, alpha: 0.12 }); // top edge highlight
  g.roundRect(x + 2, y + 2, 126, 51, 3).fill({ color: P.woodDark, alpha: 0.12 });
  // Monitor with ambient glow
  g.roundRect(x + 33, y + 3, 64, 39, 4).fill({ color: P.monGlow, alpha: 0.08 }); // glow halo
  g.roundRect(x + 35, y + 5, 60, 35, 3).fill(P.monitor);
  g.roundRect(x + 35, y + 5, 60, 35, 3).stroke({ width: 1, color: 0x333333 });
  g.roundRect(x + 38, y + 8, 54, 26, 2).fill({ color: P.monGlow, alpha: 0.2 });
  // Screen bezel highlight
  g.roundRect(x + 35, y + 5, 60, 2, 1).fill({ color: 0xffffff, alpha: 0.12 });
  // Monitor stand
  g.roundRect(x + 60, y + 40, 10, 8, 1).fill(P.wallDark);
  // Keyboard
  g.roundRect(x + 30, y + 42, 50, 8, 2).fill(0xD1D5DB);
  g.roundRect(x + 30, y + 42, 50, 8, 2).stroke({ width: 0.5, color: 0x999999 });
  g.roundRect(x + 30, y + 42, 50, 2, 1).fill({ color: 0xffffff, alpha: 0.15 }); // key highlight
  // Chair with shadow
  g.ellipse(x + 65, y + 72, 16, 7).fill({ color: 0x000000, alpha: 0.2 }); // chair shadow
  g.circle(x + 65, y + 70, 13).fill(P.wallDark);
  g.circle(x + 65, y + 70, 13).stroke({ width: 1, color: 0x444444 });
  g.circle(x + 65, y + 68, 11).fill({ color: 0xffffff, alpha: 0.04 }); // subtle seat highlight
}

function drawPhoneBooth(g, x, y) {
  drawShadow(g, x, y, 45, 25, 3, 0.25);
  g.roundRect(x, y, 45, 25, 3).fill(P.wood);
  g.roundRect(x, y, 45, 25, 3).stroke({ width: 1.5, color: P.woodDark });
  g.roundRect(x, y, 45, 2, 1).fill({ color: 0xffffff, alpha: 0.1 });
  g.roundRect(x + 10, y + 3, 25, 15, 2).fill(P.monitor);
  g.roundRect(x + 10, y + 3, 25, 15, 2).stroke({ width: 1, color: 0x333333 });
  g.roundRect(x + 11, y + 4, 23, 12, 1).fill({ color: P.monGlow, alpha: 0.15 });
  // Chair below desk
  g.ellipse(x + 22, y + 42, 14, 6).fill({ color: 0x000000, alpha: 0.15 });
  g.circle(x + 22, y + 40, 11).fill(P.wallDark);
  g.circle(x + 22, y + 40, 11).stroke({ width: 1, color: 0x444444 });
}

function drawPlant(g, x, y, size = 1, potColor) {
  const s = size;
  // Shadow
  g.ellipse(x, y + 15 * s, 10 * s, 4 * s).fill({ color: 0x000000, alpha: 0.15 });
  // Pot (tapered trapezoid)
  g.moveTo(x - 8 * s, y);
  g.lineTo(x - 6 * s, y + 14 * s);
  g.lineTo(x + 6 * s, y + 14 * s);
  g.lineTo(x + 8 * s, y);
  g.closePath();
  g.fill(potColor || P.planter);
  // Pot highlight (left edge light)
  g.moveTo(x - 8 * s, y);
  g.lineTo(x - 6 * s, y + 14 * s);
  g.lineTo(x - 4 * s, y + 14 * s);
  g.lineTo(x - 6 * s, y);
  g.closePath();
  g.fill({ color: 0xffffff, alpha: 0.06 });
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

  // Shaft shadow
  shaft.roundRect(sx + 5, sy + 5, sw, sh, 4).fill({ color: 0x000000, alpha: 0.2 });
  // Shaft background
  shaft.roundRect(sx, sy, sw, sh, 4).fill({ color: P.wall, alpha: 0.35 });
  shaft.roundRect(sx, sy, sw, sh, 4).stroke({ color: P.wallDark, width: 2 });
  // 3D right edge
  shaft.moveTo(sx + sw, sy + 4).lineTo(sx + sw + 4, sy).lineTo(sx + sw + 4, sy + sh - 4).lineTo(sx + sw, sy + sh).closePath();
  shaft.fill({ color: 0x0a0a18, alpha: 0.3 });

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

// --- Bee Graphics ---
function createBeeGraphics(bee) {
  const c = new Container();
  const scale = bee.role === 'queen' ? 1.0 : bee.role === 'recruiter' ? 0.85 : bee.role === 'hired' ? 0.72 : 0.65;
  const s = scale;
  const beeColor = hexToNum(bee.color) || 0xF59E0B;
  const stripeColor = darkenColor(beeColor, 0.3);
  const outlineColor = darkenColor(beeColor, 0.35);
  const outlineW = 1.4;

  // Ground shadow
  const shadow = new Graphics();
  shadow.ellipse(0, 0, 18 * s, 5 * s).fill({ color: 0x000000, alpha: 0.12 });
  shadow.y = 36 * s;
  c.addChild(shadow);
  c._shadow = shadow;

  // Legs — jointed insect-style, separate Graphics for walk animation
  const legL = new Graphics();
  legL.moveTo(0, 0).lineTo(-3*s, 7*s).stroke({ color: 0x5C4A32, width: 2*s, cap: 'round' });
  legL.moveTo(-3*s, 7*s).lineTo(-5*s, 16*s).stroke({ color: 0x5C4A32, width: 1.8*s, cap: 'round' });
  legL.circle(-5*s, 16*s, 1.8*s).fill(0x5C4A32);
  legL.x = -6 * s;
  legL.y = 16 * s;
  c.addChild(legL);
  c._legL = legL;

  const legR = new Graphics();
  legR.moveTo(0, 0).lineTo(3*s, 7*s).stroke({ color: 0x5C4A32, width: 2*s, cap: 'round' });
  legR.moveTo(3*s, 7*s).lineTo(5*s, 16*s).stroke({ color: 0x5C4A32, width: 1.8*s, cap: 'round' });
  legR.circle(5*s, 16*s, 1.8*s).fill(0x5C4A32);
  legR.x = 6 * s;
  legR.y = 16 * s;
  c.addChild(legR);
  c._legR = legR;

  // Wings — translucent with vein details
  const wingL = new Graphics();
  wingL.ellipse(-10*s, -4*s, 22*s, 12*s).fill({ color: 0xdbeafe, alpha: 0.35 });
  wingL.ellipse(-10*s, -4*s, 22*s, 12*s).stroke({ width: 1.2, color: 0x93c5fd, alpha: 0.6 });
  wingL.moveTo(-2*s, -4*s).lineTo(-20*s, -8*s).stroke({ color: 0x93c5fd, width: 0.8, alpha: 0.25 });
  wingL.moveTo(-2*s, -2*s).lineTo(-18*s, 2*s).stroke({ color: 0x93c5fd, width: 0.8, alpha: 0.25 });
  wingL.ellipse(-8*s, -6*s, 10*s, 7*s).fill({ color: 0xffffff, alpha: 0.12 });
  wingL.x = -4 * s;
  wingL.y = -8 * s;
  c.addChild(wingL);
  c._wingL = wingL;

  const wingR = new Graphics();
  wingR.ellipse(10*s, -4*s, 22*s, 12*s).fill({ color: 0xdbeafe, alpha: 0.35 });
  wingR.ellipse(10*s, -4*s, 22*s, 12*s).stroke({ width: 1.2, color: 0x93c5fd, alpha: 0.6 });
  wingR.moveTo(2*s, -4*s).lineTo(20*s, -8*s).stroke({ color: 0x93c5fd, width: 0.8, alpha: 0.25 });
  wingR.moveTo(2*s, -2*s).lineTo(18*s, 2*s).stroke({ color: 0x93c5fd, width: 0.8, alpha: 0.25 });
  wingR.ellipse(8*s, -6*s, 10*s, 7*s).fill({ color: 0xffffff, alpha: 0.12 });
  wingR.x = 4 * s;
  wingR.y = -8 * s;
  c.addChild(wingR);
  c._wingR = wingR;

  // Body container (for walk bounce separate from position)
  const bodyC = new Container();
  const body = new Graphics();

  // Abdomen — elongated oval (NOT a circle like a berry)
  body.ellipse(0, 6*s, 16*s, 18*s).fill(beeColor);
  body.ellipse(0, 6*s, 16*s, 18*s).stroke({ width: outlineW, color: outlineColor });
  // Curved stripes that follow body contour
  body.ellipse(0, -2*s, 15*s, 3*s).fill(stripeColor);
  body.ellipse(0, 7*s, 16*s, 3*s).fill(stripeColor);
  body.ellipse(0, 16*s, 13*s, 2.5*s).fill(stripeColor);
  // Body sheen (light reflection)
  body.ellipse(-5*s, 0, 8*s, 12*s).fill({ color: 0xffffff, alpha: 0.10 });
  // Stinger
  body.moveTo(-2*s, 23*s).lineTo(0, 30*s).lineTo(2*s, 23*s).closePath().fill(0x5C4A32);
  body.moveTo(-2*s, 23*s).lineTo(0, 30*s).lineTo(2*s, 23*s).closePath().stroke({ width: 0.8, color: 0x3A3020 });

  // Thorax — small fuzzy segment connecting head to abdomen
  body.ellipse(0, -10*s, 11*s, 7*s).fill(darkenColor(beeColor, 0.85));
  body.ellipse(0, -10*s, 11*s, 7*s).stroke({ width: outlineW, color: outlineColor });
  body.ellipse(0, -10*s, 9*s, 5*s).fill({ color: beeColor, alpha: 0.6 });

  // Head — proportional, clearly separated from body
  body.circle(0, -24*s, 14*s).fill(0xfef9c3);
  body.circle(0, -24*s, 14*s).stroke({ width: outlineW, color: 0xC8B888 });
  body.ellipse(-4*s, -30*s, 6*s, 4*s).fill({ color: 0xffffff, alpha: 0.18 });

  // Antennae — curved with round bobble tips
  body.moveTo(-5*s, -37*s).quadraticCurveTo(-14*s, -50*s, -10*s, -52*s).stroke({ color: 0x5C4A32, width: 1.8 });
  body.moveTo(5*s, -37*s).quadraticCurveTo(14*s, -50*s, 10*s, -52*s).stroke({ color: 0x5C4A32, width: 1.8 });
  body.circle(-10*s, -52*s, 3.5*s).fill(beeColor);
  body.circle(-10*s, -52*s, 3.5*s).stroke({ width: outlineW, color: outlineColor });
  body.circle(10*s, -52*s, 3.5*s).fill(beeColor);
  body.circle(10*s, -52*s, 3.5*s).stroke({ width: outlineW, color: outlineColor });

  bodyC.addChild(body);
  c.addChild(bodyC);
  c._bodyC = bodyC;

  // Face (separate Graphics for dynamic expressions)
  const face = new Graphics();
  drawBeeFace(face, s, 'neutral', 0, 0);
  bodyC.addChild(face);
  c._face = face;
  c._beeScale = s;

  // Role-specific accessories
  drawAccessory(bodyC, bee, s, beeColor);

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
  label.y = 40 * s;
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

  } else if (role === 'hired') {
    const hType = bee.hiredType || 'developer';

    if (hType === 'developer') {
      // Headphones (over-ear) + carrying laptop
      g.arc(0, -30 * s, 14 * s, -Math.PI * 0.82, -Math.PI * 0.18).stroke({ color: 0x374151, width: 2.5 * s });
      g.roundRect(-17 * s, -27 * s, 7 * s, 9 * s, 3 * s).fill(0x374151);
      g.roundRect(10 * s, -27 * s, 7 * s, 9 * s, 3 * s).fill(0x374151);
      // Arms holding open laptop
      g.moveTo(-16 * s, -4 * s).lineTo(-24 * s, 4 * s).stroke({ color: 0xfef3c7, width: 2 * s });
      g.moveTo(16 * s, -4 * s).lineTo(24 * s, 4 * s).stroke({ color: 0xfef3c7, width: 2 * s });
      g.roundRect(-28 * s, 2 * s, 18 * s, 12 * s, 2 * s).fill(P.wallDark);
      g.roundRect(-27 * s, 3 * s, 16 * s, 9 * s, 1.5 * s).fill({ color: P.monGlow, alpha: 0.3 });
      // Code lines on laptop
      g.moveTo(-25 * s, 5 * s).lineTo(-15 * s, 5 * s).stroke({ color: 0x4ade80, width: 0.8 * s });
      g.moveTo(-25 * s, 8 * s).lineTo(-18 * s, 8 * s).stroke({ color: 0x60a5fa, width: 0.8 * s });
      g.moveTo(-25 * s, 11 * s).lineTo(-16 * s, 11 * s).stroke({ color: 0xfbbf24, width: 0.8 * s });

    } else if (hType === 'designer') {
      // Beret + stylus pen
      g.ellipse(2, -38 * s, 12 * s, 5 * s).fill(0x8B5CF6);
      g.circle(2, -43 * s, 3 * s).fill(0x8B5CF6);
      // Arms: left holding tablet, right holding stylus
      g.moveTo(-16 * s, -4 * s).lineTo(-22 * s, 6 * s).stroke({ color: 0xfef3c7, width: 2 * s });
      g.moveTo(16 * s, -4 * s).lineTo(24 * s, 0).stroke({ color: 0xfef3c7, width: 2 * s });
      // Tablet
      g.roundRect(-28 * s, 2 * s, 16 * s, 20 * s, 2 * s).fill(0x374151);
      g.roundRect(-27 * s, 3 * s, 14 * s, 17 * s, 1.5 * s).fill({ color: 0xc4b5fd, alpha: 0.3 });
      // Stylus
      g.moveTo(24 * s, 0).lineTo(30 * s, -10 * s).stroke({ color: 0x8B7355, width: 1.8 });
      g.circle(30 * s, -10 * s, 1.5 * s).fill(0x8B5CF6);

    } else if (hType === 'manager') {
      // Glasses + phone held to ear
      g.roundRect(-10 * s, -28 * s, 8 * s, 6 * s, 2 * s).stroke({ color: 0x1E3A5F, width: 1.2 });
      g.roundRect(2 * s, -28 * s, 8 * s, 6 * s, 2 * s).stroke({ color: 0x1E3A5F, width: 1.2 });
      g.moveTo(-2 * s, -25 * s).lineTo(2 * s, -25 * s).stroke({ color: 0x1E3A5F, width: 1 });
      // Right arm: holding phone to ear
      g.moveTo(16 * s, -4 * s).lineTo(20 * s, -16 * s).stroke({ color: 0xfef3c7, width: 2 * s });
      g.roundRect(16 * s, -24 * s, 8 * s, 14 * s, 2 * s).fill(0x374151);
      g.roundRect(17 * s, -23 * s, 6 * s, 10 * s, 1.5 * s).fill({ color: 0x3b82f6, alpha: 0.3 });
      // Left arm: holding clipboard
      g.moveTo(-16 * s, -4 * s).lineTo(-22 * s, 6 * s).stroke({ color: 0xfef3c7, width: 2 * s });
      g.roundRect(-28 * s, 2 * s, 14 * s, 18 * s, 2 * s).fill(P.planter);
      g.roundRect(-28 * s, 2 * s, 14 * s, 18 * s, 2 * s).stroke({ width: 1, color: 0xb8a88a });

    } else if (hType === 'researcher') {
      // Magnifying glass held up + laptop tucked under arm
      g.moveTo(16 * s, -4 * s).lineTo(22 * s, -14 * s).stroke({ color: 0xfef3c7, width: 2 * s });
      g.circle(26 * s, -20 * s, 8 * s).stroke({ color: 0x06B6D4, width: 2 * s });
      g.circle(26 * s, -20 * s, 5 * s).fill({ color: 0x06B6D4, alpha: 0.15 });
      g.moveTo(22 * s, -14 * s).lineTo(28 * s, -6 * s).stroke({ color: 0x8B7355, width: 2 * s });
      // Left arm: laptop tucked
      g.moveTo(-16 * s, -4 * s).lineTo(-20 * s, 8 * s).stroke({ color: 0xfef3c7, width: 2 * s });
      g.roundRect(-26 * s, 4 * s, 14 * s, 10 * s, 1.5 * s).fill(P.wallDark);

    } else if (hType === 'devops') {
      // Hard hat + wrench
      g.ellipse(0, -39 * s, 14 * s, 6 * s).fill(0xF97316);
      g.roundRect(-12 * s, -42 * s, 24 * s, 8 * s, 4 * s).fill(0xF97316);
      g.roundRect(-12 * s, -42 * s, 24 * s, 3 * s, 2 * s).fill({ color: 0xffffff, alpha: 0.15 });
      // Arms: wrench in right hand, phone in left
      g.moveTo(16 * s, -4 * s).lineTo(24 * s, 2 * s).stroke({ color: 0xfef3c7, width: 2 * s });
      g.moveTo(24 * s, 2 * s).lineTo(30 * s, -4 * s).stroke({ color: 0x6B7280, width: 2 });
      g.circle(30 * s, -4 * s, 3 * s).stroke({ color: 0x6B7280, width: 1.5 });
      // Left arm: holding phone (checking alerts)
      g.moveTo(-16 * s, -4 * s).lineTo(-22 * s, 4 * s).stroke({ color: 0xfef3c7, width: 2 * s });
      g.roundRect(-28 * s, 0, 10 * s, 16 * s, 2 * s).fill(0x374151);
      g.roundRect(-27 * s, 1 * s, 8 * s, 12 * s, 1.5 * s).fill({ color: 0xF97316, alpha: 0.3 });
    }

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
  const isMoving = !!(dx || dy);
  if (isMoving) {
    const len = Math.sqrt(dx * dx + dy * dy);
    const newX = clamp(playerBee.drawX + (dx / len) * PLAYER_SPEED, 20, CANVAS_W - 20);
    const newY = clamp(playerBee.drawY + (dy / len) * PLAYER_SPEED, 20, CANVAS_H - 20);

    // Collision: only move if destination is walkable, with wall-sliding
    if (isWalkable(newX, newY)) {
      playerBee.drawX = newX;
      playerBee.drawY = newY;
    } else if (isWalkable(newX, playerBee.drawY)) {
      playerBee.drawX = newX; // slide along X
    } else if (isWalkable(playerBee.drawX, newY)) {
      playerBee.drawY = newY; // slide along Y
    }

    playerBee.gfx.x = playerBee.drawX;
    playerBee.gfx.y = playerBee.drawY;
    playerBee.targetX = playerBee.drawX + dx; // for lean direction
    if (Math.abs(dx) > Math.abs(dy)) {
      playerBee._facing = dx > 0 ? 'right' : 'left';
    } else {
      playerBee._facing = dy > 0 ? 'down' : 'up';
    }
    if (dx !== 0) flipBee(playerBee, dx < 0);
    playerBee._moveFacing = playerBee._facing;
  }
  // Player blink animation
  playerBee._blinkTimer = (playerBee._blinkTimer || Math.floor(Math.random() * 300)) - 1;
  if (playerBee._blinkTimer <= 0) {
    playerBee._blinkTimer = 200 + Math.floor(Math.random() * 200);
    playerBee._blinkFrames = 8;
  }
  if (playerBee._blinkFrames > 0) {
    playerBee._blinkFrames--;
    if (playerBee._blinkFrames > 2) {
      updateBeeExpression(playerBee, 'blink', playerBee._facing);
    } else {
      updateBeeExpression(playerBee, isMoving ? 'neutral' : 'happy', playerBee._facing);
    }
  } else {
    updateBeeExpression(playerBee, isMoving ? 'neutral' : 'happy', playerBee._facing);
  }
  animateBee(playerBee, isMoving);
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

  const prevX = bee.drawX, prevY = bee.drawY;

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

  // Detect movement and animate
  const moved = Math.abs(bee.drawX - prevX) + Math.abs(bee.drawY - prevY);
  const moveDx = bee.drawX - prevX;
  if (Math.abs(moveDx) > 0.1) flipBee(bee, moveDx < 0);

  // When settled, pick an activity based on what's nearby
  if (moved < 0.15) {
    bee._settledFrames = (bee._settledFrames || 0) + 1;
    if (bee._settledFrames > 30) {
      const nearPt = findNearestInteractionInfo(bee.drawX, bee.drawY, bee.room);
      const newAct = interactionToActivity(nearPt, bee.room);
      if (bee.activity !== newAct) {
        bee.activity = newAct;
        const expr = activityToExpression(newAct);
        updateBeeExpression(bee, expr, nearPt?.facing || null);
        // Face toward the furniture
        if (nearPt?.facing === 'left') flipBee(bee, true);
        else if (nearPt?.facing === 'right') flipBee(bee, false);
      }
    }
  } else {
    bee._settledFrames = 0;
    if (bee.activity !== 'idle') {
      bee.activity = 'idle';
      updateBeeExpression(bee, 'neutral', null);
    }
  }

  animateBee(bee, moved > 0.2);
}

/** Hired bees wander within their home room when idle (like ambient bees) */
// Work room for each hired bee type (must match backend HIRED_BEE_WORKROOM)
const HIRED_WORKROOM = {
  developer: 'studio', designer: 'studio', researcher: 'library',
  devops: 'server-room', manager: 'meeting-room',
};

// Idle rooms hired bees can wander to when session is inactive
const HIRED_BREAK_ROOMS = ['coffee', 'water-cooler'];

function updateHiredBeeIdle(bee) {
  // Only wander if not being moved by backend (activity is idle or coffee)
  if (bee.activity !== 'idle' && bee.activity !== 'drinking-coffee') return;
  if (bee.path && bee.pathIndex < bee.path.length) return; // currently pathing

  const sessionActive = officeState?.sessionActive;
  const workRoom = HIRED_WORKROOM[bee.hiredType] || bee.room;

  bee._hiredIdleTimer = (bee._hiredIdleTimer || 0) + 1;
  const wanderDelay = sessionActive ? 500 + Math.random() * 400 : 300 + Math.random() * 300;

  if (bee._hiredIdleTimer > wanderDelay) {
    bee._hiredIdleTimer = 0;

    if (sessionActive) {
      // During active sessions: stay in work room, prefer activity-matched interaction points
      const room = ROOMS.find(r => r.id === workRoom);
      if (room) {
        const ipt = findInteractionPoint(workRoom, bee.id, false, bee.activity);
        if (ipt && Math.random() > 0.3) {
          bee.targetX = ipt.x;
          bee.targetY = ipt.y;
        } else {
          bee.targetX = room.x + room.w * (0.25 + Math.random() * 0.5);
          bee.targetY = room.y + room.h * (0.3 + Math.random() * 0.4);
        }
      }
    } else {
      // Off-duty: sometimes wander to kitchen or lounge
      const goBreak = Math.random() < 0.25;
      const targetRoomId = goBreak
        ? HIRED_BREAK_ROOMS[Math.floor(Math.random() * HIRED_BREAK_ROOMS.length)]
        : workRoom;
      const room = ROOMS.find(r => r.id === targetRoomId);
      if (room) {
        const ipt = findInteractionPoint(targetRoomId, bee.id, false, bee.activity);
        if (ipt && Math.random() > 0.4) {
          bee.targetX = ipt.x;
          bee.targetY = ipt.y;
        } else {
          bee.targetX = room.x + room.w * (0.2 + Math.random() * 0.6);
          bee.targetY = room.y + room.h * (0.25 + Math.random() * 0.5);
        }
      }
    }
  }
}

// --- Sync backend bees ---
function syncBees(serverBees) {
  if (!serverBees) return;

  const seen = new Set();

  for (const bee of serverBees) {
    seen.add(bee.id);
    let sx = bee.targetX * COORD_SCALE;
    let sy = bee.targetY * COORD_SCALE;

    // Snap to interaction point if available — pass activity so bees sit at relevant spots
    const isQueen = bee.role === 'queen' || bee.id === 'queen';
    const ipt = findInteractionPoint(bee.room, bee.id, isQueen, bee.activity);
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
      // Detect error state from message content for confused expression
      const isError = bee.message && (bee.message.includes('failed') || bee.message.includes('error'));
      const expr = isError ? 'confused' : activityToExpression(bee.activity);
      // Set facing from interaction point, persists for eye direction
      if (beeFacing) lb._facing = beeFacing;
      updateBeeExpression(lb, expr, beeFacing || lb._moveFacing);

      // Flip body to face interaction point direction when stationary
      if (beeFacing === 'left') flipBee(lb, true);
      else if (beeFacing === 'right') flipBee(lb, false);

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

      // Set initial expression and facing
      if (beeFacing) lb._facing = beeFacing;
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

}

function moveAmbientBeesForContext(serverBees) {
  const queen = serverBees.find(b => b.id === 'queen');
  if (!queen) return;

  const artist = ambientBees['omni-artist'];
  const manager = ambientBees['omni-manager'];

  // OmniArtist follows creative work
  if (artist) {
    if (queen.activity === 'coding') {
      moveAmbientTo(artist, 'studio');
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
    } else if (queen.activity === 'reading' || queen.activity === 'browsing') {
      moveAmbientTo(manager, 'library');
    } else if (queen.activity === 'idle') {
      moveAmbientTo(manager, 'water-cooler');
    }
  }

  // Coder bees — go to relevant rooms based on queen activity
  const coderIds = ['coder-1', 'coder-2', 'coder-3'];
  for (const cid of coderIds) {
    const coder = ambientBees[cid];
    if (!coder) continue;
    if (queen.activity === 'coding') {
      moveAmbientTo(coder, 'studio');
    } else if (queen.activity === 'reading' || queen.activity === 'browsing') {
      moveAmbientTo(coder, 'library');
    } else if (queen.activity === 'idle' || queen.activity === 'drinking-coffee') {
      const idleSpots = ['coffee', 'water-cooler', 'studio'];
      moveAmbientTo(coder, idleSpots[coderIds.indexOf(cid)]);
    } else if (queen.activity === 'running-command') {
      moveAmbientTo(coder, cid === 'coder-1' ? 'server-room' : 'studio');
    }
  }
}

function moveAmbientTo(bee, roomId) {
  if (bee.room === roomId) return;
  const oldRoom = bee.room;
  const room = ROOMS.find(r => r.id === roomId);
  if (room) {
    // Use interaction point if available
    const ipt = findInteractionPoint(roomId, bee.id, false, bee.activity);
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

/** Animate a bee's body, legs, and wings based on movement state */
function animateBee(bee, isMoving) {
  const gfx = bee.gfx;
  if (!gfx) return;

  bee.wingPhase = (bee.wingPhase || 0) + (isMoving ? 0.25 : 0.06);
  bee._walkCycle = (bee._walkCycle || 0) + (isMoving ? 0.18 : 0);
  const wc = bee._walkCycle;
  const s = gfx._beeScale || 1;

  if (isMoving) {
    // ── Walking ──
    // Legs alternate swing
    if (gfx._legL) {
      gfx._legL.rotation = Math.sin(wc) * 0.5;
      gfx._legR.rotation = Math.sin(wc + Math.PI) * 0.5;
    }
    // Body bounce (hop up on each step)
    if (gfx._bodyC) {
      gfx._bodyC.y = -Math.abs(Math.sin(wc)) * 3 * s;
    }
    // Slight body lean in direction of movement
    const dx = bee.targetX - bee.drawX;
    const lean = clamp(dx * 0.002, -0.08, 0.08);
    if (gfx._bodyC) gfx._bodyC.rotation = lean;
    // Wings fold back (small gentle flutter, not full flap)
    if (gfx._wingL) {
      gfx._wingL.rotation = -0.3 + Math.sin(bee.wingPhase) * 0.08;
      gfx._wingR.rotation = 0.3 - Math.sin(bee.wingPhase) * 0.08;
      gfx._wingL.alpha = 0.5;
      gfx._wingR.alpha = 0.5;
    }
    // Shadow stays on ground, grows slightly during hop
    if (gfx._shadow) {
      gfx._shadow.y = 36 * s;
      const hopFactor = Math.abs(Math.sin(wc));
      gfx._shadow.scale.set(1 - hopFactor * 0.1, 1 - hopFactor * 0.15);
      gfx._shadow.alpha = 0.12 - hopFactor * 0.03;
    }
  } else {
    // ── Stationary — activity-specific poses ──
    const act = bee.activity || 'idle';
    const t = frame * 0.03 + (bee.wingPhase || 0);

    // Shadow at rest (shared across all idle poses)
    if (gfx._shadow) {
      gfx._shadow.y = 36 * s;
      gfx._shadow.scale.set(1, 1);
      gfx._shadow.alpha = 0.12;
    }

    if (act === 'coding' || act === 'reading' || act === 'searching' || act === 'browsing') {
      // ── Working at desk / browsing ──
      if (gfx._legL) {
        gfx._legL.rotation = 0.3;
        gfx._legR.rotation = 0.3;
      }
      if (gfx._bodyC) {
        gfx._bodyC.x = 0;
        gfx._bodyC.rotation = 0.06; // lean forward
        // Typing twitch — tiny jitter every ~40 frames
        const twitch = Math.sin(frame * 0.16 + bee.wingPhase) > 0.85 ? 0.5 * s : 0;
        gfx._bodyC.y = twitch;
      }
      if (gfx._wingL) {
        gfx._wingL.rotation = -0.4;
        gfx._wingR.rotation = 0.4;
        gfx._wingL.alpha = 0.35;
        gfx._wingR.alpha = 0.35;
      }

    } else if (act === 'drinking-coffee') {
      // ── Drinking (coffee / fruit water) ──
      if (gfx._legL) {
        gfx._legL.rotation = 0.1;
        gfx._legR.rotation = -0.1;
      }
      if (gfx._bodyC) {
        gfx._bodyC.x = 0;
        gfx._bodyC.rotation = -0.04; // slight tilt back
        gfx._bodyC.y = Math.sin(t) * 0.6 * s;
      }
      if (gfx._wingL) {
        gfx._wingL.rotation = 0.15;
        // Sip motion — wing raises periodically
        const sipCycle = Math.sin(frame * 0.012 + bee.wingPhase);
        gfx._wingR.rotation = -0.8 + (sipCycle > 0.7 ? (sipCycle - 0.7) * 0.6 : 0);
        gfx._wingL.alpha = 0.6;
        gfx._wingR.alpha = 0.6;
      }

    } else if (act === 'presenting' || act === 'chatting') {
      // ── Presenting / chatting — animated gesturing ──
      if (gfx._legL) {
        gfx._legL.rotation = Math.sin(t * 0.4) * 0.15;
        gfx._legR.rotation = Math.sin(t * 0.4 + Math.PI) * 0.15;
      }
      if (gfx._bodyC) {
        gfx._bodyC.x = Math.sin(t * 0.5) * 1.5 * s;
        gfx._bodyC.y = Math.sin(t) * 0.8 * s;
        gfx._bodyC.rotation = Math.sin(t * 0.5) * 0.03;
      }
      if (gfx._wingL) {
        gfx._wingL.rotation = -0.2 + Math.sin(t * 0.7) * 0.2;
        gfx._wingR.rotation = 0.2 - Math.sin(t * 0.7 + 1) * 0.3;
        gfx._wingL.alpha = 0.6;
        gfx._wingR.alpha = 0.6;
      }

    } else if (act === 'running-command') {
      // ── Server room — hunched, fast tapping ──
      if (gfx._legL) {
        gfx._legL.rotation = 0.2;
        gfx._legR.rotation = 0.2;
      }
      if (gfx._bodyC) {
        gfx._bodyC.x = 0;
        gfx._bodyC.rotation = 0.1; // hunched forward
        // Fast tap every ~20 frames
        const tap = Math.sin(frame * 0.3 + bee.wingPhase) > 0.8 ? 0.4 * s : 0;
        gfx._bodyC.y = tap;
      }
      if (gfx._wingL) {
        gfx._wingL.rotation = -0.5;
        gfx._wingR.rotation = 0.5;
        gfx._wingL.alpha = 0.3;
        gfx._wingR.alpha = 0.3;
      }

    } else if (act === 'thinking') {
      // ── Thinking — wing to chin, slow sway ──
      if (gfx._legL) {
        gfx._legL.rotation = 0;
        gfx._legR.rotation = 0;
      }
      if (gfx._bodyC) {
        gfx._bodyC.x = 0;
        gfx._bodyC.y = Math.sin(t * 0.7) * 0.8 * s;
        gfx._bodyC.rotation = Math.sin(t * 0.4) * 0.02;
      }
      if (gfx._wingL) {
        gfx._wingL.rotation = -0.15 + Math.sin(bee.wingPhase) * 0.04;
        gfx._wingR.rotation = -0.6; // raised to chin
        gfx._wingL.alpha = 0.6;
        gfx._wingR.alpha = 0.6;
      }

    } else if (act === 'celebrating') {
      // ── Celebrating — bouncy happy dance ──
      if (gfx._legL) {
        gfx._legL.rotation = Math.sin(t * 2) * 0.3;
        gfx._legR.rotation = Math.sin(t * 2 + Math.PI) * 0.3;
      }
      if (gfx._bodyC) {
        gfx._bodyC.x = Math.sin(t * 1.5) * 2 * s;
        gfx._bodyC.y = -Math.abs(Math.sin(t * 2)) * 4 * s; // bounce up
        gfx._bodyC.rotation = Math.sin(t * 1.5) * 0.05;
      }
      if (gfx._wingL) {
        gfx._wingL.rotation = -0.8 + Math.sin(t * 3) * 0.3; // fast flutter
        gfx._wingR.rotation = 0.8 - Math.sin(t * 3) * 0.3;
        gfx._wingL.alpha = 0.7;
        gfx._wingR.alpha = 0.7;
      }

    } else if (act === 'arriving') {
      // ── Arriving — excited wave ──
      if (gfx._legL) {
        gfx._legL.rotation = 0;
        gfx._legR.rotation = 0;
      }
      if (gfx._bodyC) {
        gfx._bodyC.x = 0;
        gfx._bodyC.y = Math.sin(t * 1.5) * 1 * s;
        gfx._bodyC.rotation = 0;
      }
      if (gfx._wingL) {
        gfx._wingL.rotation = -0.3 + Math.sin(t * 2) * 0.15;
        gfx._wingR.rotation = -0.6 + Math.sin(t * 1.5) * 0.4; // waving
        gfx._wingL.alpha = 0.6;
        gfx._wingR.alpha = 0.7;
      }

    } else {
      // ── Default idle ──
      if (gfx._legL) {
        gfx._legL.rotation = 0;
        gfx._legR.rotation = 0;
      }
      if (gfx._bodyC) {
        gfx._bodyC.x = 0;
        gfx._bodyC.y = Math.sin(t) * 1.2 * s;
        gfx._bodyC.rotation *= 0.9;
      }
      if (gfx._wingL) {
        gfx._wingL.rotation = -0.15 + Math.sin(bee.wingPhase) * 0.05;
        gfx._wingR.rotation = 0.15 - Math.sin(bee.wingPhase) * 0.05;
        gfx._wingL.alpha = 0.65;
        gfx._wingR.alpha = 0.65;
      }
    }
  }
}

function updateAllBees() {
  // Backend bees
  for (const bee of Object.values(localBees)) {
    const speed = bee.activity === 'arriving' ? 0.12 : 0.06;
    const prevX = bee.drawX, prevY = bee.drawY;

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

    // Pokemon-style depth scaling — bees lower on screen are clearly larger
    const depthT = Math.max(0, Math.min(1, (bee.drawY - 40) / (CANVAS_H - 80)));
    const depthScale = 0.72 + depthT * 0.48; // 0.72 (far/top) → 1.20 (near/bottom)
    const signX = bee.gfx.scale.x < 0 ? -1 : 1;
    bee.gfx.scale.set(signX * depthScale, depthScale);
    // Shadow grows with proximity
    if (bee.gfx._shadow) {
      bee.gfx._shadow.alpha = 0.06 + depthT * 0.14;
      bee.gfx._shadow.scale.set(0.8 + depthT * 0.4);
    }

    // Detect movement and update facing
    const moved = Math.abs(bee.drawX - prevX) + Math.abs(bee.drawY - prevY);
    const moveDx = bee.drawX - prevX;
    const moveDy = bee.drawY - prevY;
    if (Math.abs(moveDx) > 0.15) flipBee(bee, moveDx < 0);

    // Update facing direction based on movement (for eye pupil offset)
    if (moved > 0.5) {
      if (Math.abs(moveDx) > Math.abs(moveDy)) {
        bee._moveFacing = moveDx > 0 ? 'right' : 'left';
      } else {
        bee._moveFacing = moveDy > 0 ? 'down' : 'up';
      }
    }

    // Blink animation — random blinks every 3-7 seconds
    bee._blinkTimer = (bee._blinkTimer || Math.floor(Math.random() * 300)) - 1;
    if (bee._blinkTimer <= 0) {
      bee._blinkTimer = 180 + Math.floor(Math.random() * 240); // 3-7s at 60fps
      bee._blinkFrames = 8; // blink lasts ~8 frames
    }
    if (bee._blinkFrames > 0) {
      bee._blinkFrames--;
      if (bee._blinkFrames > 2) { // only show blink for middle frames
        updateBeeExpression(bee, 'blink', bee._moveFacing || bee._facing);
      } else {
        // Restore real expression
        const expr = activityToExpression(bee.activity);
        updateBeeExpression(bee, expr, bee._moveFacing || bee._facing);
      }
    } else {
      // Normal expression update with movement facing
      const expr = activityToExpression(bee.activity);
      const facing = bee._moveFacing || bee._facing;
      updateBeeExpression(bee, expr, facing);
    }

    // Head bob while working (coding, reading, searching)
    if (!moved && bee.gfx && bee.gfx._face) {
      const act = bee.activity || 'idle';
      if (act === 'coding' || act === 'reading' || act === 'searching') {
        bee.gfx._face.y = Math.sin(frame * 0.05 + (bee.wingPhase || 0)) * 0.8;
      } else {
        bee.gfx._face.y = 0;
      }
    }

    animateBee(bee, moved > 0.3);
  }

  // Hired bees from backend — use same idle wander behavior
  for (const bee of Object.values(localBees)) {
    if (bee.role === 'hired') {
      updateHiredBeeIdle(bee);
    }
  }

  // Player bee depth scaling
  if (playerBee && playerBee.gfx) {
    const pDepthT = Math.max(0, Math.min(1, (playerBee.drawY - 40) / (CANVAS_H - 80)));
    const pDepthScale = 0.85 * (0.72 + pDepthT * 0.48);
    const pSignX = playerBee.gfx.scale.x < 0 ? -1 : 1;
    playerBee.gfx.scale.set(pSignX * pDepthScale, pDepthScale);
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

  // Monitor glow — subtle warm light behind studio workstation monitors
  const deskMonitors = [
    { x: 645, y: 95 }, { x: 765, y: 95 },     // studio row 0
    { x: 645, y: 225 }, { x: 765, y: 225 },   // studio row 1
    { x: 345, y: 225 }, { x: 345, y: 325 },   // library reading desks
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

  // Active monitor screen overlays — drawn over furniture when bee sits at desk
  monitorScreenOverlays = [];
  for (const dm of DESK_MONITORS) {
    const g = new Graphics();
    layers.effects.addChild(g);
    monitorScreenOverlays.push({ gfx: g, ...dm, active: false });
  }
}

function updateVisualEffects() {
  // Determine active rooms (rooms with bees)
  const activeRooms = new Set();
  for (const bee of Object.values(localBees)) {
    if (bee.room && bee.activity !== 'idle') activeRooms.add(bee.room);
  }

  // Pollen particles — drift upward, respawn at bottom, depth-scaled
  for (const p of particles) {
    p.gfx.x += p.vx + Math.sin(frame * 0.02 + p.phase) * 0.15;
    p.gfx.y += p.vy;
    // Depth scaling — particles near camera are notably bigger/brighter
    const pDepth = Math.max(0, Math.min(1, p.gfx.y / CANVAS_H));
    const pScale = 0.5 + pDepth * 1.0; // 0.5x at top → 1.5x at bottom
    p.gfx.scale.set(pScale);
    p.gfx.alpha = p.baseAlpha * (0.3 + pDepth * 0.7) * (0.6 + Math.sin(frame * 0.03 + p.phase) * 0.4);

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

  // Monitor glow pulse — active when studio or library is in use
  for (const m of monitorGlows) {
    m.active = activeRooms.has('studio') || activeRooms.has('library');
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

  // Active monitor screens — show scrolling code when bee is at desk
  const allBeesForMonitor = [
    ...(playerBee ? [playerBee] : []),
    ...Object.values(localBees),
  ];
  for (const mo of monitorScreenOverlays) {
    let occupied = false;
    for (const bee of allBeesForMonitor) {
      if (!bee.gfx) continue;
      const d = Math.hypot(bee.drawX - mo.chairX, bee.drawY - mo.chairY);
      const act = bee.activity;
      if (d < 35 && (act === 'coding' || act === 'reading' || act === 'searching' || act === 'browsing')) {
        occupied = true;
        break;
      }
    }
    if (occupied) {
      drawActiveMonitor(mo.gfx, mo.mx, mo.my, mo.mw, mo.mh);
    } else if (mo.active) {
      mo.gfx.clear();
    }
    mo.active = occupied;
  }
}

/** Draw scrolling code lines on an active monitor screen */
function drawActiveMonitor(g, mx, my, mw, mh) {
  g.clear();
  // Screen glow halo
  g.roundRect(mx - 3, my - 3, mw + 6, mh + 6, 4)
    .fill({ color: 0x5B9BD5, alpha: 0.10 });
  // Bright screen base
  g.roundRect(mx, my, mw, mh, 2)
    .fill({ color: 0x1a2030, alpha: 0.85 });
  // Scrolling code lines
  const colors = [0x4ade80, 0x60a5fa, 0xfbbf24, 0xc084fc, 0xf87171, 0x38bdf8, 0xa3e635];
  const lineH = 3.5;
  const scrollY = (frame * 0.4) % lineH;
  const numLines = Math.floor(mh / lineH) + 1;
  for (let i = 0; i < numLines; i++) {
    const ly = my + 2 + i * lineH - scrollY;
    if (ly < my || ly > my + mh - 2) continue;
    const indent = (i % 3) * 3;
    const lw = 5 + ((i * 7 + (frame >> 3)) % Math.max(1, mw - 10));
    g.rect(mx + 2 + indent, ly, Math.min(lw, mw - 4 - indent), 1.5)
      .fill({ color: colors[i % colors.length], alpha: 0.55 });
  }
  // Cursor blink
  if (Math.sin(frame * 0.1) > 0) {
    const cLine = ((frame >> 5) % Math.max(1, numLines - 1));
    const cy = my + 2 + cLine * lineH - scrollY;
    if (cy >= my && cy <= my + mh - 3) {
      g.rect(mx + 2 + (cLine % 3) * 3 + 8, cy, 1, 3)
        .fill({ color: 0xffffff, alpha: 0.8 });
    }
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
  // --- Camera follow: lock target to followed bee ---
  if (cameraFollow && cameraFollow.gfx) {
    cameraTarget.x = CANVAS_W / 2 - cameraFollow.drawX * cameraTarget.zoom;
    cameraTarget.y = CANVAS_H / 2 - cameraFollow.drawY * cameraTarget.zoom;
  }

  // --- Edge-of-map panning (mouse near canvas edge) ---
  if (!cameraFollow && mouseInCanvas && viewMode === 'single') {
    const rect = app.canvas.getBoundingClientRect();
    const vw = rect.width, vh = rect.height;
    let epx = 0, epy = 0;
    if (mouseViewX < EDGE_PAN_ZONE) epx = EDGE_PAN_SPEED * (1 - mouseViewX / EDGE_PAN_ZONE);
    else if (mouseViewX > vw - EDGE_PAN_ZONE) epx = -EDGE_PAN_SPEED * (1 - (vw - mouseViewX) / EDGE_PAN_ZONE);
    if (mouseViewY < EDGE_PAN_ZONE) epy = EDGE_PAN_SPEED * (1 - mouseViewY / EDGE_PAN_ZONE);
    else if (mouseViewY > vh - EDGE_PAN_ZONE) epy = -EDGE_PAN_SPEED * (1 - (vh - mouseViewY) / EDGE_PAN_ZONE);
    if (epx || epy) {
      cameraTarget.x += epx;
      cameraTarget.y += epy;
    }
  }

  camera.zoom += (cameraTarget.zoom - camera.zoom) * CAM_LERP;
  camera.x += (cameraTarget.x - camera.x) * CAM_LERP;
  camera.y += (cameraTarget.y - camera.y) * CAM_LERP;
  // Snap zoom to 1 when very close, but only snap position if target is also origin
  if (Math.abs(camera.zoom - 1) < 0.005) camera.zoom = 1;
  if (!cameraFollow) {
    if (Math.abs(cameraTarget.x) < 0.5 && Math.abs(camera.x) < 0.5) camera.x = 0;
    if (Math.abs(cameraTarget.y) < 0.5 && Math.abs(camera.y) < 0.5) camera.y = 0;
  }
  layers.camera.scale.set(camera.zoom);
  layers.camera.position.set(camera.x, camera.y);

  // --- Follow indicator ring ---
  if (followIndicator) {
    if (cameraFollow && cameraFollow.gfx) {
      followIndicator.visible = true;
      followIndicator.clear();
      const r = 28 + Math.sin(frame * 0.08) * 4;
      followIndicator.circle(cameraFollow.drawX, cameraFollow.drawY, r)
        .stroke({ color: P.honey, width: 2, alpha: 0.4 + Math.sin(frame * 0.08) * 0.15 });
    } else {
      followIndicator.visible = false;
    }
  }

  // Cursor: crosshair when near edge, default otherwise
  if (mouseInCanvas && !cameraFollow) {
    const rect = app.canvas.getBoundingClientRect();
    const vw = rect.width, vh = rect.height;
    const nearEdge = mouseViewX < EDGE_PAN_ZONE || mouseViewX > vw - EDGE_PAN_ZONE ||
                     mouseViewY < EDGE_PAN_ZONE || mouseViewY > vh - EDGE_PAN_ZONE;
    app.canvas.style.cursor = nearEdge ? 'crosshair' : 'default';
  } else {
    app.canvas.style.cursor = 'default';
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
    lastTerminalCount = 0;
    lastEventLogKey = '';
    lastEventLogCount = 0;
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

  // Progressive office unlock — redraw rooms + furniture when level changes
  if (state.officeLevel && state.officeLevel !== officeLevel) {
    officeLevel = state.officeLevel;
    unlockedRooms = state.unlockedRooms || unlockedRooms;
    // Redraw rooms and furniture for the new level
    layers.rooms.removeChildren();
    layers.furniture.removeChildren();
    drawRooms();
    drawFurniture();
  } else if (state.unlockedRooms && JSON.stringify(state.unlockedRooms) !== JSON.stringify(unlockedRooms)) {
    unlockedRooms = state.unlockedRooms;
    layers.rooms.removeChildren();
    layers.furniture.removeChildren();
    drawRooms();
    drawFurniture();
  }

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
    if (activeShopTab === 'team') renderTeamPanel();
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

  // Update team portrait dock
  renderTeamDock(state.bees);

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

  // Sync status from relay (piggybacked on state broadcast)
  if (state.syncStatus) {
    accountState.syncStatus = state.syncStatus;
    accountState.connected = state.syncStatus.connected;
    // Live-update the popover if it's open
    if (accountOpen) updateSyncDashboard();
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
    lastEventLogCount = 0;
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
let lastEventLogCount = 0;

function renderEventLog(entries) {
  const log = document.getElementById('event-log');
  if (!log) return;

  // Only render first 30
  const toRender = entries.slice(0, 30);

  // Fingerprint: count + first entry timestamp to avoid DOM thrashing every 500ms
  const key = toRender.length + ':' + (toRender[0]?.timestamp || '');
  if (key === lastEventLogKey) return;
  lastEventLogKey = key;

  // Event log shows newest first — if the list changed, we prepend new entries
  // Since entries are newest-first, new entries appear at index 0
  const newCount = toRender.length;

  // If entries shrank or structure changed, full rebuild
  if (newCount < lastEventLogCount || lastEventLogCount === 0) {
    log.innerHTML = '';
    lastEventLogCount = 0;
  }

  // How many new entries were added (at the front of the array)
  const added = newCount - lastEventLogCount;
  if (added > 0) {
    const fragment = document.createDocumentFragment();
    for (let i = added - 1; i >= 0; i--) {
      const entry = toRender[i];
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
      fragment.appendChild(el);
    }
    log.insertBefore(fragment, log.firstChild);

    // Trim excess nodes from the bottom
    while (log.childNodes.length > 30) {
      log.removeChild(log.lastChild);
    }
  }

  lastEventLogCount = newCount;
}

// --- Terminal / Response Feed ---
const MAX_TERMINAL_ENTRIES = 100;
let lastTerminalKey = '';
let lastTerminalCount = 0;  // Track how many entries are rendered for incremental append

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
  if (entry.role) return entry.role;  // Use explicit role if set
  if (entry.event === 'UserPromptSubmit') return 'user';
  if (entry.event === 'Stop') return 'claude';
  if (entry.event === 'Error' || entry.event === 'PostToolUseFailure') return 'error';
  return 'tool';
}

const CHANNEL_LABELS = {
  user:   'You',
  claude: 'Bee',
  tool:   'Tool',
  error:  'Err',
};

/** Create a single terminal entry DOM element — WoW chat line */
function createTerminalEntry(entry) {
  const role = entryRole(entry);
  const el = document.createElement('div');
  el.className = `term-entry role-${role}`;
  el.dataset.ts = entry.timestamp;

  const channel = CHANNEL_LABELS[role] || 'Tool';
  const content = entry.content || '';
  const relTime = relativeTime(entry.timestamp);
  const projectTag = entry.project
    ? `<span class="term-project-tag">${escapeHtml(shortProjectName(entry.project))}</span>`
    : '';

  el.innerHTML = `<span class="term-channel">[${escapeHtml(channel)}]</span> <span class="term-text">${escapeHtml(content)}</span><span class="term-time">${relTime}</span>${projectTag}`;
  return el;
}

/** Render terminal from state.terminalLog — incremental append for new entries */
function renderTerminalFromState(entries) {
  if (!entries) return;
  const key = entries.length + ':' + (entries[entries.length - 1]?.timestamp || '');
  if (key === lastTerminalKey) return;
  lastTerminalKey = key;

  const terminal = document.getElementById('terminal-output');
  if (!terminal) return;

  // If entries shrank or got replaced, do a full rebuild
  if (entries.length < lastTerminalCount || lastTerminalCount === 0) {
    terminal.innerHTML = '';
    lastTerminalCount = 0;
  }

  // Append only new entries (those after lastTerminalCount)
  const startIdx = lastTerminalCount;
  let lastDateStr = '';

  // Get the last date separator from existing content
  if (startIdx > 0 && entries.length > 0) {
    const prevEntry = entries[startIdx - 1];
    if (prevEntry) lastDateStr = new Date(prevEntry.timestamp).toLocaleDateString();
  }

  const fragment = document.createDocumentFragment();
  for (let i = startIdx; i < entries.length; i++) {
    const entry = entries[i];
    const dateStr = new Date(entry.timestamp).toLocaleDateString();
    if (dateStr !== lastDateStr) {
      lastDateStr = dateStr;
      const sep = document.createElement('div');
      sep.className = 'term-session-sep';
      sep.textContent = dateStr;
      fragment.appendChild(sep);
    }
    fragment.appendChild(createTerminalEntry(entry));
  }

  if (fragment.childNodes.length > 0) {
    terminal.appendChild(fragment);
    terminal.scrollTop = terminal.scrollHeight;
  }

  lastTerminalCount = entries.length;

  // Trim excess DOM nodes if terminal grew too large
  const maxNodes = 600;
  while (terminal.childNodes.length > maxNodes) {
    terminal.removeChild(terminal.firstChild);
  }
}

// Update relative timestamps every 30s (in-place, no DOM rebuild)
setInterval(() => {
  const terminal = document.getElementById('terminal-output');
  if (!terminal) return;
  terminal.querySelectorAll('.term-entry').forEach(entry => {
    const ts = entry.dataset.ts;
    const timeEl = entry.querySelector('.term-time');
    if (ts && timeEl) timeEl.textContent = relativeTime(ts);
  });
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

  // Invalidate terminal fingerprint so the next state broadcast re-checks entries.
  // Only reset the key (not the count) — resetting count causes a full DOM clear+rebuild.
  lastTerminalKey = '';
}

// --- WoW Chat Window ---

function applyTermPosition() {
  const win = document.getElementById('terminal-window');
  if (!win) return;
  // Remove all position classes, apply current
  for (const pos of TERM_POSITIONS) win.classList.remove(pos);
  win.classList.add(termPosition);
}

function cycleTermPosition() {
  const idx = TERM_POSITIONS.indexOf(termPosition);
  termPosition = TERM_POSITIONS[(idx + 1) % TERM_POSITIONS.length];
  localStorage.setItem(TERM_POSITION_KEY, termPosition);
  applyTermPosition();
}

function initTerminalWindow() {
  const win = document.getElementById('terminal-window');
  if (!win) return;

  // Apply saved position
  applyTermPosition();

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

  // Position cycle button
  const posBtn = win.querySelector('#btn-term-position');
  if (posBtn) posBtn.addEventListener('click', cycleTermPosition);

  // Chat input
  const input = document.getElementById('terminal-input');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        const text = input.value.trim();
        input.value = '';

        // Optimistic local render — show message immediately before server roundtrip
        const terminal = document.getElementById('terminal-output');
        if (terminal) {
          const entry = createTerminalEntry({
            event: 'UserPromptSubmit',
            content: text,
            timestamp: new Date().toISOString(),
            project: projectFilter || undefined,
            role: 'user',
          });
          terminal.appendChild(entry);
          terminal.scrollTop = terminal.scrollHeight;
        }

        // Send via WebSocket
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'user-input',
            text,
            project: projectFilter || undefined,
          }));
        }
      }
    });
  }
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
    const [accountResp, syncResp] = await Promise.all([
      fetch('/api/account'),
      fetch('/api/account/sync'),
    ]);
    if (accountResp.ok) {
      accountState = await accountResp.json();
    }
    if (syncResp.ok) {
      accountState.syncStatus = await syncResp.json();
    }
    renderAccountPopover();
  } catch (err) {
    console.error('[account] Failed to fetch state:', err);
  }
}

/** Format a timestamp as a relative time string */
function timeAgo(ts) {
  if (!ts) return 'never';
  const diff = Date.now() - ts;
  if (diff < 5000) return 'just now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

/** Render or update the sync dashboard inside the account popover */
function updateSyncDashboard() {
  const container = document.getElementById('sync-dashboard');
  if (!container) return;

  const sync = accountState.syncStatus;
  if (!sync || !accountState.connected) {
    container.innerHTML = '';
    return;
  }

  const projects = sync.projects || {};
  const projectNames = Object.keys(projects);

  let projectsHtml = '';
  for (const name of projectNames) {
    const p = projects[name];
    projectsHtml += `
      <div class="sync-project">
        <div class="sync-project-header">
          <span class="sync-project-name">${escapeHtml(name)}</span>
          <span class="sync-project-time">${timeAgo(p.lastSyncAt)}</span>
        </div>
        <div class="sync-project-stats">
          <span class="sync-project-stat"><span class="sync-project-stat-icon">&#x1F4C1;</span> ${p.fileCount}</span>
          <span class="sync-project-stat"><span class="sync-project-stat-icon">&#x1F4AC;</span> ${p.conversationCount}</span>
          <span class="sync-project-stat"><span class="sync-project-stat-icon">&#x1F4C4;</span> ${p.docCount}</span>
          ${p.transcriptUploaded ? '<span class="sync-check">&#x2713; transcript</span>' : ''}
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="sync-section">
      <div class="sync-section-label">Cloud Sync</div>
      <div class="sync-summary">
        <span class="sync-stat">
          <span class="sync-stat-icon">&#x2191;</span>
          <span class="sync-stat-val">${sync.sent}</span> sent
        </span>
        <span class="sync-stat ${sync.failed > 0 ? 'error' : ''}">
          <span class="sync-stat-icon">&#x2717;</span>
          <span class="sync-stat-val">${sync.failed}</span> failed
        </span>
      </div>
      <div class="sync-time">Last sync: ${timeAgo(sync.lastSyncAt)}</div>
      ${projectNames.length > 0 ? `<div class="sync-projects">${projectsHtml}</div>` : ''}
    </div>
  `;
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
      <div id="sync-dashboard"></div>
      <button class="account-unlink-btn" id="account-unlink-btn">Unlink Account</button>
    `;

    // Render sync dashboard content
    updateSyncDashboard();

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
      if (win) win.classList.toggle('hidden');
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

let lastProjectTabsKey = '';
function updateProjectTabs(projects) {
  const container = document.getElementById('project-tabs');
  if (!container) return;

  // Only rebuild DOM when the project list actually changes
  const key = projects.join(',');
  if (key === lastProjectTabsKey) {
    // Just update active states without destroying elements
    container.querySelectorAll('.project-tab').forEach(t => {
      t.classList.toggle('active', (t.dataset.project || null) === (projectFilter || null));
    });
    return;
  }
  lastProjectTabsKey = key;

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
  lastTerminalCount = 0;
  lastEventLogKey = '';
  lastEventLogCount = 0;
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

// ============================================================================
// Shop Tab Switching + Team Panel
// ============================================================================

let activeShopTab = 'cosmetics';
let lastTeamKey = '';

// Tab click handler
document.querySelectorAll('.shop-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.shopTab;
    if (!target || target === activeShopTab) return;
    activeShopTab = target;

    document.querySelectorAll('.shop-tab').forEach(t => t.classList.toggle('active', t.dataset.shopTab === target));
    document.getElementById('shop-cosmetics-panel')?.classList.toggle('hidden', target !== 'cosmetics');
    document.getElementById('shop-team-panel')?.classList.toggle('hidden', target !== 'team');

    if (target === 'team' && officeState) renderTeamPanel();
  });
});

function renderTeamPanel() {
  if (!officeState) return;
  const honey = officeState.shop?.honey || 0;
  const bees = (officeState.bees || []).filter(b => b.role === 'hired');
  const teamCount = bees.length;

  // Fingerprint to avoid unnecessary re-renders
  const key = `${honey}:${teamCount}:${bees.map(b => b.id).join(',')}`;
  if (key === lastTeamKey) return;
  lastTeamKey = key;

  setText('shop-team-honey', honey);
  setText('shop-team-count', `${teamCount}/8`);

  // Roster — existing hired bees
  const rosterEl = document.getElementById('shop-team-roster');
  if (rosterEl) {
    rosterEl.innerHTML = '';
    if (bees.length === 0) {
      rosterEl.innerHTML = '<div style="color:rgba(255,255,255,0.3);font-size:11px;padding:8px 0;text-align:center">No team members yet</div>';
    }
    for (const bee of bees) {
      const icon = HIRED_TYPE_ICONS[bee.hiredType] || '\uD83D\uDC1D';
      const card = document.createElement('div');
      card.className = 'shop-team-card';
      card.innerHTML = `
        <span class="shop-team-card-icon">${icon}</span>
        <div class="shop-team-card-info">
          <div class="shop-team-card-name">${escapeHtml(bee.name)}</div>
          <div class="shop-team-card-type">${bee.hiredType || 'worker'}</div>
        </div>
        <button class="shop-team-card-fire" data-fire-id="${bee.id}">Fire</button>
      `;
      card.querySelector('.shop-team-card-fire').addEventListener('click', () => fireTeamBee(bee.id));
      rosterEl.appendChild(card);
    }
  }

  // Hire grid
  const hireEl = document.getElementById('shop-team-hire');
  if (hireEl) {
    hireEl.innerHTML = '';
    for (const opt of HIRE_OPTIONS) {
      const canAfford = honey >= opt.cost;
      const atMax = teamCount >= 8;
      const card = document.createElement('div');
      card.className = 'shop-card' + (!canAfford || atMax ? ' disabled' : '');
      card.innerHTML = `
        <div class="shop-card-preview" style="background:rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;font-size:18px">${opt.icon}</div>
        <div class="shop-card-name">${opt.label}</div>
        <div class="shop-card-desc">${HIRE_DESCRIPTIONS[opt.type] || ''}</div>
        <button class="shop-card-btn buy" ${canAfford && !atMax ? '' : 'disabled'}>${opt.cost} \uD83C\uDF6F</button>
      `;
      if (canAfford && !atMax) {
        card.querySelector('.shop-card-btn').addEventListener('click', () => hireBee(opt.type));
      }
      hireEl.appendChild(card);
    }
  }
}

async function fireTeamBee(id) {
  try {
    const res = await fetch('/api/team/fire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (data.error) console.warn('[fire]', data.error);
    else lastTeamKey = ''; // force re-render
  } catch (err) {
    console.error('[fire] Failed:', err);
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

// ============================================================================
// Recruiter Menu — Sims-style hire panel
// ============================================================================

const HIRE_DESCRIPTIONS = {
  developer:  'Codes at Studio desks',
  designer:   'Creates in the Studio',
  researcher: 'Reads in the Library',
  devops:     'Monitors the Server Room',
  manager:    'Plans in the Conference Room',
};

function openRecruiterMenu(recruiterBee) {
  const menuEl = document.getElementById('recruiter-menu');
  if (!menuEl) return;

  recruiterMenuOpen = true;
  menuEl.classList.remove('hidden');

  // Position near recruiter's screen position
  const rect = app.canvas.getBoundingClientRect();
  const scaleX = rect.width / CANVAS_W;
  const scaleY = rect.height / CANVAS_H;
  const screenX = rect.left + (recruiterBee.drawX * camera.zoom + camera.x) * scaleX;
  const screenY = rect.top + (recruiterBee.drawY * camera.zoom + camera.y) * scaleY;
  menuEl.style.left = `${Math.max(10, Math.min(screenX - 130, window.innerWidth - 280))}px`;
  menuEl.style.top = `${Math.max(10, Math.min(screenY - 320, window.innerHeight - 350))}px`;

  // Update footer
  const honey = officeState?.shop?.honey || 0;
  const teamCount = (officeState?.bees || []).filter(b => b.role === 'hired').length;
  setText('recruiter-honey', honey);
  setText('recruiter-team-count', teamCount);

  // Populate options
  const optionsEl = document.getElementById('recruiter-menu-options');
  if (!optionsEl) return;
  optionsEl.innerHTML = '';

  for (const opt of HIRE_OPTIONS) {
    const canAfford = honey >= opt.cost;
    const div = document.createElement('div');
    div.className = 'hire-option' + (canAfford ? '' : ' disabled');
    div.innerHTML = `
      <span class="hire-option-icon">${opt.icon}</span>
      <div class="hire-option-info">
        <div class="hire-option-name">${opt.label}</div>
        <div class="hire-option-desc">${HIRE_DESCRIPTIONS[opt.type] || ''}</div>
      </div>
      <span class="hire-option-cost">${opt.cost} &#x1F36F;</span>
    `;
    if (canAfford) {
      div.addEventListener('click', () => hireBee(opt.type));
    }
    optionsEl.appendChild(div);
  }
}

function closeRecruiterMenu() {
  recruiterMenuOpen = false;
  const menuEl = document.getElementById('recruiter-menu');
  if (menuEl) menuEl.classList.add('hidden');
}

async function hireBee(type) {
  try {
    const res = await fetch('/api/team/hire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    });
    const data = await res.json();
    if (data.error) {
      console.warn('[hire]', data.error);
    } else {
      console.log('[hire] Hired:', data.bee?.name);
    }
  } catch (err) {
    console.error('[hire] Failed:', err);
  }
  closeRecruiterMenu();
}

// Close recruiter menu on click outside or Escape
document.addEventListener('click', (e) => {
  if (!recruiterMenuOpen) return;
  const menu = document.getElementById('recruiter-menu');
  if (menu && !menu.contains(e.target)) {
    closeRecruiterMenu();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && recruiterMenuOpen) {
    closeRecruiterMenu();
  }
});

// Close button
document.getElementById('recruiter-menu-close')?.addEventListener('click', closeRecruiterMenu);

// ============================================================================
// Team Management Icons — Role icon + status dot above each bee
// ============================================================================

const ROLE_COLORS = {
  queen: 0xfbbf24,
  recruiter: 0xef4444,
  hired: 0x4ade80,
  worker: 0x60a5fa,
};

const HIRED_TYPE_ICONS = {
  developer: '\u{1F4BB}',
  designer: '\u{1F3A8}',
  manager: '\u{1F4CA}',
  researcher: '\u{1F52C}',
  devops: '\u26A1',
};

function updateTeamIcons() {
  const allBees = Object.values(localBees);
  for (const bee of allBees) {
    if (!bee.gfx) continue;
    const s = bee.gfx._beeScale || 0.65;

    // Status dot (activity indicator)
    if (!bee.gfx._statusDot) {
      const dot = new Graphics();
      dot.circle(0, 0, 4).fill(0x4ade80);
      dot.y = -58 * s;
      dot.x = 12 * s;
      bee.gfx.addChild(dot);
      bee.gfx._statusDot = dot;
    }

    // Update status dot color based on activity
    const dot = bee.gfx._statusDot;
    dot.clear();
    let dotColor = 0x4ade80; // green = active/idle
    if (bee.activity === 'thinking' || bee.activity === 'searching') dotColor = 0xfbbf24; // yellow
    else if (bee.activity === 'coding' || bee.activity === 'running-command') dotColor = 0x3b82f6; // blue
    else if (bee.activity === 'presenting' || bee.activity === 'celebrating') dotColor = 0xa855f7; // purple
    dot.circle(0, 0, 3.5).fill(dotColor);
    // Glow
    dot.circle(0, 0, 6).fill({ color: dotColor, alpha: 0.2 });

    // Role icon text (rendered once)
    if (!bee.gfx._roleIconText) {
      const roleText = bee.role === 'hired'
        ? (HIRED_TYPE_ICONS[bee.hiredType] || '\u{1F41D}')
        : bee.role === 'queen' ? '\u{1F451}' : bee.role === 'recruiter' ? '\u{1F4CB}' : '\u{1F527}';
      const icon = new Text({
        text: roleText,
        style: new TextStyle({ fontSize: 10, fill: 0xffffff }),
      });
      icon.anchor.set(0.5, 0.5);
      icon.y = -58 * s;
      icon.x = -4 * s;
      bee.gfx.addChild(icon);
      bee.gfx._roleIconText = icon;
    }
  }
}

// ============================================================================
// Team Portrait Dock — Sims-style vertical strip on right edge
// ============================================================================

const ALL_ASSIGNABLE_TOOLS = [
  { id: 'Read',         label: 'Read',     icon: '\u{1F4D6}' },
  { id: 'Edit',         label: 'Edit',     icon: '\u270F\uFE0F' },
  { id: 'Write',        label: 'Write',    icon: '\u{1F4DD}' },
  { id: 'Glob',         label: 'Glob',     icon: '\u{1F50D}' },
  { id: 'Grep',         label: 'Grep',     icon: '\u{1F50E}' },
  { id: 'Bash',         label: 'Bash',     icon: '\u26A1' },
  { id: 'WebFetch',     label: 'Web',      icon: '\u{1F310}' },
  { id: 'WebSearch',    label: 'Search',   icon: '\u{1F50D}' },
  { id: 'Task',         label: 'Task',     icon: '\u{1F41D}' },
  { id: 'Skill',        label: 'Skill',    icon: '\u2699\uFE0F' },
  { id: 'NotebookEdit', label: 'Notebook', icon: '\u{1F4D3}' },
  { id: 'EnterPlanMode', label: 'Plan',    icon: '\u{1F4CB}' },
  { id: 'ExitPlanMode', label: 'EndPlan',  icon: '\u{1F4CB}' },
  { id: 'AskUserQuestion', label: 'Ask',   icon: '\u{1F4AC}' },
  { id: 'TaskCreate',   label: 'TaskNew',  icon: '\u{1F4DD}' },
  { id: 'TaskUpdate',   label: 'TaskUpd',  icon: '\u{1F4DD}' },
  { id: 'TaskList',     label: 'TaskList', icon: '\u{1F4DD}' },
];

const BEE_COLOR_PRESETS = [
  '#22C55E', '#8B5CF6', '#3B82F6', '#06B6D4', '#F97316',
  '#EF4444', '#EC4899', '#F59E0B', '#10B981', '#6366F1',
];

let teamDockSelectedId = null;
let lastTeamDockKey = '';

/** Generate inline SVG bee face for a portrait */
function beePortraitSVG(color, activity) {
  // Darken helper for stripes
  const r = parseInt(color.slice(1,3),16), g = parseInt(color.slice(3,5),16), b = parseInt(color.slice(5,7),16);
  const dk = (v,f) => Math.round(v * f).toString(16).padStart(2,'0');
  const dark = `#${dk(r,0.55)}${dk(g,0.55)}${dk(b,0.55)}`;
  const light = `#${dk(Math.min(255,r+60),1)}${dk(Math.min(255,g+60),1)}${dk(Math.min(255,b+60),1)}`;

  // Expression based on activity
  let eyeL, eyeR, mouth;
  if (activity === 'coding' || activity === 'running-command' || activity === 'searching') {
    // focused — slightly narrowed
    eyeL = `<ellipse cx="13" cy="16" rx="3.5" ry="3" fill="white"/><ellipse cx="13" cy="16.5" rx="2.2" ry="2" fill="#1a1a1a"/><circle cx="14" cy="15.5" r="1" fill="white"/>`;
    eyeR = `<ellipse cx="23" cy="16" rx="3.5" ry="3" fill="white"/><ellipse cx="23" cy="16.5" rx="2.2" ry="2" fill="#1a1a1a"/><circle cx="24" cy="15.5" r="1" fill="white"/>`;
    mouth = `<line x1="16" y1="22" x2="20" y2="22" stroke="#78716c" stroke-width="1" stroke-linecap="round"/>`;
  } else if (activity === 'celebrating' || activity === 'presenting') {
    // happy — big eyes, smile
    eyeL = `<ellipse cx="13" cy="15.5" rx="3.8" ry="4" fill="white"/><ellipse cx="13" cy="16" rx="2.8" ry="3" fill="#1a1a1a"/><circle cx="14.2" cy="14.5" r="1.2" fill="white"/>`;
    eyeR = `<ellipse cx="23" cy="15.5" rx="3.8" ry="4" fill="white"/><ellipse cx="23" cy="16" rx="2.8" ry="3" fill="#1a1a1a"/><circle cx="24.2" cy="14.5" r="1.2" fill="white"/>`;
    mouth = `<path d="M15 21.5 Q18 25 21 21.5" stroke="#78716c" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;
  } else if (activity === 'thinking') {
    // pensive — eyes looking up-right
    eyeL = `<ellipse cx="13" cy="15.5" rx="3.5" ry="3.5" fill="white"/><ellipse cx="14.5" cy="14.5" rx="2" ry="2" fill="#1a1a1a"/><circle cx="15" cy="13.8" r="1" fill="white"/>`;
    eyeR = `<ellipse cx="23" cy="15.5" rx="3.5" ry="3.5" fill="white"/><ellipse cx="24.5" cy="14.5" rx="2" ry="2" fill="#1a1a1a"/><circle cx="25" cy="13.8" r="1" fill="white"/>`;
    mouth = `<ellipse cx="18" cy="22.5" rx="1.5" ry="1.8" fill="#78716c"/>`;
  } else if (activity === 'idle' || activity === 'drinking-coffee' || activity === 'chatting') {
    // relaxed neutral — soft eyes, gentle smile
    eyeL = `<ellipse cx="13" cy="16" rx="3.5" ry="3.5" fill="white"/><ellipse cx="13" cy="16.5" rx="2.5" ry="2.5" fill="#1a1a1a"/><circle cx="14" cy="15" r="1.2" fill="white"/>`;
    eyeR = `<ellipse cx="23" cy="16" rx="3.5" ry="3.5" fill="white"/><ellipse cx="23" cy="16.5" rx="2.5" ry="2.5" fill="#1a1a1a"/><circle cx="24" cy="15" r="1.2" fill="white"/>`;
    mouth = `<path d="M15.5 22 Q18 24 20.5 22" stroke="#78716c" stroke-width="1" fill="none" stroke-linecap="round"/>`;
  } else {
    // default neutral
    eyeL = `<ellipse cx="13" cy="16" rx="3.5" ry="3.5" fill="white"/><ellipse cx="13" cy="16.5" rx="2.5" ry="2.5" fill="#1a1a1a"/><circle cx="14" cy="15" r="1.2" fill="white"/>`;
    eyeR = `<ellipse cx="23" cy="16" rx="3.5" ry="3.5" fill="white"/><ellipse cx="23" cy="16.5" rx="2.5" ry="2.5" fill="#1a1a1a"/><circle cx="24" cy="15" r="1.2" fill="white"/>`;
    mouth = `<path d="M15.5 22 Q18 23.5 20.5 22" stroke="#78716c" stroke-width="1" fill="none" stroke-linecap="round"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="36" height="36">
    <!-- Body peek at bottom -->
    <ellipse cx="18" cy="34" rx="10" ry="6" fill="${color}"/>
    <ellipse cx="18" cy="34" rx="10" ry="6" stroke="${dark}" stroke-width="0.6" fill="none"/>
    <ellipse cx="18" cy="32" rx="9" ry="1.5" fill="${dark}" opacity="0.5"/>
    <ellipse cx="18" cy="36" rx="8" ry="1.2" fill="${dark}" opacity="0.5"/>
    <!-- Wings hint -->
    <ellipse cx="6" cy="28" rx="7" ry="4" fill="#dbeafe" opacity="0.35" transform="rotate(-20 6 28)"/>
    <ellipse cx="30" cy="28" rx="7" ry="4" fill="#dbeafe" opacity="0.35" transform="rotate(20 30 28)"/>
    <!-- Head -->
    <circle cx="18" cy="17" r="12" fill="#fef9c3"/>
    <circle cx="18" cy="17" r="12" stroke="#C8B888" stroke-width="0.7" fill="none"/>
    <!-- Head sheen -->
    <ellipse cx="14" cy="12" rx="5" ry="3.5" fill="white" opacity="0.15"/>
    <!-- Antennae -->
    <path d="M14 6 Q10 -1 12 -2" stroke="#5C4A32" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <circle cx="12" cy="-2" r="2.2" fill="${color}" stroke="${dark}" stroke-width="0.5"/>
    <path d="M22 6 Q26 -1 24 -2" stroke="#5C4A32" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <circle cx="24" cy="-2" r="2.2" fill="${color}" stroke="${dark}" stroke-width="0.5"/>
    <!-- Cheeks -->
    <ellipse cx="8" cy="20" rx="3" ry="1.8" fill="#fca5a5" opacity="0.3"/>
    <ellipse cx="28" cy="20" rx="3" ry="1.8" fill="#fca5a5" opacity="0.3"/>
    <!-- Eyes + Mouth -->
    ${eyeL}${eyeR}${mouth}
  </svg>`;
}

function renderTeamDock(bees) {
  if (!bees) return;
  const hiredBees = bees.filter(b => b.role === 'hired');

  // Don't re-render dock while a panel is open (panel lives on body, dock rebuild would lose selected highlight timing)
  if (teamDockSelectedId && document.querySelector('.team-panel')) {
    // Just update status dots on existing portraits
    const dock = document.getElementById('team-dock');
    if (dock) {
      const portraits = dock.querySelectorAll('.team-portrait');
      portraits.forEach((p, i) => {
        if (i < hiredBees.length) {
          const dot = p.querySelector('.team-portrait-status');
          if (dot) dot.className = 'team-portrait-status ' + activityToStatusClass(hiredBees[i].activity);
        }
      });
    }
    return;
  }

  // Fingerprint to skip no-op re-renders
  const key = hiredBees.map(b => `${b.id}:${b.name}:${b.color}:${b.activity}:${(b.hiredTools||[]).join(',')}`).join('|');
  if (key === lastTeamDockKey && document.getElementById('team-dock')?.childElementCount > 0) return;
  lastTeamDockKey = key;

  const dock = document.getElementById('team-dock');
  if (!dock) return;
  dock.innerHTML = '';

  if (hiredBees.length === 0) return;

  for (const bee of hiredBees) {
    const portrait = document.createElement('div');
    portrait.className = 'team-portrait' + (teamDockSelectedId === bee.id ? ' selected' : '');
    portrait.dataset.beeId = bee.id;
    portrait.title = `${bee.name} (${bee.hiredType || 'worker'})`;

    // SVG bee face
    portrait.innerHTML = `
      ${beePortraitSVG(bee.color || '#22C55E', bee.activity)}
      <span class="team-portrait-status ${activityToStatusClass(bee.activity)}"></span>
    `;

    portrait.addEventListener('click', (e) => {
      e.stopPropagation();
      if (teamDockSelectedId === bee.id) {
        teamDockSelectedId = null;
        closeTeamPanel();
        lastTeamDockKey = '';
        renderTeamDock(officeState?.bees || bees);
      } else {
        teamDockSelectedId = bee.id;
        // Update selected state on portraits
        dock.querySelectorAll('.team-portrait').forEach(p => p.classList.remove('selected'));
        portrait.classList.add('selected');
        openTeamPanel(bee, portrait);
      }
    });

    dock.appendChild(portrait);
  }
}

function activityToStatusClass(activity) {
  if (activity === 'coding' || activity === 'running-command' || activity === 'browsing' || activity === 'reading' || activity === 'searching') return 'working';
  if (activity === 'thinking' || activity === 'presenting') return 'thinking';
  return '';
}

function closeTeamPanel() {
  const existing = document.querySelector('.team-panel');
  if (existing) existing.remove();
  teamDockSelectedId = null;
}

function openTeamPanel(bee, portraitEl) {
  closeTeamPanel();
  teamDockSelectedId = bee.id;

  const icon = HIRED_TYPE_ICONS[bee.hiredType] || '\u{1F41D}';
  const currentTools = bee.hiredTools || [];

  const panel = document.createElement('div');
  panel.className = 'team-panel';

  // Position panel fixed on screen, to the left of the portrait
  const rect = portraitEl.getBoundingClientRect();
  panel.style.position = 'fixed';
  panel.style.right = (window.innerWidth - rect.left + 8) + 'px';
  // Center vertically on the portrait, but clamp to viewport
  const panelH = 420; // approximate
  let top = rect.top + rect.height / 2 - panelH / 2;
  top = Math.max(8, Math.min(top, window.innerHeight - panelH - 8));
  panel.style.top = top + 'px';
  panel.style.transform = 'none';

  // Build color swatches
  const swatchesHtml = BEE_COLOR_PRESETS.map(c =>
    `<div class="team-color-swatch ${c.toLowerCase() === (bee.color || '').toLowerCase() ? 'active' : ''}" data-color="${c}" style="background:${c}"></div>`
  ).join('');

  // Build tool chips
  const toolChipsHtml = ALL_ASSIGNABLE_TOOLS.map(t =>
    `<span class="team-tool-chip ${currentTools.includes(t.id) ? 'active' : ''}" data-tool="${t.id}">${t.icon} ${t.label}</span>`
  ).join('');

  // Large portrait preview at top of panel
  const previewSVG = beePortraitSVG(bee.color || '#22C55E', bee.activity)
    .replace('width="36" height="36"', 'width="52" height="52"');

  panel.innerHTML = `
    <div class="team-panel-header">
      <div class="team-panel-preview">${previewSVG}</div>
      <div>
        <div class="team-panel-bee-name">${escapeHtml(bee.name)}</div>
        <div class="team-panel-type">${bee.hiredType || 'worker'}</div>
      </div>
    </div>
    <div class="team-panel-label">Name</div>
    <input class="team-panel-name-input" type="text" maxlength="20" value="${escapeHtml(bee.name)}" />
    <div class="team-panel-label">Color</div>
    <div class="team-panel-colors">${swatchesHtml}</div>
    <div class="team-panel-label">Tools</div>
    <div class="team-panel-tools">${toolChipsHtml}</div>
    <div class="team-panel-actions">
      <button class="team-panel-save">Save</button>
      <button class="team-panel-fire">Fire</button>
    </div>
  `;

  // Wire color swatches — also live-update the preview SVG
  let selectedColor = bee.color;
  panel.querySelectorAll('.team-color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      panel.querySelectorAll('.team-color-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      selectedColor = sw.dataset.color;
      // Live preview
      const preview = panel.querySelector('.team-panel-preview');
      if (preview) {
        preview.innerHTML = beePortraitSVG(selectedColor, bee.activity)
          .replace('width="36" height="36"', 'width="52" height="52"');
      }
    });
  });

  // Wire tool chips (toggle)
  const selectedTools = new Set(currentTools);
  panel.querySelectorAll('.team-tool-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const toolId = chip.dataset.tool;
      if (selectedTools.has(toolId)) {
        selectedTools.delete(toolId);
        chip.classList.remove('active');
      } else {
        selectedTools.add(toolId);
        chip.classList.add('active');
      }
    });
  });

  // Save button
  panel.querySelector('.team-panel-save').addEventListener('click', async () => {
    const nameInput = panel.querySelector('.team-panel-name-input');
    const newName = nameInput.value.trim();
    try {
      const res = await fetch('/api/team/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: bee.id,
          name: newName || undefined,
          customColor: selectedColor || undefined,
          customTools: Array.from(selectedTools),
        }),
      });
      const data = await res.json();
      if (data.error) {
        console.warn('[team-update]', data.error);
      } else {
        closeTeamPanel();
        lastTeamDockKey = '';
        lastTeamKey = '';
      }
    } catch (err) {
      console.error('[team-update] Failed:', err);
    }
  });

  // Fire button
  panel.querySelector('.team-panel-fire').addEventListener('click', async () => {
    if (!confirm(`Fire ${bee.name}? This cannot be undone.`)) return;
    await fireTeamBee(bee.id);
    closeTeamPanel();
    lastTeamDockKey = '';
  });

  // Close panel when clicking outside
  const closeOnOutside = (e) => {
    if (!panel.contains(e.target) && !e.target.closest('.team-portrait')) {
      closeTeamPanel();
      lastTeamDockKey = '';
      if (officeState) renderTeamDock(officeState.bees);
      document.removeEventListener('mousedown', closeOnOutside);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', closeOnOutside), 0);

  // Append to body so it survives dock re-renders
  document.body.appendChild(panel);
}

// --- Start ---
init().catch(console.error);
