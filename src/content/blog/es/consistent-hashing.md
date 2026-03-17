---
title: "El Algoritmo de la Discordia: Consistent Hashing"
date: "2026-03-20"
description: "De un paper del MIT en 1997 a servir trillones de mensajes en Discord. Cómo una función hash resolvió el problema de escalar sistemas distribuidos."
tags: ["sistemas distribuidos", "papers", "algorithms"]
lang: "es"
---

# El Algoritmo de la Discordia: Consistent Hashing

Imagina que tienes 100 servidores y uno de ellos está al 99% de CPU mientras el resto va al 5%. Tu sistema es tan lento como ese único servidor saturado. Este problema — los **hot spots** — fue lo que motivó a David Karger y su equipo del MIT a publicar en 1997 un paper que cambiaría la forma en que diseñamos sistemas distribuidos.

En este post recorro la historia de una idea que nació para repartir caché en la web y acabó siendo pieza fundamental de Amazon Dynamo, Discord y prácticamente cualquier base de datos distribuida moderna. La gracia está en cómo la teoría chocó con la práctica — y cómo la práctica refinó la teoría.

---

## 1. El problema: repartir datos sin que todo explote

Supongamos que tenemos un conjunto de datos (páginas web, mensajes, objetos de un carrito de compra) y $n$ servidores de caché para servirlos. La solución más intuitiva es usar una función hash clásica:

$$\text{servidor}(k) = h(k) \mod n$$

Funciona perfecto... mientras $n$ no cambie. El momento en que añades o quitas un servidor, el módulo cambia y **prácticamente todas las claves se remapean**. Si tenías 10 servidores y pasas a 11, la fracción de claves que mantienen su servidor es mínima. Toda la caché se invalida de golpe.

El paper de Karger planteó una pregunta concreta: ¿podemos diseñar una función hash que **cambie mínimamente** cuando cambia el número de servidores?

---

## 2. La idea del anillo

La construcción de Karger es elegante. En vez de mapear claves a servidores con un módulo, mapeamos **todo** — claves y servidores — al mismo espacio circular:

1. Toma el rango de salida de tu función hash y trátalo como un **anillo** (el valor más alto conecta con el más bajo).
2. Cada servidor se coloca en una posición aleatoria del anillo mediante $h(\text{servidor})$.
3. Cada clave se coloca también en el anillo mediante $h(\text{clave})$.
4. La clave se asigna al **primer servidor que encuentras en sentido horario**.

¿Qué pasa cuando un servidor se cae o se añade uno nuevo? Solo se ven afectadas las claves que estaban asignadas al servidor inmediatamente posterior. El resto del anillo no se entera. Esa es la magia: **cambios locales producen efectos locales**.

---

## 3. Las propiedades formales

Karger no se limitó a proponer el anillo: formalizó qué significa que una función hash sea "consistente". Para ello introdujo las **ranged hash functions** — funciones de la forma $f: 2^B \times I \to B$, donde $B$ es el conjunto de buckets (servidores), $I$ el de items (claves), y $2^B$ representa las distintas **vistas** que un cliente puede tener del sistema.

La noción de "vista" es importante: en Internet, no todos los clientes conocen todos los servidores. Unos pueden ver 8 de 10, otros 9 de 10. Consistent hashing funciona incluso con estas inconsistencias.

Las propiedades que definen la consistencia son:

**Smoothness (Suavidad):** Cuando se añade o se quita un servidor, la fracción de claves que deben reubicarse es la mínima necesaria para mantener el balance. Si pasas de $n$ a $n+1$ servidores, solo debe moverse $\approx 1/(n+1)$ de los datos.

**Balance:** Para una vista fija $V$, la probabilidad de que un item caiga en un bucket concreto es:

$$\Pr[f_V(i) = b] \leq \frac{O(1)}{|V|}$$

Es decir, los items se reparten uniformemente entre los servidores visibles.

**Spread ($\sigma$):** Dadas $V$ vistas distintas (cada una con al menos una fracción $1/t$ de los servidores totales), el número de servidores distintos a los que un item $i$ puede ser asignado a través de todas las vistas es $\sigma(i) = O(t \log C)$, donde $C$ es el número total de servidores.

**Load ($\lambda$):** Simétricamente, el número de items distintos asignados a un servidor concreto a través de todas las vistas es $\lambda(b) = O(t \log C)$.

La intuición de spread y load es práctica: incluso si los clientes tienen información parcial e inconsistente sobre qué servidores existen, un item no acaba repartido en demasiados sitios (spread bajo → poca memoria desperdiciada) y ningún servidor se ve asignado una cantidad ridícula de datos (load bajo → sin hot spots).

---

## 4. La construcción: puntos en el intervalo unitario

¿Cómo se implementa esto en la práctica? Karger propone dos funciones aleatorias: $r_B$ que mapea servidores al intervalo $[0, 1]$ y $r_I$ que hace lo mismo con items. El item $i$ se asigna al servidor $b \in V$ que minimiza $|r_B(b) - r_I(i)|$ — es decir, al servidor "más cercano" en el intervalo.

Pero un solo punto por servidor produce una distribución muy desigual. La solución es usar **$\kappa \log C$ puntos por servidor** (réplicas virtuales en el intervalo). Karger demuestra que con esta multiplicación, la familia de funciones resultante es monótona, balanceada, y tiene spread y load logarítmicos.

La monotonía se entiende de forma intuitiva: cuando añades un servidor nuevo, solo "captura" los items que ahora están más cerca de alguno de sus puntos. Ningún item se mueve entre servidores antiguos.

### Experimenta tú mismo

Añade y quita nodos del anillo y observa cómo se redistribuyen las claves. Compara con el hash modular clásico para ver la diferencia en el número de reasignaciones.

<ConsistentHashPlayground client:load />

---

## 5. Amazon Dynamo: la teoría choca con la realidad

En 2007, Amazon publicó el paper de Dynamo, un almacén clave-valor de alta disponibilidad que usaba consistent hashing como base de su particionamiento. El sistema almacena objetos asociados a una clave y expone dos operaciones: `get(key)` y `put(key, context, object)`. Cada clave se hashea con MD5 para obtener su posición en el anillo.

La promesa de Karger es bonita en el papel, pero Amazon descubrió que **la primera estrategia no funcionaba del todo bien en producción**.

### El problema del desbalanceo

Dynamo empezó con la Estrategia 1: a cada nodo se le asignan $T$ tokens aleatorios en el anillo. Las particiones resultantes son de tamaño desigual, porque los tokens se eligen al azar. Esto causaba dos problemas serios:

- **Bootstrapping lentísimo:** Cuando un nodo nuevo se une al sistema, tiene que escanear las bases de datos de otros nodos para encontrar qué claves "robar". En temporada alta de compras, esto podía tardar un día entero.
- **Backups complicados:** Como los rangos son aleatorios, no puedes simplemente copiar archivos de tamaño fijo a un sistema externo.

Pero lo más revelador fue la **paradoja de la carga**. Amazon midió cuántos nodos estaban "fuera de balance" (con tráfico que desviaba más del 15% de la media) a lo largo del día. Con mucho tráfico, las claves populares se repartían bien y el desbalanceo bajaba al ~10%. Pero con poco tráfico, unas pocas claves dominaban y el nodo que las tenía se saturaba mucho más que el resto — el desbalanceo subía al ~20%.

### La evolución en tres estrategias

Amazon probó tres aproximaciones al particionamiento:

| Estrategia | Cómo divide el anillo | Ventaja | Problema |
|---|---|---|---|
| **1.** Tokens aleatorios | Rangos de tamaño desigual | Sigue la teoría de Karger | Muy lento al añadir nodos, difícil hacer backups |
| **2.** Particiones fijas + tokens | Anillo en $Q$ trozos iguales, tokens solo para asignación | Separa partición de ubicación | Peor eficiencia de balanceo |
| **3.** Particiones fijas, $Q/S$ tokens por nodo | $Q$ trozos iguales, cada nodo recibe $Q/S$ | Balanceo perfecto, gestión rápida | Requiere coordinación al entrar/salir |

Amazon eligió la **tercera estrategia** por razones operativas concretas: las particiones de tamaño fijo se pueden guardar como archivos separados, lo que hace que el bootstrapping sea simplemente transferir un archivo en vez de escanear una base de datos. Y los backups se reducen a copiar archivos de tamaño fijo a S3.

La lección es potente: **la elegancia matemática de la Estrategia 1 chocaba con la eficiencia operativa**. La teoría te dice que los tokens aleatorios dan buenas garantías probabilísticas; la práctica te dice que un operador a las 3 de la mañana necesita poder mover archivos, no resolver ecuaciones.

### Nodos virtuales y replicación

Dynamo también popularizó el concepto de **nodos virtuales**: cada nodo físico se mapea a múltiples posiciones en el anillo. Si un nodo se cae, su carga se reparte entre el resto (porque sus tokens virtuales están distribuidos por todo el anillo). Cuando vuelve, recupera una cantidad similar de carga de cada nodo. Y si un servidor tiene más capacidad, se le asignan más nodos virtuales.

Para la replicación, cada clave se almacena en los $N$ primeros nodos *físicos distintos* en sentido horario desde su posición. Dynamo configura tres parámetros fundamentales:

- **$N$**: número de réplicas de cada dato.
- **$W$**: número de nodos que deben confirmar una escritura.
- **$R$**: número de nodos que deben responder a una lectura.

Si $R + W > N$, se garantiza (teóricamente) que siempre hay solapamiento entre los nodos que escriben y los que leen, asegurando que lees la última versión. La configuración típica en producción era $(N, R, W) = (3, 2, 2)$.

### Vector clocks: el árbol genealógico del dato

Un aspecto que no viene de consistent hashing pero que completa la historia de Dynamo es cómo maneja los conflictos. En un sistema donde priorizas disponibilidad sobre consistencia (siguiendo el teorema CAP), varios nodos pueden escribir versiones distintas del mismo dato simultáneamente.

Dynamo usa **vector clocks** — listas de pares (nodo, contador) — como "sellos genealógicos". Si un dato tiene el vector $[(S_x, 2), (S_y, 1)]$ y otro tiene $[(S_x, 2), (S_z, 1)]$, el sistema sabe que ninguno desciende del otro (son "primos"), guarda ambas versiones y deja que la aplicación decida cómo fusionarlas.

---

## 6. Jump Consistent Hash: 5 líneas que rompen el anillo

En 2014, John Lamping y Eric Veach de Google publicaron un paper con un enfoque radicalmente distinto. En vez de usar un anillo y buscar posiciones, Jump Consistent Hash usa una función hash que determina **cuándo debe saltar** una clave de un nodo a otro conforme aumenta el número de nodos.

La idea es probabilística: si tienes $n$ buckets y añades uno más, cada clave debe quedarse donde está con probabilidad $n/(n+1)$ y saltar al nuevo bucket con probabilidad $1/(n+1)$. Si generas un número pseudoaleatorio $r \in [0, 1)$ con la clave como semilla, el siguiente destino de salto es:

$$j = \lfloor (b + 1) / r \rfloor$$

Esto permite saltar directamente al siguiente cambio sin recorrer todos los buckets intermedios, dando complejidad $O(\log n)$. El código completo en C++ cabe en 5 líneas:

```cpp
int32_t JumpConsistentHash(uint64_t key, int32_t num_buckets) {
    int64_t b = -1, j = 0;
    while (j < num_buckets) {
        b = j;
        key = key * 2862933555777941757ULL + 1;
        j = (b + 1) * (double(1LL << 31) / double((key >> 33) + 1));
    }
    return b;
}
```

Introduce una clave y un número de buckets para ver el algoritmo paso a paso. Observa cómo `j` crece exponencialmente — con 1000 buckets solo necesita ~7 saltos.

<JumpHashStepper client:load />

### ¿Qué ganas y qué pierdes?

| | Karger (anillo) | Jump Consistent Hash |
|---|---|---|
| **Memoria** | $O(n \cdot \kappa \log n)$ — miles de bytes por servidor | $O(1)$ — solo necesitas saber el total de nodos |
| **Velocidad** | $O(\log n)$ pero con cache misses en estructuras grandes | $O(\log n)$ puramente aritmético, 3-8x más rápido |
| **Balance** | Desviación estándar ~3.2% con 1000 puntos/bucket | Prácticamente perfecto (std error ~$10^{-8}$) |
| **Flexibilidad** | Nodos con IDs arbitrarios, se pueden añadir/quitar libremente | Nodos numerados secuencialmente, no puedes quitar uno del medio |

La limitación de Jump Hash es clara: los nodos deben estar numerados $[0, n)$. No puedes simplemente quitar el nodo 7 de 15 — tendrías que renumerar. Esto lo hace ideal para **sharding de datos** (donde los shards se gestionan como un conjunto ordenado) pero no tanto para **web caching** (donde los servidores van y vienen arbitrariamente).

Es un tradeoff elegante: al restringir el modelo, consigues mejores garantías con menos recursos.

---

## 7. Discord: consistent hashing en la trinchera

En 2023, Discord publicó cómo almacenan trillones de mensajes. Su arquitectura es un caso de estudio perfecto de consistent hashing aplicado a escala masiva.

Los mensajes se particionan por `(channel_id, bucket)`, donde bucket es una ventana temporal fija. El problema clásico de los hot spots aparece cuando un servidor grande con miles de usuarios activos genera mucho tráfico en una misma partición — exactamente el escenario que Karger describía en 1997.

Discord introdujo una capa intermedia que llaman **data services**, escritos en Rust, que se sitúan entre su API y la base de datos. La pieza clave es el **request coalescing**: si 1000 usuarios piden el mismo mensaje al mismo tiempo, solo se hace una consulta a la base de datos. El primer request crea un worker task; los siguientes se suscriben a ese task y reciben el resultado cuando llega.

¿Y cómo aseguran que las peticiones del mismo canal lleguen a la misma instancia del servicio? **Consistent hashing como routing**. El `channel_id` se usa como clave de routing, de forma que todas las peticiones de un canal van a la misma instancia del data service. Esto maximiza el coalescing: si las peticiones del canal se repartieran al azar entre instancias, cada una haría su propia consulta a la base de datos.

El resultado: pasaron de 177 nodos Cassandra con latencias p99 de 40-125ms a 72 nodos ScyllaDB con 15ms de p99. Y durante la final del Mundial 2022, con picos masivos de mensajes en cada gol, el sistema ni se inmutó.

---

## 8. Conclusión

Lo que más me interesa de esta historia no es un algoritmo concreto, sino la **evolución de una idea a lo largo de 30 años**:

1. **Karger (1997)** define el marco teórico y las propiedades formales. Es matemáticamente elegante pero operativamente complejo.
2. **Amazon (2007)** lo lleva a producción y descubre que la elegancia matemática no siempre sobrevive al contacto con la realidad. Las particiones aleatorias son bonitas en el paper pero un dolor operativo a las 3AM.
3. **Google (2014)** simplifica radicalmente el problema al restringir el modelo. Si no necesitas IDs arbitrarios, puedes resolverlo con aritmética pura en 5 líneas.
4. **Discord (2023)** muestra que consistent hashing no es solo para particionar datos — es una herramienta de routing que, combinada con coalescing, convierte un problema de hot spots en un sistema que aguanta trillones de mensajes.

La lección de fondo es que en sistemas distribuidos, el algoritmo "mejor" no existe en abstracto. Existe el algoritmo adecuado para tu modelo de operación, tus restricciones prácticas y lo que tu equipo de guardia es capaz de depurar a las 3 de la mañana.

---

## Referencias

- Karger, D., Lehman, E., Leighton, T., Panigrahy, R., Levine, M., & Lewin, D. (1997). *Consistent Hashing and Random Trees: Distributed Caching Protocols for Relieving Hot Spots on the World Wide Web*. STOC '97.
- DeCandia, G., et al. (2007). *Dynamo: Amazon's Highly Available Key-value Store*. SOSP '07.
- Lamping, J. & Veach, E. (2014). *A Fast, Minimal Memory, Consistent Hash Algorithm*. Google.
- Ingram, B. (2023). *How Discord Stores Trillions of Messages*. Discord Engineering Blog.
