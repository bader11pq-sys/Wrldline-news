import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class DesignReferenceCatalogTests(unittest.TestCase):
    def test_catalog_is_valid_and_uses_unique_https_sources(self):
        catalog = json.loads((ROOT / "design-agent" / "references.json").read_text(encoding="utf-8"))
        self.assertEqual(catalog["schema_version"], 1)
        sources = catalog["sources"]
        self.assertGreaterEqual(len(sources), 10)
        ids = [source["id"] for source in sources]
        self.assertEqual(len(ids), len(set(ids)))
        for source in sources:
            self.assertTrue(source["url"].startswith("https://"))
            self.assertIn(source["language"], {"ar", "en"})

    def test_policy_is_bounded_and_non_interactive(self):
        catalog = json.loads((ROOT / "design-agent" / "references.json").read_text(encoding="utf-8"))
        policy = catalog["policy"]
        self.assertTrue(policy["homepage_only"])
        self.assertTrue(policy["no_login"])
        self.assertTrue(policy["no_form_submission"])
        self.assertTrue(policy["no_interaction_or_crawling"])
        self.assertTrue(policy["do_not_bypass_access_controls"])
        self.assertEqual(
            [(item["width"], item["height"]) for item in policy["capture_viewports"]],
            [(1440, 1000), (390, 844)],
        )


if __name__ == "__main__":
    unittest.main()
