---
title: "Fourier Applied to HardTechno"
date: "2026-03-04"
description: "An analysis of how the Fourier Transform explains saturation in HardTechno/Schranz. Fourier Series, THD, and psychoacoustics."
tags: ["maths", "signal-processing", "music"]
lang: "en"
---

# Fourier and the HardTechno Sound

The other day I asked myself a simple question: how would I explain my hobby — techno — using nothing but mathematics? Beyond the energy and the aesthetics, what lies underneath is pure signal processing.

In this article, I analyze how concepts such as Fourier Series, the Fourier Transform, DFT/FFT, and THD explain very concrete phenomena in electronic music production, particularly the saturation of kicks in styles like Schranz. The goal is not to discuss musical aesthetics, but rather spectral structure and harmonic generation from a mathematical perspective.

---

## 1. Fourier Series: Decomposing Sound

Imagine you have a recording of a saturated kick in your DAW. You see a wave going up and down in the time domain. This wave, despite looking complex, is actually the result of many frequencies added together.

Using **Fourier Series**, we can mathematically write any periodic wave $x(t)$ as a sum of sinusoids:

$$x(t) = a_0 + \sum_{n=1}^{\infty} \left[ a_n \cos(2\pi n f_0 t) + b_n \sin(2\pi n f_0 t) \right]$$

Your saturated kick is the sum of:

- **$f_0$**: The *fundamental frequency*. The base tone of the kick (e.g., 60 Hz).
- **$n f_0$**: The *harmonics*, multiples of the fundamental (120 Hz, 180 Hz, 240 Hz, etc.).
- **$a_n$ and $b_n$**: The *amplitudes* of each component. High amplitudes = metallic sounds. Low amplitudes = clean sounds.

In other words: **your ear hears the final result, but mathematics sees the sum of all those frequencies acting simultaneously.**

---

## 2. Fourier Transform: From Time to Frequency

The series above assumes the sound is perfectly periodic. But electronic music is constantly evolving. That's why we need the **Fourier Transform (FT)**, which lets us move from the *time domain* to the *frequency domain*:

$$X(f) = \int_{-\infty}^{\infty} x(t) \cdot e^{-j 2\pi f t} \, dt$$

The complex exponential $e^{-j 2\pi f t}$ (from **Euler's Identity**: $e^{i\theta} = \cos\theta + i\sin\theta$) acts as a "detector" for each frequency. If that frequency exists in your signal, the integral is large. If not, it's close to zero.

**Result:** A graph where the X axis is frequency (Hz) and the Y axis is amplitude. It's what you see when you open a spectral analyzer in Ableton.

---

## 3. From Continuous to Digital: DFT and FFT

Computers don't work with continuous functions, but with *discrete sample arrays*. That's why we use the **Discrete Fourier Transform (DFT)**:

$$X[k] = \sum_{n=0}^{N-1} x[n] \cdot e^{-j \frac{2\pi}{N} k n}$$

where:
- $N$ is the size of your sample window
- $x[n]$ is the amplitude of each sample
- $X[k]$ is the "energy at frequency $k$"

The DFT is correct, but has $O(N^2)$ complexity. In 1965, Cooley and Tukey invented the **Fast Fourier Transform (FFT)**, using divide and conquer to reduce it to $O(N \log N)$. Every live FFT analyzer uses this algorithm.

---

## 4. The Birth of Harmonics: Pure VS Saturated Sine Wave

A **pure sine wave**:

$$x(t) = A \sin(2\pi f_0 t)$$

Analyze its spectrum with FFT and you see a single line. No harmonics. No texture.

When you saturate a kick, you push the gain until it hits the digital ceiling. The rounded peaks get crushed. **This shape change creates harmonics.**

It's impossible to build a sharp corner in a sound wave using a single frequency. For abrupt changes you need multiples of the base frequency: $3 f_0$, $5 f_0$, $7 f_0$, etc.

**Example:** Base kick at 60 Hz. Saturating it adds 120 Hz, 180 Hz, 240 Hz... infinitely.

Two types of harmonic generation:

**Soft Clipping:** Functions like $y = \tanh(\alpha x)$. Progressive harmonics. "Dark" and "thick" sound.

**Hard Clipping:** Sharp cutoff: $y = \text{clip}(x)$. **Massive** amount of high-frequency harmonics. "Aggressive" and "metallic" sound.

---

### Try it yourself

Select a waveform, move the saturation slider and watch harmonics appear in the spectrum. Press "Listen" to hear the result. Start with a clean sine wave and gradually increase saturation — you'll see exactly what we just described.

<FFTPlayground client:load />

---

## 5. THD: Quantifying Distortion

**Total Harmonic Distortion (THD)** measures the ratio between harmonic energy and the fundamental:

$$\text{THD} = \frac{\sqrt{\sum_{n=2}^{\infty} V_n^2}}{V_1} \times 100\%$$

In numbers:

- THD ~ 0% — pure wave
- THD ~ 5-12% — clean (House kicks)
- THD ~ 15-25% — moderate (saturated synths)
- THD ~ 35-50% — brutal (HardTechno, Schranz)

That difference is **quantifiable and measurable**.

---

## 6. Psychoacoustics: Why It Sounds Louder

The human ear is not linear. **Fletcher-Munson curves** show that at moderate volume we're **much less sensitive below 100 Hz**.

When you saturate a kick, you move energy to upper harmonics (200-1000 Hz), frequencies where the ear is most sensitive. Even if total power is the same, the brain perceives it as **louder**.

---

## 7. Practical Applications

Every time you produce, you're doing Fourier transforms:

**EQ:** Directly manipulates $|X[k]|$.

**Saturator:** Increases $\alpha$ in $y = \tanh(\alpha x)$, generating more harmonics.

**Compressor:** Dynamic gain $y[n] = g(x[n]) \cdot x[n]$.

**FFT Analyzer:** Shows $|X[k]|$ in real time.

---

## 8. Try It Yourself

Upload two tracks and compare their spectrum and THD in real time. The analyzer has two modes:

- **Full Mix**: Analyzes everything playing at each moment — useful for seeing the overall spectrum, but THD includes vocals, synths and other elements besides the kick.
- **Kick Analysis**: Automatically detects transients (kicks) in the track and calculates THD **only from those hits**. Much more accurate for comparing production styles across genres.

To see a clear difference, try a clean House kick (e.g. Fisher, Chris Lake) against a saturated HardTechno one (e.g. Nico Moreno, RSJD). In Kick Analysis mode the THD difference should be evident.

<AudioAnalyzer client:load />

---

## References

- Oppenheim, A. V., & Schafer, R. W. (2009). *Discrete-Time Signal Processing*. Prentice Hall.
- Smith, J. O. (2011). *Spectral Audio Signal Processing*. Stanford University Press.
- Ellis, D. P. W. (2007). "On the Future of Audio Content Analysis". ICASSP proceedings.
