---
title: "En busca del consenso: Desgranando el algoritmo Raft"
date: "2026-02-25"
description: "Análisis técnico del paper de Ongaro y Ousterhout sobre cómo lograr consenso en sistemas distribuidos de forma entendible."
tags: ["sistemas distribuidos", "papers"]
lang: "es"
---

# En busca del consenso: Desgranando el algoritmo Raft

Si trabajas en infraestructura de datos, habrás oído hablar de **etcd**, **Consul** o las nuevas versiones de **Kafka (KRaft)**. Todos tienen algo en común: necesitan que varios nodos se pongan de acuerdo en un mundo donde las redes fallan.

Este post recoge mis notas sobre el paper *"In Search of an Understandable Consensus Algorithm"* de Diego Ongaro y John Ousterhout — el texto que consiguió que el consenso distribuido dejara de ser territorio exclusivo de los expertos en Paxos.

## Los cimientos: SMR y la fuerza del quórum

Para que un cluster de servidores se comporte como una única máquina fiable, Raft se apoya en la **Replicación de Máquinas de Estados (SMR)**. La idea es elegante: si todos los nodos parten del mismo estado y aplican la misma secuencia de comandos (el *log*), el resultado final será idéntico.

![Replicación de Máquinas de Estados](/images/blog/raft/raft-smr.png)

Pero, ¿cómo garantizamos que todos vean el mismo orden en un entorno asíncrono? Aquí entra la matemática del **quórum**. Para tomar cualquier decisión, Raft exige el voto de la mayoría absoluta de los nodos ($n$):

$$V > \frac{n}{2}$$

Esta propiedad garantiza que dos conjuntos de mayorías siempre compartan al menos un nodo en común — un "testigo" que impide que el sistema se bifurque en decisiones contradictorias.

## El modelo de estados

Raft simplifica el problema descomponiéndolo en tres estados posibles para cualquier nodo, formando una máquina de estados finitos con transiciones claras:

- **Follower (Seguidor):** Estado pasivo. Solo responde a peticiones del líder o de los candidatos.
- **Candidate (Candidato):** Estado intermedio. Un seguidor cuyo timeout expira y busca convertirse en líder.
- **Leader (Líder):** El coordinador del cluster. Gestiona las peticiones de clientes y coordina la replicación del log.

![Transiciones de estado en Raft](/images/blog/raft/raft-states.png)

El tiempo se divide en **terms (mandatos)**, que actúan como un reloj lógico incremental ($t = 1, t = 2, \dots$). Si un nodo detecta que su número de mandato es inferior al de otro, se actualiza inmediatamente.

![División del tiempo en terms](/images/blog/raft/raft-terms.png)

## Leader election: ¿quién manda aquí?

El proceso de elección es el mecanismo central de disponibilidad en Raft. Se basa en una señal de "latido" (*heartbeat*). Si un seguidor deja de recibir señales del líder durante un periodo configurable, asume que el líder ha caído y:

1. Incrementa su `currentTerm`.
2. Transiciona a estado **Candidate**.
3. Solicita votos a los demás nodos mediante la RPC `RequestVote`.

### El problema de la división de votos

Si muchos nodos transicionan a candidatos simultáneamente, los votos pueden fragmentarse de forma que nadie alcance el quórum. Raft resuelve esto con una solución simple pero efectiva: **timeouts aleatorios**.

Al asignar a cada nodo un tiempo de espera aleatorio (típicamente entre 150ms y 300ms), es muy probable que uno se "despierte" antes, solicite los votos y gane la elección antes de que el resto se convierta en competencia. Sencillo y robusto.

## Log replication: la persistencia del dato

Una vez elegido el líder, su función es aceptar comandos de clientes y replicarlos. Aquí entra la **Log Matching Property**, una garantía de seguridad basada en inducción:

Si dos entradas en logs diferentes comparten el mismo índice y mandato, entonces contienen el mismo comando **y** todas las entradas anteriores son idénticas.

Esto asegura que, una vez el líder confirma que una entrada ha sido replicada en un quórum de nodos, se considera **committed**:

$$\text{entry} \in \text{committed} \implies \text{entry} \in \text{log de todos los futuros líderes}$$

## Conclusión

Lo que más me interesa de Raft no es su eficiencia (que es razonable), sino su **diseño orientado a la comprensión**. Al separar elección del líder, replicación de logs y seguridad en subproblemas independientes, permite razonar sobre cada parte sin tener que mantener todo el sistema en la cabeza a la vez.

Si te interesa el tema, el [paper original](https://raft.github.io/raft.pdf) es sorprendentemente legible, y la [visualización interactiva de Raft](https://raft.github.io/) es una herramienta excelente para entender las transiciones de estado en acción.
