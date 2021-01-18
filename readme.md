# An APRS packet generator and modem in Javascript

By Kevin Poulton, M0VXY

## What is this for?

APRS is a packet based data service used in Amateur Radio for tactical communications - i.e. what is happening locally in terms of time and space.

This code was built as an exercise to prove to myself I understood the mechanics of APRS before actually using it. Unfortunately, I went too deep and ended up creating a full end to end packet generation. Therefore, this is going to be most useful to anyone who wants to actually know how APRS works. It is definitely not a production ready APRS tool, though it should work 'out of the box' for many use cases. If you have come to this page looking for a production ready APRS tool, you probably want something like [Direwolf](https://github.com/wb2osz/direwolf) which is pretty solid and works on all platforms.