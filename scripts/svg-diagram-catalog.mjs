export const GENERIC_SVG_MANIFESTS = [
  {
    input: "steering/assets/diagram-library.diagram.json",
    outputDirectory: "steering/assets",
    references: [
      { document: "steering/common-mermaid-diagram-standards.md", outputs: ["mermaid-delivery-flow.svg"] },
      { document: "steering/common-mermaid-syntax-rules.md", outputs: ["syntax-flowchart.svg", "syntax-delivery-flow.svg", "syntax-sequence.svg", "syntax-state.svg", "syntax-er.svg", "syntax-class.svg", "syntax-c4-context.svg", "syntax-c4-container.svg", "syntax-c4-component.svg", "syntax-c4-deployment.svg", "syntax-architecture.svg"] },
      { document: "steering/inception-requirements-data-model.md", outputs: ["requirements-er-template.svg", "requirements-state-template.svg"] },
      { document: "steering/inception-workflow-planning.md", outputs: ["workflow-plan-template.svg"] },
      { document: "steering/common-process-overview.md", outputs: ["process-lifecycle.svg"] },
      { document: "steering/common-ascii-diagram-standards.md", outputs: ["ascii-valid-box.svg", "ascii-invalid-box.svg", "ascii-calculator.svg", "ascii-nested-web.svg", "ascii-source-target.svg", "ascii-horizontal-flow.svg", "ascii-input-process-output.svg"] },
      { document: "steering/common-session-continuity.md", outputs: ["session-recovery.svg", "compact-recovery.svg"] },
      { document: "steering/construction-subagent-execution.md", outputs: ["subagent-orchestration.svg"] },
      { document: "steering/construction-tdd.md", outputs: ["tdd-cycle.svg"] },
      { document: "steering/common-test-execution-strategy.md", outputs: ["test-levels.svg"] },
      { document: "steering/construction-code-review.md", outputs: ["review-dual-axis.svg"] },
      { document: "steering/inception-requirements-methods.md", outputs: ["power-interest.svg"] }
    ]
  },
  {
    input: "docs/assets/historical-diagrams.diagram.json",
    outputDirectory: "docs/assets",
    references: [
      { document: "docs/proposal-modular-aidlc.md", outputs: ["proposal-modular-inception.svg"] },
      { document: "docs/AI-DLC-UI-RESTORATION-GAP-ANALYSIS.md", outputs: ["ui-restoration-guardrails.svg"] },
      { document: "docs/AI-DLC-OPTIMIZATION-IMPLEMENTATION.md", outputs: ["optimization-review-comparison.svg", "clarification-decision-tree.svg", "optimization-dual-axis-review.svg"] },
      { document: "docs/best-practices.md", outputs: ["best-practices-single-module-team.svg", "best-practices-multi-module-team.svg"] }
    ]
  },
  {
    input: "docs/optimization/assets/auto-context-management.diagram.json",
    outputDirectory: "docs/optimization/assets",
    references: [
      { document: "docs/optimization/auto-context-management.md", outputs: ["auto-context-platform-adaptation.svg"] }
    ]
  },
  {
    input: "docs/SSOT-AI-DLC/assets/ssot-integration-architecture.diagram.json",
    outputDirectory: "docs/SSOT-AI-DLC/assets",
    references: [
      { document: "docs/SSOT-AI-DLC/02-改造设计.md", outputs: ["ssot-integration-architecture.svg"] }
    ]
  }
]

export const STRICT_SVG_DIAGRAMS = [
  {
    input: "docs/assets/delivery-business-flow-test-10-nodes-3-branches.diagram.json",
    output: "docs/assets/delivery-business-flow-test-10-nodes-3-branches.svg",
    document: "docs/delivery-business-flow-test-10-nodes-3-branches.md"
  }
]
