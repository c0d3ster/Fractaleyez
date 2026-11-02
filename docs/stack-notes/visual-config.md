## #232 Hopalong Speed to delta time

Branch: overnight/2026-11-01/r1-01-t232-hopalong-speed-delta-time

- Added `userConfig.speed_UNITS_PER_SEC_PER_UNIT: 60` in `src/config/user.config.ts` (same pattern as `rotationSpeed_RAD_PER_SEC_PER_UNIT`).
- `applyParticleMotion` in `hopalong-visualizer.ts` computes one `zStep = speed * musicMult * 60 * (min(deltaTime, 100) / 1000)`, used by the add and the wobWob `* 2` subtract. Delta clamp is the module const `maxMotionDeltaMs = 100`.
- `peakCountdown` (frame-rate dependent) left alone.
- No deviation from acceptance criteria. Visual check on Orbit presets and a high-refresh display still needed.
