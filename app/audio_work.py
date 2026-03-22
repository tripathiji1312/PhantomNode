import os
import logging
import numpy as np
import scipy.io.wavfile as wavfile

SAMPLE_RATE = 44100
BIT_DURATION = 0.05
FREQ_0 = 18000
FREQ_1 = 19500

# Band-energy: sum magnitudes around target bin for robust detection
BAND_WIDTH = 3

# The known preamble from conversion.py — used for timing alignment
PREAMBLE = "001110010011100100110111001100110111001101110100011000010111001001110100"

logging.basicConfig(level=logging.INFO)


def _band_energy(mag, center_bin, width=BAND_WIDTH):
    """Sum magnitudes in a band around the center bin."""
    lo = max(0, center_bin - width)
    hi = min(len(mag), center_bin + width + 1)
    return np.sum(mag[lo:hi])


def _decode_bits(audio, samples_per_bit, offset=0):
    """Decode audio starting at sample 'offset' into a binary string using FSK."""
    pad_factor = 4
    padded_len = samples_per_bit * pad_factor

    output = ""
    for i in range(offset, len(audio) - samples_per_bit + 1, samples_per_bit):
        chunk = audio[i:i + samples_per_bit]
        windowed = chunk * np.hanning(len(chunk))
        fft_result = np.fft.fft(windowed, n=padded_len)
        mag = np.abs(fft_result)

        bin_0 = int(FREQ_0 * (padded_len / SAMPLE_RATE))
        bin_1 = int(FREQ_1 * (padded_len / SAMPLE_RATE))

        energy_0 = _band_energy(mag, bin_0)
        energy_1 = _band_energy(mag, bin_1)

        output += '0' if energy_0 > energy_1 else '1'

    return output


def _preamble_score(bits, preamble=PREAMBLE):
    """How well do the first N bits match the known preamble?"""
    if len(bits) < len(preamble):
        return 0.0
    matches = sum(1 for a, b in zip(bits, preamble) if a == b)
    return matches / len(preamble)


def generateAudio(binary_content, filename="audio"):
    """Encode binary string to FSK audio WAV file. Returns the file path."""
    t = np.arange(0, BIT_DURATION, 1 / SAMPLE_RATE)
    logging.info("Generating audio")
    arr_0 = np.sin(2 * np.pi * FREQ_0 * t)
    arr_1 = np.sin(2 * np.pi * FREQ_1 * t)
    window = np.hanning(len(t))
    arr_0 = arr_0 * window
    arr_1 = arr_1 * window

    audio = []
    for bit in binary_content:
        audio.append(arr_0 if bit == '0' else arr_1)

    audio = np.concatenate(audio)
    audio = audio * 0.5

    os.makedirs('audio', exist_ok=True)
    wav_path = f'audio/{filename}.wav'
    wavfile.write(wav_path, SAMPLE_RATE, audio.astype(np.float32))
    logging.info("Audio file saved as %s", wav_path)
    return wav_path


def readAudioFromFile(wav_path):
    """
    Decode a WAV file back into a binary string.
    Uses an alignment sweep to find the optimal bit boundary offset.
    """
    sample_rate, audio = wavfile.read(wav_path)
    logging.info("Reading audio from %s (sample_rate=%d, samples=%d)",
                 wav_path, sample_rate, len(audio))

    # Convert to mono float
    if audio.ndim > 1:
        audio = audio[:, 0]
    if audio.dtype == np.int16:
        audio = audio.astype(np.float32) / 32768.0
    elif audio.dtype == np.int32:
        audio = audio.astype(np.float32) / 2147483648.0

    # Resample if needed
    if sample_rate != SAMPLE_RATE:
        logging.warning("Sample rate mismatch: got %d, expected %d. Resampling.",
                        sample_rate, SAMPLE_RATE)
        from scipy.signal import resample
        num_samples = int(len(audio) * SAMPLE_RATE / sample_rate)
        audio = resample(audio, num_samples)

    samples_per_bit = int(SAMPLE_RATE * BIT_DURATION)

    # Step 1: Find approximate signal start
    audio = _hunter(audio, samples_per_bit)

    logging.info("Decoding %d samples (%d potential bits)",
                 len(audio), len(audio) // samples_per_bit)

    # Step 2: Alignment sweep — try different sub-bit offsets
    # and pick the one that best matches the known preamble
    best_offset = 0
    best_score = 0.0
    best_bits = ""
    step = max(1, samples_per_bit // 20)  # ~5% of a bit duration per step

    for offset in range(0, samples_per_bit, step):
        bits = _decode_bits(audio, samples_per_bit, offset)
        score = _preamble_score(bits)
        if score > best_score:
            best_score = score
            best_offset = offset
            best_bits = bits

    logging.info("Timing lock: offset=%d samples, preamble match=%.2f%% at preview index=%d",
                 best_offset, best_score * 100,
                 best_bits.find(PREAMBLE[:10]) if PREAMBLE[:10] in best_bits else -1)

    if best_score < 0.50:
        logging.warning("Very low preamble confidence (%.1f%%). Signal may be too noisy.",
                        best_score * 100)

    return best_bits


def _hunter(audio, samples_per_bit):
    """Detect where the FSK signal begins in a recording."""
    window_size = min(2000, len(audio) // 2)
    if len(audio) < window_size:
        return audio

    # Baseline noise from the start
    first_chunk = audio[0:window_size]
    fft_result = np.fft.fft(first_chunk)
    mag = np.abs(fft_result)
    bin_0 = int(FREQ_0 * (len(first_chunk) / SAMPLE_RATE))
    bin_1 = int(FREQ_1 * (len(first_chunk) / SAMPLE_RATE))

    baseline_energy = max(_band_energy(mag, bin_0), _band_energy(mag, bin_1))
    threshold = baseline_energy * 3

    # Scan for signal onset
    signal_start = 0
    for i in range(0, len(audio) - window_size, 50):
        w = audio[i:i + window_size]
        fft_r = np.fft.fft(w)
        m = np.abs(fft_r)
        b0 = int(FREQ_0 * (len(w) / SAMPLE_RATE))
        b1 = int(FREQ_1 * (len(w) / SAMPLE_RATE))
        if _band_energy(m, b0) > threshold or _band_energy(m, b1) > threshold:
            signal_start = i
            break

    # Back up by one full bit so we don't clip any preamble
    safety = samples_per_bit
    final = max(0, signal_start - safety)
    logging.info("Signal at sample %d, trimming from %d", signal_start, final)
    return audio[final:]