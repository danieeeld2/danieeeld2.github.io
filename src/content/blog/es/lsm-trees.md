---
title: "LSM-Trees: cómo dejar de pelearse con el disco"
date: "2026-05-12"
description: "Por qué un B-Tree paga 2 I/Os por inserción y cómo el paper de O'Neil et al. (1996) inventó una estructura que escribe en batch. Del rolling merge a Bigtable, pasando por los filtros de Bloom."
tags: ["distributed systems", "databases", "papers", "data structures"]
lang: "es"
---

En 1996, Patrick O'Neil, Edward Cheng, Dieter Gawlick y Elizabeth O'Neil publicaron un paper titulado *The Log-Structured Merge-Tree (LSM-Tree)*. La motivación era prosaica: sistemas transaccionales que insertaban millones de registros de log por día y necesitaban mantener un índice consultable en tiempo real. La estructura estándar de la época, el B-Tree, hacía que el coste de mantener ese índice se llevara más de la mitad del presupuesto de I/O del sistema.

Diez años más tarde, ese mismo diseño aparece en el corazón de Bigtable (Google, 2006) y desde entonces en Cassandra, ScyllaDB, RocksDB, LevelDB, HBase, ClickHouse y básicamente cualquier base de datos pensada para *write-heavy workloads*. Este post va sobre por qué funciona.

## 1. El B-Tree y el archivero de oficina

Un B-Tree es un árbol balanceado donde cada nodo puede tener muchos hijos. Los nodos internos guardan rangos de claves para guiar la búsqueda y las hojas guardan los datos. Su gran virtud es la altura: con factor de ramificación $b$ y $n$ claves, la altura es $\log_b(n)$, así que una búsqueda toca poquísimos nodos.

El problema no es la lectura sino la inserción. Para insertar una sola clave, se requiere:

1. Bajar por el árbol leyendo nodos del disco hasta la hoja correspondiente.
2. Cargar la página en RAM, añadir la clave, reescribir la página completa en disco.
3. Si la página está llena, dividirla y propagar el split hacia arriba.

Cuando $n$ se hace grande y los nodos internos caben en caché, el coste amortizado de una inserción es aproximadamente **2 I/Os**: una lectura de la hoja y una escritura de la hoja. Y son **I/Os aleatorios**: cada clave nueva puede caer en cualquier parte del árbol.

Imagina un archivo de oficina perfectamente ordenado por fechas. Localizar un documento es inmediato: vas al cajón exacto y lo extraes. Pero ahora, imagina que recibes mil documentos nuevos por segundo en orden aleatorio. Por cada uno, debes abrir un cajón distinto, buscar el hueco preciso entre dos papeles, insertarlo y cerrar. El tiempo no se pierde leyendo la información, se agota abriendo y cerrando cajones.

Esa es la realidad de un B-Tree bajo una carga de escritura intensa: el esfuerzo de mantener el orden supera al valor de la inserción misma.

## 2. La Five Minute Rule

El paper original se apoya en una observación que en 1987 hicieron Jim Gray y Franco Putzolu: si accedes a un dato más de una vez cada cinco minutos, sale más rentable mantenerlo en RAM que pagar el coste de leerlo del disco cada vez. Si lo accedes menos, sale más barato dejarlo en disco. Es la regla que sigue dictando, casi cuatro décadas después, cómo dimensionar caches y memtables.

**¿De dónde sale ese coste de leer del disco?** En 1996, los discos eran mecánicos: un brazo físico se movía hasta la pista correcta, esperaba a que el plato girara hasta el sector buscado, y entonces leía. Cada lectura aleatoria implicaba latencia mecánica del orden de milisegundos. Una lectura secuencial (el siguiente sector después del actual) era órdenes de magnitud más barata porque el brazo ya estaba en su sitio.

Hoy usamos SSDs y NVMe. El brazo ya no existe. Pero la asimetría sobrevive en otra forma:

- En cloud (AWS, Azure, GCP) **te cobran por cada operación de I/O**. Un I/O aleatorio cuesta literalmente lo mismo que uno secuencial, pero un I/O secuencial puede transferir un bloque entero por el mismo precio. Pagas por petición, no por byte.
- Los SSDs siguen prefiriendo escrituras secuenciales por cómo funciona el *garbage collection* interno y el *wear leveling*.
- La RAM sigue siendo dos a tres órdenes de magnitud más rápida que el almacenamiento persistente.

El paper formaliza este coste con dos parámetros: $\text{COST}_\pi$, el coste de un I/O aleatorio (random page access), y $\text{COST}_P$, el coste de un I/O como parte de una transferencia secuencial. La ratio $\text{COST}_\pi / \text{COST}_P$ es la palanca económica de todo el diseño.

## 3. El algoritmo de dos componentes

La idea central del LSM-Tree es brutalmente simple: **no escribas al disco una clave a la vez. Acumula muchas en memoria y bájalas todas juntas en una escritura secuencial.**

En su forma básica, un LSM-Tree tiene dos componentes:

- $C_0$: un árbol pequeño que vive enteramente en RAM.
- $C_1$: un árbol grande que vive en disco.

Cuando llega un registro nuevo (o un cambio sobre un registro existente), se escribe primero en un log secuencial (el WAL, que veremos después) y luego se inserta en $C_0$. Esa inserción es instantánea: nada toca el disco salvo el log, que como es append-only no paga seek time.

Como $C_0$ vive en RAM, podemos usar la estructura que mejor funcione ahí. El paper recomienda no replicar B-Trees en memoria, porque el motivo para usarlos (páginas grandes para minimizar el movimiento del brazo) no es útil en este caso. En su lugar se pueden usar árboles AVL, árboles 2-3, skip lists, o cualquier estructura balanceada que sea eficiente en CPU. La intuición:

> $C_0$ es la cocina pequeñita: tienes todo a mano y te mueves rápido.
> $C_1$ es el almacén grande: tardas más en ir y volver, así que cuando vas, llevas mucho de una vez.

Cuando $C_0$ alcanza un umbral de tamaño, se activa el **rolling merge**. Una porción contigua de $C_0$ se baja a $C_1$ fusionándose ordenadamente con las páginas correspondientes. Como ambos están ordenados por clave, el merge es un *merge sort* clásico: leer una página de $C_1$, intercalar las claves de $C_0$ que caen en su rango, escribir una página nueva. Las páginas antiguas no se sobreescriben (se escriben en una zona nueva del disco), lo que permite recuperación ante fallos.

<LSMVisualizer client:load />

Lo interesante de este esquema, contado en coste:

| Operación | B-Tree | LSM-Tree |
|---|---|---|
| Insertar 1 clave en disco | 2 I/Os (read+write hoja) | $\approx 2/M$ I/Os (M claves por página) |
| Tipo de I/O | Aleatorio ($\text{COST}_\pi$) | Secuencial ($\text{COST}_P$) |

Esa $M$ es el **factor de batching**. Si tu página tiene espacio para 40 claves y la memtable acumula 40000 claves antes de bajar, cada flush baja a disco páginas llenas, no páginas con una clave nueva y 39 huecos. Comparado con el B-Tree, ahorras un factor de $M$ en número de I/Os. Y encima los que haces son secuenciales, no aleatorios. El ahorro real es $M \cdot \text{COST}_\pi / \text{COST}_P$, que en discos de la época era trivialmente $>1000$.

## 4. Cascada a múltiples niveles

El paper generaliza inmediatamente la idea a más de dos niveles. Cuando $C_1$ se hace grande, el merge $C_0 \rightarrow C_1$ vuelve a ser caro (porque las páginas de $C_1$ son muchas). La solución es introducir niveles intermedios: $C_0$ vuelca a $C_1$, que vuelca a $C_2$, que vuelca a $C_3$, y así sucesivamente.

![Cascada de niveles del LSM-Tree, desde C₀ en RAM hasta C₃ en disco, con cada nivel aproximadamente 10× más grande que el anterior](/images/blog/lsm-cascade.svg)

Cada nivel es típicamente entre 10 y 100 veces más grande que el anterior. La ratio entre niveles se llama *size ratio* o *fanout*, y aparece bautizada de muchas formas en los descendientes modernos del paper (en LevelDB y RocksDB es el parámetro `max_bytes_for_level_multiplier`, por defecto 10).

Esa multiplicidad geométrica significa que en la práctica raramente vemos más de 5 o 6 niveles, incluso con datasets de terabytes. La altura del LSM es $\log_T(N)$ donde $T$ es el size ratio, igual de manejable que un B-Tree.

## 5. El precio de todo esto: las lecturas

El punto débil del LSM es la lectura. En un B-Tree, una clave está en exactamente un sitio. En un LSM, una clave puede estar en cualquiera de los niveles. Para hacer un *point lookup*, hay que mirar $C_0$, luego $C_1$, luego $C_2$, etc., hasta encontrarla.

Esto añade dos overheads:

- **CPU overhead** por recorrer múltiples estructuras de índice.
- **I/O overhead** si los niveles inferiores están en disco y la clave no está en los superiores.

El paper propone tres mecanismos para amortiguar este coste:

**Terminación temprana con valores únicos.** Si las claves son únicas por construcción (por ejemplo, un ID autoincremental o un timestamp), la primera coincidencia es la única. En cuanto encuentras la clave en $C_0$ o $C_1$, paras. No hace falta seguir bajando.

**Localidad temporal.** En la mayoría de sistemas, los datos consultados con más frecuencia son los más recientes. Los datos recientes están en $C_0$ o $C_1$. La distribución de carga lectura sigue la pirámide invertida del LSM, lo cual juega a favor.

**Parámetro T (retención forzada).** Se puede decidir mantener ciertas entradas en un nivel superior durante $T$ segundos, retrasando su descenso. Funciona como una caché inteligente. Útil para *hot keys*.

El paper menciona explícitamente que buscar en varios niveles **es un problema** y deja la cuestión abierta. La solución llegó una década después: **filtros de Bloom**. Volveré sobre esto al final.

<LSMBenchmark client:load />

## 6. Borrados, updates y latencia diferida

Una pregunta natural: si todo es escrituras secuenciales acumuladas, ¿cómo se borra una clave?

**Tombstones.** En lugar de ir al disco a buscar el dato para borrarlo, el LSM inserta una *nota de borrado* en $C_0$. Es una entrada normal, con la clave del dato a eliminar y una marca de tombstone. Si alguien busca esa clave antes de la próxima fusión, el sistema ve el tombstone primero (está en $C_0$) y responde "no existe". Cuando el merge llega al nivel donde vivía el dato original, simplemente lo descarta y no lo escribe en la versión nueva. El borrado real ocurre como parte del mantenimiento normal, sin coste extra.

**Updates.** Mismo truco: para cambiar el valor de una clave, se inserta un tombstone para el valor viejo y una entrada con el valor nuevo. Como ambas son escrituras secuenciales en memoria, el update es instantáneo desde el punto de vista del usuario. La limpieza real ocurre al fusionar.

**Predicate deletion.** A veces no quieres borrar un registro concreto sino un conjunto: "todo lo que tenga más de 20 días". El LSM lo soporta como una orden persistente al proceso de merge. Cuando el merge pasa por datos viejos en el nivel más grande, los que matchean el predicado simplemente se ignoran y no se reescriben. Es un borrado "gratis" que ocurre durante el mantenimiento.

**Long-latency search.** Esta es la idea más curiosa del paper, y casi no se usa hoy. Si tienes una consulta que no es urgente (un reporte nocturno, un cálculo offline), en lugar de forzar al disco a buscar, **insertas una nota de búsqueda en $C_0$**. Esa nota viaja con los merges y va recogiendo datos a medida que los encuentra. La consulta termina cuando la nota llega al fondo. Aprovechas el movimiento natural de claves que ya estaba ocurriendo. Es genial pero un poco demasiado específico de su época.

## 7. Concurrencia y recuperación

Hasta aquí el algoritmo. La parte de ingeniería seria viene cuando varios usuarios leen y escriben mientras los merges están en curso y, encima, el servidor puede apagarse en cualquier momento.

**Bloqueo a nivel de nodo (no a nivel de árbol).** Cuando un merge está reescribiendo una página, solo esa página se bloquea, no el árbol entero. Los lectores pueden seguir trabajando en cualquier otra parte. Esto es viable porque el LSM nunca reescribe páginas en sitio: las páginas nuevas se escriben en zonas nuevas del disco, y los lectores siguen viendo la versión antigua hasta que se actualizan los punteros.

**Filling y emptying.** Mientras una página vieja se está "vaciando" (sus claves migran a un nivel inferior), otra página nueva se está "llenando" en memoria con el resultado del merge. Los lectores pueden consultar ambas durante la transición. El sistema nunca queda detenido por un merge.

**Cursores múltiples.** Como hay varios niveles, hay varios merges activos simultáneamente: uno entre $C_0$ y $C_1$, otro entre $C_1$ y $C_2$, etc. Cada uno avanza a su ritmo: el cursor entre niveles pequeños se mueve más rápido que el de niveles grandes. El paper deja claro que el ratio de avance no es problema mientras el sistema no esté permanentemente saturado.

**Write-Ahead Log + checkpoints.** El paper de 1996 no usa el término moderno *WAL*, pero describe exactamente eso: antes de modificar $C_0$ en memoria, se anota la operación en un archivo de log secuencial en disco. Cada cierto tiempo el sistema hace un **checkpoint**: escribe el estado actual de $C_0$ a un sitio conocido del disco, guarda dónde van los cursores de merge, y registra el *log sequence number* (LSN) del último registro procesado. Si hay un crash, el sistema recupera el último checkpoint y reproduce el log desde ese punto. La inmutabilidad del resto del árbol garantiza que nada esté corrupto.

## 8. La magia: inmutabilidad

Aquí el paper menciona algo casi de pasada que con los años se ha vuelto un pilar en ingeniería de datos: **nada se sobreescribe nunca**. Cada página nueva se escribe en una zona nueva del disco. Las páginas antiguas siguen siendo válidas hasta que un proceso de limpieza decida que ya nadie las necesita.

Esto es lo que hoy llamamos **inmutabilidad**, y tiene consecuencias profundas:

1. **Robustez ante fallos.** Si el proceso muere a mitad de un merge, la versión vieja del dato sigue intacta. No hay corrupción posible por escrituras parciales.
2. **Snapshots y MVCC casi gratis.** Si las páginas viejas se conservan un rato, puedes leer estados pasados de la base de datos sin coste adicional. PostgreSQL implementa MVCC con un mecanismo parecido (aunque distinto).
3. **Replicación más fácil.** Para replicar un LSM solo hace falta enviar los archivos nuevos. No hay que sincronizar mutaciones in-place.
4. **Compresión y encriptación a nivel de bloque.** Como las páginas son inmutables una vez escritas, se pueden comprimir agresivamente.

Toda la arquitectura de Cassandra y RocksDB (los *SSTables*, *Sorted String Tables*) se apoya en esta propiedad. Cada SSTable es un archivo inmutable en disco, ordenado por clave. Las escrituras nuevas crean SSTables nuevas. La compactación periódica fusiona varias SSTables en una más grande, idéntica al rolling merge.

## 9. La conexión con Bigtable y los filtros de Bloom

El paper original deja un problema abierto: **¿cómo evitar leer todos los niveles para una clave que no existe?** Si buscas una clave que no está, en el peor caso tienes que mirar $C_0$, $C_1$, $C_2$, ..., $C_K$, y solo al final concluyes que efectivamente no estaba.

En 1996 no había una buena respuesta. Pero diez años después, en 2006, Bigtable de Google ([Chang et al.](https://research.google/pubs/bigtable-a-distributed-storage-system-for-structured-data/)) cogió el LSM-Tree y le añadió una pieza extra a cada nivel: un **filtro de Bloom**.

Un filtro de Bloom es una estructura probabilística que responde *"¿está esta clave aquí?"* con dos posibles respuestas: *"definitivamente no"* (con certeza absoluta) o *"probablemente sí"* (con un margen de error controlable). Es exactamente lo que el LSM necesitaba.

Antes de leer un nivel del disco para buscar una clave, consultas su filtro de Bloom (que vive en RAM). Si el filtro dice *no*, te ahorras la lectura. Si dice *sí*, lees, y de vez en cuando es un falso positivo, pero el grueso de las consultas a claves inexistentes se cortan en RAM.

La idea estaba publicada desde 1970, en un paper de cuatro páginas de Burton Bloom. Lo escribí hace poco en [otro post sobre filtros de Bloom](/es/blog/filtros-de-bloom/) con todos los detalles: por qué $k = (m/n) \ln 2$ es el número óptimo de funciones hash, cómo se calculan los falsos positivos, qué memoria necesitas por elemento. Lo curioso es que cuando O'Neil et al. escribieron el LSM en 1996, el filtro de Bloom existía desde hacía 26 años. Pero la combinación no se hizo hasta 2006, con Bigtable.

A veces las ideas potentes están separadas por décadas hasta que alguien las junta. El LSM-Tree resolvía el problema de escrituras, el filtro de Bloom resolvía el problema de lecturas. Bigtable las casó y nació la familia de bases de datos que dominan hoy el almacenamiento distribuido.

## 10. Referencias y lecturas

- O'Neil, P., Cheng, E., Gawlick, D., & O'Neil, E. (1996). *The Log-Structured Merge-Tree (LSM-Tree)*. Acta Informatica, 33(4), 351-385.
- Chang, F., et al. (2006). *Bigtable: A Distributed Storage System for Structured Data*. OSDI '06.
- Gray, J., & Putzolu, F. (1987). *The 5 Minute Rule for Trading Memory for Disc Accesses*. SIGMOD Record, 16(3).
- Bloom, B. H. (1970). *Space/Time Trade-offs in Hash Coding with Allowable Errors*. CACM 13(7).
- Para una visión moderna del trade-off entre lectura, escritura y espacio en LSMs, recomiendo el survey de Luo & Carey (2020), *LSM-based Storage Techniques: A Survey*, VLDBJ.
