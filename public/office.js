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
let chatOpen = false;
let recording = false;
let mediaRecorder = null;
let lastLogCount = 0;

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
  initAmbientBees();

  // Animation loop
  app.ticker.add(() => {
    frame++;
    updateAllBees();
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
  drawPlant(g, 920, 460);
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
      wordWrapWidth: 140,
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

  const truncated = message.length > 55 ? message.slice(0, 55) + '...' : message;
  bubble._text.text = truncated;
  bubble.visible = true;

  // Redraw background to fit text
  const tw = Math.min(bubble._text.width + 16, 160);
  const th = bubble._text.height + 12;
  bubble._bg.clear();
  bubble._bg.roundRect(0, 0, tw, th, 6).fill({ color: P.white, alpha: 0.95 });
  bubble._bg.roundRect(0, 0, tw, th, 6).stroke({ color: P.glassBrd, width: 1 });
  // Pointer
  bubble._bg.moveTo(tw / 2 - 5, th).lineTo(tw / 2, th + 6).lineTo(tw / 2 + 5, th).fill({ color: P.white, alpha: 0.95 });
  bubble.x = -tw / 2;
  bubble.y = -th - 30;

  // Auto-hide after 5s
  if (beeObj.bubbleTimer) clearTimeout(beeObj.bubbleTimer);
  beeObj.bubbleTimer = setTimeout(() => {
    bubble.visible = false;
  }, 5000);
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

    if (localBees[bee.id]) {
      // Update existing
      const lb = localBees[bee.id];
      lb.targetX = sx;
      lb.targetY = sy;
      lb.room = bee.room;
      lb.activity = bee.activity;
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

      localBees[bee.id] = {
        ...bee,
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

  // Session status
  if (state.sessionActive) {
    setConnectionStatus('active', state.currentTool ? `Using ${state.currentTool}` : 'Working...');
  }

  // Sync bees
  syncBees(state.bees);

  // Event log
  if (state.eventLog && state.eventLog.length !== lastLogCount) {
    renderEventLog(state.eventLog);
    lastLogCount = state.eventLog.length;
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

  // Decode base64 MP3 and queue
  const binary = atob(payload.audio);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'audio/mpeg' });
  const url = URL.createObjectURL(blob);

  console.log(`[speech] Queued audio (${bytes.length} bytes), queue length: ${audioQueue.length + 1}`);
  audioQueue.push({ url, text: payload.text });
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

function playNextAudio() {
  if (audioQueue.length === 0) { isPlaying = false; return; }
  isPlaying = true;
  const { url } = audioQueue.shift();
  const audio = new Audio(url);
  audio.onended = () => { URL.revokeObjectURL(url); playNextAudio(); };
  audio.onerror = (e) => {
    console.error('[speech] Audio error:', e);
    URL.revokeObjectURL(url);
    playNextAudio();
  };
  audio.play().then(() => {
    console.log('[speech] Playing audio');
  }).catch((err) => {
    console.error('[speech] Play blocked:', err.message);
    URL.revokeObjectURL(url);
    playNextAudio();
  });
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

function handleResponse(payload) {
  // Only show user input and Claude's conversational output
  if (payload.event !== 'UserPromptSubmit' && payload.event !== 'Stop') return;

  const terminal = document.getElementById('terminal-output');
  if (!terminal) return;

  const entry = document.createElement('div');
  entry.className = 'term-entry';

  const isUser = payload.event === 'UserPromptSubmit';
  const badge = isUser ? 'user' : 'stop';
  const label = isUser ? 'GOD' : 'LLM';

  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  let content = payload.content || '';
  if (content.length > 5000) content = content.slice(0, 5000) + '\n...';

  entry.innerHTML = `
    <div class="term-prompt">
      <span class="term-badge ${badge}">${escapeHtml(label)}</span>
      <span class="term-meta">${time}</span>
    </div>
    <div class="term-content">${escapeHtml(content)}</div>
  `;

  terminal.appendChild(entry);
  terminal.scrollTop = terminal.scrollHeight;

  while (terminal.children.length > MAX_TERMINAL_ENTRIES) {
    terminal.removeChild(terminal.firstChild);
  }

  // Flash the terminal tab if not active
  const termTab = document.querySelector('.sidebar-tab[data-tab="terminal"]');
  if (termTab && !termTab.classList.contains('active')) {
    termTab.style.color = '#FCD34D';
    setTimeout(() => { if (!termTab.classList.contains('active')) termTab.style.color = ''; }, 2000);
  }
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

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    const chunks = [];

    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: 'audio/webm' });

      try {
        const resp = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'audio/webm' },
          body: blob,
        });
        const data = await resp.json();
        if (data.transcript) {
          showSubtitle(`You: ${data.transcript}`);
        }
      } catch (err) {
        console.error('[mic] Upload error:', err);
      }
    };

    mediaRecorder.start();
    recording = true;
    btn.classList.add('recording');
  } catch (err) {
    console.error('[mic] Access denied:', err);
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
  document.getElementById('btn-chat').addEventListener('click', toggleChat);
  document.getElementById('btn-chat-close').addEventListener('click', toggleChat);
  document.getElementById('btn-chat-send').addEventListener('click', sendChat);
  document.getElementById('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
  });

  document.getElementById('btn-voice').addEventListener('click', () => {
    voiceEnabled = !voiceEnabled;
    document.getElementById('btn-voice').classList.toggle('active', voiceEnabled);
    // Unlock audio on user gesture so future WebSocket-driven playback works
    if (voiceEnabled) ensureAudioContext();
    // Tell backend to start/stop generating TTS
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'voice-toggle', enabled: voiceEnabled }));
    }
  });

  document.getElementById('btn-mic').addEventListener('click', toggleMic);

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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- Start ---
init().catch(console.error);
