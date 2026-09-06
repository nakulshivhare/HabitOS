# Habit OS V5 — launch-ready PWA

Habit OS is a mobile-first, offline-first habit tracker designed for static hosting such as GitHub Pages.

## Included
- PWA manifest with 192×192 and 512×512 icons
- Service worker for offline app-shell caching
- Home-screen install support where the browser exposes it
- Dashboard checklist integrated into Today
- Habit tracking with current/best streaks and monthly goals
- Normal monthly calendar with accurate local dates, month navigation, selected-day habit summary, and month summary
- Progress dashboard with 7-day chart, monthly statistics, habit performance, and accent palette
- Daily reflection: mood/energy, screen time, biggest win, what went wrong, tomorrow's priority
- Local backup export/import and reset
- Light/dark appearance
- Migration from the earlier `habitOS_v1` localStorage format
- No external libraries or network dependency for the app itself

## Deploy on GitHub Pages
Upload **all files and folders in this ZIP** to the root of the repository. In GitHub: Settings → Pages → Deploy from a branch → select your main branch and `/ (root)` → Save.

Open the HTTPS GitHub Pages URL once online. The browser can then install Habit OS and cache the app for offline use.

## Data
All tracker data stays in the browser's localStorage. Use Settings → Export backup before clearing browser/site data or moving to another device.
