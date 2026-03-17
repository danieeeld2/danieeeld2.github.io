---
title: "The Algorithm of Discord: Consistent Hashing"
date: "2026-03-20"
description: "From an MIT paper in 1997 to serving trillions of messages at Discord. How a hash function solved the problem of scaling distributed systems."
tags: ["distributed systems", "papers", "algorithms"]
lang: "en"
---

# The Algorithm of Discord: Consistent Hashing

Imagine you have 100 servers and one of them is running at 99% CPU while the rest sit at 5%. Your system is only as fast as that single saturated server. This problem — **hot spots** — is what motivated David Karger and his team at MIT to publish a paper in 1997 that would change the way we design distributed systems.

In this post I walk through the history of an idea that was born to distribute web caches and ended up becoming a fundamental building block of Amazon Dynamo, Discord, and virtually every modern distributed database. The interesting part is how theory clashed with practice — and how practice refined the theory.

---

## 1. The problem: distributing data without blowing everything up

Suppose we have a set of data (web pages, messages, shopping cart items) and $n$ cache servers to serve them. The most intuitive solution is a classic hash function:

$$\text{server}(k) = h(k) \mod n$$

Works perfectly... as long as $n$ doesn't change. The moment you add or remove a server, the modulo changes and **virtually all keys get remapped**. If you had 10 servers and move to 11, the fraction of keys that keep their server is minimal. The entire cache is invalidated at once.

Karger's paper posed a concrete question: can we design a hash function that **changes minimally** when the number of servers changes?

---

## 2. The ring idea

Karger's construction is elegant. Instead of mapping keys to servers with a modulo, we map **everything** — keys and servers — onto the same circular space:

1. Take the output range of your hash function and treat it as a **ring** (the highest value wraps around to the lowest).
2. Each server is placed at a random position on the ring via $h(\text{server})$.
3. Each key is also placed on the ring via $h(\text{key})$.
4. The key is assigned to the **first server you encounter going clockwise**.

What happens when a server goes down or a new one is added? Only the keys that were assigned to the immediately following server are affected. The rest of the ring doesn't notice. That's the magic: **local changes produce local effects**.

---

## 3. The formal properties

Karger didn't just propose the ring: he formalized what it means for a hash function to be "consistent." To do this he introduced **ranged hash functions** — functions of the form $f: 2^B \times I \to B$, where $B$ is the set of buckets (servers), $I$ the set of items (keys), and $2^B$ represents the different **views** a client can have of the system.

The notion of "view" matters: on the Internet, not all clients know about all servers. Some might see 8 out of 10, others 9 out of 10. Consistent hashing works even with these inconsistencies.

The properties that define consistency are:

**Smoothness:** When a server is added or removed, the fraction of keys that must be relocated is the minimum necessary to maintain balance. If you go from $n$ to $n+1$ servers, only $\approx 1/(n+1)$ of the data should move.

**Balance:** For a fixed view $V$, the probability that an item lands in a specific bucket is:

$$\Pr[f_V(i) = b] \leq \frac{O(1)}{|V|}$$

In other words, items are distributed uniformly across the visible servers.

**Spread ($\sigma$):** Given $V$ distinct views (each containing at least a fraction $1/t$ of the total servers), the number of distinct servers to which an item $i$ can be assigned across all views is $\sigma(i) = O(t \log C)$, where $C$ is the total number of servers.

**Load ($\lambda$):** Symmetrically, the number of distinct items assigned to a specific server across all views is $\lambda(b) = O(t \log C)$.

The intuition behind spread and load is practical: even if clients have partial, inconsistent information about which servers exist, an item doesn't end up spread across too many places (low spread → little wasted memory) and no server gets assigned a ridiculous amount of data (low load → no hot spots).

---

## 4. The construction: points on the unit interval

How is this implemented in practice? Karger proposes two random functions: $r_B$ that maps servers to the interval $[0, 1]$ and $r_I$ that does the same for items. Item $i$ is assigned to server $b \in V$ that minimizes $|r_B(b) - r_I(i)|$ — in other words, the "closest" server on the interval.

But a single point per server produces a very uneven distribution. The solution is to use **$\kappa \log C$ points per server** (virtual replicas on the interval). Karger proves that with this multiplication, the resulting function family is monotone, balanced, and has logarithmic spread and load.

Monotonicity makes intuitive sense: when you add a new server, it only "captures" the items that are now closer to one of its points. No item moves between old servers.

### Try it yourself

Add and remove nodes from the ring and observe how keys are redistributed. Compare with classic modular hashing to see the difference in the number of reassignments.

<ConsistentHashPlayground client:load />

---

## 5. Amazon Dynamo: theory meets reality

In 2007, Amazon published the Dynamo paper, a highly available key-value store that used consistent hashing as the basis for its partitioning. The system stores objects associated with a key and exposes two operations: `get(key)` and `put(key, context, object)`. Each key is hashed with MD5 to determine its position on the ring.

Karger's promise looks great on paper, but Amazon discovered that **the first strategy didn't quite work in production**.

### The imbalance problem

Dynamo started with Strategy 1: each node is assigned $T$ random tokens on the ring. The resulting partitions are unequal in size because the tokens are chosen at random. This caused two serious problems:

- **Painfully slow bootstrapping:** When a new node joins the system, it has to scan other nodes' databases to find which keys to "steal." During peak shopping season, this could take an entire day.
- **Complicated backups:** Since the ranges are random, you can't simply copy fixed-size files to an external system.

But the most revealing finding was the **load paradox**. Amazon measured how many nodes were "out of balance" (with traffic deviating more than 15% from the average) throughout the day. With heavy traffic, popular keys were well distributed and the imbalance dropped to ~10%. But with low traffic, a few keys dominated and the node holding them became much more saturated than the rest — the imbalance rose to ~20%.

### The evolution through three strategies

Amazon tried three approaches to partitioning:

| Strategy | How it divides the ring | Advantage | Problem |
|---|---|---|---|
| **1.** Random tokens | Unequal-sized ranges | Follows Karger's theory | Very slow to add nodes, hard to backup |
| **2.** Fixed partitions + tokens | Ring split into $Q$ equal pieces, tokens only for assignment | Separates partitioning from placement | Worse balancing efficiency |
| **3.** Fixed partitions, $Q/S$ tokens per node | $Q$ equal pieces, each node gets $Q/S$ | Perfect balance, fast management | Requires coordination on join/leave |

Amazon chose the **third strategy** for concrete operational reasons: fixed-size partitions can be stored as separate files, making bootstrapping as simple as transferring a file instead of scanning a database. And backups are reduced to copying fixed-size files to S3.

The lesson is powerful: **the mathematical elegance of Strategy 1 clashed with operational efficiency**. Theory tells you that random tokens give good probabilistic guarantees; practice tells you that an operator at 3 AM needs to be able to move files, not solve equations.

### Virtual nodes and replication

Dynamo also popularized the concept of **virtual nodes**: each physical node is mapped to multiple positions on the ring. If a node goes down, its load is spread across the rest (because its virtual tokens are distributed around the ring). When it comes back, it recovers a similar amount of load from each node. And if a server has more capacity, it gets assigned more virtual nodes.

For replication, each key is stored on the first $N$ *distinct physical nodes* clockwise from its position. Dynamo configures three fundamental parameters:

- **$N$**: number of replicas for each piece of data.
- **$W$**: number of nodes that must acknowledge a write.
- **$R$**: number of nodes that must respond to a read.

If $R + W > N$, it's (theoretically) guaranteed that there's always overlap between the nodes that write and those that read, ensuring you read the latest version. The typical production configuration was $(N, R, W) = (3, 2, 2)$.

### Vector clocks: the genealogy tree of data

One aspect that doesn't come from consistent hashing but completes the Dynamo story is how it handles conflicts. In a system where you prioritize availability over consistency (following the CAP theorem), multiple nodes can write different versions of the same data simultaneously.

Dynamo uses **vector clocks** — lists of (node, counter) pairs — as "genealogical stamps." If a piece of data has the vector $[(S_x, 2), (S_y, 1)]$ and another has $[(S_x, 2), (S_z, 1)]$, the system knows neither descends from the other (they're "cousins"), keeps both versions, and lets the application decide how to merge them.

---

## 6. Jump Consistent Hash: 5 lines that break the ring

In 2014, John Lamping and Eric Veach at Google published a paper with a radically different approach. Instead of using a ring and searching for positions, Jump Consistent Hash uses a hash function that determines **when a key should jump** from one node to another as the number of nodes increases.

The idea is probabilistic: if you have $n$ buckets and add one more, each key should stay where it is with probability $n/(n+1)$ and jump to the new bucket with probability $1/(n+1)$. If you generate a pseudorandom number $r \in [0, 1)$ with the key as seed, the next jump destination is:

$$j = \lfloor (b + 1) / r \rfloor$$

This lets you jump directly to the next change without traversing all intermediate buckets, yielding $O(\log n)$ complexity. The complete C++ code fits in 5 lines:

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

Enter a key and a number of buckets to see the algorithm step by step. Notice how `j` grows exponentially — with 1000 buckets it only needs ~7 jumps.

<JumpHashStepper client:load />

### What do you gain and what do you lose?

| | Karger (ring) | Jump Consistent Hash |
|---|---|---|
| **Memory** | $O(n \cdot \kappa \log n)$ — thousands of bytes per server | $O(1)$ — you only need to know the total number of nodes |
| **Speed** | $O(\log n)$ but with cache misses on large structures | $O(\log n)$ purely arithmetic, 3-8x faster |
| **Balance** | Standard deviation ~3.2% with 1000 points/bucket | Practically perfect (std error ~$10^{-8}$) |
| **Flexibility** | Nodes with arbitrary IDs, can be added/removed freely | Sequentially numbered nodes, you can't remove one from the middle |

Jump Hash's limitation is clear: nodes must be numbered $[0, n)$. You can't simply remove node 7 out of 15 — you'd have to renumber. This makes it ideal for **data sharding** (where shards are managed as an ordered set) but less so for **web caching** (where servers come and go arbitrarily).

It's an elegant tradeoff: by restricting the model, you get better guarantees with fewer resources.

---

## 7. Discord: consistent hashing in the trenches

In 2023, Discord published how they store trillions of messages. Their architecture is a perfect case study of consistent hashing applied at massive scale.

Messages are partitioned by `(channel_id, bucket)`, where bucket is a fixed time window. The classic hot spot problem appears when a large server with thousands of active users generates heavy traffic on a single partition — exactly the scenario Karger was describing in 1997.

Discord introduced an intermediary layer they call **data services**, written in Rust, that sit between their API and the database. The key piece is **request coalescing**: if 1000 users request the same message at the same time, only one database query is made. The first request spins up a worker task; subsequent requests subscribe to that task and receive the result when it arrives.

And how do they ensure that requests for the same channel reach the same service instance? **Consistent hashing as routing**. The `channel_id` is used as a routing key, so all requests for a channel go to the same data service instance. This maximizes coalescing: if channel requests were distributed randomly across instances, each one would make its own database query.

The result: they went from 177 Cassandra nodes with p99 latencies of 40-125ms to 72 ScyllaDB nodes with a steady 15ms p99. And during the 2022 World Cup Final, with massive message spikes on every goal, the system didn't even flinch.

---

## 8. Conclusion

What interests me most about this story isn't any single algorithm, but the **evolution of an idea over 30 years**:

1. **Karger (1997)** defines the theoretical framework and formal properties. Mathematically elegant but operationally complex.
2. **Amazon (2007)** takes it to production and discovers that mathematical elegance doesn't always survive contact with reality. Random partitions look great in the paper but are an operational nightmare at 3 AM.
3. **Google (2014)** radically simplifies the problem by restricting the model. If you don't need arbitrary IDs, you can solve it with pure arithmetic in 5 lines.
4. **Discord (2023)** shows that consistent hashing isn't just for partitioning data — it's a routing tool that, combined with coalescing, turns a hot spot problem into a system that handles trillions of messages.

The underlying lesson is that in distributed systems, the "best" algorithm doesn't exist in the abstract. What exists is the right algorithm for your operational model, your practical constraints, and what your on-call team is capable of debugging at 3 in the morning.

---

## References

- Karger, D., Lehman, E., Leighton, T., Panigrahy, R., Levine, M., & Lewin, D. (1997). *Consistent Hashing and Random Trees: Distributed Caching Protocols for Relieving Hot Spots on the World Wide Web*. STOC '97.
- DeCandia, G., et al. (2007). *Dynamo: Amazon's Highly Available Key-value Store*. SOSP '07.
- Lamping, J. & Veach, E. (2014). *A Fast, Minimal Memory, Consistent Hash Algorithm*. Google.
- Ingram, B. (2023). *How Discord Stores Trillions of Messages*. Discord Engineering Blog.
