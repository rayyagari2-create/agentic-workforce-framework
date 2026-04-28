import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';

export async function check() {
  const cwd = process.cwd();
  const results = [];

  const awfExists = await fs.pathExists(path.join(cwd, '.awf'));
  results.push({ name: '.awf/ directory exists', pass: awfExists });

  try {
    const config = await fs.readJson(path.join(cwd, '.awf', 'awf.config.json'));
    results.push({ name: '.awf/awf.config.json is valid', pass: !!config.version });
  } catch {
    results.push({ name: '.awf/awf.config.json is valid', pass: false });
  }

  try {
    const agents = await fs.readdir(path.join(cwd, '.awf', 'agents'));
    results.push({ name: 'At least one agent file present', pass: agents.length > 0 });
  } catch {
    results.push({ name: 'At least one agent file present', pass: false });
  }

  try {
    const schemas = await fs.readdir(path.join(cwd, '.awf', 'schemas'));
    results.push({ name: 'Schema files present', pass: schemas.length > 0 });
  } catch {
    results.push({ name: 'Schema files present', pass: false });
  }

  const flExists = await fs.pathExists(
    path.join(cwd, '.awf', 'failures', 'failure-library.md')
  );
  results.push({ name: 'Failure library present', pass: flExists });

  for (const r of results) {
    if (r.pass) {
      console.log(chalk.green('[ok]') + ' ' + r.name);
    } else {
      console.log(chalk.red('[error]') + ' ' + r.name + chalk.red(' — missing or invalid'));
    }
  }

  const claudeResults = [];
  let runtime = null;
  try {
    const config = await fs.readJson(path.join(cwd, '.awf', 'awf.config.json'));
    runtime = config.runtime;
  } catch {
    runtime = null;
  }

  if (runtime === 'claude-code') {
    const hookExists = await fs.pathExists(
      path.join(cwd, '.claude', 'hooks', 'check-agent-spawn.example.js')
    );
    claudeResults.push({
      name: hookExists
        ? 'Claude Code hook file present'
        : 'Claude Code selected but hook file missing',
      pass: hookExists
    });

    const settingsExists = await fs.pathExists(
      path.join(cwd, '.claude', 'settings.awf.example.json')
    );
    claudeResults.push({
      name: settingsExists
        ? 'Claude Code settings example present'
        : 'Claude Code selected but settings example missing',
      pass: settingsExists
    });

    for (const r of claudeResults) {
      if (r.pass) {
        console.log(chalk.green('[ok]') + ' ' + r.name);
      } else {
        console.log(chalk.red('[error]') + ' ' + r.name + chalk.red(' — missing'));
      }
    }
  }

  const allPass = [...results, ...claudeResults].every(r => r.pass);
  if (allPass) {
    console.log(chalk.green.bold('\nFramework setup looks good.'));
  } else {
    console.log(chalk.red.bold('\nSome checks failed. Run awf init to fix.'));
  }
}
