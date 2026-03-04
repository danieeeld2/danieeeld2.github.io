---
title: "Fourier aplicado al HardTechno"
date: "2026-03-04"
description: "Análisis de cómo la Transformada de Fourier explica la saturación en HardTechno/Schranz. Series de Fourier, THD, psicoacústica."
tags: ["maths", "signal-processing", "music"]
lang: "es"
---

# Fourier y el Rugido del HardTechno

El otro día me planteé una pregunta sencilla: ¿cómo explicaría mi hobby — el techno — utilizando únicamente matemáticas? Más allá de la energía o la estética, lo que hay debajo es procesamiento de señales en estado puro.

En este artículo analizo cómo conceptos como Series de Fourier, Transformada de Fourier, DFT/FFT y THD explican fenómenos muy concretos en la producción de música electrónica, en particular la saturación de kicks en estilos como el Schranz. La idea no es hablar de estética musical, sino de estructura espectral y generación de armónicos desde un punto de vista matemático.

---

## 1. Series de Fourier: Descomposición del sonido

Imagina que tienes una grabación de un kick saturado en tu DAW. Ves una onda que sube y baja en el dominio del tiempo. Esta onda, aunque parezca compleja, es en realidad el resultado de muchas frecuencias sumadas.

A partir de las **Series de Fourier**, podemos escribir matemáticamente cualquier onda periódica $x(t)$ como la suma de senoides:

$$x(t) = a_0 + \sum_{n=1}^{\infty} \left[ a_n \cos(2\pi n f_0 t) + b_n \sin(2\pi n f_0 t) \right]$$

Que tu kick saturado es la suma de:

- **$f_0$**: La *frecuencia fundamental*. El tono base del kick (por ejemplo, 60 Hz).
- **$n f_0$**: Los *armónicos*, múltiplos de la fundamental (120 Hz, 180 Hz, 240 Hz, etc.).
- **$a_n$ y $b_n$**: Las *amplitudes* de cada componente. Amplitudes altas = sonidos metálicos. Amplitudes bajas = sonidos limpios.

En otras palabras: **tu oído escucha el resultado final, pero la matemática ve la suma de todas esas frecuencias actuando simultáneamente.**

---

## 2. Transformada de Fourier: Del tiempo a la frecuencia

La serie anterior asume que el sonido es perfectamente periódico. Pero una canción de electrónica va evolucionando constantemente. Por eso necesitamos la **Transformada de Fourier (FT)**, que nos permite pasar del *dominio del tiempo* al *dominio de la frecuencia*:

$$X(f) = \int_{-\infty}^{\infty} x(t) \cdot e^{-j 2\pi f t}  dt$$

La exponencial compleja $e^{-j 2\pi f t}$ (que viene de la **Identidad de Euler**: $e^{j\theta} = \cos\theta + j\sin\theta$) actúa como un "detector" de cada frecuencia. Si esa frecuencia existe en tu señal, la integral es grande. Si no existe, es cercana a cero.

**Resultado:** Una gráfica donde el eje X es frecuencia (Hz) y el eje Y es amplitud. Es lo que ves cuando abres un analizador espectral en Ableton.

---

## 3. De lo continuo a lo digital: DFT y FFT

Los ordenadores no trabajan con funciones continuas, sino con *arrays de samples discretos*. Por eso usamos la **Transformada Discreta de Fourier (DFT)**:

$$X[k] = \sum_{n=0}^{N-1} x[n] \cdot e^{-j \frac{2\pi}{N} k n}$$

donde:
- $N$ es el tamaño de tu ventana de samples
- $x[n]$ es la amplitud de cada sample
- $X[k]$ es la "cantidad de energía en la frecuencia $k$". Estrictamente hablando, es un número complejo cuyo módulo representa la amplitud y cuya fase indica el desplazamiento de la frecuencia $k$.

La DFT es correcta, pero tiene complejidad $O(N^2)$. Por eso en 1965, Cooley y Tukey inventaron la **Fast Fourier Transform (FFT)**, usando divide y vencerás para reducir a $O(N \log N)$. Cada analizador FFT en vivo usa este algoritmo.

---

## 4. El nacimiento de los armónicos: Senoide pura VS saturada

Una **senoide pura**:

$$x(t) = A \sin(2\pi f_0 t)$$

Si analizas su espectro con FFT, ves una única línea. No hay armónicos. Sin textura.

Cuando saturas un kick, le subes la ganancia hasta que choca con el techo digital. Los picos se aplastan. **Este cambio de forma crea los armónicos.**

Es imposible construir una esquina afilada en una onda con una sola frecuencia. Para cambios bruscos necesitas múltiplos de la frecuencia base: $3 f_0$, $5 f_0$, $7 f_0$, etc.

**Ejemplo:** Kick base a 60 Hz. Al saturarlo se añaden 120 Hz, 180 Hz, 240 Hz... infinitamente.

Dos tipos de generación de armónicos:

**Soft Clipping:** Funciones como $y = \tanh(\alpha x)$. Armónicos progresivos. Sonido "oscuro" y "grueso".

**Hard Clipping:** Corte en seco: $y = \text{clip}(x)$. Cantidad **masiva** de armónicos. Sonido "agresivo" y "metálico".

---

### Experimenta tú mismo

Selecciona una forma de onda, mueve el slider de saturación y observa cómo aparecen los armónicos en el espectro. Pulsa "Listen" para escuchar el resultado. Empieza con una senoidal limpia y sube la saturación poco a poco — verás exactamente lo que acabamos de explicar.

<FFTPlayground client:load />

---

## 5. THD: Cuantificando la distorsión

El **Total Harmonic Distortion (THD)** mide la relación entre la energía de los armónicos y la fundamental:

$$\text{THD} = \frac{\sqrt{\sum_{n=2}^{\infty} V_n^2}}{V_1} \times 100\%$$

En números:

- THD ~ 0% — onda pura
- THD ~ 5-12% — limpio (House)
- THD ~ 15-25% — moderado (synths saturados)
- THD ~ 35-50% — brutal (HardTechno, Schranz)

Esa diferencia es **cuantificable y medible**.

---

## 6. Psicoacústica: por qué suena más fuerte

El oído humano no es lineal. Las **curvas de Fletcher-Munson** muestran que a volumen moderado somos **mucho menos sensibles por debajo de 100 Hz**.

Al saturar un kick, mueves energía a armónicos superiores (200-1000 Hz), frecuencias donde el oído es más sensible. Aunque la potencia total sea la misma, el cerebro lo percibe como **más potente**.

---

## 7. Aplicaciones prácticas

Cada vez que produces, estás haciendo transformadas de Fourier:

**EQ:** Manipula $|X[k]|$ directamente.

**Saturador:** Aumenta $\alpha$ en $y = \tanh(\alpha x)$, generando más armónicos.

**Compresor:** Ganancia dinámica $y[n] = g(x[n]) \cdot x[n]$.

**Analizador FFT:** Muestra $|X[k]|$ en tiempo real.

---

## 8. Pruébalo tú mismo

Sube dos tracks y compara su espectro y THD en tiempo real. El analizador tiene dos modos:

- **Full Mix**: Analiza todo lo que suena en cada instante — útil para ver el espectro general, pero el THD incluye voces, synths y otros elementos además del kick.
- **Kick Analysis**: Detecta automáticamente los transientes (kicks) del track y calcula el THD **solo a partir de esos golpes**. Mucho más preciso para comparar producción entre géneros.

Para ver la diferencia de forma clara, prueba con un kick de House limpio (ej. Fisher, Chris Lake) contra uno de HardTechno saturado (ej. Nico Moreno, RSJD). En modo Kick Analysis la diferencia de THD debería ser evidente.

<AudioAnalyzer client:load />

---

## Referencias

- Oppenheim, A. V., & Schafer, R. W. (2009). *Discrete-Time Signal Processing*. Prentice Hall.
- Smith, J. O. (2011). *Spectral Audio Signal Processing*. Stanford University Press.
- Ellis, D. P. W. (2007). "On the Future of Audio Content Analysis". ICASSP proceedings.
