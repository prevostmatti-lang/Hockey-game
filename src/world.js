// Monde 3D : patinoire, buts, joueurs, palet, et caméra à hauteur des yeux.
import * as THREE from '../vendor/three.module.min.js';

export const EYE = 1.45;
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

function buildRink(scene) {
  const ice = new THREE.Mesh(new THREE.PlaneGeometry(W, L), std(0xf2f8fc, { roughness: 0.25 }));
  ice.rotation.x = -Math.PI / 2;
  scene.add(ice);

  // Lignes
  scene.add(flat(new THREE.PlaneGeometry(W, 0.3), 0xd7263d, 0, 0));
  for (const z of [-7.5, 7.5]) scene.add(flat(new THREE.PlaneGeometry(W, 0.3), 0x1f4fd6, 0, z));
  for (const z of [-26, 26]) scene.add(flat(new THREE.PlaneGeometry(W - 2, 0.06), 0xd7263d, 0, z));
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

  // Bandes, plinthe jaune et vitres
  const board = std(0xffffff);
  const kick = std(0xf5c518);
  const glass = new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.12, roughness: 0.05 });
  const walls = [
    [W + 0.6, 0, -L / 2 - 0.15, 0.3, true],
    [W + 0.6, 0, L / 2 + 0.15, 0.3, true],
    [L, -W / 2 - 0.15, 0, 0.3, false],
    [L, W / 2 + 0.15, 0, 0.3, false],
  ];
  for (const [len, x, z, th, alongX] of walls) {
    const sx = alongX ? len : th;
    const sz = alongX ? th : len;
    const b = new THREE.Mesh(new THREE.BoxGeometry(sx, 1.1, sz), board);
    b.position.set(x, 0.55, z);
    scene.add(b);
    const k = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.01, 0.2, sz + 0.01), kick);
    k.position.set(x, 0.1, z);
    scene.add(k);
    const g = new THREE.Mesh(new THREE.BoxGeometry(sx, 1.8, sz), glass);
    g.position.set(x, 2.0, z);
    scene.add(g);
    // Tribunes
    const st = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len + 20 : 10, 8, alongX ? 10 : len), std(0x24344f));
    st.position.set(alongX ? x : x + Math.sign(x) * 6, 3, alongX ? z + Math.sign(z) * 6 : z);
    scene.add(st);
  }
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
  g.font = 'bold 64px system-ui, sans-serif';
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

/**
 * Palette de crosse de hockey : une lame fine posée sur la tranche, légèrement incurvée,
 * avec du ruban blanc. Repère local : le talon est à l'origine, la lame part selon +x,
 * le bas touche y = 0 et la face « coup droit » regarde vers +z.
 */
function makeBlade({ length = 0.3, height = 0.075, thick = 0.014, color = 0x1f2430, tape = 0xf4f4f4 } = {}) {
  const g = new THREE.Group();
  const mat = std(color, { roughness: 0.5 });
  const tapeMat = std(tape, { roughness: 0.9 });
  const n = 4;
  const seg = length / n;
  let x = 0;
  let z = 0;
  let ang = 0;
  for (let i = 0; i < n; i++) {
    // Courbure réglementaire : 1,5 cm de creux au maximum, mesuré du talon à la pointe
    // (règlement IIHF, section 2 « Sticks » : palette 32 cm max, hauteur 5 à 7,5 cm, manche 3 cm max).
    const a = ang + 0.033 * i;
    const cx = x + (Math.cos(a) * seg) / 2;
    const cz = z + (Math.sin(a) * seg) / 2;
    const piece = new THREE.Mesh(new THREE.BoxGeometry(seg * 1.04, height, thick), mat);
    piece.position.set(cx, height / 2, cz);
    piece.rotation.y = -a;
    g.add(piece);
    if (i > 0 || n === 1) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(seg * 1.05, height * 0.82, thick * 1.5), tapeMat);
      t.position.set(cx, height * 0.48, cz);
      t.rotation.y = -a;
      g.add(t);
    }
    x += Math.cos(a) * seg;
    z += Math.sin(a) * seg;
    ang = a;
  }
  // Pointe arrondie
  const toe = new THREE.Mesh(new THREE.CylinderGeometry(height / 2, height / 2, thick * 1.5, 12, 1, false, 0, Math.PI), tapeMat);
  toe.rotation.set(Math.PI / 2, 0, -ang);
  toe.position.set(x, height / 2, z);
  g.add(toe);
  return g;
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

function makePlayer({ team, num, goalie, hand = 'R' }) {
  const g = new THREE.Group();
  const jerseyColor = team ? COLORS.team : COLORS.opp;
  const jersey = std(jerseyColor);
  const dark = std(COLORS.dark);
  const white = std(0xffffff);

  for (const s of [-0.13, 0.13]) {
    const skate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.34), dark);
    skate.position.set(s, 0.06, 0.04);
    g.add(skate);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.55, 10), goalie ? white : jersey);
    leg.position.set(s, 0.4, 0);
    g.add(leg);
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
  // Crosse
  // Crosse d'un droitier (palette à droite, côté -x du repère du joueur) : la main du haut est la main
  // GAUCHE, le manche traverse devant le corps jusqu'à la palette à droite, et le creux de la palette
  // (coup droit) regarde vers la gauche. La palette prolonge le manche, pointe vers l'avant.
  // Un gaucher est le miroir exact : main du haut droite, palette à gauche, courbée vers la droite.
  const stickMat = std(goalie ? 0x8b5a2b : 0x1f2430);
  const topHand = new THREE.Vector3(0.3, 1.0, 0.25); // bout du bras gauche
  const heel = new THREE.Vector3(-0.28, 0.0, 0.82);
  const stick = new THREE.Group();
  stick.name = 'stick';
  stick.add(shaftBetween(new THREE.Vector3(heel.x, 0.045, heel.z), topHand, stickMat));
  const blade = makeBlade(goalie ? { length: 0.38, height: 0.09, color: 0x8b5a2b } : { length: 0.3 });
  blade.position.copy(heel);
  // Palette posée devant le patin, pointe vers l'avant et légèrement vers l'intérieur.
  alongX(blade, 0.1, 0.995);
  blade.scale.z = -1; // creux de la palette tourné vers la gauche du joueur
  stick.add(blade);
  if (hand === 'L') stick.scale.x = -1;
  g.add(stick);

  if (goalie) {
    g.scale.set(1.25, 1.05, 1.25);
    const pads = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.2), white);
    pads.position.set(0, 0.35, 0.15);
    g.add(pads);
  }

  if (num != null) {
    const label = numberSprite(num, team ? '#1e66f5' : '#e5484d');
    label.position.y = 2.15;
    g.add(label);
  }

  return g;
}

/** Crosse et palet « tenus » : attachés à la caméra, en bas de l'écran. */
function buildMyStick() {
  const grp = new THREE.Group();
  const shaft = new THREE.Group();
  const blade = new THREE.Group();
  const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.035, 20), std(0x111111, { roughness: 0.4 }));
  grp.add(shaft, blade, puck);
  grp.userData = { shaft, blade, puck };
  return grp;
}

/** Place la crosse dans le champ de vision, quelle que soit l'orientation de l'écran et la main. */
function layoutMyStick(stick, vfov, aspect, side = 1) {
  const d = 1.1;
  const halfH = Math.tan(vfov / 2) * d;
  const yb = -halfH * 0.8; // hauteur de la glace sous la palette, dans le repère de la caméra
  const { shaft, blade, puck } = stick.userData;

  // Même règle qu'une vraie crosse : la main du haut (gauche pour un droitier) est devant le ventre,
  // le manche descend en diagonale jusqu'à la palette, du côté de la palette (droite pour un droitier).
  // L'ensemble palette + palet est un peu basculé vers la caméra pour qu'on voie le palet « de dessus ».
  const heel = new THREE.Vector3(side * 0.28, yb, -1.05);
  const hands = new THREE.Vector3(-side * 0.42, -0.55, -0.3);
  const hx = heel.x - hands.x;
  const hz = heel.z - hands.z;
  const hl = Math.hypot(hx, hz);
  const ux = hx / hl;
  const uz = hz / hl;
  blade.clear();
  blade.position.copy(heel);
  blade.rotation.set(0.65, 0, 0);
  const b = makeBlade({ length: 0.32, height: 0.075, thick: 0.016 });
  alongX(b, ux, uz);
  // Creux de la palette (coup droit) vers la gauche pour un droitier, vers la droite pour un gaucher.
  b.scale.z = side > 0 ? -1 : 1;
  blade.add(b);
  // Palet contre le coup droit, devant le milieu de la palette.
  const nx = side * uz;
  const nz = -side * ux;
  blade.add(puck);
  puck.position.set(ux * 0.15 + nx * 0.1, 0.018, uz * 0.15 + nz * 0.1);

  // Manche : du talon jusqu'aux mains, devant le ventre (hors de l'écran, en bas).
  shaft.clear();
  const mat = std(0x1f2430, { roughness: 0.5 });
  shaft.add(shaftBetween(new THREE.Vector3(heel.x, yb + 0.05, heel.z), hands, mat, 0.032, 0.024));

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
  const myStick = buildMyStick();
  camera.add(myStick);

  const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 20), std(0x111111, { roughness: 0.4 }));
  puck.position.set(0, 0.02, 0);
  scene.add(puck);

  const actors = new THREE.Group();
  scene.add(actors);
  let pickables = [netHit];
  let hfov = 78 * DEG;
  let side = 1; // 1 = palette à droite, -1 = à gauche
  let lookDrop = 0.9; // regard légèrement vers la glace (plus en portrait)
  const raycaster = new THREE.Raycaster();

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    let v = 2 * Math.atan(Math.tan((78 * DEG) / 2) / aspect);
    v = Math.min(78 * DEG, Math.max(40 * DEG, v));
    camera.fov = v / DEG;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    hfov = 2 * Math.atan(Math.tan(v / 2) * aspect);
    layoutMyStick(myStick, v, aspect, side);
    lookDrop = aspect < 1 ? 3.2 : 0.9;
  }
  resize();

  return {
    camera,
    puck,
    resize,
    getHfov: () => hfov,
    setHand(hand) {
      side = hand === 'L' ? -1 : 1;
      resize();
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
      myStick.visible = v;
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
    /** Ajoute un joueur ; renvoie un objet avec setPos(x, z). */
    addActor({ team, num, goalie, pickable, hand }) {
      const mesh = makePlayer({ team, num, goalie, hand });
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
          mesh.position.set(x, 0, z);
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
      renderer.render(scene, camera);
    },
  };
}
