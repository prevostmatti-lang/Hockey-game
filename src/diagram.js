// Schéma vu du dessus, affiché après chaque décision pour expliquer « pourquoi ».
import { finalPos, NET } from './evaluate.js';

const GREEN = '#1fa35c';
const ORANGE = '#f07a00';

export function drawDiagram(canvas, scn, ev, chosen) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const Wc = canvas.clientWidth || 300;
  const Hc = canvas.clientHeight || 300;
  canvas.width = Wc * dpr;
  canvas.height = Hc * dpr;
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, Wc, Hc);

  const zMax = 30;
  const zMin = Math.min(-1, scn.me.z - 4, scn.passer.z - 2);
  const pad = 8;
  const s = Math.min((Wc - pad * 2) / 26, (Hc - pad * 2) / (zMax - zMin));
  const ox = Wc / 2;
  const oy = (Hc - (zMax - zMin) * s) / 2;
  // L'enfant regarde vers le haut du schéma : sa droite est le côté x négatif.
  const P = (p) => [ox - p.x * s, oy + (zMax - p.z) * s];

  // Glace
  g.fillStyle = '#f4f9fd';
  g.strokeStyle = '#9fb3c8';
  g.lineWidth = 2;
  roundRect(g, ox - 13 * s, oy, 26 * s, (zMax - zMin) * s, 6 * s);
  g.fill();
  g.stroke();
  const hline = (z, color, w) => {
    if (z < zMin) return;
    g.fillStyle = color;
    const [, y] = P({ x: 0, z });
    g.fillRect(ox - 13 * s, y - w / 2, 26 * s, w);
  };
  hline(0, '#d7263d', 3);
  hline(7.5, '#1f4fd6', 4);
  hline(26, '#d7263d', 1.5);
  // Enclave + but
  const [nx, ny] = P(NET);
  g.fillStyle = '#bcdcff';
  g.beginPath();
  g.arc(nx, ny, 1.8 * s, 0, Math.PI);
  g.fill();
  g.fillStyle = '#d7263d';
  g.fillRect(nx - 0.9 * s, ny - 1 * s, 1.8 * s, 1 * s);

  // Flèches : meilleure option (verte) et choix de l'enfant (orange) s'il est différent
  const me = scn.me;
  const arrowTo = (o) => (o.type === 'shoot' ? NET : o.target);
  if (chosen && chosen.type !== 'timeout' && chosen.key !== ev.best.key) {
    const end = chosen.blocker && chosen.type === 'pass' ? chosen.blocker : arrowTo(chosen);
    arrow(g, P(me), P(end), ORANGE, true);
    if (chosen.blocker) cross(g, P(chosen.blocker), ORANGE);
  }
  arrow(g, P(me), P(arrowTo(ev.best)), GREEN, false);

  // Joueurs
  const r = Math.max(7, 0.75 * s);
  dot(g, P(scn.passer), r, '#1e66f5', String(scn.passer.num));
  for (const t of scn.teammates) dot(g, P(finalPos(t)), r, '#1e66f5', String(t.num));
  for (const o of scn.opponents) dot(g, P(finalPos(o)), r, '#e5484d', o.goalie ? 'G' : '');
  dot(g, P(me), r * 1.15, '#ffd23f', 'TOI', '#0b2545');
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

function arrow(g, [x1, y1], [x2, y2], color, dashed) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const len = Math.hypot(x2 - x1, y2 - y1) - 10;
  const ex = x1 + Math.cos(a) * len;
  const ey = y1 + Math.sin(a) * len;
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = 4;
  g.setLineDash(dashed ? [8, 6] : []);
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(ex, ey);
  g.stroke();
  g.setLineDash([]);
  g.beginPath();
  g.moveTo(ex + Math.cos(a) * 8, ey + Math.sin(a) * 8);
  g.lineTo(ex + Math.cos(a + 2.5) * 12, ey + Math.sin(a + 2.5) * 12);
  g.lineTo(ex + Math.cos(a - 2.5) * 12, ey + Math.sin(a - 2.5) * 12);
  g.closePath();
  g.fill();
}

function cross(g, [x, y], color) {
  g.strokeStyle = color;
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(x - 12, y - 12);
  g.lineTo(x + 12, y + 12);
  g.moveTo(x + 12, y - 12);
  g.lineTo(x - 12, y + 12);
  g.stroke();
}
