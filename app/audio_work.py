import os
import logging
import numpy as np
import sounddevice as sd
import scipy.io.wavfile as wavfile
import conversion
import hamming
import threading
import time

SAMPLE_RATE = 44100
BAUD_RATE = 20
BIT_DURATION = 0.05
FREQ_0 = 18000
FREQ_1 = 19500
# FREQ_0 = 14000
# FREQ_1 = 16000

# How many FFT bins on either side of the target bin to sum (band energy)
BAND_WIDTH = 3

logging.basicConfig(level=logging.INFO)

def _band_energy(mag, center_bin, width=BAND_WIDTH):
    """Sum magnitudes in a band around the center bin for robust detection."""
    lo = max(0, center_bin - width)
    hi = min(len(mag), center_bin + width + 1)
    return np.sum(mag[lo:hi])

def generateAudio(binary_content, filename="audio"):
    t = np.arange(0, BIT_DURATION, 1 / SAMPLE_RATE)
    logging.info("Generating audio")
    arr_0 = np.sin(2 * np.pi * FREQ_0 * t)
    arr_1 = np.sin(2 * np.pi * FREQ_1 * t)
    window = np.hanning(len(t))
    arr_0 = arr_0 * window
    arr_1 = arr_1 * window
    audio = []

    for i in range(len(binary_content)):
        if binary_content[i] == '0':
            audio.append(arr_0)
        else:
            audio.append(arr_1)
    audio = np.array(audio)
    audio = np.concatenate(audio)
    audio = audio * 0.5
    logging.info("Saving audio in npy")
    np.save(f'audio/{filename}.npy', audio)
    logging.info("Playing / Saving audio")
    wavfile.write(f'audio/{filename}.wav', SAMPLE_RATE, audio)
    logging.info("Audio file saved as audio/%s.wav", filename)
    sd.play(audio, SAMPLE_RATE)
    sd.wait()
    logging.info("Audio playback finished")


def readAudio(filename, external_stop_event=None):
    samples_per_bit = int(SAMPLE_RATE * BIT_DURATION)
    recording = []

    def callback(indata, frames, time_info, status):
        recording.append(indata.copy())

    stop_flag = threading.Event()
    if external_stop_event is not None:
        stop_flag = external_stop_event
    else:
        def wait_for_stop():
            input("Press ENTER to stop recording...\n")
            stop_flag.set()

        print("Recording...")
        threading.Thread(target=wait_for_stop, daemon=True).start()

    with sd.InputStream(samplerate=SAMPLE_RATE, channels=1, callback=callback):
        while not stop_flag.is_set():
            time.sleep(0.1)

    audio = np.concatenate(recording, axis=0)
    print("Recording stopped.")
    audio = audio.flatten()

    # --- Improved signal hunting with fine-grained alignment ---
    audio = hunter(audio, samples_per_bit)

    logging.info("Reading audio")
    output = ""

    # Zero-pad each chunk for better FFT frequency resolution (4x oversampling)
    pad_factor = 4
    padded_len = samples_per_bit * pad_factor

    for i in range(0, len(audio), samples_per_bit):
        current_chunk = audio[i:i + samples_per_bit]
        if len(current_chunk) < samples_per_bit:
            break

        # Apply Hanning window before FFT to reduce spectral leakage
        windowed = current_chunk * np.hanning(len(current_chunk))

        # Zero-padded FFT for better frequency resolution
        fft_result = np.fft.fft(windowed, n=padded_len)
        mag = np.abs(fft_result)

        # Calculate bins using the padded length
        bin_0 = int(FREQ_0 * (padded_len / SAMPLE_RATE))
        bin_1 = int(FREQ_1 * (padded_len / SAMPLE_RATE))

        # Sum energy in a band around each target frequency
        energy_0 = _band_energy(mag, bin_0)
        energy_1 = _band_energy(mag, bin_1)

        if energy_0 > energy_1:
            output += '0'
        else:
            output += '1'

    return output


def hunter(audio, samples_per_bit):
    """
    Detect where the actual signal begins in the recording.
    Uses a conservative approach: finds when energy rises above noise,
    then backs up a small safety margin so the preamble isn't clipped.
    """
    window_size = min(2000, len(audio) // 2)

    if len(audio) < window_size:
        return audio

    # Measure baseline noise from the very start of the recording
    first_chunk = audio[0:window_size]
    fft_result = np.fft.fft(first_chunk)
    mag = np.abs(fft_result)
    bin_0 = int(FREQ_0 * (len(first_chunk) / SAMPLE_RATE))
    bin_1 = int(FREQ_1 * (len(first_chunk) / SAMPLE_RATE))

    baseline_energy = max(_band_energy(mag, bin_0), _band_energy(mag, bin_1))
    threshold = baseline_energy * 3  # Lower threshold for earlier detection

    # Scan forward in small steps to find when signal first appears
    signal_start = 0
    step = 50
    for i in range(0, len(audio) - window_size, step):
        current_window = audio[i:i + window_size]
        fft_result = np.fft.fft(current_window)
        mag = np.abs(fft_result)
        bin_0_w = int(FREQ_0 * (len(current_window) / SAMPLE_RATE))
        bin_1_w = int(FREQ_1 * (len(current_window) / SAMPLE_RATE))

        e0 = _band_energy(mag, bin_0_w)
        e1 = _band_energy(mag, bin_1_w)

        if e0 > threshold or e1 > threshold:
            signal_start = i
            break

    # Back up by a safety margin (half a bit duration) so we don't clip the preamble
    safety_margin = samples_per_bit // 2
    final_start = max(0, signal_start - safety_margin)

    logging.info(f"Signal detected at sample {signal_start}, trimming from {final_start} (safety margin: {safety_margin})")
    return audio[final_start:]


if __name__ == '__main__':
    logging.info("Starting audio read")
    output = readAudio("audio")
    logging.info("Converting audio to binary")
    with open(f'tests_output/binary_content.txt', 'w') as f:
        f.write(output)
    logging.info("Converting binary to string")
    conversion.toString(f'tests_output/binary_content.txt')
    logging.info("Conversion complete")