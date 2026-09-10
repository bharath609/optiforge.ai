import json
import os
import re
import asyncio
from urllib.request import Request, urlopen

from .schemas import PlanningModel


async def extract_model(problem: str) -> PlanningModel:
    api_key = os.getenv("EXPLABS_API_KEY")
    if api_key:
        return await _extract_with_provider(problem, api_key)
    return _extract_with_fallback(problem)


async def _extract_with_provider(problem: str, api_key: str) -> PlanningModel:
    base_url = os.getenv("EXPERIENTIAL_BASE_URL", "https://api.experientiallabs.ai/v1").rstrip("/")
    model = os.getenv("EXPERIENTIAL_MODEL", "gpt-6-astra")
    prompt = """Extract a production planning model from the user text. Return JSON only with this shape: {\"products\":[{\"name\":string,\"profit\":number,\"resource_usage\":{resource:number},\"demand_limit\":number|null}],\"capacities\":{resource:number}}. Use consistent resource names and do not invent missing numbers.\n\nUser text:\n""" + problem
    request = Request(
        f"{base_url}/chat/completions",
        data=json.dumps({"model": model, "messages": [{"role": "user", "content": prompt}], "temperature": 0}).encode(),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )

    def call_provider() -> str:
        with urlopen(request, timeout=45) as response:
            payload = json.loads(response.read())
        return payload["choices"][0]["message"]["content"]

    content = await asyncio.to_thread(call_provider)
    return PlanningModel.model_validate_json(_strip_code_fence(content))


def _strip_code_fence(content: str) -> str:
    match = re.search(r"\{.*\}", content, re.DOTALL)
    return match.group(0) if match else content


def _extract_with_fallback(problem: str) -> PlanningModel:
    text = problem.replace("$", "")
    products = []
    for sentence in text.split("."):
        entry = re.search(r"(Product\s+[A-Za-z0-9]+).*?(\d+(?:\.\d+)?)\s+profit.*?needs\s+(.*)", sentence, re.I)
        if not entry:
            continue
        name, profit, resource_text = entry.groups()
        segment = f"{profit} {resource_text}"
        usage = _parse_resource_values(segment)
        demand_match = re.search(rf"Demand for {re.escape(name.split()[-1])}.*?(?:at most|maximum|max)\s*(\d+(?:\.\d+)?)", text, re.I)
        if usage:
            products.append({"name": name, "profit": float(profit), "resource_usage": usage, "demand_limit": float(demand_match.group(1)) if demand_match else None})

    capacities = _parse_resource_values(re.search(r"We have (.*?)(?:Demand|$)", text, re.I).group(1) if re.search(r"We have (.*?)(?:Demand|$)", text, re.I) else "")
    if not products or not capacities:
        raise ValueError("Could not extract a complete model. Add product profits, resource usage, and capacities, or configure EXPLABS_API_KEY.")
    return PlanningModel.model_validate({"products": products, "capacities": capacities})


def _parse_resource_values(text: str) -> dict[str, float]:
    values: dict[str, float] = {}
    for value, _, resource_before_unit, resource_after_unit, _ in re.findall(
        r"(\d+(?:\.\d+)?)\s*(?:(hours?|kg|units?)\s+(?:on|of)?\s*([A-Za-z][\w ]*?)|([A-Za-z][\w ]*?)\s+(hours?|kg|units?))(?=\s+and|,|\.|$)",
        text,
        re.I,
    ):
        resource = (resource_after_unit or resource_before_unit).strip()
        resource = re.sub(r"^(?:hours?|kg|units?)\s+", "", resource, flags=re.I)
        values[resource] = float(value)
    return values
