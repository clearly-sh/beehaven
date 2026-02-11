// ============================================================================
// BeeHaven Office — PixiJS v8 Renderer + WebSocket + Chat + Audio
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
let chatOpen = false;
let recording = false;
let mediaRecorder = null;
let projectFilter = null;  // null = show all, string = filter to that project
let lastEventLogKey = '';  // fingerprint to avoid re-rendering unchanged event log
let lastShopKey = '';      // fingerprint for shop panel
let lastHoney = 0;         // track honey for earning animation
let lastQueenZone = 'upper'; // track queen zone for elevator

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

// --- Init ---
async function init() {
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

  app.stage.addChild(layers.floor, layers.rooms, layers.furniture, layers.bees, layers.ui);

  drawFloor();
  drawRooms();
  drawFurniture();
  createElevator();
  initAmbientBees();

  // Animation loop
  app.ticker.add(() => {
    frame++;
    updateAllBees();
    updateElevator();
  });

  // Connect WebSocket
  connectWS();

  // Bind UI
  bindUI();
}

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

    // Floor fill
    const bg = new Graphics();
    bg.roundRect(room.x, room.y, room.w, room.h, 6).fill({ color: room.color, alpha: 0.5 });
    c.addChild(bg);

    // Glass partition walls
    const walls = new Graphics();
    walls.roundRect(room.x, room.y, room.w, room.h, 6)
      .stroke({ color: P.glassBrd, width: 2, alpha: 0.6 });
    c.addChild(walls);

    // Accent strip (top edge)
    const strip = new Graphics();
    strip.roundRect(room.x, room.y, room.w, 4, 2).fill(room.accent);
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
    label.x = room.x + 8;
    label.y = room.y + 10;
    c.addChild(label);

    layers.rooms.addChild(c);
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

  // Big kawaii eyes
  // Left eye
  body.ellipse(-7 * s, -26 * s, 6.5 * s, 7 * s).fill(0xffffff);
  body.ellipse(-7 * s, -25 * s, 4.5 * s, 5 * s).fill(0x1a1a1a);
  body.circle(-5 * s, -28 * s, 2.5 * s).fill(0xffffff);
  body.circle(-9 * s, -24 * s, 1.2 * s).fill(0xffffff);
  // Right eye
  body.ellipse(7 * s, -26 * s, 6.5 * s, 7 * s).fill(0xffffff);
  body.ellipse(7 * s, -25 * s, 4.5 * s, 5 * s).fill(0x1a1a1a);
  body.circle(9 * s, -28 * s, 2.5 * s).fill(0xffffff);
  body.circle(5 * s, -24 * s, 1.2 * s).fill(0xffffff);

  // Smile
  body.arc(0, -18 * s, 4 * s, 0.15, Math.PI - 0.15).stroke({ color: 0x78716c, width: 1.5 * s });

  // Blush
  body.ellipse(-14 * s, -21 * s, 4.5 * s, 2.5 * s).fill({ color: 0xfca5a5, alpha: 0.45 });
  body.ellipse(14 * s, -21 * s, 4.5 * s, 2.5 * s).fill({ color: 0xfca5a5, alpha: 0.45 });

  // Antennae
  body.moveTo(-6 * s, -40 * s).quadraticCurveTo(-15 * s, -54 * s, -10 * s, -56 * s).stroke({ color: 0x78716c, width: 2 });
  body.moveTo(6 * s, -40 * s).quadraticCurveTo(15 * s, -54 * s, 10 * s, -56 * s).stroke({ color: 0x78716c, width: 2 });
  // Heart-shaped antenna tips
  body.circle(-12 * s, -57 * s, 3 * s).fill(beeColor);
  body.circle(-8 * s, -57 * s, 3 * s).fill(beeColor);
  body.circle(12 * s, -57 * s, 3 * s).fill(beeColor);
  body.circle(8 * s, -57 * s, 3 * s).fill(beeColor);

  c.addChild(body);

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
    // Crown
    g.moveTo(-10 * s, -40 * s).lineTo(-7 * s, -48 * s).lineTo(-2 * s, -42 * s)
     .lineTo(2 * s, -48 * s).lineTo(7 * s, -42 * s).lineTo(10 * s, -48 * s)
     .lineTo(10 * s, -40 * s).closePath();
    g.fill(0xfbbf24);
    g.stroke({ width: 1.5, color: 0xd97706 });
    g.circle(-4.5 * s, -45 * s, 1.5 * s).fill(0xef4444);
    g.circle(4.5 * s, -45 * s, 1.5 * s).fill(0x3b82f6);
    g.circle(0, -46 * s, 2 * s).fill(0xa855f7);

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
    const x = room.x + room.w * (0.3 + Math.random() * 0.4);
    const y = room.y + room.h * (0.3 + Math.random() * 0.4);

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
    };
  }
}

function updateAmbientBee(bee) {
  // Idle wandering within home room
  bee.idleTimer = (bee.idleTimer || 0) + 1;
  if (bee.idleTimer > 300 + Math.random() * 200) {
    bee.idleTimer = 0;
    const room = ROOMS.find(r => r.id === bee.homeRoom);
    if (room) {
      bee.targetX = room.x + room.w * (0.2 + Math.random() * 0.6);
      bee.targetY = room.y + room.h * (0.25 + Math.random() * 0.5);
    }
  }

  // Lerp
  bee.drawX += (bee.targetX - bee.drawX) * 0.03;
  bee.drawY += (bee.targetY - bee.drawY) * 0.03;
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
    const sx = bee.targetX * COORD_SCALE;
    const sy = bee.targetY * COORD_SCALE;

    // Determine visibility based on project filter
    const visible = !projectFilter || !bee.project || bee.project === projectFilter;

    if (localBees[bee.id]) {
      // Update existing
      const lb = localBees[bee.id];
      lb.targetX = sx;
      lb.targetY = sy;
      lb.room = bee.room;
      lb.activity = bee.activity;
      lb.gfx.visible = visible;

      // Recreate graphics if skin color changed (e.g. shop equip)
      if (bee.color && bee.color !== lb.color) {
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

      if (bee.message !== lb.lastMessage) {
        lb.lastMessage = bee.message;
        updateSpeechBubble(lb, bee.message);
      }
    } else {
      // Create new bee
      const gfx = createBeeGraphics(bee);
      const startX = bee.x * COORD_SCALE;
      const startY = bee.y * COORD_SCALE;
      gfx.x = startX;
      gfx.y = startY;
      layers.bees.addChild(gfx);

      gfx.visible = visible;
      localBees[bee.id] = {
        ...bee,
        color: bee.color,
        drawX: startX,
        drawY: startY,
        targetX: sx,
        targetY: sy,
        gfx,
        wingPhase: Math.random() * Math.PI * 2,
        lastMessage: bee.message,
      };
      updateSpeechBubble(localBees[bee.id], bee.message);
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
  bee.room = roomId;
  const room = ROOMS.find(r => r.id === roomId);
  if (room) {
    bee.targetX = room.x + room.w * (0.25 + Math.random() * 0.5);
    bee.targetY = room.y + room.h * (0.3 + Math.random() * 0.4);
  }
}

// --- Animation ---
function updateAllBees() {
  // Backend bees
  for (const bee of Object.values(localBees)) {
    const speed = bee.activity === 'arriving' ? 0.12 : 0.06;
    bee.drawX += (bee.targetX - bee.drawX) * speed;
    bee.drawY += (bee.targetY - bee.drawY) * speed;
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
        case 'chat':     handleChat(msg.payload);     break;
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

  // Update project filter dropdown
  if (state.projects) {
    updateProjectDropdown(state.projects);
  }

  // Sync ALL bees (visibility is toggled inside syncBees based on projectFilter)
  syncBees(state.bees);

  // Event log (filtered by project)
  const filteredLog = projectFilter
    ? state.eventLog.filter(e => !e.project || e.project === projectFilter)
    : state.eventLog;
  if (state.eventLog) {
    renderEventLog(filteredLog);
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

function handleChat(payload) {
  if (payload.status === 'complete' && payload.response) {
    // Remove thinking indicator
    const thinking = document.querySelector('.chat-msg.thinking');
    if (thinking) thinking.remove();

    appendChatMessage('assistant', payload.response);
  }
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

  for (const entry of entries) {
    const el = document.createElement('div');
    el.className = 'term-entry';

    const isUser = entry.event === 'UserPromptSubmit';
    const badge = isUser ? 'user' : 'stop';
    const label = isUser ? 'GOD' : 'LLM';

    const time = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    let content = entry.content || '';
    if (content.length > 5000) content = content.slice(0, 5000) + '\n...';

    el.innerHTML = `
      <div class="term-prompt">
        <span class="term-badge ${badge}">${escapeHtml(label)}</span>
        <span class="term-meta">${time}</span>
      </div>
      <div class="term-content">${escapeHtml(content)}</div>
    `;

    terminal.appendChild(el);
  }

  terminal.scrollTop = terminal.scrollHeight;
}

/** Handle real-time response messages (also flashes terminal tab) */
function handleResponse(payload) {
  if (payload.event !== 'UserPromptSubmit' && payload.event !== 'Stop') return;

  // Flash the terminal tab if not active
  const termTab = document.querySelector('.sidebar-tab[data-tab="terminal"]');
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

function initSidebarTabs() {
  const tabs = document.querySelectorAll('.sidebar-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      tab.style.color = '';
      document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.remove('active'));
      const target = tab.getAttribute('data-tab');
      const panel = document.getElementById(`${target}-panel`);
      if (panel) panel.classList.add('active');
    });
  });
}

// --- Chat ---
function toggleChat() {
  chatOpen = !chatOpen;
  document.getElementById('chat-panel').classList.toggle('hidden', !chatOpen);
  document.getElementById('btn-chat').classList.toggle('active', chatOpen);
  if (chatOpen) {
    document.getElementById('chat-input').focus();
    loadProjects();
  }
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  appendChatMessage('user', text);
  appendChatMessage('assistant', 'Thinking...', true);

  try {
    const projectId = document.getElementById('chat-project').value || undefined;
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, projectId }),
    });
    const data = await resp.json();

    // Remove thinking (handleChat may have already done this)
    const thinking = document.querySelector('.chat-msg.thinking');
    if (thinking) thinking.remove();

    if (data.ok && data.response) {
      const responseText = data.response.enhanced || data.response.title || data.response.verbatim || JSON.stringify(data.response);
      appendChatMessage('assistant', responseText);
    } else {
      appendChatMessage('assistant', data.error || 'No response');
    }
  } catch (err) {
    const thinking = document.querySelector('.chat-msg.thinking');
    if (thinking) thinking.remove();
    appendChatMessage('assistant', 'Connection error: ' + err.message);
  }
}

function appendChatMessage(role, text, isThinking = false) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const el = document.createElement('div');
  el.className = `chat-msg ${role}${isThinking ? ' thinking' : ''}`;
  el.textContent = text;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}

async function loadProjects() {
  try {
    const resp = await fetch('/api/projects');
    const data = await resp.json();
    const select = document.getElementById('chat-project');
    if (!select || !data.projects) return;

    // Keep first option
    select.innerHTML = '<option value="">No project</option>';
    for (const p of data.projects) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name || p.id;
      select.appendChild(opt);
    }
  } catch {
    // Silently fail
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
  // Sidebar toggle (mobile)
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  document.getElementById('btn-sidebar').addEventListener('click', () => {
    const open = sidebar.classList.toggle('sidebar-open');
    backdrop.classList.toggle('active', open);
  });
  backdrop.addEventListener('click', () => {
    sidebar.classList.remove('sidebar-open');
    backdrop.classList.remove('active');
  });

  document.getElementById('btn-chat').addEventListener('click', toggleChat);
  document.getElementById('btn-chat-close').addEventListener('click', toggleChat);
  document.getElementById('btn-chat-send').addEventListener('click', sendChat);
  document.getElementById('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
  });

  document.getElementById('btn-voice').addEventListener('click', () => {
    voiceEnabled = !voiceEnabled;
    document.getElementById('btn-voice').classList.toggle('active', voiceEnabled);
    if (voiceEnabled) {
      // Unlock audio on user gesture so future WebSocket-driven playback works
      ensureAudioContext();
    } else {
      // Stop playback and flush queue when voice is toggled off
      stopAllAudio();
    }
    // Tell backend to start/stop generating TTS
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'voice-toggle', enabled: voiceEnabled }));
    }
  });

  document.getElementById('btn-mic').addEventListener('click', toggleMic);

  const projectSelect = document.getElementById('project-filter');
  const deleteBtn = document.getElementById('btn-delete-project');

  projectSelect.addEventListener('change', (e) => {
    projectFilter = e.target.value || null;
    // Show/hide delete button (only when a specific project is selected)
    deleteBtn.style.display = projectFilter ? '' : 'none';
    // Force re-render of terminal and event log with new filter
    lastTerminalKey = '';
    lastEventLogKey = '';
  });

  deleteBtn.addEventListener('click', () => {
    if (!projectFilter) return;
    const name = projectFilter;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'delete-project', project: name }));
    }
    projectFilter = null;
    projectSelect.value = '';
    deleteBtn.style.display = 'none';
    lastTerminalKey = '';
    lastEventLogKey = '';
  });

  initSidebarTabs();
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

function updateProjectDropdown(projects) {
  const select = document.getElementById('project-filter');
  if (!select) return;

  // Remember current selection
  const current = select.value;

  // Rebuild options only if the list changed
  const existing = Array.from(select.options).slice(1).map(o => o.value);
  if (existing.length === projects.length && existing.every((v, i) => v === projects[i])) return;

  select.innerHTML = '<option value="">All Projects</option>';
  for (const p of projects) {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    select.appendChild(opt);
  }

  // Restore selection
  if (current && projects.includes(current)) {
    select.value = current;
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
