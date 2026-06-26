import pytest

from memory.builder.lifecycle_ribbon import render_lifecycle_ribbon


def test_render_lifecycle_ribbon_marks_current_and_future_stages():
    rendered = render_lifecycle_ribbon("pull")

    assert rendered == (
        "Ariad: ◉ Pull | ○ Prepare | ○ Expand | ○ Plan | ○ Implement | ○ Validate | "
        "○ Debt Review | ○ Coherence | ○ Done"
    )


def test_render_lifecycle_ribbon_marks_previous_stages_done():
    rendered = render_lifecycle_ribbon("prepare")

    assert rendered == (
        "Ariad: ✓ Pull | ◉ Prepare | ○ Expand | ○ Plan | ○ Implement | ○ Validate | "
        "○ Debt Review | ○ Coherence | ○ Done"
    )


def test_render_lifecycle_ribbon_rejects_unknown_stage():
    with pytest.raises(ValueError, match="unknown Ariad lifecycle stage"):
        render_lifecycle_ribbon("commit")
