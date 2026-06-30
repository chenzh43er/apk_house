import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Ad Manager API 配置（服务端脚本专用，勿放入 Public/Js） */
export const GAM_API = {
  credentialsPath: path.join(ROOT, "secrets", "gam-service-account.json"),
  /** REST API OAuth scope（Beta） */
  scope: "https://www.googleapis.com/auth/admanager",
  restBase: "https://admanager.googleapis.com/v1",
  networkCode: "23357265712",
};
