import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "design_agent_analyzer",
    ROOT / "scripts" / "design-agent" / "analyze_references.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class DesignAgentAnalyzerTests(unittest.TestCase):
    def test_extracts_json_from_fenced_response(self):
        result = MODULE.parse_model_json('```json\n{"summary":"clear grid","confidence":0.8}\n```')
        self.assertEqual(result["summary"], "clear grid")
        self.assertEqual(result["confidence"], 0.8)

    def test_rejects_non_object_json(self):
        with self.assertRaises(ValueError):
            MODULE.parse_model_json('["not", "an", "object"]')


if __name__ == "__main__":
    unittest.main()
