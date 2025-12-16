# Known Issues & Future Work

## Wave Participant Management (v1.12.2)

**Issue**: Wave creators cannot view or manage the full participant list in wave settings.

**Current behavior**:
- Only participants who have responded to a wave are visible
- No way to see the original invited participants
- No way to add/remove participants after wave creation
- Private waves may exist with no other participants visible

**Future work**:
- Add participant list to wave settings modal
- Show all invited participants, not just those who responded
- Allow wave creator to add/remove participants
- Handle edge case of waves with no other participants

---

## Playback Mode Issues (v1.12.2)

The playback feature (timeline slider that reveals droplets chronologically) has some edge cases that need future work:

1. **Occasionally missed droplets**: In long waves (50+ droplets), a small number of droplets may not be highlighted/scrolled to during playback. The `_index` assignment uses chronological order based on `created_at`, but edge cases exist where:
   - Droplets with identical timestamps may have unpredictable ordering
   - Deeply nested reply threads loaded via "Load more" may have indexing gaps

2. **Scroll position after loading older droplets**: When "Load older messages" is triggered during playback, the scroll position calculation may not perfectly align with the current playback position.

3. **Playback in FocusView**: Playback is currently only available in the main WaveView. FocusView does not have playback controls.

**Workaround**: For complete chronological viewing, use the wave normally without playback mode. Playback works reliably for waves with fewer than 50 droplets.

**Technical details**:
- Playback uses `_index` assigned in chronological order from `created_at` timestamps
- All droplets are loaded before playback starts via `handlePlaybackToggle`
- Scroll uses viewport-relative positioning via `getBoundingClientRect()`
- See `CortexApp.jsx` lines ~8800-8900 for playback implementation
