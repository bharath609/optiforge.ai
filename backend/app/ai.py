import json
import os
import re
import asyncio
from urllib.request import Request, urlopen

from .schemas import BusinessModel


async def extract_model(problem: str) -> BusinessModel:
    if not _is_complex_problem(problem):
        simple_key = os.getenv("SIMPLE_AI_API_KEY")
        if simple_key:
            try:
                return await _extract_with_provider(
                    problem,
                    simple_key,
                    os.getenv("SIMPLE_AI_BASE_URL", "https://api.groq.com/openai/v1"),
                    os.getenv("SIMPLE_AI_MODEL", "llama-3.1-8b-instant"),
                )
            except Exception:
                pass
        try:
            return _extract_with_fallback(problem)
        except ValueError as error:
            raise ValueError("The lightweight model could not understand this simple problem. Check SIMPLE_AI_API_KEY or provide clearer values.") from error

    api_key = os.getenv("EXPLABS_API_KEY")
    if api_key:
        try:
            return await _extract_with_provider(problem, api_key)
        except Exception:
            return _extract_with_fallback(problem)
    return _extract_with_fallback(problem)


def _is_complex_problem(problem: str) -> bool:
    text = problem.strip()
    numeric_values = re.findall(r"-?\d+(?:\.\d+)?", text)
    return len(text) > 700 or len(text.split()) > 120 or len(numeric_values) > 16


async def _extract_with_provider(
    problem: str,
    api_key: str,
    base_url: str | None = None,
    model: str | None = None,
) -> BusinessModel:
    base_url = (base_url or os.getenv("EXPERIENTIAL_BASE_URL", "https://api.experientiallabs.ai/v1")).rstrip("/")
    model = model or os.getenv("EXPERIENTIAL_MODEL", "gpt-6-astra")
    prompt = """You are an operations-research model classifier and mathematical formulation assistant. Read the business problem and return JSON only.

Choose model_type as production, transportation, or game_theory. Return this envelope:
{"model_type":"production|transportation|game_theory","problem_summary":string,"technique":string,"objective":string,"variables":[string],"constraints":[string],"assumptions":[string],"model":{...}}

For production, model must be {"products":[{"name":string,"profit":number,"resource_usage":{resource:number},"demand_limit":number|null}],"capacities":{resource:number}}.
For transportation, model must be {"sources":[{"name":string,"supply":number}],"destinations":[{"name":string,"demand":number}],"costs":{"source":{"destination":number}}}.
For game_theory, model must be {"player_one_actions":[string],"player_two_actions":[string],"payoffs":{"player_one_action":{"player_two_action":number}},"zero_sum":true}. Use Player 1's payoff values and preserve negative payoffs.
Use consistent names, preserve all stated numbers, and do not invent missing numbers. If the problem is neither supported type, return model_type as transportation only when it clearly describes shipping from sources to destinations; otherwise return a concise JSON error with {"error":"unsupported"}.

User text:
""" + problem
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
    payload = json.loads(_strip_code_fence(content))
    if payload.get("error") == "unsupported":
        raise ValueError("This business problem is not yet supported. Supported models are production planning and transportation.")
    return BusinessModel.model_validate(payload)


def _strip_code_fence(content: str) -> str:
    match = re.search(r"\{.*\}", content, re.DOTALL)
    return match.group(0) if match else content


def _extract_with_fallback(problem: str) -> BusinessModel:
    text = problem.replace("$", "")
    game_match = re.search(r"choose\s+([A-Za-z]+)\s+or\s+([A-Za-z]+)", text, re.I)
    if game_match and re.search(r"player\s+1|player\s+2|payoff|expected payoff", text, re.I):
        first_action, second_action = game_match.groups()
        listed_payoffs = re.search(
            r"payoffs?\s+(?:are|of)\s+(-?\d+(?:\.\d+)?)\s*(?:,\s*and|,|and)\s*(-?\d+(?:\.\d+)?)\s*(?:,\s*and|,|and)\s*(-?\d+(?:\.\d+)?)\s*(?:,\s*and|,|and)\s*(-?\d+(?:\.\d+)?)",
            text,
            re.I,
        )
        if listed_payoffs:
            values = [float(value) for value in listed_payoffs.groups()]
            payoffs = {
                first_action: {first_action: values[0], second_action: values[1]},
                second_action: {first_action: values[2], second_action: values[3]},
            }
            return BusinessModel.model_validate({
                "model_type": "game_theory",
                "model": {"player_one_actions": [first_action, second_action], "player_two_actions": [first_action, second_action], "payoffs": payoffs, "zero_sum": True},
                "problem_summary": "Choose a mixed strategy for Player 1 against a competing Player 2.",
                "technique": "Zero-sum game linear programming",
                "objective": "Maximize Player 1's guaranteed expected payoff",
                "variables": [f"probability of {first_action}", f"probability of {second_action}"],
                "constraints": ["strategy probabilities sum to 1", "expected payoff is at least the game value against every opposing action"],
                "assumptions": ["The four listed payoffs are ordered by Player 1 action rows, then Player 2 action columns."],
            })
        payoff_patterns = {
            (first_action, first_action): rf"both\s+{re.escape(first_action)}.*?(-?\d+(?:\.\d+)?)",
            (first_action, second_action): rf"Player\s+1\s+{re.escape(first_action)}.*?Player\s+2\s+{re.escape(second_action)}.*?(-?\d+(?:\.\d+)?)",
            (second_action, first_action): rf"Player\s+1\s+{re.escape(second_action)}.*?Player\s+2\s+{re.escape(first_action)}.*?(-?\d+(?:\.\d+)?)",
            (second_action, second_action): rf"both\s+{re.escape(second_action)}.*?(-?\d+(?:\.\d+)?)",
        }
        payoffs = {}
        for (player_one_action, player_two_action), pattern in payoff_patterns.items():
            match = re.search(pattern, text, re.I)
            if not match:
                raise ValueError("Could not extract every game payoff. Provide one payoff for each action combination.")
            payoffs.setdefault(player_one_action, {})[player_two_action] = float(match.group(1))
        return BusinessModel.model_validate({
            "model_type": "game_theory",
            "model": {"player_one_actions": [first_action, second_action], "player_two_actions": [first_action, second_action], "payoffs": payoffs, "zero_sum": True},
            "problem_summary": "Choose a mixed strategy for Player 1 against a competing Player 2.",
            "technique": "Zero-sum game linear programming",
            "objective": "Maximize Player 1's guaranteed expected payoff",
            "variables": [f"probability of {first_action}", f"probability of {second_action}"],
            "constraints": ["strategy probabilities sum to 1", "expected payoff is at least the game value against every opposing action"],
            "assumptions": ["The game is zero-sum and both players choose actions simultaneously."],
        })
    products = []
    for sentence in text.split("."):
        entry = re.search(r"(Product\s+[A-Za-z0-9]+).*?(\d+(?:\.\d+)?)\s+profit.*?(?:needs|uses|requires|consumes)\s+(.*)", sentence, re.I)
        if not entry:
            continue
        name, profit, resource_text = entry.groups()
        segment = f"{profit} {resource_text}"
        usage = _parse_resource_values(segment)
        demand_match = re.search(rf"Demand for {re.escape(name.split()[-1])}.*?(?:at most|maximum|max)\s*(\d+(?:\.\d+)?)", text, re.I)
        if usage:
            products.append({"name": name, "profit": float(profit), "resource_usage": usage, "demand_limit": float(demand_match.group(1)) if demand_match else None})

    capacities = _parse_resource_values(re.search(r"We have (.*?)(?:Demand|$)", text, re.I).group(1) if re.search(r"We have (.*?)(?:Demand|$)", text, re.I) else "")
    for product in products:
        for resource in product["resource_usage"]:
            matching_capacity = next(
                (name for name in capacities if name.lower() in resource.lower() or resource.lower() in name.lower()),
                None,
            )
            if matching_capacity and resource not in capacities:
                capacities[resource] = capacities.pop(matching_capacity)
    if re.search(r"warehouse|ship|shipping|transport|freight|supplier|customer|distribution", text, re.I):
        raise ValueError("Transportation problems require source supplies, destination demands, and shipping costs. Add those details so the AI can build the transportation model.")
    if not products or not capacities:
        raise ValueError("Could not extract a complete model. Add product profits, resource usage, and capacities, or configure EXPLABS_API_KEY.")
    return BusinessModel.model_validate({
        "model_type": "production",
        "model": {"products": products, "capacities": capacities},
        "problem_summary": "Choose production quantities to maximize total profit under resource limits.",
        "technique": "Linear programming",
        "objective": "Maximize total profit",
        "variables": [f"quantity of {product['name']}" for product in products],
        "constraints": [f"resource usage must not exceed {name} capacity" for name in capacities],
        "assumptions": ["Production quantities may be fractional unless the prompt requires whole units."],
    })


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
