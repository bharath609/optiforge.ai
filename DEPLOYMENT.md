# Public deployment

The production setup uses Vercel for the Vite frontend and Render for the FastAPI backend.

For a no-card setup, use Vercel for the frontend and a Hugging Face Docker Space for the backend. The root `Dockerfile` starts FastAPI on Hugging Face's `$PORT` (normally 7860).

## 1. Push the project

Commit and push the application to GitHub. Do not commit `backend/.env` or any API keys.

## 2. Deploy the API on Render

1. Create a new Render Blueprint from this repository.
2. Render will read `render.yaml` and create `optiforge-api`.
3. Add these secret environment variables in Render:
   - `EXPLABS_API_KEY`
   - `SIMPLE_AI_API_KEY`
4. Deploy and confirm the health endpoint at `https://<render-api-host>/`.

## 3. Deploy the frontend on Vercel

1. Import the repository into Vercel.
2. Keep the repository root as the project root. `vercel.json` builds `frontend`.
3. Add this environment variable in Vercel for Production:
   - `VITE_API_URL=https://<render-api-host>`
4. Deploy and verify that the frontend can call the API.

### No-card backend: Hugging Face Space

1. Create a new Docker Space at https://huggingface.co/new-space.
2. Connect or upload the repository's root `Dockerfile`, `.dockerignore`, and `backend` folder to the Space.
3. Add these Space secrets under Settings > Variables and secrets:
   - `EXPLABS_API_KEY`
   - `SIMPLE_AI_API_KEY`
   - `FRONTEND_ORIGINS=https://optiforge.ai,https://www.optiforge.ai`
4. Wait for the Space to build, then confirm `https://<space-owner>-<space-name>.hf.space/` returns the backend health message.
5. Set Vercel's `VITE_API_URL` to that Hugging Face URL instead of a Render URL.

## 4. Connect `optiforge.ai`

In Vercel, add both `optiforge.ai` and `www.optiforge.ai` to the frontend project. Vercel will show the DNS records required at the domain registrar. Add those records, wait for DNS propagation, and make `optiforge.ai` the primary domain.

The Render API can remain on its `onrender.com` hostname. The browser only needs the Vercel domain, and the API CORS configuration in `render.yaml` allows both apex and `www` domains.

## 5. Production checks

- Open `https://optiforge.ai`.
- Submit a simple game or production prompt and verify a result.
- Check the backend host logs for API errors.
- Confirm both provider keys are configured as hosting secrets and not in Git.
