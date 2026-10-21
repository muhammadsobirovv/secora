// Test helper: starts a grandchild in the same process group that would write
// a marker file after 1.5 s, then idles. Used to prove the spawn utility kills
// the whole group on timeout, not only the direct child.
const { spawn } = require('node:child_process');
const marker = process.argv[2];
spawn(
  process.execPath,
  ['-e', `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'x'), 1500)`],
  { stdio: 'ignore' },
);
setTimeout(() => {}, 30000);
