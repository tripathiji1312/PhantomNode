import os
import hamming

startbin = "001110010011100100110111001100110111001101110100011000010111001001110100"
endbin = "00111001001110010011011100110011011001010110111001100100"


def fuzzy_find(bit_string, target_word, min_match_ratio=0.85):
    best_match_idx = -1
    best_match_count = 0
    target_len = len(target_word)

    # Slide the window across the received audio binary
    for i in range(len(bit_string) - target_len + 1):
        window = bit_string[i: i + target_len]

        # Count exactly how many bits match the target word
        match_count = sum(1 for a, b in zip(window, target_word) if a == b)

        # Keep track of the highest score
        if match_count > best_match_count:
            best_match_count = match_count
            best_match_idx = i

    # Did the best match meet our 85% threshold?
    match_percentage = best_match_count / target_len
    if match_percentage >= min_match_ratio:
        print(f"[+] Sync Word locked at index {best_match_idx} with {match_percentage * 100:.1f}% confidence.")
        return best_match_idx
    else:
        return -1

def toBinary(path, save=True):
    with open(path, 'r') as f:
        name = f.read()
    b = ''.join(format(ord(char), '08b') for char in name)
    filename = os.path.basename(path)
    os.makedirs('tests_output', exist_ok=True)
    b = hamming.encode_hamming(b)
    b = startbin + b + endbin
    if save:
        with open(f'tests_output/binary_{filename}', 'w') as f:
            f.write(b)
    return b


def toString(path, save=True):
    with open(path, 'r') as f:
        b = f.read().replace('\n', '').replace(' ', '')

    # 1. FUZZY SEARCH for the startbin (Require 80% match)
    start_idx = fuzzy_find(b, startbin, 0.80)
    if start_idx == -1:
        raise ValueError("Start sequence not found! Preamble was totally destroyed.")

    payload_start = start_idx + len(startbin)

    # 2. FUZZY SEARCH for the endbin (Starting from where the payload begins)
    # This prevents the scanner from accidentally finding the startbin again!
    search_area_for_end = b[payload_start:]
    relative_end_idx = fuzzy_find(search_area_for_end, endbin, 0.80)

    if relative_end_idx == -1:
        print("[!] Warning: End sequence not found. Message might be cut off.")
        end_idx = len(b)  # Decode to the end of the file anyway
    else:
        end_idx = payload_start + relative_end_idx

    # 3. Slice out EXACTLY the Hamming-encoded payload
    encoded_payload = b[payload_start: end_idx]

    # 4. HAMMING DECODE (Heal the payload)
    clean_payload = hamming.decode_hamming(encoded_payload)

    # 5. Convert back to text
    clean_payload = clean_payload[:len(clean_payload) - len(clean_payload) % 8]
    bytes_list = [int(clean_payload[i:i + 8], 2) for i in range(0, len(clean_payload), 8)]
    data = bytes(bytes_list)

    print(f"\n[+] DECODED PAYLOAD: {data.decode('utf-8', errors='ignore')}\n")

    filename = os.path.basename(path)
    os.makedirs('tests_output', exist_ok=True)
    if save:
        with open(f'tests_output/string_{filename}', 'wb') as f:
            f.write(data)

    return data

if __name__ == '__main__':
    print("this is the conversion.py")