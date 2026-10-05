# Putting HOLDOUT on itch.io

This takes about fifteen minutes the first time. It's easiest on a computer,
but every step also works in a phone browser.

## What you need

- **`holdout-itch.zip`:** the game. Build it with `npm run package:itch`
  (it appears in `release/`), or take the copy Claude sent you.
- **`cover.png`** and the six images in **`screens/`**: the store art.
- **`page.md`:** all the text for the page, ready to paste.

## Steps

1. **Make an account.** Sign up free at <https://itch.io/register>. Your
   username becomes part of the game's address
   (`yourname.itch.io/holdout`).

2. **Create the project.** Open <https://itch.io/game/new> and fill in:
   - **Title:** HOLDOUT. The **Project URL** fills itself in as
     `holdout`; keep it.
   - **Short description or tagline:** copy it from `page.md`.
   - **Classification:** Games.
   - **Kind of project:** **HTML**. This is what makes it playable in the
     browser.
   - **Release status:** Released.

3. **Pricing.** Choose **No payments**. The game is free.

4. **Uploads.**
   1. Click **Upload files** and choose `holdout-itch.zip`.
   2. When it finishes, tick **This file will be played in the browser**.

5. **Embed options.** These appear once the zip is marked as played in the
   browser.
   - **Viewport dimensions:** 480 × 854. This is a phone-shaped window on
     a computer screen.
   - Tick **Mobile friendly**, then set **Orientation** to **Default**.
     The game handles both orientations.
   - Tick **Automatically start on page load**.
   - Tick **Fullscreen button**.
   - Tick **Click to launch in fullscreen**. On a phone this opens the
     game full-screen, which is how it's meant to be played.
   - Leave **Enable scrollbars** and **SharedArrayBuffer support**
     unticked.

6. **Details.**
   - **Description:** paste the description block from `page.md`.
   - **Genre:** Action.
   - **Tags:** add the ten tags listed in `page.md`.
   - **App store links**, **Custom noun** and **Community:** leave as
     they are. You can turn on comments later if you want feedback.

7. **Images.**
   - **Cover image:** upload `cover.png`.
   - **Screenshots:** upload the six images in `screens/`, in number
     order.

8. **Visibility.**
   1. Choose **Draft** and click **Save**.
   2. Click **View page** and play it on your phone and on a computer.
      Drafts are visible only to you.
   3. When you're happy, go back to **Edit game**, set **Visibility** to
      **Public** and save. HOLDOUT is now live at
      `https://yourname.itch.io/holdout`.

9. **Optional: edit the theme.** On your game page, **Edit theme** sets
   the page colours. A dark theme suits the game: background `#05070d`,
   text `#e8f6ff`, links `#7ff6ff`.

## Updating the game later

### By hand

1. Run `npm run package:itch`.
2. On **Edit game**, delete the old zip and upload the new one.
3. Tick **This file will be played in the browser** again.

Players' saves carry over.

### Automatically, on every push

A GitHub Actions workflow, `.github/workflows/holdout-itch.yml`, builds
the zip on every push that changes `games/holdout/`. It always keeps the
zip as a downloadable build artifact on the run's page. It also uploads it
straight to itch.io once you give it two settings, which you do once:

1. **Get an itch.io API key.** On itch.io go to **Settings → API keys →
   Generate new API key**, and copy it.
2. **Add the key to the repo.** On GitHub, open the repository, then
   **Settings → Secrets and variables → Actions**:
   - Under **Secrets**, click **New repository secret**. Name it
     `BUTLER_API_KEY` and paste the key as the value.
   - Under **Variables**, click **New repository variable**. Name it
     `ITCH_GAME` and set the value to `yourname/holdout`, using your itch
     username.

After that, each push uploads the new build to the `html5` channel with
itch's official `butler` tool.

The first automatic upload appears on **Edit game** as a new file, next to
the zip you uploaded by hand. Do these once:

1. Tick **This file will be played in the browser** on the new file.
2. Delete the hand-uploaded zip.

From then on, every push replaces the playable version, and the embed
settings from step 5 stay as they are.
