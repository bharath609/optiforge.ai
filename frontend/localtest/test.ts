import { solveLocally } from '../src/lib/localSolver';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    throw new Error('FAIL: ' + msg);
  }
  console.log('ok: ' + msg);
}
function near(a: number, b: number, tol = 1e-6) {
  return Math.abs(a - b) <= tol;
}

// 1. Furniture (HiGHS oracle: profit 2200, A=40, B=20)
const f = solveLocally(
  'Product A gives 40 profit and needs 2 units Machine and 1 units Labor. Product B gives 30 profit and needs 1 units Machine and 2 units Labor. We have 100 units Machine and 80 units Labor. Demand for A at most 40.',
);
assert(f.model_type === 'production', 'furniture type');
assert(near(f.total_profit ?? 0, 2200), 'furniture profit 2200, got ' + f.total_profit);
assert(near(f.products[0].quantity, 40) && near(f.products[1].quantity, 20), 'furniture quantities');

// 2. Bakery (HiGHS oracle: 1233.33)
const b = solveLocally(
  'Product Bread gives 25 profit and needs 3 units Oven and 2 units Labor. Product Cake gives 45 profit and needs 4 units Oven and 3 units Labor. We have 120 units Oven and 90 units Labor. Demand for Cake at most 20.',
);
assert(near(b.total_profit ?? 0, 1233.33, 0.01), 'bakery profit 1233.33, got ' + b.total_profit);

// 3. Electronics (HiGHS oracle: 14133.33)
const e = solveLocally(
  'Product Phone gives 120 profit and needs 2 units Chips and 1 units Assembly. Product Tablet gives 100 profit and needs 1 units Chips and 2 units Assembly. We have 200 units Chips and 180 units Assembly.',
);
assert(near(e.total_profit ?? 0, 14133.33, 0.01), 'electronics profit, got ' + e.total_profit);

// 4. Transportation (HiGHS oracle: total 890, A->X 100, B->X 20, B->Y 130)
const t = solveLocally(
  'Warehouse A has supply 100. Warehouse B has supply 150. Store X needs demand 120. Store Y needs demand 130. Shipping costs: A to X costs 4, A to Y costs 6, B to X costs 5, B to Y costs 3.',
);
assert(t.model_type === 'transportation', 'transport type, got ' + t.model_type);
assert(near(t.total_cost ?? 0, 890), 'transport cost 890, got ' + t.total_cost);
assert(t.shipments.length === 3, 'transport 3 routes, got ' + t.shipments.length);

// 5. Game matching pennies (oracle: 50/50, value 0)
const g1 = solveLocally(
  'Two players choose Heads or Tails. Player 1 and Player 2 payoffs are 1, -1, -1 and 1.',
);
assert(g1.model_type === 'game_theory', 'game1 type');
assert(near(g1.game_value ?? 999, 0), 'game1 value 0, got ' + g1.game_value);
assert(g1.strategies.length === 2 && near(g1.strategies[0].probability, 0.5), 'game1 50/50');

// 6. Game asymmetric (oracle: 50/50, value 0.5)
const g2 = solveLocally(
  'Two players choose Attack or Defend. Player 1 and Player 2 payoffs are 3, -1, -2 and 2.',
);
assert(near(g2.game_value ?? 999, 0.5), 'game2 value 0.5, got ' + g2.game_value);

// 7. Bad input gives friendly error, not a crash
let threw = '';
try {
  solveLocally('hello world foo bar');
} catch (err) {
  threw = err instanceof Error ? err.message : 'unknown';
}
assert(threw.length > 20, 'friendly error on garbage input');

// 8. Infeasible transport (supply < demand) errors cleanly
let threw2 = '';
try {
  solveLocally(
    'Warehouse A has supply 10. Store X needs demand 100. Shipping costs: A to X costs 4.',
  );
} catch (err) {
  threw2 = err instanceof Error ? err.message : 'unknown';
}
assert(/supply/i.test(threw2), 'infeasible transport message, got: ' + threw2);

console.log('done');
