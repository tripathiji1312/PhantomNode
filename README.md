# PhantomNode
> **Acoustic Data Transmission Protocol & Signal Processing Engine**

[![Python Version](https://img.shields.io/badge/python-3.9%2B-blue.svg?style=for-the-badge&logo=python)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![License](https://img.shields.io/badge/license-MIT-green.svg?style=for-the-badge)](#)
[![Status](https://img.shields.io/badge/status-Active_Development-success.svg?style=for-the-badge)](#)

PhantomNode is a sophisticated, highly resilient acoustic data transmission engine designed to send and receive digital payloads over the air using sound waves. Built on an advanced backend architecture, it translates raw binary data into High-Frequency FSK (Frequency-Shift Keying) audio signals, transmits them through standard commercial speakers, and reliably decodes them via standard microphones at the receiver. 

Engineered for environments where traditional RF protocols, Wi-Fi, or cellular networks are compromised or entirely unavailable, PhantomNode leverages cutting-edge digital signal processing (DSP), fuzzy logic synchronization, and robust forward-error-correction (FEC) to guarantee data integrity across an invisible, air-gapped acoustic medium.

---

## Backend Core Architecture & Signal Processing

The backend ecosystem of PhantomNode is a marvel of applied mathematics and digital communications theory, orchestrated primarily through a high-performance **FastAPI** server layer. The core objective is the seamless, error-resistant translation between digital data and acoustic waveforms.

### 1. Acoustic Modulation & Frequency-Shift Keying (`app/audio_work.py`)
Data is systematically modulated using **Frequency-Shift Keying (FSK)** in the near-ultrasonic frequency spectrum. This ensures the transmission remains largely unobtrusive to human hearing while maximizing bandwidth and data density on standard microphone hardware architectures.

*   **Carrier Frequencies:** The protocol operates on two distinct carrier frequencies: `18,000 Hz` (representing the binary state '0') and `19,500 Hz` (representing the binary state '1').
*   **Sample Rate Infrastructure:** The entire pipeline operates on a strict `44,100 Hz` standard, ensuring ubiquitous hardware compatibility across the widest array of commercial transceivers.
*   **Signal Generation & Spectral Containment:** Individual bits are sequentially mapped to continuous sine waves. To prevent catastrophic spectral leakage and transient clipping (clicks/pops) during rapid frequency transitions, each generated bit is enveloped in a continuous **Hanning Window**. This mathematical smoothing allows the audio buffer to remain pristine.
*   **Demodulation Analysis Engine:** At the receiver, incoming audio is sliced into discrete bit-duration chunks. The engine performs a discrete Fast Fourier Transform (FFT) analysis. Rather than checking a single frequency bin, it calculates the summed energy of a specific band-width (`BAND_WIDTH = 3` bins) surrounding the target matrix. The frequency locus exhibiting the dominant energy integral strictly dictates the decoded binary state.

### 2. SECDED Error Detection & Self-Healing (`app/hamming.py`)
Acoustic transmission channels are inherently hostile and exceptionally noisy. Unpredictable environmental anomalies, acoustic shadows, and physical interference threaten data integrity. To combat this, PhantomNode heavily implements **SECDED (Single Error Correction, Double Error Detection)** utilizing an extended **Hamming(8,4)** algebraic algorithm.

*   **Data Redundancy Matrix:** Every 4 bits (a nibble) of raw payload is mathematically expanded into an 8-bit block. This consists of 4 original data bits, 3 Hamming parity bits for positional isolation, and 1 overarching global parity bit.
*   **Autonomous Self-Healing:** During reception, if an atmospheric anomaly causes a single bit within the 8-bit block to flip, the decoding engine utilizes the parity syndrome to dynamically calculate the precise algebraic index of the corrupted bit and instantaneously inverses it, fully healing the signal without requiring a re-transmission.
*   **Catastrophic Corruption Detection:** Should severe noise cause a simultaneous 2-bit flip within the same block, the SECDED algorithm detects the parity anomaly and isolates the block, gracefully warning the system of localized data destruction rather than permitting fabricated or hallucinatory data injection.

### 3. Fuzzy Synchronization Sequences (`app/conversion.py`)
A critical hurdle in acoustic data transfer is determining exactly where a message begins within a chaotic and unbounded audio stream. PhantomNode solves this by framing the synchronized payload within highly resilient binary **Preamble (Sync Word)** markers.

*   **Fuzzy Target Acquisition:** Requiring a mathematically perfect and uncorrupted sequence match over the air is statistically improbable. Instead, the engine deploys a sweeping probability algorithm.
*   **Confidence Thresholds & Sliding Windows:** A sliding computational window traverses the decoded bitstream, comparing the incoming array against the known target preamble. The receiver actively locks onto the transmission vector if it detects a sequence meeting at least an **80% to 85% match confidence threshold**. This fault-tolerant architecture guarantees that the engine will accurately predict the payload's "True Zero" index coordinates, even if the structural preamble sustained moderate acoustic damage during flight.

### 4. Asynchronous Pipeline & Protocol Normalizer (`app/server.py`)
Functioning as the asynchronous orchestrator, the overarching FastAPI server seamlessly bridges the gap between disparate client web-environments and the core local DSP engine.

*   **Universal Format Bridging:** Client hardware ecosystems (like web browsers) uniquely capture audio streams in highly compressed formats such as `WebM` or `Ogg`. The interception layer captures these heterogeneous multipart uploads and instantly routes them to headless `ffmpeg` subprocesses. These threads perform high-fidelity transcoding, mutating the compressed streams into standard, uncompressed `44,100Hz Mono WAV` artifacts before securely injecting them into the Fourier-analysis pipeline.

---

## Technical Challenges & Engineered Solutions

Engineering an air-gapped acoustic data modem exposed the architecture to extreme physical challenges. Here is how the PhantomNode core neutralizes them:

### Challenge I: Signal Onset & Micro-Timing Drift
**Problem:** A microphone inevitably begins sampling atmospheric noise long before the transmission initiates, leaving a highly variable silence buffer at the start. Additionally, microscopic hardware clock discrepancies between the sending and receiving devices induce "timing drift," where the receiver's bit-boundary calculations slowly misalign.
**Solution (The Hunter-Seeker Subsystem):**
1.  **Macro-Alignment Phase (`_hunter`):** The system first calculates a baseline energy curve for ambient room noise. It aggressively scans the vector timeline forward until it detects frequency energies spiking mathematically (at least 300%) above the established baseline. This completely isolating the exact array sample where the signal physically begins.
2.  **Micro-Alignment Sweep Phase:** The engine then performs a localized, ultra-high-resolution sub-bit sweep. It decodes the incoming signal at dozens of microscopically shifted offsets (steps calculated at ~5% of a total bit duration) and actively scores every output against the known synchronization preamble (`_preamble_score`). The singular offset yielding the absolute highest preamble confidence matrix is permanently locked in for the remainder of the decoding lifecycle.

### Challenge II: Multi-path Fading & Resonant Reverberation
**Problem:** Acoustic waves geometrically scatter and bounce off walls, floors, and adjacent solid objects. This creates violent, delayed echoes (Inter-Symbol Interference) that rapidly smear binary '1's into '0's, completely destroying contiguous logic.
**Solution:** By programmatically enforcing a localized Hanning window on both the transmission rendering phase and the incoming receiving chunks immediately prior to the Fourier transformation, PhantomNode aggressively dampens the traumatic trailing edges of overlapping, echoed frequencies. This effectively silences the physical room's resonant reverberation coefficient, focusing the computational matrix exclusively on the direct, line-of-sight sound waves.

### Challenge III: Hardware Discrepancies & Sample Rate Chaos
**Problem:** Diverse operating systems and microphone drivers natively record at disparate and highly unpredictable sample rates (e.g., modern phones forcing 48kHz against legacy 44.1kHz), mathematically destroying the frequency bin algorithms.
**Solution:** The decoding engine actively monitors and parses the incoming structural header frame. If any sample rate deviation is detected against the 44,100Hz constant, it dynamically triggers a real-time `scipy.signal.resample` vector routine, scaling and normalizing the entire audio timeline back to exact mathematical alignment before the analysis stage begins.

---

## Future Research & Architectural Roadmap

Implementation scale requires continuous architectural refinement. Upcoming core updates include:

- **Dynamic Bit-Duration Scaling:** Autonomous optimization scaling based on real-time acoustic channel noise estimation and signal-to-noise ratio matrices.
- **Multi-Carrier OFDM (Orthogonal Frequency-Division Multiplexing):** Distributing the data payload simultaneously across dozens of overlapping orthogonal sub-carriers for profound bandwidth scaling and immunity to single-frequency resonant blocking.
- **Advanced Reed-Solomon Application:** Transitioning from standalone SECDED to comprehensive forward-error-correction for rapid contiguous burst-error healing.

<p align="center">
  <i>"Establishing uncompromising data integrity across invisible, air-gapped domains."</i>
</p>
