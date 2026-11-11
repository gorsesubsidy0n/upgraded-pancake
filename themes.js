/* Inspire Habits — optional fun class themes.
 * Themes only change how exercise names are DISPLAYED. The real name
 * (ex.name) stays the identity key for cues, swaps, history and phones. */
'use strict';

const IH_FUN_THEME_GROUPS = [
  { id: 'holiday', label: '🎊 Holidays' },
  { id: 'event', label: '🎉 Events & celebrations' },
  { id: 'health', label: '💪 Fitness & health challenges' },
];

/* renames: [pattern, replacement] — pattern is matched as a whole word
 * (case-insensitive); "$&" in the replacement is the matched word. The first
 * matching rule wins. Names with no match get the emoji (or prefix). */
const IH_FUN_THEMES = [
  // ── Holidays ─────────────────────────────────────────────
  { id: 'new-year', label: 'New Year', emoji: '🎆', category: 'holiday', months: [12, 1],
    tagline: 'New year, new reps!',
    renames: [['Jumping Jacks?', 'Fireworks Jack'], ['Burpee', 'Countdown Burpee'], ['Squat', 'Resolution Squat'],
      ['Lunge', 'Fresh-Start Lunge'], ['Plank', 'Midnight Plank'], ['Jump', 'Confetti Jump']] },
  { id: 'lunar-new-year', label: 'Lunar New Year', emoji: '🧧', category: 'holiday', months: [1, 2],
    tagline: 'Fierce as a dragon, quick as a tiger.',
    renames: [['Squat', 'Dragon Squat'], ['Lunge', 'Tiger Lunge'], ['Plank', 'Lantern Plank'],
      ['Twist', 'Ribbon Twist'], ['Burpee', 'Firecracker Burpee'], ['Jump', 'Firecracker Jump']] },
  { id: 'valentines', label: "Valentine's Day", emoji: '💘', category: 'holiday', months: [2],
    tagline: 'Show your heart some love.',
    renames: [['Squat', 'Sweetheart Squat'], ['Lunge', 'Love Lunge'], ['Push[- ]?Up', 'Cupid $&'],
      ['Plank', 'Heartbeat Plank'], ['Burpee', 'Heartbreaker Burpee'], ['Bridge', 'Love Bridge'], ['Curl', 'Bouquet Curl']] },
  { id: 'st-patricks', label: "St. Patrick's Day", emoji: '☘️', category: 'holiday', months: [3],
    tagline: 'Feeling lucky? Earn it.',
    renames: [['Mountain Climbers?', 'Clover Climber'], ['Squat', 'Leprechaun Squat'], ['Lunge', 'Lucky Lunge'],
      ['Burpee', 'Pot-of-Gold Burpee'], ['Skaters?', 'Rainbow Skater'], ['Jump', 'Shamrock Jump']] },
  { id: 'spring', label: 'Easter & spring', emoji: '🐣', category: 'holiday', months: [3, 4],
    tagline: 'Spring into it!',
    renames: [['Jump', 'Bunny Hop'], ['Squat', 'Egg-Hunt Squat'], ['Lunge', 'Bunny Lunge'],
      ['Plank', 'Spring Plank'], ['Frog', 'Garden Frog'], ['Burpee', 'Blossom Burpee']] },
  { id: 'cinco-de-mayo', label: 'Cinco de Mayo', emoji: '🪅', category: 'holiday', months: [5],
    tagline: 'Fiesta-level effort!',
    renames: [['Squat', 'Fiesta Squat'], ['Jump', 'Piñata Jump'], ['Twist', 'Salsa Twist'],
      ['Lunge', 'Mariachi Lunge'], ['Burpee', 'Piñata Burpee'], ['Plank', 'Sombrero Plank']] },
  { id: 'july-4th', label: 'Fourth of July', emoji: '🎇', category: 'holiday', months: [7],
    tagline: 'Light it up!',
    renames: [['Jumping Jacks?', 'Star-Spangled Jack'], ['Burpee', 'Firecracker Burpee'], ['Squat', 'Liberty Squat'],
      ['Plank', 'Freedom Plank'], ['Lunge', 'Patriot Lunge'], ['Jump', 'Rocket Jump']] },
  { id: 'halloween', label: 'Halloween', emoji: '🎃', category: 'holiday', months: [10],
    tagline: 'Spooky strong.',
    renames: [['Jumping Jacks?', 'Skeleton Jack'], ['Mountain Climbers?', 'Haunted Hill Climber'], ['Squat', 'Pumpkin Squat'],
      ['Burpee', 'Monster Mash Burpee'], ['Lunge', 'Zombie Lunge'], ['Plank', 'Coffin Plank'], ['Crawl', 'Spider Crawl'],
      ['Bridge', 'Graveyard Bridge'], ['Twist', "Witch's Twist"], ['Deadlift', 'Grave Digger Deadlift'], ['RDL', 'Grave Digger RDL']] },
  { id: 'diwali', label: 'Diwali', emoji: '🪔', category: 'holiday', months: [10, 11],
    tagline: 'Let your light shine.',
    renames: [['Squat', 'Diya Squat'], ['Jump', 'Sparkler Jump'], ['Twist', 'Rangoli Twist'],
      ['Plank', 'Lantern Plank'], ['Burpee', 'Firework Burpee']] },
  { id: 'thanksgiving', label: 'Thanksgiving', emoji: '🦃', category: 'holiday', months: [11],
    tagline: 'Earn that pie.',
    renames: [['Mountain Climbers?', 'Turkey Trot Climber'], ['Squat', 'Turkey Squat'], ['Lunge', 'Leftover Lunge'],
      ['Burpee', 'Gobble Burpee'], ['Twist', 'Pie Crust Twist'], ['Crunch', 'Cranberry Crunch'], ['Plank', 'Gravy Boat Plank']] },
  { id: 'hanukkah', label: 'Hanukkah', emoji: '🕎', category: 'holiday', months: [11, 12],
    tagline: 'Eight nights of strength.',
    renames: [['Twist', 'Dreidel Twist'], ['Jump', 'Latke Jump'], ['Squat', 'Menorah Squat'],
      ['Plank', 'Candle Plank'], ['Burpee', 'Miracle Burpee']] },
  { id: 'holiday-season', label: 'Holiday season', emoji: '🎄', category: 'holiday', months: [12],
    tagline: 'Jingle all the way.',
    renames: [['Jumping Jacks?', 'Jingle Jack'], ['Bear Crawl', 'Chimney Crawl'], ['Squat', 'Snowball Squat'],
      ['Burpee', 'Reindeer Burpee'], ['Lunge', 'Elf Lunge'], ['Plank', 'Candy Cane Plank'], ['Skaters?', 'Ice Skater'],
      ['Twist', 'Gift Wrap Twist'], ['Jump', 'Sleigh Jump']] },

  // ── Events & celebrations ────────────────────────────────
  { id: 'birthday', label: 'Birthday bash', emoji: '🎂', category: 'event', months: [],
    tagline: 'Party reps for the birthday crew!',
    renames: [['Jumping Jacks?', 'Balloon Jack'], ['Squat', 'Cake Squat'], ['Burpee', 'Birthday Burpee'],
      ['Plank', 'Candle Plank'], ['Twist', 'Party Popper Twist'], ['Jump', 'Party Jump']] },
  { id: 'studio-anniversary', label: 'Studio anniversary', emoji: '🥂', category: 'event', months: [],
    tagline: 'Celebrating another year together.',
    renames: [['Squat', 'Celebration Squat'], ['Burpee', 'Cheers Burpee'], ['Lunge', 'Milestone Lunge'],
      ['Plank', 'Toast Plank'], ['Jump', 'Confetti Jump']] },
  { id: 'big-game', label: 'Big game day', emoji: '🏈', category: 'event', months: [1, 2, 9],
    tagline: 'Game on!',
    renames: [['High Knees', 'Tire Drill High Knees'], ['Bear Crawl', 'Blitz Crawl'], ['Squat', 'Lineman Squat'],
      ['Burpee', 'Touchdown Burpee'], ['Lunge', 'Field Goal Lunge'], ['Plank', 'Huddle Plank'], ['Skaters?', 'Sideline Skater']] },
  { id: 'hoops', label: 'Hoops madness', emoji: '🏀', category: 'event', months: [3, 4],
    tagline: 'Nothing but net.',
    renames: [['Squat', 'Rebound Squat'], ['Jump', 'Slam Dunk Jump'], ['Skaters?', 'Fast Break Skater'],
      ['Lunge', 'Layup Lunge'], ['Burpee', 'Buzzer-Beater Burpee'], ['Press', 'Free Throw Press']] },
  { id: 'summer-games', label: 'Summer games', emoji: '🏅', category: 'event', months: [7, 8],
    tagline: 'Go for gold!',
    renames: [['Squat', 'Podium Squat'], ['Lunge', 'Relay Lunge'], ['Burpee', 'Gold Medal Burpee'],
      ['Skaters?', 'Speed Skater'], ['Plank', 'Balance Beam Plank'], ['Press', 'Champion Press'], ['Jump', 'Long Jump']] },
  { id: 'summer-kickoff', label: 'Summer kickoff', emoji: '☀️', category: 'event', months: [5, 6],
    tagline: 'Hello, sunshine!',
    renames: [['Squat', 'Sandcastle Squat'], ['Plank', 'Surfboard Plank'], ['Lunge', 'Boardwalk Lunge'],
      ['Skaters?', 'Wave Skater'], ['Twist', 'Wave Twist'], ['Burpee', 'Beach Burpee'], ['Jump', 'Beach Ball Jump']] },
  { id: 'back-to-school', label: 'Back to school', emoji: '🎒', category: 'event', months: [8, 9],
    tagline: 'Class is in session.',
    renames: [['Squat', 'Homework Squat'], ['Lunge', 'Hallway Lunge'], ['Burpee', 'Pop Quiz Burpee'],
      ['Plank', 'Desk Plank'], ['Press', 'Honor Roll Press'], ['Jump', 'Recess Jump']] },
  { id: 'pride', label: 'Pride', emoji: '🌈', category: 'event', months: [6],
    tagline: 'Strong, proud, together.',
    renames: [['Jumping Jacks?', 'Rainbow Jack'], ['Squat', 'Rainbow Squat'], ['Lunge', 'Parade Lunge'],
      ['Plank', 'Ally Plank'], ['Burpee', 'Proud Burpee'], ['Skaters?', 'Rainbow Skater'], ['Jump', 'Pride Jump']] },
  { id: 'earth-day', label: 'Earth Day', emoji: '🌍', category: 'event', months: [4],
    tagline: 'Strong body, healthy planet.',
    renames: [['Mountain Climbers?', 'Summit Climber'], ['Squat', 'Tree Planter Squat'], ['Lunge', 'Trail Lunge'],
      ['Plank', 'Log Plank'], ['Twist', 'Windmill Twist'], ['Jump', 'Recycle Jump']] },

  // ── Fitness & health challenges ─────────────────────────
  { id: 'squatober', label: 'Squatober', emoji: '🦵', category: 'health', months: [10],
    tagline: 'A month of squats!', challenge: 'Squatober challenge: 10 bodyweight squats in every rest break.',
    renames: [['Squat', 'Squatober Squat']] },
  { id: 'plankuary', label: 'Plank-uary', emoji: '🧱', category: 'health', months: [1],
    tagline: 'Start the year solid.', challenge: 'Plank-uary finisher: hold a plank for 60 seconds — add 5 seconds each week.',
    renames: [['Plank', 'Plank-uary Plank']] },
  { id: 'heart-month', label: 'Heart health month', emoji: '❤️', category: 'health', months: [2],
    tagline: 'Every beat counts.', challenge: 'Check your pulse after the first and last block.',
    renames: [['High Knees', 'Heart-Pump High Knees'], ['Jumping Jacks?', 'Cardio Jack'], ['Burpee', 'Heart-Rate Burpee'],
      ['Squat', 'Strong Heart Squat']] },
  { id: 'step-it-up', label: 'Step it up', emoji: '👟', category: 'health', months: [4],
    tagline: 'Every step adds up.', challenge: 'Take a 10-minute walk after class to bank extra steps.',
    renames: [['High Knees', 'Step Count High Knees'], ['March', 'Step Count March'], ['Step', 'Power Step'],
      ['Lunge', 'Stride Lunge'], ['Skaters?', 'Stride Skater']] },
  { id: 'mental-health', label: 'Mental health month', emoji: '🧠', category: 'health', months: [5],
    tagline: 'Strong mind, strong body.', challenge: 'End with 2 minutes of box breathing: in 4, hold 4, out 4, hold 4.',
    renames: [['Stretch', 'Unwind Stretch'], ['Plank', 'Calm Plank'], ['Bridge', 'Breathe Bridge'],
      ['Squat', 'Steady Squat'], ['Lunge', 'Grounded Lunge']] },
  { id: 'hydration', label: 'Hydration challenge', emoji: '💧', category: 'health', months: [6, 7, 8],
    tagline: 'Sip, sweat, repeat.', challenge: 'Water break between every block — goal: 8 cups today.',
    renames: [['Squat', 'Splash Squat'], ['Plank', 'Ripple Plank'], ['Burpee', 'Tidal Wave Burpee'],
      ['Lunge', 'River Lunge'], ['Jump', 'Waterfall Jump']] },
  { id: 'lungust', label: 'Lunge-ust', emoji: '🚶', category: 'health', months: [8],
    tagline: 'Lunge your way through August.', challenge: 'Lunge-ust finisher: 20 walking lunge steps at the end of class.',
    renames: [['Lunge', 'Lunge-ust Lunge']] },
  { id: 'pink-october', label: 'Pink October', emoji: '🎗️', category: 'health', months: [10],
    tagline: 'Strength in solidarity.', challenge: 'Wear pink and dedicate your last round to someone you love.',
    renames: [['Push[- ]?Up', 'Pink Power $&'], ['Squat', 'Pink Power Squat'], ['Lunge', 'Hope Lunge'],
      ['Plank', 'Strength Plank'], ['Press', 'Pink Ribbon Press']] },
  { id: 'movember', label: 'Movember', emoji: '🥸', category: 'health', months: [11],
    tagline: "Moves for men's health.", challenge: "Talk to someone about men's health this month.",
    prefix: 'Mo', renames: [] },
  { id: 'burpee-cember', label: 'Burpee-cember', emoji: '🔥', category: 'health', months: [12],
    tagline: 'Finish the year fired up.', challenge: 'Burpee-cember: 1 burpee for every day of the month so far.',
    renames: [['Burpee', 'Burpee-cember Burpee']] },
];

const IH_FUN_THEME_BY_ID = Object.create(null);
IH_FUN_THEMES.forEach(t => {
  IH_FUN_THEME_BY_ID[t.id] = t;
  t._rules = (t.renames || []).map(([pat, rep]) => [new RegExp('\\b(?:' + pat + ')\\b', 'i'), rep]);
});

function ihFunThemeById(id) {
  return (id && IH_FUN_THEME_BY_ID[id]) || null;
}

function ihFunThemeId() {
  if (typeof state === 'undefined' || !state) return '';
  if (state.workout && typeof state.workout.funTheme === 'string') return state.workout.funTheme;
  return state.funTheme || '';
}

function ihFunTheme() {
  return ihFunThemeById(ihFunThemeId());
}

function ihFunNameFor(name, theme) {
  const real = String(name == null ? '' : name);
  if (!theme || !real) return real;
  for (const [re, rep] of theme._rules) {
    if (re.test(real)) return real.replace(re, rep);
  }
  return (theme.prefix || theme.emoji) + ' ' + real;
}

function ihFunName(name) {
  return ihFunNameFor(name, ihFunTheme());
}

function ihFunEsc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* Themed name plus the real name in small print, so nobody is confused. */
function ihFunNameHtml(name) {
  const real = String(name == null ? '' : name);
  const fun = ihFunName(real);
  if (fun === real) return ihFunEsc(real);
  return ihFunEsc(fun) + ' <span class="fun-real">(' + ihFunEsc(real) + ')</span>';
}

function ihSuggestedFunThemes(date) {
  const m = (date instanceof Date ? date : new Date()).getMonth() + 1;
  return IH_FUN_THEMES.filter(t => t.months.includes(m));
}

/* " · 🎃 Halloween" for history and saved-class rows, or ''. */
function ihFunThemeTag(id) {
  const t = ihFunThemeById(id);
  return t ? ' · ' + t.emoji + ' ' + t.label : '';
}

function ihFunThemeOptionsHtml(noneLabel) {
  let html = '<option value="">' + ihFunEsc(noneLabel || 'None') + '</option>';
  IH_FUN_THEME_GROUPS.forEach(g => {
    html += '<optgroup label="' + ihFunEsc(g.label) + '">';
    IH_FUN_THEMES.filter(t => t.category === g.id).forEach(t => {
      html += '<option value="' + t.id + '">' + t.emoji + ' ' + ihFunEsc(t.label) + '</option>';
    });
    html += '</optgroup>';
  });
  return html;
}

function ihSyncFunThemeUi() {
  if (typeof document === 'undefined') return;
  const id = ihFunThemeId();
  ['fun-theme-select', 'plan-theme-select'].forEach(sel => {
    const el = document.getElementById(sel);
    if (el && el.value !== id) el.value = id;
  });
  const t = ihFunThemeById(id);
  const hint = document.getElementById('fun-theme-hint');
  if (hint) {
    if (t) {
      hint.textContent = t.emoji + ' ' + t.tagline + (t.challenge ? ' ' + t.challenge : '');
    } else {
      const sug = ihSuggestedFunThemes();
      hint.textContent = sug.length
        ? 'Suggested this month: ' + sug.map(s => s.emoji + ' ' + s.label).join(', ')
        : 'Renames moves for fun — the real name still shows underneath.';
    }
  }
  const note = document.getElementById('plan-theme-note');
  if (note) {
    note.style.display = t ? '' : 'none';
    note.textContent = t ? t.emoji + ' ' + t.label + ' — ' + t.tagline + (t.challenge ? ' ' + t.challenge : '') : '';
  }
  const plan = document.getElementById('plan-theme-select');
  if (plan) plan.classList.toggle('is-on', !!t);
}

function ihSetFunTheme(id) {
  const t = ihFunThemeById(id);
  const clean = t ? t.id : '';
  if (typeof state === 'undefined' || !state) return;
  state.funTheme = clean;
  if (state.workout) {
    state.workout.funTheme = clean;
    if (typeof renderPlanEditor === 'function') renderPlanEditor();
  }
  ihSyncFunThemeUi();
  if (typeof showToast === 'function') {
    showToast(t ? t.emoji + ' ' + t.label + ' theme on — moves get fun names' : 'Fun theme off');
  }
}

function ihPopulateFunThemeSelects() {
  if (typeof document === 'undefined') return;
  ['fun-theme-select', 'plan-theme-select'].forEach(sel => {
    const el = document.getElementById(sel);
    if (el && !el.options.length) el.innerHTML = ihFunThemeOptionsHtml(sel === 'plan-theme-select' ? '🎉 No theme' : 'None');
  });
  ihSyncFunThemeUi();
}

if (typeof document !== 'undefined' && document.addEventListener) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ihPopulateFunThemeSelects);
  else ihPopulateFunThemeSelects();
}
