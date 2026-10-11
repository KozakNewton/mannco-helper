# Mannco Helper

Tampermonkey userscript for [mannco.store](https://mannco.store) (Team Fortress 2 only).

- Shows every USD price in **TF2 keys** next to the dollar price.
- Panel in the bottom-right corner to set the current key price (saved in the browser).
- **BP** button on every TF2 item card, opens the item's backpack.tf stats page
  (including the exact unusual effect, skin wear, killstreak kits).
- **BP History** button in the *Items list* of an item page, opens `backpack.tf/item/<id>`.
- Nothing is shown for CS2, Rust or Dota items.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open the raw script and click *Install*:
   <https://raw.githubusercontent.com/KozakNewton/mannco-helper/main/mannco-helper.user.js>

Tampermonkey checks for updates on its own (usually once a day).

## Releasing an update

1. Edit `mannco-helper.user.js` and **raise `@version`** in its header (updates are only offered when the version is higher).
2. `git commit -am "..." && git push`

## Reporting a problem

Open the browser console (F12), click the BP button of the item that fails and copy the
`[mannco-keys] BP click: ...` line into an issue, together with the item name as shown on Mannco.
