# Sonder migration plan

Status: executed baseline migration plan  
Purpose: move the working Zotero/Codex foundation into a new repository identity (`Sonder`) before the context-chat rewrite

---

## 1. Why migrate into a new repo

The planned UX is no longer a small prompt-tag utility.
It is a different product direction:

- paper-first chat
- item + paper chat
- large docked panel
- persistent multi-session conversations

Because this no longer matches the old user mental model, using a new project identity is justified.

At the same time, the migration should **not** throw away the working technical base.

---

## 2. Migration strategy

### Principle

Do **not** re-discover Zotero plugin packaging from scratch.
Instead:

- copy the already working plugin shell
- rename the project identity
- preserve the working OAuth/Codex plumbing
- verify the new plugin still loads in Zotero
- only then start the larger product rewrite

### In one sentence

> New repo, old proven shell, future-new UX.

---

## 3. Scope of this migration

This migration intentionally focuses on the **technical baseline**, not on implementing the new context-chat UI yet.

Included in migration:

- new repository identity: `Sonder`
- new package/add-on identity
- migrated docs
- preserved build/bootstrap/add-on loading behavior
- preserved Codex OAuth and Codex chat path
- initial smoke testing in Zotero

Not included yet:

- new side panel UI
- new context/session architecture implementation
- command-tag retirement
- final retrieval redesign

Those come after the baseline is confirmed.

---

## 4. New project identity

Current migrated development identity:

- package name: `sonder`
- add-on name: `Sonder`
- add-on id: `sonder@test.local`
- add-on ref: `sonder`
- add-on instance: `SonderPlugin`

This identity is sufficient for local migration/testing.
It can still be changed later before any public release.

---

## 5. What is preserved from the predecessor project

### Preserved as stable foundation

- working `manifest.json` + `bootstrap.js` add-on shell
- working build output shape (`content/`, `locale/`, top-level bootstrap)
- working Zotero discovery/install behavior
- working provider abstraction
- working ChatGPT/Codex OAuth implementation
- working Codex backend request path
- working current legacy chat UI as a temporary baseline

### Intentionally *not* treated as the final product

- popup-first UI
- command-tag-first primary workflow
- current `AskPDF` semantics
- current session/history model

---

## 6. Acceptance criteria for migration

The migrated baseline is acceptable only if Sonder still preserves the current already-working capabilities.

## Required acceptance criteria

### A. Zotero loadability

- Sonder appears in Zotero Add-ons
- Sonder is accepted by Zotero as a real plugin
- Sonder startup runs successfully

### B. OAuth continuity

- Codex OAuth login path is still present
- `/login` flow still works in the migrated plugin
- token exchange / refresh code remains intact

### C. Codex chat continuity

- the migrated plugin can still make a Codex request
- a basic prompt can still return a response

### D. Documentation continuity

- the context-chat rewrite spec is carried into the new repo
- the OAuth and plugin-loading notes are carried over for reference

If these are preserved, the migration is successful enough to begin the rewrite.

---

## 7. Concrete migration steps

### Step 1: copy the working repository shell

Copy the predecessor project into a new repository directory, excluding transient state such as:

- `.git`
- `node_modules`
- build output
- local scratch files

### Step 2: rename project identity

Update at least:

- package name
- add-on name
- add-on id
- add-on ref
- add-on instance
- README / docs index
- project-facing strings such as preferences title and OAuth originator name

### Step 3: remove broken local-only dependency assumptions

The predecessor repo contained a `file:..` dependency that is not suitable for a clean new repository.
That dependency should be removed if unused.

### Step 4: reinstall dependencies in the new repo

Run `npm install` in the new repo so the lockfile and dependency tree belong to the new project cleanly.

### Step 5: build the add-on

Run:

```bash
npm run build-dev
```

Expected output:

- `builds/addon/`
- `builds/sonder.xpi`

### Step 6: install the migrated build into Zotero profile

Install Sonder into the Zotero profile using the migrated add-on ID.

### Step 7: smoke test with Zotero debug logging

Verify at minimum:

- Zotero calls the add-on startup
- no immediate fatal bootstrap/runtime regression occurs
- plugin shows up in `extensions.json`
- startup-ready marker/debug line appears

### Step 8: hand off to user for interactive validation

After technical smoke testing passes, the user should validate:

- plugin appears in UI
- `/login` still works
- Codex prompt still returns output

---

## 8. Risks and mitigation

## Risk 1: plugin stops being discoverable again

Mitigation:

- preserve the already working build/bootstrap shell
- do not change packaging shape during migration

## Risk 2: renamed add-on identity breaks startup assumptions

Mitigation:

- update config-driven placeholders carefully
- smoke test in Zotero after migration

## Risk 3: OAuth breaks due to renamed strings or prefs

Mitigation:

- preserve the actual OAuth flow logic
- only rename project-facing strings where safe

## Risk 4: product rewrite pressure leaks into migration phase

Mitigation:

- keep migration acceptance criteria narrow
- prove continuity first
- only then start UX rewrite work

---

## 9. What happens after migration succeeds

Once the migration baseline is accepted, the next phase is:

- implement the architecture from `context-chat-spec-v0.1.md`

Recommended next implementation order:

1. panel mounting / entry button
2. context model
3. session persistence model
4. paper context flow
5. item + paper context flow
6. history/session UI
7. de-emphasize legacy command tags

---

## 10. Summary

Sonder is intentionally a **new project identity**.
But its starting point is not a blank slate.

It is a deliberate migration of the already verified technical base:

- Zotero can load it
- Codex OAuth can authenticate
- Codex chat can answer

That preserved base is the launchpad for the next, much larger rewrite.
