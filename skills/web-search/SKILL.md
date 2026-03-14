---
name: web-search
description: Perform web searches using Baidu search engine via the baidusearch Python library. Use when the user asks to search the web, look up information online, find current data, or retrieve real-time information from the internet. This is especially useful for questions requiring up-to-date information that may not be in the training data.
---

# Web Search

Performs web searches using Baidu search engine to retrieve current information from the internet.

## Quick Start

Run a basic search:

```bash
python scripts/search.py "your search query"
```

The results are returned as structured JSON with title, URL, abstract, and rank for each result.

## Search Script

The `scripts/search.py` script wraps the `baidusearch` library:

```python
from baidusearch.baidusearch import search

results = search("query")
# Returns: list of dicts with title, abstract, url, rank
```

## Installation

Install the dependency:

```bash
pip install baidusearch
```

## Usage Examples

**Search for current events:**
```bash
python scripts/search.py "latest AI news 2026"
```

**Find technical documentation:**
```bash
python scripts/search.py "Python asyncio tutorial"
```

**Research a topic:**
```bash
python scripts/search.py "Baidu search API documentation"
```

## Search Results Format

Each search result includes:
- `title`: The page title
- `url`: The page URL
- `abstract`: A brief description/summary of the page content
- `rank`: The search result ranking position

## Notes

- Uses Baidu search engine (Chinese-focused, works for general queries)
- Web scraping based - may be affected by site changes
- Returns organic search results only
- No external dependencies beyond baidusearch package
