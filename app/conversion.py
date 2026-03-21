import os

startbin = "001110010011100100110111001100110111001101110100011000010111001001110100"
endbin = "00111001001110010011011100110011011001010110111001100100"

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

    # 1. SEARCH for the exact location of the start bin
    start_idx = b.find(startbin)
    if start_idx == -1:
        raise ValueError("Start sequence not found! Too much noise or signal dropped.")

    # 2. SEARCH for the exact location of the end bin (starting the search AFTER the startbin)
    end_idx = b.find(endbin, start_idx + len(startbin))
    if end_idx == -1:
        raise ValueError("End sequence not found! Message was cut off.")

    # 3. Slice out EXACTLY the payload, leaving all room noise behind!
    payload = b[start_idx + len(startbin): end_idx]

    # 4. Safety check to ensure clean 8-bit chunks
    payload = payload[:len(payload) - (len(payload) % 8)]

    # 5. Convert binary back to characters
    bytes_list = [int(payload[i:i + 8], 2) for i in range(0, len(payload), 8)]
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