import chalk from 'chalk';
import { installModule } from '../lib/installer.js';
import { MODULES } from '../lib/modules.js';

export async function add(moduleName) {
  const cwd = process.cwd();

  if (!MODULES[moduleName]) {
    console.log(chalk.red('[error] Unknown module: ' + moduleName));
    console.log(chalk.white('\nAvailable modules:'));
    for (const [name, mod] of Object.entries(MODULES)) {
      console.log(chalk.white('  ' + name + ' — ' + mod.description));
    }
    return;
  }

  const success = await installModule(moduleName, cwd);
  if (success) {
    console.log(chalk.green.bold('\n[ok] Module installed: ' + moduleName));
    console.log(chalk.white('Run awf check to validate your setup.'));
  }
}
