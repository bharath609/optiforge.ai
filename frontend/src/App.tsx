import { useState } from 'react'
import './App.css'

type ProductResult = { name: string; quantity: number; profit: number }
type ResourceResult = { name: string; used: number; capacity: number; utilization: number }
type ShipmentResult = { source: string; destination: string; quantity: number; cost: number }
type StrategyResult = { player: string; action: string; probability: number }
type Analysis = { model_type: 'production' | 'transportation' | 'game_theory'; problem_summary: string; technique: string; objective: string; variables: string[]; constraints: string[]; assumptions: string[]; products: ProductResult[]; resources: ResourceResult[]; shipments: ShipmentResult[]; strategies: StrategyResult[]; game_value?: number; total_profit?: number; total_cost?: number; explanation: string }
const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

function App() {
  const [problem, setProblem] = useState('')
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSolve() {
    if (!problem.trim()) {
      setMessage('Please describe your production-planning problem first.')
      return
    }

    setLoading(true)
    setMessage('')

    try {
      const response = await fetch(`${API_URL}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ problem }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'The model could not be solved.')
      setAnalysis(data)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not reach the backend. Check that Uvicorn is running.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <nav className="navbar">
        <div className="brand">
          <span className="brand-mark">◈</span>
          optiforge.ai
        </div>
        <span className="status">● Solver ready</span>
      </nav>

      <main>
        <section className="hero">
          <p className="eyebrow">AI-POWERED OPERATIONS RESEARCH</p>
          <h1>Turn operational complexity<br />into clear decisions.</h1>
          <p className="hero-text">
            Describe your business problem in simple language.
            OptiForge will identify the model and create the best plan.
          </p>
        </section>

        <section className="prompt-card">
          <div className="prompt-heading">
            <div>
              <h2>What would you like to optimize?</h2>
              <p>Include the decisions, constraints, costs, demand, and locations if you know them.</p>
            </div>
            <span className="badge">AI model selection</span>
          </div>

          <textarea
            value={problem}
            onChange={(event) => setProblem(event.target.value)}
            placeholder="Example: We have two warehouses, three stores, available inventory, store demand, and shipping costs between each warehouse and store. Find the lowest-cost shipping plan."
          />

          <div className="prompt-footer">
            <span>Local-first planning workspace</span>
            <button onClick={handleSolve} disabled={loading}>
              {loading ? 'Analyzing...' : <>Solve my plan <span>→</span></>}
            </button>
          </div>
        </section>

        {message && <p className="message error">{message}</p>}

        {analysis && (
          <section className="results" aria-live="polite">
            <div className="result-panel formulation">
              <p className="eyebrow">MODEL UNDERSTANDING</p>
              <h3>{analysis.problem_summary}</h3>
              <div className="metric-row"><span>Technique</span><strong>{analysis.technique}</strong></div>
              <div className="metric-row"><span>Objective</span><strong>{analysis.objective}</strong></div>
              {analysis.variables.length > 0 && <p><small>Decisions: {analysis.variables.join(', ')}</small></p>}
              {analysis.constraints.length > 0 && <p><small>Constraints: {analysis.constraints.join('; ')}</small></p>}
              {analysis.assumptions.length > 0 && <p><small>Assumptions: {analysis.assumptions.join('; ')}</small></p>}
            </div>
              {analysis.model_type === 'game_theory' ? (
                <>
                  <div className="result-header">
                    <div><p className="eyebrow">GAME THEORY</p><h2>Recommended mixed strategy</h2></div>
                    <div className="profit"><span>Expected payoff</span><strong>{analysis.game_value}</strong></div>
                  </div>
                  <p className="explanation">{analysis.explanation}</p>
                  <div className="result-panel"><h3>Player 1 strategy</h3>{analysis.strategies.map((strategy) => <div className="metric-row" key={strategy.action}><span>{strategy.action}</span><strong>{Math.round(strategy.probability * 100)}%</strong></div>)}</div>
                </>
              ) : analysis.model_type === 'transportation' ? (
                <>
                  <div className="result-header">
                    <div><p className="eyebrow">TRANSPORTATION PLAN</p><h2>Shipping recommendation</h2></div>
                    <div className="profit"><span>Total shipping cost</span><strong>${analysis.total_cost?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div>
                  </div>
                  <p className="explanation">{analysis.explanation}</p>
                  <div className="result-panel"><h3>Ship these quantities</h3>{analysis.shipments.map((shipment) => <div className="metric-row" key={`${shipment.source}-${shipment.destination}`}><span>{shipment.source} to {shipment.destination}</span><strong>{shipment.quantity} units · ${shipment.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div>)}</div>
                </>
              ) : (
                <>
            <div className="result-header">
              <div>
                <p className="eyebrow">OPTIMAL PLAN</p>
                <h2>Production recommendation</h2>
              </div>
              <div className="profit"><span>Total profit</span><strong>${analysis.total_profit?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div>
            </div>
            <p className="explanation">{analysis.explanation}</p>
            <div className="result-grid">
              <div className="result-panel">
                <h3>Make this much</h3>
                {analysis.products.map((product) => <div className="metric-row" key={product.name}><span>{product.name}</span><strong>{product.quantity} units</strong></div>)}
              </div>
              <div className="result-panel">
                <h3>Capacity used</h3>
                {analysis.resources.map((resource) => <div className="resource" key={resource.name}><div className="metric-row"><span>{resource.name}</span><strong>{Math.round(resource.utilization * 100)}%</strong></div><div className="bar"><i style={{ width: `${Math.min(resource.utilization * 100, 100)}%` }} /></div><small>{resource.used} of {resource.capacity} available</small></div>)}
              </div>
            </div>
              </>
            )}
          </section>
        )}

        <section className="features">
          <article>
            <span>01</span>
            <h3>Describe</h3>
            <p>Write your planning problem naturally, just as you would explain it to a colleague.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Optimize</h3>
            <p>AI understands the problem while the solver finds the mathematically best plan.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Decide</h3>
            <p>Get a clear production recommendation and understand the reason behind it.</p>
          </article>
        </section>
      </main>
    </div>
  )
}

export default App