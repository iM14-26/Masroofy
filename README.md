# مصاريفي (MyBudjet)

Static front-end (GitHub Pages, installable PWA) + Google Apps Script backend that reads/writes the Google Form's response sheet.

```
index.html, app.css, sw.js, manifest.webmanifest, icons/   -> GitHub Pages (the app)
apps-script/Code.gs, appsscript.json                       -> Google Apps Script (the API)
src/input.css, tailwind.config.js, package.json            -> only needed to rebuild app.css
```

## 1) Deploy the backend (Apps Script)

1. Open your existing Apps Script project (or create one) and replace `Code.gs` with `apps-script/Code.gs`.
   Optional: Project Settings -> "Show appsscript.json" and paste `apps-script/appsscript.json`.
   You can delete the old `Index.html` file from the project (the page now lives on GitHub).
2. Check `EDIT_FORM_ID` at the top of `Code.gs`.
3. Run `setupApiToken` once from the editor (authorize when asked), then open **Executions -> Logs** and copy the `API_TOKEN` value.
   (Or add a script property named `API_TOKEN` manually: Project Settings -> Script properties.)
4. **Deploy -> New deployment -> Web app**: *Execute as* = **Me**, *Who has access* = **Anyone**. Copy the URL ending in `/exec`.
5. Later code changes: **Deploy -> Manage deployments -> edit -> Version: New version** (the URL stays the same).

## 2) Publish the page (GitHub Pages)

1. Create a GitHub repo and upload everything in this folder to the repo root (keep `.nojekyll`).
2. Repo **Settings -> Pages -> Build and deployment -> Deploy from a branch -> `main` / `(root)`**.
3. Your app is at `https://<user>.github.io/<repo>/` after a minute.

## 3) First run + install on Android

1. Open the page in **Chrome on Android**. The settings dialog opens by itself: paste the `/exec` URL and the `API_TOKEN`, then tap **حفظ واختبار**. They are stored on that device only (localStorage) and are never in the repo.
2. Tap **تثبيت** in the banner (or Chrome menu ⋮ -> **Install app** / **Add to Home screen**). The app opens full-screen from the home screen and its shell works offline (saving data needs a connection).

## Notes

- The repo can be public: the token is not in it. Treat the token like a password; to rotate it, run `setupApiToken` again and enter the new value in the app.
- Anyone who knows the `/exec` URL can reach the endpoint, but every request without the token is rejected.
- After changing any file, bump `VERSION` in `sw.js` so installed apps refresh their cache.
- Rebuild the CSS after editing classes in `index.html`: `npm install` then `npm run build:css`.
- A real APK is optional: upload the deployed URL to https://www.pwabuilder.com to package it (Trusted Web Activity).
