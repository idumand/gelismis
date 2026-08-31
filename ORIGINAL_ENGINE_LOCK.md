# ARGOS Original Engine Lock

The `src/original-engine-snapshot.ts` file is the protected baseline for the legacy V7 entry decision.

Rules:
- AI training never writes to this file.
- AI model weights never modify the original gate.
- `original` engine mode calls only `originalV7EntryGate()`.
- AI mode calls the adaptive decision path.
- Shadow mode compares the two paths and sends no new order.

The original baseline version label is `V7-LOCKED`.
