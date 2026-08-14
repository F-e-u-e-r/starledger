# Skills Repo Classification (171 repos)

Source: `skills-data.json`, 171 repos from the coding-agent ecosystem (Claude Code / Codex skills, MCP servers, harnesses, prompt/config kits). Re-classified into task-oriented categories for building installable SKILL PACKS.

## Category scheme

Domain/task-skill categories (candidates for skill packs) are listed first, infrastructure categories (excluded from skill packs) last.

### Domain-skill categories

| Category | Definition | Count | Target pack |
|---|---|---|---|
| Verification & QA | Testing, validation, code review, spec-compliance, and correctness-checking skills. | 5 | opus-pack |
| Security | Security audit, pentest, recon, and vulnerability-scanning skills. | 2 | opus-pack (to be split out later) |
| Roadmap & Spec-Driven Planning | Planning, spec-driven dev, task/project management, and roadmapping skills/methodologies. | 10 | opus-pack (to be split out later) |
| Design (UI/UX & Visual/Motion) | UI/UX, visual, motion, and graphic design skills. | 10 | design-pack |
| Marketing, SEO & Social Content | Marketing, SEO, ads, growth, and social-content creation/ops skills. | 11 | - |
| Video Editing & Generation | Video and media editing, production, and generation skills. | 7 | - |
| Research & Web Intelligence | Open-web/topic research, multi-source search, and synthesis skills. | 4 | - |
| Writing & Content | Long-form writing, editing, and content-authoring skills (non-marketing). | 4 | - |
| Finance & Trading | Investing, trading, equity research, and market-analysis skills. | 4 | - |
| Docs & Knowledge Base | Documentation, knowledge-base, and notebook/knowledge-graph authoring skills. | 8 | - |
| Presentations & Slide Decks | Slide-deck and presentation generation skills. | 1 | - |
| Data Viz & Diagramming | Chart, infographic, and diagram generation skills. | 3 | - |
| Codebase Understanding & Context Engineering | Skill-level (non-MCP) tools for mapping and explaining a codebase. | 4 | - |
| Localization & Translation | Cross-language translation and localization skills. | 1 | - |
| Career & Job Search | Job search, CV tailoring, and application-tracking skills. | 2 | - |
| Personal Productivity & Lifestyle | Persona distillation, personal knowledge work, and lifestyle skills. | 4 | - |
| Game Development | Skills for building and producing games. | 1 | - |
| Browser & Scraping Automation | Skill/CLI-packaged (non-MCP) browser automation and web scraping. | 2 | - |
| **Subtotal** | | **83** | |

### Infrastructure categories (excluded from domain skill packs)

| Category | Definition | Count |
|---|---|---|
| MCP Integrations | MCP servers connecting agents to external data/tools/APIs, any domain. | 32 |
| Agent Harnesses & Orchestration | Harnesses, multi-agent coordination, fleets, and autonomous execution loops. | 22 |
| Routers & Proxies | LLM/model request routing and API-compatibility proxy layers. | 6 |
| Memory & Context Infra | Cross-session memory, context compression, and persistence layers. | 6 |
| Agent UX, Config & Hooks | Statuslines, hooks, behavior configs, and agent-interface tweaks. | 9 |
| Skill/Plugin Collections & Meta-Frameworks | Multi-domain skill catalogs, marketplaces, and skill-management tooling. | 13 |
| **Subtotal** | | **88** |

**Total: 83 + 88 = 171 repos.**

---

# Domain-skill categories

## Verification & QA (5) — target pack: **opus-pack**

*Testing, validation, code review, spec-compliance, and correctness-checking skills.*

- DietrichGebert/ponytail (★88,054) — YAGNI ruleset plus security/accessibility-aware review and audit commands.
- openai/codex-plugin-cc (★29,705) — Slash commands for read-only and adversarial code review via Codex. [secondary: Agent Harnesses & Orchestration]
- vercel-labs/agent-skills (★29,377) — Audits cost/perf/best-practices/accessibility and reviews docs for Vercel projects.
- truongduy2611/app-store-preflight-skills (★1,303) — Scans iOS/macOS projects for App Store rejection patterns pre-submission.
- matlab/matlab-agentic-toolkit (★818) — Helps agents write, test, and diagnose MATLAB code correctly.

## Security (2) — target pack: **opus-pack (to be split out later)**

*Security audit, pentest, recon, and vulnerability-scanning skills.*

- zhaoxuya520/reverse-skill (★8,790) — Routes tasks to reverse-engineering/pentest/security-research playbooks and toolchains.
- cloudflare/security-audit-skill (★2,621) — Six-phase security-audit pipeline with independently verified findings.

## Roadmap & Spec-Driven Planning (10) — target pack: **opus-pack (to be split out later)**

*Planning, spec-driven dev, task/project management, and roadmapping skills/methodologies.*

- obra/superpowers (★259,655) — Spec-first design, planning, and subagent-driven TDD methodology for coding agents. [secondary: Verification & QA]
- mattpocock/skills (★183,200) — Composable eng skills wired to GitHub/Linear issue-tracking workflows.
- addyosmani/agent-skills (★79,943) — Spec/plan/build/test/review/ship lifecycle skills with quality gates. [secondary: Verification & QA]
- gsd-build/get-shit-done (★64,784) — Meta-prompting, context-engineering, spec-driven development system.
- eyaltoledano/claude-task-master (★27,891) — Task-management system with CLI+MCP to plan and track dev work.
- mindfold-ai/Trellis (★13,051) — Persists specs/tasks/memory through a plan-implement-verify-finish workflow. [secondary: Verification & QA]
- Sahir619/fable-method (★1,783) — Think/act/prove/grow workflow with an adversarial judge-verified eval suite. [secondary: Verification & QA]
- NYCU-Chung/my-claude-devteam (★267) — 12-subagent simulated engineering team coordinating planning through code review. [secondary: Verification & QA]
- s0912758806p/agentic-sop-to-work (★202) — Converts human SOPs into gated, deterministic agentic workflows. [secondary: Verification & QA]
- eagleagentic/superpowers-gpt-5.6 (★52) — GPT-5.6 port of Superpowers' plan/implement/verify skill loop. [secondary: Verification & QA]

## Design (UI/UX & Visual/Motion) (10) — target pack: **design-pack**

*UI/UX, visual, motion, and graphic design skills.*

- nextlevelbuilder/ui-ux-pro-max-skill (★109,130) — Design-intelligence CLI generating tailored UI/UX design systems.
- Leonxlnx/taste-skill (★66,566) — Improves frontend layout, typography, motion, and spacing decisions.
- emilkowalski/skills (★20,012) — Reviews and audits animation/interface-design decisions for agents.
- Nutlope/hallmark (★15,838) — Anti-AI-slop UI design skill with theme selection and slop-test gates.
- greensock/gsap-skills (★12,230) — Teaches agents correct GSAP animation API, timelines, and ScrollTrigger use.
- google-labs-code/stitch-skills (★7,774) — Skills to generate/edit UI designs and extract design systems via Stitch.
- oso95/scroll-world (★4,889) — Builds scroll-scrubbed 3D brand worlds with generated camera-flight video. [secondary: Video Editing & Generation]
- vinhhien112/Three.js-Object-Sculptor-Codex-Plugin (★1,437) — Rebuilds images as procedural, animation-ready Three.js 3D models.
- LottieFiles/motion-design-skill (★734) — Timing/easing/choreography motion-design principles for UI animation.
- GiMi-Xiaomi/gimi-illustration-skill (★475) — Turns article text into whimsical hand-drawn illustration prompts/images.

## Marketing, SEO & Social Content (11)

*Marketing, SEO, ads, growth, and social-content creation/ops skills.*

- coreyhaines31/marketingskills (★41,292) — CRO, copywriting, SEO, analytics, and growth-engineering skill set.
- AgriciDaniel/claude-ads (★7,309) — Paid-media audits, scoring, and campaign plans across 12 ad platforms.
- TheCraigHewitt/seomachine (★7,267) — Workspace for researching, writing, and SEO-optimizing long-form blog content.
- white0dew/XiaohongshuSkills (★3,214) — Automates Xiaohongshu publishing, commenting, and search via CDP. [secondary: Browser & Scraping Automation]
- nowork-studio/NotFair (★3,194) — Goal-driven loop running SEO/GEO/Google Ads/Meta Ads improvement cycles.
- ericosiu/ai-marketing-skills (★3,116) — Growth experiments, sales pipeline, content ops, outbound, and SEO skills.
- nashsu/Viral_Writer_Skill (★684) — Turns a topic into a full social-media article plus image prompts.
- yuwen-cool/yuwen-publish-precheck (★378) — Flags compliance risks and suggests rewrites before social-platform publishing. [secondary: Verification & QA]
- chenjin-cmd/xhs-virtual-product (★217) — Seven-step workflow for creating Xiaohongshu virtual products end to end.
- 843645440/wechat-skill (★68) — WeChat content toolkit: hot-topic discovery, writing, formatting, drafting.
- madebypan/threads-api-skill (★51) — Full-flow toolkit for publishing multi-post Threads content via API.

## Video Editing & Generation (7)

*Video and media editing, production, and generation skills.*

- browser-use/video-use (★17,597) — Transcribes, cuts, color-grades, subtitles, and renders video via ffmpeg.
- bradautomates/claude-video (★9,676) — /watch skill: downloads, extracts frames, transcribes video for Claude.
- songguoxs/seedance-prompt-skill (★2,366) — Generates structured video-generation prompts for ByteDance Seedance 2.0.
- NarratorAI-Studio/narrator-ai-cli-skill (★1,538) — Drives automated movie-narration video production end to end.
- wshuyi/remotion-video-skill (★318) — Programmatic video creation with Remotion, TTS, and music visualization.
- joeseesun/qiaomu-cut-skill (★243) — Agent-native video director: sourcing, bilingual subtitles, branding, ffmpeg render.
- mathruffian-dot/claude-code-video-kit (★7) — Five-stage workflow producing recap/tutorial/social videos via Playwright+FFmpeg.

## Research & Web Intelligence (4)

*Open-web/topic research, multi-source search, and synthesis skills.*

- Panniantong/Agent-Reach (★59,885) — Gives agents read/search access across Twitter, Reddit, YouTube, GitHub.
- mvanhorn/last30days-skill (★53,191) — Multi-source topic research synthesized into a grounded, cited summary.
- PleasePrompto/google-ai-mode-skill (★266) — Token-efficient web research via Google AI Mode with citations. [secondary: Browser & Scraping Automation]
- rolandwonglonam/rw-research-skill (★118) — Twelve skills breaking academic research into verifiable workflow steps.

## Writing & Content (4)

*Long-form writing, editing, and content-authoring skills (non-marketing).*

- op7418/Humanizer-zh (★13,712) — Rewrites text to remove AI-generated writing patterns (Chinese localization).
- lingfengQAQ/webnovel-writer (★6,080) — Keeps characters/foreshadowing/timelines consistent across long-form web-novel writing.
- backtrue/sbir-grants (★200) — Interactive proposal generator for Taiwan SBIR grant applications.
- danyuchn/asd-ste100-skill (★9) — Rewrites ambiguous English into Simplified Technical English for agents. [secondary: Docs & Knowledge Base]

## Finance & Trading (4)

*Investing, trading, equity research, and market-analysis skills.*

- anthropics/financial-services (★33,722) — Reference agents/skills/MCP connectors for banking, equity research, wealth mgmt.
- tradermonty/claude-trading-skills (★2,471) — Structured market review, risk management, and trade-planning checklists.
- star23/Day1Global-Skills (★993) — Earnings, value-investing, sentiment, and macro-liquidity investment-analysis skills.
- rollingSirius/equity-research-skill (★151) — Nine-chapter equity reports with scripted DCF/EPV valuation models.

## Docs & Knowledge Base (8)

*Documentation, knowledge-base, and notebook/knowledge-graph authoring skills.*

- teng-lin/notebooklm-py (★18,094) — Programmatic NotebookLM access for notebook and podcast generation.
- joeseesun/qiaomu-anything-to-notebooklm (★5,613) — Turns many content sources into NotebookLM podcasts/slides/mindmaps. [secondary: Presentations & Slide Decks]
- voidful/hung-yi-lee-skill (★945) — Distills ML lectures into a knowledge graph and teaching-style guide. [secondary: Personal Productivity & Lifestyle]
- joeseesun/qiaomu-knowledge-site-creator (★360) — Generates and deploys a full knowledge-learning website from one sentence.
- Toolsai/notebooklm-studio-Skill (★102) — Turns Codex into a NotebookLM operator producing reports/mindmaps/decks.
- ECPay/ECPay-API-Skill (★97) — Generates ECPay payment-integration code and diagnostics without reading docs.
- destinyfrancis/openclaw-knowledge-distiller (★62) — Converts videos into structured knowledge articles via local ASR. [secondary: MCP Integrations]
- redtear1115/docgrad (★1) — Grades and iteratively fixes repo documentation across five dimensions. [secondary: Verification & QA]

## Presentations & Slide Decks (1)

*Slide-deck and presentation generation skills.*

- mucsbr/ppt-agent-workflow-san (★615) — Plans slide content and converts HTML slides into editable PPTX.

## Data Viz & Diagramming (3)

*Chart, infographic, and diagram generation skills.*

- tt-a1i/archify (★7,023) — Generates architecture/sequence/data-flow diagrams as self-contained HTML.
- coleam00/excalidraw-diagram-skill (★4,183) — Generates Excalidraw diagrams with Playwright-based visual validation.
- antvis/chart-visualization-skills (★438) — Chart generation across 26+ types plus G2/G6 code generators.

## Codebase Understanding & Context Engineering (4)

*Skill-level (non-MCP) tools for mapping and explaining a codebase.*

- Graphify-Labs/graphify (★94,128) — Turns codebase/docs/schemas into a queryable knowledge graph skill.
- Egonex-AI/Understand-Anything (★75,725) — Multi-agent pipeline builds an interactive knowledge graph of a codebase.
- muratcankoylan/Agent-Skills-for-Context-Engineering (★17,384) — Teaches context curation, multi-agent architecture, and memory/tool design.
- repoprompt/repoprompt-ce (★823) — macOS app assembling reviewable codebase context, with an MCP CLI. [secondary: MCP Integrations]

## Localization & Translation (1)

*Cross-language translation and localization skills.*

- joshhu/makeownsrt (★174) — Extracts/transcribes and translates video subtitles into bilingual SRT.

## Career & Job Search (2)

*Job search, CV tailoring, and application-tracking skills.*

- santifer/career-ops (★61,150) — Job-search command center: scan, score, tailor CV, track applications.
- MadsLorentzen/ai-job-search (★25,467) — Scrapes postings, drafts tailored CVs/cover letters, preps interviews.

## Personal Productivity & Lifestyle (4)

*Persona distillation, personal knowledge work, and lifestyle skills.*

- alchaincyf/nuwa-skill (★28,582) — Distills a person's mental models and expression style into a skill. [secondary: Writing & Content]
- titanwings/colleague-skill (★20,466) — Distills a person into a reusable persona skill from chat logs.
- dzcmemory-web/bazi-ziwei-skill (★705) — Deterministic BaZi/Zi Wei astrology chart generator, cultural/entertainment use.
- twhsi/skills (★253) — Weekly-review, FIRE analysis, and publishing workflows for knowledge workers.

## Game Development (1)

*Skills for building and producing games.*

- Donchitos/Claude-Code-Game-Studios (★23,321) — 49 agents/72 skills structuring a full game-dev studio hierarchy.

## Browser & Scraping Automation (2)

*Skill/CLI-packaged (non-MCP) browser automation and web scraping.*

- browserbase/skills (★3,654) — Official browser-automation skills: sessions, tracing, scraping, UI testing.
- apify/agent-skills (★2,288) — Web-scraping/automation skills backed by Apify serverless Actors.

# Infrastructure categories

*These are not domain/task skills — MCP servers, harnesses, routers, memory layers, and agent-UX/meta tooling. Excluded from domain skill packs so they can be tracked/installed separately.*

## MCP Integrations (32)

*MCP servers connecting agents to external data/tools/APIs, any domain.*

- abhigyanpatwari/GitNexus (★44,543) — Client-side code knowledge graph exposed to agents via MCP tools. [secondary: Codebase Understanding & Context Engineering]
- DeusData/codebase-memory-mcp (★34,339) — Tree-sitter code knowledge graph served as sub-ms MCP queries. [secondary: Codebase Understanding & Context Engineering]
- tirth8205/code-review-graph (★25,554) — Structural code graph over MCP/CLI with risk-scored PR reviews. [secondary: Verification & QA]
- czlonkowski/n8n-mcp (★22,380) — Structured access to 2,000+ n8n workflow-automation nodes via MCP.
- googleapis/mcp-toolbox (★16,000) — Open source MCP server connecting agents to SQL/BigQuery/Spanner databases.
- GLips/Figma-Context-MCP (★15,475) — Serves Figma layout/styling data to coding agents via MCP. [secondary: Design (UI/UX & Visual/Motion)]
- epiral/bb-browser (★5,990) — CLI+MCP server controlling real Chrome with your login state. [secondary: Browser & Scraping Automation]
- jacob-bd/notebooklm-mcp-cli (★5,580) — CLI+MCP+skill for programmatic NotebookLM notebook/source management. [secondary: Docs & Knowledge Base]
- tradesdontlie/tradingview-mcp (★5,088) — Connects Claude to TradingView Desktop for chart analysis via MCP.
- jgraph/drawio-mcp (★4,936) — Lets LLMs create/open diagrams in the draw.io editor via MCP. [secondary: Data Viz & Diagramming]
- openclaw/mcporter (★4,817) — TypeScript runtime/CLI/codegen for calling and packaging MCP servers.
- atilaahmettaner/tradingview-mcp (★3,631) — Real-time market data, TA, screeners, backtesting via MCP server.
- KnockOutEZ/wigolo (★3,485) — Local-first web search/fetch/crawl/research layer exposed over MCP. [secondary: Research & Web Intelligence]
- Waishnav/devspace (★3,317) — Self-hosted MCP letting ChatGPT/Claude edit local project files via tunnel.
- louislva/claude-peers-mcp (★2,180) — Local broker letting multiple Claude Code instances message each other. [secondary: Agent Harnesses & Orchestration]
- mediar-ai/terminator (★1,558) — Windows desktop-automation computer-use MCP server with AI recovery.
- refreshdotdev/web-eval-agent (★1,241) — Browser-automation MCP server autonomously testing/debugging web apps. [secondary: Verification & QA]
- iFurySt/RedNote-MCP (★1,077) — MCP server for keyword search and note retrieval on Xiaohongshu.
- symgraph/GhidrAssistMCP (★672) — Exposes Ghidra reverse-engineering analysis to assistants via MCP. [secondary: Security]
- chainbase-labs/Agentkey (★535) — Unified web/social/crypto/on-chain data access plugin and MCP server.
- cablate/mcp-google-map (★399) — Geocoding, routing, places, weather, and timezone tools via MCP.
- agent-next/polymarket-paper-trader (★364) — Paper-trading simulator against live Polymarket order books via MCP. [secondary: Finance & Trading]
- newtype-01/obsidian-mcp (★311) — Read/create/search Obsidian notes via MCP using the REST API. [secondary: Docs & Knowledge Base]
- pwno-io/pwno-mcp (★277) — Containerized GDB/pwndbg exploitation and binary-debugging tooling via MCP. [secondary: Security]
- doggy8088/mcp-cli (★175) — Lightweight Rust CLI/library for calling MCP servers from shell scripts.
- lawchat-oss/mcp-taiwan-legal-db (★161) — Read-only access to Taiwan court judgments and statutes via MCP.
- openfate-ai/openfate-mcp (★97) — Deterministic Bazi/Four Pillars calendrical calculation engine via MCP.
- amikai/openings-mcp (★70) — Searches job boards and company career sites via MCP, no storage. [secondary: Career & Job Search]
- PublicDotCom/publicdotcom-mcp-server (★66) — Connects assistants to a Public.com brokerage account via MCP. [secondary: Finance & Trading]
- PyPtt/ptt_mcp_server (★38) — MCP server automating PTT bulletin-board account/board operations.
- Gratia2533/linkedin-mcp-server (★23) — Searches/scrapes LinkedIn people, companies, and jobs via MCP. [secondary: Career & Job Search]
- h30190/SearchProcurementTenders-crawler.Ver (★14) — Scrapes Taiwan government tender listings for agents via MCP.

## Agent Harnesses & Orchestration (22)

*Harnesses, multi-agent coordination, fleets, and autonomous execution loops.*

- affaan-m/ECC (★232,335) — Cross-harness operator packaging skills, hooks, memory, and security scanning.
- ultraworkers/claw-code (★194,864) — Rust terminal-first agent harness connecting to multiple model backends.
- paperclipai/paperclip (★74,534) — Dashboard orchestrating org-chart teams of coding agents.
- shareAI-lab/learn-claude-code (★71,999) — Educational walkthrough building a minimal agent harness from scratch.
- ruvnet/ruflo (★65,607) — Meta-harness coordinating multi-agent swarms with memory and routing.
- HKUDS/CLI-Anything (★45,869) — Generates agent-native CLI harnesses and a shared community tool hub.
- multica-ai/multica (★41,654) — Platform assigning tasks to agent teammates, tracked from a dashboard.
- Yeachan-Heo/oh-my-claudecode (★37,992) — Multi-agent orchestration for parallel coding tasks.
- Yeachan-Heo/oh-my-codex (★32,185) — Extends Codex with hooks, agent teams, and HUDs.
- iOfficeAI/AionUi (★30,694) — Unified desktop GUI orchestrating 20+ agent CLIs with scheduling.
- stablyai/orca (★26,650) — ADE running many parallel agents in isolated worktrees.
- chenhg5/cc-connect (★14,299) — Bridges local coding agents to chat platforms for remote control.
- diet103/claude-code-infrastructure-showcase (★9,970) — Reference infra: auto-activating skills via hooks, agents, commands.
- frankbria/ralph-claude-code (★9,558) — Autonomous shell loop re-invoking Claude Code with exit detection.
- AgentWrapper/agent-orchestrator (★8,509) — IDE/daemon supervising fleets of agents across CI, PRs, worktrees.
- ChrisWiles/claude-code-showcase (★5,999) — Reference config: hooks, skills, agents, commands, GH Actions workflows.
- fengshao1227/ccg-workflow (★5,752) — Go-bridged workflow engine dispatching work across Codex/Gemini/Claude.
- openabdev/openab (★705) — Broker bridging Discord/Slack to any ACP-compatible coding CLI.
- win4r/openclaw-a2a-gateway (★546) — Gateway implementing the Agent-to-Agent protocol for bidirectional agent comms.
- FootprintAI/Containarium (★265) — Per-agent isolated Linux runtime with SSH, eBPF egress, GPU passthrough. [secondary: MCP Integrations]
- JudyaiLab/ai-night-shift (★221) — Coordinates multiple agents overnight via file-queue and cron scheduling.
- oil-oil/codex-team-mode (★44) — Routes work to Explorer/Executor/Reviewer subagent roles by task type.

## Routers & Proxies (6)

*LLM/model request routing and API-compatibility proxy layers.*

- router-for-me/CLIProxyAPI (★44,389) — Proxy exposing OpenAI/Gemini/Claude/Codex-compatible endpoints for multiple providers.
- musistudio/claude-code-router (★36,110) — Local control plane routing agent requests across models.
- decolua/9router (★23,180) — Local router connecting coding tools to 40+ free/cheap model providers.
- lidge-jun/opencodex (★3,832) — Universal provider proxy letting Codex/Claude Code run on any LLM.
- Toolsai/GPT-Relay-Codex-Plugin- (★54) — Relays Codex prompts to ChatGPT through a browser session.
- zeuikli/claude-pilot-suite (★24) — Cost/quality/ceiling model-tier pilot modes with escalation gates.

## Memory & Context Infra (6)

*Cross-session memory, context compression, and persistence layers.*

- thedotmack/claude-mem (★88,299) — Compresses and persists session history as long-term agent memory.
- headroomlabs-ai/headroom (★61,314) — Context-compression layer shrinking tool output before it reaches the model.
- mksglu/context-mode (★19,205) — Sandboxes tool output and persists session memory via MCP+hooks.
- Martian-Engineering/lossless-claw (★4,891) — DAG-based lossless context/summarization plugin replacing sliding-window compaction.
- activeloopai/hivemind (★1,500) — Mines session traces into reusable skills shared across a team.
- fagemx/edda (★33) — Hash-chained memory ledger capturing decisions across coding sessions.

## Agent UX, Config & Hooks (9)

*Statuslines, hooks, behavior configs, and agent-interface tweaks.*

- multica-ai/andrej-karpathy-skills (★195,514) — Single CLAUDE.md behavior config distilling coding-pitfall principles, not a task skill.
- tanweai/pua (★18,995) — Scripted proactivity/debugging-persistence ruleset, not a task-domain skill.
- ykdojo/claude-code-tips (★9,402) — Usage tips plus a statusline script and everyday-workflow dx plugin.
- nilbuild/claude-statusline (★1,345) — Installer configuring a usage/git-branch Claude Code statusline.
- chrishutchinson/claude-receipts (★622) — SessionEnd hook generating a spend/token receipt per session.
- Nanako0129/coralline (★507) — Powerlevel10k-inspired statusline with git/model/cost/context segments.
- BotchetDig/workout-gate (★216) — Hook blocking prompts until webcam-tracked push-ups/squats are done.
- rossignol6712/claude-code-custom-prompt (★19) — Toolkit replacing Claude Code's default system prompt and templates.
- unixzii/codex-dino-run (★7) — Novelty tweak adding a playable Dino Run game inside Codex.

## Skill/Plugin Collections & Meta-Frameworks (13)

*Multi-domain skill catalogs, marketplaces, and skill-management tooling.*

- msitarzewski/agency-agents (★136,002) — Multi-role persona collection (frontend, social, QA) spanning unrelated domains.
- garrytan/gstack (★123,795) — 23 role-based tools (CEO, Designer, QA) — team-in-a-box, not one domain.
- sickn33/agentic-awesome-skills (★43,747) — Installer/catalog/control-plane for 1,900+ skills — distribution tooling.
- openai/skills (★24,083) — Deprecated catalog of Agent Skills for distribution, not a task skill.
- alirezarezvani/claude-skills (★23,038) — 345 skills spanning engineering, marketing, compliance, advisory — no single domain.
- anthropics/knowledge-work-plugins (★22,967) — 11 role-based plugins (sales, finance, legal, marketing, data) — multi-domain.
- google/skills (★15,116) — Catalog of Google product skills (GKE, BigQuery, ads) spanning many domains.
- Dimillian/CodexSkillManager (★1,352) — macOS app to browse, import, and manage local skills — tooling.
- cline/prompts (★1,189) — Community rules/workflows library browsable inside Cline — generic catalog.
- iannuttall/dotagents (★703) — Symlinks a canonical .agents folder into multiple AI clients — tooling.
- happycapy-ai/Happycapy-skills (★136) — Curated drop-in skills across coding, design, docs, media, research.
- hanamizuki/solopreneur (★104) — Plugin family spanning eng process, marketing, design agents a la carte. [secondary: Roadmap & Spec-Driven Planning]
- alberduris/skills (★16) — Marketplace grab-bag: second opinions, trace queries, Slack reminders.

---

## Multi-fit repos (primary / secondary)

38 of 171 repos genuinely straddle two categories and carry a secondary tag.

| Repo | Primary | Secondary |
|---|---|---|
| obra/superpowers | Roadmap & Spec-Driven Planning | Verification & QA |
| addyosmani/agent-skills | Roadmap & Spec-Driven Planning | Verification & QA |
| abhigyanpatwari/GitNexus | MCP Integrations | Codebase Understanding & Context Engineering |
| DeusData/codebase-memory-mcp | MCP Integrations | Codebase Understanding & Context Engineering |
| openai/codex-plugin-cc | Verification & QA | Agent Harnesses & Orchestration |
| alchaincyf/nuwa-skill | Personal Productivity & Lifestyle | Writing & Content |
| tirth8205/code-review-graph | MCP Integrations | Verification & QA |
| GLips/Figma-Context-MCP | MCP Integrations | Design (UI/UX & Visual/Motion) |
| mindfold-ai/Trellis | Roadmap & Spec-Driven Planning | Verification & QA |
| epiral/bb-browser | MCP Integrations | Browser & Scraping Automation |
| joeseesun/qiaomu-anything-to-notebooklm | Docs & Knowledge Base | Presentations & Slide Decks |
| jacob-bd/notebooklm-mcp-cli | MCP Integrations | Docs & Knowledge Base |
| jgraph/drawio-mcp | MCP Integrations | Data Viz & Diagramming |
| oso95/scroll-world | Design (UI/UX & Visual/Motion) | Video Editing & Generation |
| KnockOutEZ/wigolo | MCP Integrations | Research & Web Intelligence |
| white0dew/XiaohongshuSkills | Marketing, SEO & Social Content | Browser & Scraping Automation |
| louislva/claude-peers-mcp | MCP Integrations | Agent Harnesses & Orchestration |
| Sahir619/fable-method | Roadmap & Spec-Driven Planning | Verification & QA |
| refreshdotdev/web-eval-agent | MCP Integrations | Verification & QA |
| voidful/hung-yi-lee-skill | Docs & Knowledge Base | Personal Productivity & Lifestyle |
| repoprompt/repoprompt-ce | Codebase Understanding & Context Engineering | MCP Integrations |
| symgraph/GhidrAssistMCP | MCP Integrations | Security |
| yuwen-cool/yuwen-publish-precheck | Marketing, SEO & Social Content | Verification & QA |
| agent-next/polymarket-paper-trader | MCP Integrations | Finance & Trading |
| newtype-01/obsidian-mcp | MCP Integrations | Docs & Knowledge Base |
| pwno-io/pwno-mcp | MCP Integrations | Security |
| NYCU-Chung/my-claude-devteam | Roadmap & Spec-Driven Planning | Verification & QA |
| PleasePrompto/google-ai-mode-skill | Research & Web Intelligence | Browser & Scraping Automation |
| FootprintAI/Containarium | Agent Harnesses & Orchestration | MCP Integrations |
| s0912758806p/agentic-sop-to-work | Roadmap & Spec-Driven Planning | Verification & QA |
| hanamizuki/solopreneur | Skill/Plugin Collections & Meta-Frameworks | Roadmap & Spec-Driven Planning |
| amikai/openings-mcp | MCP Integrations | Career & Job Search |
| PublicDotCom/publicdotcom-mcp-server | MCP Integrations | Finance & Trading |
| destinyfrancis/openclaw-knowledge-distiller | Docs & Knowledge Base | MCP Integrations |
| eagleagentic/superpowers-gpt-5.6 | Roadmap & Spec-Driven Planning | Verification & QA |
| Gratia2533/linkedin-mcp-server | MCP Integrations | Career & Job Search |
| danyuchn/asd-ste100-skill | Writing & Content | Docs & Knowledge Base |
| redtear1115/docgrad | Docs & Knowledge Base | Verification & QA |

---

**Verification: 171 repos classified, each with exactly one primary category. Category counts sum to 171.**
