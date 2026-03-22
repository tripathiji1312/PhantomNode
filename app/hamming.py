def encode_hamming(bc):
    """
    Hamming(7,4) encoding with an extra parity bit → SECDED (8,4).
    Can correct 1-bit errors AND detect 2-bit errors.
    """
    new_bc = ""

    # Pad to multiple of 4
    while len(bc) % 4 != 0:
        bc += '0'

    for i in range(0, len(bc), 4):
        group = bc[i:i + 4]
        p1 = int(group[0]) ^ int(group[1]) ^ int(group[3])
        p2 = int(group[0]) ^ int(group[2]) ^ int(group[3])
        p3 = int(group[1]) ^ int(group[2]) ^ int(group[3])

        # Standard 7-bit Hamming block
        block = str(p1) + str(p2) + group[0] + str(p3) + group[1] + group[2] + group[3]

        # Extra overall parity bit for SECDED (detect 2-bit errors)
        overall_parity = 0
        for bit in block:
            overall_parity ^= int(bit)
        block += str(overall_parity)

        new_bc += block

    return new_bc


def decode_hamming(bc):
    """
    SECDED (8,4) decoding: corrects 1-bit errors, detects 2-bit errors.
    Falls back gracefully on 2-bit errors by keeping the data as-is.
    """
    decoded_output = ""

    # Determine block size: 8 for SECDED, 7 for legacy Hamming(7,4)
    # Auto-detect based on data length
    if len(bc) % 8 == 0:
        block_size = 8
    elif len(bc) % 7 == 0:
        block_size = 7
    else:
        # Try 8 first, fallback to 7
        block_size = 8 if (len(bc) % 8 < len(bc) % 7) else 7

    for i in range(0, len(bc), block_size):
        group = list(bc[i:i + block_size])

        if len(group) < 7:
            break

        s1 = int(group[0]) ^ int(group[2]) ^ int(group[4]) ^ int(group[6])
        s2 = int(group[1]) ^ int(group[2]) ^ int(group[5]) ^ int(group[6])
        s3 = int(group[3]) ^ int(group[4]) ^ int(group[5]) ^ int(group[6])

        syndrome = int(str(s3) + str(s2) + str(s1), 2)

        if block_size == 8 and len(group) == 8:
            # SECDED mode: check overall parity
            overall_parity = 0
            for bit in group:
                overall_parity ^= int(bit)

            if syndrome == 0 and overall_parity == 0:
                # No error
                pass
            elif syndrome != 0 and overall_parity == 1:
                # Single-bit error → correct it
                error_pos = syndrome
                print(f"[!] Noise detected! Healing bit at position {error_pos}...")
                if error_pos <= 7:
                    group[error_pos - 1] = '1' if group[error_pos - 1] == '0' else '0'
                elif error_pos == 8:
                    # Error is in the parity bit itself, data is fine
                    pass
            elif syndrome != 0 and overall_parity == 0:
                # 2-bit error detected → CANNOT correct, keep data as-is
                print(f"[!!] 2-bit error detected in block (syndrome={syndrome})! Cannot correct, keeping raw data.")
            elif syndrome == 0 and overall_parity == 1:
                # Error in the overall parity bit only, data is fine
                print(f"[~] Parity bit error only, data intact.")
            else:
                print(f"[+] Block OK")
        else:
            # Legacy Hamming(7,4) mode
            if syndrome == 0:
                print("[+] Block OK")
            else:
                error_pos = syndrome
                print(f"[!] Noise detected! Healing bit at position {error_pos}...")
                if group[error_pos - 1] == '0':
                    group[error_pos - 1] = '1'
                else:
                    group[error_pos - 1] = '0'

        # Extract the 4 data bits (positions 3, 5, 6, 7 = indices 2, 4, 5, 6)
        decoded_output += group[2] + group[4] + group[5] + group[6]

    return decoded_output


if __name__ == '__main__':
    bc = "01010101"
    print(f"Original: {bc}")

    encoded = encode_hamming(bc)
    print(f"Encoded:  {encoded} ({len(encoded)} bits, block size {len(encoded) // (len(bc) // 4)})")

    decoded = decode_hamming(encoded)
    print(f"Decoded:  {decoded}")
    print(f"Match:    {decoded == bc}")