#!/usr/bin/env python3
"""
Web Search Script - Uses baidusearch library to perform web searches

Usage:
    python search.py "search query"

Example:
    python search.py "Python async programming"
"""

import sys
import json
from typing import List, Dict, Any


def perform_search(query: str, num_results: int = 10) -> List[Dict[str, Any]]:
    """
    Perform a web search using baidusearch library.

    Args:
        query: The search query string
        num_results: Maximum number of results to return (default: 10)

    Returns:
        List of search results, each containing title, url, abstract, and rank
    """
    try:
        from baidusearch.baidusearch import search
    except ImportError:
        print(json.dumps({
            "error": "baidusearch library not installed. Run: pip install baidusearch"
        }, ensure_ascii=False, indent=2))
        sys.exit(1)

    # Perform the search
    raw_results = search(query)

    # Process and format results
    # baidusearch returns: {title, abstract, url, rank}
    formatted_results = []
    for result in raw_results[:num_results]:
        formatted_result = {
            "title": result.get("title", ""),
            "url": result.get("url", ""),
            "abstract": result.get("abstract", ""),
            "rank": result.get("rank", 0)
        }
        formatted_results.append(formatted_result)

    return formatted_results


def main():
    # Fix Windows console encoding
    if sys.platform == "win32":
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

    if len(sys.argv) < 2:
        print(json.dumps({
            "error": "Usage: python search.py \"search query\""
        }, ensure_ascii=False, indent=2))
        sys.exit(1)

    query = sys.argv[1]

    results = perform_search(query)

    # Output as JSON
    output = {
        "query": query,
        "count": len(results),
        "results": results
    }

    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
