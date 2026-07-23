"""Testes unitários para memory.utils."""

import re

import pytest

from memory.utils import kebab_slug, strip_accents

pytestmark = pytest.mark.unit


class TestStripAccents:
    def test_removes_acute_accents(self):
        assert strip_accents("episódio") == "episodio"

    def test_removes_grave_accents(self):
        assert strip_accents("pàssaro") == "passaro"

    def test_removes_tilde(self):
        assert strip_accents("ação") == "acao"

    def test_removes_cedilla(self):
        assert strip_accents("coração") == "coracao"

    def test_plain_ascii_unchanged(self):
        assert strip_accents("hello world") == "hello world"

    def test_empty_string(self):
        assert strip_accents("") == ""

    def test_uppercase_accents_removed(self):
        assert strip_accents("AÇÃO") == "ACAO"

    def test_mixed_accented_and_plain(self):
        assert strip_accents("São Paulo") == "Sao Paulo"

    def test_numbers_and_symbols_unchanged(self):
        assert strip_accents("abc123!@#") == "abc123!@#"

    def test_multiple_accent_types(self):
        assert strip_accents("héllo wörld") == "hello world"

    def test_already_clean_string_unchanged(self):
        text = "mirror mind"
        assert strip_accents(text) == text


class TestKebabSlug:
    def test_basic_kebab(self):
        assert kebab_slug("Port the application step flow") == "port-the-application-step-flow"

    def test_lowercases(self):
        assert kebab_slug("UPPER Case Title") == "upper-case-title"

    def test_strips_accents(self):
        assert kebab_slug("Configuração de Áudio") == "configuracao-de-audio"

    def test_collapses_non_alphanumeric_runs(self):
        assert kebab_slug("a---b__c  d") == "a-b-c-d"

    def test_strips_leading_and_trailing_separators(self):
        assert kebab_slug("  --hello--  ") == "hello"

    def test_empty_string_returns_empty(self):
        assert kebab_slug("") == ""

    def test_all_punctuation_returns_empty(self):
        assert kebab_slug("!!! ??? ...") == ""

    def test_short_input_unchanged(self):
        assert kebab_slug("ds-35-us-1") == "ds-35-us-1"

    def test_caps_at_default_80(self):
        assert len(kebab_slug("a" * 200)) == 80

    def test_boundary_80_unchanged(self):
        s = "a" * 80
        assert kebab_slug(s) == s

    def test_boundary_81_truncated_to_80(self):
        assert len(kebab_slug("a" * 81)) == 80

    def test_no_trailing_hyphen_after_truncation(self):
        result = kebab_slug("word " * 30)
        assert len(result) <= 80
        assert not result.endswith("-")
        assert result == "-".join(["word"] * 16)

    def test_output_is_always_kebab_charset(self):
        for probe in ["Hello, World!", "café/münchen", "a" * 300, "DS-37 — Long Title"]:
            assert re.fullmatch(r"[a-z0-9-]*", kebab_slug(probe))

    def test_custom_max_length(self):
        assert len(kebab_slug("a" * 50, max_length=10)) == 10

    def test_reproduces_promoted_reference_algorithm(self):
        # kebab_slug is the promoted journey slug algorithm; output must match.
        assert (
            kebab_slug("Web Historical Metadata Backfill Operation")
            == "web-historical-metadata-backfill-operation"
        )


class TestSlugConsolidation:
    def test_all_kebab_sluggers_share_one_implementation(self):
        import memory.builder.lifecycle as lifecycle_mod
        import memory.builder.story_paths as story_paths_mod
        import memory.services.explorer_handoff as explorer_handoff_mod
        import memory.services.journey as journey_mod

        # memory.cli.build delegates path construction entirely to
        # memory.builder.story_paths (the Ariad Expand path-divergence fix's
        # shared resolver) and no longer imports kebab_slug directly.
        for mod in (lifecycle_mod, story_paths_mod, explorer_handoff_mod, journey_mod):
            assert mod.kebab_slug is kebab_slug, f"{mod.__name__} must use the shared kebab_slug"
            assert not hasattr(mod, "_slugify"), f"{mod.__name__} still defines a local _slugify"
