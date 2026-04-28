import inquirer from 'inquirer';
import chalk from 'chalk';
import { installModule, writeConfig } from '../lib/installer.js';
import { DEFAULT_MODULES } from '../lib/modules.js';
import fs from 'fs-extra';
import path from 'path';

export async function init() {
  const cwd = process.cwd();

  const awfExists = await fs.pathExists(path.join(cwd, '.awf'));
  if (awfExists) {
    const { overwrite } = await inquirer.prompt([{
      type: 'confirm',
      name: 'overwrite',
      message: 'Framework already exists. Continue and skip existing files?',
      default: false
    }]);
    if (!overwrite) {
      console.log(chalk.yellow('Aborted.'));
      return;
    }
  }

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'runtime',
      message: 'Which runtime are you using?',
      choices: [
        {
          name: 'Claude Code — installs agent templates, hook templates, and settings example',
          value: 'claude-code'
        },
        {
          name: 'Cursor / Windsurf / Other — installs runtime-agnostic framework artifacts only',
          value: 'other'
        }
      ]
    },
    {
      type: 'checkbox',
      name: 'modules',
      message: 'Which modules do you want to install?',
      choices: [
        { name: 'five-agent-team  — Orchestrator, Frontend, Backend, QA, Fix agent files', value: 'five-agent-team', checked: true },
        { name: 'trust-scoring    — D1-D4 rubric, calibration anchors, TrustScore schema', value: 'trust-scoring', checked: true },
        { name: 'failure-memory   — Failure library, FailureRecord schema, example', value: 'failure-memory', checked: true },
        { name: 'task-manifest    — AgentTaskManifest schema, sidecar schema, example', value: 'task-manifest', checked: true },
        { name: 'claude-code-hooks — Hook examples and Claude Code settings template', value: 'claude-code-hooks', checked: false }
      ]
    },
    {
      type: 'confirm',
      name: 'includePostgres',
      message: 'Record Postgres governance schema preference? (config only in v0.1)',
      default: false
    }
  ]);

  if (answers.runtime === 'claude-code' && !answers.modules.includes('claude-code-hooks')) {
    answers.modules.push('claude-code-hooks');
    console.log(chalk.blue('\nAuto-adding claude-code-hooks for Claude Code runtime.'));
  }

  for (const mod of answers.modules) {
    await installModule(mod, cwd);
  }

  const config = {
    version: '0.1.0',
    runtime: answers.runtime,
    modules: answers.modules,
    includesPostgres: answers.includePostgres,
    createdAt: new Date().toISOString()
  };

  await writeConfig(cwd, config);

  console.log(chalk.green.bold('\n[ok] Agentic Workforce Framework scaffolded successfully.'));
  console.log(chalk.white('\nNext steps:'));
  console.log(chalk.white('  1. Review .awf/awf.config.json'));
  console.log(chalk.white('  2. Read .awf/agents/orchestrator.md'));
  console.log(chalk.white('  3. Adapt the agent files to your repo before use'));
  console.log(chalk.white('  4. Run awf check to validate setup'));
  console.log(chalk.white('\nAdd more modules anytime with: awf add <module>'));
  console.log(chalk.white('Docs: https://github.com/rayyagari2-create/agentic-workforce-framework'));
}
