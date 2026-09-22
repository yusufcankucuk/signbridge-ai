"""Sınıf merkezi (prototip) skorlaması testleri."""
import json

import numpy as np
import pytest

from src.model.prototypes import (
    DEFAULT_TEMPERATURE,
    PROTOTYPE_LAYER,
    build_prototypes,
    load_prototypes,
    prototype_probabilities,
    write_prototypes,
)

LABELS = [{"index": 0, "classId": "bir"}, {"index": 1, "classId": "iki"}, {"index": 2, "classId": "uc"}]


def tiny_model():
    import tensorflow as tf

    inputs = tf.keras.Input(shape=(4, 3))
    flat = tf.keras.layers.Flatten()(inputs)
    embedding = tf.keras.layers.Dense(5, use_bias=False, name=PROTOTYPE_LAYER)(flat)
    outputs = tf.keras.layers.Dense(len(LABELS), activation="softmax")(embedding)
    return tf.keras.Model(inputs, outputs)


def sample(value):
    return np.full((4, 3), value, dtype=np.float32)


def test_build_prototypes_returns_unit_vectors_per_class():
    model = tiny_model()
    features = np.stack([sample(0.1), sample(0.2), sample(-0.3), sample(-0.4)])
    labels = np.asarray([0, 0, 1, 1])
    prototypes = build_prototypes(model, features, labels, {0: "bir", 1: "iki", 2: "uc"})
    assert sorted(prototypes) == ["bir", "iki"]
    for vector in prototypes.values():
        assert len(vector) == 5
        assert np.isclose(np.linalg.norm(vector), 1.0, atol=1e-6)


def test_write_and_load_round_trip(tmp_path):
    model = tiny_model()
    prototypes = build_prototypes(model, np.stack([sample(0.1), sample(-0.3)]), np.asarray([0, 1]),
                                  {0: "bir", 1: "iki"})
    path = tmp_path / "prototypes.json"
    write_prototypes(path, prototypes, model_version="m1", vocabulary_version="v1")
    bundle = load_prototypes(path, model_version="m1", vocabulary_version="v1")
    assert bundle["dimensions"] == 5
    assert bundle["temperature"] == DEFAULT_TEMPERATURE
    assert sorted(bundle["classes"]) == ["bir", "iki"]
    with pytest.raises(ValueError):
        load_prototypes(path, model_version="baska", vocabulary_version="v1")


def test_load_rejects_broken_vector(tmp_path):
    path = tmp_path / "prototypes.json"
    path.write_text(json.dumps({
        "schemaVersion": "1.0", "layer": PROTOTYPE_LAYER, "dimensions": 3, "temperature": 15.0,
        "modelVersion": "m1", "vocabularyVersion": "v1", "classes": {"bir": [1.0, 0.0]},
    }), encoding="utf-8")
    with pytest.raises(ValueError):
        load_prototypes(path, model_version="m1", vocabulary_version="v1")


def test_prototype_probabilities_picks_nearest_centre(tmp_path):
    model = tiny_model()
    features = np.stack([sample(0.1), sample(-0.3)])
    prototypes = build_prototypes(model, features, np.asarray([0, 1]), {0: "bir", 1: "iki"})
    path = tmp_path / "prototypes.json"
    write_prototypes(path, prototypes, model_version="m1", vocabulary_version="v1")
    bundle = load_prototypes(path, model_version="m1", vocabulary_version="v1")
    for index, value in ((0, 0.1), (1, -0.3)):
        scores = prototype_probabilities(model, np.stack([sample(value)]), bundle, LABELS, [0, 1])
        assert scores.shape == (len(LABELS),)
        assert np.isclose(scores.sum(), 1.0)
        assert scores[2] == 0.0
        assert int(np.argmax(scores)) == index


def test_prototype_probabilities_requires_known_class():
    model = tiny_model()
    prototypes = build_prototypes(model, np.stack([sample(0.1)]), np.asarray([0]), {0: "bir"})
    bundle = {"classes": prototypes, "dimensions": 5, "temperature": 15.0, "prototypeVersion": "x"}
    with pytest.raises(ValueError):
        prototype_probabilities(model, np.stack([sample(0.1)]), bundle, LABELS, [2])
