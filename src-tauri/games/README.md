# Bundled games

Any `.cszip` in this folder is imported the first time the app runs on a fresh
profile. A `.cszip` is an ordinary ChoiceScript archive: the same zip you would
drop onto the library, renamed so the operating system can associate it with
this app.

`choice-of-magics.cszip` is a commercial title by Kevin Gold / Choice of Games.
It is fine in a local build. Do not distribute installers containing it. The
folder is gitignored for that reason.

Import happens once, guarded by `bundled.marker` in the app data directory. A
game deleted from the library does not come back on the next launch.
