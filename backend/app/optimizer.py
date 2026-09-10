import pyomo.environ as pyo

from .schemas import PlanningModel, ProductResult, ResourceResult


def solve_model(planning_model: PlanningModel) -> tuple[list[ProductResult], list[ResourceResult], float]:
    model = pyo.ConcreteModel()
    product_names = [product.name for product in planning_model.products]
    resource_names = list(planning_model.capacities)
    products = {product.name: product for product in planning_model.products}

    model.products = pyo.Set(initialize=product_names)
    model.quantity = pyo.Var(model.products, domain=pyo.NonNegativeReals)

    def resource_constraint(model: pyo.ConcreteModel, resource: str):
        return sum(products[name].resource_usage.get(resource, 0) * model.quantity[name] for name in model.products) <= planning_model.capacities[resource]

    model.resources = pyo.Set(initialize=resource_names)
    model.capacity = pyo.Constraint(model.resources, rule=resource_constraint)

    def demand_constraint(model: pyo.ConcreteModel, name: str):
        limit = products[name].demand_limit
        return pyo.Constraint.Skip if limit is None else model.quantity[name] <= limit

    model.demand = pyo.Constraint(model.products, rule=demand_constraint)
    model.profit = pyo.Objective(
        expr=sum(products[name].profit * model.quantity[name] for name in model.products),
        sense=pyo.maximize,
    )

    solver = pyo.SolverFactory("appsi_highs")
    if not solver.available(exception_flag=False):
        raise RuntimeError("The HiGHS solver is not available in this environment.")
    result = solver.solve(model)
    if result.solver.termination_condition != pyo.TerminationCondition.optimal:
        raise RuntimeError(f"Solver did not find an optimal plan: {result.solver.termination_condition}")

    product_results = [
        ProductResult(name=name, quantity=round(pyo.value(model.quantity[name]), 4), profit=round(products[name].profit * pyo.value(model.quantity[name]), 2))
        for name in product_names
    ]
    resource_results = []
    for resource in resource_names:
        used = sum(products[name].resource_usage.get(resource, 0) * pyo.value(model.quantity[name]) for name in product_names)
        capacity = planning_model.capacities[resource]
        resource_results.append(ResourceResult(name=resource, used=round(used, 4), capacity=capacity, utilization=round(used / capacity if capacity else 0, 4)))

    return product_results, resource_results, round(pyo.value(model.profit), 2)
