"""Linearizable filesystem storage for Journey Projection Contract v1."""

from __future__ import annotations

import hashlib
import json
import os
import stat
import tempfile
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any

from filelock import FileLock, Timeout

from memory.journey_projections.constants import CONTRACT_VERSION, SCHEMA_VERSION
from memory.journey_projections.errors import ProjectionError, ProjectionErrorCode
from memory.journey_projections.models import (
    ProjectionEnvelope,
    ProjectionInspection,
    ProjectionManifest,
    ProjectionPublication,
    validate_identifier,
)
from memory.journey_projections.schemas import validate_manifest_document
from memory.journey_projections.serialization import canonical_json_bytes

FailureInjector = Callable[[str], None]


class ProjectionStore:
    def __init__(
        self,
        root: Path,
        *,
        lock_timeout: float = 10.0,
        failure_injector: FailureInjector | None = None,
    ) -> None:
        try:
            self.root = root.expanduser().resolve(strict=True)
        except OSError as exc:
            raise ProjectionError(
                ProjectionErrorCode.UNKNOWN_JOURNEY,
                "Registered Journey root is unavailable.",
            ) from exc
        if not self.root.is_dir():
            raise ProjectionError(
                ProjectionErrorCode.UNKNOWN_JOURNEY,
                "Registered Journey root is unavailable.",
            )
        self.lock_timeout = lock_timeout
        self.failure_injector = failure_injector

    @property
    def projections_root(self) -> Path:
        return self.root / ".mirror" / "projections"

    def publish(
        self,
        document: Mapping[str, Any],
        envelope: ProjectionEnvelope,
    ) -> ProjectionPublication:
        document_bytes = canonical_json_bytes(document)
        digest = f"sha256:{hashlib.sha256(document_bytes).hexdigest()}"
        namespace = validate_identifier(envelope.namespace)
        projection = validate_identifier(envelope.projection)
        snapshot_id = validate_identifier(envelope.snapshot_id)

        self._ensure_managed_directory(self.projections_root)
        lock_path = self.projections_root / ".publication.lock"
        self._assert_safe_file_path(lock_path, allow_missing=True)
        lock = FileLock(str(lock_path), timeout=self.lock_timeout)
        try:
            with lock:
                self._checkpoint("lock_acquired")
                self._recheck_managed_tree(namespace, projection, snapshot_id)
                return self._publish_locked(
                    document,
                    document_bytes,
                    digest,
                    envelope,
                )
        except Timeout as exc:
            raise ProjectionError(
                ProjectionErrorCode.PUBLICATION_FAILED,
                "Journey projection publication lock timed out.",
            ) from exc

    def inspect(
        self,
        journey_id: str,
        namespace: str,
        projection: str,
        *,
        domain: str,
    ) -> ProjectionInspection:
        validate_identifier(journey_id)
        validate_identifier(namespace)
        validate_identifier(projection)
        if not self.projections_root.exists():
            raise ProjectionError(
                ProjectionErrorCode.PROJECTION_DIVERGENCE,
                "Current Journey projection is unavailable or divergent.",
            )
        self._assert_existing_managed_tree(namespace, projection)
        lock_path = self.projections_root / ".publication.lock"
        self._assert_safe_file_path(lock_path, allow_missing=True)
        try:
            with FileLock(str(lock_path), timeout=self.lock_timeout):
                manifest = self._read_manifest(required=True)
                key = f"{namespace}:{projection}"
                entry = manifest.get("projections", {}).get(key)
                if not isinstance(entry, dict):
                    raise self._divergence()
                target = self.root / entry.get("path", "")
                self._assert_confined(target)
                self._assert_safe_file_path(target, allow_missing=False)
                document = self._read_json(target)
                try:
                    envelope = ProjectionEnvelope.from_mapping(document, domain=domain)  # type: ignore[arg-type]
                except (ProjectionError, TypeError) as exc:
                    raise self._divergence() from exc
                if (
                    envelope.journey_id != journey_id
                    or envelope.namespace != namespace
                    or envelope.projection != projection
                    or envelope.snapshot_id != entry.get("snapshotId")
                    or envelope.source_revision != entry.get("sourceRevision")
                ):
                    raise self._divergence()
                receipt = self._receipt_path(namespace, projection, envelope.snapshot_id)
                self._assert_safe_file_path(receipt, allow_missing=False)
                receipt_data = self._read_json(receipt)
                digest = f"sha256:{hashlib.sha256(canonical_json_bytes(document)).hexdigest()}"
                if receipt_data.get("documentDigest") != digest:
                    raise self._divergence()
                return ProjectionInspection(status="ok", document=document, manifest_entry=entry)
        except Timeout as exc:
            raise ProjectionError(
                ProjectionErrorCode.PUBLICATION_FAILED,
                "Journey projection inspection lock timed out.",
            ) from exc

    def _publish_locked(
        self,
        document: Mapping[str, Any],
        document_bytes: bytes,
        digest: str,
        envelope: ProjectionEnvelope,
    ) -> ProjectionPublication:
        namespace = envelope.namespace
        projection = envelope.projection
        target_dir = self.projections_root / namespace
        self._ensure_managed_directory(target_dir)
        target = target_dir / f"{projection}.json"
        self._assert_safe_file_path(target, allow_missing=True)
        manifest_path = self.projections_root / "current.json"
        self._assert_safe_file_path(manifest_path, allow_missing=True)

        old_projection = self._read_regular_bytes(target) if target.exists() else None
        old_manifest = self._read_regular_bytes(manifest_path) if manifest_path.exists() else None
        manifest = self._read_manifest(required=False, journey_id=envelope.journey_id)
        self._verify_current_target(manifest, namespace, projection, target)

        receipt = self._receipt_document(envelope, digest)
        projection_replaced = False
        manifest_replaced = False
        projection_temp: str | None = None
        manifest_temp: str | None = None
        try:
            self._ensure_receipt(receipt)
            self._checkpoint("receipt_staged")
            projection_temp = self._stage_bytes(target.parent, document_bytes, label="projection")
            self._checkpoint("projection_staged")
            os.replace(projection_temp, target)
            projection_temp = None
            projection_replaced = True
            self._sync_directory(target.parent)
            self._checkpoint("projection_replaced")

            next_manifest = self._next_manifest(manifest, envelope, target)
            validate_manifest_document(next_manifest)
            self._checkpoint("manifest_built")
            manifest_temp = self._stage_bytes(
                self.projections_root,
                canonical_json_bytes(next_manifest),
                label="manifest",
            )
            self._checkpoint("manifest_staged")
            os.replace(manifest_temp, manifest_path)
            manifest_temp = None
            manifest_replaced = True
            self._checkpoint("manifest_replaced")
            self._sync_directory(self.projections_root)
            self._checkpoint("manifest_synced")
        except Exception as exc:
            try:
                if manifest_replaced:
                    self._restore_path(manifest_path, old_manifest)
                if projection_replaced:
                    self._restore_path(target, old_projection)
            except Exception as restore_exc:
                raise self._divergence() from restore_exc
            if isinstance(exc, ProjectionError):
                raise
            raise ProjectionError(
                ProjectionErrorCode.PUBLICATION_FAILED,
                "Journey projection publication failed before commit.",
            ) from exc
        finally:
            if projection_temp is not None:
                Path(projection_temp).unlink(missing_ok=True)
            if manifest_temp is not None:
                Path(manifest_temp).unlink(missing_ok=True)

        return ProjectionPublication(
            status="published",
            journey_id=envelope.journey_id,
            namespace=namespace,
            projection=projection,
            snapshot_id=envelope.snapshot_id,
            source_revision=envelope.source_revision,
        )

    def _next_manifest(
        self,
        current: dict[str, Any],
        envelope: ProjectionEnvelope,
        target: Path,
    ) -> dict[str, Any]:
        projections = dict(current.get("projections", {}))
        key = f"{envelope.namespace}:{envelope.projection}"
        projections[key] = {
            "namespace": envelope.namespace,
            "projection": envelope.projection,
            "snapshotId": envelope.snapshot_id,
            "path": target.relative_to(self.root).as_posix(),
            "sourceRevision": envelope.source_revision,
        }
        return {
            "contractVersion": CONTRACT_VERSION,
            "schemaVersion": SCHEMA_VERSION,
            "journeyId": envelope.journey_id,
            "updatedAt": envelope.generated_at,
            "projections": projections,
        }

    def _read_manifest(
        self,
        *,
        required: bool,
        journey_id: str | None = None,
    ) -> dict[str, Any]:
        path = self.projections_root / "current.json"
        if not path.exists():
            if required:
                raise self._divergence()
            assert journey_id is not None
            return {
                "contractVersion": CONTRACT_VERSION,
                "schemaVersion": SCHEMA_VERSION,
                "journeyId": journey_id,
                "updatedAt": "1970-01-01T00:00:00Z",
                "projections": {},
            }
        self._assert_safe_file_path(path, allow_missing=False)
        value = self._read_json(path)
        try:
            ProjectionManifest.from_mapping(value)
        except ProjectionError as exc:
            raise self._divergence() from exc
        if journey_id is not None and value.get("journeyId") != journey_id:
            raise self._divergence()
        return value

    def _verify_current_target(
        self,
        manifest: Mapping[str, Any],
        namespace: str,
        projection: str,
        target: Path,
    ) -> None:
        entry = manifest.get("projections", {}).get(f"{namespace}:{projection}")
        if entry is None:
            return
        expected_path = target.relative_to(self.root).as_posix()
        if (
            not isinstance(entry, Mapping)
            or entry.get("path") != expected_path
            or not target.exists()
        ):
            raise self._divergence()
        try:
            current = self._read_json(target)
        except ProjectionError as exc:
            raise self._divergence() from exc
        snapshot_id = entry.get("snapshotId")
        if (
            current.get("snapshotId") != snapshot_id
            or current.get("sourceRevision") != entry.get("sourceRevision")
            or not isinstance(snapshot_id, str)
        ):
            raise self._divergence()
        receipt_path = self._receipt_path(namespace, projection, snapshot_id)
        self._assert_safe_file_path(receipt_path, allow_missing=False)
        receipt = self._read_json(receipt_path)
        digest = f"sha256:{hashlib.sha256(canonical_json_bytes(current)).hexdigest()}"
        if receipt.get("documentDigest") != digest:
            raise self._divergence()

    def _receipt_document(self, envelope: ProjectionEnvelope, digest: str) -> dict[str, str]:
        return {
            "contractVersion": CONTRACT_VERSION,
            "schemaVersion": SCHEMA_VERSION,
            "journeyId": envelope.journey_id,
            "namespace": envelope.namespace,
            "projection": envelope.projection,
            "snapshotId": envelope.snapshot_id,
            "sourceRevision": envelope.source_revision,
            "documentDigest": digest,
        }

    def _ensure_receipt(self, receipt: Mapping[str, str]) -> None:
        path = self._receipt_path(
            receipt["namespace"], receipt["projection"], receipt["snapshotId"]
        )
        self._ensure_managed_directory(path.parent)
        self._assert_safe_file_path(path, allow_missing=True)
        expected = canonical_json_bytes(receipt)
        if path.exists():
            if self._read_regular_bytes(path) != expected:
                raise self._divergence()
            return
        temp = self._stage_bytes(path.parent, expected, label="receipt")
        try:
            try:
                os.link(temp, path)
                self._checkpoint("receipt_installed")
            except FileExistsError:
                self._assert_safe_file_path(path, allow_missing=False)
                if self._read_regular_bytes(path) != expected:
                    raise self._divergence() from None
            self._sync_directory(path.parent)
        finally:
            Path(temp).unlink(missing_ok=True)

    def _receipt_path(self, namespace: str, projection: str, snapshot_id: str) -> Path:
        return self.projections_root / ".receipts" / namespace / projection / f"{snapshot_id}.json"

    def _recheck_managed_tree(self, namespace: str, projection: str, snapshot_id: str) -> None:
        self._assert_existing_managed_tree()
        for path in (
            self.projections_root / namespace,
            self.projections_root / ".receipts" / namespace / projection,
        ):
            if path.exists():
                self._assert_existing_managed_tree_path(path)
        for path in (
            self.projections_root / namespace / f"{projection}.json",
            self._receipt_path(namespace, projection, snapshot_id),
            self.projections_root / "current.json",
            self.projections_root / ".publication.lock",
        ):
            self._assert_safe_file_path(path, allow_missing=True)

    def _assert_existing_managed_tree(
        self, namespace: str | None = None, projection: str | None = None
    ) -> None:
        self._assert_existing_managed_tree_path(self.projections_root)
        if namespace is not None:
            candidate = self.projections_root / namespace
            if candidate.exists():
                self._assert_existing_managed_tree_path(candidate)
        if namespace is not None and projection is not None:
            self._assert_safe_file_path(
                self.projections_root / namespace / f"{projection}.json", allow_missing=True
            )

    def _assert_existing_managed_tree_path(self, path: Path) -> None:
        current = self.root
        for part in path.relative_to(self.root).parts:
            current = current / part
            try:
                mode = current.lstat().st_mode
            except FileNotFoundError:
                return
            if stat.S_ISLNK(mode) or not stat.S_ISDIR(mode):
                raise self._unsafe()
        self._assert_confined(path)

    def _ensure_managed_directory(self, path: Path) -> None:
        self._assert_confined(path)
        current = self.root
        for part in path.relative_to(self.root).parts:
            current = current / part
            try:
                mode = current.lstat().st_mode
            except FileNotFoundError:
                try:
                    current.mkdir(mode=0o700)
                except FileExistsError:
                    pass
                mode = current.lstat().st_mode
            if stat.S_ISLNK(mode) or not stat.S_ISDIR(mode):
                raise self._unsafe()
        self._assert_confined(path.resolve())

    def _assert_safe_file_path(self, path: Path, *, allow_missing: bool) -> None:
        self._assert_confined(path)
        self._assert_existing_managed_tree_path(path.parent)
        try:
            mode = path.lstat().st_mode
        except FileNotFoundError:
            if allow_missing:
                return
            raise self._divergence() from None
        if stat.S_ISLNK(mode) or not stat.S_ISREG(mode):
            raise self._unsafe()
        self._assert_confined(path.resolve())

    def _assert_confined(self, path: Path) -> None:
        try:
            path.resolve(strict=False).relative_to(self.root)
        except (OSError, ValueError) as exc:
            raise self._unsafe() from exc

    def _stage_bytes(self, directory: Path, payload: bytes, *, label: str) -> str:
        self._ensure_managed_directory(directory)
        descriptor, name = tempfile.mkstemp(prefix=".projection-", suffix=".tmp", dir=directory)
        try:
            self._checkpoint(f"{label}_temp_created")
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(payload)
                stream.flush()
                self._checkpoint(f"{label}_written")
                os.fsync(stream.fileno())
                self._checkpoint(f"{label}_fsynced")
        except Exception:
            try:
                os.close(descriptor)
            except OSError:
                pass
            Path(name).unlink(missing_ok=True)
            raise
        return name

    def _restore_path(self, path: Path, previous: bytes | None) -> None:
        if previous is None:
            path.unlink(missing_ok=True)
            self._sync_directory(path.parent)
            return
        temp = self._stage_bytes(path.parent, previous, label="restore")
        os.replace(temp, path)
        self._sync_directory(path.parent)

    def _sync_directory(self, directory: Path) -> None:
        if os.name == "nt":
            return
        descriptor = os.open(directory, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)

    def _read_regular_bytes(self, path: Path) -> bytes:
        self._assert_safe_file_path(path, allow_missing=False)
        flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
        try:
            descriptor = os.open(path, flags)
        except OSError as exc:
            raise self._unsafe() from exc
        try:
            if not stat.S_ISREG(os.fstat(descriptor).st_mode):
                raise self._unsafe()
            with os.fdopen(descriptor, "rb") as stream:
                descriptor = -1
                return stream.read()
        finally:
            if descriptor >= 0:
                os.close(descriptor)

    def _read_json(self, path: Path) -> dict[str, Any]:
        try:
            value = json.loads(self._read_regular_bytes(path).decode("utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            raise self._divergence() from exc
        if not isinstance(value, dict):
            raise self._divergence()
        return value

    def _checkpoint(self, name: str) -> None:
        if self.failure_injector is not None:
            self.failure_injector(name)

    @staticmethod
    def _unsafe() -> ProjectionError:
        return ProjectionError(
            ProjectionErrorCode.UNSAFE_PROJECTION_PATH,
            "Projection path is outside the registered Journey boundary.",
        )

    @staticmethod
    def _divergence() -> ProjectionError:
        return ProjectionError(
            ProjectionErrorCode.PROJECTION_DIVERGENCE,
            "Current Journey projection is unavailable or divergent.",
        )
