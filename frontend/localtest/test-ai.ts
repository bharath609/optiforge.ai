import { configureAI, extractWithAI, isAIConfigured } from '../src/lib/remoteAI';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('ok: ' + msg);
}

async function main() {
  assert(!isAIConfigured(), 'AI off without config');

  (globalThis as unknown as { __AI_ENV__?: object }).__AI_ENV__ = undefined;
  configureAI({ baseUrl: 'https://example.test/v1', apiKey: 'test-key', model: 'test-model' });
  assert(isAIConfigured(), 'AI on with injected config');

  // Canned AI reply: free-form bakery description -> production model JSON
  const canned = {
    choices: [
      {
        message: {
          content:
            '```json\n{"model_type":"production","problem_summary":"Bakery plan","technique":"LP","objective":"Max profit","variables":["bread","cake"],"constraints":["oven"],"assumptions":[],"model":{"products":[{"name":"Bread","profit":25,"resource_usage":{"Oven":3},"demand_limit":null},{"name":"Cake","profit":45,"resource_usage":{"Oven":4},"demand_limit":20}],"capacities":{"Oven":120}}}\n```',
        },
      },
    ],
  };
  (globalThis as unknown as { fetch?: unknown }).fetch = async () =>
    ({ ok: true, status: 200, json: async () => canned }) as Response;

  const a = await extractWithAI('a bakery with bread and cake, 120 oven hours...');
  assert(a.model_type === 'production', 'AI production type');
  // Bread: 25 profit/3 oven; Cake: 45/4 oven, demand<=20. Cake first: 20 cakes use 80 oven -> 40 left -> 13.333 bread. Profit 900+333.33=1233.33
  const profit = a.total_profit ?? 0;
  assert(Math.abs(profit - 1233.33) < 0.01, 'AI model solved, profit ' + profit);
  assert(a.problem_summary === 'Bakery plan', 'AI metadata kept');

  // Bad JSON from AI -> friendly error
  (globalThis as unknown as { fetch?: unknown }).fetch = async () =>
    ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'not json' } }] }) }) as Response;
  let msg = '';
  try {
    await extractWithAI('blah');
  } catch (e) {
    msg = e instanceof Error ? e.message : '';
  }
  assert(msg.length > 5, 'garbage AI reply errors cleanly: ' + msg);

  // 401 -> key error message
  (globalThis as unknown as { fetch?: unknown }).fetch = async () => ({ ok: false, status: 401 }) as Response;
  let msg2 = '';
  try {
    await extractWithAI('blah');
  } catch (e) {
    msg2 = e instanceof Error ? e.message : '';
  }
  assert(/key/i.test(msg2), '401 mentions key: ' + msg2);

  console.log('done');
}

main().catch((e) => {
  console.error(e);
  throw e;
});
