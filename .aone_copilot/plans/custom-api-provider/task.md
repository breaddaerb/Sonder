### custom-api-provider ###
# Custom API Provider — Task Checklist

## Provider helpers
- [x] Add `getCustomApiConfig()` to `src/modules/provider.ts`
- [x] Add `setCustomApiConfig()` to `src/modules/provider.ts`
- [x] Add `hasCustomApiConfig()` to `src/modules/provider.ts`
- [x] Add `clearCustomApiConfig()` to `src/modules/provider.ts`
- [x] Add `getCustomApiStatusLabel()` to `src/modules/provider.ts`

## Transport layer
- [x] Add `testCustomApiConnection()` to `src/modules/Meet/OpenAI.ts`

## Panel UI
- [x] Add `customApiButton` field and build it in `buildPanel()` in `src/context-chat/panel.ts`
- [x] Add `handleCustomApiConfig()` method with sequential prompt flow in `src/context-chat/panel.ts`
- [x] Update `render()` to sync `customApiButton` state in `src/context-chat/panel.ts`

## Prefs
- [x] Update default model from `gpt-3.5-turbo` to `gpt-4o` in `addon/prefs.js`

## Tests
- [x] Add unit tests for custom API provider helpers in `tests/custom-api-provider.test.ts`

## Docs and tracking
- [x] Add custom API provider section to `todo.md`
- [x] Update `README.md` with custom API configuration instructions

## Validation
- [x] Run `npm test` and fix any failures
- [x] Run `npm run tsc` and fix any type errors
- [x] Run `npm run build-dev` and verify build succeeds
- [ ] Manual verification: configure custom API from panel, test connection, send a message


updateAtTime: 2026/3/12 11:26:13

planId: 76b35149-fce6-4b6d-a5f2-5da10f1852ba