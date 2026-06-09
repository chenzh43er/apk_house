import { evaluateTrafficGuard } from "./traffic-guard.js";

export default {
  async fetch(request, env) {
    const blocked = evaluateTrafficGuard(request);
    if (blocked) return blocked;

    return env.APP.fetch(request);
  },
};
