"""Version and operation constants for Journey Projection Contract v1."""

from memory.extensions import version as _extension_api_version

CONTRACT_ID = "mirror.journey-projections"
CONTRACT_VERSION = "1.0"
SCHEMA_VERSION = "1"
EXTENSION_API_VERSION = _extension_api_version.VERSION

# Never advertise a route before it exists. Later CV23 stories append their
# operations as the corresponding implementation lands.
IMPLEMENTED_OPERATIONS = (
    "capabilities",
    "probe-prepare",
    "rebuild-operational",
    "inspect",
    "probe-publish",
)
