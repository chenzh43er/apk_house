export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0s';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (min < 60) return `${min}m ${remSec}s`;
  const hour = Math.floor(min / 60);
  const remMin = min % 60;
  return `${hour}h ${remMin}m`;
}

export function formatPercent(current, total) {
  if (!total) return '100%';
  const pct = Math.min(100, (current / total) * 100);
  return `${pct.toFixed(1)}%`;
}

export function estimateEta(elapsedMs, current, total) {
  if (!current || !total || current >= total) return '--';
  const remaining = (elapsedMs / current) * (total - current);
  return formatDuration(remaining);
}

export function shortText(text, max = 72) {
  const value = String(text || '');
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}

export function createStepProgress(options = {}) {
  const {
    label = '',
    total = 0,
    quiet = false
  } = options;

  const started = Date.now();
  let current = 0;

  function prefix() {
    return label ? `[${label}] ` : '';
  }

  return {
    start(message = '') {
      if (quiet) return;
      const totalNote = total > 0 ? ` (${total} total)` : '';
      console.log(`${prefix()}Start${totalNote}${message ? `: ${message}` : ''}`);
    },

    tick(step = 1, detail = '') {
      current += step;
      if (quiet) return;

      const elapsed = Date.now() - started;
      const counter = total > 0 ? `${current}/${total}` : `${current}`;
      const pct = total > 0 ? ` ${formatPercent(current, total)}` : '';
      const timing = `elapsed ${formatDuration(elapsed)}, eta ${estimateEta(elapsed, current, total)}`;
      const suffix = detail ? ` | ${detail}` : '';

      console.log(`${prefix()}${counter}${pct} | ${timing}${suffix}`);
    },

    log(message) {
      if (quiet) return;
      console.log(`${prefix()}${message}`);
    },

    done(message = '') {
      if (quiet) return;
      const elapsed = Date.now() - started;
      const counter = total > 0 ? `${current}/${total}` : `${current}`;
      console.log(`${prefix()}Done ${counter} in ${formatDuration(elapsed)}${message ? ` | ${message}` : ''}`);
    },

    get current() {
      return current;
    },

    get elapsed() {
      return Date.now() - started;
    }
  };
}

export function createBatchProgress(totalRegions, options = {}) {
  const { label = 'Batch' } = options;
  const started = Date.now();
  let completedRegions = 0;
  let totalListings = 0;
  let newListings = 0;
  let failedRegions = 0;

  return {
    regionStart(index, region) {
      const pct = formatPercent(index, totalRegions);
      console.log(`\n${'='.repeat(64)}`);
      console.log(`[${label} ${index + 1}/${totalRegions} ${pct}] ${region.label} (${region.abbr})`);
      console.log(`${'='.repeat(64)}`);
    },

    regionDone(meta = {}) {
      completedRegions += 1;
      totalListings += meta.totalListings || 0;
      newListings += meta.newListings || 0;
      if (meta.failed) failedRegions += 1;

      const elapsed = Date.now() - started;
      const pct = formatPercent(completedRegions, totalRegions);
      const eta = estimateEta(elapsed, completedRegions, totalRegions);

      console.log(
        `[${label} ${completedRegions}/${totalRegions} ${pct}] ` +
        `region done | +${meta.newListings || 0} new, ${meta.totalListings || 0} total in region | ` +
        `batch: ${totalListings} listings (+${newListings} new) | ` +
        `elapsed ${formatDuration(elapsed)}, eta ${eta}`
      );
    },

    summary() {
      const elapsed = Date.now() - started;
      return {
        completedRegions,
        failedRegions,
        totalListings,
        newListings,
        elapsed
      };
    },

    printSummary(extra = '') {
      const { completedRegions: done, failedRegions: failed, totalListings: listings, newListings: added, elapsed } = this.summary();
      console.log(`\n${'='.repeat(64)}`);
      console.log(`[${label} complete] ${done}/${totalRegions} regions`);
      console.log(`Listings: ${listings} total (+${added} new this run)`);
      if (failed > 0) console.log(`Failed regions: ${failed}`);
      console.log(`Elapsed: ${formatDuration(elapsed)}`);
      if (extra) console.log(extra);
      console.log(`${'='.repeat(64)}`);
    }
  };
}
