// ============================================================
//  INSPIRE HABITS — programming.js
//  Coverage-driven exercise selection.
//
//  Replaces "shuffle the pool and take the first N" with a
//  greedy coverage engine that guarantees:
//    1. Every MAJOR muscle group required by the chosen focus is
//       trained (full body => all 7).
//    2. MINOR / accessory groups ROTATE class-to-class, driven by
//       what the studio's recent classes already hit — every
//       instructor's, since the athletes are the same people.
//    3. No two consecutive exercises hammer the same prime mover
//       or fight over the same prop.
// ============================================================

// How many recent classes count as "recent" for accessory rotation.
const RECENCY_WINDOW = 5;

// ── CLASS HISTORY ─────────────────────────────────────────────
/**
 * Newest-first list of classes actually taught, each normalised to
 * { when, muscleLoad, exerciseNames, style, muscle }.
 * Sources: completed workouts (the shared studio log) + saved plans whose
 * class date/time has already passed.
 *
 * Deliberately studio-wide, not per-instructor: the athletes in the room are
 * the same bodies whoever is on the floor. If Kat hammered glutes on Monday,
 * Carson's Tuesday class needs to rotate away from them too.
 */
function getTaughtClasses(limit = RECENCY_WINDOW) {
  const out = [];

  (state.workoutHistory || []).forEach(h => {
    out.push({
      when: h.ts || h.id || 0,
      muscleLoad: h.muscleLoad || null,
      exerciseNames: h.exerciseNames || [],
      style: h.style, muscle: h.muscle,
      duration: h.duration || 0, participants: h.participants || 0,
      exercises: h.exercises || (h.exerciseNames || []).length,
      instructorId: h.instructorId || h.profileId || null,
      instructorName: h.instructorName || null,
      source: 'taught',
    });
  });

  if (typeof getProfilePlans === 'function' && typeof PROFILES !== 'undefined') {
    const now = Date.now();
    const ids = Object.keys(PROFILES);
    ids.forEach(id => {
      getProfilePlans(id).forEach(plan => {
        const t = new Date(plan.classDateTime).getTime();
        if (!t || t > now) return; // future class — not taught yet
        const exs = plan.workout?.exercises || [];
        if (!exs.length) return;
        out.push({
          when: t,
          muscleLoad: plan.muscleLoad || muscleLoadForExercises(exs),
          exerciseNames: exs.map(e => e.name),
          style: plan.style, muscle: plan.muscle,
          duration: plan.duration || plan.workout?.duration || 0,
          participants: plan.participants || plan.workout?.participants || 0,
          exercises: exs.length,
          instructorId: id,
          instructorName: (PROFILES[id] || {}).name || null,
          source: 'scheduled',
        });
      });
    });
  }

  return out
    .filter(c => c.muscleLoad || c.exerciseNames.length)
    .sort((a, b) => b.when - a.when)
    .slice(0, limit);
}

/**
 * For every muscle group: how many classes ago it was last trained,
 * how often it appeared in the window, and a 0–1 freshness score
 * (1 = untouched in the window, 0 = hammered last class).
 */
function computeMuscleRecency(classes) {
  const rec = {};
  Object.keys(MUSCLE_GROUPS).forEach(id => {
    rec[id] = { lastSeen: Infinity, freq: 0, load: 0, freshness: 1 };
  });

  classes.forEach((cls, idx) => {
    const load = cls.muscleLoad || {};
    Object.entries(load).forEach(([id, amount]) => {
      if (!rec[id] || amount <= 0) return;
      if (idx < rec[id].lastSeen) rec[id].lastSeen = idx;
      rec[id].freq += 1;
      // Older classes matter less.
      rec[id].load += amount * Math.pow(0.6, idx);
    });
  });

  const maxLoad = Math.max(1, ...Object.values(rec).map(r => r.load));
  Object.values(rec).forEach(r => {
    const recencyPart = r.lastSeen === Infinity ? 1 : Math.min(1, r.lastSeen / RECENCY_WINDOW);
    const volumePart  = 1 - (r.load / maxLoad);
    r.freshness = Math.max(0, Math.min(1, 0.6 * recencyPart + 0.4 * volumePart));
  });
  return rec;
}

/** How many classes ago each exercise was last programmed (0 = last class). */
function computeExerciseRecency(classes) {
  const rec = {};
  classes.forEach((cls, idx) => {
    (cls.exerciseNames || []).forEach(n => { if (rec[n] === undefined) rec[n] = idx; });
  });
  return rec;
}

/**
 * Pick this class's rotating accessory focus: the freshest minor
 * groups from the focus's minor pool. This is what makes the minor
 * muscles vary based on the last classes taught.
 */
function pickAccessoryFocus(contract, recency, count) {
  return [...contract.minorPool]
    .filter(id => MUSCLE_GROUPS[id])
    .map(id => ({ id, f: (recency[id]?.freshness ?? 1) + Math.random() * 0.12 }))
    .sort((a, b) => b.f - a.f)
    .slice(0, count)
    .map(x => x.id);
}

// ── SELECTION ENGINE ──────────────────────────────────────────
const SCORE = {
  missingMajorDirect:    300,  // this exercise is a PRIME MOVER for an untrained major
  missingMajorAssist:     60,  // major is completely untouched, this at least assists it
  weakDirectAssist:       25,  // major has assist-only coverage, this adds more assist
  accessoryPrimary:       55,
  accessorySecondary:     26,
  accessoryTertiary:       8,
  freshnessPrimary:       14,
  freshnessAssist:         5,
  repeatPrimaryPenalty:   22,
  repeatSecondaryPenalty:  6,
  propRepeatPenalty:      14,
  conditioningBonus:      30,
  timedMatchBonus:        12,
  balanceCorrection:      48,  // restores a push/pull or knee/hip deficit
  unilateralBonus:        34,  // class is short on single-side work
  patternRepeatPenalty:   16,  // three horizontal presses in a row is lazy programming
  jitter:                 22,
};
const EXERCISE_REPEAT_PENALTY = [70, 40, 18, 8];

function _scoreCandidate(ex, ctx) {
  const sig = resolveMuscles(ex);
  let score = 0;

  // ── Major-group coverage dominates while anything is still missing ──
  sig.primary.forEach(id => {
    if (ctx.needDirect.has(id)) score += SCORE.missingMajorDirect;
  });
  sig.secondary.forEach(id => {
    if (ctx.needAny.has(id))          score += SCORE.missingMajorAssist;
    else if (ctx.needDirect.has(id))  score += SCORE.weakDirectAssist;
  });

  // Accessory rotation is a tie-breaker until the majors are locked in.
  const accScale = ctx.needDirect.size ? 0.3 : 1;
  sig.primary.forEach(id => { if (ctx.accessoryPending.has(id)) score += SCORE.accessoryPrimary * accScale; });
  sig.secondary.forEach(id => { if (ctx.accessoryPending.has(id)) score += SCORE.accessorySecondary * accScale; });
  sig.tertiary.forEach(id => { if (ctx.accessoryPending.has(id)) score += SCORE.accessoryTertiary * accScale; });

  sig.primary.forEach(id => { score += SCORE.freshnessPrimary * (ctx.recency[id]?.freshness ?? 1); });
  sig.secondary.forEach(id => { score += SCORE.freshnessAssist * (ctx.recency[id]?.freshness ?? 1); });

  sig.primary.forEach(id => { score -= SCORE.repeatPrimaryPenalty * (ctx.load[id] || 0); });
  sig.secondary.forEach(id => { score -= SCORE.repeatSecondaryPenalty * (ctx.load[id] || 0); });

  const ago = ctx.exerciseRecency[ex.name];
  if (ago !== undefined && ago < EXERCISE_REPEAT_PENALTY.length) score -= EXERCISE_REPEAT_PENALTY[ago];

  score -= SCORE.propRepeatPenalty * (ctx.propUse[ex.prop] || 0);

  // ── Movement-pattern balance (second coverage dimension) ──
  const mv = resolveMovement(ex);
  ctx.balance.pairs.forEach(([a, b]) => {
    const ca = ctx.groupUse[a] || 0, cb = ctx.groupUse[b] || 0;
    if (mv.group === a && ca < cb) score += SCORE.balanceCorrection * Math.min(2, cb - ca);
    if (mv.group === b && cb < ca) score += SCORE.balanceCorrection * Math.min(2, ca - cb);
  });
  if (mv.unilateral && ctx.unilateralCount < ctx.balance.minUnilateral) score += SCORE.unilateralBonus;
  score -= SCORE.patternRepeatPenalty * (ctx.patternUse[mv.pattern] || 0);

  if (ctx.needConditioning && sig.conditioning) score += SCORE.conditioningBonus;
  if (ctx.preferTimed === !!ex.timed) score += SCORE.timedMatchBonus;

  return score + Math.random() * SCORE.jitter;
}

function _commit(ex, ctx) {
  const sig = resolveMuscles(ex);
  sig.primary  .forEach(id => ctx.load[id] = (ctx.load[id] || 0) + 1);
  sig.secondary.forEach(id => ctx.load[id] = (ctx.load[id] || 0) + 0.5);
  sig.tertiary .forEach(id => ctx.load[id] = (ctx.load[id] || 0) + 0.2);
  // Only a prime mover clears the "needs direct work" flag.
  sig.primary.forEach(id => ctx.needDirect.delete(id));
  [...sig.primary, ...sig.secondary].forEach(id => ctx.needAny.delete(id));
  [...sig.primary, ...sig.secondary].forEach(id => ctx.accessoryPending.delete(id));
  ctx.propUse[ex.prop] = (ctx.propUse[ex.prop] || 0) + 1;
  const mv = resolveMovement(ex);
  ctx.groupUse[mv.group]     = (ctx.groupUse[mv.group] || 0) + 1;
  ctx.patternUse[mv.pattern] = (ctx.patternUse[mv.pattern] || 0) + 1;
  if (mv.unilateral) ctx.unilateralCount++;
  if (sig.conditioning) ctx.needConditioning = false;
}

/**
 * Greedily choose `count` exercises that cover the focus contract.
 * @returns { selected, accessoryFocus, gaps, weakGaps, recency }
 */
function selectExercisesWithCoverage(candidates, opts) {
  const { count, focusKey, preferTimed, propLimits = {}, propCaps = {} } = opts;
  const contract = getFocusContract(focusKey);
  const classes  = getTaughtClasses(RECENCY_WINDOW);
  const recency  = computeMuscleRecency(classes);
  const exerciseRecency = computeExerciseRecency(classes);
  const accessoryFocus  = pickAccessoryFocus(contract, recency, contract.minorTargets);

  const ctx = {
    needDirect:       new Set(contract.requiredMajors),
    needAny:          new Set(contract.requiredMajors),
    accessoryPending: new Set(accessoryFocus),
    accessoryFocus,
    recency, exerciseRecency,
    load: {}, propUse: {},
    groupUse: {}, patternUse: {}, unilateralCount: 0,
    balance: getBalanceContract(focusKey),
    needConditioning: !!contract.wantConditioning,
    preferTimed: !!preferTimed,
  };

  const remaining = [...candidates];
  const selected  = [];
  const propCount = {};

  const allowed = ex => {
    const limit = propLimits[ex.prop];
    if (limit !== undefined && (propCount[ex.prop] || 0) >= limit) return false;
    const cap = propCaps[ex.prop];
    if (cap !== undefined && (propCount[ex.prop] || 0) >= cap) return false;
    return true;
  };

  while (selected.length < count && remaining.length) {
    let bestIdx = -1, bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      if (!allowed(remaining[i])) continue;
      const s = _scoreCandidate(remaining[i], ctx);
      if (s > bestScore) { bestScore = s; bestIdx = i; }
    }
    if (bestIdx === -1) break;
    const pick = remaining.splice(bestIdx, 1)[0];
    propCount[pick.prop] = (propCount[pick.prop] || 0) + 1;
    _commit(pick, ctx);
    selected.push(pick);
  }

  // ── Repair pass: force-cover anything still missing ──
  // Pass 1 closes total gaps, pass 2 upgrades assist-only groups to direct.
  [[...ctx.needAny], [...ctx.needDirect]].forEach(targets => {
    targets.forEach(missing => {
      if (selected.length < contract.requiredMajors.length) return;
      const fixIdx = remaining.findIndex(ex => allowed(ex) && resolveMuscles(ex).primary.includes(missing));
      if (fixIdx === -1) return;
      const dropIdx = _findExpendable(selected, contract, missing);
      if (dropIdx === -1) return;
      const dropped = selected[dropIdx];
      propCount[dropped.prop] = Math.max(0, (propCount[dropped.prop] || 1) - 1);
      const fix = remaining.splice(fixIdx, 1)[0];
      propCount[fix.prop] = (propCount[fix.prop] || 0) + 1;
      selected[dropIdx] = fix;
      ctx.needDirect.delete(missing);
      ctx.needAny.delete(missing);
    });
  });

  return {
    selected: sequenceForFlow(selected),
    accessoryFocus,
    gaps: [...ctx.needAny],
    weakGaps: [...ctx.needDirect].filter(id => !ctx.needAny.has(id)),
    recency,
    recentClasses: classes,
  };
}

/** Index of the selected exercise whose removal costs the least coverage. */
function _findExpendable(selected, contract, needed) {
  const primaryCount = {};
  selected.forEach(ex => resolveMuscles(ex).primary.forEach(id => primaryCount[id] = (primaryCount[id] || 0) + 1));

  let bestIdx = -1, bestCost = Infinity;
  selected.forEach((ex, i) => {
    const sig = resolveMuscles(ex);
    if (sig.primary.includes(needed)) return;
    // Cost = number of required majors this exercise is the SOLE primary source of
    let cost = 0;
    sig.primary.forEach(id => {
      if (contract.requiredMajors.includes(id) && primaryCount[id] <= 1) cost += 10;
      else cost += 1;
    });
    if (cost < bestCost) { bestCost = cost; bestIdx = i; }
  });
  return bestIdx;
}

/**
 * Reorder so consecutive exercises don't share a prime mover or a prop.
 * Keeps class flow moving and stops prop traffic jams at stations.
 */
function sequenceForFlow(exercises) {
  if (exercises.length < 3) return exercises;
  const pool = [...exercises];
  const out  = [pool.shift()];

  while (pool.length) {
    const prev = out[out.length - 1];
    const prevSig = resolveMuscles(prev);
    let bestIdx = 0, bestScore = -Infinity;
    pool.forEach((ex, i) => {
      const sig = resolveMuscles(ex);
      let s = 0;
      const musclesClash = sig.primary.some(id => prevSig.primary.includes(id));
      if (musclesClash) s -= 50;
      if (sig.primary.some(id => prevSig.secondary.includes(id))) s -= 10;
      if (ex.prop === prev.prop) s -= 20;
      if (MUSCLE_GROUPS[sig.primary[0]]?.region !== MUSCLE_GROUPS[prevSig.primary[0]]?.region) s += 25;
      s += Math.random() * 6;
      if (s > bestScore) { bestScore = s; bestIdx = i; }
    });
    out.push(pool.splice(bestIdx, 1)[0]);
  }
  return out;
}

// ── COVERAGE REPORT ───────────────────────────────────────────
/**
 * Analyse a finished plan: which majors are covered (and by what),
 * which accessories got hit, what is missing.
 */
function analyzeCoverage(exercises, focusKey) {
  const contract = getFocusContract(focusKey);
  const byMuscle = {};
  Object.keys(MUSCLE_GROUPS).forEach(id => byMuscle[id] = { primary: [], secondary: [], tertiary: [], load: 0 });

  exercises.forEach(ex => {
    const sig = resolveMuscles(ex);
    sig.primary  .forEach(id => { byMuscle[id].primary.push(ex.name);   byMuscle[id].load += 1;   });
    sig.secondary.forEach(id => { byMuscle[id].secondary.push(ex.name); byMuscle[id].load += 0.5; });
    sig.tertiary .forEach(id => { byMuscle[id].tertiary.push(ex.name);  byMuscle[id].load += 0.2; });
  });

  const majors = contract.requiredMajors.map(id => ({
    id,
    ...MUSCLE_GROUPS[id],
    direct: byMuscle[id].primary.length,
    assist: byMuscle[id].secondary.length,
    load: Math.round(byMuscle[id].load * 10) / 10,
    covered: byMuscle[id].primary.length > 0 || byMuscle[id].secondary.length > 0,
    strong: byMuscle[id].primary.length > 0,
    exercises: [...byMuscle[id].primary, ...byMuscle[id].secondary],
  }));

  const minors = contract.minorPool
    .filter(id => MUSCLE_GROUPS[id])
    .map(id => ({
      id,
      ...MUSCLE_GROUPS[id],
      direct: byMuscle[id].primary.length,
      assist: byMuscle[id].secondary.length,
      load: Math.round(byMuscle[id].load * 10) / 10,
      covered: byMuscle[id].load > 0,
      exercises: [...byMuscle[id].primary, ...byMuscle[id].secondary],
    }));

  const gaps = majors.filter(m => !m.covered).map(m => m.id);
  const weakGaps = majors.filter(m => m.covered && !m.strong).map(m => m.id);
  const conditioning = exercises.some(ex => resolveMuscles(ex).conditioning);

  // ── Movement balance ──
  const bal   = getBalanceContract(focusKey);
  const tally = movementTally(exercises);
  const pairs = bal.pairs.map(([a, b]) => {
    const ca = tally.groups[a] || 0, cb = tally.groups[b] || 0;
    const total = ca + cb;
    // Balanced when neither side is more than ~2x the other (or both are zero).
    const ok = total === 0 || (Math.min(ca, cb) * 2 >= Math.max(ca, cb));
    return { a, b, countA: ca, countB: cb, ok,
             label: a === 'push' ? 'Push / Pull' : 'Knee / Hip' };
  });
  const balance = {
    pairs,
    unilateral: tally.unilateral,
    minUnilateral: bal.minUnilateral,
    unilateralOk: tally.unilateral >= bal.minUnilateral,
    patterns: tally.patterns,
    groups: tally.groups,
    ok: pairs.every(p => p.ok) && tally.unilateral >= bal.minUnilateral,
  };

  const directShare = majors.filter(m => m.strong).length / Math.max(1, majors.length);
  const assistShare = majors.filter(m => m.covered && !m.strong).length / Math.max(1, majors.length);
  const balanceBonus = balance.ok ? 1 : 0.85;

  return { majors, minors, gaps, weakGaps, byMuscle, conditioning, contract, balance,
           balanceScore: Math.round(100 * (directShare + assistShare * 0.5) * balanceBonus) };
}

// ── COVERAGE PANEL UI ─────────────────────────────────────────
function renderCoveragePanel() {
  const host = document.getElementById('muscle-coverage-panel');
  if (!host || !state.workout) return;

  const report = analyzeCoverage(state.workout.exercises, state.workout.muscle || state.muscle);
  const accessoryFocus = state.workout.accessoryFocus || [];
  const recentClasses  = state.workout.recentClasses || [];
  state.workout.coverage = report;

  const majorChips = report.majors.map(m => {
    const cls = m.strong ? 'cov-ok' : m.covered ? 'cov-assist' : 'cov-gap';
    const note = m.strong ? `${m.direct} direct` : m.covered ? 'assist only' : 'NOT HIT';
    return `<div class="cov-chip ${cls}" title="${escapeHtml(m.exercises.join(', ') || 'No exercise targets this group')}">
      <span class="cov-chip-icon">${m.icon}</span>
      <span class="cov-chip-label">${m.short}</span>
      <span class="cov-chip-note">${note}</span>
    </div>`;
  }).join('');

  const minorChips = report.minors.map(m => {
    const isFocus = accessoryFocus.includes(m.id);
    const cls = m.covered ? (isFocus ? 'cov-minor-focus' : 'cov-minor-ok') : 'cov-minor-off';
    return `<div class="cov-chip cov-chip-sm ${cls}" title="${escapeHtml(m.exercises.join(', ') || 'Not trained this class')}">
      ${isFocus ? '<span class="cov-star">★</span>' : ''}${m.icon} ${m.short}${m.covered ? '' : ' <span class="cov-chip-note">rest</span>'}
    </div>`;
  }).join('');

  const focusLine = accessoryFocus.length
    ? `<div class="cov-rotation">
         <span class="cov-rotation-label">★ This class's accessory rotation:</span>
         ${accessoryFocus.map(id => `<b>${muscleIcon(id)} ${muscleLabel(id)}</b>`).join(' · ')}
         <span class="cov-rotation-why">(freshest groups across your last ${recentClasses.length || 0} class${recentClasses.length === 1 ? '' : 'es'})</span>
       </div>` : '';

  const gapLine = report.gaps.length
    ? `<div class="cov-warn">⚠️ Not covered: <b>${report.gaps.map(id => muscleLabel(id)).join(', ')}</b> — add a prop or an exercise to close the gap.</div>`
    : report.weakGaps.length
    ? `<div class="cov-warn cov-warn-soft">ℹ️ Assist only: <b>${report.weakGaps.map(id => muscleLabel(id)).join(', ')}</b> — no exercise in your selected props makes this a prime mover.</div>`
    : `<div class="cov-good">✅ All ${report.majors.length} major groups for this focus get direct work${report.conditioning ? ' · conditioning element included' : ''}.</div>`;

  host.innerHTML = `
    <div class="cov-header">
      <span class="cov-title">🧬 Muscle Coverage</span>
      <span class="cov-score ${report.gaps.length ? 'cov-score-warn' : ''}">${report.balanceScore}% balanced</span>
      <button class="cov-rebalance-btn" onclick="rebalanceWorkout()" title="Re-pick exercises with the same settings">🔀 Rebalance</button>
    </div>
    ${gapLine}
    <div class="cov-section-label">Major groups</div>
    <div class="cov-chips">${majorChips}</div>
    <div class="cov-section-label">Accessory / minor groups</div>
    <div class="cov-chips">${minorChips}</div>
    ${focusLine}
    ${renderBalanceStrip(report.balance)}
    ${renderRecentStrip(recentClasses)}`;
}

/** Movement-pattern balance readout — the second coverage dimension. */
function renderBalanceStrip(balance) {
  if (!balance) return '';
  const pairRows = balance.pairs.map(p => {
    const total = Math.max(1, p.countA + p.countB);
    const pctA = Math.round(100 * p.countA / total);
    return `<div class="bal-row">
      <span class="bal-label">${p.label}</span>
      <span class="bal-bar" title="${p.countA} vs ${p.countB}">
        <span class="bal-bar-a" style="width:${pctA}%"></span>
        <span class="bal-bar-b" style="width:${100 - pctA}%"></span>
      </span>
      <span class="bal-count ${p.ok ? 'bal-ok' : 'bal-off'}">${p.countA} / ${p.countB}${p.ok ? '' : ' ⚠️'}</span>
    </div>`;
  }).join('');

  const topPatterns = Object.entries(balance.patterns || {})
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `<span class="bal-chip">${patternIcon(id)} ${patternLabel(id, true)}${n > 1 ? ' ×' + n : ''}</span>`)
    .join('');

  return `<div class="cov-balance">
    <div class="cov-section-label">Movement balance</div>
    ${pairRows}
    <div class="bal-row">
      <span class="bal-label">Single-side work</span>
      <span class="bal-uni ${balance.unilateralOk ? 'bal-ok' : 'bal-off'}">
        ${balance.unilateral} exercise${balance.unilateral === 1 ? '' : 's'}
        ${balance.unilateralOk ? '✓' : `— aim for ${balance.minUnilateral}+`}
      </span>
    </div>
    <div class="bal-chips">${topPatterns}</div>
  </div>`;
}

function renderRecentStrip(classes) {
  if (!classes || !classes.length) {
    return `<div class="cov-recent cov-recent-empty">No class history yet — accessory rotation starts after your first logged class.</div>`;
  }
  const rows = classes.slice(0, 4).map((c, i) => {
    const top = Object.entries(c.muscleLoad || {})
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([id]) => `${muscleIcon(id)} ${muscleLabel(id, true)}`).join(' · ');
    const label = i === 0 ? 'Last class' : `${i + 1} classes ago`;
    return `<div class="cov-recent-row"><span class="cov-recent-when">${label}</span><span class="cov-recent-muscles">${top || '—'}</span></div>`;
  }).join('');
  return `<div class="cov-recent"><div class="cov-section-label">Recently taught</div>${rows}</div>`;
}

/** Re-run selection with identical settings — new exercises, same guarantees. */
function rebalanceWorkout() {
  if (!state.workout) return;
  const keepStyle = state.workout.style;
  generateWorkout({ forceStyle: keepStyle, silent: true });
  showToast('🔀 Rebalanced — coverage kept, exercises refreshed');
}

// ══════════════════════════════════════════════════════════════
//  TRAINING LOAD — weekly volume & muscle distribution
//  Answers "am I hammering the same things week after week?"
//  across every class taught at the studio.
// ══════════════════════════════════════════════════════════════
const LOAD_WEEKS = 8;

/** Bucket taught classes into ISO-ish weeks, newest first. */
function buildWeeklyLoad(weeks = LOAD_WEEKS) {
  const classes = getTaughtClasses(200);
  const now = new Date();
  // Start of the current week (Monday).
  const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = (startOfWeek.getDay() + 6) % 7;
  startOfWeek.setDate(startOfWeek.getDate() - dow);
  const weekMs = 7 * 86400000;

  const buckets = [];
  for (let i = 0; i < weeks; i++) {
    const end   = startOfWeek.getTime() - (i - 1) * weekMs;
    const start = startOfWeek.getTime() - i * weekMs;
    buckets.push({ start, end, label: i === 0 ? 'This week' : i === 1 ? 'Last week' : i + ' weeks ago',
                   classes: [], minutes: 0, exercises: 0, load: {}, participants: 0 });
  }

  classes.forEach(c => {
    const ts = c.when || 0;
    const b = buckets.find(x => ts >= x.start && ts < x.end);
    if (!b) return;
    b.classes.push(c);
    b.minutes    += Number(c.duration) || 0;
    b.exercises  += Number(c.exercises) || (c.exerciseNames || []).length;
    b.participants += Number(c.participants) || 0;
    Object.entries(c.muscleLoad || {}).forEach(([id, v]) => b.load[id] = (b.load[id] || 0) + v);
  });

  return buckets;
}

/** Total muscle load across the window, flagged against a fair share. */
function loadDistribution(buckets) {
  const total = {};
  buckets.forEach(b => Object.entries(b.load).forEach(([id, v]) => total[id] = (total[id] || 0) + v));
  const sum = Object.values(total).reduce((a, b) => a + b, 0) || 1;
  const majors = Object.keys(MUSCLE_GROUPS).filter(id => MUSCLE_GROUPS[id].tier === 'major');
  const minors = Object.keys(MUSCLE_GROUPS).filter(id => MUSCLE_GROUPS[id].tier !== 'major');
  const fairMajor = 1 / Math.max(1, majors.length);

  const rank = id => ({
    id, ...MUSCLE_GROUPS[id],
    value: Math.round((total[id] || 0) * 10) / 10,
    share: (total[id] || 0) / sum,
  });
  return {
    total, sum,
    majors: majors.map(rank).sort((a, b) => b.value - a.value),
    minors: minors.map(rank).sort((a, b) => b.value - a.value),
    fairMajor,
  };
}

function renderTrainingLoad() {
  const host = document.getElementById('training-load');
  if (!host) return;

  const buckets = buildWeeklyLoad();
  const taught  = buckets.reduce((s, b) => s + b.classes.length, 0);

  if (!taught) {
    host.innerHTML = `<div class="empty-state">No classes logged yet.<br>
      Finish a class (or save a plan with a past date) and your weekly load will build here.</div>`;
    return;
  }

  const peak = Math.max(...buckets.map(b => b.minutes), 1);
  const bars = buckets.slice().reverse().map(b => {
    const h = Math.round(100 * b.minutes / peak);
    return `<div class="tl-bar-col" title="${b.classes.length} class${b.classes.length === 1 ? '' : 'es'} · ${b.minutes} min">
      <div class="tl-bar-track"><div class="tl-bar-fill${b.minutes ? '' : ' tl-bar-empty'}" style="height:${Math.max(h, b.minutes ? 5 : 2)}%"></div></div>
      <div class="tl-bar-val">${b.minutes || '—'}</div>
      <div class="tl-bar-label">${b.classes.length ? b.classes.length + 'c' : ''}</div>
    </div>`;
  }).join('');

  const dist = loadDistribution(buckets);
  const maxMajor = Math.max(...dist.majors.map(m => m.value), 1);

  const majorRows = dist.majors.map(m => {
    const pct = Math.round(100 * m.value / maxMajor);
    // Flag anything getting less than half of an even split.
    const under = m.share < dist.fairMajor * 0.5;
    const over  = m.share > dist.fairMajor * 1.75;
    return `<div class="tl-row">
      <span class="tl-row-label">${m.icon} ${m.short}</span>
      <span class="tl-row-bar"><span class="tl-row-fill ${under ? 'tl-under' : over ? 'tl-over' : ''}" style="width:${pct}%"></span></span>
      <span class="tl-row-val">${m.value}</span>
      ${under ? '<span class="tl-flag tl-flag-under">under-trained</span>' : over ? '<span class="tl-flag tl-flag-over">heavy</span>' : ''}
    </div>`;
  }).join('');

  const minorTop = dist.minors.filter(m => m.value > 0);
  const minorCold = dist.minors.filter(m => m.value === 0);
  const minorChips = minorTop.map(m =>
    `<span class="bal-chip">${m.icon} ${m.short} ${m.value}</span>`).join('');
  const coldChips = minorCold.map(m =>
    `<span class="bal-chip tl-cold">${m.icon} ${m.short}</span>`).join('');

  const thisWeek = buckets[0], lastWeek = buckets[1] || { minutes: 0, classes: [] };
  const delta = thisWeek.minutes - lastWeek.minutes;
  const deltaTxt = lastWeek.minutes
    ? `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)} min vs last week`
    : 'first week of data';
  const avgClass = taught ? Math.round(buckets.reduce((s, b) => s + b.minutes, 0) / taught) : 0;
  const avgSize  = taught ? Math.round(buckets.reduce((s, b) => s + b.participants, 0) / taught) : 0;

  host.innerHTML = `
    <div class="tl-summary">
      <div class="tl-stat"><span class="tl-stat-val">${taught}</span><span class="tl-stat-label">classes / ${LOAD_WEEKS} wks</span></div>
      <div class="tl-stat"><span class="tl-stat-val">${thisWeek.minutes}</span><span class="tl-stat-label">min this week</span></div>
      <div class="tl-stat"><span class="tl-stat-val">${avgClass}</span><span class="tl-stat-label">avg class (min)</span></div>
      <div class="tl-stat"><span class="tl-stat-val">${avgSize || '—'}</span><span class="tl-stat-label">avg class size</span></div>
    </div>
    <div class="tl-delta">${deltaTxt}</div>

    <div class="cov-section-label">Weekly volume (minutes taught)</div>
    <div class="tl-bars">${bars}</div>

    <div class="cov-section-label">Major group distribution — last ${LOAD_WEEKS} weeks</div>
    <div class="tl-rows">${majorRows}</div>

    <div class="cov-section-label">Accessory groups</div>
    <div class="bal-chips">${minorChips || '<span class="roster-empty">None logged yet.</span>'}</div>
    ${coldChips ? `<div class="tl-cold-note">Untouched for ${LOAD_WEEKS} weeks — good candidates for your next class:</div><div class="bal-chips">${coldChips}</div>` : ''}
  `;
}

if (typeof window !== 'undefined') {
  window.selectExercisesWithCoverage = selectExercisesWithCoverage;
  window.analyzeCoverage = analyzeCoverage;
  window.getTaughtClasses = getTaughtClasses;
  window.renderTrainingLoad = renderTrainingLoad;
  window.buildWeeklyLoad = buildWeeklyLoad;
}
