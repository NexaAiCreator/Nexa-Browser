# Nexa Browser UI Redesign (AI Popup)

## Planned steps
1. Update `src/renderer/ai-popup.html` structure
   - Tabs: Chat / Agent / Voice / Brain
   - Remove `ai-debug-strip`
   - Replace context card with Current Page + permission cards
   - Replace quick actions with Summarize / Research / Explain / Automate
   - Add Sources chips + Sources sidebar
   - Add Agent Progress timeline container
   - Replace Browser Controls drawer with Developer Settings / Settings

2. Update `src/renderer/styles.css`
   - Remove styles for `ai-debug-strip`
   - Implement new UI styles: sources, permission cards, agent timeline
   - Make voice orb large + animated per `data-ai-status`

3. Update `src/renderer/ai-popup.js`
   - Remove debug-strip wiring
   - Add new tab switching + panel show/hide
   - Wire new quick actions to existing backend calls
   - Implement sources chip selection state and include in prompts
   - Render permission cards on `brain:permission-required`
   - Render agent timeline from brain/workflow events

4. Manual verification
   - Run `npm start`
   - Validate: UI loads, tabs switch, voice still works, Brain permissions dialogs still work, streaming still updates conversation.

