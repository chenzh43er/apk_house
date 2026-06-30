import { execSync } from "node:child_process";

const port = process.argv[2] || "8787";

function killWindowsPort(p) {
  try {
    const out = execSync(`netstat -ano | findstr :${p}`, { encoding: "utf8" });
    const pids = new Set();
    for (const line of out.split("\n")) {
      const m = line.trim().match(/LISTENING\s+(\d+)\s*$/i);
      if (m) {
        pids.add(m[1]);
      }
    }
    for (const pid of pids) {
      if (pid === "0") {
        continue;
      }
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
        console.log(`已释放端口 ${p} (PID ${pid})`);
      } catch {
        // 进程可能已退出
      }
    }
  } catch {
    // 端口未被占用
  }
}

function killUnixPort(p) {
  try {
    execSync(`lsof -ti:${p} | xargs -r kill -9`, { stdio: "ignore" });
    console.log(`已释放端口 ${p}`);
  } catch {
    // 端口未被占用
  }
}

if (process.platform === "win32") {
  killWindowsPort(port);
} else {
  killUnixPort(port);
}
