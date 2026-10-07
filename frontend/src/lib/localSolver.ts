/* Offline engine: parse plain-English planning problems (no API key) and solve
   them in-browser with the bundled simplex LP solver. Mirrors backend/app/ai.py
   fallback parsing plus a structured transportation parser. */

import { solveLP } from './simplex';

export type ModelType = 'production' | 'transportation' | 'game_theory';

export interface ProductResult { name: string; quantity: number; profit: number }
export interface ResourceResult { name: string; used: number; capacity: number; utilization: number }
export interface ShipmentResult { source: string; destination: string; quantity: number; cost: number }
export interface StrategyResult { player: string; action: string; probability: number }

export interface Analysis {
  model_type: ModelType;
  problem_summary: string;
  technique: string;
  objective: string;
  variables: string[];
  constraints: string[];
  assumptions: string[];
  products: ProductResult[];
  resources: ResourceResult[];
  shipments: ShipmentResult[];
  strategies: StrategyResult[];
  game_value?: number;
  total_profit?: number;
  total_cost?: number;
  explanation: string;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const round4 = (v: number) => Math.round(v * 10000) / 10000;
/** Python-style {:.4g} formatting for the game explanation. */
function fmtG(v: number): string {
  if (Object.is(v, -0)) v = 0;
  const s = (parseFloat(v.toPrecision(4)) as number).toString();
  return s.replace('e+0', 'e+').replace('e-0', 'e-');
}

/* ---------------- production parsing (port of backend fallback) ------------- */

function parseResourceValues(text: string): Record<string, number> {
  const values: Record<string, number> = {};
  const re =
    /(\d+(?:\.\d+)?)\s*(?:(hours?|kg|units?)\s+(?:on|of)?\s*([A-Za-z][\w ]*?)|([A-Za-z][\w ]*?)\s+(hours?|kg|units?))(?=\s+and|,|\.|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const value = m[1];
    const unitFirst = m[2];
    let resource = (m[4] || m[3] || '').trim();
    if (!unitFirst) resource = resource.replace(/^(?:hours?|kg|units?)\s+/i, '');
    resource = resource.trim();
    if (resource) values[resource] = parseFloat(value);
  }
  return values;
}

export interface ParsedProduct { name: string; profit: number; resource_usage: Record<string, number>; demand_limit: number | null }

function parseProduction(text: string): { products: ParsedProduct[]; capacities: Record<string, number> } | null {
  const clean = text.replace(/\$/g, '');
  const products: ParsedProduct[] = [];
  for (const sentence of clean.split('.')) {
    const entry =
      /(Product\s+[A-Za-z0-9]+).*?(\d+(?:\.\d+)?)\s+profit.*?(?:needs|uses|requires|consumes)\s+(.*)/i.exec(sentence);
    if (!entry) continue;
    const [, name, profit, resourceText] = entry;
    const usage = parseResourceValues(`${profit} ${resourceText}`);
    const lastWord = name.trim().split(/\s+/).pop() as string;
    const demandMatch = new RegExp(
      `Demand for ${lastWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*?(?:at most|maximum|max)\\s*(\\d+(?:\\.\\d+)?)`,
      'i',
    ).exec(clean);
    if (Object.keys(usage).length > 0) {
      products.push({
        name: name.trim(),
        profit: parseFloat(profit),
        resource_usage: usage,
        demand_limit: demandMatch ? parseFloat(demandMatch[1]) : null,
      });
    }
  }
  const capMatch = /We have (.*?)(?:Demand|$)/i.exec(clean);
  const capacities: Record<string, number> = capMatch ? parseResourceValues(capMatch[1]) : {};
  for (const product of products) {
    for (const resource of Object.keys(product.resource_usage)) {
      if (!(resource in capacities)) {
        const match = Object.keys(capacities).find(
          (c) => c.toLowerCase().includes(resource.toLowerCase()) || resource.toLowerCase().includes(c.toLowerCase()),
        );
        if (match) {
          capacities[resource] = capacities[match];
          delete capacities[match];
        }
      }
    }
  }
  if (products.length === 0 || Object.keys(capacities).length === 0) return null;
  return { products, capacities };
}

export function solveProduction(products: ParsedProduct[], capacities: Record<string, number>): Analysis {
  const resources = Object.keys(capacities);
  const n = products.length;
  const c = products.map((p) => p.profit);
  const constraints = resources.map((r) => ({
    coeffs: products.map((p) => p.resource_usage[r] ?? 0),
    rhs: capacities[r],
    sense: '<=' as const,
  }));
  products.forEach((p, i) => {
    if (p.demand_limit != null) {
      const coeffs = new Array(n).fill(0);
      coeffs[i] = 1;
      constraints.push({ coeffs, rhs: p.demand_limit, sense: '<=' });
    }
  });
  const lp = solveLP(c, constraints);
  if (lp.status === 'unbounded') throw new Error('The problem is unbounded — add resource capacities or demand limits.');
  if (lp.status !== 'optimal') throw new Error('The solver could not find an optimal plan for these numbers.');
  const qtys = lp.solution.map((v) => round4(Math.max(0, v)));
  const productResults: ProductResult[] = products.map((p, i) => ({
    name: p.name,
    quantity: qtys[i],
    profit: round2(p.profit * qtys[i]),
  }));
  const resourceResults: ResourceResult[] = resources.map((r) => {
    const used = products.reduce((s, p, i) => s + (p.resource_usage[r] ?? 0) * qtys[i], 0);
    const cap = capacities[r];
    return { name: r, used: round4(used), capacity: cap, utilization: round4(cap ? used / cap : 0) };
  });
  const totalProfit = round2(lp.objective);
  const limited = resourceResults.filter((r) => r.utilization >= 0.999).map((r) => r.name);
  const explanation =
    limited.length > 0
      ? `The plan produces the highest possible profit of $${totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}. The limiting resource is ${limited.join(', ')}.`
      : `The plan produces the highest possible profit of $${totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })} within the stated limits.`;
  return {
    model_type: 'production',
    problem_summary: 'Choose production quantities to maximize total profit under resource limits.',
    technique: 'Linear programming',
    objective: 'Maximize total profit',
    variables: products.map((p) => `quantity of ${p.name}`),
    constraints: resources.map((r) => `resource usage must not exceed ${r} capacity`),
    assumptions: ['Production quantities may be fractional unless the prompt requires whole units.'],
    products: productResults,
    resources: resourceResults,
    shipments: [],
    strategies: [],
    total_profit: totalProfit,
    explanation,
  };
}

/* ---------------- transportation parsing + solving -------------------------- */

export interface TransportData {
  sources: { name: string; supply: number }[];
  destinations: { name: string; demand: number }[];
  costs: Record<string, Record<string, number>>;
}

function norm(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function parseTransportation(text: string): TransportData | null {
  const sources: { name: string; supply: number }[] = [];
  const destinations: { name: string; demand: number }[] = [];
  let m: RegExpExecArray | null;
  const supRe = /([A-Za-z][\w\- ]*?)\s+(?:has\s+supply|supplies|supply)\s+(?:of\s+)?(\d+(?:\.\d+)?)/gi;
  while ((m = supRe.exec(text)) !== null) sources.push({ name: m[1].trim(), supply: parseFloat(m[2]) });
  const demRe = /([A-Za-z][\w\- ]*?)\s+(?:needs?\s+demand|requires?\s+demand|has\s+demand|demand)\s+(?:of\s+|is\s+)?(\d+(?:\.\d+)?)/gi;
  while ((m = demRe.exec(text)) !== null) {
    // guard: skip the production-style "Demand for X at most N" (no adjacent number after 'demand')
    destinations.push({ name: m[1].trim(), demand: parseFloat(m[2]) });
  }
  if (sources.length === 0 || destinations.length === 0) return null;
  const costs: Record<string, Record<string, number>> = {};
  const costRe = /([A-Za-z][\w\- ]*?)\s+to\s+([A-Za-z][\w\- ]*?)\s+costs?\s+(\d+(?:\.\d+)?)/gi;
  const matchName = (token: string, known: string[]): string | null => {
    const t = norm(token);
    const exact = known.find((k) => norm(k) === t);
    if (exact) return exact;
    const tail = known.filter((k) => norm(k).endsWith(' ' + t) || norm(k) === t);
    if (tail.length === 1) return tail[0];
    const single = known.find((k) => (norm(k).split(' ').pop() ?? '') === t);
    return single ?? null;
  };
  const srcNames = sources.map((s) => s.name);
  const dstNames = destinations.map((d) => d.name);
  while ((m = costRe.exec(text)) !== null) {
    const s = matchName(m[1], srcNames);
    const d = matchName(m[2], dstNames);
    if (s && d) {
      costs[s] = costs[s] ?? {};
      costs[s][d] = parseFloat(m[3]);
    }
  }
  const needed = sources.length * destinations.length;
  const have = Object.values(costs).reduce((acc, row) => acc + Object.keys(row).length, 0);
  if (have < needed) return null;
  return { sources, destinations, costs };
}

export function solveTransportation(data: TransportData): Analysis {
  const { sources, destinations, costs } = data;
  const totalSupply = sources.reduce((s, x) => s + x.supply, 0);
  const totalDemand = destinations.reduce((s, x) => s + x.demand, 0);
  if (totalSupply + 1e-9 < totalDemand) {
    throw new Error(
      `Total supply (${totalSupply}) is less than total demand (${totalDemand}) — no feasible shipping plan exists.`,
    );
  }
  const nS = sources.length;
  const nD = destinations.length;
  const idx = (i: number, j: number) => i * nD + j;
  const c: number[] = [];
  for (let i = 0; i < nS; i++) for (let j = 0; j < nD; j++) c.push(-costs[sources[i].name][destinations[j].name]);
  const constraints: { coeffs: number[]; rhs: number; sense: '<=' | '>=' | '=' }[] = [];
  for (let i = 0; i < nS; i++) {
    const coeffs = new Array(nS * nD).fill(0);
    for (let j = 0; j < nD; j++) coeffs[idx(i, j)] = 1;
    constraints.push({ coeffs, rhs: sources[i].supply, sense: '<=' });
  }
  for (let j = 0; j < nD; j++) {
    const coeffs = new Array(nS * nD).fill(0);
    for (let i = 0; i < nS; i++) coeffs[idx(i, j)] = 1;
    constraints.push({ coeffs, rhs: destinations[j].demand, sense: '>=' });
  }
  const lp = solveLP(c, constraints);
  if (lp.status !== 'optimal') throw new Error('The solver could not find an optimal transportation plan for these numbers.');
  const shipments: ShipmentResult[] = [];
  for (let i = 0; i < nS; i++) {
    for (let j = 0; j < nD; j++) {
      const q = Math.max(0, lp.solution[idx(i, j)]);
      if (q > 0.0001) {
        shipments.push({
          source: sources[i].name,
          destination: destinations[j].name,
          quantity: round4(q),
          cost: round2(costs[sources[i].name][destinations[j].name] * q),
        });
      }
    }
  }
  const totalCost = round2(-lp.objective);
  return {
    model_type: 'transportation',
    problem_summary: 'Choose shipment quantities to minimize total shipping cost.',
    technique: 'Transportation linear programming',
    objective: 'Minimize total shipping cost',
    variables: sources.flatMap((s) => destinations.map((d) => `quantity from ${s.name} to ${d.name}`)),
    constraints: [
      ...sources.map((s) => `shipments from ${s.name} must not exceed supply ${s.supply}`),
      ...destinations.map((d) => `deliveries to ${d.name} must meet demand ${d.demand}`),
    ],
    assumptions: ['Shipping cost is linear in quantity; fractional units allowed.'],
    products: [],
    resources: [],
    shipments,
    strategies: [],
    total_cost: totalCost,
    explanation: `The lowest-cost transportation plan has a total shipping cost of $${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`,
  };
}

/* ---------------- game theory parsing + solving (port of backend) ----------- */

export function solveGameActions(
  first: string,
  second: string,
  payoffs: Record<string, Record<string, number>>,
): Analysis {
  const p2 = [first, second];
  // max v s.t. sum p = 1, sum_a payoff[a][r]*p[a] >= v; v free -> v+ - v-
  // vars: p[first], p[second], vPos, vNeg
  const c = [0, 0, 1, -1];
  const constraints: { coeffs: number[]; rhs: number; sense: '<=' | '>=' | '=' }[] = [
    { coeffs: [1, 1, 0, 0], rhs: 1, sense: '=' },
  ];
  for (const r of p2) {
    constraints.push({ coeffs: [payoffs[first][r], payoffs[second][r], -1, 1], rhs: 0, sense: '>=' });
  }
  const lp = solveLP(c, constraints);
  if (lp.status !== 'optimal') throw new Error('The solver could not find an optimal game strategy.');
  const probs = [Math.max(0, lp.solution[0]), Math.max(0, lp.solution[1])];
  const gameValue = round4(lp.solution[2] - lp.solution[3]);
  const strategies: StrategyResult[] = [];
  [first, second].forEach((a, i) => {
    if (probs[i] > 0.0001) strategies.push({ player: 'Player 1', action: a, probability: round4(probs[i]) });
  });
  return {
    model_type: 'game_theory',
    problem_summary: 'Choose a mixed strategy for Player 1 against a competing Player 2.',
    technique: 'Zero-sum game linear programming',
    objective: "Maximize Player 1's guaranteed expected payoff",
    variables: [`probability of ${first}`, `probability of ${second}`],
    constraints: [
      'strategy probabilities sum to 1',
      'expected payoff is at least the game value against every opposing action',
    ],
    assumptions: ['The game is zero-sum and both players choose actions simultaneously.'],
    products: [],
    resources: [],
    shipments: [],
    strategies,
    game_value: gameValue,
    explanation: `The optimal mixed strategy guarantees an expected payoff of ${fmtG(gameValue)} for Player 1.`,
  };
}

function parseGame(text: string): Analysis | null {
  const gameMatch = /choose\s+([A-Za-z]+)\s+or\s+([A-Za-z]+)/i.exec(text);
  if (!gameMatch || !/player\s+1|player\s+2|payoff|expected payoff/i.test(text)) return null;
  const [, first, second] = gameMatch;
  const listed = /payoffs?\s+(?:are|of)\s+(-?\d+(?:\.\d+)?)\s*(?:,\s*and|,|and)\s*(-?\d+(?:\.\d+)?)\s*(?:,\s*and|,|and)\s*(-?\d+(?:\.\d+)?)\s*(?:,\s*and|,|and)\s*(-?\d+(?:\.\d+)?)/i.exec(text);
  if (listed) {
    const v = listed.slice(1, 5).map(Number);
    return solveGameActions(first, second, {
      [first]: { [first]: v[0], [second]: v[1] },
      [second]: { [first]: v[2], [second]: v[3] },
    });
  }
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns: [string, string, RegExp][] = [
    [first, first, new RegExp(`both\\s+${esc(first)}.*?(-?\\d+(?:\\.\\d+)?)`, 'i')],
    [first, second, new RegExp(`Player\\s+1\\s+${esc(first)}.*?Player\\s+2\\s+${esc(second)}.*?(-?\\d+(?:\\.\\d+)?)`, 'i')],
    [second, first, new RegExp(`Player\\s+1\\s+${esc(second)}.*?Player\\s+2\\s+${esc(first)}.*?(-?\\d+(?:\\.\\d+)?)`, 'i')],
    [second, second, new RegExp(`both\\s+${esc(second)}.*?(-?\\d+(?:\\.\\d+)?)`, 'i')],
  ];
  const payoffs: Record<string, Record<string, number>> = {};
  for (const [a, b, re] of patterns) {
    const mm = re.exec(text);
    if (!mm) return null;
    payoffs[a] = payoffs[a] ?? {};
    payoffs[a][b] = parseFloat(mm[1]);
  }
  return solveGameActions(first, second, payoffs);
}

/* ---------------- dispatcher ------------------------------------------------ */

const TRANSPORT_WORDS = /warehouse|ship|shipping|transport|freight|supplier|customer|distribution/i;

export function isTransportLike(text: string): boolean {
  return TRANSPORT_WORDS.test(text);
}

/** Solve entirely in-browser. Throws Error with a user-friendly message on failure. */
export function solveLocally(problem: string): Analysis {
  const text = problem.trim();
  if (text.length < 10) throw new Error('Please add a little more detail — profits, resources and capacities help the solver.');

  const game = parseGame(text);
  if (game) return game;

  const transportWords = isTransportLike(text);
  const t = parseTransportation(text);
  if (t) return solveTransportation(t);
  if (transportWords) {
    throw new Error(
      'Transportation needs: each source like "Warehouse A has supply 100", each destination like "Store X needs demand 120", and every route like "A to X costs 4". Add those details and try again.',
    );
  }

  const prod = parseProduction(text);
  if (prod) return solveProduction(prod.products, prod.capacities);
  throw new Error(
    'Could not build a model from that text. For production try: "Product A gives 40 profit and needs 2 units Machine and 1 units Labor. ... We have 100 units Machine and 80 units Labor." Or use a built-in example.',
  );
}
