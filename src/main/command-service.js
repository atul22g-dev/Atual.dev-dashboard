/* ============================================================
   ⚙️ COMMAND SERVICE — centralized command execution (Phase 3)
   ============================================================
   Every provider shell call goes through here so that timeout,
   maxBuffer, and error handling are standardized in ONE place
   (plan.md §7 "Command service").

   API:
     runCommand(cmd, opts)              → { ok, code, stdout, stderr, message }
     runCommandFile(file, args, opts)   → same result, but via execFile with
                                          NO shell (Phase 1/3 carry-over:
                                          prefer shell-free execution where
                                          practical)
     runCommandUntilSuccess(cmds, opts) → first ok result (or last failure)

   Unlike the raw `exec` callback API, runCommand NEVER throws for a
   command failure — it resolves a predictable result object, so
   providers can use async/await without try/catch pyramids.
   ============================================================ */

'use strict';

const { exec, execFile } = require('child_process');
const { execAsync } = require('./exec-async');

/** Defaults applied when a caller doesn't override them. */
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_BUFFER = 1024 * 1024;

/** Normalize an exec/execFile error into the shared result shape. */
function toResult(error) {
  return {
    ok: false,
    code: typeof error.code === 'number' ? error.code : null,
    stdout: String(error.stdout || ''),
    stderr: String(error.stderr || ''),
    message: error.message || 'Command failed',
  };
}

/**
 * Run a single shell command with explicit timeout + maxBuffer.
 * Resolves ALWAYS (never rejects) with a normalized result.
 *
 * @param {string} command
 * @param {{ timeout?: number, maxBuffer?: number }} [options]
 * @returns {Promise<{ ok: boolean, code: number|null, stdout: string, stderr: string, message: string }>}
 */
async function runCommand(command, options = {}) {
  // Clamp to the defaults: a `timeout: 0` would silently mean "no timeout"
  // to child_process.exec and could let a command hang indefinitely.
  const timeout = Number.isFinite(options.timeout) && options.timeout > 0 ? options.timeout : DEFAULT_TIMEOUT_MS;
  const maxBuffer = Number.isFinite(options.maxBuffer) && options.maxBuffer > 0 ? options.maxBuffer : DEFAULT_MAX_BUFFER;

  try {
    const { stdout, stderr } = await execAsync(command, { timeout, maxBuffer });
    return {
      ok: true,
      code: 0,
      stdout: String(stdout || ''),
      stderr: String(stderr || ''),
      message: '',
    };
  } catch (error) {
    return toResult(error);
  }
}

/**
 * Run an executable directly with an args array and NO shell (execFile).
 * Phase 1 §1.3 / Phase 3 carry-over: prefer this over shell `exec` whenever
 * the command is a plain binary + fixed args (no pipes, redirects, or
 * variable expansion). Eliminates cmd.exe/POSIX shell interpretation of
 * renderer-adjacent data entirely.
 *
 * Same normalized result shape as runCommand(); never rejects.
 *
 * @param {string} file executable path or name resolved via PATH
 * @param {string[]} [args]
 * @param {{ timeout?: number, maxBuffer?: number }} [options]
 * @returns {Promise<{ ok: boolean, code: number|null, stdout: string, stderr: string, message: string }>}
 */
async function runCommandFile(file, args = [], options = {}) {
  const timeout = Number.isFinite(options.timeout) && options.timeout > 0 ? options.timeout : DEFAULT_TIMEOUT_MS;
  const maxBuffer = Number.isFinite(options.maxBuffer) && options.maxBuffer > 0 ? options.maxBuffer : DEFAULT_MAX_BUFFER;

  try {
    const result = await new Promise((resolve, reject) => {
      execFile(file, args, { timeout, maxBuffer }, (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      });
    });
    return {
      ok: true,
      code: 0,
      stdout: String(result.stdout || ''),
      stderr: String(result.stderr || ''),
      message: '',
    };
  } catch (error) {
    return toResult(error);
  }
}

/**
 * Run a list of commands in order, returning the first successful result.
 * If every command fails, returns the LAST failure result so callers can
 * report why. Flattens nested fallback chains (battery/temperature) into
 * a simple sequential loop.
 *
 * @param {string[]} commands
 * @param {{ timeout?: number, maxBuffer?: number }} [options]
 * @returns {Promise<{ ok: boolean, code: number|null, stdout: string, stderr: string, message: string }>}
 */
async function runCommandUntilSuccess(commands, options = {}) {
  let lastResult = null;
  for (const command of commands) {
    const result = await runCommand(command, options);
    if (result.ok) return result;
    lastResult = result;
  }
  return lastResult || { ok: false, code: null, stdout: '', stderr: '', message: 'All commands failed' };
}

module.exports = {
  runCommand,
  runCommandFile,
  runCommandUntilSuccess,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_BUFFER,
};
