#!/usr/bin/env node
import { program } from 'commander';
import { init } from '../cli/init.js';
import { add } from '../cli/add.js';
import { check } from '../cli/check.js';
import { audit } from '../cli/audit.js';

program
  .name('awf')
  .description('CLI for scaffolding and validating Agentic Workforce Framework artifacts')
  .version('0.1.0');

program
  .command('init')
  .description('Scaffold the full Agentic Workforce Framework into your repo')
  .action(init);

program
  .command('add <module>')
  .description('Add a specific framework module to your repo')
  .action(add);

program
  .command('check')
  .description('Validate that the framework is set up correctly')
  .action(check);

program
  .command('audit <action>')
  .description('Audit service operator commands. Supported: verify')
  .action(audit);

program.parse();
