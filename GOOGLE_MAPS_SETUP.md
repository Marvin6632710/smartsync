# Google Maps setup

SmartSync uses Google Maps for the activity map and the location picker in
Create/Edit Activity. This guide covers configuring a new environment or
replacing the existing Google Maps configuration. See HANDOFF.md for the
current release and verification record.

## 1. Configure the Google Cloud project

In a Google Cloud project you control:

1. Link a billing account and enable **Maps JavaScript API**. These are
   required by [Google's setup instructions](https://developers.google.com/maps/documentation/javascript/usage-and-billing).
   The map project can be separate from the Firebase project. Cloud/billing
   changes are performed by the owner; this migration does not enable them.
2. Create a browser API key. Under **Application restrictions**, select
   **Websites** and allow the URLs you actually use:

   ```text
   https://smartsync-c1f07.web.app/*
   https://smartsync-c1f07.firebaseapp.com/*
   http://localhost:5173/*
   http://127.0.0.1:5173/*
   ```

   Under **API restrictions**, restrict it to **Maps JavaScript API**.
   Separate development and production keys can use separate URL lists.
   Add any custom domain or development port you use to its appropriate key.
3. In **Google Maps Platform → Map Management**, create a map ID with type
   **JavaScript** and rendering type **Raster**. Advanced Markers need a map
   ID; use your own ID in production. See
   [Google's map ID guide](https://developers.google.com/maps/documentation/javascript/map-ids/get-map-id).

This implementation does not need Places API or Geocoding API. Hosts still
choose a point and enter its location name. Google Maps usage is external
and subject to its billing/quota settings even with Firebase emulators.

## 2. Configure SmartSync

Add these two values to `.env.local` for development and `.env.production`
for the production build. Preserve the Firebase settings already in those
files; do not replace the entire files with this snippet.

```dotenv
VITE_GOOGLE_MAPS_API_KEY=your_restricted_browser_api_key
VITE_GOOGLE_MAPS_MAP_ID=your_javascript_raster_map_id
```

These values are browser configuration, bundled into the app by Vite.
Website/API restrictions protect the browser key; do not use a server key
or service-account credentials here. Keep the environment files out of git.
Restart Vite after changing them. Production changes require a new build.

```bash
npm run dev
```

## 3. Verify before publishing

Use a signed-in local browser to check:

- The map loads Google tiles and shows activity pins and clusters. Choosing
  a list row focuses its pin; pin clicks show the matching activity preview.
  Activities at the same coordinate can each be selected by repeated clicks.
- Panning and zooming work without the view resetting on an ordinary live
  update. Google's logo, attribution and controls remain visible on desktop
  and mobile, in the app's light and dark themes.
- Create/Edit Activity accepts a pin in Thailand. Typing a location name
  keeps the pin and view stable. Saving and reopening retain its coordinates.
  The existing location button works when the user grants browser permission.
- A blocked SDK request produces the unavailable message. Restoring network
  access and choosing **Try again** loads the map. After correcting key,
  billing or referrer settings, reload the page as well.
- With Firebase hosting's CSP applied, there are no blocked Google requests
  or key, billing, map ID or referrer errors in the browser console. Vite's
  development server does not apply the hosting CSP, so check a Firebase
  Hosting preview or the release as part of deployment verification.

Automated tests mock Google's SDK to check loading, retries, marker lifecycle,
pin selection and view stability. They do not prove cloud configuration,
actual Google rendering or production CSP compatibility.

## 4. Publish the configured build

```bash
npm run check:maps
npm run test:unit
npm run lint
npm run format:check
npm run build
npx firebase deploy --only hosting
```

The hosting predeploy check refuses missing configuration or `DEMO_MAP_ID`.
It checks presence, not whether Google accepts the values. This migration
does not require deploying Firestore rules, indexes or Functions.

Verify the deployed map and Create/Edit Activity at
<https://smartsync-c1f07.web.app>. Do not publish this migration while the key
or map ID is absent; the previous working release should remain live.
