import logging
import app.conversion as conversion
from app.audio_work import generateAudio, readAudio

def main():
    logging.basicConfig(level=logging.INFO)
    logging.info("Starting conversion to bin")
    binary_content = conversion.toBinary('tests/content.txt', save=True)
    generateAudio(binary_content)
    output = readAudio("audio")
    logging.info("Converting audio to binary")
    with open(f'tests_output/binary_content.txt', 'w') as f:
        f.write(output)
    logging.info("Converting binary to string")
    conversion.toString(f'tests_output/binary_content.txt')
    logging.info("Conversion complete")

if __name__ == '__main__':
    main()











