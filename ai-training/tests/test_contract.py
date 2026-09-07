import json
from pathlib import Path

from jsonschema import Draft202012Validator

from src.common import AI_ROOT, autsl_labels, meb_labels


def test_prediction_examples_match_contract():
    examples = AI_ROOT / "examples"
    schema = json.loads((examples / "prediction.schema.json").read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)
    for path in examples.glob("prediction-*.json"):
        if path.name in {"prediction.schema.json", "prediction-error.json"}:
            continue
        validator.validate(json.loads(path.read_text(encoding="utf-8")))

    error_schema = json.loads((examples / "error.schema.json").read_text(encoding="utf-8"))
    Draft202012Validator(error_schema).validate(
        json.loads((examples / "prediction-error.json").read_text(encoding="utf-8"))
    )


def test_vocabularies_are_stable():
    autsl = autsl_labels()
    meb = meb_labels()
    assert [item["index"] for item in autsl] == list(range(20))
    assert len({item["classId"] for item in autsl}) == 20
    assert len(meb) == 16
    assert sum(bool(item.get("manualSelectable")) for item in meb) == 12
