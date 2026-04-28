import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

export const MODULES = {
  'five-agent-team': {
    description: 'Five agent instruction files: Orchestrator, Frontend, Backend, QA, Fix',
    files: [
      {
        src: 'agents/orchestrator.md',
        dest: '.awf/agents/orchestrator.md'
      },
      {
        src: 'agents/frontend-agent.md',
        dest: '.awf/agents/frontend-agent.md'
      },
      {
        src: 'agents/backend-agent.md',
        dest: '.awf/agents/backend-agent.md'
      },
      {
        src: 'agents/qa-agent.md',
        dest: '.awf/agents/qa-agent.md'
      },
      {
        src: 'agents/fix-agent.md',
        dest: '.awf/agents/fix-agent.md'
      }
    ],
    dirs: ['.awf/agents']
  },
  'trust-scoring': {
    description: 'D1-D4 trust scoring rubric, calibration anchors, and TrustScore schema',
    files: [
      {
        src: 'calibration/d1-d4-rubric.md',
        dest: '.awf/calibration/d1-d4-rubric.md'
      },
      {
        src: 'schemas/trust-score.schema.json',
        dest: '.awf/schemas/trust-score.schema.json'
      },
      {
        src: 'examples/example.trust-score.json',
        dest: '.awf/trust-scores/example.trust-score.json'
      }
    ],
    dirs: ['.awf/calibration', '.awf/schemas', '.awf/trust-scores']
  },
  'failure-memory': {
    description: 'Failure library template, FailureRecord schema, and example',
    files: [
      {
        src: 'governance/failure-library.md',
        dest: '.awf/failures/failure-library.md'
      },
      {
        src: 'schemas/failure-record.schema.json',
        dest: '.awf/schemas/failure-record.schema.json'
      },
      {
        src: 'examples/example.failure.json',
        dest: '.awf/failures/example.failure.json'
      }
    ],
    dirs: ['.awf/failures', '.awf/schemas']
  },
  'task-manifest': {
    description: 'AgentTaskManifest schema, sidecar schema, and example manifest',
    files: [
      {
        src: 'schemas/agent-task-manifest.schema.json',
        dest: '.awf/schemas/agent-task-manifest.schema.json'
      },
      {
        src: 'schemas/agent-spawn-sidecar.schema.json',
        dest: '.awf/schemas/agent-spawn-sidecar.schema.json'
      },
      {
        src: 'examples/example.manifest.json',
        dest: '.awf/manifests/example.manifest.json'
      }
    ],
    dirs: ['.awf/schemas', '.awf/manifests']
  },
  'claude-code-hooks': {
    description: 'Hook examples and Claude Code settings example file',
    files: [
      {
        src: 'hooks/check-agent-spawn.example.js',
        dest: '.awf/hooks/check-agent-spawn.example.js'
      },
      {
        src: 'hooks/check-agent-spawn.example.js',
        dest: '.claude/hooks/check-agent-spawn.example.js'
      },
      {
        src: 'hooks/claude-code-settings.example.json',
        dest: '.claude/settings.awf.example.json'
      }
    ],
    dirs: ['.awf/hooks', '.claude/hooks'],
    claudeOnly: true
  }
};

export const DEFAULT_MODULES = [
  'five-agent-team',
  'trust-scoring',
  'failure-memory',
  'task-manifest'
];
