# Inspire Habits

A workout builder for mixed-ability group classes at a studio gym.
Everything runs in your browser. No accounts, no internet required, nothing
to install for the basic setup.

---

## Opening the app

There are three ways in. They behave differently — mostly on a Mac — so
here's the short version:

| How you open it | Saving classes | Athlete link | Best for |
|---|---|---|---|
| **Published web link** | ✅ works (see Safari note) | ✅ works | Everyday teaching |
| **Run the little server** | ✅ works | ✅ works | Studio wifi, no internet needed |
| **Double-click `index.html`** | ⚠️ **not on Safari** | ❌ no | A quick look, planning offline |

**If you're on a Mac and use the published link, read
"Back up to a file — and why you should" further down.** Safari deletes
stored data after seven days away, whichever way you open it.

### Option 1 — The published web link

If the app has been published (GitHub Pages or similar), just open the
address in a browser and bookmark it. Everything works, on the laptop and
on phones, with no setup and no terminal.

**On a Mac, install it:** open the link in Safari, then **Share → Add to
Dock**. It gets its own icon and window, and — the important part — apps
installed this way are exempt from Safari's seven-day data purge. On an
iPhone or iPad the same thing is **Share → Add to Home Screen**.

This is the recommended way to use the app.

### Option 2 — Just open it from the folder

Unzip the folder somewhere you can find it again, then
**double-click `index.html`.**

The app opens in your browser: building plans, editing them, going live with
the timer, the exercise library.

**On a Mac, do not use this option if you want to save classes.** Safari
refuses to store anything at all for a page opened straight from a folder,
so saved classes, history and your equipment list are thrown away the moment
you close the tab. The app will tell you so at the top of the Saved screen.
Chrome and Edge do allow it, which is why this only bites on Safari. Use
Option 1 or 3 instead.

The other thing that will not work is **the class link for athletes**, because
a file sitting on your laptop has no address a phone can reach. If you want
that, use Option 3 (and read the wifi section below).

### Option 3 — Run the little server

This is what you want if athletes will open a link on their phones to track
their own rounds and reps.

1. Make sure Node is installed. Open a terminal and type:

   ```
   node --version
   ```

   If you get a version number, you are set. If you get an error, install
   it from [nodejs.org](https://nodejs.org) — take the "LTS" download and
   click through the installer.

2. Open the app folder in File Explorer, hold **Shift**, right-click an
   empty spot, and choose **"Open in Terminal"** (or "Open PowerShell
   window here").

3. Run:

   ```
   node serve.js
   ```

Your browser opens automatically on `http://localhost:8080`. The terminal
also prints a **second address** for phones — something like
`http://192.168.1.243:8080`. Any phone on the studio wifi can reach that,
and the app's QR codes use it automatically.

**On the laptop itself, always use the `localhost` address.** The browser
keeps saved classes separately for every address *and* port. The wifi
address changes whenever the router feels like it, and a different port is
a different address too — open the app on either and it looks empty (your
classes are still there, on the old address). That is why the server no
longer moves to another port when 8080 is busy: it stops and tells you to
close the other copy instead. If you really need another port, pass
`--port` and expect an empty app there.

The server answers anyone on the same wifi (that is how phones reach it),
but only with the app's own files — never `serve.config.json`, the tests,
or anything outside the folder. Use `--host 127.0.0.1` to keep it to this
computer only.

**Leave the terminal window open while class is running.** Closing it
stops the server. Press `Ctrl+C` when you want to stop it deliberately.

It does not matter which terminal you use — PowerShell, Command Prompt,
Windows Terminal, and Git Bash all behave the same.

#### Server options

```
node serve.js 9000        use a different port
node serve.js --no-open   don't open a browser window
node serve.js --help      see everything
```

Settings can also be saved permanently in `serve.config.json` — edit it,
save, restart.

---

## Sharing a laptop

Every time the app opens it asks **"Who's teaching?"** and you tap your
name. Nothing loads until you do.

This matters because the studio laptop gets passed around. Each instructor
gets her own:

- saved classes
- roster / mixed-ability groups
- crash recovery if a class is interrupted

So Carson's list is never mixed into Kat's, and neither can overwrite the
other. Equipment and any custom exercises you add stay **shared** — those
describe the studio, not the person.

### Class history is shared on purpose

**Classes you actually teach are the one exception.** The moment a class goes
live it's written to a single studio log that all three of you see, tagged
with who ran it:

> 🌠 Kat · you  — Tabata · Full Body · 45 min

Your own classes carry a **· you** and sit in your accent colour, so your
work is still easy to pick out of the shared list.

This exists because the athletes are the same people whoever is on the floor.
If Kat hammers glutes on Monday, Carson needs to see that before she programs
Tuesday — otherwise the room gets the same accessory work twice and the
rotation the app is built around stops meaning anything.

It follows that **accessory rotation now varies against every class the room
did**, not just your own. Saved (unpublished) classes are *not* included —
only classes actually taught — so drafting a class never skews anyone's
programming.

The log holds the last 150 classes, shared three ways.

The answer is remembered for that sitting only. Refreshing mid-class won't
re-ask, but closing the browser will. That's deliberate: the next person to
open it is always asked, rather than quietly saving into your list.

To hand over without closing the browser, tap another name in the
**Instructor:** row on the front screen. It won't let you switch in the
middle of a live class — stop the class first.

> If you've been using the app already, your existing saved classes move
> across to whoever was last selected, and every class already in your
> history is folded into the shared log under the right name — nothing is
> lost and nothing is credited to the wrong person.

---

## Access codes

The app asks for a studio name and password before it shows anything. The
sign-in screen shows the Inspire Habits barbell-and-heart logo on a coral
background and says "Please enter your studio name and password."

- **Studio name** is **IFW**, filled in for you (case doesn't matter). To use
  a different name, change `IH_STUDIO_NAME` near the top of the sign-in code in
  `auth.js`.
- **Password** is one of two codes, both generated in **🔒 Access Codes**:

| Password | Gets you |
|---|---|
| **Instructor** | The whole builder — generate, edit, save, run class, equipment |
| **Athlete** | Their own tracking page for the class they were sent, nothing else |

The studio name is not a secret, only a prompt. The password is what keeps
people out.

**Both codes have been changed** from the ones this app shipped with, and
are now long random codes in the strongest (v3) format. Neither is written
down anywhere in these files — only a salted, stretched check value for
each lives in `auth.js`, and it can't be turned back into the code. If you
forget one, you don't recover it; you set a new one (below).

**How v3 codes work.** Each line looks like
`v3$100000$<salt>$<check>`. When someone signs in, the code they type is
stretched with PBKDF2 (100,000 rounds, a fresh random salt per code) into
a secret key, and only a fingerprint of that key (`<check>`) is published.
The saved sign-in on the device holds the key itself, so it can only be
created by someone who actually typed the right code: copying the line out
of `auth.js`, or building a sign-in from what's in the source, no longer
opens the builder. Codes **ignore capitals, spaces and dashes**, so
`ABCD EFGH` and `abcd-efgh` are the same code. Sign-in takes a moment
(a spinner shows while it checks) — that's the point.

Older `v2$…` and plain 64-character lines still work, but their saved
sign-ins can be faked by anyone who reads the source. The Access Codes
panel shows a reminder while any line is older than v3; **you can keep the
same code** — type it again in **Generate the line** and paste the new
`v3$…` line in. Sessions expire after 30 days unused for instructors and
90 for athletes (using the app keeps you signed in). After five wrong
guesses in a row the sign-in screen makes you wait, up to two minutes
between tries; the count starts again an hour later.

On a **shared or borrowed device**, tick *"Shared or borrowed device —
forget me when this window closes"* on the sign-in screen. The sign-in then
lasts only until the browser window closes. The **Who's teaching?** screen
also has a *Sign this laptop out* button.

> Never paste a real code into this README, a commit message, or an issue.
> This repository is public, and anything written here is published with the
> app. Only the `v3$…` check line belongs in the files. A good code is long
> and random — four groups of four letters and numbers is about 79 bits,
> far beyond guessing even with the source in hand.

The lock screen warns you whenever either code is still a shipped default,
and names which one. No warning means both have been changed.

An athlete who opens the bare site without a class link gets a
"nothing to track yet" screen rather than your builder. If they opened a
class link in the last 12 hours, that screen has a **Reopen last class**
button, so closing the tab mid-class costs one tap.

**Most athletes never type anything.** The class link carries an unlock
token, so opening it takes them straight to their tracking page. The
athlete code is only needed by someone typing the address in by hand.
Changing the athlete code invalidates the token in every link you've
already handed out, which is usually what you want.

### Changing a code

1. Open the app as an instructor and tap **🔒 Access Codes**
2. Choose which code, type the new one, tap **Generate the line**
3. Paste the line it gives you over the matching line in `auth.js`
4. Save and re-publish — commit and push, if you're on GitHub Pages
5. Wait for the **Update ready — Reload** bar and tap it (or hard-refresh:
   **Ctrl-Shift-R**, or **Cmd-Shift-R** on a Mac)

The panel won't accept the other role's current code (that would give every
athlete the builder) or a code this app shipped with.

The file stores a hash, never the code itself, so nobody can read your
code out of the source. Changing a code signs everyone out, including
you — write the new one down first.

**Replace the whole line, and only that line.** Don't find-and-replace
the old hash across the file: the same value appears further down in
`AUTH_SHIPPED`, which is the app's record of what it was published with.
Overwriting that makes the "still using the shipped codes" warning stick
on forever even though your change worked.

The Access Codes panel shows which codes are actually loaded right now,
each marked **changed** or **still the shipped one**. If you've edited
`auth.js` and it still says *shipped*, the browser is serving a cached
copy — hard-refresh, and on GitHub Pages give the deploy a minute.

### If a code stops working

The app is built to fail shut. If `auth.js` is damaged the app won't open
at all, rather than opening for everyone:

- **"Access codes are damaged"** — one of the two lines between the PASTE
  markers isn't a valid code line. Each must be a `v3$…` line (or an older
  `v2$…` line, or 64 characters of `0-9` and `a-f`), and the two must be
  different. Re-copy from the panel and paste over the whole line.
- **"Inspire Habits could not start"** — `auth.js` has a syntax error,
  usually a missing quote or comma from a paste. The browser console
  (**F12 → Console**) names the line.

### Forgot a code

Codes can't be recovered, only replaced — and you can do that without
signing in:

1. Open the app (the sign-in screen is fine) and press **F12 → Console**.
2. Type `ihMakeLine('your-new-code')` and press Enter. It prints a
   `v3$…` line for that code.
3. Paste it over the matching line in `auth.js` (keep the quotes and the
   comma), re-publish, and sign in with the new code.

Do it for the athlete code too if that one is lost; the two must differ.

### What this is and isn't

**It's a doorway, not a vault.**

The app is a folder of files with no server behind it, so the code check
has to run inside the visitor's own browser. v3 closes the easy shortcuts
(pasting the line, or forging a saved sign-in from the source), but someone
who edits the running JavaScript in their own browser can still get past
it.

It will keep out the public, the curious, and search engines. It will not
stop someone who is genuinely trying. Don't put anything in this app
you'd be upset to have read.

If you ever need the real thing, it has to come from the host rather than
the page — Netlify and Cloudflare Access both do proper password
protection on static sites.

---

## Sharing when phones aren't on studio wifi

Guests without the wifi password, or a studio with no guest network, can
still join — but this needs a one-time setup.

1. Upload this folder to any free static host. Good options:
   - **Netlify Drop** (`app.netlify.com/drop`) — drag the folder onto the
     page, done in about 30 seconds, no account needed to start
   - **GitHub Pages**
   - **Cloudflare Pages**

2. Copy the address it gives you.

3. In the app, generate a plan, tap **🔗 Share Link**, then tap
   **Set up** and paste the address.

From then on every class link points there, and phones open the class on
their own mobile data. The banner in the share panel turns green and reads
"Works anywhere".

**Is this private?** Yes. The class details travel in the part of the link
after the `#`, which browsers never send to a server. The host only ever
hands out the app's files — it never sees a class, a name, or a rep count.
Nothing is stored anywhere but on the phone that scanned.

**One thing to remember:** the uploaded copy is a snapshot. If you update
the app later, re-upload the folder, or old codes will keep opening the
old version.

### Getting the link to people

The share panel shows a **scan code** (QR) and the class link with a
**📋 Copy link** button. Everyone who opens either one lands on their own
tracking page.

- **Scan code** — the whole class travels inside the link, so the code is
  dense. **Tap it** to show it full screen on the laptop or TV, and athletes
  point their phone camera at it. Tap again (or press Esc) to close. The code
  is drawn by the app itself (`qr.js`), so it works offline and nothing is
  sent anywhere to make it.
- **Why the code can differ from the link** — on timed classes most of the
  link is coaching notes (cue, easier / harder). To keep the code readable,
  the scan code leaves those out and each phone fills them back in from its
  own exercise library. Custom moves and edited cues show without notes on a
  scanned phone; the copied link always carries everything.
- **Copy link** — paste it into your group chat, a text, or whatever the
  class already uses.

No code is shown while the app is on `localhost` or opened from a file,
because no phone could open that address.

If the copy button can't reach the clipboard — some browsers only allow it
on https addresses — the link is selected for you and you can press
Ctrl-C (Cmd-C on a Mac) instead.

---

## What athletes do

Nothing to install, nothing to open.

1. You generate a plan and tap **🔗 Share Link**
2. You copy the link and send it to the class
3. They open it and type their name (or tap "Skip — just use this phone")

They are not asked for an access code — the class link lets them straight in.

They get their own page for that class. Rounds, reps, and completed
exercises are theirs alone — one person tapping does not affect anyone
else. If their phone goes dark or they close the tab, reopening the link
brings back exactly where they were.

Two people sharing a tablet can hand off with the **⇄** button next to the
name, without losing the first person's progress.

Scan-to-track now works for **every class style**, not just the self-paced
ones. What the phone shows depends on how the class is run:

- **Self-paced styles** (AMRAP, 100 Reps, Pyramid, Ladder, Custom) — the
  phone is a tally. Athletes tap to count their own rounds and reps.
- **Clock-driven styles** (Tabata, Circuit, EMOM, Superset, You-Go-I-Go) —
  the phone becomes a repeater for the room clock.

### The class clock on their phone

For clock-driven styles the phone shows the same countdown as the screen at
the front: the current interval, whether it's work or rest, the move they're
on, what's coming next, and how much of the class is left. During a rest it
shows the move they're about to start, so nobody is caught out.

There is no server involved. The class link carries the whole class schedule
plus the moment the class started, and each phone works out its own position
from that. Phones stay in step because they're all reading the same plan.

One consequence: **if you pause the room clock, phones keep running.** That's
what the **⇄ Re-sync to the room** button is for. An athlete taps it, picks
the move the room is actually on, and their phone snaps to it. It works both
directions — after a pause or after you skip ahead — and it picks the right
round when a move repeats.

If you show the code *before* tapping Go Live, athletes get a **▶ Start with
the class** button instead. They tap it when you start.

### Sound

The **🔊 / 🔇** button sits in the top-right of three places: your **timer
screen**, your **class view** (the one you cast to the TV), and each
athlete's **phone**. It turns on a short tone at the start of every work and
rest interval, three beeps counting into a change, and a chord at the end.

The two sides are deliberately set up differently:

| | Default | Why |
|---|---|---|
| Your laptop | **On** | It's the room's cue — everyone hears one clock. |
| Athlete phones | **Off** | A dozen handsets a half-second apart is noise, not a cue. |

They're stored separately, so muting your laptop never mutes the room's
phones and an athlete turning hers on doesn't touch yours. Each choice sticks
on that device until it's changed.

Athletes who'd rather feel it than hear it can leave sound off — phones
already buzz at the start of each work interval regardless.

> Phones only make sound after the athlete taps the button themselves.
> Browsers refuse to play audio until someone on that device asks for it, so
> there is no way to switch the room's phones on from your laptop.

---

## Pyramid and Ladder — choosing the climb

Pick **Pyramid** or **Ladder** and the plan card shows a rep-climb editor.

Four presets each are one tap away, or type your own in the box — for
example `4-8-12-16-12-8-4` or `10-20-30-40`. Spaces or dashes both work.

Whatever you set flows everywhere: the rep label on each exercise, the
climb shown on the class timer, the projected plan, and the rungs on every
athlete's phone. Pyramids mirror back down automatically if you type one
that way; the app doesn't force symmetry.

Changing style resets the climb to that style's default.

---

## Saving a class and teaching it again

Built something that worked? Keep it.

On the plan screen tap **💾 Save Class**, give it a name you'll recognise
later — "Tuesday 6am Full Body", "the one everyone hated" — and save. The
name is suggested for you from the day and style, so you can just hit save.

To bring it back, tap **📋 History** on the front screen. Saved classes are
on the first tab, each showing its style, focus, length, and how many
people it was built for. Each one gives you:

| Button | What it does |
|---|---|
| **📺 Go Live** | Straight into the running class, timer started |
| **✏️ Open** | Opens it on the plan screen so you can tweak it first |
| **✕** | Deletes it (it asks first) |

Loading a class restores the whole setup — style, length, class size,
difficulty, equipment, warm-up and cool-down — not just the exercise list.
So if you hit **🔄 Regenerate** afterwards you get a fresh class built to
the same brief, rather than something shaped by whatever was on screen
before.

The last **20** classes are kept, newest first. They live in this browser
on this laptop, so they won't follow you to another machine, and clearing
your browsing data clears them.

Saved classes are **private to you** — they're filed under whoever tapped
their name when the app opened. Build at home, teach from the studio
laptop, and nobody else's list gets in the way.

### Back up to a file — and why you should

At the top of the Saved screen there are two buttons:

| Button | What it does |
|---|---|
| **⬇︎ Back up to file** | Saves all your classes into one `.json` file in Downloads |
| **📥 Restore from file** | Reads that file back in |

Restoring **merges** — it never wipes what's already on the laptop. Classes
already there are left alone, and restoring the same file twice doesn't
create duplicates. So the backup file is also how you move a class from your
own laptop to the studio one: back up at home, AirDrop or email the file,
restore at the studio.

**On a Mac this is not optional.** Safari deletes everything a website has
stored after **seven days** without you opening that site. Not just cookies
— saved classes, history, your equipment list. It happens silently, there is
no warning, and it cannot be undone or turned off from inside the app. Two
weeks off over Christmas is enough to lose the lot.

Three ways to stay safe, best first:

1. **Install the app.** In Safari on a Mac, open it and choose **Share →
   Add to Dock**; on an iPhone or iPad, **Share → Add to Home Screen**.
   Apps installed this way are exempt from the seven-day rule and keep
   their data indefinitely. This is the real fix, and it takes ten seconds.
   Once you've done it the app stops warning you about this.
2. **Back up to a file** after any session where you built something worth
   keeping, and keep the file somewhere that isn't the browser.
3. **Open the app at least once a week**, which resets Safari's clock.

Chrome, Edge and Firefox don't do this, so on a PC it's far less pressing —
but a backup file is still the only thing that survives a dead laptop.

### If the app says it isn't keeping your classes

A red panel at the top of the Saved screen means the browser is refusing to
store anything. Usually one of:

- the app was opened by double-clicking `index.html` on a Mac (see
  **Opening the app** — use the server instead)
- Private Browsing
- Safari → Settings → Privacy → **Block all cookies**
- storage is genuinely full

The app keeps working normally for the rest of the session — nothing is lost
while the tab is open, and you can still teach the class. But close the tab
and it's gone, so use **⬇︎ Back up to file** before you do.

---

## Setting up your equipment

Tap **⚙️ Equipment** on the Props card.

Set how many of each item the studio owns, and whether it is one-per-person
or a shared station. Those numbers drive which exercises the app is willing
to program — a prop there aren't enough of gets skipped or turned into a
rotating station automatically, based on your class size.

Set a quantity to **0** to retire something. It disappears from class setup
but stays in this list marked "Not owned", so its exercises come straight
back if you put a number in later.

**💾 Save as Default** remembers it for every future class.

### Limiting how many people can be on a prop at once

Some gear can't serve the whole room even if you own plenty of it: cable
bands hang off a door anchor and sliders need floor space. Each row has a
**Max at once** box for this. **Cable Bands and Sliders default to 3** — at
most 3 people in the whole class are ever on them at the same time.

For a class bigger than that cap the app:

- keeps the move, but treats it as a rotating station instead of dropping it
  (so sliders no longer vanish from a class of 12),
- uses it in at most 2 slots of the plan,
- keeps it out of all-at-once formats (You-Go-I-Go and Core Burner),
- labels it "max 3 at once" on the setup screen, in the equipment list and on
  the exercise card.

Clear the box to remove the cap. A cap never creates more gear: if you own
2 cable bands and the cap is 3, the limit is still 2.

---

## Choosing the muscle focus

Muscle Focus is a two-step pick:

1. **Region** — Full Body, Upper, Lower, Core, Cardio or Custom.
2. **Emphasis** (optional) — appears under Upper and Lower:
   - Upper → Push, Pull, Chest + Back, Shoulders + Arms
   - Lower → Quads + Calves, Glutes + Hamstrings, Glutes + Hips
     (abductors and adductors)

"All upper" / "All lower" keeps the broad version.

### Custom

Pick **Custom** and tick any muscles you like. **Main muscles** (chest, back,
shoulders, quads, hamstrings, glutes, core) are guaranteed to get direct work
in the plan. **Smaller muscles** (biceps, triceps, rear delts, grip, calves,
adductors, abductors, hip flexors, obliques, lower back) are worked in as
accessories. You must pick at least one. The choice is saved with the class,
history and scheduled plans, and shows in the coverage panel.

Classes saved before this change still load — the older Push, Pull and
Glutes themes are kept (Glutes is now labelled "Glutes + Hamstrings").

---

## Running a live class

- **Voice cues** — 🔊 button (instructor and athlete screens). Speaks the
  next exercise and the countdown. Off by default; each device remembers its
  own setting.
- **Haptics** — phones buzz with different patterns for work, rest and
  switch. Needs a browser that supports vibration (Android Chrome; iOS
  doesn't).
- **TV mode** — shows only the clock and current exercise, huge. Exit with
  the button in the corner or **Esc**.
- **Swap live** — the ⇄ button beside any upcoming step replaces the
  exercise without touching the clock or the length of the class.
- **Injury and regression flags** — in the roster, tap a person's flag
  button (knee, shoulder, back, wrist, high-impact, pregnancy). When a
  flagged exercise comes up the instructor sees who it affects. High-impact
  uses each exercise's impact tag; the other flags are matched by keywords in
  the exercise name, so treat them as a prompt, not a guarantee. Flags are
  never shown on the athlete or public screens.
- **Class summary** — finishing a class opens a summary with a notes box;
  notes are saved with the class history. You can copy the summary.
- **Trends** — History → Trends shows classes per week, average
  attendance per week and muscle focus over the last 30 days.
- **Class card** — prints a one-page card of the class.
- **Personal bests** — athletes see their best for the class they're on and
  a note when they beat their previous one.
- **Phones follow the room clock** — if the instructor pauses, phones pause
  too; if a phone was asleep it catches up and offers a one-tap resync link.
- **Run it from your phone** — see the next section.
- **Backup safety net** — the app keeps a second copy of your data in
  IndexedDB. If the browser clears localStorage, you're offered a one-tap
  restore. It also nudges you to export a backup file (after 14 days with
  none, then every 30).

### Timer controls and class length

- Generated classes land within about a minute of the length you pick, for
  every style. The plan header shows **planned vs target** time (e.g.
  "19 min 48s of 20 min"); **Fit to time** trims or tops up a plan you've
  edited. Tabata may end on a shorter finisher block, and You-Go-I-Go on a
  partial last round, so the class finishes on time.
- **⏭ Skip exercise** jumps past every interval of the current move.
  **End class and log** finishes early, logs the class once and clears the
  "resume class?" prompt.
- Pausing keeps the exact time left; the live class is saved every few
  seconds, so a reload or a locked screen resumes where you were.
- A 3-2-1 beep before each work interval (and a spoken "3, 2, 1" and
  "Halfway" with voice on). During rest the timer shows the next move and its
  equipment; during work it shows easier/harder options. The header shows
  time left in class.
- Removing or swapping a move in the plan shows an **Undo** toast. The app
  asks before regenerating over your edits and before a 21st saved class
  pushes out the oldest.
- The swap list includes your custom exercises and respects your equipment
  and the per-prop people limits.

### Mixed ability

- Each move in the plan shows its Beginner / Intermediate / Advanced version.
  **Change** picks a different move for one level (marked ✎); the choice is
  saved with the class.
- Beginners never get a high-impact move — jumps are swapped for a low-impact
  version — and on timed moves they're told when to rest (about 75% of the
  interval). Substitutes only use equipment the class has.
- On the TV and phones each level's own move is the big headline.
- Checking people in sets the participant count (capped at 16, with a
  warning).

### Run the class from your phone

When you tap **Go Live**, the app opens your device's share sheet with a link
to the live class for *you* (the instructor). Pick **AirDrop** (or Messages,
Mail, Copy…) and open the link on your phone: it lands on the instructor timer
with the class loaded.

- **AirDrop is reached through the browser's share sheet**, because a web page
  can't send an AirDrop by itself. It appears on Safari on Mac, iPhone and iPad
  and needs the app on `https://`. On plain `http://`, or in browsers without a
  share sheet, you get a "Run this class from your phone?" bar instead, with a
  copy-link panel behind it. `localhost` and `file://` can't be opened from a
  phone; the panel says so.
- **No scan code here.** This link carries the whole class for the
  instructor timer (5,000–6,600 characters), which is more than any QR code
  can hold (2,953). Use AirDrop, Messages or Copy link.
- **First time on the phone**, type your instructor code once. The phone
  remembers it.
- **Join the class clock** — if the class is already running, tap the bar's
  **Join the class clock** button and the phone jumps to the interval the room
  is on. The link carries the class start time, so if you paused the class,
  resend it with the **📲 Phone** button.
- **Privacy** — the link holds the exercises only. No roster, flags,
  notes or group names. It is a long link (a few thousand characters) because
  the whole plan travels inside it; nothing is stored on a server.
- **Switch it off** with the checkbox under **Go Live**. The **📲 Phone**
  button on the timer screens always sends on demand.

## Offline use and updating

A service worker caches the app so it opens with no signal, and instantly
with one (only on `https://`, `localhost` or `127.0.0.1` — not `file://`).
Each time the app opens it quietly checks for a newer copy. When there is
one, the whole new set is downloaded in the background and an **Update
ready — Reload** bar appears at the bottom. Tap **Reload** (it asks first
if a class timer is running), or just carry on — the new copy is used the
next time the app opens. A page never runs half old and half new files.

**When you re-publish, bump `APP_VERSION` at the top of `sw.js`.** Changed
files are noticed even without the bump, but the bump also clears the old
cache.

### Undo and safety copies

- **Deleting a scheduled plan** shows an **Undo** bar for ten seconds.
- **Import → Replace** first downloads a copy of the plans it is about to
  replace (`…before_replace….json`) and keeps one on the laptop; an **Undo**
  bar lets you put them straight back.
- The Plans screen shows **when you last backed up** on this device.
- Instructor names can be changed: tap the small emoji button next to your
  name, type the new name, **Save name**.

## Security notes

The page has a Content Security Policy (`script-src 'self'`) and no inline
event handlers; buttons use `data-onclick` attributes run by `actions.js`.
That means an injected `<script>` or `onerror=` won't run. If you add a
button, use `data-onclick`, not `onclick`. `actions.js` only calls the
app's own functions and a few harmless element methods — never `window`,
storage, `open`, `eval` and the like — and anything user-typed that goes
into an attribute is escaped first.

## Tests

`npm test` (Node 20+, no packages to install) checks that every script
parses, that the auth hashing matches Node's crypto, that all `data-on*`
handlers compile (and that no JS builds an inline handler), that the service
worker caches every script, that the class-wide equipment cap works, and that
the muscle themes and custom muscle picks resolve, and that the instructor
phone link packs and unpacks losslessly. `tests/platform.test.js` covers
the platform: crafted `data-on*` attributes can't reach storage or `open`,
sign-in throttling and session expiry, legacy codes still unlock, restoring
lost data never overwrites newer data, and `serve.js` refuses hidden files.
`tests/core.test.js` checks every class style lands on time at 20–90 min,
pause/resume, skip and end-class logging, crafted-link escaping, and that
plan edits keep extra fields and can be undone. `tests/live.test.js` covers the athlete and phone
links (stale classes, paused classes, crafted links, round limits).
`tests/content.test.js` checks the exercise data: no high-impact beginner
moves, safe easier versions, and the per-level overrides.
`tests/qr.test.js` checks the scan-code encoder against codes produced by a
reference encoder (Python `qrcode`) and decoded by ZXing.

## Not done yet

ES-module split of the scripts, splitting `style.css`, a light theme, and an
ESLint setup. None are needed for the app to work.

---

## Files

| File | What it is |
|---|---|
| `index.html` | The app — open this one |
| `actions.js` | Runs the `data-on*` button handlers (CSP-safe) |
| `features.js` | Voice, haptics, TV mode, swap, flags, summary, trends, class card |
| `boot.js` | Service-worker registration and start-up wiring |
| `sw.js` | Offline cache — bump `APP_VERSION` when you publish |
| `package.json`, `tests/` | `npm test` |
| `app.js` | Main logic, equipment inventory, plan builder |
| `exercise-db.js` | The exercise library, grouped by equipment |
| `muscle-map.js` | Muscle grouping and coverage balancing |
| `programming.js` | Class styles and rep schemes |
| `mixed_ability.js` | Beginner / Intermediate / Advanced handling |
| `editor.js` | Plan editing |
| `participant.js` | The class share link and the athlete phone pages |
| `remote.js` | The instructor phone link: share sheet / AirDrop, and opening it on the phone |
| `qr.js` | Draws the scan codes in the share panels (offline, no outside service) |
| `profiles.js` | Instructor profiles and the "Who's teaching?" picker |
| `auth.js` | The two access codes |
| `storage.js` | The one safe door to browser storage (see the Safari notes above) |
| `manifest.json` | Lets the app install properly via Add to Dock / Add to Home Screen |
| `icon-*.png`, `apple-touch-icon.png` | App icons used when it's installed |
| `style.css` | Appearance |
| `serve.js` | Optional local server (Option 3 above) |
| `serve.config.json` | Saved server settings |

---

## If something goes wrong

**I've locked myself out** — nothing is lost. Open `auth.js` in a text
editor and put a code you know back in, following the instructions at the
top of that file. If the app is published, re-publish it afterwards.

**Nothing happens when I double-click `index.html`** — right-click it,
choose "Open with", and pick a browser.

**My saved classes have vanished (Mac)** — if the app went a week or more
without being opened, Safari deleted them; that is Safari's doing and they
can't be recovered from the browser. Restore from a backup file if you have
one, and see **Back up to a file — and why you should** above to stop it
happening again.

**A red panel says the browser isn't keeping my classes** — see
**If the app says it isn't keeping your classes** above.

**`node` is not recognised** — Node isn't installed, or the terminal was
opened before installing it. Install from nodejs.org, then open a *new*
terminal.

**Phones can't load the address** — they are probably on a different
network from the laptop, or the studio wifi blocks devices from seeing each
other. Use the published-copy setup above instead.

**Phones can't open the class link** — check the banner in the share panel.
If it says "Phones cannot reach this · localhost", the app was opened at
`http://localhost:…`, which every phone reads as *itself*. Close that tab
and use the **"On phones (same wifi)"** address the server printed instead
(something like `http://192.168.1.50:8080`), or publish a copy as above.

**A phone says the class link looks damaged** — the published copy is
older than the app you're building with. Re-upload the folder.

**My saved classes have vanished** — check the **Instructor:** row on the
front screen shows *your* name. Saved classes are per-instructor, so if
someone else's name is selected you're looking at their list. Tap your own
name to get yours back.

**It keeps asking who's teaching** — that's on purpose, once per opening of
the browser. It won't ask again on a refresh.

**I want my equipment numbers back** — ⚙️ Equipment → **↺ Reset**.
