---
title: "LSM-Trees: how to stop fighting the disk"
date: "2026-05-12"
description: "Why a B-Tree pays 2 I/Os per insert and how O'Neil et al. (1996) invented a structure that writes in batch. From the rolling merge to Bigtable, with a detour through Bloom filters."
tags: ["distributed systems", "databases", "papers", "data structures"]
lang: "en"
---

In 1996, Patrick O'Neil, Edward Cheng, Dieter Gawlick and Elizabeth O'Neil published *The Log-Structured Merge-Tree (LSM-Tree)*. The motivation was mundane: transactional systems were inserting millions of log records per day and needed a queryable index in real time. The standard data structure for that job, the B-Tree, ate more than half of the system's I/O budget just keeping the index up to date.

Ten years later, that same design shows up at the core of Bigtable (Google, 2006) and from there in Cassandra, ScyllaDB, RocksDB, LevelDB, HBase, ClickHouse, and pretty much every database built for write-heavy workloads. This post is about why it works.

## 1. The B-Tree and the office filing cabinet

A B-Tree is a balanced tree where every node can have many children. Internal nodes hold key ranges that guide the search and leaf nodes hold the data. Its main virtue is height: with branching factor $b$ and $n$ keys, the tree has height $\log_b(n)$, so a lookup touches very few nodes.

The problem is not lookups. It's inserts. To insert a single key, the system has to:

1. Walk down the tree, reading nodes from disk until you reach the right leaf.
2. Load the page in RAM, add the key, rewrite the full page back to disk.
3. If the page is full, split it and propagate the split upward.

Once $n$ is large and the inner nodes fit in cache, the amortized cost of one insert is roughly **2 I/Os**: a read for the leaf and a write for the leaf. And these are **random I/Os**: each new key can land anywhere in the tree.

Picture a filing cabinet perfectly sorted by date. Locating a document is immediate: you go to the right drawer and pull it out. But now imagine that a thousand new documents arrive per second in random order. For each one, you have to open a different drawer, find the exact gap between two papers, slot it in and close the drawer. The time isn't spent reading the information, it's spent opening and closing drawers.

That's the reality of a B-Tree under heavy write load: the effort of maintaining order outweighs the value of the insert itself.

## 2. The Five Minute Rule

The paper leans on an observation Jim Gray and Franco Putzolu made in 1987: if you access a piece of data more than once every five minutes, you save money by keeping it in RAM rather than paying for a disk read every time. If you access it less often, it's cheaper to leave it on disk. The rule still dictates, almost four decades later, how to size caches and memtables.

**Where does the cost of a disk read come from?** In 1996, disks were mechanical: a physical arm moved to the right track, waited for the platter to rotate until the target sector was under the head, then read. Every random read carried mechanical latency on the order of milliseconds. A sequential read (the next sector after the current one) was orders of magnitude cheaper because the arm was already in place.

Today we use SSDs and NVMe. The arm is gone. But the asymmetry survives in a different form:

- In the cloud (AWS, Azure, GCP) **you pay per I/O operation**. A random I/O costs the same as a sequential one, but a sequential I/O can transfer a full block for the same price. You're billed per request, not per byte.
- SSDs still prefer sequential writes because of how internal garbage collection and wear leveling work.
- RAM is still two to three orders of magnitude faster than persistent storage.

The paper formalizes this with two parameters: $\text{COST}_\pi$, the cost of a random I/O (random page access), and $\text{COST}_P$, the cost of an I/O as part of a sequential transfer. The ratio $\text{COST}_\pi / \text{COST}_P$ is the economic lever the whole design rests on.

## 3. The two-component algorithm

The core idea of the LSM-Tree is brutally simple: **don't write one key at a time. Accumulate a lot of keys in memory and flush them all together in one sequential write.**

In its basic form, an LSM-Tree has two components:

- $C_0$: a small tree that lives entirely in RAM.
- $C_1$: a large tree that lives on disk.

When a new record arrives (or a change to an existing one), it gets appended to a sequential log first (the WAL, more on this later) and then inserted into $C_0$. That insert is instant: nothing touches the disk except the log, and since the log is append-only it pays no seek time.

Because $C_0$ lives in RAM, we can use whatever structure works best there. The paper argues against just putting a B-Tree in memory: the reason for B-Trees (large pages to minimize arm movement) isn't useful in this setting. Instead, you can use AVL trees, 2-3 trees, skip lists, or any balanced structure that's CPU-efficient. The intuition:

> $C_0$ is the small kitchen: everything within arm's reach, you move fast.
> $C_1$ is the big warehouse: trips are expensive, so when you go, you bring a lot at once.

When $C_0$ hits a size threshold, the **rolling merge** kicks in. A contiguous slice of $C_0$ is flushed into $C_1$ by merging it with the corresponding pages. Since both are sorted by key, it's a textbook merge sort: read a page of $C_1$, interleave the $C_0$ keys that fall in its range, write a new page. Old pages are not overwritten in place (new pages go to a fresh area on disk), which lets the system recover from crashes.

<LSMVisualizer client:load />

What this buys you, in cost terms:

| Operation | B-Tree | LSM-Tree |
|---|---|---|
| Insert 1 key (to disk) | 2 I/Os (read+write leaf) | $\approx 2/M$ I/Os (M keys per page) |
| I/O type | Random ($\text{COST}_\pi$) | Sequential ($\text{COST}_P$) |

That $M$ is the **batching factor**. If your page holds 40 keys and the memtable accumulates 40000 keys before flushing, each flush writes full pages, not pages with one new key and 39 empty slots. Compared to a B-Tree, you save a factor of $M$ in number of I/Os. And the ones you do are sequential, not random. The real saving is $M \cdot \text{COST}_\pi / \text{COST}_P$, which on 1996 disks was trivially $>1000$.

## 4. Cascading to many levels

The paper immediately generalizes the idea beyond two components. As $C_1$ grows, the $C_0 \rightarrow C_1$ merge becomes expensive again (because $C_1$ has many pages). The fix is to introduce intermediate levels: $C_0$ flushes to $C_1$, $C_1$ flushes to $C_2$, $C_2$ flushes to $C_3$, and so on.

![LSM-Tree cascading levels from C₀ in RAM down to C₃ on disk, each level roughly 10× larger than the previous one](/images/blog/lsm-cascade.svg)

Each level is typically 10 to 100 times larger than the previous one. The ratio between levels is called the *size ratio* or *fanout*, and it's named in various ways in modern descendants (in LevelDB and RocksDB it's `max_bytes_for_level_multiplier`, default 10).

The geometric growth means that in practice you rarely see more than 5 or 6 levels, even with terabyte-scale datasets. The LSM's height is $\log_T(N)$ where $T$ is the size ratio, every bit as manageable as a B-Tree.

## 5. The price you pay: reads

The weak spot of the LSM is reads. In a B-Tree, a key is in exactly one place. In an LSM, a key can live in any level. For a point lookup, you must check $C_0$, then $C_1$, then $C_2$, and so on until you find it.

That adds two overheads:

- **CPU overhead** from walking through multiple index structures.
- **I/O overhead** if lower levels are on disk and the key isn't in the upper ones.

The paper offers three mechanisms to soften this:

**Early termination via unique values.** If keys are unique by construction (an autoincrement ID or a timestamp), the first match is the only one. The moment you find the key in $C_0$ or $C_1$, you stop. No need to descend further.

**Temporal locality.** In most systems, the data queried most frequently is the most recent. Recent data lives in $C_0$ or $C_1$. The read workload distribution matches the inverted pyramid of the LSM, which works in our favor.

**Parameter T (forced retention).** You can decide to keep certain entries in an upper level for $T$ seconds, delaying their descent. It works as a smart cache. Useful for hot keys.

The paper explicitly flags that searching across levels **is a problem** and leaves it open. The answer came a decade later: **Bloom filters**. I'll come back to this.

<LSMBenchmark client:load />

## 6. Deletes, updates, and deferred latency

A natural question: if everything is accumulated sequential writes, how do you delete a key?

**Tombstones.** Instead of going to disk to find the data and delete it, the LSM inserts a *deletion marker* in $C_0$. It's a regular entry, with the key of the data to be removed and a tombstone flag. If someone queries that key before the next merge, the system sees the tombstone first (it's in $C_0$) and replies "not found". When the merge reaches the level where the original data lived, it simply drops it and doesn't write it into the new version. The actual deletion happens as part of normal maintenance, at no extra cost.

**Updates.** Same trick: to change a key's value, you insert a tombstone for the old value and an entry with the new value. Since both are sequential writes in memory, the update is instant from the user's perspective. The real cleanup happens at merge time.

**Predicate deletion.** Sometimes you want to delete a set rather than a specific record: "anything older than 20 days". The LSM supports this as a standing order to the merge process. When the merge passes through old data in the largest level, anything matching the predicate is simply ignored and not rewritten. It's a free deletion that happens during normal maintenance.

**Long-latency search.** This is the most curious idea in the paper, and almost no one uses it today. If you have a non-urgent query (a nightly report, an offline computation), instead of forcing the disk to chase the data, **you insert a search note in $C_0$**. That note rides along with the merges, collecting matching data as it goes. The query finishes when the note reaches the bottom. You're piggybacking on key movement that was happening anyway. It's beautiful but a bit too specific to its era.

## 7. Concurrency and recovery

That covers the algorithm. The serious engineering work starts when multiple users read and write while merges run in the background and, on top of that, the server can crash at any moment.

**Node-level locking (not tree-level).** When a merge is rewriting a page, only that page is locked, not the whole tree. Readers can keep working anywhere else. This is viable because the LSM never rewrites pages in place: new pages go to fresh disk locations, and readers keep seeing the old version until the pointers swap.

**Filling and emptying.** While an old page is "emptying" (its keys migrate down a level), a new page is "filling" in memory with the merge output. Readers can query both during the transition. The system is never frozen by a merge.

**Multiple cursors.** With many levels, there are many merges running at the same time: one between $C_0$ and $C_1$, another between $C_1$ and $C_2$, and so on. Each advances at its own pace: the cursor between small levels moves faster than the one between large levels. The paper points out that this rate imbalance is not a problem as long as the system isn't permanently saturated.

**Write-Ahead Log + checkpoints.** The 1996 paper doesn't use the modern term *WAL*, but describes exactly that: before mutating $C_0$ in memory, the operation is appended to a sequential log file on disk. Periodically the system performs a **checkpoint**: it writes the current $C_0$ to a known location on disk, records where each merge cursor is, and stores the *log sequence number* (LSN) of the last processed record. On crash, the system reads the latest checkpoint and replays the log from there. The immutability of the rest of the tree guarantees nothing else is corrupted.

## 8. The magic: immutability

Here the paper drops something almost in passing that, decades later, has become a cornerstone of data engineering: **nothing is ever overwritten**. Every new page is written to a fresh location on disk. Old pages remain valid until a cleanup process decides nobody needs them anymore.

What we now call **immutability** has deep consequences:

1. **Crash safety.** If the process dies mid-merge, the old version of the data is still intact. There is no possible corruption from a partial write.
2. **Near-free snapshots and MVCC.** If old pages are kept around, you can read past states of the database at no extra cost. PostgreSQL implements MVCC via a related mechanism (different in detail).
3. **Easier replication.** To replicate an LSM you only need to ship the new files. There's no in-place mutation to synchronize.
4. **Block-level compression and encryption.** Since pages are immutable once written, they can be aggressively compressed.

The whole architecture of Cassandra and RocksDB (the *SSTables*, Sorted String Tables) leans on this property. Each SSTable is an immutable file on disk, sorted by key. New writes create new SSTables. Periodic compaction merges several SSTables into a larger one, identical to the rolling merge.

## 9. The Bigtable and Bloom filter connection

The original paper leaves a question open: **how do you avoid reading every level to look up a key that doesn't exist?** If you query a missing key, in the worst case you have to walk $C_0$, $C_1$, $C_2$, ..., $C_K$, only to conclude at the end that it wasn't there.

In 1996 there was no clean answer. But ten years later, in 2006, Google's Bigtable ([Chang et al.](https://research.google/pubs/bigtable-a-distributed-storage-system-for-structured-data/)) took the LSM-Tree and bolted a small extra piece onto each level: a **Bloom filter**.

A Bloom filter is a probabilistic data structure that answers *"is this key here?"* with two possible answers: *"definitely not"* (with absolute certainty) or *"probably yes"* (with a tunable error margin). Exactly what the LSM needed.

Before reading a level from disk to look up a key, you consult its Bloom filter (which lives in RAM). If the filter says *no*, you skip the read. If it says *yes*, you read, and occasionally it's a false positive, but the bulk of queries for missing keys get short-circuited in RAM.

The idea had been published since 1970, in a four-page paper by Burton Bloom. I wrote about it in [a separate post on Bloom filters](/en/blog/bloom-filters/) with all the details: why $k = (m/n) \ln 2$ is the optimal number of hash functions, how false positives are computed, how much memory you need per element. The funny thing is that when O'Neil et al. wrote the LSM paper in 1996, Bloom filters had existed for 26 years. But the combination wasn't made until 2006, with Bigtable.

Sometimes powerful ideas are decades apart until someone wires them together. The LSM-Tree solved the write problem, the Bloom filter solved the read problem. Bigtable married them and gave birth to the family of databases that today dominate distributed storage.

## 10. References and further reading

- O'Neil, P., Cheng, E., Gawlick, D., & O'Neil, E. (1996). *The Log-Structured Merge-Tree (LSM-Tree)*. Acta Informatica, 33(4), 351-385.
- Chang, F., et al. (2006). *Bigtable: A Distributed Storage System for Structured Data*. OSDI '06.
- Gray, J., & Putzolu, F. (1987). *The 5 Minute Rule for Trading Memory for Disc Accesses*. SIGMOD Record, 16(3).
- Bloom, B. H. (1970). *Space/Time Trade-offs in Hash Coding with Allowable Errors*. CACM 13(7).
- For a modern view of the read/write/space trade-off in LSMs, I recommend Luo & Carey (2020), *LSM-based Storage Techniques: A Survey*, VLDBJ.
