#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const checks = [
  {
    file: 'apps/bujogeek/frontend/src/utils/constants.js',
    patterns: [
      ['SIDEBAR_WIDTH = 220', /SIDEBAR_WIDTH\s*=\s*220/],
      ['TOPBAR_HEIGHT = 60', /TOPBAR_HEIGHT\s*=\s*60/],
    ],
  },
  {
    file: 'apps/bujogeek/frontend/src/theme/theme.js',
    patterns: [
      ['MuiDrawer width 220', /width:\s*220/],
      ['MuiAppBar height 60', /height:\s*60/],
      ['button minHeight 44', /minHeight:\s*44/],
      ['chip radius 4', /borderRadius:\s*4/],
    ],
  },
  {
    file: 'apps/fitnessgeek/frontend/src/components/Layout/ModernLayout.jsx',
    patterns: [
      ['DRAWER_WIDTH = 220', /DRAWER_WIDTH\s*=\s*220/],
      ['desktop top bar minHeight 60', /minHeight:\s*'60px !important'/],
      ['desktop content offset 60', /md:\s*'60px'/],
    ],
  },
  {
    file: 'apps/fitnessgeek/frontend/src/theme/theme.jsx',
    patterns: [
      ['small button minHeight 44', /minHeight:\s*'44px'/],
      ['chip height 24', /height:\s*24/],
      ['chip radius token 4', /pill:\s*4/],
    ],
  },
  {
    file: 'apps/basegeek/packages/ui/src/components/Layout.jsx',
    patterns: [
      ['SIDEBAR_WIDTH = 220', /SIDEBAR_WIDTH\s*=\s*220/],
      ['mobile top bar 60', /height:\s*'60px'/],
    ],
  },
];

let failed = false;

for (const check of checks) {
  const fullPath = path.join(root, check.file);
  const source = fs.readFileSync(fullPath, 'utf8');

  for (const [label, pattern] of check.patterns) {
    if (!pattern.test(source)) {
      failed = true;
      console.error(`[ui-unification] ${check.file}: missing ${label}`);
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log('[ui-unification] suite shell and primitive guardrails passed');
