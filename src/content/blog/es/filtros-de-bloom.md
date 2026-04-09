---
title: "Filtros de Bloom: Cuando equivocarse un poco es la mejor opción"
date: "2026-04-09"
description: "De un paper de 1970 a la pieza fundamental de Bigtable, Cassandra y los LSM-Trees. La historia de una estructura de datos que acepta errores para ahorrar espacio."
tags: ["sistemas distribuidos", "algorithms", "papers"]
lang: "es"
---

En 1970, Burton Bloom publicó un paper de cuatro páginas con un título poco pretencioso: *"Space/Time Trade-offs in Hash Coding with Allowable Errors"*. La idea central era sorprendentemente simple y, al mismo tiempo, herética para los estándares de la época: ¿y si renunciamos a la precisión absoluta a cambio de usar muchísima menos memoria?

Cincuenta y cinco años después, esa idea sigue viva en Bigtable, Cassandra, ScyllaDB, Redis, los navegadores web y prácticamente cualquier sistema distribuido que tengas cerca. Este post cuenta cómo una estructura de datos "imperfecta" acabó convirtiéndose en una pieza fundamental de la infraestructura moderna.

---

## 1. El problema: ¿está esto en mi conjunto?

Imagina que tienes una base de datos con millones de claves repartidas por disco. Llega una consulta preguntando por una clave concreta. Antes de bajar al disco a buscarla, una operación cara en I/O, querrías poder responder rápidamente: *¿tiene sentido buscar, o seguro que no está?*

La solución más intuitiva es mantener en memoria un índice con todas las claves. Funciona, pero escala mal: si tienes mil millones de claves, tu "índice rápido" se convierte en otro problema de memoria.

Bloom propuso un enfoque radicalmente distinto, pensado originalmente para un problema muy concreto: los programas que separan palabras en sílabas al final de una línea para justificar el texto. La mayoría de palabras en inglés se pueden dividir aplicando unas pocas reglas simples, pero un 10% aproximado requieren consultar un diccionario. Ese diccionario no cabía en memoria en los ordenadores de 1970, así que cada palabra del 10% minoritario implicaba un acceso a disco lento.

La pregunta de Bloom: ¿y si aceptamos que, de vez en cuando, una palabra del 90% se identifique erróneamente como perteneciente al 10%? En ese caso, haríamos una consulta a disco innecesaria, un pequeño coste, pero a cambio, el "índice de 10% sospechoso" cabría en memoria.

---

## 2. Los dos métodos del paper original

Bloom presentó dos aproximaciones en el paper, y merece la pena entender ambas porque revelan de dónde salió la intuición.

**Método 1. Códigos más cortos que el mensaje**

La primera idea es una extensión natural del hashing clásico. En lugar de almacenar cada mensaje completo en el área de hash, almacenas un *código* más corto derivado de él. Como los códigos son más cortos que los mensajes originales, dos mensajes distintos pueden producir el mismo código, y de ahí salen los falsos positivos. El tamaño del código se ajusta según la fracción de error que estés dispuesto a tolerar.

**Método 2. El array de bits con múltiples hashes**

La segunda idea es la que acabó ganando. En lugar de organizar el área en celdas, tratamos la memoria como $N$ bits individuales. Para almacenar un mensaje, lo pasamos por $d$ funciones hash distintas, obtenemos $d$ direcciones de bits, y ponemos esos bits a 1. Para comprobar si un mensaje está en el conjunto, generamos las mismas $d$ direcciones y miramos si todos los bits están a 1.

Bloom demostró matemáticamente que el método 2 es estrictamente mejor que el método 1 bajo la suposición de coste constante por acceso a bit. Este segundo método es lo que hoy llamamos simplemente "filtro de Bloom".

---

## 3. La matemática detrás del filtro

Supongamos que tenemos un array de $m$ bits, $k$ funciones hash independientes, y hemos insertado $n$ elementos. La pregunta interesante es: ¿cuál es la probabilidad de un falso positivo?

Cuando insertamos un elemento, cada una de sus $k$ hashes pone un bit a 1. La probabilidad de que un bit concreto *no* sea puesto a 1 por una hash concreta es $1 - 1/m$. La probabilidad de que ese bit siga siendo 0 después de insertar $n$ elementos con $k$ hashes cada uno es:

$$\left(1 - \frac{1}{m}\right)^{kn} \approx e^{-kn/m}$$

Ahora, un falso positivo ocurre cuando comprobamos un elemento que *no* está en el conjunto, pero sus $k$ hashes apuntan casualmente a bits que ya han sido puestos a 1 por otros elementos. La probabilidad de que esto pase es:

$$f = \left(1 - e^{-kn/m}\right)^k$$

Aquí hay una tensión interesante: aumentar $k$ te da más formas de "atrapar" un elemento ausente (bueno), pero también satura el array más rápido (malo). ¿Dónde está el óptimo?

Derivando respecto a $k$ y buscando el mínimo, se obtiene:

$$k_{opt} = \frac{m}{n} \ln 2$$

Y sustituyendo, la probabilidad mínima de falso positivo para un tamaño $m$ y $n$ elementos es aproximadamente $0.6185^{m/n}$.

El número $0.6185$ es una de esas constantes que aparecen de la nada y te hacen sonreír. Traducido al mundo real: con **10 bits por elemento** obtienes una tasa de falsos positivos del ~1%. Con **20 bits por elemento** baja al ~0.01%. Cada 10 bits adicionales te dan aproximadamente dos órdenes de magnitud de precisión.

---

## 4. Experimenta con el filtro

Antes de seguir, aquí tienes un filtro de Bloom interactivo. Ajusta el tamaño del array ($m$) y el número de funciones hash ($k$), añade palabras y comprueba qué pasa. Fíjate en cómo:

- Al añadir elementos, los bits correspondientes se iluminan y se quedan a 1
- Al comprobar un elemento presente, todos sus $k$ bits están a 1 (verde)
- Al comprobar un elemento ausente basta con que uno de sus $k$ bits esté a 0 para descartarlo (rojo)
- A medida que añades más elementos empiezan a aparecer falsos positivos

<BloomFilterPlayground client:load />

El botón "Load fruits example" te carga cinco frutas de golpe. Prueba después a comprobar otras palabras; algunas darán falso positivo si tienes mala suerte con el hash.

---

## 5. Diseñar un filtro en la práctica

En un sistema real, lo normal no es jugar con $m$ y $k$ a ciegas, sino partir de dos parámetros que ya conoces:

1. **$n$**: cuántos elementos esperas almacenar
2. **$p$**: qué tasa de falsos positivos estás dispuesto a aceptar

A partir de ahí puedes calcular los valores óptimos de $m$ y $k$. La fórmula para el tamaño mínimo es:

$$m = -\frac{n \ln p}{(\ln 2)^2}$$

Aquí tienes una calculadora interactiva. Mueve los sliders para ver cómo cambian los requisitos de memoria según el tamaño del conjunto y la precisión que quieras:

<BloomOptimizer client:load />

El gráfico muestra tres líneas que cuentan toda la historia. La **línea naranja** es el filtro de Bloom óptimo: una recta perfecta en escala log. Cada bit adicional por elemento reduce la tasa de falsos positivos por un factor constante (concretamente, un factor de $0.6185$). La **línea verde discontinua** muestra qué pasa si fijas $k = 4$ en vez de elegirlo óptimamente: la curva ya no es una recta, porque para tamaños pequeños $k=4$ es demasiado (satura el array) y para tamaños grandes es demasiado poco (pocas oportunidades de descartar). La **línea gris discontinua** es el límite teórico inferior, o sea, lo que conseguiría una representación matemáticamente perfecta del conjunto.

La distancia vertical entre la curva naranja y la gris es exactamente $\log_2 e \approx 1.44$. Es decir, los filtros de Bloom están un factor constante por encima del óptimo teórico, y ese factor es la única ineficiencia que pagas por usar una estructura tan simple. No está nada mal para un diseño de cuatro páginas.

---

## 6. Counting Bloom Filters: permitiendo borrados

El filtro de Bloom original tiene una limitación incómoda: no puedes borrar elementos. Si intentas poner a 0 los bits de un elemento que quieres eliminar, corres el riesgo de dañar otros elementos que compartían algunos de esos bits.

En 2000, Fan, Cao, Almeida y Broder introdujeron los **counting Bloom filters** en el contexto de sistemas de caché compartida web. La idea es sencilla: en lugar de usar un solo bit por posición, usas un pequeño contador. Al insertar un elemento, incrementas los $k$ contadores. Al borrarlo, los decrementas. Un elemento se considera presente si todos sus contadores son $> 0$.

¿De qué tamaño deben ser los contadores? Los autores demostraron que **4 bits por contador** son suficientes para la práctica totalidad de los casos. La probabilidad de que algún contador supere el valor 16 (y por tanto desborde) es extremadamente baja: alrededor de $1.37 \times 10^{-15} \times m$ para una configuración típica. Es un coste pequeño a cambio de ganar la capacidad de borrar.

El peaje es obvio: cuatro veces más memoria. Por eso muchos sistemas mantienen dos filtros: un counting Bloom filter en memoria para gestionar el conjunto con inserciones y borrados, y un Bloom filter binario estándar que se reconstruye periódicamente para enviar por la red, donde el ahorro de espacio importa más.

---

## 7. Bigtable: donde los filtros de Bloom brillan de verdad

Si hay un sistema que hizo famosos los filtros de Bloom en el mundo de las bases de datos distribuidas, ese es **Bigtable**. Google publicó el paper en 2006 describiendo cómo habían diseñado un sistema de almacenamiento estructurado capaz de manejar petabytes de datos a través de miles de máquinas.

La estructura interna de Bigtable se basa en un patrón que hoy es omnipresente: el **LSM-Tree** (Log-Structured Merge Tree). Para cada *tablet* (partición de una tabla), Bigtable mantiene:

- Una **memtable**: un buffer ordenado en memoria donde van las escrituras recientes
- Un **commit log** para recuperación en caso de fallo
- Una serie de **SSTables**: ficheros inmutables y ordenados en disco, generados cuando la memtable se llena

Cuando llega una consulta de lectura, el servidor tiene que consultar la memtable y todas las SSTables relevantes para reconstruir el estado actual de la clave. Y aquí está el problema: si la clave que buscamos no existe, habremos hecho múltiples accesos a disco para descubrirlo.

Aquí es donde entran los filtros de Bloom. En el paper de Bigtable se describe con claridad la motivación: una operación de lectura tiene que consultar todas las SSTables que conforman el estado de un tablet, y reducen el número de accesos al disco permitiendo que los clientes especifiquen que se creen filtros de Bloom para las SSTables de un grupo de localidad determinado.

La idea es elegante: cada SSTable tiene asociado un pequeño filtro de Bloom que contiene todas sus claves. Antes de bajar al disco a buscar en esa SSTable, el servidor consulta el filtro. Si el filtro dice "no está", evitamos el acceso a disco completamente. Si dice "podría estar", hacemos la consulta real.

El impacto es enorme: la mayoría de lookups para claves inexistentes ya no necesitan tocar el disco. En una carga de trabajo típica de Bigtable, donde muchas consultas buscan claves que no existen (por ejemplo, al intentar añadir algo nuevo), esto se traduce en mejoras de rendimiento de órdenes de magnitud.

Cassandra, ScyllaDB, HBase, RocksDB y LevelDB, todos descendientes del diseño de Bigtable, mantienen esta misma optimización. Si alguna vez has lanzado una consulta a Cassandra y te ha respondido en microsegundos diciendo "esta clave no existe", le debes las gracias a Burton Bloom.

---

## 8. Aplicaciones en redes

El survey de Broder y Mitzenmacher de 2004 documenta docenas de usos de filtros de Bloom en problemas de red. Algunos de los más interesantes:

**Caché compartida web (Squid)**

Varios proxies cooperan compartiendo su contenido. En lugar de enviarse listas completas de URLs cacheadas (operación cara en red), cada proxy envía un filtro de Bloom que representa su contenido. Si necesitas saber si otro proxy tiene una página, consultas su filtro. Un falso positivo implica una petición fallida al proxy, un coste pequeño comparado con el ahorro de tráfico de actualización.

**Detección de loops en protocolos experimentales**

Whitaker y Wetherall propusieron incluir un pequeño filtro de Bloom en la cabecera de los paquetes. Cada router ORea su "máscara" con el filtro al reenviar el paquete. Si el filtro no cambia tras el OR, probablemente el paquete ya había pasado por ese router, lo que indica un forwarding loop.

**IP Traceback**

En lugar de que cada router almacene registros completos de los paquetes que procesa, almacena filtros de Bloom de los hashes de cada paquete. Cuando se necesita rastrear un paquete malicioso hacia atrás, se consulta a cada router si el filtro contiene ese paquete. Los falsos positivos generan ramificaciones en el camino reconstruido, pero con una tasa baja el resultado sigue siendo útil.

---

## 9. Por qué sigue importando esta idea

Lo más interesante del paper de Bloom no es el filtro en sí, aunque es una joya, sino el principio subyacente: hay situaciones donde renunciar a la precisión absoluta a cambio de un ahorro brutal de recursos es la decisión correcta.

Es un principio contraintuitivo en ingeniería de software, donde solemos asumir que "correcto" es mejor que "casi correcto". Pero en sistemas distribuidos a gran escala, ese "casi" puede marcar la diferencia entre un diseño que escala y uno que no. Un filtro de Bloom con un 1% de falsos positivos te ahorra el 99% de los accesos a disco innecesarios, y ese ahorro es la diferencia entre un sistema que responde en milisegundos y uno que responde en segundos.

La evolución de esta idea a lo largo de las décadas es fascinante:

1. **Bloom (1970)**: define la estructura básica para un problema de separación silábica.
2. **Databases (años 80-90)**: se adopta para semi-joins distribuidos y ficheros diferenciales.
3. **Squid (1998)**: lo lleva al mundo de los caches web compartidos.
4. **Bigtable (2006)**: lo convierte en pieza fundamental de los LSM-Trees.
5. **P2P y blockchains**: se usa para propagación de transacciones, lookups distribuidos y reducción de tráfico.

Todo esto a partir de un paper de cuatro páginas escrito hace más de medio siglo, con una única idea central: **a veces, equivocarse un poco es lo más inteligente que puedes hacer**.

---

## Referencias

- Bloom, B. H. (1970). *Space/Time Trade-offs in Hash Coding with Allowable Errors*. Communications of the ACM, 13(7), 422-426.
- Chang, F., et al. (2006). *Bigtable: A Distributed Storage System for Structured Data*. OSDI '06.
- Broder, A., & Mitzenmacher, M. (2004). *Network Applications of Bloom Filters: A Survey*. Internet Mathematics, 1(4), 485-509.
- Fan, L., Cao, P., Almeida, J., & Broder, A. Z. (2000). *Summary Cache: A Scalable Wide-Area Web Cache Sharing Protocol*. IEEE/ACM Transactions on Networking.
