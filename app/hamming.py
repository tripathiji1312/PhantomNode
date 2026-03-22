def encode_hamming(bc):
    new_bc = ""

    # Safety Check: Pad with '0's if the string isn't a multiple of 4
    while len(bc) % 4 != 0:
        bc += '0'

    for i in range(0, len(bc), 4):
        group = bc[i:i + 4]
        p1 = int(group[0]) ^ int(group[1]) ^ int(group[3])
        p2 = int(group[0]) ^ int(group[2]) ^ int(group[3])
        p3 = int(group[1]) ^ int(group[2]) ^ int(group[3])

        # Simply append the 7-bit block to the end of the new string
        new_bc += str(p1) + str(p2) + group[0] + str(p3) + group[1] + group[2] + group[3]

    return new_bc


def decode_hamming(bc):
    decoded_output = ""

    for i in range(0, len(bc), 7):
        group = list(bc[i:i + 7])

        # Safety Check: Ignore trailing fragments
        if len(group) < 7:
            break

        s1 = int(group[0]) ^ int(group[2]) ^ int(group[4]) ^ int(group[6])
        s2 = int(group[1]) ^ int(group[2]) ^ int(group[5]) ^ int(group[6])
        s3 = int(group[3]) ^ int(group[4]) ^ int(group[5]) ^ int(group[6])

        if s1 == 0 and s2 == 0 and s3 == 0:
            print("[+] Block OK")
        else:
            # Calculate the error position
            error_pos = int(str(s3) + str(s2) + str(s1), 2)
            print(f"[!] Noise detected! Healing bit at position {error_pos}...")

            # Flip the corrupted bit (remembering 0-based indexing)
            if group[error_pos - 1] == '0':
                group[error_pos - 1] = '1'
            else:
                group[error_pos - 1] = '0'

        # Strip away the parity bits and keep ONLY the 4 data bits (indices 2, 4, 5, 6)
        decoded_output += group[2] + group[4] + group[5] + group[6]

    return decoded_output


if __name__ == '__main__':
    bc = "01010101"
    print(f"Original: {bc}")

    encoded = encode_hamming(bc)
    print(f"Encoded:  {encoded}")

    # This string has an intentional error at position 3!
    decoded = decode_hamming("01001011110101")
    print(f"Decoded:  {decoded}")