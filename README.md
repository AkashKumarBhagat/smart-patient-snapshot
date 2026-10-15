# Patient Snapshot

A small [SMART on FHIR](https://docs.smarthealthit.org/) web app that shows a one-page summary of a patient:

- **Header**: name, gender, date of birth, age and patient ID
- **Latest Vitals**: the newest reading for each of blood pressure, heart rate, respiratory rate, body temperature, weight, height and BMI
- **Active Conditions**
- **Active Medications**

It is plain HTML, CSS and JavaScript with no framework or build step. Authorization and FHIR requests use the official [fhirclient](https://github.com/smart-on-fhir/client-js) library, loaded from a CDN.

## Why this project?

Building a healthcare app used to mean a custom integration with every hospital system. **SMART on FHIR** replaces that with open standards:

- **FHIR** defines a common format and REST API for clinical data: patients, observations, conditions, medications and so on.
- **SMART App Launch** defines how an app is started from inside an EHR (electronic health record) and how it gets permission to read data, using OAuth2.

An app written to these standards can run in any EHR that supports them, without changes. Major EHR vendors support SMART on FHIR, and in the US it is part of the certification requirements for EHR APIs.

### A starting point for beginners

You don't need your own EHR, FHIR server or login system to start. The free [SMART Health IT launcher](https://launch.smarthealthit.org) provides all three:

- a simulated EHR that launches your app the same way a real one would
- a login and patient picker
- a FHIR R4 server with synthetic (not real) patients that have realistic histories

So you can write a small web page, point the launcher at it, and see real-looking clinical data within minutes. The whole app is about 300 lines of JavaScript that you can read in one sitting.

### What you can learn from it

- How the SMART launch flow works: `launch.html`, the authorization redirect and the token exchange
- How scopes such as `patient/Observation.rs` limit what an app can read
- How to write FHIR search queries and handle the results, including paging, sorting and references
- How clinical data is coded, for example LOINC codes for vital signs and blood pressure stored as two components
- How to display clinical data safely in the browser

### Use it as a template

Copy the project and change `app.js` to build your own app. For example, you could show lab results, allergies, immunizations or a trend chart of vitals. Add the matching scope to `launch.html` for each new resource type you read.

## Requirements

- [Node.js](https://nodejs.org/) 18 or later (only used to run a local web server)
- A modern browser

## Getting started

```bash
npm install
npm start
```

The app is served at `http://localhost:8091` with caching disabled.

Opening that address directly shows a "No SMART session found" message. The app only works when it is launched by an EHR or a SMART launcher, as described below.

## Testing with the SMART Health IT launcher

1. Start the server with `npm start`.
2. Open https://launch.smarthealthit.org.
3. Set **Launch Type** to **Provider EHR Launch** and **FHIR Version** to **R4**.
4. Optionally pick a patient and a provider. Otherwise the launcher asks you to choose them during launch.
5. Set **App Launch URL** to `http://localhost:8091/launch.html`.
6. Click **Launch**, then complete the simulated login and patient selection.

The sandbox does not check the client ID, so the default `my_app` works.

## How the launch works

1. The EHR (here, the SMART launcher) opens `launch.html` with `iss` (the FHIR server URL) and `launch` (the launch context) in the query string.
2. `launch.html` calls `FHIR.oauth2.authorize()`, which redirects the browser to the EHR's authorization server.
3. After login, the authorization server redirects back to `index.html?code=...&state=...`.
4. `app.js` calls `FHIR.oauth2.ready()`, which exchanges the code for an access token. It then requests the following data from the FHIR server in parallel:
   - `Patient/{id}`
   - `Observation?patient={id}&category=vital-signs&_sort=-date`
   - `Condition?patient={id}&clinical-status=active`
   - `MedicationRequest?patient={id}&status=active`

The session is kept in the browser tab's `sessionStorage`. A new tab needs a new launch.

### Requested scopes

```
launch openid fhirUser patient/Patient.rs patient/Observation.rs patient/Condition.rs patient/MedicationRequest.rs
```

## Project structure

| File | Purpose |
| --- | --- |
| `launch.html` | SMART launch entry point. Starts the OAuth2 authorization. |
| `index.html` | Page layout: header, status message and the three cards. |
| `app.js` | Completes authorization, fetches FHIR data and renders it. |
| `styles.css` | Card-based responsive layout. |
| `package.json` | Dev dependency on `http-server` and the `npm start` script. |

## Implementation notes

- **Vitals** are matched by LOINC code: 85354-9 blood pressure (systolic 8480-6 and diastolic 8462-4 components), 8867-4 heart rate, 9279-1 respiratory rate, 8310-5 temperature, 29463-7 weight, 8302-2 height and 39156-5 BMI. Results are also sorted by date in the browser, in case the server ignores `_sort`. Only the newest reading of each type is shown.
- **Medications** support both `medicationCodeableConcept` and `medicationReference`. A reference is shown using its display text, a Medication contained in the request, or a separate fetch of the Medication, in that order.
- **Safety**: all FHIR data is rendered with `textContent`, never `innerHTML`.
- **Lists** are deduplicated, and empty sections show "None recorded".
- **Errors** appear in the status message on the page and in the browser console.
- Searches fetch only the first page of results (`pageLimit: 1`).

## Configuration

- **Port**: change `-p 8091` in the `start` script in `package.json`. Use the same port in the App Launch URL.
- **Client ID and scopes**: edit `launch.html`. A real EHR requires the client ID it issued when you registered the app.
