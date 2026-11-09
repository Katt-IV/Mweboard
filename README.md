# Whatsflow WhatsApp marketing dashboard

Whatsflow is an Angular dashboard with a Node.js/Express API for WhatsApp campaigns. It uses Firebase Authentication and Cloud Firestore for user accounts and data, the Meta WhatsApp Cloud API to send messages, and a Meta webhook to receive delivery updates.

The Angular frontend can be hosted on Firebase Hosting. The API must run separately on a persistent Node.js host with a public HTTPS URL: it handles the Meta webhook and runs the campaign scheduler. Do not deploy the API as a sleeping or short-lived serverless function; scheduled campaigns may not run on time.

## Requirements

- Node.js 20 or newer and npm
- A Firebase project with Authentication, Firestore, and a registered Web app
- Firebase CLI access to that project
- A Meta app with WhatsApp Cloud API access, a WhatsApp Business Account (WABA), and a connected phone number
- A persistent Node.js hosting service that provides a public HTTPS URL for the API

## 1. Set up your Firebase project

1. Create a Firebase project in the [Firebase Console](https://console.firebase.google.com/).
2. In **Authentication → Sign-in method**, enable Google and Email/Password sign-in.
3. Create a Firestore database.
4. In **Project settings → General**, register a Web app and copy its Firebase configuration.
5. In `client/src/environments/environment.ts`, replace the Firebase values with your Web app values and set `apiBaseUrl` to the public HTTPS URL of your deployed API (for example, `https://api.example.com`). This file is git-ignored; do not remove that protection. `environment.example.ts` shows the expected shape.
6. In **Authentication → Settings → Authorized domains**, add your Firebase Hosting domain (for example, `YOUR_FIREBASE_PROJECT_ID.web.app`) and any custom domain you use.

Firebase Web app configuration is included in the browser bundle and is not a secret. Never put a Firebase service-account key or Meta credential in the client.

### Deploy Firestore rules and indexes

Install/use the Firebase CLI, sign in, and deploy from the repository root:

```sh
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project YOUR_FIREBASE_PROJECT_ID
```

Wait for Firestore to finish creating the indexes before using campaign scheduling. The rules and indexes are defined in `firestore.rules` and `firestore.indexes.json`.

## 2. Connect your Meta WhatsApp app

In the [Meta for Developers](https://developers.facebook.com/) dashboard, create or select an app and add/configure the WhatsApp product for your business:

1. Connect your WhatsApp Business Account and phone number. Use a phone number that is registered for the WhatsApp Cloud API.
2. Create a system-user access token with the WhatsApp permissions required by your Meta setup. Use a token suitable for your production deployment, and keep it only in the API host's secret environment configuration.
3. Record the WhatsApp **Phone Number ID** and **WABA ID**. The app can store these in its settings; `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_WABA_ID` are server-side defaults.
4. Create and get approval for the message templates you intend to use. WhatsApp requires an approved template to initiate a conversation outside the recipient's 24-hour customer-service window.
5. In the API host's environment, set `META_APP_SECRET` from your Meta app settings and set `META_VERIFY_TOKEN` to a long, random value you choose. The verify token is a shared webhook verification string, not your access token.
6. Once the API is deployed and has HTTPS, configure the Meta webhook callback URL as `https://YOUR_API_HOST/webhook`. Enter the exact same `META_VERIFY_TOKEN` in Meta and subscribe the WhatsApp webhook to the `messages` field. The app secret is used to validate webhook signatures.

Meta may charge for WhatsApp messages according to its current pricing and policies.

## 3. Deploy the API

Create a Node.js service on your chosen persistent hosting provider and deploy this repository's `server` directory. Configure the service to use Node.js 20 or newer and run:

```sh
npm install
npm run build
npm start
```

Set these environment variables in the hosting provider's secret/configuration settings (do not commit them):

| Variable | Value |
| --- | --- |
| `PORT` | Usually provided by the hosting provider; the API defaults to `3000` if unset. |
| `FIREBASE_PROJECT_ID` | Your Firebase project ID. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Optional path to a service-account JSON file on the API host. The path is relative to the `server` directory unless absolute. Alternatively, use `FIREBASE_SERVICE_ACCOUNT_JSON` or the host's supported Application Default Credentials. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Optional complete service-account JSON as a single-line secret; use instead of `GOOGLE_APPLICATION_CREDENTIALS`. Never expose it to the frontend. |
| `CLIENT_ORIGIN` | Exact deployed frontend origin, such as `https://YOUR_FIREBASE_PROJECT_ID.web.app`. For multiple origins, use a comma-separated list. |
| `WHATSAPP_TOKEN` | Meta system-user access token for the WhatsApp Cloud API. |
| `WHATSAPP_PHONE_NUMBER_ID` | Your WhatsApp Cloud API phone number ID. |
| `WHATSAPP_WABA_ID` | Your WhatsApp Business Account ID. |
| `GRAPH_API_VERSION` | Graph API version to use, for example `v25.0`. |
| `META_VERIFY_TOKEN` | The random webhook verification token configured in Meta. |
| `META_APP_SECRET` | The Meta app secret used to validate webhook signatures. |
| `MESSAGE_DELAY_MS` | Optional delay between campaign messages in milliseconds; defaults to `250`. |

Give the API's Firebase service identity the access needed for Firebase Authentication token verification and Firestore access. Keep the service-account key outside the repository. If using a service-account file, make sure it is available at the configured path on every deployment.

After deployment, check `https://YOUR_API_HOST/health` and confirm it returns `{"ok":true}`. Then configure the Meta webhook URL as described above. Keep this Node service running continuously for scheduled campaigns and webhook processing.

## 4. Build and deploy the frontend to Firebase Hosting

From the repository root, install the client dependencies, build the production bundle, and deploy Hosting:

```sh
npm --prefix client install
npm --prefix client run build
npx firebase-tools deploy --only hosting --project YOUR_FIREBASE_PROJECT_ID
```

`firebase.json` publishes `client/dist/Marketing_Dashboard/browser` and rewrites frontend routes to `index.html`. The production build uses `client/src/environments/environment.ts`; make sure its `apiBaseUrl` is the deployed API's HTTPS origin before building. Redeploy Hosting after changing frontend environment values.

After Hosting is live, ensure its origin is included in the API's `CLIENT_ORIGIN` setting and in Firebase Authentication's authorized domains. If you change `CLIENT_ORIGIN`, restart or redeploy the API.

## Local development

For local development, set `apiBaseUrl` in the git-ignored `client/src/environments/environment.development.ts` to `http://localhost:3000` and provide your own Firebase Web app configuration. In `server`, copy `.env.example` to `.env` and set your Firebase and Meta values. Install and start each app in separate terminals:

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

The client runs at `http://localhost:4200`; the API runs at `http://localhost:3000`. For local webhook testing, Meta must be able to reach your API over HTTPS; use a secure public HTTPS tunnel and configure that URL as the callback while testing.

## Useful scripts

```sh
npm --prefix client run build
npm --prefix client run lint
npm --prefix server run build
npm --prefix server run lint
```

The Firebase Spark plan has usage quotas. Check Firebase's current plan limits and whether your chosen services require billing before deploying. WhatsApp messaging fees, if any, are set by Meta and are outside this app's control.
