/* ============================================================
   ⚙️ EXEC-ASYNC — promisified child_process.exec (Phase 2 split)
   ============================================================
   Small helper that wraps `child_process.exec` in a Promise so
   providers can use async/await instead of nesting callbacks.
   Options are passed through untouched, so behavior is identical
   to the original callback-based calls.
   ============================================================ */

'use strict';

const { exec } = require('child_process');

/**
 * Promise wrapper for child_process.exec.
 * Resolves with { stdout, stderr }; rejects only on spawn failure
 * (the command's own non-zero exit is reported via stdout/stderr
 * + error.code just like the callback API).
 *
 * @param {string} command
 * @param {import('child_process').ExecOptions} [options]
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
function execAsync(command, options = {}) {
  return new Promise((resolve, reject) => {
    exec(command, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

module.exports = { execAsync };
