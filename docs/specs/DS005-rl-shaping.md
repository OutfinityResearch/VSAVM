# DS005 RL as shaping without breaking the statistical core

Reinforcement learning is used for shaping in two concrete roles. The first is hypothesis selection when multiple candidate programs have similar predictive scores. The second is a consistency discipline that penalizes conclusions leading to contradictions under bounded closure.

This RL does not replace text training and does not operate at the token level. It acts on choices among programs and response modes, keeping reasoning within search and verification rather than millions of gradient steps.

In practice a bandit or offline preference setup is sufficient. Actions are program selections, and rewards reflect stability and consistency rather than surface fluency alone.
