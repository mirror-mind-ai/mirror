"""CV9.E2.S17 (AI-07) — the embedding-provenance distribution render."""

from memory.cli.inspect import render_embedding_provenance


class TestRenderEmbeddingProvenance:
    def test_renders_models_and_unknown_bucket(self):
        out = render_embedding_provenance([("openai/text-embedding-3-small", 1222), (None, 18)])
        assert "1222" in out and "openai/text-embedding-3-small" in out
        assert "18" in out and "unknown" in out.lower()

    def test_empty_corpus_is_explicit(self):
        out = render_embedding_provenance([])
        assert "no stored" in out.lower()
