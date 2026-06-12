import os
from typing import List, Dict, Any, Tuple
import logging

logger = logging.getLogger(__name__)

class CogneeAdapter:
    def __init__(self, enabled: bool = True):
        self.enabled = enabled
        self._cognee = None
        self._SearchType = None

        if self.enabled:
            try:
                import cognee
                self._cognee = cognee
                self._SearchType = cognee.SearchType if hasattr(cognee, "SearchType") else None
            except ImportError:
                logger.warning("Cognee library not found. Falling back to local mode.")
                self.enabled = False

    async def ingest(self, filepaths: List[str]) -> Tuple[bool, List[str]]:
        if not self.enabled or not self._cognee:
            return False, ["Cognee is disabled or not installed. Using fallback mode."]

        warnings = []
        try:
            # Check for add
            if hasattr(self._cognee, "add"):
                for filepath in filepaths:
                    await self._cognee.add(filepath)
            else:
                warnings.append("cognee.add() not found.")
                return False, warnings

            # Check for cognify
            if hasattr(self._cognee, "cognify"):
                await self._cognee.cognify()
            else:
                warnings.append("cognee.cognify() not found.")
                return False, warnings

            return True, warnings

        except Exception as e:
            logger.error(f"Cognee ingest error: {e}")
            warnings.append(f"Cognee ingest failed: {e}")
            return False, warnings

    async def query(self, query_text: str) -> Tuple[bool, str, List[Dict], List[str]]:
        if not self.enabled or not self._cognee:
            return False, "", [], ["Cognee is disabled or not installed. Using fallback mode."]

        warnings = []
        try:
            # 1. Preferred modern API: recall()
            if hasattr(self._cognee, "recall"):
                try:
                    # Depending on cognee version, recall might return a generator or a list
                    results = await self._cognee.recall(query_text)
                    if not isinstance(results, list):
                        # Some versions return async generator
                        results_list = []
                        async for r in results:
                            results_list.append(r)
                        results = results_list

                    if results:
                        # Assuming results contain text
                        answer = "Found information in knowledge base."
                        sources = [{"id": "cognee", "title": "Cognee Recall", "content": str(r)} for r in results]
                        return True, answer, sources, warnings
                except Exception as e:
                    logger.error(f"cognee.recall() failed: {e}")
                    warnings.append(f"cognee.recall() failed: {e}")

            # 2. Fallback to search(..., query_type=SearchType.GRAPH_COMPLETION)
            if hasattr(self._cognee, "search") and self._SearchType and hasattr(self._SearchType, "GRAPH_COMPLETION"):
                try:
                    results = await self._cognee.search(query_text, query_type=self._SearchType.GRAPH_COMPLETION)
                    if results:
                        sources = [{"id": "cognee", "title": "Cognee Search", "content": str(r)} for r in results]
                        return True, "Found information in graph.", sources, warnings
                except Exception as e:
                    logger.error(f"cognee.search() failed: {e}")
                    warnings.append(f"cognee.search() failed: {e}")

            # If we get here, neither worked or returned results
            return False, "", [], warnings + ["No results found via Cognee or APIs unavailable."]

        except Exception as e:
            logger.error(f"Cognee query error: {e}")
            warnings.append(f"Cognee query failed: {e}")
            return False, "", [], warnings
