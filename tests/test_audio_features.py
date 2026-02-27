from io import BytesIO

import numpy as np
import soundfile as sf

from app.engine.audio_features import extract_features


def test_extract_features_returns_expected_keys() -> None:
    sr = 22050
    duration_sec = 1.2
    t = np.linspace(0, duration_sec, int(sr * duration_sec), endpoint=False)
    y = 0.2 * np.sin(2 * np.pi * 220 * t)

    buf = BytesIO()
    sf.write(buf, y, sr, format="WAV")

    features = extract_features(buf.getvalue())

    expected_keys = {
        "duration_sec",
        "sample_rate",
        "rms_mean",
        "rms_std",
        "dynamic_range_db",
        "f0_hz_median",
        "f0_hz_min",
        "f0_hz_max",
    }

    assert set(features.keys()) == expected_keys
    assert features["duration_sec"] >= 1.0
    assert features["sample_rate"] == sr
