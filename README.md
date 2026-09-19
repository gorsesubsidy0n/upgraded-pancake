# Inspire Habits

A workout builder for mixed-ability group classes at a studio gym.
Everything runs in your browser. No accounts, no internet required, nothing
to install for the basic setup.

---

## Opening the app

Unzip the folder somewhere you can find it again — Desktop or Documents is
fine. Then pick one of the two ways below.

### Option 1 — Just open it

**Double-click `index.html`.**

That's it. The app opens in your browser and everything works: building
plans, editing them, going live with the timer, saved workouts, history,
the exercise library.

The one thing that will not work is **QR codes for athletes**, because a
file sitting on your laptop has no address a phone can reach. If you want
those, use Option 2 (and read the wifi section below).

### Option 2 — Run the little server

This is what you want if athletes will scan QR codes to track their own
rounds and reps.

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

Your browser opens automatically. The terminal also prints a **second
address** for phones — something like `http://192.168.1.243:8080`. Any
phone on the studio wifi can reach that.

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

## QR codes when phones aren't on studio wifi

Guests without the wifi password, or a studio with no guest network, can
still scan — but this needs a one-time setup.

1. Upload this folder to any free static host. Good options:
   - **Netlify Drop** (`app.netlify.com/drop`) — drag the folder onto the
     page, done in about 30 seconds, no account needed to start
   - **GitHub Pages**
   - **Cloudflare Pages**

2. Copy the address it gives you.

3. In the app, generate a plan, tap **📱 Scan to Track**, then tap
   **Set up** and paste the address.

From then on every QR code points there, and phones open the class on
their own mobile data. The banner in the QR panel turns green and reads
"Works anywhere".

**Is this private?** Yes. The class details travel in the part of the link
after the `#`, which browsers never send to a server. The host only ever
hands out the app's files — it never sees a class, a name, or a rep count.
Nothing is stored anywhere but on the phone that scanned.

**One thing to remember:** the uploaded copy is a snapshot. If you update
the app later, re-upload the folder, or old codes will keep opening the
old version.

---

## What athletes do

Nothing to install, nothing to open.

1. You generate a plan and tap **📱 Scan to Track**
2. They point their camera at the code
3. They type their name (or tap "Skip — just use this phone")

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

There is no server involved. The QR link carries the whole class schedule
plus the moment the class started, and each phone works out its own position
from that. Phones stay in step because they're all reading the same plan.

One consequence: **if you pause the room clock, phones keep running.** That's
what the **⇄ Re-sync to the room** button is for. An athlete taps it, picks
the move the room is actually on, and their phone snaps to it. It works both
directions — after a pause or after you skip ahead — and it picks the right
round when a move repeats.

If you show the code *before* tapping Go Live, athletes get a **▶ Start with
the class** button instead. They tap it when you start.

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

---

## Files

| File | What it is |
|---|---|
| `index.html` | The app — open this one |
| `app.js` | Main logic, equipment inventory, plan builder |
| `exercise-db.js` | The exercise library, grouped by equipment |
| `muscle-map.js` | Muscle grouping and coverage balancing |
| `programming.js` | Class styles and rep schemes |
| `mixed_ability.js` | Beginner / Intermediate / Advanced handling |
| `editor.js` | Plan editing |
| `participant.js` | QR codes and the athlete phone pages |
| `profiles.js` | Instructor profiles |
| `qr.js` | QR code drawing |
| `style.css` | Appearance |
| `serve.js` | Optional local server (Option 2 above) |
| `serve.config.json` | Saved server settings |

---

## If something goes wrong

**Nothing happens when I double-click `index.html`** — right-click it,
choose "Open with", and pick a browser.

**`node` is not recognised** — Node isn't installed, or the terminal was
opened before installing it. Install from nodejs.org, then open a *new*
terminal.

**Phones can't load the address** — they are probably on a different
network from the laptop, or the studio wifi blocks devices from seeing each
other. Use the published-copy setup above instead.

**The QR code won't scan** — check the banner under the code. If it says
"Phones cannot reach this · localhost", the app was opened at
`http://localhost:…`, which every phone reads as *itself*. Close that tab
and use the **"On phones (same wifi)"** address the server printed instead
(something like `http://192.168.1.50:8080`), or publish a copy as above.
Otherwise, try turning up screen brightness and tilting the laptop to kill
glare — the code is dense, so reflections can defeat a camera.

**A QR code says the class link looks damaged** — the published copy is
older than the app you're building with. Re-upload the folder.

**I want my equipment numbers back** — ⚙️ Equipment → **↺ Reset**.
