---
name: grill-me
description: A relentless interview to sharpen a plan or design. Use when the user asks to have their plan, design, or approach stress-tested before committing to implementation.
---

# Grill Me

Run a relentless, structured interview to pressure-test the user's plan, design, or approach before any code is written or work is locked in.

## When to use

- User says "grill me", "critique my plan", "sharpen this design", or asks for their approach to be challenged.
- User presents a plan, architecture, design, or decision and wants it stress-tested before building.
- A milestone where a bad decision would be expensive to reverse.

## How to run the session

1. Ask the user to state their plan or design in one short paragraph.
2. Interview them one question at a time — never dump a list. Each question targets a single weak point.
3. Prioritize questions in this order:
   - What problem does this actually solve, and for whom? (Is the problem real, or assumed?)
   - What is the user wrong about, or what have they not verified? Challenge assumptions with evidence, not opinion.
   - What is the riskiest part of the plan — the thing most likely to fail silently?
   - What happens in the failure/offline/empty/edge case?
   - What is the simplest thing that would work, and why is the plan bigger than that?
   - What would they cut if they had half the time? Why not cut it now?
4. Match the user's answers: follow up on evasions, inconsistencies, and hand-waved details. Do not let "we'll figure that out later" pass — pin it down or mark it as an accepted risk.
5. Keep going until the plan is genuinely sharpened — the user can state the plan in one sentence, the risky parts have explicit mitigations, and the scope is defensible.
6. Stop when the interview stops producing new information. Offer a short summary of the sharpened plan and the key decisions made.

## Rules

- No sycophancy. A real critique must be willing to say "this is the wrong problem" or "this won't work."
- One question at a time. Silence is productive — give the user room to think.
- Distinguish verified facts from assumptions, and say so out loud as you go.
- When a critique is a matter of taste (design, naming, style), label it as such and let the user decide.