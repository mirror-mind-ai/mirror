"""Utilitários compartilhados do módulo memory."""

import re
import unicodedata


def strip_accents(s: str) -> str:
    """Remove acentos para comparação textual (ex: 'episódio' → 'episodio')."""
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def kebab_slug(text: str, *, max_length: int = 80) -> str:
    """Return an accent-stripped, kebab-case, length-capped slug.

    Canonical slug for filesystem-safe identifiers (roadmap folders, journey
    slugs, exploration folders). Lowercases, strips accents, collapses every run
    of non-alphanumeric characters to a single hyphen, trims edge hyphens, and
    hard-caps the result to ``max_length`` characters so a single directory
    component can never exceed the filesystem ``NAME_MAX`` limit (255 bytes).

    Returns an empty string when no alphanumeric content remains; callers decide
    how to handle that (bare code prefix, fallback token, or validation error).
    """
    normalized = strip_accents(text).lower()
    slug = re.sub(r"[^a-z0-9]+", "-", normalized).strip("-")
    if len(slug) > max_length:
        slug = slug[:max_length].strip("-")
    return slug
