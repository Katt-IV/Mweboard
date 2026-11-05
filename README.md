# Whatsflow WhatsApp marketing dashboard

Free-tier starter monorepo with an Angular standalone client and an Express API. Firebase Spark is used for Authentication and Firestore; scheduled sends run in the Node server with `node-cron`. There are no Firebase Functions.

## Requirements

- Node.js 20 or newer and npm
- A Firebase project on the Spark plan with Firestore and Authentication enabled
- Meta WhatsApp Cloud API access, an approved message template, and a public HTTPS URL for production webhooks

## Setup

1. In Firebase Console, create a project, enable Google and Email/Password sign-in, and create the Firestore database.
2. Copy `client/src/app/firebase-config.ts` and replace the placeholder public web app configuration with your Firebase web app values. These client values identify your Firebase app; service account credentials must never go in the client.
3. Deploy the Firestore rules and indexes with the Firebase CLI: `npx firebase-tools deploy --only firestore:rules,firestore:indexes --project YOUR_FIREBASE_PROJECT_ID`. The campaign scheduler requires the composite index for `campaigns` on `status` and `scheduledAt`; wait for index creation to finish before starting the server.
4. Create a Firebase service account in project settings. Copy `.env.example` to `server/.env` and set `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON` (one-line JSON) or `GOOGLE_APPLICATION_CREDENTIALS`, and the Meta values. Do not commit `.env` or service account JSON.
5. Set Meta's webhook URL to `https://YOUR_HOST/webhook`, subscribe to `messages`, and set the same random verify token in `META_VERIFY_TOKEN`. Meta signature validation uses `META_APP_SECRET`.

Install and run in separate terminals:

```sh
cd server
npm install
npm run dev
```

```sh
cd client
npm install
npm start
```

The client runs at `http://localhost:4200`; the API runs at `http://localhost:3000`. Configure the Phone Number ID and WABA ID with the settings API/UI and ensure the server has the Meta access token. `POST /api/test-message` accepts `{ "to": "+15551234567", "templateName": "approved_template", "language": "en_US" }`.

## API outline

All `/api/*` routes require `Authorization: Bearer <Firebase ID token>`. Routes cover subscriber list/create/import/update/delete, settings, template test sends, campaign create/list/message logs, and campaign analytics. CSV rows can be imported by parsing them in the client and posting `{ "subscribers": [...] }` to `/api/subscribers/import`; E.164 numbers and explicit opt-in are required.

The Campaigns page sends custom text and optional JPEG/PNG images (up to 5 MB) to all opted-in subscribers. Emoji are supported. Custom text is limited to 4,096 characters; image captions are limited to 1,024 characters. WhatsApp's customer service window rules apply: use approved templates to initiate messages outside the recipient's 24-hour window. The server uploads an image once to Meta, then reuses its media ID for the campaign. Campaign messages are throttled using `MESSAGE_DELAY_MS` and status records are stored under each campaign. Meta webhook receipts update message status and counters. Run a persistent Node process for scheduling; sleeping/ephemeral serverless hosts cannot guarantee cron execution. The Spark plan has usage quotas, and Meta messaging may incur charges outside this app's control.

## Scripts

```sh
cd client && npm run build
cd server && npm run build
```

The client Firebase configuration is intentionally a placeholder until you supply your own project values. Never put Meta credentials or Firebase service account keys in `client`. The client `lint` script runs strict TypeScript checking; Angular's production build also checks templates and styles. A persistent Node server is required for cron; free hosting plans that sleep may miss send times. Meta messaging fees, if any, are set by Meta and are outside the app's control.
