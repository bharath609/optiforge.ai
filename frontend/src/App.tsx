import { useEffect, useState } from 'react'
import './App.css'

type ProductResult = { name: string; quantity: number; profit: number }
type ResourceResult = { name: string; used: number; capacity: number; utilization: number }
type ShipmentResult = { source: string; destination: string; quantity: number; cost: number }
type StrategyResult = { player: string; action: string; probability: number }
type Analysis = {
  model_type: 'production' | 'transportation' | 'game_theory'
  problem_summary: string
  technique: string
  objective: string
  variables: string[]
  constraints: string[]
  assumptions: string[]
  products: ProductResult[]
  resources: ResourceResult[]
  shipments: ShipmentResult[]
  strategies: StrategyResult[]
  game_value?: number
  total_profit?: number
  total_cost?: number
  explanation: string
}

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

const EXAMPLES = [
  {
    label: 'Furniture workshop',
    tag: 'Production · works instantly',
    prompt:
      'Product A gives 40 profit and needs 2 units Machine and 1 units Labor. Product B gives 30 profit and needs 1 units Machine and 2 units Labor. We have 100 units Machine and 80 units Labor. Demand for A at most 40.',
  },
  {
    label: 'Bakery plan',
    tag: 'Production · works instantly',
    prompt:
      'Product Bread gives 25 profit and needs 3 units Oven and 2 units Labor. Product Cake gives 45 profit and needs 4 units Oven and 3 units Labor. We have 120 units Oven and 90 units Labor. Demand for Cake at most 20.',
  },
  {
    label: 'Electronics line',
    tag: 'Production · works instantly',
    prompt:
      'Product Phone gives 120 profit and needs 2 units Chips and 1 units Assembly. Product Tablet gives 100 profit and needs 1 units Chips and 2 units Assembly. We have 200 units Chips and 180 units Assembly.',
  },
]

function App() {
  const [problem, setProblem] = useState('')
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [backend, setBackend] = useState<'checking' | 'online' | 'offline'>('checking')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`${API_URL}/`, { method: 'GET' })
      .then((res) => {
        if (!cancelled) setBackend(res.ok ? 'online' : 'offline')
      })
      .catch(() => {
        if (!cancelled) setBackend('offline')
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSolve() {
    if (!problem.trim()) {
      setMessage('Please describe your production-planning problem first, or try one of the examples below.')
      return
    }
    if (problem.trim().length < 10) {
      setMessage('Please add a little more detail — profits, resources and capacities help the solver.')
      return
    }

    setLoading(true)
    setMessage('')
    setAnalysis(null)

    try {
      const response = await fetch(`${API_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'The model could not be solved.')
      setAnalysis(data)
    } catch (error) {
      if (API_URL.includes('127.0.0.1') || API_URL.includes('localhost')) {
        setMessage(
          'Demo backend is not connected yet. The public API is being moved to Hugging Face — try the examples locally with `uvicorn app.main:app` running, or check back soon.',
        )
      } else {
        setMessage(error instanceof Error ? error.message : 'Could not reach the backend. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  function useExample(prompt: string) {
    setProblem(prompt)
    setMessage('')
    document.getElementById('solver')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function copyPlan() {
    if (!analysis) return
    const lines = [
      analysis.problem_summary,
      '',
      analysis.explanation,
      '',
      ...analysis.products.map((p) => `${p.name}: ${p.quantity} units ($${p.profit})`),
      ...analysis.resources.map((r) => `${r.name}: ${r.used}/${r.capacity} (${Math.round(r.utilization * 100)}%)`),
      ...analysis.shipments.map((s) => `${s.source} -> ${s.destination}: ${s.quantity} units ($${s.cost})`),
      ...analysis.strategies.map((s) => `${s.action}: ${Math.round(s.probability * 100)}%`),
    ]
    navigator.clipboard?.writeText(lines.join('\n')).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      },
      () => setMessage('Copy failed — select the results manually.'),
    )
  }

  const charCount = problem.length

  return (
    <div className="page">
      <header className="navbar">
        <div className="brand">
          <span className="brand-mark">◈</span>
          <span>
            optiforge.ai
            <small>Operations research, simplified</small>
          </span>
        </div>
        <nav className="nav-links">
          <a href="#solver">Solver</a>
          <a href="#how">How it works</a>
          <a href="#use-cases">Use cases</a>
          <a href="https://github.com/bharath609/optiforge.ai" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
        <div className="nav-cta">
          <span className={`status status-${backend}`}>
            <i /> {backend === 'checking' ? 'Checking API…' : backend === 'online' ? 'API online' : 'Demo mode'}
          </span>
          <a className="btn btn-small" href="#solver">
            Start optimizing
          </a>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="pulse" /> AI-POWERED OPERATIONS RESEARCH
            </p>
            <h1>
              Turn operational complexity into <span className="gradient">clear decisions.</span>
            </h1>
            <p className="hero-text">
              Describe your business problem in plain English. OptiForge identifies the right model —
              production, transportation, or game theory — and returns a mathematically optimal plan in seconds.
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary" href="#solver">
                Solve my plan <span aria-hidden>→</span>
              </a>
              <button className="btn btn-ghost" onClick={() => useExample(EXAMPLES[0].prompt)} type="button">
                Try a live example
              </button>
            </div>
            <div className="hero-stats">
              <div>
                <strong>3</strong>
                <span>model types supported</span>
              </div>
              <div>
                <strong>&lt;10s</strong>
                <span>typical solve time</span>
              </div>
              <div>
                <strong>100%</strong>
                <span>optimal, not heuristic</span>
              </div>
            </div>
          </div>
          <div className="hero-card" aria-hidden>
            <div className="hero-card-head">
              <span />
              <span />
              <span />
              <em>optimal plan · production</em>
            </div>
            <div className="hero-card-body">
              <div className="hero-metric">
                <span>Total profit</span>
                <strong>$2,200.00</strong>
              </div>
              <div className="hero-bar">
                <div>
                  <span>Product A</span>
                  <span>40 units</span>
                </div>
                <i>
                  <b style={{ width: '82%' }} />
                </i>
              </div>
              <div className="hero-bar">
                <div>
                  <span>Product B</span>
                  <span>20 units</span>
                </div>
                <i>
                  <b style={{ width: '54%' }} />
                </i>
              </div>
              <p>Limiting resource: Machine · 100% utilized</p>
            </div>
          </div>
        </section>

        <section className="trust">
          <span>Built for</span>
          <strong>Manufacturing</strong>
          <strong>Logistics</strong>
          <strong>Retail planning</strong>
          <strong>Studios &amp; agencies</strong>
          <strong>Founders</strong>
        </section>

        <section className="prompt-card" id="solver">
          <div className="prompt-heading">
            <div>
              <h2>What would you like to optimize?</h2>
              <p>Include decisions, constraints, costs, demand, and locations if you know them.</p>
            </div>
            <span className="badge">AI model selection + HiGHS solver</span>
          </div>

          <textarea
            value={problem}
            onChange={(event) => setProblem(event.target.value)}
            placeholder="Example: Product A gives 40 profit and needs 2 units Machine and 1 units Labor. Product B gives 30 profit and needs 1 units Machine and 2 units Labor. We have 100 units Machine and 80 units Labor."
            maxLength={10000}
          />

          <div className="examples">
            {EXAMPLES.map((ex) => (
              <button key={ex.label} type="button" className="example-chip" onClick={() => useExample(ex.prompt)}>
                <strong>{ex.label}</strong>
                <span>{ex.tag}</span>
              </button>
            ))}
          </div>

          <div className="prompt-footer">
            <span>
              {charCount.toLocaleString()} / 10,000 chars · No signup needed ·{' '}
              {backend === 'online' ? 'Backend connected.' : 'Works instantly for production examples.'}
            </span>
            <button className="btn btn-primary" onClick={handleSolve} disabled={loading} type="button">
              {loading ? (
                <>
                  <span className="spinner" /> Analyzing…
                </>
              ) : (
                <>
                  Solve my plan <span aria-hidden>→</span>
                </>
              )}
            </button>
          </div>
        </section>

        {message && (
          <p className="message error" role="alert">
            {message}
          </p>
        )}

        {loading && (
          <section className="results skeleton" aria-label="Loading results">
            <div className="sk sk-title" />
            <div className="sk sk-line" />
            <div className="sk sk-line short" />
            <div className="result-grid">
              <div className="sk sk-box" />
              <div className="sk sk-box" />
            </div>
          </section>
        )}

        {analysis && !loading && (
          <section className="results" aria-live="polite">
            <div className="result-panel formulation">
              <div className="formulation-head">
                <div>
                  <p className="eyebrow">MODEL UNDERSTANDING</p>
                  <h3>{analysis.problem_summary}</h3>
                </div>
                <button className="btn btn-ghost btn-small" onClick={copyPlan} type="button">
                  {copied ? 'Copied ✓' : 'Copy plan'}
                </button>
              </div>
              <div className="metric-row">
                <span>Technique</span>
                <strong>{analysis.technique}</strong>
              </div>
              <div className="metric-row">
                <span>Objective</span>
                <strong>{analysis.objective}</strong>
              </div>
              {analysis.variables.length > 0 && (
                <p>
                  <small>Decisions: {analysis.variables.join(', ')}</small>
                </p>
              )}
              {analysis.constraints.length > 0 && (
                <p>
                  <small>Constraints: {analysis.constraints.join('; ')}</small>
                </p>
              )}
              {analysis.assumptions.length > 0 && (
                <p>
                  <small>Assumptions: {analysis.assumptions.join('; ')}</small>
                </p>
              )}
            </div>

            {analysis.model_type === 'game_theory' ? (
              <>
                <div className="result-header">
                  <div>
                    <p className="eyebrow">GAME THEORY</p>
                    <h2>Recommended mixed strategy</h2>
                  </div>
                  <div className="profit">
                    <span>Expected payoff</span>
                    <strong>{analysis.game_value}</strong>
                  </div>
                </div>
                <p className="explanation">{analysis.explanation}</p>
                <div className="result-panel">
                  <h3>Player 1 strategy</h3>
                  {analysis.strategies.map((strategy) => (
                    <div className="metric-row" key={strategy.action}>
                      <span>{strategy.action}</span>
                      <strong>{Math.round(strategy.probability * 100)}%</strong>
                    </div>
                  ))}
                </div>
              </>
            ) : analysis.model_type === 'transportation' ? (
              <>
                <div className="result-header">
                  <div>
                    <p className="eyebrow">TRANSPORTATION PLAN</p>
                    <h2>Shipping recommendation</h2>
                  </div>
                  <div className="profit">
                    <span>Total shipping cost</span>
                    <strong>
                      ${analysis.total_cost?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                </div>
                <p className="explanation">{analysis.explanation}</p>
                <div className="result-panel">
                  <h3>Ship these quantities</h3>
                  {analysis.shipments.map((shipment) => (
                    <div className="metric-row" key={`${shipment.source}-${shipment.destination}`}>
                      <span>
                        {shipment.source} → {shipment.destination}
                      </span>
                      <strong>
                        {shipment.quantity} units · $
                        {shipment.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </strong>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="result-header">
                  <div>
                    <p className="eyebrow">OPTIMAL PLAN</p>
                    <h2>Production recommendation</h2>
                  </div>
                  <div className="profit">
                    <span>Total profit</span>
                    <strong>
                      ${analysis.total_profit?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                </div>
                <p className="explanation">{analysis.explanation}</p>
                <div className="result-grid">
                  <div className="result-panel">
                    <h3>Make this much</h3>
                    {analysis.products.map((product) => (
                      <div className="metric-row" key={product.name}>
                        <span>{product.name}</span>
                        <strong>{product.quantity} units</strong>
                      </div>
                    ))}
                  </div>
                  <div className="result-panel">
                    <h3>Capacity used</h3>
                    {analysis.resources.map((resource) => (
                      <div className="resource" key={resource.name}>
                        <div className="metric-row">
                          <span>{resource.name}</span>
                          <strong>{Math.round(resource.utilization * 100)}%</strong>
                        </div>
                        <div className="bar">
                          <i style={{ width: `${Math.min(resource.utilization * 100, 100)}%` }} />
                        </div>
                        <small>
                          {resource.used} of {resource.capacity} available
                        </small>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        <section className="features" id="how">
          <article>
            <span>01</span>
            <h3>Describe</h3>
            <p>Write your planning problem naturally, just as you would explain it to a colleague. No math needed.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Optimize</h3>
            <p>AI classifies the model while the HiGHS solver finds the mathematically best plan — not a guess.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Decide</h3>
            <p>Get quantities, costs, utilization, and the reasoning behind them. Copy and share with your team.</p>
          </article>
        </section>

        <section className="use-cases" id="use-cases">
          <p className="eyebrow">WHERE IT HELPS</p>
          <h2>One input box, three powerful solvers.</h2>
          <div className="use-grid">
            <div>
              <h3>🏭 Production planning</h3>
              <p>Maximize profit under machine hours, labor, materials, and demand caps.</p>
            </div>
            <div>
              <h3>🚚 Transportation</h3>
              <p>Minimize shipping cost across warehouses, stores, supplies, and demands.</p>
            </div>
            <div>
              <h3>🎮 Game theory</h3>
              <p>Find optimal mixed strategies and guaranteed payoffs for competitive decisions.</p>
            </div>
          </div>
          <p className="note">
            Production examples run instantly with no API key. Transportation and game theory use GPT-6 Astra when
            configured, with a smart local fallback.
          </p>
        </section>
      </main>

      <footer>
        <div className="foot-inner">
          <div className="brand">
            <span className="brand-mark">◈</span> optiforge.ai
          </div>
          <p>Open-source operations research for everyone. Built with React, FastAPI, and HiGHS.</p>
          <div className="foot-links">
            <a href="https://github.com/bharath609/optiforge.ai" target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href="https://optiforge-ai.vercel.app/" target="_blank" rel="noreferrer">
              Live site
            </a>
            <a href="#solver">Solver</a>
          </div>
          <small>© 2026 OptiForge · MIT License</small>
        </div>
      </footer>
    </div>
  )
}

export default App
