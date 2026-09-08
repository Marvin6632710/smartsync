# SmartSync

SmartSync is a polished React + JavaScript university senior-project prototype for nearby social activity discovery, joining, temporary activity chat, privacy controls, user matching, and intelligent activity recommendations.

## 1. Requirements

- Node.js 18 or newer
- npm

## 2. Installation

Open a terminal inside the `SmartSync` folder.

```bash
npm install
```

## 3. Run the development app

```bash
npm run dev
```

Vite will print a local URL. Open it in your browser.

## 4. Build for production

```bash
npm run build
```

The production files are written to `dist/`.

## 5. Project structure

- `src/pages/` – all application screens
- `src/components/` – reusable shell, cards and navigation helpers
- `src/context/AppContext.jsx` – shared application state and local persistence
- `src/data/mockData.js` – activities, users, messages and notifications
- `src/services/recommendationService.js` – local recommendation and matching logic
- `src/utils/storage.js` – safe localStorage helpers
- `src/styles.css` – responsive mobile-first UI

## 6. Prototype limitations

This version is intentionally a frontend/local prototype. It does **not** claim to provide:

- real authentication
- Firebase/remote database
- real GPS
- Google Maps
- cloud push notifications
- real-time network chat
- production AI/ML

Instead, these features are represented with working local/mock behavior so the app can run without API keys or external services.

## 7. Recommendation system

The local recommendation engine calculates a deterministic score using configurable weights:

- Interest match: 35%
- Distance: 20%
- Preferred time: 15%
- Previous activity behavior: 15%
- Activity popularity: 10%
- Similar-user behavior: 5%

The UI also explains why each activity is recommended. These scores are local prototype results, not output from a production AI model.

## 8. Local features that work

- Splash and onboarding
- Permission/privacy setup
- Interest selection
- Home/discovery
- Search
- Filters
- Mock map with clickable markers
- Activity details
- Join and leave activity
- Create and edit activity
- Joined activities
- Recommendation ranking and explanation
- User compatibility matching
- Participants
- Temporary local chat
- Messages
- Notifications
- Profile editing
- Settings/privacy/anonymous mode
- Safe localStorage persistence
- Fallback page for invalid routes

## 9. Future backend/AI connection

The current local data and service boundaries can later be replaced by backend implementations. A production architecture can connect the React frontend to authentication, a database, location/maps, real-time chat, notifications, and a recommendation API while keeping the UI flow largely unchanged.
