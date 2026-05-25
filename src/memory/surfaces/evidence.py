"""Evidence read models for Mirror web surfaces."""

from __future__ import annotations

from memory.surfaces.models import EvidenceBundle


class EvidenceSurface:
    """Compose provenance read models for web-visible objects."""

    def for_object(self, kind: str, object_id: str) -> EvidenceBundle:
        """Return an honest evidence bundle for an object.

        S1 establishes the evidence contract before full provenance support. The
        absence of evidence is explicit so UI surfaces do not imply certainty.
        """
        return EvidenceBundle(
            subject_kind=kind,
            subject_id=object_id,
            empty_state="No explicit provenance is available for this object yet.",
        )
