/* Two-phase tableau simplex for: maximize c^T x  subject to Ax (<=,>=,=) b, x >= 0.
   Compact, dependency-free, with Bland's rule to avoid cycling. */

export type Sense = '<=' | '>=' | '=';

export interface Constraint {
  coeffs: number[];
  rhs: number;
  sense: Sense;
}

export type LPStatus = 'optimal' | 'infeasible' | 'unbounded';

export interface LPSolution {
  status: LPStatus;
  solution: number[];
  objective: number;
}

const EPS = 1e-9;

interface Tableau {
  t: number[][]; // (m+1) x (N+1), row 0 = objective, last col = RHS
  basis: number[]; // basis[i] = col index basic in row i+1
  m: number;
  N: number;
}

function pivot(tab: Tableau, p: number, q: number): void {
  const { t } = tab;
  const piv = t[p][q];
  for (let j = 0; j <= tab.N; j++) t[p][j] /= piv;
  for (let i = 0; i <= tab.m; i++) {
    if (i === p) continue;
    const factor = t[i][q];
    if (Math.abs(factor) < EPS) continue;
    for (let j = 0; j <= tab.N; j++) {
      t[i][j] -= factor * t[p][j];
      if (Math.abs(t[i][j]) < 1e-12) t[i][j] = 0;
    }
  }
  tab.basis[p - 1] = q;
}

function runSimplex(tab: Tableau, maxIter = 100000): LPStatus {
  const { t, N, m } = tab;
  for (let iter = 0; iter < maxIter; iter++) {
    // Bland: smallest index with negative reduced cost
    let q = -1;
    for (let j = 0; j < N; j++) {
      if (t[0][j] < -EPS) {
        let basic = false;
        for (let i = 0; i < m; i++) if (tab.basis[i] === j) { basic = true; break; }
        if (!basic) { q = j; break; }
      }
    }
    if (q === -1) return 'optimal';
    // Bland: min ratio, ties -> smallest row index
    let p = -1;
    let best = Infinity;
    for (let i = 1; i <= m; i++) {
      if (t[i][q] > EPS) {
        const ratio = t[i][N] / t[i][q];
        if (ratio < best - EPS) {
          best = ratio;
          p = i;
        }
      }
    }
    if (p === -1) return 'unbounded';
    pivot(tab, p, q);
  }
  throw new Error('Simplex did not converge');
}

/** Maximize c^T x subject to constraints, x >= 0. c.length must equal #vars. */
export function solveLP(c: number[], constraints: Constraint[]): LPSolution {
  const n = c.length;
  // Normalize: {coeffs, rhs, sense} with copies
  const rows = constraints.map((r) => ({ coeffs: [...r.coeffs], rhs: r.rhs, sense: r.sense as Sense }));

  // Column layout: [original n][slack/surplus...][artificials...]
  const slackCol: number[] = new Array(rows.length).fill(-1);
  const artCol: number[] = new Array(rows.length).fill(-1);
  let N = n;
  rows.forEach((r, i) => {
    if (r.rhs < 0) {
      r.coeffs = r.coeffs.map((v) => -v);
      r.rhs = -r.rhs;
      r.sense = r.sense === '<=' ? '>=' : r.sense === '>=' ? '<=' : '=';
    }
    if (r.sense === '<=') {
      slackCol[i] = N++;
    } else if (r.sense === '>=') {
      slackCol[i] = N++; // surplus (coefficient -1)
      artCol[i] = N++;
    } else {
      artCol[i] = N++;
    }
  });

  const m = rows.length;
  const t: number[][] = Array.from({ length: m + 1 }, () => new Array(N + 1).fill(0));
  const basis: number[] = new Array(m).fill(-1);
  rows.forEach((r, i) => {
    const row = i + 1;
    for (let j = 0; j < n; j++) t[row][j] = r.coeffs[j];
    if (r.sense === '<=') {
      t[row][slackCol[i]] = 1;
      basis[i] = slackCol[i];
    } else if (r.sense === '>=') {
      t[row][slackCol[i]] = -1;
      t[row][artCol[i]] = 1;
      basis[i] = artCol[i];
    } else {
      t[row][artCol[i]] = 1;
      basis[i] = artCol[i];
    }
    t[row][N] = r.rhs;
  });
  const tab: Tableau = { t, basis, m, N };

  const hasArtificial = artCol.some((v) => v >= 0);
  const artSet = new Set(artCol.filter((v) => v >= 0));

  if (hasArtificial) {
    // Phase I: maximize -sum(artificials)
    for (const a of artSet) t[0][a] = 1; // T[0][j] = -c_j, c_a = -1
    // Make canonical: subtract rows with basic artificials
    rows.forEach((_r, i) => {
      if (artSet.has(basis[i])) {
        for (let j = 0; j <= N; j++) t[0][j] -= t[i + 1][j];
      }
    });
    const s1 = runSimplex(tab);
    if (s1 !== 'optimal') return { status: 'infeasible', solution: [], objective: NaN };
    if (t[0][N] < -1e-7) return { status: 'infeasible', solution: [], objective: NaN };

    // Drive artificials out of basis; drop redundant rows
    const keepRow: boolean[] = new Array(m).fill(true);
    rows.forEach((_r, i) => {
      if (artSet.has(basis[i])) {
        const row = i + 1;
        let q = -1;
        for (let j = 0; j < N; j++) {
          if (!artSet.has(j) && Math.abs(t[row][j]) > EPS) { q = j; break; }
        }
        if (q >= 0) pivot(tab, row, q);
        else keepRow[i] = false; // redundant 0 = 0 row
      }
    });
    // Rebuild without artificial columns / dropped rows
    const colKeep = Array.from({ length: N }, (_, j) => !artSet.has(j));
    const newIndex = new Array(N).fill(-1);
    let NN = 0;
    for (let j = 0; j < N; j++) if (colKeep[j]) newIndex[j] = NN++;
    const keptRows: number[] = [];
    for (let i = 0; i < m; i++) if (keepRow[i]) keptRows.push(i);
    const t2: number[][] = Array.from({ length: keptRows.length + 1 }, () => new Array(NN + 1).fill(0));
    keptRows.forEach((old, ni) => {
      for (let j = 0; j < N; j++) if (colKeep[j]) t2[ni + 1][newIndex[j]] = t[old + 1][j];
      t2[ni + 1][NN] = t[old + 1][N];
    });
    const basis2 = keptRows.map((old) => newIndex[basis[old]]);
    tab.t = t2;
    tab.basis = basis2;
    tab.m = keptRows.length;
    tab.N = NN;
  }

  // Phase II: original objective
  const { t: tB, N: NB, m: mB } = tab;
  for (let j = 0; j <= NB; j++) tB[0][j] = 0;
  for (let j = 0; j < n; j++) tB[0][j] = -c[j];
  for (let i = 0; i < mB; i++) {
    const b = tab.basis[i];
    const factor = tB[0][b];
    if (Math.abs(factor) > EPS) {
      for (let j = 0; j <= NB; j++) tB[0][j] -= factor * tB[i + 1][j];
    }
  }
  const s2 = runSimplex(tab);
  if (s2 !== 'optimal') return { status: 'unbounded', solution: [], objective: NaN };

  const solution = new Array(n).fill(0);
  for (let i = 0; i < tab.m; i++) {
    const b = tab.basis[i];
    if (b >= 0 && b < n) solution[b] = Math.max(0, tab.t[i + 1][tab.N]);
  }
  return { status: 'optimal', solution, objective: tab.t[0][tab.N] };
}
