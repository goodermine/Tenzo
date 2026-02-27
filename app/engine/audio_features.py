from __future__ import annotations

from io import BytesIO
from typing import Any

import librosa
import numpy as np
import soundfile as sf


MIN_DURATION_SECONDS = 1.0


class AudioFeatureError(ValueError):
    """Raised when audio cannot be analyzed."""


def extract_features(audio_bytes: bytes) -> dict[str, Any]:
    if not audio_bytes:
        raise AudioFeatureError("Audio file is empty.")

    audio_array, sample_rate = sf.read(BytesIO(audio_bytes), dtype="float32", always_2d=False)

    if audio_array.ndim > 1:
        audio_array = np.mean(audio_array, axis=1)

    duration_sec = len(audio_array) / float(sample_rate)
    if duration_sec < MIN_DURATION_SECONDS:
        raise AudioFeatureError(
            f"Audio too short ({duration_sec:.3f}s). Minimum duration is {MIN_DURATION_SECONDS:.1f}s."
        )

    frame_length = 2048
    hop_length = 512
    rms = librosa.feature.rms(y=audio_array, frame_length=frame_length, hop_length=hop_length)[0]

    rms_mean = float(np.mean(rms))
    rms_std = float(np.std(rms))

    rms_db = librosa.amplitude_to_db(np.maximum(rms, 1e-8), ref=1.0)
    dynamic_range_db = float(np.percentile(rms_db, 95) - np.percentile(rms_db, 5))

    f0, voiced_flag, _ = librosa.pyin(
        audio_array,
        sr=sample_rate,
        fmin=librosa.note_to_hz("C2"),
        fmax=librosa.note_to_hz("C6"),
        frame_length=frame_length,
        hop_length=hop_length,
    )

    voiced_f0 = f0[np.isfinite(f0)] if f0 is not None else np.array([], dtype=float)

    if voiced_f0.size > 0:
        f0_median = float(np.median(voiced_f0))
        f0_min = float(np.min(voiced_f0))
        f0_max = float(np.max(voiced_f0))
    else:
        f0_median = None
        f0_min = None
        f0_max = None

    return {
        "duration_sec": round(float(duration_sec), 6),
        "sample_rate": int(sample_rate),
        "rms_mean": round(rms_mean, 6),
        "rms_std": round(rms_std, 6),
        "dynamic_range_db": round(dynamic_range_db, 6),
        "f0_hz_median": None if f0_median is None else round(f0_median, 6),
        "f0_hz_min": None if f0_min is None else round(f0_min, 6),
        "f0_hz_max": None if f0_max is None else round(f0_max, 6),
    }
