from memory.surfaces.evidence import EvidenceSurface


def test_evidence_surface_is_honest_when_provenance_is_missing() -> None:
    bundle = EvidenceSurface().for_object("identity", "ego:identity")

    assert bundle.subject_kind == "identity"
    assert bundle.subject_id == "ego:identity"
    assert bundle.items == ()
    assert bundle.empty_state == "No explicit provenance is available for this object yet."
