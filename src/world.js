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

function makePlayer({ team, num, goalie }) {
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
  // Crosse
  const stickMat = std(goalie ? 0x8b5a2b : 0x1f2430);
  g.add(rod(new THREE.Vector3(0.3, 1.0, 0.25), new THREE.Vector3(0.45, 0.03, 0.95), 0.025, stickMat));
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.32), stickMat);
  blade.position.set(0.45, 0.04, 1.08);
  g.add(blade);

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
  const mat = std(0x1f2430);
  const geo = new THREE.CylinderGeometry(0.02, 0.02, 1, 10);
  geo.translate(0, 0.5, 0);
  const shaft = new THREE.Mesh(geo, mat);
  grp.add(shaft);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.04), std(0x3a4150));
  grp.add(blade);
  const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.035, 20), std(0x111111, { roughness: 0.4 }));
  grp.add(puck);
  grp.userData = { shaft, blade, puck };
  return grp;
}

/** Place la crosse dans le champ de vision, quelle que soit l'orientation de l'écran. */
function layoutMyStick(stick, vfov, aspect) {
  const d = 1.1;
  const halfH = Math.tan(vfov / 2) * d;
  const halfW = halfH * aspect;
  const yb = -halfH * 0.78;
  const { shaft, blade, puck } = stick.userData;
  const a = new THREE.Vector3(Math.min(halfW * 0.9, 0.9), -halfH * 0.05 - 0.15, -0.45);
  const b = new THREE.Vector3(0.12, yb, -d);
  const dir = new THREE.Vector3().subVectors(a, b);
  shaft.scale.set(1, dir.length(), 1);
  shaft.position.copy(b);
  shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  blade.position.set(0.0, yb, -d);
  blade.rotation.set(-0.35, 0, 0);
  puck.position.set(-0.06, yb + 0.005, -d - 0.12);
  puck.rotation.set(-0.35, 0, 0);
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
    layoutMyStick(myStick, v, aspect);
    lookDrop = aspect < 1 ? 3.2 : 0.9;
  }
  resize();

  return {
    camera,
    puck,
    resize,
    getHfov: () => hfov,
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
    addActor({ team, num, goalie, pickable }) {
      const mesh = makePlayer({ team, num, goalie });
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
