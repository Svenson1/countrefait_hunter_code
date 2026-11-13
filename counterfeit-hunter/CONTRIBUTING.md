# Working on Counterfeit Hunter

Notes for the team on how we change the code. The [developer guide](docs/DEVELOPMENT.md)
explains how the app is put together.

## Getting started

1. Clone the repository.
2. Start a local server in the project folder: `py -m http.server 8000` on
   Windows, `python3 -m http.server 8000` on macOS and Linux.
3. Open <http://localhost:8000>.

There is nothing to install. Edit a file and reload the page.

## Making a change

1. Create a branch from `main` with a short descriptive name, for example
   `note-search-numbers` or `fix-dark-theme-chips`.
2. Make the change and test it (see the checklist below).
3. Open a pull request and ask a teammate to review it. Describe what changed
   and why, and add a screenshot if the screen looks different.
4. Merge once it has been reviewed. GitHub Pages updates on its own a minute
   or two after `main` changes.

Keep each pull request to one change. Small ones get reviewed faster.

## Code style

- Plain JavaScript modules, no frameworks and no build step. Keep it that way
  unless the team agrees otherwise.
- 2 spaces, single quotes, semicolons. The `.editorconfig` file sets up most
  editors.
- Name things for what they are (`noteSearch`, not `ns`). Comments explain
  why, not what.
- No text in the code. Every text the user sees goes in `js/i18n/en.js`, with
  the same key in `sw.js` and `fi.js`. If you can't translate it, copy the
  English and mention it in the pull request.
- New buttons use `data-act="name"` and a matching entry in `js/actions.js`.

## Before opening a pull request

- [ ] A full check works: six photos (the Demo button is fine), choose the
      note, result, checklist, final result, saved to History.
- [ ] The screen you changed looks right at phone width (about 390 px wide)
      and on a wide screen with the guide panel.
- [ ] It works in the light and the dark theme.
- [ ] It works in Kiswahili. Kiswahili texts are often longer than English.
- [ ] The browser console shows no errors.
- [ ] If you changed the camera or the photo checks: tried on a real phone
      through the GitHub Pages address, which has the live camera.
- [ ] No percentages or model details on screens users see. The certainty
      stays internal.

## Reporting a problem

Open an issue with what you did, what you expected and what happened instead.
Add the browser, the device, the language and a screenshot if you can.
