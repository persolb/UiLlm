import sys
import json
import os
from typing import Dict, List, Optional
import openai

try:
    from .keys import OPENAI_API_KEY
except ImportError:
    # Fallback to environment variable if keys.py is not available
    OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
    if not OPENAI_API_KEY:
        print("Error: OPENAI_API_KEY not found in keys.py or environment variables", file=sys.stderr)
        sys.exit(1)

# Initialize OpenAI client
client = openai.OpenAI(api_key=OPENAI_API_KEY)

def create_initial_prompt(tree: List[Dict]) -> str:
    return f"""Given this DOM tree from {tree[0].get('url', 'a webpage')}, analyze the structure and identify:
1. Primary content sections (articles, main content areas)
2. Navigation elements
3. Interactive controls
4. Important metadata

Return CSS selectors that precisely capture these elements, avoiding overly broad matches.
For each selector, specify:
- name: A descriptive label
- css: The CSS selector
- maxItems: Maximum number of items to extract (to prevent runaway matches)

Current DOM tree (simplified):
{json.dumps(tree, indent=2)}

Respond with a JSON object containing:
{{
  "selectors": [
    {{"name": "string", "css": "string", "maxItems": number}},
    ...
  ],
  "groups": {{
    "Page": ["selector_name1", "selector_name2", ...]
  }}
}}"""

def create_evaluation_prompt(summary: Dict, groups: Dict) -> str:
    return f"""Review these extraction results and determine if the selectors need refinement:

Extracted content summary:
{json.dumps(summary, indent=2)}

Current grouping:
{json.dumps(groups, indent=2)}

For each selector, check:
1. Is it capturing all intended content?
2. Is it including too much irrelevant content?
3. Are the maxItems limits appropriate?

If any selectors need adjustment, return a new set of selectors and groups.
Otherwise, return an empty object {{}}.

Respond with a JSON object containing either:
{{
  "selectors": [revised selectors...],
  "groups": {{revised groups...}}
}}
or
{{}}"""

def call_llm(prompt: str) -> Dict:
    try:
        response = client.chat.completions.create(
            model="gpt-4-turbo-preview",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            response_format={"type": "json_object"}
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"LLM API error: {str(e)}", file=sys.stderr)
        return {}

def process(message: Dict) -> Dict:
    if 'tree' in message:
        prompt = create_initial_prompt(message['tree'])
        return call_llm(prompt)
    elif 'summary' in message:
        prompt = create_evaluation_prompt(
            message['summary'],
            message.get('groups', {})
        )
        return call_llm(prompt)
    return {}

def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
            resp = process(msg)
            sys.stdout.write(json.dumps(resp) + '\n')
            sys.stdout.flush()
        except json.JSONDecodeError:
            print("Invalid JSON input", file=sys.stderr)
            continue
        except Exception as e:
            print(f"Error: {str(e)}", file=sys.stderr)
            continue

if __name__ == '__main__':
    main()
