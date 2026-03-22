import os
import logging
import numpy as np
import sounddevice as sd
import scipy.io.wavfile as wavfile
import conversion
import hamming
import threading
import time
import keyboard

SAMPLE_RATE = 44100
BAUD_RATE = 20
BIT_DURATION = 0.05
FREQ_0 = 18000
FREQ_1 = 19500

logging.basicConfig(level=logging.INFO)

def generateAudio(binary_content, filename = "audio"):
    t = np.arange(0, BIT_DURATION, 1 / SAMPLE_RATE)
    logging.info("Generating audio")
    arr_0 = np.sin(2 * np.pi * FREQ_0 * t)
    arr_1 = np.sin(2 * np.pi * FREQ_1 * t)
    window = np.hanning(len(t))
    arr_0 = arr_0 * window
    arr_1 = arr_1 * window
    # audio = np.where(binary_content == '0', arr_0, arr_1)
    audio = []

    for i in range(len(binary_content)):
        if binary_content[i] == '0':
            audio.append(arr_0)
        else:
            audio.append(arr_1)
    audio = np.array(audio)
    audio = np.concatenate(audio)
    # audio = audio.concatenate(audio)
    audio = audio * 0.5
    logging.info("Saving audio in npy")
    np.save(f'audio/{filename}.npy', audio)
    # print(audio)
    logging.info("Playing/ Saving audio")
    # sd.play(audio, SAMPLE_RATE)
    wavfile.write(f'audio/{filename}.wav', SAMPLE_RATE, audio)
    logging.info("Audio file saved as audio/%s.wav", filename)

def readAudio(filename, external_stop_event=None):
    # SAMPLE_RATE, audio = wavfile.read(f'audio/{filename}.wav')
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
    audio = hunter(audio)
    logging.info("Reading audio")
    output = ""
    for i in range(0, len(audio), samples_per_bit):
        current_chunk = audio[i:i+samples_per_bit]
        if len(current_chunk) < samples_per_bit:
            break
        fft_result = np.fft.fft(current_chunk)
        mag = np.abs(fft_result)
        bin_0 = int(FREQ_0*(len(current_chunk)/SAMPLE_RATE))
        bin_1 = int(FREQ_1*(len(current_chunk)/SAMPLE_RATE))
        if mag[bin_0] > mag[bin_1]:
            output += '0'
        else:
            output += '1'
    # logging.info("Audio read as %s", output)
    return output

def hunter(audio):
    first_chunk = audio[0:1000]
    fft_result = np.fft.fft(first_chunk)
    mag = np.abs(fft_result)
    bin_0 = int(FREQ_0*(len(first_chunk)/SAMPLE_RATE))
    bin_1 = int(FREQ_1*(len(first_chunk)/SAMPLE_RATE))
    baseline_noice = 0
    if mag[bin_0] < mag[bin_1]:
        baseline_noice = mag[bin_1]
    else:
        baseline_noice = mag[bin_0]
    threshold = baseline_noice * 5
    thresh = 0
    for i in range(0, len(audio), 100):
        current_window = audio[i:i+1000]
        if len(current_window) < 1000:
            break
        fft_result = np.fft.fft(current_window)
        mag = np.abs(fft_result)
        bin_0 = int(FREQ_0*(len(current_window)/SAMPLE_RATE))
        bin_1 = int(FREQ_1*(len(current_window)/SAMPLE_RATE))
        if mag[bin_0] > threshold or mag[bin_1] > threshold:
            thresh = i
            break
    return audio[thresh:]

if __name__ == '__main__':
    logging.info("Starting audio read")
    output = readAudio("audio")
    logging.info("Converting audio to binary")
    with open(f'tests_output/binary_content.txt', 'w') as f:
        f.write(output)
    logging.info("Converting binary to string")
    conversion.toString(f'tests_output/binary_content.txt')
    logging.info("Conversion complete")
    # logging.info("Audio read as %s", output)