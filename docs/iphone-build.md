# Getting Epic Asia onto everyone's iPhone

Everything in the code is ready for a real iPhone build: the build configuration (`eas.json`), app icon, splash screen, permission texts, push notifications and bundle ID (`com.benjaminjakeallen.epicasia`). What's left needs **your** accounts, because Apple and Expo tie apps to a person.

**You'll need**
- An **Apple Developer Program** membership: **$99 a year**, required for TestFlight and push notifications.
- An **Expo account**: free. Expo's build service (EAS) builds the app in the cloud, so **no Mac is needed**.
- About an hour of your time, spread over a couple of days, because Apple's approval can take up to 48 hours.

The plan is to share the app with the group through **TestFlight**, Apple's beta app. Each traveler installs TestFlight from the App Store and taps an invite link. There's no public App Store listing.

---

## 1. Join the Apple Developer Program (do this first: approval takes time)

1. Go to **developer.apple.com/programs/enroll** and sign in with your Apple ID. Two-factor authentication must be on.
2. Enroll as an **Individual**. It's the fastest route. An Organization also works, but it needs a D-U-N-S number and takes longer.
3. Pay the $99 fee. Approval usually takes from a few hours to 2 days, and you'll get an email.

## 2. Create an Expo account

1. Sign up at **expo.dev** (free).
2. Create the project's link. On any computer with Node.js installed:
   ```bash
   git clone https://github.com/benjaminjakeallen-alt/epicasia
   cd epicasia
   npm install
   npx eas-cli@latest login
   npx eas-cli@latest init        # links this app to your Expo account
   ```
   `eas init` adds an `extra.eas.projectId` (and `owner`) to `app.json`. **Commit and push that change.** Push notifications only switch on once that project ID exists.

> **Prefer that I do steps 2–5?** Create an access token at expo.dev → Account settings → Access tokens, and add it to this Claude environment as a secret named `EXPO_TOKEN`. I can then run `eas init`, set the variables and start builds from here. The very first iOS build still needs your Apple login once (step 4), unless you give EAS an App Store Connect API key (expo.dev → Credentials).

## 3. Give the build the Supabase settings

The app reads two settings at build time. The values are the same ones you set for the web version; they're in Supabase → Project Settings → API:

```bash
npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value https://YOUR-PROJECT.supabase.co --visibility plaintext
npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value YOUR-ANON-KEY --visibility plaintext
```

Repeat with `--environment preview` and `--environment development` if you'll use those builds. The anon key is designed to be public, so `plaintext` is fine. **Never** add the `service_role` key.

Once the web version has a real address (Vercel), also add `EXPO_PUBLIC_SITE_URL` with that address. Invite links and QR codes then open for anyone, whether or not they have the app installed.

## 4. Build the app

```bash
npx eas-cli@latest build --platform ios --profile production
```

- It asks you to **log in to your Apple account**. Say **yes** when it offers to create the distribution certificate, provisioning profile and **push notification key**. EAS stores and manages them for you.
- The build runs on Expo's servers, taking about 15–30 minutes, and you get a link when it's done.
- The free Expo plan includes a monthly allowance of builds, which is plenty for this.

## 5. Send it to TestFlight

```bash
npx eas-cli@latest submit --platform ios --latest
```

This uploads the build to **App Store Connect**, creating the app record there if needed. Apple then processes it, which takes about 10–30 minutes.

## 6. Invite the travelers

In **appstoreconnect.apple.com** → your app → **TestFlight**:

- **External testing** (best for the group): create a group, add the build, and fill in the short "What to test" note. The first build goes through a quick **Beta App Review**, usually within a day. Then turn on a **public link** and send it to everyone, or add their emails.
- **Internal testing** (instant, no review): only for people you add as users in App Store Connect. That's handy for you and a co-organizer.

Each traveler then:
1. Installs **TestFlight** from the App Store.
2. Opens your link and taps **Install**.
3. Signs up in Epic Asia with the **invite code** you send them (Profile → Invite travelers).

> ⚠️ **TestFlight builds expire after 90 days.** The trip is June 5–19, 2027, so make a fresh build (steps 4–5) in **April–May 2027**. Everyone's app then updates through TestFlight, and nothing needs reinstalling.

## 7. Tell Supabase about the app's links

In Supabase → **Authentication → URL Configuration**:
- **Redirect URLs:** add `epicasia://**`, so password-reset and confirmation emails can open the app.
- **Site URL:** your web address once it's deployed.

## 8. Check on a real iPhone

These can only be tested on a phone, not in the web preview:
- [ ] Allow notifications when asked, then have someone else send a chat message. You should get a push, and tapping it opens the chat.
- [ ] **Forgot password → email link** opens the app on the "new password" screen.
- [ ] Record a voice note in the Journal, then make the photo book (it opens the share sheet with a PDF).
- [ ] Save a photo from Photos to your camera roll.
- [ ] Turn on **Large & spoken mode** (Profile → Accessibility) and turn the menu. It should speak each item. Try it with VoiceOver too.
- [ ] Put the phone in Airplane mode and open Itinerary and Flights. The saved copy shows with an "Offline" note.

---

### What each build profile is for (`eas.json`)
| Profile | Use |
|---|---|
| `production` | TestFlight / App Store. Build numbers go up automatically. |
| `preview` | A quick install link for a few registered iPhones, without TestFlight. |
| `development` | A developer build with live reload. Only needed for hands-on debugging. |
