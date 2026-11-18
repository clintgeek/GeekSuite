import { describe, it, expect } from 'vitest';
import { rewriteIconImports } from '../../testing/muiIconsPlugin.js';

describe('the test-only icon import rewrite', () => {
  it('turns a barrel import into one import per icon, aliases kept', () => {
    const out = rewriteIconImports("import { Add, Close as CloseIcon } from '@mui/icons-material';\nconst a = 1;\n");
    expect(out).toBe(
      "import Add from '@mui/icons-material/Add'; import CloseIcon from '@mui/icons-material/Close';\nconst a = 1;\n",
    );
  });

  it('keeps the line count of a multi-line import, comments and trailing comma included', () => {
    const src = "import {\n  Add as AddIcon, // the plus\n  MoreHoriz,\n} from \"@mui/icons-material\";\nexport const x = 2;\n";
    const out = rewriteIconImports(src);
    expect(out.split('\n').length).toBe(src.split('\n').length);
    expect(out).toContain("import AddIcon from '@mui/icons-material/Add';");
    expect(out).toContain("import MoreHoriz from '@mui/icons-material/MoreHoriz';");
    expect(out).toContain('export const x = 2;');
    expect(out).not.toContain('"@mui/icons-material"');
  });

  it('leaves per-icon imports, other packages and odd forms alone', () => {
    expect(rewriteIconImports("import Add from '@mui/icons-material/Add';")).toBeNull();
    expect(rewriteIconImports("import { Box } from '@mui/material';")).toBeNull();
    expect(rewriteIconImports("import * as Icons from '@mui/icons-material';")).toBeNull();
    expect(rewriteIconImports("import { default as Icons } from '@mui/icons-material';")).toBeNull();
  });
});
