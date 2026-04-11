#!/usr/bin/env node

/**
 * Simple Cluster Performance Comparison
 * Runs baseline test and cluster test sequentially
 */

import { spawn } from "child_process";
import { performance } from "perf_hooks";
import os from "os";

interface TestResult {
  mode: string;
  duration: number;
  totalRequests: number;
  throughput: number;
  latencyAvg: number;
  latencyP95: number;
  latencyP99: number;
  memoryMB: number;
  errorRate: number;
  workersCount: number;
}

class PerfTest {
  private results: TestResult[] = [];

  async run() {
    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║       🚀 CLUSTER PERFORMANCE COMPARISON 🚀                  ║");
    console.log("║                                                            ║");
    console.log("║  Testing: Single-Process vs Multi-Process Cluster          ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");

    try {
      // Test 1: Baseline
      console.log("━".repeat(60));
      console.log("TEST 1/2: BASELINE (Single-Process, DISABLE_CLUSTER=1)");
      console.log("━".repeat(60) + "\n");
      const baselineResult = await this.runTest({
        env: { DISABLE_CLUSTER: "1" },
        script: "test-baseline-perf.ts",
      });
      this.results.push(baselineResult);
      console.log("\n✅ Baseline test complete\n");

      // Test 2: Cluster
      console.log("━".repeat(60));
      console.log("TEST 2/2: CLUSTER (Multi-Process, DISABLE_CLUSTER=0)");
      console.log("━".repeat(60) + "\n");
      const clusterResult = await this.runTest({
        env: { DISABLE_CLUSTER: "0" },
        script: "test-cluster-perf-run.ts",
      });
      this.results.push(clusterResult);
      console.log("\n✅ Cluster test complete\n");

      // Compare
      this.printComparison(baselineResult, clusterResult);
      this.printVerdict(baselineResult, clusterResult);
    } catch (error) {
      console.error("❌ Test failed:", error);
      process.exit(1);
    }
  }

  private async runTest(options: {
    env: Record<string, string>;
    script: string;
  }): Promise<TestResult> {
    return new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        ...options.env,
      };

      const proc = spawn("pnpm", ["exec", "tsx", options.script], {
        env,
        stdio: "pipe",
      });

      let output = "";
      let errorOutput = "";

      proc.stdout?.on("data", (data) => {
        const str = data.toString();
        output += str;
        // Stream output but filter JSON results
        if (!str.includes("{")) {
          process.stdout.write(str);
        }
      });

      proc.stderr?.on("data", (data) => {
        const str = data.toString();
        errorOutput += str;
        process.stderr.write(str);
      });

      proc.on("close", (code) => {
        if (code !== 0) {
          return reject(
            new Error(
              `Test exited with code ${code}:\nStderr: ${errorOutput}\nStdout: ${output}`
            )
          );
        }

        try {
          // Find JSON result in output
          const jsonMatch = output.match(/\{[\s\S]*?"workersCount"[\s\S]*?\}/);
          if (!jsonMatch) {
            throw new Error(`No JSON result found in output:\n${output}`);
          }

          const result: TestResult = JSON.parse(jsonMatch[0]);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });

      proc.on("error", (err) => {
        reject(new Error(`Failed to spawn: ${err.message}`));
      });
    });
  }

  private printComparison(baseline: TestResult, cluster: TestResult) {
    const throughputGain = (
      (cluster.throughput - baseline.throughput) / baseline.throughput) * 100;
    const latencyChange = (
      (cluster.latencyAvg - baseline.latencyAvg) / baseline.latencyAvg) * 100;
    const memoryChange = (
      (cluster.memoryMB - baseline.memoryMB) / baseline.memoryMB) * 100;

    console.log("\n╔════════════════════════════════════════════════════════════╗");
    console.log("║                    📊 COMPARISON 📊                         ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");

    console.log("Metric                  │ Baseline    │ Cluster     │ Change");
    console.log("─".repeat(63));
    console.log(
      `Throughput (req/s)      │ ${baseline.throughput.toFixed(2).padEnd(11)} │ ${cluster.throughput.toFixed(2).padEnd(11)} │ ${throughputGain > 0 ? "+" : ""}${throughputGain.toFixed(1)}%`
    );
    console.log(
      `Avg Latency (ms)        │ ${baseline.latencyAvg.toFixed(2).padEnd(11)} │ ${cluster.latencyAvg.toFixed(2).padEnd(11)} │ ${latencyChange > 0 ? "+" : ""}${latencyChange.toFixed(1)}%`
    );
    console.log(
      `Memory (MB)             │ ${baseline.memoryMB.toFixed(2).padEnd(11)} │ ${cluster.memoryMB.toFixed(2).padEnd(11)} │ ${memoryChange > 0 ? "+" : ""}${memoryChange.toFixed(1)}%`
    );
    console.log(
      `Error Rate (%)          │ ${baseline.errorRate.toFixed(2).padEnd(11)} │ ${cluster.errorRate.toFixed(2).padEnd(11)} │ ${cluster.errorRate - baseline.errorRate > 0 ? "+" : ""}${(cluster.errorRate - baseline.errorRate).toFixed(2)}%`
    );
    console.log(
      `Workers                 │ ${String(baseline.workersCount).padEnd(11)} │ ${String(cluster.workersCount).padEnd(11)} │ x${(cluster.workersCount / baseline.workersCount).toFixed(1)}`
    );
  }

  private printVerdict(baseline: TestResult, cluster: TestResult) {
    const throughputGain = (
      (cluster.throughput - baseline.throughput) / baseline.throughput) * 100;
    const latencyChange = Math.abs(
      (cluster.latencyAvg - baseline.latencyAvg) / baseline.latencyAvg * 100);
    const errorRegression = cluster.errorRate > baseline.errorRate * 1.2;

    const clusterKWins =
      throughputGain >= 10 && latencyChange <= 30 && !errorRegression;

    console.log("\n╔════════════════════════════════════════════════════════════╗");
    console.log("║                      ✅ VERDICT ✅                          ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");

    console.log(`📈 Throughput gain:        ${throughputGain > 0 ? "+" : ""}${throughputGain.toFixed(1)}% ${throughputGain >= 10 ? "✅ Excellent" : "⚠️  Minimal"}`);
    console.log(`⏱️  Latency impact:         ${latencyChange.toFixed(1)}% ${latencyChange <= 20 ? "✅ Stable" : latencyChange <= 30 ? "⚠️  Acceptable" : "❌ Degraded"}`);
    console.log(`❌ Error regression:       ${errorRegression ? "YES (BAD)" : "NO (GOOD)"}`);
    console.log(`🔄 Workers active:         ${cluster.workersCount}`);

    console.log(`\n${"═".repeat(60)}`);
    console.log(
      clusterKWins
        ? "🎯 CLUSTER: ✅ RECOMMENDED (Performance Gains Confirmed)"
        : "🎯 CLUSTER: ⚠️  REVIEW (Limited Gains, Verify Workload Fit)"
    );
    console.log(`${"═".repeat(60)}\n`);
  }
}

const tester = new PerfTest();
tester.run().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
