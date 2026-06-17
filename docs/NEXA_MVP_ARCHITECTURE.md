# Nexa MVP Architecture And Feature Roadmap

## Purpose

This document maps the Nexa MVP across:

- `C:\Nexa Ai`
- `C:\Nexa Broswer`

The goal is to keep product intent and code ownership aligned.

## Product Definition

### Nexa AI

The workspace assistant.

Responsibilities:

- chat
- voice
- project memory
- prompt orchestration
- file-aware workflows
- workspace reasoning

### Nexa Browser

The browser-native execution layer.

Responsibilities:

- live webpage context
- page extraction
- browser UI
- permissions
- research workflows
- project save actions

### Project Brain

The memory layer that connects both.

Responsibilities:

- separate project contexts
- store project facts
- keep research notes
- remember next tasks
- organize saved web findings

## MVP Product Goal

Build the smallest version of Nexa that already feels different from a normal chatbot.

That means the MVP should prove:

1. Nexa understands projects
2. Nexa understands the current webpage
3. Nexa can save research into a project
4. Nexa can help users think and act faster

## MVP Feature Set

### Required MVP Features

- chat
- voice input
- project workspaces
- per-project memory
- webpage summarization
- ask about current page
- save page to project
- research notes per project
- coding/docs helper

### Not Required For MVP

- autonomous browsing loops
- automatic purchases
- automatic form submission
- full team collaboration
- enterprise permissions
- deep CRM/accounting integrations

## Architecture Split

## `C:\Nexa Ai`

### Owns

- model API
- chat and voice interaction layer
- project memory logic
- project selection context
- browser prompt orchestration
- structured action responses
- later retrieval/search over project notes and files

### Should expose

- `GET /health`
- `GET /ui-config`
- `GET /v1/browser/capabilities`
- `POST /v1/browser/execute`
- later `POST /v1/browser/stream`
- later project endpoints such as:
  - `GET /v1/projects`
  - `POST /v1/projects`
  - `GET /v1/projects/:id`
  - `POST /v1/projects/:id/memory`
  - `POST /v1/projects/:id/research-items`
  - `POST /v1/projects/:id/ask`

### Immediate implementation priorities

1. stabilize browser adapter responses
2. add `answer_with_page_context`
3. add project data model
4. add project-scoped memory store
5. add voice input pipeline

## `C:\Nexa Broswer`

### Owns

- tab management
- navigation
- page extraction
- selected text extraction
- browser UI
- AI sidebar UI
- permission toggles
- project save interactions
- local browser metadata

### Should call AI service for

- summarize page
- summarize selection
- ask about this page
- rewrite selected text
- research comparisons later

### Should keep local

- open tabs list
- bookmarks/history/download access
- permission enforcement
- context truncation
- security decisions

### Immediate implementation priorities

1. AI sidebar with page-aware questions
2. `Save page to project`
3. project selector in browser UI
4. research capture flow
5. docs/code helper workflow

## Project Brain Design

Each project should have:

- `id`
- `name`
- `type`
- `summary`
- `key_facts`
- `goals`
- `next_tasks`
- `saved_pages`
- `research_notes`
- `uploaded_files`
- `created_at`
- `updated_at`

### Example project

`GoCrave`

Stored facts:

- business type: fast food delivery
- country: Jamaica
- user groups: customers, restaurants, riders
- current issue: rider payment model
- current target: sustainable weekly rider pay
- next tasks: pricing, onboarding, marketing

## MVP User Flows

### Flow 1: Ask About This Page

1. user opens a page
2. browser extracts visible content
3. user asks Nexa a question
4. browser sends page context to `C:\Nexa Ai`
5. AI answers with structured result

### Flow 2: Save Page To Project

1. user opens a page
2. user selects a project
3. browser sends title, url, summary, and extracted notes
4. AI service stores or enriches research item
5. project memory updates

### Flow 3: Research Mode

1. user opens multiple competitor or documentation pages
2. browser can summarize or extract each page
3. user saves findings into a project
4. Nexa compares findings and suggests next actions

### Flow 4: Code/Docs Helper

1. user opens docs
2. user asks Nexa to explain or convert into steps/code
3. browser sends current page context
4. AI returns explanation or draft implementation

## Feature Roadmap By Layer

### Phase 1: Current foundation

`C:\Nexa Broswer`

- browser shell
- tabs
- history/bookmarks/downloads
- AI sidebar
- page summarization via local API

`C:\Nexa Ai`

- local model API
- browser execute adapter

### Phase 2: Distinctive MVP

`C:\Nexa Broswer`

- ask about this page
- save page to project
- project picker
- research mode entry point

`C:\Nexa Ai`

- project CRUD
- project memory
- project-aware answers
- answer with page context

### Phase 3: Voice-first workspace

`C:\Nexa Broswer`

- voice input trigger
- browser-side recording UX
- page + voice combined workflow

`C:\Nexa Ai`

- speech-to-text integration
- project-aware spoken queries
- voice response settings later

### Phase 4: Action tools

`C:\Nexa Broswer`

- draft from page
- save extracted contacts/details
- compare pages

`C:\Nexa Ai`

- structured business plan drafts
- landing page copy generation
- report and summary generation
- project next-step suggestions

## Suggested Data Contracts

### Browser to AI

Already started in:

- [AI_SERVICE_CONTRACT.md](C:/Nexa%20Broswer/docs/AI_SERVICE_CONTRACT.md)

Continue using the browser as the permission boundary.

### Project APIs

Recommended request shapes:

- create project
- save page to project
- ask within project
- list project memory items
- update project facts

The project layer should be versioned early because it will become central to the whole Nexa experience.

## UI Recommendations

### Browser UI

Add:

- project selector near AI panel
- `Ask about this page`
- `Save to project`
- `Research mode`
- `Explain docs`

### Nexa AI UI

Add:

- project list
- project summary card
- next tasks
- saved research items
- quick prompts by context:
  - business
  - coding
  - school
  - research

## What Makes The MVP Feel Special

The single most important feature combination is:

- project memory
- ask about current page
- save page to project

That is the first version of `Project Brain`.

Without this, Nexa is still too close to a standard assistant.

## Recommended Build Order

1. stabilize `summarize_page` and `summarize_selection`
2. add `answer_with_page_context`
3. add project data model in `C:\Nexa Ai`
4. add `Save page to project` in `C:\Nexa Broswer`
5. add project selector in browser sidebar
6. add project-aware ask flow
7. add voice input
8. add research mode

## Final MVP Definition

The first version of Nexa should be:

`A voice-capable AI workspace and browser assistant that lets users ask about webpages, save research into project memory, and get project-aware help while building ideas on the web.`

That is focused, buildable, and meaningfully differentiated.
