# Plugin loading fix

This note is carried over from the predecessor project because the same working packaging/bootstrap shell was intentionally reused for Sonder.
It explains the loadability lessons that should not be relearned from scratch.

## Problem

The add-on built successfully, but Zotero did not actually load it:

- manual `.xpi` install said the add-on might be incompatible
- the add-on did not appear in **Tools -> Add-ons**
- the add-on did not show up in `extensions.json`
- startup code never ran, so OAuth/runtime testing was blocked

A control plugin built from the current `windingwind/zotero-plugin-template` **did** load on the same machine, which showed the problem was our package/runtime shape rather than Zotero itself.

## What finally worked

This is the packaging/runtime shape that finally loaded on the test machine.

### 1. Use the modern Zotero 7/8 bootstrap shape

The final package uses:

- `manifest.json`
- `bootstrap.js`
- top-level `content/`
- top-level `locale/`

The build step now copies legacy assets from `addon/chrome/content` and `addon/chrome/locale` into top-level `content/` and `locale/` before packaging.

Relevant file:

- `scripts/build.js`

### 2. Register chrome from `manifest.json` in bootstrap

`bootstrap.js` now registers both content and locale chrome paths and loads the compiled script from:

- `content/scripts/<addonRef>.js`

Relevant file:

- `addon/bootstrap.js`

Important detail: locale registration was necessary for `chrome://<addonRef>/locale/addon.properties` lookups to work.

### 3. Match the current template output more closely

The package was adjusted to look more like a currently working template add-on:

- `homepage_url` present in `manifest.json`
- `update_url` present in `manifest.json`
- `content/preferences.xhtml` included
- `content/icons/favicon@0.5x.png` included
- `strict_max_version` set to `8.*`

Relevant files:

- `addon/manifest.json`
- `addon/chrome/content/preferences.xhtml`
- `scripts/build.js`

### 4. Package the final add-on as an `.xpi`

The add-on only became active reliably once Zotero was given a profile-side `.xpi` that matched the working control plugin pattern.

Observed working state in the Zotero profile:

- `extensions/gptmeetforzotero@test.local.xpi`

In the working run, `extensions.json` showed the active add-on path as the `.xpi`, not the unpacked folder.

### 5. Use a fresh add-on identity during recovery

During debugging, the old identity may have had stale/broken state in the Zotero profile.
A fresh working test identity was used:

- add-on name: `GPT Meet for Zotero`
- add-on id: `gptmeetforzotero@test.local`
- add-on ref: `gptmeet`
- add-on instance: `GPTMeetPlugin`

This is the current working identity in `package.json`.

## Runtime issues found after discovery was fixed

Once the add-on finally appeared in Zotero, there were still startup/runtime crashes.
These were separate from the discovery problem.

### 1. `markdown-it-mathjax3` broke startup in Zotero

The bundled MathJax dependency uses `eval("require")`, which fails in Zotero's plugin sandbox.
This caused startup to abort before the UI/shortcuts were ready.

Current temporary fix:

- do **not** enable `markdown-it-mathjax3` during startup

Relevant file:

- `src/modules/views.ts`

Current status:

- markdown rendering works
- MathJax support is temporarily disabled

### 2. Custom global getter recursion

A custom `defineGlobal("Zotero")` hook caused recursive resolution with the toolkit runtime and broke startup.
Removing that custom `Zotero` getter fixed the recursion.

Relevant file:

- `src/index.ts`

### 3. Old hard-coded instance references

Some runtime code still referenced the previous global instance:

- `Zotero.ZoteroGPT`

Those references were updated to:

- `Zotero[config.addonInstance]`

Relevant files:

- `src/modules/Meet/OpenAI.ts`
- `src/modules/Meet/BetterNotes.ts`

## How to debug this class of problem again

### Check whether the add-on is even discovered

Look at:

- `~/Library/Application Support/Zotero/Profiles/<profile>/extensions.json`

If the add-on is absent there, Zotero has not accepted/discovered it yet.

### Run Zotero with terminal logging

On macOS:

```bash
/Applications/Zotero.app/Contents/MacOS/zotero -ZoteroDebugText
```

This was the most useful way to distinguish:

- package discovery failure
- bootstrap failure
- runtime/startup crash after discovery

### Temporary bootstrap marker

`addon/bootstrap.js` currently writes a debugging marker file:

- `/tmp/zoterogpt-bootstrap.log`

This is just a debugging aid and can be removed later.

## Current caveats / follow-up cleanup

The add-on now loads and basic Codex OAuth + chat works, but the state is still intentionally rough.

Known cleanup items:

- shortcut handling needs cleanup
- the development auto-open fallback should be removed after shortcut/menu UX is stabilized
- MathJax should be replaced or reintroduced in a Zotero-safe way
- the temporary test add-on id should eventually be renamed to the final production id if desired
- bootstrap debug marker code can be removed once startup is stable

## Summary

The big lesson is that there were **two different problems**:

1. **Discovery/package shape was wrong**
2. **Startup/runtime crashed even after discovery was fixed**

The add-on finally became usable only after both were fixed.
