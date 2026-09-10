from pydantic import BaseModel, Field, field_validator


class Product(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    profit: float
    resource_usage: dict[str, float]
    demand_limit: float | None = Field(default=None, ge=0)

    @field_validator("profit")
    @classmethod
    def profit_must_be_non_negative(cls, value: float) -> float:
        if value < 0:
            raise ValueError("profit must be non-negative")
        return value


class PlanningModel(BaseModel):
    products: list[Product] = Field(min_length=1, max_length=30)
    capacities: dict[str, float]

    @field_validator("capacities")
    @classmethod
    def capacities_must_be_positive(cls, value: dict[str, float]) -> dict[str, float]:
        if not value or any(capacity < 0 for capacity in value.values()):
            raise ValueError("capacities must contain non-negative values")
        return value


class ProblemRequest(BaseModel):
    problem: str = Field(min_length=10, max_length=10000)


class ProductResult(BaseModel):
    name: str
    quantity: float
    profit: float


class ResourceResult(BaseModel):
    name: str
    used: float
    capacity: float
    utilization: float


class AnalyzeResponse(BaseModel):
    model: PlanningModel
    products: list[ProductResult]
    resources: list[ResourceResult]
    total_profit: float
    explanation: str
