# ARGOS V8 — Two Motor Architecture

## User-facing modes

### ORİJİNAL MOTOR
- Baseline: V7-LOCKED
- AI learning is not applied
- AI weights do not affect entry decisions
- The protected baseline gate is in `src/original-engine-snapshot.ts`

### AI MOTORU
- Uses the Adaptive Learning AI
- Learns from closed trade outcomes
- Candidate model must pass out-of-sample validation before activation
- Saved model: `data/argos_ai_model.json`

## Shadow Test

Shadow mode is available inside the AI section. It compares the AI decision path with the original baseline and intentionally sends no real new order while shadow mode is active.

## Switching

Engine mode is persisted in `data/argos_engine_mode.json` and exposed through:
- `GET /api/v1/engine/mode`
- `POST /api/v1/engine/mode` with `{ "mode": "original" | "ai" | "shadow" }`

The original baseline is never overwritten by AI training.
