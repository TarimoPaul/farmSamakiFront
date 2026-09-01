import { defineConfig } from 'vitest/config';

/**
 * Vitest options the Angular `@angular/build:unit-test` builder does not
 * expose as flags. It is loaded because angular.json sets `runnerConfig: true`;
 * everything else about the run - the build, the TestBed setup, which files
 * are specs - still comes from the builder, and belongs there, not here.
 *
 * WHY THIS EXISTS. Vitest's forks pool defaults to one worker per CPU, so on
 * this 16-core machine it started a fork for all 12 spec files at once. Each
 * one boots jsdom, zone.js and the whole Angular test bundle, and enough of
 * them lost the startup handshake that the suite died without running a
 * single test:
 *
 *   Error: [vitest-pool]: Failed to start forks worker for test files ...
 *   Caused by: Error: [vitest-pool-runner]: Timeout waiting for worker to respond
 *
 * - 12 errors, "no tests", ~29 minutes. It was not a flake and not the specs:
 * the same files pass in seconds when `--include` splits them into batches of
 * five or six, which is what pointed at the fork count rather than at any one
 * test.
 *
 * Four is well under what the machine has and comfortably over what a batch
 * that already worked used. The suite is small - one command, ~108 tests -
 * so the ceiling costs nothing measurable, and a slower CI box has more head
 * room, not less.
 */
export default defineConfig({
  test: {
    poolOptions: {
      forks: {
        maxForks: 4,
        minForks: 1,
      },
    },
  },
});
