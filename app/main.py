import os
import logging
import numpy as np
import sounddevice as sd
import scipy.io.wavfile as wavfile

startbin = "001110010011100100110111001100110111001101110100011000010111001001110100"
endbin = "00111001001110010011011100110011011001010110111001100100"

SAMPLE_RATE = 44100
BAUD_RATE = 10
BIT_DURATION = 0.1
FREQ_0 = 400 #18000 LATER
FREQ_1 = 800 #19500 LATER

def toBinary(path, save=True):
    with open(path, 'r') as f:
        name = f.read()
    b = ''.join(format(ord(char), '08b') for char in name)
    filename = os.path.basename(path)
    os.makedirs('tests_output', exist_ok=True)
    b = startbin + b + endbin
    if save:
        with open(f'tests_output/binary_{filename}', 'w') as f:
            f.write(b)
    return b

def toString(path, save=True):
    with open(path, 'r') as f:
        b = f.read().replace('\n', '').replace(' ', '')
    if not b.startswith(startbin) or not b.endswith(endbin):
        raise ValueError("Invalid binary content")
    b = b[len(startbin):-len(endbin)]
    b = b[:len(b) - len(b) % 8]
    bytes_list = [int(b[i:i + 8], 2) for i in range(0, len(b), 8)]
    data = bytes(bytes_list)
    filename = os.path.basename(path)
    os.makedirs('../tests_output', exist_ok=True)
    if save:
        with open(f'tests_output/string_{filename}', 'wb') as f:
            f.write(data)
    return data

def generateAudio(binary_content, filename = "audio"):
    t = np.arange(0, BIT_DURATION, 1 / SAMPLE_RATE)
    logging.info("Generating audio")
    arr_0 = np.sin(2 * np.pi * FREQ_0 * t)
    arr_1 = np.sin(2 * np.pi * FREQ_1 * t)
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
    logging.info("Saving audio in npy")
    np.save(f'audio/{filename}.npy', audio)
    # print(audio)
    logging.info("Playing/ Saving audio")
    wavfile.write(f'audio/{filename}.wav', SAMPLE_RATE, audio)
    logging.info("Audio file saved as audio/%s.wav", filename)

def readAudio(filename):
    sr, audio = wavfile.read(f'audio/{filename}.wav')
    logging.info("Reading audio")
    samples_per_bit = int(sr * BIT_DURATION)
    output = ""
    for i in range(0, len(audio), samples_per_bit):
        current_chunk = audio[i:i+samples_per_bit]
        if len(current_chunk) < samples_per_bit:
            break
        fft_result = np.fft.fft(current_chunk)
        mag = np.abs(fft_result)
        bin_0 = int(FREQ_0*(len(current_chunk)/sr))
        bin_1 = int(FREQ_1*(len(current_chunk)/sr))
        if mag[bin_0] > mag[bin_1]:
            output += '0'
        else:
            output += '1'
    # logging.info("Audio read as %s", output)
    return output

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    logging.info("Starting conversion to bin")
    binary_content = toBinary('tests/content.txt', save=True)
    generateAudio(binary_content)
    # output = readAudio("audio")
    # logging.info("Converting audio to binary")
    # with open(f'tests_output/binary_content.txt', 'w') as f:
    #     f.write(output)
    # logging.info("Converting binary to string")
    # toString(f'tests_output/binary_content.txt')
    # logging.info("Conversion complete")










