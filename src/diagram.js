// Ralenti vu du dessus, affiché à la fin de chaque situation :
// le trajet du joueur, celui du palet, et la meilleure option au moment de la passe ou du tir.
import { NET } from './evaluate.js';

const GREEN = '#1fa35c';
const YELLOW = '#f5b301';
const INK = '#13233a';

export function drawReplay(canvas, st, rel) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const Wc = canvas.clientWidth || 300;
  const Hc = canvas.clientHeight || 300;
  canvas.width = Wc * dpr;
  canvas.height = Hc * dpr;
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, Wc, Hc);

  // On cadre sur la zone utile : celle du but attaqué (attaque) ou de notre but (défense).
  const zs = [...st.trailMe, ...st.trailPuck, ...st.actors, st.me].map((p) => p.z);
  if (st.passer) zs.push(st.passer.z);
  const zMax = st.defense ? Math.min(30, Math.max(1, ...zs) + 2) : 30;
  const zMin = st.defense ? -30 : Math.max(-30, Math.min(-1, ...zs) - 2);
  const pad = 8;
  const s = Math.min((Wc - pad * 2) / 26, (Hc - pad * 2) / (zMax - zMin));
  const ox = Wc / 2;
  const oy = (Hc - (zMax - zMin) * s) / 2;
  // Le joueur attaque vers le haut du schéma : sa droite est le côté x négatif.
  const P = (p) => [ox - p.x * s, oy + (zMax - p.z) * s];

  // Glace et lignes
  g.fillStyle = '#f4f9fd';
  g.strokeStyle = '#9fb3c8';
  g.lineWidth = 2;
  roundRect(g, ox - 13 * s, oy, 26 * s, (zMax - zMin) * s, 6 * s);
  g.fill();
  g.stroke();
  const hline = (z, color, w) => {
    if (z < zMin || z > zMax) return;
    g.fillStyle = color;
    const [, y] = P({ x: 0, z });
    g.fillRect(ox - 13 * s, y - w / 2, 26 * s, w);
  };
  hline(0, '#d7263d', 3);
  hline(7.5, '#1f4fd6', 4);
  hline(26, '#d7263d', 1.5);
  hline(-7.5, '#1f4fd6', 4);
  hline(-26, '#d7263d', 1.5);
  for (const net of [NET, { x: 0, z: -26 }]) {
    if (net.z < zMin || net.z > zMax) continue;
    const up = net.z > 0;
    const [nx, ny] = P(net);
    g.fillStyle = '#bcdcff';
    g.beginPath();
    g.arc(nx, ny, 1.8 * s, up ? 0 : Math.PI, up ? Math.PI : 2 * Math.PI);
    g.fill();
    g.fillStyle = '#d7263d';
    g.fillRect(nx - 0.9 * s, up ? ny - 1 * s : ny, 1.8 * s, 1 * s);
  }

  // Trajets
  line(g, st.trailMe.map(P), YELLOW, 4, []);
  line(g, st.trailPuck.map(P), INK, 2, [4, 5]);

  // Meilleure option au moment où le joueur a lâché le palet
  if (rel) {
    const best = rel.ev.best;
    const target = best.type === 'shoot' ? NET : best.target;
    if (best.key !== rel.chosen.key) arrow(g, P(rel.from), P(target), GREEN);
    ring(g, P(rel.from), 7, INK);
  }

  // Défense : où le joueur était au moment clé (passe, tir ou fin), et où il aurait dû être.
  if (st.defense && st.keyMoment) {
    if (st.keyMoment.ideal) {
      g.setLineDash([5, 4]);
      ring(g, P(st.keyMoment.ideal), Math.max(10, 1.3 * s), GREEN, 3);
      g.setLineDash([]);
    }
    ring(g, P(st.keyMoment.me), 6, YELLOW, 3);
  }

  // Joueurs à la fin de l'action
  const r = Math.max(7, 0.75 * s);
  for (const a of st.actors) {
    if (a.team) dot(g, P(a), r, '#1e66f5', String(a.num));
    else dot(g, P(a), r, '#e5484d', a.goalie ? 'G' : '');
  }
  dot(g, P(st.me), r * 1.15, '#ffd23f', 'TOI', '#0b2545');

  // Fin de l'action
  if (st.over) {
    const [x, y] = P(st.over);
    g.font = `${Math.max(16, r * 2)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const good = st.over.type === 'goal' || st.over.type === 'recovered';
    g.fillText(good ? '⭐' : st.over.type === 'saveUs' ? '🧤' : '❌', x, y);
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function line(g, pts, color, width, dash) {
  if (pts.length < 2) return;
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.setLineDash(dash);
  g.beginPath();
  g.moveTo(...pts[0]);
  for (const p of pts.slice(1)) g.lineTo(...p);
  g.stroke();
  g.setLineDash([]);
}

function ring(g, [x, y], r, color, width = 2) {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.stroke();
}

function dot(g, [x, y], r, color, label, textColor = '#fff') {
  g.fillStyle = color;
  g.strokeStyle = '#fff';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  if (label) {
    g.fillStyle = textColor;
    g.font = `bold ${label.length > 2 ? r * 0.8 : r * 1.05}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, x, y + 1);
  }
}

function arrow(g, [x1, y1], [x2, y2], color) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const len = Math.hypot(x2 - x1, y2 - y1) - 10;
  const ex = x1 + Math.cos(a) * len;
  const ey = y1 + Math.sin(a) * len;
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(ex, ey);
  g.stroke();
  g.beginPath();
  g.moveTo(ex + Math.cos(a) * 8, ey + Math.sin(a) * 8);
  g.lineTo(ex + Math.cos(a + 2.5) * 12, ey + Math.sin(a + 2.5) * 12);
  g.lineTo(ex + Math.cos(a - 2.5) * 12, ey + Math.sin(a - 2.5) * 12);
  g.closePath();
  g.fill();
}
