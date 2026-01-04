Streaming App — Firestick / Fire TV Guide
=========================================

Overview
--------
This document explains how to run and test the `streaming_app` frontend and backend so it can be used from a Fire TV / Firestick device (Silk browser or a wrapped APK). It covers local-dev and production builds, networking, backend prerequisites (CORS, host binding), the uploader behavior, remote navigation tips, and optional packaging as an APK.

Contents
--------
- Prerequisites
- Run locally for Firestick testing
  - Find your machine IP
  - Option A: Production build + static server (recommended for Firestick)
  - Option B: React dev server (hot reload)
- Backend requirements
  - Host binding
  - CORS
  - Upload endpoint: GET vs POST
- UX / Fire TV tips
- Packaging as a standalone Fire TV app (optional)
- Troubleshooting
- Next steps & recommended improvements

Prerequisites
-------------
- Node.js (16+ recommended)
- npm
- On your dev machine: the `streaming_app` repo (this workspace)
- On the Firestick: Silk browser (built-in) or Firefox for Fire TV for testing, or an installed APK if you package it

Run locally — make the app reachable from the Firestick
-----------------------------------------------------
Step 1 — find your dev machine's LAN IP
- macOS (Terminal):

```bash
ipconfig getifaddr en0
```

or more generally:

```bash
ifconfig | grep 'inet ' | grep -v 127.0.0.1
```

Note the local IP . Your Firestick should be on the same Wi‑Fi network.

Step 2 — serve the app so the Firestick can reach it

Option A — Production build + static server (recommended for testing on Fire TV)

```bash
# from /Users/AJ/Desktop/streaming_app/client
npm run build
# install serve if you don't have it:
npm install -g serve
# serve the build on port 8080
serve -s build -l 8080
```

Then open on Firestick's browser:

```
http://<YOUR_MACHINE_IP>:8080
```

Option B — React dev server with hot reload (not recommended for performance testing)

React dev server binds to localhost by default; bind to all interfaces so the Firestick can access it:

```bash
# from /Users/AJ/Desktop/streaming_app/client
export HOST=0.0.0.0
npm start
```

Then open:

```
http://<YOUR_MACHINE_IP>:8080
```

Backend requirements
--------------------
- Ensure your backend listens on `0.0.0.0` (not only `localhost`) so the Firestick can reach it. Example for Express:

```js
// server.js (Express example)
const port = process.env.PORT || 8080;
app.listen(port, '0.0.0.0', () => console.log(`listening ${port}`));
```

- Enable CORS if frontend and backend run on different origins:

```js
const cors = require('cors');
app.use(cors());
```

Upload endpoint (important)
- Current UI uses a GET-style "trigger" endpoint (e.g. `/upload_movie/:title`). That only makes sense if files already reside on the server or the endpoint triggers a server-side fetch. If you want users to actually upload files from the client, use a POST `/upload` endpoint that accepts `multipart/form-data` and returns appropriate status codes.

- To enable real upload progress on the client use axios POST with `onUploadProgress`, and on the server accept file streams (e.g., `multer` for Express).

Example axios POST (client):

```js
const form = new FormData();
form.append('movie', file);
await axios.post('http://<server-ip>:8080/upload', form, {
  headers: { 'Content-Type': 'multipart/form-data' },
  onUploadProgress: (evt) => {
    const percent = Math.round((evt.loaded / evt.total) * 100);
    // update progress for this file
  }
});
```

UX / Fire TV tips
-----------------
- Use production build on Firestick for best performance.
- The app has larger buttons and visible focus outlines to help remote/D-pad navigation. For better D-pad UX consider:
  - Explicit `tabindex` management so focus order follows the grid.
  - Keyboard listeners for Arrow keys and Enter to navigate and activate items.
- Add a little `bottom` safe area padding for TV overscan. CSS example:

```css
.sidebar { padding-bottom: env(safe-area-inset-bottom, 24px); }
```

- Test video playback on the Firestick browser — HLS and MP4 typically work, but test your specific codecs and HLS segment settings.

Packaging as an APK for Fire TV (optional)
------------------------------------------
If you want the app to be a native app rather than opened in Silk, wrap it in a WebView shell. Two common approaches:

1) Capacitor (modern, recommended):
- Install Capacitor in `client` and create an Android project, configure the start URL to the built `index.html`, then build an APK. High level:

```bash
# from client/
npm install @capacitor/core @capacitor/cli
npx cap init
npm run build
npx cap add android
npx cap copy android
# open android project in Android Studio and build a signed APK for Fire OS
npx cap open android
```

2) Cordova (older): similar process but with Cordova CLI and `cordova-plugin-inappbrowser` / `cordova-plugin-androidx` as needed.

Note: after packaging, you must sign the APK and optionally sideload it onto the Firestick (via adb over network or USB). Fire OS is Android-based but has some differences — test carefully.

Troubleshooting
---------------
- Firestick can't load site: check firewall on dev machine, ensure port is open and server bound to `0.0.0.0`.
- CORS errors: enable CORS on backend or proxy requests through the same origin.
- Video won't play: test HLS URL directly in Silk browser. Some streaming options (DRM, encrypted HLS) may not work in browser.
- Uploads failing: confirm client uses POST if sending file data; server must accept multipart/form-data.

Quick commands summary
----------------------
- Build and serve production (recommended):
```bash
# in client/
npm run build
npm install -g serve
serve -s build -l 8080
# then open http://<YOUR_IP>:8080 on the Firestick browser
```
- Run dev server and bind to 0.0.0.0:
```bash
export HOST=0.0.0.0
npm start
```
- Example backend listens on all interfaces (Express):
```js
app.listen(process.env.PORT || 8080, '0.0.0.0');
```

Security note
-------------
- For testing on local networks this setup is fine. For public hosting or production, use HTTPS, secure authentication, and protect upload endpoints.

Next steps I can implement for you
----------------------------------
- Convert the uploader to real `POST` multipart upload with live axios `onUploadProgress` and update the server endpoint accordingly.
- Add localStorage persistence for the queue.
- Add improved D-pad focus handling for Fire TV (keyboard event handling and explicit focus targets).
- Provide a sample Capacitor wrapper and step-by-step APK build instructions.

If you'd like any of those, tell me which one to do next and I'll implement it and update the README accordingly.

---
Generated on: 2025-11-18
