from pathlib import Path

from divelog_server.core.config import Settings

ENV_EXAMPLE = Path(__file__).resolve().parents[1] / ".env.example"


def documented() -> dict[str, str]:
    pairs = {}
    for line in ENV_EXAMPLE.read_text(encoding="utf-8").splitlines():
        if line.strip() and not line.startswith("#"):
            key, _, value = line.partition("=")
            pairs[key.strip()] = value
    return pairs


def test_env_example_documents_every_setting() -> None:
    assert set(Settings.model_fields) <= set(documented())


def test_env_example_values_are_the_defaults() -> None:
    values = documented()
    for name, field in Settings.model_fields.items():
        assert str(field.default).lower() == values[name].lower(), name
