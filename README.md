# Code-mon

A tiny pixel pet that lives in a side pane of Claude Code. It roams and hops while you work, and it reacts to what
Claude does in **every** Claude Code tab you have open. It never grows, never gets punished, and uses **zero tokens**:
everything runs on your machine.

## Install

```
/plugin install code-mon --marketplace dhrupo/code-mon
```

Answer `y` to add the marketplace, then pick a scope. Then type `/codemon` to open the pane and pick your buddy.

## Your pet

Pick one of 9 animals: cat, dog, hare, fox, penguin, hamster, chick, frog or panda. Give it a name. You keep one pet at
a time.

| Mood | When | What it does |
|---|---|---|
| playful | nothing special | roams and hops now and then |
| happy | you fed, petted or played with it; a test or build passed | hops, hearts |
| hungry | 2 hours after its last meal (only counted while a Code-mon pane is open); it calls once | sits still, sad eyes |
| dizzy | a test or build run failed in any tab (not interrupted or backgrounded) | swirly eyes, wobbles (a few seconds) |
| sick | any other command crashed with a long stack trace, in any tab | green, droopy, sneezes (a few seconds) |
| alert | Claude shows a permission dialog in any tab | jumps and chirps |
| proud | Claude finished a long answer (over a minute) in any tab | spins |
| sleepy | `/nap` | curls up, silent |
| missed you | the first time you're back after 2 hours away (opening the pane, a pet command, or a passing test) | a happy dance |

A speech bubble names the tab, for example `my-app: needs you!`. The mood is always written on the stats line too, so
you never have to read it from the picture alone.

## Commands

| Command | What it does |
|---|---|
| `/codemon` | Open the pane (first time: pick and name your pet) |
| `/feed` | Feed it; resets the 2-hour hunger clock |
| `/pet` | Pet it |
| `/play` | Play with it |
| `/nap` | Put it to sleep. This also mutes it; `/codemon`, `/feed`, `/pet` or `/play` wakes it |
| `/mood` | Name, mood, next meal and how many days you've been together |
| `/adopt <animal>` | Swap to another animal, e.g. `/adopt fox`. Your current pet stays until you name the new one |

If a command name is already taken (a Claude Code built-in, a project command or another plugin), that command keeps working for its owner and Code-mon leaves it alone.

## Sound

Short, original chiptune bleeps, a different set per animal. Sounds play **only while a Code-mon pane is open**, and
at most one attention sound a minute. `/nap` silences it. A command plays its sound only in a tab that has the pane open.

- macOS: built in (`afplay`).
- Linux: the first of `pw-play`, `paplay` or `aplay` it finds. None installed means no sound.
- Windows: PowerShell's built-in sound player.

## How it works

Every Claude Code session with Code-mon installed writes small event records (named after the project folder) (command failed, permission asked, and so
on) to the mod's own local store. The tab with the pane reads them about once a second. If several panes are open, one
leads: only it applies events, counts hunger and plays sounds, so nothing happens twice. Nothing leaves your machine.

The pane draws pixels with terminal half-blocks, so it works in the terminal. Other Claude Code surfaces show a short
note instead.

## Develop

```
claude plugin test .
claude plugin validate .
claude --plugin-dir .
node scripts/make-sounds.mjs   # regenerate sounds/*.wav
```

## License

MIT
