---
name: ask-choice
description: Ask the user to pick one option by sending channel buttons and pausing until they click or reply in text.
---

When the user wants a choice between options, follow these steps in order.

1. Call `load_skill_resource` with skill_name `ask-choice` and path `references/button-copy.md` before sending buttons.
2. Call `ask_choice` exactly once. Pass a prompt and at least two options. Each option has `id` and `title`.
3. Stop. Do not invent the click. Do not say the user already chose.
4. After a function response for `ask_choice`:
   - If `status` is `selected`, acknowledge that button id in one short sentence.
   - If `status` is `text`, they did not click. Follow the text. If they want different options, call `ask_choice` again with a new set. Do not invent a click.
