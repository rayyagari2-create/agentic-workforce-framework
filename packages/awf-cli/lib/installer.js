import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { TEMPLATES_DIR, MODULES } from './modules.js';

export async function installModule(moduleName, cwd) {
  const mod = MODULES[moduleName];
  if (!mod) {
    console.log(chalk.red('[error] Unknown module: ' + moduleName));
    console.log(chalk.white('Available modules: ' + Object.keys(MODULES).join(', ')));
    return false;
  }

  console.log(chalk.blue('\nInstalling module: ' + moduleName));
  console.log(chalk.white(mod.description));

  for (const dir of mod.dirs || []) {
    await fs.ensureDir(path.join(cwd, dir));
    console.log(chalk.blue('[dir]'), 'Created', dir);
  }

  for (const file of mod.files) {
    const src = path.join(TEMPLATES_DIR, file.src);
    const dest = path.join(cwd, file.dest);
    if (!await fs.pathExists(dest)) {
      await fs.copy(src, dest);
      console.log(chalk.green('[ok]'), 'Copied', file.dest);
    } else {
      console.log(chalk.yellow('[skip]'), 'Skipped existing', file.dest);
    }
  }

  return true;
}

export async function writeConfig(cwd, config) {
  const configPath = path.join(cwd, '.awf', 'awf.config.json');
  await fs.ensureDir(path.join(cwd, '.awf'));
  const existed = await fs.pathExists(configPath);
  await fs.writeJson(configPath, config, { spaces: 2 });
  if (existed) {
    console.log(chalk.green('[ok]'), 'Updated .awf/awf.config.json');
  } else {
    console.log(chalk.green('[ok]'), 'Created .awf/awf.config.json');
  }
}
