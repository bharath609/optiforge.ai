import os

from fastapi import FastAPI
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from .ai import extract_model
from .optimizer import solve_model
from .schemas import AnalyzeResponse, ProblemRequest

load_dotenv()

app = FastAPI()

frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_origin, "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {"message": "OptiForge backend is working"}


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(request: ProblemRequest):
    try:
        planning_model = await extract_model(request.problem)
        products, resources, total_profit = solve_model(planning_model)
    except (ValueError, RuntimeError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    constrained_resources = [resource.name for resource in resources if resource.utilization >= 0.999]
    if constrained_resources:
        explanation = f"The plan produces the highest possible profit of ${total_profit:,.2f}. " \
            f"The limiting resource is {', '.join(constrained_resources)}."
    else:
        explanation = f"The plan produces the highest possible profit of ${total_profit:,.2f} within the stated limits."
    return AnalyzeResponse(
        model=planning_model,
        products=products,
        resources=resources,
        total_profit=total_profit,
        explanation=explanation,
    )