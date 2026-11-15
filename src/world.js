// Monde 3D : patinoire, buts, joueurs, palet, et caméra à hauteur des yeux.
import * as THREE from '../vendor/three.module.min.js';

export const EYE = 1.38; // yeux d'un patineur légèrement fléchi
const W = 26;
const L = 60;
const DEG = Math.PI / 180;

const COLORS = {
  team: 0x1e66f5,
  opp: 0xe5484d,
  dark: 0x1f2430,
  skin: 0xf1c27d,
};

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...extra });
}

function flat(geom, color, x, z, y = 0.004, opts = {}) {
  const m = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, ...opts }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}

/** Cylindre reliant deux points. */
function rod(a, b, radius, material) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, dir.length(), 10), material);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

const CORNER_R = 8.5; // coins arrondis (m), comme une vraie patinoire

/** Contour de la patinoire (coins arrondis), parcouru dans un seul sens (angle croissant). */
function rinkOutline(steps = 10) {
  const r = CORNER_R;
  const cx = W / 2 - r;
  const cz = L / 2 - r;
  const pts = [];
  // Coins dans l'ordre : (+,+) 0→90°, (-,+) 90→180°, (-,-) 180→270°, (+,-) 270→360°
  const corners = [
    [cx, cz],
    [-cx, cz],
    [-cx, -cz],
    [cx, -cz],
  ];
  corners.forEach(([ox, oz], q) => {
    for (let i = 0; i <= steps; i++) {
      const a = ((q + i / steps) * Math.PI) / 2;
      pts.push({ x: ox + Math.cos(a) * r, z: oz + Math.sin(a) * r });
    }
  });
  return pts;
}

/** Demi-largeur de la glace à la hauteur z (pour les lignes près des coins). */
function halfWidthAt(z) {
  const cz = L / 2 - CORNER_R;
  const dz = Math.abs(z) - cz;
  if (dz <= 0) return W / 2;
  return W / 2 - CORNER_R + Math.sqrt(Math.max(0, CORNER_R * CORNER_R - dz * dz));
}

/** Texture de glace : léger grain et rayures de patins, pour sentir le mouvement. */
function iceTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#eef5fa';
  g.fillRect(0, 0, 512, 512);
  // grain
  for (let i = 0; i < 2600; i++) {
    const v = 225 + Math.floor(Math.random() * 25);
    g.fillStyle = `rgba(${v - 10},${v},${v + 8},0.5)`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  // rayures de patins (traits légèrement courbes)
  g.lineCap = 'round';
  for (let i = 0; i < 120; i++) {
    g.strokeStyle = `rgba(160,185,205,${0.12 + Math.random() * 0.18})`;
    g.lineWidth = 0.6 + Math.random() * 1.2;
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const a = Math.random() * Math.PI;
    const l = 30 + Math.random() * 110;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 8, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  // ShapeGeometry : coordonnées UV en mètres → une tuile de 512 px tous les 4 m
  t.repeat.set(1 / 4, 1 / 4);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function buildRink(scene) {
  const outline = rinkOutline(12);
  const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, -p.z)));
  const ice = new THREE.Mesh(new THREE.ShapeGeometry(shape), std(0xffffff, { roughness: 0.25, map: iceTexture() }));
  ice.rotation.x = -Math.PI / 2;
  scene.add(ice);

  // Lignes
  scene.add(flat(new THREE.PlaneGeometry(W, 0.3), 0xd7263d, 0, 0));
  for (const z of [-7.5, 7.5]) scene.add(flat(new THREE.PlaneGeometry(W, 0.3), 0x1f4fd6, 0, z));
  for (const z of [-26, 26]) scene.add(flat(new THREE.PlaneGeometry(2 * halfWidthAt(26) - 0.2, 0.06), 0xd7263d, 0, z));
  // Cercles
  scene.add(flat(new THREE.RingGeometry(4.45, 4.55, 64), 0x1f4fd6, 0, 0, 0.005));
  for (const x of [-7, 7]) {
    for (const z of [-20, 20]) {
      scene.add(flat(new THREE.RingGeometry(4.45, 4.55, 64), 0xd7263d, x, z, 0.005));
      scene.add(flat(new THREE.CircleGeometry(0.3, 24), 0xd7263d, x, z, 0.006));
    }
  }
  // Enclaves (zones bleues devant les buts)
  for (const [z, start] of [[26, Math.PI], [-26, 0]]) {
    scene.add(flat(new THREE.CircleGeometry(1.8, 32, start, Math.PI), 0x8ec5ff, 0, z, 0.006, { transparent: true, opacity: 0.8 }));
  }

  // Bandes, plinthe jaune et vitres, le long du contour arrondi
  const board = std(0xffffff);
  const kick = std(0xf5c518);
  const glass = new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.12, roughness: 0.05 });
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1e-3) continue;
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    // Normale vers l'extérieur (contour parcouru dans le sens de l'angle croissant) : mur décalé de 0,15 m
    const nx = (b.z - a.z) / len;
    const nz = -(b.x - a.x) / len;
    const ox = mx + nx * 0.15;
    const oz = mz + nz * 0.15;
    const rotY = Math.atan2(-(b.z - a.z), b.x - a.x);
    for (const [mat, h, y, t] of [
      [board, 1.1, 0.55, 0.3],
      [kick, 0.2, 0.1, 0.31],
      [glass, 1.8, 2.0, 0.3],
    ]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(len + 0.02, h, t), mat);
      m.position.set(ox, y, oz);
      m.rotation.y = rotY;
      scene.add(m);
    }
  }
  buildArena(scene);
  addLogos(scene);
}

/**
 * Aréna : gradins en escalier tout autour, public (une seule « instanced mesh » : léger),
 * projecteurs au plafond et bannières. Ambiance de match sans alourdir le rendu.
 */
function buildArena(scene) {
  const stepMat = std(0x2b3a55);
  const seatMats = [0x1e66f5, 0x0b2545, 0x27406b];
  const ROWS = 7;
  const crowdPos = [];
  // Quatre côtés : chaque gradin est un « escalier » de boîtes qui s'éloigne de la bande.
  const sides = [
    { axis: 'z', at: -L / 2 - 1.2, dir: -1, len: W + 22 },
    { axis: 'z', at: L / 2 + 1.2, dir: 1, len: W + 22 },
    { axis: 'x', at: -W / 2 - 1.2, dir: -1, len: L - 4 },
    { axis: 'x', at: W / 2 + 1.2, dir: 1, len: L - 4 },
  ];
  for (const sd of sides) {
    for (let r = 0; r < ROWS; r++) {
      const off = sd.at + sd.dir * (r * 0.9 + 0.45);
      const h = 2.4 + r * 0.55;
      const geo = sd.axis === 'z' ? new THREE.BoxGeometry(sd.len, h, 0.9) : new THREE.BoxGeometry(0.9, h, sd.len);
      const m = new THREE.Mesh(geo, r % 3 === 2 ? std(seatMats[Math.floor(r / 3) % 3]) : stepMat);
      if (sd.axis === 'z') m.position.set(0, h / 2, off);
      else m.position.set(off, h / 2, 0);
      scene.add(m);
      // spectateurs sur la marche (pas partout : des places vides, c'est plus vrai)
      const n = Math.floor(sd.len / 0.75);
      for (let i = 0; i < n; i++) {
        if (Math.random() < 0.4) continue;
        const t = -sd.len / 2 + (i + 0.5) * (sd.len / n) + (Math.random() - 0.5) * 0.2;
        const pos = sd.axis === 'z' ? [t, h, off] : [off, h, t];
        crowdPos.push({ pos, face: sd.axis === 'z' ? (sd.dir > 0 ? Math.PI : 0) : sd.dir > 0 ? -Math.PI / 2 : Math.PI / 2 });
      }
    }
  }
  // Public : un corps (capsule) et une tête par spectateur, couleurs variées (beaucoup de bleu club).
  const bodyGeo = new THREE.BoxGeometry(0.38, 0.62, 0.28);
  const headGeo = new THREE.IcosahedronGeometry(0.14, 0);
  const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshLambertMaterial(), crowdPos.length);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshLambertMaterial(), crowdPos.length);
  const palette = [0x1e66f5, 0x2456b8, 0x0b2545, 0x0b2545, 0x3a3f4a, 0x2b2f38, 0x6b7a90, 0xd9dde3, 0xf5c518, 0xb33a3f];
  const skins = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  crowdPos.forEach((c, i) => {
    const [x, y, z] = c.pos;
    m4.makeRotationY(c.face);
    m4.setPosition(x, y + 0.42, z);
    bodies.setMatrixAt(i, m4);
    bodies.setColorAt(i, col.setHex(palette[(Math.random() * palette.length) | 0]));
    m4.setPosition(x, y + 0.95, z);
    heads.setMatrixAt(i, m4);
    heads.setColorAt(i, col.setHex(skins[(Math.random() * skins.length) | 0]));
  });
  scene.add(bodies, heads);
  // Plafond sombre et rampes de projecteurs au-dessus de la glace.
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff6dc });
  const rigMat = std(0x3a4454);
  for (const x of [-8, 0, 8]) {
    const rig = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, L - 8), rigMat);
    rig.position.set(x, 16, 0);
    scene.add(rig);
    for (let z = -24; z <= 24; z += 6) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.8), lampMat);
      lamp.position.set(x, 15.8, z);
      scene.add(lamp);
    }
  }
  // Bannières du club suspendues aux bouts de la patinoire.
  for (const z of [-L / 2 - 4, L / 2 + 4]) {
    for (const x of [-9, -3, 3, 9]) {
      const ban = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.4), std(x % 2 ? 0x1e66f5 : 0xf5c518, { side: THREE.DoubleSide }));
      ban.position.set(x, 11.5, z);
      scene.add(ban);
    }
  }
}

/**
 * Logo du club intégré comme dans une vraie patinoire :
 *  - peint sous la glace au centre (légèrement fondu, sous les lignes) ;
 *  - sur des panneaux aux couleurs du club, collés aux bandes (côtés et derrière les buts).
 */
function addLogos(scene) {
  const img = new Image();
  img.src = new URL('../assets/logo-club-detoure.png', import.meta.url).href;

  // --- Logo sous la glace, au centre
  const iceTex = new THREE.Texture(img);
  iceTex.colorSpace = THREE.SRGBColorSpace;
  const iceLogo = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 4.6),
    new THREE.MeshBasicMaterial({ map: iceTex, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  iceLogo.rotation.x = -Math.PI / 2;
  iceLogo.position.y = 0.002; // sous les lignes (0,004)
  scene.add(iceLogo);

  // --- Panneaux sur les bandes : bandeau bleu nuit, liseré flamme, logos répétés
  const panelTex = (len) => {
    const c = document.createElement('canvas');
    const H = 128;
    c.width = Math.round(H * (len / 0.7));
    c.height = H;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    const paint = () => {
      const g = c.getContext('2d');
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#0b2545');
      grad.addColorStop(1, '#13315c');
      g.fillStyle = grad;
      g.fillRect(0, 0, c.width, H);
      const fire = g.createLinearGradient(0, 0, c.width, 0);
      fire.addColorStop(0, '#ffd23f');
      fire.addColorStop(0.5, '#f07a00');
      fire.addColorStop(1, '#e5484d');
      g.fillStyle = fire;
      g.fillRect(0, H - 14, c.width, 8);
      g.fillStyle = 'rgba(255,255,255,0.15)';
      g.fillRect(0, 6, c.width, 3);
      if (img.complete && img.naturalWidth) {
        const sz = H * 0.92;
        const step = sz * 2.6;
        for (let x = (c.width % step) / 2 + (step - sz) / 2; x + sz <= c.width + 1; x += step) g.drawImage(img, x, (H - sz) / 2 - 4, sz, sz);
      }
      t.needsUpdate = true;
    };
    paint();
    img.addEventListener('load', paint);
    return t;
  };
  img.addEventListener('load', () => {
    iceTex.needsUpdate = true;
  });

  const H = 0.7;
  const place = (len, x, z, rotY) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), new THREE.MeshStandardMaterial({ map: panelTex(len), roughness: 0.55 }));
    m.position.set(x, 0.21 + H / 2 + 0.03, z);
    m.rotation.y = rotY;
    scene.add(m);
  };
  // Côtés : deux panneaux par côté, dans les zones droites de la bande (|z| < 21,5 m)
  for (const [z0, z1] of [
    [-19, -9],
    [9, 19],
  ]) {
    const len = z1 - z0;
    const zc = (z0 + z1) / 2;
    place(len, -W / 2 + 0.006, zc, Math.PI / 2);
    place(len, W / 2 - 0.006, zc, -Math.PI / 2);
  }
  // Derrière les buts (partie droite du fond, |x| < 4,5 m)
  place(8.4, 0, -L / 2 + 0.006, 0);
  place(8.4, 0, L / 2 - 0.006, Math.PI);
}

/** But. `dir` = +1 pour le but adverse (z = +26), ouvert vers -z. Renvoie la zone cliquable. */
function buildNet(scene, z, dir) {
  const red = std(0xd7263d, { roughness: 0.4 });
  const w = 1.83 / 2;
  const h = 1.22;
  const d = 1.0 * dir;
  const P = (x, y, zz) => new THREE.Vector3(x, y, z + zz);
  const parts = [
    [P(-w, 0, 0), P(-w, h, 0)],
    [P(w, 0, 0), P(w, h, 0)],
    [P(-w, h, 0), P(w, h, 0)],
    [P(-w, h, 0), P(-w * 0.8, 0.2, d)],
    [P(w, h, 0), P(w * 0.8, 0.2, d)],
    [P(-w, 0, 0), P(-w * 0.8, 0, d)],
    [P(w, 0, 0), P(w * 0.8, 0, d)],
    [P(-w * 0.8, 0, d), P(w * 0.8, 0, d)],
  ];
  for (const [a, b] of parts) scene.add(rod(a, b, 0.035, red));
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 1.2, 0.95),
    new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.35 }),
  );
  mesh.position.set(0, 0.6, z + d / 2);
  scene.add(mesh);

  const hit = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.8, 1.6), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(0, 0.8, z + d / 2);
  hit.userData.pick = { type: 'shoot' };
  scene.add(hit);
  return hit;
}

function numberSprite(num, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = '#fff';
  g.stroke();
  g.fillStyle = '#fff';
  g.font = `bold ${String(num).length > 2 ? 40 : 64}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(num), 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.set(0.75, 0.75, 1);
  s.renderOrder = 10;
  return s;
}

// =====================================================================
// Crosse de hockey réaliste (une seule définition pour tous les joueurs, y compris toi).
// Dimensions d'une crosse junior conformes au règlement IIHF (section 2) :
// palette ≤ 32 cm de long, 5 à 7,5 cm de haut, courbure ≤ 1,5 cm ; manche ≤ 3 cm de large.
// =====================================================================
const STICK = { L: 0.28, H: 0.065, T: 0.012, hook: 0.012, shaftW: 0.029, shaftD: 0.021, lie: 0.75 };

/** Courbe la palette : la pointe se recourbe vers la face coup droit (côté -z local). */
function bend(geo, L, hook) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = Math.max(0, p.getX(i));
    p.setZ(i, p.getZ(i) - hook * (x / L) ** 2);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Palette vue de profil : talon arrondi qui remonte vers le manche (le « hosel »), bord bas droit,
 * pointe arrondie. Repère : x du talon (0) vers la pointe (L), y vers le haut, épaisseur selon z.
 */
function bladeGeometry(L, H, T, hook) {
  const s = new THREE.Shape();
  s.moveTo(0.015, 0);
  for (let x = 0.045; x < L - 0.035; x += 0.03) s.lineTo(x, 0);
  s.lineTo(L - 0.035, 0);
  s.quadraticCurveTo(L, 0, L, H * 0.5);
  s.quadraticCurveTo(L, H, L - 0.04, H * 0.98);
  for (let x = L - 0.07; x > 0.05; x -= 0.03) s.lineTo(x, H * (1 + 0.06 * (1 - x / L)));
  s.lineTo(0.035, H * 1.08);
  s.quadraticCurveTo(0.008, H * 1.15, 0.004, H * 1.6);
  s.lineTo(-0.02, H * 1.6);
  s.quadraticCurveTo(-0.02, 0.008, 0.015, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -T / 2);
  return bend(g, L, hook);
}

/** Ruban blanc sur la palette (un peu plus épais pour qu'il dépasse des deux côtés). */
function tapeGeometry(L, H, T, hook) {
  const s = new THREE.Shape();
  const x0 = 0.07;
  const x1 = L - 0.012;
  s.moveTo(x0, 0.005);
  for (let x = x0 + 0.03; x < x1; x += 0.03) s.lineTo(x, 0.005);
  s.lineTo(x1, 0.005);
  s.lineTo(x1, H - 0.008);
  for (let x = x1 - 0.03; x > x0; x -= 0.03) s.lineTo(x, H - 0.006);
  s.lineTo(x0, H - 0.004);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: T + 0.004, bevelEnabled: false });
  g.translate(0, 0, -(T + 0.004) / 2);
  return bend(g, L, hook);
}

/** Oriente un objet dont l'axe local +x doit suivre la direction (ux, uz) sur la glace. */
function alongX(obj, ux, uz) {
  obj.rotation.y = Math.atan2(-uz, ux);
}

/** Manche rectangulaire (comme une vraie crosse) entre deux points. */
function shaftBetween(a, b, mat, w = 0.03, d = 0.022) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const geo = new THREE.BoxGeometry(w, 1, d);
  geo.translate(0, 0.5, 0);
  const m = new THREE.Mesh(geo, mat);
  m.scale.y = dir.length();
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

// Position de la crosse dans le repère du joueur (+z devant lui, -x à sa droite), pour un DROITIER :
// main du haut (gauche) devant la hanche gauche ; le manche descend en travers du corps (environ 50°
// avec la glace) ; la palette prolonge le manche, posée à plat devant le patin droit, pointe vers
// l'extérieur et vers l'avant ; le coup droit (creux) regarde vers l'avant-gauche.
// Un gaucher est le miroir exact.
const STICK_HANDS = new THREE.Vector3(0.3, 0.98, 0.3);
const STICK_U = new THREE.Vector2(-0.75, 0.66).normalize(); // direction talon → pointe, vue de dessus
export const STICK_HEEL = new THREE.Vector3(STICK_HANDS.x + STICK_U.x * STICK.lie, 0, STICK_HANDS.z + STICK_U.y * STICK.lie);
const STICK_N = new THREE.Vector2(-STICK_U.y, STICK_U.x).negate(); // normale côté coup droit (avant-gauche)
/** Où se trouve le palet porté (centre), dans le repère du joueur droitier. */
export const STICK_PUCK = new THREE.Vector3(
  STICK_HEEL.x + STICK_U.x * 0.14 + STICK_N.x * 0.065,
  0,
  STICK_HEEL.z + STICK_U.y * 0.14 + STICK_N.y * 0.065,
);

function makeStick({ hand = 'R', goalie = false } = {}) {
  const L = goalie ? 0.38 : STICK.L;
  const H = goalie ? 0.09 : STICK.H;
  const mat = std(goalie ? 0x8b5a2b : 0x1f2430, { roughness: 0.5 });
  const tapeMat = std(0xf2f2f2, { roughness: 0.95 });
  const g = new THREE.Group();
  g.name = 'stick';
  const blade = new THREE.Group();
  blade.add(new THREE.Mesh(bladeGeometry(L, H, STICK.T, STICK.hook), mat));
  blade.add(new THREE.Mesh(tapeGeometry(L, H, STICK.T, STICK.hook), tapeMat));
  blade.position.copy(STICK_HEEL);
  alongX(blade, STICK_U.x, STICK_U.y);
  g.add(blade);
  // Le manche part du haut du talon (hosel) et monte jusqu'aux mains, dans le plan de la palette.
  const hosel = new THREE.Vector3(STICK_HEEL.x - STICK_U.x * 0.008, H * 1.55, STICK_HEEL.z - STICK_U.y * 0.008);
  const dir = new THREE.Vector3().subVectors(STICK_HANDS, hosel).normalize();
  const butt = STICK_HANDS.clone().addScaledVector(dir, 0.12);
  g.add(shaftBetween(hosel, butt, mat, STICK.shaftW, STICK.shaftD));
  // Ruban au bout du manche (le « pommeau »)
  const knob = shaftBetween(butt.clone().addScaledVector(dir, -0.08), butt.clone().addScaledVector(dir, 0.01), tapeMat, STICK.shaftW + 0.006, STICK.shaftD + 0.006);
  g.add(knob);
  if (hand === 'L') g.scale.x = -1;
  return g;
}

// Matériaux partagés (une seule copie pour tous les joueurs : plus léger sur téléphone).
const MAT = {};
function mat(key, color, extra) {
  if (!MAT[key]) MAT[key] = std(color, extra);
  return MAT[key];
}
const BACK_TEX = new Map();
/** Numéro imprimé dans le dos du maillot. */
function backNumber(num) {
  const key = String(num);
  if (!BACK_TEX.has(key)) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d');
    g.font = `900 ${key.length > 2 ? 52 : 86}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.strokeStyle = '#0b2545';
    g.strokeText(key, 64, 70);
    g.fillStyle = '#ffffff';
    g.fillText(key, 64, 70);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    BACK_TEX.set(key, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  }
  return BACK_TEX.get(key);
}

/**
 * Fusionne les pièces d'un groupe qui partagent le même matériau (une seule pièce à dessiner par
 * matériau au lieu de dizaines) : beaucoup plus fluide sur téléphone. Les sous-groupes animés
 * (jambes) ne sont pas touchés.
 */
function mergeByMaterial(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  for (const ch of [...group.children]) {
    if (!ch.isMesh || ch.material.map) continue;
    const geo = ch.geometry.index ? ch.geometry.toNonIndexed() : ch.geometry.clone();
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, ch.matrixWorld));
    if (!buckets.has(ch.material)) buckets.set(ch.material, []);
    buckets.get(ch.material).push(geo);
    group.remove(ch);
  }
  for (const [m, geos] of buckets) {
    let n = 0;
    for (const g2 of geos) n += g2.attributes.position.count;
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    let o = 0;
    for (const g2 of geos) {
      pos.set(g2.attributes.position.array, o * 3);
      if (g2.attributes.normal) nor.set(g2.attributes.normal.array, o * 3);
      o += g2.attributes.position.count;
      g2.dispose();
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    group.add(new THREE.Mesh(merged, m));
  }
}

/**
 * Joueur de hockey (environ 1,75 m) : patins avec lame, bas rayés, culotte, maillot avec épaulières
 * et bandes, gants, casque avec grille, numéro dans le dos. Gardien : jambières, bouclier, mitaine,
 * plastron et masque. Jambes articulées à la hanche (foulées), corps qui se penche (voir animateTo).
 */
function makePlayer({ team, num, goalie, hand = 'R', me = false }) {
  const g = new THREE.Group();
  const jc = team ? COLORS.team : COLORS.opp;
  const tk = team ? 'T' : 'O';
  const jersey = mat('jersey' + tk, jc);
  const trim = mat('trim' + tk, team ? 0x0b2545 : 0x7a1020);
  const white = mat('white', 0xf4f6f8);
  const dark = mat('dark', COLORS.dark);
  const steel = mat('steel', 0xc9d1d9, { metalness: 0.7, roughness: 0.25 });
  const skin = mat('skin', COLORS.skin);
  const cyl = (rt, rb, h, m, seg = 12) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);

  // --- Jambes (articulées à la hanche)
  const legs = [];
  for (const sx of [-0.12, 0.12]) {
    const hip = new THREE.Group();
    hip.position.set(sx, 0.7, 0);
    // bas : couleur du maillot avec deux bandes
    const sock = cyl(0.085, 0.075, 0.42, goalie ? white : jersey, 12);
    sock.position.y = -0.3;
    hip.add(sock);
    if (!goalie) {
      for (const y of [-0.22, -0.3]) {
        const st = cyl(0.087, 0.087, 0.035, y === -0.22 ? white : trim, 12);
        st.position.y = y;
        hip.add(st);
      }
    }
    // patin : chaussure, embout, support et lame
    const boot = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.2, 3, 8), dark);
    boot.rotation.x = Math.PI / 2;
    boot.position.set(0, -0.6, 0.05);
    hip.add(boot);
    const cuff = cyl(0.075, 0.07, 0.1, dark, 12);
    cuff.position.y = -0.53;
    hip.add(cuff);
    const holder = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.3), white);
    holder.position.set(0, -0.66, 0.05);
    hip.add(holder);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.025, 0.33), steel);
    blade.position.set(0, -0.69, 0.05);
    hip.add(blade);
    if (goalie) {
      // jambière : grand bloc blanc arrondi, bord de la couleur de l'équipe
      const pad = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.5, 3, 8), white);
      pad.scale.set(1, 1, 0.75);
      pad.position.set(sx > 0 ? 0.02 : -0.02, -0.3, 0.09);
      hip.add(pad);
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.03), jersey);
      band.position.set(0, -0.12, 0.2);
      hip.add(band);
    }
    g.add(hip);
    legs.push(hip);
  }

  // --- Culotte (large, rembourrée) avec une bande
  const pants = cyl(0.26, 0.3, 0.36, trim, 16);
  pants.position.y = 0.8;
  g.add(pants);
  const belt = cyl(0.262, 0.262, 0.04, jersey, 16);
  belt.position.y = 0.95;
  g.add(belt);

  // --- Maillot : tronc, épaulières, bande du bas
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.26, 4, 12), jersey);
  torso.scale.set(1.12, 1, goalie ? 1.05 : 0.82);
  torso.position.y = 1.2;
  g.add(torso);
  for (const sx of [-1, 1]) {
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), jersey);
    sh.scale.set(1.1, 0.8, 1);
    sh.position.set(0.3 * sx, 1.42, 0);
    g.add(sh);
  }
  const hem = cyl(0.3, 0.3, 0.06, white, 16);
  hem.scale.z = 0.82;
  hem.position.y = 1.0;
  g.add(hem);
  const hem2 = cyl(0.302, 0.302, 0.03, trim, 16);
  hem2.scale.z = 0.82;
  hem2.position.y = 1.045;
  g.add(hem2);

  // --- Bras (épaule → coude → main sur la crosse) et gants
  const arms = new THREE.Group();
  const top = STICK_HANDS.clone(); // main du haut (droitier : main gauche, côté +x)
  const lowHand = top.clone().lerp(new THREE.Vector3(STICK_HEEL.x, 0.1, STICK_HEEL.z), 0.4); // main du bas, sur le manche
  for (const [sx, hnd] of [
    [1, top],
    [-1, lowHand],
  ]) {
    const sh = new THREE.Vector3(0.32 * sx, 1.38, 0);
    const el = new THREE.Vector3(0.36 * sx, 1.12, 0.1);
    arms.add(rod(sh, el, 0.075, jersey));
    const fore = rod(el, hnd, 0.065, jersey);
    arms.add(fore);
    const cuffBand = rod(el.clone().lerp(hnd, 0.55), el.clone().lerp(hnd, 0.7), 0.068, white);
    arms.add(cuffBand);
    const glove = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.08, 3, 6), goalie ? white : dark);
    glove.position.copy(hnd);
    arms.add(glove);
  }
  if (goalie) {
    // bouclier (main de la crosse) et mitaine (main libre)
    const blocker = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.32, 0.22), white);
    blocker.position.set(-0.05, 0.7, 0.42);
    arms.add(blocker);
    const catcher = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), white);
    catcher.scale.set(0.6, 1, 1);
    catcher.position.set(0.42, 1.0, 0.3);
    arms.add(catcher);
  }
  if (hand === 'L') arms.scale.x = -1;
  g.add(arms);

  // --- Cou, tête, casque (ou masque de gardien)
  const neck = cyl(0.07, 0.08, 0.08, trim, 10);
  neck.position.y = 1.53;
  g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), skin);
  head.position.y = 1.64;
  g.add(head);
  if (goalie) {
    const mask = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), white);
    mask.scale.set(0.95, 1.12, 1.05);
    mask.position.y = 1.65;
    g.add(mask);
    const grid = new THREE.Mesh(new THREE.SphereGeometry(0.152, 10, 8, -0.9, 1.8, 0.9, 1.1), new THREE.MeshBasicMaterial({ color: 0x222222, wireframe: true }));
    grid.position.y = 1.65;
    grid.scale.set(0.95, 1.12, 1.05);
    g.add(grid);
  } else {
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.145, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), team ? mat('helmT', 0x0b2545) : mat('helmO', 0x1f2430));
    helmet.scale.set(1, 1, 1.12);
    helmet.position.y = 1.66;
    g.add(helmet);
    // grille du casque (devant le visage)
    const grid = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 6, -0.75, 1.5, 1.2, 0.9), new THREE.MeshBasicMaterial({ color: 0xbfc7cf, wireframe: true }));
    grid.position.y = 1.66;
    g.add(grid);
    const chin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.035, 0.04), dark);
    chin.position.set(0, 1.53, 0.1);
    g.add(chin);
  }
  // Yeux (pour savoir tout de suite si on voit le joueur de face ou de dos)
  for (const sx of [-0.045, 0.045]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), white);
    eye.position.set(sx, 1.65, 0.105);
    g.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 5), dark);
    pupil.position.set(sx, 1.65, 0.122);
    g.add(pupil);
  }
  // Numéro dans le dos
  if (num != null && num !== 'TOI') {
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), backNumber(num));
    back.position.set(0, 1.24, -0.245);
    back.rotation.y = Math.PI;
    g.add(back);
  } else {
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.07, 0.02), white);
    back.position.set(0, 1.3, -0.235);
    g.add(back);
  }
  mergeByMaterial(arms);
  for (const leg of legs) mergeByMaterial(leg);
  mergeByMaterial(g);
  g.add(makeStick({ hand, goalie }));

  if (goalie) g.scale.set(1.15, 1.02, 1.15);

  // Tout le corps dans un groupe qui peut se pencher en avant quand on patine.
  const body = new THREE.Group();
  while (g.children.length) body.add(g.children[0]);
  g.add(body);
  // Ombre douce sous le joueur
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 20),
    new THREE.MeshBasicMaterial({ color: 0x0b2545, transparent: true, opacity: 0.18, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.006;
  g.add(shadow);
  g.userData.anim = { body, legs, phase: Math.random() * 6, last: null };

  if (num != null) {
    const label = numberSprite(num, me ? '#e0a800' : team ? '#1e66f5' : '#e5484d');
    label.position.y = 2.15;
    g.add(label);
  }

  return g;
}

/** Ma crosse : la même que celle des autres joueurs, portée par mon corps (pas collée à la caméra). */
/** Foulées et inclinaison d'un joueur selon sa vitesse réelle (appelé à chaque déplacement). */
function animateTo(mesh, x, z) {
  const an = mesh.userData.anim;
  const now = performance.now();
  if (an && an.last) {
    const dt = Math.max(0.001, (now - an.last.t) / 1000);
    const v = Math.hypot(x - an.last.x, z - an.last.z) / dt;
    an.v = an.v == null ? v : an.v + (v - an.v) * Math.min(1, dt * 8);
    const k = Math.min(1, an.v / 4.5);
    // Foulée de patinage (pas de marche) : chaque jambe pousse en diagonale vers l'arrière et
    // l'extérieur pendant que l'autre glisse sous le corps ; le corps penché bascule sur la
    // jambe qui glisse. Cadence plus lente et poussée plus longue qu'un pas.
    an.phase += dt * (2.4 + an.v * 1.0);
    for (let i = 0; i < 2; i++) {
      const push = Math.max(0, Math.sin(an.phase + i * Math.PI)); // 0 = glisse, 1 = poussée max
      const out = i === 0 ? -1 : 1; // legs[0] est à droite du joueur (côté -x)
      an.legs[i].rotation.z = out * (0.05 + 0.42 * push) * k; // jambe écartée vers l'extérieur
      an.legs[i].rotation.x = (0.32 * push - 0.12 * (1 - push)) * k; // tendue vers l'arrière
    }
    const sway = Math.sin(an.phase);
    an.body.rotation.x = 0.36 * k; // penché en avant
    an.body.rotation.z = 0.08 * k * sway; // bascule sur la jambe qui glisse
    an.body.position.x = 0.06 * k * sway;
    an.body.position.y = -0.13 * k; // genoux fléchis
  }
  if (an) an.last = { x, z, t: now };
  mesh.position.set(x, 0, z);
}

function buildMyStick(hand) {
  const grp = new THREE.Group();
  const stick = makeStick({ hand });
  // En vue joueur, le bout du manche est dans ta main : on masque le pommeau, qui serait collé à l'écran.
  stick.children[2].visible = false;
  const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 24), std(0x111111, { roughness: 0.4 }));
  puck.position.set(STICK_PUCK.x * (hand === 'L' ? -1 : 1), 0.015, STICK_PUCK.z);
  grp.add(stick, puck);
  grp.userData = { stick, puck };
  return grp;
}

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x182840);
  scene.fog = new THREE.Fog(0x182840, 50, 120);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.7));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(6, 20, -8);
  scene.add(sun);

  buildRink(scene);
  const netHit = buildNet(scene, 26, 1);
  buildNet(scene, -26, -1);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 250);
  scene.add(camera);
  let myStick = buildMyStick('R');
  scene.add(myStick);

  const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 20), std(0x111111, { roughness: 0.4 }));
  puck.position.set(0, 0.02, 0);
  scene.add(puck);
  // Ombre du palet : on voit bien quand il vole (tir haut, passe levée).
  const puckShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.08, 16),
    new THREE.MeshBasicMaterial({ color: 0x0b2545, transparent: true, opacity: 0.3, depthWrite: false }),
  );
  puckShadow.rotation.x = -Math.PI / 2;
  scene.add(puckShadow);

  const actors = new THREE.Group();
  scene.add(actors);
  let pickables = [netHit];
  let hfov = 78 * DEG;
  let side = 1; // 1 = palette à droite, -1 = à gauche
  let stickSwing = null;
  let myStickWanted = false;
  let lookDrop = 0.9; // regard légèrement vers la glace (plus en portrait)
  const raycaster = new THREE.Raycaster();

  // Vue à la 3e personne (option) : caméra derrière et au-dessus du joueur, qui est visible.
  let third = false;
  let high = false; // « vue de haut » : caméra en hauteur, en plongée sur la glace
  let plainLens = false; // objectif : false (jeu), 'drill' (exercices) ou true (centré, voir setPlainLens)
  let baseFov3 = 60;
  const chase = { yaw: null, speed: 0, t: performance.now(), bob: 0 };
  let meMesh = null;
  let meHand = 'R';
  const meGroup = new THREE.Group();
  scene.add(meGroup);
  function buildMe() {
    meGroup.clear();
    meMesh = makePlayer({ team: true, num: null, hand: meHand });
    // Repère au-dessus de la tête pour se retrouver facilement
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 32), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    meMesh.add(ring);
    meGroup.add(meMesh);
    meGroup.visible = false;
  }
  buildMe();

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Grands écrans (tablettes) : on limite le nombre de pixels dessinés pour rester fluide.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(w * h * dpr * dpr > 2.6e6 ? Math.max(1, Math.sqrt(2.6e6 / (w * h))) : dpr);
    renderer.setSize(w, h, false);
    const aspect = w / h;
    const portrait = aspect < 1;
    camera.clearViewOffset();
    if (third) {
      // 3e personne : champ classique (95° en paysage, 64° en portrait) ; vue de haut un peu plus large.
      const t3 = (high ? (portrait ? 78 : 100) : portrait ? 64 : 95) * DEG;
      let v3 = 2 * Math.atan(Math.tan(t3 / 2) / aspect);
      v3 = Math.min(118 * DEG, Math.max(40 * DEG, v3));
      baseFov3 = v3 / DEG;
      camera.fov = v3 / DEG;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      hfov = 2 * Math.atan(Math.tan(v3 / 2) * aspect);
      return;
    }
    if (portrait && plainLens !== true) {
      // 1re personne en PORTRAIT : l'écran est haut et étroit. Tout ce qui compte (joueurs, buts) est
      // autour de l'horizon. Plutôt qu'une vue « fish-eye » très haute où tout est minuscule :
      //   - un champ de 85° en largeur (joueurs ~1,5 fois plus grands qu'avant) ;
      //   - un objectif « décentré » : le regard reste horizontal (pas de déformation), mais
      //     l'horizon est remonté au quart supérieur de l'écran ; le bas montre ta crosse et le palet.
      // (Exercices courts : la consigne occupe le haut de l'écran → horizon plus bas, champ plus large.)
      const drill = plainLens === 'drill';
      const hf = (drill ? 95 : 85) * DEG;
      const th = (2 * Math.tan(hf / 2)) / aspect; // hauteur visible (en tangentes)
      const top = th * (drill ? 0.4 : 0.27);
      const half = th - top; // cadre virtuel symétrique autour de l'axe
      const fullH = (h * 2 * half) / th;
      camera.fov = (2 * Math.atan(half)) / DEG;
      camera.aspect = w / fullH;
      camera.setViewOffset(w, fullH, 0, ((half - top) / (2 * half)) * fullH, w, h);
      camera.updateProjectionMatrix();
      hfov = hf;
      lookDrop = Math.tan(3 * DEG) * 10;
      return;
    }
    // Paysage : vue large, type « fish-eye » (130° en largeur) pour voir le jeu autour de soi.
    const target = (portrait ? 110 : 130) * DEG;
    let v = 2 * Math.atan(Math.tan(target / 2) / aspect);
    v = Math.min((portrait ? 150 : 115) * DEG, Math.max(40 * DEG, v));
    camera.fov = v / DEG;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    hfov = 2 * Math.atan(Math.tan(v / 2) * aspect);
    // Regard incliné juste assez pour garder la palette et le palet dans le bas de l'écran,
    // quel que soit le format (téléphone allongé ou tablette).
    const pitch = Math.min(35 * DEG, Math.max(18 * DEG, 63 * DEG - v / 2));
    lookDrop = Math.tan(pitch) * 10;
  }

  resize();

  return {
    camera,
    puck,
    resize,
    getHfov: () => hfov,
    /** Statistiques de rendu (objets dessinés, triangles) : pour vérifier la fluidité. */
    renderInfo: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
    /** Active ou non la vue à la 3e personne. */
    setThirdPerson(on, isHigh = false) {
      third = !!on;
      high = !!on && !!isHigh;
      resize();
    },
    /**
     * Objectif : false = jeu ; 'drill' = exercices courts en vue joueur (horizon sous la consigne) ;
     * true = objectif centré, sans décentrement (exercices qui cadrent eux-mêmes la caméra).
     */
    setPlainLens(mode) {
      plainLens = mode === true || mode === 'drill' ? mode : false;
      resize();
    },
    isThirdPerson: () => third,
    /** Montre ou cache ton joueur (vue 3e personne). */
    showMe(on) {
      meGroup.visible = !!on && third;
      myStick.visible = !third && myStickWanted;
    },
    /** Caméra 3e personne : derrière et au-dessus du joueur, dans la direction du regard. */
    setChase(x, z, bodyYaw, viewYaw, speed = 0) {
      if (meMesh) {
        animateTo(meMesh, x, z);
        meMesh.rotation.y = bodyYaw;
      }
      // Un peu en hauteur derrière la tête ; on vise devant le joueur pour le voir en bas de l'écran
      // avec sa crosse et le palet, et le jeu devant lui.
      const now = performance.now();
      const dt = Math.min(0.05, (now - chase.t) / 1000);
      chase.t = now;
      // La caméra suit le regard avec un léger retard (on sent les virages)…
      if (chase.yaw == null) chase.yaw = viewYaw;
      const dy = Math.atan2(Math.sin(viewYaw - chase.yaw), Math.cos(viewYaw - chase.yaw));
      chase.yaw += dy * Math.min(1, dt * 6);
      // … et recule, s'abaisse et s'élargit avec la vitesse (on sent la vitesse).
      chase.speed += (Math.abs(speed) - chase.speed) * Math.min(1, dt * 3);
      const k = Math.min(1, chase.speed / 4.8);
      chase.bob += dt * (6 + chase.speed * 2);
      const bob = Math.sin(chase.bob) * 0.05 * k;
      const yaw = chase.yaw;
      const portrait = camera.aspect < 1;
      // Vue de haut : en plongée, on voit les joueurs tout autour (même un peu derrière soi).
      // 3e personne en portrait : plus haut et plus incliné qu'en paysage, pour remplir l'écran
      // de glace plutôt que de plafond.
      let back;
      let height;
      let ahead;
      if (high) {
        back = (portrait ? 4.2 : 5.6) + 0.8 * k;
        height = (portrait ? 8.4 : 8) + 0.6 * k + bob;
        ahead = portrait ? 3.5 : 8;
      } else if (portrait) {
        back = 5 + 1.1 * k;
        height = 5.6 - 0.4 * k + bob;
        ahead = 5.5;
      } else {
        back = 4.6 + 1.1 * k;
        height = 3.9 - 0.5 * k + bob;
        ahead = 6.5;
      }
      camera.up.set(0, 1, 0);
      camera.position.set(x - Math.sin(yaw) * back, height, z - Math.cos(yaw) * back);
      camera.lookAt(x + Math.sin(yaw) * ahead, 0, z + Math.cos(yaw) * ahead);
      const fov = baseFov3 * (1 + 0.14 * k);
      if (Math.abs(camera.fov - fov) > 0.05) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    },
    setHand(hand) {
      meHand = hand;
      buildMe();
      side = hand === 'L' ? -1 : 1;
      const vis = myStick.visible;
      const holding = myStick.userData.puck.visible;
      scene.remove(myStick);
      myStick = buildMyStick(hand);
      myStick.visible = vis;
      myStick.userData.puck.visible = holding;
      scene.add(myStick);
    },
    /** Place ma crosse avec mon corps (position et orientation du corps, pas de la tête). */
    setBody(x, z, yaw) {
      myStick.position.set(x, 0, z);
      // Petit geste de crosse au moment de la passe ou du tir (balayage coup droit ou revers).
      let swing = 0;
      if (stickSwing) {
        const k = (performance.now() - stickSwing.t0) / 300;
        if (k >= 1) stickSwing = null;
        else swing = stickSwing.dir * Math.sin(k * Math.PI) * 0.45;
      }
      myStick.rotation.y = yaw + swing;
    },
    /** dir : +1 = balayage vers la gauche, -1 = vers la droite. */
    swingStick(dir) {
      stickSwing = { dir, t0: performance.now() };
    },
    /** Hauteur (en pixels) de la ligne d'horizon à l'écran. */
    horizonY() {
      const p = camera.position;
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      dir.y = 0;
      dir.normalize();
      const v = new THREE.Vector3(p.x + dir.x * 300, 0, p.z + dir.z * 300).project(camera);
      return ((1 - v.y) / 2) * window.innerHeight;
    },
    /** Point de la glace sous un point de l'écran (en pixels), ou null. */
    groundPoint(sx, sy) {
      raycaster.setFromCamera(new THREE.Vector2((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1), camera);
      const r = raycaster.ray;
      if (r.direction.y >= -1e-4) return null;
      const t = -r.origin.y / r.direction.y;
      return { x: r.origin.x + r.direction.x * t, z: r.origin.z + r.direction.z * t };
    },
    setStickVisible(v) {
      myStickWanted = v;
      myStick.visible = v && !(third && meGroup.visible);
    },
    /** Palet sur ma crosse (vue joueur) ou palet libre sur la glace. */
    setHolding(h) {
      myStick.userData.puck.visible = h;
      puck.visible = !h;
    },
    setView(x, z, yaw, eye = EYE) {
      camera.position.set(x, eye, z);
      camera.lookAt(x + Math.sin(yaw) * 10, eye - lookDrop, z + Math.cos(yaw) * 10);
    },
    clearActors() {
      while (actors.children.length) actors.remove(actors.children[0]);
      pickables = [netHit];
    },
    /** Cible au sol (disque avec une lettre), touchable : pick = { type: 'spot', id }. */
    addMarker(x, z, label, color = '#ffd23f', textRot = 0) {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = color;
      g.globalAlpha = 0.85;
      g.beginPath();
      g.arc(64, 64, 58, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      g.lineWidth = 8;
      g.strokeStyle = '#fff';
      g.stroke();
      g.fillStyle = '#0b2545';
      g.font = 'bold 72px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(label, 64, 68);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.CircleGeometry(1.25, 32), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      m.rotation.set(-Math.PI / 2, 0, textRot); // lettre lisible depuis la caméra
      m.position.set(x, 0.02, z);
      m.userData.pick = { type: 'spot', id: label };
      actors.add(m);
      pickables.push(m);
      return m;
    },
    /** Ajoute un joueur ; renvoie un objet avec setPos(x, z). */
    addActor({ team, num, goalie, pickable, hand, me }) {
      const mesh = makePlayer({ team, num: me ? 'TOI' : num, goalie, hand, me });
      if (me) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.62, 32), new THREE.MeshBasicMaterial({ color: 0xffd23f, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.012;
        mesh.add(ring);
      }
      mesh.rotation.y = team ? 0 : Math.PI;
      actors.add(mesh);
      if (pickable) {
        const hit = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 2.6, 10), new THREE.MeshBasicMaterial({ visible: false }));
        hit.position.y = 1.3;
        hit.userData.pick = { type: 'pass', num };
        mesh.add(hit);
        pickables.push(hit);
      }
      return {
        mesh,
        setPos(x, z) {
          animateTo(mesh, x, z);
        },
        face(x, z) {
          mesh.rotation.y = Math.atan2(x - mesh.position.x, z - mesh.position.z);
        },
      };
    },
    pick(ndcX, ndcY) {
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      const hit = raycaster.intersectObjects(pickables, false)[0];
      return hit ? hit.object.userData.pick : null;
    },
    render() {
      puckShadow.visible = puck.visible;
      puckShadow.position.set(puck.position.x, 0.004, puck.position.z);
      const k = 1 + puck.position.y * 1.5;
      puckShadow.scale.set(k, k, 1);
      puckShadow.material.opacity = 0.3 / k;
      renderer.render(scene, camera);
    },
  };
}
