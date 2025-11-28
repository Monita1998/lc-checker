Runner (Cloud Run) README
=========================

Quick start (local)

1. Install dependencies

   cd functions/runner
   npm ci

2. Run locally

   PORT=8080 npm start

3. POST a job

   curl -X POST http://localhost:8080/ -H "Content-Type: application/json" -d '{"bucket":"your-bucket","objectPath":"uploads/your.zip","uploadId":"test-1"}'

Deployment

Build and push the Docker image, then deploy to Cloud Run with a service account that has permissions to access Storage and Firestore. Set `SNYK_TOKEN` in Cloud Run if you want snyk scans.
