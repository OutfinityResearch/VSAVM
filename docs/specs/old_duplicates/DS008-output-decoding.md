# DS008 Decoding back to natural language

Decoding is a surface realization of an internal result. The VM produces a verdict, a structured object, a distribution, or a plan. The realizer turns that into text or into events compatible with the input modality.

For text, the realizer may use a discrete generator over macro phrases, yet it must remain faithful to the VM state and avoid introducing new facts. For multimodal outputs, the result can be an event stream such as relations, steps, or a structured summary.

The principle remains the same: output is derived from VM state, not from unconstrained statistical improvisation.
