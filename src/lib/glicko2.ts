/** Glicko-2 (Glickman 2012). Rates a player from a batch of games vs fixed-rating opponents. */
export type GlickoGame = { oppRating: number; oppRd: number; score: number };
export type GlickoResult = { rating: number; rd: number; volatility: number };

const SCALE = 173.7178;
const TAU = 0.5;

export function glicko2(games: GlickoGame[], start: GlickoResult = { rating: 1500, rd: 350, volatility: 0.06 }): GlickoResult {
  if (games.length === 0) return start;
  const mu = (start.rating - 1500) / SCALE;
  const phi = start.rd / SCALE;
  const sigma = start.volatility;
  const g = (p: number) => 1 / Math.sqrt(1 + (3 * p * p) / (Math.PI * Math.PI));
  const E = (muj: number, phij: number) => 1 / (1 + Math.exp(-g(phij) * (mu - muj)));

  let vInv = 0;
  let deltaSum = 0;
  for (const gm of games) {
    const muj = (gm.oppRating - 1500) / SCALE;
    const phij = gm.oppRd / SCALE;
    const e = E(muj, phij);
    vInv += g(phij) ** 2 * e * (1 - e);
    deltaSum += g(phij) * (gm.score - e);
  }
  const v = 1 / vInv;
  const delta = v * deltaSum;

  // Volatility (Illinois algorithm)
  const a = Math.log(sigma * sigma);
  const f = (x: number) =>
    (Math.exp(x) * (delta * delta - phi * phi - v - Math.exp(x))) / (2 * (phi * phi + v + Math.exp(x)) ** 2) - (x - a) / (TAU * TAU);
  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
  else { let k = 1; while (f(a - k * TAU) < 0) k++; B = a - k * TAU; }
  let fA = f(A), fB = f(B);
  for (let i = 0; i < 100 && Math.abs(B - A) > 1e-6; i++) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; } else fA /= 2;
    B = C; fB = fC;
  }
  const newSigma = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi * phi + newSigma * newSigma);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * deltaSum;
  return { rating: Math.round(newMu * SCALE + 1500), rd: Math.round(newPhi * SCALE), volatility: newSigma };
}
