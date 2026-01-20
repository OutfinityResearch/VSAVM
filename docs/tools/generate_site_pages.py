#!/usr/bin/env python3
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Page:
    slug: str
    title: str
    kind: str  # "theory" | "wiki"
    aria: str
    svg: str
    caption: str
    sections: list[tuple[str, str]]
    references: list[tuple[str, str]]


ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs"
ASSETS = DOCS / "assets"
THEORY = DOCS / "theory"
WIKI = DOCS / "wiki"


def html_page(title: str, content: str, prefix: str = "") -> str:
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{title} | VSAVM</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600&family=Space+Grotesk:wght@400;500;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="{prefix}assets/site.css">
  </head>
  <body>
    <div class="site">
      <header class="header">
        <div class="brand">VSAVM</div>
        <nav class="nav">
          <a href="{prefix}index.html">Home</a>
          <a href="{prefix}specs.html">Specs</a>
          <a href="{prefix}theory/index.html">Theory</a>
          <a href="{prefix}wiki/index.html">Wiki</a>
        </nav>
      </header>
      <main class="main content">
        {content}
      </main>
      <footer class="footer">
        VSAVM is an Axiologic Research experiment within the Achilles project. This static documentation is written in clear academic English for engineers.
      </footer>
    </div>
  </body>
</html>
"""


def svg_wrap(viewbox: str, aria: str, body: str) -> str:
    return f"""<svg viewBox="{viewbox}" role="img" aria-label="{aria}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e8f3ff"/>
      <stop offset="1" stop-color="#d6f5e8"/>
    </linearGradient>
    <linearGradient id="deep" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b6eff"/>
      <stop offset="1" stop-color="#16b879"/>
    </linearGradient>
  </defs>
  {body}
</svg>"""


def svg_chip(x: int, y: int, w: int, h: int, text: str) -> str:
    cx = x + w / 2
    cy = y + h / 2 + 4
    return (
        f"""<rect x="{x}" y="{y}" rx="18" ry="18" width="{w}" height="{h}" fill="url(#sky)" stroke="#7fb3e6" stroke-width="2"/>
<text x="{cx}" y="{cy}" text-anchor="middle" font-size="13" fill="#0b1a2b" font-family="Space Grotesk">{text}</text>"""
    )


def svg_arrow(x1: int, y1: int, x2: int, y2: int, color: str = "url(#deep)") -> str:
    return (
        f"""<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="4" stroke-linecap="round"/>
<polygon points="{x2-10},{y2-7} {x2-10},{y2+7} {x2+10},{y2}" fill="#16b879"/>"""
    )


def svg_note(x: int, y: int, w: int, h: int, text: str) -> str:
    cx = x + 16
    cy = y + 22
    return (
        f"""<rect x="{x}" y="{y}" rx="16" ry="16" width="{w}" height="{h}" fill="none" stroke="#7fb3e6" stroke-width="2"/>
<text x="{cx}" y="{cy}" text-anchor="start" font-size="12" fill="#2f4a63" font-family="Space Grotesk">{text}</text>"""
    )


def svg_legend(x: int, y: int, lines: list[str]) -> str:
    height = 24 + 18 * len(lines)
    parts = [
        f'<rect x="{x}" y="{y}" width="360" height="{height}" rx="16" ry="16" fill="none" stroke="#7fb3e6" stroke-width="2"/>',
        f'<text x="{x + 16}" y="{y + 22}" text-anchor="start" font-size="12" fill="#2f4a63" font-family="Space Grotesk">Legend</text>',
    ]
    yy = y + 44
    for line in lines:
        parts.append(
            f'<text x="{x + 16}" y="{yy}" text-anchor="start" font-size="12" fill="#2f4a63" font-family="Space Grotesk">{line}</text>'
        )
        yy += 18
    return "\n".join(parts)


def h2_sections(sections: list[tuple[str, str]]) -> str:
    return "\n".join([f"<h2>{h}</h2>\n<p>{t}</p>" for h, t in sections])


def references_paragraph(references: list[tuple[str, str]]) -> str:
    links = " ".join([f'<a href="{url}">{name}</a>' for name, url in references])
    return f"<h2>References</h2>\n<p>{links}</p>"


def related_wiki_paragraph(prefix: str) -> str:
    return (
        f'<p>Related wiki pages: <a href="{prefix}vm.html">VM</a>, <a href="{prefix}event-stream.html">event stream</a>, '
        f'<a href="{prefix}vsa.html">VSA</a>, <a href="{prefix}bounded-closure.html">bounded closure</a>, '
        f'<a href="{prefix}consistency-contract.html">consistency contract</a>.</p>'
    )


def build_theory_pages() -> list[Page]:
    return [
        Page(
            kind="theory",
            slug="vision",
            title="System vision",
            aria="Diagram of interface, executable VM core, and consistency contract",
            svg=svg_wrap(
                "0 0 900 320",
                "System vision diagram",
                "\n".join(
                    [
                        svg_chip(70, 70, 240, 70, "LLM-like interface"),
                        svg_chip(330, 70, 240, 70, "Executable VM core"),
                        svg_chip(590, 70, 240, 70, "Consistency contract"),
                        svg_arrow(310, 105, 330, 105),
                        svg_arrow(570, 105, 590, 105),
                        svg_chip(240, 170, 520, 70, "Bounded closure gates what may be stated"),
                        svg_arrow(710, 140, 520, 170, color="#0b6eff"),
                        svg_legend(
                            70,
                            255,
                            [
                                "Green arrows: primary runtime flow.",
                                "Blue arrow: contract constrains emission.",
                                "Boxes are subsystems with explicit roles.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="The system vision: a familiar interface backed by executable state, with an explicit contract that governs emission.",
            sections=[
                (
                    "Overview",
                    "VSAVM aims to keep the ergonomics of an LLM-like interface while changing what an answer means internally. Instead of treating understanding as a latent numeric state, the system constructs and executes programs inside an explicit virtual machine. The user experience can remain conversational, but the internal semantics are grounded in execution and trace.",
                ),
                (
                    "Core concepts",
                    "A virtual machine is a state transition engine with explicit memory, instructions, and an execution trace. A consistency contract is a rule that ties output permission to budgeted checks. Bounded closure is the controlled exploration of consequences that turns correctness into a measurable property of search effort rather than a vague promise.",
                ),
                (
                    "Runtime story",
                    "Input is normalized into a structured event stream. Candidate interpretations are compiled into programs and executed to build VM state. Next-phrase generation proposes continuations, but acceptance is gated by closure checks that reject candidates introducing contradictions within scope.",
                ),
                (
                    "Boundary behavior",
                    "When budget is insufficient, the system must degrade honestly. It can emit conditional claims that explicitly depend on assumptions, or it can declare indeterminacy. In both cases, the system avoids substituting fluency for verification by making the exploration boundary explicit.",
                ),
            ],
            references=[
                ("Virtual machine (Wikipedia)", "https://en.wikipedia.org/wiki/Virtual_machine"),
                ("Symbolic execution (Wikipedia)", "https://en.wikipedia.org/wiki/Symbolic_execution"),
                ("Consistency (Wikipedia)", "https://en.wikipedia.org/wiki/Consistency"),
                ("Non-monotonic logic (SEP)", "https://plato.stanford.edu/entries/logic-nonmonotonic/"),
            ],
        ),
        Page(
            kind="theory",
            slug="unified-input",
            title="Unified input representation",
            aria="Diagram of event stream and reversible macro units",
            svg=svg_wrap(
                "0 0 900 340",
                "Unified input representation diagram",
                "\n".join(
                    [
                        svg_chip(70, 45, 760, 60, "Event stream (type + payload + structural context)"),
                        svg_arrow(450, 105, 450, 135),
                        svg_chip(110, 135, 320, 80, "Lexical layer (reversible tokens)"),
                        svg_chip(470, 135, 320, 80, "Phrase layer (reversible macro units)"),
                        svg_arrow(270, 215, 270, 245),
                        svg_arrow(630, 215, 630, 245),
                        svg_chip(110, 245, 320, 65, "Deterministic expansion for scoring"),
                        svg_chip(470, 245, 320, 65, "Stable units for retrieval and schemas"),
                        svg_legend(
                            70,
                            312,
                            [
                                "Structure carries scope across modalities.",
                                "Reversibility prevents semantic drift.",
                                "Representation is shared by the VM.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="A single symbolic substrate supports multimodal inputs while preserving structure, scope, and reversible compression.",
            sections=[
                (
                    "Overview",
                    "Multimodality becomes tractable when all inputs are mapped into a single canonical representation. VSAVM uses an event stream where each event is discrete and typed and carries an explicit structural context. This creates a shared substrate so that execution, closure, and auditing do not fragment across modality-specific pipelines.",
                ),
                (
                    "Terminology",
                    "An event has a type and a discrete payload, plus a context path such as document → section → paragraph → sentence → span. Structural separators are explicit events that delimit scopes for reasoning. Macro units are compressed patterns discovered by learning, but they must remain reversible into lexical events so evaluation and decoding remain deterministic.",
                ),
                (
                    "How it supports reasoning",
                    "Stable structure and scope allow the VM to build local theories and to avoid global inconsistency. The event stream also provides stable indexing hooks for retrieval, schema discovery, and program construction. Reversible compression reduces cost while keeping the ability to reconstruct the exact basis of a claim.",
                ),
                (
                    "Implementation considerations",
                    "Representation fails when boundaries are ambiguous or when compression cannot expand deterministically. VSAVM therefore prioritizes deterministic segmentation and deterministic expansion. This makes later stages predictable and keeps the correctness contract enforceable.",
                ),
            ],
            references=[
                ("Event stream processing (Wikipedia)", "https://en.wikipedia.org/wiki/Event_stream_processing"),
                ("Tokenization (Wikipedia)", "https://en.wikipedia.org/wiki/Tokenization_(lexical_analysis)"),
                ("Multimodal learning (Wikipedia)", "https://en.wikipedia.org/wiki/Multimodal_learning"),
            ],
        ),
        Page(
            kind="theory",
            slug="structure-and-scope",
            title="Structural boundaries and scope",
            aria="Diagram of nested scopes controlling inference",
            svg=svg_wrap(
                "0 0 900 320",
                "Scope diagram",
                "\n".join(
                    [
                        '<rect x="90" y="55" width="720" height="210" rx="26" ry="26" fill="none" stroke="#7fb3e6" stroke-width="3"/>',
                        '<text x="120" y="85" text-anchor="start" font-size="13" fill="#2f4a63" font-family="Space Grotesk">Document scope</text>',
                        '<rect x="150" y="95" width="600" height="160" rx="24" ry="24" fill="none" stroke="#0b6eff" stroke-width="3"/>',
                        '<text x="180" y="125" text-anchor="start" font-size="13" fill="#2f4a63" font-family="Space Grotesk">Section scope</text>',
                        '<rect x="230" y="140" width="440" height="90" rx="20" ry="20" fill="none" stroke="#16b879" stroke-width="3"/>',
                        '<text x="260" y="170" text-anchor="start" font-size="13" fill="#2f4a63" font-family="Space Grotesk">Local context (quote / procedure / paragraph)</text>',
                        svg_legend(
                            90,
                            275,
                            [
                                "Scope defines what can interact under closure.",
                                "Conflicts are meaningful only in-scope.",
                                "Local theories reduce global inconsistency.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="Scope makes contradiction detection meaningful by restricting which facts may interact during closure.",
            sections=[
                (
                    "Overview",
                    "Correctness claims require scope. Real corpora contain incompatible sources, hypothetical statements, and quoted passages. If the system treats all statements as globally active, bounded closure either explodes in contradictions or becomes meaningless because conflicts are ignored.",
                ),
                (
                    "Boundaries as signals",
                    "Structural boundaries include headings, paragraphs, lists, quotes, definitions, and procedural steps. In multimodal inputs, boundaries also include temporal segments and scene changes. VSAVM treats these separators as explicit events so the VM can localize inference without guessing.",
                ),
                (
                    "Scope-aware correctness",
                    "A contradiction is defined canonically as the same fact identifier appearing with opposing polarity inside the same scope. Structural separators define that scope, and the VM carries scope through execution. This enables local theories that remain coherent even when global reconciliation is not possible under budget.",
                ),
                (
                    "Practical outcomes",
                    "Scope enables conditional reasoning across sources. A claim can be robust within a scope while being conditional across scopes. This makes the system useful under real-world inconsistency without abandoning the non-contradiction promise.",
                ),
            ],
            references=[
                ("Scope (computer science) (Wikipedia)", "https://en.wikipedia.org/wiki/Scope_(computer_science)"),
                ("Context (computing) (Wikipedia)", "https://en.wikipedia.org/wiki/Context_(computing)"),
                ("Consistency (Wikipedia)", "https://en.wikipedia.org/wiki/Consistency"),
            ],
        ),
        Page(
            kind="theory",
            slug="training-and-emergence",
            title="Training and emergent compilation",
            aria="Diagram of prediction-search-consolidation loop",
            svg=svg_wrap(
                "0 0 900 320",
                "Training loop diagram",
                "\n".join(
                    [
                        '<circle cx="450" cy="150" r="96" fill="none" stroke="#0b6eff" stroke-width="6"/>',
                        '<path d="M520 70 L555 82 L525 108" fill="#16b879"/>',
                        svg_chip(110, 80, 250, 70, "Next-phrase prediction"),
                        svg_chip(540, 80, 250, 70, "Program search"),
                        svg_chip(325, 210, 250, 70, "Consolidation"),
                        svg_note(110, 165, 330, 48, "Prediction pressure favors compact executable explanations."),
                        svg_note(500, 165, 330, 48, "Search proposes candidate programs; closure rejects unstable ones."),
                        svg_legend(
                            110,
                            270,
                            [
                                "Two loops: predict and search.",
                                "Consolidate repeated winners into macros.",
                                "Consistency signals constrain consolidation.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="Compilation emerges when prediction pressure makes compact executable programs the cheapest explanation for recurring patterns.",
            sections=[
                (
                    "Overview",
                    "VSAVM treats compilation as a learned capability. Next-phrase prediction provides a broad surface prior, but repeated patterns create pressure to represent intent as executable programs that compress the data. This creates a path from language modeling to program induction without hardcoded templates.",
                ),
                (
                    "What emerges and why",
                    "Repeated question forms and reasoning moves become schemas and macro programs because they reduce description length. VSA accelerates the emergence by clustering paraphrases and providing fast retrieval of nearby patterns. The VM provides the semantics by executing candidates and maintaining explicit state.",
                ),
                (
                    "Consolidation",
                    "Consolidation is the point where a candidate program becomes a macro instruction. It improves performance, but it also improves stability because the system can treat the macro as a unit that can be tested, audited, versioned, and federated. Consolidation is therefore an engineering mechanism, not only a learning trick.",
                ),
                (
                    "Risks and mitigations",
                    "Compression can consolidate spurious patterns if prediction alone is the criterion. VSAVM mitigates this by using bounded closure as a validator and by using scope to prevent unstable rules from contaminating unrelated contexts. Rules that cause branching blow-ups or frequent contradictions should be demoted or isolated.",
                ),
            ],
            references=[
                ("Minimum description length (Wikipedia)", "https://en.wikipedia.org/wiki/Minimum_description_length"),
                ("The MDL Book (Grünwald)", "https://www.grunwald.nl/mdlbook/"),
                ("Program synthesis (Wikipedia)", "https://en.wikipedia.org/wiki/Program_synthesis"),
            ],
        ),
        Page(
            kind="theory",
            slug="rl-shaping",
            title="RL as shaping for stable choices",
            aria="Diagram of candidates, signals, and selection policy",
            svg=svg_wrap(
                "0 0 900 320",
                "RL shaping diagram",
                "\n".join(
                    [
                        svg_chip(80, 70, 250, 70, "Candidates"),
                        svg_chip(340, 70, 250, 70, "Signals"),
                        svg_chip(600, 70, 240, 70, "Selection policy"),
                        svg_arrow(330, 105, 340, 105),
                        svg_arrow(590, 105, 600, 105),
                        svg_chip(220, 170, 520, 70, "Penalty when closure reveals in-scope contradictions"),
                        svg_arrow(465, 140, 465, 170, color="#0b6eff"),
                        svg_legend(
                            80,
                            255,
                            [
                                "Actions are coarse: choose a program or mode.",
                                "Signals are derived from consistency checks.",
                                "RL is a tiebreaker and stability prior.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="RL provides shaping signals for discrete choices, prioritizing candidates that remain stable under bounded closure.",
            sections=[
                (
                    "Overview",
                    "VSAVM uses RL as shaping rather than as a replacement for language training. The system often faces multiple plausible candidate programs or response modes. A learned preference can bias selection toward candidates that have historically remained consistent under closure.",
                ),
                (
                    "What is optimized",
                    "The action space is intentionally small: selecting among candidate programs, schemas, or response modes. This avoids token-level RL, which is expensive and difficult to audit. Each action corresponds to a semantic decision that can be logged and evaluated.",
                ),
                (
                    "Signals and discipline",
                    "Bounded closure naturally provides negative feedback when contradictions are detected. Additional shaping can penalize branching blow-ups and reward compact programs. The resulting preferences steer search toward stable solutions without overriding the explicit consistency gate.",
                ),
                (
                    "Trade-offs",
                    "Shaping can overfit to a narrow verifier if the verifier does not reflect the real failure modes. The safe approach is to keep RL as a stability prior while maintaining the correctness guarantee in explicit closure checks and deterministic boundary behavior.",
                ),
            ],
            references=[
                ("Reinforcement learning (Wikipedia)", "https://en.wikipedia.org/wiki/Reinforcement_learning"),
                ("Sutton & Barto (book)", "http://incompleteideas.net/book/the-book-2nd.html"),
                ("Multi-armed bandit (Wikipedia)", "https://en.wikipedia.org/wiki/Multi-armed_bandit"),
            ],
        ),
        Page(
            kind="theory",
            slug="question-compilation",
            title="Question compilation pipeline",
            aria="Diagram of normalize-retrieve-fill-compile with beam evaluation",
            svg=svg_wrap(
                "0 0 900 340",
                "Question compilation diagram",
                "\n".join(
                    [
                        svg_chip(80, 60, 180, 70, "Normalize"),
                        svg_chip(280, 60, 180, 70, "Retrieve"),
                        svg_chip(480, 60, 180, 70, "Fill slots"),
                        svg_chip(680, 60, 180, 70, "Program"),
                        svg_arrow(260, 95, 280, 95),
                        svg_arrow(460, 95, 480, 95),
                        svg_arrow(660, 95, 680, 95),
                        svg_chip(210, 170, 480, 70, "Beam: evaluate fit and early consistency"),
                        svg_arrow(570, 130, 450, 170, color="#0b6eff"),
                        svg_legend(
                            80,
                            260,
                            [
                                "Retrieval narrows search surface (VSA).",
                                "Slot filling stays discrete and auditable.",
                                "Beam keeps ambiguity explicit under budget.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="Questions are compiled into executable programs through explicit stages, with ambiguity managed by beam evaluation and consistency checks.",
            sections=[
                (
                    "Overview",
                    "A question is treated as a request to produce an executable query program. The pipeline is explicit to support audit and control: normalization creates a structured span, retrieval proposes candidate schemas, slot filling binds discrete values, and compilation emits a program in the VM instruction set.",
                ),
                (
                    "Retrieval and slot filling",
                    "Retrieval uses VSA to propose nearby schemas and macro programs. Slot filling binds entities, roles, and references using discrete matching and coreference heuristics, augmented by associative retrieval. The result is an executable artifact rather than a textual template.",
                ),
                (
                    "Managing ambiguity",
                    "Instead of forcing a single interpretation, VSAVM carries multiple candidate programs in a beam. Candidates are evaluated by explanatory fit and by early closure checks that detect contradictions. This makes uncertainty explicit and supports conditional outputs when necessary.",
                ),
                (
                    "Engineering implications",
                    "Because compilation is explicit, it is testable. You can measure how often a schema is retrieved, how often slot filling is ambiguous, and how often a candidate fails under closure. These metrics can guide consolidation and improve robustness over time.",
                ),
            ],
            references=[
                ("Program synthesis (Wikipedia)", "https://en.wikipedia.org/wiki/Program_synthesis"),
                ("Beam search (Wikipedia)", "https://en.wikipedia.org/wiki/Beam_search"),
                ("Information retrieval (Wikipedia)", "https://en.wikipedia.org/wiki/Information_retrieval"),
            ],
        ),
        Page(
            kind="theory",
            slug="controlled-generation",
            title="Controlled generation with closure gating",
            aria="Diagram of proposal, simulation, closure check, acceptance",
            svg=svg_wrap(
                "0 0 900 340",
                "Controlled generation diagram",
                "\n".join(
                    [
                        svg_chip(80, 70, 260, 70, "Propose phrases"),
                        svg_chip(360, 70, 240, 70, "Simulate"),
                        svg_chip(620, 70, 200, 70, "Accept"),
                        svg_arrow(340, 105, 360, 105),
                        svg_arrow(600, 105, 620, 105),
                        svg_chip(210, 170, 480, 70, "Gate: bounded closure rejects contradictions"),
                        svg_arrow(480, 140, 450, 170, color="#0b6eff"),
                        svg_note(210, 250, 580, 48, "Increasing budget deepens closure and changes what can be claimed."),
                        svg_legend(
                            80,
                            295,
                            [
                                "Generation is proposal + verification.",
                                "Closure is a gate, not an afterthought.",
                                "Budget controls robustness vs cost.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="Generation is treated as proposal followed by verification: candidates must pass closure-based consistency checks before being emitted.",
            sections=[
                (
                    "Overview",
                    "VSAVM does not treat generation as free-form continuation. Candidates are proposed by learned distributions and schema constraints, but they must be verified against the VM state. This prevents the surface generator from introducing unsupported claims that violate correctness.",
                ),
                (
                    "Candidate sources",
                    "Candidates can come from a discrete language model over macro units, from the active schema, and from VSA retrieval of similar completions. The LM provides fluency, the schema provides structure, and VSA provides pattern-driven recall. The acceptance gate is what prevents any source from dominating truth.",
                ),
                (
                    "Closure gating",
                    "Before accepting a candidate, the system simulates its effect and runs a local bounded closure to detect contradictions. If contradictions are detected, the candidate is rejected in strict mode. If exploration is incomplete, the system can emit a conditional result rather than an unconditional claim.",
                ),
                (
                    "Budget as user-controlled effort",
                    "When a user asks the system to think more, the budget increases. This increases the depth or breadth of closure and therefore changes what is safe to claim. The system should surface that budget explicitly because it defines the strength of the response.",
                ),
            ],
            references=[
                ("Beam search (Wikipedia)", "https://en.wikipedia.org/wiki/Beam_search"),
                ("Transitive closure (Wikipedia)", "https://en.wikipedia.org/wiki/Transitive_closure"),
                ("Verification and validation (Wikipedia)", "https://en.wikipedia.org/wiki/Verification_and_validation"),
            ],
        ),
        Page(
            kind="theory",
            slug="decoding",
            title="Faithful surface realization",
            aria="Diagram of VM results mapped to constrained output forms",
            svg=svg_wrap(
                "0 0 900 320",
                "Decoding diagram",
                "\n".join(
                    [
                        svg_chip(90, 70, 300, 70, "VM result (object + trace)"),
                        svg_chip(410, 70, 220, 70, "Surface plan"),
                        svg_chip(650, 70, 160, 70, "Output"),
                        svg_arrow(390, 105, 410, 105),
                        svg_arrow(630, 105, 650, 105),
                        svg_chip(210, 170, 520, 70, "Constraint: do not add facts not in VM state"),
                        svg_arrow(520, 140, 520, 170, color="#0b6eff"),
                        svg_legend(
                            90,
                            255,
                            [
                                "VM state is the source of truth.",
                                "Realization controls wording, not content.",
                                "Output can be text or event stream.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="Decoding is a constrained realization: it can choose phrasing, but it must not invent facts beyond the VM state and trace.",
            sections=[
                (
                    "Overview",
                    "Decoding is a common place where systems silently reintroduce hallucinations. VSAVM treats decoding as surface realization of internal objects. If the VM did not derive a fact, the realizer is not allowed to state it as true.",
                ),
                (
                    "What is realized",
                    "The VM can produce a verdict, a structured object, a plan, or an execution trace. The realizer converts these internal objects into a requested surface form such as prose, a structured event stream, or a report. The emphasis is on fidelity: every factual sentence corresponds to an internal artifact.",
                ),
                (
                    "Why constraints matter",
                    "Without constraints, a fluent realizer can add plausible details that were never derived. Constraints turn the correctness contract into an end-to-end property: not only is the internal reasoning checked, but the emitted text is guaranteed to be a rendering of checked state rather than an additional source of information.",
                ),
                (
                    "Audit and user trust",
                    "Faithful realization supports audit. When the user asks why a claim was made, the system can point to the underlying fact identifiers and trace steps. When it cannot justify a claim, it must degrade to conditional or indeterminate outputs rather than inventing.",
                ),
            ],
            references=[
                ("Natural language generation (Wikipedia)", "https://en.wikipedia.org/wiki/Natural_language_generation"),
                ("Explainable AI (Wikipedia)", "https://en.wikipedia.org/wiki/Explainable_artificial_intelligence"),
                ("Verification and validation (Wikipedia)", "https://en.wikipedia.org/wiki/Verification_and_validation"),
            ],
        ),
        Page(
            kind="theory",
            slug="correctness-and-closure",
            title="Operational correctness via bounded closure",
            aria="Diagram of canonicalization, closure, and conflict detection",
            svg=svg_wrap(
                "0 0 900 340",
                "Correctness diagram",
                "\n".join(
                    [
                        svg_chip(80, 70, 240, 70, "Canonicalize"),
                        svg_chip(340, 70, 240, 70, "Close (bounded)"),
                        svg_chip(600, 70, 240, 70, "Detect conflicts"),
                        svg_arrow(320, 105, 340, 105),
                        svg_arrow(580, 105, 600, 105),
                        svg_chip(180, 170, 540, 70, "Conflict = same fact_id with opposite polarity in same scope"),
                        svg_arrow(480, 140, 480, 170, color="#0b6eff"),
                        svg_note(180, 250, 610, 48, "Budgets define what was checked and therefore what may be stated."),
                        svg_legend(
                            80,
                            295,
                            [
                                "Canonical IDs make contradictions comparable.",
                                "Scope makes contradictions meaningful.",
                                "Budgets define claim strength.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="Correctness is operational: canonical facts plus bounded closure plus scope-aware conflict detection define what can be safely emitted.",
            sections=[
                (
                    "Overview",
                    "Correctness in VSAVM is not a vague aspiration; it is a contract. The system is allowed to emit a conclusion only if bounded closure does not reveal contradictions within the configured budget and scope. This makes the cost of correctness explicit and configurable.",
                ),
                (
                    "Canonical facts and negation",
                    "Contradictions cannot be reliably detected at the text level. VSAVM maps assertions into canonical fact identifiers with typed slots and explicit polarity. Different surface forms can map to the same canonical identifier, making paraphrase-invariant conflict checks possible.",
                ),
                (
                    "Bounded closure and exploration",
                    "Closure applies rules and macro programs to derive consequences. It is bounded by depth, branching, steps, or time, and therefore it is incomplete by design. The important property is honesty: the system ties claim strength to the budget and can downgrade to conditional results when exploration is insufficient.",
                ),
                (
                    "Practical auditing",
                    "A correctness claim is only meaningful if it is auditable. VSAVM logs the closure budget, explored branches, applied rules, and detected conflicts. This allows the system to produce operational explanations that are traces of what was executed rather than post-hoc narratives.",
                ),
            ],
            references=[
                ("Consistency (Wikipedia)", "https://en.wikipedia.org/wiki/Consistency"),
                ("Transitive closure (Wikipedia)", "https://en.wikipedia.org/wiki/Transitive_closure"),
                ("Non-monotonic logic (SEP)", "https://plato.stanford.edu/entries/logic-nonmonotonic/"),
            ],
        ),
        Page(
            kind="theory",
            slug="vm-core",
            title="The VM core and retrieval interaction",
            aria="Diagram of VM components and a retrieval sidecar",
            svg=svg_wrap(
                "0 0 900 340",
                "VM architecture diagram",
                "\n".join(
                    [
                        '<rect x="90" y="55" width="540" height="220" rx="26" ry="26" fill="none" stroke="#0b6eff" stroke-width="3"/>',
                        '<text x="120" y="85" text-anchor="start" font-size="13" fill="#2f4a63" font-family="Space Grotesk">VM core</text>',
                        svg_chip(130, 105, 210, 60, "Fact store"),
                        svg_chip(360, 105, 210, 60, "Rule memory"),
                        svg_chip(130, 180, 210, 60, "Context stack"),
                        svg_chip(360, 180, 210, 60, "Execution log"),
                        '<rect x="670" y="85" width="160" height="190" rx="26" ry="26" fill="none" stroke="#16b879" stroke-width="3"/>',
                        '<text x="690" y="115" text-anchor="start" font-size="13" fill="#2f4a63" font-family="Space Grotesk">Retrieval</text>',
                        svg_chip(690, 130, 120, 55, "VSA"),
                        svg_chip(690, 195, 120, 55, "Top-K"),
                        svg_arrow(630, 170, 670, 170),
                        svg_legend(
                            90,
                            285,
                            [
                                "VM is the authority via execution.",
                                "Retrieval proposes; VM validates.",
                                "Logs enable audit and debugging.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="A compact VM core remains the authority; retrieval accelerates candidate selection without changing semantics.",
            sections=[
                (
                    "Overview",
                    "The VM is the system’s semantic core. It stores facts, rules, contexts, and traces and executes programs to construct state. Retrieval exists to reduce search cost by proposing candidates, but it does not decide what is true.",
                ),
                (
                    "Minimalism and typing",
                    "A small, typed instruction set reduces absurd combinations and branching blow-ups. The VM needs primitives for canonicalization, matching, branching, context management, and conflict checks. Typed slots and typed terms reduce combinatorial exploration and improve trace readability.",
                ),
                (
                    "How retrieval interacts",
                    "VSA provides similarity-driven shortlists of schemas and macro programs. These shortlists are inputs to search and compilation, not outputs of truth. Every retrieved candidate must be validated by execution and closure to preserve the correctness contract under noise and paraphrase variation.",
                ),
                (
                    "Engineering benefits",
                    "The explicit VM core makes it possible to unit test rules, regression test closure behavior, and audit decisions. Retrieval can be swapped or improved without changing semantics, because semantics are enforced by the VM and contract rather than by similarity ranking.",
                ),
            ],
            references=[
                ("Symbolic execution (Wikipedia)", "https://en.wikipedia.org/wiki/Symbolic_execution"),
                ("Vector symbolic architecture (Wikipedia)", "https://en.wikipedia.org/wiki/Vector_symbolic_architecture"),
                ("Execution trace (Wikipedia)", "https://en.wikipedia.org/wiki/Trace_(software)"),
            ],
        ),
        Page(
            kind="theory",
            slug="consistency-contract",
            title="Consistency contract and boundary behavior",
            aria="Diagram of budgets, closure, and response modes",
            svg=svg_wrap(
                "0 0 900 340",
                "Contract diagram",
                "\n".join(
                    [
                        svg_chip(80, 70, 240, 70, "Budgets"),
                        svg_chip(340, 70, 240, 70, "Closure"),
                        svg_chip(600, 70, 240, 70, "Emission rules"),
                        svg_arrow(320, 105, 340, 105),
                        svg_arrow(580, 105, 600, 105),
                        svg_chip(160, 170, 580, 70, "Modes: strict, conditional, indeterminate"),
                        svg_arrow(470, 140, 470, 170, color="#0b6eff"),
                        svg_note(160, 250, 640, 48, "The system reports what was checked, not just what it predicts."),
                        svg_legend(
                            80,
                            295,
                            [
                                "Budgets define exploration boundaries.",
                                "Emission depends on closure outcome.",
                                "Boundary behavior is explicit and repeatable.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="The contract makes boundary behavior explicit by tying emission to budgeted closure and named response modes.",
            sections=[
                (
                    "Overview",
                    "The consistency contract defines what the system is allowed to emit and under what conditions. It formalizes budgets, closure behavior, and response modes. Without such a contract, the system cannot make honest claims about correctness.",
                ),
                (
                    "Budgets and monotonicity",
                    "Budgets include depth, branching, steps, and optionally time. These parameters define exploration coverage and therefore the strength of a conclusion. Increasing budget should not merely increase confidence; it should reveal more consequences and potentially uncover conflicts, making the system more honest rather than more fluent.",
                ),
                (
                    "Response modes",
                    "Strict mode emits only what remains consistent across explored branches. Conditional mode emits conclusions tied to explicit assumptions or branches. Indeterminate mode is returned when the system cannot justify a conclusion under the given budget. These modes are semantic commitments that prevent the system from pretending certainty.",
                ),
                (
                    "Auditability",
                    "The contract implies logs and metadata: budget used, branches explored, rules applied, and conflicts detected. This allows operational explanations and makes the system testable. It also provides a practical mechanism to debug where and why reasoning fails.",
                ),
            ],
            references=[
                ("Consistency (Wikipedia)", "https://en.wikipedia.org/wiki/Consistency"),
                ("Verification and validation (Wikipedia)", "https://en.wikipedia.org/wiki/Verification_and_validation"),
                ("Non-monotonic logic (SEP)", "https://plato.stanford.edu/entries/logic-nonmonotonic/"),
            ],
        ),
        Page(
            kind="theory",
            slug="state-space-geometry",
            title="State-space geometry and conceptual regions",
            aria="Diagram of VM states, transitions, and regions",
            svg=svg_wrap(
                "0 0 900 340",
                "State space diagram",
                "\n".join(
                    [
                        '<ellipse cx="300" cy="185" rx="240" ry="125" fill="none" stroke="#7fb3e6" stroke-width="3"/>',
                        '<ellipse cx="650" cy="170" rx="230" ry="125" fill="none" stroke="#16b879" stroke-width="3"/>',
                        '<text x="300" y="70" text-anchor="middle" font-size="12" fill="#2f4a63" font-family="Space Grotesk">Region A (constraints)</text>',
                        '<text x="650" y="60" text-anchor="middle" font-size="12" fill="#2f4a63" font-family="Space Grotesk">Region B (constraints)</text>',
                        '<circle cx="240" cy="185" r="12" fill="#0b6eff"/>',
                        '<circle cx="360" cy="220" r="12" fill="#0b6eff"/>',
                        '<circle cx="610" cy="170" r="12" fill="#16b879"/>',
                        '<circle cx="715" cy="205" r="12" fill="#16b879"/>',
                        '<line x1="252" y1="185" x2="348" y2="220" stroke="url(#deep)" stroke-width="4" stroke-linecap="round"/>',
                        '<line x1="372" y1="220" x2="598" y2="170" stroke="url(#deep)" stroke-width="4" stroke-linecap="round"/>',
                        '<line x1="622" y1="170" x2="703" y2="205" stroke="url(#deep)" stroke-width="4" stroke-linecap="round"/>',
                        '<text x="470" y="155" text-anchor="middle" font-size="12" fill="#2f4a63" font-family="Space Grotesk">instructions are transitions</text>',
                        svg_legend(
                            90,
                            270,
                            [
                                "Nodes are VM states.",
                                "Edges are instruction transitions.",
                                "Regions are conceptual constraints.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="The relevant geometry is the VM state graph: concepts appear as regions stabilized by constraints, not as points in an embedding space.",
            sections=[
                (
                    "Overview",
                    "A geometric interpretation of VSAVM is best expressed in the VM state space. Each instruction is a state transition, and reasoning is a path through this graph under constraints. This makes thinking more equivalent to exploring more of the reachable neighborhood.",
                ),
                (
                    "Concepts as regions",
                    "A concept is not a single vector; it is a region of states that share invariants. For example, a contradiction is a region where opposing polarities for the same canonical fact identifier coexist in scope. A definition is a region where new identifiers and constraints are introduced with structural scope markers.",
                ),
                (
                    "Two geometries",
                    "VSA provides an auxiliary geometry of similarity over surface forms that accelerates retrieval. The VM provides the geometry of consequences and conflicts. Separating these prevents the system from equating resemblance with truth while still benefiting from fast candidate selection.",
                ),
                (
                    "Budgets as resolution",
                    "Budgets define exploration depth and breadth. Small budgets yield shallow checks; larger budgets reveal deeper consequences and more conflicts. This makes the system’s certainty a function of explored coverage rather than a stylistic tone.",
                ),
            ],
            references=[
                ("Conceptual spaces (Wikipedia)", "https://en.wikipedia.org/wiki/Conceptual_spaces"),
                ("State space (Wikipedia)", "https://en.wikipedia.org/wiki/State_space"),
                ("Graph traversal (Wikipedia)", "https://en.wikipedia.org/wiki/Graph_traversal"),
            ],
        ),
        Page(
            kind="theory",
            slug="federated-modules",
            title="Federated growth of modules",
            aria="Diagram of clients aggregating artifacts into a shared library",
            svg=svg_wrap(
                "0 0 900 340",
                "Federation diagram",
                "\n".join(
                    [
                        svg_chip(90, 70, 200, 60, "Client A"),
                        svg_chip(90, 150, 200, 60, "Client B"),
                        svg_chip(90, 230, 200, 60, "Client C"),
                        svg_chip(360, 140, 240, 80, "Aggregation"),
                        svg_chip(650, 120, 200, 80, "Shared library"),
                        svg_chip(650, 215, 200, 80, "Health checks"),
                        svg_arrow(290, 100, 360, 180),
                        svg_arrow(290, 180, 360, 180),
                        svg_arrow(290, 260, 360, 180),
                        svg_arrow(600, 180, 650, 160),
                        svg_arrow(750, 200, 750, 215, color="#0b6eff"),
                        svg_legend(
                            360,
                            285,
                            [
                                "Share artifacts, not raw data.",
                                "Validate rules before promotion.",
                                "Keep the consistency contract global.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="Federation shares discrete artifacts such as counts and prototypes and uses health checks to prevent polluted rule libraries.",
            sections=[
                (
                    "Overview",
                    "Federation becomes practical when what is learned is modular. VSAVM learns discrete objects such as macro programs, schemas, and prototypes that can be shared as artifacts rather than as opaque parameter deltas. This supports incremental growth without exposing raw corpora.",
                ),
                (
                    "What is shared",
                    "Clients can share filtered discrete statistics, VSA prototypes, and macro-program metadata such as utility and conflict rate. Hypervectors themselves can be deterministic and therefore need not be transmitted. Prototypes and rule candidates can be merged and deduplicated at the artifact level.",
                ),
                (
                    "Governance and safety",
                    "A wrong rule can pollute the global library. VSAVM mitigates this by requiring the same consistency contract as an admission gate: candidate rules and macros must pass health checks that detect contradiction explosion or uncontrolled branching. This resembles unit testing for learned rules.",
                ),
                (
                    "Why modularity helps engineering",
                    "Artifacts can be versioned, rolled back, and scoped. Domain-specific libraries can be maintained separately. This is easier than interpreting dense gradient updates and enables more transparent governance for research deployments.",
                ),
            ],
            references=[
                ("Federated learning (Wikipedia)", "https://en.wikipedia.org/wiki/Federated_learning"),
                ("Differential privacy (Wikipedia)", "https://en.wikipedia.org/wiki/Differential_privacy"),
                ("Knowledge base (Wikipedia)", "https://en.wikipedia.org/wiki/Knowledge_base"),
            ],
        ),
        Page(
            kind="theory",
            slug="trust-and-transparency",
            title="Trust and transparency",
            aria="Diagram of trace, checks, and disclosure",
            svg=svg_wrap(
                "0 0 900 320",
                "Trust diagram",
                "\n".join(
                    [
                        svg_chip(90, 70, 240, 70, "Execution trace"),
                        svg_chip(350, 70, 240, 70, "Consistency checks"),
                        svg_chip(610, 70, 200, 70, "Disclosure"),
                        svg_arrow(330, 105, 350, 105),
                        svg_arrow(590, 105, 610, 105),
                        svg_chip(210, 170, 520, 70, "User-visible: budgets, branches, conflicts, mode"),
                        svg_arrow(470, 140, 470, 170, color="#0b6eff"),
                        svg_legend(
                            90,
                            255,
                            [
                                "Trust is operational, not rhetorical.",
                                "Expose what was explored under budget.",
                                "Separate robust from conditional claims.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="Trust is earned by tying outputs to traces and checks and by disclosing budget and mode rather than projecting confidence.",
            sections=[
                (
                    "Overview",
                    "Trustworthy behavior is achieved by changing what the system is allowed to emit. VSAVM does not aim to be cautious by tone; it aims to be constrained by computation. If a claim cannot be justified under closure, it must not be stated as robust.",
                ),
                (
                    "Reducing hallucinations",
                    "Hallucinations are often failures of emission discipline. VSAVM prevents this by requiring that factual sentences correspond to canonical facts or explicit derivations. The surface realizer can explain what happened, but it cannot introduce new claims beyond VM state and trace.",
                ),
                (
                    "Explainability as audit",
                    "Explanations are operational. The system can report the budget used, the number of explored branches, the rules applied, and any conflicts detected. This avoids post-hoc narratives that sound plausible but are not connected to the actual computation.",
                ),
                (
                    "Limits and honest uncertainty",
                    "Bounded closure is incomplete by design. The promise is not absolute truth; it is honesty about what was checked. When budget is insufficient, VSAVM degrades to conditional or indeterminate outputs and can suggest increasing budget if the user wants stronger guarantees.",
                ),
            ],
            references=[
                ("Explainable AI (Wikipedia)", "https://en.wikipedia.org/wiki/Explainable_artificial_intelligence"),
                ("Verification and validation (Wikipedia)", "https://en.wikipedia.org/wiki/Verification_and_validation"),
                ("AI alignment (Wikipedia)", "https://en.wikipedia.org/wiki/AI_alignment"),
            ],
        ),
    ]


def build_wiki_pages() -> list[Page]:
    def wiki(
        slug: str,
        title: str,
        aria: str,
        svg: str,
        caption: str,
        definition: str,
        role: str,
        mechanics: str,
        further: str,
        references: list[tuple[str, str]],
    ) -> Page:
        return Page(
            kind="wiki",
            slug=slug,
            title=title,
            aria=aria,
            svg=svg,
            caption=caption,
            sections=[
                ("Definition", definition),
                ("Role in VSAVM", role),
                ("Mechanics and implications", mechanics),
                ("Further reading", further),
            ],
            references=references,
        )

    return [
        wiki(
            slug="vm",
            title="Virtual Machine (VM)",
            aria="Diagram of VM components: facts, rules, contexts, trace",
            svg=svg_wrap(
                "0 0 900 320",
                "VM diagram",
                "\n".join(
                    [
                        '<rect x="90" y="55" width="720" height="205" rx="26" ry="26" fill="none" stroke="#0b6eff" stroke-width="3"/>',
                        '<text x="120" y="85" text-anchor="start" font-size="13" fill="#2f4a63" font-family="Space Grotesk">VM state</text>',
                        svg_chip(130, 105, 210, 60, "Fact store"),
                        svg_chip(360, 105, 210, 60, "Rule library"),
                        svg_chip(590, 105, 180, 60, "Contexts"),
                        svg_chip(130, 180, 300, 60, "Typed bindings"),
                        svg_chip(450, 180, 320, 60, "Execution trace"),
                        svg_legend(
                            90,
                            270,
                            [
                                "State is explicit and inspectable.",
                                "Instructions transform state.",
                                "Trace supports audit and debugging.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="The VM is the executable core that makes reasoning explicit through state and trace.",
            definition="A virtual machine is an abstract execution engine that runs programs over a defined state. In VSAVM, the VM is the concrete core that holds canonical facts, applies rules, and records execution traces.",
            role="The VM provides the state that conditions generation and enforces the consistency contract by running bounded closure and detecting conflicts. It is the authority: retrieval proposes candidates, but the VM decides acceptability via execution.",
            mechanics="Because the VM state is discrete, VSAVM can attach stable identifiers to claims and scope. This allows deterministic conflict checks, repeatable boundary behavior, and operational explanations derived from traces instead of from post-hoc narratives.",
            further="Virtual machines and symbolic execution provide foundational ideas for explicit state transitions and branching exploration. VSAVM adapts these ideas for reasoning under budgets and scope.",
            references=[
                ("Virtual machine (Wikipedia)", "https://en.wikipedia.org/wiki/Virtual_machine"),
                ("Symbolic execution (Wikipedia)", "https://en.wikipedia.org/wiki/Symbolic_execution"),
                ("Trace (software) (Wikipedia)", "https://en.wikipedia.org/wiki/Trace_(software)"),
            ],
        ),
        wiki(
            slug="vsa",
            title="Vector Symbolic Architecture (VSA)",
            aria="Diagram of VSA similarity shortlist feeding VM validation",
            svg=svg_wrap(
                "0 0 900 320",
                "VSA diagram",
                "\n".join(
                    [
                        svg_chip(90, 70, 240, 70, "Hypervectors"),
                        svg_chip(350, 70, 240, 70, "Similarity (top-K)"),
                        svg_chip(610, 70, 200, 70, "Candidates"),
                        svg_arrow(330, 105, 350, 105),
                        svg_arrow(590, 105, 610, 105),
                        svg_chip(220, 170, 520, 70, "Validate by execution + bounded closure"),
                        svg_arrow(710, 140, 560, 170, color="#0b6eff"),
                        svg_legend(
                            90,
                            255,
                            [
                                "Similarity is not truth.",
                                "Top-K bounds the search surface.",
                                "VM remains the authority.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="VSA accelerates retrieval; the VM validates candidates under the consistency contract.",
            definition="Vector Symbolic Architecture represents symbols as high-dimensional vectors and supports operations such as binding and bundling. It functions as an associative index for fast retrieval and clustering.",
            role="VSA reduces combinatorial search by shortlisting schemas and macro programs similar to a given span. It guides what the system explores under budget without deciding truth.",
            mechanics="VSAVM treats VSA output as proposals. Candidates are executed in the VM and checked under bounded closure. This separation preserves correctness: similarity accelerates search, but execution determines acceptability.",
            further="Hyperdimensional computing and VSA surveys provide background on why high-dimensional representations support robust associative behavior. In VSAVM, these methods are used as search accelerators rather than as semantic authorities.",
            references=[
                ("Vector symbolic architecture (Wikipedia)", "https://en.wikipedia.org/wiki/Vector_symbolic_architecture"),
                ("Hyperdimensional computing (Wikipedia)", "https://en.wikipedia.org/wiki/Hyperdimensional_computing"),
                ("Nearest neighbor search (Wikipedia)", "https://en.wikipedia.org/wiki/Nearest_neighbor_search"),
            ],
        ),
        wiki(
            slug="event-stream",
            title="Event stream",
            aria="Diagram of typed events, payload, and context",
            svg=svg_wrap(
                "0 0 900 320",
                "Event stream diagram",
                "\n".join(
                    [
                        svg_chip(90, 70, 240, 70, "Typed events"),
                        svg_chip(350, 70, 240, 70, "Discrete payload"),
                        svg_chip(610, 70, 240, 70, "Context path"),
                        svg_arrow(330, 105, 350, 105),
                        svg_arrow(590, 105, 610, 105),
                        svg_chip(210, 170, 540, 70, "Separators define scope for closure"),
                        svg_arrow(480, 140, 480, 170, color="#0b6eff"),
                        svg_legend(
                            90,
                            255,
                            [
                                "One substrate for all modalities.",
                                "Context encodes scope.",
                                "Scope enables contradiction checks.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="The event stream is the canonical, scoped input substrate for VSAVM.",
            definition="An event stream is an ordered sequence of typed, discrete events. In VSAVM, each event includes a payload and a structural context path that preserves scope and boundaries.",
            role="The event stream unifies text and multimodal inputs so that the VM and bounded closure operate on a single representation. It is the foundation for schema discovery, program compilation, and scope-aware conflict detection.",
            mechanics="Structural separators are explicit events that delimit where a fact applies. By keeping structure in the representation, the system can maintain local theories and avoid global inconsistency while still enforcing correctness within scope.",
            further="Event stream processing is a broad topic. VSAVM uses the term in a representational sense: explicit structure and discrete units that support deterministic parsing and auditing.",
            references=[
                ("Event stream processing (Wikipedia)", "https://en.wikipedia.org/wiki/Event_stream_processing"),
                ("Tokenization (Wikipedia)", "https://en.wikipedia.org/wiki/Tokenization_(lexical_analysis)"),
                ("Scope (computer science) (Wikipedia)", "https://en.wikipedia.org/wiki/Scope_(computer_science)"),
            ],
        ),
        wiki(
            slug="bounded-closure",
            title="Bounded closure",
            aria="Diagram of closure under budget and conflict checks",
            svg=svg_wrap(
                "0 0 900 340",
                "Bounded closure diagram",
                "\n".join(
                    [
                        svg_chip(80, 70, 240, 70, "Facts + rules"),
                        svg_chip(340, 70, 240, 70, "Derive consequences"),
                        svg_chip(600, 70, 240, 70, "Check conflicts"),
                        svg_arrow(320, 105, 340, 105),
                        svg_arrow(580, 105, 600, 105),
                        svg_chip(180, 170, 540, 70, "Budget: depth, branching, steps, time"),
                        svg_arrow(480, 140, 480, 170, color="#0b6eff"),
                        svg_legend(
                            80,
                            255,
                            [
                                "Closure is transitive but bounded.",
                                "Scope makes conflicts meaningful.",
                                "Budget defines claim strength.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="Bounded closure explores consequences under explicit limits and gates what the system may claim.",
            definition="Bounded closure is a controlled approximation of transitive closure. It derives consequences of rules and executions only up to explicit limits such as depth, branching, step count, or time.",
            role="Bounded closure is the enforcement mechanism behind VSAVM correctness. It rejects candidates that introduce contradictions within scope and determines whether a conclusion is robust, conditional, or indeterminate under the current budget.",
            mechanics="Closure requires canonical facts and explicit negation. Conflicts are detected when the same canonical fact identifier appears with opposing polarity in the same scope. Budgets make the exploration boundary explicit and auditable.",
            further="Bounded closure connects to search, verification, and model checking. VSAVM uses closure as a budgeted gate that turns correctness into an operational property.",
            references=[
                ("Transitive closure (Wikipedia)", "https://en.wikipedia.org/wiki/Transitive_closure"),
                ("Consistency (Wikipedia)", "https://en.wikipedia.org/wiki/Consistency"),
                ("Verification and validation (Wikipedia)", "https://en.wikipedia.org/wiki/Verification_and_validation"),
            ],
        ),
        wiki(
            slug="beam-search",
            title="Beam search",
            aria="Diagram of keeping top-K branches",
            svg=svg_wrap(
                "0 0 900 320",
                "Beam search diagram",
                "\n".join(
                    [
                        svg_chip(90, 80, 200, 60, "Root"),
                        svg_chip(330, 55, 240, 55, "Branch 1"),
                        svg_chip(330, 130, 240, 55, "Branch 2"),
                        svg_chip(330, 205, 240, 55, "Branch 3"),
                        svg_chip(610, 130, 240, 65, "Keep top-K"),
                        svg_arrow(290, 110, 330, 82),
                        svg_arrow(290, 110, 330, 157),
                        svg_arrow(290, 110, 330, 232),
                        svg_arrow(570, 157, 610, 162),
                        svg_legend(
                            90,
                            265,
                            [
                                "Beam width is a budget parameter.",
                                "Keeps multiple hypotheses alive.",
                                "Balances cost and coverage.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="Beam search maintains multiple candidate branches while keeping computation bounded.",
            definition="Beam search keeps only a fixed number of best candidates at each step, providing a practical compromise between exhaustive search and greedy choice.",
            role="VSAVM uses beam-like strategies for query compilation and for closure exploration. Beams make ambiguity explicit and allow the system to prune candidates that conflict under closure.",
            mechanics="Beam width impacts the strength of conclusions. A narrow beam can miss conflicting branches; a wider beam improves coverage but increases cost. VSAVM ties robustness to the budget and can downgrade to conditional outputs when coverage is limited.",
            further="Beam search is widely used in sequence decoding and heuristic search. In VSAVM, beam scoring incorporates both predictive fit and consistency penalties.",
            references=[
                ("Beam search (Wikipedia)", "https://en.wikipedia.org/wiki/Beam_search"),
                ("Heuristic (Wikipedia)", "https://en.wikipedia.org/wiki/Heuristic"),
                ("Best-first search (Wikipedia)", "https://en.wikipedia.org/wiki/Best-first_search"),
            ],
        ),
        wiki(
            slug="mdl",
            title="Minimum Description Length (MDL)",
            aria="Diagram of balancing fit and complexity",
            svg=svg_wrap(
                "0 0 900 320",
                "MDL diagram",
                "\n".join(
                    [
                        svg_chip(120, 90, 260, 70, "Data fit"),
                        svg_chip(520, 90, 260, 70, "Complexity"),
                        '<line x1="450" y1="80" x2="450" y2="235" stroke="#0b6eff" stroke-width="4" stroke-linecap="round"/>',
                        '<text x="450" y="70" text-anchor="middle" font-size="12" fill="#2f4a63" font-family="Space Grotesk">balance</text>',
                        svg_chip(270, 185, 360, 70, "Promote compact programs that still explain"),
                        svg_legend(
                            120,
                            265,
                            [
                                "Bias toward reusable structure.",
                                "Penalize brittle special cases.",
                                "Supports macro consolidation.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="MDL favors compact executable structure that still explains data, supporting stable macro programs.",
            definition="MDL is a model selection principle that prefers hypotheses minimizing combined description length of model plus data given model. It formalizes the intuition that good structure compresses.",
            role="VSAVM uses MDL as pressure for discovering and consolidating compact executable programs. If a reasoning move compresses repeated patterns, it becomes a candidate for macro promotion.",
            mechanics="MDL acts as a complexity guardrail. Without it, the system may proliferate brittle rules that fit locally but explode branching or create contradictions elsewhere. Combined with closure checks, MDL helps keep the program library stable and reusable.",
            further="The MDL literature connects compression and inference. VSAVM borrows the principle to prioritize programmatic explanations that are both short and consistent under closure.",
            references=[
                ("Minimum description length (Wikipedia)", "https://en.wikipedia.org/wiki/Minimum_description_length"),
                ("The MDL Book (Grünwald)", "https://www.grunwald.nl/mdlbook/"),
                ("Occam's razor (Wikipedia)", "https://en.wikipedia.org/wiki/Occam%27s_razor"),
            ],
        ),
        wiki(
            slug="rl",
            title="Reinforcement Learning (RL)",
            aria="Diagram of action, feedback, and preference update",
            svg=svg_wrap(
                "0 0 900 320",
                "RL diagram",
                "\n".join(
                    [
                        svg_chip(90, 70, 240, 70, "Choose"),
                        svg_chip(350, 70, 240, 70, "Feedback"),
                        svg_chip(610, 70, 240, 70, "Update"),
                        svg_arrow(330, 105, 350, 105),
                        svg_arrow(590, 105, 610, 105),
                        svg_chip(210, 170, 520, 70, "Penalty when closure finds contradictions"),
                        svg_arrow(470, 140, 470, 170, color="#0b6eff"),
                        svg_legend(
                            90,
                            255,
                            [
                                "Used as shaping in VSAVM.",
                                "Acts on program choices, not tokens.",
                                "Consistency provides key signals.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="RL supplies shaping signals that bias high-level choices toward stable candidates.",
            definition="Reinforcement learning learns preferences over actions using feedback signals such as rewards and penalties.",
            role="VSAVM uses RL as shaping when multiple plausible candidates exist. The goal is to select interpretations and response modes that remain stable under bounded closure, not to optimize token-by-token behavior.",
            mechanics="The action space is coarse: choose a schema, choose a macro program, choose a response mode. Closure-derived contradictions provide negative signals that discourage unstable choices. RL complements, but does not replace, explicit closure gating.",
            further="RL is a broad area. VSAVM’s practical use is closer to bandit-like shaping than to full on-policy token-level control.",
            references=[
                ("Reinforcement learning (Wikipedia)", "https://en.wikipedia.org/wiki/Reinforcement_learning"),
                ("Sutton & Barto (book)", "http://incompleteideas.net/book/the-book-2nd.html"),
                ("Multi-armed bandit (Wikipedia)", "https://en.wikipedia.org/wiki/Multi-armed_bandit"),
            ],
        ),
        wiki(
            slug="schema",
            title="Schema",
            aria="Diagram of schema frame with slots and bindings",
            svg=svg_wrap(
                "0 0 900 320",
                "Schema diagram",
                "\n".join(
                    [
                        '<rect x="120" y="70" width="660" height="180" rx="26" ry="26" fill="none" stroke="#0b6eff" stroke-width="3"/>',
                        '<text x="150" y="100" text-anchor="start" font-size="13" fill="#2f4a63" font-family="Space Grotesk">Schema frame</text>',
                        svg_chip(160, 125, 240, 55, "Intent"),
                        svg_chip(420, 125, 320, 55, "Typed slots"),
                        svg_chip(160, 195, 240, 55, "Bindings"),
                        svg_chip(420, 195, 320, 55, "Program skeleton"),
                        svg_legend(
                            120,
                            265,
                            [
                                "Frames structure repeated intents.",
                                "Slots are filled discretely.",
                                "Skeletons become executable programs.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="Schemas map paraphrases into structured frames that compile into executable programs.",
            definition="A schema is a structured representation of a recurring intent, often expressed as a frame with slots to be filled.",
            role="Schemas are the bridge between language and execution. They constrain compilation and generation by defining what roles exist, what types are allowed, and how a surface span maps to program structure.",
            mechanics="Typed slots reduce branching and improve auditability. The system can log which span filled which slot and which assumptions were required. VSA can help retrieve candidate schemas, but final bindings must be validated by execution and closure checks.",
            further="Schemas appear in cognitive science and linguistics; VSAVM uses them as an engineering abstraction that supports compilation and verification.",
            references=[
                ("Schema (Wikipedia)", "https://en.wikipedia.org/wiki/Schema_(psychology)"),
                ("Frame semantics (Wikipedia)", "https://en.wikipedia.org/wiki/Frame_semantics"),
                ("Program synthesis (Wikipedia)", "https://en.wikipedia.org/wiki/Program_synthesis"),
            ],
        ),
        wiki(
            slug="macro-program",
            title="Macro program",
            aria="Diagram of consolidating steps into a macro",
            svg=svg_wrap(
                "0 0 900 320",
                "Macro program diagram",
                "\n".join(
                    [
                        svg_chip(120, 80, 190, 60, "Step 1"),
                        svg_chip(330, 80, 190, 60, "Step 2"),
                        svg_chip(540, 80, 190, 60, "Step 3"),
                        svg_arrow(310, 110, 330, 110),
                        svg_arrow(520, 110, 540, 110),
                        svg_chip(300, 185, 300, 70, "Macro program"),
                        '<path d="M 215 140 C 260 170, 310 190, 350 205" fill="none" stroke="#0b6eff" stroke-width="4" stroke-linecap="round"/>',
                        '<path d="M 425 140 C 430 165, 430 185, 450 205" fill="none" stroke="#0b6eff" stroke-width="4" stroke-linecap="round"/>',
                        '<path d="M 635 140 C 590 170, 555 190, 550 205" fill="none" stroke="#0b6eff" stroke-width="4" stroke-linecap="round"/>',
                        svg_legend(
                            120,
                            265,
                            [
                                "Macros compress repeated routines.",
                                "Promoted after stable success.",
                                "Reduce search and cost.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="Macro programs compress repeated multi-step routines into reusable executable blocks.",
            definition="A macro program is a consolidated instruction sequence treated as a reusable unit.",
            role="Macro programs reduce the need for repeated program search. They represent stabilized reasoning moves that can be invoked efficiently and audited as single units.",
            mechanics="Promotion should be constrained by MDL-style compression and by closure-based health checks. A macro that predicts well but causes contradictions or branching blow-ups should be demoted or scoped.",
            further="Macros and abstraction are common in programming; VSAVM uses macro programs as explicit reusable reasoning primitives rather than implicit latent features.",
            references=[
                ("Abstraction (Wikipedia)", "https://en.wikipedia.org/wiki/Abstraction_(computer_science)"),
                ("Program synthesis (Wikipedia)", "https://en.wikipedia.org/wiki/Program_synthesis"),
                ("Minimum description length (Wikipedia)", "https://en.wikipedia.org/wiki/Minimum_description_length"),
            ],
        ),
        wiki(
            slug="macro-token",
            title="Macro token",
            aria="Diagram of reversible compression from tokens to macro unit",
            svg=svg_wrap(
                "0 0 900 320",
                "Macro token diagram",
                "\n".join(
                    [
                        svg_chip(90, 70, 240, 70, "Tokens"),
                        svg_chip(350, 70, 240, 70, "Compression"),
                        svg_chip(610, 70, 240, 70, "Macro token"),
                        svg_arrow(330, 105, 350, 105),
                        svg_arrow(590, 105, 610, 105),
                        svg_chip(210, 170, 520, 70, "Invariant: deterministic expansion to tokens"),
                        svg_arrow(470, 140, 470, 170, color="#0b6eff"),
                        svg_legend(
                            90,
                            255,
                            [
                                "Reduces entropy at phrase level.",
                                "Must be reversible for audit.",
                                "Supports stable scoring and decoding.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="Macro tokens compress recurring patterns while preserving deterministic expansion for evaluation and decoding.",
            definition="A macro token is a compressed phrase-level unit derived from repeated token sequences.",
            role="Macro tokens help stabilize next-phrase prediction and reduce search cost. They can also become anchors for schema discovery by turning repeated patterns into stable discrete units.",
            mechanics="Reversibility is mandatory. If expansion is ambiguous, scoring becomes inconsistent and the system cannot maintain traceability. VSAVM treats deterministic expansion as a hard constraint to preserve correctness.",
            further="Macro units relate to tokenization and compression. VSAVM’s emphasis is on reversibility and auditability under the consistency contract.",
            references=[
                ("Tokenization (Wikipedia)", "https://en.wikipedia.org/wiki/Tokenization_(lexical_analysis)"),
                ("Data compression (Wikipedia)", "https://en.wikipedia.org/wiki/Data_compression"),
                ("Minimum description length (Wikipedia)", "https://en.wikipedia.org/wiki/Minimum_description_length"),
            ],
        ),
        wiki(
            slug="fact-store",
            title="Fact store",
            aria="Diagram of canonical fact_id, polarity, and scope",
            svg=svg_wrap(
                "0 0 900 340",
                "Fact store diagram",
                "\n".join(
                    [
                        svg_chip(90, 70, 240, 70, "fact_id"),
                        svg_chip(350, 70, 240, 70, "polarity"),
                        svg_chip(610, 70, 240, 70, "scope"),
                        svg_arrow(330, 105, 350, 105),
                        svg_arrow(590, 105, 610, 105),
                        svg_chip(180, 170, 540, 70, "Conflict if same fact_id has opposing polarity in same scope"),
                        svg_arrow(480, 140, 480, 170, color="#0b6eff"),
                        svg_legend(
                            90,
                            255,
                            [
                                "Canonicalization enables comparison.",
                                "Scope prevents global collapse.",
                                "Used by closure and audit.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="The fact store holds canonical claims with explicit polarity and scope to make contradiction checks computable.",
            definition="A fact store is a structured memory of assertions. In VSAVM it stores canonical fact identifiers alongside polarity and scope metadata.",
            role="The fact store is the substrate for closure and conflict detection. It is where derived facts are accumulated and where contradictions are detected during bounded closure.",
            mechanics="The key invariants are canonical identifiers, explicit negation via polarity, and explicit scope derived from structural boundaries. These make conflict detection robust to paraphrases and meaningful under localized contexts.",
            further="Fact stores are related to knowledge bases; VSAVM’s emphasis is on canonical IDs and scope-aware closure rather than on open-world accumulation.",
            references=[
                ("Knowledge base (Wikipedia)", "https://en.wikipedia.org/wiki/Knowledge_base"),
                ("Consistency (Wikipedia)", "https://en.wikipedia.org/wiki/Consistency"),
                ("Context (computing) (Wikipedia)", "https://en.wikipedia.org/wiki/Context_(computing)"),
            ],
        ),
        wiki(
            slug="fact-id",
            title="Fact identifier",
            aria="Diagram of surface forms mapping to canonical ID",
            svg=svg_wrap(
                "0 0 900 320",
                "Fact identifier diagram",
                "\n".join(
                    [
                        svg_chip(90, 85, 280, 65, "Surface A"),
                        svg_chip(90, 170, 280, 65, "Surface B"),
                        svg_chip(450, 125, 360, 80, "Canonical fact_id"),
                        svg_arrow(370, 118, 450, 165),
                        svg_arrow(370, 202, 450, 165),
                        svg_legend(
                            90,
                            255,
                            [
                                "Equivalence becomes explicit.",
                                "Contradictions become computable.",
                                "Supports conditional assumptions.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="Canonical identifiers turn paraphrase variation into a stable unit for closure and contradiction checks.",
            definition="A fact identifier is the internal canonical key for an assertion.",
            role="Fact identifiers enable reliable conflict detection: a contradiction is opposing polarity for the same identifier inside scope. They also provide stable handles for assumptions and trace references.",
            mechanics="Schemas and canonicalization map surface forms into internal structures. VSA can propose mappings by similarity, but the final mapping must be validated by execution and consistency constraints to preserve the contract.",
            further="Canonicalization and normal forms underpin the engineering practice of making equivalence explicit. VSAVM depends on this to make correctness computable under paraphrase variation.",
            references=[
                ("Identifier (Wikipedia)", "https://en.wikipedia.org/wiki/Identifier"),
                ("Canonicalization (Wikipedia)", "https://en.wikipedia.org/wiki/Canonicalization"),
                ("Normal form (Wikipedia)", "https://en.wikipedia.org/wiki/Normal_form"),
            ],
        ),
        wiki(
            slug="hypervector",
            title="Hypervector",
            aria="Diagram of deterministic seed to hypervector pipeline",
            svg=svg_wrap(
                "0 0 900 320",
                "Hypervector diagram",
                "\n".join(
                    [
                        svg_chip(110, 90, 240, 70, "Stable seed"),
                        svg_chip(370, 90, 240, 70, "Hash"),
                        svg_chip(630, 90, 240, 70, "Hypervector"),
                        svg_arrow(350, 125, 370, 125),
                        svg_arrow(610, 125, 630, 125),
                        svg_chip(210, 190, 520, 70, "Used for similarity, binding, bundling"),
                        svg_arrow(540, 160, 500, 190, color="#0b6eff"),
                        svg_legend(
                            110,
                            265,
                            [
                                "Deterministic keys support reproducibility.",
                                "Operations build structured prototypes.",
                                "Similarity accelerates search.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="Hypervectors are deterministic high-dimensional keys used for associative retrieval and structured operations in VSA.",
            definition="A hypervector is a high-dimensional vector used to represent a symbol in hyperdimensional computing and VSA.",
            role="In VSAVM, hypervectors serve as stable keys for retrieval and clustering. They accelerate schema discovery and candidate selection without defining truth.",
            mechanics="Hypervectors are generated deterministically from stable hashes, enabling reproducibility. Binding and bundling operations build structured composites and prototypes. Retrieved candidates are validated by the VM under bounded closure.",
            further="Hyperdimensional computing provides background on why random-like high-dimensional vectors support robust associative behavior. VSAVM uses these ideas for indexing and search acceleration.",
            references=[
                ("Hyperdimensional computing (Wikipedia)", "https://en.wikipedia.org/wiki/Hyperdimensional_computing"),
                ("Hash function (Wikipedia)", "https://en.wikipedia.org/wiki/Hash_function"),
                ("Vector symbolic architecture (Wikipedia)", "https://en.wikipedia.org/wiki/Vector_symbolic_architecture"),
            ],
        ),
        wiki(
            slug="binding",
            title="Binding",
            aria="Diagram of role and filler bound into composite",
            svg=svg_wrap(
                "0 0 900 320",
                "Binding diagram",
                "\n".join(
                    [
                        svg_chip(140, 100, 260, 70, "Role"),
                        svg_chip(500, 100, 260, 70, "Filler"),
                        svg_chip(320, 200, 260, 70, "Bound composite"),
                        svg_arrow(320, 135, 370, 200, color="#0b6eff"),
                        svg_arrow(630, 135, 520, 200, color="#0b6eff"),
                        svg_legend(
                            140,
                            275,
                            [
                                "Encodes relational structure.",
                                "Used for slot-role representations.",
                                "Improves structured retrieval.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="Binding introduces relational structure into VSA representations, enabling slot-aware retrieval.",
            definition="Binding is a VSA operation that combines two vectors into a structured composite representation.",
            role="VSAVM can use binding to represent typed slot assignments and relations in schema prototypes and span representations.",
            mechanics="Binding prevents the collapse of structure into bag-of-words similarity. It helps distinguish which value fills which role, supporting compilation into executable programs with explicit bindings.",
            further="Different VSA variants implement binding differently, but the intent is consistent: bind roles to fillers to preserve structure in a distributed representation.",
            references=[
                ("Vector symbolic architecture (Wikipedia)", "https://en.wikipedia.org/wiki/Vector_symbolic_architecture"),
                ("Hyperdimensional computing (Wikipedia)", "https://en.wikipedia.org/wiki/Hyperdimensional_computing"),
                ("Holographic reduced representation (Wikipedia)", "https://en.wikipedia.org/wiki/Holographic_reduced_representation"),
            ],
        ),
        wiki(
            slug="bundling",
            title="Bundling",
            aria="Diagram of aggregating multiple vectors into a prototype",
            svg=svg_wrap(
                "0 0 900 320",
                "Bundling diagram",
                "\n".join(
                    [
                        svg_chip(130, 90, 200, 60, "A"),
                        svg_chip(350, 90, 200, 60, "B"),
                        svg_chip(570, 90, 200, 60, "C"),
                        svg_chip(350, 200, 220, 70, "Prototype"),
                        '<path d="M 230 150 C 285 180, 330 195, 360 215" fill="none" stroke="#0b6eff" stroke-width="4" stroke-linecap="round"/>',
                        '<path d="M 450 150 C 440 175, 435 195, 435 215" fill="none" stroke="#0b6eff" stroke-width="4" stroke-linecap="round"/>',
                        '<path d="M 670 150 C 610 180, 570 195, 560 215" fill="none" stroke="#0b6eff" stroke-width="4" stroke-linecap="round"/>',
                        svg_legend(
                            130,
                            275,
                            [
                                "Aggregates evidence across instances.",
                                "Builds paraphrase and schema prototypes.",
                                "Supports federated merging.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="Bundling aggregates multiple vectors into a prototype representation used for clustering and schema prototypes.",
            definition="Bundling is a VSA operation that aggregates multiple vectors into a prototype that captures shared structure.",
            role="VSAVM uses bundling to form prototypes for schemas and macro programs and to cluster paraphrases under a shared representation.",
            mechanics="Bundling is compatible with federation: prototypes can be merged across clients by further bundling. Bundled candidates remain proposals; the VM validates conclusions through execution and closure checks.",
            further="Bundling is one of the simplest VSA operations and is valuable for robust prototypes that tolerate noise and partial overlap.",
            references=[
                ("Vector symbolic architecture (Wikipedia)", "https://en.wikipedia.org/wiki/Vector_symbolic_architecture"),
                ("Hyperdimensional computing (Wikipedia)", "https://en.wikipedia.org/wiki/Hyperdimensional_computing"),
                ("Federated learning (Wikipedia)", "https://en.wikipedia.org/wiki/Federated_learning"),
            ],
        ),
        wiki(
            slug="canonicalization",
            title="Canonicalization",
            aria="Diagram of surface to canonical mapping",
            svg=svg_wrap(
                "0 0 900 320",
                "Canonicalization diagram",
                "\n".join(
                    [
                        svg_chip(90, 90, 280, 70, "Surface"),
                        svg_chip(390, 90, 200, 70, "Normalize"),
                        svg_chip(610, 90, 240, 70, "Canonical"),
                        svg_arrow(370, 125, 390, 125),
                        svg_arrow(590, 125, 610, 125),
                        svg_chip(210, 190, 520, 70, "Enables: closure, equality, conflicts"),
                        svg_arrow(520, 160, 480, 190, color="#0b6eff"),
                        svg_legend(
                            90,
                            265,
                            [
                                "Canonical form is the unit of checks.",
                                "Paraphrases map to stable IDs.",
                                "Required for correctness under closure.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="Canonicalization aligns diverse surface forms into stable internal representations used by closure and conflict detection.",
            definition="Canonicalization maps multiple representations into a single normalized form so equivalence and comparison are well-defined.",
            role="VSAVM relies on canonicalization to detect contradictions across paraphrases. Without canonical identifiers, closure cannot reliably detect that two wordings refer to the same claim.",
            mechanics="Canonicalization is guided by schemas and may be accelerated by VSA suggestions, but it must remain deterministic and validated. Canonicalization produces fact identifiers with explicit polarity and scope so contradictions are computable.",
            further="Canonicalization is closely related to normal forms. VSAVM uses it as a core correctness mechanism, not a presentation detail.",
            references=[
                ("Canonicalization (Wikipedia)", "https://en.wikipedia.org/wiki/Canonicalization"),
                ("Normal form (Wikipedia)", "https://en.wikipedia.org/wiki/Normal_form"),
                ("Consistency (Wikipedia)", "https://en.wikipedia.org/wiki/Consistency"),
            ],
        ),
        wiki(
            slug="context-scope",
            title="Context and scope",
            aria="Diagram of nested scope boundaries",
            svg=svg_wrap(
                "0 0 900 320",
                "Scope diagram",
                "\n".join(
                    [
                        '<rect x="120" y="75" width="660" height="190" rx="26" ry="26" fill="none" stroke="#7fb3e6" stroke-width="3"/>',
                        '<text x="150" y="105" text-anchor="start" font-size="13" fill="#2f4a63" font-family="Space Grotesk">Document</text>',
                        '<rect x="190" y="120" width="520" height="135" rx="24" ry="24" fill="none" stroke="#0b6eff" stroke-width="3"/>',
                        '<text x="220" y="150" text-anchor="start" font-size="13" fill="#2f4a63" font-family="Space Grotesk">Section</text>',
                        '<rect x="270" y="160" width="360" height="75" rx="20" ry="20" fill="none" stroke="#16b879" stroke-width="3"/>',
                        '<text x="300" y="195" text-anchor="start" font-size="13" fill="#2f4a63" font-family="Space Grotesk">Local context</text>',
                        svg_legend(
                            120,
                            270,
                            [
                                "Scope controls interaction under closure.",
                                "Supports multiple local theories.",
                                "Avoids global contradiction explosion.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="Scope boundaries define where a claim holds and where contradictions are meaningful.",
            definition="Context and scope define the boundary within which a statement is interpreted and interacts with other statements.",
            role="VSAVM uses scope derived from structural separators to localize inference and contradiction checks. This prevents incompatible sources from collapsing into a single inconsistent base.",
            mechanics="Scope is carried through execution as context metadata. Conflict checks require scope: a contradiction is opposing polarity for the same canonical fact identifier within the same scope. Without scope, correctness becomes either impossible or meaningless.",
            further="Scope is a standard notion in computing; VSAVM extends it to reasoning and verification by treating document structure as semantic boundaries.",
            references=[
                ("Scope (computer science) (Wikipedia)", "https://en.wikipedia.org/wiki/Scope_(computer_science)"),
                ("Context (computing) (Wikipedia)", "https://en.wikipedia.org/wiki/Context_(computing)"),
                ("Consistency (Wikipedia)", "https://en.wikipedia.org/wiki/Consistency"),
            ],
        ),
        wiki(
            slug="query-compiler",
            title="NL to query compiler",
            aria="Diagram of question to schema to program",
            svg=svg_wrap(
                "0 0 900 320",
                "Compiler diagram",
                "\n".join(
                    [
                        svg_chip(90, 90, 240, 70, "Question"),
                        svg_chip(350, 90, 240, 70, "Schema"),
                        svg_chip(610, 90, 240, 70, "Program"),
                        svg_arrow(330, 125, 350, 125),
                        svg_arrow(590, 125, 610, 125),
                        svg_chip(210, 190, 520, 70, "Search + validation under closure"),
                        svg_arrow(520, 160, 480, 190, color="#0b6eff"),
                        svg_legend(
                            90,
                            265,
                            [
                                "Compilation is hypothesis generation.",
                                "Programs are executable artifacts.",
                                "Closure enforces honesty.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="Questions become executable programs via schemas, with search and closure validation enforcing correctness.",
            definition="An NL to query compiler transforms natural language questions into executable query programs.",
            role="In VSAVM, compilation is central because it makes questions operational and auditable. It enables answers derived by execution and bounded closure rather than by free-form continuation.",
            mechanics="The compiler retrieves candidate schemas, fills typed slots, emits a program, and evaluates candidates with early closure checks. Multiple candidates can be kept in a beam to handle ambiguity explicitly and to support conditional results.",
            further="Program synthesis provides a useful analogy: propose programs and validate them against constraints. VSAVM applies this pattern to query programs guided by retrieval and compression pressure.",
            references=[
                ("Program synthesis (Wikipedia)", "https://en.wikipedia.org/wiki/Program_synthesis"),
                ("Beam search (Wikipedia)", "https://en.wikipedia.org/wiki/Beam_search"),
                ("Information retrieval (Wikipedia)", "https://en.wikipedia.org/wiki/Information_retrieval"),
            ],
        ),
        wiki(
            slug="multimodal",
            title="Multimodal",
            aria="Diagram of modalities converging into event stream and VM",
            svg=svg_wrap(
                "0 0 900 340",
                "Multimodal diagram",
                "\n".join(
                    [
                        svg_chip(90, 70, 200, 60, "Text"),
                        svg_chip(90, 150, 200, 60, "Audio"),
                        svg_chip(90, 230, 200, 60, "Image/Video"),
                        svg_chip(360, 140, 260, 80, "Event stream"),
                        svg_chip(660, 140, 180, 80, "VM"),
                        svg_arrow(290, 100, 360, 180),
                        svg_arrow(290, 180, 360, 180),
                        svg_arrow(290, 260, 360, 180),
                        svg_arrow(620, 180, 660, 180),
                        svg_legend(
                            360,
                            275,
                            [
                                "Inputs become discrete events.",
                                "Structure carries scope.",
                                "One core handles all modalities.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="Multiple modalities converge into a single event stream so the same closure rules apply.",
            definition="Multimodal processing integrates multiple input or output modalities such as text, audio, and images.",
            role="VSAVM is multimodal by representation: all modalities become event streams. This allows one VM and one correctness contract to operate uniformly across modalities.",
            mechanics="Audio becomes transcript events with timing; images and video become symbolic descriptors or discrete tokens. Structural separators define scope even in temporal streams. The VM remains modality-agnostic because it consumes discrete events and canonical facts.",
            further="Multimodal learning literature is broad. VSAVM’s emphasis is on representation unification and execution-based checking, not on any specific encoder design.",
            references=[
                ("Multimodal learning (Wikipedia)", "https://en.wikipedia.org/wiki/Multimodal_learning"),
                ("Event stream processing (Wikipedia)", "https://en.wikipedia.org/wiki/Event_stream_processing"),
                ("Computer vision (Wikipedia)", "https://en.wikipedia.org/wiki/Computer_vision"),
            ],
        ),
        wiki(
            slug="symbolic-execution",
            title="Symbolic execution",
            aria="Diagram of branching paths and checks",
            svg=svg_wrap(
                "0 0 900 320",
                "Symbolic execution diagram",
                "\n".join(
                    [
                        svg_chip(90, 90, 220, 60, "Symbols"),
                        svg_chip(340, 65, 220, 55, "Branch A"),
                        svg_chip(340, 140, 220, 55, "Branch B"),
                        svg_chip(340, 215, 220, 55, "Branch C"),
                        svg_chip(610, 140, 240, 65, "Constraints"),
                        svg_arrow(310, 120, 340, 92),
                        svg_arrow(310, 120, 340, 167),
                        svg_arrow(310, 120, 340, 242),
                        svg_arrow(560, 167, 610, 172),
                        svg_legend(
                            90,
                            275,
                            [
                                "Explore multiple paths explicitly.",
                                "Prune with constraints.",
                                "Budgets bound exploration.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="Symbolic execution explores multiple branches explicitly and uses constraints to prune inconsistent paths.",
            definition="Symbolic execution runs programs with symbolic inputs, exploring multiple branches while accumulating constraints.",
            role="VSAVM uses symbolic execution ideas to manage ambiguity and nondeterminism in interpretation and closure exploration.",
            mechanics="Branching makes uncertainty explicit. Robust conclusions must survive across explored branches; conditional conclusions are tied to assumptions. Constraints and closure checks prune or downgrade inconsistent branches under budget.",
            further="Symbolic execution underpins many verification tools. VSAVM adapts the idea to reasoning about language-derived programs under bounded closure.",
            references=[
                ("Symbolic execution (Wikipedia)", "https://en.wikipedia.org/wiki/Symbolic_execution"),
                ("Program analysis (Wikipedia)", "https://en.wikipedia.org/wiki/Program_analysis"),
                ("Constraint satisfaction (Wikipedia)", "https://en.wikipedia.org/wiki/Constraint_satisfaction_problem"),
            ],
        ),
        wiki(
            slug="federated-learning",
            title="Federated learning",
            aria="Diagram of clients aggregating artifacts with validation",
            svg=svg_wrap(
                "0 0 900 340",
                "Federated learning diagram",
                "\n".join(
                    [
                        svg_chip(90, 70, 200, 60, "Client A"),
                        svg_chip(90, 150, 200, 60, "Client B"),
                        svg_chip(90, 230, 200, 60, "Client C"),
                        svg_chip(360, 140, 240, 80, "Aggregation"),
                        svg_chip(650, 120, 200, 80, "Shared"),
                        svg_chip(650, 215, 200, 80, "Validation"),
                        svg_arrow(290, 100, 360, 180),
                        svg_arrow(290, 180, 360, 180),
                        svg_arrow(290, 260, 360, 180),
                        svg_arrow(600, 180, 650, 160),
                        svg_arrow(750, 200, 750, 215, color="#0b6eff"),
                        svg_legend(
                            360,
                            285,
                            [
                                "Share artifacts, not raw data.",
                                "Validate before promotion.",
                                "Supports modular libraries.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="Federation shares artifacts and applies validation to prevent polluted rule libraries.",
            definition="Federated learning trains across clients without centralizing raw data, using aggregated updates or artifacts.",
            role="VSAVM can federate discrete statistics, VSA prototypes, and executable modules such as schemas and macro programs. This aligns naturally with modular learning and auditability.",
            mechanics="The main risk is rule pollution. VSAVM mitigates this by requiring closure-based health checks before promoting new rules into a shared library. Modules can be versioned and rolled back more transparently than dense parameter deltas.",
            further="Federated learning is often paired with privacy techniques such as differential privacy. VSAVM’s approach emphasizes federating explicit artifacts with governance via consistency checks.",
            references=[
                ("Federated learning (Wikipedia)", "https://en.wikipedia.org/wiki/Federated_learning"),
                ("Differential privacy (Wikipedia)", "https://en.wikipedia.org/wiki/Differential_privacy"),
                ("Privacy (Wikipedia)", "https://en.wikipedia.org/wiki/Privacy"),
            ],
        ),
        wiki(
            slug="trustworthy-ai",
            title="Trustworthy AI",
            aria="Diagram of trace, checks, and honest output modes",
            svg=svg_wrap(
                "0 0 900 320",
                "Trustworthy AI diagram",
                "\n".join(
                    [
                        svg_chip(90, 70, 240, 70, "Trace"),
                        svg_chip(350, 70, 240, 70, "Checks"),
                        svg_chip(610, 70, 240, 70, "Output modes"),
                        svg_arrow(330, 105, 350, 105),
                        svg_arrow(590, 105, 610, 105),
                        svg_chip(210, 170, 520, 70, "Robust / conditional / indeterminate"),
                        svg_arrow(470, 140, 470, 170, color="#0b6eff"),
                        svg_legend(
                            90,
                            255,
                            [
                                "Constrain emission, not just tone.",
                                "Expose budgets and branch coverage.",
                                "Make uncertainty explicit.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="Trust is built by tying outputs to traces and checks and by using explicit output modes.",
            definition="Trustworthy AI refers to systems that behave predictably and transparently, especially at the boundaries of uncertainty.",
            role="VSAVM approaches trustworthiness by construction: it constrains emission to what can be derived and checked under bounded closure and exposes traces and budgets on demand.",
            mechanics="The system’s outputs are classified into robust, conditional, or indeterminate based on closure and scope. This replaces ungrounded confidence with operational coverage. The surface realizer is constrained to avoid introducing facts beyond VM state.",
            further="Trustworthy AI intersects with explainability, verification, and alignment. VSAVM’s contribution is to provide an executable substrate that makes these concerns operational and auditable.",
            references=[
                ("Explainable AI (Wikipedia)", "https://en.wikipedia.org/wiki/Explainable_artificial_intelligence"),
                ("Verification and validation (Wikipedia)", "https://en.wikipedia.org/wiki/Verification_and_validation"),
                ("AI alignment (Wikipedia)", "https://en.wikipedia.org/wiki/AI_alignment"),
            ],
        ),
        wiki(
            slug="llm",
            title="Large Language Model (LLM)",
            aria="Diagram of prompt to continuation with VM gating overlay",
            svg=svg_wrap(
                "0 0 900 320",
                "LLM diagram",
                "\n".join(
                    [
                        svg_chip(90, 70, 240, 70, "Prompt"),
                        svg_chip(350, 70, 240, 70, "LM proposals"),
                        svg_chip(610, 70, 240, 70, "Continuation"),
                        svg_arrow(330, 105, 350, 105),
                        svg_arrow(590, 105, 610, 105),
                        svg_chip(210, 170, 520, 70, "VSAVM adds VM state + closure gate"),
                        svg_arrow(470, 140, 470, 170, color="#0b6eff"),
                        svg_legend(
                            90,
                            255,
                            [
                                "Standard LLM: continuation from text.",
                                "VSAVM: continuation conditioned on execution.",
                                "Gate prevents unsupported claims.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="VSAVM keeps LLM-like interaction but conditions continuations on executable state and closure checks.",
            definition="A large language model is typically a neural network trained to predict the next token or segment of text.",
            role="VSAVM uses LLM-like prediction as a proposal mechanism, but acceptance is constrained by VM state and bounded closure. The interface stays familiar while the semantics change.",
            mechanics="Fluency proposals are filtered by schema constraints and closure gating. This prevents the generator from emitting facts that are not supported by executable state, turning trust into an operational property of checks and traces.",
            further="LLMs are a fast-moving field. VSAVM’s design goal is to combine LLM-like interaction with an executable substrate and explicit boundary behavior.",
            references=[
                ("Large language model (Wikipedia)", "https://en.wikipedia.org/wiki/Large_language_model"),
                ("Language model (Wikipedia)", "https://en.wikipedia.org/wiki/Language_model"),
                ("Natural language generation (Wikipedia)", "https://en.wikipedia.org/wiki/Natural_language_generation"),
            ],
        ),
        wiki(
            slug="consistency-contract",
            title="Consistency contract",
            aria="Diagram of budget, closure, and emission rules",
            svg=svg_wrap(
                "0 0 900 340",
                "Consistency contract diagram",
                "\n".join(
                    [
                        svg_chip(80, 70, 240, 70, "Budget"),
                        svg_chip(340, 70, 240, 70, "Closure"),
                        svg_chip(600, 70, 240, 70, "Emission"),
                        svg_arrow(320, 105, 340, 105),
                        svg_arrow(580, 105, 600, 105),
                        svg_chip(180, 170, 540, 70, "Strict / conditional / indeterminate"),
                        svg_arrow(480, 140, 480, 170, color="#0b6eff"),
                        svg_legend(
                            80,
                            255,
                            [
                                "Defines what may be stated.",
                                "Budgets make boundaries explicit.",
                                "Modes define honest degradation.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="The contract ties what may be emitted to what was checked under budgeted closure and named modes.",
            definition="A consistency contract defines when a system is allowed to emit a conclusion, based on explicit checks and explicit budgets.",
            role="In VSAVM, the contract is the semantic rule that turns closure outcomes into output permission. It prevents the system from projecting certainty when exploration is incomplete.",
            mechanics="The contract specifies budgets, closure behavior, and response modes. It requires logging of budget use, branches, and conflicts so results are auditable. Conditional outputs are tied to explicit assumptions rather than vague language.",
            further="Consistency and non-monotonic reasoning provide background. VSAVM operationalizes these ideas through executable state and bounded exploration rather than purely through hand-coded logic.",
            references=[
                ("Consistency (Wikipedia)", "https://en.wikipedia.org/wiki/Consistency"),
                ("Non-monotonic logic (SEP)", "https://plato.stanford.edu/entries/logic-nonmonotonic/"),
                ("Verification and validation (Wikipedia)", "https://en.wikipedia.org/wiki/Verification_and_validation"),
            ],
        ),
        wiki(
            slug="conceptual-spaces",
            title="Conceptual spaces",
            aria="Diagram of regions and transitions",
            svg=svg_wrap(
                "0 0 900 340",
                "Conceptual spaces diagram",
                "\n".join(
                    [
                        '<ellipse cx="310" cy="185" rx="250" ry="125" fill="none" stroke="#7fb3e6" stroke-width="3"/>',
                        '<ellipse cx="650" cy="170" rx="230" ry="125" fill="none" stroke="#16b879" stroke-width="3"/>',
                        '<circle cx="250" cy="185" r="12" fill="#0b6eff"/>',
                        '<circle cx="370" cy="220" r="12" fill="#0b6eff"/>',
                        '<circle cx="610" cy="170" r="12" fill="#16b879"/>',
                        '<circle cx="715" cy="205" r="12" fill="#16b879"/>',
                        '<line x1="262" y1="185" x2="358" y2="220" stroke="url(#deep)" stroke-width="4" stroke-linecap="round"/>',
                        '<line x1="382" y1="220" x2="598" y2="170" stroke="url(#deep)" stroke-width="4" stroke-linecap="round"/>',
                        '<line x1="622" y1="170" x2="703" y2="205" stroke="url(#deep)" stroke-width="4" stroke-linecap="round"/>',
                        svg_legend(
                            90,
                            270,
                            [
                                "Regions are concepts as constraints.",
                                "Nodes are states/instances.",
                                "Edges are transitions or inferences.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="Concepts as regions: VSAVM maps this intuition to VM state-space regions rather than to embedding points.",
            definition="Conceptual spaces model concepts as regions in a geometric space rather than as discrete symbols.",
            role="VSAVM uses a two-geometry view: VSA similarity provides candidate retrieval, while VM state-space geometry determines consequences and conflicts. Conceptual spaces offer a useful metaphor for regions and invariants in VM state space.",
            mechanics="A concept corresponds to a region of states satisfying constraints. Thinking more corresponds to exploring a larger neighborhood of the state graph. Similarity geometry accelerates search, but execution geometry governs correctness.",
            further="Conceptual spaces connect cognition and geometry. VSAVM uses the idea operationally: regions correspond to stable state configurations under closure.",
            references=[
                ("Conceptual spaces (Wikipedia)", "https://en.wikipedia.org/wiki/Conceptual_spaces"),
                ("State space (Wikipedia)", "https://en.wikipedia.org/wiki/State_space"),
                ("Graph traversal (Wikipedia)", "https://en.wikipedia.org/wiki/Graph_traversal"),
            ],
        ),
        wiki(
            slug="program-synthesis",
            title="Program synthesis",
            aria="Diagram of intent to program via search and validation",
            svg=svg_wrap(
                "0 0 900 340",
                "Program synthesis diagram",
                "\n".join(
                    [
                        svg_chip(90, 90, 260, 70, "Intent / examples"),
                        svg_chip(370, 90, 220, 70, "Search"),
                        svg_chip(610, 90, 240, 70, "Program"),
                        svg_arrow(350, 125, 370, 125),
                        svg_arrow(590, 125, 610, 125),
                        svg_chip(210, 190, 520, 70, "Validate with execution and constraints"),
                        svg_arrow(520, 160, 480, 190, color="#0b6eff"),
                        svg_legend(
                            90,
                            265,
                            [
                                "Search proposes candidate programs.",
                                "Validation rejects invalid ones.",
                                "Similar pattern used in query compilation.",
                            ],
                        ),
                    ]
                ),
            ),
            caption="Program synthesis illustrates the propose-and-validate pattern that VSAVM uses for query compilation.",
            definition="Program synthesis automatically constructs programs that satisfy a specification, often via search and validation.",
            role="VSAVM query compilation resembles synthesis: candidate query programs are proposed using retrieval and schemas and then validated by execution and closure checks.",
            mechanics="Synthesis without validation becomes guesswork. VSAVM’s validation is bounded closure and conflict detection. This rejects candidates that look plausible by similarity but fail under consequences.",
            further="Program synthesis is a large field. VSAVM applies the idea to executable queries and macro routines under explicit budgets and auditability requirements.",
            references=[
                ("Program synthesis (Wikipedia)", "https://en.wikipedia.org/wiki/Program_synthesis"),
                ("Search algorithm (Wikipedia)", "https://en.wikipedia.org/wiki/Search_algorithm"),
                ("Verification and validation (Wikipedia)", "https://en.wikipedia.org/wiki/Verification_and_validation"),
            ],
        ),
    ]


def render_page(page: Page) -> str:
    if page.kind == "theory":
        intro = (
            "<p>This page is a theory note. It expands the topic in short chapters and defines terminology without duplicating the formal specification documents.</p>"
            "<p>The diagram has a transparent background and is intended to be read together with the caption and the sections below.</p>"
        )
        related = related_wiki_paragraph("../wiki/")
    else:
        intro = (
            "<p>This wiki entry defines a term used across VSAVM and explains why it matters in the architecture.</p>"
            "<p>The diagram has a transparent background and highlights the operational meaning of the term inside VSAVM.</p>"
        )
        related = related_wiki_paragraph("")

    body = "\n".join(
        [
            f"<h1>{page.title}</h1>",
            intro,
            related,
            h2_sections(page.sections),
            '<figure class="diagram">',
            page.svg,
            f"<figcaption>{page.caption}</figcaption>",
            "</figure>",
            references_paragraph(page.references),
        ]
    )
    prefix = "../" if page.kind in ("theory", "wiki") else ""
    return html_page(page.title, body, prefix=prefix)


def remove_legacy_theory_pages() -> None:
    if not THEORY.exists():
        return
    for path in THEORY.glob("ds*.html"):
        path.unlink(missing_ok=True)


def main() -> None:
    if not (ASSETS / "site.css").exists():
        raise SystemExit("Expected docs/assets/site.css to exist.")

    THEORY.mkdir(parents=True, exist_ok=True)
    WIKI.mkdir(parents=True, exist_ok=True)

    remove_legacy_theory_pages()

    theory_pages = build_theory_pages()
    wiki_pages = build_wiki_pages()

    theory_cards = "\n".join(
        [
            f'<a class="card" href="{p.slug}.html"><div class="card-title">{p.title}</div><div class="card-note">Chapters, definitions, mechanisms, and references.</div></a>'
            for p in theory_pages
        ]
    )
    (THEORY / "index.html").write_text(
        html_page(
            "Theory",
            "\n".join(
                [
                    "<h1>Theory</h1>",
                    "<p>The theory section is written as engineer-friendly notes. Each page has 3–4 short chapters, defined terminology, a transparent SVG diagram, and references.</p>",
                    "<p>The goal is to explain mechanisms and trade-offs without duplicating specification text.</p>",
                    f'<div class="link-grid">{theory_cards}</div>',
                ]
            ),
            prefix="../",
        ),
        encoding="utf-8",
    )
    for p in theory_pages:
        (THEORY / f"{p.slug}.html").write_text(render_page(p), encoding="utf-8")

    wiki_cards = "\n".join(
        [
            f'<a class="card" href="{p.slug}.html"><div class="card-title">{p.title}</div><div class="card-note">Definition, role in VSAVM, mechanics, references.</div></a>'
            for p in wiki_pages
        ]
    )
    (WIKI / "index.html").write_text(
        html_page(
            "Wiki",
            "\n".join(
                [
                    "<h1>Wiki</h1>",
                    "<p>The wiki defines core terms used throughout VSAVM. Each entry includes short chapters and a transparent SVG diagram with an operational interpretation.</p>",
                    f'<div class="link-grid">{wiki_cards}</div>',
                ]
            ),
            prefix="../",
        ),
        encoding="utf-8",
    )
    for p in wiki_pages:
        (WIKI / f"{p.slug}.html").write_text(render_page(p), encoding="utf-8")


if __name__ == "__main__":
    main()
