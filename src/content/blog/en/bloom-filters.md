---
title: "Bloom Filters: When Being a Little Wrong Is the Best Option"
date: "2026-04-09"
description: "From a 1970 paper to a fundamental piece of Bigtable, Cassandra and LSM-Trees. The story of a data structure that accepts errors to save space."
tags: ["distributed systems", "algorithms", "papers"]
lang: "en"
---

In 1970, Burton Bloom published a four-page paper with an unassuming title: *"Space/Time Trade-offs in Hash Coding with Allowable Errors"*. The core idea was surprisingly simple and, at the same time, heretical by the standards of the time: what if we give up absolute precision in exchange for using drastically less memory?

Fifty-five years later, that idea is still alive in Bigtable, Cassandra, ScyllaDB, Redis, web browsers, and virtually every distributed system you're near. This post tells how an "imperfect" data structure ended up becoming a fundamental building block of modern infrastructure.

---

## 1. The problem: is this in my set?

Imagine you have a database with millions of keys spread across disk. A query comes in asking for a specific key. Before going down to disk to look for it, an expensive operation in terms of I/O, you'd like to be able to answer quickly: *is it worth searching, or is it definitely not there?*

The most intuitive solution is to keep an in-memory index with all keys. It works, but scales badly: if you have a billion keys, your "fast index" becomes yet another memory problem.

Bloom proposed a radically different approach in his paper, originally aimed at a very specific problem: **hyphenation programs**. Most English words can be hyphenated by applying a few simple rules. But roughly 10% require dictionary lookup. That dictionary didn't fit in memory on 1970s computers, so each word in the minority 10% meant a slow disk access.

Bloom's question: what if we accept that, occasionally, a word from the 90% gets wrongly identified as belonging to the 10%? In that case, we'd make an unnecessary disk query (a small cost) but in exchange, the "10% suspect index" would fit in memory.

---

## 2. The two methods in the original paper

Bloom presented two approaches in the paper, and it's worth understanding both because they reveal where the intuition came from.

**Method 1. Codes shorter than the message**

The first idea is a natural extension of classic hashing. Instead of storing each complete message in the hash area, you store a shorter *code* derived from it. Since codes are shorter than the original messages, two different messages can produce the same code, and that generates the false positives. The size of the code is adjusted according to the error fraction you're willing to tolerate.

**Method 2. The bit array with multiple hashes**

The second idea is the one that won. Instead of organizing the area into cells, we treat memory as $N$ individual bits. To store a message, we pass it through $d$ different hash functions, get $d$ bit addresses, and set those bits to 1. To check whether a message is in the set, we generate the same $d$ addresses and check if all bits are set to 1.

Bloom mathematically proved that method 2 is strictly better than method 1 under the assumption of constant cost per bit access. This second method is what we now simply call a "Bloom filter".

---

## 3. The math behind the filter

Suppose we have an array of $m$ bits, $k$ independent hash functions, and we've inserted $n$ elements. The interesting question is: what's the probability of a false positive?

When we insert an element, each of its $k$ hashes sets a bit to 1. The probability that a specific bit is *not* set to 1 by a specific hash is $1 - 1/m$. The probability that this bit is still 0 after inserting $n$ elements with $k$ hashes each is:

$$\left(1 - \frac{1}{m}\right)^{kn} \approx e^{-kn/m}$$

Now, a false positive occurs when we check an element that is *not* in the set, but its $k$ hashes happen to point to bits that have already been set to 1 by other elements. The probability of this happening is:

$$f = \left(1 - e^{-kn/m}\right)^k$$

There's an interesting tension here: increasing $k$ gives you more ways to "catch" a missing element (good), but it also saturates the array faster (bad). Where's the optimum?

Differentiating with respect to $k$ and finding the minimum gives:

$$k_{opt} = \frac{m}{n} \ln 2$$

And substituting, the minimum false positive probability for an array of size $m$ and $n$ elements is approximately $0.6185^{m/n}$.

The number $0.6185$ is one of those constants that appear out of nowhere and make you smile. Translated to the real world: with **10 bits per element** you get a false positive rate of ~1%. With **20 bits per element** it drops to ~0.01%. Every additional 10 bits gives you roughly two orders of magnitude of precision.

---

## 4. Experiment with the filter

Before moving on, here's an interactive Bloom filter. Adjust the array size ($m$) and the number of hash functions ($k$), add words and see what happens. Notice how:

- When you add elements, the corresponding bits light up and stay at 1
- When you check a present element, all $k$ bits are at 1 (green)
- When you check an absent element, just one of its $k$ bits being at 0 is enough to rule it out (red)
- As you add more elements, false positives start to appear

<BloomFilterPlayground client:load />

The "Load fruits example" button loads five fruits at once. Then try checking other words; some will yield false positives if you're unlucky with the hash.

---

## 5. Designing a filter in practice

In a real system, you don't normally play with $m$ and $k$ blindly, but start from two parameters you already know:

1. **$n$**: how many elements you expect to store
2. **$p$**: what false positive rate you're willing to accept

From there you can calculate the optimal values of $m$ and $k$. The formula for the minimum size is:

$$m = -\frac{n \ln p}{(\ln 2)^2}$$

Here's an interactive calculator. Move the sliders to see how memory requirements change according to set size and desired precision:

<BloomOptimizer client:load />

The chart shows three lines that tell the full story. The **orange line** is the optimal Bloom filter: a perfect straight line on a log scale. Each additional bit per element reduces the false positive rate by a constant factor (specifically, by a factor of $0.6185$). The **green dashed line** shows what happens if you fix $k = 4$ instead of choosing it optimally: the curve is no longer straight, because for small sizes $k=4$ is too much (saturates the array) and for large sizes it's too little (few chances to reject). The **gray dashed line** is the theoretical lower bound, what a mathematically perfect set representation would achieve.

The vertical distance between the orange and gray curves is exactly $\log_2 e \approx 1.44$. In other words, Bloom filters sit at a constant factor above the theoretical optimum, and that factor is the only inefficiency you pay for using such a simple structure. Not bad for a four-page design.

---

## 6. Counting Bloom Filters: allowing deletions

The original Bloom filter has an uncomfortable limitation: you can't delete elements. If you try to set to 0 the bits of an element you want to remove, you risk damaging other elements that shared some of those bits.

In 2000, Fan, Cao, Almeida and Broder introduced **counting Bloom filters** in the context of shared web cache systems. The idea is simple: instead of using a single bit per position, you use a small counter. When you insert an element, you increment the $k$ counters. When you delete it, you decrement them. An element is considered present if all its counters are $> 0$.

How big should the counters be? The authors showed that **4 bits per counter** are sufficient for practically all cases. The probability that any counter exceeds the value 16 (and therefore overflows) is extremely low: around $1.37 \times 10^{-15} \times m$ for a typical configuration. It's a small cost in exchange for gaining the ability to delete.

The trade-off is obvious: four times the memory of a standard Bloom filter. Even so, four times a tiny amount is still tiny compared to storing the actual keys. That's why many systems maintain two filters: a counting Bloom filter in memory to manage the set with insertions and deletions, and a standard binary Bloom filter that gets rebuilt periodically to send over the network, where space savings matter most.

---

## 7. Bigtable: where Bloom filters really shine

If there's one system that made Bloom filters famous in the world of distributed databases, it's **Bigtable**. Google published the paper in 2006 describing how they designed a structured storage system capable of handling petabytes of data across thousands of machines.

Bigtable's internal structure is based on a pattern that's now ubiquitous: the **LSM-Tree** (Log-Structured Merge Tree). For each *tablet* (table partition), Bigtable maintains:

- A **memtable**: a sorted buffer in memory where recent writes go
- A **commit log** for recovery in case of failure
- A series of **SSTables**: immutable sorted files on disk, generated when the memtable fills up

When a read query arrives, the server has to consult the memtable and all relevant SSTables to reconstruct the current state of the key. And here's the problem: if the key we're looking for doesn't exist, we'll have done multiple disk accesses to find that out.

This is where Bloom filters come in. The Bigtable paper clearly describes the motivation: a read operation has to consult all SSTables that make up a tablet's state, and they reduce the number of disk accesses by letting clients specify that Bloom filters should be created for the SSTables in a given locality group.

The idea is elegant: each SSTable has an associated small Bloom filter containing all its keys. These filters live in the tablet server's memory, loaded together with the SSTable indices when the file is opened, so consulting them is as cheap as a RAM access. Before going down to disk to search in that SSTable, the server consults the filter. If the filter says "not there", we avoid the disk access entirely. If it says "it might be", we do the actual query.

The impact is huge: most lookups for non-existent keys no longer need to touch disk. In a typical Bigtable workload, where many queries look for keys that don't exist (for example, when trying to add something new), this translates into performance improvements of orders of magnitude.

Cassandra, ScyllaDB, HBase, RocksDB and LevelDB, all descendants of the Bigtable design, maintain this same optimization. If you've ever queried Cassandra and it responded in microseconds saying "this key doesn't exist", you owe thanks to Burton Bloom.

---

## 8. Network applications

Broder and Mitzenmacher's 2004 survey documents dozens of uses of Bloom filters in networking problems. Some of the most interesting:

**Shared web caching (Squid)**

Multiple proxies cooperate sharing their contents. Instead of sending complete lists of cached URLs to each other (an expensive network operation), each proxy sends a Bloom filter representing its contents. If you need to know whether another proxy has a page, you consult its filter. A false positive means a failed request to the proxy, a small cost compared to the savings in update traffic.

**Loop detection in experimental protocols**

Whitaker and Wetherall proposed including a small Bloom filter in packet headers. Each router ORs its "mask" with the filter when forwarding the packet. If the filter doesn't change after the OR, the packet has probably already passed through that router, indicating a forwarding loop.

**IP Traceback**

Instead of each router storing complete records of the packets it processes, it stores Bloom filters of each packet's hashes. When a malicious packet needs to be traced backward, each router is queried whether the filter contains that packet. False positives generate branches in the reconstructed path, but with a low rate the result remains useful.

---

## 9. Why this idea still matters

The most interesting thing about Bloom's paper isn't the filter itself, although it's a gem, but the underlying principle: there are situations where giving up absolute precision in exchange for a huge resource saving is the right call.

It's a counterintuitive principle in software engineering, where we usually assume "correct" is better than "almost correct". But in large-scale distributed systems, that "almost" can mark the difference between a design that scales and one that doesn't. A Bloom filter with 1% false positives saves you 99% of unnecessary disk accesses, and that saving is the difference between a system that responds in milliseconds and one that responds in seconds.

The evolution of this idea over the decades is fascinating:

1. **Bloom (1970)**: defines the basic structure for a hyphenation problem.
2. **Databases (80s-90s)**: adopted for distributed semi-joins and differential files.
3. **Squid (1998)**: brings it to the world of shared web caches.
4. **Bigtable (2006)**: makes it a fundamental piece of LSM-Trees.
5. **P2P and blockchains**: used for transaction propagation, distributed lookups and traffic reduction. Ethereum, for example, includes a Bloom filter in the header of every block so applications can locate smart contract events without downloading the entire chain.

All of this from a four-page paper written more than half a century ago, with one central idea: **sometimes, being a little wrong is the smartest thing you can do**.

---

## References

- Bloom, B. H. (1970). *Space/Time Trade-offs in Hash Coding with Allowable Errors*. Communications of the ACM, 13(7), 422-426.
- Chang, F., et al. (2006). *Bigtable: A Distributed Storage System for Structured Data*. OSDI '06.
- Broder, A., & Mitzenmacher, M. (2004). *Network Applications of Bloom Filters: A Survey*. Internet Mathematics, 1(4), 485-509.
- Fan, L., Cao, P., Almeida, J., & Broder, A. Z. (2000). *Summary Cache: A Scalable Wide-Area Web Cache Sharing Protocol*. IEEE/ACM Transactions on Networking.
