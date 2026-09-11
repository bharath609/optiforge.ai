# Public deployment

The production setup uses Vercel for the Vite frontend and Render for the FastAPI backend.

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

## 4. Connect `optiforge.ai`

In Vercel, add both `optiforge.ai` and `www.optiforge.ai` to the frontend project. Vercel will show the DNS records required at the domain registrar. Add those records, wait for DNS propagation, and make `optiforge.ai` the primary domain.

The Render API can remain on its `onrender.com` hostname. The browser only needs the Vercel domain, and the API CORS configuration in `render.yaml` allows both apex and `www` domains.

## 5. Production checks

- Open `https://optiforge.ai`.
- Submit a simple game or production prompt and verify a result.
- Check the Render logs for API errors.
- Confirm both provider keys are configured in Render and not in Git.
