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
  // Tribunes
  for (const [sx, sz, x, z] of [
    [W + 30, 10, 0, -L / 2 - 6],
    [W + 30, 10, 0, L / 2 + 6],
    [10, L, -W / 2 - 6, 0],
    [10, L, W / 2 + 6, 0],
  ]) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(sx, 8, sz), std(0x24344f));
    st.position.set(x, 3, z);
    scene.add(st);
  }
  addLogos(scene);
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

function makePlayer({ team, num, goalie, hand = 'R', me = false }) {
  const g = new THREE.Group();
  const jerseyColor = team ? COLORS.team : COLORS.opp;
  const jersey = std(jerseyColor);
  const dark = std(COLORS.dark);
  const white = std(0xffffff);

  const legs = [];
  for (const s of [-0.13, 0.13]) {
    // Jambe articulée à la hanche (pour les foulées)
    const hip = new THREE.Group();
    hip.position.set(s, 0.68, 0);
    const skate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.34), dark);
    skate.position.set(0, -0.62, 0.04);
    hip.add(skate);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.38), std(0xb8c2cc, { metalness: 0.6, roughness: 0.3 }));
    blade.position.set(0, -0.68, 0.04);
    hip.add(blade);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.55, 10), goalie ? white : jersey);
    leg.position.set(0, -0.28, 0);
    hip.add(leg);
    g.add(hip);
    legs.push(hip);
  }
  const pants = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.25, 0.32, 14), dark);
  pants.position.y = 0.82;
  g.add(pants);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.27, 0.55, 14), jersey);
  torso.position.y = 1.2;
  g.add(torso);
  for (const s of [-1, 1]) {
    const arm = rod(new THREE.Vector3(0.33 * s, 1.4, 0), new THREE.Vector3(0.3 * s, 1.0, 0.25), 0.08, jersey);
    g.add(arm);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), std(COLORS.skin));
  head.position.y = 1.6;
  g.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), team ? std(0x0b2545) : dark);
  helmet.position.y = 1.62;
  g.add(helmet);
  // Visage tourné vers l'avant (+z) : yeux et grille du casque, pour savoir tout de suite
  // si on voit le joueur de face ou de dos.
  for (const sx of [-0.05, 0.05]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), std(0xffffff));
    eye.position.set(sx, 1.62, 0.13);
    g.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 5), std(0x111111));
    pupil.position.set(sx, 1.62, 0.15);
    g.add(pupil);
  }
  const cage = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.16, 0.01),
    new THREE.MeshStandardMaterial({ color: 0xcccccc, wireframe: true }),
  );
  cage.position.set(0, 1.55, 0.17);
  g.add(cage);
  // Dos du maillot : une bande blanche, pour reconnaître le dos du joueur.
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.02), std(0xffffff));
  back.position.set(0, 1.3, -0.29);
  g.add(back);
  g.add(makeStick({ hand, goalie }));

  if (goalie) {
    g.scale.set(1.25, 1.05, 1.25);
    const pads = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.2), white);
    pads.position.set(0, 0.35, 0.15);
    g.add(pads);
  }

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
    if (third) {
      // 3e personne : champ plus classique (95° en paysage, 58° en portrait).
      const t3 = (aspect < 1 ? 58 : 95) * DEG;
      let v3 = 2 * Math.atan(Math.tan(t3 / 2) / aspect);
      v3 = Math.min(110 * DEG, Math.max(40 * DEG, v3));
      baseFov3 = v3 / DEG;
      camera.fov = v3 / DEG;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      hfov = 2 * Math.atan(Math.tan(v3 / 2) * aspect);
      return;
    }
    // Le jeu se joue en paysage, avec une vue large, type « fish-eye » (130° en largeur) pour voir le jeu autour de soi.
    // En portrait aussi, vue « fish-eye » : 110° en largeur (l'écran étant étroit, la vue est très haute).
    const portrait = aspect < 1;
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
    /** Active ou non la vue à la 3e personne. */
    setThirdPerson(on) {
      third = !!on;
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
      const back = (portrait ? 4.4 : 4.6) + 1.1 * k;
      const height = (portrait ? 3.6 : 3.9) - 0.5 * k + bob;
      const ahead = portrait ? 16 : 6.5;
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
